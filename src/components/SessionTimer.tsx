import React, { useState, useEffect } from 'react';
import { Pause, Play, Swords, RotateCcw } from 'lucide-react';
import { Match } from '../types';

interface SessionTimerProps {
    startTime: number;
    matches: Match[];
    lastActivity: number;
    onRefreshActivity: () => void;
    matchStartTime: number | null;
    isMatchInProgress: boolean;
    onStartMatch: () => void;
    onResetMatch: () => void;
    variant?: 'default' | 'hero' | 'compact';
}

export const SessionTimer: React.FC<SessionTimerProps> = ({
    startTime, matches, lastActivity, onRefreshActivity,
    matchStartTime, isMatchInProgress, onStartMatch, onResetMatch,
    variant = 'default'
}) => {
    const [elapsedDisplay, setElapsedDisplay] = useState("00:00:00");
    const [matchElapsedDisplay, setMatchElapsedDisplay] = useState("00:00");

    const [isManualPaused, setIsManualPaused] = useState(false);
    const [offsetTime, setOffsetTime] = useState(0);
    const [currentPauseStart, setCurrentPauseStart] = useState<number | null>(null);
    const [isAutoPaused, setIsAutoPaused] = useState(false);

    const sessionMatches = matches.filter(m => m.timestamp >= startTime);
    const sessionWins = sessionMatches.filter(m => m.result === 'Win').length;

    const togglePause = () => {
        if (isManualPaused) {
            if (currentPauseStart) {
                setOffsetTime(prev => prev + (Date.now() - currentPauseStart));
            }
            setCurrentPauseStart(null);
            setIsManualPaused(false);
            onRefreshActivity();
        } else {
            setCurrentPauseStart(Date.now());
            setIsManualPaused(true);
        }
    };

    // Use refs to access latest values inside interval without triggering re-runs
    const lastActivityRef = React.useRef(lastActivity);
    const startRef = React.useRef(startTime);
    const offsetRef = React.useRef(offsetTime);
    const pauseStartRef = React.useRef(currentPauseStart);
    const autoPausedRef = React.useRef(isAutoPaused);
    const manualPausedRef = React.useRef(isManualPaused);
    const matchStartRef = React.useRef(matchStartTime);
    const matchInProgressRef = React.useRef(isMatchInProgress);

    // Update refs when props/state change
    useEffect(() => {
        lastActivityRef.current = lastActivity;
        startRef.current = startTime;
        offsetRef.current = offsetTime;
        pauseStartRef.current = currentPauseStart;
        autoPausedRef.current = isAutoPaused;
        manualPausedRef.current = isManualPaused;
        matchStartRef.current = matchStartTime;
        matchInProgressRef.current = isMatchInProgress;
    }, [lastActivity, startTime, offsetTime, currentPauseStart, isAutoPaused, isManualPaused, matchStartTime, isMatchInProgress]);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const rLastActivity = lastActivityRef.current;
            const rStart = startRef.current;
            const rOffset = offsetRef.current;
            const rPauseStart = pauseStartRef.current;
            const rAutoPaused = autoPausedRef.current;
            const rManualPaused = manualPausedRef.current;
            const rMatchStart = matchStartRef.current;
            const rMatchInProgress = matchInProgressRef.current;

            // Auto-pause logic
            if (!rManualPaused) {
                const timeSinceLastActive = now - rLastActivity;
                if (timeSinceLastActive > 3600000) { // 1 hour inactive
                    if (!rAutoPaused) {
                        setIsAutoPaused(true);
                        setCurrentPauseStart(prev => prev || now);
                    }
                } else {
                    if (rAutoPaused) {
                        setIsAutoPaused(false);
                        if (rPauseStart) {
                            setOffsetTime(prev => prev + (now - rPauseStart));
                            setCurrentPauseStart(null);
                        }
                    }
                }
            }

            if (rManualPaused || rAutoPaused) return;

            // Session Time Calculation
            const totalDuration = now - rStart - rOffset;
            const diff = Math.floor(Math.max(0, totalDuration) / 1000);
            const h = Math.floor(diff / 3600).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            setElapsedDisplay(`${h}:${m}:${s}`);

            // Match Time Calculation
            if (rMatchInProgress && rMatchStart) {
                const mDiff = Math.floor((now - rMatchStart) / 1000);
                const mm = Math.floor(mDiff / 60).toString().padStart(2, '0');
                const ms = (mDiff % 60).toString().padStart(2, '0');
                setMatchElapsedDisplay(`${mm}:${ms}`);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []); // Empty dependency array = stable interval!

    const isPaused = isManualPaused || isAutoPaused;

    // Hero variant - large centered display
    if (variant === 'hero') {
        return (
            <div className="flex flex-col items-center justify-center animate-pulse-slow">
                <span className="font-mono font-black text-6xl tracking-tighter text-md-sys-on-surface drop-shadow-2xl">
                    {isMatchInProgress ? matchElapsedDisplay : elapsedDisplay}
                </span>
                <span className="text-label-sm font-bold uppercase tracking-wide-30 opacity-60 mt-2">
                    {isMatchInProgress ? "Mission Time" : "Session Time"}
                </span>
            </div>
        );
    }

    // Compact variant - for narrow columns (Overlay HUD)
    if (variant === 'compact') {
        return (
            <div className="flex items-center justify-between gap-2.5 md3-surface-high rounded-lg p-2.5 border border-md-sys-outline/10">
                <div className="flex items-center gap-2">
                    <button
                        onClick={togglePause}
                        className={`md3-icon-btn md3-icon-btn--small transition-all ${isPaused
                            ? 'bg-warning text-ink-strong hover:brightness-110'
                            : 'md3-icon-btn--tonal'
                            }`}
                        title={isPaused ? "Resume" : "Pause"}
                        aria-label={isPaused ? "Resume" : "Pause"}
                    >
                        {isPaused ? <Play size={14} /> : <Pause size={14} />}
                    </button>
                    <div className="flex flex-col min-w-104px">
                        <span className={`font-mono tabular-nums font-bold text-xl leading-tight tracking-wide ${isMatchInProgress ? 'text-success' : (isPaused ? 'text-warning' : 'text-md-sys-on-surface')}`}>
                            {isMatchInProgress ? matchElapsedDisplay : elapsedDisplay}
                        </span>
                        <span className={`text-label-xs font-bold uppercase ${isMatchInProgress ? 'text-success/60' : (isPaused ? 'text-warning/60' : 'text-md-sys-on-surface/40')}`}>
                            {isMatchInProgress ? 'Mission' : (isPaused ? 'Session Paused' : 'Session')}
                        </span>
                        {isMatchInProgress && (
                            <span className="text-label-xs font-semibold text-md-sys-on-surface/60 tabular-nums">
                                S: {elapsedDisplay}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1.5 border-l border-md-sys-outline/10 pl-2">
                    {!isMatchInProgress ? (
                        <button
                            onClick={onStartMatch}
                            className="w-6 h-6 rounded flex items-center justify-center bg-md-sys-primary text-md-sys-onPrimary hover:brightness-110 transition-all"
                            title="Start Mission"
                            aria-label="Start mission timer"
                        >
                            <Swords size={10} />
                        </button>
                    ) : (
                        <button
                            onClick={onResetMatch}
                            className="w-6 h-6 rounded flex items-center justify-center bg-md-sys-errorContainer/40 text-md-sys-error hover:bg-md-sys-error/20 transition-all"
                            title="Reset Mission Timer"
                            aria-label="Reset mission timer"
                        >
                            <RotateCcw size={10} />
                        </button>
                    )}

                    <div className="flex flex-col items-end">
                        <span className="font-bold text-label-sm leading-tight">
                            <span className="text-success">{sessionWins}</span>
                            <span className="text-md-sys-on-surface/40 px-0.5">/</span>
                            <span className="text-md-sys-on-surface/60">{sessionMatches.length}</span>
                        </span>
                        <span className="text-label-xs font-semibold text-md-sys-on-surface/40 uppercase">W/L</span>
                    </div>
                </div>
            </div>
        );
    }

    // Default variant - flattened single container
    return (
        <div className="flex items-center gap-3 rounded-control border border-md-sys-outline/12 bg-md-sys-surface-container-high px-3 py-2.5">
            <div className="flex items-center gap-1.5 shrink-0">
                <button
                    onClick={togglePause}
                    className={`p-2 rounded-full transition-all ${isPaused ? 'bg-warning text-ink-strong hover:brightness-110' : 'md3-btn-tonal text-md-sys-on-surface hover:bg-md-sys-primary hover:text-md-sys-onPrimary'}`}
                    title={isPaused ? "Resume Session" : "Pause Session"}
                    aria-label={isPaused ? "Resume session timer" : "Pause session timer"}
                >
                    {isPaused ? <Play size={16} /> : <Pause size={16} />}
                </button>

                {!isMatchInProgress ? (
                    <button
                        onClick={onStartMatch}
                        className="md3-btn-tonal rounded-full hover:bg-success hover:text-md-sys-on-surface transition-all flex items-center gap-1.5 px-3 h-8"
                        title="Start New Mission"
                    >
                        <Swords size={14} />
                        <span className="text-label-xs font-bold uppercase tracking-wide">Start Mission</span>
                    </button>
                ) : (
                    <button
                        onClick={onResetMatch}
                        className="inline-flex items-center gap-1.5 rounded-full bg-md-sys-errorContainer/35 text-md-sys-error px-3 h-8 hover:bg-md-sys-error/20 transition-colors"
                        title="Reset Mission Timer"
                        aria-label="Reset mission timer"
                    >
                        <RotateCcw size={14} />
                        <span className="text-label-xs font-bold uppercase tracking-wide">Reset Mission</span>
                    </button>
                )}
            </div>

            <div className="min-w-0 flex-1">
                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/60 mb-0.5">
                    {isMatchInProgress ? 'Mission Time' : (isPaused ? 'Session Paused' : 'Session Time')}
                </div>
                <div className={`font-mono tabular-nums font-bold text-2xl leading-none tracking-wide ${isPaused ? 'opacity-60' : 'text-md-sys-primary'}`}>
                    {isMatchInProgress ? matchElapsedDisplay : elapsedDisplay}
                </div>
                {isMatchInProgress && (
                    <div className="text-label-xs font-semibold text-md-sys-on-surface/55 mt-1">
                        Session {elapsedDisplay}
                    </div>
                )}
            </div>

            <div className="text-right shrink-0">
                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/60 mb-0.5">W/L</div>
                <div className="font-bold text-lg leading-none flex items-center gap-1">
                    <span className="text-success">{sessionWins}</span>
                    <span className="text-md-sys-on-surface/40">/</span>
                    <span className="text-md-sys-on-surface/70">{sessionMatches.length}</span>
                </div>
            </div>
        </div>
    );
};
