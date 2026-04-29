import React from 'react';
import type { MatchResult } from '../../../types';

interface OutcomePillProps {
  result: MatchResult;
  label?: string;
  className?: string;
  compact?: boolean;
}

const STYLE_BY_RESULT: Record<MatchResult, React.CSSProperties> = {
  Win: {
    color: 'var(--color-win)',
  },
  Loss: {
    color: 'var(--color-loss)',
  },
  Draw: {
    color: 'var(--color-on-draw)',
  },
  Ongoing: {
    color: 'var(--md-sys-color-info)',
  },
  Saved: {
    color: 'var(--md-sys-color-on-surface-variant)',
  },
};

export const OutcomePill: React.FC<OutcomePillProps> = ({
  result,
  label,
  className = '',
  compact = false,
}) => {
  return (
    <span
      className={`inline-flex items-center leading-none ${compact ? 'text-[10px] font-black' : 'text-label-sm font-bold'} ${className}`.trim()}
      style={STYLE_BY_RESULT[result]}
    >
      {label || result}
    </span>
  );
};

export default OutcomePill;

