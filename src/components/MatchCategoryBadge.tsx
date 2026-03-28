import React from 'react';
import { Tag } from 'lucide-react';
import { normalizeMatchCategory } from '../utils/matchCategory';

interface MatchCategoryBadgeProps {
  category?: string | null;
  compact?: boolean;
  className?: string;
}

export const MatchCategoryBadge: React.FC<MatchCategoryBadgeProps> = ({
  category,
  compact = false,
  className = '',
}) => {
  const normalizedCategory = normalizeMatchCategory(category);
  if (!normalizedCategory) return null;

  return (
    <span
      title={`Category: ${normalizedCategory}`}
      className={`inline-flex items-center gap-1 rounded-pill border border-md-sys-primary/18 bg-md-sys-primary/10 text-md-sys-primary ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-label-xs'} font-semibold ${className}`.trim()}
    >
      <Tag size={compact ? 10 : 11} />
      <span className={`${compact ? 'max-w-[64px]' : 'max-w-[180px]'} truncate`}>{normalizedCategory}</span>
    </span>
  );
};

export default MatchCategoryBadge;
