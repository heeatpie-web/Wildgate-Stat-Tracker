import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Crosshair,
  LogIn,
  ShieldAlert,
  Swords,
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
import { MatchCategoryBadge } from '../MatchCategoryBadge';

interface QueueItemRichPreviewProps {
  match: Match;
  displayNumber: number;
  rawMatchId?: number;
  compact?: boolean;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isDropTarget?: boolean;
  onClick: () => void;
  onToggleSelect?: () => void;
  onDragOver?: React.DragEventHandler<HTMLButtonElement>;
  onDragLeave?: React.DragEventHandler<HTMLButtonElement>;
  onDrop?: React.DragEventHandler<HTMLButtonElement>;
}

const STATUS_PILL_BY_TONE: Record<'success' | 'warning' | 'danger' | 'info' | 'neutral', string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-md-sys-outline/20 text-md-sys-on-surface/70',
};

const ROW_TONE_BY_RESULT: Record<Match['result'], string> = {
  Win: 'border-b-md-sys-outline/8',
  Loss: 'border-b-md-sys-outline/8',
  Draw: 'border-b-md-sys-outline/8',
  Ongoing: 'border-b-md-sys-outline/8',
  Saved: 'border-b-md-sys-outline/8',
};

const SELECTED_ROW_TONE_BY_RESULT: Record<Match['result'], string> = {
  Win: 'bg-md-sys-primary/10 border-b-md-sys-outline/10',
  Loss: 'bg-md-sys-primary/10 border-b-md-sys-outline/10',
  Draw: 'bg-md-sys-primary/10 border-b-md-sys-outline/10',
  Ongoing: 'bg-md-sys-primary/10 border-b-md-sys-outline/10',
  Saved: 'bg-md-sys-primary/10 border-b-md-sys-outline/10',
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

const getCompactStatusLabel = (label: string): string => {
  const normalized = label.toLowerCase();
  if (normalized.includes('review')) return 'REV';
  if (normalized.includes('ocr')) return 'OCR';
  if (normalized.includes('missing')) return 'MISS';
  if (normalized.includes('error')) return 'ERR';
  if (normalized.includes('save')) return 'SAVE';
  if (normalized.includes('resolved') || normalized.includes('saved')) return 'DONE';
  if (normalized.includes('ready')) return 'OK';
  return label.slice(0, 4).toUpperCase();
};

export const QueueItemRichPreview: React.FC<QueueItemRichPreviewProps> = ({
  match,
  displayNumber,
  compact = false,
  isSelected,
  isMultiSelected = false,
  isDropTarget = false,
  onClick,
  onToggleSelect,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const qs = getQueueStatus(match);
  const statusMeta = getStatusMeta(qs.key);
  const hasPersistedResultCapture = Array.isArray(match.artifacts)
    && match.artifacts.some((artifactPath) => /capture_result/i.test(String(artifactPath || '')));
  const awaitingResultLabel = match.subType === 'Telemetry Draft'
    && match.telemetryDraftState === 'ready'
    && match.result === 'Ongoing'
    ? (hasPersistedResultCapture
      ? (compact ? 'Captured' : 'Result Captured')
      : (compact ? 'Awaiting' : 'Awaiting Result'))
    : undefined;
  const when = new Date(match.timestamp);
  const timestampLabel = formatQueueTimestamp(when);
  const tooltipLabel = `Match ${displayNumber} - ${timestampLabel}. ${statusMeta.label}: ${statusMeta.description}`;
  const tone = getSemanticStatusTone(qs.key);
  const resultClass = match.result === 'Win'
    ? 'sc-queue-item--result-win'
    : match.result === 'Loss'
      ? 'sc-queue-item--result-loss'
      : match.result === 'Draw'
        ? 'sc-queue-item--result-draw'
        : 'sc-queue-item--result-ongoing';
  const dropTargetClass = isDropTarget ? 'ring-2 ring-md-sys-primary/55 bg-md-sys-primary/12' : '';

  const collapsedGlyph = getCollapsedQueueGlyph(match);
  const practiceRangeIndicator = match.isPracticeRange === true ? (
    <span
      aria-label="Practice Range"
      title="Practice Range"
      className="inline-flex items-center justify-center rounded-full border border-info/25 bg-info/10 text-info/80"
    >
      <Crosshair size={11} />
    </span>
  ) : null;
  const backfillIndicator = match.isBackfill === true ? (
    <span
      aria-label="Backfill — joined mid-match, pregame skipped"
      title="Backfill — joined mid-match, pregame skipped"
      className="inline-flex items-center justify-center rounded-full border border-warning/25 bg-warning/10 text-warning/80"
    >
      <LogIn size={11} />
    </span>
  ) : null;
  const customLobbyIndicator = match.matchMode === 'customlobby' ? (
    <span
      aria-label="Custom Lobby"
      title="Custom Lobby"
      className="inline-flex items-center justify-center rounded-full border border-md-sys-tertiary/25 bg-md-sys-tertiary/10 text-md-sys-tertiary/80"
    >
      <Swords size={10} />
    </span>
  ) : null;
  const collapsedIcon = (() => {
    if (collapsedGlyph === 'win') return <Trophy size={14} />;
    if (collapsedGlyph === 'loss') return <Skull size={14} />;
    if (collapsedGlyph === 'draw') return <AlertTriangle size={14} />;
    if (collapsedGlyph === 'saved') return <CheckCircle2 size={14} />;
    if (collapsedGlyph === 'error') return <AlertCircle size={14} />;
    if (collapsedGlyph === 'review') return <ShieldAlert size={14} />;
    return <Clock3 size={14} />;
  })();
  const categoryBadge = <MatchCategoryBadge category={match.matchCategory} compact />;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`w-full min-h-[70px] rounded-xl border transition-colors flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 ${dropTargetClass} ${isSelected
          ? 'bg-md-sys-surface-container-high border-md-sys-primary/26 text-md-sys-on-surface shadow-sm font-bold'
          : 'bg-md-sys-surface-container-low/80 border-md-sys-outline/14 text-md-sys-on-surface/68 hover:bg-md-sys-surface-container hover:border-md-sys-primary/18'
          }`}
        title={tooltipLabel}
      >
        <div className="flex items-center justify-center gap-1.5">
          <span className={`inline-flex items-center justify-center w-7 h-7 sc-collapsed-glyph sc-collapsed-glyph--${tone}`}>{collapsedIcon}</span>
          <span className="text-label-sm font-black leading-none">#{displayNumber}</span>
        </div>
        <div className="flex items-center justify-center gap-1">
          <OutcomePill result={match.result} label={awaitingResultLabel} compact />
          <span className={`rounded-pill px-1.5 py-0.5 text-[10px] font-black tracking-wider ${STATUS_PILL_BY_TONE[statusMeta.tone]}`}>
            {getCompactStatusLabel(statusMeta.label)}
          </span>
          {practiceRangeIndicator ? <span className="h-4 w-4">{practiceRangeIndicator}</span> : null}
          {customLobbyIndicator ? <span className="h-4 w-4">{customLobbyIndicator}</span> : null}
          {backfillIndicator ? <span className="h-4 w-4">{backfillIndicator}</span> : null}
        </div>
        {match.matchCategory ? categoryBadge : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group sc-queue-item sc-queue-item--rich ${resultClass} w-full text-left border-0 border-b transition-colors relative min-h-[64px] overflow-visible ${dropTargetClass} ${isSelected
        ? `text-md-sys-on-surface font-semibold ${SELECTED_ROW_TONE_BY_RESULT[match.result]}`
        : `hover:bg-md-sys-on-surface/[0.06] ${ROW_TONE_BY_RESULT[match.result]}`
        }`}
      title={tooltipLabel}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[5px] rounded-r-full transition-all ${
          match.result === 'Win'
            ? 'bg-success'
            : match.result === 'Loss'
              ? 'bg-danger'
              : match.result === 'Draw'
                ? 'bg-info'
                : 'bg-md-sys-primary'
        } ${isSelected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}
      />
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5 pl-4 pr-3 py-3">
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`sc-queue-item__title font-black ${isSelected ? '' : 'opacity-70'}`}>#{displayNumber}</span>
              <span className="text-label-sm font-bold truncate">
                {match.ship || 'Unknown'} <span className="opacity-40 font-normal">|</span> {match.hero || 'Unknown'}
              </span>
            </div>
            <span className={`text-label-xs font-semibold truncate whitespace-nowrap ml-2 ${isSelected ? 'opacity-80' : 'text-md-sys-on-surface/60'}`}>{timestampLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <OutcomePill result={match.result} label={awaitingResultLabel} />
            <span
              aria-label={`Status ${statusMeta.label}`}
              title={statusMeta.description}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL_BY_TONE[statusMeta.tone]}`}
            >
              {statusMeta.label}
            </span>
            {practiceRangeIndicator ? <span className="h-5 w-5">{practiceRangeIndicator}</span> : null}
            {customLobbyIndicator ? <span className="h-5 w-5">{customLobbyIndicator}</span> : null}
            {backfillIndicator ? <span className="h-5 w-5">{backfillIndicator}</span> : null}
            {match.matchCategory ? categoryBadge : null}
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
              : 'invisible opacity-0 pointer-events-none group-hover:visible group-hover:opacity-100 group-hover:pointer-events-auto border-md-sys-outline/24 bg-transparent text-md-sys-on-surface/60 hover:text-md-sys-primary hover:border-md-sys-primary/45'
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
