import React from 'react';
import { CHARACTERS, SHIPS } from '../../types';
import { Rocket } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';

export interface SquadronPanelProps {
  density?: 'standard' | 'compact';
}

export const SquadronPanel: React.FC<SquadronPanelProps> = ({ density = 'standard' }) => {
  const { activeShip, shipSource, telemetryDetectedShip, setActiveShip, activeHero, heroSource, telemetryDetectedHero, setActiveHero } = useGameData();

  const sourceChip = (label: string, source?: 'manual' | 'telemetry' | 'ocr') => {
    if (!source || source === 'manual') return null;
    const cls =
      source === 'telemetry'
        ? 'text-info bg-info/15'
        : 'text-sky-300 bg-sky-500/15';
    const srcLabel = source === 'telemetry' ? 'Telemetry' : 'OCR';
    return (
      <span className={`md3-chip md3-label ${cls}`}>
        {label}: {srcLabel}
      </span>
    );
  };

  if (density === 'compact') {
    const ships = SHIPS.map(s => ({ value: s, label: s.split('(')[0].trim() }));
    const heroes = [...CHARACTERS].sort().map(c => ({ value: c, label: c }));
    const shipValue = (activeShip && SHIPS.includes(activeShip)) ? activeShip : (ships[0]?.value || '');
    const heroValue = (activeHero && heroes.some(h => h.value === activeHero)) ? activeHero : (heroes[0]?.value || '');

    return (
      <div className="md3-card p-3 flex flex-col gap-3">
        <span className="md3-title flex items-center gap-2 text-md-sys-on-surface">
          <span className="w-8 h-8 rounded-xl bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center">
            <Rocket size={14} />
          </span>
          Ship & Loadout
          <span className="ml-auto flex items-center gap-1.5">
            {sourceChip('Ship', shipSource)}
            {sourceChip('Prospector', heroSource)}
          </span>
        </span>

        {(telemetryDetectedShip && shipSource !== 'telemetry') && (
          <div className="text-[10px] font-semibold text-md-sys-on-surface/55">
            <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
            Detected ship: <span className="font-black">{telemetryDetectedShip.split('(')[0].trim()}</span>
            {activeShip && telemetryDetectedShip !== activeShip ? <span className="opacity-60"> (manual override)</span> : null}
          </div>
        )}
        {(telemetryDetectedHero && heroSource !== 'telemetry') && (
          <div className="text-[10px] font-semibold text-md-sys-on-surface/55">
            <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
            Detected prospector: <span className="font-black">{telemetryDetectedHero}</span>
            {activeHero && telemetryDetectedHero !== activeHero ? <span className="opacity-60"> (manual override)</span> : null}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-semibold text-md-sys-on-surface/60 flex items-center">
            Ship
          </label>
          <select
            value={shipValue}
            onChange={(e) => setActiveShip(e.target.value)}
            className="h-9 md3-surface rounded-xl px-3 text-xs font-semibold text-md-sys-on-surface/80 outline-none border border-md-sys-outline/10 focus:ring-2 focus:ring-md-sys-primary/30"
          >
            {ships.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <label className="text-[10px] font-semibold text-md-sys-on-surface/60 flex items-center">
            Prospector
          </label>
          <select
            value={heroValue}
            onChange={(e) => setActiveHero(e.target.value)}
            className="h-9 md3-surface rounded-xl px-3 text-xs font-semibold text-md-sys-on-surface/80 outline-none border border-md-sys-outline/10 focus:ring-2 focus:ring-md-sys-primary/30"
          >
            {heroes.map(h => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="md3-card p-4 flex flex-col gap-4">
      {/* Header */}
      <span className="md3-title flex items-center gap-2 text-md-sys-on-surface">
        <span className="w-8 h-8 rounded-xl bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center">
          <Rocket size={14} />
        </span>
        Ship & Loadout
        <span className="ml-auto flex items-center gap-1.5">
          {sourceChip('Ship', shipSource)}
          {sourceChip('Prospector', heroSource)}
        </span>
      </span>

      {(telemetryDetectedShip && shipSource !== 'telemetry') && (
        <div className="text-[10px] font-semibold text-md-sys-on-surface/55">
          <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
          Detected ship: <span className="font-black">{telemetryDetectedShip.split('(')[0].trim()}</span>
          {activeShip && telemetryDetectedShip !== activeShip ? <span className="opacity-60"> (manual override)</span> : null}
        </div>
      )}
      {(telemetryDetectedHero && heroSource !== 'telemetry') && (
        <div className="text-[10px] font-semibold text-md-sys-on-surface/55">
          <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
          Detected prospector: <span className="font-black">{telemetryDetectedHero}</span>
          {activeHero && telemetryDetectedHero !== activeHero ? <span className="opacity-60"> (manual override)</span> : null}
        </div>
      )}

      {/* Ship Grid */}
      <div className="grid grid-cols-2 gap-2">
        {SHIPS.map(s => (
            <button
              key={s}
              onClick={() => setActiveShip(s)}
              className={`relative min-h-[40px] py-2 px-2 md3-label leading-tight text-center font-semibold transition-all whitespace-normal justify-center ${activeShip === s
                ? 'md3-chip md3-chip--selected'
                : 'md3-chip text-md-sys-on-surface/70 hover:bg-md-sys-on-surface/5'
                }`}
            >
            {s.split('(')[0].trim()}
            {telemetryDetectedShip === s && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-info" title="Detected from telemetry" />
            )}
          </button>
        ))}
      </div>

      {/* Prospector Section */}
      <div className="flex flex-col gap-2">
        <span className="md3-label text-md-sys-on-surface/60">Prospector</span>
        <div className="grid grid-cols-3 gap-2">
          {[...CHARACTERS].sort().map(c => (
            <button
              key={c}
              onClick={() => setActiveHero(c)}
              className={`relative min-h-[36px] py-1.5 px-1 md3-label leading-tight text-center font-semibold transition-all whitespace-normal justify-center ${activeHero === c
                ? 'md3-chip md3-chip--selected'
                : 'md3-chip text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                }`}
            >
              {c}
              {telemetryDetectedHero === c && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-info" title="Detected from telemetry" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
