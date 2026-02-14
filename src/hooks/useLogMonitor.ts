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
        result: 'Draw',
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
            ipcRenderer.send('start-log-monitoring');
        } else {
            ipcRenderer.send('stop-log-monitoring');
        }
    }, [enableAutoLogRecording]);

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
                    let loadout: any = payload.loadout || payload.Loadout || payload.loadOut || payload.LoadOut ||
                        payload.characterLoadout || payload.character_loadout || payload.playerLoadout || payload.player_loadout ||
                        payload.currentLoadout || payload.current_loadout || payload.loadoutData;
                    if (Array.isArray(loadout)) loadout = loadout[0];
                    if (loadout?.loadout) loadout = loadout.loadout;
                    if (loadout?.Loadout) loadout = loadout.Loadout;
                    if (loadout) {
                        const { knownMappings, uidMappings, registerUnknownId } = useAppStore.getState();

                        let heroName = '';
                        let shipName = '';
                        const fuzzyMatchList = (raw: string, list: string[]): string | null => {
                            if (!raw) return null;
                            const lower = raw.toLowerCase();
                            const exact = list.find(item => item.toLowerCase() === lower);
                            if (exact) return exact;
                            const partial = list.find(item => item.toLowerCase().startsWith(lower) || lower.startsWith(item.toLowerCase().split('(')[0].trim()));
                            return partial || null;
                        };

                        const rawHeroGuid = loadout.guidHero || loadout.heroGuid || loadout.guid_hero;
                        const heroGuid = rawHeroGuid ? rawHeroGuid.split(':')[1] || rawHeroGuid : undefined;
                        if (heroGuid) {
                            heroName = knownMappings[heroGuid] || HERO_GUIDS[heroGuid];

                            if (!heroName) {
                                const rawHero = loadout.hero || loadout.heroName || loadout.hero_name;
                                if (rawHero && !rawHero.includes(':')) {
                                    const matched = fuzzyMatchList(rawHero, [...CHARACTERS]);
                                    if (matched) heroName = matched;
                                    else heroName = rawHero;
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
                        }

                        const rawShipGuid = loadout.guidShip || loadout.shipGuid || loadout.guid_ship;
                        const shipGuid = rawShipGuid ? rawShipGuid.split(':')[1] || rawShipGuid : undefined;
                        if (shipGuid) {
                            shipName = uidMappings.ships[shipGuid] || knownMappings[shipGuid] || SHIP_GUIDS[shipGuid];

                            if (!shipName) {
                                const rawShip = loadout.ship || loadout.shipName || loadout.ship_name;
                                if (rawShip && !rawShip.includes(':')) {
                                    const matched = fuzzyMatchList(rawShip, [...SHIPS]);
                                    if (matched) shipName = matched;
                                    else shipName = rawShip;
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
                        }
                        const resolveGuid = (guid: string, db: Record<string, string>, type: 'Weapon' | 'Equipment') => {
                            if (!guid) return null;
                            const clean = guid.split(':')[1] || guid;
                            const domain = type === 'Weapon' ? 'weapons' : 'equipment';
                            const name = uidMappings[domain][clean] || knownMappings[clean] || db[clean];
                            if (!name) {
                                registerUnknownId(clean, type);
                                return null;
                            }
                            return name;
                        };
                        const weapon1 = resolveGuid(loadout.guidWeaponPrimary, WEAPON_GUIDS, 'Weapon');
                        const weapon2 = resolveGuid(loadout.guidWeaponSecondary, WEAPON_GUIDS, 'Weapon');
                        const weapon3 = resolveGuid(loadout.guidWeaponTertiary, WEAPON_GUIDS, 'Weapon');
                        const equip1 = resolveGuid(loadout.guidEquipmentPrimary, EQUIPMENT_GUIDS, 'Equipment');
                        const equip2 = resolveGuid(loadout.guidEquipmentSecondary, EQUIPMENT_GUIDS, 'Equipment');
                        const equip3 = resolveGuid(loadout.guidEquipmentTertiary, EQUIPMENT_GUIDS, 'Equipment');
                        const finalHero = (heroName && !heroName.startsWith('Unknown')) ? heroName : currentLoadoutRef.current?.hero;
                        const finalShip = (shipName && !shipName.startsWith('Unknown')) ? shipName : currentLoadoutRef.current?.ship;

                        const nextLoadout: Loadout = {
                            hero: finalHero || heroName,
                            ship: finalShip || shipName,
                            weapons: [weapon1, weapon2, weapon3].filter(Boolean) as string[],
                            equipment: [equip1, equip2, equip3].filter(Boolean) as string[]
                        };
                        setCurrentLoadout(nextLoadout);
                        if (!telemetryDraftMatchIdRef.current && isMatchInProgressRef.current) {
                            createTelemetryDraftIfNeeded(gameTime, nextLoadout);
                        }
                        updateTelemetryDraftFromLoadout(nextLoadout, gameTime);
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
