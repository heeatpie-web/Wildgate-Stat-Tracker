import { useEffect, useRef, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { HERO_GUIDS, SHIP_GUIDS, WEAPON_GUIDS, EQUIPMENT_GUIDS } from '../utils/guids';
import { SHIPS, CHARACTERS, UNNAMED_PLAYER_PREFIX, Match, Loadout } from '../types';
import { EQUIPMENT_DB } from '../utils/equipmentDb';
import { processTelemetryEvent, TelemetryActions, TelemetryContext } from '../utils/telemetryProcessor';
import Logger from '../utils/logger';
import { getElectronAPI } from '../utils/electronAPI';

const ipcRenderer = getElectronAPI();
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

const SHIP_WEAPON_NAMES = EQUIPMENT_DB
    .filter((item) => item.type === 'Weapon')
    .map((item) => item.name)
    .filter(Boolean);
const CHARACTER_WEAPON_NAMES = EQUIPMENT_DB
    .filter((item) => item.type === 'CharacterWeapon')
    .map((item) => item.name)
    .filter(Boolean);
const SHIP_EQUIPMENT_NAMES = EQUIPMENT_DB
    .filter((item) => item.type === 'Utility' || item.type === 'System')
    .map((item) => item.name)
    .filter(Boolean);
const CHARACTER_EQUIPMENT_NAMES = EQUIPMENT_DB
    .filter((item) => item.type === 'CharacterEquipment')
    .map((item) => item.name)
    .filter(Boolean);
const SHIP_WEAPON_SET = new Set(SHIP_WEAPON_NAMES);
const CHARACTER_WEAPON_SET = new Set(CHARACTER_WEAPON_NAMES);
const SHIP_EQUIPMENT_SET = new Set([...SHIP_EQUIPMENT_NAMES, ...Object.values(EQUIPMENT_GUIDS)]);
const CHARACTER_EQUIPMENT_SET = new Set(CHARACTER_EQUIPMENT_NAMES);

const TELEMETRY_ANY_WEAPON_NAMES = Array.from(new Set([
    ...Object.values(WEAPON_GUIDS),
    ...SHIP_WEAPON_NAMES,
    ...CHARACTER_WEAPON_NAMES,
]));

const TELEMETRY_ANY_EQUIPMENT_NAMES = Array.from(new Set([
    ...Object.values(EQUIPMENT_GUIDS),
    ...SHIP_EQUIPMENT_NAMES,
    ...CHARACTER_EQUIPMENT_NAMES,
]));

/**
 * useLogMonitor - Monitors external game log files for telemetry events.
 * Updates the global telemetryStatus to feed into the SystemPulse consolidated indicator.
 */
export const useLogMonitor = (activeUser?: string) => {
    const isStoreLoading = useAppStore(s => s.isLoading);
    const telemetryPerformanceProfile = useAppStore(s => s.telemetryPerformanceProfile);
    const {
        addMatch, updateMatch,
        playerIdMap, updatePlayerIdMapping,
        pilotRegistry, addToRegistry,
        activeHero, setActiveHero,
        activeShip, setActiveShip,
        activeWeapons, setActiveWeapons,
        matchStartTime, setMatchStartTime,
        isMatchInProgress, setIsMatchInProgress,
        setTimeMin, setTimeSec,
        setLastActivity,
        setSelectedTeammates,
        setCurrentLoadout,
        currentLoadout,
        sessionStartTime
    } = useGameData();

    const {
        activeMode, setActiveMode,
        setToast,
        setOverlayPhase,
        enableAutoLogRecording,
        setShowWizard,
        devMode, setTelemetryStatus, telemetryStatus
    } = useUIState();

    const { playStart, playEnd } = useSoundEffects();
    const wasMatchInProgressRef = useRef(false);

    const [logFeed, setLogFeed] = useState<TelemetryEventEnvelope[]>([]);

    const prevKillCount = useRef(0);
    const currentSquadIds = useRef<string[]>([]);
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
    const devModeRef = useRef(devMode);
    const lastMatchSessionIdRef = useRef<string>('');
    const telemetryDraftMatchIdRef = useRef<number | null>(null);
    const telemetryDraftStartedAtRef = useRef<number | null>(null);
    const telemetryDraftLoadoutSignatureRef = useRef<string>('');
    const telemetryDraftCapturePromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const telemetryLifecycleActiveRef = useRef(isMatchInProgress);

    const clearTelemetryDraftCapturePromptTimer = () => {
        if (telemetryDraftCapturePromptTimerRef.current) {
            clearTimeout(telemetryDraftCapturePromptTimerRef.current);
            telemetryDraftCapturePromptTimerRef.current = null;
        }
    };

    const scheduleTelemetryDraftCapturePrompt = (matchId: number) => {
        clearTelemetryDraftCapturePromptTimer();
        telemetryDraftCapturePromptTimerRef.current = setTimeout(() => {
            if (telemetryDraftMatchIdRef.current !== matchId) return;
            if (!isMatchInProgressRef.current) return;
            window.dispatchEvent(new CustomEvent('telemetry:draft-capture-prompt', {
                detail: { matchId },
            }));
            Logger.info('LogMonitor', `Telemetry draft smart-capture prompt fired (matchId=${matchId})`);
        }, 10_000);
    };

    const toClock = (totalSeconds: number) => {
        const safe = Math.max(0, Math.floor(totalSeconds));
        const mm = Math.floor(safe / 60).toString().padStart(2, '0');
        const ss = (safe % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    };

    const makeLoadoutSignature = (loadout: Loadout | null | undefined) => {
        if (!loadout) return '';
        return JSON.stringify({
            hero: loadout.hero || '',
            ship: loadout.ship || '',
            weapons: (loadout.weapons || []).filter(Boolean),
            equipment: (loadout.equipment || []).filter(Boolean),
            characterWeapons: (loadout.characterWeapons || []).filter(Boolean),
            characterEquipment: (loadout.characterEquipment || []).filter(Boolean),
        });
    };

    const buildTelemetryDraft = (matchId: number, gameTime: number, loadout: Loadout | null): Match => ({
        id: matchId,
        timestamp: gameTime,
        date: new Date(gameTime).toLocaleDateString(),
        mode: activeMode,
        player: activeUserRef.current || 'Unknown Player',
        teammates: [],
        opponents: [],
        hero: (loadout?.hero && !String(loadout.hero).startsWith('Unknown')) ? String(loadout.hero) : (activeHeroRef.current || 'Unknown'),
        ship: (loadout?.ship && !String(loadout.ship).startsWith('Unknown')) ? String(loadout.ship) : (activeShipRef.current || 'Unknown'),
        loadout: {
            hero: loadout?.hero || null,
            ship: loadout?.ship || null,
            weapons: (loadout?.weapons || []).filter(Boolean),
            equipment: (loadout?.equipment || []).filter(Boolean),
            characterWeapons: (loadout?.characterWeapons || []).filter(Boolean),
            characterEquipment: (loadout?.characterEquipment || []).filter(Boolean),
        },
        weapons: {},
        reachModifiers: [],
        kills: { 'AI Legion': 0 },
        result: 'Ongoing',
        subType: 'Telemetry Draft',
        time: '00:00',
        damageTaken: 0,
        notes: 'Telemetry draft created automatically. Awaiting result and optional Smart Capture/OCR review.',
        timelineEvents: [],
        artifacts: [],
        ocrState: 'queued',
    });

    const createTelemetryDraftIfNeeded = (gameTime: number, loadout?: Loadout | null) => {
        if (telemetryDraftMatchIdRef.current) return telemetryDraftMatchIdRef.current;
        const matchId = Date.now() + Math.floor(Math.random() * 1000);
        const baselineLoadout = loadout || currentLoadoutRef.current || null;
        const draft = buildTelemetryDraft(matchId, gameTime, baselineLoadout);
        addMatch(draft);
        telemetryDraftMatchIdRef.current = matchId;
        telemetryDraftStartedAtRef.current = gameTime;
        telemetryDraftLoadoutSignatureRef.current = makeLoadoutSignature(draft.loadout);
        setToast({
            message: 'Telemetry draft match created. We will prompt for result or Smart Capture after match end.',
            type: 'info',
        });
        scheduleTelemetryDraftCapturePrompt(matchId);
        Logger.info('LogMonitor', `Telemetry draft created (matchId=${matchId})`);
        return matchId;
    };

    const updateTelemetryDraftFromLoadout = (loadout: Loadout, gameTime: number) => {
        const draftId = telemetryDraftMatchIdRef.current;
        if (!draftId) return;
        const signature = makeLoadoutSignature(loadout);
        if (!signature || signature === telemetryDraftLoadoutSignatureRef.current) return;
        telemetryDraftLoadoutSignatureRef.current = signature;
        const match = useAppStore.getState().matches.find((m: Match) => m.id === draftId);
        if (!match) return;
        updateMatch({
            ...match,
            timestamp: match.timestamp || gameTime,
            hero: loadout.hero && !String(loadout.hero).startsWith('Unknown') ? String(loadout.hero) : match.hero,
            ship: loadout.ship && !String(loadout.ship).startsWith('Unknown') ? String(loadout.ship) : match.ship,
            loadout: {
                hero: loadout.hero || match.loadout?.hero || null,
                ship: loadout.ship || match.loadout?.ship || null,
                weapons: (loadout.weapons || []).filter(Boolean),
                equipment: (loadout.equipment || []).filter(Boolean),
                characterWeapons: (loadout.characterWeapons || []).filter(Boolean),
                characterEquipment: (loadout.characterEquipment || []).filter(Boolean),
            },
        });
    };

    const finalizeTelemetryDraft = (gameTime: number) => {
        const draftId = telemetryDraftMatchIdRef.current;
        if (!draftId) return;
        clearTelemetryDraftCapturePromptTimer();
        const match = useAppStore.getState().matches.find((m: Match) => m.id === draftId);
        const startedAt = telemetryDraftStartedAtRef.current || match?.timestamp || gameTime;
        if (match) {
            const totalSeconds = Math.max(0, Math.floor((gameTime - startedAt) / 1000));
            const duration = toClock(totalSeconds);
            updateMatch({
                ...match,
                timestamp: startedAt,
                time: duration,
                notes: `${match.notes || ''}\nTelemetry detected mission end. Choose result or run Smart Capture.`.trim(),
            });
            window.dispatchEvent(new CustomEvent('telemetry:draft-ready', {
                detail: { matchId: draftId, duration },
            }));
            setToast({
                message: `Telemetry draft ready (${duration}). Choose result or run Smart Capture.`,
                type: 'success',
            });
            Logger.info('LogMonitor', `Telemetry draft finalized (matchId=${draftId}, duration=${duration})`);
        }
        telemetryDraftMatchIdRef.current = null;
        telemetryDraftStartedAtRef.current = null;
        telemetryDraftLoadoutSignatureRef.current = '';
    };

    useEffect(() => { playerIdMapRef.current = playerIdMap; }, [playerIdMap]);
    useEffect(() => { pilotRegistryRef.current = pilotRegistry; }, [pilotRegistry]);
    useEffect(() => { matchStartTimeRef.current = matchStartTime; }, [matchStartTime]);
    useEffect(() => {
        isMatchInProgressRef.current = isMatchInProgress;
        telemetryLifecycleActiveRef.current = isMatchInProgress;
    }, [isMatchInProgress]);
    useEffect(() => { currentLoadoutRef.current = currentLoadout; }, [currentLoadout]);
    useEffect(() => { activeHeroRef.current = activeHero; }, [activeHero]);
    useEffect(() => { activeShipRef.current = activeShip; }, [activeShip]);
    useEffect(() => { activeUserRef.current = activeUser; }, [activeUser]);
    useEffect(() => { devModeRef.current = devMode; }, [devMode]);
    useEffect(() => { sessionStartTimeRef.current = sessionStartTime; }, [sessionStartTime]);
    useEffect(() => () => clearTelemetryDraftCapturePromptTimer(), []);

    useEffect(() => {
        if (!ipcRenderer) return;
        if (isStoreLoading) return;
        if (enableAutoLogRecording) {
            ipcRenderer.send('start-log-monitoring', { performanceProfile: telemetryPerformanceProfile });
        } else {
            ipcRenderer.send('stop-log-monitoring');
        }
    }, [enableAutoLogRecording, telemetryPerformanceProfile, isStoreLoading]);

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
        if (!ipcRenderer) return;

        const onStatus = (status: unknown) => {
            if (!isRecord(status)) return;
            setTelemetryStatus(status as TelemetryStatusPatch);
        };
        const onLogData = (data: unknown) => {
            if (data) {
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
                    const clientTimestamp = Number(e.ClientTimestamp);
                    const gameTime = Number.isFinite(clientTimestamp) ? clientTimestamp * 1000 : Date.now();
                    const eventContext = asRecord(e.context);
                    const payloadContext = asRecord(asRecord(e.Payload).context);
                    const payloadContextAlt = asRecord(asRecord(e.payload).context);
                    const currentMatchSessionId = toStringOrEmpty(
                        eventContext.matchSessionId || payloadContext.matchSessionId || payloadContextAlt.matchSessionId
                    );
                    const previousMatchSessionId = lastMatchSessionIdRef.current || '';
                    const loadingMapName = typeof payload.loadedMap === 'string'
                        ? payload.loadedMap
                        : (typeof payload.loadingMap === 'string' ? payload.loadingMap : '');
                    const mapStartSignal = name === 'NebLoadingScreen' && !!loadingMapName && !loadingMapName.includes('Frontend');
                    const mapEndSignal = name === 'NebLoadingScreen' && loadingMapName.includes('Frontend');
                    const sessionStartSignal = !!currentMatchSessionId && !previousMatchSessionId;
                    const sessionEndSignal = !currentMatchSessionId && !!previousMatchSessionId;
                    const startLifecycleSignal = mapStartSignal || sessionStartSignal;
                    const endLifecycleSignal = mapEndSignal || sessionEndSignal;
                    if (startLifecycleSignal && !telemetryLifecycleActiveRef.current) {
                        telemetryLifecycleActiveRef.current = true;
                    }
                    if (startLifecycleSignal && !telemetryDraftMatchIdRef.current) {
                        createTelemetryDraftIfNeeded(gameTime);
                    }
                    const isRelevantToSession = gameTime >= (sessionStartTimeRef.current - 60000);
                    const ageSeconds = Math.floor((Date.now() - gameTime) / 1000);
                    const payloadKeys = Object.keys(payload).join(',');
                    Logger.debug('LogMonitor', `EVENT: ${name} | Age: ${ageSeconds}s | Keys: ${payloadKeys}`);
                    const potentialId = toStringOrEmpty(payload.accountId || payload.userId || payload.playerId || payload.player_id);
                    const potentialName = payload.displayName || payload.playerName || payload.name || payload.playerNameString || payload.callsign;

                    if (potentialId) {
                        if (potentialName && typeof potentialName === 'string' && potentialName.length > 0) {
                            const setPlayerName = useAppStore.getState().setPlayerName;
                            setPlayerName(potentialId, potentialName);
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
                        asRecord(payloadContext.client).accountId ||
                        asRecord(payloadContextAlt.client).accountId
                    );
                    if (localId && activeUserRef.current && !playerIdMapRef.current[localId]) {
                        updatePlayerIdMapping(localId, activeUserRef.current);
                    }
                    const normalizeName = (value: unknown) => String(value || '').trim().toLowerCase();
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
                    const actorIds = collectIds(
                        payload.accountId,
                        payload.account_id,
                        payload.userId,
                        payload.user_id,
                        payload.playerId,
                        payload.player_id,
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
                        asRecord(payloadContextAlt.client).accountId,
                    );
                    const localNames = collectNames(
                        activeUserRef.current,
                        ...localIds.map((id) => playerIdMapRef.current[id]),
                    );
                    let shouldApplyLoadout = true;
                    if (localIds.length > 0 && actorIds.length > 0) {
                        shouldApplyLoadout = actorIds.some((id) => localIds.includes(id));
                    } else if (localNames.length > 0 && actorNames.length > 0) {
                        shouldApplyLoadout = actorNames.some((name) => localNames.includes(name));
                    } else if (actorIds.length > 0 && localNames.length > 0) {
                        shouldApplyLoadout = actorIds.some((id) => {
                            const mapped = normalizeName(playerIdMapRef.current[id]);
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
                    let loadout: unknown = payload.loadout || payload.Loadout || payload.loadOut || payload.LoadOut ||
                        payload.characterLoadout || payload.character_loadout || payload.playerLoadout || payload.player_loadout ||
                        payload.currentLoadout || payload.current_loadout || payload.loadoutData;
                    if (Array.isArray(loadout)) loadout = loadout[0];
                    if (isRecord(loadout) && loadout.loadout) loadout = loadout.loadout;
                    if (isRecord(loadout) && loadout.Loadout) loadout = loadout.Loadout;
                    if (!isRecord(loadout)) {
                        const loadoutSignals = new Set([
                            'guidhero', 'heroguid', 'hero', 'heroname',
                            'guidship', 'shipguid', 'ship', 'shipname',
                            'guidweaponprimary', 'guidweaponsecondary', 'weaponprimary', 'weaponnameprimary',
                            'guidequipmentprimary', 'guidequipmentsecondary', 'equipmentprimary', 'equipmentnameprimary',
                            'weapontertiary', 'equipmenttertiary',
                            'weapons', 'equipment', 'characterweapons', 'charweapons', 'charactergear', 'characterequipment',
                            'weaponguids', 'equipmentguids',
                            'weaponids', 'equipmentids',
                            'weaponslots', 'equipmentslots',
                            'loadoutweapons', 'loadoutequipment', 'loadoutcharacterweapons', 'loadoutcharacterequipment',
                        ]);
                        const payloadKeysLower = Object.keys(payload || {}).map((k) => k.toLowerCase());
                        const hasSignals = payloadKeysLower.some((k) => loadoutSignals.has(k));
                        if (hasSignals) {
                            loadout = payload;
                        }
                    }
                    if (isRecord(loadout) && shouldApplyLoadout) {
                        const loadoutData = loadout;
                        const { knownMappings, uidMappings, registerUnknownId } = useAppStore.getState();

                        let heroName = '';
                        let shipName = '';
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
                            const afterColon = raw.includes(':') ? (raw.split(':').pop() || '') : raw;
                            return afterColon.replace(/[{}-]/g, '').trim();
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
                            return undefined;
                        };

                        const rawHeroGuid = getLoadoutField(loadoutData, ['guidhero', 'heroguid', 'guid_hero', 'heroid', 'hero_id']);
                        const rawHero = getLoadoutField(loadoutData, ['hero', 'heroname', 'hero_name']);
                        const normalizedHeroGuid = normalizeGuid(rawHeroGuid);
                        const heroGuid = isStableGuid(normalizedHeroGuid) ? normalizedHeroGuid : undefined;
                        const heroRawValue = String(rawHero || '');
                        const heroNameHint = heroRawValue.includes(':')
                            ? (heroRawValue.split(':').pop() || heroRawValue)
                            : heroRawValue;
                        if (heroGuid) {
                            heroName = uidMappings.players[heroGuid] || knownMappings[heroGuid] || HERO_GUIDS[heroGuid];

                            if (!heroName) {
                                if (heroNameHint) {
                                    const matched = fuzzyMatchList(heroNameHint, [...CHARACTERS]);
                                    if (matched) heroName = matched;
                                    else heroName = heroNameHint;
                                }

                                if (!heroName) {
                                    registerUnknownId(heroGuid, 'Hero');
                                    heroName = `Unknown (${heroGuid.substr(0, 4)})`;
                                }
                                Logger.warn('LogMonitor', `Unknown Hero GUID: ${heroGuid} | raw: "${rawHero}" | resolved: "${heroName}"`);
                            }

                            if (heroName && !heroName.startsWith('Unknown') && heroName !== activeHeroRef.current) {
                                setActiveHero(heroName, 'telemetry');
                                Logger.info('LogMonitor', `Auto-selected prospector: ${heroName}`);
                            }
                        } else if (heroNameHint) {
                            const matched = fuzzyMatchList(heroNameHint, [...CHARACTERS]);
                            heroName = matched || heroNameHint;
                            if (heroName && heroName !== activeHeroRef.current) {
                                setActiveHero(heroName, 'telemetry');
                                Logger.info('LogMonitor', `Auto-selected prospector from raw telemetry: ${heroName}`);
                            }
                        }

                        const rawShipGuid = getLoadoutField(loadoutData, ['guidship', 'shipguid', 'guid_ship']);
                        const rawShipId = getLoadoutField(loadoutData, ['shipid', 'ship_id']);
                        const rawShip = getLoadoutField(loadoutData, ['ship', 'shipname', 'ship_name']);
                        const shipRawValue = String(rawShip || '');
                        const shipNameHint = shipRawValue.includes(':')
                            ? (shipRawValue.split(':').pop() || shipRawValue)
                            : shipRawValue;
                        const guidCandidate = normalizeGuid(rawShipGuid || rawShipId);
                        const shipGuid = isStableGuid(guidCandidate) ? guidCandidate : undefined;
                        if (shipGuid) {
                            shipName = uidMappings.ships[shipGuid] || knownMappings[shipGuid] || SHIP_GUIDS[shipGuid];

                            if (!shipName) {
                                if (shipNameHint) {
                                    const matched = fuzzyMatchList(shipNameHint, [...SHIPS]);
                                    if (matched) shipName = matched;
                                    else shipName = shipNameHint;
                                }

                                if (!shipName) {
                                    registerUnknownId(shipGuid, 'Ship');
                                    shipName = `Unknown (${shipGuid.substr(0, 4)})`;
                                }
                                Logger.warn('LogMonitor', `Unknown Ship GUID: ${shipGuid} | raw: "${rawShip}" | resolved: "${shipName}"`);
                            }

                            if (shipName && !shipName.startsWith('Unknown') && shipName !== activeShipRef.current) {
                                setActiveShip(shipName, 'telemetry');
                                Logger.info('LogMonitor', `Auto-selected ship: ${shipName}`);
                            }
                        } else if (shipNameHint) {
                            const matched = fuzzyMatchList(shipNameHint, [...SHIPS]);
                            shipName = matched || '';
                            if (shipName && shipName !== activeShipRef.current) {
                                setActiveShip(shipName, 'telemetry');
                                Logger.info('LogMonitor', `Auto-selected ship from raw telemetry: ${shipName}`);
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
                            const preferredTokens = ['guid', 'id', 'name', 'display', 'weapon', 'equipment', 'item', 'slot'];
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
                        const resolveGuid = (guid: string, db: Record<string, string>, type: 'Weapon' | 'Equipment') => {
                            if (!guid) return null;
                            const clean = normalizeGuid(guid);
                            if (!clean) return null;
                            const domain = type === 'Weapon' ? 'weapons' : 'equipment';
                            const name = uidMappings[domain][clean] || knownMappings[clean] || db[clean];
                            if (!name) {
                                if (isStableGuid(clean)) {
                                    registerUnknownId(clean, type);
                                }
                                return null;
                            }
                            return name;
                        };
                        const weaponGuidCandidates = extractByKeys(loadoutData, [
                            'guidWeaponPrimary', 'guidWeaponSecondary', 'guidWeaponTertiary',
                            'weaponGuidPrimary', 'weaponGuidSecondary', 'weaponGuidTertiary',
                            'guidWeapon1', 'guidWeapon2', 'guidWeapon3',
                            'weaponGuid1', 'weaponGuid2', 'weaponGuid3',
                            'primaryWeaponGuid', 'secondaryWeaponGuid', 'tertiaryWeaponGuid',
                            'weapon_guid_primary', 'weapon_guid_secondary', 'weapon_guid_tertiary',
                            'guid_weapon_primary', 'guid_weapon_secondary', 'guid_weapon_tertiary',
                            'weapons', 'weaponGuids', 'weaponIds', 'weaponSlots', 'weaponSlotData', 'weaponLoadout',
                        ]);
                        const equipmentGuidCandidates = extractByKeys(loadoutData, [
                            'guidEquipmentPrimary', 'guidEquipmentSecondary', 'guidEquipmentTertiary',
                            'equipmentGuidPrimary', 'equipmentGuidSecondary', 'equipmentGuidTertiary',
                            'guidEquipment1', 'guidEquipment2', 'guidEquipment3',
                            'equipmentGuid1', 'equipmentGuid2', 'equipmentGuid3',
                            'primaryEquipmentGuid', 'secondaryEquipmentGuid', 'tertiaryEquipmentGuid',
                            'equipment_guid_primary', 'equipment_guid_secondary', 'equipment_guid_tertiary',
                            'guid_equipment_primary', 'guid_equipment_secondary', 'guid_equipment_tertiary',
                            'equipment', 'equipmentGuids', 'equipmentIds', 'equipmentSlots', 'equipmentSlotData', 'equipmentLoadout',
                        ]);
                        const weaponNameCandidates = extractByKeys(loadoutData, [
                            'weapons', 'weaponSlots', 'weaponSlotData', 'weaponLoadout',
                            'weaponPrimary', 'weaponSecondary', 'weaponTertiary',
                            'weaponOne', 'weaponTwo', 'weaponThree',
                            'primaryWeapon', 'secondaryWeapon', 'tertiaryWeapon',
                            'weaponNamePrimary', 'weaponNameSecondary', 'weaponNameTertiary',
                            'weapon_name_primary', 'weapon_name_secondary', 'weapon_name_tertiary',
                            'weaponNames', 'weaponDisplayNames', 'loadoutWeapons', 'loadoutWeaponNames',
                        ]);
                        const characterWeaponNameCandidates = extractByKeys(loadoutData, [
                            'characterWeapons', 'characterWeapon', 'characterWeaponSlots', 'characterWeaponLoadout',
                            'charWeapons', 'charWeapon', 'charWeaponSlots', 'charWeaponLoadout',
                            'crewWeapons', 'crewWeaponSlots',
                            'loadoutCharacterWeapons', 'loadoutCharWeapons',
                        ]);
                        const equipmentNameCandidates = extractByKeys(loadoutData, [
                            'equipment', 'equipmentSlots', 'equipmentSlotData', 'equipmentLoadout',
                            'equipmentPrimary', 'equipmentSecondary', 'equipmentTertiary',
                            'equipmentOne', 'equipmentTwo', 'equipmentThree',
                            'primaryEquipment', 'secondaryEquipment', 'tertiaryEquipment',
                            'equipmentNamePrimary', 'equipmentNameSecondary', 'equipmentNameTertiary',
                            'equipment_name_primary', 'equipment_name_secondary', 'equipment_name_tertiary',
                            'equipmentNames', 'equipmentDisplayNames', 'loadoutEquipment', 'loadoutEquipmentNames',
                        ]);
                        const characterEquipmentNameCandidates = extractByKeys(loadoutData, [
                            'characterEquipment', 'characterEquipments', 'characterGear', 'characterEquipmentSlots', 'characterEquipmentLoadout',
                            'charEquipment', 'charEquipments', 'charGear', 'charEquipmentSlots', 'charEquipmentLoadout',
                            'crewEquipment', 'crewGear', 'loadoutCharacterEquipment', 'loadoutCharEquipment',
                        ]);

                        const resolvedGuidWeapons = weaponGuidCandidates
                            .map((g) => resolveGuid(g, WEAPON_GUIDS, 'Weapon'))
                            .filter(Boolean) as string[];
                        const resolvedGuidEquipment = equipmentGuidCandidates
                            .map((g) => resolveGuid(g, EQUIPMENT_GUIDS, 'Equipment'))
                            .filter(Boolean) as string[];

                        const matchedWeaponNames = Array.from(new Set([
                            ...weaponNameCandidates,
                            ...characterWeaponNameCandidates,
                        ]
                            .map((n) => fuzzyMatchList(n, TELEMETRY_ANY_WEAPON_NAMES))
                            .filter(Boolean) as string[]));
                        const matchedEquipmentNames = Array.from(new Set([
                            ...equipmentNameCandidates,
                            ...characterEquipmentNameCandidates,
                        ]
                            .map((n) => fuzzyMatchList(n, TELEMETRY_ANY_EQUIPMENT_NAMES))
                            .filter(Boolean) as string[]));

                        const resolvedWeapons = Array.from(new Set([
                            ...resolvedGuidWeapons,
                            ...matchedWeaponNames.filter((name) => SHIP_WEAPON_SET.has(name)),
                        ]));
                        const resolvedCharacterWeapons = Array.from(new Set(
                            matchedWeaponNames.filter((name) => CHARACTER_WEAPON_SET.has(name))
                        ));
                        const resolvedEquipment = Array.from(new Set([
                            ...resolvedGuidEquipment,
                            ...matchedEquipmentNames.filter((name) => SHIP_EQUIPMENT_SET.has(name)),
                        ]));
                        const resolvedCharacterEquipment = Array.from(new Set(
                            matchedEquipmentNames.filter((name) => CHARACTER_EQUIPMENT_SET.has(name))
                        ));
                        const finalHero = (heroName && !heroName.startsWith('Unknown')) ? heroName : currentLoadoutRef.current?.hero;
                        const finalShip = (shipName && !shipName.startsWith('Unknown')) ? shipName : currentLoadoutRef.current?.ship;

                        const nextLoadout: Loadout = {
                            hero: finalHero || heroName || currentLoadoutRef.current?.hero || null,
                            ship: finalShip || shipName || currentLoadoutRef.current?.ship || null,
                            weapons: resolvedWeapons.length > 0
                                ? resolvedWeapons
                                : (currentLoadoutRef.current?.weapons || []),
                            equipment: resolvedEquipment.length > 0
                                ? resolvedEquipment
                                : (currentLoadoutRef.current?.equipment || []),
                            characterWeapons: resolvedCharacterWeapons.length > 0
                                ? resolvedCharacterWeapons
                                : (currentLoadoutRef.current?.characterWeapons || []),
                            characterEquipment: resolvedCharacterEquipment.length > 0
                                ? resolvedCharacterEquipment
                                : (currentLoadoutRef.current?.characterEquipment || []),
                        };
                        const previousLoadoutNames = new Set([
                            ...(currentLoadoutRef.current?.weapons || []),
                            ...(currentLoadoutRef.current?.equipment || []),
                            ...(currentLoadoutRef.current?.characterWeapons || []),
                            ...(currentLoadoutRef.current?.characterEquipment || []),
                        ].filter(Boolean));
                        const nextLoadoutNames = new Set([
                            ...(nextLoadout.weapons || []),
                            ...(nextLoadout.equipment || []),
                            ...(nextLoadout.characterWeapons || []),
                            ...(nextLoadout.characterEquipment || []),
                        ].filter(Boolean));
                        setCurrentLoadout(nextLoadout);
                        if (nextLoadoutNames.size > 0) {
                            const existingWeapons = useAppStore.getState().activeWeapons || {};
                            const nextActiveWeapons: Record<string, number> = { ...existingWeapons };
                            previousLoadoutNames.forEach((name) => {
                                if (nextLoadoutNames.has(name)) return;
                                if ((nextActiveWeapons[name] || 0) <= 1) {
                                    delete nextActiveWeapons[name];
                                }
                            });
                            nextLoadoutNames.forEach((name) => {
                                const existingCount = Number(nextActiveWeapons[name] || 0);
                                nextActiveWeapons[name] = Math.max(1, existingCount);
                            });
                            setActiveWeapons(nextActiveWeapons);
                        }
                        if (!telemetryDraftMatchIdRef.current && telemetryLifecycleActiveRef.current) {
                            createTelemetryDraftIfNeeded(gameTime, nextLoadout);
                        }
                        updateTelemetryDraftFromLoadout(nextLoadout, gameTime);
                    } else if (isRecord(loadout) && !shouldApplyLoadout) {
                        Logger.debug('LogMonitor', `Skipped non-local loadout event: ${name}`);
                    }
                    const actions: TelemetryActions = {
                        setTimeMin, setTimeSec,
                        setIsMatchInProgress,
                        setMatchStartTime,
                        setOverlayPhase,
                        setToast,
                        updatePlayerIdMapping,
                        setShowWizard,
                        setLastMatchSessionId: (id: string) => { lastMatchSessionIdRef.current = id; }
                    };

                    const context: TelemetryContext = {
                        matchStartTime: matchStartTimeRef.current,
                        isMatchInProgress: telemetryLifecycleActiveRef.current,
                        playerIdMap: playerIdMapRef.current,
                        pilotRegistry: pilotRegistryRef.current,
                        lastMatchSessionId: lastMatchSessionIdRef.current
                    };
                    if (isRelevantToSession || devModeRef.current) {
                        processTelemetryEvent(e, actions, context);
                    } else {
                        Logger.debug('LogMonitor', `Skipping old event: ${name} (age: ${ageSeconds}s, before session start)`);
                    }
                    lastMatchSessionIdRef.current = currentMatchSessionId;
                    if (endLifecycleSignal && telemetryLifecycleActiveRef.current) {
                        telemetryLifecycleActiveRef.current = false;
                        finalizeTelemetryDraft(gameTime);
                    }
                });
            }
        };

        const unsubStatus = ipcRenderer.on('log-status', onStatus);
        const unsubData = ipcRenderer.on('log-data', onLogData);
        return () => {
            unsubStatus();
            unsubData();
        };
    }, [updatePlayerIdMapping, setToast, setLastActivity, setTimeMin, setTimeSec, setIsMatchInProgress, setMatchStartTime, setOverlayPhase, setShowWizard, setActiveHero, setActiveShip, setCurrentLoadout, setTelemetryStatus]);

    return { logFeed, logStatus: telemetryStatus };
};
