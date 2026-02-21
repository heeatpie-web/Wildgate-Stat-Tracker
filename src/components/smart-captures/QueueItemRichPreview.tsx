import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ScanEye,
  ShieldAlert,
  Skull,
  Trophy,
} from 'lucide-react';
import type { Match } from '../../types';
import {
  getStatusMeta,
  countImages,
  getCollapsedQueueGlyph,
  getQueueStatus,
  getSemanticStatusTone,
  getTelemetryConsistencyWarningChips,
} from './smartCaptureUtils';
import { OutcomePill } from './primitives/OutcomePill';
import { ConfidenceMeter } from './primitives/ConfidenceMeter';
import { ConfidenceBadge } from './primitives/ConfidenceBadge';

interface QueueItemRichPreviewProps {
  match: Match;
  displayNumber: number;
  rawMatchId?: number;
  compact?: boolean;
  isSelected: boolean;
  isMultiSelected?: boolean;
  onClick: () => void;
  onToggleSelect?: () => void;
}

const BORDER_BY_TONE: Record<'success' | 'warning' | 'danger' | 'info' | 'neutral', string> = {
  success: 'var(--md-sys-color-success)',
  warning: 'var(--md-sys-color-warning)',
  danger: 'var(--md-sys-color-danger)',
  info: 'var(--md-sys-color-info)',
  neutral: 'var(--md-sys-color-outline)',
};

const getDayOrdinal = (day: number): string => {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
};

const formatQueueTimestamp = (when: Date): string => {
  if (Number.isNaN(when.getTime())) return '--';
  const month = when.toLocaleDateString(undefined, { month: 'short' });
  const day = getDayOrdinal(when.getDate());
  const time = when
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .replace(/\s/g, '')
    .toLowerCase();
  return `${month} ${day} ${time}`;
};

export const QueueItemRichPreview: React.FC<QueueItemRichPreviewProps> = ({
  match,
  displayNumber,
  rawMatchId,
  compact = false,
  isSelected,
  isMultiSelected = false,
  onClick,
  onToggleSelect,
}) => {
  const qs = getQueueStatus(match);
  const hasArtifacts = qs.hasArtifacts;
  const shipLabel = match.ship ? match.ship.split('(')[0].trim() : 'No ship';
  const prospectorLabel = match.hero ? match.hero.trim() : 'No prospector';
  const when = new Date(match.timestamp);
  const timestampLabel = formatQueueTimestamp(when);
  const identityLabel = `${shipLabel} | ${prospectorLabel}`;
  const hasIdentity = Boolean(match.ship || match.hero);
  const rawConfidence = Number(match.ocrDebug?.confidence);
  const hasConfidence = Number.isFinite(rawConfidence) && rawConfidence > 0;
  const confidence = hasConfidence ? Math.round(rawConfidence) : 0;
  const fallbackProgress = match.ocrState === 'queued'
    ? 12
    : match.ocrState === 'processing'
      ? 38
      : match.ocrState === 'reviewing'
        ? 56
        : match.ocrState === 'ready'
          ? 72
          : match.ocrState === 'saved'
            ? 100
            : 0;
  const showConfidence = hasConfidence || !!match.ocrDebug || !!match.ocrState;
  const meterPercent = hasConfidence ? confidence : fallbackProgress;
  const bundledCount = countImages(match.artifacts || []);
  const tone = getSemanticStatusTone(qs.key);
  const statusMeta = getStatusMeta(qs.key);
  const displayTone = qs.key === 'Resolved' ? 'neutral' : tone;
  const consistencyChips = getTelemetryConsistencyWarningChips(match);
  const statusIcon = (() => {
    switch (statusMeta.icon) {
      case 'scan':
        return <ScanEye size={11} />;
      case 'alert':
        return <AlertTriangle size={11} />;
      case 'check':
        return <CheckCircle2 size={11} />;
      case 'x':
        return <AlertCircle size={11} />;
      case 'spark':
        return <ShieldAlert size={11} />;
      default:
        return <Clock3 size={11} />;
    }
  })();

  const collapsedGlyph = getCollapsedQueueGlyph(match);
  const collapsedIcon = (() => {
    if (collapsedGlyph === 'win') return <Trophy size={12} />;
    if (collapsedGlyph === 'loss') return <Skull size={12} />;
    if (collapsedGlyph === 'draw') return <AlertTriangle size={12} />;
    if (collapsedGlyph === 'saved') return <CheckCircle2 size={12} />;
    if (collapsedGlyph === 'error') return <AlertCircle size={12} />;
    if (collapsedGlyph === 'review') return <ShieldAlert size={12} />;
    return <Clock3 size={12} />;
  })();

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full h-12 rounded-control border transition-colors inline-flex items-center justify-center gap-2 ${isSelected
          ? 'bg-md-sys-primary/14 border-md-sys-primary/38 text-md-sys-on-surface ring-1 ring-md-sys-primary/26 shadow-sm font-bold'
          : 'border-md-sys-outline/20 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/8'
          }`}
        title={`Match ${displayNumber}`}
      >
        <span className={`inline-flex items-center justify-center w-5 h-5 sc-collapsed-glyph sc-collapsed-glyph--${tone}`}>{collapsedIcon}</span>
        <span className="text-label-sm font-black leading-none">{displayNumber}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`group sc-queue-item sc-queue-item--rich w-full text-left rounded-card border-l-[11px] transition-all relative min-h-[102px] overflow-hidden ${isSelected
        ? 'bg-md-sys-primary/14 text-md-sys-on-surface border-l-md-sys-primary border border-md-sys-primary/34 p-2.5 ring-1 ring-md-sys-primary/24 shadow-sm font-semibold'
        : 'bg-md-sys-surface/40 border-l-md-sys-outline/30 border border-md-sys-outline/10 hover:bg-md-sys-on-surface/8 p-2.5'
        }`}
      style={{ borderLeftColor: isSelected ? 'var(--md-sys-color-primary)' : BORDER_BY_TONE[displayTone] }}
      title={`Match ${displayNumber}`}
    >
      <div className="flex items-start gap-2">
        {onToggleSelect ? (
          <input
            type="checkbox"
            checked={isMultiSelected}
            onChange={() => onToggleSelect()}
            onClick={(e) => e.stopPropagation()}
            style={{ accentColor: 'var(--md-sys-color-primary)' }}
            className={`w-3.5 h-3.5 mt-1 flex-shrink-0 transition-opacity ${isMultiSelected
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto'
              }`}
            title="Select row"
          />
        ) : null}

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className={`text-label-sm font-semibold truncate ${hasIdentity ? 'text-md-sys-on-surface/74' : 'text-md-sys-on-surface/44'}`}>
                <span className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/48">Match {displayNumber}</span>
                <span className="mx-1.5 text-md-sys-on-surface/50">{timestampLabel}</span>
                <span className={hasIdentity ? '' : 'italic'}>{identityLabel}</span>
              </div>
            </div>
            <span className={`text-label-xs px-1.5 py-0.5 rounded-pill font-bold sc-status-chip sc-status-chip--${displayTone} inline-flex items-center gap-1`} title={statusMeta.description}>
              {statusIcon}
              {statusMeta.label}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-label-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <OutcomePill result={match.result} />
              {hasArtifacts ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-md-sys-on-surface/6 text-md-sys-on-surface/60">
                  <ScanEye size={10} />
                  {bundledCount} bundled
                </span>
              ) : null}
            </div>
            <div className="inline-flex items-center gap-1.5 shrink-0">
              {hasConfidence ? (
                <ConfidenceBadge percent={confidence} />
              ) : null}
            </div>
          </div>

          {showConfidence ? (
            <ConfidenceMeter percent={meterPercent} className="h-1.5" />
          ) : null}
          {consistencyChips.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {consistencyChips.slice(0, 2).map((chip) => (
                chip.key === 'duration-mismatch' ? (
                  <span
                    key={chip.key}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-pill bg-warning-soft text-warning"
                    title={chip.description}
                    role="img"
                    aria-label="Duration mismatch"
                  >
                    <AlertTriangle size={11} />
                  </span>
                ) : (
                  <span
                    key={chip.key}
                    className="inline-flex items-center px-1.5 py-0.5 rounded-pill bg-warning-soft text-warning text-label-xs font-semibold"
                    title={chip.description}
                  >
                    {chip.label}
                  </span>
                )
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
};

export default QueueItemRichPreview;
