import React from 'react';
import { AnalyticsView, VisualMode, DrillDownTarget, Insight } from '../../types';
import { AnalyticsCard } from './AnalyticsCard';
import { SparklineWidget } from './SparklineWidget';
import { RelationshipInsight } from '../../utils/analytics';
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
    streakHistory,
    killEfficiency,
    insights,
    socialData,
    filteredMatches,
}) => {
    const dense = visualMode === 'dense';
    const today = sessionSummary.today;
    const scoreColor = momentum.currentMomentum >= 60 ? 'var(--color-success)' : momentum.currentMomentum >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';

    const winRateSparkline = filteredMatches.map((_: any, i: number) => ({
        value: Math.round((filteredMatches.slice(0, i + 1).filter((m: any) => m.result === 'Win').length / (i + 1)) * 100),
    }));
    const momentumSparkline = momentum.timeline.map((p: any) => ({ value: p.score }));
    const killSparkline = killEfficiency.timeline.map((p: any) => ({ value: p.avgKills }));

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

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar animate-fade-in p-2 pb-8">
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

                <AnalyticsCard title="Daily Volume" icon={<Clock size={12} />} visualMode={visualMode} className={dense ? '' : 'md:col-span-2'} accentColor="bg-info">
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

                <AnalyticsCard title="Damage Efficiency" icon={<ShieldCheck size={12} />} visualMode={visualMode} className={dense ? '' : 'md:col-span-2'} accentColor="bg-danger">
                    <div className="flex items-baseline gap-2">
                        <span className="text-success font-black text-2xl">{avgDmgWins}</span>
                        <span className="opacity-25 text-xs font-bold">VS</span>
                        <span className="text-danger font-black text-2xl">{avgDmgLosses}</span>
                    </div>
                    <div className="text-[10px] opacity-45 font-bold uppercase tracking-wide mt-1">Wins vs losses</div>
                </AnalyticsCard>

                <AnalyticsCard title="Clutch Factor" icon={<Award size={12} />} visualMode={visualMode} className={dense ? '' : 'md:col-span-2'} accentColor="bg-warning">
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
                            <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-md-sys-surfaceContainerHigh/70 border border-md-sys-outline/10">
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
            </div>
        </div>
    );
};

