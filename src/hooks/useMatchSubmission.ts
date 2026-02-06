/**
 * @module useMatchSubmission
 * Handles the end-to-end match submission flow: validates form data,
 * constructs a Match record, triggers confetti/sound effects, bundles
 * screenshot artifacts, persists via addMatch(), and resets the form.
 */
import { useCallback, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { Match } from '../types';
import confetti from 'canvas-confetti';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { bundleMatchArtifacts } from '../utils/artifactService';
import Logger from '../utils/logger';

export const useMatchSubmission = () => {
    const {
        addMatch,
        setPendingMatchData,
        setPendingPlacement,
        setPendingArtifactType,
        setPendingKilledBy,
        setSelectedOpponents,
        setTimeMin,
        setTimeSec,
        setDamageTaken,
        setPoiEasy,
        setPoiMedium,
        setPoiEpic,
        setCurrentNote,
        setActiveWeapons,
        setSelectedReachModifiers,
        setKills,
        setMatchStartTime,
        setIsMatchInProgress,
        updateMatch,
        recordPlayerSighting,
        setTimelineEvents
    } = useGameData();

    const {
        setToast,
        setShowWizard
    } = useUIState();

    const { playVictory, playDefeat } = useSoundEffects();
    const [submitting, setSubmitting] = useState(false);

    const initiateSubmission = useCallback((result: 'Win' | 'Loss' | 'Draw') => {
        const state = useAppStore.getState();
        const {
            activeUser, activeMode,
            selectedTeammates, selectedOpponents,
            activeHero, activeShip, activeWeapons,
            selectedReachModifiers, kills,
            timeMin, timeSec, isMatchInProgress, matchStartTime,
            damageTaken, currentNote,
            poiEasy, poiMedium, poiEpic
        } = state;

        if (!activeUser) {
            setToast({ message: "Select a profile first!", type: 'error' });
            return;
        }

        let finalTimeMin = timeMin;
        let finalTimeSec = timeSec;

        // Auto-calculate time if match was in progress and manual time is empty
        if (isMatchInProgress && matchStartTime && !timeMin && !timeSec) {
            const durationMs = Date.now() - matchStartTime;
            const totalSeconds = Math.floor(durationMs / 1000);
            finalTimeMin = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            finalTimeSec = (totalSeconds % 60).toString().padStart(2, '0');

            // Reset match timer after capture
            setIsMatchInProgress(false);
            setMatchStartTime(null);
        }

        const timeStr = (finalTimeMin || finalTimeSec) ? `${finalTimeMin || '00'}:${finalTimeSec || '00'}` : "";
        const dmg = parseInt(damageTaken) || 0;

        // We set pending match data to be used in the Wizard
        const data: Partial<Match> = {
            mode: activeMode,
            player: activeUser,
            teammates: selectedTeammates,
            opponents: selectedOpponents,
            hero: activeHero || undefined,
            ship: activeShip || undefined,
            weapons: activeWeapons,
            reachModifiers: selectedReachModifiers,
            kills,
            time: timeStr,
            poiEasy,
            poiMedium,
            poiEpic,
            damageTaken: dmg,
            notes: currentNote
        };

        setPendingMatchData(data);
        setShowWizard(result);
    }, [setToast, setPendingMatchData, setShowWizard, setIsMatchInProgress, setMatchStartTime]);

    const processFinalSubmission = useCallback(async (subType: string) => {
        const state = useAppStore.getState();
        const {
            pendingMatchData, showWizard,
            pendingPlacement, pendingArtifactType, pendingKilledBy,
            timeMin, timeSec, activeUser, activeMode,
            currentLoadout, timelineEvents, sessionStartTime,
            sessionTeams, sessionShipTypes
        } = state;

        if (!pendingMatchData || submitting) return;

        try {
            setSubmitting(true);
            let finalMods = [...(pendingMatchData.reachModifiers || [])];
            if (subType === 'Artifact') finalMods.push(`Artifact: ${pendingArtifactType || 'Healing'}`);

            if (showWizard === 'Win') {
                confetti({ particleCount: 100, spread: 70 });
                playVictory();
            } else {
                playDefeat();
            }

            // NEW: Recalculate time from latest state to capture Wizard overrides
            const finalTime = (timeMin || timeSec) ? `${timeMin || '00'}:${timeSec || '00'}` : (pendingMatchData.time || "00:00");

            const newMatch: Match = {
                id: Date.now(),
                timestamp: Date.now(),
                date: new Date().toLocaleDateString(),
                mode: pendingMatchData.mode || activeMode,
                player: pendingMatchData.player || activeUser,
                teammates: pendingMatchData.teammates || [],
                opponents: pendingMatchData.opponents || [],
                hero: pendingMatchData.hero || "",
                ship: pendingMatchData.ship || "",
                loadout: currentLoadout || undefined,
                reachModifiers: finalMods,
                kills: pendingMatchData.kills || {},
                result: (showWizard || 'Win') as 'Win' | 'Loss' | 'Draw',
                subType: subType || 'Combat',
                placement: pendingPlacement || undefined,
                damageTaken: pendingMatchData.damageTaken || 0,
                time: finalTime,
                poiEasy: pendingMatchData.poiEasy || 0,
                poiMedium: pendingMatchData.poiMedium || 0,
                poiEpic: pendingMatchData.poiEpic || 0,
                killedBy: pendingKilledBy || undefined,
                notes: pendingMatchData.notes || "",
                timelineEvents: [...(timelineEvents || [])],
                artifacts: []
            };

            // Add Match first
            addMatch(newMatch);

            // Bundle Artifacts (Async)
            const parts = finalTime.split(':').map(Number);
            const totalDurationSecs = ((parts[0] || 0) * 60) + (parts[1] || 0);
            const matchStart = sessionStartTime || (Date.now() - (totalDurationSecs * 1000));
            const matchEnd = Date.now();

            bundleMatchArtifacts(newMatch.id, matchStart, matchEnd).then(artifacts => {
                if (artifacts.length > 0) {
                    Logger.info('Submission', `Bundled ${artifacts.length} artifacts for match ${newMatch.id}`);
                    const updated = { ...newMatch, artifacts };
                    updateMatch(updated);
                }
            });

            // Comprehensive Recording for ID Mapping
            const myTeam = [activeUser, ...(pendingMatchData.teammates || [])];
            const explicitOpponents = (pendingMatchData.opponents || []);

            Object.entries(sessionTeams || {}).forEach(([color, players]) => {
                players.forEach(p => {
                    if (p === activeUser) return;
                    const ship = sessionShipTypes[p];
                    recordPlayerSighting(p, color, myTeam, explicitOpponents, ship);
                });
            });

            // Reset UI and State
            setShowWizard(null);
            setPendingMatchData(null);
            setPendingPlacement(null);
            setPendingArtifactType("");
            setPendingKilledBy("");
            setSelectedOpponents([]);
            setTimelineEvents([]);
            setIsMatchInProgress(false);
            setMatchStartTime(null);

            // Reset manual fields
            setPoiEasy(0); setPoiMedium(0); setPoiEpic(0); setKills({ "AI Legion": 0 });
            setTimeMin(""); setTimeSec(""); setSelectedReachModifiers([]);
            setDamageTaken(""); setCurrentNote(""); setActiveWeapons({});

            setToast({ message: "Mission Report Filed", type: 'success' });

        } catch (e) {
            Logger.error('Submission', 'Process failed', e);
            setToast({ message: "Submission error", type: 'error' });
        } finally {
            setSubmitting(false);
        }
    }, [submitting, addMatch, setPendingMatchData, setShowWizard, setPendingPlacement, setPendingArtifactType, setPendingKilledBy, setSelectedOpponents, setTimelineEvents, setIsMatchInProgress, setMatchStartTime, setPoiEasy, setPoiMedium, setPoiEpic, setKills, setTimeMin, setTimeSec, setSelectedReachModifiers, setDamageTaken, setCurrentNote, setActiveWeapons, setToast, playVictory, playDefeat, updateMatch, recordPlayerSighting]);

    return {
        initiateSubmission,
        processFinalSubmission,
        submitting
    };
};
