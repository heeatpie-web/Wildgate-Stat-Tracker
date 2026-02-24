import React, { useMemo } from 'react';
import { AnalyticsView, VisualMode, DrillDownTarget, Insight } from '../../types';
import { AnalyticsCard } from './AnalyticsCard';
import { SparklineWidget } from './SparklineWidget';
import { TiltMeter } from '../TiltMeter';
import { RelationshipInsight } from '../../utils/analytics';
import { synthesizeNarrative } from '../../utils/analyticsEditorial';
import {
    Flame,
    Gauge,
    Crosshair,
    Lightbulb,
    Clock3,
    Handshake,
    Trophy,
    Swords,
    Zap,
    Globe,
    Award,
    ArrowRight,
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
    const scoreColor = 'var(--md-sys-color-primary)';
    const todayStart = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }, []);
    const todayTiltMatches = useMemo(
        () => (filteredMatches as any[]).filter((m) => Number(m?.timestamp) >= todayStart),
        [filteredMatches, todayStart]
    );

    const winRateSparkline = useMemo(() => {
        let winCount = 0;
        return filteredMatches.map((m: any, i: number) => {
            if (m.result === 'Win') winCount++;
            return { value: Math.round((winCount / (i + 1)) * 100) };
        });
    }, [filteredMatches]);

    const momentumSparkline = useMemo(() => (momentum.timeline || []).map((p: any) => ({ value: p.score })), [momentum]);
    const killSparkline = useMemo(() => (killEfficiency.timeline || []).map((p: any) => ({ value: p.avgKills })), [killEfficiency]);

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

    const pulseSummary = useMemo(() => {
        const recent = [...(filteredMatches as any[])].slice(-10);
        const recentWins = recent.filter((m) => m.result === 'Win').length;
        const recentWinRate = recent.length > 0 ? Math.round((recentWins / recent.length) * 100) : 0;
        const avgKills = recent.length > 0
            ? (recent.reduce((sum, match) => {
                const kills = Object.values(match?.kills || {}).reduce((kSum: number, val) => kSum + (Number(val) || 0), 0);
                return sum + kills;
            }, 0) / recent.length)
            : 0;
        const weekDelta = Number(periodComparison?.weekDelta?.winRate || 0);
        const thisWeekCount = Number(periodComparison?.thisWeek?.matches || 0);
        const lastWeekCount = Number(periodComparison?.lastWeek?.matches || 0);
        const weekDeltaReliable = thisWeekCount >= 3 && lastWeekCount >= 3;
        const topHour = (timePatterns?.byHour || []).reduce((best: any, point: any) => {
            if (!best) return point;
            if ((point.matches || 0) > (best.matches || 0)) return point;
            return best;
        }, null);
        return {
            recentWinRate,
            avgKills: Number(avgKills.toFixed(1)),
            weekDelta,
            weekDeltaReliable,
            topHourLabel: topHour ? `${topHour.hour}:00` : '--',
            topHourMatches: topHour ? Number(topHour.matches || 0) : 0,
        };
    }, [filteredMatches, periodComparison, timePatterns]);

    const topInsights: Insight[] = [];
    const insightsRow = useMemo(
        () => [...(insights || [])].sort((a, b) => b.priority - a.priority).slice(0, dense ? 4 : 6),
        [insights, dense]
    );
    const getInsightToneClasses = (tone: Insight['tone']) => {
        switch (tone) {
            case 'success':
                return 'bg-success/10 border-success/25 text-success';
            case 'danger':
                return 'bg-danger/10 border-danger/25 text-danger';
            case 'warning':
                return 'bg-warning-soft border-warning-soft text-warning';
            case 'info':
                return 'bg-info-soft border-info-soft text-info';
            case 'accent':
                return 'bg-accent-soft border-accent-soft text-accent';
            case 'primary':
                return 'bg-md-sys-primary/10 border-md-sys-primary/25 text-md-sys-primary';
            case 'secondary':
                return 'bg-md-sys-secondary/10 border-md-sys-secondary/25 text-md-sys-secondary';
            case 'neutral':
            default:
                return 'bg-md-sys-on-surface/6 border-md-sys-outline/20 text-md-sys-on-surface';
        }
    };

    const editorial = useMemo(() => {
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
    }, [filteredMatches, winRate, currentStreak, momentum, sessionSummary, periodComparison, timePatterns, killEfficiency, socialData, synergyMatrix]);

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar animate-fade-in p-2 pb-8">
            <div className={`grid gap-5 ${dense ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-6'}`}>

                {/* Row 1: Hero */}
                <AnalyticsCard
                    title="Win Rate"
                    icon={<Trophy size={dense ? 12 : 14} />}
                    visualMode={visualMode}
                    className={dense ? 'col-span-2 lg:col-span-2' : 'md:col-span-2'}
                    accentColor="bg-md-sys-primary"
                    onExpand={() => onNavigate('session')}
                >
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-shrink-0">
                            <div className={`font-bold tracking-tighter leading-none text-md-sys-primary ${dense ? 'text-4xl' : 'text-6xl'}`}>
                                {winRate}<span className="text-half-em text-md-sys-on-surface/60 ml-1">%</span>
                            </div>
                            <div className={`mt-1 font-semibold text-md-sys-on-surface/60 uppercase tracking-widest ${dense ? 'text-label-xs' : 'text-label-sm'}`}>
                                {totalMatches} tracked matches
                            </div>
                        </div>
                        <div className="flex-1 h-14">
                            <SparklineWidget data={winRateSparkline} color="var(--md-sys-color-primary)" height={dense ? 38 : 56} />
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Streak"
                    icon={<Flame size={12} />}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-1'}
                    accentColor="bg-md-sys-secondary"
                    onExpand={() => onNavigate('streaks')}
                >
                    <div className="flex flex-col h-full justify-between">
                        <div className={`font-bold text-md-sys-primary leading-none ${dense ? 'text-2xl' : 'text-4xl'}`}>{currentStreak}</div>
                        <div className="text-right text-label-sm font-semibold uppercase tracking-wide">
                            <div className="text-md-sys-primary">Best {streakHistory.longestWinStreak}W</div>
                            <div className="text-md-sys-on-surface/60">Worst {streakHistory.longestLossStreak}L</div>
                        </div>
                    </div>
                </AnalyticsCard>

                <div className={dense ? 'col-span-2 lg:col-span-2' : 'md:col-span-3'}>
                    <TiltMeter recentMatches={todayTiltMatches.slice(-5)} />
                </div>

                {/* Narrative Insight */}
                {!dense && editorial && (
                    <AnalyticsCard
                        title="Narrative Insight"
                        icon={<Lightbulb size={12} />}
                        visualMode={visualMode}
                        className="md:col-span-3"
                        accentColor="bg-md-sys-primary"
                        onExpand={() => onNavigate('essay')}
                    >
                        <div className="flex flex-col justify-between h-full">
                            <div>
                                <div className="text-lg font-bold leading-tight text-md-sys-on-surface mb-2">
                                    {editorial.headline}
                                </div>
                                <div className="text-body-sm text-md-sys-on-surface/70 line-clamp-2">
                                    {editorial.sections[0]?.title && <span className="font-semibold text-md-sys-primary mr-2">{editorial.sections[0].title}:</span>}
                                    {editorial.sections[0]?.body}
                                </div>
                            </div>
                            <div className="mt-4 flex justify-end">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onNavigate('essay');
                                    }}
                                    className="text-label-sm font-bold uppercase tracking-wide text-md-sys-primary hover:text-md-sys-primary/80 flex items-center gap-1"
                                >
                                    Read Full Analysis <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    </AnalyticsCard>
                )}

                {!dense && (
                    <AnalyticsCard
                        title="Operational Snapshot"
                        icon={<Clock3 size={12} />}
                        visualMode={visualMode}
                        className="md:col-span-3"
                        accentColor="bg-md-sys-tertiary"
                        onExpand={() => onNavigate('timePatterns')}
                    >
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-control bg-md-sys-on-surface/6 p-2.5">
                                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/40">Last 10</div>
                                <div className="text-title font-bold text-md-sys-on-surface">{pulseSummary.recentWinRate}% WR</div>
                                <div className="text-label-sm text-md-sys-on-surface/55">{pulseSummary.avgKills} avg kills</div>
                            </div>
                            <div className="rounded-control bg-md-sys-on-surface/6 p-2.5">
                                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/40">Weekly Delta</div>
                                {pulseSummary.weekDeltaReliable ? (
                                    <div className={`text-title font-bold ${pulseSummary.weekDelta >= 0 ? 'text-md-sys-primary' : 'text-md-sys-on-surface/60'}`}>
                                        {pulseSummary.weekDelta >= 0 ? '+' : ''}{pulseSummary.weekDelta}pp
                                    </div>
                                ) : (
                                    <div className="text-title font-bold text-md-sys-on-surface/40">N/A</div>
                                )}
                                <div className="text-label-sm text-md-sys-on-surface/55">{pulseSummary.weekDeltaReliable ? 'Win-rate trend' : 'Need 3+ matches/week'}</div>
                            </div>
                            <div className="rounded-control bg-md-sys-on-surface/6 p-2.5">
                                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/40">Peak Window</div>
                                <div className="text-title font-bold text-md-sys-on-surface">{pulseSummary.topHourLabel}</div>
                                <div className="text-label-sm text-md-sys-on-surface/55">{pulseSummary.topHourMatches} matches</div>
                            </div>
                        </div>
                    </AnalyticsCard>
                )}

                {!dense && topInsights.length > 0 && (
                    <AnalyticsCard
                        title="Priority Insights"
                        icon={<Lightbulb size={12} />}
                        visualMode={visualMode}
                        className="md:col-span-3"
                        accentColor="bg-md-sys-secondary"
                        onExpand={() => onNavigate('insights')}
                    >
                        <div className="space-y-2">
                            {topInsights.map((insight) => (
                                <div
                                    key={`${insight.title}_${insight.value}`}
                                    className={`rounded-control border p-2.5 ${getInsightToneClasses(insight.tone)}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-label-sm font-bold truncate">{insight.title}</div>
                                        <div className="text-label-sm font-bold">{insight.value}</div>
                                    </div>
                                    <div className="text-label-sm opacity-75">{insight.subtitle || insight.subValue}</div>
                                </div>
                            ))}
                        </div>
                    </AnalyticsCard>
                )}

                {/* Row 2: Trends */}
                <AnalyticsCard
                    title="Momentum"
                    icon={<Gauge size={12} />}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-3'}
                    accentColor="bg-md-sys-primary"
                    onExpand={() => onNavigate('momentum')}
                >
                    <div className="flex items-end justify-between">
                        <div>
                            <div className={`font-bold leading-none ${dense ? 'text-2xl' : 'text-4xl'}`} style={{ color: scoreColor }}>{momentum.currentMomentum}</div>
                            <div className="text-label-sm text-md-sys-on-surface/40 font-semibold uppercase tracking-wide mt-1">Peak {momentum.peakMomentum}</div>
                        </div>
                        <div className="flex-1 h-8 ml-4">
                            <SparklineWidget data={momentumSparkline} color={scoreColor} height={dense ? 24 : 32} />
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Kill Efficiency"
                    icon={<Crosshair size={12} />}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-3'}
                    accentColor="bg-md-sys-secondary"
                    onExpand={() => onNavigate('killEfficiency')}
                >
                    <div className="flex items-end justify-between">
                        <div>
                            <div className={`font-bold text-md-sys-primary leading-none ${dense ? 'text-2xl' : 'text-4xl'}`}>{killEfficiency.overallAvgKills}</div>
                            <div className={`mt-1 text-label-sm font-semibold uppercase ${killEfficiency.trendDirection === 'up' ? 'text-md-sys-primary' : 'text-md-sys-on-surface/60'}`}>
                                {killEfficiency.trendDirection === 'up' ? 'Improving' : 'Declining'}
                            </div>
                        </div>
                        <div className="flex-1 h-8 ml-4 text-md-sys-on-surface/60">
                            <SparklineWidget data={killSparkline} color="var(--md-sys-color-primary)" height={32} />
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Insights"
                    icon={<Lightbulb size={12} />}
                    visualMode={visualMode}
                    className={dense ? 'col-span-2 lg:col-span-4' : 'md:col-span-6'}
                    accentColor="bg-md-sys-secondary"
                    onExpand={() => onNavigate('insights')}
                >
                    {insightsRow.length > 0 ? (
                        <div className={`grid gap-2 ${dense ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-6'}`}>
                            {insightsRow.map((insight) => (
                                <div
                                    key={`${insight.title}_${insight.value}_${insight.subtitle}`}
                                    onClick={() => onNavigate('insights')}
                                    className={`rounded-control border p-2.5 min-w-0 transition-all hover:scale-101 cursor-pointer hover:ring-1 hover:ring-md-sys-primary/20 ${getInsightToneClasses(insight.tone)}`}
                                >
                                    <div className="text-label-xs font-bold uppercase tracking-widest opacity-70 truncate">{insight.subtitle || insight.title}</div>
                                    <div className="text-body font-black truncate mt-1">{insight.value}</div>
                                    <div className="text-label-sm opacity-75 truncate mt-1">{insight.subValue || insight.title}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-control bg-md-sys-on-surface/6 p-3 text-label-sm text-md-sys-on-surface/60">
                            No insights available yet for this filter range.
                        </div>
                    )}
                </AnalyticsCard>

                {/* Row 3: Context */}
                <AnalyticsCard
                    title="Social Pulse"
                    icon={<Handshake size={12} />}
                    onExpand={() => onNavigate('social')}
                    visualMode={visualMode}
                    className={dense ? 'col-span-2' : 'md:col-span-2'}
                    accentColor="bg-md-sys-secondary"
                >
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-label-xs font-semibold uppercase tracking-widest text-md-sys-on-surface/40 mb-2 flex items-center gap-1"><Swords size={10} /> Nemeses</div>
                            <div className="space-y-1.5">
                                {socialData.opponents.slice(0, 3).map(([name, stat]: any) => (
                                    <button key={name} onClick={(e) => { e.stopPropagation(); onDrillDown(name, 'Opponent'); }} className="w-full flex justify-between items-center text-label-sm text-left hover:bg-md-sys-surfaceContainerHigh/60 rounded-lg px-1.5 py-1 transition-colors">
                                        <span className="font-semibold truncate max-w-70p">{name}</span>
                                        <span className="font-mono text-label-sm bg-md-sys-on-surface/10 text-md-sys-on-surface/60 px-1.5 py-0.5 rounded">{Math.round((stat.wins / stat.total) * 100)}%</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="text-label-xs font-semibold uppercase tracking-widest text-md-sys-on-surface/40 mb-2 flex items-center gap-1"><Zap size={10} /> Wingmen</div>
                            <div className="space-y-1.5">
                                {socialData.teammates.slice(0, 3).map(([name, stat]: any) => (
                                    <button key={name} onClick={(e) => { e.stopPropagation(); onDrillDown(name, 'Teammate'); }} className="w-full flex justify-between items-center text-label-sm text-left hover:bg-md-sys-surfaceContainerHigh/60 rounded-lg px-1.5 py-1 transition-colors">
                                        <span className="font-semibold truncate max-w-70p">{name}</span>
                                        <span className="font-mono text-label-sm bg-md-sys-primary/10 text-md-sys-primary px-1.5 py-0.5 rounded">{Math.round((stat.wins / stat.total) * 100)}%</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </AnalyticsCard>

                <AnalyticsCard
                    title="Placement"
                    icon={<Award size={12} />}
                    onExpand={() => onNavigate('placement')}
                    visualMode={visualMode}
                    className={dense ? '' : 'md:col-span-2'}
                    accentColor="bg-md-sys-primary"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className={`font-bold leading-none ${dense ? 'text-2xl' : 'text-4xl'}`}>
                                {placementData?.avgPlacement ?? 0}
                            </div>
                            <div className="text-label-sm text-md-sys-on-surface/40 font-semibold uppercase tracking-wide mt-1">
                                Top quartile {placementData?.topQuartileRate ?? 0}%
                            </div>
                        </div>
                    </div>
                    {placementBuckets.rows.length > 0 && (
                        <div className="mt-3 grid grid-cols-10 gap-1 items-end h-10" aria-label="Placement distribution">
                            {placementBuckets.rows.map((b) => (
                                <div key={b.placement} className="flex flex-col items-center justify-end gap-1">
                                    <div
                                        className={`w-full rounded-sm ${b.placement <= 3
                                            ? 'bg-md-sys-primary'
                                            : b.placement <= 6
                                                ? 'bg-md-sys-secondary'
                                                : b.placement <= 10
                                                    ? 'bg-md-sys-secondaryContainer'
                                                    : 'bg-md-sys-on-surface/10'
                                            }`}
                                        style={{ height: `${Math.max(6, Math.round((b.count / placementBuckets.maxCount) * 40))}px` }}
                                        title={`Place ${b.placement}: ${b.count}`}
                                    />
                                    <div className="text-label-xs font-semibold text-md-sys-on-surface/40">{b.placement}</div>
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
                    className={dense ? 'col-span-2' : 'md:col-span-2'}
                    accentColor="bg-md-sys-tertiary"
                >
                    {hazardSummary.rows.length > 0 ? (
                        <div className="space-y-2">
                            <div className="text-label-sm font-semibold uppercase tracking-widest text-md-sys-on-surface/40">
                                Top modifiers (WR vs {hazardSummary.overallWR}% avg)
                            </div>
                            <div className="space-y-2">
                                {hazardSummary.rows.slice(0, 3).map((r) => (
                                    <div key={r.name} className="flex items-center gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-label-sm font-semibold truncate text-md-sys-on-surface/60">{r.name}</div>
                                                <div className="text-label-sm font-bold text-md-sys-on-surface/60">{r.total}x</div>
                                            </div>
                                            <div className="mt-1 h-2 rounded-full bg-md-sys-on-surface/8 overflow-hidden">
                                                <div
                                                    className={`${r.winRate >= 50 ? 'bg-md-sys-primary' : 'bg-md-sys-on-surface/20'} h-full`}
                                                    style={{ width: `${Math.max(2, Math.min(100, r.winRate))}%` }}
                                                    title={`${r.winRate}% WR (${r.impact >= 0 ? '+' : ''}${r.impact}pp)`}
                                                />
                                            </div>
                                        </div>
                                        <div className={`text-label-sm font-bold ${r.impact >= 0 ? 'text-md-sys-primary' : 'text-md-sys-on-surface/60'}`} title="Impact vs average win rate">
                                            {r.impact >= 0 ? '+' : ''}{r.impact}pp
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-md-sys-on-surface/40 text-body font-semibold uppercase tracking-wide">No modifier data yet</div>
                    )}
                </AnalyticsCard>
            </div>
        </div>
    );
};
