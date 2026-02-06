/**
 * @module useSmartScan
 * Orchestrates the automated screen-capture → OCR → review → apply pipeline.
 * Handles capture scheduling, OCR processing via Electron bridge, confidence
 * thresholds (REJECT < 40, REVIEW < 80, ACCEPT >= 80), and result merging.
 */
import { useState, useRef, useEffect } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { useAppStore } from '../store/useAppStore';
import { captureScreen, smartAnalyzeScreen, ScanOptions } from '../utils/scanService';
import { findClosestMatch } from '../utils/stringUtils';
import { SHIPS, UNNAMED_PLAYER_PREFIX } from '../utils/constants';
import Logger from '../utils/logger';

// OCR confidence thresholds for data quality control
const OCR_THRESHOLDS = {
    REJECT: 40,   // Below this = garbage, skip entirely
    REVIEW: 80,   // Below this but above REJECT = add to pending review
    ACCEPT: 80    // Above this = auto-accept
};

export const useSmartScan = () => {
    const {
        setSessionTeams, sessionTeams,
        pilotRegistry, addToRegistry,
        selectedTeammates, setSelectedTeammates,
        selectedOpponents, setSelectedOpponents,
        updatePlayerIdMapping, playerIdMap,
        sessionShipTypes, setSessionShipTypes,
        setTimeMin, setTimeSec, setDamageTaken,
        setSelectedReachModifiers, selectedReachModifiers,
        addPendingReview,
        recordPlayerSighting  // For immediate profile recording during scan
    } = useGameData();

    const { setToast, setHiddenForScan, activeUser } = useUIState();
    const { soundEnabled } = useUserPreferences();

    // Phase 4.4: Access OCR corrections for improved fuzzy matching
    const ocrCorrections = useAppStore(state => state.ocrCorrections);

    const playSuccessSound = () => {
        if (!soundEnabled) return;
        // Simple distinct beep using Web Audio API or a very short data URI if needed.
        // For now, simpler:
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } catch (e) { console.error("Audio error", e); }
    };

    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState({ status: '', pct: 0 });
    const [scanLogs, setScanLogs] = useState<string[]>([]);

    const handleSmartScan = async () => {
        setIsScanning(true);
        setScanProgress({ status: 'Capturing screen...', pct: 0 });
        setScanLogs(['Initializing scan...']);
        Logger.info('SmartScan', 'Starting smart scan');

        try {
            // Hide UI
            setHiddenForScan(true);
            await new Promise(r => setTimeout(r, 500)); // Increased from 200ms to ensure full hide

            const img = await captureScreen();

            // Show UI again immediately after capture
            setHiddenForScan(false);

            if (img) {
                const options: ScanOptions = {
                    onProgress: (status, pct) => {
                        setScanProgress({ status, pct });
                        setScanLogs(prev => {
                            if (prev[prev.length - 1] === status) return prev;
                            return [...prev, status];
                        });
                    }
                };

                // Pass activeUser to enable anchor-based detection
                const res = await smartAnalyzeScreen(img.dataUrl, options, activeUser || null);

                if (res.mode === 'MatchStats' && res.matchData) {
                    if (res.matchData.time) {
                        const parts = res.matchData.time.split(':');
                        if (parts.length === 2) { setTimeMin(parts[0], 'ocr'); setTimeSec(parts[1], 'ocr'); }
                    }
                    if (res.matchData.damage !== undefined) setDamageTaken(res.matchData.damage.toString());
                    if (res.matchData.modifiers && res.matchData.modifiers.length > 0) setSelectedReachModifiers(res.matchData.modifiers);
                    setToast({ message: "Game Stats Updated", type: 'success' });
                    Logger.info('SmartScan', 'Match stats captured', res.matchData);
                } else if ((res.mode === 'Lobby' || res.mode === 'Tactical' || res.mode === 'Social') && res.lobbyData) {
                    const { players, modifiers } = res.lobbyData;

                    if (players.length > 0) {
                        // 1. Merge with existing sessionTeams with Fuzzy Matching
                        const currentTeams = sessionTeams || {};
                        const mergedTeams: Record<string, string[]> = { ...currentTeams };
                        const allKnownNames = [...(pilotRegistry || [])];
                        Object.values(mergedTeams).forEach(team => allKnownNames.push(...team));
                        const uniqueKnownNames = Array.from(new Set(allKnownNames));

                        const processPlayers = async () => {
                            // Collect all players by team role for profile recording
                            const myTeamPlayers: string[] = [];
                            const opponentPlayers: string[] = [];

                            for (const r of players) {
                                // Phase 2.3: Confidence threshold - reject garbage OCR
                                if (r.confidence < OCR_THRESHOLDS.REJECT) {
                                    Logger.debug('SmartScan', `Rejected low-confidence OCR: ${r.name} (${r.confidence}%)`);
                                    continue;
                                }

                                // Add to pending review if below acceptance threshold
                                if (r.confidence < OCR_THRESHOLDS.REVIEW) {
                                    addPendingReview({
                                        id: Date.now() + Math.random().toString(),
                                        type: 'player_name',
                                        value: r.name,
                                        originalConfidence: r.confidence,
                                        context: res.mode
                                    });
                                }

                                // Team grouping: Prioritize detected Team Name, fallback to Color
                                // We combine them (e.g. "Red:Alpha") to keep color info for UI while unique-ing the group
                                const teamKey = r.teamName ? `${r.teamColor}: ${r.teamName}` : r.teamColor;

                                if (!mergedTeams[teamKey]) mergedTeams[teamKey] = [];
                                const teamList = mergedTeams[teamKey];
                                // If it's a generic ship name (deduced because it's in SHIP_TYPES), we allow multiples on the same team.
                                const isGenericShip = SHIPS.some(st => r.name.toUpperCase().includes(st.split(' ')[0].toUpperCase()));

                                // Phase 4.4: Check OCR corrections before fuzzy matching
                                // If we've corrected this OCR text before (2+ times), use the stored correction
                                const existingCorrection = ocrCorrections?.[r.name];
                                let finalName = r.name;
                                if (existingCorrection && existingCorrection.count >= 2) {
                                    finalName = existingCorrection.correctedTo;
                                    Logger.debug('SmartScan', `Applied prior OCR correction: "${r.name}" -> "${finalName}"`);
                                }

                                if (teamList.includes(finalName) && !isGenericShip) continue;

                                // Only do fuzzy matching if we didn't already have a correction
                                if (finalName === r.name) {
                                    const closest = findClosestMatch(r.name, uniqueKnownNames, 2);
                                    if (closest && closest !== r.name) {
                                        if (!teamList.includes(closest)) teamList.push(closest);
                                        continue;
                                    }
                                }

                                // For generic ships, we only add if it's a new occurrence in THIS scan
                                teamList.push(finalName);

                                // 3. Auto-Discovery (Add new names to registry)
                                if (!pilotRegistry.includes(r.name)) {
                                    const cleaned = r.name.trim();
                                    if (cleaned.length > 2 && !/READY|TEAM|LOBBY|CREW|MATCH|VS|PING|LEVEL/i.test(cleaned)) {
                                        addToRegistry(cleaned);
                                        Logger.info('SmartScan', `Auto-registered new pilot: ${cleaned}`);
                                    }
                                }

                                // 4. Auto-Assign Teammates/Opponents based on Color & Position
                                // User says: Cyan is ALWAYS user team, teammates always on LEFT.
                                const isLeftSide = (r as any)._cx < (r as any)._screenW * 0.45;
                                const isTeammate = res.mode === 'Social' || (res.mode === 'Tactical' && (r.teamColor === 'Cyan' || isLeftSide));

                                // Track for profile recording
                                if (isTeammate) {
                                    myTeamPlayers.push(r.name);
                                } else {
                                    opponentPlayers.push(r.name);
                                }

                                if (isTeammate) {
                                    if (r.name.toUpperCase() !== (activeUser || '').toUpperCase()) {
                                        setSelectedTeammates((curr: string[]) => {
                                            if (isGenericShip) return [...curr, r.name]; // Allow multiple hunters
                                            return curr.includes(r.name) ? curr : [...curr, r.name];
                                        });
                                    }
                                } else if (r.teamColor !== 'Unknown' && r.teamColor !== 'Cyan' && !isLeftSide) {
                                    setSelectedOpponents((curr: string[]) => {
                                        if (isGenericShip) return [...curr, r.name];
                                        return curr.includes(r.name) ? curr : [...curr, r.name];
                                    });
                                }

                                // Phase 2.1: Record player sighting IMMEDIATELY during OCR scan
                                // This ensures playerProfiles are populated even without match submit
                                recordPlayerSighting(
                                    r.name,
                                    r.teamColor || 'unknown',
                                    myTeamPlayers,
                                    opponentPlayers,
                                    r.shipType || undefined,
                                    'ocr'  // Source tracking for analytics
                                );
                                Logger.debug('SmartScan', `Recorded sighting for ${r.name} (${r.teamColor}, ship: ${r.shipType || 'unknown'}, source: ocr)`);
                            }
                            setSessionTeams(mergedTeams);
                        };
                        await processPlayers();

                        // 2. Teammate Linking (Telemetry ID -> OCR Name)
                        // ... (keep existing teammate linking logic)
                        const placeholderNames = selectedTeammates.filter(n => n.startsWith(UNNAMED_PLAYER_PREFIX));
                        if (placeholderNames.length > 0 && activeUser) {
                            const myEntry = players.find(p => p.name.toUpperCase() === activeUser.toUpperCase());
                            let targetTeamColor: string | null = myEntry ? myEntry.teamColor : (res.mode === 'Social' ? 'Green' : null);

                            if (!targetTeamColor) {
                                const teamCounts: Record<string, number> = {};
                                players.forEach(p => teamCounts[p.teamColor] = (teamCounts[p.teamColor] || 0) + 1);
                                const squadSize = placeholderNames.length + 1;
                                const candidateColor = Object.keys(teamCounts).find(c => teamCounts[c] === squadSize);
                                if (candidateColor) targetTeamColor = candidateColor;
                            }

                            if (targetTeamColor) {
                                const candidates = players.filter(p =>
                                    p.teamColor === targetTeamColor &&
                                    p.name.toUpperCase() !== activeUser.toUpperCase()
                                );

                                if (candidates.length === placeholderNames.length) {
                                    const placeholderIds = Object.entries(playerIdMap)
                                        .filter(([id, name]) => placeholderNames.includes(name))
                                        .map(([id]) => id);

                                    placeholderIds.sort();
                                    candidates.sort((a, b) => a.name.localeCompare(b.name));

                                    let linkedCount = 0;
                                    placeholderIds.forEach((id, idx) => {
                                        if (candidates[idx]) {
                                            updatePlayerIdMapping(id, candidates[idx].name);
                                            linkedCount++;
                                        }
                                    });

                                    if (linkedCount > 0) {
                                        setToast({ message: `Linked ${linkedCount} teammates!`, type: 'success' });
                                        Logger.info('SmartScan', `Linked ${linkedCount} placeholders to OCR names`, { candidates });
                                    }
                                }
                            }
                        }
                    }

                    if (modifiers.length > 0) {
                        const current = selectedReachModifiers || [];
                        setSelectedReachModifiers(Array.from(new Set([...current, ...modifiers])));
                    }

                    if (res.mode === 'Lobby') {
                        setToast({ message: `Scanned Lobby: ${players.length} Players`, type: 'success' });
                        playSuccessSound();
                    } else if (res.mode === 'Social') {
                        setToast({ message: `Party Members Captured: ${players.length}`, type: 'success' });
                        playSuccessSound();
                    } else {
                        const shipCounts = players.filter(p => p.shipType).length;
                        setToast({ message: `Tactical: ${players.length} Ships, ${modifiers.length} Hazards`, type: 'success' });
                        if (shipCounts > 0 || modifiers.length > 0) playSuccessSound();

                        if (shipCounts > 0) {
                            const newShips: Record<string, string> = { ...sessionShipTypes };
                            let newCount = 0;
                            players.forEach(p => {
                                if (p.shipType && p.name) {
                                    if (newShips[p.name] !== p.shipType) {
                                        newShips[p.name] = p.shipType;
                                        newCount++;
                                    }
                                }
                            });

                            if (newCount > 0) {
                                setSessionShipTypes(newShips, 'ocr');
                                Logger.info('SmartScan', `Captured ${newCount} new ship types`);
                            }
                        }
                    }
                    Logger.info('SmartScan', `${res.mode} scan: ${players.length} players`);
                } else {
                    setToast({ message: "No data detected", type: 'warning' });
                    Logger.warn('SmartScan', 'Smart scan: no data detected');
                }
            } else {
                setToast({ message: "Screen capture failed: No image data", type: 'error' });
            }
        } catch (e: any) {
            Logger.error('SmartScan', 'Smart scan failed', e);
            const msg = e?.message || "Unknown error";
            setToast({ message: `Scan failed: ${msg}`, type: 'error' });
        } finally {
            setHiddenForScan(false);
            setIsScanning(false);
            setScanProgress({ status: '', pct: 0 });
        }
    };

    return {
        handleSmartScan,
        isScanning,
        scanProgress,
        scanLogs
    };
};
