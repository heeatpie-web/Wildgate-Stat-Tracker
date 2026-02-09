import React from 'react';
import { Trophy, Scale, Skull, LayoutTemplate, Clock, Timer, Camera, Loader2, Scan } from 'lucide-react';
import { SessionTimer } from '../SessionTimer';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';
import { captureScreen, smartAnalyzeScreen, LobbyScanResult, ScanOptions } from '../../utils/scanService';
import Logger from '../../utils/logger';

import { findClosestMatch } from '../../utils/stringUtils';
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

    const { setShowWizard, activeUser, setShowReviewQueue, setShowIdMapper } = useUIState();
    const { showSessionTimer } = useUserPreferences();
    const isTransparent = variant === 'transparent';

    const { handleSmartScan, isScanning, scanProgress, scanLogs } = useSmartScan();
    const ocrMode = useAppStore(s => s.ocrMode);

    // Match timer display (independent of SessionTimer toggle)
    const [matchElapsed, setMatchElapsed] = React.useState('00:00');
    React.useEffect(() => {
        if (!isMatchInProgress || !matchStartTime) return;
        const tick = () => {
            const diff = Math.max(0, Math.floor((Date.now() - matchStartTime) / 1000));
            setMatchElapsed(`${Math.floor(diff / 60).toString().padStart(2, '0')}:${(diff % 60).toString().padStart(2, '0')}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [isMatchInProgress, matchStartTime]);

    const ocrModeLabel = ocrMode === 'both' ? 'Local+Cloud' : ocrMode === 'cloud' ? 'Cloud' : 'Local';

    // New Smart Capture with OCR Review
    const [smartCaptureState, smartCaptureActions] = useSmartCapture();
    const { isCapturing, isProcessing, error: captureError, pendingData, queueDepth, capturedScreenshots } = smartCaptureState;
    const { capture: triggerSmartCapture, clearError: clearCaptureError, dismissPendingData, reanalyzeCaptures } = smartCaptureActions;

    // Bucket workflow: captures accumulate silently. User clicks "Review & Apply" to send merged data.
    const handleReviewBucket = () => {
        if (pendingData && onSmartCaptureData) {
            onSmartCaptureData(pendingData);
            dismissPendingData();
        }
    };

    // Combined scanning state
    const isBusy = isScanning || isCapturing || isProcessing;

    // Smart capture handler that uses new OCR system
    const handleNewSmartCapture = async () => {
        if (onSmartCaptureData) {
            // Use new OCR system with review modal
            await triggerSmartCapture();
        } else {
            // Fallback to legacy scan
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

    const TransparentLayout = () => (
        <div className="flex flex-col gap-3 p-1">
            {/* BIG Smart Scan Button at the Top */}
            <button
                onClick={handleNewSmartCapture}
                disabled={isBusy}
                className="relative z-50 w-full bg-blue-600 hover:bg-blue-500 border border-md-sys-outline/20 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-[0.1em] flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group whitespace-nowrap"
            >
                {isBusy ? <Loader2 size={18} className="animate-spin" /> : <Scan size={18} className="group-hover:scale-110 transition-transform" />}
                {isCapturing ? 'Capturing...' : isProcessing ? `OCR (${ocrModeLabel})...` : isScanning ? 'Scanning...' : 'Smart Capture'}
            </button>
            {captureError && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-3 py-2 text-xs text-red-400 flex justify-between items-center">
                    <span>{captureError}</span>
                    <button onClick={clearCaptureError} className="text-red-400/70 hover:text-red-400">&times;</button>
                </div>
            )}
            {capturedScreenshots.length > 0 && (
                <div className="flex gap-1">
                    <button
                        onClick={handleReviewBucket}
                        disabled={isBusy || !pendingData}
                        className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-[10px] uppercase font-bold py-2 rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                        <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[8px] font-bold rounded-full">{capturedScreenshots.length}</span>
                        Review & Apply
                    </button>
                    <button
                        onClick={reanalyzeCaptures}
                        disabled={isBusy}
                        className="bg-md-sys-surface2 hover:bg-md-sys-surface3 text-[10px] uppercase font-bold py-2 px-3 rounded-xl transition-colors"
                        title="Re-merge captured data"
                    >
                        ↻
                    </button>
                </div>
            )}

            {isMatchInProgress ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase text-green-400">Live Mission</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-green-400">{matchElapsed}</span>
                        <button
                            onClick={() => { setIsMatchInProgress(false); setMatchStartTime(null); }}
                            className="text-[8px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 font-bold uppercase"
                            title="Stop timer"
                        >✕</button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => { setIsMatchInProgress(true); setMatchStartTime(Date.now()); }}
                    className="w-full bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-xl px-3 py-2 flex items-center justify-center gap-2 transition-colors"
                >
                    <Timer size={12} className="text-green-400" />
                    <span className="text-[9px] font-black uppercase text-green-400">Start Match Timer</span>
                </button>
            )}

            <div className="grid grid-cols-3 gap-1">
                <button
                    onClick={() => initiateSubmission('Win')}
                    className="btn-win text-[9px] py-2 rounded-lg font-black uppercase flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-black/40 hover:brightness-110 active:scale-95 transition-all"
                >
                    <Trophy size={14} /> <span>Win</span>
                </button>
                <button
                    onClick={() => initiateSubmission('Loss')}
                    className="btn-loss text-[9px] py-2 rounded-lg font-black uppercase flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-black/40 hover:brightness-110 active:scale-95 transition-all"
                >
                    <Skull size={14} /> <span>Loss</span>
                </button>
                <button
                    onClick={() => initiateSubmission('Draw')}
                    className="btn-draw text-[9px] py-2 rounded-lg font-black uppercase flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-black/40 hover:brightness-110 active:scale-95 transition-all"
                >
                    <Scale size={14} /> <span>Draw</span>
                </button>
            </div>

            {showSessionTimer && (
                <div className="bg-black/80 backdrop-blur rounded-xl p-2 border border-md-sys-outline/10 shadow-lg">
                    <SessionTimer
                        startTime={sessionStartTime}
                        matches={matches}
                        lastActivity={lastActivity}
                        onRefreshActivity={() => setLastActivity(Date.now())}
                        matchStartTime={matchStartTime}
                        isMatchInProgress={isMatchInProgress}
                        onStartMatch={() => { }}
                        onResetMatch={() => { setMatchStartTime(null); setIsMatchInProgress(false); }}
                        variant="compact"
                    />
                </div>
            )}

            {(isScanning || isCapturing || isProcessing) && (
                <div className="bg-black/95 backdrop-blur-xl rounded-xl p-3 flex flex-col gap-2 border border-blue-500/30 shadow-2xl animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center text-[10px] uppercase font-black text-blue-400">
                        <span>{isCapturing ? 'Capturing screen...' : isProcessing ? `Processing OCR (${ocrModeLabel})...` : scanProgress.status}</span>
                        <span>{isScanning ? `${Math.round(scanProgress.pct)}%` : ''}</span>
                    </div>
                    <div className="h-1.5 bg-md-sys-on-surface/10 rounded-full overflow-hidden w-full">
                        <div
                            className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)] transition-all duration-300 ease-out"
                            style={{ width: isScanning ? `${scanProgress.pct}%` : (isCapturing ? '30%' : isProcessing ? '70%' : '0%') }}
                        />
                    </div>
                    {isScanning && scanLogs.length > 0 && (
                        <div className="mt-1 h-20 overflow-y-auto bg-black/60 rounded-lg p-2 border border-md-sys-outline/10 font-mono text-[9px] opacity-80 flex flex-col gap-1 custom-scrollbar">
                            {scanLogs.map((log, i) => (
                                <div key={i} className="flex gap-2 opacity-80 transition-opacity hover:opacity-100">
                                    <span className="text-blue-500 shrink-0">&gt;</span>
                                    <span className="truncate">{log}</span>
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    if (isTransparent) return <TransparentLayout />;

    return (
        <div className="bg-md-sys-surface1 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
                <span className="text-sm font-semibold flex items-center gap-2 text-md-sys-on-surface">
                    <Trophy size={14} className="text-md-sys-primary" />
                    Record
                </span>
            </div>

            {isMatchInProgress ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-green-400">Live Mission</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-green-400">{matchElapsed}</span>
                        <button
                            onClick={() => { setIsMatchInProgress(false); setMatchStartTime(null); }}
                            className="text-[8px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 font-bold uppercase"
                            title="Stop timer"
                        >✕</button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => { setIsMatchInProgress(true); setMatchStartTime(Date.now()); }}
                    className="w-full bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg px-3 py-2 flex items-center justify-center gap-2 transition-colors"
                >
                    <Timer size={12} className="text-green-400" />
                    <span className="text-[10px] font-black uppercase text-green-400">Start Match Timer</span>
                </button>
            )}

            {showSessionTimer && (
                <div className="bg-md-sys-surface2 p-2.5 rounded-lg">
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
            )}

            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={() => initiateSubmission('Win')}
                    className="btn-win py-2.5 rounded-lg font-bold text-xs uppercase tracking-wide active:scale-[0.98] flex items-center justify-center gap-1.5 transition-all"
                >
                    <Trophy size={14} />
                    Victory
                </button>
                <button
                    onClick={() => initiateSubmission('Loss')}
                    className="btn-loss py-2.5 rounded-lg font-bold text-xs uppercase tracking-wide active:scale-[0.98] flex items-center justify-center gap-1.5 transition-all"
                >
                    <Skull size={14} />
                    Defeat
                </button>
            </div>

            {(isScanning || isCapturing || isProcessing) && (
                <div className="bg-md-sys-surface2 rounded-lg p-2 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-md-sys-on-surface/70">
                        <span>{isCapturing ? 'Capturing screen...' : isProcessing ? `Processing OCR (${ocrModeLabel})...` : scanProgress.status}</span>
                        <span>{isScanning ? `${Math.round(scanProgress.pct)}%` : ''}</span>
                    </div>
                    <div className="h-1 bg-md-sys-surface3 rounded-full overflow-hidden w-full">
                        <div
                            className="h-full bg-blue-500 transition-all duration-300 ease-out"
                            style={{ width: isScanning ? `${scanProgress.pct}%` : (isCapturing ? '30%' : isProcessing ? '70%' : '0%') }}
                        />
                    </div>
                    {isScanning && scanLogs.length > 0 && (
                        <div className="mt-1 h-24 overflow-y-auto bg-black/40 rounded p-1.5 border border-md-sys-outline/5 font-mono text-[9px] text-md-sys-on-surface/60 flex flex-col gap-0.5 custom-scrollbar">
                            {scanLogs.map((log, i) => (
                                <div key={i} className="truncate">&gt; {log}</div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </div>
            )}

            {captureError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400 flex justify-between items-center">
                    <span>{captureError}</span>
                    <button onClick={clearCaptureError} className="text-red-400/70 hover:text-red-400">&times;</button>
                </div>
            )}

            <div className="flex gap-2 shrink-0">
                <button
                    onClick={() => initiateSubmission('Draw')}
                    className="flex-1 bg-md-sys-surface2 hover:bg-md-sys-surface3 text-md-sys-on-surface/60 py-2 rounded-lg font-semibold text-[10px] uppercase flex items-center justify-center gap-1 transition-all"
                >
                    <Scale size={10} />
                    Draw
                </button>
                <button
                    onClick={handleNewSmartCapture}
                    disabled={isBusy}
                    className="flex-1 bg-blue-500/20 hover:bg-blue-500 hover:text-white text-blue-300 py-2 rounded-lg font-semibold text-[10px] uppercase flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                >
                    {isBusy ? <Loader2 size={10} className="animate-spin" /> : <Scan size={10} />}
                    {isCapturing ? 'Capturing...' : isProcessing ? `OCR (${ocrModeLabel})...` : 'Smart Capture'}
                    {queueDepth > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-[8px] font-bold rounded-full">{queueDepth}</span>
                    )}
                </button>
            </div>
            {capturedScreenshots.length > 0 && (
                <div className="flex gap-1.5">
                    <button
                        onClick={handleReviewBucket}
                        disabled={isBusy || !pendingData}
                        className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-[10px] uppercase font-bold py-2 rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                        <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[8px] font-bold rounded-full">{capturedScreenshots.length}</span>
                        Review & Apply
                    </button>
                    <button
                        onClick={reanalyzeCaptures}
                        disabled={isBusy}
                        className="bg-md-sys-surface2 hover:bg-md-sys-surface3 text-[10px] uppercase font-bold py-2 px-3 rounded-lg transition-colors"
                        title="Re-merge captured data"
                    >
                        ↻
                    </button>
                </div>
            )}

            {(pendingReviews.length > 0 || Object.keys(detectedUnknowns).length > 0) && (
                <button
                    className="w-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 py-2 rounded-lg font-bold text-[10px] uppercase flex items-center justify-center gap-2 animate-pulse"
                    onClick={() => {
                        setShowReviewQueue(true);
                        if (Object.keys(detectedUnknowns).length > 0) {
                            setShowIdMapper(true);
                        }
                    }}
                >
                    <Scan size={12} />
                    Review Uncertain Data ({pendingReviews.length + Object.keys(detectedUnknowns).length})
                </button>
            )}
        </div>
    );
};
