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
    currentLoadout,
  } = useGameData();

  const toShipKey = (value: string | null | undefined) => (value || '').split('(')[0].trim().toLowerCase();
  const sameShip = (a: string | null | undefined, b: string | null | undefined) => toShipKey(a) && toShipKey(a) === toShipKey(b);
  const hasShipManualOverride = Boolean(telemetryDetectedShip && activeShip && !sameShip(telemetryDetectedShip, activeShip));
  const hasHeroManualOverride = Boolean(telemetryDetectedHero && activeHero && telemetryDetectedHero !== activeHero);
  const shipWeapons = Array.isArray(currentLoadout?.shipWeapons) && currentLoadout.shipWeapons.length > 0
    ? currentLoadout.shipWeapons
        .flatMap((entry) => Array.from({ length: Math.max(1, Number(entry?.quantity || 1)) }, () => String(entry?.name || '').trim()))
        .filter(Boolean)
    : (currentLoadout?.weapons || []);
  const prospectorWeapons = currentLoadout?.characterWeapons || [];
  const prospectorEquipment = currentLoadout?.characterEquipment || currentLoadout?.equipment || [];
  const hasShipWeapons = shipWeapons.length > 0;
  const hasProspectorWeapons = prospectorWeapons.length > 0;
  const hasProspectorEquipment = prospectorEquipment.length > 0;

  const sourceChip = (label: string, source?: 'manual' | 'telemetry' | 'ocr') => {
    if (!source || source === 'manual' || source === 'telemetry') return null;
    const cls = 'text-info bg-info-soft';
    const srcLabel = 'OCR';
    return (
      <span className={`md3-chip md3-label ${cls}`}>
        {label}: {srcLabel}
      </span>
    );
  };

  const telemetryOverrideSummary = ((telemetryDetectedShip && shipSource !== 'telemetry') || (telemetryDetectedHero && heroSource !== 'telemetry')) ? (
    <div className="mg-surface rounded-card p-2 border border-info/15 space-y-1">
      <div className="text-label-xs font-bold uppercase tracking-wide text-info">Telemetry Hints</div>
      {(telemetryDetectedShip && shipSource !== 'telemetry') && (
        <div className="text-label-sm font-semibold text-md-sys-on-surface/65">
          Detected ship: <span className="font-black">{telemetryDetectedShip.split('(')[0].trim()}</span>
          {hasShipManualOverride ? <span className="opacity-60"> (manual override)</span> : null}
        </div>
      )}
      {(telemetryDetectedHero && heroSource !== 'telemetry') && (
        <div className="text-label-sm font-semibold text-md-sys-on-surface/65">
          Detected prospector: <span className="font-black">{telemetryDetectedHero}</span>
          {hasHeroManualOverride ? <span className="opacity-60"> (manual override)</span> : null}
        </div>
      )}
    </div>
  ) : null;

  if (density === 'compact') {
    return (
      <div data-recording-panel="ship-loadout" className="md3-card recording-inside-panel flex flex-col overflow-visible mg-surface shadow-lg p-4 gap-3">
        <div className="recording-panel-header">
          <div className="recording-panel-heading">
            <span className="recording-panel-heading-icon">
              <Rocket size={12} />
            </span>
            <h3 className="recording-panel-heading-title">Ship and Loadout</h3>
          </div>
          <div className="recording-panel-heading-meta">
            {sourceChip('Ship', shipSource)}
            {sourceChip('Prospector', heroSource)}
          </div>
        </div>

        {telemetryOverrideSummary}

        {/* Ship Pill Buttons */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-label-sm font-semibold text-md-sys-on-surface/60">Ship</span>
            {shipSource === 'telemetry' && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-1.5 py-0.5 text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Telemetry
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SHIPS.map(s => (
              <button
                key={s}
                onClick={() => setActiveShip(s)}
                className={`relative min-h-32px py-1.5 px-1.5 text-label-sm leading-tight text-center font-semibold transition-all whitespace-normal rounded-xl border ${sameShip(activeShip, s)
                  ? 'bg-md-sys-primary/14 border-md-sys-primary/45 text-md-sys-on-surface shadow-inner'
                  : 'md3-surface border-md-sys-outline/20 text-md-sys-on-surface/78 hover:border-md-sys-primary/35 hover:bg-md-sys-on-surface/5'
                  }`}
              >
                {s.split('(')[0].trim()}
              </button>
            ))}
          </div>
        </div>

        {/* Prospector Pill Buttons */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-label-sm font-semibold text-md-sys-on-surface/60">Prospector</span>
            {heroSource === 'telemetry' && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-1.5 py-0.5 text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Telemetry
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[...CHARACTERS].sort().map(c => (
              <button
                key={c}
                onClick={() => setActiveHero(c)}
                className={`relative min-h-28px py-1 px-1 text-label-sm leading-tight text-center font-semibold transition-all whitespace-normal rounded-xl border ${activeHero === c
                  ? 'bg-md-sys-primary/14 border-md-sys-primary/45 text-md-sys-on-surface shadow-inner'
                  : 'md3-surface border-md-sys-outline/20 text-md-sys-on-surface/78 hover:border-md-sys-primary/35 hover:bg-md-sys-on-surface/5'
                  }`}
              >
                {c}
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
        className="md3-card recording-inside-panel flex flex-col overflow-visible mg-surface shadow-lg p-4 gap-4"
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
          {sourceChip('Ship', shipSource)}
          {sourceChip('Prospector', heroSource)}
        </div>
      </div>

      {telemetryOverrideSummary}

      {/* Ship Grid */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="md3-label text-md-sys-on-surface/60">Ship</span>
          {shipSource === 'telemetry' && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-1.5 py-0.5 text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Telemetry
            </span>
          )}
        </div>
      <div className="grid grid-cols-2 gap-2">
        {SHIPS.map(s => (
          <button
            key={s}
            onClick={() => setActiveShip(s)}
            className={`relative min-h-40px py-2 px-2 md3-label leading-tight text-center font-semibold transition-all whitespace-normal justify-center rounded-control border ${sameShip(activeShip, s)
              ? 'bg-md-sys-primary/14 border-md-sys-primary/45 text-md-sys-on-surface shadow-inner'
              : 'md3-surface border-md-sys-outline/20 text-md-sys-on-surface/78 hover:border-md-sys-primary/35 hover:bg-md-sys-on-surface/5'
              }`}
          >
            {s.split('(')[0].trim()}
          </button>
        ))}
      </div>
      </div>

      {/* Prospector Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="md3-label text-md-sys-on-surface/60">Prospector</span>
          {heroSource === 'telemetry' && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-1.5 py-0.5 text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Telemetry
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[...CHARACTERS].sort().map(c => (
            <button
              key={c}
              onClick={() => setActiveHero(c)}
              className={`relative min-h-36px py-1.5 px-1 md3-label leading-tight text-center font-semibold transition-all whitespace-normal justify-center rounded-control border ${activeHero === c
                ? 'bg-md-sys-primary/14 border-md-sys-primary/45 text-md-sys-on-surface shadow-inner'
                : 'md3-surface border-md-sys-outline/20 text-md-sys-on-surface/78 hover:border-md-sys-primary/35 hover:bg-md-sys-on-surface/5'
                }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
