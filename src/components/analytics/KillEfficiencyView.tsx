import React from 'react';
import { KillEfficiencyData, VisualMode } from '../../types';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { Crosshair, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { generateKillEfficiencyEditorial } from '../../utils/analyticsEditorial';

interface KillEfficiencyViewProps { data: KillEfficiencyData; visualMode: VisualMode; }

const TOOLTIP_STYLE = { backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '12px', border: '1px solid var(--md-sys-color-outline-variant)' };

export const KillEfficiencyView: React.FC<KillEfficiencyViewProps> = ({ data, visualMode }) => {
    const dense = visualMode === 'dense';
    const TrendIcon = data.trendDirection === 'up' ? TrendingUp : data.trendDirection === 'down' ? TrendingDown : Minus;
    const trendColor = data.trendDirection === 'up' ? 'text-success' : data.trendDirection === 'down' ? 'text-danger' : 'opacity-60';
    const barPalette = [
        'var(--md-sys-color-primary)',
        'var(--md-sys-color-info)',
        'var(--md-sys-color-accent)',
        'var(--md-sys-color-warning)',
        'var(--md-sys-color-secondary)',
    ];

    const shipData = Object.entries(data.killsByShipType)
        .map(([name, s]) => ({ name, avgKills: s.avgKills, total: s.total }))
        .sort((a, b) => b.avgKills - a.avgKills);

    const heroData = Object.entries(data.killsByHero)
        .map(([name, s]) => ({ name, avgKills: s.avgKills, total: s.total }))
        .sort((a, b) => b.avgKills - a.avgKills);

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Editorial Summary */}
            {!dense && (
                <div className="md3-card rounded-card p-6">
                    <p className="text-body leading-relaxed opacity-60">{generateKillEfficiencyEditorial(data)}</p>
                </div>
            )}

            {/* KPI Row */}
            <div className={`grid gap-4 ${dense ? 'grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
                <div className={`md3-card rounded-card ${dense ? 'p-4' : 'p-6'}`}>
                    <div className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-1">Overall Avg Kills</div>
                    <div className={`font-black text-warning ${dense ? 'text-3xl' : 'text-4xl'}`}>{data.overallAvgKills}</div>
                    <div className="text-label-xs font-bold opacity-40">Per match</div>
                </div>
                <div className={`md3-card rounded-card ${dense ? 'p-4' : 'p-6'}`}>
                    <div className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-1">Trend</div>
                    <div className={`font-black flex items-center gap-2 ${trendColor} ${dense ? 'text-2xl' : 'text-3xl'}`}>
                        <TrendIcon size={dense ? 20 : 24} />
                        {data.trendDirection === 'up' ? 'Rising' : data.trendDirection === 'down' ? 'Falling' : 'Stable'}
                    </div>
                    <div className="text-label-xs font-bold opacity-40">Last 10 vs previous 10</div>
                </div>
                <div className={`md3-card rounded-card ${dense ? 'p-4' : 'p-6'}`}>
                    <div className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-1">Best Ship</div>
                    <div className={`font-black text-md-sys-primary ${dense ? 'text-xl' : 'text-2xl'} truncate`}>{shipData[0]?.name || '--'}</div>
                    <div className="text-label-xs font-bold opacity-40">{shipData[0]?.avgKills || 0} avg kills</div>
                </div>
            </div>

            {/* Rolling average chart */}
            <div className={`md3-card rounded-card ${dense ? 'p-4' : 'p-6'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-label-sm' : 'text-body'}`}><Crosshair size={14} /> Rolling 10-Match Avg Kills</h3>
                {data.timeline.length < 2 ? (
                    <div className="h-48 flex items-center justify-center opacity-40 font-bold uppercase text-body">Not enough data</div>
                ) : (
                    <ResponsiveContainer width="100%" height={dense ? 200 : 300}>
                        <AreaChart data={data.timeline}>
                            <defs><linearGradient id="killGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-warning)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--color-warning)" stopOpacity={0} /></linearGradient></defs>
                            <CartesianGrid strokeOpacity={0.05} vertical={false} />
                            <XAxis dataKey="index" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={18} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9 }} width={28} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Area type="monotone" dataKey="avgKills" name="Avg Kills" stroke="var(--color-warning)" strokeWidth={2} fill="url(#killGrad)" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Breakdown charts */}
            <div className={`grid gap-4 ${dense ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
                <div className={`md3-card rounded-card ${dense ? 'p-4 min-h-[220px]' : 'p-6 min-h-[260px]'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-label-sm' : 'text-body'}`}>By Ship</h3>
                    <ResponsiveContainer width="100%" height={dense ? 180 : 240}>
                        <BarChart data={shipData} layout="vertical" margin={{ left: 10 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 9, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface-variant)' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="avgKills" name="Avg Kills" radius={[0, 4, 4, 0]}>
                                {shipData.map((entry, index) => (
                                    <Cell key={`ship-bar-${entry.name}`} fill={barPalette[index % barPalette.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className={`md3-card rounded-card ${dense ? 'p-4 min-h-[220px]' : 'p-6 min-h-[260px]'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-label-sm' : 'text-body'}`}>By Hero</h3>
                    <ResponsiveContainer width="100%" height={dense ? 180 : 240}>
                        <BarChart data={heroData} layout="vertical" margin={{ left: 10 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 9, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface-variant)' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="avgKills" name="Avg Kills" radius={[0, 4, 4, 0]}>
                                {heroData.map((entry, index) => (
                                    <Cell key={`hero-bar-${entry.name}`} fill={barPalette[(index + 1) % barPalette.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
