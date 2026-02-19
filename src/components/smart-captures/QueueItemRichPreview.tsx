import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
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
  const heroLabel = match.hero ? match.hero.trim() : '';
  const when = new Date(match.timestamp);
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
        className={`w-full h-11 rounded-control border transition-colors inline-flex items-center justify-center gap-1.5 ${
          isSelected
            ? 'bg-md-sys-primary/12 border-md-sys-primary text-md-sys-primary'
            : 'border-md-sys-outline/20 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/8'
        }`}
        title={`Match ${displayNumber}`}
      >
        <span className={`inline-flex items-center justify-center w-4 h-4 sc-collapsed-glyph sc-collapsed-glyph--${tone}`}>{collapsedIcon}</span>
        <span className="text-label-xs font-bold leading-none">{displayNumber}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`group sc-queue-item w-full text-left rounded-card border-l-4 transition-all relative min-h-[136px] ${
        isSelected
          ? 'bg-md-sys-primary/14 border-l-md-sys-primary border border-md-sys-primary/45 p-3.5 ring-1 ring-md-sys-primary/35 shadow-md'
          : 'border-l-md-sys-outline/30 border border-md-sys-outline/10 hover:bg-md-sys-on-surface/8 p-3.5'
      } ${qs.key === 'Resolved' ? 'opacity-70' : ''}`}
      style={{ borderLeftColor: isSelected ? 'var(--md-sys-color-primary)' : BORDER_BY_TONE[tone] }}
      title={`Match ${displayNumber}`}
    >
      {isSelected ? (
        <span className="absolute right-2 top-2 rounded-pill bg-md-sys-primary text-md-sys-onPrimary px-1.5 py-0.5 text-label-xs font-bold uppercase tracking-wide">
          Selected
        </span>
      ) : null}
      <div className="flex items-start gap-2.5">
        {onToggleSelect ? (
          <input
            type="checkbox"
            checked={isMultiSelected}
            onChange={() => onToggleSelect()}
            onClick={(e) => e.stopPropagation()}
            style={{ accentColor: 'var(--md-sys-color-primary)' }}
            className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 transition-opacity ${
              isMultiSelected
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto'
            }`}
            title="Select row"
          />
        ) : null}

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 space-y-0.5">
              <div className="text-body font-bold text-md-sys-on-surface truncate">{displayNumber}</div>
              <div className={`text-label-sm truncate ${match.ship ? 'text-md-sys-on-surface/68' : 'text-md-sys-on-surface/40 italic'}`}>
                {shipLabel}
              </div>
              <div className="text-label-sm text-md-sys-on-surface/60 truncate">
                {when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} | {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {heroLabel ? ` | ${heroLabel}` : ''}
              </div>
            </div>
            <span className={`text-label-xs px-2 py-0.5 rounded-pill font-bold sc-status-chip sc-status-chip--${tone} inline-flex items-center gap-1`} title={statusMeta.description}>
              {statusIcon}
              {statusMeta.label}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <OutcomePill result={match.result} />
            <div className="flex items-center gap-2 text-label-xs text-md-sys-on-surface/60">
              {hasArtifacts ? <span className="inline-flex items-center gap-1"><ScanEye size={10} /> {bundledCount} bundled</span> : null}
              {qs.key === 'Resolved' ? <Check size={12} className="text-success/80" /> : <ChevronRight size={12} className="text-md-sys-on-surface/40" />}
            </div>
          </div>

          {showConfidence ? (
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between gap-2 text-label-xs">
                <span className="text-md-sys-on-surface/60">OCR Confidence</span>
                {hasConfidence ? (
                  <ConfidenceBadge percent={confidence} />
                ) : (
                  <span className="text-md-sys-on-surface/55 font-bold uppercase tracking-wide">Pending</span>
                )}
              </div>
              <ConfidenceMeter percent={meterPercent} />
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
};

export default QueueItemRichPreview;
