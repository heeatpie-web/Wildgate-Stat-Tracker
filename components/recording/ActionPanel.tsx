import React from 'react';
import { Trophy, Scale, Skull } from 'lucide-react';
import { SessionTimer } from '../SessionTimer';
import { Match } from '../../types';

interface ActionPanelProps {
  inputMode: 'Smart' | 'Manual';
  setInputMode: (mode: 'Smart' | 'Manual') => void;
  initiateSubmission: (result: 'Win' | 'Loss' | 'Draw') => void;
  showSessionTimer: boolean;
  sessionStartTime: number;
  matches: Match[];
  lastActivity: number;
  onRefreshActivity: () => void;
  matchStartTime: number | null;
  isMatchInProgress: boolean;
  onStartMatch: () => void;
  onResetMatch: () => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({ 
    inputMode, 
    setInputMode, 
    initiateSubmission,
    showSessionTimer,
    sessionStartTime,
    matches,
    lastActivity,
    onRefreshActivity,
    matchStartTime,
    isMatchInProgress,
    onStartMatch,
    onResetMatch
}) => (
  <div className="bg-md-sys-surface1 rounded-[32px] p-3 shadow-lg h-full overflow-y-auto custom-scrollbar flex flex-col gap-3">
      <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-md-sys-on-surface font-black text-xs uppercase tracking-widest">
              <Trophy size={14}/> Record Mission Results
          </div>
          <div className="flex bg-md-sys-surface2 p-1 rounded-xl shadow-inner">
              <button onClick={() => setInputMode('Smart')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${inputMode === 'Smart' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60'}`}>Smart</button>
              <button onClick={() => setInputMode('Manual')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${inputMode === 'Manual' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60'}`}>Manual</button>
          </div>
      </div>

      {showSessionTimer && (
          <div className="bg-md-sys-surface2 p-1 rounded-[24px]">
            <SessionTimer 
                startTime={sessionStartTime} 
                matches={matches} 
                lastActivity={lastActivity} 
                onRefreshActivity={onRefreshActivity} 
                matchStartTime={matchStartTime}
                isMatchInProgress={isMatchInProgress}
                onStartMatch={onStartMatch}
                onResetMatch={onResetMatch}
            />
          </div>
      )}

      <div className="flex gap-2">
          <button onClick={() => initiateSubmission('Win')} className="flex-1 bg-green-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest hover:brightness-110 active:scale-95 shadow-lg flex flex-col items-center justify-center gap-1"><Trophy size={20}/> Victory</button>
          <button onClick={() => initiateSubmission('Draw')} className="w-1/4 bg-slate-500 text-white py-3 rounded-2xl font-black uppercase tracking-widest hover:brightness-110 active:scale-95 shadow-lg flex flex-col items-center justify-center gap-1"><Scale size={16}/> Draw</button>
          <button onClick={() => initiateSubmission('Loss')} className="flex-1 bg-red-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest hover:brightness-110 active:scale-95 shadow-lg flex flex-col items-center justify-center gap-1"><Skull size={20}/> Defeat</button>
      </div>
  </div>
);