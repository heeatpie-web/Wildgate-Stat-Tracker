import { useEffect, useRef, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { HERO_GUIDS, SHIP_GUIDS, WEAPON_GUIDS, EQUIPMENT_GUIDS } from '../utils/guids';
import { SHIPS, CHARACTERS, UNNAMED_PLAYER_PREFIX } from '../types';
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

                events.forEach(e => {
                    const name = e.EventName;
                    const payload = e.Payload?.event || e.Payload?.Event || e.Payload || e.payload?.event || e.payload || e.event || {};
                    const gameTime = e.ClientTimestamp ? e.ClientTimestamp * 1000 : Date.now();
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

                        setCurrentLoadout({
                            hero: finalHero || heroName,
                            ship: finalShip || shipName,
                            weapons: [weapon1, weapon2, weapon3].filter(Boolean) as string[],
                            equipment: [equip1, equip2, equip3].filter(Boolean) as string[]
                        });
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
