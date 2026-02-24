import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ShieldAlert,
  Skull,
  Trophy,
} from 'lucide-react';
import type { Match } from '../../types';
import {
  getCollapsedQueueGlyph,
  getQueueStatus,
  getSemanticStatusTone,
  getStatusMeta,
} from './smartCaptureUtils';
import { OutcomePill } from './primitives/OutcomePill';

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

const STATUS_PILL_BY_TONE: Record<'success' | 'warning' | 'danger' | 'info' | 'neutral', string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-md-sys-outline/20 text-md-sys-on-surface/70',
};

const ROW_TONE_BY_RESULT: Record<Match['result'], string> = {
  Win: 'bg-success/[0.08] border-success/30',
  Loss: 'bg-danger/[0.08] border-danger/30',
  Draw: 'bg-info/[0.08] border-info/30',
  Ongoing: 'bg-md-sys-on-surface/[0.04] border-md-sys-outline/18',
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
  compact = false,
  isSelected,
  isMultiSelected = false,
  onClick,
  onToggleSelect,
}) => {
  const qs = getQueueStatus(match);
  const statusMeta = getStatusMeta(qs.key);
  const when = new Date(match.timestamp);
  const timestampLabel = formatQueueTimestamp(when);
  const tooltipLabel = `Match ${displayNumber} - ${timestampLabel}`;
  const tone = getSemanticStatusTone(qs.key);
  const displayTone = statusMeta.tone;
  const resultClass = match.result === 'Win'
    ? 'sc-queue-item--result-win'
    : match.result === 'Loss'
      ? 'sc-queue-item--result-loss'
      : match.result === 'Draw'
        ? 'sc-queue-item--result-draw'
        : 'sc-queue-item--result-ongoing';
  const artifactCount = Array.isArray(match.artifacts) ? match.artifacts.length : 0;
  const teammateCount = Array.isArray(match.teammates) ? match.teammates.length : 0;

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
        title={tooltipLabel}
      >
        <span className={`inline-flex items-center justify-center w-5 h-5 sc-collapsed-glyph sc-collapsed-glyph--${tone}`}>{collapsedIcon}</span>
        <span className="text-label-sm font-black leading-none">{displayNumber}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group sc-queue-item sc-queue-item--rich ${resultClass} w-full text-left rounded-card border-l-[11px] transition-all relative min-h-[88px] overflow-visible ${isSelected
        ? 'bg-md-sys-primary/16 text-md-sys-on-surface border-l-md-sys-primary border border-md-sys-primary/38 p-3 ring-1 ring-md-sys-primary/26 shadow-sm font-semibold'
        : `border-l-md-sys-outline/30 border hover:bg-md-sys-on-surface/8 p-3 ${ROW_TONE_BY_RESULT[match.result]}`
        }`}
      style={{ borderLeftColor: isSelected ? 'var(--md-sys-color-primary)' : BORDER_BY_TONE[displayTone] }}
      title={tooltipLabel}
    >
      <div className="flex items-start gap-2.5">
        {onToggleSelect ? (
          <input
            type="checkbox"
            checked={isMultiSelected}
            onChange={() => onToggleSelect()}
            onClick={(e) => e.stopPropagation()}
            style={{ accentColor: 'var(--md-sys-color-primary)' }}
            className={`w-4 h-4 mt-1 flex-shrink-0 transition-opacity ${isMultiSelected
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto'
              }`}
            title="Select row"
          />
        ) : null}

        <div className="flex-1 min-w-0 space-y-2">
          <div className="sc-queue-item__title-wrap">
            <span className="sc-queue-item__title">Match #{displayNumber}</span>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <OutcomePill result={match.result} />
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-label={`Status ${statusMeta.label}`}
                className={`inline-flex items-center px-2.5 py-1 rounded-pill text-label-sm font-semibold ${STATUS_PILL_BY_TONE[statusMeta.tone]}`}
              >
                {statusMeta.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0 text-label-xs text-md-sys-on-surface/58 font-semibold">
            <span className="truncate">{timestampLabel}</span>
            <span aria-hidden="true" className="opacity-45">|</span>
            <span className="truncate">{match.ship || 'Unknown ship'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-label-xs text-md-sys-on-surface/62 font-semibold">
            <span className="inline-flex items-center px-2 py-0.5 rounded-pill bg-md-sys-on-surface/8">
              Shots {artifactCount}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-pill bg-md-sys-on-surface/8">
              Team {teammateCount}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-pill bg-md-sys-on-surface/8">
              OCR {match.ocrState || 'queued'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

export default QueueItemRichPreview;
