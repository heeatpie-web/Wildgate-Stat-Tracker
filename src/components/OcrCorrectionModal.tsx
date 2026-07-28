import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Search, Info, Users, Image as ImageIcon, Shield, Minus, Plus, Trash2, RefreshCw } from 'lucide-react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useAriaLiveRegion } from '../hooks/useAriaLiveRegion';
import { getLearningMetadata } from '../utils/ocrAliasEngine';
import {
    getHighConfidenceEligible as getHighConfidenceBatchEligible,
    getLowConfidenceEligible as getLowConfidenceBatchEligible,
    OCR_BATCH_THRESHOLD_MAX,
    OCR_BATCH_THRESHOLD_MIN,
    OCR_BATCH_THRESHOLD_STEP,
} from '../utils/ocrBatchActions';
import { normalizeOcrCalibrationMode } from '../utils/ocrCalibration';
import { tryMoveOpponentPlayerBetweenTeams } from '../utils/opponentTeamTransfer';
import { ConfidenceMeter } from './ConfidenceMeter';
import { BatchActionConfirmDialog } from './BatchActionConfirmDialog';
import { Match, SHIPS } from '../types';
import Logger from '../utils/logger';
import { getElectronAPI } from '../utils/electronAPI';
import {
    normalizeOcrName,
    similarityScore,
} from '../utils/stringUtils';
import { createRosterFuzzyMatcher } from '../utils/ocr/rosterFuzzyMatch';
import { selectActiveRosterNames } from '../store/slices/createDataSlice';
import { getOcrStageLabel, useOcrProgress } from '../hooks/useOcrProgress';
import { filterRosterByQuery, foldLikelyOcrDigits } from '../utils/ocr/rosterFilter';
import { BUNDLED_OCR_LEXICON } from '../utils/bundledOcrLexicon';
import { OcrTeamAssignmentBoard } from './ocr/OcrTeamAssignmentBoard';
import { WorkspaceImageViewer } from './media/WorkspaceImageViewer';
import { UI_REACH_MODIFIERS, UNKNOWN_PLAYER_LABELS } from '../utils/constants';
import {
    extractArtifactSourceFromReachModifiers,
    formatArtifactSourceModifier,
} from '../utils/artifactSource';
import {
    getRosterCandidatePruneIds,
    getRosterCandidatePruneIdsForAcceptedName,
} from '../utils/pendingReviewUtils';
import { remapOcrNameConfidenceMap } from '../utils/ocr/nameSourceHints';
import { sanitizeOpponentTeamsAgainstFriendlyRoster } from '../utils/ocr/friendlyTeamDeduper';

interface OcrCorrectionModalProps {
    isOpen: boolean;
    isActive?: boolean;
    onClose: () => void;
    onAcceptAll: () => void;
    screenshots?: string[]; 
    embedded?: boolean;
    hideFooterActions?: boolean;
    onEmbeddedFooterActionsChange?: ((actions: {
        discard: () => void;
        saveAndClose: () => void;
        commitDraft: () => boolean;
    } | null) => void) | null;
    onRequestRerunOcr?: () => void;
    rerunOcrDisabled?: boolean;
    isRerunningOcr?: boolean;
    autoAcceptOnSaveAndApply?: boolean;
    onAddAlias?: (rosterName: string, alias: string) => void;
}

interface DetectedPlayer {
    name: string;
    rawName: string;
    displayName: string;
    teamColor: string;
    teamName?: string;
    shipType?: string;
    confidence?: number | null;
}

interface OcrDetectedNameSource {
    imagePath: string;
    imageIndex: number;
    sourceRole?: 'teammate' | 'opponent';
    teamName?: string;
    teamColor?: string;
}

type OcrDetectedNameSourceMap = Record<string, OcrDetectedNameSource[]>;

type PendingBatchAction = 'accept' | 'ignore' | null;

interface TeamDraft {
    key: string;
    color: string;
    teamName: string;
    players: string[];
    shipType: string;
}

interface DropdownAnchor {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placeAbove: boolean;
}

interface SubmitCorrectionsOptions {
    closeAfterApply?: boolean;
    autoAcceptHighConfidence?: boolean;
    correctionOverrides?: Record<string, string>;
    notify?: boolean;
    invokeOnAcceptAll?: boolean;
}

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|bmp|gif)$/i;
const OCR_REVIEW_HELP_DISMISSED_STORAGE_KEY = 'wg_ocr_review_help_dismissed_v1';
const EMBEDDED_FOOTER_SAFE_INSET_PX = 132;
const MODAL_FOOTER_SAFE_INSET_PX = 96;

const getStoredHelpBannerDismissed = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(OCR_REVIEW_HELP_DISMISSED_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

const normalizeNameKey = (name: string): string => String(name || '').trim().toLowerCase();
const normalizeConfidenceKey = (name: string): string => normalizeOcrName(name || '').toLowerCase();
const normalizeSubmittedName = (name: string): string => String(name || '').trim();
const serializeNameSourceSeed = (value: unknown): string => {
    if (!value || typeof value !== 'object') return '';
    return Object.entries(value as Record<string, unknown>)
        .map(([name, sources]) => `${normalizeNameKey(name)}:${Array.isArray(sources) ? sources.length : 0}`)
        .sort((left, right) => left.localeCompare(right))
        .join('|');
};
const normalizeConfidence = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const normalized = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
    return Math.max(0, Math.min(100, Math.round(normalized)));
};
const normalizeModifierName = (name: string): string => {
    const normalized = normalizeSubmittedName(name);
    if (!normalized) return '';
    const match = UI_REACH_MODIFIERS.find((entry) => entry.toLowerCase() === normalized.toLowerCase());
    return match || normalized;
};
const normalizeModifierKey = (name: string): string => normalizeModifierName(name).toLowerCase();
const normalizeArtifactPathKey = (value: string): string => (
    String(value || '').trim().replace(/[\\/]+/g, '\\').toLowerCase()
);
const clampSelectedScreenshotIndex = (value: number, count: number): number => {
    if (!Number.isFinite(value) || count <= 0) return 0;
    return Math.max(0, Math.min(count - 1, Math.floor(value)));
};

const dedupeNames = (names: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    names.forEach((name) => {
        const cleaned = String(name || '').trim();
        const key = normalizeNameKey(cleaned);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(cleaned);
    });
    return out;
};

const isPlaceholderPlayerLabel = (name: string): boolean =>
    UNKNOWN_PLAYER_LABELS.has(normalizeOcrName(String(name || '')).toLowerCase());

const sanitizePlayerNames = (names: Array<string | null | undefined>): string[] => dedupeNames(
    names
        .map((name) => normalizeSubmittedName(String(name || '')))
        .filter((name) => !!name && !isPlaceholderPlayerLabel(name))
);

const dedupeModifierNames = (names: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    names.forEach((name) => {
        const normalized = normalizeModifierName(name);
        const key = normalizeModifierKey(normalized);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(normalized);
    });
    return out;
};

const toHazardDebugValues = (modifierNames: string[]): string[] => (
    dedupeModifierNames(
        modifierNames.filter((name) => !/^artifact\s*:/i.test(String(name || '')))
    )
);

const FRIENDLY_SHIP_SUFFIX_PATTERN = /\s*\(\s*\d+\s*player[s]?\s*\)\s*$/i;
const normalizeShipTeamLabel = (value: string): string => (
    normalizeSubmittedName(String(value || '').replace(FRIENDLY_SHIP_SUFFIX_PATTERN, ''))
);

const parseTeamKey = (teamKey: string, index: number): { color: string; teamName: string } => {
    const normalizedKey = String(teamKey || '').trim();
    if (!normalizedKey) {
        return { color: 'unknown', teamName: `Team ${index + 1}` };
    }
    const separatorIndex = normalizedKey.indexOf(':');
    if (separatorIndex > -1) {
        const color = normalizedKey.slice(0, separatorIndex).trim() || 'unknown';
        const teamName = normalizedKey.slice(separatorIndex + 1).trim() || color;
        return { color, teamName };
    }
    return { color: normalizedKey, teamName: normalizedKey };
};

const resolveInitialTeamShip = (
    teamKey: string,
    color: string,
    players: string[],
    shipTypes: Record<string, string> | undefined
): string => {
    if (!shipTypes) return '';
    const candidates: string[] = [
        shipTypes[teamKey],
        shipTypes[color],
        shipTypes[color.toLowerCase()],
        ...players.map((name) => shipTypes[name]),
    ].filter((ship): ship is string => Boolean(ship && String(ship).trim()));
    return candidates[0] || '';
};

const buildTeamDraft = (
    sessionTeams: Record<string, string[]> | undefined,
    sessionShipTypes: Record<string, string> | undefined,
    activeUser: string | null | undefined
): TeamDraft[] => {
    if (!sessionTeams) return [];
    const activeUserKey = normalizeNameKey(activeUser || '');
    return Object.entries(sessionTeams).map(([teamKey, teamPlayers], index) => {
        const { color, teamName } = parseTeamKey(teamKey, index);
        const players = sanitizePlayerNames(
            (teamPlayers || [])
                .map((name) => String(name || '').trim())
                .filter(Boolean)
                .filter((name) => normalizeNameKey(name) !== activeUserKey)
        );
        return {
            key: teamKey,
            color,
            teamName,
            players,
            shipType: resolveInitialTeamShip(teamKey, color, players, sessionShipTypes),
        };
    });
};

const buildTeamDraftFromPendingData = (
    pendingMatchData: Partial<Match> | null | undefined,
    activeUser: string | null | undefined,
    sessionTeams: Record<string, string[]> | undefined,
    sessionShipTypes: Record<string, string> | undefined
): TeamDraft[] => {
    const fromPendingOpponents = Array.isArray(pendingMatchData?.opponentTeams)
        ? pendingMatchData.opponentTeams
        : [];
    const hasPendingTeamData = fromPendingOpponents.length > 0
        || Array.isArray(pendingMatchData?.teammates);
    if (!hasPendingTeamData) {
        return buildTeamDraft(sessionTeams, sessionShipTypes, activeUser);
    }
    const activeUserSeed = normalizeSubmittedName(
        activeUser
        || String(pendingMatchData?.player || '').trim()
        || ''
    );
    const activeUserKey = normalizeNameKey(activeUserSeed);
    const isActiveUserCandidate = (value: string): boolean => {
        const cleaned = normalizeSubmittedName(String(value || ''));
        const key = normalizeNameKey(cleaned);
        if (!activeUserKey || !key) return false;
        if (key === activeUserKey) return true;
        return similarityScore(key, activeUserKey) >= 90;
    };

    const seededFriendlyLabel = Object.keys(sessionTeams || {}).find((teamKey) => (
        String(teamKey || '').toLowerCase().startsWith('friendly:')
    ));
    const parsedFriendlyLabel = seededFriendlyLabel
        ? parseTeamKey(seededFriendlyLabel, 0).teamName
        : '';
    const baseFriendlyPlayers = sanitizePlayerNames([
        ...((pendingMatchData?.teammates || [])
            .map((name) => normalizeSubmittedName(String(name || '')))
            .filter((name) => !isActiveUserCandidate(name))),
    ].filter(Boolean));
    const friendlyTeamName = normalizeShipTeamLabel(String(pendingMatchData?.ship || ''))
        || normalizeSubmittedName(String((pendingMatchData as { playerTeamName?: string } | null | undefined)?.playerTeamName || ''))
        || normalizeSubmittedName(parsedFriendlyLabel)
        || 'Friendly Team';
    const sanitizedPendingOpponents = sanitizeOpponentTeamsAgainstFriendlyRoster({
        teams: fromPendingOpponents.map((team) => ({
            teamName: String(team?.teamName || '').trim() || '',
            shipType: String(team?.shipType || '').trim(),
            color: String(team?.color || '').trim() || 'unknown',
            players: sanitizePlayerNames((team?.players || [])
                .map((name) => normalizeSubmittedName(String(name || '')))
                .filter((name) => !isActiveUserCandidate(name))),
        })),
        activeUser: activeUserSeed,
        friendlyPlayers: baseFriendlyPlayers,
        friendlyTeamLabels: [
            friendlyTeamName,
            String(pendingMatchData?.ship || ''),
            String((pendingMatchData as { playerTeamName?: string } | null | undefined)?.playerTeamName || ''),
            parsedFriendlyLabel,
        ],
    });
    const friendlyPlayers = sanitizePlayerNames([
        ...baseFriendlyPlayers,
        ...sanitizedPendingOpponents.promotedFriendlyPlayers,
    ]);
    const friendlyShipType = normalizeSubmittedName(
        String(pendingMatchData?.ship || '')
    ) || resolveInitialTeamShip(`friendly:${friendlyTeamName}`, 'friendly', friendlyPlayers, sessionShipTypes);
    const teams: TeamDraft[] = [{
        key: `friendly:${friendlyTeamName}`,
        color: 'friendly',
        teamName: friendlyTeamName,
        players: friendlyPlayers,
        shipType: friendlyShipType,
    }];

    sanitizedPendingOpponents.teams.forEach((team, index) => {
        const teamColor = String(team?.color || '').trim() || 'unknown';
        const teamName = String(team?.teamName || '').trim() || `Enemy Team ${index + 1}`;
        const players = sanitizePlayerNames(team?.players || []);
        const shipType = normalizeSubmittedName(String(team?.shipType || ''))
            || resolveInitialTeamShip(`${teamColor}:${teamName}`, teamColor, players, sessionShipTypes);
        teams.push({
            key: `${teamColor}:${teamName}`,
            color: teamColor,
            teamName,
            players,
            shipType,
        });
    });

    return teams;
};

const serializeTeamDraftSnapshot = (
    teammates: string[],
    opponentTeams: Array<{ teamName: string; shipType: string; color: string; players: string[] }>,
    friendlyShip: string
): string => JSON.stringify({
    teammates: sanitizePlayerNames(teammates),
    friendlyShip: normalizeSubmittedName(friendlyShip),
    opponentTeams: opponentTeams.map((team) => ({
        teamName: normalizeSubmittedName(team.teamName),
        shipType: normalizeSubmittedName(team.shipType),
        color: normalizeSubmittedName(team.color) || 'unknown',
        players: sanitizePlayerNames(team.players),
    })),
});

const serializeTeamDraftSeed = (teams: TeamDraft[]): string => JSON.stringify(
    teams.map((team) => ({
        key: normalizeSubmittedName(team.key),
        color: normalizeSubmittedName(team.color) || 'unknown',
        teamName: normalizeSubmittedName(team.teamName),
        shipType: normalizeSubmittedName(team.shipType),
        players: sanitizePlayerNames(team.players),
    }))
);

const serializeModifierDraftSeed = (modifiers: string[]): string => JSON.stringify(
    dedupeModifierNames(modifiers)
);

const clonePendingMatchDraft = (value: Partial<Match> | null | undefined): Partial<Match> | null => {
    if (!value) return null;
    return {
        ...value,
        teammates: Array.isArray(value.teammates) ? [...value.teammates] : value.teammates,
        opponents: Array.isArray(value.opponents) ? [...value.opponents] : value.opponents,
        opponentTeams: Array.isArray(value.opponentTeams)
            ? value.opponentTeams.map((team) => ({
                teamName: String(team.teamName || ''),
                shipType: String(team.shipType || ''),
                color: String(team.color || ''),
                players: Array.isArray(team.players) ? [...team.players] : [],
            }))
            : value.opponentTeams,
        artifacts: Array.isArray(value.artifacts) ? [...value.artifacts] : value.artifacts,
        reachModifiers: Array.isArray(value.reachModifiers) ? [...value.reachModifiers] : value.reachModifiers,
        kills: value.kills ? { ...value.kills } : value.kills,
        loadout: value.loadout
            ? {
                ...value.loadout,
                shipWeapons: Array.isArray(value.loadout.shipWeapons)
                    ? value.loadout.shipWeapons.map((entry) => ({ ...entry }))
                    : value.loadout.shipWeapons,
                weapons: Array.isArray(value.loadout.weapons) ? [...value.loadout.weapons] : [],
                equipment: Array.isArray(value.loadout.equipment) ? [...value.loadout.equipment] : [],
                characterWeapons: Array.isArray(value.loadout.characterWeapons) ? [...value.loadout.characterWeapons] : value.loadout.characterWeapons,
                characterEquipment: Array.isArray(value.loadout.characterEquipment) ? [...value.loadout.characterEquipment] : value.loadout.characterEquipment,
                perks: Array.isArray(value.loadout.perks) ? [...value.loadout.perks] : value.loadout.perks,
                characterPerks: Array.isArray(value.loadout.characterPerks) ? [...value.loadout.characterPerks] : value.loadout.characterPerks,
                shipPerks: Array.isArray(value.loadout.shipPerks) ? [...value.loadout.shipPerks] : value.loadout.shipPerks,
            }
            : value.loadout,
        ocrDebug: value.ocrDebug
            ? {
                ...value.ocrDebug,
                hazards: Array.isArray(value.ocrDebug.hazards) ? [...value.ocrDebug.hazards] : value.ocrDebug.hazards,
                nameConfidence: value.ocrDebug.nameConfidence ? { ...value.ocrDebug.nameConfidence } : value.ocrDebug.nameConfidence,
                nameSources: value.ocrDebug.nameSources
                    ? Object.fromEntries(
                        Object.entries(value.ocrDebug.nameSources).map(([key, entries]) => [
                            key,
                            Array.isArray(entries) ? entries.map((entry) => ({ ...entry })) : entries,
                        ])
                    )
                    : value.ocrDebug.nameSources,
            }
            : value.ocrDebug,
    };
};

const serializeShipTypeMap = (map: Record<string, string> | null | undefined): string => JSON.stringify(
    Object.entries(map || {})
        .map(([rawKey, rawValue]) => [normalizeSubmittedName(rawKey), normalizeSubmittedName(rawValue)] as const)
        .filter(([key, value]) => key.length > 0 && value.length > 0)
        .sort((left, right) => left[0].localeCompare(right[0]))
);

const buildSessionShipTypeMapFromDraft = (
    teams: TeamDraft[],
    baseMap: Record<string, string> | null | undefined
): Record<string, string> => {
    const next: Record<string, string> = { ...(baseMap || {}) };
    teams.forEach((team, index) => {
        const shipType = normalizeSubmittedName(team.shipType);
        if (!shipType) return;
        const teamColor = normalizeSubmittedName(team.color).toLowerCase();
        const teamName = normalizeSubmittedName(team.teamName) || `Team ${index + 1}`;
        const teamKey = normalizeSubmittedName(team.key);
        if (teamColor) next[teamColor] = shipType;
        if (teamName) next[teamName] = shipType;
        if (teamKey) next[teamKey] = shipType;
        (team.players || []).forEach((playerName) => {
            const normalizedPlayer = normalizeSubmittedName(playerName);
            if (normalizedPlayer) {
                next[normalizedPlayer] = shipType;
            }
        });
    });
    return next;
};

export const OcrCorrectionModal: React.FC<OcrCorrectionModalProps> = ({
    isOpen,
    isActive = true,
    onClose,
    onAcceptAll,
    screenshots,
    embedded = false,
    hideFooterActions = false,
    onEmbeddedFooterActionsChange = null,
    onRequestRerunOcr,
    rerunOcrDisabled = false,
    isRerunningOcr = false,
    autoAcceptOnSaveAndApply = false,
    onAddAlias,
}) => {
    const {
        sessionTeams,
        sessionShipTypes,
        pilotRegistry,
        rosterEntryMeta,
        addToRegistry,
        selectedTeammates,
        setSelectedTeammates,
        setSelectedOpponents,
        setSelectedReachModifiers,
        setSessionTeams,
        setSessionShipTypes,
        pendingReviews,
        removePendingReviews,
    } = useGameData();
    const { activeUser, setToast } = useUIState();
    const {
        setPlayerName,
        recordOcrCorrection,
        recordOcrAliasCorrection,
        recordTeamIdentityCorrection,
        resolveTeamIdentity,
        ocrCorrections,
        ocrAliasModel,
        recordCalibrationSample,
        ocrMode,
        ocrBatchAcceptThreshold,
        setOcrBatchAcceptThreshold,
        pendingMatchData,
        setPendingMatchData,
    } = useAppStore();

    const [corrections, setCorrections] = useState<Record<string, string>>({});
    const [ignored, setIgnored] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});
    const [activeInputPlayer, setActiveInputPlayer] = useState<string | null>(null);
    const [pendingBatchAction, setPendingBatchAction] = useState<PendingBatchAction>(null);
    const seededTeamDraft = useMemo(() => {
        const base = buildTeamDraftFromPendingData(pendingMatchData, activeUser, sessionTeams, sessionShipTypes);
        return base.map((team) => {
            const resolved = resolveTeamIdentity(team.teamName, team.color);
            return {
                ...team,
                teamName: resolved.teamName || team.teamName,
                color: resolved.color || team.color,
            };
        });
    }, [activeUser, pendingMatchData, resolveTeamIdentity, sessionShipTypes, sessionTeams]);
    const seededTeamDraftSignature = useMemo(
        () => serializeTeamDraftSeed(seededTeamDraft),
        [seededTeamDraft]
    );
    const [teamDraft, setTeamDraft] = useState<TeamDraft[]>(() => seededTeamDraft);
    const [selectedScreenshotIdx, setSelectedScreenshotIdx] = useState(0);
    const [isHelpBannerDismissed, setIsHelpBannerDismissed] = useState<boolean>(() => (
        embedded || getStoredHelpBannerDismissed()
    ));
    const modifierSuggestionsId = useId();
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const scrollBodyRef = useRef<HTMLDivElement | null>(null);
    const reviewSeedSignatureRef = useRef<string>('');
    const initialTeamDraftRef = useRef<TeamDraft[]>([]);
    const initialPendingDraftRef = useRef<Partial<Match> | null>(null);
    const initialSessionShipTypesRef = useRef<Record<string, string>>({});
    const [dropdownAnchor, setDropdownAnchor] = useState<DropdownAnchor | null>(null);
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const evidenceSectionRef = useRef<HTMLElement | null>(null);
    const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen && isActive && pendingBatchAction === null);
    const { announce } = useAriaLiveRegion(isOpen);
    const reviewScreenshots = useMemo(() => (
        (screenshots || [])
            .map((entry) => String(entry || '').trim())
            .filter((entry) => entry.length > 0)
            .filter((entry) => entry.startsWith('data:image/') || IMAGE_FILE_PATTERN.test(entry))
    ), [screenshots]);
    const screenshotIndexByPath = useMemo(() => {
        const out = new Map<string, number>();
        reviewScreenshots.forEach((path, index) => {
            out.set(normalizeArtifactPathKey(path), index);
        });
        return out;
    }, [reviewScreenshots]);
    const nameSourceHints = useMemo<OcrDetectedNameSourceMap>(() => {
        const raw = (pendingMatchData as { ocrDebug?: { nameSources?: unknown } } | null | undefined)?.ocrDebug?.nameSources;
        if (!raw || typeof raw !== 'object') return {};
        const out: OcrDetectedNameSourceMap = {};
        Object.entries(raw as Record<string, unknown>).forEach(([nameKey, entries]) => {
            const normalizedNameKey = normalizeNameKey(nameKey);
            if (!normalizedNameKey || !Array.isArray(entries)) return;
            const normalizedEntries: OcrDetectedNameSource[] = [];
            entries.forEach((entry) => {
                if (!entry || typeof entry !== 'object') return;
                const record = entry as Record<string, unknown>;
                const imagePath = String(record.imagePath || '').trim();
                if (!imagePath) return;
                const knownIndex = Number(record.imageIndex);
                const fallbackIndex = screenshotIndexByPath.get(normalizeArtifactPathKey(imagePath));
                normalizedEntries.push({
                    imagePath,
                    imageIndex: Number.isInteger(knownIndex) && knownIndex >= 0
                        ? knownIndex
                        : (fallbackIndex ?? -1),
                    sourceRole: record.sourceRole === 'teammate' || record.sourceRole === 'opponent'
                        ? record.sourceRole
                        : undefined,
                    teamName: String(record.teamName || '').trim() || undefined,
                    teamColor: String(record.teamColor || '').trim() || undefined,
                });
            });
            normalizedEntries.sort((left, right) => left.imageIndex - right.imageIndex);
            if (normalizedEntries.length > 0) out[normalizedNameKey] = normalizedEntries;
        });
        return out;
    }, [pendingMatchData, screenshotIndexByPath]);
    const detectedHazards = useMemo(() => {
        const rawHazards = (pendingMatchData as { ocrDebug?: { hazards?: unknown } } | null | undefined)?.ocrDebug?.hazards;
        if (!Array.isArray(rawHazards)) return [];
        return dedupeNames(rawHazards.map((entry) => normalizeSubmittedName(String(entry || ''))).filter(Boolean));
    }, [pendingMatchData]);
    const seededModifierDraft = useMemo(() => (
        dedupeModifierNames([
            ...((Array.isArray(pendingMatchData?.reachModifiers) ? pendingMatchData.reachModifiers : [])
                .map((entry) => normalizeSubmittedName(String(entry || '')))
                .filter(Boolean)),
            ...detectedHazards,
            formatArtifactSourceModifier(pendingMatchData?.artifactSource),
        ])
    ), [detectedHazards, pendingMatchData?.artifactSource, pendingMatchData?.reachModifiers]);
    const seededModifierDraftSignature = useMemo(
        () => serializeModifierDraftSeed(seededModifierDraft),
        [seededModifierDraft]
    );
    const [modifierDraft, setModifierDraft] = useState<string[]>(() => seededModifierDraft);
    const [modifierInput, setModifierInput] = useState('');
    const reviewSeedOcrDebug = pendingMatchData?.ocrDebug as {
        timestamp?: unknown;
        rawText?: unknown;
        playerTeamName?: unknown;
        playerShipTeamName?: unknown;
        playerShipName?: unknown;
        nameSources?: unknown;
    } | undefined;
    const reviewSeedSignature = useMemo(() => JSON.stringify({
        matchId: Number(pendingMatchData?.id || 0) || null,
        ocrState: normalizeSubmittedName(String(pendingMatchData?.ocrState || '')),
        ocrReviewedAt: Number(pendingMatchData?.ocrReviewedAt || 0) || 0,
        ocrDebugTimestamp: Number(reviewSeedOcrDebug?.timestamp || 0) || 0,
        ocrDebugRawText: String(reviewSeedOcrDebug?.rawText || '').trim().slice(0, 256),
        ocrDebugPlayerTeamName: normalizeSubmittedName(String(
            reviewSeedOcrDebug?.playerTeamName
            || reviewSeedOcrDebug?.playerShipTeamName
            || ''
        )),
        ocrDebugPlayerShipName: normalizeSubmittedName(String(reviewSeedOcrDebug?.playerShipName || '')),
        ocrDebugNameSources: serializeNameSourceSeed(reviewSeedOcrDebug?.nameSources),
        teamDraft: seededTeamDraftSignature,
        modifierDraft: seededModifierDraftSignature,
        sessionShipTypes: serializeShipTypeMap(sessionShipTypes),
        screenshotCount: reviewScreenshots.length,
    }), [
        pendingMatchData?.id,
        pendingMatchData?.ocrReviewedAt,
        pendingMatchData?.ocrState,
        reviewSeedOcrDebug?.nameSources,
        reviewSeedOcrDebug?.playerShipName,
        reviewSeedOcrDebug?.playerShipTeamName,
        reviewSeedOcrDebug?.playerTeamName,
        reviewSeedOcrDebug?.rawText,
        reviewSeedOcrDebug?.timestamp,
        reviewScreenshots.length,
        seededModifierDraftSignature,
        seededTeamDraftSignature,
        sessionShipTypes,
    ]);
    const resetReviewDraftState = useCallback(() => {
        setCorrections({});
        setIgnored(new Set());
        setSearchQuery({});
        setActiveInputPlayer(null);
        setDropdownAnchor(null);
        setPendingBatchAction(null);
        setTeamDraft(seededTeamDraft);
        setModifierDraft(seededModifierDraft);
        setModifierInput('');
        initialTeamDraftRef.current = seededTeamDraft.map((team) => ({
            ...team,
            players: [...(team.players || [])],
        }));
        initialPendingDraftRef.current = clonePendingMatchDraft(pendingMatchData);
        initialSessionShipTypesRef.current = { ...(sessionShipTypes || {}) };
        setSelectedScreenshotIdx(0);
    }, [pendingMatchData, seededModifierDraft, seededTeamDraft, sessionShipTypes]);
    const previewCorrections = useMemo<Record<string, string>>(() => (
        Object.entries(corrections).reduce<Record<string, string>>((acc, [ocrName, correctedName]) => {
            const normalizedOcrName = normalizeSubmittedName(ocrName);
            const normalizedCorrectedName = normalizeSubmittedName(correctedName);
            if (!normalizedOcrName || !normalizedCorrectedName) return acc;
            acc[normalizedOcrName] = normalizedCorrectedName;
            return acc;
        }, {})
    ), [corrections]);
    const previewTeamDraft = useMemo<TeamDraft[]>(() => (
        teamDraft.map((team) => ({
            ...team,
            players: (team.players || []).map((rawName) => {
                if (ignored.has(rawName)) return rawName;
                return previewCorrections[rawName] || rawName;
            }),
        }))
    ), [ignored, previewCorrections, teamDraft]);
    const modifierSuggestions = useMemo(() => {
        const normalizedInput = normalizeModifierName(modifierInput).toLowerCase();
        const existing = new Set(modifierDraft.map((entry) => normalizeModifierKey(entry)));
        return UI_REACH_MODIFIERS.filter((entry) => {
            const key = normalizeModifierKey(entry);
            if (existing.has(key)) return false;
            if (!normalizedInput) return true;
            return entry.toLowerCase().includes(normalizedInput);
        }).slice(0, 8);
    }, [modifierDraft, modifierInput]);
    const activeUserDisplayKey = useMemo(
        () => normalizeNameKey(activeUser || pendingMatchData?.player || ''),
        [activeUser, pendingMatchData?.player]
    );
    const toDisplayPlayerName = useCallback((name: string) => {
        const key = normalizeNameKey(name);
        if (activeUserDisplayKey && key && key === activeUserDisplayKey) return 'YOU';
        return name;
    }, [activeUserDisplayKey]);
    const resolvePlayerSources = useCallback((playerName: string): OcrDetectedNameSource[] => {
        const key = normalizeNameKey(playerName);
        if (!key) return [];
        const direct = nameSourceHints[key] || [];
        if (direct.length > 0) return direct;
        const foldedKey = normalizeNameKey(foldLikelyOcrDigits(playerName));
        if (foldedKey && foldedKey !== key) {
            return nameSourceHints[foldedKey] || [];
        }
        return [];
    }, [nameSourceHints]);
    const updateDropdownAnchor = useCallback((playerName: string | null) => {
        if (!playerName) {
            setDropdownAnchor(null);
            return;
        }
        const input = inputRefs.current[playerName];
        if (!input) {
            setDropdownAnchor(null);
            return;
        }
        const rect = input.getBoundingClientRect();
        const viewportPadding = 8;
        const maxDropdownWidth = Math.min(360, window.innerWidth - (viewportPadding * 2));
        const width = Math.max(220, Math.min(Math.max(rect.width, 240), maxDropdownWidth));
        const left = Math.max(
            viewportPadding,
            Math.min(rect.left, window.innerWidth - width - viewportPadding)
        );
        const approxDropdownHeight = 260;
        const minDropdownHeight = 96;
        const maxDropdownHeight = 320;
        const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding);
        const spaceAbove = Math.max(0, rect.top - viewportPadding);
        let placeAbove = spaceBelow < approxDropdownHeight && spaceAbove > spaceBelow;
        let availableSpace = placeAbove ? spaceAbove : spaceBelow;
        if (availableSpace < minDropdownHeight) {
            const alternateSpace = placeAbove ? spaceBelow : spaceAbove;
            if (alternateSpace > availableSpace) {
                placeAbove = !placeAbove;
                availableSpace = alternateSpace;
            }
        }
        const footerSafeInset = embedded
            ? EMBEDDED_FOOTER_SAFE_INSET_PX
            : (hideFooterActions ? viewportPadding : MODAL_FOOTER_SAFE_INSET_PX);
        const viewportBottom = Math.max(
            viewportPadding,
            window.innerHeight - footerSafeInset
        );
        const safeSpaceBelow = Math.max(0, viewportBottom - rect.bottom - viewportPadding);
        if (!placeAbove && safeSpaceBelow < approxDropdownHeight && spaceAbove > safeSpaceBelow) {
            placeAbove = true;
            availableSpace = spaceAbove;
        } else if (!placeAbove) {
            availableSpace = safeSpaceBelow;
        }
        const fallbackMinHeight = Math.min(minDropdownHeight, Math.max(spaceAbove, safeSpaceBelow));
        const maxHeight = Math.max(
            fallbackMinHeight,
            Math.min(maxDropdownHeight, availableSpace)
        );
        if (maxHeight <= 0) {
            setDropdownAnchor(null);
            return;
        }
        const anchorTop = placeAbove ? (rect.top - 8) : (rect.bottom + 8);
        const top = placeAbove
            ? Math.max(viewportPadding + maxHeight, anchorTop)
            : Math.max(viewportPadding, Math.min(anchorTop, viewportBottom - maxHeight));
        setDropdownAnchor({
            top,
            left,
            width,
            maxHeight,
            placeAbove,
        });
    }, [embedded, hideFooterActions]);

    useEffect(() => {
        if (!isOpen) {
            reviewSeedSignatureRef.current = '';
            return;
        }
        if (reviewSeedSignatureRef.current === reviewSeedSignature) return;
        resetReviewDraftState();
        reviewSeedSignatureRef.current = reviewSeedSignature;
    }, [isOpen, resetReviewDraftState, reviewSeedSignature]);

    useEffect(() => {
        const activePlayer = activeInputPlayer;
        if (!activePlayer) {
            setDropdownAnchor(null);
            return;
        }
        const queryValue = String(searchQuery[activePlayer] || '').trim();
        if (!queryValue) {
            setDropdownAnchor(null);
            return;
        }
        const syncPosition = () => updateDropdownAnchor(activePlayer);
        syncPosition();
        const onFrame = () => syncPosition();
        const frame = window.requestAnimationFrame(onFrame);
        window.addEventListener('resize', syncPosition);
        window.addEventListener('scroll', syncPosition, true);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', syncPosition);
            window.removeEventListener('scroll', syncPosition, true);
        };
    }, [activeInputPlayer, searchQuery, updateDropdownAnchor]);

    useEffect(() => {
        if (reviewScreenshots.length === 0) return;
        setSelectedScreenshotIdx((current) => clampSelectedScreenshotIndex(current, reviewScreenshots.length));
    }, [reviewScreenshots.length]);

    useEffect(() => {
        if (reviewScreenshots.length === 0) return;
        announce(`Viewing screenshot ${selectedScreenshotIdx + 1} of ${reviewScreenshots.length}.`, 'polite');
    }, [announce, reviewScreenshots.length, selectedScreenshotIdx]);
    const storedNameConfidenceByKey = useMemo(() => {
        const next = new Map<string, number>();
        const raw = (pendingMatchData as { ocrDebug?: { nameConfidence?: unknown } } | null | undefined)?.ocrDebug?.nameConfidence;
        if (!raw || typeof raw !== 'object') return next;
        Object.entries(raw as Record<string, unknown>).forEach(([name, confidence]) => {
            const key = normalizeConfidenceKey(name);
            const normalizedConfidence = normalizeConfidence(confidence);
            if (!key || normalizedConfidence === null) return;
            next.set(key, normalizedConfidence);
        });
        return next;
    }, [pendingMatchData]);
    // Collect all detected players from the editable team draft.
    const detectedPlayers = useMemo(() => {
        const players: DetectedPlayer[] = [];
        if (teamDraft.length === 0) return players;

        teamDraft.forEach((team) => {
            team.players.forEach((name) => {
                const detectedConfidence = storedNameConfidenceByKey.get(normalizeConfidenceKey(name));
                const displayName = ignored.has(name)
                    ? name
                    : (previewCorrections[name] || name);
                players.push({
                    name,
                    rawName: name,
                    displayName,
                    teamColor: team.color,
                    teamName: team.teamName,
                    shipType: team.shipType || sessionShipTypes?.[team.color] || sessionShipTypes?.[name],
                    confidence: detectedConfidence ?? null,
                });
            });
        });
        return players;
    }, [ignored, previewCorrections, sessionShipTypes, storedNameConfidenceByKey, teamDraft]);
    const rerunProgress = useOcrProgress(isRerunningOcr);
    const rerunProgressPercent = rerunProgress ? Math.round(rerunProgress.fraction * 100) : 0;
    // Archived pilots keep their registry entry so history still resolves, but they
    // must not attract fresh OCR reads/roster-picker suggestions toward someone
    // unseen for months.
    const activeRosterNames = useMemo(
        () => selectActiveRosterNames(pilotRegistry, rosterEntryMeta),
        [pilotRegistry, rosterEntryMeta]
    );
    const { fuzzyMatchByPlayer, rosterExactKeys } = useMemo(() => {
        const matcher = createRosterFuzzyMatcher(activeRosterNames, {
            bundledSeedNames: BUNDLED_OCR_LEXICON,
            normalizeKey: normalizeNameKey,
        });
        const next: Record<string, string> = {};
        previewTeamDraft.forEach((team) => {
            (team.players || []).forEach((rawName) => {
                const cleaned = normalizeSubmittedName(rawName);
                const key = normalizeNameKey(cleaned);
                if (!cleaned || !key) return;
                const result = matcher.resolve(cleaned);
                if (result) next[key] = result.match;
            });
        });
        // Hand the board the matcher's own roster keys so the "Roster" badge and
        // the fuzzy suggestion agree on what counts as a roster hit.
        return { fuzzyMatchByPlayer: next, rosterExactKeys: matcher.rosterExactKeys };
    }, [activeRosterNames, previewTeamDraft]);
    const inferredFriendlyTeamIndex = useMemo(() => {
        if (teamDraft.length === 0) return -1;
        const activeUserKey = normalizeNameKey(activeUser || '');
        if (activeUserKey) {
            const directMatchIndex = teamDraft.findIndex((team) => (
                team.players.some((player) => normalizeNameKey(player) === activeUserKey)
            ));
            if (directMatchIndex >= 0) return directMatchIndex;
        }
        const teammateKeys = new Set(
            (selectedTeammates || [])
                .map((name) => normalizeNameKey(name))
                .filter(Boolean)
        );
        if (teammateKeys.size === 0) return -1;
        let bestIndex = -1;
        let bestScore = 0;
        teamDraft.forEach((team, index) => {
            const score = team.players.reduce((sum, player) => (
                teammateKeys.has(normalizeNameKey(player)) ? sum + 1 : sum
            ), 0);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });
        return bestScore > 0 ? bestIndex : -1;
    }, [activeUser, selectedTeammates, teamDraft]);
    const displayFriendlyTeamIndex = useMemo(() => {
        if (teamDraft.length === 0) return -1;
        return inferredFriendlyTeamIndex >= 0 ? inferredFriendlyTeamIndex : 0;
    }, [inferredFriendlyTeamIndex, teamDraft.length]);
    const friendlyPlayerKeys = useMemo(() => {
        if (displayFriendlyTeamIndex < 0) return new Set<string>();
        return new Set(
            (previewTeamDraft[displayFriendlyTeamIndex]?.players || [])
                .map((name) => normalizeNameKey(name))
                .filter(Boolean)
        );
    }, [displayFriendlyTeamIndex, previewTeamDraft]);

    // Filter pilot registry for autocomplete
    const getFilteredRegistry = (playerName: string) => (
        filterRosterByQuery(pilotRegistry, searchQuery[playerName] || '', 10)
    );

    const handleCorrection = (ocrName: string, correctedName: string) => {
        const normalizedCorrected = normalizeSubmittedName(correctedName);
        if (!normalizedCorrected) return;
        setCorrections(prev => ({ ...prev, [ocrName]: normalizedCorrected }));
        setSearchQuery(prev => ({ ...prev, [ocrName]: normalizedCorrected }));
    };

    const commitTypedCorrection = (ocrName: string, rawValue: string) => {
        const normalized = normalizeSubmittedName(rawValue);
        if (!normalized) return;
        handleCorrection(ocrName, normalized);
    };

    const handleIgnore = (name: string, announceChange = true) => {
        setIgnored(prev => new Set([...prev, name]));
        setCorrections(prev => {
            const { [name]: _, ...rest } = prev;
            return rest;
        });
        if (announceChange) {
            announce(`Ignored ${name} for this review.`, 'polite');
        }
    };

    const handleUnignore = (name: string) => {
        setIgnored(prev => {
            const next = new Set(prev);
            next.delete(name);
            return next;
        });
        announce(`${name} restored to review queue.`, 'polite');
    };

    const handleAcceptNewPlayer = (name: string) => {
        if (!pilotRegistry.includes(name)) {
            addToRegistry(name, { origin: 'ocr', status: 'confirmed' });
            Logger.info('OcrCorrection', `Added new player to registry: ${name}`);
        }
        handleCorrection(name, name);
        announce(`Accepted ${name} as a new player.`, 'polite');
    };

    const handleAddRosterPlayer = useCallback((name: string) => {
        const normalized = normalizeOcrName(name || '');
        if (!normalized) return;
        addToRegistry(normalized, { origin: 'ocr', status: 'confirmed' });
        const pendingPruneIds = getRosterCandidatePruneIdsForAcceptedName({
            pendingReviews,
            acceptedName: normalized,
        });
        if (pendingPruneIds.length > 0) {
            removePendingReviews(pendingPruneIds);
        }
    }, [addToRegistry, pendingReviews, removePendingReviews]);

    const addModifierToDraft = (rawValue: string) => {
        const normalized = normalizeModifierName(rawValue);
        if (!normalized) return;
        setModifierDraft((prev) => dedupeModifierNames([...prev, normalized]));
        setModifierInput('');
    };

    const removeModifierFromDraft = (name: string) => {
        const targetKey = normalizeModifierKey(name);
        setModifierDraft((prev) => prev.filter((entry) => normalizeModifierKey(entry) !== targetKey));
    };

    const buildAutoAcceptCorrectionOverrides = (threshold: number): Record<string, string> => {
        const eligible = getHighConfidenceBatchEligible(detectedPlayers, corrections, ignored, threshold);
        if (eligible.length === 0) return {};

        return eligible.reduce<Record<string, string>>((nextCorrections, player) => {
            const priorCorrection = ocrCorrections?.[player.name];
            const correctedName = normalizeSubmittedName(priorCorrection?.correctedTo || player.name);
            if (!correctedName) return nextCorrections;
            nextCorrections[player.name] = correctedName;
            return nextCorrections;
        }, {});
    };

    const handleSubmitCorrections = (options?: SubmitCorrectionsOptions): boolean => {
        const closeAfterApply = options?.closeAfterApply ?? false;
        const notify = options?.notify ?? true;
        const invokeOnAcceptAll = options?.invokeOnAcceptAll ?? closeAfterApply;
        const autoAcceptOverrides = options?.autoAcceptHighConfidence
            ? buildAutoAcceptCorrectionOverrides(ocrBatchAcceptThreshold)
            : {};
        const correctionOverrides = {
            ...autoAcceptOverrides,
            ...(options?.correctionOverrides || {}),
        };
        let corrected = 0;
        let added = 0;
        const correctionContext = embedded ? 'matchstats' : 'lobby';
        const confidenceByName = new Map(detectedPlayers.map(player => [player.name, Number(player.confidence || 0)]));
        const calibrationMode = normalizeOcrCalibrationMode(ocrMode);
        const registryKeys = new Set(
            (pilotRegistry || [])
                .map((pilot) => normalizeNameKey(pilot))
                .filter(Boolean)
        );
        const effectiveCorrections: Record<string, string> = { ...corrections, ...correctionOverrides };
        Object.entries(searchQuery).forEach(([ocrName, queryValue]) => {
            const normalized = normalizeSubmittedName(queryValue);
            if (!normalized) return;
            effectiveCorrections[ocrName] = normalized;
        });

        Object.entries(effectiveCorrections).forEach(([ocrName, correctedName]) => {
            if (ignored.has(ocrName)) return;
            const normalizedOcrName = String(ocrName || '').trim().toLowerCase();
            const normalizedCorrectedName = String(correctedName || '').trim().toLowerCase();
            const correctedKey = normalizeNameKey(correctedName);

            if (correctedKey && !registryKeys.has(correctedKey)) {
                addToRegistry(correctedName, { origin: 'ocr', status: 'confirmed' });
                registryKeys.add(correctedKey);
            }

            recordCalibrationSample?.({
                predictedConfidence: confidenceByName.get(ocrName) ?? 0,
                wasCorrect: normalizedOcrName.length > 0 && normalizedOcrName === normalizedCorrectedName,
                ocrMode: calibrationMode,
                fieldType: 'player',
                timestamp: Date.now(),
            });

            if (ocrName !== correctedName) {
                // Record correction for future matching
                recordOcrAliasCorrection?.(ocrName, correctedName, {
                    source: 'review_modal',
                    context: correctionContext,
                    confidenceWeight: 1,
                });
                recordOcrCorrection?.(ocrName, correctedName);
                setPlayerName(ocrName, correctedName);
                corrected++;
                Logger.info('OcrCorrection', `Linked "${ocrName}" -> "${correctedName}"`);
            } else {
                // Accept as-is (already in registry from handleAcceptNewPlayer)
                added++;
            }
        });
        const pendingPruneIds = new Set<string>();
        Object.entries(effectiveCorrections).forEach(([ocrName, correctedName]) => {
            if (ignored.has(ocrName)) return;
            const rawName = normalizeSubmittedName(ocrName);
            const canonicalTargetKey = normalizeNameKey(correctedName);
            if (!rawName || !canonicalTargetKey) return;
            getRosterCandidatePruneIds({
                pendingReviews,
                rawName,
                canonicalTargetKey,
            }).forEach((reviewId) => pendingPruneIds.add(reviewId));
        });
        if (pendingPruneIds.size > 0) {
            removePendingReviews(Array.from(pendingPruneIds));
        }

        Logger.info('OcrCorrection', `Corrections applied: ${corrected} linked, ${added} accepted as-is, ${ignored.size} ignored`);

        const resolvedTeams = teamDraft
            .map((team) => {
                const normalizedPlayers = sanitizePlayerNames(
                    team.players
                        .map((rawName) => {
                            const correctedName = ignored.has(rawName)
                                ? rawName
                                : (effectiveCorrections[rawName] || rawName);
                            return String(correctedName || '').trim();
                        })
                        .filter(Boolean)
                );
                return {
                    ...team,
                    players: normalizedPlayers,
                    shipType: String(team.shipType || '').trim(),
                };
            })
            .filter((team) => team.players.length > 0);

        const nextSessionTeams: Record<string, string[]> = {};
        const nextShipTypes: Record<string, string> = {};
        const usedTeamKeys = new Set<string>();

        resolvedTeams.forEach((team, index) => {
            let teamKey = String(team.key || '').trim();
            if (!teamKey) {
                teamKey = team.teamName
                    ? `${team.color}: ${team.teamName}`
                    : `${team.color || 'unknown'} Team ${index + 1}`;
            }
            while (usedTeamKeys.has(teamKey)) {
                teamKey = `${teamKey} (${index + 1})`;
            }
            usedTeamKeys.add(teamKey);
            nextSessionTeams[teamKey] = [...team.players];

            if (!team.shipType) return;
            const colorKey = String(team.color || '').trim().toLowerCase();
            if (colorKey) {
                nextShipTypes[colorKey] = team.shipType;
            }
            nextShipTypes[teamKey] = team.shipType;
            team.players.forEach((playerName) => {
                if (!playerName) return;
                nextShipTypes[playerName] = team.shipType;
            });
        });
        const baselineByKey = new Map(
            (initialTeamDraftRef.current || []).map((team, index) => [
                String(team.key || `${index}`),
                team,
            ])
        );
        resolvedTeams.forEach((team, index) => {
            const baselineTeam = baselineByKey.get(String(team.key || `${index}`))
                || initialTeamDraftRef.current[index];
            if (!baselineTeam) return;
            const previousName = normalizeSubmittedName(String(baselineTeam.teamName || `Team ${index + 1}`));
            const nextName = normalizeSubmittedName(String(team.teamName || `Team ${index + 1}`));
            const previousColor = normalizeSubmittedName(String(baselineTeam.color || 'unknown')).toLowerCase() || 'unknown';
            const nextColor = normalizeSubmittedName(String(team.color || 'unknown')).toLowerCase() || 'unknown';
            if (previousName === nextName && previousColor === nextColor) return;
            recordTeamIdentityCorrection?.(previousName, nextName, {
                rawColor: previousColor,
                correctedColor: nextColor,
                context: correctionContext,
                source: 'review_modal',
            });
        });

        const nextReachModifiers = dedupeModifierNames(modifierDraft);
        const nextHazardDebug = toHazardDebugValues(nextReachModifiers);
        const nextArtifactSource = extractArtifactSourceFromReachModifiers(nextReachModifiers);

        setSessionTeams(nextSessionTeams);
        setSessionShipTypes(nextShipTypes, 'manual');
        setSelectedReachModifiers(nextReachModifiers, 'manual');

        const activeUserKey = normalizeNameKey(activeUser || '');
        let friendlyTeamIndex = resolvedTeams.findIndex((team) => (
            team.players.some((player) => normalizeNameKey(player) === activeUserKey)
        ));
        if (friendlyTeamIndex < 0) {
            const teammateKeys = new Set(
                (selectedTeammates || [])
                    .map((name) => normalizeNameKey(name))
                    .filter(Boolean)
            );
            if (teammateKeys.size > 0) {
                let bestScore = 0;
                let bestIndex = -1;
                resolvedTeams.forEach((team, index) => {
                    const overlapScore = team.players.reduce((score, player) => (
                        teammateKeys.has(normalizeNameKey(player)) ? score + 1 : score
                    ), 0);
                    if (overlapScore > bestScore) {
                        bestScore = overlapScore;
                        bestIndex = index;
                    }
                });
                if (bestScore > 0) {
                    friendlyTeamIndex = bestIndex;
                }
            }
        }
        if (friendlyTeamIndex < 0 && resolvedTeams.length > 0) {
            friendlyTeamIndex = 0;
        }

        const friendlyPlayers = friendlyTeamIndex >= 0
            ? resolvedTeams[friendlyTeamIndex].players
            : [];
        const nextTeammates = sanitizePlayerNames(
            friendlyPlayers.filter((name) => {
                const key = normalizeNameKey(name);
                if (!key) return false;
                return activeUserKey ? key !== activeUserKey : true;
            })
        );
        const nextOpponents = sanitizePlayerNames(
            resolvedTeams.flatMap((team, index) => (
                index === friendlyTeamIndex ? [] : team.players
            )).filter((name) => {
                const key = normalizeNameKey(name);
                if (!key) return false;
                return activeUserKey ? key !== activeUserKey : true;
            })
        );
        const persistedOpponentTeams = resolvedTeams.flatMap((team, index) => (
            index === friendlyTeamIndex
                ? []
                : [{
                    teamName: team.teamName || '',
                    shipType: team.shipType || '',
                    color: team.color || 'unknown',
                    players: [...(team.players || [])],
                }]
        ));

        setSelectedTeammates(nextTeammates);
        setSelectedOpponents(nextOpponents);
        setPendingMatchData({
            ...(pendingMatchData || {}),
            teammates: nextTeammates,
            opponents: nextOpponents,
            opponentTeams: persistedOpponentTeams,
            reachModifiers: nextReachModifiers,
            artifactSource: nextArtifactSource || '',
            ocrState: closeAfterApply ? 'saved' : 'ready',
            ocrReviewedAt: Date.now(),
            ocrDebug: {
                ...((pendingMatchData && pendingMatchData.ocrDebug) || {}),
                hazards: nextHazardDebug,
                nameConfidence: remapOcrNameConfidenceMap(
                    pendingMatchData?.ocrDebug?.nameConfidence,
                    effectiveCorrections
                ),
            },
        });

        if (notify) {
            announce(`Applied ${corrected + added} correction decisions.`, 'polite');
            setToast({
                message: closeAfterApply
                    ? `OCR review applied: ${corrected + added} player decisions saved.`
                    : `OCR review applied: ${corrected + added} player decisions ready to save.`,
                type: 'success',
            });
        }
        if (closeAfterApply && invokeOnAcceptAll) {
            queueMicrotask(() => {
                onAcceptAll();
            });
        }
        return true;
    };

    const applyBatchAccept = (threshold: number): Record<string, string> => {
        const nextCorrections = buildAutoAcceptCorrectionOverrides(threshold);
        const appliedEntries = Object.entries(nextCorrections);
        if (appliedEntries.length === 0) return {};

        setCorrections((prev) => ({ ...prev, ...nextCorrections }));
        setSearchQuery((prev) => ({ ...prev, ...nextCorrections }));
        announce(`Auto-filled ${appliedEntries.length} high-confidence players.`, 'polite');
        Logger.info('OcrBatch', `Batch accepted ${appliedEntries.length} players at ${threshold}% threshold`);
        return nextCorrections;
    };

    const applyBatchIgnore = (threshold: number) => {
        const eligible = getLowConfidenceBatchEligible(detectedPlayers, corrections, ignored, threshold);
        if (eligible.length === 0) return;

        eligible.forEach((player) => {
            handleIgnore(player.name, false);
        });
        announce(`Ignored ${eligible.length} low-confidence players.`, 'polite');
        Logger.info('OcrBatch', `Batch ignored ${eligible.length} players below ${threshold}% threshold`);
    };

    const handleAcceptAllHigh = () => {
        applyBatchAccept(ocrBatchAcceptThreshold);
    };

    const handleIgnoreNext = () => {
        const nextUnresolved = detectedPlayers.find((player) => (
            !ignored.has(player.name) &&
            !corrections[player.name]
        ));
        if (!nextUnresolved) return;
        handleIgnore(nextUnresolved.name);
    };

    const highEligibleCount = getHighConfidenceBatchEligible(detectedPlayers, corrections, ignored, ocrBatchAcceptThreshold).length;
    const lowEligibleCount = getLowConfidenceBatchEligible(detectedPlayers, corrections, ignored, ocrBatchAcceptThreshold).length;
    const confirmTitle = pendingBatchAction === 'accept' ? 'Batch Accept Players' : 'Batch Ignore Players';
    const confirmMessage = pendingBatchAction === 'accept'
        ? `Accept all players with ${ocrBatchAcceptThreshold}%+ confidence?`
        : `Ignore all players with confidence below ${ocrBatchAcceptThreshold}%?`;
    const confirmCount = pendingBatchAction === 'accept' ? highEligibleCount : lowEligibleCount;
    const batchThresholdProgress = Math.round(
        ((ocrBatchAcceptThreshold - OCR_BATCH_THRESHOLD_MIN) / (OCR_BATCH_THRESHOLD_MAX - OCR_BATCH_THRESHOLD_MIN)) * 100
    );
    const batchThresholdSliderStyle = {
        '--ocr-threshold-progress': `${batchThresholdProgress}%`,
    } as React.CSSProperties;

    const handleConfirmBatchAction = () => {
        if (pendingBatchAction === 'accept') {
            applyBatchAccept(ocrBatchAcceptThreshold);
        } else if (pendingBatchAction === 'ignore') {
            applyBatchIgnore(ocrBatchAcceptThreshold);
        }
        setPendingBatchAction(null);
    };

    const dismissHelpBanner = () => {
        setIsHelpBannerDismissed(true);
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(OCR_REVIEW_HELP_DISMISSED_STORAGE_KEY, '1');
            }
        } catch {
            // Ignore localStorage failures so review flow remains functional.
        }
    };

    const handleDiscardReview = () => {
        const pendingSnapshot = initialPendingDraftRef.current;
        setPendingMatchData(clonePendingMatchDraft(pendingSnapshot));
        const sessionShipSnapshot = { ...(initialSessionShipTypesRef.current || {}) };
        if (serializeShipTypeMap(sessionShipSnapshot) !== serializeShipTypeMap(sessionShipTypes)) {
            setSessionShipTypes(sessionShipSnapshot, 'manual');
        }
        announce('Discarded OCR review changes.', 'polite');
        onClose();
    };
    const handleSaveAndClose = () => {
        handleSubmitCorrections({
            closeAfterApply: true,
            autoAcceptHighConfidence: autoAcceptOnSaveAndApply,
        });
    };
    const handleCommitDraft = (): boolean => handleSubmitCorrections({
        closeAfterApply: false,
        notify: false,
        invokeOnAcceptAll: false,
    });
    const embeddedDiscardActionRef = useRef<() => void>(() => {});
    const embeddedSaveActionRef = useRef<() => void>(() => {});
    const embeddedCommitDraftActionRef = useRef<() => boolean>(() => false);
    embeddedDiscardActionRef.current = handleDiscardReview;
    embeddedSaveActionRef.current = handleSaveAndClose;
    embeddedCommitDraftActionRef.current = handleCommitDraft;

    useEffect(() => {
        if (!embedded || !onEmbeddedFooterActionsChange) return;
        onEmbeddedFooterActionsChange({
            discard: () => embeddedDiscardActionRef.current(),
            saveAndClose: () => embeddedSaveActionRef.current(),
            commitDraft: () => embeddedCommitDraftActionRef.current(),
        });
        return () => {
            onEmbeddedFooterActionsChange(null);
        };
    }, [embedded, onEmbeddedFooterActionsChange]);

    const updateTeamShip = (teamIndex: number, shipType: string) => {
        setTeamDraft((prev) => prev.map((team, index) => (
            index === teamIndex ? { ...team, shipType } : team
        )));
    };

    const updateTeamName = (teamIndex: number, teamName: string) => {
        setTeamDraft((prev) => prev.map((team, index) => (
            index === teamIndex ? { ...team, teamName } : team
        )));
    };

    const updateTeamColor = (teamIndex: number, color: string) => {
        setTeamDraft((prev) => prev.map((team, index) => (
            index === teamIndex ? { ...team, color } : team
        )));
    };

    const updateTeamPlayerName = (teamIndex: number, playerIndex: number, nextName: string) => {
        setTeamDraft((prev) => prev.map((team, index) => {
            if (index !== teamIndex) return team;
            const nextPlayers = [...team.players];
            nextPlayers[playerIndex] = nextName;
            return { ...team, players: nextPlayers };
        }));
    };

    const addTeamPlayer = (teamIndex: number, playerName: string) => {
        const normalizedPlayer = normalizeSubmittedName(playerName);
        if (!normalizedPlayer) return;
        setTeamDraft((prev) => prev.map((team, index) => {
            if (index !== teamIndex) return team;
            const nextPlayers = sanitizePlayerNames([...(team.players || []), normalizedPlayer]);
            return { ...team, players: nextPlayers };
        }));
    };

    const removeTeamPlayer = (teamIndex: number, playerIndex: number) => {
        const removedName = teamDraft[teamIndex]?.players[playerIndex] || '';
        setTeamDraft((prev) => prev.map((team, index) => {
            if (index !== teamIndex) return team;
            return {
                ...team,
                players: team.players.filter((_, idx) => idx !== playerIndex),
            };
        }));
        if (removedName) {
            announce(`Removed ${removedName} from team assignment.`, 'polite');
        }
    };

    const moveTeamPlayer = useCallback((
        fromTeamIndex: number,
        fromPlayerIndex: number,
        toTeamIndex: number,
        toPlayerIndex?: number | null
    ) => {
        const moveResult = tryMoveOpponentPlayerBetweenTeams(teamDraft, {
            fromTeamIndex,
            fromPlayerIndex,
            toTeamIndex,
            toPlayerIndex,
            preventDuplicateNames: true,
            normalizeName: (value) => normalizeNameKey(String(value || '')),
        });
        if (moveResult.reason === 'duplicate') {
            const duplicateName = moveResult.movedPlayer || 'Player';
            const targetTeamName = teamDraft[toTeamIndex]?.teamName || `Team ${toTeamIndex + 1}`;
            announce(`${duplicateName} is already in ${targetTeamName}.`, 'assertive');
            setToast({ message: `${duplicateName} already exists in ${targetTeamName}.`, type: 'warning' });
            return;
        }
        if (moveResult.reason !== 'moved') return;
        const movedName = teamDraft[fromTeamIndex]?.players[fromPlayerIndex] || '';
        const targetTeamName = teamDraft[toTeamIndex]?.teamName || teamDraft[toTeamIndex]?.color || `Team ${toTeamIndex + 1}`;
        setTeamDraft(moveResult.teams);
        if (movedName) {
            announce(`Moved ${movedName} to ${targetTeamName}.`, 'polite');
        }
    }, [teamDraft, announce, setToast]);

    const shortcutsEnabled = isOpen && isActive && pendingBatchAction === null && activeInputPlayer === null;
    useKeyboardShortcuts([
        { key: 'Enter', ctrl: true, handler: () => handleSubmitCorrections() },
        {
            key: 'Escape',
            handler: () => onClose()
        },
        { key: 'a', ctrl: true, handler: () => handleAcceptAllHigh() },
        { key: 'i', ctrl: true, handler: () => handleIgnoreNext() },
    ], shortcutsEnabled);

    if (!isOpen) return null;

    const getConfidenceBg = (conf: number) => {
        if (conf >= 80) return 'bg-success-soft border-success-soft';
        if (conf >= 40) return 'bg-warning-soft border-warning-soft';
        return 'bg-danger-soft border-danger-soft';
    };

    return (
        <>
            <div
                className={embedded
                    ? `${isActive ? 'w-full flex flex-col' : 'hidden'}`
                    : 'fixed inset-0 md3-dialog-scrim z-top-second flex items-start justify-center p-4 overflow-y-auto animate-fade-in'}
                onClick={embedded ? undefined : onClose}
            >
                <div
                    ref={focusTrapRef}
                    role="dialog"
                    aria-modal="true"
                    aria-hidden={embedded && !isActive ? 'true' : undefined}
                    aria-labelledby={dialogTitleId}
                    aria-describedby={isHelpBannerDismissed ? undefined : dialogDescriptionId}
                    className={embedded
                        ? 'ocr-correction-dialog ocr-correction-dialog--embedded w-full flex flex-col'
                        : 'ocr-correction-dialog md3-dialog rounded-modal w-full max-w-7xl h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] my-2 flex flex-col animate-scale-in overflow-hidden'}
                    onClick={e => e.stopPropagation()}
                >
                    {embedded ? (
                        <h2 id={dialogTitleId} className="sr-only">OCR Review</h2>
                    ) : (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="min-w-0">
                                    <h2 id={dialogTitleId} className="text-body font-bold truncate">OCR Review</h2>
                                    <p className="text-label-xs text-md-sys-on-surface/62 truncate">
                                        Review player names, team grouping, and ship assignment.
                                    </p>
                                </div>
                                <span className="md3-chip text-label-xs font-mono shrink-0">
                                    {detectedPlayers.length} detected
                                </span>
                            </div>
                            <button onClick={onClose} className="md3-icon-btn" title="Close" aria-label="Close OCR correction dialog">
                                <X size={18} />
                            </button>
                        </div>
                    )}

                    <div
                        ref={scrollBodyRef}
                        className={embedded
                            ? 'ocr-correction-body md3-dialog-content'
                            : 'ocr-correction-body flex-1 min-h-0 overflow-y-auto custom-scrollbar md3-dialog-content overscroll-contain'}
                        tabIndex={0}
                    >
                        {!isHelpBannerDismissed && (
                            <div className="md3-banner md3-banner--info ocr-correction-help-banner">
                                <Info size={16} className="mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-body font-medium">How this helps</p>
                                    <p id={dialogDescriptionId} className="text-label-sm opacity-60 mt-0.5">
                                        Pick the real player name for each OCR guess, then use <span className="font-semibold">Apply</span> or <span className="font-semibold">Save and Close</span>.
                                    </p>
                                    <p className="text-label-sm opacity-60 mt-0.5">
                                        These links are remembered, so OCR gets better in future matches.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={dismissHelpBanner}
                                    className="md3-icon-btn ml-2 flex-shrink-0"
                                    aria-label="Dismiss help banner"
                                    title="Dismiss help"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        <div className="md3-card p-4 md:p-5 mb-4 border border-md-sys-outline/20 ocr-correction-batch-card space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-label-xs font-black uppercase tracking-[0.18em] text-md-sys-primary/80">
                                    Batch Operations
                                </div>
                                {embedded && onRequestRerunOcr && (
                                    <div className="flex flex-col items-end gap-1.5">
                                        <button
                                            type="button"
                                            onClick={onRequestRerunOcr}
                                            disabled={rerunOcrDisabled}
                                            className="rounded-2xl border border-md-sys-outline/15 bg-md-sys-surface-container-high px-3.5 py-2 text-label-sm font-bold text-md-sys-on-surface inline-flex items-center justify-center gap-2 transition-colors hover:bg-md-sys-surface-container-highest disabled:opacity-disabled disabled:hover:bg-md-sys-surface-container-high"
                                            title="Re-run OCR across bundled screenshot artifacts"
                                        >
                                            <RefreshCw size={14} className={isRerunningOcr ? 'animate-spin' : ''} />
                                            {isRerunningOcr ? 'Re-running...' : 'Re-run OCR'}
                                        </button>
                                        {isRerunningOcr && (
                                            rerunProgress ? (
                                                <div
                                                    className="mt-0.5"
                                                    role="progressbar"
                                                    aria-valuemin={0}
                                                    aria-valuemax={100}
                                                    aria-valuenow={rerunProgressPercent}
                                                    aria-label="OCR re-run progress"
                                                >
                                                    <div className="h-1 w-full overflow-hidden rounded-pill bg-md-sys-on-surface/[0.08]">
                                                        <div
                                                            className="h-full rounded-pill bg-md-sys-primary transition-[width] duration-200"
                                                            style={{ width: `${rerunProgressPercent}%` }}
                                                        />
                                                    </div>
                                                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-semibold tabular-nums text-md-sys-on-surface/56">
                                                        <span className="truncate">{getOcrStageLabel(rerunProgress.stage)}</span>
                                                        <span className="shrink-0">
                                                            {rerunProgress.imageCount > 1
                                                                ? `${rerunProgress.imageIndex + 1}/${rerunProgress.imageCount} · ${rerunProgressPercent}%`
                                                                : `${rerunProgressPercent}%`}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                // No events yet (or a non-Electron runtime) — fall back to
                                                // the indeterminate bar rather than showing a stalled 0%.
                                                <div className="wg-indeterminate-bar mt-0.5" aria-hidden="true" />
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="ocr-batch-threshold-surface rounded-3xl border border-md-sys-primary/10 bg-md-sys-surface-container-low p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-label-xs font-bold uppercase tracking-[0.16em] text-md-sys-on-surface/54">
                                            Auto-Accept Threshold
                                        </div>
                                        <div className="mt-1 text-label-sm text-md-sys-on-surface/64">
                                            Players at or above this confidence are treated as strong matches.
                                        </div>
                                    </div>
                                    <div className="ocr-batch-threshold-current shrink-0 rounded-2xl border border-md-sys-primary/16 bg-md-sys-surface-container-high px-3 py-2 text-right">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-md-sys-on-surface/48">
                                            Current
                                        </div>
                                        <div className="text-lg font-black tabular-nums text-md-sys-primary">
                                            {ocrBatchAcceptThreshold}%
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setOcrBatchAcceptThreshold(Math.max(OCR_BATCH_THRESHOLD_MIN, ocrBatchAcceptThreshold - OCR_BATCH_THRESHOLD_STEP))}
                                        className="h-9 w-9 shrink-0 rounded-2xl border border-md-sys-outline/14 bg-md-sys-surface-container-high text-md-sys-on-surface inline-flex items-center justify-center transition-colors hover:bg-md-sys-surface-container-highest"
                                        aria-label="Lower batch confidence threshold"
                                        title="Lower threshold"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <div className="flex-1 relative">
                                        <input
                                            type="range"
                                            min={OCR_BATCH_THRESHOLD_MIN}
                                            max={OCR_BATCH_THRESHOLD_MAX}
                                            step={OCR_BATCH_THRESHOLD_STEP}
                                            value={ocrBatchAcceptThreshold}
                                            onChange={(event) => setOcrBatchAcceptThreshold(Number(event.target.value))}
                                            className="ocr-threshold-slider w-full h-8 cursor-pointer touch-manipulation"
                                            aria-label="Batch confidence threshold"
                                            style={batchThresholdSliderStyle}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setOcrBatchAcceptThreshold(Math.min(OCR_BATCH_THRESHOLD_MAX, ocrBatchAcceptThreshold + OCR_BATCH_THRESHOLD_STEP))}
                                        className="h-9 w-9 shrink-0 rounded-2xl border border-md-sys-outline/14 bg-md-sys-surface-container-high text-md-sys-on-surface inline-flex items-center justify-center transition-colors hover:bg-md-sys-surface-container-highest"
                                        aria-label="Raise batch confidence threshold"
                                        title="Raise threshold"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-md-sys-on-surface/42">
                                    <span>{OCR_BATCH_THRESHOLD_MIN}% balanced</span>
                                    <span>{OCR_BATCH_THRESHOLD_MAX}% exact only</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ocr-correction-batch-actions">
                                <button
                                    type="button"
                                    onClick={() => setPendingBatchAction('accept')}
                                    disabled={highEligibleCount === 0}
                                    className="ocr-batch-action-btn ocr-batch-action-btn--accept rounded-2xl border border-success/18 bg-success-soft px-4 py-3 text-success disabled:opacity-disabled flex flex-col items-center gap-0.5 transition-colors hover:border-success/28"
                                >
                                    <span className="text-label-sm font-bold">Accept {highEligibleCount}</span>
                                    <span className="text-[10px] opacity-70 font-medium">At or above {ocrBatchAcceptThreshold}% confidence</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPendingBatchAction('ignore')}
                                    disabled={lowEligibleCount === 0}
                                    className="ocr-batch-action-btn ocr-batch-action-btn--ignore rounded-2xl border border-warning/18 bg-warning-soft px-4 py-3 text-warning disabled:opacity-disabled flex flex-col items-center gap-0.5 transition-colors hover:border-warning/28"
                                >
                                    <span className="text-label-sm font-bold">Ignore {lowEligibleCount}</span>
                                    <span className="text-[10px] opacity-70 font-medium">Below {ocrBatchAcceptThreshold}% confidence</span>
                                </button>
                            </div>
                        </div>

                        {teamDraft.length > 0 && (
                            <section className="md3-card p-4 md:p-5 mb-4 border border-md-sys-outline/20 ocr-team-assignment-shell">
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <span className="text-label-sm font-bold uppercase opacity-60 flex items-center gap-1">
                                        <Users size={14} />
                                        Team Assignment
                                    </span>
                                    <span className="text-label-sm opacity-60">
                                        Drag players between cards, then apply to learn.
                                    </span>
                                </div>
                                <OcrTeamAssignmentBoard
                                    teams={previewTeamDraft}
                                    shipOptions={SHIPS}
                                    pilotRegistry={pilotRegistry}
                                    rosterExactKeys={rosterExactKeys}
                                    rosterNames={activeRosterNames}
                                    friendlyTeamIndex={displayFriendlyTeamIndex}
                                    friendlyFixedPlayer={activeUserDisplayKey ? {
                                        canonicalName: activeUser || String(pendingMatchData?.player || '').trim() || 'You',
                                        label: 'YOU',
                                        tone: 'success',
                                    } : null}
                                    compact={embedded}
                                    allowColorEdit={true}
                                    fuzzyMatches={fuzzyMatchByPlayer}
                                    onTeamNameChange={updateTeamName}
                                    onTeamColorChange={updateTeamColor}
                                    onTeamShipChange={updateTeamShip}
                                    onPlayerChange={updateTeamPlayerName}
                                    onPlayerRemove={removeTeamPlayer}
                                    onPlayerAdd={addTeamPlayer}
                                    onPlayerMove={moveTeamPlayer}
                                    onAddToRoster={handleAddRosterPlayer}
                                    onAddAlias={onAddAlias}
                                    dataTestId="ocr-team-assignment-board"
                                />
                            </section>
                        )}

                        <section className="md3-card p-4 md:p-5 mb-4 border border-md-sys-outline/20">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-label-sm font-bold uppercase opacity-60">
                                    Reach Hazards &amp; Modifiers
                                </span>
                                <span className="text-label-xs text-md-sys-on-surface/45">
                                    Review before apply
                                </span>
                            </div>
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="text"
                                        list={modifierSuggestionsId}
                                        value={modifierInput}
                                        onChange={(event) => setModifierInput(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter') return;
                                            event.preventDefault();
                                            addModifierToDraft(modifierInput);
                                        }}
                                        placeholder="Add reach modifier..."
                                        aria-label="Add reach modifier"
                                        className="md3-textfield md3-textfield--outlined flex-1 px-3 py-2 bg-md-sys-surface-container-highest"
                                    />
                                    <datalist id={modifierSuggestionsId}>
                                        {modifierSuggestions.map((modifier) => (
                                            <option key={modifier} value={modifier} />
                                        ))}
                                    </datalist>
                                    <button
                                        type="button"
                                        onClick={() => addModifierToDraft(modifierInput)}
                                        className="md3-btn-tonal whitespace-nowrap"
                                    >
                                        Add Modifier
                                    </button>
                                </div>
                                {modifierDraft.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {modifierDraft.map((modifier) => (
                                            <span
                                                key={modifier}
                                                className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-2 py-0.5 text-label-sm font-semibold"
                                            >
                                                <span>{modifier}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeModifierFromDraft(modifier)}
                                                    className="inline-flex items-center justify-center rounded-full hover:bg-success/15"
                                                    aria-label={`Remove modifier ${modifier}`}
                                                    title={`Remove ${modifier}`}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-label-sm text-md-sys-on-surface/55">
                                        No reach hazards or modifiers added yet.
                                    </p>
                                )}
                            </div>
                        </section>

                        {/* Player List */}
                        <div className="space-y-5">
                            {reviewScreenshots.length > 0 && (
                                <section
                                    ref={evidenceSectionRef}
                                    className="md3-card border border-md-sys-outline/15 bg-md-sys-surface/98 p-3 md:p-4"
                                >
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-1 text-label-sm font-bold uppercase opacity-60">
                                            <ImageIcon size={14} />
                                            Evidence
                                        </span>
                                        <span className="text-label-sm opacity-60">{reviewScreenshots.length} image(s)</span>
                                    </div>
                                    <WorkspaceImageViewer
                                        images={reviewScreenshots}
                                        activeIndex={selectedScreenshotIdx}
                                        onActiveIndexChange={setSelectedScreenshotIdx}
                                        title="Screenshot Evidence"
                                        subtitle="Click to zoom, drag to pan while zoomed, and use thumbnails to switch."
                                        stageClassName="min-h-[340px] md:min-h-[460px]"
                                        imageAltPrefix="Reference screenshot"
                                        autoFocus={false}
                                    />
                                </section>
                            )}

                            {detectedPlayers.length === 0 ? (
                                <div className="text-center opacity-60 py-8">
                                    <p className="text-body font-medium">No players detected</p>
                                    <p className="text-label-sm mt-1">
                                        Capture a Crew Hub or Tactical Map screenshot first, then return here to review.
                                    </p>
                                </div>
                            ) : (
                                detectedPlayers.map((player, idx) => {
                                    const isIgnored = ignored.has(player.rawName);
                                    const hasCorrected = previewCorrections[player.rawName];
                                    const priorCorrection = ocrCorrections?.[player.rawName];
                                    const conf = normalizeConfidence(player.confidence);
                                    const playerSources = resolvePlayerSources(player.rawName);
                                    const primaryPlayerSource = playerSources[0] || null;
                                    const sourceScreenshotIndex = primaryPlayerSource && primaryPlayerSource.imageIndex >= 0
                                        ? primaryPlayerSource.imageIndex
                                        : -1;
                                    const sourceLabel = sourceScreenshotIndex >= 0
                                        ? `Screenshot #${sourceScreenshotIndex + 1}`
                                        : (primaryPlayerSource?.imagePath?.split(/[\\/]/).pop() || '');
                                    const filteredRegistry = getFilteredRegistry(player.rawName);
                                    const isFriendlyDetectedPlayer = friendlyPlayerKeys.has(normalizeNameKey(player.displayName));
                                    const learningCount = Math.max(1, Number(priorCorrection?.count || 1));
                                    const learningTooltip = getLearningMetadata(ocrAliasModel, player.rawName)
                                        || `Learned from ${learningCount} correction${learningCount === 1 ? '' : 's'}`;
                                    const inputValue = Object.prototype.hasOwnProperty.call(searchQuery, player.rawName)
                                        ? (searchQuery[player.rawName] || '')
                                        : (previewCorrections[player.rawName] || priorCorrection?.correctedTo || player.rawName);
                                    const showPortalDropdown = (
                                        activeInputPlayer === player.rawName
                                        && String(searchQuery[player.rawName] || '').trim().length > 0
                                        && !!dropdownAnchor
                                        && typeof document !== 'undefined'
                                    );

                                    return (
                                        <div
                                            key={`${player.rawName}-${idx}`}
                                            className={`ocr-detected-player-card md3-card p-3 rounded-card border transition-all ${isIgnored
                                                ? 'bg-md-sys-on-surface/5 border-md-sys-outline-variant/30 opacity-50'
                                                : hasCorrected
                                                    ? 'bg-success-soft border-success-soft'
                                                    : conf === null
                                                        ? 'bg-md-sys-surface-container border-md-sys-outline/20'
                                                        : getConfidenceBg(conf)
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                {/* Player Info */}
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    {/* Team Color Badge */}
                                                    <div
                                                        className="w-3 h-8 rounded-full flex-shrink-0"
                                                        style={{
                                                            backgroundColor: player.teamColor.toLowerCase() === 'unknown'
                                                                ? 'var(--md-sys-color-outline-variant)'
                                                                : player.teamColor.toLowerCase()
                                                        }}
                                                    />

                                                    {/* Name & Details */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold truncate">{toDisplayPlayerName(player.displayName)}</span>
                                                            {isFriendlyDetectedPlayer && (
                                                                <span className="ocr-teammate-chip ocr-teammate-chip--compact" title="Friendly teammate">
                                                                    <Shield size={10} />
                                                                    Teammate
                                                                </span>
                                                            )}
                                                            {priorCorrection && (
                                                                <span
                                                                    className="text-label-sm bg-info-soft text-info px-1.5 py-0.5 rounded"
                                                                    title={learningTooltip}
                                                                >
                                                                    Learned ({learningCount}x)
                                                                </span>
                                                            )}
                                                        </div>
                                                        {conf === null ? (
                                                            <div className="mt-1 text-label-xs uppercase tracking-[0.14em] text-md-sys-on-surface/45">
                                                                No direct OCR confidence
                                                            </div>
                                                        ) : (
                                                            <div className="mt-1 max-w-220px">
                                                                <ConfidenceMeter confidence={conf} size="sm" />
                                                            </div>
                                                        )}
                                                        {player.shipType && (
                                                            <div className="text-label-sm opacity-60 mt-0.5">
                                                                Ship: {player.shipType}
                                                            </div>
                                                        )}
                                                        {primaryPlayerSource && sourceLabel && (
                                                            <div className="text-label-sm opacity-60 mt-0.5">
                                                                Source: {sourceLabel}{playerSources.length > 1 ? ` (+${playerSources.length - 1} more)` : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                {isIgnored ? (
                                                    <button
                                                        onClick={() => handleUnignore(player.name)}
                                                        className="md3-btn-text text-label-sm"
                                                    >
                                                        Undo Ignore
                                                    </button>
                                                ) : (
                                                    <div className="ocr-detected-player-actions flex items-center gap-2">
                                                        {primaryPlayerSource && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (sourceScreenshotIndex >= 0) {
                                                                        setSelectedScreenshotIdx(sourceScreenshotIndex);
                                                                        evidenceSectionRef.current?.scrollIntoView({ block: 'nearest' });
                                                                    }
                                                                }}
                                                                disabled={sourceScreenshotIndex < 0}
                                                                className="md3-btn-text text-label-sm whitespace-nowrap disabled:opacity-50"
                                                                title={sourceLabel || 'View source screenshot'}
                                                            >
                                                                View source
                                                            </button>
                                                        )}
                                                        {/* Correction Dropdown */}
                                                        <div className={`relative ${activeInputPlayer === player.name ? 'z-30' : ''}`}>
                                                            <div className="ocr-roster-search-field md3-textfield md3-textfield--outlined flex items-center gap-1 px-2 py-1 bg-md-sys-surface-container-highest">
                                                                <Search size={12} className="opacity-60" />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Search roster or type name..."
                                                                    ref={(node) => {
                                                                        inputRefs.current[player.rawName] = node;
                                                                    }}
                                                                    value={inputValue}
                                                                    onFocus={() => {
                                                                        setActiveInputPlayer(player.rawName);
                                                                        if (!Object.prototype.hasOwnProperty.call(searchQuery, player.rawName)) {
                                                                            setSearchQuery(prev => ({ ...prev, [player.rawName]: inputValue }));
                                                                        }
                                                                        window.requestAnimationFrame(() => updateDropdownAnchor(player.rawName));
                                                                    }}
                                                                    onBlur={() => {
                                                                        setActiveInputPlayer((current) => (current === player.rawName ? null : current));
                                                                        commitTypedCorrection(player.rawName, searchQuery[player.rawName] || inputValue);
                                                                    }}
                                                                    onChange={e => {
                                                                        setSearchQuery(prev => ({ ...prev, [player.rawName]: e.target.value }));
                                                                        window.requestAnimationFrame(() => updateDropdownAnchor(player.rawName));
                                                                    }}
                                                                    onKeyDown={(event) => {
                                                                        if (event.key === 'Enter') {
                                                                            event.preventDefault();
                                                                            commitTypedCorrection(player.rawName, searchQuery[player.rawName] || inputValue);
                                                                        }
                                                                        event.stopPropagation();
                                                                    }}
                                                                    className="ocr-roster-search-input bg-transparent text-body w-60 min-w-0 outline-none caret-current"
                                                                />
                                                            </div>
                                                        </div>
                                                        {showPortalDropdown && createPortal(
                                                            <div
                                                                className="ocr-roster-dropdown md3-card rounded-lg shadow-xl overflow-y-auto custom-scrollbar overscroll-contain border border-md-sys-outline/20 bg-md-sys-surface-container-highest p-0"
                                                                onWheel={(event) => event.stopPropagation()}
                                                                style={{
                                                                    position: 'fixed',
                                                                    top: dropdownAnchor.top,
                                                                    left: dropdownAnchor.left,
                                                                    width: dropdownAnchor.width,
                                                                    maxHeight: dropdownAnchor.maxHeight,
                                                                    zIndex: 1200,
                                                                    transform: dropdownAnchor.placeAbove ? 'translateY(-100%)' : undefined,
                                                                }}
                                                            >
                                                                {filteredRegistry.map((p) => (
                                                                    <button
                                                                        key={p}
                                                                        onMouseDown={(event) => event.preventDefault()}
                                                                        onClick={() => handleCorrection(player.rawName, p)}
                                                                        className="ocr-roster-dropdown-item w-full text-left px-3 py-1.5 text-body text-md-sys-on-surface hover:bg-md-sys-on-surface/10 truncate"
                                                                    >
                                                                        {p}
                                                                    </button>
                                                                ))}
                                                                {filteredRegistry.length === 0 && (
                                                                    <div className="ocr-roster-dropdown-empty px-3 py-2 text-label-sm text-md-sys-on-surface/70">
                                                                        No matching pilots found. Use "+ New" to add this name.
                                                                    </div>
                                                                )}
                                                            </div>,
                                                            document.body
                                                        )}

                                                        {/* Accept as New */}
                                                        {!pilotRegistry.includes(player.rawName) && !hasCorrected && (
                                                            <button
                                                                onClick={() => handleAcceptNewPlayer(player.rawName)}
                                                                className="md3-btn-text text-label-sm text-success whitespace-nowrap"
                                                            >
                                                                + New
                                                            </button>
                                                        )}

                                                        {/* Ignore */}
                                                        <button
                                                            onClick={() => handleIgnore(player.rawName)}
                                                            className="md3-btn-text text-label-sm text-danger"
                                                        >
                                                            Ignore
                                                        </button>

                                                        {/* Checkmark if corrected */}
                                                        {hasCorrected && (
                                                            <Check size={16} className="text-success" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Show correction target */}
                                            {hasCorrected && hasCorrected !== player.rawName && (
                                                <div className="mt-2 text-label-sm text-success flex items-center gap-1">
                                                    <span className="opacity-60">Linked to:</span>
                                                    <span className="font-semibold">{hasCorrected}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* All-resolved hint */}
                        {detectedPlayers.length > 0 &&
                            detectedPlayers.every((p) => previewCorrections[p.rawName] || ignored.has(p.rawName)) && (
                                <div className="px-3 py-2 text-center text-label-sm text-success font-medium">
                                    All players reviewed. Apply changes when ready.
                                </div>
                            )}

                        <div className="px-3 py-2 text-label-sm border-t border-md-sys-outline/15 bg-md-sys-surface-container-low text-md-sys-on-surface/80 flex items-center flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded bg-md-sys-surface3 border border-md-sys-outline/20 font-mono text-label-xs">Ctrl+Enter</kbd>
                                Save
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded bg-md-sys-surface3 border border-md-sys-outline/20 font-mono text-label-xs">Esc</kbd>
                                Close
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded bg-md-sys-surface3 border border-md-sys-outline/20 font-mono text-label-xs">Ctrl+A</kbd>
                                Auto-fill
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded bg-md-sys-surface3 border border-md-sys-outline/20 font-mono text-label-xs">Ctrl+I</kbd>
                                Ignore Next
                            </span>
                        </div>
                    </div>

                    {/* Footer */}
                    {!hideFooterActions && (
                        <div className="md3-dialog-actions w-full justify-between">
                            <button onClick={onClose} className="md3-btn-text">
                                {embedded ? 'Back' : 'Close'}
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDiscardReview}
                                    className="md3-btn-tonal inline-flex items-center gap-1.5 text-danger"
                                    title="Discard all OCR review edits and close"
                                >
                                    <Trash2 size={14} />
                                    Discard
                                </button>
                                <button
                                    onClick={handleSaveAndClose}
                                    className="md3-btn-filled flex items-center gap-2"
                                    title="Save reviewed OCR corrections and close this review"
                                >
                                    <Check size={16} />
                                    {embedded ? 'Save and Apply' : 'Save and Close'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <BatchActionConfirmDialog
                isOpen={pendingBatchAction !== null}
                title={confirmTitle}
                message={confirmMessage}
                affectedCount={confirmCount}
                onConfirm={handleConfirmBatchAction}
                onCancel={() => setPendingBatchAction(null)}
                confirmLabel={pendingBatchAction === 'accept' ? 'Accept Players' : 'Ignore Players'}
            />
        </>
    );
};



