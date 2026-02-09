import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface SparklineWidgetProps {
    data: { value: number }[];
    color?: string;
    height?: number;
}

export const SparklineWidget: React.FC<SparklineWidgetProps> = ({ data, color = '#22c55e', height = 32 }) => {
    if (data.length < 2) return null;
    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color.replace('#', '')})`} dot={false} isAnimationActive={false} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};
