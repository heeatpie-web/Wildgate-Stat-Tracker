import React from 'react';
import type { AnalyticsView, DrillDownTarget, Match, VisualMode } from '../../types';
import type { RelationshipInsight } from '../../utils/analytics';
import { BarChart3, Flame, Gauge, Globe } from 'lucide-react';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { MomentumView } from './MomentumView';
import { StreakTimelineView } from './StreakTimelineView';
import { EnvironmentView } from './EnvironmentView';
import { ProView } from './ProView';

type CockpitSectionId = 'momentum' | 'streaks' | 'environment' | 'pro';

const SECTION_IDS: Record<CockpitSectionId, string> = {
    momentum: 'cockpit-momentum',
    streaks: 'cockpit-streaks',
    environment: 'cockpit-environment',
    pro: 'cockpit-pro',
};

const SectionShell: React.FC<{
    id: string;
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    onOpen: () => void;
    children: React.ReactNode;
}> = ({ id, title, subtitle, icon, onOpen, children }) => {
    return (
        <section id={id} className="mg-surface-high rounded-2xl p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl md3-surface-high flex items-center justify-center text-md-sys-primary">
                            {icon}
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-body md:text-base font-bold tracking-tight text-md-sys-on-surface truncate">{title}</h3>
                            {subtitle && (
                                <div className="text-label-sm uppercase tracking-widest font-bold opacity-60 truncate">{subtitle}</div>
                            )}
                        </div>
                    </div>
                </div>
                <button
                    onClick={onOpen}
                    className="md3-btn-outlined px-3 py-2 text-label-sm font-bold uppercase tracking-wide whitespace-nowrap"
                >
                    Open Drilldown
                </button>
            </div>

            <div className="mt-4 max-h-[520px] overflow-y-auto custom-scrollbar">
                {children}
            </div>
        </section>
    );
};

export const AnalyticsCockpit: React.FC<{
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

    insights: any[];
    socialData: any;
    relationshipInsights: RelationshipInsight[];
    synergyMatrix: Record<string, Record<string, { wins: number; total: number }>>;

    filteredMatches: Match[];
}> = (props) => {
    const {
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
    } = props;

    return (
        <div className="flex flex-col gap-4">
            <AnalyticsDashboard
                visualMode={visualMode}
                onNavigate={onNavigate}
                onDrillDown={onDrillDown}
                winRate={winRate}
                currentStreak={currentStreak}
                totalMatches={totalMatches}
                avgSortiesPerDay={avgSortiesPerDay}
                sessionSummary={sessionSummary}
                momentum={momentum}
                periodComparison={periodComparison}
                timePatterns={timePatterns}
                streakHistory={streakHistory}
                killEfficiency={killEfficiency}
                placementData={placementData}
                insights={insights as any}
                socialData={socialData}
                relationshipInsights={relationshipInsights}
                synergyMatrix={synergyMatrix}
                filteredMatches={filteredMatches as any}
            />

            <div className="grid gap-4">
                <SectionShell
                    id={SECTION_IDS.momentum}
                    title="Performance Momentum"
                    subtitle="Form, trend, and stability"
                    icon={<Gauge size={18} />}
                    onOpen={() => onNavigate('momentum')}
                >
                    <MomentumView data={momentum} visualMode={visualMode} />
                </SectionShell>

                <SectionShell
                    id={SECTION_IDS.streaks}
                    title="Streak Timeline"
                    subtitle="Runs, volatility, and pivots"
                    icon={<Flame size={18} />}
                    onOpen={() => onNavigate('streaks')}
                >
                    <StreakTimelineView data={streakHistory} visualMode={visualMode} />
                </SectionShell>

                <SectionShell
                    id={SECTION_IDS.environment}
                    title="Hazard Analysis"
                    subtitle="Reach modifiers and conditions"
                    icon={<Globe size={18} />}
                    onOpen={() => onNavigate('environment')}
                >
                    <EnvironmentView matches={filteredMatches} visualMode={visualMode} />
                </SectionShell>

                <SectionShell
                    id={SECTION_IDS.pro}
                    title="Detailed Analysis"
                    subtitle="Ships, heroes, and efficiency breakdowns"
                    icon={<BarChart3 size={18} />}
                    onOpen={() => onNavigate('pro')}
                >
                    <ProView matches={filteredMatches} visualMode={visualMode} />
                </SectionShell>
            </div>
        </div>
    );
};

