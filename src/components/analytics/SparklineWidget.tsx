import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface SparklineWidgetProps {
  data: { value: number }[];
  color?: string;
  height?: number;
}

export const SparklineWidget: React.FC<SparklineWidgetProps> = ({
  data,
  color = 'var(--color-success)',
  height = 32,
}) => {
  if (data.length < 2) return null;

  const gradientId = `spark-${color.replace(/\W/g, '')}`;

  return (
    <div className="animate-in fade-in transition-all duration-500" style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotoneX"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={true}
            animationDuration={1500}
            animationEasing="ease-in-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
