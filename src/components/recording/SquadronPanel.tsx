import React from 'react';
import { CHARACTERS, SHIPS } from '../../types';
import { Rocket } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';

export const SquadronPanel: React.FC = () => {
  const { activeShip, shipSource, telemetryDetectedShip, setActiveShip, activeHero, heroSource, telemetryDetectedHero, setActiveHero } = useGameData();

  return (
    <div className="bg-md-sys-surface1 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <span className="text-sm font-semibold flex items-center gap-2 text-md-sys-on-surface">
        <Rocket size={14} className="text-md-sys-primary" />
        Ship & Loadout
        {(shipSource === 'telemetry' || heroSource === 'telemetry') && (
          <span className="ml-auto text-[8px] font-bold uppercase px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded-full animate-pulse">
            Auto-detected
          </span>
        )}
      </span>

      {/* Ship Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {SHIPS.map(s => (
          <button
            key={s}
            onClick={() => setActiveShip(s)}
            className={`relative py-2 px-1.5 rounded-lg text-xs font-semibold transition-all ${activeShip === s
              ? 'bg-md-sys-primary text-md-sys-onPrimary'
              : 'bg-md-sys-surface2 text-md-sys-on-surface/60 hover:bg-md-sys-surface3 hover:text-md-sys-on-surface'
              }`}
          >
            {s.split('(')[0].trim()}
            {telemetryDetectedShip === s && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-blue-500" title="Detected from telemetry" />
            )}
          </button>
        ))}
      </div>

      {/* Prospector Section */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold text-md-sys-on-surface/50 uppercase">Prospector</span>
        <div className="grid grid-cols-3 gap-1">
          {[...CHARACTERS].sort().map(c => (
            <button
              key={c}
              onClick={() => setActiveHero(c)}
              className={`relative py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${activeHero === c
                ? 'bg-md-sys-primary text-md-sys-onPrimary'
                : 'bg-md-sys-surface2 text-md-sys-on-surface/50 hover:bg-md-sys-surface3 hover:text-md-sys-on-surface'
                }`}
            >
              {c}
              {telemetryDetectedHero === c && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" title="Detected from telemetry" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};