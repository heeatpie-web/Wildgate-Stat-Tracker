import { useEffect, useRef, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { HERO_GUIDS, SHIP_GUIDS, WEAPON_GUIDS, EQUIPMENT_GUIDS } from '../utils/guids';
import { SHIPS, CHARACTERS, UNNAMED_PLAYER_PREFIX, Match, Loadout } from '../types';
import { processTelemetryEvent, TelemetryActions, TelemetryContext } from '../utils/telemetryProcessor';
import Logger from '../utils/logger';
import { getElectronAPI } from '../utils/electronAPI';

const ipcRenderer = getElectronAPI();

/**
 * useLogMonitor - Monitors external game log files for telemetry events.
 * Updates the global telemetryStatus to feed into the SystemPulse consolidated indicator.
 */
export const useLogMonitor = (activeUser?: string) => {
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

    const [logFeed, setLogFeed] = useState<any[]>([]);

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
    useEffect(() => { isMatchInProgressRef.current = isMatchInProgress; }, [isMatchInProgress]);
    useEffect(() => { currentLoadoutRef.current = currentLoadout; }, [currentLoadout]);
    useEffect(() => { activeHeroRef.current = activeHero; }, [activeHero]);
    useEffect(() => { activeShipRef.current = activeShip; }, [activeShip]);
    useEffect(() => { activeUserRef.current = activeUser; }, [activeUser]);
    useEffect(() => { devModeRef.current = devMode; }, [devMode]);
    useEffect(() => { sessionStartTimeRef.current = sessionStartTime; }, [sessionStartTime]);
    useEffect(() => () => clearTelemetryDraftCapturePromptTimer(), []);

    useEffect(() => {
        if (!ipcRenderer) return;
        if (enableAutoLogRecording) {
            ipcRenderer.send('start-log-monitoring', { performanceProfile: telemetryPerformanceProfile });
        } else {
            ipcRenderer.send('stop-log-monitoring');
        }
    }, [enableAutoLogRecording, telemetryPerformanceProfile]);

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

        const onStatus = (status: any) => setTelemetryStatus(status);
        const onLogData = (data: any) => {
            if (data) {
                const now = Date.now();
                if (now - lastActivityRef.current > 5000) {
                    lastActivityRef.current = now;
                    setLastActivity(now);
                }
                let events: any[] = [];
                if (data.telemetry && Array.isArray(data.telemetry)) events = data.telemetry;
                else if (Array.isArray(data)) events = data;
                else if (data.EventName) events = [data]; // Single event wrapper

                if (events.length === 0) return;
                setLogFeed(prev => [...events.slice(0, 10), ...prev].slice(0, 50));
                setTelemetryStatus({ lastEventAt: now });

                events.forEach(e => {
                    const name = e.EventName;
                    const payload = e.Payload?.event || e.Payload?.Event || e.Payload || e.payload?.event || e.payload || e.event || {};
                    const gameTime = e.ClientTimestamp ? e.ClientTimestamp * 1000 : Date.now();
                    const wasMatchInProgress = isMatchInProgressRef.current;
                    const currentMatchSessionId = e.context?.matchSessionId || e.Payload?.context?.matchSessionId || '';
                    const previousMatchSessionId = lastMatchSessionIdRef.current || '';
                    const loadingMapName = typeof payload.loadedMap === 'string'
                        ? payload.loadedMap
                        : (typeof payload.loadingMap === 'string' ? payload.loadingMap : '');
                    const mapStartSignal = name === 'NebLoadingScreen' && !!loadingMapName && !loadingMapName.includes('Frontend');
                    const mapEndSignal = name === 'NebLoadingScreen' && loadingMapName.includes('Frontend');
                    const sessionStartSignal = !!currentMatchSessionId && !previousMatchSessionId;
                    const sessionEndSignal = !currentMatchSessionId && !!previousMatchSessionId;
                    if (!telemetryDraftMatchIdRef.current && ((mapStartSignal && !wasMatchInProgress) || (sessionStartSignal && !wasMatchInProgress))) {
                        createTelemetryDraftIfNeeded(gameTime);
                    }
                    const isRelevantToSession = gameTime >= (sessionStartTimeRef.current - 60000);
                    const ageSeconds = Math.floor((Date.now() - gameTime) / 1000);
                    const payloadKeys = Object.keys(payload).join(',');
                    Logger.debug('LogMonitor', `EVENT: ${name} | Age: ${ageSeconds}s | Keys: ${payloadKeys}`);
                    const potentialId = payload.accountId || payload.userId || payload.playerId || payload.player_id;
                    const potentialName = payload.displayName || payload.playerName || payload.name || payload.playerNameString || payload.callsign;

                    if (potentialId) {
                        if (potentialName && typeof potentialName === 'string' && potentialName.length > 0) {
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
                    const localId = e.context?.client?.accountId;
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
                        payload.callsign,
                    );
                    const localIds = collectIds(
                        localId,
                        e.Payload?.context?.client?.accountId,
                        e.payload?.context?.client?.accountId,
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
                    let loadout: any = payload.loadout || payload.Loadout || payload.loadOut || payload.LoadOut ||
                        payload.characterLoadout || payload.character_loadout || payload.playerLoadout || payload.player_loadout ||
                        payload.currentLoadout || payload.current_loadout || payload.loadoutData;
                    if (Array.isArray(loadout)) loadout = loadout[0];
                    if (loadout?.loadout) loadout = loadout.loadout;
                    if (loadout?.Loadout) loadout = loadout.Loadout;
                    if (!loadout || typeof loadout !== 'object') {
                        const loadoutSignals = new Set([
                            'guidhero', 'heroguid', 'hero', 'heroname',
                            'guidship', 'shipguid', 'ship', 'shipname',
                            'guidweaponprimary', 'guidweaponsecondary', 'weaponprimary', 'weaponnameprimary',
                            'guidequipmentprimary', 'guidequipmentsecondary', 'equipmentprimary', 'equipmentnameprimary',
                        ]);
                        const payloadKeysLower = Object.keys(payload || {}).map((k) => k.toLowerCase());
                        const hasSignals = payloadKeysLower.some((k) => loadoutSignals.has(k));
                        if (hasSignals) {
                            loadout = payload;
                        }
                    }
                    if (loadout && shouldApplyLoadout) {
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
                        const getLoadoutField = (obj: Record<string, any>, keys: string[]) => {
                            for (const key of keys) {
                                if (obj[key] != null) return obj[key];
                            }
                            for (const [k, v] of Object.entries(obj)) {
                                if (keys.includes(k.toLowerCase())) return v;
                            }
                            return undefined;
                        };

                        const rawHeroGuid = getLoadoutField(loadout, ['guidhero', 'heroguid', 'guid_hero', 'heroid', 'hero_id']);
                        const rawHero = getLoadoutField(loadout, ['hero', 'heroname', 'hero_name']);
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

                        const rawShipGuid = getLoadoutField(loadout, ['guidship', 'shipguid', 'guid_ship']);
                        const rawShipId = getLoadoutField(loadout, ['shipid', 'ship_id']);
                        const rawShip = getLoadoutField(loadout, ['ship', 'shipname', 'ship_name']);
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
                        const extractByKeys = (obj: Record<string, any>, keys: string[]): string[] => {
                            const out: string[] = [];
                            for (const key of keys) {
                                const val = getLoadoutField(obj, [key]);
                                if (val == null) continue;
                                if (Array.isArray(val)) {
                                    for (const item of val) {
                                        if (item != null) out.push(String(item));
                                    }
                                } else {
                                    out.push(String(val));
                                }
                            }
                            return out.filter(Boolean);
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
                        const weaponGuidCandidates = extractByKeys(loadout, [
                            'guidWeaponPrimary', 'guidWeaponSecondary', 'guidWeaponTertiary',
                            'weaponGuidPrimary', 'weaponGuidSecondary', 'weaponGuidTertiary',
                            'primaryWeaponGuid', 'secondaryWeaponGuid', 'tertiaryWeaponGuid',
                            'weapon_guid_primary', 'weapon_guid_secondary', 'weapon_guid_tertiary',
                            'guid_weapon_primary', 'guid_weapon_secondary', 'guid_weapon_tertiary',
                            'weapons', 'weaponGuids', 'weaponIds', 'weaponSlots',
                        ]);
                        const equipmentGuidCandidates = extractByKeys(loadout, [
                            'guidEquipmentPrimary', 'guidEquipmentSecondary', 'guidEquipmentTertiary',
                            'equipmentGuidPrimary', 'equipmentGuidSecondary', 'equipmentGuidTertiary',
                            'primaryEquipmentGuid', 'secondaryEquipmentGuid', 'tertiaryEquipmentGuid',
                            'equipment_guid_primary', 'equipment_guid_secondary', 'equipment_guid_tertiary',
                            'guid_equipment_primary', 'guid_equipment_secondary', 'guid_equipment_tertiary',
                            'equipment', 'equipmentGuids', 'equipmentIds', 'equipmentSlots',
                        ]);
                        const weaponNameCandidates = extractByKeys(loadout, [
                            'weaponPrimary', 'weaponSecondary', 'weaponTertiary',
                            'primaryWeapon', 'secondaryWeapon', 'tertiaryWeapon',
                            'weaponNamePrimary', 'weaponNameSecondary', 'weaponNameTertiary',
                            'weapon_name_primary', 'weapon_name_secondary', 'weapon_name_tertiary',
                            'weaponNames', 'weaponDisplayNames', 'loadoutWeapons',
                        ]);
                        const equipmentNameCandidates = extractByKeys(loadout, [
                            'equipmentPrimary', 'equipmentSecondary', 'equipmentTertiary',
                            'primaryEquipment', 'secondaryEquipment', 'tertiaryEquipment',
                            'equipmentNamePrimary', 'equipmentNameSecondary', 'equipmentNameTertiary',
                            'equipment_name_primary', 'equipment_name_secondary', 'equipment_name_tertiary',
                            'equipmentNames', 'equipmentDisplayNames', 'loadoutEquipment',
                        ]);
                        const resolvedWeapons = Array.from(new Set([
                            ...weaponGuidCandidates.map((g) => resolveGuid(g, WEAPON_GUIDS, 'Weapon')).filter(Boolean) as string[],
                            ...weaponNameCandidates.map((n) => fuzzyMatchList(n, Object.values(WEAPON_GUIDS))).filter(Boolean) as string[],
                        ]));
                        const resolvedEquipment = Array.from(new Set([
                            ...equipmentGuidCandidates.map((g) => resolveGuid(g, EQUIPMENT_GUIDS, 'Equipment')).filter(Boolean) as string[],
                            ...equipmentNameCandidates.map((n) => fuzzyMatchList(n, Object.values(EQUIPMENT_GUIDS))).filter(Boolean) as string[],
                        ]));
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
                                : (currentLoadoutRef.current?.equipment || [])
                        };
                        setCurrentLoadout(nextLoadout);
                        if (nextLoadout.weapons.length > 0) {
                            const weaponSet: Record<string, number> = {};
                            nextLoadout.weapons.forEach((w) => { weaponSet[w] = 1; });
                            setActiveWeapons(weaponSet);
                        }
                        if (!telemetryDraftMatchIdRef.current && isMatchInProgressRef.current) {
                            createTelemetryDraftIfNeeded(gameTime, nextLoadout);
                        }
                        updateTelemetryDraftFromLoadout(nextLoadout, gameTime);
                    } else if (loadout && !shouldApplyLoadout) {
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
                        isMatchInProgress: isMatchInProgressRef.current,
                        playerIdMap: playerIdMapRef.current,
                        pilotRegistry: pilotRegistryRef.current,
                        lastMatchSessionId: lastMatchSessionIdRef.current
                    };
                    if (isRelevantToSession || devModeRef.current) {
                        processTelemetryEvent(e, actions, context);
                    } else {
                        Logger.debug('LogMonitor', `Skipping old event: ${name} (age: ${ageSeconds}s, before session start)`);
                    }
                    if ((mapEndSignal && wasMatchInProgress) || (sessionEndSignal && wasMatchInProgress)) {
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
