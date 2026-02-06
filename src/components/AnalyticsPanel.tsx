import React, { useState, useMemo } from 'react';
import { Match, CHARACTERS, PIE_COLORS, DrillDownTarget, Insight } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, AreaChart, Area } from 'recharts';
import { Flame, Swords, Heart, Skull, Trophy, Lightbulb, Activity, Crown, BarChart3, TrendingUp, Zap, Users, Rocket, User, Handshake, Network, List, Search, Target, Ghost, AlertTriangle } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { RivalryGraph } from './RivalryGraph';
import { TiltMeter } from './TiltMeter';
import { calculateInsights, calculateSocialData, calculateSynergyMatrix, calculateRelationshipAnalytics, RelationshipInsight } from '../utils/analytics';

import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';

interface AnalyticsPanelProps {
    // No props needed
}

const getColor = (name: string) => {
    if (!name) return PIE_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % PIE_COLORS.length);
    return PIE_COLORS[index];
};

const getIconComponent = (type: Insight['iconType']) => {
    switch (type) {
        case 'Rocket': return <Rocket size={20} />;
        case 'Crown': return <Crown size={20} />;
        case 'Flame': return <Flame size={20} />;
        case 'Zap': return <Zap size={20} />;
        case 'Users': return <Users size={20} />;
        case 'User': return <User size={20} />;
        case 'Skull': return <Skull size={20} />;
        case 'Target': return <Target size={20} />;
        case 'Crosshair': return <Swords size={20} />;
        case 'AlertTriangle': return <AlertTriangle size={20} />;
        case 'Ghost': return <Ghost size={20} />;
        default: return <Lightbulb size={20} />;
    }
};

const ProView: React.FC<{ matches: Match[] }> = ({ matches }) => {
    const [proResultType, setProResultType] = useState<'Win' | 'Loss' | 'All'>('All');
    const [proMetric, setProMetric] = useState('ship_usage');

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
        shipStats[s].damage += (m.damageTaken || 0);
        shipStats[s].kills += Object.values(m.kills || {}).reduce((a, b) => a + b, 0);
        if (m.result === 'Win') shipStats[s].wins++;

        const h = m.hero || 'Unknown';
        if (!heroStats[h]) heroStats[h] = { wins: 0, total: 0 };
        heroStats[h].total++;
        if (m.result === 'Win') heroStats[h].wins++;
    });

    // 3. Prepare Chart Data
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

        return {
            name: new Date(m.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            value: val
        };
    });

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Control Bar */}
            <div className="flex flex-wrap justify-between items-center bg-md-sys-surface2 p-3 rounded-2xl sticky top-0 z-20 shadow-sm border border-white/5">
                <div className="flex gap-2">
                    {['All', 'Win', 'Loss'].map(type => (
                        <button
                            key={type}
                            onClick={() => setProResultType(type as any)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${proResultType === type ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface1 hover:bg-md-sys-surface3'}`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 items-center">
                    <span className="text-[10px] font-bold opacity-60 uppercase mr-2">Metric:</span>
                    <select
                        value={proMetric}
                        onChange={(e) => setProMetric(e.target.value)}
                        className="bg-md-sys-surface1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase outline-none cursor-pointer hover:bg-md-sys-surface3 border-transparent"
                    >
                        <option value="win_rate">Win Rate</option>
                        <option value="avg_damage">Avg Damage</option>
                        <option value="avg_kills">Avg Kills</option>
                        <option value="ship_usage">Usage</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-md-sys-surface2 rounded-2xl p-6 min-h-[300px] flex flex-col border border-white/5">
                    <h3 className="text-sm font-black uppercase opacity-60 mb-4 flex items-center gap-2"><Rocket size={16} /> Ship Distribution</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={shipMetricData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="50%" paddingAngle={2}>
                                {shipMetricData.map((entry, index) => <Cell key={`cell-${index}`} fill={getColor(entry.name)} stroke="var(--md-sys-color-surface2)" strokeWidth={2} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff' }} />
                            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-md-sys-surface2 rounded-2xl p-6 min-h-[300px] flex flex-col border border-white/5">
                    <h3 className="text-sm font-black uppercase opacity-60 mb-4 flex items-center gap-2"><User size={16} /> Hero Distribution</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={heroMetricData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="50%" paddingAngle={2}>
                                {heroMetricData.map((entry, index) => <Cell key={`cell-${index}`} fill={getColor(entry.name)} stroke="var(--md-sys-color-surface2)" strokeWidth={2} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff' }} />
                            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-md-sys-surface2 rounded-2xl p-6 min-h-[300px] flex flex-col border border-white/5">
                    <h3 className="text-sm font-black uppercase opacity-60 mb-4 flex items-center gap-2"><BarChart3 size={16} /> {metricTitle}</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metricData} layout="vertical" margin={{ left: 20 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#888' }} axisLine={false} />
                            <Tooltip cursor={{ fill: 'var(--md-sys-color-surface3)', opacity: 0.4 }} contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {metricData.map((entry, index) => <Cell key={`cell-${index}`} fill={getColor(entry.name)} />)}
                                <LabelList dataKey="value" position="right" style={{ fontSize: 10, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface)' }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-md-sys-surface2 rounded-2xl p-6 min-h-[300px] flex flex-col border border-white/5">
                    <h3 className="text-sm font-black uppercase opacity-60 mb-4 flex items-center gap-2"><TrendingUp size={16} /> {metricTitle} Trend</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={timelineData}>
                            <defs><linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--md-sys-color-primary)" stopOpacity={0} /></linearGradient></defs>
                            <CartesianGrid strokeOpacity={0.05} vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#666' }} hide={timelineData.length > 10} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff' }} />
                            <Area type="monotone" dataKey="value" name={metricTitle} stroke="var(--md-sys-color-primary)" strokeWidth={3} fill="url(#colorTrend)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const EnvironmentView: React.FC<{ matches: Match[] }> = ({ matches }) => {
    const stats: Record<string, { wins: number, total: number }> = {};
    matches.forEach(m => {
        (m.reachModifiers || []).forEach(mod => {
            const clean = mod.startsWith('Artifact') ? 'Artifact Base' : mod; // Group artifacts? Or keep distinct?
            // Actually, user wants "Reach Modifier" specifically, but Artifacts are technically mods. Let's keep them distinct for now.
            if (!stats[mod]) stats[mod] = { wins: 0, total: 0 };
            stats[mod].total++;
            if (m.result === 'Win') stats[mod].wins++;
        });
    });

    const data = Object.entries(stats).map(([name, s]) => ({
        name,
        total: s.total,
        winRate: Math.round((s.wins / s.total) * 100)
    })).sort((a, b) => b.total - a.total);

    // Filter out low data count
    const validData = data.filter(d => d.total >= 0); // Show all for now

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-md-sys-surface2 rounded-2xl p-6 min-h-[300px] flex flex-col border border-white/5">
                    <h3 className="text-sm font-black uppercase opacity-60 mb-4 flex items-center gap-2"><Zap size={16} /> Hazard Frequency</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={validData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="50%" paddingAngle={2}>
                                {validData.map((entry, index) => <Cell key={`cell-${index}`} fill={getColor(entry.name)} stroke="var(--md-sys-color-surface2)" strokeWidth={2} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff' }} />
                            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-md-sys-surface2 rounded-2xl p-6 min-h-[300px] flex flex-col border border-white/5">
                    <h3 className="text-sm font-black uppercase opacity-60 mb-4 flex items-center gap-2"><Trophy size={16} /> Win Rate by Hazard</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={validData} layout="vertical" margin={{ left: 40, right: 20 }}>
                            <XAxis type="number" hide domain={[0, 100]} />
                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#888' }} axisLine={false} />
                            <Tooltip cursor={{ fill: 'var(--md-sys-color-surface3)', opacity: 0.4 }} contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff' }} />
                            <Bar dataKey="winRate" name="Win Rate %" radius={[0, 4, 4, 0]}>
                                {validData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.winRate >= 50 ? '#22c55e' : '#ef4444'} />
                                ))}
                                <LabelList dataKey="winRate" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface)' }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = () => {
    const { matches, setDrillDownTarget, playerProfiles } = useGameData();
    const { activeMode: currentMode, activeUser: currentUser } = useUIState();
    const { language } = useUserPreferences();

    const t = TRANSLATIONS[language];
    const [viewMode, setViewMode] = useState<'Standard' | 'Pro' | 'Synergy' | 'Insights' | 'Social' | 'Environment'>('Standard');
    const [showSocialGraph, setShowSocialGraph] = useState(false);
    const [timeRange, setTimeRange] = useState<'All' | 'Recent'>('All');
    const [socialSort, setSocialSort] = useState<'WinRate' | 'Encounters'>('WinRate');
    const [socialSearch, setSocialSearch] = useState('');

    const onDrillDown = (name: string, type: DrillDownTarget['type']) => {
        setDrillDownTarget({ name, type });
    };

    const filteredMatches = useMemo(() => {
        let m = matches.filter(m => m.mode === currentMode).sort((a, b) => a.timestamp - b.timestamp);
        if (timeRange === 'Recent') m = m.slice(-20);
        return m;
    }, [matches, currentMode, timeRange]);

    const previousMatches = useMemo(() => {
        let m = matches.filter(m => m.mode === currentMode).sort((a, b) => a.timestamp - b.timestamp);
        if (timeRange === 'Recent') {
            const start = Math.max(0, m.length - 40);
            const end = Math.max(0, m.length - 20);
            return m.slice(start, end);
        }
        return [];
    }, [matches, currentMode, timeRange]);

    const calculateTrend = (currentVal: number, prevVal: number, type: 'percent' | 'count' = 'percent') => {
        if (previousMatches.length === 0) return null;
        const diff = currentVal - prevVal;
        if (diff === 0) return <span className="text-[10px] font-bold opacity-40 ml-2">-</span>;
        const isPositiveGood = true;
        const color = diff > 0 ? (isPositiveGood ? 'text-green-500' : 'text-red-500') : (isPositiveGood ? 'text-red-500' : 'text-green-500');
        return <span className={`text-[10px] font-black ml-2 ${color}`}>{diff > 0 ? '+' : ''}{diff}{type === 'percent' ? '%' : ''}</span>;
    };

    const winRate = useMemo(() => {
        if (filteredMatches.length === 0) return 0;
        return Math.round((filteredMatches.filter(m => m.result === 'Win').length / filteredMatches.length) * 100);
    }, [filteredMatches]);

    const prevWinRate = useMemo(() => {
        if (previousMatches.length === 0) return 0;
        return Math.round((previousMatches.filter(m => m.result === 'Win').length / previousMatches.length) * 100);
    }, [previousMatches]);

    const currentStreak = useMemo(() => {
        const reversed = [...filteredMatches].reverse();
        let streak = 0;
        for (const m of reversed) { if (m.result === 'Win') streak++; else break; }
        return streak;
    }, [filteredMatches]);

    const avgSortiesPerDay = useMemo(() => Math.round(filteredMatches.length / 14), [filteredMatches]);
    const prevAvgSorties = useMemo(() => Math.round(previousMatches.length / 14), [previousMatches]);

    const insights = useMemo(() => {
        return calculateInsights(filteredMatches).map(insight => ({
            ...insight,
            icon: getIconComponent(insight.iconType)
        }));
    }, [filteredMatches]);

    const socialData = useMemo(() => calculateSocialData(filteredMatches), [filteredMatches]);

    const synergyMatrix = useMemo(() => calculateSynergyMatrix(filteredMatches), [filteredMatches]);

    // Phase 3.1: Enable relationship analytics from playerProfiles
    const relationshipInsights = useMemo(() =>
        calculateRelationshipAnalytics(playerProfiles as any, {}),
        [playerProfiles]
    );

    const renderSynergyMatrix = () => {
        return (
            <div className="bg-md-sys-surface2 rounded-2xl p-6 flex flex-col gap-6 animate-fade-in flex-1 min-h-0 border border-white/5">
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black uppercase tracking-tight">Synergy Matrix</h3>
                    <div className="flex gap-4 text-xs font-bold opacity-60">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-md-sys-primary rounded-sm opacity-20"></div> Low WR</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-md-sys-primary rounded-sm"></div> High WR</div>
                    </div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="h-[120px] align-bottom">
                                <th className="p-2"></th>
                                {CHARACTERS.map(c => <th key={c} className="p-2 text-[10px] font-black uppercase rotate-45 origin-bottom-left translate-x-6 translate-y-2 text-md-sys-on-surface/60">{c}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {Object.keys(synergyMatrix).map(ship => (
                                <tr key={ship}>
                                    <td className="p-2 text-[10px] font-black uppercase text-right text-md-sys-on-surface/60">{ship}</td>
                                    {CHARACTERS.map(hero => {
                                        const stat = synergyMatrix[ship][hero];
                                        const wr = stat.total > 0 ? stat.wins / stat.total : 0;
                                        const opacity = stat.total > 0 ? 0.2 + (wr * 0.8) : 0.05;
                                        return (
                                            <td key={hero} className="p-1">
                                                <div className="w-full h-10 rounded-lg flex items-center justify-center relative group transition-all hover:scale-110 hover:z-10 hover:shadow-lg bg-md-sys-primary" style={{ opacity }}>
                                                    {stat.total > 0 && <span className="text-[10px] font-black text-md-sys-onPrimary relative z-20">{Math.round(wr * 100)}%</span>}
                                                    {stat.total > 0 && (
                                                        <div className="absolute bottom-full mb-2 bg-black/80 text-white text-[10px] p-2 rounded-lg whitespace-nowrap hidden group-hover:block z-50 pointer-events-none">
                                                            <div className="font-black">{hero} & {ship}</div>
                                                            <div>Win Rate: {Math.round(wr * 100)}%</div>
                                                            <div>Matches: {stat.total}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-md-sys-surface1 h-full flex flex-col gap-3 animate-slide-up overflow-hidden p-1">
            <div className="flex flex-col md:flex-row justify-between items-center gap-3 bg-md-sys-surface2 p-3 rounded-2xl shadow-sm flex-shrink-0 border border-white/5">
                <div><h2 className="text-lg font-bold uppercase tracking-tight flex items-center gap-2"><Activity className="text-md-sys-primary" size={18} /> Performance</h2><p className="text-[9px] font-semibold opacity-50 uppercase tracking-widest pl-7">Detailed Analysis • {currentMode}</p></div>
                <div className="flex gap-2">
                    <div className="flex bg-md-sys-surface1 p-1 rounded-xl">
                        <button onClick={() => setTimeRange('All')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${timeRange === 'All' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'opacity-60 hover:bg-md-sys-surface3'}`}>All Time</button>
                        <button onClick={() => setTimeRange('Recent')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${timeRange === 'Recent' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'opacity-60 hover:bg-md-sys-surface3'}`}>Recent (20)</button>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar shrink-0">
                <button onClick={() => setViewMode('Standard')} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase whitespace-nowrap transition-all border border-transparent ${viewMode === 'Standard' ? 'bg-md-sys-surface2 text-md-sys-primary border-md-sys-primary/20' : 'bg-transparent text-md-sys-on-surface/60 hover:bg-md-sys-surface2 hover:text-md-sys-on-surface'}`}>Dashboard</button>
                <button onClick={() => setViewMode('Pro')} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase whitespace-nowrap transition-all border border-transparent ${viewMode === 'Pro' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'bg-transparent text-md-sys-on-surface/60 hover:bg-md-sys-surface2 hover:text-md-sys-on-surface'}`}>Detailed</button>
                <button onClick={() => setViewMode('Environment')} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase whitespace-nowrap transition-all border border-transparent ${viewMode === 'Environment' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'bg-transparent text-md-sys-on-surface/60 hover:bg-md-sys-surface2 hover:text-md-sys-on-surface'}`}><Zap size={12} className="inline mr-1" />Hazards</button>
                <button onClick={() => setViewMode('Synergy')} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase whitespace-nowrap transition-all border border-transparent ${viewMode === 'Synergy' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'bg-transparent text-md-sys-on-surface/60 hover:bg-md-sys-surface2 hover:text-md-sys-on-surface'}`}><Network size={12} className="inline mr-1" />Synergy</button>
                <button onClick={() => setViewMode('Insights')} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase whitespace-nowrap transition-all border border-transparent ${viewMode === 'Insights' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'bg-transparent text-md-sys-on-surface/60 hover:bg-md-sys-surface2 hover:text-md-sys-on-surface'}`}><Lightbulb size={12} className="inline mr-1" />Insights</button>
                <button onClick={() => setViewMode('Social')} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase whitespace-nowrap transition-all border border-transparent ${viewMode === 'Social' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'bg-transparent text-md-sys-on-surface/60 hover:bg-md-sys-surface2 hover:text-md-sys-on-surface'}`}><Handshake size={12} className="inline mr-1" />Social</button>
            </div>

            {viewMode === 'Pro' ? <ProView matches={filteredMatches} /> : viewMode === 'Environment' ? <EnvironmentView matches={filteredMatches} /> : viewMode === 'Synergy' ? renderSynergyMatrix() : viewMode === 'Insights' ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Phase 3.1: Relationship Insights Section */}
                    {relationshipInsights.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-sm font-black uppercase opacity-60 mb-4 flex items-center gap-2">
                                <Users size={16} /> Player Relationships
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {relationshipInsights.map((rel, i) => (
                                    <div
                                        key={i}
                                        onClick={() => onDrillDown(rel.playerName, rel.type === 'ally' ? 'Teammate' : 'Opponent')}
                                        className="bg-md-sys-surface2 p-4 rounded-2xl relative overflow-hidden shadow-sm hover:scale-[1.02] transition-transform cursor-pointer border border-white/5"
                                    >
                                        <div className={`absolute -top-4 -right-4 w-20 h-20 opacity-10 rounded-full blur-2xl ${
                                            rel.type === 'nemesis' ? 'bg-red-500' :
                                            rel.type === 'ally' ? 'bg-green-500' :
                                            rel.type === 'stalker' ? 'bg-purple-500' : 'bg-orange-500'
                                        }`}></div>
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3 shadow-lg ${
                                            rel.type === 'nemesis' ? 'bg-red-600' :
                                            rel.type === 'ally' ? 'bg-green-600' :
                                            rel.type === 'stalker' ? 'bg-purple-600' : 'bg-orange-600'
                                        }`}>
                                            {rel.type === 'nemesis' ? <Skull size={18} /> :
                                             rel.type === 'ally' ? <Handshake size={18} /> :
                                             rel.type === 'stalker' ? <Ghost size={18} /> : <Swords size={18} />}
                                        </div>
                                        <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">
                                            {rel.type === 'nemesis' ? 'Nemesis' :
                                             rel.type === 'ally' ? 'Loyal Ally' :
                                             rel.type === 'stalker' ? 'Stalker' : 'Frenemy'}
                                        </div>
                                        <div className="text-lg font-black leading-tight truncate">{rel.playerName}</div>
                                        <div className="text-[10px] font-bold opacity-40">{rel.encounters} encounters</div>
                                        {rel.topShip && (
                                            <div className="text-[9px] font-black opacity-40 mt-1 flex items-center gap-1">
                                                <Rocket size={10} className="text-md-sys-primary" /> {rel.topShip}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Performance Insights */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                        {insights.map((stat, i) => <div key={i} className="bg-md-sys-surface2 !p-6 relative overflow-hidden shadow-sm hover:scale-[1.02] transition-transform cursor-pointer group rounded-2xl border border-white/5"><div className={`absolute -top-6 -right-6 w-32 h-32 opacity-10 rounded-full ${stat.color} blur-2xl`}></div><div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white mb-4 shadow-lg ${stat.color}`}>{stat.icon}</div><div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{stat.title}</div><div className="text-[10px] font-bold uppercase opacity-40 mb-4">{stat.subtitle}</div><div className="text-2xl font-black leading-tight mb-2 tracking-tight">{stat.value}</div><div className="text-[10px] font-bold px-2 py-1 bg-md-sys-surface1 rounded-lg inline-block">{stat.subValue}</div></div>)}
                        {insights.length === 0 && relationshipInsights.length === 0 && <div className="col-span-full text-center opacity-60 text-sm font-bold uppercase p-12">Not enough data to generate insights.</div>}
                    </div>
                    <div className="bg-md-sys-surface2 rounded-2xl p-6 border border-white/5">
                        <TiltMeter recentMatches={filteredMatches.slice(-5)} />
                    </div>
                </div>
            ) : viewMode === 'Social' ? (
                <div className="flex-1 flex flex-col overflow-hidden h-full">
                    <div className="flex flex-col md:flex-row justify-between mb-4 gap-3">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                            <input
                                type="text"
                                placeholder="Search pilots..."
                                value={socialSearch}
                                onChange={(e) => setSocialSearch(e.target.value)}
                                className="w-full bg-md-sys-surface2 rounded-xl py-2 pl-10 pr-4 text-xs font-bold outline-none border border-transparent focus:border-md-sys-primary"
                            />
                        </div>
                        <div className="flex gap-2">
                            <div className="flex bg-md-sys-surface2 p-1 rounded-xl">
                                <button onClick={() => setSocialSort('WinRate')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${socialSort === 'WinRate' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:opacity-100'}`}>Win Rate</button>
                                <button onClick={() => setSocialSort('Encounters')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${socialSort === 'Encounters' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:opacity-100'}`}>Encounters</button>
                            </div>
                            <button onClick={() => setShowSocialGraph(!showSocialGraph)} className="flex items-center gap-2 px-4 py-2 bg-md-sys-surface2 rounded-xl text-xs font-bold uppercase hover:bg-md-sys-primary hover:text-white transition-all shadow-sm">
                                {showSocialGraph ? <List size={16} /> : <Network size={16} />} {showSocialGraph ? "List" : "Graph"}
                            </button>
                        </div>
                    </div>

                    {showSocialGraph ? (
                        <RivalryGraph matches={filteredMatches} currentUser={currentUser} />
                    ) : (
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden">
                            {['Opponent', 'Teammate'].map(type => {
                                const isOpponent = type === 'Opponent';
                                const list = isOpponent ? socialData.opponents : socialData.teammates;
                                const filteredList = list
                                    .filter(([name]) => name.toLowerCase().includes(socialSearch.toLowerCase()))
                                    .sort((a, b) => {
                                        if (socialSort === 'Encounters') return b[1].total - a[1].total || (b[1].wins / b[1].total) - (a[1].wins / a[1].total);
                                        return (b[1].wins / b[1].total) - (a[1].wins / a[1].total) || b[1].total - a[1].total;
                                    });

                                return (
                                    <div key={type} className="bg-md-sys-surface2 flex flex-col rounded-2xl overflow-hidden shadow-lg border border-white/5">
                                        <div className="p-4 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60">
                                            {isOpponent ? <Swords size={16} /> : <Handshake size={16} />}
                                            {isOpponent ? 'Top Rivals' : 'Best Wingmen'}
                                        </h3></div>
                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-2">
                                            {filteredList.length === 0 ? <div className="opacity-40 text-xs font-bold text-center py-10">No data found</div> :
                                                filteredList.slice(0, 50).map(([name, stat], i) => {
                                                    const profile = playerProfiles[name];
                                                    const topShip = profile?.shipsObserved ?
                                                        Object.entries(profile.shipsObserved).sort((a, b) => b[1] - a[1])[0]?.[0] : null;

                                                    return (
                                                        <div key={name} onClick={() => onDrillDown(name, type as any)} className="flex justify-between items-center py-3 border-b border-md-sys-outline/10 last:border-0 cursor-pointer hover:bg-md-sys-surface3 p-2 rounded-xl transition-colors">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i === 0 ? (isOpponent ? 'bg-red-500 text-white' : 'bg-green-500 text-white') : 'bg-md-sys-surface3'}`}>{i + 1}</div>
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-sm leading-tight">{name}</span>
                                                                    {topShip && <span className="text-[9px] font-black opacity-40 uppercase tracking-tighter flex items-center gap-1"><Rocket size={8} className="text-md-sys-primary" /> {topShip}</span>}
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-xs font-black" style={{ color: (stat.wins / stat.total) > 0.5 ? 'var(--color-win)' : 'var(--color-loss)' }}>{Math.round((stat.wins / stat.total) * 100)}% WR</div>
                                                                <div className="text-[9px] font-bold opacity-40">{stat.total} {isOpponent ? 'Enc.' : 'Missions'}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (<>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div onClick={() => onDrillDown('Win Ratio Analysis', 'KPI')} className="bg-md-sys-surface2 p-4 rounded-2xl relative overflow-hidden group cursor-pointer hover:scale-[1.02] shadow-sm transition-transform border border-white/5">
                        <div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Trophy size={48} /></div>
                        <div className="flex items-end gap-1 mb-1">
                            <div className="text-3xl font-black tracking-tighter" style={{ color: winRate >= 50 ? 'var(--color-win)' : 'var(--color-loss)' }}>{winRate}%</div>
                            {calculateTrend(winRate, prevWinRate)}
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Win Rate</div>
                    </div>
                    <div onClick={() => onDrillDown('Win Streak Analysis', 'KPI')} className="bg-md-sys-surface2 p-4 rounded-2xl relative overflow-hidden group cursor-pointer hover:scale-[1.02] shadow-sm transition-transform border border-white/5"><div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Flame size={48} /></div><div className="text-3xl font-black mb-1 text-orange-500 tracking-tighter">{currentStreak}</div><div className="text-[10px] font-black uppercase tracking-widest opacity-60">Active Streak</div></div>
                    <div onClick={() => onDrillDown('Total Sorties Analysis', 'KPI')} className="bg-md-sys-surface2 p-4 rounded-2xl relative overflow-hidden group shadow-sm cursor-pointer hover:scale-[1.02] transition-transform border border-white/5">
                        <div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Swords size={48} /></div>
                        <div className="flex items-end gap-1 mb-1">
                            <div className="text-3xl font-black text-md-sys-primary tracking-tighter">{filteredMatches.length}</div>
                            {calculateTrend(filteredMatches.length, previousMatches.length, 'count')}
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Sorties</div>
                    </div>
                    <div className="bg-md-sys-surface2 p-4 rounded-2xl relative overflow-hidden group shadow-sm border border-white/5">
                        <div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Zap size={48} /></div>
                        <div className="flex items-end gap-1 mb-1">
                            <div className="text-3xl font-black text-blue-400 tracking-tighter">{avgSortiesPerDay}</div>
                            {calculateTrend(avgSortiesPerDay, prevAvgSorties, 'count')}
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Daily Avg</div>
                    </div>
                </div>

                {insights.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {insights.slice(0, 3).map((stat, i) => (
                            <div key={i} onClick={() => setViewMode('Insights')} className="bg-md-sys-surface2 !p-4 relative overflow-hidden shadow-sm hover:scale-105 transition-transform cursor-pointer group rounded-2xl flex items-center gap-4 border border-white/5">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg flex-shrink-0 ${stat.color}`}>{stat.icon}</div>
                                <div className="overflow-hidden">
                                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">{stat.title}</div>
                                    <div className="text-lg font-black leading-tight truncate">{stat.value}</div>
                                    <div className="text-[10px] font-bold opacity-40 truncate">{stat.subtitle}</div>
                                </div>
                                <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full ${stat.color} opacity-10 blur-2xl`}></div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-2">
                    <div className="bg-md-sys-surface2 flex flex-col rounded-2xl overflow-hidden shadow-lg min-h-[180px] border border-white/5">
                        <div className="p-4 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60"><Swords size={16} /> Top Rivals</h3></div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-2">
                            {socialData.opponents.slice(0, 5).map(([name, stat], i) => (
                                <div key={name} onClick={() => onDrillDown(name, 'Opponent')} className="flex justify-between items-center py-2 border-b border-md-sys-outline/10 last:border-0 cursor-pointer hover:bg-md-sys-surface3 p-1.5 rounded-lg transition-colors">
                                    <div className="flex items-center gap-3"><div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${i === 0 ? 'bg-red-500 text-white' : 'bg-md-sys-surface3'}`}>{i + 1}</div><span className="font-bold text-xs">{name}</span></div>
                                    <div className="text-right"><div className="text-[10px] font-black" style={{ color: (stat.wins / stat.total) < 0.5 ? 'var(--color-win)' : 'var(--color-loss)' }}>{Math.round((stat.wins / stat.total) * 100)}% WR</div><div className="text-[8px] font-bold opacity-40">{stat.total} Enc.</div></div>
                                </div>
                            ))}
                            {socialData.opponents.length === 0 && <div className="opacity-40 text-xs font-bold text-center py-10">No data</div>}
                        </div>
                    </div>
                    <div className="bg-md-sys-surface2 flex flex-col rounded-2xl overflow-hidden shadow-lg min-h-[180px] border border-white/5">
                        <div className="p-4 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60"><Handshake size={16} /> Best Wingmen</h3></div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-2">
                            {socialData.teammates.slice(0, 5).map(([name, stat], i) => (
                                <div key={name} onClick={() => onDrillDown(name, 'Teammate')} className="flex justify-between items-center py-2 border-b border-md-sys-outline/10 last:border-0 cursor-pointer hover:bg-md-sys-surface3 p-1.5 rounded-lg transition-colors">
                                    <div className="flex items-center gap-3"><div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${i === 0 ? 'bg-green-500 text-white' : 'bg-md-sys-surface3'}`}>{i + 1}</div><span className="font-bold text-xs">{name}</span></div>
                                    <div className="text-right"><div className="text-[10px] font-black" style={{ color: (stat.wins / stat.total) > 0.5 ? 'var(--color-win)' : 'var(--color-loss)' }}>{Math.round((stat.wins / stat.total) * 100)}% WR</div><div className="text-[8px] font-bold opacity-40">{stat.total} Missions</div></div>
                                </div>
                            ))}
                            {socialData.teammates.length === 0 && <div className="opacity-40 text-xs font-bold text-center py-10">No data</div>}
                        </div>
                    </div>
                </div>
            </>)}
        </div>
    );
};

export default AnalyticsPanel;