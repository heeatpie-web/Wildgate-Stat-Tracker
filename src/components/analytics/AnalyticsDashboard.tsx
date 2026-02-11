import React, { useMemo } from 'react';
import { AnalyticsView, VisualMode, DrillDownTarget, Insight } from '../../types';
import { AnalyticsCard } from './AnalyticsCard';
import { SparklineWidget } from './SparklineWidget';
import { RelationshipInsight } from '../../utils/analytics';
import { synthesizeNarrative } from '../../utils/analyticsEditorial';
import {
    Calendar,
    Gauge,
    Clock,
    Flame,
    Crosshair,
    Lightbulb,
    Handshake,
    Trophy,
    Swords,
    Zap,
    ShieldCheck,
    Award,
    BarChart3,
    Globe,
    Users,
} from 'lucide-react';

interface AnalyticsDashboardProps {
    visualMode: VisualMode;
    onNavigate: (view: AnalyticsView) => void;
    onDrillDown: (name: string, type: DrillDownTarget['type']) => void;
    winRate: number;
    currentStreak: number;
    totalMatches: number;
    avgSortiesPerDay: number;
    sessionSummary: any;
    momentum: any;
    periodComparison: any;
    timePatterns: any;
    streakHistory: any;
    killEfficiency: any;
    placementData: any;
    insights: Insight[];
    socialData: any;
    relationshipInsights: RelationshipInsight[];
    synergyMatrix: Record<string, Record<string, { wins: number; total: number }>>;
    filteredMatches: any[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
    visualMode,
    onNavigate,
    onDrillDown,
    winRate,
    currentStreak,
    totalMatches,
    avgSortiesPerDay,
    sessionSummary,
    momentum,
    periodComparison,
    timePatterns,
    streakHistory,
    killEfficiency,
    placementData,
    insights,
    socialData,
    relationshipInsights,
    synergyMatrix,
    filteredMatches,
}) => {
    const dense = visualMode === 'dense';
    const today = sessionSummary?.today;
    const scoreColor = momentum.currentMomentum >= 60 ? 'var(--color-success)' : momentum.currentMomentum >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';

    const winRateSparkline = useMemo(() => filteredMatches.map((_: any, i: number) => ({
        value: Math.round((filteredMatches.slice(0, i + 1).filter((m: any) => m.result === 'Win').length / (i + 1)) * 100),
    })), [filteredMatches]);

    const momentumSparkline = useMemo(() => (momentum.timeline || []).map((p: any) => ({ value: p.score })), [momentum]);
    const killSparkline = useMemo(() => (killEfficiency.timeline || []).map((p: any) => ({ value: p.avgKills })), [killEfficiency]);

    const wins = filteredMatches.filter((m: any) => m.result === 'Win');
    const losses = filteredMatches.filter((m: any) => m.result === 'Loss');
    const avgDmgWins = wins.length > 0 ? Math.round(wins.reduce((a: number, m: any) => a + (Number(m.damageTaken) || 0), 0) / wins.length) : 0;
    const avgDmgLosses = losses.length > 0 ? Math.round(losses.reduce((a: number, m: any) => a + (Number(m.damageTaken) || 0), 0) / losses.length) : 0;

    const clutchWins = filteredMatches.filter((m: any) => {
        if (m.result !== 'Win') return false;
        const totalKills = Object.values(m.kills || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
        const mins = m.time ? parseInt(m.time.split(':')[0], 10) || 0 : 0;
        return totalKills > 3 || mins > 8;
    });
    const clutchRate = filteredMatches.length > 0 ? Math.round((clutchWins.length / filteredMatches.length) * 100) : 0;

    const weekDeltaWR = periodComparison?.weekDelta?.winRate ?? 0;
    const thisWeekWR = periodComparison?.thisWeek?.winRate ?? 0;
    const lastWeekWR = periodComparison?.lastWeek?.winRate ?? 0;

    const peakHour = timePatterns?.peakHour ?? 0;
    const peakDay = timePatterns?.peakDay ?? 0;
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const bestCombo = useMemo(() => {
        let best: { ship: string; hero: string; wr: number; total: number } | null = null;
        for (const [ship, heroes] of Object.entries(synergyMatrix || {})) {
            for (const [hero, stat] of Object.entries(heroes || {})) {
                if (!stat || stat.total < 2) continue;
                const wr = Math.round((stat.wins / stat.total) * 100);
                if (!best || wr > best.wr || (wr === best.wr && stat.total > best.total)) {
                    best = { ship, hero, wr, total: stat.total };
                }
            }
        }
        return best;
    }, [synergyMatrix]);

    const topRelationship = relationshipInsights?.[0] || null;

    const hazardSummary = useMemo(() => {
        const stats: Record<string, { wins: number; total: number }> = {};
        for (const m of filteredMatches as any[]) {
            const mods = (m.reachModifiers || []) as string[];
            for (const mod of mods) {
                if (!mod) continue;
                if (!stats[mod]) stats[mod] = { wins: 0, total: 0 };
                stats[mod].total += 1;
                if (m.result === 'Win') stats[mod].wins += 1;
            }
        }
        const overallWR = filteredMatches.length > 0
            ? Math.round((filteredMatches.filter((m: any) => m.result === 'Win').length / filteredMatches.length) * 100)
            : 0;
        const rows = Object.entries(stats)
            .map(([name, s]) => {
                const wr = s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0;
                return { name, total: s.total, winRate: wr, impact: wr - overallWR };
            })
            .sort((a, b) => b.total - a.total);
        return { overallWR, rows };
    }, [filteredMatches]);

    const placementBuckets = useMemo(() => {
        const dist = (placementData?.distribution || []) as Array<{ placement: number; count: number }>;
        const maxCount = Math.max(1, ...dist.map(d => d.count || 0));
        const rows = [...dist].sort((a, b) => a.placement - b.placement).slice(0, 10);
        return { rows, maxCount };
    }, [placementData]);

    const editorial = useMemo(() => {
        if (dense) return null;
        return synthesizeNarrative({
            matches: filteredMatches as any,
            winRate,
            currentStreak,
            momentum,
            sessionSummary,
            periodComparison,
            timePatterns,
            killEfficiency,
            socialData,
            synergyMatrix,
        });
    }, [dense, filteredMatches, winRate, currentStreak, momentum, sessionSummary, periodComparison, timePatterns, killEfficiency, socialData, synergyMatrix]);

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar animate-fade-in p-2 pb-8">
            {!dense && editorial && (
                <div className="md3-card rounded-2xl p-6 mb-4 overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.22em] font-black opacity-40 mb-2">
                                Analytics Editorial
                            </div>
                            <h2 className="text-xl md:text-2xl font-black tracking-tight leading-snug text-md-sys-on-surface">
                                {editorial.headline}
                            </h2>
                            <div className="mt-4 space-y-4 text-sm leading-relaxed text-md-sys-on-surface/75">
                                {editorial.sections.map((s) => (
                                    <div key={s.id} className="pb-4 border-b border-md-sys-outlineVariant/25 last:border-b-0 last:pb-0">
                                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-md-sys-on-surface/55">{s.title}</div>
                                        <p className="mt-1">{s.body}</p>
                                        {s.metrics && s.metrics.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {s.metrics.map((m, i) => (
                                                    <div key={i} className="md3-surface-high px-3 py-1.5 rounded-lg text-[10px] font-bold">
                                                        <span className="opacity-60 uppercase mr-1">{m.label}</span>
                                                        <span className="font-black">{m.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex gap-2 flex-wrap">
                                <button
                                    onClick={() => onNavigate('insights')}
                                    className="md3-btn-tonal px-4 py-2 text-[10px] font-black uppercase tracking-wide"
                                >
                                    Open Insights
                                </button>
                                <button
                                    onClick={() => onNavigate('environment')}
                                    className="md3-btn-outlined px-4 py-2 text-[10px] font-black uppercase tracking-wide"
                                >
                                    Hazard Analysis
                                </button>
                            </div>
                        </div>
                        <div className="md:w-[260px] flex-shrink-0 md3-surface-high rounded-2xl p-4">
                            <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-3">Key Tape</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <div className="text-[9px] font-black uppercase opacity-40">Win Rate</div>
                                    <div className="text-lg font-black">{winRate}%</div>
                                </div>
                                <div>
                                    <div className="text-[9px] font-black uppercase opacity-40">Streak</div>
                                    <div className="text-lg font-black">{currentStreak}W</div>
                                </div>
                                <div>
                                    <div className="text-[9px] font-black uppercase opacity-40">Momentum</div>
                                    <div className="text-lg font-black" style={{ color: scoreColor }}>{momentum.currentMomentum}</div>
                                </div>
                                <div>
                                    <div className="text-[9px] font-black uppercase opacity-40">Matches</div>
                                    <div className="text-lg font-black">{totalMatches}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className={`grid gap-4 ${dense ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-6'}`}>
                <AnalyticsCard
                    title="Win Rate"
                    icon={<Trophy size={dense ? 12 : 14} />}
                    visualMode={visualMode}
                    className={dense ? 'col-span-2 lg:col-span-2' : 'md:col-span-3'}
                    accentColor={winRate >= 50 ? 'bg-success' : 'bg-danger'}
                    onExpand={() => onNavigate('session')}
                >
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-shrink-0">
                            <div className={`font-black tracking-tighter leading-none ${winRate >= 50 ? 'text-success' : 'text-danger'} ${dense ? 'text-4xl' : 'text-6xl'}`}>
                                {winRate}<span className="text-[0.5em] opacity-50 ml-1">%</span>
                            </div>
                            <div className={`mt-1 font-bold opacity-60 uppercase tracking-widest ${dense ? 'text-[9px]' : 'text-[10px]'}`}>
                                {totalMatches} tracked matches
                            </div>
                        </div>
                        <div className="flex-1 h-14">
                            <SparklineWidget data={winRateSparkline} color={winRate >= 50 ? 'var(--color-success)' : 'var(--color-danger)'} height={dense ? 38 : 56} />
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Today's Session"
                    icon={<Calendar size={dense ? 12 : 14} />}
                    onExpand={() => onNavigate('session')}
                    visualMode={visualMode}
                    className={dense ? 'col-span-2 lg:col-span-2' : 'md:col-span-3'}
                    accentColor="bg-md-sys-primary"
                >
                    {today ? (
                        <div className="flex items-center justify-between">
                            <div>
                                <div className={`font-black tracking-tight leading-none ${dense ? 'text-3xl' : 'text-5xl'}`}>
                                    <span className="text-success">{today.wins}</span>
                                    <span className="opacity-30 mx-1">/</span>
                                    <span className="text-danger">{today.losses}</span>
                                </div>
                                <div className={`mt-1 font-bold opacity-60 uppercase tracking-wide ${dense ? 'text-[9px]' : 'text-[10px]'}`}>
                                    {today.winRate}% win rate
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`font-black text-md-sys-on-surface ${dense ? 'text-2xl' : 'text-3xl'}`}>{today.totalKills}</div>
                                <div className="text-[10px] uppercase opacity-50 font-bold tracking-wide">Kills</div>
                            </div>
                        </div>
                    ) : (
                        <div className="opacity-40 text-sm font-bold uppercase tracking-wide">No Session Data Today</div>
                    )}
                </AnalyticsCard>

                <AnalyticsCard title="Momentum" icon={<Gauge size={12} />} visualMode={visualMode} className={dense ? '' : 'md:col-span-2'} accentColor="bg-accent" onExpand={() => onNavigate('momentum')}>
                    <div className="flex items-end justify-between">
                        <div>
                            <div className={`font-black leading-none ${dense ? 'text-2xl' : 'text-4xl'}`} style={{ color: scoreColor }}>{momentum.currentMomentum}</div>
                            <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide mt-1">Peak {momentum.peakMomentum}</div>
                        </div>
                        <div className="w-20 h-8">
                            <SparklineWidget data={momentumSparkline} color={scoreColor} height={dense ? 24 : 32} />
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard title="Current Streak" icon={<Flame size={12} />} visualMode={visualMode} className={dense ? '' : 'md:col-span-2'} accentColor="bg-warning" onExpand={() => onNavigate('streaks')}>
                    <div className="flex items-center justify-between">
                        <div className={`font-black text-warning leading-none ${dense ? 'text-2xl' : 'text-4xl'}`}>{currentStreak}</div>
                        <div className="text-right text-[10px] font-bold uppercase tracking-wide">
                            <div className="text-success">Best {streakHistory.longestWinStreak}W</div>
                            <div className="text-danger">Worst {streakHistory.longestLossStreak}L</div>
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Daily Volume"
                    icon={<Clock size={12} />}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-2'}
                    accentColor="bg-info"
                    onExpand={() => onNavigate('timePatterns')}
                >
                    <div className={`font-black text-info leading-none ${dense ? 'text-2xl' : 'text-4xl'}`}>{avgSortiesPerDay}</div>
                    <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide mt-1">Matches per day</div>
                </AnalyticsCard>

                <AnalyticsCard title="Kill Efficiency" icon={<Crosshair size={12} />} visualMode={visualMode} className={dense ? '' : 'md:col-span-2'} accentColor="bg-danger" onExpand={() => onNavigate('killEfficiency')}>
                    <div className={`font-black text-warning leading-none ${dense ? 'text-2xl' : 'text-4xl'}`}>{killEfficiency.overallAvgKills}</div>
                    <div className="mt-2 flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase ${killEfficiency.trendDirection === 'up' ? 'text-success' : 'text-danger'}`}>
                            {killEfficiency.trendDirection === 'up' ? 'Improving' : 'Declining'}
                        </span>
                        <div className="flex-1 h-3 opacity-50">
                            <SparklineWidget data={killSparkline} color="var(--color-warning)" height={12} />
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Damage Efficiency"
                    icon={<ShieldCheck size={12} />}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-2'}
                    accentColor="bg-danger"
                    onExpand={() => onNavigate('pro')}
                >
                    <div className="flex items-baseline gap-2">
                        <span className="text-success font-black text-2xl">{avgDmgWins}</span>
                        <span className="opacity-25 text-xs font-bold">VS</span>
                        <span className="text-danger font-black text-2xl">{avgDmgLosses}</span>
                    </div>
                    <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide mt-1">Wins vs losses</div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Clutch Factor"
                    icon={<Award size={12} />}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-2'}
                    accentColor="bg-warning"
                    onExpand={() => onNavigate('insights')}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <div className={`font-black text-warning leading-none ${dense ? 'text-2xl' : 'text-4xl'}`}>{clutchWins.length}</div>
                            <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide mt-1">Clutch wins</div>
                        </div>
                        <div className="px-3 py-2 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs font-black">
                            {clutchRate}%
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard title="Top Insights" icon={<Lightbulb size={12} />} onExpand={() => onNavigate('insights')} visualMode={visualMode} className={dense ? 'col-span-2' : 'md:col-span-3'} accentColor="bg-warning">
                    <div className="grid grid-cols-1 gap-2">
                        {insights.slice(0, 3).map((stat, i) => (
                            <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-md-sys-surfaceContainerHigh/70">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black ${stat.color}`}>{i + 1}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] opacity-60 font-black uppercase tracking-wide truncate">{stat.title}</div>
                                    <div className="font-bold text-sm truncate">{stat.value}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </AnalyticsCard>

                <AnalyticsCard title="Social Pulse" icon={<Handshake size={12} />} onExpand={() => onNavigate('social')} visualMode={visualMode} className={dense ? 'col-span-2' : 'md:col-span-3'} accentColor="bg-success">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2 flex items-center gap-1"><Swords size={10} /> Nemeses</div>
                            <div className="space-y-1.5">
                                {socialData.opponents.slice(0, 3).map(([name, stat]: any) => (
                                    <button key={name} onClick={(e) => { e.stopPropagation(); onDrillDown(name, 'Opponent'); }} className="w-full flex justify-between items-center text-xs text-left hover:bg-md-sys-surfaceContainerHigh/60 rounded-lg px-1.5 py-1 transition-colors">
                                        <span className="font-semibold truncate max-w-[70%]">{name}</span>
                                        <span className="font-mono text-[10px] bg-danger/10 text-danger px-1.5 py-0.5 rounded">{Math.round((stat.wins / stat.total) * 100)}%</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2 flex items-center gap-1"><Zap size={10} /> Wingmen</div>
                            <div className="space-y-1.5">
                                {socialData.teammates.slice(0, 3).map(([name, stat]: any) => (
                                    <button key={name} onClick={(e) => { e.stopPropagation(); onDrillDown(name, 'Teammate'); }} className="w-full flex justify-between items-center text-xs text-left hover:bg-md-sys-surfaceContainerHigh/60 rounded-lg px-1.5 py-1 transition-colors">
                                        <span className="font-semibold truncate max-w-[70%]">{name}</span>
                                        <span className="font-mono text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded">{Math.round((stat.wins / stat.total) * 100)}%</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Week Over Week"
                    icon={<BarChart3 size={12} />}
                    onExpand={() => onNavigate('period')}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-2'}
                    accentColor={weekDeltaWR >= 0 ? 'bg-success' : 'bg-danger'}
                >
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <div className={`font-black leading-none ${dense ? 'text-2xl' : 'text-4xl'} ${weekDeltaWR >= 0 ? 'text-success' : 'text-danger'}`}>
                                {weekDeltaWR >= 0 ? '+' : ''}{weekDeltaWR}<span className="text-[0.5em] opacity-50 ml-1">pp</span>
                            </div>
                            <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide mt-1">
                                {thisWeekWR}% vs {lastWeekWR}%
                            </div>
                        </div>
                        <div className="text-right text-[10px] font-bold uppercase tracking-wide opacity-50">
                            <div>WR Delta</div>
                            <div className="opacity-70">Weekly</div>
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Time Window"
                    icon={<Clock size={12} />}
                    onExpand={() => onNavigate('timePatterns')}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-2'}
                    accentColor="bg-info"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className={`font-black leading-none ${dense ? 'text-2xl' : 'text-4xl'}`}>
                                {peakHour}:00
                            </div>
                            <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide mt-1">
                                Peak on {DAY_NAMES[peakDay] || 'N/A'}
                            </div>
                        </div>
                        <div className="text-right text-[10px] font-bold uppercase tracking-wide opacity-50">
                            <div>Rhythm</div>
                            <div className="opacity-70">Patterns</div>
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Placement"
                    icon={<Award size={12} />}
                    onExpand={() => onNavigate('placement')}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-2'}
                    accentColor="bg-warning"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className={`font-black leading-none ${dense ? 'text-2xl' : 'text-4xl'}`}>
                                {placementData?.avgPlacement ?? 0}
                            </div>
                            <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide mt-1">
                                Top quartile {placementData?.topQuartileRate ?? 0}%
                            </div>
                        </div>
                        <div className="text-right text-[10px] font-bold uppercase tracking-wide opacity-50">
                            <div>Avg</div>
                            <div className="opacity-70">Finish</div>
                        </div>
                    </div>
                    {placementBuckets.rows.length > 0 && (
                        <div className="mt-3 grid grid-cols-10 gap-1 items-end h-10" aria-label="Placement distribution">
                            {placementBuckets.rows.map((b) => (
                                <div key={b.placement} className="flex flex-col items-center justify-end gap-1">
                                    <div
                                        className="w-full rounded-sm bg-md-sys-primary/55"
                                        style={{ height: `${Math.max(6, Math.round((b.count / placementBuckets.maxCount) * 40))}px` }}
                                        title={`Place ${b.placement}: ${b.count}`}
                                    />
                                    <div className="text-[8px] font-bold opacity-35">{b.placement}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </AnalyticsCard>

                <AnalyticsCard
                    title="Hazard Analysis"
                    icon={<Globe size={12} />}
                    onExpand={() => onNavigate('environment')}
                    visualMode={visualMode}
                    className={dense ? 'col-span-2' : 'md:col-span-3'}
                    accentColor="bg-info"
                >
                    {hazardSummary.rows.length > 0 ? (
                        <div className="space-y-2">
                            <div className="text-[10px] font-black uppercase tracking-widest opacity-45">
                                Top modifiers (WR vs {hazardSummary.overallWR}% avg)
                            </div>
                            <div className="space-y-2">
                                {hazardSummary.rows.slice(0, 5).map((r) => (
                                    <div key={r.name} className="flex items-center gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-[10px] font-bold truncate opacity-75">{r.name}</div>
                                                <div className="text-[10px] font-black opacity-60">{r.total}x</div>
                                            </div>
                                            <div className="mt-1 h-2 rounded-full bg-md-sys-on-surface/8 overflow-hidden">
                                                <div
                                                    className={`${r.winRate >= 50 ? 'bg-success' : 'bg-danger'} h-full`}
                                                    style={{ width: `${Math.max(2, Math.min(100, r.winRate))}%` }}
                                                    title={`${r.winRate}% WR (${r.impact >= 0 ? '+' : ''}${r.impact}pp)`}
                                                />
                                            </div>
                                        </div>
                                        <div className={`text-[10px] font-black ${r.impact >= 0 ? 'text-success' : 'text-danger'}`} title="Impact vs average win rate">
                                            {r.impact >= 0 ? '+' : ''}{r.impact}pp
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="opacity-45 text-sm font-bold uppercase tracking-wide">No modifier data yet</div>
                    )}
                </AnalyticsCard>

                <AnalyticsCard
                    title="Best Synergy"
                    icon={<Globe size={12} />}
                    onExpand={() => onNavigate('synergy')}
                    visualMode={visualMode}
                    className={dense ? 'col-span-2' : 'md:col-span-3'}
                    accentColor="bg-accent"
                >
                    {bestCombo ? (
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <div className="text-[10px] opacity-60 font-black uppercase tracking-wide truncate">{bestCombo.ship} x {bestCombo.hero}</div>
                                <div className={`font-black leading-tight ${dense ? 'text-xl' : 'text-2xl'}`}>{bestCombo.wr}%</div>
                                <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide">{bestCombo.total} matches</div>
                            </div>
                            <div className="px-3 py-2 rounded-xl md3-surface-high text-[10px] font-black uppercase opacity-60">
                                Combo
                            </div>
                        </div>
                    ) : (
                        <div className="opacity-45 text-sm font-bold uppercase tracking-wide">Not enough synergy data</div>
                    )}
                </AnalyticsCard>

                <AnalyticsCard
                    title="Relationships"
                    icon={<Users size={12} />}
                    onExpand={() => onNavigate('insights')}
                    visualMode={visualMode}
                    className={dense ? 'col-span-2' : 'md:col-span-3'}
                    accentColor="bg-success"
                >
                    {topRelationship ? (
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <div className="text-[10px] opacity-60 font-black uppercase tracking-wide">{topRelationship.type}</div>
                                <div className={`font-black leading-tight truncate ${dense ? 'text-lg' : 'text-xl'}`}>{topRelationship.playerName}</div>
                                <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide">{topRelationship.encounters} encounters</div>
                            </div>
                            <div className="px-3 py-2 rounded-xl md3-surface-high text-[10px] font-black uppercase opacity-60">
                                Top
                            </div>
                        </div>
                    ) : (
                        <div className="opacity-45 text-sm font-bold uppercase tracking-wide">No repeat encounters yet</div>
                    )}
                </AnalyticsCard>
            </div>
        </div>
    );
};
