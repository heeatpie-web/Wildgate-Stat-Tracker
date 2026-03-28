/**
 * @module PregameAdvicePanel
 * Compact pregame intelligence panel.
 *
 * Auto-opens once per telemetry draft after all three macro screenshots
 * (crew hub + both tactical-map passes) have completed OCR.
 *
 * Dismissed state is keyed to the active draft ID and resets when the
 * draft changes or stops.
 */
import React, { useMemo } from 'react';
import { X, ChevronDown, Crosshair, Zap, AlertTriangle, MapPin, Target, Swords } from 'lucide-react';
import { computePregameAdvice } from '../utils/pregameAdvice/engine';
import type { PregameAdviceFactor, PregameAdviceConfidence, PregameAdviceFactorKind } from '../utils/pregameAdvice/types';
import type { Match } from '../types';

// ─── Sub-components ──────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<PregameAdviceConfidence, string> = {
  low: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  medium: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
  high: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
};

const CONFIDENCE_LABELS: Record<PregameAdviceConfidence, string> = {
  low: 'low',
  medium: 'med',
  high: 'high',
};

const FACTOR_ICONS: Record<PregameAdviceFactorKind, React.ReactNode> = {
  'teammate-synergy': <Zap size={11} />,
  'opponent-pressure': <Crosshair size={11} />,
  'hazard-fit': <AlertTriangle size={11} />,
  'ship-performance': <Swords size={11} />,
  'artifact-objective': <Target size={11} />,
  'poi-plan': <MapPin size={11} />,
};

const DIRECTION_DOT_CLASS: Record<string, string> = {
  positive: 'bg-emerald-400',
  negative: 'bg-rose-400',
  neutral: 'bg-md-sys-on-surface/30',
};

interface ConfidencePillProps {
  confidence: PregameAdviceConfidence;
}

const ConfidencePill: React.FC<ConfidencePillProps> = ({ confidence }) => (
  <span
    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${CONFIDENCE_STYLES[confidence]}`}
  >
    {CONFIDENCE_LABELS[confidence]}
  </span>
);

interface FactorRowProps {
  factor: PregameAdviceFactor;
}

const FactorRow: React.FC<FactorRowProps> = ({ factor }) => (
  <div className="flex items-start gap-2 py-1.5">
    <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
      <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${DIRECTION_DOT_CLASS[factor.direction]}`} />
      <span className="text-md-sys-on-surface/40">
        {FACTOR_ICONS[factor.kind]}
      </span>
    </div>
    <p className="min-w-0 flex-1 text-[11px] leading-snug text-md-sys-on-surface/80">
      {factor.copy}
    </p>
    <div className="ml-1 shrink-0">
      <ConfidencePill confidence={factor.confidence} />
    </div>
  </div>
);

// ─── Win-rate gauge bar ──────────────────────────────────────────────────────

interface WinRateGaugeProps {
  winRate: number; // 0–1
}

const WinRateGauge: React.FC<WinRateGaugeProps> = ({ winRate }) => {
  const pct = Math.round(winRate * 100);
  const barColor =
    pct >= 60 ? 'bg-emerald-400' : pct >= 45 ? 'bg-md-sys-primary' : 'bg-rose-400';

  return (
    <div className="flex items-end gap-2">
      <span className="font-brand text-3xl font-black leading-none tracking-tight text-md-sys-on-surface">
        {pct}
        <span className="text-lg opacity-60">%</span>
      </span>
      <div className="mb-0.5 flex-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-md-sys-on-surface/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Main panel ──────────────────────────────────────────────────────────────

export interface PregameAdvicePanelProps {
  /** Active telemetry draft match used to derive context. */
  activeDraftMatch: Match | null;
  /** Full match history for computing historical stats. */
  allMatches: Match[];
  /** Called when the user dismisses the panel. */
  onDismiss: () => void;
}

export const PregameAdvicePanel: React.FC<PregameAdvicePanelProps> = ({
  activeDraftMatch,
  allMatches,
  onDismiss,
}) => {
  const advice = useMemo(() => {
    if (!activeDraftMatch) return null;

    const ctx = {
      mode: activeDraftMatch.mode,
      teammates: activeDraftMatch.teammates || [],
      opponentTeams: (activeDraftMatch.opponentTeams || []).map((ot) => ({
        teamName: ot.teamName || '',
        shipType: ot.shipType || '',
        players: ot.players || [],
      })),
      reachModifiers: activeDraftMatch.reachModifiers || [],
      artifactSource: activeDraftMatch.artifactSource,
      draftMatchId: activeDraftMatch.id,
    };

    return computePregameAdvice(ctx, allMatches);
  }, [activeDraftMatch, allMatches]);

  if (!advice) return null;

  const positiveFactors = advice.factors.filter((f) => f.direction === 'positive');
  const negativeFactors = advice.factors.filter((f) => f.direction === 'negative');
  const neutralFactors = advice.factors.filter((f) => f.direction === 'neutral');

  // Display order: negative (risks first — most actionable), then positive, then neutral
  const orderedFactors = [...negativeFactors, ...positiveFactors, ...neutralFactors];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-md-sys-outline/15 bg-md-sys-surface-container shadow-md"
      style={{
        // Subtle intel-terminal feel: thin accent stripe on the left
        borderLeft: '3px solid var(--md-sys-color-primary)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-[0.28em] text-md-sys-primary opacity-80">
              Pregame Intel
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${CONFIDENCE_STYLES[advice.confidence]}`}
            >
              {CONFIDENCE_LABELS[advice.confidence]} conf
            </span>
          </div>
          {advice.hasUsableData ? (
            <WinRateGauge winRate={advice.overallWinRate} />
          ) : (
            <p className="text-xs text-md-sys-on-surface/50">Not enough history yet</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-md-sys-on-surface/40 transition-colors hover:bg-md-sys-on-surface/8 hover:text-md-sys-on-surface/70"
          aria-label="Dismiss pregame intel"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      {advice.hasUsableData && orderedFactors.length > 0 && (
        <div className="mx-3 border-t border-md-sys-outline/10" />
      )}

      {/* ── Factor rows ─────────────────────────────────────────────────── */}
      {advice.hasUsableData && orderedFactors.length > 0 && (
        <div className="px-3 py-1">
          {orderedFactors.map((factor, i) => (
            <FactorRow key={`${factor.kind}-${i}`} factor={factor} />
          ))}
        </div>
      )}

      {/* ── No-data fallback body ────────────────────────────────────────── */}
      {!advice.hasUsableData && (
        <div className="px-3 pb-3">
          <p className="text-[11px] leading-relaxed text-md-sys-on-surface/50">
            Play a few more matches in this mode to unlock personalized advice.
          </p>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
        <span className="text-[10px] text-md-sys-on-surface/35">
          Based on {advice.sampleSize} match{advice.sampleSize !== 1 ? 'es' : ''}
          {advice.filteredPoolSize > 0 && advice.filteredPoolSize !== advice.sampleSize
            ? ` · ${advice.filteredPoolSize} for POI`
            : ''}
        </span>
        {advice.hasUsableData && (
          <span className="text-[10px] text-md-sys-on-surface/30">
            {activeDraftMatch?.mode}
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Reopen affordance ────────────────────────────────────────────────────────

interface PregameAdviceReopenButtonProps {
  onClick: () => void;
}

export const PregameAdviceReopenButton: React.FC<PregameAdviceReopenButtonProps> = ({
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1.5 rounded-lg border border-md-sys-primary/20 bg-md-sys-primary/8 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-md-sys-primary/70 transition-all hover:bg-md-sys-primary/15 hover:text-md-sys-primary"
    aria-label="Reopen pregame intel"
  >
    <ChevronDown size={11} />
    Intel
  </button>
);
