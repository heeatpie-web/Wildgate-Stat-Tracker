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
        activeShip,
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
    React.useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [scanLogs]);

    React.useEffect(() => {
        const onCaptureRequest = (evt: Event) => {
            const custom = evt as CustomEvent<{ activeUser?: string | null }>;
            const requestedUser = custom?.detail?.activeUser;
            void triggerSmartCapture(requestedUser ?? activeUser ?? null);
        };
        window.addEventListener('smart-capture-request', onCaptureRequest as EventListener);
        return () => window.removeEventListener('smart-capture-request', onCaptureRequest as EventListener);
    }, [triggerSmartCapture, activeUser]);

    const initiateSubmission = (result: 'Win' | 'Loss' | 'Draw') => {
        setPendingMatchData({
            result,
            ship: (activeShip && activeShip !== 'Unknown') ? activeShip : undefined
        });
        setShowWizard(result);
    };

    // Shared Status Block (OCR Progress)
    const StatusOverlay = () => (
        (isScanning || isCapturing || isProcessing) ? (
            <div className="mg-surface-high border border-md-sys-outline/10 rounded-2xl p-4 flex flex-col gap-3 shadow-lg animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer flex items-center justify-center">
                            <ScanEye size={16} className={isScanning ? 'animate-pulse' : ''} />
                        </div>
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-md-sys-primary">
                                {isCapturing ? 'Capturing Window' : isProcessing ? 'Processing OCR' : 'Smart Scan'}
                            </div>
                            <div className="text-[10px] text-md-sys-on-surface/70 font-medium">
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
                    <div className="text-xs font-mono font-bold text-md-sys-primary">
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
                    <div className="mt-1 max-h-24 overflow-y-auto mg-surface rounded-xl p-2 border border-md-sys-outline/5 font-mono text-[9px] text-md-sys-on-surface/60 flex flex-col gap-1 custom-scrollbar">
                        {scanLogs.slice(-10).map((log, i) => (
                            <div key={i} className="flex gap-2 items-start opacity-80">
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
                    className="relative z-50 w-full bg-md-sys-primary text-md-sys-onPrimary py-4 font-black text-sm uppercase tracking-wide flex items-center justify-center gap-3 shadow-xl ring-2 ring-md-sys-primary/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group rounded-2xl"
                >
                    {isBusy ? <Loader2 size={18} className="animate-spin" /> : <Scan size={18} className="group-hover:scale-110 transition-transform" />}
                    <span>Smart Capture</span>
                </button>

                {captureError && (
                    <div className="bg-md-sys-errorContainer/20 border border-md-sys-error/20 rounded-xl px-3 py-2 text-xs text-md-sys-error flex justify-between items-center mg-blur">
                        <span>{captureError}</span>
                        <button onClick={clearCaptureError} className="hover:text-md-sys-error/80">&times;</button>
                    </div>
                )}
                {qualityHint && (
                    <div className={`rounded-xl px-3 py-2 text-[10px] font-semibold border ${
                        qualityHint.level === 'good'
                            ? 'bg-success-soft text-success border-success-soft-strong'
                            : qualityHint.level === 'fair'
                                ? 'bg-warning-soft text-warning border-warning-soft-strong'
                                : 'bg-danger-soft text-danger border-danger-soft-strong'
                    }`}>
                        <div className="uppercase tracking-wide text-[9px] opacity-70 mb-0.5">Capture Quality</div>
                        {qualityHint.message}
                    </div>
                )}

                {(capturedScreenshots.length > 0 || pendingOcrCount > 0) && (
                    <div className="flex gap-2 animate-in slide-in-from-top-1">
                        <button
                            onClick={pendingData ? handleReviewBucket : handleProcessQueue}
                            disabled={isBusy}
                            className="flex-1 bg-md-sys-primary/10 hover:bg-md-sys-primary/20 text-md-sys-primary border border-md-sys-primary/20 text-[10px] uppercase font-bold py-2.5 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            <span className="px-1.5 py-0.5 bg-md-sys-primary text-md-sys-onPrimary text-[8px] font-bold rounded-full">
                                {pendingData ? capturedScreenshots.length : pendingOcrCount}
                            </span>
                            {pendingData ? 'Review & Apply' : 'Process Queue'}
                        </button>
                        <button onClick={reanalyzeCaptures} disabled={isBusy} className="md3-icon-btn mg-surface" title="Re-merge"><RefreshCw size={14} /></button>
                    </div>
                )}

                {isMatchInProgress ? (
                    <div className="bg-success-soft border border-success-soft-strong rounded-xl px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            <span className="text-[9px] font-black uppercase text-success">Live Mission</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-success">{matchElapsed}</span>
                            <button
                                onClick={() => { setIsMatchInProgress(false); setMatchStartTime(null); }}
                                className="text-[8px] px-1.5 py-0.5 bg-md-sys-errorContainer/40 text-md-sys-error rounded hover:bg-md-sys-error/20 font-bold uppercase"
                                title="Stop timer"
                            >x</button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => { setIsMatchInProgress(true); setMatchStartTime(Date.now()); }}
                        className="w-full bg-success-soft border border-success-soft-strong rounded-xl px-3 py-2 flex items-center justify-center gap-2 transition-all hover:brightness-105"
                    >
                        <Timer size={12} className="text-success" />
                        <span className="text-[9px] font-black uppercase text-success">Start Match Timer</span>
                    </button>
                )}

                <div className="mg-surface rounded-xl p-2 border border-md-sys-outline/10">
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
                    <button onClick={() => initiateSubmission('Win')} className="btn-win text-[10px] py-2.5 rounded-xl font-black uppercase flex flex-col items-center justify-center gap-1 shadow-sm transition-all"><Trophy size={16} /> Win</button>
                    <button onClick={() => initiateSubmission('Loss')} className="btn-loss text-[10px] py-2.5 rounded-xl font-black uppercase flex flex-col items-center justify-center gap-1 shadow-sm transition-all"><Skull size={16} /> Loss</button>
                    <button onClick={() => initiateSubmission('Draw')} className="btn-draw text-[10px] py-2.5 rounded-xl font-black uppercase flex flex-col items-center justify-center gap-1 shadow-sm transition-all"><Scale size={16} /> Draw</button>
                </div>

                {processingProgress && (
                    <div className="text-[10px] font-semibold text-md-sys-on-surface/65 px-1">
                        OCR queue: {processingProgress.current}/{processingProgress.total}
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
            <div className={`md3-card flex flex-col overflow-visible ${isCompact ? 'p-3 gap-3' : 'p-4 gap-4'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center">
                            <Trophy size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-md-sys-on-surface uppercase tracking-tight">Match Recording</h3>
                            {!isCompact && <p className="text-[10px] opacity-60 font-medium">Track your performance live</p>}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 items-center">
                    <button
                        onClick={handleNewSmartCapture}
                        disabled={isBusy}
                        data-tour="smart-capture"
                        className={`${isCompact ? 'w-[40px] h-[40px]' : 'w-[44px] h-[44px]'} rounded-xl bg-md-sys-primary text-md-sys-onPrimary flex items-center justify-center shadow-lg ring-2 ring-md-sys-primary/30 disabled:opacity-50 active:scale-95 transition-all`}
                        title="Smart Capture"
                    >
                        {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Scan size={16} />}
                    </button>

                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wider text-md-sys-on-surface/70">
                            Smart Capture
                        </div>
                        <div className="text-[10px] text-md-sys-on-surface/55 truncate">
                            {isCapturing
                                ? 'Capturing window...'
                                : isProcessing
                                    ? `Processing (${ocrModeLabel})...`
                                    : pendingOcrCount > 0
                                        ? `${pendingOcrCount} capture${pendingOcrCount === 1 ? '' : 's'} queued for OCR`
                                        : 'Use the top bar button for fastest access'}
                        </div>
                    </div>

                    {(capturedScreenshots.length > 0 || pendingOcrCount > 0) && (
                        <button
                            onClick={pendingData ? handleReviewBucket : handleProcessQueue}
                            disabled={isBusy}
                            className={`bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer rounded-xl font-bold text-[10px] uppercase tracking-widest relative overflow-visible ${isCompact ? 'h-[40px] px-3' : 'h-[44px] px-4'}`}
                        >
                            {pendingData ? 'Review' : 'Process'}
                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-md-sys-primary text-md-sys-onPrimary rounded-full text-[9px] flex items-center justify-center shadow-md animate-in zoom-in-50">
                                {pendingData ? capturedScreenshots.length : pendingOcrCount}
                            </span>
                        </button>
                    )}
                </div>

                <div className={`mg-surface rounded-xl border border-md-sys-outline/10 ${isCompact ? 'p-1.5' : 'p-2'}`}>
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

                <div className={`grid grid-cols-3 ${isCompact ? 'gap-1.5' : 'gap-2'}`}>
                    <button onClick={() => initiateSubmission('Win')} className={`btn-win flex flex-col ${isCompact ? 'gap-1 py-3 rounded-xl' : 'gap-1.5 py-4 rounded-2xl'} items-center font-black uppercase text-[10px] transition-all hover:translate-y-[-2px] hover:shadow-lg active:scale-95`}><Trophy size={isCompact ? 18 : 20} /> Win</button>
                    <button onClick={() => initiateSubmission('Loss')} className={`btn-loss flex flex-col ${isCompact ? 'gap-1 py-3 rounded-xl' : 'gap-1.5 py-4 rounded-2xl'} items-center font-black uppercase text-[10px] transition-all hover:translate-y-[-2px] hover:shadow-lg active:scale-95`}><Skull size={isCompact ? 18 : 20} /> Loss</button>
                    <button onClick={() => initiateSubmission('Draw')} className={`btn-draw flex flex-col ${isCompact ? 'gap-1 py-3 rounded-xl' : 'gap-1.5 py-4 rounded-2xl'} items-center font-black uppercase text-[10px] transition-all hover:translate-y-[-2px] hover:shadow-lg active:scale-95`}><Scale size={isCompact ? 18 : 20} /> Draw</button>
                </div>

                {isMatchInProgress ? (
                    <div className="bg-success-soft border border-success-soft-strong rounded-xl px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            <span className="text-[10px] font-black uppercase text-success">Live Mission</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-success">{matchElapsed}</span>
                            <button
                                onClick={() => { setIsMatchInProgress(false); setMatchStartTime(null); }}
                                className="text-[8px] px-1.5 py-0.5 bg-md-sys-errorContainer/40 text-md-sys-error rounded hover:bg-md-sys-error/20 font-bold uppercase"
                                title="Stop timer"
                            >x</button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => { setIsMatchInProgress(true); setMatchStartTime(Date.now()); }}
                        className="w-full bg-success-soft border border-success-soft-strong rounded-xl px-3 py-2 flex items-center justify-center gap-2 transition-all hover:brightness-105"
                    >
                        <Timer size={12} className="text-success" />
                        <span className="text-[10px] font-black uppercase text-success">Start Match Timer</span>
                    </button>
                )}

                {captureError && (
                    <div className="bg-md-sys-errorContainer/10 border border-md-sys-error/20 rounded-xl px-4 py-2.5 text-[10px] text-md-sys-error font-medium flex justify-between items-center mg-blur">
                        <span className="flex items-center gap-2 font-bold"><X size={14} /> {captureError}</span>
                        <button onClick={clearCaptureError} className="opacity-60 hover:opacity-100">&times;</button>
                    </div>
                )}
                {qualityHint && (
                    <div className={`rounded-xl px-4 py-2.5 text-[10px] font-semibold border ${
                        qualityHint.level === 'good'
                            ? 'bg-success-soft text-success border-success-soft-strong'
                            : qualityHint.level === 'fair'
                                ? 'bg-warning-soft text-warning border-warning-soft-strong'
                                : 'bg-danger-soft text-danger border-danger-soft-strong'
                    }`}>
                        <div className="uppercase tracking-wide text-[9px] opacity-70 mb-0.5">Capture Quality</div>
                        {qualityHint.message}
                    </div>
                )}

                {processingProgress && (
                    <div className="text-[10px] font-semibold text-md-sys-on-surface/65 px-1">
                        OCR queue: {processingProgress.current}/{processingProgress.total}
                    </div>
                )}

                <StatusOverlay />
            </div>

            {/* Support Systems */}
            <div className="flex flex-col gap-2">
                {(pendingReviews.length > 0 || Object.keys(detectedUnknowns).length > 0) && (
                    <button
                        className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all"
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
