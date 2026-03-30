import React from 'react';
import {
    Trophy,
    Scale,
    Skull,
    Timer,
    Loader2,
    Scan,
    ScanEye,
    RefreshCw,
    X,
    ChevronRight,
    Trash2
} from 'lucide-react';
import { SessionTimer } from '../SessionTimer';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import Logger from '../../utils/logger';
import { useSmartScan } from '../../hooks/useSmartScan';
import { useSmartCapture } from '../../hooks/useSmartCapture';
import { useMatchSubmission } from '../../hooks/useMatchSubmission';
import { useAppStore } from '../../store/useAppStore';
import type { OCRExtractedData } from '../../utils/ocr/ocrTypes';
import type { Match } from '../../types';
import { runtimeConfig } from '../../config/runtimeConfig';
import { buildAutoCaptureTelemetryDraft } from '../../utils/telemetryDraft';
import { findActiveTelemetryDraftMatch, resolveSmartCaptureMatchId } from '../../utils/smartCaptureScope';
import { buildAutoCaptureStateSnapshot } from '../../utils/autoCaptureState';
import { startAutoCapture } from '../../utils/electronBridge';

interface ActionPanelProps {
    variant?: 'default' | 'transparent';
    density?: 'standard' | 'compact';
    onSmartCaptureData?: (data: OCRExtractedData) => void;
    isActive?: boolean;
}

type MatchResult = 'Win' | 'Loss' | 'Draw';
type SmartCaptureRequestBehavior = 'single' | 'auto-sequence';
type SmartCaptureRequestPayload = {
    activeUser?: string | null;
    source?: string;
    requestId?: string;
    matchId?: string | number | null;
    forceOcr?: boolean;
    behavior?: SmartCaptureRequestBehavior;
};

const RECENT_MANUAL_DRAFT_REUSE_WINDOW_MS = 2 * 60 * 1000;

export const ActionPanel: React.FC<ActionPanelProps> = ({ variant = 'default', density = 'standard', onSmartCaptureData, isActive = true }) => {
    const {
        sessionStartTime,
        matches,
        lastActivity, setLastActivity,
        matchStartTime, isMatchInProgress,
        setMatchStartTime, setIsMatchInProgress,
        deleteMatch,
    } = useGameData();

    // Tracks the draft match created by startFreshMatch so stop/reset can clean it up.
    const manualDraftIdRef = React.useRef<number | null>(null);

    const {
        activeUser,
        smartCaptureRequest,
        clearSmartCaptureRequest,
        pushNotification,
        setToast
    } = useUIState();

    const isTransparent = variant === 'transparent';
    const isCompact = density === 'compact';

    const { handleSmartScan, isScanning, scanProgress, scanLogs } = useSmartScan();
    const resultOcrFlowMode = useAppStore(s => s.resultOcrFlowMode);
    const ocrAutoOpenAfterRerun = useAppStore(s => s.ocrAutoOpenAfterRerun);
    const showSmartCaptureInHeader = useAppStore(s => s.showSmartCaptureInHeader);
    const autoSequenceOnCapture = useAppStore(s => s.autoSequenceOnCapture);
    const lifecycleTrackingPaused = useAppStore(s => s.lifecycleTrackingPaused);
    const setLifecycleTrackingPaused = useAppStore(s => s.setLifecycleTrackingPaused);
    const selectedSmartCapturesMatchId = useAppStore(s => s.selectedMatchId);
    const resetMatchTrackingForNewMatch = useAppStore(s => s.resetMatchTrackingForNewMatch);
    const resetMatchMetricsForNewMatch = useAppStore(s => s.resetMatchMetricsForNewMatch);
    const addMatch = useAppStore(s => s.addMatch);
    const activeMode = useAppStore(s => s.activeMode);
    const activeShip = useAppStore(s => s.activeShip);
    const activeHero = useAppStore(s => s.activeHero);
    const currentLoadout = useAppStore(s => s.currentLoadout);
    const ocrModeLabel = 'Local';

    const [smartCaptureState, smartCaptureActions] = useSmartCapture();
    const {
        isCapturing,
        isProcessing,
        error: captureError,
        pendingData,
        queueDepth,
        capturedScreenshots,
        savedCaptures,
        processingProgress,
        qualityHint,
        processingStatus
    } = smartCaptureState;
    const {
        capture: triggerSmartCapture,
        processAllStored,
        clearError: clearCaptureError,
        clearCaptures,
        dismissPendingData,
        getPendingData,
        reanalyzeCaptures
    } = smartCaptureActions;
    const {
        initiateSubmission: openResultWizard,
        discardCurrentMatch,
    } = useMatchSubmission();

    const resolveSubmissionMatchId = React.useCallback((): string | number | null => {
        // Read fresh state at call time to avoid stale closure issues.
        const storeApi = useAppStore as unknown as { getState?: () => Record<string, unknown> };
        const state = (typeof storeApi.getState === 'function'
            ? storeApi.getState()
            : {}) as any;
        return resolveSmartCaptureMatchId({
            activeUser: state.activeUser || activeUser || '',
            matches: Array.isArray(state.matches) ? state.matches : matches,
            pendingMatchData: state.pendingMatchData,
            sessionStartTime: typeof state.sessionStartTime === 'number' ? state.sessionStartTime : sessionStartTime,
        });
    }, [activeUser, matches, sessionStartTime]);

    const resolveActiveOngoingDraftId = React.useCallback((): number | null => {
        const storeMatches = Array.isArray(useAppStore.getState().matches)
            ? useAppStore.getState().matches
            : [];
        const activeMatches = storeMatches.length > 0 ? storeMatches : matches;
        const activePlayer = String(activeUser || '').trim().toLowerCase();
        const ongoingMatches = activeMatches
            .filter((match): match is Match => Boolean(match))
            .filter((match) => String(match.result || '').trim() === 'Ongoing')
            .filter((match) => {
                const matchPlayer = String(match.player || '').trim().toLowerCase();
                if (activePlayer && matchPlayer && matchPlayer !== activePlayer) return false;
                return true;
            })
            .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0));

        const manualDraftId = manualDraftIdRef.current;
        if (manualDraftId != null) {
            const manualDraft = ongoingMatches.find((match) => Number(match.id || 0) === manualDraftId);
            if (manualDraft) return manualDraftId;
        }

        const latestDraft = ongoingMatches[0];
        if (!latestDraft) return null;
        const numericId = Number(latestDraft.id || 0);
        return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
    }, [activeUser, matches]);

    const findReusableTelemetryDraft = React.useCallback((): Match | null => {
        const now = Date.now();
        const storeMatches = Array.isArray(useAppStore.getState().matches)
            ? useAppStore.getState().matches
            : [];
        const activeMatches = storeMatches.length > 0 ? storeMatches : matches;
        const activeDraft = findActiveTelemetryDraftMatch({
            activeUser,
            matches: activeMatches,
            sessionStartTime,
            now,
        });
        if (activeDraft) return activeDraft;

        const activePlayer = String(activeUser || '').trim().toLowerCase();
        const reuseCutoff = now - RECENT_MANUAL_DRAFT_REUSE_WINDOW_MS;
        return activeMatches
            .filter((match): match is Match => Boolean(match))
            .filter((match) => match.subType === 'Telemetry Draft')
            .filter((match) => String(match.result || '').trim() === 'Ongoing')
            .filter((match) => Number(match.timestamp || 0) >= reuseCutoff)
            .filter((match) => {
                const matchPlayer = String(match.player || '').trim().toLowerCase();
                if (activePlayer && matchPlayer && matchPlayer !== activePlayer) return false;
                return true;
            })
            .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))[0] || null;
    }, [activeUser, matches, sessionStartTime]);

    const submissionMatchId = resolveSubmissionMatchId();
    const queueScopeMatchId = selectedSmartCapturesMatchId ?? submissionMatchId;
    const pendingOcrCountGlobal = savedCaptures.filter(c => !c.ocrProcessed).length;
    const queuedCaptureCountForScope = queueScopeMatchId == null
        ? pendingOcrCountGlobal
        : savedCaptures.filter(c => !c.ocrProcessed && String(c.matchId ?? '') === String(queueScopeMatchId)).length;
    const pendingOcrCountForSubmission = submissionMatchId == null
        ? pendingOcrCountGlobal
        : savedCaptures.filter(c => !c.ocrProcessed && String(c.matchId ?? '') === String(submissionMatchId)).length;
    const pendingDataForQueueScope = queueScopeMatchId != null ? getPendingData(queueScopeMatchId) : pendingData;

    const collectCaptureArtifacts = React.useCallback((scopeMatchId?: string | number | null): string[] => {
        const seen = new Set<string>();
        return savedCaptures
            .filter((capture) => (
                scopeMatchId == null
                    ? capture.matchId == null || capture.matchId === ''
                    : String(capture.matchId ?? '') === String(scopeMatchId)
            ))
            .map((capture) => String(capture.filePath || '').trim())
            .filter((path) => /\.(png|jpe?g|webp|bmp|gif)$/i.test(path))
            .filter((path) => {
                const key = path.replace(/[\\/]+/g, '\\').toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [savedCaptures]);

    const syncDraftArtifacts = React.useCallback((scopeMatchId?: string | number | null): string[] => {
        const artifactPaths = collectCaptureArtifacts(scopeMatchId);
        if (artifactPaths.length === 0) return [];

        const state = useAppStore.getState();
        const mergeArtifacts = (existing: unknown): string[] => {
            const current = Array.isArray(existing)
                ? existing.map((entry) => String(entry || '').trim()).filter(Boolean)
                : [];
            const seen = new Set<string>();
            return [...current, ...artifactPaths].filter((entry) => {
                const key = entry.replace(/[\\/]+/g, '\\').toLowerCase();
                if (!entry || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        };

        const pendingDraft = state.pendingMatchData;
        if (pendingDraft) {
            state.setPendingMatchData({
                ...pendingDraft,
                artifacts: mergeArtifacts(pendingDraft.artifacts),
            });
        }

        const numericScope = Number(scopeMatchId);
        if (Number.isInteger(numericScope) && numericScope > 0) {
            const scopedMatch = (state.matches || []).find((match) => Number(match.id || 0) === numericScope);
            if (scopedMatch) {
                state.updateMatch({
                    ...scopedMatch,
                    artifacts: mergeArtifacts(scopedMatch.artifacts),
                    ocrState: scopedMatch.ocrState || 'queued',
                });
            }
        }

        return artifactPaths;
    }, [collectCaptureArtifacts]);

    const setBackgroundOcrState = React.useCallback((nextState: 'processing' | 'error') => {
        const state = useAppStore.getState();
        const pendingDraft = state.pendingMatchData;
        if (pendingDraft) {
            state.setPendingMatchData({
                ...pendingDraft,
                ocrState: nextState,
            });
        }

        const fallbackId = Number(pendingDraft?.id || 0);
        const scopedId = Number(submissionMatchId || 0);
        const targetMatchId = Number.isInteger(scopedId) && scopedId > 0
            ? scopedId
            : (Number.isInteger(fallbackId) && fallbackId > 0 ? fallbackId : null);
        if (targetMatchId == null) return;

        const existingMatch = (state.matches || []).find((match: Match) => Number(match.id || 0) === targetMatchId);
        if (!existingMatch) return;
        state.updateMatch({
            ...existingMatch,
            ocrState: nextState,
        });
    }, [submissionMatchId]);

    const toggleLifecycleTrackingPause = React.useCallback(() => {
        const nextPaused = !lifecycleTrackingPaused;
        setLifecycleTrackingPaused(nextPaused);
        pushNotification({
            message: nextPaused
                ? 'Tracking paused: auto match start/end detection is disabled.'
                : 'Tracking resumed: auto match start/end detection is enabled.',
            type: 'info',
            source: 'system',
            durationMs: 4500,
        });
    }, [lifecycleTrackingPaused, pushNotification, setLifecycleTrackingPaused]);

    const dispatchOcrGate = React.useCallback((
        data: OCRExtractedData,
        options?: {
            result?: MatchResult | null;
            matchId?: string | number | null;
            source?: string;
        }
    ) => {
        const matchId = options?.matchId ?? null;
        const source = options?.source || 'action-panel';
        Logger.info('ActionPanel', 'Dispatching OCR gate', {
            source,
            result: options?.result ?? null,
            matchId,
            captureTimestamp: data.captureTimestamp,
            artifactCount: Array.isArray(data.artifacts) ? data.artifacts.length : 0,
        });
        window.dispatchEvent(new CustomEvent('submission:ocr-gate', {
            detail: {
                result: options?.result ?? undefined,
                data,
                matchId,
            },
        }));
    }, []);

    const handleReviewBucket = () => {
        if (pendingDataForQueueScope && onSmartCaptureData) {
            syncDraftArtifacts(queueScopeMatchId ?? null);
            dispatchOcrGate(pendingDataForQueueScope, {
                matchId: queueScopeMatchId ?? null,
                source: 'manual-review',
            });
            dismissPendingData(queueScopeMatchId ?? null);
        }
    };

    const handleProcessQueue = async () => {
        await processAllStored(activeUser || null, queueScopeMatchId ?? null);
    };

    const isBusy = isScanning || isCapturing || isProcessing;
    const handleDiscardMatch = React.useCallback(() => {
        clearCaptures();
        const draftId = resolveActiveOngoingDraftId();
        discardCurrentMatch(draftId);
        manualDraftIdRef.current = null;
        pushNotification({
            message: 'Match discarded. Ready for a fresh start.',
            type: 'info',
            source: 'user',
            deepLink: { type: 'openView', view: 'recording' },
        });
    }, [clearCaptures, discardCurrentMatch, pushNotification, resolveActiveOngoingDraftId]);
    const startFreshMatch = React.useCallback(() => {
        resetMatchTrackingForNewMatch();
        resetMatchMetricsForNewMatch();
        const now = Date.now();
        setIsMatchInProgress(true);
        setMatchStartTime(now);
        const existingDraft = findReusableTelemetryDraft();
        if (existingDraft) {
            manualDraftIdRef.current = Number(existingDraft.id || 0) || null;
            if (existingDraft.telemetryDraftState !== 'active') {
                useAppStore.getState().updateMatch({
                    ...existingDraft,
                    telemetryDraftState: 'active',
                });
            }
            return;
        }
        // Create a Telemetry Draft so Smart Captures immediately shows an active match
        const draftId = now + Math.floor(Math.random() * 1000);
        const draft = buildAutoCaptureTelemetryDraft({
            matchId: draftId,
            timestamp: now,
            mode: activeMode === 'Artifact Brawl' ? 'Artifact Brawl' : 'Fleet Battle',
            player: activeUser || null,
            hero: typeof activeHero === 'string' ? activeHero : null,
            ship: typeof activeShip === 'string' ? activeShip : null,
            loadout: currentLoadout || null,
        });
        addMatch(draft);
        manualDraftIdRef.current = draftId;
    }, [activeHero, activeMode, activeShip, activeUser, addMatch, currentLoadout, findReusableTelemetryDraft, resetMatchMetricsForNewMatch, resetMatchTrackingForNewMatch, setIsMatchInProgress, setMatchStartTime]);

    const stopManualMatch = React.useCallback(() => {
        setMatchStartTime(null);
        setIsMatchInProgress(false);
        const draftId = resolveActiveOngoingDraftId();
        if (draftId != null) {
            deleteMatch(draftId);
        }
        manualDraftIdRef.current = null;
    }, [deleteMatch, resolveActiveOngoingDraftId, setIsMatchInProgress, setMatchStartTime]);

    // Dedicated mission timer display so match time remains visible at a glance.
    const [matchElapsed, setMatchElapsed] = React.useState('00:00');
    React.useEffect(() => {
        if (!isActive) return;
        if (!isMatchInProgress || !matchStartTime) {
            setMatchElapsed('00:00');
            return;
        }
        const tick = () => {
            const diff = Math.max(0, Math.floor((Date.now() - matchStartTime) / 1000));
            const mm = Math.floor(diff / 60).toString().padStart(2, '0');
            const ss = (diff % 60).toString().padStart(2, '0');
            setMatchElapsed(`${mm}:${ss}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [isActive, isMatchInProgress, matchStartTime]);

    const handleNewSmartCapture = async () => {
        if (onSmartCaptureData) {
            const requestedUser = activeUser || null;
            const resolvedMatchId = resolveRequestedCaptureMatchId(submissionMatchId);
            if (autoSequenceOnCapture) {
                await runAutoSequenceCapture(requestedUser, resolvedMatchId, {
                    source: 'action-panel-button',
                });
                return;
            }

            if (resolvedMatchId != null && resolvedMatchId !== '') {
                await triggerSmartCapture(requestedUser, resolvedMatchId);
            } else {
                await triggerSmartCapture(requestedUser);
            }
        } else {
            handleSmartScan();
        }
    };

    const logsContainerRef = React.useRef<HTMLDivElement>(null);
    const handledCaptureRequestRef = React.useRef<string | null>(null);
    const lastCaptureRequestAtRef = React.useRef(0);
    const autoSequenceInFlightRef = React.useRef(false);
    const [lastSubmitted, setLastSubmitted] = React.useState<MatchResult | null>(null);
    const [pulseResult, setPulseResult] = React.useState<MatchResult | null>(null);
    const lastSubmitSignalRef = React.useRef<{ result: MatchResult; at: number } | null>(null);
    const [ripples, setRipples] = React.useState<Record<MatchResult, { id: number; x: number; y: number } | null>>({
        Win: null,
        Loss: null,
        Draw: null,
    });
    const [ocrDecisionPrompt, setOcrDecisionPrompt] = React.useState<{ result: MatchResult; processing: boolean } | null>(null);
    const processingToastShownRef = React.useRef(false);
    const backgroundOcrInFlightRef = React.useRef(false);
    const processingPercent = React.useMemo(() => {
        if (!processingProgress || processingProgress.total <= 0) return null;
        const pct = Math.round((processingProgress.current / processingProgress.total) * 100);
        return Math.max(0, Math.min(100, pct));
    }, [processingProgress]);
    React.useEffect(() => {
        if (!isActive) return;
        const container = logsContainerRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const shouldStickToBottom = container.scrollTop === 0 || distanceFromBottom <= 24;
        if (!shouldStickToBottom) return;
        container.scrollTop = container.scrollHeight;
    }, [isActive, scanLogs.length]);

    const resolveRequestedCaptureMatchId = React.useCallback((requestedMatchId?: string | number | null): string | number | null => {
        if (requestedMatchId != null && requestedMatchId !== '') {
            return requestedMatchId;
        }
        return resolveSubmissionMatchId();
    }, [resolveSubmissionMatchId]);

    const runAutoSequenceCapture = React.useCallback(async (
        requestedUser?: string | null,
        requestedMatchId?: string | number | null,
        options?: { source?: string }
    ) => {
        const captureUser = requestedUser ?? activeUser ?? null;
        const captureMatchId = resolveRequestedCaptureMatchId(requestedMatchId);
        if (autoSequenceInFlightRef.current) {
            Logger.info('ActionPanel', 'Ignoring auto-sequence request because one is already running', {
                activeUser: captureUser,
                matchId: captureMatchId ?? null,
                source: options?.source ?? null,
            });
            setToast({ message: 'Auto-capture already in progress.', type: 'warning' });
            return;
        }

        autoSequenceInFlightRef.current = true;
        Logger.info('ActionPanel', 'Starting auto-sequence smart capture', {
            activeUser: captureUser,
            matchId: captureMatchId ?? null,
            source: options?.source ?? null,
        });

        try {
            const result = await startAutoCapture(buildAutoCaptureStateSnapshot({
                activeUser: captureUser ?? '',
                matchId: captureMatchId,
            }));

            if (result.started) {
                return;
            }

            Logger.warn('ActionPanel', 'Auto-sequence start request was not accepted', {
                activeUser: captureUser,
                matchId: captureMatchId ?? null,
                source: options?.source ?? null,
                ignored: result.ignored === true,
                reason: result.reason || null,
                error: result.error || null,
            });
            if (result.ignored) {
                const message = result.reason === 'cooldown'
                    ? 'Auto-capture is cooling down. Try again in a moment.'
                    : 'Auto-capture already in progress.';
                setToast({ message, type: 'warning' });
                return;
            }

            const message = result.error
                || (result.reason === 'no-active-match'
                    ? 'No active match in progress.'
                    : (result.reason === 'missing-tactical-map-key'
                        ? 'No tactical map key configured. Set it in Settings.'
                        : (result.reason === 'invalid-tactical-map-key'
                            ? 'Unsupported tactical map key configured. Check Settings.'
                            : 'Auto-capture could not start.')));
            setToast({ message: `Auto-capture failed: ${message}`, type: 'error' });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            Logger.warn('ActionPanel', 'Auto-sequence smart capture failed', {
                activeUser: captureUser,
                matchId: captureMatchId ?? null,
                source: options?.source ?? null,
                error: message,
            });
            setToast({ message: `Auto-capture failed: ${message}`, type: 'error' });
        } finally {
            autoSequenceInFlightRef.current = false;
        }
    }, [activeUser, resolveRequestedCaptureMatchId, setToast]);

    const handleSmartCaptureRequest = React.useCallback(async (request: SmartCaptureRequestPayload) => {
        const requestBehavior = request.behavior === 'auto-sequence'
            ? 'auto-sequence'
            : (request.behavior === 'single'
                ? 'single'
                : (autoSequenceOnCapture ? 'auto-sequence' : 'single'));
        const requestedUser = request.activeUser;
        const requestedMatchId = request.matchId;
        const requestSource = typeof request.source === 'string' ? request.source : null;

        Logger.info('ActionPanel', 'Handling smart capture request', {
            requestId: request.requestId || null,
            behavior: requestBehavior,
            source: requestSource,
            activeUser: requestedUser ?? activeUser ?? null,
            requestedMatchId: requestedMatchId ?? null,
            forceOcr: request.forceOcr === true,
            isActive,
        });

        try {
            if (request.forceOcr === true) {
                await processAllStored(requestedUser ?? activeUser ?? null, requestedMatchId ?? undefined);
                return;
            }

            const resolvedMatchId = resolveRequestedCaptureMatchId(requestedMatchId);
            if (requestBehavior === 'auto-sequence') {
                await runAutoSequenceCapture(requestedUser, resolvedMatchId, {
                    source: requestSource ?? undefined,
                });
                return;
            }

            if (resolvedMatchId != null && resolvedMatchId !== '') {
                await triggerSmartCapture(requestedUser ?? activeUser ?? null, resolvedMatchId);
            } else {
                await triggerSmartCapture(requestedUser ?? activeUser ?? null);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            Logger.warn('ActionPanel', 'Smart capture request failed', {
                requestId: request.requestId || null,
                error: message,
            });
            setToast({ message: `Smart Capture request failed: ${message}`, type: 'error' });
        }
    }, [activeUser, autoSequenceOnCapture, isActive, processAllStored, resolveRequestedCaptureMatchId, runAutoSequenceCapture, setToast, triggerSmartCapture]);

    React.useEffect(() => {
        if (!isActive) return;
        Logger.info('ActionPanel', 'Mounted smart capture window-event listener');
        const onCaptureRequest = (evt: Event) => {
            const custom = evt as CustomEvent<SmartCaptureRequestPayload>;
            const requestId = custom?.detail?.requestId || null;
            if (requestId && handledCaptureRequestRef.current === requestId) return;
            if (requestId) handledCaptureRequestRef.current = requestId;
            const now = Date.now();
            if (now - lastCaptureRequestAtRef.current < 350) return;
            lastCaptureRequestAtRef.current = now;
            Logger.info('ActionPanel', 'Received smart-capture-request window event', custom?.detail || {});
            void handleSmartCaptureRequest(custom?.detail || {});
        };
        window.addEventListener('smart-capture-request', onCaptureRequest as EventListener);
        return () => window.removeEventListener('smart-capture-request', onCaptureRequest as EventListener);
    }, [handleSmartCaptureRequest, isActive]);

    React.useEffect(() => {
        if (!isActive) return;
        if (!smartCaptureRequest?.requestId) return;
        const requestId = smartCaptureRequest.requestId;
        if (handledCaptureRequestRef.current === requestId) {
            clearSmartCaptureRequest(requestId);
            return;
        }
        handledCaptureRequestRef.current = requestId;
        Logger.info('ActionPanel', 'Consuming shared smart capture request from UI state', smartCaptureRequest);
        void handleSmartCaptureRequest(smartCaptureRequest);
        clearSmartCaptureRequest(requestId);
    }, [clearSmartCaptureRequest, handleSmartCaptureRequest, isActive, smartCaptureRequest]);

    const autoOpenedForPendingRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!isActive) return;
        if (isProcessing && !processingToastShownRef.current) {
            processingToastShownRef.current = true;
            pushNotification({
                message: 'Processing OCR...',
                type: 'info',
                source: 'smart-capture',
                deepLink: { type: 'openView', view: 'recording' },
            });
        }
        if (!isProcessing) {
            processingToastShownRef.current = false;
        }
    }, [isActive, isProcessing, pushNotification]);

    // Rerun/queued OCR completion can open review automatically, but this is configurable.
    React.useEffect(() => {
        if (!isActive) return;
        if (processingStatus?.phase !== 'completed') return;
        const promotionMatchId = queueScopeMatchId ?? submissionMatchId ?? null;
        const promotionData = promotionMatchId != null ? getPendingData(promotionMatchId) : pendingData;
        if (!promotionData) return;
        // Use a key to prevent re-opening for the same data
        const dataKey = [
            String(promotionMatchId ?? 'unscoped'),
            String(promotionData.captureTimestamp || 0),
            String(Array.isArray(promotionData.artifacts) ? promotionData.artifacts.length : 0),
        ].join(':');
        if (autoOpenedForPendingRef.current === dataKey) return;
        autoOpenedForPendingRef.current = dataKey;
        Logger.info('ActionPanel', 'OCR completion detected', {
            source: 'auto-open-after-rerun',
            matchId: promotionMatchId,
            captureTimestamp: promotionData.captureTimestamp,
            artifactCount: Array.isArray(promotionData.artifacts) ? promotionData.artifacts.length : 0,
        });
        if (!ocrAutoOpenAfterRerun) {
            pushNotification({
                message: 'OCR completed. Review is available when you are ready.',
                type: 'success',
                source: 'smart-capture',
                durationMs: 8_000,
                deepLink: { type: 'openView', view: 'smart-captures' },
            });
            return;
        }
        syncDraftArtifacts(promotionMatchId);
        dispatchOcrGate(promotionData, {
            matchId: promotionMatchId,
            source: 'auto-open-after-rerun',
        });
    }, [
        autoOpenedForPendingRef,
        dispatchOcrGate,
        getPendingData,
        isActive,
        ocrAutoOpenAfterRerun,
        pendingData,
        processingStatus?.phase,
        pushNotification,
        queueScopeMatchId,
        submissionMatchId,
        syncDraftArtifacts,
    ]);

    React.useEffect(() => {
        if (!isActive) return;
        const onMatchComplete = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ result?: MatchResult }>;
            const result = customEvt?.detail?.result;
            if (!result) return;
            setPulseResult(result);
            setTimeout(() => setPulseResult(null), runtimeConfig.actionPanel.resultPulseDurationMs);
        };
        window.addEventListener('recording:match-complete', onMatchComplete as EventListener);
        return () => window.removeEventListener('recording:match-complete', onMatchComplete as EventListener);
    }, [isActive]);

    const triggerResultRipple = (result: MatchResult, event: React.PointerEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const id = Date.now();
        setRipples((prev) => ({ ...prev, [result]: { id, x, y } }));
        setTimeout(() => {
            setRipples((prev) => (prev[result]?.id === id ? { ...prev, [result]: null } : prev));
        }, runtimeConfig.actionPanel.resultRippleDurationMs);
    };

    const initiateSubmission = React.useCallback(async (result: MatchResult) => {
        const now = Date.now();
        const lastSignal = lastSubmitSignalRef.current;
        if (lastSignal && lastSignal.result === result && (now - lastSignal.at) < 250) {
            return;
        }
        lastSubmitSignalRef.current = { result, at: now };
        setLastSubmitted(result);

        const scopedPendingData = submissionMatchId != null ? getPendingData(submissionMatchId) : pendingData;
        if (onSmartCaptureData && (scopedPendingData || pendingOcrCountForSubmission > 0)) {
            if (scopedPendingData) {
                dispatchOcrGate(scopedPendingData, {
                    result,
                    matchId: submissionMatchId ?? null,
                    source: 'result-submit',
                });
                return;
            }
            if (resultOcrFlowMode === 'background') {
                openResultWizard(result);
                syncDraftArtifacts(submissionMatchId ?? null);
                setBackgroundOcrState('processing');
                const scopeForSubmission = submissionMatchId ?? null;
                const focusMatchId = Number(scopeForSubmission || 0) || undefined;
                if (!backgroundOcrInFlightRef.current) {
                    backgroundOcrInFlightRef.current = true;
                    pushNotification({
                        message: 'OCR is processing in the background. Results will be available shortly.',
                        type: 'info',
                        source: 'smart-capture',
                        durationMs: 10_000,
                        deepLink: { type: 'openView', view: 'smart-captures', focusMatchId },
                    });
                    void (async () => {
                        try {
                            await processAllStored(activeUser || null, scopeForSubmission);
                            const reviewData = scopeForSubmission != null ? getPendingData(scopeForSubmission) : getPendingData();
                            if (reviewData) {
                                dispatchOcrGate(reviewData, {
                                    result,
                                    matchId: scopeForSubmission,
                                    source: 'background-ocr-complete',
                                });
                                pushNotification({
                                    message: 'Background OCR ready for review.',
                                    type: 'success',
                                    source: 'smart-capture',
                                    durationMs: 10_000,
                                    deepLink: { type: 'openView', view: 'smart-captures', focusMatchId: Number(scopeForSubmission || 0) || null },
                                });
                            } else {
                                setBackgroundOcrState('error');
                                pushNotification({
                                    message: 'Background OCR finished without review data.',
                                    type: 'warning',
                                    source: 'smart-capture',
                                    durationMs: 10_000,
                                    deepLink: { type: 'openView', view: 'smart-captures', focusMatchId },
                                });
                            }
                        } catch (error) {
                            Logger.warn('ActionPanel', 'Background OCR processing failed', { error });
                            setBackgroundOcrState('error');
                            pushNotification({
                                message: 'Background OCR failed. Review queued captures manually.',
                                type: 'error',
                                source: 'smart-capture',
                                durationMs: 10_000,
                                deepLink: { type: 'openView', view: 'smart-captures', focusMatchId },
                            });
                        } finally {
                            backgroundOcrInFlightRef.current = false;
                        }
                    })();
                }
                return;
            }
            setOcrDecisionPrompt({ result, processing: false });
            return;
        }

        openResultWizard(result);
        syncDraftArtifacts(submissionMatchId ?? null);
    }, [
        activeUser,
        dispatchOcrGate,
        getPendingData,
        onSmartCaptureData,
        openResultWizard,
        pendingData,
        pendingOcrCountForSubmission,
        processAllStored,
        pushNotification,
        resultOcrFlowMode,
        setBackgroundOcrState,
        submissionMatchId,
        syncDraftArtifacts,
    ]);

    const handleOcrPromptCancel = () => {
        setOcrDecisionPrompt(null);
    };

    const handleOcrPromptContinueWithoutOcr = () => {
        if (!ocrDecisionPrompt) return;
        const { result } = ocrDecisionPrompt;
        setOcrDecisionPrompt(null);
        openResultWizard(result);
        syncDraftArtifacts(submissionMatchId ?? null);
    };

    const handleOcrPromptProcess = async () => {
        if (!ocrDecisionPrompt || ocrDecisionPrompt.processing) return;
        const { result } = ocrDecisionPrompt;
        setOcrDecisionPrompt({ result, processing: true });
        await processAllStored(activeUser || null, submissionMatchId ?? null);
        const reviewData = submissionMatchId != null ? getPendingData(submissionMatchId) : getPendingData();
        if (reviewData) {
            syncDraftArtifacts(submissionMatchId ?? null);
            setOcrDecisionPrompt(null);
            dispatchOcrGate(reviewData, {
                result,
                matchId: submissionMatchId ?? null,
                source: 'prompt-process',
            });
            return;
        }
        setOcrDecisionPrompt(null);
        pushNotification({
            message: 'No OCR review data was produced. Continuing to wizard.',
            type: 'warning',
            source: 'smart-capture',
            durationMs: 10_000,
            deepLink: { type: 'openView', view: 'recording' },
        });
        openResultWizard(result);
        syncDraftArtifacts(submissionMatchId ?? null);
    };

    React.useEffect(() => {
        if (!isActive) return;
        const onOpenResultRequest = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ result?: MatchResult }>;
            const result = customEvt?.detail?.result;
            if (!result) return;
            void initiateSubmission(result);
        };
        window.addEventListener('submission:open-result', onOpenResultRequest as EventListener);
        return () => window.removeEventListener('submission:open-result', onOpenResultRequest as EventListener);
    }, [isActive, initiateSubmission]);

    const ResultButtons: React.FC<{ compact: boolean }> = ({ compact }) => (
        <div className={`grid grid-cols-3 ${compact ? 'gap-1.5' : 'gap-2'}`}>
            {([
                { key: 'Win', icon: Trophy, cls: 'recording-result-btn--win' },
                { key: 'Loss', icon: Skull, cls: 'recording-result-btn--loss' },
                { key: 'Draw', icon: Scale, cls: 'recording-result-btn--draw' },
            ] as const).map(({ key, icon: Icon, cls }) => (
                <button
                    key={key}
                    type="button"
                    onPointerDown={(event) => {
                        triggerResultRipple(key, event);
                        if (event.button === 0) void initiateSubmission(key);
                    }}
                    onClick={() => { void initiateSubmission(key); }}
                    className={`recording-result-btn ${cls} ${compact ? 'rounded-control' : 'rounded-card'} ${lastSubmitted === key ? 'is-selected' : ''} ${pulseResult === key ? 'is-pulse' : ''}`}
                >
                    <Icon size={compact ? 18 : 20} />
                    <span>{key}</span>
                    {ripples[key] && (
                        <span
                            key={ripples[key]!.id}
                            className="recording-result-ripple"
                            style={{ left: ripples[key]!.x, top: ripples[key]!.y }}
                        />
                    )}
                </button>
            ))}
        </div>
    );

    const renderProgressTrack = ({
        label,
        percent,
        indeterminate = false,
    }: {
        label: string;
        percent: number | null;
        indeterminate?: boolean;
    }) => (
        <div
            className="h-1.5 bg-md-sys-on-surface/5 rounded-full overflow-hidden w-full"
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={typeof percent === 'number' ? percent : undefined}
            aria-valuetext={typeof percent === 'number' ? `${percent}%` : 'In progress'}
        >
            {indeterminate ? (
                <div className="relative h-full w-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 w-3/5 rounded-full bg-gradient-to-r from-md-sys-primary/20 via-md-sys-primary to-md-sys-primary/20 animate-pulse" />
                </div>
            ) : (
                <div
                    className="h-full bg-md-sys-primary transition-all duration-300 ease-out"
                    style={{ width: `${percent ?? 0}%` }}
                />
            )}
        </div>
    );

    // Shared Status Block (OCR Progress)
    const StatusOverlay = () => (
        (isScanning || isCapturing || isProcessing) ? (
            <div className="mg-surface-high border border-md-sys-outline/10 rounded-card p-4 flex flex-col gap-3 shadow-lg animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-control bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer flex items-center justify-center">
                            <ScanEye size={16} className={isScanning ? 'animate-pulse' : ''} />
                        </div>
                        <div>
                            <div className="text-label-sm font-bold uppercase tracking-wider text-md-sys-primary">
                                {isCapturing ? 'Capturing Window' : isProcessing ? 'Processing OCR' : 'Smart Scan'}
                            </div>
                            <div className="text-label-sm text-md-sys-on-surface/60 font-medium">
                                {isCapturing
                                    ? 'Saving snapshot...'
                                    : isProcessing
                                        ? (processingProgress
                                            ? `Running ${ocrModeLabel} Engine (${processingProgress.current}/${processingProgress.total})...`
                                            : `Running ${ocrModeLabel} Engine...`)
                                        : scanProgress.status}
                            </div>
                            {isProcessing && processingStatus?.message ? (
                                <div className="text-label-xs text-md-sys-on-surface/50">
                                    {processingStatus.message}
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <div className="text-label-sm font-mono font-bold text-md-sys-primary">
                        {isScanning
                            ? `${Math.round(scanProgress.pct)}%`
                            : isProcessing && processingPercent != null
                                ? `${processingPercent}%`
                                : ''}
                    </div>
                </div>
                {isScanning
                    ? renderProgressTrack({
                        label: 'Smart scan progress',
                        percent: Math.round(scanProgress.pct),
                    })
                    : isProcessing
                        ? renderProgressTrack({
                            label: 'OCR processing progress',
                            percent: processingPercent,
                            indeterminate: processingPercent == null,
                        })
                        : renderProgressTrack({
                            label: 'Capture progress',
                            percent: 30,
                        })}
                {isScanning && scanLogs.length > 0 && (
                    <div
                        ref={logsContainerRef}
                        className="mt-1 max-h-24 overflow-y-auto mg-surface rounded-card p-2 border border-md-sys-outline/5 font-mono text-label-xs text-md-sys-on-surface/60 flex flex-col gap-1 custom-scrollbar"
                    >
                        {scanLogs.slice(-10).map((log, i) => (
                            <div key={i} className="flex gap-2 items-start opacity-60">
                                <ChevronRight size={10} className="text-md-sys-primary shrink-0 mt-0.5" />
                                <span className="truncate">{log}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        ) : null
    );

    const OcrDecisionPrompt = () => (
        ocrDecisionPrompt ? (
            <div className="fixed inset-0 z-modal-top md3-dialog-scrim flex items-center justify-center p-4" onClick={handleOcrPromptCancel}>
                <div className="md3-dialog rounded-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                    <div className="md3-dialog-title">Queued Smart Captures Detected</div>
                    <div className="md3-dialog-content text-md-sys-on-surface/70 space-y-3">
                        <div>
                            Result selection no longer auto-runs OCR. Choose whether to process queued captures before entering the wizard.
                        </div>
                        {ocrDecisionPrompt.processing ? (
                            <div className="rounded-control border border-md-sys-primary/15 bg-md-sys-primary/5 p-3 space-y-2">
                                <div className="flex items-center gap-2 text-md-sys-primary">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-label-sm font-bold uppercase tracking-wide">
                                        {processingProgress
                                            ? `Processing ${processingProgress.current}/${processingProgress.total}`
                                            : 'Processing queued captures'}
                                    </span>
                                </div>
                                <div className="text-label-sm text-md-sys-on-surface/70">
                                    {processingStatus?.message || 'OCR is analyzing the queued screenshots now.'}
                                </div>
                                {renderProgressTrack({
                                    label: 'Queued OCR review progress',
                                    percent: processingPercent,
                                    indeterminate: processingPercent == null,
                                })}
                                <div className="text-label-xs text-md-sys-on-surface/55">
                                    {processingProgress
                                        ? `${processingProgress.current}/${processingProgress.total} images complete`
                                        : 'This can take a moment while each screenshot is analyzed.'}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    <div className="md3-dialog-actions flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={handleOcrPromptCancel}
                            disabled={ocrDecisionPrompt.processing}
                            className="md3-btn-text"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleOcrPromptContinueWithoutOcr}
                            disabled={ocrDecisionPrompt.processing}
                            className="md3-btn-outlined"
                        >
                            Continue Without OCR
                        </button>
                        <button
                            type="button"
                            onClick={() => { void handleOcrPromptProcess(); }}
                            disabled={ocrDecisionPrompt.processing}
                            className="md3-btn-filled"
                        >
                            {ocrDecisionPrompt.processing ? 'Processing OCR...' : 'Process OCR and Review'}
                        </button>
                    </div>
                </div>
            </div>
        ) : null
    );

    if (isTransparent) {
        return (
            <div className="flex flex-col gap-3 p-1">
                {!showSmartCaptureInHeader && (
                    <button
                        onClick={handleNewSmartCapture}
                        disabled={isBusy}
                        data-tour="smart-capture"
                        className="relative z-50 w-full bg-md-sys-primary text-md-sys-onPrimary py-4 font-bold text-body uppercase tracking-wide flex items-center justify-center gap-3 shadow-xl ring-2 ring-md-sys-primary/30 active:scale-98 transition-all disabled:opacity-disabled disabled:cursor-not-allowed group rounded-card"
                    >
                        {isBusy ? <Loader2 size={18} className="animate-spin" /> : <Scan size={18} className="group-hover:scale-110 transition-transform" />}
                        <span>Smart Capture</span>
                    </button>
                )}

                {captureError && (
                    <div className="bg-md-sys-errorContainer/20 border border-md-sys-error/20 rounded-control px-3 py-2 text-label-sm text-md-sys-error flex justify-between items-center mg-blur">
                        <span>{captureError}</span>
                        <button onClick={clearCaptureError} className="hover:text-md-sys-error/80" aria-label="Dismiss capture error">&times;</button>
                    </div>
                )}
                {qualityHint && (
                    <div className={`rounded-control px-3 py-2.5 text-label-sm border ${qualityHint.level === 'good'
                        ? 'bg-success-soft border-success-soft-strong'
                        : qualityHint.level === 'fair'
                            ? 'bg-warning-soft border-warning-soft-strong'
                            : 'bg-danger-soft border-danger-soft-strong'
                        }`}>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className={`text-label-xs font-bold uppercase tracking-wide ${qualityHint.level === 'good' ? 'text-success' : qualityHint.level === 'fair' ? 'text-warning' : 'text-danger'}`}>
                                {qualityHint.level === 'good' ? '● Good' : qualityHint.level === 'fair' ? '◐ Fair' : '○ Poor'}
                            </span>
                            <span className="text-label-xs opacity-60">Capture Quality</span>
                        </div>
                        <div className="w-full bg-md-sys-on-surface/10 rounded-full h-1 mb-1.5">
                            <div className={`h-1 rounded-full transition-all ${qualityHint.level === 'good' ? 'bg-success w-full' : qualityHint.level === 'fair' ? 'bg-warning w-2/3' : 'bg-danger w-1/3'}`} />
                        </div>
                        <p className="text-label-xs opacity-60">{qualityHint.message}</p>
                    </div>
                )}

                {queuedCaptureCountForScope > 0 && (
                    <div className="flex gap-2 animate-in slide-in-from-top-1">
                        <button
                            onClick={pendingDataForQueueScope ? handleReviewBucket : handleProcessQueue}
                            disabled={isBusy}
                            className="flex-1 bg-md-sys-primary/10 hover:bg-md-sys-primary/20 text-md-sys-primary border border-md-sys-primary/20 text-label-sm uppercase font-bold py-2.5 rounded-control transition-all disabled:opacity-disabled flex items-center justify-center gap-2"
                        >
                            <span className="px-1.5 py-0.5 bg-md-sys-primary text-md-sys-onPrimary text-label-xs font-bold rounded-full">
                                {queuedCaptureCountForScope}
                            </span>
                            {pendingDataForQueueScope ? 'Review & Apply' : 'Process Queue'}
                        </button>
                        <button
                            onClick={() => processAllStored(activeUser || null, queueScopeMatchId ?? null)}
                            disabled={isBusy || queuedCaptureCountForScope === 0}
                            className="md3-icon-btn mg-surface"
                            title={`Re-run OCR on ${queuedCaptureCountForScope} screenshots`}
                            aria-label={`Re-run OCR on ${queuedCaptureCountForScope} screenshots`}
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                )}

                {isMatchInProgress ? (
                    <div className="bg-success-soft border border-success-soft-strong rounded-control px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            <span className="text-label-xs font-bold uppercase text-md-sys-primary">Live Mission</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            <span className="font-mono tabular-nums font-bold text-xl tracking-wide text-md-sys-primary">{matchElapsed}</span>
                            <button
                                onClick={handleDiscardMatch}
                                className="inline-flex items-center gap-1 text-label-xs px-2 py-1 bg-md-sys-errorContainer/40 text-md-sys-error rounded hover:bg-md-sys-error/20 font-bold uppercase"
                                title="Discard match and reset all data"
                                aria-label="Discard match"
                            >
                                <Trash2 size={10} />
                                <span>Discard</span>
                            </button>
                            <button
                                onClick={stopManualMatch}
                                className="inline-flex items-center gap-1 text-label-xs px-2 py-1 bg-md-sys-errorContainer/40 text-md-sys-error rounded hover:bg-md-sys-error/20 font-bold uppercase"
                                title="Stop match timer"
                                aria-label="Stop match timer"
                            >
                                <X size={10} />
                                <span>Stop</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={startFreshMatch}
                        className="w-full bg-success-soft border border-success-soft-strong rounded-control px-3 py-2 flex items-center justify-center gap-2 transition-all hover:brightness-110"
                    >
                        <Timer size={12} className="text-success" />
                        <span className="text-label-xs font-bold uppercase text-success">Start Match Timer</span>
                    </button>
                )}

                <SessionTimer
                    startTime={sessionStartTime}
                    matches={matches}
                    lastActivity={lastActivity}
                    onRefreshActivity={() => setLastActivity(Date.now())}
                    matchStartTime={matchStartTime}
                    isMatchInProgress={isMatchInProgress}
                    onStartMatch={startFreshMatch}
                    onResetMatch={stopManualMatch}
                    variant="compact"
                />
                <button
                    type="button"
                    onClick={toggleLifecycleTrackingPause}
                    className={`w-full rounded-control border px-3 py-2 text-label-xs font-bold uppercase tracking-wide transition-colors ${
                        lifecycleTrackingPaused
                            ? 'bg-warning-soft border-warning-soft-strong text-warning'
                            : 'bg-md-sys-surfaceContainerLow border-md-sys-outline/20 text-md-sys-on-surface/75 hover:bg-md-sys-surfaceContainerHigh'
                    }`}
                    title={lifecycleTrackingPaused ? 'Resume auto match tracking' : 'Pause auto match tracking'}
                    aria-label={lifecycleTrackingPaused ? 'Resume auto match tracking' : 'Pause auto match tracking'}
                >
                    {lifecycleTrackingPaused ? 'Resume Tracking' : 'Pause Tracking'}
                </button>

                <div className="mt-1">
                    <ResultButtons compact />
                </div>

                {processingProgress && (
                    <div className="text-label-sm font-semibold text-md-sys-on-surface/60 px-1">
                        OCR queue: {processingProgress.current}/{processingProgress.total}
                    </div>
                )}

                <StatusOverlay />
                <OcrDecisionPrompt />
            </div>
        );
    }

    // Default Layout
    return (
        <div className={`flex flex-col ${isCompact ? 'gap-3' : 'gap-4'}`}>
            {/* Mission Section */}
            <div data-recording-panel="match-recording" className={`md3-card recording-inside-panel flex flex-col overflow-visible mg-surface shadow-lg ${isCompact ? 'p-3 gap-3' : 'p-4 gap-4'}`}>
                {queuedCaptureCountForScope > 0 && (
                    <div className="flex justify-end">
                        <button
                            onClick={pendingDataForQueueScope ? handleReviewBucket : handleProcessQueue}
                            disabled={isBusy}
                            className={`bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer rounded-control font-bold text-label-sm uppercase tracking-widest relative overflow-visible ${isCompact ? 'h-36px px-2.5' : 'h-36px px-3'}`}
                        >
                            {pendingDataForQueueScope ? 'Review' : `Process ${queuedCaptureCountForScope}`}
                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-md-sys-primary text-md-sys-onPrimary rounded-full text-label-xs flex items-center justify-center shadow-md animate-in zoom-in-50">
                                {queuedCaptureCountForScope}
                            </span>
                        </button>
                    </div>
                )}

                <SessionTimer
                    startTime={sessionStartTime}
                    matches={matches}
                    lastActivity={lastActivity}
                    onRefreshActivity={() => setLastActivity(Date.now())}
                    matchStartTime={matchStartTime}
                    isMatchInProgress={isMatchInProgress}
                    onStartMatch={startFreshMatch}
                    onResetMatch={stopManualMatch}
                    variant={isCompact ? 'compact' : 'default'}
                />
                <button
                    type="button"
                    onClick={toggleLifecycleTrackingPause}
                    className={`w-full rounded-control border px-3 py-2 text-label-sm font-bold uppercase tracking-wide transition-colors ${
                        lifecycleTrackingPaused
                            ? 'bg-warning-soft border-warning-soft-strong text-warning'
                            : 'bg-md-sys-surfaceContainerLow border-md-sys-outline/20 text-md-sys-on-surface/75 hover:bg-md-sys-surfaceContainerHigh'
                    }`}
                    title={lifecycleTrackingPaused ? 'Resume auto match tracking' : 'Pause auto match tracking'}
                    aria-label={lifecycleTrackingPaused ? 'Resume auto match tracking' : 'Pause auto match tracking'}
                >
                    {lifecycleTrackingPaused ? 'Resume Tracking' : 'Pause Tracking'}
                </button>

                <ResultButtons compact={isCompact} />

                {!showSmartCaptureInHeader && (
                    <button
                        onClick={handleNewSmartCapture}
                        disabled={isBusy}
                        data-tour="smart-capture"
                        className="w-full bg-md-sys-primary text-md-sys-onPrimary py-3 rounded-control font-bold text-label-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-98 disabled:opacity-disabled disabled:cursor-not-allowed"
                        title="Capture screenshot and queue OCR"
                    >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Scan size={14} />}
                        <span>Smart Capture</span>
                        {pendingOcrCountForSubmission > 0 && (
                            <span className="px-1.5 py-0.5 rounded-pill bg-md-sys-onPrimary/20 text-label-xs font-black">
                                {pendingOcrCountForSubmission}
                            </span>
                        )}
                    </button>
                )}

                {isMatchInProgress ? (
                    <div className="bg-success-soft border border-success-soft-strong rounded-control px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            <span className="text-label-sm font-bold uppercase text-md-sys-primary">Live Mission</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            <span className="font-mono tabular-nums font-bold text-xl tracking-wide text-md-sys-primary">{matchElapsed}</span>
                            <button
                                onClick={handleDiscardMatch}
                                className="inline-flex items-center gap-1 text-label-xs px-2 py-1 bg-md-sys-errorContainer/40 text-md-sys-error rounded hover:bg-md-sys-error/20 font-bold uppercase"
                                title="Discard match and reset all data"
                                aria-label="Discard match"
                            >
                                <Trash2 size={10} />
                                <span>Discard</span>
                            </button>
                            <button
                                onClick={stopManualMatch}
                                className="inline-flex items-center gap-1 text-label-xs px-2 py-1 bg-md-sys-errorContainer/40 text-md-sys-error rounded hover:bg-md-sys-error/20 font-bold uppercase"
                                title="Stop match timer"
                                aria-label="Stop match timer"
                            >
                                <X size={10} />
                                <span>Stop</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={startFreshMatch}
                        className="w-full bg-success-soft border border-success-soft-strong rounded-control px-3 py-2 flex items-center justify-center gap-2 transition-all hover:brightness-110"
                    >
                        <Timer size={12} className="text-success" />
                        <span className="text-label-sm font-bold uppercase text-success">Start Match Timer</span>
                    </button>
                )}

                {captureError && (
                    <div className="bg-md-sys-errorContainer/10 border border-md-sys-error/20 rounded-control px-4 py-2.5 text-label-sm text-md-sys-error font-medium flex justify-between items-center mg-blur">
                        <span className="flex items-center gap-2 font-bold"><X size={14} /> {captureError}</span>
                        <button onClick={clearCaptureError} className="opacity-60 hover:opacity-100" aria-label="Dismiss capture error">&times;</button>
                    </div>
                )}
                {qualityHint && (
                    <div className={`rounded-control px-4 py-3 text-label-sm border ${qualityHint.level === 'good'
                        ? 'bg-success-soft border-success-soft-strong'
                        : qualityHint.level === 'fair'
                            ? 'bg-warning-soft border-warning-soft-strong'
                            : 'bg-danger-soft border-danger-soft-strong'
                        }`}>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className={`text-label-xs font-bold uppercase tracking-wide ${qualityHint.level === 'good' ? 'text-success' : qualityHint.level === 'fair' ? 'text-warning' : 'text-danger'}`}>
                                {qualityHint.level === 'good' ? '● Good' : qualityHint.level === 'fair' ? '◐ Fair' : '○ Poor'}
                            </span>
                            <span className="text-label-xs opacity-60">Capture Quality</span>
                        </div>
                        <div className="w-full bg-md-sys-on-surface/10 rounded-full h-1.5 mb-2">
                            <div className={`h-1.5 rounded-full transition-all ${qualityHint.level === 'good' ? 'bg-success w-full' : qualityHint.level === 'fair' ? 'bg-warning w-2/3' : 'bg-danger w-1/3'}`} />
                        </div>
                        <p className="text-label-sm opacity-60">{qualityHint.message}</p>
                        {qualityHint.level === 'poor' && (
                            <p className="text-label-xs font-bold mt-1 opacity-60">Tip: Try capturing with the game in focus and UI fully visible.</p>
                        )}
                    </div>
                )}

                {processingProgress && (
                    <div className="text-label-sm font-semibold text-md-sys-on-surface/60 px-1">
                        OCR queue: {processingProgress.current}/{processingProgress.total}
                    </div>
                )}

                <StatusOverlay />
            </div>
            <OcrDecisionPrompt />
        </div>
    );
};
