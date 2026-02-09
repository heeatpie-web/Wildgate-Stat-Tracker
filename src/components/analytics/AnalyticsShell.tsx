import React, { useState } from 'react';
import { AnalyticsView, AnalyticsTimeRange, DrillDownTarget, VisualMode } from '../../types';
import { Activity, ArrowLeft } from 'lucide-react';
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
    { value: 'month', label: 'This Month' },
    { value: 'week', label: 'This Week' },
    { value: 'today', label: 'Today' },
    { value: 'lastN', label: 'Last 20' },
];

export const AnalyticsShell: React.FC = () => {
    const { setDrillDownTarget } = useGameData();
    const { activeMode: currentMode, activeUser: currentUser } = useUIState();
    const { language, visualMode, setVisualMode } = useUserPreferences();
    const t = TRANSLATIONS[language];

    const [currentView, setCurrentView] = useState<AnalyticsView>('overview');
    const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('all');
    const [lastN, setLastN] = useState(20);

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

    return (
        <div className="bg-md-sys-surface1 h-full flex flex-col gap-3 animate-slide-up overflow-hidden p-1">
            {/* Header Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-3 bg-md-sys-surface2 p-3 rounded-2xl shadow-sm flex-shrink-0 border border-white/5">
                <div className="flex items-center gap-3">
                    {currentView !== 'overview' && (
                        <button onClick={goBack} className="p-2 bg-md-sys-surface1 rounded-xl hover:bg-md-sys-surface3 transition-colors">
                            <ArrowLeft size={16} />
                        </button>
                    )}
                    <div>
                        <h2 className="text-lg font-bold uppercase tracking-tight flex items-center gap-2">
                            <Activity className="text-md-sys-primary" size={18} />
                            {currentView === 'overview' ? 'Performance' : VIEW_LABELS[currentView]}
                        </h2>
                        <p className="text-[9px] font-semibold opacity-50 uppercase tracking-widest pl-7">
                            {currentView === 'overview' ? 'Dashboard' : 'Detailed Analysis'} - {currentMode}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    {/* Time Range Selector */}
                    <div className="flex bg-md-sys-surface1 p-1 rounded-xl">
                        {TIME_RANGE_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => setTimeRange(opt.value)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${timeRange === opt.value ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'opacity-60 hover:bg-md-sys-surface3'}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Quick Navigation (overview only) */}
            {currentView === 'overview' && (
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar shrink-0">
                    {(['essay', 'pro', 'environment', 'synergy', 'insights', 'social'] as AnalyticsView[]).map(view => (
                        <button key={view} onClick={() => navigateTo(view)}
                            className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase whitespace-nowrap transition-all border border-transparent bg-transparent text-md-sys-on-surface/60 hover:bg-md-sys-surface2 hover:text-md-sys-on-surface">
                            {VIEW_LABELS[view]}
                        </button>
                    ))}
                </div>
            )}

            {/* Content */}
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
                <div className="flex-1 flex flex-col min-h-0">
                    {/* Inline narrative toggle */}
                    <div className="flex items-center justify-end px-2 pb-1 flex-shrink-0">
                        <InlineNarrativeToggle visualMode={visualMode} onChange={setVisualMode} />
                    </div>
                    <div className="flex-1 min-h-0">
                        {renderExpandedView()}
                    </div>
                </div>
            )}
        </div>
    );
};
