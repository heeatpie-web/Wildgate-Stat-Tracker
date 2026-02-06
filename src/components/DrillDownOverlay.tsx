import React from 'react';
import { X, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';

export const DrillDownOverlay: React.FC = () => {
    const { matches, drillDownTarget, setDrillDownTarget } = useGameData();
    const { activeMode } = useUIState();

    if (!drillDownTarget) return null;

    // Filter matches based on target
    const targetMatches = matches.filter(m => {
        if (m.mode !== activeMode) return false;
        if (drillDownTarget.type === 'Teammate') return (m.teammates || []).includes(drillDownTarget.name);
        if (drillDownTarget.type === 'Opponent') return (m.opponents || []).includes(drillDownTarget.name);
        if (drillDownTarget.type === 'Ship') return (m.ship || '').includes(drillDownTarget.name);
        if (drillDownTarget.type === 'Hero') return (m.hero || '') === drillDownTarget.name;
        if (drillDownTarget.type === 'Artifact') return m.subType === 'Artifact' && (m.reachModifiers || []).some(r => r.includes(drillDownTarget.name));
        return true;
    }).sort((a, b) => a.timestamp - b.timestamp);

    const trendData = targetMatches.map((m, i) => ({
        idx: i + 1,
        rollingWinRate: Math.round((targetMatches.slice(0, i + 1).filter(x => x.result === 'Win').length / (i + 1)) * 100)
    }));

    // Stats
    const totalWins = targetMatches.filter(m => m.result === 'Win').length;
    const wr = targetMatches.length > 0 ? Math.round((totalWins / targetMatches.length) * 100) : 0;

    // Trend (Last 10)
    const last10 = targetMatches.slice(-10);
    const recentWR = last10.length > 0 ? Math.round((last10.filter(m => m.result === 'Win').length / last10.length) * 100) : 0;
    const trendDiff = recentWR - wr;

    const avgDmg = Math.round(targetMatches.reduce((a, b) => a + (b.damageTaken || 0), 0) / Math.max(1, targetMatches.length));

    // Environment Analysis
    const envStats: Record<string, { wins: number, total: number }> = {};
    targetMatches.forEach(m => {
        (m.reachModifiers || []).forEach(mod => {
            if (!envStats[mod]) envStats[mod] = { wins: 0, total: 0 };
            envStats[mod].total++;
            if (m.result === 'Win') envStats[mod].wins++;
        });
    });
    const topEnvs = Object.entries(envStats)
        .filter(([_, s]) => s.total >= 3) // Min 3 matches
        .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))
        .slice(0, 3);

    const worstEnvs = Object.entries(envStats)
        .filter(([_, s]) => s.total >= 3)
        .sort((a, b) => (a[1].wins / a[1].total) - (b[1].wins / b[1].total))
        .slice(0, 3);

    // Synergy / Nemesis Calculation
    const partnerStats: Record<string, { wins: number, total: number }> = {};
    const enemyStats: Record<string, { wins: number, total: number }> = {};

    targetMatches.forEach(m => {
        // ... (existing logic for populating stats)
        // If looking at Ship/Hero, analyze Teammates/Opponents
        if (['Ship', 'Hero'].includes(drillDownTarget.type)) {
            m.teammates.forEach(t => { if (!partnerStats[t]) partnerStats[t] = { wins: 0, total: 0 }; partnerStats[t].total++; if (m.result === 'Win') partnerStats[t].wins++; });
            m.opponents.forEach(o => { if (!enemyStats[o]) enemyStats[o] = { wins: 0, total: 0 }; enemyStats[o].total++; if (m.result === 'Win') enemyStats[o].wins++; });
        }
        // If looking at Person, analyze Ships
        else {
            const s = (m.ship || 'Unknown').split('(')[0];
            if (drillDownTarget.type === 'Teammate') {
                if (!partnerStats[s]) partnerStats[s] = { wins: 0, total: 0 }; partnerStats[s].total++; if (m.result === 'Win') partnerStats[s].wins++;
            }
            else if (drillDownTarget.type === 'Opponent') {
                if (!enemyStats[s]) enemyStats[s] = { wins: 0, total: 0 }; enemyStats[s].total++; if (m.result === 'Win') enemyStats[s].wins++;
            }
        }
    });

    const topSynergies = Object.entries(partnerStats)
        .filter(([_, s]) => s.total >= 2)
        .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))
        .slice(0, 5);

    const topNemeses = Object.entries(enemyStats)
        .filter(([_, s]) => s.total >= 2)
        .sort((a, b) => (a[1].wins / a[1].total) - (b[1].wins / b[1].total)) // Ascension order for nemesis (lowest WR first) represents "Losses"
        // Wait, nemesis means I lose to them. So lowest Win Rate against them.
        .slice(0, 5);

    const bestSynergy = topSynergies[0];
    const worstNemesis = topNemeses[0];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-6 animate-fade-in" onClick={() => setDrillDownTarget(null)}>
            <div className="bg-md-sys-surface1 w-full max-w-6xl rounded-[40px] p-8 shadow-2xl border border-md-sys-outline/20 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex justify-between items-start mb-8 flex-shrink-0">
                    <div>
                        <div className="text-sm font-black uppercase opacity-40 tracking-[0.2em] mb-1">Deep Dive Analysis • {drillDownTarget.type}</div>
                        <h2 className="text-5xl font-black">{drillDownTarget.name}</h2>
                        <div className="flex gap-4 mt-4">
                            <div className="bg-md-sys-surface2 px-4 py-2 rounded-xl text-xs font-black uppercase"><span className="opacity-60">Matches:</span> {targetMatches.length}</div>
                            <div className="bg-md-sys-surface2 px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2">
                                <span className="opacity-60">Win Rate:</span>
                                <span className={wr >= 50 ? 'text-green-500' : 'text-red-500'}>{wr}%</span>
                                {trendDiff !== 0 && (
                                    <span className={`text-[10px] ${trendDiff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        ({trendDiff > 0 ? '+' : ''}{trendDiff}%)
                                    </span>
                                )}
                            </div>
                            {avgDmg > 0 && <div className="bg-md-sys-surface2 px-4 py-2 rounded-xl text-xs font-black uppercase"><span className="opacity-60">Avg Dmg:</span> {avgDmg}</div>}
                        </div>
                    </div>
                    <button onClick={() => setDrillDownTarget(null)} className="p-4 bg-md-sys-surface2 rounded-full hover:bg-md-sys-surface3"><X size={24} /></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                    {/* Top Stats Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-shrink-0">
                        {/* Recent Form */}
                        <div className="bg-md-sys-surface2 p-6 rounded-[32px] relative overflow-hidden flex flex-col justify-between">
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Recent Form (Last 10)</h4>
                                <div className="text-4xl font-black mb-1 flex items-baseline gap-2">
                                    {recentWR}%
                                    {trendDiff !== 0 && <span className={`text-lg ${trendDiff > 0 ? 'text-green-500' : 'text-red-500'}`}>{trendDiff > 0 ? <TrendingUp size={20} /> : <TrendingUp size={20} className="rotate-180" />}</span>}
                                </div>
                                <div className="text-xs font-bold opacity-40">vs {wr}% Lifetime</div>
                            </div>
                            <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-10 blur-2xl ${recentWR >= 50 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>

                        {/* Best Synergies */}
                        <div className="bg-md-sys-surface2 p-6 rounded-[32px] relative overflow-hidden col-span-1">
                            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-4">{['Ship', 'Hero'].includes(drillDownTarget.type) ? 'Top Wingmen' : 'Best Synergies'}</h4>
                            <div className="flex flex-col gap-2">
                                {topSynergies.length > 0 ? topSynergies.map(([name, stat], i) => (
                                    <div key={name} className="flex justify-between items-center text-xs">
                                        <div className="font-bold truncate max-w-[70%]">{i + 1}. {name}</div>
                                        <div className="font-mono opacity-60">{Math.round((stat.wins / stat.total) * 100)}%</div>
                                    </div>
                                )) : <div className="text-xs opacity-40 font-bold uppercase">No Data</div>}
                            </div>
                            <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-blue-500 opacity-5 blur-2xl"></div>
                        </div>

                        {/* Worst Nemeses */}
                        <div className="bg-md-sys-surface2 p-6 rounded-[32px] relative overflow-hidden col-span-1">
                            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-4">{['Ship', 'Hero'].includes(drillDownTarget.type) ? 'Worst Nightmares' : (drillDownTarget.type === 'Opponent' ? 'Weakness' : 'Worst Combo')}</h4>
                            <div className="flex flex-col gap-2">
                                {topNemeses.length > 0 ? topNemeses.map(([name, stat], i) => (
                                    <div key={name} className="flex justify-between items-center text-xs">
                                        <div className="font-bold truncate max-w-[70%]">{i + 1}. {name}</div>
                                        <div className="font-mono opacity-60 text-red-400">{Math.round((stat.wins / stat.total) * 100)}%</div>
                                    </div>
                                )) : <div className="text-xs opacity-40 font-bold uppercase">No Data</div>}
                            </div>
                            <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-red-500 opacity-5 blur-2xl"></div>
                        </div>

                        {/* Environment Affinity */}
                        <div className="bg-md-sys-surface2 p-6 rounded-[32px] relative overflow-hidden col-span-1">
                            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-4">Environment Affinity</h4>
                            <div className="flex flex-col gap-1">
                                {topEnvs.length > 0 ? (
                                    <>
                                        <div className="text-[10px] uppercase opacity-40 font-bold mb-1">Best</div>
                                        {topEnvs.map(([name, stat]) => (
                                            <div key={name} className="flex justify-between items-center text-xs">
                                                <div className="font-bold truncate max-w-[70%]">{name}</div>
                                                <div className="font-mono text-green-400">{Math.round((stat.wins / stat.total) * 100)}%</div>
                                            </div>
                                        ))}
                                    </>
                                ) : <div className="text-xs opacity-40 font-bold uppercase">No Data</div>}
                            </div>
                            <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-amber-500 opacity-5 blur-2xl"></div>
                        </div>
                    </div>

                    {/* Chart */}
                    {targetMatches.length < 2 ? (
                        <div className="h-64 w-full bg-md-sys-surface2 rounded-[32px] flex items-center justify-center opacity-40 font-bold uppercase tracking-widest flex-shrink-0">Not enough data for trend analysis</div>
                    ) : (
                        <div className="h-80 w-full bg-md-sys-surface2 rounded-[32px] p-6 border border-md-sys-outline/5 shadow-inner flex-shrink-0">
                            <h4 className="text-xs font-black uppercase tracking-widest mb-6 opacity-60">Rolling Win Rate Over Time</h4>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData}>
                                    <defs><linearGradient id="colorWin" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={wr >= 50 ? "#22c55e" : "#ef4444"} stopOpacity={0.3} /><stop offset="95%" stopColor={wr >= 50 ? "#22c55e" : "#ef4444"} stopOpacity={0} /></linearGradient></defs>
                                    <CartesianGrid strokeOpacity={0.05} vertical={false} />
                                    <XAxis dataKey="idx" tick={{ fontSize: 12 }} label={{ value: 'Matches', position: 'insideBottom', offset: -5 }} />
                                    <YAxis tick={{ fontSize: 12 }} label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft' }} domain={[0, 100]} />
                                    <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '16px', border: 'none' }} />
                                    <Area type="monotone" dataKey="rollingWinRate" name="Win Rate" stroke={wr >= 50 ? "#22c55e" : "#ef4444"} strokeWidth={4} fillOpacity={1} fill="url(#colorWin)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
