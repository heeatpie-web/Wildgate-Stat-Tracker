import React from 'react';
import { TrendingUp } from 'lucide-react';
import { AnalyticsCard } from '@/components/analytics/AnalyticsCard';

export const Editorial = () => (
  <div style={{ width: 320 }}>
    <AnalyticsCard title="Win Rate" icon={<TrendingUp size={14} />} visualMode="editorial">
      <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>62%</p>
      <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>Last 20 matches</p>
    </AnalyticsCard>
  </div>
);

export const Dense = () => (
  <div style={{ width: 260 }}>
    <AnalyticsCard title="Avg Kills" icon={<TrendingUp size={14} />} visualMode="dense" variant="solid">
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>4.3</p>
    </AnalyticsCard>
  </div>
);

export const Pinned = () => (
  <div style={{ width: 260 }}>
    <AnalyticsCard
      title="Placement"
      icon={<TrendingUp size={14} />}
      visualMode="editorial"
      pinId="placement"
      isPinned
      onTogglePin={() => {}}
    >
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Top 3 in 8/20</p>
    </AnalyticsCard>
  </div>
);
