import React from 'react';
import type { MatchResult } from '../../../types';

interface OutcomePillProps {
  result: MatchResult;
  className?: string;
}

const STYLE_BY_RESULT: Record<MatchResult, React.CSSProperties> = {
  Win: {
    color: 'var(--color-win)',
    background: 'color-mix(in srgb, var(--color-win), transparent 80%)',
    borderColor: 'color-mix(in srgb, var(--color-win), transparent 60%)',
  },
  Loss: {
    color: 'var(--color-loss)',
    background: 'color-mix(in srgb, var(--color-loss), transparent 80%)',
    borderColor: 'color-mix(in srgb, var(--color-loss), transparent 60%)',
  },
  Draw: {
    color: 'var(--color-on-draw)',
    background: 'color-mix(in srgb, var(--color-draw), transparent 35%)',
    borderColor: 'color-mix(in srgb, var(--color-draw), transparent 20%)',
  },
};

export const OutcomePill: React.FC<OutcomePillProps> = ({ result, className = '' }) => {
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-label-xs font-bold uppercase tracking-wide ${className}`.trim()}
      style={STYLE_BY_RESULT[result]}
    >
      {result}
    </span>
  );
};

export default OutcomePill;

