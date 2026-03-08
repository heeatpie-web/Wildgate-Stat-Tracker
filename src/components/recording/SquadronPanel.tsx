import React from 'react';
import { CHARACTERS, SHIPS } from '../../types';
import { Rocket } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { getTelemetryActivityState } from '../../utils/telemetryActivity';

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
  const { telemetryStatus } = useUIState();

  const toShipKey = (value: string | null | undefined) => (value || '').split('(')[0].trim().toLowerCase();
  const sameShip = (a: string | null | undefined, b: string | null | undefined) => toShipKey(a) && toShipKey(a) === toShipKey(b);
  const hasShipManualOverride = Boolean(telemetryDetectedShip && activeShip && !sameShip(telemetryDetectedShip, activeShip));
  const hasHeroManualOverride = Boolean(telemetryDetectedHero && activeHero && telemetryDetectedHero !== activeHero);
  const telemetryActivity = getTelemetryActivityState(telemetryStatus?.exists, telemetryStatus?.lastEventAt);
  const hasMatchTelemetry = Boolean(isMatchInProgress || telemetryActivity === 'receiving');
  const telemetrySignalsFilled = (telemetryDetectedShip ? 1 : 0) + (telemetryDetectedHero ? 1 : 0) + (hasMatchTelemetry ? 1 : 0);
  const telemetrySignalsTotal = 3;
  const telemetrySummaryTooltip = `Telemetry signals: ${telemetrySignalsFilled}/${telemetrySignalsTotal} (Ship ${telemetryDetectedShip ? 'ok' : 'missing'}, Prospector ${telemetryDetectedHero ? 'ok' : 'missing'}, Match ${hasMatchTelemetry ? 'ok' : 'missing'})`;

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
            {telemetrySignalsFilled > 0 && (
              <span
                data-testid="recording-telemetry-summary"
                className="recording-telemetry-indicator is-active"
                title={telemetrySummaryTooltip}
              >
                <span className="recording-telemetry-dot" />
                Telemetry {telemetrySignalsFilled}/{telemetrySignalsTotal}
              </span>
            )}
            {sourceChip('Ship', shipSource)}
            {sourceChip('Prospector', heroSource)}
          </div>
        </div>

        {telemetryOverrideSummary}

        {/* Ship Pill Buttons */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-label-sm font-semibold text-md-sys-on-surface/60">Ship</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SHIPS.map(s => (
              <button
                key={s}
                onClick={() => setActiveShip(s)}
                className={`recording-click-target relative min-h-32px py-1.5 px-1.5 text-label-sm leading-tight text-center font-semibold transition-all whitespace-normal rounded-xl border ${sameShip(activeShip, s)
                  ? 'recording-selection-active'
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
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[...CHARACTERS].sort().map(c => (
              <button
                key={c}
                onClick={() => setActiveHero(c)}
                className={`recording-click-target relative min-h-28px py-1 px-1 text-label-sm leading-tight text-center font-semibold transition-all whitespace-normal rounded-xl border ${activeHero === c
                  ? 'recording-selection-active'
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
          {telemetrySignalsFilled > 0 && (
            <span
              data-testid="recording-telemetry-summary"
              className="recording-telemetry-indicator is-active"
              title={telemetrySummaryTooltip}
            >
              <span className="recording-telemetry-dot" />
              Telemetry {telemetrySignalsFilled}/{telemetrySignalsTotal}
            </span>
          )}
          {sourceChip('Ship', shipSource)}
          {sourceChip('Prospector', heroSource)}
        </div>
      </div>

      {telemetryOverrideSummary}

      {/* Ship Grid */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="md3-label text-md-sys-on-surface/60">Ship</span>
        </div>
      <div className="grid grid-cols-2 gap-2">
        {SHIPS.map(s => (
          <button
            key={s}
            onClick={() => setActiveShip(s)}
            className={`recording-click-target relative min-h-40px py-2 px-2 md3-label leading-tight text-center font-semibold transition-all whitespace-normal justify-center rounded-control border ${sameShip(activeShip, s)
              ? 'recording-selection-active'
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
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[...CHARACTERS].sort().map(c => (
            <button
              key={c}
              onClick={() => setActiveHero(c)}
              className={`recording-click-target relative min-h-36px py-1.5 px-1 md3-label leading-tight text-center font-semibold transition-all whitespace-normal justify-center rounded-control border ${activeHero === c
                ? 'recording-selection-active'
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
