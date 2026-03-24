import { useCallback, useRef, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { Match, OpponentTeam } from '../types';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { applyArtifactRepair, bundleMatchArtifacts, getMatchArtifactsStructured, removeAllMatchArtifacts, rerunOCRMulti } from '../utils/artifactService';
import { StorageService } from '../utils/storage';
import { getElectronAPI } from '../utils/electronAPI';
import Logger from '../utils/logger';
import { capTeammateNames } from '../utils/teamLimits';
import { evaluateTelemetryConsistencyChecks, formatDurationOffset } from '../utils/telemetryConsistency';
import { sanitizeLoadout } from '../utils/loadout';
import type { ExtractedModifier, ExtractedPlayer, OCRExtractedData } from '../utils/ocr/ocrTypes';
import {
    getRosterCandidatePruneIds,
    getRosterCandidatePruneIdsForAcceptedName,
} from '../utils/pendingReviewUtils';
import { buildRosterAutoPopulateDecisions } from '../utils/rosterAutoPopulate';
import {
    extractArtifactSourceFromOcrData,
    extractArtifactSourceFromReachModifiers,
    stripArtifactSourceModifiers,
} from '../utils/artifactSource';
import { buildOcrNameConfidenceMapFromExtractedData } from '../utils/ocr/nameSourceHints';
import { sanitizeOpponentTeamsAgainstFriendlyRoster } from '../utils/ocr/friendlyTeamDeduper';
import { backfillOpponentTeamShipTypes } from '../utils/ocr/opponentTeamShipTypes';

const DEFAULT_ARTIFACT_LOOKBACK_MS = 10 * 60 * 1000;
const SCOPED_ARTIFACT_REPAIR_POSTMATCH_GRACE_MS = 5 * 60 * 1000;
const IMAGE_ARTIFACT_PATTERN = /\.(png|jpe?g|webp|bmp|gif)$/i;
const IS_LOADOUT_TRACE_ENABLED = import.meta.env.DEV || process.env.NODE_ENV === 'test';
const canLaunchConfetti = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase();
    return !userAgent.includes('jsdom');
};
const launchVictoryConfetti = () => {
    if (!canLaunchConfetti()) return;
    void import('canvas-confetti')
        .then(({ default: confetti }) => confetti({ particleCount: 100, spread: 70 }))
        .catch((error) => {
            Logger.warn('MatchSubmission', `Unable to launch confetti: ${error instanceof Error ? error.message : String(error)}`);
        });
};
const parseDurationSecs = (value: string | undefined): number => {
    if (!value) return 0;
    const parts = value.split(':').map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 0;
    return Math.max(0, (parts[0] * 60) + parts[1]);
};

const isReadyTelemetryDraft = (match: Match | null | undefined): match is Match => (
    Boolean(match)
    && match?.subType === 'Telemetry Draft'
    && (match.telemetryDraftState === 'ready' || match.telemetryDraftState == null)
);

const isFinalizableTelemetryDraft = (match: Match | null | undefined): match is Match => (
    Boolean(match)
    && match?.subType === 'Telemetry Draft'
    && (
        match.telemetryDraftState === 'active'
        || match.telemetryDraftState === 'ready'
        || match.telemetryDraftState == null
    )
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

const mergeArtifactLists = (...artifactLists: Array<Array<string | null | undefined> | null | undefined>): string[] => {
    const seen = new Set<string>();
    const merged: string[] = [];
    artifactLists.forEach((artifactList) => {
        (artifactList || []).forEach((artifactPath) => {
            const normalized = String(artifactPath || '').trim();
            if (!normalized) return;
            if (!normalized.startsWith('data:image/') && !IMAGE_ARTIFACT_PATTERN.test(normalized)) return;
            const key = toArtifactKey(normalized);
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(normalized);
        });
    });
    return merged;
};

type DeleteMatchArtifactsParams = {
    matchId: number;
    artifacts?: string[] | null;
    deleteMatch: (matchId: number) => void;
    notifyArtifactsConsumed?: (matchId: number, artifactPaths: string[]) => void;
};

export const removeMatchArtifactsThenDelete = async ({
    matchId,
    artifacts,
    deleteMatch,
    notifyArtifactsConsumed,
}: DeleteMatchArtifactsParams) => {
    const normalizedMatchId = Number(matchId);
    if (!Number.isInteger(normalizedMatchId) || normalizedMatchId <= 0) {
        return { removedPaths: [], failedPaths: [] };
    }

    const fallbackArtifacts = Array.isArray(artifacts)
        ? artifacts.filter((artifactPath) => typeof artifactPath === 'string' && artifactPath.trim().length > 0)
        : [];
    const cleanup = await removeAllMatchArtifacts(normalizedMatchId, fallbackArtifacts);

    if (cleanup.removedPaths.length > 0) {
        notifyArtifactsConsumed?.(normalizedMatchId, cleanup.removedPaths);
    }

    deleteMatch(normalizedMatchId);
    return cleanup;
};

type AutoResultScreenData = {
    result: 'Win' | 'Loss' | null;
    winType?: string | null;
    placement?: number | null;
    detectionMethod?: 'flash' | 'text';
    damageTaken?: number | null;
    damageSourcesAvailable?: boolean;
};

type AutoResultCaptureArtifact = {
    imageBase64: string;
    kind?: 'damage-sources' | 'damage-ships';
};

type AutoFinalizeResultStatus = {
    success: boolean;
    reason?: 'busy' | 'unconfirmed' | 'incomplete' | 'no-draft' | 'ipc-unavailable' | 'save-failed' | 'error';
    matchId?: number;
    artifactPath?: string | null;
    artifactPaths?: string[];
};

const normalizeResultSubType = (winType: string | null | undefined, placement?: number | null): 'Artifact' | 'Combat' | null => {
    const normalized = String(winType || '').trim().toLowerCase();
    if (normalized === 'artifact') return 'Artifact';
    if (normalized === 'combat') return 'Combat';
    if (Number.isInteger(Number(placement)) && Number(placement) >= 2 && Number(placement) <= 5) return 'Combat';
    return null;
};

const resolveSavedOcrMeta = (
    pendingMatchData: Partial<Match> | null | undefined,
    existingMatch: Match | null | undefined,
    options?: { forceSaved?: boolean }
): Pick<Match, 'ocrState' | 'ocrReviewedAt'> => {
    const reviewedAtRaw = Number(pendingMatchData?.ocrReviewedAt ?? existingMatch?.ocrReviewedAt ?? 0);
    const ocrReviewedAt = Number.isFinite(reviewedAtRaw) && reviewedAtRaw > 0
        ? reviewedAtRaw
        : undefined;
    if (options?.forceSaved || ocrReviewedAt) {
        return {
            ocrState: 'saved',
            ocrReviewedAt,
        };
    }
    return {
        ocrState: pendingMatchData?.ocrState || existingMatch?.ocrState,
        ocrReviewedAt: undefined,
    };
};

const mergeTextLines = (...lineSets: Array<Array<string | null | undefined> | null | undefined>): string[] => {
    const seen = new Set<string>();
    const merged: string[] = [];
    lineSets.forEach((lineSet) => {
        (lineSet || []).forEach((entry) => {
            const normalized = String(entry || '').trim();
            if (!normalized) return;
            const key = normalized.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(normalized);
        });
    });
    return merged;
};

const dedupeNames = (...nameSets: Array<Array<string | null | undefined> | null | undefined>): string[] => {
    const seen = new Set<string>();
    const merged: string[] = [];
    nameSets.forEach((nameSet) => {
        (nameSet || []).forEach((entry) => {
            const normalized = String(entry || '').trim();
            if (!normalized) return;
            const key = normalizeNameKey(normalized);
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(normalized);
        });
    });
    return merged;
};

const coerceExtractedPlayerName = (entry: string | ExtractedPlayer | null | undefined): string =>
    typeof entry === 'string'
        ? entry
        : String(entry?.name || '');

const toCanonicalModifierNames = (
    modifiers: Array<string | ExtractedModifier> | null | undefined,
    hazards: string[] | null | undefined,
): string[] => {
    const merged = dedupeNames(
        (modifiers || []).map((entry) => (
            typeof entry === 'string'
                ? entry
                : entry?.name
        )),
        hazards || [],
    );
    return stripArtifactSourceModifiers(merged);
};

const buildSilentBackgroundOcrMatch = ({
    match,
    combined,
    activeUser,
}: {
    match: Match;
    combined: OCRExtractedData;
    activeUser?: string | null;
}): Match => {
    const activeUserKey = normalizeNameKey(activeUser || match.player || '');
    const isActiveUserLike = (rawName: string | null | undefined): boolean => {
        const key = normalizeNameKey(rawName);
        return !!key && key === activeUserKey;
    };

    const nextTeammateNames = (combined.teammates || [])
        .map(coerceExtractedPlayerName)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .filter((entry) => !isActiveUserLike(entry));

    const unresolvedOpponentTeams: OpponentTeam[] = (combined.opponentTeams || []).map((team, index) => ({
        teamName: String(team?.teamName || `Enemy Team ${index + 1}`).trim() || `Enemy Team ${index + 1}`,
        shipType: String(team?.shipType || '').trim(),
        color: String(team?.color || 'unknown').trim() || 'unknown',
        players: dedupeNames((team?.players || []).map((player) => coerceExtractedPlayerName(player))),
        sourceRowIndex: typeof team?.sourceRowIndex === 'number' ? team.sourceRowIndex : undefined,
        sourceRowY: typeof team?.sourceRowY === 'number' ? team.sourceRowY : undefined,
    }));

    const friendlyTeamSanitization = sanitizeOpponentTeamsAgainstFriendlyRoster({
        teams: unresolvedOpponentTeams,
        activeUser: activeUser || match.player || '',
        friendlyPlayers: [
            ...(match.teammates || []),
            ...nextTeammateNames,
        ],
        friendlyTeamLabels: [
            combined.playerTeamName,
            combined.playerShip?.teamName,
            combined.playerShipName,
            combined.playerShip?.shipType,
            match.ship,
        ],
    });

    const shipForTeammateCap = String(combined.playerShip?.shipType || match.ship || '').trim();
    const nextOpponentTeams = backfillOpponentTeamShipTypes(friendlyTeamSanitization.teams, {
        sessionShipTypes: {},
        enemyShips: combined.enemyShips,
    });
    const nextOpponents = dedupeNames(
        match.opponents || [],
        nextOpponentTeams.flatMap((team) => team.players || []).filter((name) => !isActiveUserLike(name)),
    );
    const nextTeammates = capTeammateNames(
        dedupeNames(
            match.teammates || [],
            nextTeammateNames,
            friendlyTeamSanitization.promotedFriendlyPlayers,
        ),
        shipForTeammateCap,
    );

    const nextArtifactSource = extractArtifactSourceFromOcrData(
        (combined.reachModifiers || []) as Array<string | ExtractedModifier>,
        (combined.hazards || []) as Array<string | ExtractedModifier>,
        combined.artifactType,
    );
    const nextModifierNames = dedupeNames(
        match.reachModifiers || [],
        toCanonicalModifierNames(
            (combined.reachModifiers || []) as Array<string | ExtractedModifier>,
            combined.hazards || [],
        ),
    );
    const nextNameConfidence = buildOcrNameConfidenceMapFromExtractedData(combined);
    const reviewedAt = Number(match.ocrReviewedAt || 0);

    return {
        ...match,
        ship: shipForTeammateCap || match.ship,
        teammates: nextTeammates,
        opponents: nextOpponents,
        opponentTeams: nextOpponentTeams.length > 0 ? nextOpponentTeams : (match.opponentTeams || []),
        reachModifiers: nextModifierNames,
        artifactSource: String(nextArtifactSource || match.artifactSource || '').trim() || undefined,
        ocrDebug: {
            ...(match.ocrDebug || {}),
            rawText: combined.rawText || match.ocrDebug?.rawText,
            confidence: combined.overallConfidence || match.ocrDebug?.confidence,
            hazards: Array.isArray(combined.hazards)
                ? Array.from(new Set(combined.hazards.map((hazard) => String(hazard || '').trim()).filter(Boolean)))
                : match.ocrDebug?.hazards,
            source: combined.ocrSource || match.ocrDebug?.source,
            fallbackReason: combined.ocrFallbackReason || match.ocrDebug?.fallbackReason,
            cloudError: combined.ocrCloudError || match.ocrDebug?.cloudError,
            geminiError: combined.ocrGeminiError || match.ocrDebug?.geminiError,
            mergeStats: combined.mergeStats ? {
                total: combined.mergeStats.total,
                agreed: combined.mergeStats.agreed,
                cloudPreferred: combined.mergeStats.cloudPreferred,
                localOnly: combined.mergeStats.localOnly,
                cloudOnly: combined.mergeStats.cloudOnly,
                conflicts: combined.mergeStats.conflicts,
            } : match.ocrDebug?.mergeStats,
            nameConfidence: Object.keys(nextNameConfidence).length > 0
                ? nextNameConfidence
                : match.ocrDebug?.nameConfidence,
            playerTeamName: String(
                combined.playerTeamName
                || combined.playerShip?.teamName
                || match.ocrDebug?.playerTeamName
                || match.ocrDebug?.playerShipTeamName
                || ''
            ).trim() || undefined,
            playerShipTeamName: String(
                combined.playerShip?.teamName
                || combined.playerTeamName
                || match.ocrDebug?.playerShipTeamName
                || match.ocrDebug?.playerTeamName
                || ''
            ).trim() || undefined,
            playerShipName: String(
                combined.playerShipName
                || combined.playerTeamName
                || combined.playerShip?.teamName
                || match.ocrDebug?.playerShipName
                || ''
            ).trim() || undefined,
            timestamp: Date.now(),
        },
        ocrState: reviewedAt > 0 ? 'saved' : 'reviewing',
        ocrReviewedAt: reviewedAt > 0 ? reviewedAt : undefined,
    };
};

const extractOcrLines = (ocrPayload: unknown): string[] => {
    if (!ocrPayload || typeof ocrPayload !== 'object') return [];
    const record = ocrPayload as Record<string, unknown>;
    const explicitLines = Array.isArray(record.lines)
        ? record.lines
            .map((line) => {
                if (typeof line === 'string') return line;
                if (line && typeof line === 'object') {
                    const lineRecord = line as Record<string, unknown>;
                    return typeof lineRecord.text === 'string' ? lineRecord.text : '';
                }
                return '';
            })
            .filter((line): line is string => typeof line === 'string')
        : [];
    if (explicitLines.length > 0) {
        return mergeTextLines(explicitLines);
    }
    const fullText = typeof record.text === 'string' ? record.text : '';
    return mergeTextLines(fullText.split(/\r?\n/g));
};

const resolveExistingSubmissionMatch = ({
    pendingMatchData,
    matches,
    activeUser,
    sessionStartTime,
}: {
    pendingMatchData: Partial<Match>;
    matches: Match[] | null | undefined;
    activeUser: string | null | undefined;
    sessionStartTime: number | null | undefined;
}): Match | undefined => {
    const pendingMatchId = Number(pendingMatchData.id || 0);
    if (Number.isInteger(pendingMatchId) && pendingMatchId > 0) {
        const existingMatch = Array.isArray(matches) ? matches.find((match) => match.id === pendingMatchId) : undefined;
        if (!existingMatch) return undefined;
        if (existingMatch.subType !== 'Telemetry Draft') return existingMatch;
        return isReadyTelemetryDraft(existingMatch) ? existingMatch : undefined;
    }
    if (!Array.isArray(matches)) return undefined;

    const expectedPlayer = String(pendingMatchData.player || activeUser || '').trim();
    const pendingTimestamp = Number(pendingMatchData.timestamp || 0);
    const recentCutoff = (typeof sessionStartTime === 'number' && sessionStartTime > 0)
        ? (sessionStartTime - 60_000)
        : (Date.now() - (6 * 60 * 60 * 1000));

    const telemetryDrafts = matches.filter((match) => {
        if (!isReadyTelemetryDraft(match)) return false;
        if (!match.timestamp || Number(match.timestamp) < recentCutoff) return false;
        if (expectedPlayer && match.player && match.player !== expectedPlayer) return false;
        return true;
    });
    const timestampMatchedDrafts = pendingTimestamp > 0
        ? telemetryDrafts.filter((match) => Number(match.timestamp || 0) === pendingTimestamp)
        : telemetryDrafts;

    return [...timestampMatchedDrafts]
        .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))[0];
};

const applyRosterAutoPopulationForSavedMatch = (match: Match) => {
    const store = useAppStore.getState();
    if (!store.autoPopulateRosterOnSave) {
        return { added: 0, merged: 0, reviewed: 0, refreshed: 0 };
    }

    const decisions = buildRosterAutoPopulateDecisions({
        match,
        pilotRegistry: store.pilotRegistry,
        pendingReviews: store.pendingReviews,
        dismissedCandidateKeys: store.dismissedRosterCandidateKeys,
    });
    if (decisions.length === 0) {
        return { added: 0, merged: 0, reviewed: 0, refreshed: 0 };
    }

    const seenAt = Number(match.timestamp || Date.now());
    const firstSeenMatchId = String(match.id || '');
    const buildDetectedMeta = (confidence: number) => ({
        origin: 'ocr' as const,
        status: 'detected' as const,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        lastConfidence: confidence,
        firstSeenMatchId,
    });

    let added = 0;
    let merged = 0;
    let reviewed = 0;
    let refreshed = 0;

    decisions.forEach((decision) => {
        const currentState = useAppStore.getState();
        switch (decision.type) {
            case 'exact': {
                const acceptedName = decision.bestMatch || decision.name;
                currentState.addToRegistry(acceptedName, buildDetectedMeta(decision.confidence));
                const pruneIds = getRosterCandidatePruneIdsForAcceptedName({
                    pendingReviews: currentState.pendingReviews,
                    acceptedName,
                });
                if (pruneIds.length > 0) {
                    currentState.removePendingReviews(pruneIds);
                }
                refreshed += 1;
                break;
            }
            case 'add': {
                currentState.addToRegistry(decision.name, buildDetectedMeta(decision.confidence));
                const pruneIds = getRosterCandidatePruneIdsForAcceptedName({
                    pendingReviews: currentState.pendingReviews,
                    acceptedName: decision.name,
                });
                if (pruneIds.length > 0) {
                    currentState.removePendingReviews(pruneIds);
                }
                added += 1;
                break;
            }
            case 'merge': {
                const targetName = String(decision.bestMatch || '').trim();
                if (!targetName) break;
                currentState.recordOcrAliasCorrection(decision.name, targetName, {
                    context: 'matchstats',
                    confidenceWeight: Math.min(1, Math.max(0.6, Math.max(decision.confidence, decision.bestScore) / 100)),
                });
                currentState.addToRegistry(targetName, buildDetectedMeta(decision.confidence));
                const pruneIds = getRosterCandidatePruneIds({
                    pendingReviews: currentState.pendingReviews,
                    rawName: decision.name,
                    canonicalTargetKey: targetName,
                });
                if (pruneIds.length > 0) {
                    currentState.removePendingReviews(pruneIds);
                }
                merged += 1;
                break;
            }
            case 'review': {
                currentState.addPendingReview({
                    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    type: 'roster_candidate',
                    value: decision.name,
                    originalConfidence: decision.confidence,
                    context: 'Match Save',
                    bestMatch: decision.bestMatch || undefined,
                    bestScore: decision.bestScore || undefined,
                    suggestions: decision.suggestions,
                    canonicalTargetKey: decision.canonicalTargetKey || undefined,
                    source: 'ocr',
                });
                reviewed += 1;
                break;
            }
            case 'ignore':
            default:
                break;
        }
    });

    return { added, merged, reviewed, refreshed };
};

export const useMatchSubmission = () => {
    const {
        addMatch,
        deleteMatch,
        setPendingMatchData,
        setPendingPlacement,
        setPendingArtifactType,
        setPendingKilledBy,
        setPendingKilledByShip,
        setSelectedTeammates,
        setSelectedOpponents,
        setSessionShipTypes,
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
        setSessionTeams,
        setCurrentLoadout,
    } = useGameData();

    const {
        setToast,
        setShowWizard
    } = useUIState();

    const { playVictory, playDefeat } = useSoundEffects();
    const [submitting, setSubmitting] = useState(false);
    const backgroundArtifactOcrJobsRef = useRef<Set<number>>(new Set());

    const pickFirstKnown = useCallback((...values: Array<string | undefined | null>) => {
        const known = values.find(v => v && !/^unknown/i.test(v));
        return known || values.find(v => v) || '';
    }, []);

    const clearSubmissionState = useCallback(() => {
        if (IS_LOADOUT_TRACE_ENABLED) {
            const state = useAppStore.getState();
            Logger.debug?.('MatchSubmission', 'clearSubmissionState', {
                activeHero: state.activeHero,
                activeShip: state.activeShip,
                currentLoadoutHero: state.currentLoadout?.hero || null,
                currentLoadoutShip: state.currentLoadout?.ship || null,
                activeWeaponCount: Object.keys(state.activeWeapons || {}).length,
                pendingMatchId: Number(state.pendingMatchData?.id || 0) || null,
            });
        }
        useAppStore.getState().discardMatch();
        setPendingKilledBy("");
        setPendingKilledByShip("");
        setSessionTeams({});
        setSessionShipTypes({}, 'manual');
        setTimelineEvents([]);
        setTimeMin("");
        setTimeSec("");
        setDamageTaken("");
        // Preserve the latest telemetry loadout snapshot between matches so
        // the next loading-screen transition can reseed telemetry hero/ship
        // even when no fresh loadout event fires.
    }, [
        setDamageTaken,
        setPendingKilledBy,
        setPendingKilledByShip,
        setSessionShipTypes,
        setSessionTeams,
        setTimeMin,
        setTimeSec,
        setTimelineEvents,
    ]);

    const notifyTelemetryDraftResolved = useCallback((matchId: number) => {
        window.dispatchEvent(new CustomEvent('telemetry-draft:resolved', {
            detail: { matchId },
        }));
    }, []);

    const notifyArtifactsConsumed = useCallback((matchId: number, artifactPaths: string[]) => {
        window.dispatchEvent(new CustomEvent('smart-capture:artifacts-consumed', {
            detail: {
                matchId,
                artifactPaths,
            },
        }));
    }, []);

    const queueBackgroundArtifactOcr = useCallback((matchId: number, imagePaths: string[], activeUserHint?: string | null) => {
        const normalizedMatchId = Number(matchId || 0);
        const normalizedImagePaths = dedupeNames(imagePaths || []).filter((artifactPath) => IMAGE_ARTIFACT_PATTERN.test(artifactPath));
        if (!Number.isInteger(normalizedMatchId) || normalizedMatchId <= 0 || normalizedImagePaths.length === 0) {
            return;
        }
        if (backgroundArtifactOcrJobsRef.current.has(normalizedMatchId)) {
            return;
        }
        backgroundArtifactOcrJobsRef.current.add(normalizedMatchId);

        window.setTimeout(() => {
            void (async () => {
                try {
                    const storeState = useAppStore.getState();
                    const startingMatch = (storeState.matches || []).find((entry) => Number(entry.id || 0) === normalizedMatchId);
                    if (!startingMatch) return;

                    updateMatch({
                        ...startingMatch,
                        ocrState: 'processing',
                    });

                    const rerun = await rerunOCRMulti(
                        normalizedImagePaths,
                        String(activeUserHint || startingMatch.player || storeState.activeUser || '').trim(),
                        storeState.ocrMode,
                        storeState.ocrRegions,
                        { forceUncached: true },
                    );
                    const combined = rerun.data;
                    const latestMatch = (useAppStore.getState().matches || []).find((entry) => Number(entry.id || 0) === normalizedMatchId);
                    if (!latestMatch) return;

                    if (!rerun.success || !combined) {
                        Logger.warn('MatchSubmission', `Background artifact OCR failed for match ${normalizedMatchId}`, rerun.error || 'No OCR data returned');
                        updateMatch({
                            ...latestMatch,
                            ocrState: 'error',
                        });
                        await StorageService.flush();
                        return;
                    }

                    const mergedMatch = buildSilentBackgroundOcrMatch({
                        match: latestMatch,
                        combined,
                        activeUser: activeUserHint || latestMatch.player || storeState.activeUser,
                    });
                    updateMatch(mergedMatch);
                    applyRosterAutoPopulationForSavedMatch(mergedMatch);
                    await StorageService.flush();
                    Logger.info('MatchSubmission', 'Background artifact OCR merged into saved match', {
                        matchId: normalizedMatchId,
                        artifactCount: normalizedImagePaths.length,
                        confidence: combined.overallConfidence,
                    });
                } catch (error) {
                    Logger.error('MatchSubmission', `Background artifact OCR crashed for match ${normalizedMatchId}`, error);
                    const latestMatch = (useAppStore.getState().matches || []).find((entry) => Number(entry.id || 0) === normalizedMatchId);
                    if (latestMatch) {
                        updateMatch({
                            ...latestMatch,
                            ocrState: 'error',
                        });
                        try {
                            await StorageService.flush();
                        } catch {
                            // Ignore secondary persistence failures after the primary OCR error.
                        }
                    }
                } finally {
                    backgroundArtifactOcrJobsRef.current.delete(normalizedMatchId);
                }
            })();
        }, 0);
    }, [updateMatch]);

    const discardCurrentMatch = useCallback(async (matchId?: number | null) => {
        const normalizedMatchId = Number(matchId);
        if (Number.isInteger(normalizedMatchId) && normalizedMatchId > 0) {
            const state = useAppStore.getState();
            const match = Array.isArray(state.matches)
                ? state.matches.find((entry: Match) => entry.id === normalizedMatchId)
                : undefined;
            await removeMatchArtifactsThenDelete({
                matchId: normalizedMatchId,
                artifacts: match?.artifacts || [],
                deleteMatch,
                notifyArtifactsConsumed,
            });
        }
        clearSubmissionState();
    }, [clearSubmissionState, deleteMatch, notifyArtifactsConsumed]);

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
            ? (Array.isArray(matches)
                ? matches.find((m: Match) => m.id === pendingMatchId && isReadyTelemetryDraft(m))
                : undefined)
            : undefined;
        const recentCutoff = (typeof sessionStartTime === 'number' && sessionStartTime > 0)
            ? (sessionStartTime - 60_000)
            : (Date.now() - (6 * 60 * 60 * 1000));
        const unresolvedDraft = pendingDraft || (Array.isArray(matches)
            ? matches.find((m: Match) => {
                if (!isReadyTelemetryDraft(m)) return false;
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
            loadout: (() => {
                const resolvedShipForLoadout = pickFirstKnown(activeShip, currentLoadout?.ship, unresolvedDraft?.loadout?.ship, unresolvedDraft?.ship);
                const rawLoadout = sanitizeLoadout(currentLoadout || unresolvedDraft?.loadout || null);
                return (rawLoadout && resolvedShipForLoadout)
                    ? sanitizeLoadout({ ...rawLoadout, ship: resolvedShipForLoadout }) || undefined
                    : rawLoadout || undefined;
            })(),
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
            result,
            subType: result === 'Draw' ? 'Combat' : undefined,
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
        const draftResult = pendingMatchData?.result;
        const selectedResult = draftResult === 'Win' || draftResult === 'Loss' || draftResult === 'Draw'
            ? draftResult
            : (showWizard === 'Win' || showWizard === 'Loss' || showWizard === 'Draw'
                ? showWizard
                : null);
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
            if (subType === 'Artifact') finalMods.push(`Artifact: ${pendingArtifactType || 'healing'}`);

            if (selectedResult === 'Win') {
                launchVictoryConfetti();
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
            const existingMatch = resolveExistingSubmissionMatch({
                pendingMatchData,
                matches,
                activeUser,
                sessionStartTime,
            });
            const isTelemetryDraftSource = existingMatch?.subType === 'Telemetry Draft';
            const finalEliminatedByTeam = (() => {
                const stored = String(pendingMatchData?.eliminatedByTeam || existingMatch?.eliminatedByTeam || '').trim();
                if (selectedResult !== 'Loss' || !stored) return undefined;
                return stored;
            })();
            const savedOcrMeta = resolveSavedOcrMeta(pendingMatchData, existingMatch, { forceSaved: true });
            const matchId = existingMatch?.id || Date.now();
            const matchTimestamp = existingMatch?.timestamp || pendingMatchData.timestamp || Date.now();
            const rawMergedLoadout = sanitizeLoadout(pendingMatchData.loadout || currentLoadout);
            // Keep loadout.ship in sync with the resolved top-level ship so they never diverge.
            const mergedLoadout = (rawMergedLoadout && resolvedShip)
                ? sanitizeLoadout({ ...rawMergedLoadout, ship: resolvedShip })
                : rawMergedLoadout;
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
            if (isTelemetryDraftSource) {
                Logger.info('Submission', `Reusing telemetry draft ${existingMatch.id} for final submission`);
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
                loadout: mergedLoadout || undefined,
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
                artifacts: mergeArtifactLists(existingMatch?.artifacts, pendingMatchData.artifacts),
                ocrDebug: pendingMatchData?.ocrDebug || undefined,
                opponentTeams: pendingMatchData?.opponentTeams || undefined,
                eliminatedByTeam: finalEliminatedByTeam,
                ...savedOcrMeta,
                telemetryConsistency: finalTelemetryConsistency,
            };
            const submittedResult = newMatch.result;
            if (existingMatch) {
                updateMatch(newMatch);
            } else {
                addMatch(newMatch);
            }
            applyRosterAutoPopulationForSavedMatch(newMatch);
            await StorageService.flush();
            const totalDurationSecs = parseDurationSecs(finalTime);
            const totalDurationMs = totalDurationSecs > 0 ? totalDurationSecs * 1000 : 0;
            const submissionTime = Date.now();
            const fallbackWindowMs = totalDurationMs > 0 ? totalDurationMs : DEFAULT_ARTIFACT_LOOKBACK_MS;
            const telemetryDraftStart = existingMatch?.subType === 'Telemetry Draft'
                ? Number(matchTimestamp || 0)
                : 0;
            // Use the actual telemetry/manual match start when available.
            // When duration/timer context is unavailable, use a bounded lookback window.
            let matchStart = submissionTime - fallbackWindowMs;
            if (typeof matchStartTime === 'number' && matchStartTime > 0) {
                matchStart = matchStartTime;
            } else if (telemetryDraftStart > 0 && telemetryDraftStart <= submissionTime) {
                matchStart = telemetryDraftStart;
            }
            // Cap matchEnd to matchStart + duration + 90s buffer to prevent the artifact window
            // from extending into a subsequent match's screenshots when submission is delayed.
            const matchEnd = (totalDurationMs > 0 && matchStart > 0)
                ? Math.min(submissionTime, matchStart + totalDurationMs + 90_000)
                : submissionTime;
            const repairEndTime = Math.min(
                submissionTime,
                matchEnd + SCOPED_ARTIFACT_REPAIR_POSTMATCH_GRACE_MS,
            );

            const bundledArtifacts = await bundleMatchArtifacts(newMatch.id, matchStart, matchEnd);
            let scopedRepairAppliedLinks = 0;
            let scopedRepairRemovedLinks = 0;
            try {
                const repairResult = await applyArtifactRepair({
                    matchId: newMatch.id,
                    startTime: matchStart,
                    endTime: repairEndTime,
                });
                scopedRepairAppliedLinks = Number(repairResult?.summary?.appliedLinks || 0);
                scopedRepairRemovedLinks = Number(repairResult?.summary?.removedLinks || 0);
                if (scopedRepairAppliedLinks > 0 || scopedRepairRemovedLinks > 0) {
                    Logger.info('Submission', `Scoped artifact repair updated match ${newMatch.id} (linked=${scopedRepairAppliedLinks}, removed=${scopedRepairRemovedLinks})`);
                }
            } catch (repairError) {
                Logger.warn('Submission', `Scoped artifact repair failed for match ${newMatch.id}`, repairError);
            }
            const structuredArtifacts = await getMatchArtifactsStructured(newMatch.id, [
                ...(newMatch.artifacts || []),
                ...bundledArtifacts,
            ]);
            const diskArtifacts = Array.isArray(structuredArtifacts.images) ? structuredArtifacts.images : [];
            const missingArtifactKeys = structuredArtifacts.resolvedFromDisk
                ? new Set(
                    (structuredArtifacts.missingImages || [])
                        .map((artifactPath) => toArtifactKey(artifactPath))
                        .filter(Boolean)
                )
                : new Set<string>();
            const mergedArtifacts: string[] = [];
            const seenArtifactKeys = new Set<string>();
            const pushArtifact = (artifactPath?: string) => {
                if (!artifactPath || typeof artifactPath !== 'string' || !artifactPath.trim()) return;
                const key = toArtifactKey(artifactPath.trim());
                if (structuredArtifacts.resolvedFromDisk && missingArtifactKeys.has(key)) return;
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
            clearSubmissionState();
            setIsMatchInProgress(false);
            setMatchStartTime(null);
            if (isTelemetryDraftSource && existingMatch) {
                notifyTelemetryDraftResolved(existingMatch.id);
            }


            const consumedArtifactPaths = mergeArtifactLists(existingMatch?.artifacts, pendingMatchData.artifacts, bundledArtifacts);
            notifyArtifactsConsumed(newMatch.id, consumedArtifactPaths);
            window.dispatchEvent(new CustomEvent('recording:match-complete', { detail: { result: submittedResult, matchId: newMatch.id } }));
            if (scopedRepairRemovedLinks > 0) {
                setToast({
                    message: `Match recorded: ${submittedResult} · removed ${scopedRepairRemovedLinks} stale screenshot link${scopedRepairRemovedLinks === 1 ? '' : 's'}`,
                    type: 'success',
                });
            } else if (scopedRepairAppliedLinks > 0) {
                setToast({ message: `Match recorded: ${submittedResult} · screenshot links repaired`, type: 'success' });
            } else {
                const artifactSuffix = mergedArtifacts.length > 0 ? ` · ${mergedArtifacts.length} screenshot${mergedArtifacts.length === 1 ? '' : 's'} bundled` : '';
                setToast({ message: `Match recorded: ${submittedResult}${artifactSuffix}`, type: 'success' });
            }

        } catch (e) {
            Logger.error('Submission', 'Process failed', e);
            setToast({ message: "Submission error", type: 'error' });
        } finally {
            setSubmitting(false);
        }
    }, [submitting, addMatch, clearSubmissionState, setIsMatchInProgress, setMatchStartTime, notifyArtifactsConsumed, notifyTelemetryDraftResolved, setToast, playVictory, playDefeat, updateMatch, recordPlayerSighting, pickFirstKnown]);

    const saveResultDraft = useCallback(async (subType: string) => {
        const state = useAppStore.getState();
        const {
            pendingMatchData, showWizard,
            pendingPlacement, pendingArtifactType, pendingKilledBy, pendingKilledByShip,
            timeMin, timeSec, activeUser, activeMode,
            currentLoadout,
            activeHero, activeShip,
            selectedReachModifiers,
            selectedTeammates, selectedOpponents,
            kills, poiEasy, poiMedium, poiEpic,
            damageTaken, currentNote,
            matches,
            sessionStartTime
        } = state;

        if (!pendingMatchData || submitting) return;
        const draftResult = pendingMatchData?.result;
        const selectedResult = draftResult === 'Win' || draftResult === 'Loss' || draftResult === 'Draw'
            ? draftResult
            : (showWizard === 'Win' || showWizard === 'Loss' || showWizard === 'Draw'
                ? showWizard
                : null);
        if (!selectedResult) {
            setToast({ message: "Select Win/Loss/Draw before saving results.", type: 'warning' });
            return;
        }
        if (!activeUser && !pendingMatchData.player) {
            setToast({ message: "Select a profile before saving results.", type: 'error' });
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
            if (subType === 'Artifact') finalMods.push(`Artifact: ${pendingArtifactType || 'healing'}`);
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
            const existingMatch = resolveExistingSubmissionMatch({
                pendingMatchData,
                matches,
                activeUser,
                sessionStartTime,
            });
            const isTelemetryDraftSource = existingMatch?.subType === 'Telemetry Draft';
            const finalEliminatedByTeam = (() => {
                const stored = String(pendingMatchData?.eliminatedByTeam || existingMatch?.eliminatedByTeam || '').trim();
                if (selectedResult !== 'Loss' || !stored) return undefined;
                return stored;
            })();
            const savedOcrMeta = resolveSavedOcrMeta(pendingMatchData, existingMatch);
            const matchId = existingMatch?.id || Date.now();
            const matchTimestamp = existingMatch?.timestamp || pendingMatchData.timestamp || Date.now();
            const rawMergedLoadout = sanitizeLoadout(pendingMatchData.loadout || currentLoadout);
            // Keep loadout.ship in sync with the resolved top-level ship so they never diverge.
            const mergedLoadout = (rawMergedLoadout && resolvedShip)
                ? sanitizeLoadout({ ...rawMergedLoadout, ship: resolvedShip })
                : rawMergedLoadout;
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

            const savedMatch: Match = {
                id: matchId,
                timestamp: matchTimestamp,
                date: new Date(matchTimestamp).toLocaleDateString(),
                mode: pendingMatchData.mode || activeMode,
                player: pendingMatchData.player || activeUser,
                teammates: finalTeammates,
                opponents: finalOpponents,
                hero: resolvedHero,
                ship: resolvedShip,
                loadout: mergedLoadout || undefined,
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
                timelineEvents: [...(pendingMatchData.timelineEvents || [])],
                artifacts: mergeArtifactLists(existingMatch?.artifacts, pendingMatchData.artifacts),
                ocrDebug: pendingMatchData?.ocrDebug || undefined,
                opponentTeams: pendingMatchData?.opponentTeams || undefined,
                eliminatedByTeam: finalEliminatedByTeam,
                ...savedOcrMeta,
                telemetryConsistency: finalTelemetryConsistency,
            };

            if (existingMatch) {
                updateMatch(savedMatch);
            } else {
                addMatch(savedMatch);
            }
            applyRosterAutoPopulationForSavedMatch(savedMatch);
            await StorageService.flush();

            clearSubmissionState();
            setIsMatchInProgress(false);
            setMatchStartTime(null);
            if (isTelemetryDraftSource && existingMatch) {
                notifyTelemetryDraftResolved(existingMatch.id);
            }

            window.dispatchEvent(new CustomEvent('recording:match-complete', { detail: { result: savedMatch.result } }));
            setToast({ message: 'Results saved. You can return to OCR later.', type: 'success' });
        } catch (e) {
            Logger.error('Submission', 'Save results failed', e);
            setToast({ message: "Save results error", type: 'error' });
        } finally {
            setSubmitting(false);
        }
    }, [submitting, addMatch, clearSubmissionState, setIsMatchInProgress, setMatchStartTime, notifyTelemetryDraftResolved, setToast, updateMatch, pickFirstKnown]);

    const autoFinalizeResultScreenCapture = useCallback(async ({
        imageBase64,
        resultData,
        matchId,
        persistedPrimaryArtifactPath,
        supplementalArtifacts,
    }: {
        imageBase64: string;
        resultData: AutoResultScreenData;
        matchId?: number | null;
        persistedPrimaryArtifactPath?: string | null;
        supplementalArtifacts?: AutoResultCaptureArtifact[] | null;
    }): Promise<AutoFinalizeResultStatus> => {
        if (submitting) return { success: false, reason: 'busy' };

        const state = useAppStore.getState();
        const {
            pendingMatchData,
            timeMin, timeSec,
            activeUser, activeMode,
            currentLoadout,
            activeHero, activeShip,
            selectedReachModifiers,
            selectedTeammates, selectedOpponents,
            kills, poiEasy, poiMedium, poiEpic,
            damageTaken, currentNote,
            pendingKilledBy, pendingKilledByShip,
            matches,
            sessionStartTime,
        } = state;

        const resolvedPendingMatchData = pendingMatchData || {};
        const requestedMatchId = Number(matchId || 0);
        const hasRequestedMatchId = Number.isInteger(requestedMatchId) && requestedMatchId > 0;
        const existingMatch = hasRequestedMatchId
            ? (Array.isArray(matches)
                ? matches.find((entry) => entry.id === requestedMatchId && isFinalizableTelemetryDraft(entry))
                : undefined)
            : resolveExistingSubmissionMatch({
                pendingMatchData: resolvedPendingMatchData,
                matches,
                activeUser,
                sessionStartTime,
            });
        if (!existingMatch || existingMatch.subType !== 'Telemetry Draft') {
            return { success: false, reason: 'no-draft' };
        }

        const api = getElectronAPI();
        if (!api) {
            return { success: false, reason: 'ipc-unavailable' };
        }

        const normalizedResult = resultData?.result;
        const rawPlacement = resultData?.placement;
        const normalizedPlacement = rawPlacement != null && Number.isInteger(Number(rawPlacement))
            ? Math.min(5, Math.max(2, Number(rawPlacement)))
            : null;
        const normalizedSubType = normalizeResultSubType(resultData?.winType, normalizedPlacement);
        const normalizedPersistedPrimaryArtifactPath = String(persistedPrimaryArtifactPath || '').trim();

        try {
            setSubmitting(true);

            if (normalizedResult === 'Win') {
                launchVictoryConfetti();
                playVictory();
            } else {
                playDefeat();
            }

            const retainedSupplementalArtifacts = (supplementalArtifacts || []).filter((artifact) => (
                normalizedResult !== 'Win'
                || (artifact?.kind !== 'damage-sources' && artifact?.kind !== 'damage-ships')
            ));

            const artifactsToSave: Array<{ rawBase64: string; kind?: AutoResultCaptureArtifact['kind'] }> = [
                ...(!normalizedPersistedPrimaryArtifactPath ? [{
                    rawBase64: String(imageBase64 || '').replace(/^data:image\/\w+;base64,/, '').trim(),
                }] : []),
                ...((retainedSupplementalArtifacts).map((artifact) => ({
                    rawBase64: String(artifact?.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '').trim(),
                    kind: artifact?.kind,
                }))),
            ].filter((artifact) => artifact.rawBase64.length > 0);

            // On losses, damage crops can supersede the full result capture. On wins, those
            // follow-up panels are speculative and get dropped once OCR confirms victory.
            const hasDamageSourcesArtifact = retainedSupplementalArtifacts.some(
                (a) => a?.kind === 'damage-sources'
            );
            const savedArtifactPaths: string[] = normalizedPersistedPrimaryArtifactPath && !hasDamageSourcesArtifact
                ? [normalizedPersistedPrimaryArtifactPath]
                : [];
            let damageSourcesOcrLines: string[] = [];

            for (const artifact of artifactsToSave) {
                const saveResult = await api.invoke('save-screenshot', {
                    imageBase64: artifact.rawBase64,
                    matchId: existingMatch.id,
                });
                const savedPath = String(saveResult?.data?.filePath || '').trim() || '';
                if (!savedPath) {
                    return { success: false, reason: 'save-failed' };
                }
                savedArtifactPaths.push(savedPath);

                if (artifact.kind === 'damage-sources' || artifact.kind === 'damage-ships') {
                    try {
                        const ocrPayload = await api.invoke('ocr-scan', savedPath);
                        damageSourcesOcrLines = mergeTextLines(damageSourcesOcrLines, extractOcrLines(ocrPayload));
                    } catch (error) {
                        Logger.warn('MatchSubmission', `Damage sources OCR failed for ${savedPath}`, error);
                    }
                }
            }

            const savedArtifactPath = savedArtifactPaths[0] || normalizedPersistedPrimaryArtifactPath || null;
            const syncDraftArtifactsOnly = async (
                reason: 'unconfirmed' | 'incomplete'
            ): Promise<AutoFinalizeResultStatus> => {
                const syncedArtifacts = mergeArtifactLists(
                    existingMatch.artifacts,
                    resolvedPendingMatchData.artifacts,
                    savedArtifactPaths,
                );
                const currentArtifacts = existingMatch.artifacts || [];
                const artifactsChanged = syncedArtifacts.length !== currentArtifacts.length
                    || syncedArtifacts.some((artifactPath, index) => artifactPath !== currentArtifacts[index]);
                if (artifactsChanged) {
                    updateMatch({
                        ...existingMatch,
                        artifacts: syncedArtifacts,
                    });
                    await StorageService.flush();
                }
                return {
                    success: false,
                    reason,
                    matchId: existingMatch.id,
                    artifactPath: savedArtifactPath,
                    artifactPaths: savedArtifactPaths,
                };
            };

            if (normalizedResult !== 'Win' && normalizedResult !== 'Loss') {
                return syncDraftArtifactsOnly('unconfirmed');
            }

            if (!normalizedSubType) {
                return syncDraftArtifactsOnly('incomplete');
            }
            if (normalizedResult === 'Loss' && normalizedSubType === 'Combat' && normalizedPlacement == null) {
                return syncDraftArtifactsOnly('incomplete');
            }

            const backgroundArtifactPaths = mergeArtifactLists(
                existingMatch.artifacts,
                resolvedPendingMatchData.artifacts,
            );

            const finalTime = (timeMin || timeSec)
                ? `${timeMin || '00'}:${timeSec || '00'}`
                : (resolvedPendingMatchData.time || existingMatch.time || '00:00');
            const resolvedHero = pickFirstKnown(resolvedPendingMatchData.hero, currentLoadout?.hero, activeHero, existingMatch.hero);
            const resolvedShip = pickFirstKnown(resolvedPendingMatchData.ship, currentLoadout?.ship, activeShip, existingMatch.ship);
            const finalTeammatesRaw = (selectedTeammates && selectedTeammates.length > 0)
                ? selectedTeammates
                : (resolvedPendingMatchData.teammates || existingMatch.teammates || []);
            const finalTeammates = ensureSelfInTeam(
                capTeammateNames(finalTeammatesRaw, resolvedShip),
                resolvedPendingMatchData.player || existingMatch.player || activeUser
            );
            const finalOpponents = (selectedOpponents && selectedOpponents.length > 0)
                ? selectedOpponents
                : (resolvedPendingMatchData.opponents || existingMatch.opponents || []);
            const pendingKills = resolvedPendingMatchData.kills || existingMatch.kills || {};
            const liveKills = kills || {};
            const finalKills = Object.entries({ ...pendingKills, ...liveKills }).reduce<Record<string, number>>((acc, [ship, value]) => {
                const parsed = Number(value) || 0;
                if (parsed > 0) acc[ship] = parsed;
                return acc;
            }, {});
            const finalDamageTaken = Math.max(
                Number(existingMatch.damageTaken) || 0,
                Number(resolvedPendingMatchData.damageTaken) || 0,
                Number.parseInt(String(damageTaken || ''), 10) || 0,
                Number(resultData.damageTaken) || 0
            );
            const finalPoiEasy = Math.max(Number(existingMatch.poiEasy) || 0, Number(resolvedPendingMatchData.poiEasy) || 0, Number(poiEasy) || 0);
            const finalPoiMedium = Math.max(Number(existingMatch.poiMedium) || 0, Number(resolvedPendingMatchData.poiMedium) || 0, Number(poiMedium) || 0);
            const finalPoiEpic = Math.max(Number(existingMatch.poiEpic) || 0, Number(resolvedPendingMatchData.poiEpic) || 0, Number(poiEpic) || 0);
            const finalNotes = currentNote || resolvedPendingMatchData.notes || existingMatch.notes || '';
            const finalPlacement = normalizedResult === 'Win'
                ? 1
                : (normalizedSubType === 'Combat' ? (normalizedPlacement ?? undefined) : undefined);
            const rawMergedLoadout = sanitizeLoadout(resolvedPendingMatchData.loadout || currentLoadout || existingMatch.loadout);
            const mergedLoadout = (rawMergedLoadout && resolvedShip)
                ? sanitizeLoadout({ ...rawMergedLoadout, ship: resolvedShip })
                : rawMergedLoadout;
            const baseTelemetryConsistency = resolvedPendingMatchData.telemetryConsistency || existingMatch.telemetryConsistency;
            const savedOcrMeta = resolveSavedOcrMeta(resolvedPendingMatchData, existingMatch, { forceSaved: true });
            const mergedDamageSourcesText = normalizedResult === 'Win'
                ? []
                : mergeTextLines(
                    existingMatch.damageSourcesText,
                    resolvedPendingMatchData.damageSourcesText,
                    damageSourcesOcrLines,
                );
            const finalDamageSourcesAvailable = normalizedResult === 'Win'
                ? false
                : (
                    resultData.damageSourcesAvailable === true
                    || savedArtifactPaths.length > 1
                    || mergedDamageSourcesText.length > 0
                    || existingMatch.damageSourcesAvailable === true
                );
            const finalTelemetryConsistency = baseTelemetryConsistency
                ? (() => {
                    const evaluated = evaluateTelemetryConsistencyChecks(baseTelemetryConsistency, {
                        teammateCount: countComparableTeammates(finalTeammates, resolvedPendingMatchData.player || existingMatch.player || activeUser),
                        mode: resolvedPendingMatchData.mode || existingMatch.mode || activeMode,
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

            const savedMatch: Match = {
                ...existingMatch,
                id: existingMatch.id,
                timestamp: existingMatch.timestamp,
                date: new Date(existingMatch.timestamp).toLocaleDateString(),
                mode: resolvedPendingMatchData.mode || existingMatch.mode || activeMode,
                player: resolvedPendingMatchData.player || existingMatch.player || activeUser || '',
                teammates: finalTeammates,
                opponents: finalOpponents,
                hero: resolvedHero,
                ship: resolvedShip,
                loadout: mergedLoadout || undefined,
                reachModifiers: (selectedReachModifiers && selectedReachModifiers.length > 0)
                    ? selectedReachModifiers
                    : (resolvedPendingMatchData.reachModifiers || existingMatch.reachModifiers || []),
                kills: Object.keys(finalKills).length > 0 ? finalKills : pendingKills,
                result: normalizedResult,
                subType: normalizedSubType,
                placement: finalPlacement,
                damageTaken: finalDamageTaken,
                time: finalTime,
                poiEasy: finalPoiEasy,
                poiMedium: finalPoiMedium,
                poiEpic: finalPoiEpic,
                killedBy: pendingKilledBy || existingMatch.killedBy || undefined,
                killedByShip: pendingKilledByShip || existingMatch.killedByShip || undefined,
                notes: finalNotes,
                timelineEvents: [...(resolvedPendingMatchData.timelineEvents || existingMatch.timelineEvents || [])],
                artifacts: mergeArtifactLists(existingMatch.artifacts, resolvedPendingMatchData.artifacts, savedArtifactPaths),
                ocrDebug: resolvedPendingMatchData.ocrDebug || existingMatch.ocrDebug || undefined,
                opponentTeams: resolvedPendingMatchData.opponentTeams || existingMatch.opponentTeams || undefined,
                eliminatedByTeam: resolvedPendingMatchData.eliminatedByTeam || existingMatch.eliminatedByTeam || undefined,
                resultDetectionMethod: resultData.detectionMethod || existingMatch.resultDetectionMethod,
                damageSourcesAvailable: finalDamageSourcesAvailable,
                damageSourcesText: mergedDamageSourcesText.length > 0 ? mergedDamageSourcesText : undefined,
                ...savedOcrMeta,
                telemetryConsistency: finalTelemetryConsistency,
            };

            updateMatch(savedMatch);
            applyRosterAutoPopulationForSavedMatch(savedMatch);
            await StorageService.flush();

            const structuredArtifacts = await getMatchArtifactsStructured(savedMatch.id, savedMatch.artifacts || []);
            const diskArtifacts = Array.isArray(structuredArtifacts.images) ? structuredArtifacts.images : [];
            const syncedArtifacts = mergeArtifactLists(savedMatch.artifacts, diskArtifacts);
            const artifactsChanged = syncedArtifacts.length !== (savedMatch.artifacts || []).length
                || syncedArtifacts.some((artifactPath, index) => artifactPath !== (savedMatch.artifacts || [])[index]);
            if (artifactsChanged) {
                updateMatch({ ...savedMatch, artifacts: syncedArtifacts });
                await StorageService.flush();
            }

            clearSubmissionState();
            setIsMatchInProgress(false);
            setMatchStartTime(null);
            notifyTelemetryDraftResolved(existingMatch.id);

            const consumedArtifactPaths = mergeArtifactLists(existingMatch.artifacts, resolvedPendingMatchData.artifacts, savedArtifactPaths, diskArtifacts);
            notifyArtifactsConsumed(savedMatch.id, consumedArtifactPaths);
            window.dispatchEvent(new CustomEvent('recording:match-complete', {
                detail: { result: savedMatch.result, matchId: savedMatch.id },
            }));
            setToast({
                message: `Match auto-saved: ${savedMatch.result} (${savedMatch.subType})`,
                type: 'success',
            });
            queueBackgroundArtifactOcr(
                savedMatch.id,
                backgroundArtifactPaths,
                savedMatch.player || activeUser,
            );

            return {
                success: true,
                matchId: savedMatch.id,
                artifactPath: savedArtifactPath,
                artifactPaths: savedArtifactPaths,
            };
        } catch (e) {
            Logger.error('Submission', 'Auto result-screen finalization failed', e);
            return { success: false, reason: 'error' };
        } finally {
            setSubmitting(false);
        }
    }, [submitting, clearSubmissionState, notifyArtifactsConsumed, notifyTelemetryDraftResolved, pickFirstKnown, playDefeat, playVictory, queueBackgroundArtifactOcr, setIsMatchInProgress, setMatchStartTime, setToast, updateMatch]);

    const discardTelemetryDraft = useCallback(async (matchId: number) => {
        if (!Number.isInteger(matchId) || matchId <= 0 || submitting) return false;

        const state = useAppStore.getState();
        const draft = Array.isArray(state.matches)
            ? state.matches.find((match: Match) => match.id === matchId && match.subType === 'Telemetry Draft')
            : undefined;

        if (!draft) {
            notifyTelemetryDraftResolved(matchId);
            clearSubmissionState();
            setToast({ message: 'Telemetry draft no longer exists. State cleared.', type: 'warning' });
            return false;
        }

        try {
            setSubmitting(true);

            const cleanup = await removeMatchArtifactsThenDelete({
                matchId: draft.id,
                artifacts: draft.artifacts || [],
                deleteMatch,
                notifyArtifactsConsumed,
            });
            clearSubmissionState();
            await StorageService.flush();
            notifyTelemetryDraftResolved(draft.id);

            if (cleanup.failedPaths.length > 0) {
                const removedCount = Math.max(0, cleanup.removedPaths.length);
                setToast({
                    message: `Match discarded. Removed ${removedCount} screenshot${removedCount === 1 ? '' : 's'}; ${cleanup.failedPaths.length} could not be deleted.`,
                    type: 'warning',
                });
            } else if (cleanup.removedPaths.length > 0) {
                setToast({
                    message: `Match discarded. Removed ${cleanup.removedPaths.length} recorded screenshot${cleanup.removedPaths.length === 1 ? '' : 's'}.`,
                    type: 'info',
                });
            } else {
                setToast({ message: 'Match discarded. Ready for a fresh start.', type: 'info' });
            }

            return true;
        } catch (e) {
            Logger.error('Submission', 'Discard telemetry draft failed', e);
            setToast({ message: 'Discard failed.', type: 'error' });
            return false;
        } finally {
            setSubmitting(false);
        }
    }, [clearSubmissionState, deleteMatch, notifyArtifactsConsumed, notifyTelemetryDraftResolved, setToast, submitting]);

    return {
        initiateSubmission,
        processFinalSubmission,
        saveResultDraft,
        autoFinalizeResultScreenCapture,
        discardCurrentMatch,
        discardTelemetryDraft,
        submitting
    };
};



