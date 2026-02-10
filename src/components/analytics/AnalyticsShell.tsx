import React, { useState } from 'react';
import { AnalyticsView, AnalyticsTimeRange, DrillDownTarget } from '../../types';
import { Activity, ArrowLeft, Gauge, Lightbulb, Handshake, BarChart3, Globe, Flame, PenSquare } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';
import { TRANSLATIONS } from '../../utils/translations';
import { useAnalyticsData } from './useAnalyticsData';
import { InlineNarrativeToggle } from './DenseEditorialToggle';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { ProView } from './ProView';
import { EnvironmentView } from './EnvironmentView';
import { SynergyView } from './SynergyView';
import { InsightsView } from './InsightsView';
import { SocialView } from './SocialView';
import { TimePatternView } from './TimePatternView';
import { StreakTimelineView } from './StreakTimelineView';
import { SessionSummaryView } from './SessionSummaryView';
import { PeriodComparisonView } from './PeriodComparisonView';
import { KillEfficiencyView } from './KillEfficiencyView';
import { PlacementDistView } from './PlacementDistView';
import { MomentumView } from './MomentumView';
import { VisualEssayView } from './VisualEssayView';

const VIEW_LABELS: Record<AnalyticsView, string> = {
    overview: 'Overview',
    session: 'Session Summary',
    momentum: 'Performance Momentum',
    period: 'Period Comparison',
    timePatterns: 'Time Patterns',
    streaks: 'Streak Timeline',
    killEfficiency: 'Kill Efficiency',
    placement: 'Placement Distribution',
    insights: 'Insights',
    social: 'Social',
    pro: 'Detailed Analysis',
    environment: 'Hazard Analysis',
    synergy: 'Synergy Matrix',
    essay: 'Visual Essay',
};

const TIME_RANGE_OPTIONS: { value: AnalyticsTimeRange; label: string }[] = [
    { value: 'all', label: 'All Time' },
    { value: 'month', label: 'Month' },
    { value: 'week', label: 'Week' },
    { value: 'today', label: 'Today' },
    { value: 'lastN', label: 'Last 20' },
];

const QUICK_VIEWS: { view: AnalyticsView; icon: React.ReactNode }[] = [
    { view: 'momentum', icon: <Gauge size={12} /> },
    { view: 'insights', icon: <Lightbulb size={12} /> },
    { view: 'social', icon: <Handshake size={12} /> },
    { view: 'pro', icon: <BarChart3 size={12} /> },
    { view: 'environment', icon: <Globe size={12} /> },
    { view: 'streaks', icon: <Flame size={12} /> },
    { view: 'essay', icon: <PenSquare size={12} /> },
];

export const AnalyticsShell: React.FC = () => {
    const { setDrillDownTarget } = useGameData();
    const { activeMode: currentMode, activeUser: currentUser } = useUIState();
    const { language, visualMode, setVisualMode } = useUserPreferences();
    const t = TRANSLATIONS[language];

    const [currentView, setCurrentView] = useState<AnalyticsView>('overview');
    const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('all');
    const [lastN] = useState(20);

    const data = useAnalyticsData(timeRange, lastN, currentView);

    const onDrillDown = (name: string, type: DrillDownTarget['type']) => {
        setDrillDownTarget({ name, type });
    };

    const navigateTo = (view: AnalyticsView) => setCurrentView(view);
    const goBack = () => setCurrentView('overview');

    const renderExpandedView = () => {
        switch (currentView) {
            case 'session': return <SessionSummaryView data={data.sessionSummary} visualMode={visualMode} />;
            case 'momentum': return <MomentumView data={data.momentum} visualMode={visualMode} />;
            case 'period': return <PeriodComparisonView data={data.periodComparison} visualMode={visualMode} />;
            case 'timePatterns': return <TimePatternView data={data.timePatterns} visualMode={visualMode} />;
            case 'streaks': return <StreakTimelineView data={data.streakHistory} visualMode={visualMode} />;
            case 'killEfficiency': return <KillEfficiencyView data={data.killEfficiency} visualMode={visualMode} />;
            case 'placement': return <PlacementDistView data={data.placementData} visualMode={visualMode} />;
            case 'insights': return <InsightsView insights={data.insights} relationshipInsights={data.relationshipInsights} filteredMatches={data.filteredMatches} onDrillDown={onDrillDown} visualMode={visualMode} />;
            case 'social': return <SocialView socialData={data.socialData} filteredMatches={data.filteredMatches} currentUser={currentUser} playerProfiles={data.playerProfiles} onDrillDown={onDrillDown} visualMode={visualMode} />;
            case 'pro': return <ProView matches={data.filteredMatches} visualMode={visualMode} />;
            case 'environment': return <EnvironmentView matches={data.filteredMatches} visualMode={visualMode} />;
            case 'synergy': return <SynergyView synergyMatrix={data.synergyMatrix} visualMode={visualMode} />;
            case 'essay': return <VisualEssayView matches={data.filteredMatches} winRate={data.winRate} currentStreak={data.currentStreak} momentum={data.momentum} sessionSummary={data.sessionSummary} periodComparison={data.periodComparison} timePatterns={data.timePatterns} killEfficiency={data.killEfficiency} socialData={data.socialData} synergyMatrix={data.synergyMatrix} visualMode={visualMode} />;
            default: return null;
        }
    };

    const modeBadge = currentMode === 'Artifact Brawl' ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'bg-sky-500/15 text-sky-300 border-sky-500/30';

    return (
        <div className="h-full flex flex-col gap-3 overflow-hidden p-3 rounded-2xl border border-md-sys-outline/10 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_35%),radial-gradient(circle_at_top_left,rgba(251,146,60,0.08),transparent_40%)]">
            <div className="flex-shrink-0 rounded-2xl border border-md-sys-outline/10 bg-md-sys-surfaceContainerLowest/80 backdrop-blur p-3 md:p-4">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            {currentView !== 'overview' && (
                                <button onClick={goBack} className="md3-icon-btn">
                                    <ArrowLeft size={16} />
                                </button>
                            )}
                            <div className="min-w-0">
                                <h2 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2 text-md-sys-on-surface">
                                    <Activity className="text-md-sys-primary" size={18} />
                                    <span className="truncate">{currentView === 'overview' ? 'Analytics Cockpit' : VIEW_LABELS[currentView]}</span>
                                </h2>
                                <div className="mt-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                                    <span className={`px-2 py-0.5 rounded-full border ${modeBadge}`}>{currentMode}</span>
                                    <span className="text-md-sys-on-surface/50">{currentView === 'overview' ? 'Performance Overview' : 'Deep Dive View'}</span>
                                </div>
                            </div>
                        </div>
                        <InlineNarrativeToggle visualMode={visualMode} onChange={setVisualMode} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {TIME_RANGE_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setTimeRange(opt.value)}
                                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide border transition-all ${
                                    timeRange === opt.value
                                        ? 'bg-md-sys-primary text-md-sys-onPrimary border-md-sys-primary shadow'
                                        : 'bg-md-sys-surface/50 text-md-sys-on-surface/70 border-md-sys-outline/20 hover:bg-md-sys-surfaceContainerHighest'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {currentView === 'overview' && (
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar px-1 flex-shrink-0">
                    {QUICK_VIEWS.map(({ view, icon }) => (
                        <button
                            key={view}
                            onClick={() => navigateTo(view)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wide border border-md-sys-outline/15 bg-md-sys-surface/60 text-md-sys-on-surface/75 hover:bg-md-sys-primaryContainer hover:text-md-sys-onPrimaryContainer transition-colors whitespace-nowrap"
                        >
                            {icon}
                            {VIEW_LABELS[view]}
                        </button>
                    ))}
                </div>
            )}

            {currentView === 'overview' ? (
                <AnalyticsDashboard
                    visualMode={visualMode}
                    onNavigate={navigateTo}
                    onDrillDown={onDrillDown}
                    winRate={data.winRate}
                    currentStreak={data.currentStreak}
                    totalMatches={data.filteredMatches.length}
                    avgSortiesPerDay={data.avgSortiesPerDay}
                    sessionSummary={data.sessionSummary}
                    momentum={data.momentum}
                    periodComparison={data.periodComparison}
                    timePatterns={data.timePatterns}
                    streakHistory={data.streakHistory}
                    killEfficiency={data.killEfficiency}
                    placementData={data.placementData}
                    insights={data.insights}
                    socialData={data.socialData}
                    relationshipInsights={data.relationshipInsights}
                    filteredMatches={data.filteredMatches}
                />
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-xl border border-md-sys-outline/10 bg-md-sys-surfaceContainerLowest/70 p-2">
                    {renderExpandedView()}
                </div>
            )}
        </div>
    );
};

