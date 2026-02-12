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
    ChevronRight
} from 'lucide-react';
import { SessionTimer } from '../SessionTimer';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import Logger from '../../utils/logger';
import { useSmartScan } from '../../hooks/useSmartScan';
import { useSmartCapture } from '../../hooks/useSmartCapture';
import { useAppStore } from '../../store/useAppStore';

interface ActionPanelProps {
    variant?: 'default' | 'transparent';
    density?: 'standard' | 'compact';
    onSmartCaptureData?: (data: any) => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({ variant = 'default', density = 'standard', onSmartCaptureData }) => {
    const {
        sessionStartTime,
        matches,
        lastActivity, setLastActivity,
        matchStartTime, isMatchInProgress,
        setMatchStartTime, setIsMatchInProgress,
        setPendingMatchData,
        activeShip, shipSource, telemetryDetectedShip,
        activeHero, heroSource, telemetryDetectedHero,
        pendingReviews,
        detectedUnknowns
    } = useGameData();

    const {
        setShowWizard,
        activeUser,
        setShowReviewQueue,
        setShowIdMapper,
        setToast
    } = useUIState();

    const isTransparent = variant === 'transparent';
    const isCompact = density === 'compact';

    const { handleSmartScan, isScanning, scanProgress, scanLogs } = useSmartScan();
    const ocrMode = useAppStore(s => s.ocrMode);
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
        reanalyzeCaptures
    } = smartCaptureActions;

    const pendingOcrCount = savedCaptures.filter(c => !c.ocrProcessed).length;

    const handleReviewBucket = () => {
        if (pendingData && onSmartCaptureData) {
            onSmartCaptureData(pendingData);
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
            await triggerSmartCapture(activeUser || null);
        } else {
            handleSmartScan();
        }
    };

    const logsEndRef = React.useRef<HTMLDivElement>(null);
    const handledCaptureRequestRef = React.useRef<string | null>(null);
    const lastCaptureRequestAtRef = React.useRef(0);
    const [lastSubmitted, setLastSubmitted] = React.useState<'Win' | 'Loss' | 'Draw' | null>(null);
    React.useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [scanLogs]);

    React.useEffect(() => {
        const onCaptureRequest = (evt: Event) => {
            const custom = evt as CustomEvent<{ activeUser?: string | null; requestId?: string }>;
            const requestId = custom?.detail?.requestId || null;
            if (requestId && handledCaptureRequestRef.current === requestId) return;
            if (requestId) handledCaptureRequestRef.current = requestId;
            const now = Date.now();
            if (now - lastCaptureRequestAtRef.current < 350) return;
            lastCaptureRequestAtRef.current = now;
            const requestedUser = custom?.detail?.activeUser;
            void triggerSmartCapture(requestedUser ?? activeUser ?? null);
        };
        window.addEventListener('smart-capture-request', onCaptureRequest as EventListener);
        return () => window.removeEventListener('smart-capture-request', onCaptureRequest as EventListener);
    }, [triggerSmartCapture, activeUser]);

    const initiateSubmission = (result: 'Win' | 'Loss' | 'Draw') => {
        setLastSubmitted(result);
        setPendingMatchData({
            result,
            ship: (activeShip && activeShip !== 'Unknown') ? activeShip : undefined
        });
        setShowWizard(result);
    };

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

    if (isTransparent) {
        return (
            <div className="flex flex-col gap-3 p-1">
                <button
                    onClick={handleNewSmartCapture}
                    disabled={isBusy}
                    data-tour="smart-capture"
                    className="relative z-50 w-full bg-md-sys-primary text-md-sys-onPrimary py-4 font-bold text-body uppercase tracking-wide flex items-center justify-center gap-3 shadow-xl ring-2 ring-md-sys-primary/30 active:scale-[0.98] transition-all disabled:opacity-disabled disabled:cursor-not-allowed group rounded-card"
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

                {(capturedScreenshots.length > 0 || pendingOcrCount > 0) && (
                    <div className="flex gap-2 animate-in slide-in-from-top-1">
                        <button
                            onClick={pendingData ? handleReviewBucket : handleProcessQueue}
                            disabled={isBusy}
                            className="flex-1 bg-md-sys-primary/10 hover:bg-md-sys-primary/20 text-md-sys-primary border border-md-sys-primary/20 text-label-sm uppercase font-bold py-2.5 rounded-control transition-all disabled:opacity-disabled flex items-center justify-center gap-2"
                        >
                            <span className="px-1.5 py-0.5 bg-md-sys-primary text-md-sys-onPrimary text-label-xs font-bold rounded-full">
                                {pendingData ? capturedScreenshots.length : pendingOcrCount}
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

                <div className="grid grid-cols-3 gap-1.5 mt-1">
                    <button onClick={() => initiateSubmission('Win')} className={`btn-win text-label-sm py-2.5 rounded-control font-bold uppercase flex flex-col items-center justify-center gap-1 shadow-sm transition-all ${lastSubmitted === 'Win' ? 'ring-2 ring-white/70 scale-[1.02]' : ''}`}><Trophy size={16} /> Win</button>
                    <button onClick={() => initiateSubmission('Loss')} className={`btn-loss text-label-sm py-2.5 rounded-control font-bold uppercase flex flex-col items-center justify-center gap-1 shadow-sm transition-all ${lastSubmitted === 'Loss' ? 'ring-2 ring-white/70 scale-[1.02]' : ''}`}><Skull size={16} /> Loss</button>
                    <button onClick={() => initiateSubmission('Draw')} className={`btn-draw text-label-sm py-2.5 rounded-control font-bold uppercase flex flex-col items-center justify-center gap-1 shadow-sm transition-all ${lastSubmitted === 'Draw' ? 'ring-2 ring-white/70 scale-[1.02]' : ''}`}><Scale size={16} /> Draw</button>
                </div>

                {processingProgress && (
                    <div className="text-label-sm font-semibold text-md-sys-on-surface/60 px-1">
                        OCR queue: {processingProgress.current}/{processingProgress.total}
                    </div>
                )}

                {/* Telemetry Detection Indicators */}
                {(telemetryDetectedShip || telemetryDetectedHero) && (
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
                    </div>
                )}

                <StatusOverlay />
            </div>
        );
    }

    // Default Layout
    return (
        <div className={`flex flex-col ${isCompact ? 'gap-3' : 'gap-4'}`}>
            {/* Mission Section */}
            <div className={`md3-card flex flex-col overflow-visible mg-surface shadow-lg ${isCompact ? 'p-3 gap-3' : 'p-4 gap-4'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`${isCompact ? 'w-8 h-8 rounded-control' : 'w-10 h-10 rounded-card'} bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center`}>
                            <Trophy size={isCompact ? 14 : 18} />
                        </div>
                        <h3 className="text-body font-bold text-md-sys-on-surface uppercase tracking-tight">Match Recording</h3>
                    </div>
                    {(capturedScreenshots.length > 0 || pendingOcrCount > 0) && (
                        <button
                            onClick={pendingData ? handleReviewBucket : handleProcessQueue}
                            disabled={isBusy}
                            className={`bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer rounded-control font-bold text-label-sm uppercase tracking-widest relative overflow-visible ${isCompact ? 'h-[36px] px-2.5' : 'h-[36px] px-3'}`}
                        >
                            {pendingData ? 'Review' : `Process ${pendingOcrCount}`}
                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-md-sys-primary text-md-sys-onPrimary rounded-full text-label-xs flex items-center justify-center shadow-md animate-in zoom-in-50">
                                {pendingData ? capturedScreenshots.length : pendingOcrCount}
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

                <div className={`grid grid-cols-3 ${isCompact ? 'gap-1.5' : 'gap-2'}`}>
                    <button onClick={() => initiateSubmission('Win')} className={`btn-win flex flex-col ${isCompact ? 'gap-1 py-3 rounded-control' : 'gap-1.5 py-4 rounded-card'} items-center font-bold uppercase text-label-sm transition-all hover:brightness-110 active:scale-[0.98] ${lastSubmitted === 'Win' ? 'ring-2 ring-white/70 scale-[1.02]' : ''}`}><Trophy size={isCompact ? 18 : 20} /> Win</button>
                    <button onClick={() => initiateSubmission('Loss')} className={`btn-loss flex flex-col ${isCompact ? 'gap-1 py-3 rounded-control' : 'gap-1.5 py-4 rounded-card'} items-center font-bold uppercase text-label-sm transition-all hover:brightness-110 active:scale-[0.98] ${lastSubmitted === 'Loss' ? 'ring-2 ring-white/70 scale-[1.02]' : ''}`}><Skull size={isCompact ? 18 : 20} /> Loss</button>
                    <button onClick={() => initiateSubmission('Draw')} className={`btn-draw flex flex-col ${isCompact ? 'gap-1 py-3 rounded-control' : 'gap-1.5 py-4 rounded-card'} items-center font-bold uppercase text-label-sm transition-all hover:brightness-110 active:scale-[0.98] ${lastSubmitted === 'Draw' ? 'ring-2 ring-white/70 scale-[1.02]' : ''}`}><Scale size={isCompact ? 18 : 20} /> Draw</button>
                </div>

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
                {(telemetryDetectedShip || telemetryDetectedHero) && (
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
        </div>
    );
};
