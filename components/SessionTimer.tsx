import React, { useState, useEffect, useRef } from 'react';
import { Clock, Trophy, PauseCircle, PlayCircle, Pause } from 'lucide-react';
import { Match } from '../types';

interface SessionTimerProps {
  startTime: number;
  matches: Match[];
  lastActivity: number;
  onRefreshActivity: () => void;
}

export const SessionTimer: React.FC<SessionTimerProps> = ({ startTime, matches, lastActivity, onRefreshActivity }) => {
  const [elapsedDisplay, setElapsedDisplay] = useState("00:00:00");
  
  // State for manual pausing logic
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [offsetTime, setOffsetTime] = useState(0); // Total duration spent paused
  const [currentPauseStart, setCurrentPauseStart] = useState<number | null>(null);

  // Derived auto-pause state (visual only, doesn't stop the internal offset logic until realized)
  const [isAutoPaused, setIsAutoPaused] = useState(false);

  // Calculate session stats (matches are filtered by absolute start time, pause doesn't affect which matches count)
  const sessionMatches = matches.filter(m => m.timestamp >= startTime);
  const sessionWins = sessionMatches.filter(m => m.result === 'Win').length;

  // Handle Manual Toggle
  const togglePause = () => {
      if (isManualPaused) {
          // RESUME
          if (currentPauseStart) {
              setOffsetTime(prev => prev + (Date.now() - currentPauseStart));
          }
          setCurrentPauseStart(null);
          setIsManualPaused(false);
          onRefreshActivity(); // Reset auto-pause timer
      } else {
          // PAUSE
          setCurrentPauseStart(Date.now());
          setIsManualPaused(true);
      }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      // Auto-pause logic (only if not manually paused)
      if (!isManualPaused) {
          const timeSinceLastActive = now - lastActivity;
          if (timeSinceLastActive > 3600000) { // 1 hour
              if (!isAutoPaused) {
                  setIsAutoPaused(true);
                  // Enter pause state automatically
                  setCurrentPauseStart(prev => prev || now); // Start tracking pause duration if not already
              }
          } else {
              if (isAutoPaused) {
                  // If we were auto-paused but activity updated (e.g. external match add), resume
                  setIsAutoPaused(false);
                  if (currentPauseStart) {
                      setOffsetTime(prev => prev + (now - currentPauseStart));
                      setCurrentPauseStart(null);
                  }
              }
          }
      }

      // If effectively paused, don't update display (it stays frozen at pause time)
      if (isManualPaused || isAutoPaused) {
          return;
      }

      // Calculate effective duration
      // Duration = (Now - Start) - (Total Previous Pauses)
      const totalDuration = now - startTime - offsetTime;
      
      const diff = Math.floor(Math.max(0, totalDuration) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsedDisplay(`${h}:${m}:${s}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, lastActivity, isManualPaused, isAutoPaused, offsetTime, currentPauseStart]);

  const isPaused = isManualPaused || isAutoPaused;

  return (
    <div className="flex items-center gap-4 bg-md-sys-surface2 px-5 py-3 rounded-2xl border border-md-sys-outline/10 shadow-lg animate-fade-in">
        <button 
            onClick={togglePause}
            className={`p-2 rounded-full transition-all ${isPaused ? 'bg-amber-500 text-black hover:brightness-110' : 'bg-md-sys-surface3 text-md-sys-on-surface hover:bg-md-sys-primary hover:text-md-sys-onPrimary'}`}
            title={isPaused ? "Resume Session" : "Pause Session"}
        >
            {isPaused ? <PlayCircle size={20} className="fill-current"/> : <Pause size={20} className="fill-current"/>}
        </button>
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