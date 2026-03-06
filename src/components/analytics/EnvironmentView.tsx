import React from 'react';
import { Match, PIE_COLORS, VisualMode, DrillDownTarget } from '../../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts';
import { Zap, Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { generateEnvironmentEditorial } from '../../utils/analyticsEditorial';

const getColor = (name: string) => {
    if (!name) return PIE_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return PIE_COLORS[Math.abs(hash % PIE_COLORS.length)];
};

interface EnvironmentViewProps {
    matches: Match[];
    visualMode: VisualMode;
    onDrillDown?: (name: string, type: DrillDownTarget['type']) => void;
}

export const EnvironmentView: React.FC<EnvironmentViewProps> = ({ matches, visualMode, onDrillDown }) => {
    const dense = visualMode === 'dense';
    const stats: Record<string, { wins: number, total: number }> = {};
    matches.forEach(m => {
        (m.reachModifiers || []).forEach(mod => {
            if (!stats[mod]) stats[mod] = { wins: 0, total: 0 };
            stats[mod].total++;
            if (m.result === 'Win') stats[mod].wins++;
        });
    });

    const overallWR = matches.length > 0 ? Math.round((matches.filter(m => m.result === 'Win').length / matches.length) * 100) : 0;

    const data = Object.entries(stats).map(([name, s]) => ({
        name, total: s.total, winRate: Math.round((s.wins / s.total) * 100),
        wins: s.wins, losses: s.total - s.wins,
        impact: Math.round((s.wins / s.total) * 100) - overallWR
    })).sort((a, b) => b.total - a.total);

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Editorial Summary */}
            {!dense && (
                <div className="md3-card rounded-2xl p-6">
                    <p className="text-body leading-relaxed opacity-60">{generateEnvironmentEditorial(matches)}</p>
                </div>
            )}

            {/* Impact Score Cards */}
            {data.length > 0 && (
                <div className={`grid gap-2 ${dense ? 'grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 md:grid-cols-3'}`}>
                    {data.slice(0, 6).map(d => (
                        <button
                            key={d.name}
                            type="button"
                            onClick={() => onDrillDown?.(d.name, 'Modifier')}
                            className={`md3-card rounded-xl ${dense ? 'p-2' : 'p-3'} text-center transition-all ${onDrillDown ? 'hover:border-md-sys-primary/25 hover:bg-md-sys-surface-container-highest' : ''}`}
                        >
                            <div className="text-label-xs font-black uppercase opacity-40 truncate mb-1">{d.name}</div>
                            <div className={`text-body font-black flex items-center justify-center gap-1 ${d.impact >= 0 ? 'text-md-sys-primary' : 'text-md-sys-on-surface/60'}`}>
                                {d.impact >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {d.impact >= 0 ? '+' : ''}{d.impact}%
                            </div>
                            <div className="text-label-xs opacity-40 font-bold">vs avg WR</div>
                        </button>
                    ))}
                </div>
            )}

            <div className={`grid gap-4 ${dense ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                <div className={`md3-card rounded-2xl flex flex-col ${dense ? 'p-6 min-h-300px' : 'p-8 min-h-400px'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-body' : 'text-base'}`}><Zap size={16} /> Hazard Frequency</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={data} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="50%" paddingAngle={2}>
                            {data.map((entry, index) => <Cell key={`cell-${index}`} fill={getColor(entry.name)} stroke="var(--md-sys-color-surface2)" strokeWidth={2} />)}
                        </Pie><Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} /><Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} /></PieChart>
                    </ResponsiveContainer>
                </div>
                <div className={`md3-card rounded-2xl flex flex-col ${dense ? 'p-6 min-h-300px' : 'p-8 min-h-400px'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-body' : 'text-base'}`}><Trophy size={16} /> Win Rate by Hazard</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ left: 30, right: 16 }}>
                            <XAxis type="number" hide domain={[0, 100]} />
                            <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 9, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface-variant)' }} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: 'var(--md-sys-color-surface3)', opacity: 0.4 }} contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} />
                            <Bar dataKey="winRate" name="Win Rate %" radius={[0, 4, 4, 0]}>
                                {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.winRate >= 50 ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-variant)'} />))}
                                <LabelList dataKey="winRate" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 9, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface)' }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {/* Stacked Win/Loss Breakdown */}
                <div className={`md3-card rounded-2xl flex flex-col ${dense ? 'p-6 min-h-300px' : 'p-8 min-h-400px'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-body' : 'text-base'}`}><Trophy size={16} /> Win/Loss Breakdown</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ left: 30, right: 16 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 9, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface-variant)' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} />
                            <Bar dataKey="wins" name="Wins" stackId="wl" fill="var(--md-sys-color-primary)" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="losses" name="Losses" stackId="wl" fill="var(--md-sys-color-surface-variant)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {data.length > 0 && (
                <div className="md3-card rounded-2xl p-4 md:p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-body font-black uppercase opacity-60">Hazard Explorer</h3>
                            <div className="text-label-sm text-md-sys-on-surface/55">Open a modifier to see who it pairs well with, which loadouts spike or dip, and whether it is helping or hurting your results.</div>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {data.slice(0, 8).map((row) => (
                            <button
                                key={`hazard-row-${row.name}`}
                                type="button"
                                onClick={() => onDrillDown?.(row.name, 'Modifier')}
                                className={`flex items-center justify-between gap-3 rounded-control border border-md-sys-outline/10 px-3 py-2 text-left ${onDrillDown ? 'hover:bg-md-sys-surface-container-high' : ''}`}
                            >
                                <div className="min-w-0">
                                    <div className="text-label-sm font-bold text-md-sys-on-surface truncate">{row.name}</div>
                                    <div className="text-label-xs text-md-sys-on-surface/55">{row.total} matches</div>
                                </div>
                                <div className="shrink-0 text-right">
                                    <div className={`text-label-sm font-black ${row.winRate >= overallWR ? 'text-md-sys-primary' : 'text-danger'}`}>{row.winRate}%</div>
                                    <div className="text-label-xs text-md-sys-on-surface/45">{row.impact > 0 ? '+' : ''}{row.impact}pp</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};





