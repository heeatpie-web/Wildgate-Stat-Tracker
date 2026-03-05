import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
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

const STATUS_PILL_BY_TONE: Record<'success' | 'warning' | 'danger' | 'info' | 'neutral', string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-md-sys-outline/20 text-md-sys-on-surface/70',
};

const ROW_TONE_BY_RESULT: Record<Match['result'], string> = {
  Win: 'border-md-sys-outline/10',
  Loss: 'border-md-sys-outline/10',
  Draw: 'border-md-sys-outline/10',
  Ongoing: 'border-md-sys-outline/10',
};

const SELECTED_ROW_TONE_BY_RESULT: Record<Match['result'], string> = {
  Win: 'bg-md-sys-on-surface/8 border-success/30 ring-success/12',
  Loss: 'bg-md-sys-on-surface/8 border-danger/30 ring-danger/12',
  Draw: 'bg-md-sys-on-surface/8 border-info/30 ring-info/12',
  Ongoing: 'bg-md-sys-on-surface/8 border-md-sys-primary/20 ring-md-sys-primary/12',
};

const SELECTED_BORDER_BY_RESULT: Record<Match['result'], string> = {
  Win: 'var(--md-sys-color-success)',
  Loss: 'var(--md-sys-color-danger)',
  Draw: 'var(--md-sys-color-info)',
  Ongoing: 'var(--md-sys-color-primary)',
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
  const resultClass = match.result === 'Win'
    ? 'sc-queue-item--result-win'
    : match.result === 'Loss'
      ? 'sc-queue-item--result-loss'
      : match.result === 'Draw'
        ? 'sc-queue-item--result-draw'
        : 'sc-queue-item--result-ongoing';

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
      className={`group sc-queue-item sc-queue-item--rich ${resultClass} w-full text-left rounded-r-card border-l-[11px] transition-all relative min-h-[64px] overflow-visible ${isSelected
        ? `text-md-sys-on-surface border p-3 ring-1 shadow-sm font-semibold ${SELECTED_ROW_TONE_BY_RESULT[match.result]}`
        : `border border-l-md-sys-outline/30 hover:bg-md-sys-on-surface/8 p-3 ${ROW_TONE_BY_RESULT[match.result]}`
        }`}
      style={{ borderLeftColor: SELECTED_BORDER_BY_RESULT[match.result] }}
      title={tooltipLabel}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`sc-queue-item__title text-label-md font-black ${isSelected ? '' : 'opacity-65'}`}>#{displayNumber}</span>
              <span className="text-label-sm font-bold truncate">
                {match.ship || 'Unknown'} <span className="opacity-40 font-normal">|</span> {match.hero || 'Unknown'}
              </span>
            </div>
            <span className={`text-label-xs font-semibold truncate whitespace-nowrap ml-2 ${isSelected ? 'opacity-80' : 'text-md-sys-on-surface/60'}`}>{timestampLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <OutcomePill result={match.result} />
            <span
              aria-label={`Status ${statusMeta.label}`}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL_BY_TONE[statusMeta.tone]}`}
            >
              {statusMeta.label}
            </span>
          </div>
        </div>

        {onToggleSelect ? (
          <span
            role="checkbox"
            aria-checked={isMultiSelected}
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onToggleSelect();
              }
            }}
            aria-label={isMultiSelected ? 'Deselect match' : 'Select match'}
            title={isMultiSelected ? 'Deselect match' : 'Select match'}
            className={`mt-0.5 h-7 w-7 rounded-md border inline-flex items-center justify-center shrink-0 transition-all ${isMultiSelected
              ? 'opacity-100 border-md-sys-primary/55 bg-md-sys-primary/14 text-md-sys-primary'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto border-md-sys-outline/30 text-md-sys-on-surface/60 hover:text-md-sys-primary hover:border-md-sys-primary/45'
              }`}
          >
            {isMultiSelected ? <Check size={12} /> : null}
          </span>
        ) : null}
      </div>
    </button>
  );
};

export default QueueItemRichPreview;
