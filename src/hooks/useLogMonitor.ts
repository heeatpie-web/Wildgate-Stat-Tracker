/**
 * @module useLogMonitor
 * Subscribes to Electron IPC events from the game log watcher (main process).
 * Parses telemetry events for match lifecycle (start/end), player identity
 * resolution, loadout syncing, and timer ticks. Uses refs for frequently-
 * changing values to avoid IPC listener re-subscription churn.
 */
import { useEffect, useRef, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { HERO_GUIDS, SHIP_GUIDS, WEAPON_GUIDS, EQUIPMENT_GUIDS } from '../utils/guids';
import { SHIPS, UNNAMED_PLAYER_PREFIX } from '../types';
import { processTelemetryEvent, TelemetryActions, TelemetryContext } from '../utils/telemetryProcessor';
import Logger from '../utils/logger';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

export const useLogMonitor = () => {
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
        currentLoadout
    } = useGameData();
    const { accelByteToEpicId, setIDMapping } = useAppStore();

    const {
        activeMode, setActiveMode,
        setToast,
        setOverlayPhase,
        enableAutoLogRecording,
        activeUser,
        setShowWizard,
        devMode
    } = useUIState();

    const { playStart } = useSoundEffects();

    const [logFeed, setLogFeed] = useState<any[]>([]);
    const [logStatus, setLogStatus] = useState<any>({});
    const prevKillCount = useRef(0);
    const currentSquadIds = useRef<string[]>([]);
    const sessionStartTime = useRef(Date.now()); // Track when app session started

    // Refs for frequently-changing values to avoid IPC listener re-subscription churn
    const playerIdMapRef = useRef(playerIdMap);
    const accelByteToEpicIdRef = useRef(accelByteToEpicId);
    const pilotRegistryRef = useRef(pilotRegistry);
    const matchStartTimeRef = useRef(matchStartTime);
    const isMatchInProgressRef = useRef(isMatchInProgress);
    const currentLoadoutRef = useRef(currentLoadout);
    const activeHeroRef = useRef(activeHero);
    const activeShipRef = useRef(activeShip);
    const activeUserRef = useRef(activeUser);
    const devModeRef = useRef(devMode);

    // Keep refs in sync
    useEffect(() => { playerIdMapRef.current = playerIdMap; }, [playerIdMap]);
    useEffect(() => { accelByteToEpicIdRef.current = accelByteToEpicId; }, [accelByteToEpicId]);
    useEffect(() => { pilotRegistryRef.current = pilotRegistry; }, [pilotRegistry]);
    useEffect(() => { matchStartTimeRef.current = matchStartTime; }, [matchStartTime]);
    useEffect(() => { isMatchInProgressRef.current = isMatchInProgress; }, [isMatchInProgress]);
    useEffect(() => { currentLoadoutRef.current = currentLoadout; }, [currentLoadout]);
    useEffect(() => { activeHeroRef.current = activeHero; }, [activeHero]);
    useEffect(() => { activeShipRef.current = activeShip; }, [activeShip]);
    useEffect(() => { activeUserRef.current = activeUser; }, [activeUser]);
    useEffect(() => { devModeRef.current = devMode; }, [devMode]);

    // --- ID Discovery from Archives ---
    useEffect(() => {
        // Load archived telemetry and extract ID mappings (local only, no external API)
        const loadArchives = async () => {
            if (!ipcRenderer) return;
            try {
                const archivedEvents = await ipcRenderer.invoke('load-archived-telemetry');
                const tempMappings: Record<string, string> = {};
                (archivedEvents || []).forEach((e: any) => {
                    const clientContext = e.context?.client || e.Payload?.context?.client;
                    const platformId = clientContext?.platformAccountId;
                    const contextAccountId = clientContext?.accountId;
                    if (contextAccountId && platformId && contextAccountId !== platformId) {
                        if (!accelByteToEpicId[contextAccountId]) {
                            tempMappings[contextAccountId] = platformId;
                        }
                    }
                });
                Object.entries(tempMappings).forEach(([abId, epicId]) => setIDMapping(abId, epicId));
                Logger.info('LogMonitor', `Loaded ${Object.keys(tempMappings).length} ID mappings from archives`);
            } catch (e) {
                Logger.error('LogMonitor', 'Failed to load archives', e);
            }
        };
        const archiveTimer = setTimeout(loadArchives, 1000);
        return () => clearTimeout(archiveTimer);
    }, [accelByteToEpicId, setIDMapping]);

    // Auto Log Monitoring Toggle
    useEffect(() => {
        if (!ipcRenderer) return;
        if (enableAutoLogRecording) {
            ipcRenderer.send('start-log-monitoring');
        } else {
            ipcRenderer.send('stop-log-monitoring');
        }
    }, [enableAutoLogRecording]);

    // Match Timer Tick
    useEffect(() => {
        if (isMatchInProgress && matchStartTime) {
            const timer = setInterval(() => {
                const diff = Math.max(0, (Date.now() - matchStartTime) / 1000);
                const m = Math.floor(diff / 60);
                const s = Math.floor(diff % 60);
                // "telemetry" here acts as a lower priority override vs "manual" if we had priority logic,
                // but currently the setter logic in GameDataProvider usually accepts the latest.
                setTimeMin(m.toString().padStart(2, '0'), 'telemetry');
                setTimeSec(s.toString().padStart(2, '0'), 'telemetry');
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isMatchInProgress, matchStartTime, setTimeMin, setTimeSec]);

    // Log Data Handler
    useEffect(() => {
        if (!ipcRenderer) return;

        const onStatus = (_: any, status: any) => setLogStatus(status);
        const onLogData = (_: any, data: any) => {
            if (data) {
                setLastActivity(Date.now());

                // Extract events
                let events: any[] = [];
                if (data.telemetry && Array.isArray(data.telemetry)) events = data.telemetry;
                else if (Array.isArray(data)) events = data;
                else if (data.EventName) events = [data]; // Single event wrapper

                if (events.length === 0) return;

                // BACKPROCESS: Removed - redundant with main loop below
                // events.forEach(e => { ... });

                // Append to dev log feed (only recent)
                setLogFeed(prev => [...events.slice(0, 10), ...prev].slice(0, 50));

                events.forEach(e => {
                    const name = e.EventName;
                    const payload = e.Payload?.event || {};
                    const gameTime = e.ClientTimestamp ? e.ClientTimestamp * 1000 : Date.now();

                    // FIX: Use session-based filtering instead of hard 30-second window
                    // Events are relevant if they occurred after app start (with 60s grace for startup delay)
                    const isRelevantToSession = gameTime >= (sessionStartTime.current - 60000);

                    // Log all events for discovery (before filtering)
                    const ageSeconds = Math.floor((Date.now() - gameTime) / 1000);
                    const payloadKeys = Object.keys(payload).join(',');
                    Logger.debug('LogMonitor', `EVENT: ${name} | Age: ${ageSeconds}s | Keys: ${payloadKeys}`);

                    // --- ID Discovery ---
                    // Check context for Platform ID (Epic) - can be in e.context or e.Payload.context
                    const clientCtx = e.context?.client || e.Payload?.context?.client;
                    const platformId = clientCtx?.platformAccountId;
                    const contextAccountId = clientCtx?.accountId;

                    // Link AccelByte ID to Epic ID (crucial for resolution!)
                    if (contextAccountId && platformId && contextAccountId !== platformId) {
                        if (!accelByteToEpicIdRef.current[contextAccountId]) {
                            setIDMapping(contextAccountId, platformId);
                            console.log('[EpicResolver] Mapped AccelByte->Epic:', contextAccountId, '->', platformId);
                        }
                    }

                    const potentialId = payload.accountId || payload.userId || payload.playerId || payload.player_id || platformId;
                    const potentialName = payload.displayName || payload.playerName || payload.name || payload.playerNameString || payload.callsign;

                    if (potentialId) {
                        if (potentialName && typeof potentialName === 'string' && potentialName.length > 0) {
                            // Link ID to Name
                            const currentMappedName = playerIdMapRef.current[potentialId];
                            if (currentMappedName && currentMappedName.startsWith(UNNAMED_PLAYER_PREFIX) && currentMappedName !== potentialName) {
                                updatePlayerIdMapping(potentialId, potentialName);
                                setToast({ message: `Identity Discovered: ${potentialName}`, type: 'success' });
                            } else if (!currentMappedName && !pilotRegistryRef.current.includes(potentialName)) {
                                // updatePlayerIdMapping(potentialId, potentialName);
                                // Don't auto-add to registry based on user request ("Only OCR should add")
                                // addToRegistry(potentialName); 
                                // setToast({ message: `New Pilot Registered: ${potentialName}`, type: 'info' });
                                Logger.debug('LogMonitor', `observed unknown player: ${potentialName} (${potentialId})`);
                            }
                        } else {
                            // ID found but NO Name - just log for now (manual mapping available)
                            Logger.debug('LogMonitor', `Unknown ID detected: ${potentialId}`);
                        }
                    }

                    // Map Local Player
                    const localId = e.context?.client?.accountId;
                    if (localId && activeUserRef.current && !playerIdMapRef.current[localId]) {
                        updatePlayerIdMapping(localId, activeUserRef.current);
                    }

                    // Loadout Sync
                    if (name === 'NebLoadoutSaved' && payload.loadout) {
                        const { knownMappings, registerUnknownId } = useAppStore.getState();

                        let heroName = '';
                        let shipName = '';

                        const heroGuid = payload.loadout.guidHero?.split(':')[1];
                        if (heroGuid) {
                            heroName = knownMappings[heroGuid] || HERO_GUIDS[heroGuid];

                            if (!heroName) {
                                // Try plain text fallback
                                if (payload.loadout.hero && !payload.loadout.hero.includes(':')) heroName = payload.loadout.hero;

                                if (!heroName) {
                                    registerUnknownId(heroGuid, 'Hero');
                                    heroName = `Unknown (${heroGuid.substr(0, 4)})`;
                                    Logger.warn('LogMonitor', `Unknown Hero GUID: ${heroGuid}`);
                                }
                            }

                            if (heroName && !heroName.startsWith('Unknown') && heroName !== activeHeroRef.current) {
                                setActiveHero(heroName);
                            }
                        }

                        const shipGuid = payload.loadout.guidShip?.split(':')[1];
                        if (shipGuid) {
                            shipName = knownMappings[shipGuid] || SHIP_GUIDS[shipGuid];

                            if (!shipName) {
                                if (payload.loadout.ship && !payload.loadout.ship.includes(':')) shipName = payload.loadout.ship;

                                if (!shipName) {
                                    shipName = `Unknown (${shipGuid.substr(0, 4)})`;
                                    Logger.warn('LogMonitor', `Unknown Ship GUID: ${shipGuid}`);
                                }

                                // Normalization for raw class names
                                if (shipName.includes('Hunter')) shipName = 'Hunter';
                            }

                            if (shipName && !shipName.startsWith('Unknown') && shipName !== activeShipRef.current) {
                                setActiveShip(shipName);
                            }
                        }

                        // Resolve weapon/equipment GUIDs to names
                        const resolveGuid = (guid: string, db: Record<string, string>, type: 'Weapon' | 'Equipment') => {
                            if (!guid) return null;
                            const clean = guid.split(':')[1] || guid;
                            const name = knownMappings[clean] || db[clean];
                            if (!name) {
                                registerUnknownId(clean, type);
                                return null;
                            }
                            return name;
                        };

                        // Resolve weapons (using correct telemetry field names)
                        const weapon1 = resolveGuid(payload.loadout.guidWeaponPrimary, WEAPON_GUIDS, 'Weapon');
                        const weapon2 = resolveGuid(payload.loadout.guidWeaponSecondary, WEAPON_GUIDS, 'Weapon');
                        const weapon3 = resolveGuid(payload.loadout.guidWeaponTertiary, WEAPON_GUIDS, 'Weapon');

                        // Resolve equipment
                        const equip1 = resolveGuid(payload.loadout.guidEquipmentPrimary, EQUIPMENT_GUIDS, 'Equipment');
                        const equip2 = resolveGuid(payload.loadout.guidEquipmentSecondary, EQUIPMENT_GUIDS, 'Equipment');
                        const equip3 = resolveGuid(payload.loadout.guidEquipmentTertiary, EQUIPMENT_GUIDS, 'Equipment');

                        // Update Global Loadout State with resolved names
                        const finalHero = (heroName && !heroName.startsWith('Unknown')) ? heroName : currentLoadoutRef.current?.hero;
                        const finalShip = (shipName && !shipName.startsWith('Unknown')) ? shipName : currentLoadoutRef.current?.ship;

                        setCurrentLoadout({
                            hero: finalHero || heroName,
                            ship: finalShip || shipName,
                            weapons: [weapon1, weapon2, weapon3].filter(Boolean) as string[],
                            equipment: [equip1, equip2, equip3].filter(Boolean) as string[]
                        });
                        // Logger.info('LogMonitor', `Loadout Synced: ${heroName} / ${shipName}`);
                    }

                    // Construct Actions & Context for Processor
                    const actions: TelemetryActions = {
                        setTimeMin, setTimeSec,
                        setIsMatchInProgress,
                        setMatchStartTime,
                        setOverlayPhase,
                        setToast,
                        updatePlayerIdMapping,
                        setShowWizard
                    };

                    const context: TelemetryContext = {
                        matchStartTime: matchStartTimeRef.current,
                        isMatchInProgress: isMatchInProgressRef.current,
                        playerIdMap: playerIdMapRef.current,
                        pilotRegistry: pilotRegistryRef.current
                    };

                    // Execute Processor
                    // Process events that are relevant to the current session (occurred after app start)
                    // This prevents processing very old archived events while still handling real-time events
                    // even if there's some delay in receiving them
                    if (isRelevantToSession || devModeRef.current) {
                        processTelemetryEvent(e, actions, context);
                    } else {
                        Logger.debug('LogMonitor', `Skipping old event: ${name} (age: ${ageSeconds}s, before session start)`);
                    }
                });
            }
        };

        ipcRenderer.on('log-status', onStatus);
        ipcRenderer.on('log-data', onLogData);
        return () => {
            ipcRenderer.removeListener('log-status', onStatus);
            ipcRenderer.removeListener('log-data', onLogData);
        };
    }, [setIDMapping, updatePlayerIdMapping, setToast, setLastActivity, setTimeMin, setTimeSec, setIsMatchInProgress, setMatchStartTime, setOverlayPhase, setShowWizard, setActiveHero, setActiveShip, setCurrentLoadout]);

    return { logFeed, logStatus };
};
