import React from 'react';
import { ConfidenceBadge } from '../primitives/ConfidenceBadge';
import { ConfidenceMeter } from '../primitives/ConfidenceMeter';

interface OCRFieldRowProps {
  label: string;
  value: React.ReactNode;
  confidence?: number;
  className?: string;
}

export const OCRFieldRow: React.FC<OCRFieldRowProps> = ({ label, value, confidence, className = '' }) => {
  return (
    <div className={`md3-surface rounded-control p-2 space-y-1 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-label-sm font-bold text-md-sys-on-surface/70">{label}</span>
        {typeof confidence === 'number' ? <ConfidenceBadge percent={confidence} /> : null}
      </div>
      <div>{value}</div>
      {typeof confidence === 'number' ? <ConfidenceMeter percent={confidence} /> : null}
    </div>
  );
};

export default OCRFieldRow;

