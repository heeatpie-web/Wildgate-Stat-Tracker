import React from 'react';
import { formatDualConfidence } from '../smartCaptureUtils';

interface ConfidenceBadgeProps {
  percent: number;
  className?: string;
}

const SPEC_CLASS: Record<string, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const PRACTICAL_LABEL: Record<string, string> = {
  good: 'Good',
  caution: 'Caution',
  bad: 'Bad',
};

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ percent, className = '' }) => {
  const dual = formatDualConfidence(percent);
  return (
    <div className={`inline-flex items-center gap-1 text-label-xs ${className}`.trim()} aria-label={dual.label}>
      <span className={`font-bold ${SPEC_CLASS[dual.spec]}`}>{dual.percent}%</span>
      <span className="text-md-sys-on-surface/60">Spec: {dual.spec}</span>
      <span className="text-md-sys-on-surface/60">Practical: {PRACTICAL_LABEL[dual.practical]}</span>
    </div>
  );
};

export default ConfidenceBadge;

