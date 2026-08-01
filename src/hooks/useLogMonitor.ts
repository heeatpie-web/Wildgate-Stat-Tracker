import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { HERO_GUIDS, SHIP_GUIDS, WEAPON_GUIDS, EQUIPMENT_GUIDS, PERK_GUIDS } from '../utils/guids';
import { SHIPS, CHARACTERS, UNNAMED_PLAYER_PREFIX, normalizeShipName } from '../types';
import type { Match, Loadout, TelemetryConsistency, TelemetryMatchMode } from '../types';
import { EQUIPMENT_DB } from '../utils/equipmentDb';
import { getPerkCatalog, getPerkNameAliasPairs, getProspectorEquipmentCatalog, getProspectorWeaponCatalog, MAX_PERKS_PER_MATCH } from '../components/patch/patchEntityCatalog';
import { processTelemetryEvent } from '../utils/telemetryProcessor';
import { isNonMatchMap, isPregameLobbyMap } from '../utils/nonMatchMaps';
import Logger from '../utils/logger';
import { getElectronAPI } from '../utils/electronAPI';
import { runtimeConfig } from '../config/runtimeConfig';
import { buildActiveWeaponsFromLoadout, buildLoadoutSignature, cloneLoadout, isBogusTertiaryLoadoutEntry, sanitizeLoadout } from '../utils/loadout';
import { normalizeTeammatePlayerId } from '../utils/teammateIdentity';
import type { TelemetryLifecycleStage } from '../store/slices/createUISlice';
import {
    DEFAULT_DURATION_TOLERANCE_SECONDS,
    getExpectedTeammateCountFromMode,
    inferModeFromMatchPool,
} from '../utils/telemetryConsistency';

const ipcRenderer = getElectronAPI();
const MAX_TELEMETRY_MATCH_DURATION_SECONDS = 60 * 60;
const MAX_TELEMETRY_PROSPECTOR_SLOTS = 2;
const ADAPTIVE_MATCH_TELEMETRY_PROFILE = 'low-power';
const ADAPTIVE_LOW_TELEMETRY_PROFILE = 'adaptive-low';
const ADAPTIVE_LOW_PROFILE_DELAY_MS = 60 * 1000;
const MIN_SESSION_END_GRACE_SECONDS = 10;
const MANUAL_TELEMETRY_DRAFT_REUSE_WINDOW_MS = 2 * 60 * 1000;
const IS_TELEMETRY_DEBUG = import.meta.env.DEV || process.env.NODE_ENV === 'test';

const isTrustedTelemetryDuration = (seconds: number) =>
    Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_TELEMETRY_MATCH_DURATION_SECONDS;

type TelemetryStatusPatch = {
    exists?: boolean;
    size?: number;
    lastCheck?: number;
    error?: string;
    path?: string;
    lastEventAt?: number;
};

type TelemetryRecord = Record<string, unknown>;

interface TelemetryEventEnvelope extends TelemetryRecord {
    EventName?: string;
    Payload?: unknown;
    payload?: unknown;
    event?: unknown;
    context?: unknown;
    ClientTimestamp?: number;
}

const isRecord = (value: unknown): value is TelemetryRecord =>
    typeof value === 'object' && value !== null;

const asRecord = (value: unknown): TelemetryRecord =>
    isRecord(value) ? value : {};

const toTelemetryEvents = (value: unknown): TelemetryEventEnvelope[] => {
    if (isRecord(value) && Array.isArray(value.telemetry)) {
        return value.telemetry.filter(isRecord) as TelemetryEventEnvelope[];
    }
    if (Array.isArray(value)) {
        return value.filter(isRecord) as TelemetryEventEnvelope[];
    }
    if (isRecord(value) && 'EventName' in value) {
        return [value as TelemetryEventEnvelope];
    }
    return [];
};

const extractEventPayload = (event: TelemetryEventEnvelope): TelemetryRecord => {
    const payloadCandidates: unknown[] = [];
    if (isRecord(event.Payload)) {
        payloadCandidates.push(event.Payload.event, event.Payload.Event, event.Payload);
    }
    if (isRecord(event.payload)) {
        payloadCandidates.push(event.payload.event, event.payload);
    }
    payloadCandidates.push(event.event);
    for (const candidate of payloadCandidates) {
        if (isRecord(candidate)) return candidate;
    }
    return {};
};

const toStringOrEmpty = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
};

const getPreferredTelemetryStringCandidate = (candidates: unknown[]): {
    hasSignal: boolean;
    value: string;
} => {
    const definedCandidates = candidates.filter((value) => value !== undefined);
    if (definedCandidates.length === 0) {
        return {
            hasSignal: false,
            value: '',
        };
    }
    const preferredCandidate = definedCandidates.find((value) => toStringOrEmpty(value).trim().length > 0);
    return {
        hasSignal: true,
        value: toStringOrEmpty(preferredCandidate !== undefined ? preferredCandidate : definedCandidates[0]).trim(),
    };
};

const toTelemetryTimestampMs = (event: TelemetryEventEnvelope): number | null => {
    const raw = event.ClientTimestamp ?? (event as TelemetryRecord).timestamp ?? (event as TelemetryRecord).ts;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric < 100000000000 ? numeric * 1000 : numeric;
};

const getRecordValueCaseInsensitive = (
    record: unknown,
    keys: string[],
): unknown => {
    if (!isRecord(record) || !Array.isArray(keys) || keys.length === 0) return undefined;
    for (const key of keys) {
        if (record[key] !== undefined) return record[key];
    }
    const expected = new Set(keys.map((key) => key.toLowerCase()));
    for (const [key, value] of Object.entries(record)) {
        if (expected.has(key.toLowerCase())) return value;
    }
    return undefined;
};

const findNestedRecordValueCaseInsensitive = (
    value: unknown,
    keys: string[],
    maxDepth = 4,
): unknown => {
    if (value == null || !Array.isArray(keys) || keys.length === 0) return undefined;

    let bestValue: unknown = undefined;
    let bestDepth = Number.MAX_SAFE_INTEGER;

    const visit = (candidate: unknown, depth: number) => {
        if (candidate == null || depth > maxDepth) return;
        if (Array.isArray(candidate)) {
            candidate.forEach((entry) => visit(entry, depth + 1));
            return;
        }
        if (!isRecord(candidate)) return;

        const direct = getRecordValueCaseInsensitive(candidate, keys);
        if (direct !== undefined && depth < bestDepth) {
            bestValue = direct;
            bestDepth = depth;
        }

        Object.values(candidate).forEach((entry) => visit(entry, depth + 1));
    };

    visit(value, 0);
    return bestValue;
};

const pickTelemetryValueCaseInsensitive = (
    sources: unknown[],
    keys: string[],
    maxDepth = 4,
): unknown => {
    for (const source of sources) {
        const direct = getRecordValueCaseInsensitive(source, keys);
        if (direct !== undefined) return direct;
    }
    for (const source of sources) {
        const nested = findNestedRecordValueCaseInsensitive(source, keys, maxDepth);
        if (nested !== undefined) return nested;
    }
    return undefined;
};

const extractTelemetryStringList = (value: unknown, depth = 0): string[] => {
    if (value == null || depth > 3) return [];
    if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value).trim();
        return text ? [text] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry) => extractTelemetryStringList(entry, depth + 1));
    }
    if (!isRecord(value)) return [];
    return Object.values(value).flatMap((entry) => extractTelemetryStringList(entry, depth + 1));
};

const TELEMETRY_HERO_SIGNAL_KEYS = new Set([
    'guidhero', 'heroguid', 'guid_hero',
    'heroid', 'hero_id',
    'hero', 'heroname', 'hero_name',
    'character', 'charactername', 'character_name',
    'prospector', 'prospectorname', 'prospector_name',
    'selectedhero', 'selected_hero',
    'selectedcharacter', 'selected_character',
    'selectedprospector', 'selected_prospector',
]);
// Ship telemetry uses class/asset IDs. guidShipName is a separate display-name asset
// and should not drive ship-class assignment.
const TELEMETRY_SHIP_SIGNAL_KEYS = new Set([
    'guidship', 'shipguid', 'guid_ship',
    'selectedshipguid', 'selected_ship_guid',
    'shiptypeguid', 'ship_type_guid',
    'shipid', 'ship_id',
    'selectedshipid', 'selected_ship_id',
    'shiptypeid', 'ship_type_id',
]);
const TELEMETRY_LOADOUT_SIGNAL_KEYS = new Set([
    ...TELEMETRY_HERO_SIGNAL_KEYS,
    ...TELEMETRY_SHIP_SIGNAL_KEYS,
    'guidweaponprimary', 'guidweaponsecondary', 'weaponprimary', 'weaponnameprimary',
    'guidequipmentprimary', 'guidequipmentsecondary', 'equipmentprimary', 'equipmentnameprimary',
    'guidperkprimary', 'guidperksecondary', 'perkprimary', 'perknameprimary',
    'guidtraitprimary', 'guidtraitsecondary', 'traitprimary', 'traitnameprimary',
    'weapons', 'equipment', 'characterweapons', 'charweapons', 'charactergear', 'characterequipment',
    'perks', 'characterperks', 'charperks', 'traits',
    'weaponguids', 'equipmentguids',
    'perkguids', 'traitguids',
    'weaponids', 'equipmentids',
    'perkids', 'traitids',
    'weaponslots', 'equipmentslots',
    'perkslots', 'traitslots',
    'loadoutweapons', 'loadoutequipment', 'loadoutcharacterweapons', 'loadoutcharacterequipment',
    'loadoutperks', 'loadoutcharacterperks', 'loadouttraits',
]);
const TELEMETRY_LOADOUT_RECORD_KEY_PATTERN = /(loadout|shipselection|gamemodeshipselection|characterloadout)/i;
const TELEMETRY_SHARED_SHIP_SELECTION_PATTERN = /(shipselection|gamemodeshipselection)/i;
const MATCHMAKER_LOADING_STATE_PATTERN = /(inprogress|loading|travel|starting|active|playing|ingame|in_game|matchstarted|(?:mm_)?game_found|(?:mm_)?server_found)/i;
const PRACTICE_RANGE_MATCHMAKER_BOOTSTRAP_STATE_PATTERN = /(looking|search|pending|queue|queued|waiting|matchmaking|travel|starting|active|playing|ingame|in_game|matchstarted|(?:mm_)?game_found|(?:mm_)?server_found)/i;
const PRACTICE_RANGE_MATCHMAKER_TERMINAL_STATE_PATTERN = /(cancel|canceled|cancelled|not_matchmaking|idle|failed|error|closed|ended|completed|setup)/i;
const PRACTICE_RANGE_STARTUP_RECOVERY_MAX_AGE_SECONDS = 15 * 60;
const MAX_PREGAME_LOADING_EVENT_AGE_SECONDS = 30;
const TELEMETRY_MAP_NAME_KEYS = ['loadedMap', 'loadingMap'];
const TELEMETRY_MATCHMAKER_STATE_KEYS = [
    'newStatus', 'new_status',
    'newState', 'new_state',
    'newMatchState', 'new_match_state',
    'state', 'matchState', 'match_state', 'status',
];
const TELEMETRY_RECORD_KEY_KEYS = ['recordKey', 'record_key', 'key'];
const TELEMETRY_LOADOUT_CONTAINER_KEYS = [
    'loadout', 'Loadout', 'loadOut', 'LoadOut',
    'characterLoadout', 'character_loadout',
    'playerLoadout', 'player_loadout',
    'currentLoadout', 'current_loadout',
    'selection', 'Selection',
    'selectedLoadout', 'selected_loadout',
    'currentSelection', 'current_selection',
    'snapshot', 'Snapshot',
    'stateSnapshot', 'state_snapshot',
    'loadoutData',
];

const toClock = (totalSeconds: number) => {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const mm = Math.floor(safe / 60).toString().padStart(2, '0');
    const ss = (safe % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
};

const getTelemetryDurationSummary = (
    startedAt: number,
    gameTime: number,
    overrideSeconds?: number | null,
) => {
    const override = Number(overrideSeconds);
    const hasOverride = overrideSeconds != null && Number.isFinite(override) && override >= 0;
    const totalSeconds = hasOverride
        ? Math.max(0, Math.floor(override))
        : Math.max(0, Math.floor((gameTime - startedAt) / 1000));
    const hasTrustedDuration = isTrustedTelemetryDuration(totalSeconds);
    return {
        totalSeconds,
        hasTrustedDuration,
        duration: hasTrustedDuration ? toClock(totalSeconds) : '00:00',
        rawDuration: toClock(totalSeconds),
    };
};

const extractTelemetryDurationOverrideSeconds = (
    payloadSources: unknown[],
    startedAt: number | null,
    gameTime: number,
): number | null => {
    const explicitDurationValue = Number(
        pickTelemetryValueCaseInsensitive(payloadSources, ['matchDuration', 'match_duration'])
    );
    if (Number.isFinite(explicitDurationValue) && explicitDurationValue >= 0) {
        return Math.floor(explicitDurationValue);
    }

    const genericDurationValue = Number(
        pickTelemetryValueCaseInsensitive(payloadSources, ['durationSeconds'])
    );
    if (!Number.isFinite(genericDurationValue) || genericDurationValue < 0) {
        return null;
    }

    const normalizedDuration = Math.floor(genericDurationValue);
    const hasStartedAt = typeof startedAt === 'number' && Number.isFinite(startedAt) && startedAt > 0;
    if (hasStartedAt) {
        const elapsedSeconds = Math.max(0, Math.floor((gameTime - startedAt) / 1000));
        const looksLikeLoadingScreenDuration = isTrustedTelemetryDuration(elapsedSeconds)
            && elapsedSeconds >= 60
            && normalizedDuration <= 15
            && (normalizedDuration + 45) < elapsedSeconds;
        if (looksLikeLoadingScreenDuration) {
            Logger.warn(
                'LogMonitor',
                `Ignored suspicious durationSeconds override (${normalizedDuration}s vs elapsed ${elapsedSeconds}s).`,
            );
            return null;
        }
    }

    return normalizedDuration;
};

const isLoadingMatchmakerState = (value: unknown): boolean =>
    typeof value === 'string' && MATCHMAKER_LOADING_STATE_PATTERN.test(value.trim());

const isPracticeRangeBootstrapMatchmakerState = (value: unknown): boolean => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    if (PRACTICE_RANGE_MATCHMAKER_TERMINAL_STATE_PATTERN.test(normalized)) return false;
    return PRACTICE_RANGE_MATCHMAKER_BOOTSTRAP_STATE_PATTERN.test(normalized);
};

const isPracticeRangeMap = (mapName: unknown): boolean => {
    const normalized = String(mapName || '').trim().toLowerCase();
    if (!normalized) return false;
    return /(practice|training|range)/.test(normalized);
};

const isPracticeRangeMatchPool = (poolValue: unknown): boolean => {
    const normalized = String(poolValue || '').trim().toLowerCase();
    if (!normalized) return false;
    return /(firingrange|practice|training|range)/.test(normalized);
};

const isPregameLoadingMatchState = (value: unknown): boolean => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    return normalized.includes('pregamelobby') || normalized.includes('waitingforplayers');
};

const isLiveLoadingMatchState = (value: unknown): boolean => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    return normalized === 'ingame' || normalized.endsWith('.ingame') || normalized.includes('ingame');
};

const normalizeTelemetryMatchModeValue = (value: unknown): TelemetryMatchMode | null => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (/(firingrange|practice|training|range)/.test(normalized)) return 'practice range';
    if (normalized.includes('custom')) return 'custom';
    if (normalized.includes('artifactsandgates')) return 'artifactsandgates';
    return null;
};

const TELEMETRY_MATCH_MODE_RANK: Record<TelemetryMatchMode, number> = {
    custom: 0,
    artifactsandgates: 1,
    customlobby: 1,
    'practice range': 2,
};

const TELEMETRY_LIFECYCLE_STAGE_RANK: Record<TelemetryLifecycleStage, number> = {
    idle: 0,
    loading: 1,
    pregame: 2,
    live: 3,
    menu: 4,
};

type TelemetryDraftReadyTrigger = 'frontend' | 'session-end' | 'unknown';

const classifyTelemetryLifecycleStageFromMap = (
    mapName: unknown,
    matchState?: unknown,
): Exclude<TelemetryLifecycleStage, 'idle'> | null => {
    const normalized = String(mapName || '').trim();
    if (!normalized) return null;
    const lower = normalized.toLowerCase();
    if (isPregameLoadingMatchState(matchState)) return 'pregame';
    if (isLiveLoadingMatchState(matchState)) return 'live';
    if (lower.includes('frontend')) return 'menu';
    if (isPracticeRangeMap(normalized)) return 'live';
    if (lower.includes('gameentrypoint')) return 'loading';
    if (isPregameLobbyMap(normalized)) return 'pregame';
    if (!isNonMatchMap(normalized)) return 'live';
    return null;
};

const inferTelemetryMatchMode = ({
    practiceRangeSignal,
    matchPoolValue,
    payloadSources,
}: {
    practiceRangeSignal: boolean;
    matchPoolValue: unknown;
    payloadSources: unknown[];
}): TelemetryMatchMode => {
    if (practiceRangeSignal) {
        return 'practice range';
    }

    const prioritizedCandidates = [
        matchPoolValue,
        pickTelemetryValueCaseInsensitive(payloadSources, ['matchMode', 'match_mode']),
        pickTelemetryValueCaseInsensitive(payloadSources, ['matchType', 'match_type']),
        pickTelemetryValueCaseInsensitive(payloadSources, ['queueType', 'queue_type']),
        pickTelemetryValueCaseInsensitive(payloadSources, ['lobbyType', 'lobby_type']),
        pickTelemetryValueCaseInsensitive(payloadSources, ['gameMode', 'game_mode']),
        pickTelemetryValueCaseInsensitive(payloadSources, ['phase']),
        pickTelemetryValueCaseInsensitive(payloadSources, ['state']),
    ];

    for (const candidate of prioritizedCandidates) {
        const normalized = normalizeTelemetryMatchModeValue(candidate);
        if (normalized) {
            return normalized;
        }
        const raw = String(candidate || '').trim().toLowerCase();
        if (!raw) continue;
        if (raw.includes('custom')) return 'custom';
        if (raw.includes('artifactsandgates')) return 'artifactsandgates';
    }

    return 'custom';
};

const shouldAdvanceTelemetryLifecycleStage = (
    currentStage: TelemetryLifecycleStage,
    nextStage: Exclude<TelemetryLifecycleStage, 'idle'>,
): boolean => {
    if (currentStage === nextStage) return false;
    if (currentStage === 'idle' || currentStage === 'menu') return true;
    if (nextStage === 'menu') return true;
    return TELEMETRY_LIFECYCLE_STAGE_RANK[nextStage] > TELEMETRY_LIFECYCLE_STAGE_RANK[currentStage];
};

const isWeakTelemetrySelectionLabel = (value: unknown): boolean => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return true;
    if (normalized.startsWith('unknown')) return true;
    return /(leaderslot|empty|placeholder|default|unset|\bslot\b)/.test(normalized);
};

const hasTelemetrySelection = (value: unknown): value is string => {
    const text = String(value || '').trim();
    return !!text && !text.startsWith('Unknown');
};

const findNestedTelemetryRecord = (
    value: unknown,
    signalKeys: Set<string>,
    maxDepth = 4
): TelemetryRecord | null => {
    let bestRecord: TelemetryRecord | null = null;
    let bestScore = 0;
    let bestDepth = Number.MAX_SAFE_INTEGER;

    const visit = (candidate: unknown, depth: number) => {
        if (candidate == null || depth > maxDepth) return;
        if (Array.isArray(candidate)) {
            candidate.forEach((entry) => visit(entry, depth + 1));
            return;
        }
        if (!isRecord(candidate)) return;

        const entries = Object.entries(candidate);
        let score = 0;
        entries.forEach(([key, nested]) => {
            const lower = key.toLowerCase();
            if (signalKeys.has(lower)) score += 4;
            else if (/(loadout|selection|record|value|data|ship)/.test(lower) && (isRecord(nested) || Array.isArray(nested))) score += 1;
        });
        if (score > 0 && (score > bestScore || (score === bestScore && depth < bestDepth))) {
            bestRecord = candidate;
            bestScore = score;
            bestDepth = depth;
        }

        entries.forEach(([, nested]) => visit(nested, depth + 1));
    };

    visit(value, 0);
    return bestRecord;
};

const buildNebLoadoutPayloadSignature = (value: unknown): string => {
    if (!isRecord(value)) return '';
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
};

const normalizeEntityLabel = (value: unknown): string => String(value || '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+\s*player\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildCanonicalEntityNameMap = (values: string[]): Map<string, string> => {
    const map = new Map<string, string>();
    values.forEach((value) => {
        const cleaned = String(value || '').trim();
        const key = normalizeEntityLabel(cleaned);
        if (!cleaned || !key || map.has(key)) return;
        map.set(key, cleaned);
    });
    return map;
};

const RAW_CHARACTER_WEAPON_NAMES = EQUIPMENT_DB
    .filter((item) => item.type === 'CharacterWeapon')
    .map((item) => item.name)
    .filter(Boolean);
const CHARACTER_WEAPON_NAMES = getProspectorWeaponCatalog(RAW_CHARACTER_WEAPON_NAMES).filter(Boolean);
const RAW_CHARACTER_EQUIPMENT_NAMES = EQUIPMENT_DB
    .filter((item) => item.type === 'CharacterEquipment')
    .map((item) => item.name)
    .filter(Boolean);
const CHARACTER_EQUIPMENT_NAMES = getProspectorEquipmentCatalog(RAW_CHARACTER_EQUIPMENT_NAMES).filter(Boolean);
const CHARACTER_PERK_NAMES = getPerkCatalog().filter(Boolean);
// Perk renames: accept the old spelling as input but record the current name,
// so a newly played match is stored as "Protected Pilot" even if the source
// still says "Pilot". Already-saved matches are never re-resolved.
const PERK_ALIAS_NAME_MAP = (() => {
    const map = new Map<string, string>();
    getPerkNameAliasPairs().forEach(({ alias, current }) => {
        const key = normalizeEntityLabel(alias);
        const cleaned = String(current || '').trim();
        if (!key || !cleaned || map.has(key)) return;
        map.set(key, cleaned);
    });
    return map;
})();
const PROSPECTOR_WEAPON_NAME_MAP = buildCanonicalEntityNameMap(CHARACTER_WEAPON_NAMES);
const PROSPECTOR_WEAPON_SET = new Set(Array.from(PROSPECTOR_WEAPON_NAME_MAP.keys()));
const PROSPECTOR_EQUIPMENT_NAME_MAP = buildCanonicalEntityNameMap(CHARACTER_EQUIPMENT_NAMES);
const PROSPECTOR_EQUIPMENT_SET = new Set(Array.from(PROSPECTOR_EQUIPMENT_NAME_MAP.keys()));
const PROSPECTOR_LOADOUT_NAME_SET = new Set([
    ...CHARACTER_WEAPON_NAMES,
    ...CHARACTER_EQUIPMENT_NAMES,
].map((value) => normalizeEntityLabel(value)).filter(Boolean));
const PROSPECTOR_PERK_NAME_MAP = buildCanonicalEntityNameMap(CHARACTER_PERK_NAMES);
const PROSPECTOR_PERK_SET = new Set(Array.from(PROSPECTOR_PERK_NAME_MAP.keys()));
const toCanonicalProspectorWeaponName = (value: unknown): string => {
    const key = normalizeEntityLabel(value);
    if (!key || !PROSPECTOR_WEAPON_SET.has(key)) return '';
    return PROSPECTOR_WEAPON_NAME_MAP.get(key) || '';
};
const toCanonicalProspectorEquipmentName = (value: unknown): string => {
    const key = normalizeEntityLabel(value);
    if (!key || !PROSPECTOR_EQUIPMENT_SET.has(key)) return '';
    return PROSPECTOR_EQUIPMENT_NAME_MAP.get(key) || '';
};
const toCanonicalProspectorPerkName = (value: unknown): string => {
    const key = normalizeEntityLabel(value);
    if (!key) return '';
    const aliased = PERK_ALIAS_NAME_MAP.get(key);
    if (aliased) return aliased;
    if (!PROSPECTOR_PERK_SET.has(key)) return '';
    return PROSPECTOR_PERK_NAME_MAP.get(key) || '';
};

const traceTelemetryLoadout = (stage: string, detail: Record<string, unknown>) => {
    if (!IS_TELEMETRY_DEBUG) return;
    Logger.debug('LogMonitor', stage, detail);
};

export const __test__ = {
    classifyTelemetryLifecycleStageFromMap,
    inferTelemetryMatchMode,
    isPracticeRangeMap,
    isPracticeRangeMatchPool,
    isPregameLobbyMap,
    normalizeTelemetryMatchModeValue,
};

/**
 * useLogMonitor - Monitors external game log files for telemetry events.
 * Updates the global telemetryStatus to feed into the SystemPulse consolidated indicator.
 */
export const useLogMonitor = (activeUser?: string) => {
    const isStoreLoading = useAppStore(s => s.isLoading);
    const telemetryPerformanceProfile = useAppStore(s => s.telemetryPerformanceProfile);
    const adaptiveTelemetryPollingEnabled = useAppStore(s => s.adaptiveTelemetryPollingEnabled);
    const lifecycleTrackingPaused = useAppStore(s => s.lifecycleTrackingPaused);
    const setDeviceDisplayInfo = useAppStore(s => s.setDeviceDisplayInfo);
    const setGameResolution = useAppStore(s => s.setGameResolution);
    const confirmTeammateIdentity = useAppStore(s => s.confirmTeammateIdentity);
    const {
        addMatch, updateMatch,
        playerIdMap, updatePlayerIdMapping,
        pilotRegistry, addToRegistry,
        activeHero, setActiveHero,
        activeShip, shipSource, setActiveShip,
        activeWeapons, setActiveWeapons,
        matchStartTime, setMatchStartTime,
        isMatchInProgress, setIsMatchInProgress,
        setTimeMin, setTimeSec,
        setLastActivity,
        setSelectedTeammates,
        setCurrentLoadout,
        currentLoadout,
        sessionStartTime,
        clearTelemetryDetected,
    } = useGameData();

    const {
        activeMode, setActiveMode,
        setToast,
        setOverlayPhase,
        setTelemetryLifecycleStage,
        setTelemetryLifecycleIsPracticeRange,
        enableAutoLogRecording,
        devMode, setTelemetryStatus, telemetryStatus
    } = useUIState();

    const { playStart, playEnd } = useSoundEffects();
    const wasMatchInProgressRef = useRef(false);

    const [logFeed, setLogFeed] = useState<TelemetryEventEnvelope[]>([]);

    const prevKillCount = useRef(0);
    const currentSquadIds = useRef<string[]>([]);
    const localTelemetryPlayerIdsRef = useRef<string[]>([]);
    const sessionStartTimeRef = useRef(sessionStartTime);
    const lastActivityRef = useRef(0);
    const playerIdMapRef = useRef(playerIdMap);
    const pilotRegistryRef = useRef(pilotRegistry);
    const matchStartTimeRef = useRef(matchStartTime);
    const isMatchInProgressRef = useRef(isMatchInProgress);
    const currentLoadoutRef = useRef(currentLoadout);
    const activeHeroRef = useRef(activeHero);
    const activeShipRef = useRef(activeShip);
    const activeUserRef = useRef(activeUser);
    const activeModeRef = useRef(activeMode);
    const devModeRef = useRef(devMode);
    const lifecycleTrackingPausedRef = useRef(lifecycleTrackingPaused);
    const lastMatchSessionIdRef = useRef<string>('');
    const telemetryDraftMatchIdRef = useRef<number | null>(null);
    const telemetryDraftMatchModeRef = useRef<TelemetryMatchMode>('custom');
    const telemetryDraftStartedAtRef = useRef<number | null>(null);
    const telemetryDraftLoadoutSignatureRef = useRef<string>('');
    const telemetryLifecycleActiveRef = useRef(isMatchInProgress);
    const telemetryLifecycleStageRef = useRef<TelemetryLifecycleStage>(isMatchInProgress ? 'live' : 'idle');
    const telemetryLifecycleIsPracticeRangeRef = useRef(false);
    const telemetryLifecycleIsBackfillRef = useRef(false);
    const telemetryPracticeRangeSessionIdsRef = useRef<Set<string>>(new Set());
    const telemetryLifecycleStartedAtRef = useRef<number | null>(matchStartTime);
    const telemetryLiveStartedAtRef = useRef<number | null>(matchStartTime);
    const latestNebLoadoutSavedTimestampRef = useRef<number>(0);
    const latestNebLoadoutSavedSignatureRef = useRef<string>('');
    const localTelemetryShipSelectionRef = useRef<string>('');
    // Game-log timestamp (ms) of the event that produced the current
    // localTelemetryShipSelectionRef value / the last applied ship-selection telemetry.
    // Used to reject out-of-order (stale) ship-selection events so a delayed/late-processed
    // older event cannot clobber an already-applied newer selection, regardless of whether
    // either event came from the local-loadout path or the shared-selection path.
    const localTelemetryShipSelectionAtRef = useRef<number>(0);
    const pendingTelemetryConsistencyRef = useRef<Partial<TelemetryConsistency>>({
        durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
    });
    const previousAdaptiveMatchStateRef = useRef(isMatchInProgress);
    const [runtimeTelemetryProfile, setRuntimeTelemetryProfile] = useState<string>(
        adaptiveTelemetryPollingEnabled ? 'high-accuracy' : telemetryPerformanceProfile
    );
    const [monitorListenersReady, setMonitorListenersReady] = useState(false);
    const [startupLifecycleEstablished, setStartupLifecycleEstablished] = useState(Boolean(isMatchInProgress));

    const resetSelectionDefaultsForNewMatch = useCallback(() => {
        const state = useAppStore.getState();
        state.resetSelectionSourcesForNewMatch?.();
        state.resetMatchTrackingForNewMatch?.();
        state.resetMatchMetricsForNewMatch?.();
        clearTelemetryDetected();
        const loadout = currentLoadoutRef.current;
        if (hasTelemetrySelection(loadout?.hero)) {
            setActiveHero(loadout.hero, 'manual');
        }
        if (hasTelemetrySelection(loadout?.ship)) {
            setActiveShip(loadout.ship, 'manual');
        }
        if (loadout) {
            setActiveWeapons(buildActiveWeaponsFromLoadout(loadout), false);
        }
    }, [clearTelemetryDetected, setActiveHero, setActiveShip, setActiveWeapons]);

    const applyTelemetryTimerValue = useCallback((duration: string) => {
        const [mm = '00', ss = '00'] = String(duration || '00:00').split(':');
        setTimeMin(mm.padStart(2, '0'), 'telemetry');
        setTimeSec(ss.padStart(2, '0'), 'telemetry');
    }, [setTimeMin, setTimeSec]);

    const rememberLocalTelemetryPlayerId = useCallback((playerId: string) => {
        const normalizedId = normalizeTeammatePlayerId(playerId);
        if (!normalizedId) return;
        if (localTelemetryPlayerIdsRef.current.includes(normalizedId)) return;
        localTelemetryPlayerIdsRef.current = [...localTelemetryPlayerIdsRef.current, normalizedId];
    }, []);

    const isLocalTelemetryPlayerId = useCallback((playerId: string): boolean => {
        const normalizedId = normalizeTeammatePlayerId(playerId);
        if (!normalizedId) return false;
        if (localTelemetryPlayerIdsRef.current.includes(normalizedId)) return true;
        const activeUserKey = String(activeUserRef.current || '').trim().toLowerCase();
        if (!activeUserKey) return false;
        return Object.entries(playerIdMapRef.current || {}).some(([mappedId, mappedName]) => (
            normalizeTeammatePlayerId(mappedId) === normalizedId
            && String(mappedName || '').trim().toLowerCase() === activeUserKey
        ));
    }, []);

    const getFriendlyTelemetryPlayerIds = useCallback((playerIds: string[]): string[] => {
        const seen = new Set<string>();
        const next: string[] = [];
        (playerIds || []).forEach((playerId) => {
            const normalizedId = normalizeTeammatePlayerId(playerId);
            if (!normalizedId || seen.has(normalizedId) || isLocalTelemetryPlayerId(normalizedId)) return;
            seen.add(normalizedId);
            next.push(normalizedId);
        });
        return next;
    }, [isLocalTelemetryPlayerId]);

    const syncFriendlyPlayerIdsToDraft = useCallback((gameTime: number) => {
        const draftId = telemetryDraftMatchIdRef.current;
        if (!draftId) return;
        const match = useAppStore.getState().matches.find((m: Match) => m.id === draftId);
        if (!match) return;
        const friendlyPlayerIds = getFriendlyTelemetryPlayerIds(currentSquadIds.current);
        const currentFriendlyIds = Array.isArray(match.friendlyPlayerIds) ? match.friendlyPlayerIds : [];
        const changed = friendlyPlayerIds.length !== currentFriendlyIds.length
            || friendlyPlayerIds.some((playerId, index) => playerId !== currentFriendlyIds[index]);
        if (!changed) return;
        updateMatch({
            ...match,
            timestamp: match.timestamp || gameTime,
            friendlyPlayerIds,
        });
    }, [getFriendlyTelemetryPlayerIds, updateMatch]);

    const buildTelemetryDraft = useCallback((matchId: number, gameTime: number, loadout: Loadout | null): Match => ({
        id: matchId,
        timestamp: gameTime,
        date: new Date(gameTime).toLocaleDateString(),
        mode: activeModeRef.current,
        matchMode: telemetryDraftMatchModeRef.current,
        player: activeUserRef.current || 'Unknown Player',
        teammates: [],
        opponents: [],
        hero: (loadout?.hero && !String(loadout.hero).startsWith('Unknown')) ? String(loadout.hero) : (activeHeroRef.current || 'Unknown'),
        ship: (loadout?.ship && !String(loadout.ship).startsWith('Unknown')) ? String(loadout.ship) : (activeShipRef.current || 'Unknown'),
        loadout: cloneLoadout(loadout) || {
            hero: loadout?.hero || null,
            ship: loadout?.ship || null,
            perks: [],
            shipPerks: [],
            characterPerks: [],
            shipWeapons: [],
            weapons: [],
            equipment: [],
            characterWeapons: [],
            characterEquipment: [],
        },
        weapons: {},
        reachModifiers: [],
        kills: { 'AI Legion': 0 },
        result: 'Ongoing',
        subType: 'Telemetry Draft',
        time: '00:00',
        damageTaken: 0,
        notes: '',
        timelineEvents: [],
        artifacts: [],
        ocrState: 'queued',
        telemetryDraftState: 'active',
        isPracticeRange: telemetryLifecycleIsPracticeRangeRef.current === true,
        isBackfill: telemetryLifecycleIsBackfillRef.current === true || undefined,
        friendlyPlayerIds: getFriendlyTelemetryPlayerIds(currentSquadIds.current),
        telemetryConsistency: {
            durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
            ...(pendingTelemetryConsistencyRef.current || {}),
        },
    }), [getFriendlyTelemetryPlayerIds]);

    const updateTelemetryDraftMatchMode = useCallback((matchMode: TelemetryMatchMode, gameTime: number) => {
        if (!matchMode) return;
        if (TELEMETRY_MATCH_MODE_RANK[matchMode] <= TELEMETRY_MATCH_MODE_RANK[telemetryDraftMatchModeRef.current]) {
            return;
        }
        telemetryDraftMatchModeRef.current = matchMode;
        const draftId = telemetryDraftMatchIdRef.current;
        if (!draftId) return;
        const match = useAppStore.getState().matches.find((m: Match) => m.id === draftId);
        if (!match || match.matchMode === matchMode) return;
        updateMatch({
            ...match,
            timestamp: match.timestamp || gameTime,
            matchMode,
        });
    }, [updateMatch]);

    const updatePendingTelemetryConsistency = useCallback((patch: Partial<TelemetryConsistency>) => {
        pendingTelemetryConsistencyRef.current = {
            ...(pendingTelemetryConsistencyRef.current || {}),
            ...patch,
            durationToleranceSeconds:
                patch.durationToleranceSeconds
                ?? pendingTelemetryConsistencyRef.current.durationToleranceSeconds
                ?? DEFAULT_DURATION_TOLERANCE_SECONDS,
        };
    }, []);

    const updateTelemetryDraftConsistency = useCallback((patch: Partial<TelemetryConsistency>, gameTime: number) => {
        if (!patch || Object.keys(patch).length === 0) return;
        updatePendingTelemetryConsistency(patch);
        const draftId = telemetryDraftMatchIdRef.current;
        if (!draftId) return;
        const match = useAppStore.getState().matches.find((m: Match) => m.id === draftId);
        if (!match) return;
        const nextConsistency: TelemetryConsistency = {
            durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
            ...(match.telemetryConsistency || {}),
            ...patch,
        };
        updateMatch({
            ...match,
            timestamp: match.timestamp || gameTime,
            telemetryConsistency: nextConsistency,
        });
    }, [updateMatch, updatePendingTelemetryConsistency]);

    const createTelemetryDraftIfNeeded = useCallback((
        gameTime: number,
        loadout?: Loadout | null,
    ) => {
        const existingRefId = telemetryDraftMatchIdRef.current;
        if (existingRefId) {
            const stillExists = useAppStore.getState().matches.some((m: Match) => m.id === existingRefId && m.subType === 'Telemetry Draft');
            if (stillExists) return existingRefId;
            telemetryDraftMatchIdRef.current = null;
            telemetryDraftStartedAtRef.current = null;
            telemetryDraftLoadoutSignatureRef.current = '';
        }
        const activePlayer = String(activeUserRef.current || '').trim().toLowerCase();
        const recentCutoff = (typeof sessionStartTimeRef.current === 'number' && sessionStartTimeRef.current > 0)
            ? (sessionStartTimeRef.current - 60_000)
            : (Date.now() - (6 * 60 * 60 * 1000));
        const manualDraftCutoff = gameTime - MANUAL_TELEMETRY_DRAFT_REUSE_WINDOW_MS;
        const existingDraft = useAppStore.getState().matches
            .filter((m: Match) => {
                if (!m || m.subType !== 'Telemetry Draft') return false;
                const ts = Number(m.timestamp || 0);
                if (!Number.isFinite(ts) || ts < recentCutoff) return false;
                const isActiveDraft = m.telemetryDraftState === 'active';
                const isRecentManualDraft = m.telemetryDraftState == null
                    && m.result === 'Ongoing'
                    && ts >= manualDraftCutoff;
                if (!isActiveDraft && !isRecentManualDraft) return false;
                const draftPlayer = String(m.player || '').trim().toLowerCase();
                if (activePlayer && draftPlayer && draftPlayer !== activePlayer) return false;
                return true;
            })
            .sort((a: Match, b: Match) => {
                const activeScoreA = a.telemetryDraftState === 'active' ? 1 : 0;
                const activeScoreB = b.telemetryDraftState === 'active' ? 1 : 0;
                if (activeScoreB !== activeScoreA) return activeScoreB - activeScoreA;
                return Number(b.timestamp || 0) - Number(a.timestamp || 0);
            })[0];
        if (existingDraft) {
            let nextExistingDraft = existingDraft;
            const nextTimestamp = Number(existingDraft.timestamp || gameTime) || gameTime;
            if (existingDraft.telemetryDraftState !== 'active') {
                nextExistingDraft = {
                    ...nextExistingDraft,
                    timestamp: nextTimestamp,
                    telemetryDraftState: 'active',
                };
            }
            if (telemetryLifecycleIsPracticeRangeRef.current === true && nextExistingDraft.isPracticeRange !== true) {
                nextExistingDraft = {
                    ...nextExistingDraft,
                    timestamp: nextTimestamp,
                    isPracticeRange: true,
                };
            }
            if (telemetryLifecycleIsBackfillRef.current === true && nextExistingDraft.isBackfill !== true) {
                nextExistingDraft = {
                    ...nextExistingDraft,
                    timestamp: nextTimestamp,
                    isBackfill: true,
                };
            }
            if (nextExistingDraft.matchMode !== telemetryDraftMatchModeRef.current) {
                nextExistingDraft = {
                    ...nextExistingDraft,
                    timestamp: nextTimestamp,
                    matchMode: telemetryDraftMatchModeRef.current,
                };
            }
            if (nextExistingDraft !== existingDraft) {
                updateMatch(nextExistingDraft);
            }
            telemetryDraftMatchIdRef.current = existingDraft.id;
            telemetryDraftStartedAtRef.current = Number(existingDraft.timestamp || gameTime) || gameTime;
            telemetryDraftLoadoutSignatureRef.current = buildLoadoutSignature(nextExistingDraft.loadout || loadout || currentLoadoutRef.current || null);
            if (Object.keys(pendingTelemetryConsistencyRef.current || {}).length > 0) {
                updateTelemetryDraftConsistency(pendingTelemetryConsistencyRef.current, gameTime);
            }
            syncFriendlyPlayerIdsToDraft(gameTime);
            Logger.info('LogMonitor', `Reused existing telemetry draft (matchId=${nextExistingDraft.id})`);
            return nextExistingDraft.id;
        }
        const matchId = Date.now() + Math.floor(Math.random() * 1000);
        const baselineLoadout = loadout || currentLoadoutRef.current || null;
        const draftStartedAt = telemetryLifecycleStartedAtRef.current || gameTime;
        const draft = buildTelemetryDraft(matchId, draftStartedAt, baselineLoadout);
        console.trace('Telemetry draft creation trace');
        addMatch(draft);
        telemetryDraftMatchIdRef.current = matchId;
        telemetryDraftStartedAtRef.current = draftStartedAt;
        telemetryDraftLoadoutSignatureRef.current = buildLoadoutSignature(draft.loadout);
        Logger.info('LogMonitor', `Telemetry draft created (matchId=${matchId})`);
        return matchId;
    }, [addMatch, buildTelemetryDraft, syncFriendlyPlayerIdsToDraft, updateMatch, updateTelemetryDraftConsistency]);

    const updateTelemetryDraftFromLoadout = useCallback((loadout: Loadout, gameTime: number) => {
        const draftId = telemetryDraftMatchIdRef.current;
        if (!draftId) return;
        const signature = buildLoadoutSignature(loadout);
        if (!signature || signature === telemetryDraftLoadoutSignatureRef.current) return;
        telemetryDraftLoadoutSignatureRef.current = signature;
        const match = useAppStore.getState().matches.find((m: Match) => m.id === draftId);
        if (!match) return;
        const nextDraftLoadout = sanitizeLoadout({
            ...(match.loadout || {}),
            ...(loadout || {}),
            hero: loadout.hero || match.loadout?.hero || null,
            ship: loadout.ship || match.loadout?.ship || null,
        });
        updateMatch({
            ...match,
            timestamp: match.timestamp || gameTime,
            hero: loadout.hero && !String(loadout.hero).startsWith('Unknown') ? String(loadout.hero) : match.hero,
            ship: loadout.ship && !String(loadout.ship).startsWith('Unknown') ? String(loadout.ship) : match.ship,
            loadout: nextDraftLoadout || undefined,
        });
    }, [updateMatch]);

    const appendTelemetryLoadoutSave = useCallback((
        source: 'NebLoadoutSaved' | 'NebCloudSaveRecordSize',
        gameTime: number,
        inGame: boolean,
    ) => {
        if (!Number.isFinite(gameTime) || gameTime <= 0) return;
        const patchBase: Partial<TelemetryConsistency> = {
            durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
            latestLoadoutSaveAt: gameTime,
        };

        const draftId = telemetryDraftMatchIdRef.current;
        if (!draftId) {
            const pendingSnapshots = [...(pendingTelemetryConsistencyRef.current.loadoutSaves || [])];
            const pendingLast = pendingSnapshots[pendingSnapshots.length - 1];
            if (!pendingLast || pendingLast.timestamp !== gameTime || pendingLast.source !== source) {
                pendingSnapshots.push({ timestamp: gameTime, inGame, source });
            }
            updatePendingTelemetryConsistency({ ...patchBase, loadoutSaves: pendingSnapshots });
            return;
        }
        const match = useAppStore.getState().matches.find((m: Match) => m.id === draftId);
        if (!match) {
            const pendingSnapshots = [...(pendingTelemetryConsistencyRef.current.loadoutSaves || [])];
            const pendingLast = pendingSnapshots[pendingSnapshots.length - 1];
            if (!pendingLast || pendingLast.timestamp !== gameTime || pendingLast.source !== source) {
                pendingSnapshots.push({ timestamp: gameTime, inGame, source });
            }
            updatePendingTelemetryConsistency({ ...patchBase, loadoutSaves: pendingSnapshots });
            return;
        }
        const snapshots = [...(match.telemetryConsistency?.loadoutSaves || [])];
        const last = snapshots[snapshots.length - 1];
        if (!last || last.timestamp !== gameTime || last.source !== source) {
            snapshots.push({ timestamp: gameTime, inGame, source });
        }
        const nextConsistency: TelemetryConsistency = {
            durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
            ...(match.telemetryConsistency || {}),
            latestLoadoutSaveAt: gameTime,
            loadoutSaves: snapshots,
        };
        updateMatch({
            ...match,
            timestamp: match.timestamp || gameTime,
            telemetryConsistency: nextConsistency,
        });
        updatePendingTelemetryConsistency({
            latestLoadoutSaveAt: gameTime,
            loadoutSaves: snapshots,
        });
    }, [updateMatch, updatePendingTelemetryConsistency]);

    const finalizeTelemetryDraft = useCallback((
        gameTime: number,
        durationOverrideSeconds?: number | null,
        readyTrigger: TelemetryDraftReadyTrigger = 'unknown',
    ) => {
        console.trace('Telemetry draft finalization trace');
        const draftId = telemetryDraftMatchIdRef.current;
        if (!draftId) {
            return { duration: '00:00', hasTrustedDuration: false, totalSeconds: 0, matchId: null };
        }
        const match = useAppStore.getState().matches.find((m: Match) => m.id === draftId);
        const startedAt = telemetryLiveStartedAtRef.current
            || telemetryDraftStartedAtRef.current
            || telemetryLifecycleStartedAtRef.current
            || match?.timestamp
            || gameTime;
        const durationSummary = getTelemetryDurationSummary(startedAt, gameTime, durationOverrideSeconds);
        if (match) {
            const maxDurationClock = toClock(MAX_TELEMETRY_MATCH_DURATION_SECONDS);
            const nextConsistency: TelemetryConsistency = {
                durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
                ...(match.telemetryConsistency || {}),
            };
            if (durationSummary.hasTrustedDuration) {
                nextConsistency.telemetryDurationSeconds = durationSummary.totalSeconds;
            } else {
                delete nextConsistency.telemetryDurationSeconds;
                Logger.warn(
                    'LogMonitor',
                    `Telemetry draft duration exceeded limit (${durationSummary.rawDuration} raw, max ${maxDurationClock}). Resetting to 00:00.`,
                );
            }
            updateMatch({
                ...match,
                timestamp: startedAt,
                time: durationSummary.duration,
                notes: match.notes || '',
                telemetryDraftState: 'ready',
                telemetryConsistency: nextConsistency,
            });
            window.dispatchEvent(new CustomEvent('telemetry:draft-ready', {
                detail: { matchId: draftId, duration: durationSummary.duration, readyTrigger },
            }));
            Logger.info(
                'LogMonitor',
                `Telemetry draft finalized (matchId=${draftId}, duration=${durationSummary.duration}, trigger=${readyTrigger})`,
            );
        }
        telemetryDraftMatchIdRef.current = null;
        telemetryDraftMatchModeRef.current = 'custom';
        telemetryDraftStartedAtRef.current = null;
        telemetryLifecycleStartedAtRef.current = null;
        telemetryLiveStartedAtRef.current = null;
        telemetryDraftLoadoutSignatureRef.current = '';
        latestNebLoadoutSavedTimestampRef.current = 0;
        latestNebLoadoutSavedSignatureRef.current = '';
        localTelemetryShipSelectionRef.current = '';
        localTelemetryShipSelectionAtRef.current = 0;
        telemetryPracticeRangeSessionIdsRef.current.clear();
        pendingTelemetryConsistencyRef.current = {
            durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
        };
        return {
            duration: durationSummary.duration,
            hasTrustedDuration: durationSummary.hasTrustedDuration,
            totalSeconds: durationSummary.totalSeconds,
            matchId: draftId,
        };
    }, [updateMatch]);

    const transitionTelemetryLifecycleStage = useCallback((
        nextStage: Exclude<TelemetryLifecycleStage, 'idle'>,
        gameTime: number,
        durationOverrideSeconds?: number | null,
        options?: { isPracticeRange?: boolean; readyTrigger?: TelemetryDraftReadyTrigger },
    ) => {
        const currentStage = telemetryLifecycleStageRef.current;
        const nextPracticeRange = nextStage === 'live' && options?.isPracticeRange === true;
        const shouldRestartStaleLiveStage = currentStage === 'live'
            && nextStage === 'live'
            && telemetryLifecycleActiveRef.current
            && !telemetryDraftMatchIdRef.current;
        if (!shouldAdvanceTelemetryLifecycleStage(currentStage, nextStage) && !shouldRestartStaleLiveStage) {
            return;
        }

        if (currentStage === 'idle' || currentStage === 'menu' || shouldRestartStaleLiveStage) {
            if (telemetryLifecycleActiveRef.current && !telemetryDraftMatchIdRef.current) {
                telemetryLifecycleActiveRef.current = false;
                telemetryLifecycleStartedAtRef.current = null;
                telemetryLiveStartedAtRef.current = null;
                setIsMatchInProgress(false);
                setMatchStartTime(null);
                Logger.warn('LogMonitor', 'Cleared stale active-match flag on next mission start.');
            }
            telemetryLifecycleIsBackfillRef.current = false;
            resetSelectionDefaultsForNewMatch();
            latestNebLoadoutSavedTimestampRef.current = 0;
            latestNebLoadoutSavedSignatureRef.current = '';
            localTelemetryShipSelectionRef.current = '';
            localTelemetryShipSelectionAtRef.current = 0;
            applyTelemetryTimerValue('00:00');
        }

        telemetryLifecycleStageRef.current = nextStage;
        telemetryLifecycleIsPracticeRangeRef.current = nextPracticeRange;
        setTelemetryLifecycleStage(nextStage);
        setTelemetryLifecycleIsPracticeRange(nextPracticeRange);

        if (nextStage === 'loading' || nextStage === 'pregame') {
            telemetryLifecycleActiveRef.current = true;
            telemetryLifecycleStartedAtRef.current = telemetryLifecycleStartedAtRef.current || gameTime;
            setIsMatchInProgress(false);
            setMatchStartTime(null);
            setOverlayPhase('Setup');
            createTelemetryDraftIfNeeded(gameTime, currentLoadoutRef.current || null);
            return;
        }

        if (nextStage === 'live') {
            const isBackfill = currentStage === 'idle' || currentStage === 'menu';
            if (isBackfill) {
                telemetryLifecycleIsBackfillRef.current = true;
                Logger.info('LogMonitor', '[LIFECYCLE] Backfill detected — jumped directly to live without pregame.');
            }
            telemetryLifecycleActiveRef.current = true;
            telemetryLifecycleStartedAtRef.current = telemetryLifecycleStartedAtRef.current || gameTime;
            telemetryLiveStartedAtRef.current = telemetryLiveStartedAtRef.current || gameTime;
            setIsMatchInProgress(true);
            setMatchStartTime(telemetryLiveStartedAtRef.current);
            setOverlayPhase('Live');
            createTelemetryDraftIfNeeded(gameTime, currentLoadoutRef.current || null);
            return;
        }

        telemetryLifecycleActiveRef.current = false;
        if (!telemetryDraftMatchIdRef.current) {
            createTelemetryDraftIfNeeded(gameTime, currentLoadoutRef.current || null);
        }
        const finalized = finalizeTelemetryDraft(
            gameTime,
            durationOverrideSeconds,
            options?.readyTrigger ?? 'unknown',
        );
        applyTelemetryTimerValue(finalized.duration);
        setIsMatchInProgress(false);
        setMatchStartTime(null);
        setOverlayPhase('Menu');
    }, [
        applyTelemetryTimerValue,
        createTelemetryDraftIfNeeded,
        finalizeTelemetryDraft,
        resetSelectionDefaultsForNewMatch,
        setIsMatchInProgress,
        setMatchStartTime,
        setOverlayPhase,
        setTelemetryLifecycleIsPracticeRange,
        setTelemetryLifecycleStage,
    ]);

    useEffect(() => { playerIdMapRef.current = playerIdMap; }, [playerIdMap]);
    useEffect(() => { pilotRegistryRef.current = pilotRegistry; }, [pilotRegistry]);
    useEffect(() => {
        matchStartTimeRef.current = matchStartTime;
        if (typeof matchStartTime === 'number' && matchStartTime > 0) {
            telemetryLiveStartedAtRef.current = matchStartTime;
            telemetryLifecycleStageRef.current = 'live';
            telemetryLifecycleActiveRef.current = true;
            setTelemetryLifecycleStage('live');
            setTelemetryLifecycleIsPracticeRange(telemetryLifecycleIsPracticeRangeRef.current === true);
        } else if (!isMatchInProgressRef.current && telemetryLifecycleStageRef.current === 'live') {
            telemetryLiveStartedAtRef.current = null;
        }
    }, [matchStartTime, setTelemetryLifecycleIsPracticeRange, setTelemetryLifecycleStage]);
    useEffect(() => {
        isMatchInProgressRef.current = isMatchInProgress;
        if (isMatchInProgress) {
            telemetryLifecycleActiveRef.current = true;
            telemetryLifecycleStageRef.current = 'live';
            setTelemetryLifecycleStage('live');
            setTelemetryLifecycleIsPracticeRange(telemetryLifecycleIsPracticeRangeRef.current === true);
        }
    }, [isMatchInProgress, setTelemetryLifecycleIsPracticeRange, setTelemetryLifecycleStage]);
    useEffect(() => { currentLoadoutRef.current = currentLoadout; }, [currentLoadout]);
    useEffect(() => { activeHeroRef.current = activeHero; }, [activeHero]);
    useEffect(() => { activeShipRef.current = activeShip; }, [activeShip]);
    useEffect(() => {
        if (shipSource !== 'telemetry') {
            localTelemetryShipSelectionRef.current = '';
            localTelemetryShipSelectionAtRef.current = 0;
        }
    }, [shipSource]);
    useEffect(() => { activeUserRef.current = activeUser; }, [activeUser]);
    useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
    useEffect(() => { devModeRef.current = devMode; }, [devMode]);
    useEffect(() => { lifecycleTrackingPausedRef.current = lifecycleTrackingPaused; }, [lifecycleTrackingPaused]);
    useEffect(() => { sessionStartTimeRef.current = sessionStartTime; }, [sessionStartTime]);
    useEffect(() => {
        if (!adaptiveTelemetryPollingEnabled) {
            setRuntimeTelemetryProfile(telemetryPerformanceProfile);
            return;
        }
        if (isMatchInProgress) {
            setRuntimeTelemetryProfile(ADAPTIVE_MATCH_TELEMETRY_PROFILE);
            previousAdaptiveMatchStateRef.current = true;
            return;
        }
        if (previousAdaptiveMatchStateRef.current) {
            previousAdaptiveMatchStateRef.current = false;
        }
        setRuntimeTelemetryProfile('high-accuracy');
    }, [adaptiveTelemetryPollingEnabled, isMatchInProgress, telemetryPerformanceProfile]);

    useEffect(() => {
        if (!adaptiveTelemetryPollingEnabled || !isMatchInProgress) return;
        const matchStartedAt = typeof matchStartTime === 'number' ? matchStartTime : 0;
        if (matchStartedAt <= 0) {
            setRuntimeTelemetryProfile(ADAPTIVE_MATCH_TELEMETRY_PROFILE);
            return;
        }
        const elapsedMs = Date.now() - matchStartedAt;
        if (elapsedMs >= ADAPTIVE_LOW_PROFILE_DELAY_MS) {
            setRuntimeTelemetryProfile(ADAPTIVE_LOW_TELEMETRY_PROFILE);
            return;
        }
        setRuntimeTelemetryProfile(ADAPTIVE_MATCH_TELEMETRY_PROFILE);
        const timeoutId = window.setTimeout(() => {
            setRuntimeTelemetryProfile(ADAPTIVE_LOW_TELEMETRY_PROFILE);
        }, Math.max(0, ADAPTIVE_LOW_PROFILE_DELAY_MS - elapsedMs));
        return () => window.clearTimeout(timeoutId);
    }, [adaptiveTelemetryPollingEnabled, isMatchInProgress, matchStartTime]);

    useEffect(() => {
        if (!ipcRenderer) return;
        if (isStoreLoading) return;
        if (!monitorListenersReady) return;
        const effectiveTelemetryProfile = startupLifecycleEstablished
            ? (adaptiveTelemetryPollingEnabled ? runtimeTelemetryProfile : telemetryPerformanceProfile)
            : 'high-accuracy';
        if (enableAutoLogRecording && !lifecycleTrackingPaused) {
            ipcRenderer.send('start-log-monitoring', { performanceProfile: effectiveTelemetryProfile });
        } else {
            ipcRenderer.send('stop-log-monitoring');
        }
        return () => {
            ipcRenderer.send('stop-log-monitoring');
        };
    }, [adaptiveTelemetryPollingEnabled, enableAutoLogRecording, isStoreLoading, lifecycleTrackingPaused, monitorListenersReady, runtimeTelemetryProfile, startupLifecycleEstablished, telemetryPerformanceProfile]);

    useEffect(() => {
        if (isMatchInProgress && !wasMatchInProgressRef.current) {
            playStart(); // Match just started
        }
        if (!isMatchInProgress && wasMatchInProgressRef.current) {
            playEnd(); // Match just ended
        }
        wasMatchInProgressRef.current = isMatchInProgress;
    }, [isMatchInProgress, playStart, playEnd]);

    useEffect(() => {
        if (isMatchInProgress && matchStartTime) {
            const timer = setInterval(() => {
                const diff = Math.max(0, (Date.now() - matchStartTime) / 1000);
                const m = Math.floor(diff / 60);
                const s = Math.floor(diff % 60);
                setTimeMin(m.toString().padStart(2, '0'), 'telemetry');
                setTimeSec(s.toString().padStart(2, '0'), 'telemetry');
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isMatchInProgress, matchStartTime, setTimeMin, setTimeSec]);

    useEffect(() => {
        if (isMatchInProgress) return;
        const lastEventAt = Number(telemetryStatus?.lastEventAt || 0);
        if (!Number.isFinite(lastEventAt) || lastEventAt <= 0) return;
        const staleAfterMs = runtimeConfig.systemPulse.telemetryReceivingWindowMs;
        const remainingMs = staleAfterMs - (Date.now() - lastEventAt);
        if (remainingMs <= 0) {
            clearTelemetryDetected();
            return;
        }
        const timeoutId = window.setTimeout(() => {
            clearTelemetryDetected();
        }, remainingMs + 50);
        return () => window.clearTimeout(timeoutId);
    }, [clearTelemetryDetected, isMatchInProgress, telemetryStatus?.lastEventAt]);

    useEffect(() => {
        if (!ipcRenderer) return;

        const onStatus = (status: unknown) => {
            if (!isRecord(status)) return;
            if (!startupLifecycleEstablished) {
                setStartupLifecycleEstablished(true);
            }
            setTelemetryStatus(status as TelemetryStatusPatch);
            // When the game log file no longer exists, the game has closed — clear telemetry detected state
            if (status.exists === false) {
                telemetryLifecycleActiveRef.current = false;
                telemetryLifecycleStageRef.current = 'idle';
                telemetryLifecycleIsPracticeRangeRef.current = false;
                telemetryLifecycleIsBackfillRef.current = false;
                telemetryPracticeRangeSessionIdsRef.current.clear();
                telemetryDraftMatchModeRef.current = 'custom';
                telemetryLifecycleStartedAtRef.current = null;
                telemetryLiveStartedAtRef.current = null;
                setIsMatchInProgress(false);
                setMatchStartTime(null);
                setTelemetryLifecycleStage('idle');
                setTelemetryLifecycleIsPracticeRange(false);
                setOverlayPhase('Setup');
                clearTelemetryDetected();
                traceTelemetryLoadout('Telemetry source closed', {
                    clearedTelemetryDetected: true,
                    preservedCurrentLoadout: Boolean(currentLoadoutRef.current),
                    activeWeaponCount: Object.keys(useAppStore.getState().activeWeapons || {}).length,
                });
            }
        };
        const onLogData = (data: unknown) => {
            if (data) {
                if (lifecycleTrackingPausedRef.current) return;
                if (!startupLifecycleEstablished) {
                    setStartupLifecycleEstablished(true);
                }
                const now = Date.now();
                if (now - lastActivityRef.current > 5000) {
                    lastActivityRef.current = now;
                    setLastActivity(now);
                }
                const events = toTelemetryEvents(data);

                if (events.length === 0) return;
                setLogFeed(prev => [...events.slice(0, 10), ...prev].slice(0, 50));
                setTelemetryStatus({ lastEventAt: now });

                events.forEach(e => {
                    const name = typeof e.EventName === 'string' ? e.EventName : '';
                    const payload = extractEventPayload(e);
                    const gameTime = toTelemetryTimestampMs(e) ?? Date.now();
                    const eventContext = asRecord(e.context);
                    const payloadContext = asRecord(asRecord(e.Payload).context);
                    const payloadContextAlt = asRecord(asRecord(e.payload).context);
                    const payloadEnvelope = asRecord(e.Payload);
                    const payloadEnvelopeEvent = asRecord(payloadEnvelope.event);
                    const payloadEnvelopeLower = asRecord(e.payload);
                    const payloadEnvelopeLowerEvent = asRecord(payloadEnvelopeLower.event);
                    const payloadSources: unknown[] = [
                        payload,
                        payloadEnvelopeEvent,
                        payloadEnvelope,
                        payloadEnvelopeLowerEvent,
                        payloadEnvelopeLower,
                    ];
                    const matchSessionIdValueCandidates = [
                        pickTelemetryValueCaseInsensitive([eventContext], ['matchSessionId', 'sessionId', 'sESSIONId']),
                        pickTelemetryValueCaseInsensitive([payloadContext], ['matchSessionId', 'sessionId', 'sESSIONId']),
                        pickTelemetryValueCaseInsensitive([payloadContextAlt], ['matchSessionId', 'sessionId', 'sESSIONId']),
                        pickTelemetryValueCaseInsensitive(payloadSources, ['matchSessionId', 'sessionId', 'sESSIONId']),
                    ];
                    const trackedDraftMatch = telemetryDraftMatchIdRef.current != null
                        ? useAppStore.getState().matches.find((m: Match) => m.id === telemetryDraftMatchIdRef.current)
                        : null;
                    const durationBaselineStartedAt = telemetryLiveStartedAtRef.current
                        || telemetryDraftStartedAtRef.current
                        || telemetryLifecycleStartedAtRef.current
                        || Number(trackedDraftMatch?.timestamp || 0)
                        || null;
                    const {
                        hasSignal: hasExplicitMatchSessionIdSignal,
                        value: currentMatchSessionId,
                    } = getPreferredTelemetryStringCandidate(matchSessionIdValueCandidates);
                    const previousMatchSessionId = lastMatchSessionIdRef.current || '';
                    const matchmakerStateRaw = pickTelemetryValueCaseInsensitive(
                        payloadSources,
                        TELEMETRY_MATCHMAKER_STATE_KEYS,
                    );
                    const matchmakerState = typeof matchmakerStateRaw === 'string'
                        ? matchmakerStateRaw.trim()
                        : toStringOrEmpty(matchmakerStateRaw).trim();
                    const matchPoolValue = pickTelemetryValueCaseInsensitive(
                        payloadSources,
                        ['ticketMatchPool', 'ticket_match_pool', 'matchPool', 'match_pool'],
                    );
                    const loadingMapRaw = pickTelemetryValueCaseInsensitive(payloadSources, TELEMETRY_MAP_NAME_KEYS);
                    const loadingMapName = typeof loadingMapRaw === 'string' ? loadingMapRaw : '';
                    const loadingMapNameLower = loadingMapName.toLowerCase();
                    const loadingMatchState = pickTelemetryValueCaseInsensitive(payloadSources, ['matchState', 'match_state']);
                    const loadingMatchStateText = toStringOrEmpty(loadingMatchState).trim();
                    const practiceRangeMapSignal = !!loadingMapName && isPracticeRangeMap(loadingMapName);
                    const practiceRangeMatchPoolSignal = isPracticeRangeMatchPool(matchPoolValue);
                    if (practiceRangeMatchPoolSignal && currentMatchSessionId) {
                        telemetryPracticeRangeSessionIdsRef.current.add(currentMatchSessionId);
                    }
                    const practiceRangeSessionSignal = !!currentMatchSessionId
                        && telemetryPracticeRangeSessionIdsRef.current.has(currentMatchSessionId);
                    const practiceRangeSignal = (
                        practiceRangeMapSignal
                        || practiceRangeMatchPoolSignal
                        || practiceRangeSessionSignal
                    );
                    if (IS_TELEMETRY_DEBUG && name === 'NebLoadingScreen') {
                        console.log('[LifecycleStage] NebLoadingScreen map=', loadingMapName || null, 'matchState=', loadingMatchStateText || null);
                    }
                    if (IS_TELEMETRY_DEBUG && name === 'NebClientMatchmakerStateChange') {
                        console.log('[LifecycleStage] NebClientMatchmakerStateChange fields=', {
                            gameMode: pickTelemetryValueCaseInsensitive(payloadSources, ['gameMode', 'game_mode']),
                            matchType: pickTelemetryValueCaseInsensitive(payloadSources, ['matchType', 'match_type']),
                            queueType: pickTelemetryValueCaseInsensitive(payloadSources, ['queueType', 'queue_type']),
                            lobbyType: pickTelemetryValueCaseInsensitive(payloadSources, ['lobbyType', 'lobby_type']),
                            phase: pickTelemetryValueCaseInsensitive(payloadSources, ['phase']),
                            ticketMatchPool: matchPoolValue || null,
                            state: matchmakerState || null,
                            newStatus: pickTelemetryValueCaseInsensitive(payloadSources, ['newStatus', 'new_status']) || null,
                            sessionId: currentMatchSessionId || null,
                        });
                    }
                    if (
                        name === 'NebLoadingScreen'
                        && !!loadingMapName
                        && isNonMatchMap(loadingMapName)
                        && !practiceRangeSignal
                        && !loadingMapNameLower.includes('frontend')
                    ) {
                        Logger.debug('LogMonitor', `Skipping non-match map load: ${loadingMapName}`);
                    }
                    const recordKey = String(
                        pickTelemetryValueCaseInsensitive(payloadSources, TELEMETRY_RECORD_KEY_KEYS) || ''
                    ).trim();
                    const currentLifecycleStage = telemetryLifecycleStageRef.current;
                    const isRelevantToSession = gameTime >= (sessionStartTimeRef.current - 60000);
                    const ageSeconds = Math.floor((Date.now() - gameTime) / 1000);
                    const practiceRangeBootstrapSignal = (
                        (name === 'NebClientMatchmakerStateChange'
                            && !!currentMatchSessionId
                            && practiceRangeSignal
                            && isPracticeRangeBootstrapMatchmakerState(matchmakerState))
                        || (name === 'NebLoadingScreen' && practiceRangeMapSignal)
                    );
                    const allowStartupPracticeRangeBootstrap = (
                        practiceRangeBootstrapSignal
                        && (currentLifecycleStage === 'idle' || currentLifecycleStage === 'menu')
                        && !telemetryLifecycleActiveRef.current
                        && ageSeconds <= PRACTICE_RANGE_STARTUP_RECOVERY_MAX_AGE_SECONDS
                    );
                    const allowSessionEvent = isRelevantToSession || devModeRef.current || allowStartupPracticeRangeBootstrap;
                    const payloadKeys = Object.keys(payload).join(',');
                    const isLoadoutBearingEvent =
                        name === 'NebLoadoutSaved'
                        || name === 'NebCloudSaveRecordSize'
                        || TELEMETRY_LOADOUT_RECORD_KEY_PATTERN.test(name)
                        || payloadKeys.toLowerCase().split(',').some((key) => TELEMETRY_LOADOUT_SIGNAL_KEYS.has(key));
                    Logger.debug('LogMonitor', `EVENT: ${name} | Age: ${ageSeconds}s | Keys: ${payloadKeys}`);
                    if (isLoadoutBearingEvent) {
                        traceTelemetryLoadout('Loadout event received', {
                            eventName: name,
                            recordKey,
                            timestampMs: gameTime,
                            sessionStartTimeMs: sessionStartTimeRef.current,
                            allowSessionEvent,
                            lifecycleActive: telemetryLifecycleActiveRef.current,
                            payloadKeys: payloadKeys ? payloadKeys.split(',').filter(Boolean) : [],
                        });
                    }
                    if (!allowSessionEvent) {
                        if (isLoadoutBearingEvent) {
                            traceTelemetryLoadout('Gate 1 rejected: allowSessionEvent', {
                                eventName: name,
                                ageSeconds,
                                timestampMs: gameTime,
                                sessionStartTimeMs: sessionStartTimeRef.current,
                                devMode: devModeRef.current,
                                allowStartupPracticeRangeBootstrap,
                            });
                        }
                        Logger.debug('LogMonitor', `Skipping old event: ${name} (age: ${ageSeconds}s, before session start)`);
                        return;
                    }
                    if (allowStartupPracticeRangeBootstrap && !isRelevantToSession && !devModeRef.current) {
                        Logger.info(
                            'LogMonitor',
                            `Allowing stale practice-range bootstrap event: ${name} (${ageSeconds}s old, state=${matchmakerState || 'n/a'})`,
                        );
                    }
                    const loadingScreenStageSignal = name === 'NebLoadingScreen'
                        ? classifyTelemetryLifecycleStageFromMap(loadingMapName, loadingMatchState)
                        : null;
                    const stalePregameLoadingSignal = name === 'NebLoadingScreen'
                        && loadingScreenStageSignal === 'pregame'
                        && !practiceRangeSignal
                        && ageSeconds > MAX_PREGAME_LOADING_EVENT_AGE_SECONDS;
                    if (stalePregameLoadingSignal) {
                        Logger.warn(
                            'LogMonitor',
                            `[LIFECYCLE] Skipped stale pregame loading-screen event ${JSON.stringify({
                                at: new Date(gameTime).toISOString(),
                                ageSeconds,
                                loadingMap: loadingMapName || null,
                                matchState: loadingMatchStateText || null,
                            })}`,
                        );
                    }
                    const effectiveLoadingScreenStageSignal = stalePregameLoadingSignal
                        ? null
                        : loadingScreenStageSignal;
                    const mapStartSignal = effectiveLoadingScreenStageSignal === 'loading'
                        || effectiveLoadingScreenStageSignal === 'pregame'
                        || effectiveLoadingScreenStageSignal === 'live';
                    const mapEndSignal = effectiveLoadingScreenStageSignal === 'menu';
                    const explicitEmptySessionIdSignal = hasExplicitMatchSessionIdSignal && !currentMatchSessionId;
                    if (explicitEmptySessionIdSignal && (currentLifecycleStage === 'loading' || currentLifecycleStage === 'pregame')) {
                        Logger.debug(
                            'LogMonitor',
                            `Ignoring blank sessionId during ${currentLifecycleStage} lifecycle stage.`,
                        );
                    }
                    const sessionEndSignal = hasExplicitMatchSessionIdSignal
                        && !currentMatchSessionId
                        && !!previousMatchSessionId
                        && currentLifecycleStage === 'live'
                        && (telemetryLifecycleActiveRef.current || !!telemetryDraftMatchIdRef.current)
                        // Brief session-id drops can happen while the live matchmaker state is still settling.
                        && (
                            telemetryLiveStartedAtRef.current == null
                            || Math.max(0, Math.floor((gameTime - telemetryLiveStartedAtRef.current) / 1000)) >= MIN_SESSION_END_GRACE_SECONDS
                        );
                    const matchmakerLoadingSignal = name === 'NebClientMatchmakerStateChange'
                        && !!currentMatchSessionId
                        && isLoadingMatchmakerState(matchmakerState);
                    const nextLifecycleStage = sessionEndSignal
                        ? 'menu'
                        : (
                            effectiveLoadingScreenStageSignal
                            || (practiceRangeBootstrapSignal ? 'live' : null)
                            || (matchmakerLoadingSignal ? 'loading' : null)
                        );
                    const startLifecycleSignal = nextLifecycleStage === 'loading'
                        || nextLifecycleStage === 'pregame'
                        || nextLifecycleStage === 'live';
                    const endLifecycleSignal = mapEndSignal || sessionEndSignal;
                    const payloadDurationSeconds = extractTelemetryDurationOverrideSeconds(
                        payloadSources,
                        durationBaselineStartedAt,
                        gameTime,
                    );
                    const telemetryMatchMode = inferTelemetryMatchMode({
                        practiceRangeSignal,
                        matchPoolValue,
                        payloadSources,
                    });
                    updateTelemetryDraftMatchMode(telemetryMatchMode, gameTime);
                    if (
                        name === 'NebLoadingScreen'
                        || name === 'NebClientMatchmakerStateChange'
                        || hasExplicitMatchSessionIdSignal
                        || startLifecycleSignal
                        || endLifecycleSignal
                    ) {
                        Logger.info('LogMonitor', `[LIFECYCLE] ${JSON.stringify({
                            at: new Date(gameTime).toISOString(),
                            name,
                            loadingMap: loadingMapName || null,
                            currentMatchSessionId: currentMatchSessionId || null,
                            previousMatchSessionId: previousMatchSessionId || null,
                            matchmakerState: matchmakerState || null,
                            matchPool: typeof matchPoolValue === 'string' ? matchPoolValue : null,
                            practiceRangeMapSignal,
                            practiceRangeMatchPoolSignal,
                            practiceRangeSessionSignal,
                            hasExplicitMatchSessionIdSignal,
                            loadingScreenStageSignal,
                            effectiveLoadingScreenStageSignal,
                            stalePregameLoadingSignal,
                            ageSeconds,
                            nextLifecycleStage,
                            mapStartSignal,
                            practiceRangeBootstrapSignal,
                            matchmakerLoadingSignal,
                            mapEndSignal,
                            sessionEndSignal,
                            telemetryMatchMode,
                            startLifecycleSignal,
                            endLifecycleSignal,
                            lifecycleStage: telemetryLifecycleStageRef.current,
                            lifecycleActive: telemetryLifecycleActiveRef.current,
                            hasDraft: !!telemetryDraftMatchIdRef.current,
                        })}`);
                    }
                    if (effectiveLoadingScreenStageSignal === 'live' && practiceRangeSignal) {
                        Logger.info('LogMonitor', `Treating practice-range telemetry as live lifecycle stage: ${loadingMapName || String(matchPoolValue || '')}`);
                    }
                    if (nextLifecycleStage) {
                        const readyTrigger: TelemetryDraftReadyTrigger = mapEndSignal
                            ? 'frontend'
                            : (sessionEndSignal ? 'session-end' : 'unknown');
                        transitionTelemetryLifecycleStage(nextLifecycleStage, gameTime, payloadDurationSeconds, {
                            isPracticeRange: practiceRangeSignal && nextLifecycleStage === 'live',
                            readyTrigger: nextLifecycleStage === 'menu' ? readyTrigger : 'unknown',
                        });
                    }

                    if (name === 'NebClientMatchmakerStateChange') {
                        const matchmakerPlayerIds = Array.from(new Set(
                            extractTelemetryStringList(
                                payload.playerIds
                                || payload.player_ids
                                || payload.players
                                || payload.playerList
                                || payload.ticketPlayerIds
                            ).map((value) => String(value || '').trim()).filter(Boolean)
                        ));
                        currentSquadIds.current = matchmakerPlayerIds;
                        syncFriendlyPlayerIdsToDraft(gameTime);
                        if (!telemetryLifecycleActiveRef.current) {
                            Logger.debug('LogMonitor', 'Skipping pre-start matchmaker consistency capture');
                        } else {
                            const inferredMode = inferModeFromMatchPool(
                                payload.ticketMatchPool
                                || payload.ticket_match_pool
                                || payload.matchPool
                                || payload.match_pool
                            );
                            const patch: Partial<TelemetryConsistency> = {
                                durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
                            };
                            if (matchmakerPlayerIds.length > 0) {
                                patch.expectedTeammateCount = Math.max(0, matchmakerPlayerIds.length - 1);
                            } else {
                                const fallbackExpected = getExpectedTeammateCountFromMode(inferredMode?.mode);
                                if (typeof fallbackExpected === 'number') {
                                    patch.expectedTeammateCount = fallbackExpected;
                                }
                            }
                            if (inferredMode) {
                                patch.expectedMode = inferredMode.mode;
                                patch.expectedModeSource = inferredMode.source;
                            }
                            updateTelemetryDraftConsistency(patch, gameTime);
                        }
                    }

                    const isNebLoadoutSavedEvent = name === 'NebLoadoutSaved';
                    const nebLoadoutSavedPayloadRaw = pickTelemetryValueCaseInsensitive(
                        payloadSources,
                        TELEMETRY_LOADOUT_CONTAINER_KEYS,
                    );
                    let isStaleNebLoadoutSaved = false;
                    if (isNebLoadoutSavedEvent) {
                        if (
                            telemetryLifecycleStartedAtRef.current
                            && gameTime < telemetryLifecycleStartedAtRef.current
                        ) {
                            isStaleNebLoadoutSaved = true;
                            Logger.info(
                                'LogMonitor',
                                `Ignored pre-match NebLoadoutSaved event (${gameTime} < lifecycle start ${telemetryLifecycleStartedAtRef.current})`,
                            );
                        } else {
                            const latestSavedTimestamp = latestNebLoadoutSavedTimestampRef.current;
                            const incomingSignature = buildNebLoadoutPayloadSignature(nebLoadoutSavedPayloadRaw);
                            const signatureChanged = !!incomingSignature && incomingSignature !== latestNebLoadoutSavedSignatureRef.current;
                            const outOfOrderMs = latestSavedTimestamp > 0 ? (latestSavedTimestamp - gameTime) : 0;
                            const allowOutOfOrderUpdate = signatureChanged && outOfOrderMs >= 8000 && outOfOrderMs <= 30000;
                            if (
                                latestSavedTimestamp > 0
                                && gameTime < latestSavedTimestamp
                                && !allowOutOfOrderUpdate
                            ) {
                                isStaleNebLoadoutSaved = true;
                                Logger.info('LogMonitor', `Ignored stale NebLoadoutSaved event (${gameTime} < ${latestSavedTimestamp})`);
                            } else {
                                latestNebLoadoutSavedTimestampRef.current = Math.max(latestSavedTimestamp, gameTime);
                                if (incomingSignature) {
                                    latestNebLoadoutSavedSignatureRef.current = incomingSignature;
                                }
                                const wasSavedInGame = Boolean(
                                    payload.bWasSavedInGame === true
                                    || payload.wasSavedInGame === true
                                    || payload.savedInGame === true
                                    || payload.inGame === true
                                    || payloadEnvelopeEvent.bWasSavedInGame === true
                                    || payloadEnvelopeEvent.wasSavedInGame === true
                                    || payloadEnvelopeEvent.savedInGame === true
                                    || payloadEnvelopeEvent.inGame === true
                                );
                                if (!telemetryDraftMatchIdRef.current && telemetryLifecycleActiveRef.current) {
                                    createTelemetryDraftIfNeeded(gameTime, currentLoadoutRef.current || null);
                                }
                                appendTelemetryLoadoutSave('NebLoadoutSaved', gameTime, wasSavedInGame);
                            }
                        }
                    }

                    if (name === 'NebCloudSaveRecordSize') {
                        if (recordKey && TELEMETRY_LOADOUT_RECORD_KEY_PATTERN.test(recordKey)) {
                            if (!telemetryDraftMatchIdRef.current && telemetryLifecycleActiveRef.current) {
                                createTelemetryDraftIfNeeded(gameTime, currentLoadoutRef.current || null);
                            }
                            appendTelemetryLoadoutSave('NebCloudSaveRecordSize', gameTime, false);
                        }
                    }

                    const potentialId = toStringOrEmpty(
                        payload.accountId
                        || payload.userId
                        || payload.playerId
                        || payload.player_id
                        || payload.platformAccountId
                        || payload.platform_account_id
                    );
                    const potentialName = payload.displayName || payload.playerName || payload.name || payload.playerNameString || payload.callsign;

                    if (potentialId) {
                        if (potentialName && typeof potentialName === 'string' && potentialName.length > 0) {
                            const setPlayerName = useAppStore.getState().setPlayerName;
                            setPlayerName(potentialId, potentialName);
                            const normalizedPotentialId = normalizeTeammatePlayerId(potentialId);
                            if (
                                normalizedPotentialId
                                && currentSquadIds.current.some((playerId) => normalizeTeammatePlayerId(playerId) === normalizedPotentialId)
                                && !isLocalTelemetryPlayerId(normalizedPotentialId)
                            ) {
                                confirmTeammateIdentity(normalizedPotentialId, potentialName, {
                                    source: 'telemetry_direct',
                                    matchId: telemetryDraftMatchIdRef.current,
                                });
                            }
                            const currentMappedName = playerIdMapRef.current[potentialId];
                            if (currentMappedName && currentMappedName.startsWith(UNNAMED_PLAYER_PREFIX) && currentMappedName !== potentialName) {
                                updatePlayerIdMapping(potentialId, potentialName);
                                setToast({ message: `Identity Discovered: ${potentialName}`, type: 'success' });
                            } else if (!currentMappedName && !pilotRegistryRef.current.includes(potentialName)) {
                                Logger.debug('LogMonitor', `observed unknown player: ${potentialName} (${potentialId})`);
                            }
                        } else {
                            Logger.debug('LogMonitor', `Unknown ID detected: ${potentialId}`);
                        }
                    }
                    const localId = toStringOrEmpty(
                        asRecord(eventContext.client).accountId ||
                        asRecord(eventContext.client).platformAccountId ||
                        asRecord(payloadContext.client).accountId ||
                        asRecord(payloadContext.client).platformAccountId ||
                        asRecord(payloadContextAlt.client).accountId ||
                        asRecord(payloadContextAlt.client).platformAccountId
                    );
                    rememberLocalTelemetryPlayerId(localId);
                    if (localId && activeUserRef.current && !playerIdMapRef.current[localId]) {
                        updatePlayerIdMapping(localId, activeUserRef.current);
                    }
                    if (localId) {
                        syncFriendlyPlayerIdsToDraft(gameTime);
                    }
                    const normalizeName = (value: unknown) => String(value || '').trim().toLowerCase();
                    const normalizeTelemetryId = (value: unknown) => {
                        const raw = String(value || '').trim();
                        if (!raw) return '';
                        const afterPipe = raw.includes('|') ? (raw.split('|').pop() || raw) : raw;
                        const afterColon = afterPipe.includes(':') ? (afterPipe.split(':').pop() || afterPipe) : afterPipe;
                        return afterColon.replace(/[{}-]/g, '').trim().toLowerCase();
                    };
                    const collectIds = (...values: unknown[]) => Array.from(new Set(
                        values
                            .flat()
                            .map((v) => String(v || '').trim())
                            .filter(Boolean)
                    ));
                    const collectNames = (...values: unknown[]) => Array.from(new Set(
                        values
                            .flat()
                            .map((v) => normalizeName(v))
                            .filter(Boolean)
                    ));
                    const idsMatch = (left: string, right: string) => {
                        if (left === right) return true;
                        const leftNormalized = normalizeTelemetryId(left);
                        const rightNormalized = normalizeTelemetryId(right);
                        return !!leftNormalized && leftNormalized === rightNormalized;
                    };
                    const resolveMappedNameForId = (id: string) => {
                        const direct =
                            playerIdMapRef.current[id]
                            || playerIdMapRef.current[id.toLowerCase()]
                            || playerIdMapRef.current[id.toUpperCase()];
                        if (typeof direct === 'string' && direct.trim()) return direct;
                        const normalized = normalizeTelemetryId(id);
                        if (!normalized) return '';
                        const normalizedEntry = Object.entries(playerIdMapRef.current).find(([mappedId]) => (
                            normalizeTelemetryId(mappedId) === normalized
                        ));
                        return typeof normalizedEntry?.[1] === 'string' ? normalizedEntry[1] : '';
                    };
                    const actorIds = collectIds(
                        payload.accountId,
                        payload.account_id,
                        payload.userId,
                        payload.user_id,
                        payload.playerId,
                        payload.player_id,
                        payload.platformAccountId,
                        payload.platform_account_id,
                        payload.actorId,
                        payload.actor_id,
                        payload.clientAccountId,
                        payload.client_account_id,
                    );
                    const actorNames = collectNames(
                        payload.displayName,
                        payload.display_name,
                        payload.playerName,
                        payload.player_name,
                        payload.name,
                        payload.player,
                        payload.pilotName,
                        payload.pilot_name,
                        payload.callsignName,
                        payload.callsign_name,
                        payload.callsign,
                    );
                    const localIds = collectIds(
                        localId,
                        asRecord(payloadContext.client).accountId,
                        asRecord(payloadContext.client).platformAccountId,
                        asRecord(payloadContextAlt.client).accountId,
                        asRecord(payloadContextAlt.client).platformAccountId,
                    );
                    const localNames = collectNames(
                        activeUserRef.current,
                        ...localIds.map((id) => resolveMappedNameForId(id)),
                    );
                    let shouldApplyLoadout = true;
                    if (localIds.length > 0 && actorIds.length > 0) {
                        shouldApplyLoadout = actorIds.some((id) => (
                            localIds.some((localCandidate) => idsMatch(id, localCandidate))
                        ));
                    } else if (localNames.length > 0 && actorNames.length > 0) {
                        shouldApplyLoadout = actorNames.some((name) => localNames.includes(name));
                    } else if (actorIds.length > 0 && localNames.length > 0) {
                        shouldApplyLoadout = actorIds.some((id) => {
                            const mapped = normalizeName(resolveMappedNameForId(id));
                            return !!mapped && localNames.includes(mapped);
                        });
                    }
                    const loadoutMarkedLocal = Boolean(
                        payload.isLocalPlayer === true ||
                        payload.localPlayer === true ||
                        payload.isSelf === true ||
                        payload.self === true ||
                        payload.is_me === true ||
                        payload.owningPlayer === 'local'
                    );
                    if (!shouldApplyLoadout && loadoutMarkedLocal) {
                        shouldApplyLoadout = true;
                    }
                    if (isStaleNebLoadoutSaved) {
                        shouldApplyLoadout = false;
                    }
                    const isSharedShipSelectionEvent = name === 'NebCloudSaveRecordSize'
                        && TELEMETRY_SHARED_SHIP_SELECTION_PATTERN.test(recordKey);
                    const shouldApplySharedShipSelection = !shouldApplyLoadout && isSharedShipSelectionEvent;
                    let loadout: unknown = (
                        isNebLoadoutSavedEvent && isRecord(nebLoadoutSavedPayloadRaw)
                            ? nebLoadoutSavedPayloadRaw
                            : undefined
                    ) || pickTelemetryValueCaseInsensitive(payloadSources, TELEMETRY_LOADOUT_CONTAINER_KEYS);
                    if (Array.isArray(loadout)) loadout = loadout[0];
                    if (isRecord(loadout) && loadout.loadout) loadout = loadout.loadout;
                    if (isRecord(loadout) && loadout.Loadout) loadout = loadout.Loadout;
                    if (!isRecord(loadout)) {
                        const payloadKeysLower = Object.keys(payload || {}).map((k) => k.toLowerCase());
                        const hasSignals = payloadKeysLower.some((k) => TELEMETRY_LOADOUT_SIGNAL_KEYS.has(k));
                        if (hasSignals) {
                            loadout = payload;
                        } else {
                            loadout = (
                                findNestedTelemetryRecord(payload, TELEMETRY_LOADOUT_SIGNAL_KEYS)
                                || findNestedTelemetryRecord(payloadEnvelope, TELEMETRY_LOADOUT_SIGNAL_KEYS)
                                || findNestedTelemetryRecord(payloadEnvelopeLower, TELEMETRY_LOADOUT_SIGNAL_KEYS)
                                || (isSharedShipSelectionEvent
                                    ? (
                                        findNestedTelemetryRecord(payload, TELEMETRY_SHIP_SIGNAL_KEYS)
                                        || findNestedTelemetryRecord(payloadEnvelope, TELEMETRY_SHIP_SIGNAL_KEYS)
                                        || findNestedTelemetryRecord(payloadEnvelopeLower, TELEMETRY_SHIP_SIGNAL_KEYS)
                                    )
                                    : null)
                            );
                        }
                    }
                    if (isRecord(loadout) && (shouldApplyLoadout || shouldApplySharedShipSelection)) {
                        const loadoutData = loadout;
                        const { knownMappings, uidMappings, registerUnknownId } = useAppStore.getState();
                        const allowHeroAndLoadoutSync = shouldApplyLoadout;

                        let heroName = '';
                        let shipName = '';
                        const exactMatchList = (raw: string, list: string[]): string | null => {
                            if (!raw) return null;
                            const lower = raw.toLowerCase();
                            const normalized = lower.replace(/[^a-z0-9]+/g, ' ').trim();
                            const exact = list.find((item) => item.toLowerCase() === lower);
                            if (exact) return exact;
                            return list.find((item) => (
                                item.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normalized
                            )) || null;
                        };
                        const fuzzyMatchList = (raw: string, list: string[]): string | null => {
                            if (!raw) return null;
                            const lower = raw.toLowerCase();
                            const normalized = lower.replace(/[^a-z0-9]+/g, ' ').trim();
                            const exact = list.find(item => item.toLowerCase() === lower);
                            if (exact) return exact;
                            const normalizedExact = list.find(item => item.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normalized);
                            if (normalizedExact) return normalizedExact;
                            const contains = list.find((item) => {
                                const short = item.toLowerCase().split('(')[0].trim();
                                return lower.includes(short) || normalized.includes(short);
                            });
                            if (contains) return contains;
                            const partial = list.find(item => item.toLowerCase().startsWith(lower) || lower.startsWith(item.toLowerCase().split('(')[0].trim()));
                            return partial || null;
                        };
                        const normalizeGuid = (value: unknown): string => {
                            if (value == null) return '';
                            const raw = String(value).trim();
                            if (!raw) return '';
                            const afterPipe = raw.includes('|') ? (raw.split('|').pop() || raw) : raw;
                            const afterSlash = afterPipe.includes('/') ? (afterPipe.split('/').pop() || afterPipe) : afterPipe;
                            const afterDot = afterSlash.includes('.') ? (afterSlash.split('.').pop() || afterSlash) : afterSlash;
                            const afterColon = afterDot.includes(':') ? (afterDot.split(':').pop() || afterDot) : afterDot;
                            return afterColon.replace(/[{}-]/g, '').trim().toUpperCase();
                        };
                        const normalizePerkNameCandidate = (value: unknown): string => String(value || '')
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, ' ')
                            .trim();
                        const normalizeGuidLookupKey = (value: unknown): string => {
                            if (value == null) return '';
                            const raw = String(value).trim();
                            if (!raw) return '';
                            const afterColon = raw.includes(':') ? (raw.split(':').pop() || '') : raw;
                            return afterColon.replace(/[{}-]/g, '').trim().toUpperCase();
                        };
                        const isStableGuid = (value: string): boolean => /^[A-F0-9]{32}$/i.test(value);
                        const getLoadoutField = (obj: Record<string, unknown>, keys: string[]) => {
                            const normalizedKeySet = new Set(keys.map((key) => key.toLowerCase()));
                            for (const key of keys) {
                                if (obj[key] != null) return obj[key];
                            }
                            for (const [k, v] of Object.entries(obj)) {
                                if (normalizedKeySet.has(k.toLowerCase())) return v;
                            }
                            return findNestedRecordValueCaseInsensitive(obj, keys, 4);
                        };
                        const buildCanonicalGuidLookup = (source: Record<string, string>) => {
                            const lookup: Record<string, string> = {};
                            Object.entries(source || {}).forEach(([rawKey, rawValue]) => {
                                const key = normalizeGuidLookupKey(rawKey);
                                const value = String(rawValue || '').trim();
                                if (!key || !value || lookup[key]) return;
                                lookup[key] = value;
                            });
                            return lookup;
                        };
                        const canonicalUidWeaponMappings = buildCanonicalGuidLookup(uidMappings.weapons);
                        const canonicalUidEquipmentMappings = buildCanonicalGuidLookup(uidMappings.equipment);
                        const canonicalUidPerkMappings = buildCanonicalGuidLookup(uidMappings.perks);
                        const canonicalWeaponDb = buildCanonicalGuidLookup(WEAPON_GUIDS);
                        const canonicalEquipmentDb = buildCanonicalGuidLookup(EQUIPMENT_GUIDS);
                        const canonicalPerkDb = buildCanonicalGuidLookup(PERK_GUIDS);
                        const normalizeTelemetrySelectionName = (
                            entityType: 'Hero' | 'Ship',
                            value: unknown,
                        ): string => {
                            const raw = String(value || '').trim();
                            if (!raw) return '';
                            if (entityType !== 'Ship') return raw;
                            if (isWeakTelemetrySelectionLabel(raw)) return raw;
                            return normalizeShipName(raw) || raw;
                        };
                        const normalizeTelemetrySelectionIdCandidate = (value: unknown): string => {
                            if (value == null) return '';
                            const raw = String(value).trim();
                            if (!raw) return '';
                            const afterPipe = raw.includes('|') ? (raw.split('|').pop() || raw) : raw;
                            const afterSlash = afterPipe.includes('/') ? (afterPipe.split('/').pop() || afterPipe) : afterPipe;
                            const afterDot = afterSlash.includes('.') ? (afterSlash.split('.').pop() || afterSlash) : afterSlash;
                            const afterColon = afterDot.includes(':') ? (afterDot.split(':').pop() || afterDot) : afterDot;
                            const guidCandidate = afterColon.replace(/[{}-]/g, '').trim();
                            if (isStableGuid(guidCandidate)) return guidCandidate.toUpperCase();
                            return afterColon.trim();
                        };
                        const looksLikeTelemetrySelectionId = (value: string): boolean => {
                            const trimmed = String(value || '').trim();
                            if (!trimmed) return false;
                            if (isStableGuid(trimmed)) return true;
                            if (/^[0-9]{6,}$/.test(trimmed)) return true;
                            if (trimmed.length < 4) return false;
                            const normalized = trimmed.toLowerCase();
                            if (/(asset|guid|ship|hero|char|prospector|perk|weapon|equipment|item|slot)/.test(normalized)) {
                                return true;
                            }
                            if (/[_:/\\.-]/.test(trimmed)) return true;
                            return /[a-z]/i.test(trimmed) && /\d/.test(trimmed);
                        };
                        const buildTelemetrySelectionIdCandidates = (values: unknown[]): string[] => Array.from(new Set(
                            values
                                .flatMap((candidate) => extractTelemetryStringList(candidate))
                                .map((candidate) => normalizeTelemetrySelectionIdCandidate(candidate))
                                .filter(Boolean)
                        ));
                        const formatUnknownTelemetrySelectionLabel = (value: string): string => {
                            const normalized = normalizeTelemetrySelectionIdCandidate(value) || String(value || '').replace(/[{}-]/g, '').trim().toUpperCase();
                            const prefix = normalized.slice(0, 4).toUpperCase();
                            return prefix ? `Unknown (${prefix})` : 'Unknown';
                        };
                        const resolveTelemetrySelection = ({
                            entityType,
                            rawGuidValues,
                            rawValue,
                            uidDomainMappings,
                            knownDomainMappings,
                            guidDomainMappings,
                            fallbackCatalog,
                            allowLooseNameFallback,
                        }: {
                            entityType: 'Hero' | 'Ship';
                            rawGuidValues: unknown[];
                            rawValue: unknown;
                            uidDomainMappings: Record<string, string>;
                            knownDomainMappings: Record<string, string>;
                            guidDomainMappings: Record<string, string>;
                            fallbackCatalog: string[];
                            allowLooseNameFallback?: boolean;
                        }): string => {
                            const rawText = normalizeTelemetrySelectionName(entityType, rawValue);
                            const nameHint = normalizeTelemetrySelectionName(
                                entityType,
                                rawText.includes(':')
                                    ? String(rawText.split(':').pop() || '').trim()
                                    : rawText,
                            );
                            const allowLooseFallback = allowLooseNameFallback !== false;
                            const weakNameHint = isWeakTelemetrySelectionLabel(nameHint);
                            const selectionIdCandidates = buildTelemetrySelectionIdCandidates(rawGuidValues);
                            let unresolvedIdCandidate = '';
                            for (const selectionIdCandidate of selectionIdCandidates) {
                                const guidUpper = selectionIdCandidate.toUpperCase();
                                const guidLower = selectionIdCandidate.toLowerCase();
                                const resolvedFromGuid =
                                    uidDomainMappings[selectionIdCandidate]
                                    || uidDomainMappings[guidUpper]
                                    || uidDomainMappings[guidLower]
                                    || knownDomainMappings[selectionIdCandidate]
                                    || knownDomainMappings[guidUpper]
                                    || knownDomainMappings[guidLower]
                                    || guidDomainMappings[selectionIdCandidate]
                                    || guidDomainMappings[guidUpper]
                                    || guidDomainMappings[guidLower];
                                if (resolvedFromGuid) return normalizeTelemetrySelectionName(entityType, resolvedFromGuid);
                                const directIdMatch = exactMatchList(
                                    normalizeTelemetrySelectionName(entityType, selectionIdCandidate),
                                    fallbackCatalog,
                                );
                                if (directIdMatch) return normalizeTelemetrySelectionName(entityType, directIdMatch);
                                if (!unresolvedIdCandidate && looksLikeTelemetrySelectionId(selectionIdCandidate)) {
                                    unresolvedIdCandidate = selectionIdCandidate;
                                }
                            }

                            if (nameHint && !weakNameHint) {
                                const matchedHint = allowLooseFallback
                                    ? fuzzyMatchList(nameHint, fallbackCatalog)
                                    : exactMatchList(nameHint, fallbackCatalog);
                                if (matchedHint) return normalizeTelemetrySelectionName(entityType, matchedHint);
                                if (allowLooseFallback) return nameHint;
                            }

                            if (!unresolvedIdCandidate) {
                                traceTelemetryLoadout('Gate 4 rejected: resolveTelemetrySelection found no match', {
                                    eventName: name,
                                    entityType,
                                    rawValue: rawValue == null ? null : String(rawValue),
                                    nameHint: nameHint || null,
                                    weakNameHint,
                                    guidCandidates: selectionIdCandidates,
                                });
                                return '';
                            }
                            registerUnknownId(unresolvedIdCandidate, entityType);
                            const unknownLabel = formatUnknownTelemetrySelectionLabel(unresolvedIdCandidate);
                            Logger.warn(
                                'LogMonitor',
                                `Unknown ${entityType} telemetry ID: ${unresolvedIdCandidate} | raw: "${rawValue}" | resolved: "${unknownLabel}"`,
                            );
                            if (!allowLooseFallback) {
                                traceTelemetryLoadout('Gate 4 rejected: unresolved id in strict (shared) mode', {
                                    eventName: name,
                                    entityType,
                                    unresolvedIdCandidate,
                                    rawValue: rawValue == null ? null : String(rawValue),
                                });
                            }
                            return allowLooseFallback ? unknownLabel : '';
                        };

                        if (allowHeroAndLoadoutSync) {
                            heroName = resolveTelemetrySelection({
                                entityType: 'Hero',
                                rawGuidValues: [
                                    getLoadoutField(loadoutData, [
                                        'guidhero', 'heroguid', 'guid_hero', 'heroid', 'hero_id',
                                        'characterguid', 'character_guid',
                                        'prospectorguid', 'prospector_guid',
                                        'selectedheroguid', 'selected_hero_guid',
                                        'selectedcharacterguid', 'selected_character_guid',
                                        'selectedprospectorguid', 'selected_prospector_guid',
                                    ]),
                                ],
                                rawValue: getLoadoutField(loadoutData, [
                                    'hero', 'heroname', 'hero_name',
                                    'character', 'charactername', 'character_name',
                                    'prospector', 'prospectorname', 'prospector_name',
                                    'selectedhero', 'selected_hero',
                                    'selectedcharacter', 'selected_character',
                                    'selectedprospector', 'selected_prospector',
                                ]),
                                uidDomainMappings: uidMappings.players,
                                knownDomainMappings: knownMappings,
                                guidDomainMappings: HERO_GUIDS,
                                fallbackCatalog: [...CHARACTERS],
                            });
                            if (heroName && !heroName.startsWith('Unknown')) {
                                traceTelemetryLoadout('Apply telemetry hero', {
                                    eventName: name,
                                    hero: heroName,
                                    source: 'telemetry',
                                    lifecycleActive: telemetryLifecycleActiveRef.current,
                                });
                                setActiveHero(heroName, 'telemetry');
                                if (heroName !== activeHeroRef.current) {
                                    Logger.info('LogMonitor', `Auto-selected prospector: ${heroName}`);
                                }
                            }
                        } else {
                            // Ship has a second, ownership-agnostic path for genuinely shared/public
                            // lobby broadcasts (shouldApplySharedShipSelection, see above) - hero has
                            // no equivalent, by design, since loadout/prospector data is private to
                            // the owning client rather than broadcast the way ship-selection is. So
                            // this branch fires whenever this event's ownership check failed, which is
                            // the single narrowest path in the whole hero/ship/telemetry-reception trio
                            // the "Telemetry Signals X/3" indicator tracks (see SquadronPanel.tsx) - if
                            // that badge is durably stuck below 3/3 with hero as the missing signal,
                            // this trace (with Gate 3's actorIds/actorNames/localIds/localNames) is
                            // the place to look first: is the local-player ID/name match genuinely
                            // failing, or did this session simply never emit a loadout event carrying
                            // hero fields for the local player.
                            const hasHeroSignalFields = Object.keys(loadoutData).some((key) => (
                                TELEMETRY_HERO_SIGNAL_KEYS.has(key.toLowerCase())
                            ));
                            if (hasHeroSignalFields) {
                                traceTelemetryLoadout('Hero skipped: event carried hero fields but failed ownership match', {
                                    eventName: name,
                                    recordKey,
                                    actorIds,
                                    actorNames,
                                    localIds,
                                    localNames,
                                    loadoutMarkedLocal,
                                    isSharedShipSelectionEvent,
                                });
                            }
                        }

                        shipName = resolveTelemetrySelection({
                            entityType: 'Ship',
                            rawGuidValues: [
                                getLoadoutField(loadoutData, [
                                    'guidship', 'shipguid', 'guid_ship',
                                    'selectedshipguid', 'selected_ship_guid',
                                    'shiptypeguid', 'ship_type_guid',
                                ]),
                                getLoadoutField(loadoutData, [
                                    'shipid', 'ship_id',
                                    'selectedshipid', 'selected_ship_id',
                                    'shiptypeid', 'ship_type_id',
                                ]),
                            ],
                            rawValue: undefined,
                            uidDomainMappings: uidMappings.ships,
                            knownDomainMappings: knownMappings,
                            guidDomainMappings: SHIP_GUIDS,
                            fallbackCatalog: [...SHIPS],
                            allowLooseNameFallback: !shouldApplySharedShipSelection,
                        });
                        if (shipName && !shipName.startsWith('Unknown')) {
                            // Ordering guard: reject this ship selection if a *newer* (by game-log
                            // timestamp) selection has already been applied. Without this, whichever
                            // event happens to be processed last wins regardless of its own timestamp,
                            // so a delayed/out-of-order older event (local or shared) can silently
                            // clobber a genuinely newer selection. Comparing timestamps instead of
                            // simply trusting processing order preserves the original intent (don't let
                            // a stale shared record overwrite a fresh local pick) while also fixing the
                            // inverse (don't let a stale local record overwrite a fresh shared pick).
                            const lastAppliedShipSelectionAt = localTelemetryShipSelectionAtRef.current;
                            const isStaleOutOfOrderShipSelection = (
                                lastAppliedShipSelectionAt > 0 && gameTime < lastAppliedShipSelectionAt
                            );
                            if (isStaleOutOfOrderShipSelection) {
                                traceTelemetryLoadout('Ship selection rejected: stale/out-of-order event', {
                                    eventName: name,
                                    candidateShip: shipName,
                                    candidateAtMs: gameTime,
                                    lastAppliedShip: localTelemetryShipSelectionRef.current,
                                    lastAppliedAtMs: lastAppliedShipSelectionAt,
                                    source: shouldApplySharedShipSelection ? 'shared-ship-selection' : 'telemetry',
                                });
                                Logger.debug(
                                    'LogMonitor',
                                    `Ignored out-of-order ship-selection event: ${name} (ship=${shipName}, at=${gameTime} < lastApplied=${lastAppliedShipSelectionAt})`,
                                );
                                shipName = '';
                            } else {
                                localTelemetryShipSelectionRef.current = shipName;
                                localTelemetryShipSelectionAtRef.current = gameTime;
                                traceTelemetryLoadout('Apply telemetry ship', {
                                    eventName: name,
                                    ship: shipName,
                                    source: shouldApplySharedShipSelection ? 'shared-ship-selection' : 'telemetry',
                                    lifecycleActive: telemetryLifecycleActiveRef.current,
                                });
                                setActiveShip(shipName, 'telemetry');
                                if (shipName !== activeShipRef.current) {
                                    Logger.info('LogMonitor', `Auto-selected ship: ${shipName}`);
                                }
                            }
                        }
                        const collectCandidateStrings = (value: unknown, out: string[], depth = 0) => {
                            if (value == null || depth > 3) return;
                            if (typeof value === 'string' || typeof value === 'number') {
                                const text = String(value).trim();
                                if (text) out.push(text);
                                return;
                            }
                            if (Array.isArray(value)) {
                                value.forEach((item) => collectCandidateStrings(item, out, depth + 1));
                                return;
                            }
                            if (!isRecord(value)) return;
                            const preferredTokens = ['guid', 'id', 'name', 'display', 'weapon', 'equipment', 'perk', 'trait', 'item', 'slot'];
                            const entries = Object.entries(value);
                            let matchedPreferred = false;
                            entries.forEach(([key, candidate]) => {
                                const keyLower = key.toLowerCase();
                                if (!preferredTokens.some((token) => keyLower.includes(token))) return;
                                matchedPreferred = true;
                                collectCandidateStrings(candidate, out, depth + 1);
                            });
                            if (matchedPreferred) return;
                            entries.forEach(([, candidate]) => collectCandidateStrings(candidate, out, depth + 1));
                        };
                        const extractByKeys = (obj: Record<string, unknown>, keys: string[]): string[] => {
                            const out: string[] = [];
                            const seen = new Set<string>();
                            for (const key of keys) {
                                const val = getLoadoutField(obj, [key]);
                                if (val == null) continue;
                                const candidates: string[] = [];
                                collectCandidateStrings(val, candidates, 0);
                                candidates.forEach((candidate) => {
                                    const cleaned = String(candidate || '').trim();
                                    if (!cleaned) return;
                                    const dedupeKey = cleaned.toLowerCase();
                                    if (seen.has(dedupeKey)) return;
                                    seen.add(dedupeKey);
                                    out.push(cleaned);
                                });
                            }
                            return out;
                        };
                        const resolveGuid = (guid: string, db: Record<string, string>, type: 'Weapon' | 'Equipment' | 'Perk') => {
                            if (!guid) return null;
                            const clean = normalizeGuid(guid);
                            if (!clean) return null;
                            const rawGuidText = String(guid || '').trim();
                            const domainMappings = type === 'Weapon'
                                ? uidMappings.weapons
                                : (type === 'Equipment' ? uidMappings.equipment : uidMappings.perks);
                            const canonicalDomainMappings = type === 'Weapon'
                                ? canonicalUidWeaponMappings
                                : (type === 'Equipment' ? canonicalUidEquipmentMappings : canonicalUidPerkMappings);
                            const canonicalDb = type === 'Weapon'
                                ? canonicalWeaponDb
                                : (type === 'Equipment' ? canonicalEquipmentDb : canonicalPerkDb);
                            const cleanUpper = clean.toUpperCase();
                            const cleanLower = clean.toLowerCase();
                            const name =
                                domainMappings[clean]
                                || domainMappings[cleanUpper]
                                || domainMappings[cleanLower]
                                || canonicalDomainMappings[cleanUpper]
                                || db[clean]
                                || db[cleanUpper]
                                || db[cleanLower]
                                || canonicalDb[cleanUpper];
                            if (!name) {
                                const matchesKnownPerkName = type === 'Perk'
                                    ? !!fuzzyMatchList(rawGuidText, Array.from(PROSPECTOR_PERK_SET))
                                    : false;
                                const shouldRegisterUnknownPerk = type === 'Perk'
                                    && !matchesKnownPerkName
                                    && (
                                        isStableGuid(clean)
                                        || /perk|trait/i.test(rawGuidText)
                                        || (clean.length >= 10 && /\d/.test(clean))
                                    );
                                if (isStableGuid(clean) || shouldRegisterUnknownPerk) {
                                    registerUnknownId(cleanUpper, type);
                                }
                                return null;
                            }
                            if (isBogusTertiaryLoadoutEntry(name)) return null;
                            return name;
                        };
                        const weaponGuidCandidates = extractByKeys(loadoutData, [
                            'guidWeaponPrimary', 'guidWeaponSecondary',
                            'weaponGuidPrimary', 'weaponGuidSecondary',
                            'guidWeapon1', 'guidWeapon2',
                            'weaponGuid1', 'weaponGuid2',
                            'primaryWeaponGuid', 'secondaryWeaponGuid',
                            'weapon_guid_primary', 'weapon_guid_secondary',
                            'guid_weapon_primary', 'guid_weapon_secondary',
                            'characterWeapons', 'characterWeapon', 'characterWeaponSlots', 'characterWeaponLoadout',
                            'charWeapons', 'charWeapon', 'charWeaponSlots', 'charWeaponLoadout',
                            'crewWeapons', 'crewWeaponSlots',
                            'loadoutCharacterWeapons', 'loadoutCharWeapons',
                            'weapons', 'weaponGuids', 'weaponIds', 'weaponSlots', 'weaponSlotData', 'weaponLoadout',
                        ]);
                        const equipmentGuidCandidates = extractByKeys(loadoutData, [
                            'guidEquipmentPrimary', 'guidEquipmentSecondary',
                            'equipmentGuidPrimary', 'equipmentGuidSecondary',
                            'guidEquipment1', 'guidEquipment2',
                            'equipmentGuid1', 'equipmentGuid2',
                            'primaryEquipmentGuid', 'secondaryEquipmentGuid',
                            'equipment_guid_primary', 'equipment_guid_secondary',
                            'guid_equipment_primary', 'guid_equipment_secondary',
                            'characterEquipment', 'characterEquipments', 'characterGear', 'characterEquipmentSlots', 'characterEquipmentLoadout',
                            'charEquipment', 'charEquipments', 'charGear', 'charEquipmentSlots', 'charEquipmentLoadout',
                            'crewEquipment', 'crewGear', 'loadoutCharacterEquipment', 'loadoutCharEquipment',
                            'equipment', 'equipmentGuids', 'equipmentIds', 'equipmentSlots', 'equipmentSlotData', 'equipmentLoadout',
                        ]);
                        const perkGuidCandidates = extractByKeys(loadoutData, [
                            'guidPerkPrimary', 'guidPerkSecondary',
                            'perkGuidPrimary', 'perkGuidSecondary',
                            'guidPerk1', 'guidPerk2',
                            'perkGuid1', 'perkGuid2',
                            'primaryPerkGuid', 'secondaryPerkGuid',
                            'perk_guid_primary', 'perk_guid_secondary',
                            'guid_perk_primary', 'guid_perk_secondary',
                            'perkGuids', 'perksGuids', 'perkIds', 'perkSlots', 'perkSlotData', 'perkLoadout',
                            'perks',
                            'characterPerks', 'characterPerk', 'characterPerkSlots', 'characterPerkLoadout',
                            'traits', 'traitIds', 'traitGuids',
                        ]);
                        const isExplicitlyEmptyTelemetryValue = (value: unknown, depth = 0): boolean => {
                            if (value === undefined || depth > 4) return false;
                            if (value == null) return true;
                            if (typeof value === 'string') return value.trim().length === 0;
                            if (typeof value === 'number' || typeof value === 'boolean') return false;
                            if (Array.isArray(value)) {
                                return value.length === 0 || value.every((entry) => isExplicitlyEmptyTelemetryValue(entry, depth + 1));
                            }
                            if (!isRecord(value)) return false;
                            const nestedValues = Object.values(value);
                            return nestedValues.length === 0
                                || nestedValues.every((entry) => isExplicitlyEmptyTelemetryValue(entry, depth + 1));
                        };
                        const characterWeaponFieldKeys = [
                            'characterWeapons', 'characterWeapon', 'characterWeaponSlots', 'characterWeaponLoadout',
                            'charWeapons', 'charWeapon', 'charWeaponSlots', 'charWeaponLoadout',
                            'crewWeapons', 'crewWeaponSlots',
                            'loadoutCharacterWeapons', 'loadoutCharWeapons',
                        ];
                        const characterEquipmentFieldKeys = [
                            'characterEquipment', 'characterEquipments', 'characterGear', 'characterEquipmentSlots', 'characterEquipmentLoadout',
                            'charEquipment', 'charEquipments', 'charGear', 'charEquipmentSlots', 'charEquipmentLoadout',
                            'crewEquipment', 'crewGear', 'loadoutCharacterEquipment', 'loadoutCharEquipment',
                        ];
                        const characterPerkFieldKeys = [
                            'characterPerks', 'characterPerk', 'characterPerkSlots', 'characterPerkLoadout',
                            'perks', 'perkSlots', 'perkLoadout',
                            'traits', 'traitIds', 'traitGuids',
                        ];
                        const characterWeaponField = getLoadoutField(loadoutData, characterWeaponFieldKeys);
                        const characterEquipmentField = getLoadoutField(loadoutData, characterEquipmentFieldKeys);
                        const characterPerkField = getLoadoutField(loadoutData, characterPerkFieldKeys);
                        const hasCharacterWeaponSignal = characterWeaponField !== undefined;
                        const hasCharacterEquipmentSignal = characterEquipmentField !== undefined;
                        const hasCharacterPerkSignal = characterPerkField !== undefined;

                        const resolvedGuidWeapons = weaponGuidCandidates
                            .map((g) => resolveGuid(g, WEAPON_GUIDS, 'Weapon'))
                            .filter(Boolean) as string[];
                        const resolvedGuidEquipment = equipmentGuidCandidates
                            .map((g) => resolveGuid(g, EQUIPMENT_GUIDS, 'Equipment'))
                            .filter(Boolean) as string[];
                        const resolvedGuidPerks: string[] = [];
                        perkGuidCandidates.forEach((g) => {
                            const resolved = resolveGuid(g, PERK_GUIDS, 'Perk');
                            if (resolved) {
                                resolvedGuidPerks.push(resolved);
                            }
                        });

                        const resolveDirectProspectorNames = (
                            candidates: string[],
                            type: 'Weapon' | 'Equipment' | 'Perk',
                        ): string[] => {
                            const seen = new Set<string>();
                            const resolved: string[] = [];
                            candidates.forEach((candidate) => {
                                const raw = String(candidate || '').trim();
                                if (!raw) return;
                                if (isBogusTertiaryLoadoutEntry(raw)) return;
                                const canonical = type === 'Weapon'
                                    ? toCanonicalProspectorWeaponName(raw)
                                    : (type === 'Equipment'
                                        ? toCanonicalProspectorEquipmentName(raw)
                                        : toCanonicalProspectorPerkName(raw));
                                if (!canonical) {
                                    if (type === 'Perk' && !isStableGuid(normalizeGuid(raw))) {
                                        registerUnknownId(raw, 'Perk');
                                    }
                                    return;
                                }
                                const dedupeKey = canonical.toLowerCase();
                                if (seen.has(dedupeKey)) return;
                                seen.add(dedupeKey);
                                resolved.push(canonical);
                            });
                            return resolved;
                        };
                        const resolvedProspectorWeapons = allowHeroAndLoadoutSync
                            ? Array.from(new Set(
                                [
                                    ...resolvedGuidWeapons.map((name) => toCanonicalProspectorWeaponName(name)).filter(Boolean),
                                    ...resolveDirectProspectorNames(weaponGuidCandidates, 'Weapon'),
                                ],
                            )).slice(0, MAX_TELEMETRY_PROSPECTOR_SLOTS)
                            : [];
                        const resolvedProspectorEquipment = allowHeroAndLoadoutSync
                            ? Array.from(new Set(
                                [
                                    ...resolvedGuidEquipment.map((name) => toCanonicalProspectorEquipmentName(name)).filter(Boolean),
                                    ...resolveDirectProspectorNames(equipmentGuidCandidates, 'Equipment'),
                                ],
                            )).slice(0, MAX_TELEMETRY_PROSPECTOR_SLOTS)
                            : [];
                        const resolvedProspectorPerks = allowHeroAndLoadoutSync
                            ? Array.from(new Set(
                                [
                                    ...resolvedGuidPerks.map((name) => toCanonicalProspectorPerkName(name)).filter(Boolean),
                                    ...resolveDirectProspectorNames(perkGuidCandidates, 'Perk'),
                                ],
                            )).slice(0, MAX_PERKS_PER_MATCH)
                            : [];
                        const shouldClearCharacterWeapons = allowHeroAndLoadoutSync
                            && hasCharacterWeaponSignal
                            && isExplicitlyEmptyTelemetryValue(characterWeaponField);
                        const shouldClearCharacterEquipment = allowHeroAndLoadoutSync
                            && hasCharacterEquipmentSignal
                            && isExplicitlyEmptyTelemetryValue(characterEquipmentField);
                        const shouldClearCharacterPerks = allowHeroAndLoadoutSync
                            && hasCharacterPerkSignal
                            && isExplicitlyEmptyTelemetryValue(characterPerkField);
                        const shouldApplyCharacterWeapons = allowHeroAndLoadoutSync && (resolvedProspectorWeapons.length > 0 || shouldClearCharacterWeapons);
                        const shouldApplyCharacterEquipment = allowHeroAndLoadoutSync && (resolvedProspectorEquipment.length > 0 || shouldClearCharacterEquipment);
                        const shouldApplyCharacterPerks = allowHeroAndLoadoutSync && (resolvedProspectorPerks.length > 0 || shouldClearCharacterPerks);
                        const finalHero = (heroName && !heroName.startsWith('Unknown')) ? heroName : currentLoadoutRef.current?.hero;
                        const finalShip = (shipName && !shipName.startsWith('Unknown')) ? shipName : currentLoadoutRef.current?.ship;
                        const shouldCommitSharedShipUpdate = shouldApplySharedShipSelection
                            && !!finalShip
                            && finalShip !== currentLoadoutRef.current?.ship;
                        traceTelemetryLoadout('Resolved loadout ingestion', {
                            eventName: name,
                            recordKey,
                            timestampMs: gameTime,
                            allowSessionEvent,
                            practiceRangeMapSignal,
                            shouldApplyLoadout,
                            shouldApplySharedShipSelection,
                            loadoutMarkedLocal,
                            loadoutKeys: Object.keys(loadoutData),
                            actorIds,
                            localIds,
                            actorNames,
                            localNames,
                            hero: heroName || null,
                            ship: shipName || null,
                            characterWeapons: resolvedProspectorWeapons,
                            characterEquipment: resolvedProspectorEquipment,
                            characterPerks: resolvedProspectorPerks,
                            shouldClearCharacterWeapons,
                            shouldClearCharacterEquipment,
                            shouldClearCharacterPerks,
                        });
                        if (!allowHeroAndLoadoutSync && !shouldCommitSharedShipUpdate) {
                            Logger.debug('LogMonitor', `Skipped unresolved shared ship-selection event: ${name}`);
                            return;
                        }

                        const nextLoadout = sanitizeLoadout({
                            hero: finalHero || heroName || currentLoadoutRef.current?.hero || null,
                            ship: finalShip || shipName || currentLoadoutRef.current?.ship || null,
                            // Telemetry should not auto-map ship loadout slots.
                            weapons: (currentLoadoutRef.current?.weapons || []),
                            equipment: (currentLoadoutRef.current?.equipment || []),
                            characterWeapons: shouldApplyCharacterWeapons
                                ? (resolvedProspectorWeapons.length > 0 ? resolvedProspectorWeapons : [])
                                : (currentLoadoutRef.current?.characterWeapons || []),
                            characterEquipment: shouldApplyCharacterEquipment
                                ? (resolvedProspectorEquipment.length > 0 ? resolvedProspectorEquipment : [])
                                : (currentLoadoutRef.current?.characterEquipment || []),
                            characterPerks: shouldApplyCharacterPerks
                                ? (resolvedProspectorPerks.length > 0 ? resolvedProspectorPerks : [])
                                : (currentLoadoutRef.current?.characterPerks || currentLoadoutRef.current?.perks || []),
                            perks: shouldApplyCharacterPerks
                                ? (resolvedProspectorPerks.length > 0 ? resolvedProspectorPerks : [])
                                : (currentLoadoutRef.current?.perks || currentLoadoutRef.current?.characterPerks || []),
                        }) || {
                            hero: finalHero || heroName || currentLoadoutRef.current?.hero || null,
                            ship: finalShip || shipName || currentLoadoutRef.current?.ship || null,
                            weapons: (currentLoadoutRef.current?.weapons || []),
                            equipment: (currentLoadoutRef.current?.equipment || []),
                            characterWeapons: [],
                            characterEquipment: [],
                            characterPerks: [],
                            perks: [],
                        };
                        traceTelemetryLoadout('Commit telemetry loadout', {
                            eventName: name,
                            matchLifecycleActive: telemetryLifecycleActiveRef.current,
                            hero: nextLoadout.hero || null,
                            ship: nextLoadout.ship || null,
                            characterWeaponCount: nextLoadout.characterWeapons?.length || 0,
                            characterEquipmentCount: nextLoadout.characterEquipment?.length || 0,
                            characterPerkCount: nextLoadout.characterPerks?.length || 0,
                        });
                        setCurrentLoadout(nextLoadout);
                        const replacedLoadoutNames = new Set([
                            ...(currentLoadoutRef.current?.weapons || []),
                            ...(currentLoadoutRef.current?.equipment || []),
                            ...(currentLoadoutRef.current?.characterWeapons || []),
                            ...(currentLoadoutRef.current?.characterEquipment || []),
                            ...(nextLoadout.weapons || []),
                            ...(nextLoadout.equipment || []),
                            ...(nextLoadout.characterWeapons || []),
                            ...(nextLoadout.characterEquipment || []),
                        ].map((name) => normalizeEntityLabel(name)).filter(Boolean));
                        const existingWeapons = useAppStore.getState().activeWeapons || {};
                        const nextActiveWeapons: Record<string, number> = {};
                        Object.entries(existingWeapons).forEach(([name, count]) => {
                            const normalizedName = normalizeEntityLabel(name);
                            if (normalizedName && (PROSPECTOR_LOADOUT_NAME_SET.has(normalizedName) || replacedLoadoutNames.has(normalizedName))) return;
                            const safeCount = Math.max(0, Math.floor(Number(count || 0)));
                            if (safeCount > 0) {
                                nextActiveWeapons[name] = safeCount;
                            }
                        });
                        Object.entries(buildActiveWeaponsFromLoadout(nextLoadout)).forEach(([name, count]) => {
                            const safeCount = Math.max(0, Math.floor(Number(count || 0)));
                            if (safeCount > 0) {
                                nextActiveWeapons[name] = safeCount;
                            }
                        });
                        traceTelemetryLoadout('Commit telemetry active weapons', {
                            eventName: name,
                            activeWeaponCount: Object.keys(nextActiveWeapons).length,
                            persistedHero: nextLoadout.hero || null,
                        });
                        setActiveWeapons(nextActiveWeapons);
                        if (!telemetryDraftMatchIdRef.current && telemetryLifecycleActiveRef.current) {
                            createTelemetryDraftIfNeeded(gameTime, nextLoadout);
                        }
                        updateTelemetryDraftFromLoadout(nextLoadout, gameTime);
                    } else if (isRecord(loadout) && !shouldApplyLoadout && !shouldApplySharedShipSelection) {
                        traceTelemetryLoadout('Gate 3 rejected: shouldApplyLoadout', {
                            eventName: name,
                            recordKey,
                            actorIds,
                            actorNames,
                            localIds,
                            localNames,
                            loadoutMarkedLocal,
                        });
                        Logger.debug('LogMonitor', `Skipped non-local loadout event: ${name}`);
                    } else if (isLoadoutBearingEvent && !isRecord(loadout)) {
                        traceTelemetryLoadout('Gate 2 rejected: isLoadoutBearingEvent matched but no loadout payload resolved', {
                            eventName: name,
                            recordKey,
                            payloadKeys: payloadKeys ? payloadKeys.split(',').filter(Boolean) : [],
                        });
                    }
                    const actions = {
                        setToast,
                        updatePlayerIdMapping,
                        setDeviceDisplayInfo,
                        setGameResolution,
                    };

                    const context = {
                        playerIdMap: playerIdMapRef.current,
                        pilotRegistry: pilotRegistryRef.current,
                    };
                    processTelemetryEvent(e, actions, context);
                    if (hasExplicitMatchSessionIdSignal && currentMatchSessionId) {
                        lastMatchSessionIdRef.current = currentMatchSessionId;
                    }
                });
            }
        };

        const unsubStatus = ipcRenderer.on('log-status', onStatus);
        const unsubData = ipcRenderer.on('log-data', onLogData);
        setMonitorListenersReady(true);
        return () => {
            setMonitorListenersReady(false);
            unsubStatus();
            unsubData();
        };
    }, [appendTelemetryLoadoutSave, clearTelemetryDetected, confirmTeammateIdentity, createTelemetryDraftIfNeeded, isLocalTelemetryPlayerId, rememberLocalTelemetryPlayerId, setActiveHero, setActiveShip, setActiveWeapons, setCurrentLoadout, setDeviceDisplayInfo, setGameResolution, setIsMatchInProgress, setLastActivity, setMatchStartTime, setOverlayPhase, setTelemetryLifecycleIsPracticeRange, setTelemetryLifecycleStage, setTelemetryStatus, setToast, startupLifecycleEstablished, syncFriendlyPlayerIdsToDraft, transitionTelemetryLifecycleStage, updatePlayerIdMapping, updateTelemetryDraftConsistency, updateTelemetryDraftFromLoadout, updateTelemetryDraftMatchMode]);

    return { logFeed, logStatus: telemetryStatus };
};
