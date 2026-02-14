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
  return (
    <div className={`w-full h-1.5 rounded-pill bg-md-sys-on-surface/10 ${className}`.trim()} role="img" aria-label={`Confidence ${Math.round(clamped)} percent`}>
      <div
        className={`h-full rounded-pill transition-all duration-300 ${BAR_CLASS[spec]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};

export default ConfidenceMeter;

