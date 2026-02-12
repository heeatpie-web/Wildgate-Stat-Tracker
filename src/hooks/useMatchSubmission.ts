import { useCallback, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { Match } from '../types';
import confetti from 'canvas-confetti';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { bundleMatchArtifacts } from '../utils/artifactService';
import { StorageService } from '../utils/storage';
import Logger from '../utils/logger';

export const useMatchSubmission = () => {
    const {
        addMatch,
        setPendingMatchData,
        setPendingPlacement,
        setPendingArtifactType,
        setPendingKilledBy,
        setPendingKilledByShip,
        setSelectedTeammates,
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
        setTimelineEvents,
        setSessionTeams
    } = useGameData();

    const {
        setToast,
        setShowWizard
    } = useUIState();

    const { playVictory, playDefeat } = useSoundEffects();
    const [submitting, setSubmitting] = useState(false);

    const pickFirstKnown = (...values: Array<string | undefined | null>) => {
        const known = values.find(v => v && !/^unknown/i.test(v));
        return known || values.find(v => v) || '';
    };

    const initiateSubmission = useCallback((result: 'Win' | 'Loss' | 'Draw') => {
        const state = useAppStore.getState();
        const {
            activeUser, activeMode,
            selectedTeammates, selectedOpponents,
            activeHero, activeShip, activeWeapons, currentLoadout,
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
        if (isMatchInProgress && matchStartTime && !timeMin && !timeSec) {
            const durationMs = Date.now() - matchStartTime;
            const totalSeconds = Math.floor(durationMs / 1000);
            finalTimeMin = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            finalTimeSec = (totalSeconds % 60).toString().padStart(2, '0');
            setIsMatchInProgress(false);
            setMatchStartTime(null);
        }

        const timeStr = (finalTimeMin || finalTimeSec) ? `${finalTimeMin || '00'}:${finalTimeSec || '00'}` : "";
        const dmg = Math.max(0, Math.min(15000, parseInt(damageTaken) || 0));
        const data: Partial<Match> = {
            mode: activeMode,
            player: activeUser,
            teammates: selectedTeammates,
            opponents: selectedOpponents,
            hero: pickFirstKnown(activeHero, currentLoadout?.hero) || undefined,
            ship: pickFirstKnown(activeShip, currentLoadout?.ship) || undefined,
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

        const healthWarnings: string[] = [];
        if (!data.ship) healthWarnings.push('missing ship');
        if (!data.hero) healthWarnings.push('missing hero');
        if (!data.time) healthWarnings.push('missing duration');
        if ((data.teammates?.length || 0) === 0 && (data.opponents?.length || 0) === 0) {
            healthWarnings.push('no players detected');
        }
        if (healthWarnings.length > 0) {
            setToast({ message: `Health check: ${healthWarnings.join(', ')}`, type: 'warning' });
        }

        setPendingMatchData(data);
        setShowWizard(result);
    }, [setToast, setPendingMatchData, setShowWizard, setIsMatchInProgress, setMatchStartTime, pickFirstKnown]);

    const processFinalSubmission = useCallback(async (subType: string) => {
        const state = useAppStore.getState();
        const {
            pendingMatchData, showWizard,
            pendingPlacement, pendingArtifactType, pendingKilledBy, pendingKilledByShip,
            timeMin, timeSec, activeUser, activeMode,
            currentLoadout, timelineEvents, matchStartTime,
            sessionTeams, sessionShipTypes,
            activeHero, activeShip,
            selectedReachModifiers
        } = state;

        if (!pendingMatchData || submitting) return;

        try {
            setSubmitting(true);
            const baseMods = (selectedReachModifiers && selectedReachModifiers.length > 0)
                ? selectedReachModifiers
                : (pendingMatchData.reachModifiers || []);
            let finalMods = [...baseMods];
            if (subType === 'Artifact') finalMods.push(`Artifact: ${pendingArtifactType || 'Healing'}`);

            if (showWizard === 'Win') {
                confetti({ particleCount: 100, spread: 70 });
                playVictory();
            } else {
                playDefeat();
            }
            const finalTime = (timeMin || timeSec) ? `${timeMin || '00'}:${timeSec || '00'}` : (pendingMatchData.time || "00:00");

            const resolvedHero = pickFirstKnown(pendingMatchData.hero, currentLoadout?.hero, activeHero);
            const resolvedShip = pickFirstKnown(pendingMatchData.ship, currentLoadout?.ship, activeShip);

            const newMatch: Match = {
                id: Date.now(),
                timestamp: Date.now(),
                date: new Date().toLocaleDateString(),
                mode: pendingMatchData.mode || activeMode,
                player: pendingMatchData.player || activeUser,
                teammates: pendingMatchData.teammates || [],
                opponents: pendingMatchData.opponents || [],
                hero: resolvedHero,
                ship: resolvedShip,
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
                killedByShip: pendingKilledByShip || undefined,
                notes: pendingMatchData.notes || "",
                timelineEvents: [...(timelineEvents || [])],
                artifacts: [],
                ocrDebug: pendingMatchData?.ocrDebug || undefined,
                opponentTeams: pendingMatchData?.opponentTeams || undefined
            };
            addMatch(newMatch);
            await StorageService.flush();
            const parts = finalTime.split(':').map(Number);
            const totalDurationSecs = ((parts[0] || 0) * 60) + (parts[1] || 0);
            const matchEnd = Date.now();
            // Use the actual telemetry/manual match start when available.
            // Falling back to duration keeps artifact bundling bounded to the current report.
            const matchStart = (typeof matchStartTime === 'number' && matchStartTime > 0)
                ? matchStartTime
                : (matchEnd - (totalDurationSecs * 1000));

            bundleMatchArtifacts(newMatch.id, matchStart, matchEnd).then(artifacts => {
                if (artifacts.length > 0) {
                    Logger.info('Submission', `Bundled ${artifacts.length} artifacts for match ${newMatch.id}`);
                    const updated = { ...newMatch, artifacts };
                    updateMatch(updated);
                }
            });
            const myTeam = [activeUser, ...(pendingMatchData.teammates || [])];
            const explicitOpponents = (pendingMatchData.opponents || []);

            Object.entries(sessionTeams || {}).forEach(([color, players]) => {
                players.forEach(p => {
                    if (p === activeUser) return;
                    const ship = sessionShipTypes[p];
                    recordPlayerSighting(p, color, myTeam, explicitOpponents, ship);
                });
            });
            setShowWizard(null);
            setPendingMatchData(null);
            setPendingPlacement(null);
            setPendingArtifactType("");
            setPendingKilledBy("");
            setPendingKilledByShip("");
            setSelectedTeammates([]);
            setSelectedOpponents([]);
            setSessionTeams({});
            setTimelineEvents([]);
            setIsMatchInProgress(false);
            setMatchStartTime(null);
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
    }, [submitting, addMatch, setPendingMatchData, setShowWizard, setPendingPlacement, setPendingArtifactType, setPendingKilledBy, setPendingKilledByShip, setSelectedOpponents, setTimelineEvents, setIsMatchInProgress, setMatchStartTime, setPoiEasy, setPoiMedium, setPoiEpic, setKills, setTimeMin, setTimeSec, setSelectedReachModifiers, setDamageTaken, setCurrentNote, setActiveWeapons, setToast, playVictory, playDefeat, updateMatch, recordPlayerSighting, pickFirstKnown]);

    return {
        initiateSubmission,
        processFinalSubmission,
        submitting
    };
};


