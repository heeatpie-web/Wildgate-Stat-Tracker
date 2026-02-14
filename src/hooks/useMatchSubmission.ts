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

const DEFAULT_ARTIFACT_LOOKBACK_MS = 10 * 60 * 1000;
const parseDurationSecs = (value: string | undefined): number => {
    if (!value) return 0;
    const parts = value.split(':').map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 0;
    return Math.max(0, (parts[0] * 60) + parts[1]);
};

const sanitizeLoadoutSlots = (loadout: Match['loadout'] | null) => {
    if (!loadout) return undefined;
    return {
        ...loadout,
        weapons: (loadout.weapons || []).filter(Boolean).slice(0, 2),
        equipment: (loadout.equipment || []).filter(Boolean).slice(0, 2),
    };
};

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
            poiEasy, poiMedium, poiEpic,
            pendingMatchData,
            matches,
            sessionStartTime
        } = state;

        if (!activeUser) {
            setToast({ message: "No profile selected. You can review now and pick one before finalizing.", type: 'warning' });
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
        const pendingMatchId = Number(pendingMatchData?.id || 0);
        const pendingDraft = Number.isInteger(pendingMatchId) && pendingMatchId > 0
            ? (Array.isArray(matches) ? matches.find((m: Match) => m.id === pendingMatchId && m.subType === 'Telemetry Draft') : undefined)
            : undefined;
        const recentCutoff = (typeof sessionStartTime === 'number' && sessionStartTime > 0)
            ? (sessionStartTime - 60_000)
            : (Date.now() - (6 * 60 * 60 * 1000));
        const unresolvedDraft = pendingDraft || (Array.isArray(matches)
            ? matches.find((m: Match) => {
                if (m.subType !== 'Telemetry Draft') return false;
                if (m.timestamp < recentCutoff) return false;
                if (activeUser && m.player && m.player !== activeUser) return false;
                return true;
            })
            : undefined);
        const hasActiveKills = Object.values(kills || {}).some(v => Number(v) > 0);
        const resolvedTeammates = (selectedTeammates && selectedTeammates.length > 0)
            ? selectedTeammates
            : (unresolvedDraft?.teammates || []);
        const resolvedOpponents = (selectedOpponents && selectedOpponents.length > 0)
            ? selectedOpponents
            : (unresolvedDraft?.opponents || []);
        const resolvedModifiers = (selectedReachModifiers && selectedReachModifiers.length > 0)
            ? selectedReachModifiers
            : (unresolvedDraft?.reachModifiers || []);
        const resolvedKills = hasActiveKills ? kills : (unresolvedDraft?.kills || kills);

        const data: Partial<Match> = {
            id: unresolvedDraft?.id,
            timestamp: unresolvedDraft?.timestamp,
            mode: unresolvedDraft?.mode || activeMode,
            player: unresolvedDraft?.player || activeUser,
            teammates: resolvedTeammates,
            opponents: resolvedOpponents,
            hero: pickFirstKnown(activeHero, currentLoadout?.hero, unresolvedDraft?.loadout?.hero, unresolvedDraft?.hero) || undefined,
            ship: pickFirstKnown(activeShip, currentLoadout?.ship, unresolvedDraft?.loadout?.ship, unresolvedDraft?.ship) || undefined,
            loadout: sanitizeLoadoutSlots(currentLoadout || unresolvedDraft?.loadout || null),
            weapons: activeWeapons,
            reachModifiers: resolvedModifiers,
            kills: resolvedKills,
            time: timeStr || unresolvedDraft?.time || '',
            poiEasy,
            poiMedium,
            poiEpic,
            damageTaken: dmg,
            notes: currentNote || unresolvedDraft?.notes || '',
            artifacts: unresolvedDraft?.artifacts ? [...unresolvedDraft.artifacts] : undefined,
            ocrState: unresolvedDraft?.ocrState
        };

        if (unresolvedDraft) {
            setToast({ message: 'Telemetry draft loaded for this submission.', type: 'info' });
        }

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
            selectedReachModifiers,
            matches
        } = state;

        if (!pendingMatchData || submitting) return;
        if (!activeUser && !pendingMatchData.player) {
            setToast({ message: "Select a profile before finalizing.", type: 'error' });
            return;
        }

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
            const pendingMatchId = Number(pendingMatchData.id || 0);
            const existingMatch = Number.isInteger(pendingMatchId) && pendingMatchId > 0
                ? (Array.isArray(matches) ? matches.find((m: Match) => m.id === pendingMatchId) : undefined)
                : undefined;
            const matchId = existingMatch?.id || Date.now();
            const matchTimestamp = existingMatch?.timestamp || pendingMatchData.timestamp || Date.now();
            const mergedLoadout = sanitizeLoadoutSlots(pendingMatchData.loadout || currentLoadout);

            const newMatch: Match = {
                id: matchId,
                timestamp: matchTimestamp,
                date: new Date(matchTimestamp).toLocaleDateString(),
                mode: pendingMatchData.mode || activeMode,
                player: pendingMatchData.player || activeUser,
                teammates: pendingMatchData.teammates || [],
                opponents: pendingMatchData.opponents || [],
                hero: resolvedHero,
                ship: resolvedShip,
                loadout: mergedLoadout,
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
                artifacts: [...(existingMatch?.artifacts || pendingMatchData.artifacts || [])],
                ocrDebug: pendingMatchData?.ocrDebug || undefined,
                opponentTeams: pendingMatchData?.opponentTeams || undefined,
                ocrState: pendingMatchData?.ocrState || existingMatch?.ocrState
            };
            const submittedResult = newMatch.result;
            if (existingMatch) {
                updateMatch(newMatch);
            } else {
                addMatch(newMatch);
            }
            await StorageService.flush();
            const totalDurationSecs = parseDurationSecs(finalTime);
            const matchEnd = Date.now();
            const fallbackWindowMs = totalDurationSecs > 0
                ? totalDurationSecs * 1000
                : DEFAULT_ARTIFACT_LOOKBACK_MS;
            // Use the actual telemetry/manual match start when available.
            // When duration/timer context is unavailable, use a bounded lookback window.
            const matchStart = (typeof matchStartTime === 'number' && matchStartTime > 0)
                ? matchStartTime
                : (matchEnd - fallbackWindowMs);

            const artifacts = await bundleMatchArtifacts(newMatch.id, matchStart, matchEnd);
            if (artifacts.length > 0) {
                Logger.info('Submission', `Bundled ${artifacts.length} artifacts for match ${newMatch.id}`);
                const mergedArtifacts = Array.from(new Set([...(newMatch.artifacts || []), ...artifacts]));
                const updated = { ...newMatch, artifacts: mergedArtifacts };
                updateMatch(updated);
                await StorageService.flush();
            } else {
                Logger.info('Submission', `No artifacts bundled for match ${newMatch.id}`);
            }
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

            window.dispatchEvent(new CustomEvent('recording:match-complete', { detail: { result: submittedResult } }));
            setToast({ message: `Match recorded: ${submittedResult}`, type: 'success' });

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


