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
    currentLoadout,
  } = useGameData();

  const shipTelemetryActive = Boolean(telemetryDetectedShip || shipSource === 'telemetry');
  const prospectorTelemetryActive = Boolean(telemetryDetectedHero || heroSource === 'telemetry');
  const anyTelemetryActive = shipTelemetryActive || prospectorTelemetryActive;
  const telemetryTitle = anyTelemetryActive
    ? `Telemetry active: ${[shipTelemetryActive && 'Ship', prospectorTelemetryActive && 'Prospector'].filter(Boolean).join(', ')}`
    : 'Telemetry inactive';
  const toShipKey = (value: string | null | undefined) => (value || '').split('(')[0].trim().toLowerCase();
  const sameShip = (a: string | null | undefined, b: string | null | undefined) => toShipKey(a) && toShipKey(a) === toShipKey(b);
  const hasShipManualOverride = Boolean(telemetryDetectedShip && activeShip && !sameShip(telemetryDetectedShip, activeShip));
  const hasHeroManualOverride = Boolean(telemetryDetectedHero && activeHero && telemetryDetectedHero !== activeHero);
  const hasAutoWeapons = Array.isArray(currentLoadout?.weapons) && currentLoadout.weapons.length > 0;
  const hasAutoEquipment = Array.isArray(currentLoadout?.equipment) && currentLoadout.equipment.length > 0;

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

  const TelemetryIndicator: React.FC<{ active: boolean; title: string; label: string }> = ({ active, title, label }) => (
    <span
      className={`recording-telemetry-indicator ${active ? 'is-active' : ''} ${(active && isMatchInProgress) ? 'is-recording' : ''}`}
      title={title}
    >
      <span className="recording-telemetry-dot" />
      <span>{label}</span>
    </span>
  );

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
            <TelemetryIndicator active={anyTelemetryActive} title={telemetryTitle} label="Telemetry" />
            {sourceChip('Ship', shipSource)}
            {sourceChip('Prospector', heroSource)}
          </div>
        </div>

        {(telemetryDetectedShip && shipSource !== 'telemetry') && (
          <div className="text-label-sm font-semibold text-md-sys-on-surface/55">
            <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
            Detected ship: <span className="font-black">{telemetryDetectedShip.split('(')[0].trim()}</span>
            {hasShipManualOverride ? <span className="opacity-60"> (manual override)</span> : null}
          </div>
        )}
        {(telemetryDetectedHero && heroSource !== 'telemetry') && (
          <div className="text-label-sm font-semibold text-md-sys-on-surface/55">
            <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
            Detected prospector: <span className="font-black">{telemetryDetectedHero}</span>
            {hasHeroManualOverride ? <span className="opacity-60"> (manual override)</span> : null}
          </div>
        )}
        {(hasAutoWeapons || hasAutoEquipment) && (
          <div className="mg-surface rounded-card p-2 border border-info/15 space-y-1.5">
            {hasAutoWeapons && (
              <div className="flex items-start gap-2 text-label-sm">
                <span className="font-bold uppercase tracking-wide text-info">Weapons</span>
                <span className="text-label-xs font-bold uppercase tracking-wide text-info/70">(auto)</span>
                <span className="text-md-sys-on-surface/80 break-words">
                  {currentLoadout?.weapons?.join(', ')}
                </span>
              </div>
            )}
            {hasAutoEquipment && (
              <div className="flex items-start gap-2 text-label-sm">
                <span className="font-bold uppercase tracking-wide text-info">Equipment</span>
                <span className="text-label-xs font-bold uppercase tracking-wide text-info/70">(auto)</span>
                <span className="text-md-sys-on-surface/80 break-words">
                  {currentLoadout?.equipment?.join(', ')}
                </span>
              </div>
            )}
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
                className={`relative min-h-32px py-1.5 px-1.5 text-label-sm leading-tight text-center font-semibold transition-all whitespace-normal rounded-xl border ${sameShip(activeShip, s)
                  ? 'bg-md-sys-primary/14 border-md-sys-primary/45 text-md-sys-on-surface shadow-inner'
                  : 'md3-surface border-md-sys-outline/20 text-md-sys-on-surface/78 hover:border-md-sys-primary/35 hover:bg-md-sys-on-surface/5'
                  }`}
              >
                {s.split('(')[0].trim()}
                {sameShip(telemetryDetectedShip, s) && (
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
                className={`relative min-h-28px py-1 px-1 text-label-sm leading-tight text-center font-semibold transition-all whitespace-normal rounded-xl border ${activeHero === c
                  ? 'bg-md-sys-primary/14 border-md-sys-primary/45 text-md-sys-on-surface shadow-inner'
                  : 'md3-surface border-md-sys-outline/20 text-md-sys-on-surface/78 hover:border-md-sys-primary/35 hover:bg-md-sys-on-surface/5'
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
          <TelemetryIndicator active={anyTelemetryActive} title={telemetryTitle} label="Telemetry" />
          {sourceChip('Ship', shipSource)}
          {sourceChip('Prospector', heroSource)}
        </div>
      </div>

      {(telemetryDetectedShip && shipSource !== 'telemetry') && (
        <div className="text-label-sm font-semibold text-md-sys-on-surface/55">
          <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
          Detected ship: <span className="font-black">{telemetryDetectedShip.split('(')[0].trim()}</span>
          {hasShipManualOverride ? <span className="opacity-60"> (manual override)</span> : null}
        </div>
      )}
      {(telemetryDetectedHero && heroSource !== 'telemetry') && (
        <div className="text-label-sm font-semibold text-md-sys-on-surface/55">
          <span className="text-info font-black uppercase tracking-wide mr-2">Telemetry</span>
          Detected prospector: <span className="font-black">{telemetryDetectedHero}</span>
          {hasHeroManualOverride ? <span className="opacity-60"> (manual override)</span> : null}
        </div>
      )}
      {(hasAutoWeapons || hasAutoEquipment) && (
        <div className="mg-surface rounded-card p-2 border border-info/15 space-y-1.5">
          {hasAutoWeapons && (
            <div className="flex items-start gap-2 text-label-sm">
              <span className="font-bold uppercase tracking-wide text-info">Weapons</span>
              <span className="text-label-xs font-bold uppercase tracking-wide text-info/70">(auto)</span>
              <span className="text-md-sys-on-surface/80 break-words">
                {currentLoadout?.weapons?.join(', ')}
              </span>
            </div>
          )}
          {hasAutoEquipment && (
            <div className="flex items-start gap-2 text-label-sm">
              <span className="font-bold uppercase tracking-wide text-info">Equipment</span>
              <span className="text-label-xs font-bold uppercase tracking-wide text-info/70">(auto)</span>
              <span className="text-md-sys-on-surface/80 break-words">
                {currentLoadout?.equipment?.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Ship Grid */}
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
            {sameShip(telemetryDetectedShip, s) && (
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
              className={`relative min-h-36px py-1.5 px-1 md3-label leading-tight text-center font-semibold transition-all whitespace-normal justify-center rounded-control border ${activeHero === c
                ? 'bg-md-sys-primary/14 border-md-sys-primary/45 text-md-sys-on-surface shadow-inner'
                : 'md3-surface border-md-sys-outline/20 text-md-sys-on-surface/78 hover:border-md-sys-primary/35 hover:bg-md-sys-on-surface/5'
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
