import React, { useState, useEffect } from 'react';
import { Clock, Pause, Play, Swords, RotateCcw } from 'lucide-react';
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
                <span className="font-mono font-black text-6xl tracking-tighter text-white drop-shadow-2xl">
                    {isMatchInProgress ? matchElapsedDisplay : elapsedDisplay}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-60 mt-2">
                    {isMatchInProgress ? "Mission Time" : "Session Time"}
                </span>
            </div>
        );
    }

    // Compact variant - for narrow columns (Overlay HUD)
    if (variant === 'compact') {
        const showMatchTime = isMatchInProgress;

        return (
            <div className="flex items-center justify-between gap-2 bg-black/40 rounded-lg p-1">
                <div className="flex items-center gap-2">
                    <button
                        onClick={togglePause}
                        className={`w-6 h-6 rounded flex items-center justify-center transition-all ${isPaused
                            ? 'bg-amber-500 text-black'
                            : 'bg-white/10 text-white/60 hover:text-white hover:bg-white/20'
                            }`}
                        title={isPaused ? "Resume" : "Pause"}
                    >
                        {isPaused ? <Play size={10} /> : <Pause size={10} />}
                    </button>
                    <div className="flex flex-col min-w-[60px]">
                        {/* Match Time (Primary if active) */}
                        {showMatchTime && (
                            <div className="flex flex-col mb-0.5">
                                <span className="font-mono font-bold text-sm leading-none text-green-400">
                                    {matchElapsedDisplay}
                                </span>
                                <span className="text-[7px] font-black uppercase text-green-500/50">Mission</span>
                            </div>
                        )}

                        {/* Session Time (Always visible, smaller if match active) */}
                        <div className="flex flex-col">
                            <span className={`font-mono font-bold leading-none ${isPaused ? 'text-amber-500' : 'text-white'} ${showMatchTime ? 'text-[10px] opacity-70' : 'text-sm'}`}>
                                {elapsedDisplay}
                            </span>
                            <span className={`text-[7px] font-black uppercase ${isPaused ? 'text-amber-500/70' : 'text-white/30'}`}>
                                {isPaused ? 'Paused' : 'Session'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Win/Loss Record (Only show if not in mission to save space, or keep tiny) */}
                <div className="flex flex-col items-end border-l border-white/10 pl-2">
                    <span className="font-bold text-xs leading-tight">
                        <span className="text-emerald-500">{sessionWins}</span>
                        <span className="text-white/20 px-0.5">/</span>
                        <span className="text-white/60">{sessionMatches.length}</span>
                    </span>
                    <span className="text-[7px] font-semibold text-white/30 uppercase">W/L</span>
                </div>
            </div>
        );
    }

    // Default variant - full horizontal layout
    return (
        <div className="flex items-center gap-4 bg-md-sys-surface2 px-5 py-3 rounded-2xl border border-md-sys-outline/10 shadow-lg animate-fade-in">
            <div className="flex items-center gap-2">
                <button
                    onClick={togglePause}
                    className={`p-2 rounded-full transition-all ${isPaused ? 'bg-amber-500 text-black hover:brightness-110' : 'bg-md-sys-surface3 text-md-sys-on-surface hover:bg-md-sys-primary hover:text-md-sys-onPrimary'}`}
                    title={isPaused ? "Resume Session" : "Pause Session"}
                >
                    {isPaused ? <Play size={20} /> : <Pause size={20} />}
                </button>

                <div className="h-8 w-px bg-md-sys-outline/10 mx-1"></div>

                {!isMatchInProgress ? (
                    <button
                        onClick={onStartMatch}
                        className="p-2 bg-md-sys-surface3 text-md-sys-on-surface rounded-full hover:bg-green-600 hover:text-white transition-all flex items-center gap-2 px-4"
                        title="Start New Mission"
                    >
                        <Swords size={20} />
                        <span className="text-[10px] font-black uppercase tracking-wider">Start Mission</span>
                    </button>
                ) : (
                    <div className="flex items-center gap-3 bg-md-sys-surface1 rounded-full px-4 py-1.5 border border-green-500/30 animate-pulse-slow">
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black uppercase text-green-500">Live Mission</span>
                            <span className="font-mono font-black text-sm text-green-500">{matchElapsedDisplay}</span>
                        </div>
                        <button
                            onClick={onResetMatch}
                            className="p-1 text-md-sys-on-surface/40 hover:text-red-500 transition-colors"
                            title="Reset Mission Timer"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                )}
            </div>

            <div className="h-8 w-px bg-md-sys-outline/10"></div>

            <div className="flex flex-col items-end">
                <div className="text-[10px] font-black uppercase opacity-60 leading-none mb-1 flex items-center gap-1">
                    {isPaused ? <span className="text-amber-500 flex items-center gap-1">Paused</span> : "Session Time"}
                </div>
                <div className={`font-mono font-black text-xl leading-none tracking-tight ${isPaused ? 'opacity-50' : 'text-md-sys-primary'}`}>
                    {elapsedDisplay}
                </div>
            </div>
            <div className="h-8 w-px bg-md-sys-outline/10"></div>
            <div>
                <div className="text-[10px] font-black uppercase opacity-60 leading-none mb-1">Session Record</div>
                <div className="font-black text-xl leading-none flex items-center gap-1">
                    <span className="text-green-500">{sessionWins}</span>
                    <span className="opacity-30 text-sm">/</span>
                    <span>{sessionMatches.length}</span>
                </div>
            </div>
        </div>
    );
};