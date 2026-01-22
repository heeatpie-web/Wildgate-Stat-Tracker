import React, { useState, useEffect } from 'react';
import { Clock, Trophy, PauseCircle } from 'lucide-react';
import { Match } from '../types';

interface SessionTimerProps {
  startTime: number;
  matches: Match[];
  lastActivity: number;
}

export const SessionTimer: React.FC<SessionTimerProps> = ({ startTime, matches, lastActivity }) => {
  const [elapsed, setElapsed] = useState("00:00:00");
  const [isPaused, setIsPaused] = useState(false);

  // Calculate session stats
  const sessionMatches = matches.filter(m => m.timestamp >= startTime);
  const sessionWins = sessionMatches.filter(m => m.result === 'Win').length;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActive = now - lastActivity;
      
      // Auto-pause if > 1 hour (3600000 ms) since last activity
      if (timeSinceLastActive > 3600000) {
          setIsPaused(true);
          return; 
      }
      
      setIsPaused(false);
      
      // Calculate total elapsed time
      // Note: This simplistic approach includes the paused time if you resume later.
      // For a true "stopwatch" that excludes AFK, we'd need complex state.
      // For a "Session" timer (wall clock duration), this is correct.
      const diff = Math.floor((now - startTime) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, lastActivity]);

  return (
    <div className="flex items-center gap-4 bg-md-sys-surface2 px-5 py-3 rounded-2xl border border-md-sys-outline/10 shadow-lg animate-fade-in">
        <div className="flex flex-col items-end">
            <div className="text-[10px] font-black uppercase opacity-60 leading-none mb-1 flex items-center gap-1">
                {isPaused ? <span className="text-amber-500 flex items-center gap-1"><PauseCircle size={10}/> Paused</span> : "Session Time"}
            </div>
            <div className={`font-mono font-black text-xl leading-none tracking-tight ${isPaused ? 'opacity-50' : 'text-md-sys-primary'}`}>
                {elapsed}
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
