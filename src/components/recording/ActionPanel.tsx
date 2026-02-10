import React from 'react';
import {
    Trophy,
    Scale,
    Skull,
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
    onSmartCaptureData?: (data: any) => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({ variant = 'default', onSmartCaptureData }) => {
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

    const { handleSmartScan, isScanning, scanProgress, scanLogs } = useSmartScan();
    const ocrMode = useAppStore(s => s.ocrMode);
    const ocrModeLabel = ocrMode === 'both' ? 'Hybrid' : ocrMode === 'cloud' ? 'Cloud' : 'Local';

    const [smartCaptureState, smartCaptureActions] = useSmartCapture();
    const {
        isCapturing,
        isProcessing,
        error: captureError,
        pendingData,
        queueDepth,
        capturedScreenshots
    } = smartCaptureState;
    const {
        capture: triggerSmartCapture,
        clearError: clearCaptureError,
        dismissPendingData,
        reanalyzeCaptures
    } = smartCaptureActions;

    const handleReviewBucket = () => {
        if (pendingData && onSmartCaptureData) {
            onSmartCaptureData(pendingData);
            dismissPendingData();
        }
    };

    const isBusy = isScanning || isCapturing || isProcessing;

    const handleNewSmartCapture = async () => {
        if (onSmartCaptureData) {
            await triggerSmartCapture();
        } else {
            handleSmartScan();
        }
    };

    const logsEndRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [scanLogs]);

    const initiateSubmission = (result: 'Win' | 'Loss' | 'Draw') => {
        setPendingMatchData({
            result,
            ship: (activeShip && activeShip !== 'Unknown') ? activeShip : undefined
        });
        setShowWizard(result);
    };

    const hasCaptures = capturedScreenshots.length > 0;
    const canReview = !!pendingData && !!onSmartCaptureData;

    const smartState: 'idle' | 'capturing' | 'processing' | 'review' = isCapturing
        ? 'capturing'
        : isProcessing
            ? 'processing'
            : canReview
                ? 'review'
                : 'idle';

    const SmartSteps: React.FC = () => {
        const Step: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
            <span className={[
                'px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border',
                active
                    ? 'bg-md-sys-primary/15 text-md-sys-primary border-md-sys-primary/25'
                    : 'bg-md-sys-surface2 text-md-sys-on-surface/40 border-md-sys-outline/10',
            ].join(' ')}>
                {label}
            </span>
        );

        return (
            <div className="flex items-center gap-1.5">
                <Step label="1 Capture" active={smartState === 'idle' || smartState === 'capturing' || smartState === 'processing'} />
                <Step label="2 Review" active={smartState === 'review'} />
                <Step label="3 Apply" active={smartState === 'review'} />
            </div>
        );
    };

    const SmartStatusRow: React.FC = () => {
        if (!(isScanning || isCapturing || isProcessing) && !hasCaptures) return null;

        const statusText = isCapturing
            ? 'Capturing window...'
            : isProcessing
                ? `Processing OCR (${ocrModeLabel})...`
                : isScanning
                    ? scanProgress.status
                    : '';

        return (
            <div className="mt-2 flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-md-sys-surface2 border border-md-sys-outline/10">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer flex items-center justify-center shrink-0">
                        <ScanEye size={14} className={(isScanning || isCapturing || isProcessing) ? 'animate-pulse' : ''} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wider text-md-sys-primary truncate">
                            {statusText || (hasCaptures ? `${capturedScreenshots.length} capture${capturedScreenshots.length === 1 ? '' : 's'} ready` : '')}
                        </div>
                        {(queueDepth || 0) > 0 && (
                            <div className="text-[9px] font-mono text-md-sys-on-surface/50 truncate">
                                Queue: {queueDepth}
                            </div>
                        )}
                    </div>
                </div>

                {(isScanning || isCapturing || isProcessing) && (
                    <div className="text-[10px] font-mono font-bold text-md-sys-primary shrink-0">
                        {isScanning ? `${Math.round(scanProgress.pct)}%` : ''}
                    </div>
                )}
            </div>
        );
    };

    if (isTransparent) {
        return (
            <div data-tour="action-panel" className="flex flex-col gap-3 p-1">
                <button
                    onClick={handleNewSmartCapture}
                    disabled={isBusy}
                    data-tour="smart-capture"
                    className="relative z-50 w-full bg-md-sys-primary text-md-sys-onPrimary py-4 font-black text-sm uppercase tracking-wide flex items-center justify-center gap-3 shadow-xl ring-2 ring-md-sys-primary/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group rounded-2xl"
                >
                    {isBusy ? <Loader2 size={18} className="animate-spin" /> : <Scan size={18} className="group-hover:scale-110 transition-transform" />}
                    <span>Smart Capture</span>
                </button>

                <div className="px-1">
                    <SmartSteps />
                    <div className="mt-1 text-[10px] font-semibold text-md-sys-on-surface/55">
                        Capture the game window, then Review to apply the extracted data.
                    </div>
                    <SmartStatusRow />
                </div>

                {captureError && (
                    <div className="bg-md-sys-errorContainer/20 border border-md-sys-error/20 rounded-xl px-3 py-2 text-xs text-md-sys-error flex justify-between items-center mg-blur">
                        <span>{captureError}</span>
                        <button onClick={clearCaptureError} className="hover:text-md-sys-error/80">&times;</button>
                    </div>
                )}
                {hasCaptures && (
                    <div className="flex gap-2 animate-in slide-in-from-top-1">
                        <button
                            onClick={handleReviewBucket}
                            disabled={isBusy || !canReview}
                            className="flex-1 bg-md-sys-secondaryContainer hover:brightness-110 text-md-sys-onSecondaryContainer border border-md-sys-outline/10 text-[10px] uppercase font-black py-2.5 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            <span className="px-1.5 py-0.5 bg-md-sys-primary text-md-sys-onPrimary text-[8px] font-bold rounded-full">{capturedScreenshots.length}</span>
                            Review & Apply
                        </button>
                        <button onClick={reanalyzeCaptures} disabled={isBusy || capturedScreenshots.length < 2} className="md3-icon-btn mg-surface" title="Re-merge"><RefreshCw size={14} /></button>
                    </div>
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
            </div>
        );
    }

    // Default Layout
    return (
        <div data-tour="action-panel" className="flex flex-col gap-4">
            {/* Mission Section */}
            <div className="mg-surface-high rounded-2xl p-4 border border-md-sys-outline/10 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center">
                            <Trophy size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-md-sys-on-surface uppercase tracking-tight">Match Recording</h3>
                            <p className="text-[10px] opacity-60 font-medium">Track your performance live</p>
                        </div>
                    </div>
                </div>

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

                <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => initiateSubmission('Win')} className="btn-win flex flex-col gap-1.5 items-center py-4 rounded-2xl font-black uppercase text-[10px] transition-all hover:translate-y-[-2px] hover:shadow-lg active:scale-95"><Trophy size={20} /> Win</button>
                    <button onClick={() => initiateSubmission('Loss')} className="btn-loss flex flex-col gap-1.5 items-center py-4 rounded-2xl font-black uppercase text-[10px] transition-all hover:translate-y-[-2px] hover:shadow-lg active:scale-95"><Skull size={20} /> Loss</button>
                    <button onClick={() => initiateSubmission('Draw')} className="btn-draw flex flex-col gap-1.5 items-center py-4 rounded-2xl font-black uppercase text-[10px] transition-all hover:translate-y-[-2px] hover:shadow-lg active:scale-95"><Scale size={20} /> Draw</button>
                </div>
            </div>

            {/* Smart Intelligence Section */}
            <div className="mg-surface-high rounded-2xl p-4 border border-md-sys-outline/10 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer flex items-center justify-center">
                            <ScanEye size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-md-sys-on-surface uppercase tracking-tight">Tactical Vision</h3>
                            <p className="text-[10px] opacity-60 font-medium">Capture / Review / Apply</p>
                        </div>
                    </div>
                </div>

                <SmartSteps />

                <div className="flex gap-2">
                    <button
                        onClick={handleNewSmartCapture}
                        disabled={isBusy}
                        data-tour="smart-capture"
                        className="flex-1 bg-md-sys-primary text-md-sys-onPrimary py-3.5 flex items-center justify-center gap-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-wider disabled:opacity-50 active:scale-95 shadow-lg ring-2 ring-md-sys-primary/30"
                    >
                        {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Scan size={16} />}
                        {isCapturing ? 'Capturing...' : isProcessing ? `Processing (${ocrModeLabel})...` : 'Smart Capture'}
                    </button>

                    {hasCaptures && (
                        <button
                            onClick={handleReviewBucket}
                            disabled={isBusy || !canReview}
                            className="bg-md-sys-secondaryContainer hover:brightness-110 text-md-sys-onSecondaryContainer px-4 rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-40 flex items-center gap-2"
                            title={!canReview ? 'Capture is still processing' : 'Review and apply extracted data'}
                        >
                            <span className="w-5 h-5 bg-md-sys-primary text-md-sys-onPrimary rounded-full text-[9px] flex items-center justify-center shadow-sm">
                                {capturedScreenshots.length}
                            </span>
                            Review
                        </button>
                    )}
                </div>

                {captureError && (
                    <div className="bg-md-sys-errorContainer/10 border border-md-sys-error/20 rounded-xl px-4 py-2.5 text-[10px] text-md-sys-error font-medium flex justify-between items-center mg-blur">
                        <span className="flex items-center gap-2 font-bold"><X size={14} /> {captureError}</span>
                        <button onClick={clearCaptureError} className="opacity-60 hover:opacity-100">&times;</button>
                    </div>
                )}

                <SmartStatusRow />

                {hasCaptures && (
                    <div className="flex gap-2">
                        <button
                            onClick={handleReviewBucket}
                            disabled={isBusy || !canReview}
                            className="flex-1 bg-md-sys-secondaryContainer hover:brightness-110 text-md-sys-onSecondaryContainer border border-md-sys-outline/10 text-[10px] uppercase font-black py-2.5 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            Review & Apply
                        </button>
                        <button onClick={reanalyzeCaptures} disabled={isBusy || capturedScreenshots.length < 2} className="md3-icon-btn mg-surface" title="Re-merge"><RefreshCw size={14} /></button>
                    </div>
                )}
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
