import React from 'react';
import { AnalyticsView, VisualMode, DrillDownTarget, Insight } from '../../types';
import { AnalyticsCard } from './AnalyticsCard';
import { SparklineWidget } from './SparklineWidget';
import { RelationshipInsight } from '../../utils/analytics';
import {
    Calendar, Gauge, ArrowLeftRight, Clock, Flame, Crosshair, Medal,
    Lightbulb, Handshake, Trophy, Swords, Zap, TrendingUp, TrendingDown, Minus,
    Skull, Ghost, Rocket, ShieldCheck, Award
} from 'lucide-react';

interface AnalyticsDashboardProps {
    visualMode: VisualMode;
    onNavigate: (view: AnalyticsView) => void;
    onDrillDown: (name: string, type: DrillDownTarget['type']) => void;
    // Data
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
    visualMode, onNavigate, onDrillDown,
    winRate, currentStreak, totalMatches, avgSortiesPerDay,
    sessionSummary, momentum, periodComparison, timePatterns,
    streakHistory, killEfficiency, placementData, insights,
    socialData, relationshipInsights, filteredMatches,
}) => {
    const dense = visualMode === 'dense';

    // Build sparkline data from filtered matches (rolling win rate)
    const winRateSparkline = filteredMatches.map((_: any, i: number) => ({
        value: Math.round((filteredMatches.slice(0, i + 1).filter((m: any) => m.result === 'Win').length / (i + 1)) * 100),
    }));

    const streakSparkline = streakHistory.timeline.map((p: any) => ({ value: p.streak }));
    const momentumSparkline = momentum.timeline.map((p: any) => ({ value: p.score }));
    const killSparkline = killEfficiency.timeline.map((p: any) => ({ value: p.avgKills }));

    const today = sessionSummary.today;
    const scoreColor = momentum.currentMomentum >= 60 ? '#22c55e' : momentum.currentMomentum >= 40 ? '#f97316' : '#ef4444';

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            <div className={`grid gap-3 ${dense ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>

                {/* 1. Session Summary */}
                <AnalyticsCard title="Today's Session" icon={<Calendar size={dense ? 10 : 12} />} onExpand={() => onNavigate('session')} visualMode={visualMode} accentColor="bg-blue-500">
                    {today ? (
                        <div>
                            <div className={`font-black ${dense ? 'text-xl' : 'text-3xl'}`}>
                                <span className="text-green-500">{today.wins}</span>
                                <span className="opacity-40 mx-0.5">-</span>
                                <span className="text-red-500">{today.losses}</span>
                            </div>
                            <div className={`font-black opacity-60 ${dense ? 'text-[10px]' : 'text-xs'}`}>{today.winRate}% WR - {today.totalKills} kills</div>
                            {sessionSummary.yesterday && (
                                <div className={`mt-1 ${dense ? 'text-[9px]' : 'text-[10px]'} font-bold`}>
                                    <span className={today.winRate > sessionSummary.yesterday.winRate ? 'text-green-500' : today.winRate < sessionSummary.yesterday.winRate ? 'text-red-500' : 'opacity-40'}>
                                        {today.winRate > sessionSummary.yesterday.winRate ? '+' : ''}{today.winRate - sessionSummary.yesterday.winRate}% vs yesterday
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={`opacity-40 font-bold uppercase ${dense ? 'text-[9px]' : 'text-xs'}`}>No matches today</div>
                    )}
                </AnalyticsCard>

                {/* 2. KPI Row: Win Rate */}
                <AnalyticsCard title="Win Rate" icon={<Trophy size={dense ? 10 : 12} />} visualMode={visualMode} accentColor={winRate >= 50 ? 'bg-green-500' : 'bg-red-500'}>
                    <div className={`font-black tracking-tighter ${winRate >= 50 ? 'text-green-500' : 'text-red-500'} ${dense ? 'text-2xl' : 'text-3xl'}`}>{winRate}%</div>
                    {dense && <SparklineWidget data={winRateSparkline} color={winRate >= 50 ? '#22c55e' : '#ef4444'} height={24} />}
                    <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>{totalMatches} matches</div>
                </AnalyticsCard>

                {/* KPI: Active Streak */}
                <AnalyticsCard title="Active Streak" icon={<Flame size={dense ? 10 : 12} />} onExpand={() => onNavigate('streaks')} visualMode={visualMode} accentColor="bg-orange-500">
                    <div className={`font-black text-orange-500 tracking-tighter ${dense ? 'text-2xl' : 'text-3xl'}`}>{currentStreak}</div>
                    {dense && <SparklineWidget data={streakSparkline} color="#f97316" height={24} />}
                    <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>
                        Best: {streakHistory.longestWinStreak}W / {streakHistory.longestLossStreak}L
                    </div>
                </AnalyticsCard>

                {/* KPI: Daily Avg */}
                <AnalyticsCard title="Daily Average" icon={<Zap size={dense ? 10 : 12} />} visualMode={visualMode} accentColor="bg-blue-500">
                    <div className={`font-black text-blue-400 tracking-tighter ${dense ? 'text-2xl' : 'text-3xl'}`}>{avgSortiesPerDay}</div>
                    <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>matches per day</div>
                </AnalyticsCard>

                {/* 3. Performance Momentum */}
                <AnalyticsCard title="Momentum" icon={<Gauge size={dense ? 10 : 12} />} onExpand={() => onNavigate('momentum')} visualMode={visualMode} accentColor="bg-purple-500">
                    <div className="flex items-end gap-2">
                        <div className={`font-black ${dense ? 'text-2xl' : 'text-3xl'}`} style={{ color: scoreColor }}>{momentum.currentMomentum}</div>
                        <span className={`text-[10px] font-black mb-1 ${momentum.trend === 'rising' ? 'text-green-500' : momentum.trend === 'falling' ? 'text-red-500' : 'opacity-40'}`}>
                            {momentum.trend === 'rising' ? '↑' : momentum.trend === 'falling' ? '↓' : '→'}
                        </span>
                    </div>
                    {dense && <SparklineWidget data={momentumSparkline} color={scoreColor} height={24} />}
                    <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>Peak: {momentum.peakMomentum}</div>
                </AnalyticsCard>

                {/* 4. Period Comparison */}
                <AnalyticsCard title="This Week" icon={<ArrowLeftRight size={dense ? 10 : 12} />} onExpand={() => onNavigate('period')} visualMode={visualMode} accentColor="bg-cyan-500">
                    <div className={`font-black ${periodComparison.thisWeek.winRate >= 50 ? 'text-green-500' : 'text-red-500'} ${dense ? 'text-xl' : 'text-2xl'}`}>
                        {periodComparison.thisWeek.winRate}%
                    </div>
                    <div className={`font-bold ${dense ? 'text-[9px]' : 'text-[10px]'}`}>
                        <span className={periodComparison.weekDelta.winRate > 0 ? 'text-green-500' : periodComparison.weekDelta.winRate < 0 ? 'text-red-500' : 'opacity-40'}>
                            {periodComparison.weekDelta.winRate > 0 ? '+' : ''}{periodComparison.weekDelta.winRate}% vs last week
                        </span>
                    </div>
                </AnalyticsCard>

                {/* 5. Time Patterns (mini heatmap) */}
                <AnalyticsCard title="Time Patterns" icon={<Clock size={dense ? 10 : 12} />} onExpand={() => onNavigate('timePatterns')} visualMode={visualMode} accentColor="bg-indigo-500">
                    <div className={`font-black text-md-sys-primary ${dense ? 'text-lg' : 'text-xl'}`}>
                        Peak: {timePatterns.peakHour}:00
                    </div>
                    <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>
                        Best day: {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][timePatterns.peakDay]}
                    </div>
                    {/* Mini heatmap preview */}
                    {dense && (
                        <div className="grid grid-cols-7 gap-0.5 mt-1">
                            {timePatterns.byDayOfWeek.map((d: any) => (
                                <div key={d.day} className="aspect-square rounded-sm" style={{ backgroundColor: `rgba(99,102,241,${Math.min(1, d.matches / 10 * 0.8 + 0.1)})` }} title={`${d.dayName}: ${d.matches}`}></div>
                            ))}
                        </div>
                    )}
                </AnalyticsCard>

                {/* 6. Streak Timeline */}
                <AnalyticsCard title="Streaks" icon={<Flame size={dense ? 10 : 12} />} onExpand={() => onNavigate('streaks')} visualMode={visualMode} accentColor="bg-orange-500">
                    {dense && <SparklineWidget data={streakSparkline} color="#f97316" height={32} />}
                    {!dense && (
                        <div className={`font-black text-2xl`}>
                            <span className="text-green-500">+{streakHistory.longestWinStreak}</span>
                            <span className="opacity-30 mx-1">/</span>
                            <span className="text-red-500">-{streakHistory.longestLossStreak}</span>
                        </div>
                    )}
                    <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>Avg: {streakHistory.averageStreakLength}</div>
                </AnalyticsCard>

                {/* 7. Kill Efficiency */}
                <AnalyticsCard title="Kill Efficiency" icon={<Crosshair size={dense ? 10 : 12} />} onExpand={() => onNavigate('killEfficiency')} visualMode={visualMode} accentColor="bg-red-500">
                    <div className="flex items-end gap-2">
                        <div className={`font-black text-orange-500 ${dense ? 'text-xl' : 'text-2xl'}`}>{killEfficiency.overallAvgKills}</div>
                        <span className={`text-[10px] font-black mb-1 ${killEfficiency.trendDirection === 'up' ? 'text-green-500' : killEfficiency.trendDirection === 'down' ? 'text-red-500' : 'opacity-40'}`}>
                            {killEfficiency.trendDirection === 'up' ? '↑' : killEfficiency.trendDirection === 'down' ? '↓' : '→'}
                        </span>
                    </div>
                    {dense && <SparklineWidget data={killSparkline} color="#f97316" height={24} />}
                    <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>avg kills/match</div>
                </AnalyticsCard>

                {/* 8. Placement (conditional) */}
                {placementData && (
                    <AnalyticsCard title="Placement" icon={<Medal size={dense ? 10 : 12} />} onExpand={() => onNavigate('placement')} visualMode={visualMode} accentColor="bg-amber-500">
                        <div className={`font-black text-md-sys-primary ${dense ? 'text-xl' : 'text-2xl'}`}>Avg #{placementData.avgPlacement}</div>
                        {/* Mini histogram */}
                        {dense && (
                            <div className="flex items-end gap-0.5 h-6 mt-1">
                                {placementData.distribution.slice(0, 8).map((b: any, i: number) => (
                                    <div key={i} className="flex-1 bg-md-sys-primary rounded-t-sm" style={{ height: `${Math.max(10, (b.count / Math.max(1, ...placementData.distribution.map((d: any) => d.count))) * 100)}%`, opacity: 0.4 + (b.count / Math.max(1, ...placementData.distribution.map((d: any) => d.count))) * 0.6 }}></div>
                                ))}
                            </div>
                        )}
                        <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>Top 25%: {placementData.topQuartileRate}%</div>
                    </AnalyticsCard>
                )}

                {/* Damage Efficiency */}
                <AnalyticsCard title="Damage Efficiency" icon={<ShieldCheck size={dense ? 10 : 12} />} visualMode={visualMode} accentColor="bg-rose-500">
                    {(() => {
                        const wins = filteredMatches.filter((m: any) => m.result === 'Win');
                        const losses = filteredMatches.filter((m: any) => m.result === 'Loss');
                        const avgDmgWins = wins.length > 0 ? Math.round(wins.reduce((a: number, m: any) => a + (Number(m.damageTaken) || 0), 0) / wins.length) : 0;
                        const avgDmgLosses = losses.length > 0 ? Math.round(losses.reduce((a: number, m: any) => a + (Number(m.damageTaken) || 0), 0) / losses.length) : 0;
                        return (
                            <div>
                                <div className={`flex gap-2 items-end ${dense ? 'text-sm' : 'text-lg'}`}>
                                    <span className="text-green-500 font-black">{avgDmgWins}</span>
                                    <span className="opacity-30 text-xs">vs</span>
                                    <span className="text-red-500 font-black">{avgDmgLosses}</span>
                                </div>
                                <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>avg dmg in wins vs losses</div>
                            </div>
                        );
                    })()}
                </AnalyticsCard>

                {/* Clutch Factor */}
                <AnalyticsCard title="Clutch Factor" icon={<Award size={dense ? 10 : 12} />} visualMode={visualMode} accentColor="bg-amber-500">
                    {(() => {
                        const clutchWins = filteredMatches.filter((m: any) => {
                            if (m.result !== 'Win') return false;
                            const totalKills = Object.values(m.kills || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
                            const mins = m.time ? parseInt(m.time.split(':')[0]) || 0 : 0;
                            return totalKills > 3 || mins > 8;
                        });
                        const rate = filteredMatches.length > 0 ? Math.round((clutchWins.length / filteredMatches.length) * 100) : 0;
                        return (
                            <div>
                                <div className={`font-black text-amber-500 ${dense ? 'text-xl' : 'text-2xl'}`}>{clutchWins.length}</div>
                                <div className={`font-bold opacity-40 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>{rate}% of matches are clutch wins</div>
                            </div>
                        );
                    })()}
                </AnalyticsCard>

                {/* 9. Top Insights */}
                <AnalyticsCard title="Top Insights" icon={<Lightbulb size={dense ? 10 : 12} />} onExpand={() => onNavigate('insights')} visualMode={visualMode} className={dense ? '' : 'md:col-span-2'} accentColor="bg-yellow-500">
                    {insights.length > 0 ? (
                        <div className={`flex flex-col ${dense ? 'gap-1.5' : 'gap-3'}`}>
                            {insights.slice(0, 3).map((stat, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 ${stat.color}`}>{i + 1}</div>
                                    <div className="overflow-hidden">
                                        <div className={`font-black truncate ${dense ? 'text-[10px]' : 'text-xs'}`}>{stat.title}: {stat.value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={`opacity-40 font-bold uppercase ${dense ? 'text-[9px]' : 'text-xs'}`}>Need more data</div>
                    )}
                </AnalyticsCard>

                {/* 10. Social Preview */}
                <AnalyticsCard title="Social" icon={<Handshake size={dense ? 10 : 12} />} onExpand={() => onNavigate('social')} visualMode={visualMode} className={dense ? '' : 'md:col-span-2'} accentColor="bg-green-500">
                    <div className={`grid gap-2 ${dense ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
                        {/* Top Rivals */}
                        <div>
                            <div className={`font-black uppercase opacity-40 mb-1 ${dense ? 'text-[8px]' : 'text-[9px]'}`}><Swords size={8} className="inline mr-1" />Rivals</div>
                            {socialData.opponents.slice(0, dense ? 3 : 5).map(([name, stat]: any, i: number) => (
                                <div key={name} onClick={(e) => { e.stopPropagation(); onDrillDown(name, 'Opponent'); }}
                                    className={`flex justify-between items-center cursor-pointer hover:opacity-80 ${dense ? 'text-[9px] py-0.5' : 'text-xs py-1'}`}>
                                    <span className="font-bold truncate max-w-[60%]">{name}</span>
                                    <span className="font-mono opacity-60">{Math.round((stat.wins / stat.total) * 100)}%</span>
                                </div>
                            ))}
                            {socialData.opponents.length === 0 && <div className="text-[9px] opacity-30">No data</div>}
                        </div>
                        {/* Top Wingmen */}
                        <div>
                            <div className={`font-black uppercase opacity-40 mb-1 ${dense ? 'text-[8px]' : 'text-[9px]'}`}><Handshake size={8} className="inline mr-1" />Wingmen</div>
                            {socialData.teammates.slice(0, dense ? 3 : 5).map(([name, stat]: any, i: number) => (
                                <div key={name} onClick={(e) => { e.stopPropagation(); onDrillDown(name, 'Teammate'); }}
                                    className={`flex justify-between items-center cursor-pointer hover:opacity-80 ${dense ? 'text-[9px] py-0.5' : 'text-xs py-1'}`}>
                                    <span className="font-bold truncate max-w-[60%]">{name}</span>
                                    <span className="font-mono opacity-60">{Math.round((stat.wins / stat.total) * 100)}%</span>
                                </div>
                            ))}
                            {socialData.teammates.length === 0 && <div className="text-[9px] opacity-30">No data</div>}
                        </div>
                    </div>
                </AnalyticsCard>
            </div>
        </div>
    );
};
