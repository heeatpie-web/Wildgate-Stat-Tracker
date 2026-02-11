import { useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { useAppStore } from '../store/useAppStore';
import { isElectron } from '../utils/electronAPI';
import { captureScreen, smartAnalyzeScreen, ScanOptions } from '../utils/scanService';
import { findClosestMatch, normalizeOcrName, similarityScore } from '../utils/stringUtils';
import { SHIPS, UNNAMED_PLAYER_PREFIX } from '../utils/constants';
import Logger from '../utils/logger';

const OCR_THRESHOLDS = {
    REJECT: 55,
    REVIEW: 75,
    ACCEPT: 80
};

const MODE_NOISE_WORDS: Record<string, RegExp[]> = {
    Lobby: [
        /\bREADY\b/i, /\bCREW\b/i, /\bHUB\b/i, /\bLOBBY\b/i, /\bSEARCHING\b/i, /\bMATCH\b/i, /\bTEAM\b/i
    ],
    Tactical: [
        /\bTACTICAL\b/i, /\bMAP\b/i, /\bOBJECTIVE\b/i, /\bSECTOR\b/i, /\bPING\b/i, /\bDEPLOY\b/i
    ],
    Social: [
        /\bSOCIAL\b/i, /\bPARTY\b/i, /\bMEMBERS\b/i, /\bINVITE\b/i, /\bFRIEND\b/i
    ],
    MatchStats: [
        /\bVICTORY\b/i, /\bDEFEAT\b/i, /\bDRAW\b/i, /\bDAMAGE\b/i, /\bTAKEN\b/i, /\bTIME\b/i
    ]
};

const isNoiseName = (name: string, mode: string) => {
    if (!name) return true;
    const cleaned = normalizeOcrName(name);
    if (cleaned.length < 3) return true;
    const patterns = MODE_NOISE_WORDS[mode] || [];
    return patterns.some(p => p.test(cleaned));
};

/**
 * useSmartScan - Hook for managing the smart scanning process.
 * Bridges local OCR progress with the global visionStatus to enable centralized monitoring.
 */
export const useSmartScan = () => {
    const {
        setSessionTeams, sessionTeams,
        pilotRegistry,
        selectedTeammates, setSelectedTeammates,
        selectedOpponents, setSelectedOpponents,
        updatePlayerIdMapping, playerIdMap,
        sessionShipTypes, setSessionShipTypes,
        setTimeMin, setTimeSec, setDamageTaken,
        setSelectedReachModifiers, selectedReachModifiers,
        addPendingReview,
        pendingReviews,
        recordPlayerSighting
    } = useGameData();

    const { setToast, setHiddenForScan, activeUser, visionStatus, setVisionStatus } = useUIState();
    const { soundEnabled } = useUserPreferences();
    const ocrMode = useAppStore(state => state.ocrMode);
    const ocrCalibration = useAppStore(state => state.ocrCalibration);
    const ocrCorrections = useAppStore(state => state.ocrCorrections);

    const [scanProgress, setScanProgress] = useState({ status: '', pct: 0 });
    const [scanLogs, setScanLogs] = useState<string[]>([]);

    const playSuccessSound = () => {
        if (!soundEnabled) return;
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

    const buildRosterSuggestions = (name: string) => {
        const normalized = normalizeOcrName(name);
        const scored = (pilotRegistry || []).map(p => ({
            name: p,
            score: similarityScore(normalized, normalizeOcrName(p))
        })).sort((a, b) => b.score - a.score);
        const top = scored.filter(s => s.score > 0).slice(0, 3);
        return {
            bestMatch: top[0]?.name,
            bestScore: top[0]?.score,
            suggestions: top
        };
    };

    const handleSmartScan = async () => {
        if (!isElectron()) {
            setToast({ message: 'Smart Scan is only available in the desktop app', type: 'warning' });
            return;
        }

        setVisionStatus('scanning');
        setScanProgress({ status: 'Capturing screen...', pct: 0 });
        setScanLogs(['Initializing scan...']);
        Logger.info('SmartScan', 'Starting smart scan');

        try {
            const img = await captureScreen();

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

                const res = await smartAnalyzeScreen(img.dataUrl, { ...options, ocrMode, ocrCalibration }, activeUser || null);

                if (res.mode === 'MatchStats' && res.matchData) {
                    if (res.matchData.time) {
                        const parts = res.matchData.time.split(':');
                        if (parts.length === 2) { setTimeMin(parts[0], 'ocr'); setTimeSec(parts[1], 'ocr'); }
                    }
                    if (res.matchData.damage !== undefined) setDamageTaken(res.matchData.damage.toString(), 'ocr');
                    if (res.matchData.modifiers && res.matchData.modifiers.length > 0) setSelectedReachModifiers(res.matchData.modifiers, 'ocr');
                    setToast({ message: "Game Stats Updated", type: 'success' });
                    Logger.info('SmartScan', 'Match stats captured', res.matchData);
                } else if ((res.mode === 'Lobby' || res.mode === 'Tactical' || res.mode === 'Social') && res.lobbyData) {
                    const { players, modifiers } = res.lobbyData;

                    if (players.length > 0) {
                        const currentTeams = sessionTeams || {};
                        const mergedTeams: Record<string, string[]> = { ...currentTeams };
                        const allKnownNames = [...(pilotRegistry || [])];
                        Object.values(mergedTeams).forEach(team => allKnownNames.push(...team));
                        const uniqueKnownNames = Array.from(new Set(allKnownNames));

                        const processPlayers = async () => {
                            const myTeamPlayers: string[] = [];
                            const opponentPlayers: string[] = [];
                            const pendingValues = new Set((pendingReviews || []).map(r => normalizeOcrName(r.value)));

                            for (const r of players) {
                                if (r.confidence < OCR_THRESHOLDS.REJECT) {
                                    Logger.debug('SmartScan', `Rejected low-confidence OCR: ${r.name} (${r.confidence}%)`);
                                    continue;
                                }

                                if (r.confidence < OCR_THRESHOLDS.REVIEW) {
                                    addPendingReview({
                                        id: Date.now() + Math.random().toString(),
                                        type: 'player_name',
                                        value: r.name,
                                        originalConfidence: r.confidence,
                                        context: res.mode
                                    });
                                }

                                const teamKey = (r.teamColor && r.teamColor !== 'Unknown') ? r.teamColor : (r.teamName ? `Team:${r.teamName}` : 'Unknown');

                                if (!mergedTeams[teamKey]) mergedTeams[teamKey] = [];
                                const teamList = mergedTeams[teamKey];
                                const isGenericShip = SHIPS.some(st => r.name.toUpperCase().includes(st.split(' ')[0].toUpperCase()));

                                const rawName = r.name;
                                const normalizedName = normalizeOcrName(rawName);
                                if (isNoiseName(normalizedName, res.mode)) {
                                    Logger.debug('SmartScan', `Filtered noise name: "${rawName}" (${res.mode})`);
                                    continue;
                                }
                                const existingCorrection = ocrCorrections?.[rawName] || ocrCorrections?.[normalizedName];
                                let finalName = (existingCorrection && existingCorrection.count >= 2)
                                    ? existingCorrection.correctedTo
                                    : normalizedName;
                                if (existingCorrection && existingCorrection.count >= 2) {
                                    finalName = existingCorrection.correctedTo;
                                    Logger.debug('SmartScan', `Applied prior OCR correction: "${r.name}" -> "${finalName}"`);
                                }

                                if (teamList.includes(finalName) && !isGenericShip) continue;

                                if (finalName === normalizedName) {
                                    const threshold = finalName.length > 6 ? 2 : 1;
                                    const allCandidates = [...uniqueKnownNames, ...(pilotRegistry || [])];
                                    const uniqueCandidates = Array.from(new Set(allCandidates));
                                    const closest = findClosestMatch(finalName, uniqueCandidates, threshold);
                                    if (closest && closest !== finalName) {
                                        finalName = closest;
                                        if (!teamList.includes(closest)) teamList.push(closest);
                                        continue;
                                    }
                                }

                                teamList.push(finalName);

                                if (!pilotRegistry.includes(finalName)) {
                                    const cleaned = finalName.trim();
                                    if (cleaned.length > 2 && !/READY|TEAM|LOBBY|CREW|MATCH|VS|PING|LEVEL/i.test(cleaned)) {
                                        const normalizedCleaned = normalizeOcrName(cleaned);
                                        if (!pendingValues.has(normalizedCleaned)) {
                                            const suggestions = buildRosterSuggestions(cleaned);
                                            addPendingReview({
                                                id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                                                type: 'roster_candidate',
                                                value: cleaned,
                                                originalConfidence: r.confidence,
                                                context: `OCR ${res.mode}`,
                                                bestMatch: suggestions.bestMatch,
                                                bestScore: suggestions.bestScore,
                                                suggestions: suggestions.suggestions,
                                                source: 'ocr'
                                            });
                                            pendingValues.add(normalizedCleaned);
                                            Logger.info('SmartScan', `Queued roster candidate for review: ${cleaned}`);
                                        }
                                    }
                                }

                                const screenW = (r as any)._screenW || 1;
                                const isLeftSide = (r as any)._cx < screenW * 0.5;
                                const hasKnownTeam = r.teamColor && r.teamColor !== 'Unknown';
                                const isTeammate = res.mode === 'Social'
                                    ? true
                                    : (hasKnownTeam
                                        ? (r.teamColor === 'Cyan' || r.teamColor === 'Green')
                                        : isLeftSide);

                                if (isTeammate) {
                                    myTeamPlayers.push(finalName);
                                } else {
                                    opponentPlayers.push(finalName);
                                }

                                if (isTeammate) {
                                    if (finalName.toUpperCase() !== (activeUser || '').toUpperCase()) {
                                        setSelectedTeammates((curr: string[]) => {
                                            if (isGenericShip) return [...curr, finalName];
                                            return curr.includes(finalName) ? curr : [...curr, finalName];
                                        });
                                    }
                                } else if (r.teamColor !== 'Unknown' && r.teamColor !== 'Cyan' && !isLeftSide) {
                                    setSelectedOpponents((curr: string[]) => {
                                        if (isGenericShip) return [...curr, finalName];
                                        return curr.includes(finalName) ? curr : [...curr, finalName];
                                    });
                                }
                            }

                            for (const r of players) {
                                if (r.confidence < OCR_THRESHOLDS.REJECT) continue;
                                recordPlayerSighting(
                                    normalizeOcrName(r.name),
                                    r.teamColor || 'unknown',
                                    myTeamPlayers,
                                    opponentPlayers,
                                    r.shipType || undefined,
                                    'ocr'
                                );
                                Logger.debug('SmartScan', `Recorded sighting for ${r.name} (${r.teamColor}, ship: ${r.shipType || 'unknown'}, source: ocr)`);
                            }
                            setSessionTeams(mergedTeams);
                        };
                        await processPlayers();

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
                        setSelectedReachModifiers(Array.from(new Set([...current, ...modifiers])), 'ocr');
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
            setVisionStatus('idle');
            setScanProgress({ status: '', pct: 0 });
        }
    };

    return {
        handleSmartScan,
        isScanning: visionStatus === 'scanning',
        scanProgress,
        scanLogs
    };
};
