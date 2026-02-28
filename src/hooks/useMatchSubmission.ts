import { useCallback, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { Match } from '../types';
import confetti from 'canvas-confetti';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { applyArtifactRepair, bundleMatchArtifacts, getMatchArtifactsStructured } from '../utils/artifactService';
import { StorageService } from '../utils/storage';
import Logger from '../utils/logger';
import { capTeammateNames } from '../utils/teamLimits';
import { sanitizeLoadout } from '../utils/loadout';
import { evaluateTelemetryConsistencyChecks, formatDurationOffset } from '../utils/telemetryConsistency';
import {
    extractArtifactSourceFromReachModifiers,
    stripArtifactSourceModifiers,
} from '../utils/artifactSource';

const DEFAULT_ARTIFACT_LOOKBACK_MS = 10 * 60 * 1000;
const MAX_SHIP_WEAPON_SLOTS = 10;
const MAX_PROSPECTOR_SLOTS = 2;
const parseDurationSecs = (value: string | undefined): number => {
    if (!value) return 0;
    const parts = value.split(':').map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 0;
    return Math.max(0, (parts[0] * 60) + parts[1]);
};

const sanitizeLoadoutSlots = (loadout: Match['loadout'] | null) => (
    sanitizeLoadout(loadout || null, {
        shipWeaponSlots: MAX_SHIP_WEAPON_SLOTS,
        prospectorSlots: MAX_PROSPECTOR_SLOTS,
        perkSlots: MAX_PROSPECTOR_SLOTS,
    }) || undefined
);

const toArtifactKey = (value: string) => value.replace(/[\\/]+/g, '\\').toLowerCase();

const normalizeNameKey = (value: string | null | undefined): string =>
    String(value || '').trim().toLowerCase();

const ensureSelfInTeam = (teammates: string[] | null | undefined, playerName: string | null | undefined): string[] => {
    const cleanedPlayer = String(playerName || '').trim();
    const next = Array.isArray(teammates) ? [...teammates] : [];
    if (!cleanedPlayer) return next;
    const hasSelf = next.some((name) => normalizeNameKey(name) === normalizeNameKey(cleanedPlayer));
    return hasSelf ? next : [...next, cleanedPlayer];
};

const countComparableTeammates = (teammates: string[] | null | undefined, playerName: string | null | undefined): number => {
    const key = normalizeNameKey(playerName);
    if (!Array.isArray(teammates)) return 0;
    if (!key) return teammates.length;
    return teammates.filter((name) => normalizeNameKey(name) !== key).length;
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
                if (!m.timestamp || m.timestamp < recentCutoff) return false;
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
        const resolvedModifiersRaw = (selectedReachModifiers && selectedReachModifiers.length > 0)
            ? selectedReachModifiers
            : (unresolvedDraft?.reachModifiers || []);
        const resolvedModifiers = stripArtifactSourceModifiers(resolvedModifiersRaw);
        const extractedArtifactSource = extractArtifactSourceFromReachModifiers(
            resolvedModifiersRaw as Array<string | { name?: string; rawText?: string }>
        );
        const resolvedKills = hasActiveKills ? kills : (unresolvedDraft?.kills || kills);
        const teammateShipForCap = pickFirstKnown(
            activeShip,
            currentLoadout?.ship,
            unresolvedDraft?.loadout?.ship,
            unresolvedDraft?.ship
        );
        const cappedResolvedTeammates = capTeammateNames(resolvedTeammates, teammateShipForCap);
        const teamWithSelf = ensureSelfInTeam(cappedResolvedTeammates, unresolvedDraft?.player || activeUser);

        const data: Partial<Match> = {
            id: unresolvedDraft?.id,
            timestamp: unresolvedDraft?.timestamp,
            mode: unresolvedDraft?.mode || activeMode,
            player: unresolvedDraft?.player || activeUser,
            teammates: teamWithSelf,
            opponents: resolvedOpponents,
            hero: pickFirstKnown(activeHero, currentLoadout?.hero, unresolvedDraft?.loadout?.hero, unresolvedDraft?.hero) || undefined,
            ship: pickFirstKnown(activeShip, currentLoadout?.ship, unresolvedDraft?.loadout?.ship, unresolvedDraft?.ship) || undefined,
            loadout: sanitizeLoadoutSlots(currentLoadout || unresolvedDraft?.loadout || null),
            weapons: activeWeapons,
            reachModifiers: resolvedModifiers,
            artifactSource: extractedArtifactSource || unresolvedDraft?.artifactSource || undefined,
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

        const baseTelemetryConsistency = unresolvedDraft?.telemetryConsistency;
        if (baseTelemetryConsistency) {
            const evaluated = evaluateTelemetryConsistencyChecks(baseTelemetryConsistency, {
                teammateCount: countComparableTeammates(data.teammates, data.player),
                mode: data.mode,
                durationSeconds: parseDurationSecs(data.time),
            });
            data.telemetryConsistency = {
                ...baseTelemetryConsistency,
                checks: evaluated.checks,
                durationDeltaSeconds: evaluated.durationDeltaSeconds,
                durationToleranceSeconds: evaluated.durationToleranceSeconds,
            };
        }

        const healthWarnings: string[] = [];
        if (!data.ship) healthWarnings.push('missing ship');
        if (!data.hero) healthWarnings.push('missing hero');
        if (!data.time) healthWarnings.push('missing duration');
        if ((data.teammates?.length || 0) === 0 && (data.opponents?.length || 0) === 0) {
            healthWarnings.push('no players detected');
        }
        if (data.telemetryConsistency?.checks?.teammateCount === 'warn') {
            const expected = data.telemetryConsistency.expectedTeammateCount;
            const actual = countComparableTeammates(data.teammates, data.player);
            const hasEnteredTeammates = Array.isArray(data.teammates)
                && data.teammates.some((name) => String(name || '').trim().length > 0);
            const shouldSuppressEmptyEntryWarning = typeof expected === 'number'
                && expected > 0
                && actual === 0
                && !hasEnteredTeammates;
            if (!shouldSuppressEmptyEntryWarning) {
                if (typeof expected === 'number') {
                    healthWarnings.push(`team count mismatch (entered ${actual}, expected ${expected})`);
                } else {
                    healthWarnings.push('team count mismatch');
                }
            }
        }
        if (data.telemetryConsistency?.checks?.mode === 'warn') {
            healthWarnings.push(`mode mismatch (entered ${data.mode || 'Unknown'}, telemetry ${data.telemetryConsistency.expectedMode || 'Unknown'})`);
        }
        if (data.telemetryConsistency?.checks?.duration === 'warn') {
            const delta = Number(data.telemetryConsistency.durationDeltaSeconds || 0);
            healthWarnings.push(`duration off by ${formatDurationOffset(delta)}`);
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
            selectedTeammates, selectedOpponents,
            kills, poiEasy, poiMedium, poiEpic,
            damageTaken, currentNote,
            matches,
            sessionStartTime
        } = state;

        if (!pendingMatchData || submitting) return;
        const selectedResult = showWizard === 'Win' || showWizard === 'Loss' || showWizard === 'Draw'
            ? showWizard
            : null;
        if (!selectedResult) {
            setToast({ message: "Select Win/Loss/Draw before finalizing.", type: 'warning' });
            return;
        }
        if (!activeUser && !pendingMatchData.player) {
            setToast({ message: "Select a profile before finalizing.", type: 'error' });
            return;
        }
        const isLossCombat = selectedResult === 'Loss' && subType === 'Combat';
        const normalizedLossPlacement = Number.isFinite(Number(pendingPlacement))
            ? Math.min(5, Math.max(2, Number(pendingPlacement)))
            : null;
        if (isLossCombat && (normalizedLossPlacement == null || !Number.isInteger(normalizedLossPlacement))) {
            setToast({ message: "Combat losses require placement (2nd-5th).", type: 'warning' });
            return;
        }

        try {
            setSubmitting(true);
            const baseMods = (selectedReachModifiers && selectedReachModifiers.length > 0)
                ? selectedReachModifiers
                : (pendingMatchData.reachModifiers || []);
            let finalMods = [...baseMods];
            if (subType === 'Artifact') finalMods.push(`Artifact: ${pendingArtifactType || 'Healing'}`);

            if (selectedResult === 'Win') {
                confetti({ particleCount: 100, spread: 70 });
                playVictory();
            } else {
                playDefeat();
            }
            const finalTime = (timeMin || timeSec) ? `${timeMin || '00'}:${timeSec || '00'}` : (pendingMatchData.time || "00:00");
            const resolvedHero = pickFirstKnown(pendingMatchData.hero, currentLoadout?.hero, activeHero);
            const resolvedShip = pickFirstKnown(pendingMatchData.ship, currentLoadout?.ship, activeShip);
            const finalTeammatesRaw = (selectedTeammates && selectedTeammates.length > 0)
                ? selectedTeammates
                : (pendingMatchData.teammates || []);
            const finalTeammates = ensureSelfInTeam(capTeammateNames(finalTeammatesRaw, resolvedShip), pendingMatchData.player || activeUser);
            const finalOpponents = (selectedOpponents && selectedOpponents.length > 0)
                ? selectedOpponents
                : (pendingMatchData.opponents || []);
            const pendingKills = pendingMatchData.kills || {};
            const liveKills = kills || {};
            const finalKills = Object.entries({ ...pendingKills, ...liveKills }).reduce<Record<string, number>>((acc, [ship, value]) => {
                const parsed = Number(value) || 0;
                if (parsed > 0) acc[ship] = parsed;
                return acc;
            }, {});
            const finalDamageTaken = Math.max(
                Number(pendingMatchData.damageTaken) || 0,
                Number.parseInt(String(damageTaken || ''), 10) || 0
            );
            const finalPoiEasy = Math.max(Number(pendingMatchData.poiEasy) || 0, Number(poiEasy) || 0);
            const finalPoiMedium = Math.max(Number(pendingMatchData.poiMedium) || 0, Number(poiMedium) || 0);
            const finalPoiEpic = Math.max(Number(pendingMatchData.poiEpic) || 0, Number(poiEpic) || 0);
            const finalNotes = currentNote || pendingMatchData.notes || '';
            const finalPlacement = selectedResult === 'Win'
                ? 1
                : (selectedResult === 'Loss' && subType === 'Combat'
                    ? (normalizedLossPlacement ?? undefined)
                    : undefined);
            const pendingMatchId = Number(pendingMatchData.id || 0);
            const existingMatchByPendingId = Number.isInteger(pendingMatchId) && pendingMatchId > 0
                ? (Array.isArray(matches) ? matches.find((m: Match) => m.id === pendingMatchId) : undefined)
                : undefined;
            const recentCutoff = (typeof sessionStartTime === 'number' && sessionStartTime > 0)
                ? (sessionStartTime - 60_000)
                : (Date.now() - (6 * 60 * 60 * 1000));
            const fallbackTelemetryDraft = existingMatchByPendingId || !Array.isArray(matches)
                ? undefined
                : matches.find((m: Match) => {
                    if (!m || m.subType !== 'Telemetry Draft') return false;
                    if (!m.timestamp || Number(m.timestamp) < recentCutoff) return false;
                    const expectedPlayer = pendingMatchData.player || activeUser || '';
                    if (expectedPlayer && m.player && m.player !== expectedPlayer) return false;
                    return true;
                });
            const existingMatch = existingMatchByPendingId || fallbackTelemetryDraft;
            const finalEliminatedByTeam = (() => {
                const stored = String(pendingMatchData?.eliminatedByTeam || existingMatch?.eliminatedByTeam || '').trim();
                if (selectedResult !== 'Loss' || !stored) return undefined;
                return stored;
            })();
            const matchId = existingMatch?.id || Date.now();
            const matchTimestamp = existingMatch?.timestamp || pendingMatchData.timestamp || Date.now();
            const mergedLoadout = sanitizeLoadoutSlots(pendingMatchData.loadout || currentLoadout);
            const baseTelemetryConsistency = pendingMatchData.telemetryConsistency || existingMatch?.telemetryConsistency;
            const finalTelemetryConsistency = baseTelemetryConsistency
                ? (() => {
                    const evaluated = evaluateTelemetryConsistencyChecks(baseTelemetryConsistency, {
                        teammateCount: countComparableTeammates(finalTeammates, pendingMatchData.player || activeUser),
                        mode: pendingMatchData.mode || activeMode,
                        durationSeconds: parseDurationSecs(finalTime),
                    });
                    return {
                        ...baseTelemetryConsistency,
                        checks: evaluated.checks,
                        durationDeltaSeconds: evaluated.durationDeltaSeconds,
                        durationToleranceSeconds: evaluated.durationToleranceSeconds,
                    };
                })()
                : undefined;
            if (!existingMatchByPendingId && fallbackTelemetryDraft) {
                Logger.info('Submission', `Reusing telemetry draft ${fallbackTelemetryDraft.id} for final submission`);
            }

            const newMatch: Match = {
                id: matchId,
                timestamp: matchTimestamp,
                date: new Date(matchTimestamp).toLocaleDateString(),
                mode: pendingMatchData.mode || activeMode,
                player: pendingMatchData.player || activeUser,
                teammates: finalTeammates,
                opponents: finalOpponents,
                hero: resolvedHero,
                ship: resolvedShip,
                loadout: mergedLoadout,
                reachModifiers: finalMods,
                kills: Object.keys(finalKills).length > 0 ? finalKills : pendingKills,
                result: selectedResult,
                subType: subType || 'Combat',
                placement: finalPlacement,
                damageTaken: finalDamageTaken,
                time: finalTime,
                poiEasy: finalPoiEasy,
                poiMedium: finalPoiMedium,
                poiEpic: finalPoiEpic,
                killedBy: pendingKilledBy || undefined,
                killedByShip: pendingKilledByShip || undefined,
                notes: finalNotes,
                timelineEvents: [...(timelineEvents || [])],
                artifacts: [...(existingMatch?.artifacts || pendingMatchData.artifacts || [])],
                ocrDebug: pendingMatchData?.ocrDebug || undefined,
                opponentTeams: pendingMatchData?.opponentTeams || undefined,
                eliminatedByTeam: finalEliminatedByTeam,
                ocrState: pendingMatchData?.ocrState || existingMatch?.ocrState,
                telemetryConsistency: finalTelemetryConsistency,
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
            const telemetryDraftStart = existingMatch?.subType === 'Telemetry Draft'
                ? Number(matchTimestamp || 0)
                : 0;
            // Use the actual telemetry/manual match start when available.
            // When duration/timer context is unavailable, use a bounded lookback window.
            let matchStart = matchEnd - fallbackWindowMs;
            if (typeof matchStartTime === 'number' && matchStartTime > 0) {
                matchStart = matchStartTime;
            } else if (telemetryDraftStart > 0 && telemetryDraftStart <= matchEnd) {
                matchStart = telemetryDraftStart;
            }

            const bundledArtifacts = await bundleMatchArtifacts(newMatch.id, matchStart, matchEnd);
            let scopedRepairAppliedLinks = 0;
            try {
                const repairResult = await applyArtifactRepair({
                    matchId: newMatch.id,
                    startTime: matchStart,
                    endTime: matchEnd,
                });
                scopedRepairAppliedLinks = Number(repairResult?.summary?.appliedLinks || 0);
                if (scopedRepairAppliedLinks > 0) {
                    Logger.info('Submission', `Scoped artifact repair linked ${scopedRepairAppliedLinks} artifact(s) for match ${newMatch.id}`);
                }
            } catch (repairError) {
                Logger.warn('Submission', `Scoped artifact repair failed for match ${newMatch.id}`, repairError);
            }
            const structuredArtifacts = await getMatchArtifactsStructured(newMatch.id, [
                ...(newMatch.artifacts || []),
                ...bundledArtifacts,
            ]);
            const diskArtifacts = Array.isArray(structuredArtifacts.images) ? structuredArtifacts.images : [];
            const mergedArtifacts: string[] = [];
            const seenArtifactKeys = new Set<string>();
            const pushArtifact = (artifactPath?: string) => {
                if (!artifactPath || typeof artifactPath !== 'string' || !artifactPath.trim()) return;
                const key = toArtifactKey(artifactPath.trim());
                if (seenArtifactKeys.has(key)) return;
                seenArtifactKeys.add(key);
                mergedArtifacts.push(artifactPath.trim());
            };
            (newMatch.artifacts || []).forEach(pushArtifact);
            bundledArtifacts.forEach(pushArtifact);
            diskArtifacts.forEach(pushArtifact);

            const existingArtifacts = newMatch.artifacts || [];
            const artifactsChanged = mergedArtifacts.length !== existingArtifacts.length
                || mergedArtifacts.some((artifactPath, index) => artifactPath !== existingArtifacts[index]);

            if (artifactsChanged) {
                Logger.info('Submission', `Synced ${mergedArtifacts.length} artifact(s) for match ${newMatch.id} (bundled=${bundledArtifacts.length}, disk=${diskArtifacts.length})`);
                const updated = { ...newMatch, artifacts: mergedArtifacts };
                updateMatch(updated);
                await StorageService.flush();
            } else {
                Logger.info('Submission', `No artifact delta for match ${newMatch.id} (bundled=${bundledArtifacts.length}, disk=${diskArtifacts.length}, repairApplied=${scopedRepairAppliedLinks})`);
            }
            const myTeam = [activeUser, ...finalTeammates];
            const explicitOpponents = finalOpponents;

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
            setSelectedOpponents([]);
            setSessionTeams({});
            setTimelineEvents([]);
            setIsMatchInProgress(false);
            setMatchStartTime(null);
            setPoiEasy(0); setPoiMedium(0); setPoiEpic(0); setKills({ "AI Legion": 0 });
            setTimeMin(""); setTimeSec(""); setSelectedReachModifiers([]);
            setDamageTaken(""); setCurrentNote(""); setActiveWeapons({});

            window.dispatchEvent(new CustomEvent('recording:match-complete', { detail: { result: submittedResult } }));
            const artifactSuffix = mergedArtifacts.length > 0 ? ` · ${mergedArtifacts.length} screenshot${mergedArtifacts.length === 1 ? '' : 's'} bundled` : '';
            setToast({ message: `Match recorded: ${submittedResult}${artifactSuffix}`, type: 'success' });

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


