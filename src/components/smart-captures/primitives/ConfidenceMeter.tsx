import React from 'react';
import { classifySpecConfidence } from '../smartCaptureUtils';

interface ConfidenceMeterProps {
  percent: number;
  className?: string;
}

const BAR_CLASS: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({ percent, className = '' }) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const spec = classifySpecConfidence(clamped);
  const visibleWidth = clamped > 0 ? Math.max(6, clamped) : 0;
  return (
    <div
      className={`w-full h-2.5 rounded-pill border border-md-sys-on-surface/12 bg-md-sys-on-surface/10 ${className}`.trim()}
      role="img"
      aria-label={`Confidence ${Math.round(clamped)} percent`}
    >
      <div
        className={`h-full rounded-pill transition-all duration-300 ${BAR_CLASS[spec]}`}
        style={{ width: `${visibleWidth}%` }}
      />
    </div>
  );
};

export default ConfidenceMeter;

