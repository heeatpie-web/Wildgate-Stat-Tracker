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
    UserPlus
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

interface ActionPanelProps {
    variant?: 'default' | 'transparent';
    density?: 'standard' | 'compact';
    onSmartCaptureData?: (data: OCRExtractedData) => void;
}

type MatchResult = 'Win' | 'Loss' | 'Draw';

export const ActionPanel: React.FC<ActionPanelProps> = ({ variant = 'default', density = 'standard', onSmartCaptureData }) => {
    const {
        sessionStartTime,
        matches,
        lastActivity, setLastActivity,
        matchStartTime, isMatchInProgress,
        setMatchStartTime, setIsMatchInProgress,
        activeShip, shipSource, telemetryDetectedShip,
        activeHero, heroSource, telemetryDetectedHero,
        currentLoadout,
        pendingReviews,
        detectedUnknowns
    } = useGameData();

    const {
        activeUser,
        setShowReviewQueue,
        setShowIdMapper,
        smartCaptureRequest,
        clearSmartCaptureRequest,
        setToast
    } = useUIState();

    const isTransparent = variant === 'transparent';
    const isCompact = density === 'compact';

    const { handleSmartScan, isScanning, scanProgress, scanLogs } = useSmartScan();
    const ocrMode = useAppStore(s => s.ocrMode);
    const resultOcrFlowMode = useAppStore(s => s.resultOcrFlowMode);
    const ocrModeLabel = ocrMode === 'hybrid-plus'
        ? 'Hybrid+'
        : ocrMode === 'both'
            ? 'Hybrid'
            : ocrMode === 'cloud'
                ? 'Cloud'
                : 'Local';

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
        qualityHint
    } = smartCaptureState;
    const {
        capture: triggerSmartCapture,
        processAllStored,
        clearError: clearCaptureError,
        dismissPendingData,
        getPendingData,
        reanalyzeCaptures
    } = smartCaptureActions;
    const { initiateSubmission: openResultWizard } = useMatchSubmission();

    const resolveSubmissionMatchId = React.useCallback((): string | number | null => {
        type SubmissionSnapshot = {
            pendingMatchData?: { id?: number | string | null } | null;
            matches?: typeof matches;
            sessionStartTime?: number;
            activeUser?: string | null;
        };
        const stateGetter = (useAppStore as unknown as { getState?: () => SubmissionSnapshot }).getState;
        const state = typeof stateGetter === 'function' ? stateGetter() : null;
        const pendingId = Number(state?.pendingMatchData?.id || 0);
        if (Number.isInteger(pendingId) && pendingId > 0) return pendingId;

        const sourceMatches = Array.isArray(state?.matches) ? state.matches : matches;
        const sourceSessionStart = typeof state?.sessionStartTime === 'number' ? state.sessionStartTime : sessionStartTime;
        const sourceUser = (typeof state?.activeUser === 'string' ? state.activeUser : activeUser) || '';
        const recentCutoff = (typeof sourceSessionStart === 'number' && sourceSessionStart > 0)
            ? (sourceSessionStart - 60_000)
            : (Date.now() - (6 * 60 * 60 * 1000));
        const unresolvedDraft = (sourceMatches || []).find((m) => {
            if (!m || m.subType !== 'Telemetry Draft') return false;
            if (Number(m.timestamp || 0) < recentCutoff) return false;
            if (sourceUser && m.player && m.player !== sourceUser) return false;
            return true;
        });
        return unresolvedDraft?.id ?? null;
    }, [activeUser, matches, sessionStartTime]);

    const submissionMatchId = resolveSubmissionMatchId();
    const pendingOcrCountGlobal = savedCaptures.filter(c => !c.ocrProcessed).length;
    const pendingOcrCountForSubmission = submissionMatchId == null
        ? pendingOcrCountGlobal
        : savedCaptures.filter(c => !c.ocrProcessed && String(c.matchId ?? '') === String(submissionMatchId)).length;

    const handleReviewBucket = () => {
        const scopedPending = submissionMatchId != null ? getPendingData(submissionMatchId) : pendingData;
        if (scopedPending && onSmartCaptureData) {
            onSmartCaptureData(scopedPending);
            dismissPendingData();
        }
    };

    const handleProcessQueue = async () => {
        await processAllStored(activeUser || null);
    };

    const isBusy = isScanning || isCapturing || isProcessing;

    // Dedicated mission timer display so match time remains visible at a glance.
    const [matchElapsed, setMatchElapsed] = React.useState('00:00');
    React.useEffect(() => {
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
    }, [isMatchInProgress, matchStartTime]);

    const handleNewSmartCapture = async () => {
        if (onSmartCaptureData) {
            if (submissionMatchId != null) {
                await triggerSmartCapture(activeUser || null, submissionMatchId);
            } else {
                await triggerSmartCapture(activeUser || null);
            }
        } else {
            handleSmartScan();
        }
    };

    const logsEndRef = React.useRef<HTMLDivElement>(null);
    const handledCaptureRequestRef = React.useRef<string | null>(null);
    const lastCaptureRequestAtRef = React.useRef(0);
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
    React.useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [scanLogs]);

    React.useEffect(() => {
        const onCaptureRequest = (evt: Event) => {
            const custom = evt as CustomEvent<{ activeUser?: string | null; requestId?: string; matchId?: string | number | null }>;
            const requestId = custom?.detail?.requestId || null;
            if (requestId && handledCaptureRequestRef.current === requestId) return;
            if (requestId) handledCaptureRequestRef.current = requestId;
            const now = Date.now();
            if (now - lastCaptureRequestAtRef.current < 350) return;
            lastCaptureRequestAtRef.current = now;
            const requestedUser = custom?.detail?.activeUser;
            const requestedMatchId = custom?.detail?.matchId;
            if (requestedMatchId != null && requestedMatchId !== '') {
                void triggerSmartCapture(requestedUser ?? activeUser ?? null, requestedMatchId);
            } else {
                void triggerSmartCapture(requestedUser ?? activeUser ?? null);
            }
        };
        window.addEventListener('smart-capture-request', onCaptureRequest as EventListener);
        return () => window.removeEventListener('smart-capture-request', onCaptureRequest as EventListener);
    }, [triggerSmartCapture, activeUser]);

    React.useEffect(() => {
        if (!smartCaptureRequest?.requestId) return;
        const requestId = smartCaptureRequest.requestId;
        if (handledCaptureRequestRef.current === requestId) {
            clearSmartCaptureRequest(requestId);
            return;
        }
        handledCaptureRequestRef.current = requestId;
        const requestedUser = smartCaptureRequest.activeUser;
        const requestedMatchId = smartCaptureRequest.matchId;
        if (requestedMatchId != null && requestedMatchId !== '') {
            void triggerSmartCapture(requestedUser ?? activeUser ?? null, requestedMatchId);
        } else {
            void triggerSmartCapture(requestedUser ?? activeUser ?? null);
        }
        clearSmartCaptureRequest(requestId);
    }, [activeUser, clearSmartCaptureRequest, smartCaptureRequest, triggerSmartCapture]);

    React.useEffect(() => {
        if (isProcessing && !processingToastShownRef.current) {
            processingToastShownRef.current = true;
            setToast({ message: 'Processing OCR...', type: 'info' });
        }
        if (!isProcessing) {
            processingToastShownRef.current = false;
        }
    }, [isProcessing, setToast]);

    React.useEffect(() => {
        const onMatchComplete = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ result?: MatchResult }>;
            const result = customEvt?.detail?.result;
            if (!result) return;
            setPulseResult(result);
            setTimeout(() => setPulseResult(null), 700);
        };
        window.addEventListener('recording:match-complete', onMatchComplete as EventListener);
        return () => window.removeEventListener('recording:match-complete', onMatchComplete as EventListener);
    }, []);

    const triggerResultRipple = (result: MatchResult, event: React.PointerEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const id = Date.now();
        setRipples((prev) => ({ ...prev, [result]: { id, x, y } }));
        setTimeout(() => {
            setRipples((prev) => (prev[result]?.id === id ? { ...prev, [result]: null } : prev));
        }, 320);
    };

    const initiateSubmission = async (result: MatchResult) => {
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
                window.dispatchEvent(new CustomEvent('submission:ocr-gate', { detail: { result, data: scopedPendingData } }));
                return;
            }
            if (resultOcrFlowMode === 'background') {
                openResultWizard(result);
                const scopeForSubmission = submissionMatchId ?? null;
                if (!backgroundOcrInFlightRef.current) {
                    backgroundOcrInFlightRef.current = true;
                    setToast({ message: 'Processing queued OCR in background...', type: 'info' });
                    void (async () => {
                        try {
                            await processAllStored(activeUser || null, scopeForSubmission);
                            const reviewData = scopeForSubmission != null ? getPendingData(scopeForSubmission) : getPendingData();
                            if (reviewData) {
                                onSmartCaptureData(reviewData);
                                setToast({ message: 'Background OCR ready for review.', type: 'success' });
                            } else {
                                setToast({ message: 'Background OCR finished without review data.', type: 'warning' });
                            }
                        } catch (error) {
                            Logger.warn('ActionPanel', 'Background OCR processing failed', { error });
                            setToast({ message: 'Background OCR failed. Review queued captures manually.', type: 'error' });
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
    };

    const handleOcrPromptCancel = () => {
        setOcrDecisionPrompt(null);
    };

    const handleOcrPromptContinueWithoutOcr = () => {
        if (!ocrDecisionPrompt) return;
        const { result } = ocrDecisionPrompt;
        setOcrDecisionPrompt(null);
        openResultWizard(result);
    };

    const handleOcrPromptProcess = async () => {
        if (!ocrDecisionPrompt || ocrDecisionPrompt.processing) return;
        const { result } = ocrDecisionPrompt;
        setOcrDecisionPrompt({ result, processing: true });
        await processAllStored(activeUser || null, submissionMatchId ?? null);
        const reviewData = submissionMatchId != null ? getPendingData(submissionMatchId) : getPendingData();
        if (reviewData) {
            setOcrDecisionPrompt(null);
            window.dispatchEvent(new CustomEvent('submission:ocr-gate', { detail: { result, data: reviewData } }));
            return;
        }
        setOcrDecisionPrompt(null);
        setToast({ message: 'No OCR review data was produced. Continuing to wizard.', type: 'warning' });
        openResultWizard(result);
    };

    React.useEffect(() => {
        const onOpenResultRequest = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ result?: MatchResult }>;
            const result = customEvt?.detail?.result;
            if (!result) return;
            void initiateSubmission(result);
        };
        window.addEventListener('submission:open-result', onOpenResultRequest as EventListener);
        return () => window.removeEventListener('submission:open-result', onOpenResultRequest as EventListener);
    }, [initiateSubmission]);

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
                        </div>
                    </div>
                    <div className="text-label-sm font-mono font-bold text-md-sys-primary">
                        {isScanning ? `${Math.round(scanProgress.pct)}%` : ''}
                    </div>
                </div>
                <div className="h-1.5 bg-md-sys-on-surface/5 rounded-full overflow-hidden w-full">
                    <div
                        className="h-full bg-md-sys-primary transition-all duration-300 ease-out"
                        style={{ width: isScanning ? `${scanProgress.pct}%` : (isCapturing ? '30%' : isProcessing ? '70%' : '0%') }}
                    />
                </div>
                {isScanning && scanLogs.length > 0 && (
                    <div className="mt-1 max-h-24 overflow-y-auto mg-surface rounded-card p-2 border border-md-sys-outline/5 font-mono text-label-xs text-md-sys-on-surface/60 flex flex-col gap-1 custom-scrollbar">
                        {scanLogs.slice(-10).map((log, i) => (
                            <div key={i} className="flex gap-2 items-start opacity-60">
                                <ChevronRight size={10} className="text-md-sys-primary shrink-0 mt-0.5" />
                                <span className="truncate">{log}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                )}
            </div>
        ) : null
    );

    const OcrDecisionPrompt = () => (
        ocrDecisionPrompt ? (
            <div className="fixed inset-0 z-modal-top md3-dialog-scrim flex items-center justify-center p-4">
                <div className="md3-dialog rounded-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                    <div className="md3-dialog-title">Queued Smart Captures Detected</div>
                    <div className="md3-dialog-content text-md-sys-on-surface/70">
                        Result selection no longer auto-runs OCR. Choose whether to process queued captures before entering the wizard.
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
                <button
                    onClick={handleNewSmartCapture}
                    disabled={isBusy}
                    data-tour="smart-capture"
                    className="relative z-50 w-full bg-md-sys-primary text-md-sys-onPrimary py-4 font-bold text-body uppercase tracking-wide flex items-center justify-center gap-3 shadow-xl ring-2 ring-md-sys-primary/30 active:scale-98 transition-all disabled:opacity-disabled disabled:cursor-not-allowed group rounded-card"
                >
                    {isBusy ? <Loader2 size={18} className="animate-spin" /> : <Scan size={18} className="group-hover:scale-110 transition-transform" />}
                    <span>Smart Capture</span>
                </button>

                {captureError && (
                    <div className="bg-md-sys-errorContainer/20 border border-md-sys-error/20 rounded-control px-3 py-2 text-label-sm text-md-sys-error flex justify-between items-center mg-blur">
                        <span>{captureError}</span>
                        <button onClick={clearCaptureError} className="hover:text-md-sys-error/80">&times;</button>
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

                {(capturedScreenshots.length > 0 || pendingOcrCountGlobal > 0) && (
                    <div className="flex gap-2 animate-in slide-in-from-top-1">
                        <button
                            onClick={pendingData ? handleReviewBucket : handleProcessQueue}
                            disabled={isBusy}
                            className="flex-1 bg-md-sys-primary/10 hover:bg-md-sys-primary/20 text-md-sys-primary border border-md-sys-primary/20 text-label-sm uppercase font-bold py-2.5 rounded-control transition-all disabled:opacity-disabled flex items-center justify-center gap-2"
                        >
                            <span className="px-1.5 py-0.5 bg-md-sys-primary text-md-sys-onPrimary text-label-xs font-bold rounded-full">
                                {pendingData ? capturedScreenshots.length : pendingOcrCountGlobal}
                            </span>
                            {pendingData ? 'Review & Apply' : 'Process Queue'}
                        </button>
                        <button onClick={reanalyzeCaptures} disabled={isBusy} className="md3-icon-btn mg-surface" title="Re-merge"><RefreshCw size={14} /></button>
                    </div>
                )}

                {isMatchInProgress ? (
                    <div className="bg-success-soft border border-success-soft-strong rounded-control px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            <span className="text-label-xs font-bold uppercase text-md-sys-primary">Live Mission</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-body text-md-sys-primary">{matchElapsed}</span>
                            <button
                                onClick={() => { setIsMatchInProgress(false); setMatchStartTime(null); }}
                                className="text-label-xs px-1.5 py-0.5 bg-md-sys-errorContainer/40 text-md-sys-error rounded hover:bg-md-sys-error/20 font-bold uppercase"
                                title="Stop timer"
                            >x</button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => { setIsMatchInProgress(true); setMatchStartTime(Date.now()); }}
                        className="w-full bg-success-soft border border-success-soft-strong rounded-control px-3 py-2 flex items-center justify-center gap-2 transition-all hover:brightness-110"
                    >
                        <Timer size={12} className="text-success" />
                        <span className="text-label-xs font-bold uppercase text-success">Start Match Timer</span>
                    </button>
                )}

                <div className="mg-surface rounded-card p-2 border border-md-sys-outline/10">
                    <SessionTimer
                        startTime={sessionStartTime}
                        matches={matches}
                        lastActivity={lastActivity}
                        onRefreshActivity={() => setLastActivity(Date.now())}
                        matchStartTime={matchStartTime}
                        isMatchInProgress={isMatchInProgress}
                        onStartMatch={() => { setIsMatchInProgress(true); setMatchStartTime(Date.now()); }}
                        onResetMatch={() => { setMatchStartTime(null); setIsMatchInProgress(false); }}
                        variant="compact"
                    />
                </div>

                <div className="mt-1">
                    <ResultButtons compact />
                </div>

                {processingProgress && (
                    <div className="text-label-sm font-semibold text-md-sys-on-surface/60 px-1">
                        OCR queue: {processingProgress.current}/{processingProgress.total}
                    </div>
                )}

                {/* Telemetry Detection Indicators */}
                {(telemetryDetectedShip || telemetryDetectedHero || (currentLoadout?.weapons?.length || 0) > 0 || (currentLoadout?.equipment?.length || 0) > 0) && (
                    <div className="mg-surface rounded-card p-2 border border-info/15 space-y-1">
                        {telemetryDetectedShip && (
                            <div className="flex items-center gap-2 text-label-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-info flex-shrink-0 animate-pulse" />
                                <span className="font-bold uppercase tracking-wide text-info">Ship</span>
                                <span className="font-bold text-md-sys-on-surface">{telemetryDetectedShip.split('(')[0].trim()}</span>
                                {activeShip && telemetryDetectedShip !== activeShip && (
                                    <span className="opacity-60 text-label-xs">(overridden)</span>
                                )}
                            </div>
                        )}
                        {telemetryDetectedHero && (
                            <div className="flex items-center gap-2 text-label-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-info flex-shrink-0 animate-pulse" />
                                <span className="font-bold uppercase tracking-wide text-info">Prospector</span>
                                <span className="font-bold text-md-sys-on-surface">{telemetryDetectedHero}</span>
                                {activeHero && telemetryDetectedHero !== activeHero && (
                                    <span className="opacity-60 text-label-xs">(overridden)</span>
                                )}
                            </div>
                        )}
                        {Array.isArray(currentLoadout?.weapons) && currentLoadout.weapons.length > 0 && (
                            <div className="flex items-start gap-2 text-label-sm">
                                <span className="font-bold uppercase tracking-wide text-info">Weapons</span>
                                <span className="text-label-xs font-bold uppercase tracking-wide text-info/70">(auto)</span>
                                <span className="text-md-sys-on-surface/80 break-words">
                                    {currentLoadout.weapons.join(', ')}
                                </span>
                            </div>
                        )}
                        {Array.isArray(currentLoadout?.equipment) && currentLoadout.equipment.length > 0 && (
                            <div className="flex items-start gap-2 text-label-sm">
                                <span className="font-bold uppercase tracking-wide text-info">Equipment</span>
                                <span className="text-label-xs font-bold uppercase tracking-wide text-info/70">(auto)</span>
                                <span className="text-md-sys-on-surface/80 break-words">
                                    {currentLoadout.equipment.join(', ')}
                                </span>
                            </div>
                        )}
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
            <div data-recording-panel="match-recording" className={`md3-card flex flex-col overflow-visible mg-surface shadow-lg ${isCompact ? 'p-3 gap-3' : 'p-4 gap-4'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`${isCompact ? 'w-8 h-8 rounded-control' : 'w-10 h-10 rounded-card'} bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center`}>
                            <Trophy size={isCompact ? 14 : 18} />
                        </div>
                        <h3 className="md3-title font-semibold text-md-sys-on-surface uppercase tracking-tight">Match Recording</h3>
                    </div>
                    {(capturedScreenshots.length > 0 || pendingOcrCountGlobal > 0) && (
                        <button
                            onClick={pendingData ? handleReviewBucket : handleProcessQueue}
                            disabled={isBusy}
                            className={`bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer rounded-control font-bold text-label-sm uppercase tracking-widest relative overflow-visible ${isCompact ? 'h-36px px-2.5' : 'h-36px px-3'}`}
                        >
                            {pendingData ? 'Review' : `Process ${pendingOcrCountGlobal}`}
                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-md-sys-primary text-md-sys-onPrimary rounded-full text-label-xs flex items-center justify-center shadow-md animate-in zoom-in-50">
                                {pendingData ? capturedScreenshots.length : pendingOcrCountGlobal}
                            </span>
                        </button>
                    )}
                </div>

                <div className={`mg-surface rounded-card border border-md-sys-outline/10 ${isCompact ? 'p-1.5' : 'p-2'}`}>
                    <SessionTimer
                        startTime={sessionStartTime}
                        matches={matches}
                        lastActivity={lastActivity}
                        onRefreshActivity={() => setLastActivity(Date.now())}
                        matchStartTime={matchStartTime}
                        isMatchInProgress={isMatchInProgress}
                        onStartMatch={() => { setIsMatchInProgress(true); setMatchStartTime(Date.now()); }}
                        onResetMatch={() => { setMatchStartTime(null); setIsMatchInProgress(false); }}
                        variant={isCompact ? 'compact' : 'default'}
                    />
                </div>

                <ResultButtons compact={isCompact} />

                <button
                    type="button"
                    onClick={() => setShowIdMapper(true)}
                    className="rounded-control text-label-sm font-semibold text-md-sys-on-surface/70 hover:text-md-sys-primary flex items-center justify-center gap-1.5 py-1.5"
                    title="Manage player ID mappings"
                >
                    <UserPlus size={12} />
                    ID Mapper
                </button>

                {isMatchInProgress ? (
                    <div className="bg-success-soft border border-success-soft-strong rounded-control px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            <span className="text-label-sm font-bold uppercase text-md-sys-primary">Live Mission</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-body text-md-sys-primary">{matchElapsed}</span>
                            <button
                                onClick={() => { setIsMatchInProgress(false); setMatchStartTime(null); }}
                                className="text-label-xs px-1.5 py-0.5 bg-md-sys-errorContainer/40 text-md-sys-error rounded hover:bg-md-sys-error/20 font-bold uppercase"
                                title="Stop timer"
                            >x</button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => { setIsMatchInProgress(true); setMatchStartTime(Date.now()); }}
                        className="w-full bg-success-soft border border-success-soft-strong rounded-control px-3 py-2 flex items-center justify-center gap-2 transition-all hover:brightness-110"
                    >
                        <Timer size={12} className="text-success" />
                        <span className="text-label-sm font-bold uppercase text-success">Start Match Timer</span>
                    </button>
                )}

                {captureError && (
                    <div className="bg-md-sys-errorContainer/10 border border-md-sys-error/20 rounded-control px-4 py-2.5 text-label-sm text-md-sys-error font-medium flex justify-between items-center mg-blur">
                        <span className="flex items-center gap-2 font-bold"><X size={14} /> {captureError}</span>
                        <button onClick={clearCaptureError} className="opacity-60 hover:opacity-100">&times;</button>
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

                {/* Telemetry Detection Indicators */}
                {(telemetryDetectedShip || telemetryDetectedHero || (currentLoadout?.weapons?.length || 0) > 0 || (currentLoadout?.equipment?.length || 0) > 0) && (
                    <div className="mg-surface rounded-card p-2 border border-info/15 space-y-1">
                        {telemetryDetectedShip && (
                            <div className="flex items-center gap-2 text-label-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-info flex-shrink-0 animate-pulse" />
                                <span className="font-bold uppercase tracking-wide text-info">Ship</span>
                                <span className="font-bold text-md-sys-on-surface">{telemetryDetectedShip.split('(')[0].trim()}</span>
                                {activeShip && telemetryDetectedShip !== activeShip && (
                                    <span className="opacity-60 text-label-xs">(overridden)</span>
                                )}
                            </div>
                        )}
                        {telemetryDetectedHero && (
                            <div className="flex items-center gap-2 text-label-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-info flex-shrink-0 animate-pulse" />
                                <span className="font-bold uppercase tracking-wide text-info">Prospector</span>
                                <span className="font-bold text-md-sys-on-surface">{telemetryDetectedHero}</span>
                                {activeHero && telemetryDetectedHero !== activeHero && (
                                    <span className="opacity-60 text-label-xs">(overridden)</span>
                                )}
                            </div>
                        )}
                        {Array.isArray(currentLoadout?.weapons) && currentLoadout.weapons.length > 0 && (
                            <div className="flex items-start gap-2 text-label-sm">
                                <span className="font-bold uppercase tracking-wide text-info">Weapons</span>
                                <span className="text-label-xs font-bold uppercase tracking-wide text-info/70">(auto)</span>
                                <span className="text-md-sys-on-surface/80 break-words">
                                    {currentLoadout.weapons.join(', ')}
                                </span>
                            </div>
                        )}
                        {Array.isArray(currentLoadout?.equipment) && currentLoadout.equipment.length > 0 && (
                            <div className="flex items-start gap-2 text-label-sm">
                                <span className="font-bold uppercase tracking-wide text-info">Equipment</span>
                                <span className="text-label-xs font-bold uppercase tracking-wide text-info/70">(auto)</span>
                                <span className="text-md-sys-on-surface/80 break-words">
                                    {currentLoadout.equipment.join(', ')}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                <StatusOverlay />
            </div>

            {/* Support Systems */}
            <div className="flex flex-col gap-2">
                {(pendingReviews.length > 0 || Object.keys(detectedUnknowns).length > 0) && (
                    <button
                        className="w-full bg-warning-soft hover:bg-warning/20 text-warning border border-warning-soft py-3 text-label-sm font-bold uppercase tracking-widest rounded-card flex items-center justify-center gap-2 transition-all"
                        onClick={() => {
                            setShowReviewQueue(true);
                            if (Object.keys(detectedUnknowns).length > 0) setShowIdMapper(true);
                        }}
                    >
                        <ScanEye size={14} className="animate-pulse" />
                        Intelligence Review Required ({pendingReviews.length + Object.keys(detectedUnknowns).length})
                    </button>
                )}
            </div>
            <OcrDecisionPrompt />
        </div>
    );
};
