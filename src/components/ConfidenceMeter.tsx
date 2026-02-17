import React from 'react';

interface ConfidenceMeterProps {
  confidence: number;
  size?: 'sm' | 'md';
}

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({ confidence, size = 'md' }) => {
  const percent = clampPercent(confidence);
  const colorClass = percent >= 80
    ? 'bg-success'
    : percent >= 40
      ? 'bg-warning'
      : 'bg-danger';
  const trackHeight = size === 'sm' ? 'h-1.5' : 'h-2';
  const labelClass = size === 'sm' ? 'text-label-xs' : 'text-label-sm';

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className={`flex-1 rounded-full overflow-hidden bg-md-sys-surface-container-highest ${trackHeight}`}
        role="progressbar"
        aria-label={`OCR confidence ${percent}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={`${colorClass} h-full rounded-full`} style={{ width: `${percent}%` }} />
      </div>
      <span className={`font-mono ${labelClass}`}>{percent}%</span>
    </div>
  );
};

export default ConfidenceMeter;
