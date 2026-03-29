/**
 * @module PregameAdvicePanel
 * Shared live + saved pregame intelligence surfaces.
 */
import React from 'react';
import { X, Crosshair, Zap, AlertTriangle, MapPin, Target, Swords, Clock3 } from 'lucide-react';
import type { Match } from '../types';
import type {
  PregameAdviceConfidence,
  PregameAdviceFactor,
  PregameAdviceFactorKind,
  PregameAdviceResult,
  PregameAdviceSnapshot,
} from '../utils/pregameAdvice/types';
import { computePregameAdviceForMatch } from '../utils/pregameAdvice/matchAdvice';

type AdviceLike = PregameAdviceResult | PregameAdviceSnapshot;

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

const formatSnapshotTime = (updatedAt?: number | null): string | null => {
  const timestamp = Number(updatedAt || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

interface WinRateGaugeProps {
  winRate: number;
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

interface AdviceActionPillsProps {
  actions: string[];
}

const AdviceActionPills: React.FC<AdviceActionPillsProps> = ({ actions }) => {
  if (actions.length === 0) return null;
  return (
    <div className="px-3 pb-1 pt-1.5">
      <div className="mb-1 text-[9px] font-black uppercase tracking-[0.28em] text-md-sys-on-surface/40">
        Playbook
      </div>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <span
            key={action}
            className="rounded-full border border-md-sys-primary/16 bg-md-sys-primary/8 px-2 py-1 text-[10px] font-semibold text-md-sys-on-surface/78"
          >
            {action}
          </span>
        ))}
      </div>
    </div>
  );
};

interface PregameAdviceCardProps {
  advice: AdviceLike;
  modeLabel?: string | null;
  eyebrow: string;
  subtitle?: string | null;
  onDismiss?: (() => void) | null;
  compact?: boolean;
}

const PregameAdviceCard: React.FC<PregameAdviceCardProps> = ({
  advice,
  modeLabel,
  eyebrow,
  subtitle,
  onDismiss,
  compact = false,
}) => {
  const positiveFactors = advice.factors.filter((factor) => factor.direction === 'positive');
  const negativeFactors = advice.factors.filter((factor) => factor.direction === 'negative');
  const neutralFactors = advice.factors.filter((factor) => factor.direction === 'neutral');
  const orderedFactors = [...negativeFactors, ...positiveFactors, ...neutralFactors];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-md-sys-outline/15 bg-md-sys-surface-container shadow-md ${
        compact ? '' : 'ring-1 ring-md-sys-primary/6'
      }`}
      style={{ borderLeft: '3px solid var(--md-sys-color-primary)' }}
    >
      <div className={`flex items-start justify-between gap-3 ${compact ? 'px-3 pb-2 pt-3' : 'px-4 pb-2 pt-4'}`}>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-[0.28em] text-md-sys-primary opacity-80">
              {eyebrow}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${CONFIDENCE_STYLES[advice.confidence]}`}
            >
              {CONFIDENCE_LABELS[advice.confidence]} conf
            </span>
          </div>
          {advice.hasUsableData ? (
            <>
              <WinRateGauge winRate={advice.overallWinRate} />
              <p className="mt-1 text-[11px] leading-snug text-md-sys-on-surface/56">
                {advice.headline}
              </p>
            </>
          ) : (
            <p className="text-xs text-md-sys-on-surface/50">Not enough history yet</p>
          )}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-md-sys-on-surface/40 transition-colors hover:bg-md-sys-on-surface/8 hover:text-md-sys-on-surface/70"
            aria-label="Close pregame intel"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {subtitle ? (
        <div className="px-3 pb-1">
          <div className="rounded-xl border border-md-sys-outline/10 bg-md-sys-surface/65 px-2.5 py-2 text-[11px] leading-relaxed text-md-sys-on-surface/60">
            {subtitle}
          </div>
        </div>
      ) : null}

      {advice.hasUsableData && advice.topActions.length > 0 ? (
        <>
          <div className="mx-3 border-t border-md-sys-outline/10" />
          <AdviceActionPills actions={advice.topActions} />
        </>
      ) : null}

      {advice.hasUsableData && orderedFactors.length > 0 ? (
        <>
          <div className="mx-3 border-t border-md-sys-outline/10" />
          <div className="px-3 py-1">
            {orderedFactors.map((factor, index) => (
              <FactorRow key={`${factor.kind}-${index}`} factor={factor} />
            ))}
          </div>
        </>
      ) : null}

      {!advice.hasUsableData ? (
        <div className="px-3 pb-3">
          <p className="text-[11px] leading-relaxed text-md-sys-on-surface/50">
            Play a few more matches in this mode to unlock personalized advice.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3 pt-1 text-[10px] text-md-sys-on-surface/35">
        <span>
          Based on {advice.sampleSize} match{advice.sampleSize !== 1 ? 'es' : ''}
          {advice.filteredPoolSize > 0 && advice.filteredPoolSize !== advice.sampleSize
            ? ` · ${advice.filteredPoolSize} for POI`
            : ''}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {modeLabel ? <span>{modeLabel}</span> : null}
          {'updatedAt' in advice && formatSnapshotTime(advice.updatedAt) ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 size={10} />
              {formatSnapshotTime(advice.updatedAt)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export interface PregameAdvicePanelProps {
  activeDraftMatch: Match | null;
  allMatches: Match[];
  onDismiss?: () => void;
}

export const PregameAdvicePanel: React.FC<PregameAdvicePanelProps> = ({
  activeDraftMatch,
  allMatches,
  onDismiss,
}) => {
  const advice = React.useMemo(
    () => computePregameAdviceForMatch(activeDraftMatch, allMatches),
    [activeDraftMatch, allMatches]
  );

  if (!activeDraftMatch || !advice) return null;

  return (
    <PregameAdviceCard
      advice={advice}
      modeLabel={activeDraftMatch.mode}
      eyebrow="Pregame Intel"
      subtitle="Lobby OCR is staged into a dedicated match workspace now, so you can dip into this view without crowding the recording controls."
      onDismiss={onDismiss}
    />
  );
};

interface PregameAdviceSnapshotCardProps {
  match: Match;
}

export const PregameAdviceSnapshotCard: React.FC<PregameAdviceSnapshotCardProps> = ({ match }) => {
  const advice = match.pregameAdvice;
  if (!advice) return null;

  return (
    <PregameAdviceCard
      advice={advice}
      modeLabel={match.mode}
      eyebrow="Saved Pregame Intel"
      subtitle="This is the estimate that was captured for this match before the result was resolved."
      compact
    />
  );
};
