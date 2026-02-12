import React, { useState, useMemo } from 'react';
import { Match, PIE_COLORS, VisualMode } from '../../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, AreaChart, Area } from 'recharts';
import { Rocket, User, BarChart3, TrendingUp } from 'lucide-react';
import { synthesizeNarrative } from '../../utils/analyticsEditorial';

const getColor = (name: string) => {
    if (!name) return PIE_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return PIE_COLORS[Math.abs(hash % PIE_COLORS.length)];
};

interface ProViewProps { matches: Match[]; visualMode: VisualMode; }

export const ProView: React.FC<ProViewProps> = ({ matches, visualMode }) => {
    const dense = visualMode === 'dense';
    const [proResultType, setProResultType] = useState<'Win' | 'Loss' | 'All'>('All');
    const [proMetric, setProMetric] = useState('ship_usage');

    const winRate = useMemo(() => {
        if (matches.length === 0) return 0;
        const wins = matches.filter(m => m.result === 'Win').length;
        return Math.round((wins / matches.length) * 100);
    }, [matches]);

    const currentStreak = useMemo(() => {
        if (matches.length === 0) return 0;
        const sorted = [...matches].sort((a, b) => b.timestamp - a.timestamp);
        let streak = 0;
        for (const m of sorted) {
            if (m.result === 'Win') streak += 1;
            else break;
        }
        return streak;
    }, [matches]);

    const narrative = useMemo(() => {
        if (dense) return null;
        return synthesizeNarrative({
            matches,
            winRate,
            currentStreak,
            momentum: null,
            sessionSummary: null,
            periodComparison: null,
            timePatterns: null,
            killEfficiency: null,
            socialData: { teammates: [], opponents: [] },
            synergyMatrix: {},
        });
    }, [dense, matches, winRate, currentStreak]);

    const displayMatches = useMemo(() => {
        if (proResultType === 'All') return matches;
        return matches.filter(m => m.result === proResultType);
    }, [matches, proResultType]);

    const shipStats: Record<string, { wins: number, total: number, damage: number, kills: number }> = {};
    const heroStats: Record<string, { wins: number, total: number }> = {};

    displayMatches.forEach(m => {
        const s = (m.ship || 'Unknown').split('(')[0];
        if (!shipStats[s]) shipStats[s] = { wins: 0, total: 0, damage: 0, kills: 0 };
        shipStats[s].total++;
        shipStats[s].damage += (Number(m.damageTaken) || 0);
        shipStats[s].kills += Object.values(m.kills || {}).reduce((a, b) => a + b, 0);
        if (m.result === 'Win') shipStats[s].wins++;

        const h = m.hero || 'Unknown';
        if (!heroStats[h]) heroStats[h] = { wins: 0, total: 0 };
        heroStats[h].total++;
        if (m.result === 'Win') heroStats[h].wins++;
    });

    const shipMetricData = Object.entries(shipStats).map(([name, s]) => {
        let val = s.total;
        if (proMetric === 'win_rate') val = s.wins;
        else if (proMetric === 'avg_damage') val = s.damage;
        else if (proMetric === 'avg_kills') val = s.kills;
        return { name, value: val };
    }).sort((a, b) => b.value - a.value);

    const heroMetricData = Object.entries(heroStats).map(([name, s]) => {
        let val = s.total;
        if (proMetric === 'win_rate') val = s.wins;
        return { name, value: val };
    }).sort((a, b) => b.value - a.value);

    let metricData: any[] = [];
    let metricTitle = "";

    if (proMetric === 'win_rate') {
        metricTitle = "Ship Win Rates (%)";
        metricData = Object.entries(shipStats).map(([name, s]) => ({ name, value: Math.round((s.wins / s.total) * 100) })).sort((a, b) => b.value - a.value);
    } else if (proMetric === 'avg_damage') {
        metricTitle = "Avg Damage Taken";
        metricData = Object.entries(shipStats).map(([name, s]) => ({ name, value: Math.round(s.damage / s.total) })).sort((a, b) => b.value - a.value);
    } else if (proMetric === 'avg_kills') {
        metricTitle = "Avg Kills per Match";
        metricData = Object.entries(shipStats).map(([name, s]) => ({ name, value: parseFloat((s.kills / s.total).toFixed(1)) })).sort((a, b) => b.value - a.value);
    } else {
        metricTitle = "Ship Usage";
        metricData = shipMetricData;
    }

    const timelineData = matches.map((m, i) => {
        const window = matches.slice(0, i + 1);
        let val = 0;
        if (proMetric === 'win_rate') val = Math.round((window.filter(x => x.result === 'Win').length / window.length) * 100);
        else if (proMetric === 'avg_damage') val = Math.round(window.reduce((acc, x) => acc + (x.damageTaken || 0), 0) / window.length);
        else if (proMetric === 'avg_kills') val = parseFloat((window.reduce((acc, x) => acc + Object.values(x.kills || {}).reduce((a, b) => a + b, 0), 0) / window.length).toFixed(1));
        else val = window.length;
        return { name: new Date(m.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: val };
    });

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            <div className="md3-card flex flex-wrap justify-between items-center p-3 rounded-2xl sticky top-0 z-20">
                <div className="flex gap-2">
                    {['All', 'Win', 'Loss'].map(type => (
                        <button key={type} onClick={() => setProResultType(type as any)}
                            className={`md3-chip px-3 py-1.5 text-label-sm font-black uppercase transition-all ${proResultType === type ? 'md3-chip--selected' : 'hover:bg-md-sys-on-surface/5'}`}>{type}</button>
                    ))}
                </div>
                <div className="flex gap-2 items-center">
                    <span className="text-label-sm font-bold opacity-60 uppercase mr-2">Metric:</span>
                    <select value={proMetric} onChange={(e) => setProMetric(e.target.value)}
                        className="md3-textfield--outlined px-3 py-1.5 text-label-sm font-black uppercase outline-none cursor-pointer border-transparent">
                        <option value="win_rate">Win Rate</option>
                        <option value="avg_damage">Avg Damage</option>
                        <option value="avg_kills">Avg Kills</option>
                        <option value="ship_usage">Usage</option>
                    </select>
                </div>
            </div>

            {/* Editorial Summary */}
            {!dense && narrative && (
                <div className="md3-card rounded-2xl p-6 overflow-hidden">
                    <div className="text-label-sm uppercase tracking-[0.22em] font-black opacity-40 mb-2">
                        Detailed Narrative
                    </div>
                    <h2 className="text-xl md:text-2xl font-black tracking-tight leading-snug text-md-sys-on-surface">
                        {narrative.headline}
                    </h2>
                    <div className="mt-4 space-y-4 text-body leading-relaxed text-md-sys-on-surface/60">
                        {narrative.sections.map((s) => (
                            <div key={s.id} className="pb-4 border-b border-md-sys-outlineVariant/25 last:border-b-0 last:pb-0">
                                <div className="text-label-sm font-black uppercase tracking-[0.18em] text-md-sys-on-surface/60">{s.title}</div>
                                <p className="mt-1">{s.body}</p>
                                {s.metrics && s.metrics.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {s.metrics.map((m, i) => (
                                            <div key={i} className="md3-surface-high px-3 py-1.5 rounded-lg text-label-sm font-bold">
                                                <span className="opacity-60 uppercase mr-1">{m.label}</span>
                                                <span className="font-black">{m.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <div className={`md3-card rounded-2xl flex flex-col ${dense ? 'p-6 min-h-[300px]' : 'p-8 min-h-[400px]'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-body' : 'text-base'}`}><Rocket size={16} /> Ship Distribution</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={shipMetricData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="50%" paddingAngle={2}>
                            {shipMetricData.map((entry, index) => <Cell key={`cell-${index}`} fill={getColor(entry.name)} stroke="var(--md-sys-color-surface2)" strokeWidth={2} />)}
                        </Pie><Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} /><Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} /></PieChart>
                    </ResponsiveContainer>
                </div>
                <div className={`md3-card rounded-2xl flex flex-col ${dense ? 'p-6 min-h-[300px]' : 'p-8 min-h-[400px]'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-body' : 'text-base'}`}><User size={16} /> Hero Distribution</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={heroMetricData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="50%" paddingAngle={2}>
                            {heroMetricData.map((entry, index) => <Cell key={`cell-${index}`} fill={getColor(entry.name)} stroke="var(--md-sys-color-surface2)" strokeWidth={2} />)}
                        </Pie><Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} /><Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} /></PieChart>
                    </ResponsiveContainer>
                </div>
                <div className={`md3-card rounded-2xl flex flex-col ${dense ? 'p-6 min-h-[300px]' : 'p-8 min-h-[400px]'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-body' : 'text-base'}`}><BarChart3 size={16} /> {metricTitle}</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metricData} layout="vertical" margin={{ left: 20 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 9, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface-variant)' }} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: 'var(--md-sys-color-surface3)', opacity: 0.4 }} contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>{metricData.map((entry, index) => <Cell key={`cell-${index}`} fill={getColor(entry.name)} />)}<LabelList dataKey="value" position="right" style={{ fontSize: 9, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface)' }} /></Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className={`md3-card rounded-2xl flex flex-col ${dense ? 'p-6 min-h-[300px]' : 'p-8 min-h-[400px]'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-body' : 'text-base'}`}><TrendingUp size={16} /> {metricTitle} Trend</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={timelineData}>
                            <defs><linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--md-sys-color-primary)" stopOpacity={0} /></linearGradient></defs>
                            <CartesianGrid strokeOpacity={0.05} vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--md-sys-color-on-surface-variant)' }} hide={timelineData.length > 10} interval="preserveStartEnd" minTickGap={18} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9 }} width={28} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} />
                            <Area type="monotone" dataKey="value" name={metricTitle} stroke="var(--md-sys-color-primary)" strokeWidth={3} fill="url(#colorTrend)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};




