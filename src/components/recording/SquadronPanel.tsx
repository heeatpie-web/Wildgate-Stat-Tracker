import React from 'react';
import { CHARACTERS, SHIPS } from '../../types';
import { Rocket } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';

export interface SquadronPanelProps {
  density?: 'standard' | 'compact';
}

export const SquadronPanel: React.FC<SquadronPanelProps> = ({ density = 'standard' }) => {
  const {
    activeShip,
    shipSource,
    telemetryDetectedShip,
    setActiveShip,
    activeHero,
    heroSource,
    telemetryDetectedHero,
    setActiveHero,
    isMatchInProgress,
  } = useGameData();

  const shipTelemetryActive = Boolean(telemetryDetectedShip || shipSource === 'telemetry');
  const prospectorTelemetryActive = Boolean(telemetryDetectedHero || heroSource === 'telemetry');

  const sourceChip = (label: string, source?: 'manual' | 'telemetry' | 'ocr') => {
    if (!source || source === 'manual') return null;
    const cls =
      source === 'telemetry'
        ? 'text-info bg-info/15'
        : 'text-info bg-info-soft';
    const srcLabel = source === 'telemetry' ? 'Telemetry' : 'OCR';
    return (
      <span className={`md3-chip md3-label ${cls}`}>
        {label}: {srcLabel}
      </span>
    );
  };

  const TelemetryIndicator: React.FC<{ active: boolean; title: string }> = ({ active, title }) => (
    <span
      className={`recording-telemetry-indicator ${active ? 'is-active' : ''} ${(active && isMatchInProgress) ? 'is-recording' : ''}`}
      title={title}
    >
      <span className="recording-telemetry-dot" />
      <span>Telemetry Active</span>
    </span>
  );

  if (density === 'compact') {
    return (
      <div data-recording-panel="ship-loadout" className="md3-card recording-inside-panel p-4 flex flex-col gap-3 mg-surface shadow-lg">
        <div className="recording-panel-header">
          <div className="recording-panel-heading">
            <span className="recording-panel-heading-icon">
              <Rocket size={12} />
            </span>
            <h3 className="recording-panel-heading-title">Ship and Loadout</h3>
          </div>
          <div className="recording-panel-heading-meta">
            <TelemetryIndicator active={shipTelemetryActive} title="Ship telemetry active" />
            <TelemetryIndicator active={prospectorTelemetryActive} title="Prospector telemetry active" />
            {sourceChip('Ship', shipSource)}
            {sourceChip('Prospector', heroSource)}
          </div>
        </div>

        {(telemetryDetectedShip && shipSource !== 'telemetry') && (
          <div className="text-label-sm font-semibold text-md-sys-on-surface/55">
            <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
            Detected ship: <span className="font-black">{telemetryDetectedShip.split('(')[0].trim()}</span>
            {activeShip && telemetryDetectedShip !== activeShip ? <span className="opacity-60"> (manual override)</span> : null}
          </div>
        )}
        {(telemetryDetectedHero && heroSource !== 'telemetry') && (
          <div className="text-label-sm font-semibold text-md-sys-on-surface/55">
            <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
            Detected prospector: <span className="font-black">{telemetryDetectedHero}</span>
            {activeHero && telemetryDetectedHero !== activeHero ? <span className="opacity-60"> (manual override)</span> : null}
          </div>
        )}

        {/* Ship Pill Buttons */}
        <div className="flex flex-col gap-1.5">
          <span className="text-label-sm font-semibold text-md-sys-on-surface/60">Ship</span>
          <div className="grid grid-cols-2 gap-1.5">
            {SHIPS.map(s => (
              <button
                key={s}
                onClick={() => setActiveShip(s)}
                className={`relative min-h-32px py-1.5 px-1.5 text-label-sm leading-tight text-center font-semibold transition-all whitespace-normal rounded-xl ${activeShip === s
                  ? 'md3-chip md3-chip--selected ring-2 ring-md-sys-primary/60 bg-md-sys-primary/10'
                  : 'md3-chip opacity-60 text-md-sys-on-surface/60 hover:opacity-100 hover:bg-md-sys-on-surface/5'
                  }`}
              >
                {s.split('(')[0].trim()}
                {telemetryDetectedShip === s && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-info" title="Detected from telemetry" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Prospector Pill Buttons */}
        <div className="flex flex-col gap-1.5">
          <span className="text-label-sm font-semibold text-md-sys-on-surface/60">Prospector</span>
          <div className="grid grid-cols-4 gap-1.5">
            {[...CHARACTERS].sort().map(c => (
              <button
                key={c}
                onClick={() => setActiveHero(c)}
                className={`relative min-h-28px py-1 px-1 text-label-sm leading-tight text-center font-semibold transition-all whitespace-normal rounded-xl ${activeHero === c
                  ? 'md3-chip md3-chip--selected ring-2 ring-md-sys-primary/60 bg-md-sys-primary/10'
                  : 'md3-chip opacity-60 text-md-sys-on-surface/60 hover:opacity-100 hover:bg-md-sys-on-surface/5'
                  }`}
              >
                {c}
                {telemetryDetectedHero === c && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-info" title="Detected from telemetry" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
      <div
        data-recording-panel="ship-loadout"
        className="md3-card recording-inside-panel p-4 flex flex-col gap-4 mg-surface shadow-lg"
      >
      {/* Header */}
      <div className="recording-panel-header">
        <div className="recording-panel-heading">
          <span className="recording-panel-heading-icon">
            <Rocket size={12} />
          </span>
          <h3 className="recording-panel-heading-title">Ship and Loadout</h3>
        </div>
        <div className="recording-panel-heading-meta">
          <TelemetryIndicator active={shipTelemetryActive} title="Ship telemetry active" />
          <TelemetryIndicator active={prospectorTelemetryActive} title="Prospector telemetry active" />
          {sourceChip('Ship', shipSource)}
          {sourceChip('Prospector', heroSource)}
        </div>
      </div>

      {(telemetryDetectedShip && shipSource !== 'telemetry') && (
        <div className="text-label-sm font-semibold text-md-sys-on-surface/55">
          <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
          Detected ship: <span className="font-black">{telemetryDetectedShip.split('(')[0].trim()}</span>
          {activeShip && telemetryDetectedShip !== activeShip ? <span className="opacity-60"> (manual override)</span> : null}
        </div>
      )}
      {(telemetryDetectedHero && heroSource !== 'telemetry') && (
        <div className="text-label-sm font-semibold text-md-sys-on-surface/55">
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
            className={`relative min-h-40px py-2 px-2 md3-label leading-tight text-center font-semibold transition-all whitespace-normal justify-center ${activeShip === s
              ? 'md3-chip md3-chip--selected ring-2 ring-md-sys-primary/60 bg-md-sys-primary/10'
              : 'md3-chip opacity-60 text-md-sys-on-surface/60 hover:opacity-100 hover:bg-md-sys-on-surface/5'
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
              className={`relative min-h-36px py-1.5 px-1 md3-label leading-tight text-center font-semibold transition-all whitespace-normal justify-center ${activeHero === c
                ? 'md3-chip md3-chip--selected ring-2 ring-md-sys-primary/60 bg-md-sys-primary/10'
                : 'md3-chip opacity-60 text-md-sys-on-surface/60 hover:opacity-100 hover:bg-md-sys-on-surface/5'
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
