import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { AnalyticsView, AnalyticsTimeRange, DrillDownTarget, EntityAnalyticsFilters } from '../../types';
import { Activity, ArrowLeft, Download, LayoutGrid, ToggleLeft, ToggleRight } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';
import { TRANSLATIONS } from '../../utils/translations';
import { useAnalyticsData } from './useAnalyticsData';
import { InlineNarrativeToggle } from './DenseEditorialToggle';
import { exportAnalyticsAsImage } from './analyticsExport';
import { AnalyticsCockpit } from './AnalyticsCockpit';
import { ControlPanelView } from './ControlPanelView';
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
import { AnalyticsNavigation, AnalyticsCategory } from './AnalyticsNavigation';
import { EntityAnalyticsView } from './EntityAnalyticsView';
import { getUpdateLabel, UPDATE_DEFINITIONS } from '../../data/gamePatches';
import { getMatchEquipment, getMatchPerks, getMatchProspectorWeapons, getMatchShip } from '../patch/patchEntityCatalog';

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
    reactor: 'Reactor',
};

const TIME_RANGE_OPTIONS: { value: AnalyticsTimeRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'lastN', label: 'Last 20' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'all', label: 'All Time' },
];

const CATEGORY_SUBVIEWS: Record<AnalyticsCategory, AnalyticsView[]> = {
    overview: [],
    performance: ['momentum', 'streaks', 'killEfficiency', 'placement', 'session', 'period', 'timePatterns'],
    team: ['social', 'insights', 'synergy'],
    environment: ['environment'],
    entities: ['pro'],
};

type ProCategory = 'all' | 'core' | 'timeline' | 'team' | 'environment' | 'detailed';

const PRO_CATEGORY_OPTIONS: Array<{ value: ProCategory; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'core', label: 'Core' },
    { value: 'timeline', label: 'Timeline' },
    { value: 'team', label: 'Team' },
    { value: 'environment', label: 'Environment' },
    { value: 'detailed', label: 'Detailed' },
];

interface AnalyticsShellProps {
    isActive?: boolean;
}

export const AnalyticsShell: React.FC<AnalyticsShellProps> = ({ isActive = true }) => {
    const { setDrillDownTarget } = useGameData();
    const { activeMode: currentMode, activeUser: currentUser } = useUIState();
    const { language, visualMode, setVisualMode } = useUserPreferences();
    const t = TRANSLATIONS[language];

    const [currentView, setCurrentView] = useState<AnalyticsView>('overview');
    const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('all');
    const [lastN] = useState(20);
    const [exporting, setExporting] = useState(false);
    const [isProMode, setIsProMode] = useState(false);
    const [proCategory, setProCategory] = useState<ProCategory>('core');
    const [entityFilters, setEntityFilters] = useState<EntityAnalyticsFilters>({
        ship: [],
        prospectorWeapon: [],
        equipment: [],
        perk: [],
        update: [],
    });
    const contentRef = useRef<HTMLDivElement>(null);

    const data = useAnalyticsData(timeRange, lastN, currentView, entityFilters);
    const collectSortedUnique = (values: string[]): string[] => (
        Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b))
    );
    const shipFilterOptions = useMemo(
        () => collectSortedUnique(data.filteredMatches.map((match) => getMatchShip(match))),
        [data.filteredMatches]
    );
    const weaponFilterOptions = useMemo(
        () => collectSortedUnique(data.filteredMatches.flatMap((match) => getMatchProspectorWeapons(match))),
        [data.filteredMatches]
    );
    const equipmentFilterOptions = useMemo(
        () => collectSortedUnique(data.filteredMatches.flatMap((match) => getMatchEquipment(match))),
        [data.filteredMatches]
    );
    const perkFilterOptions = useMemo(
        () => collectSortedUnique(data.filteredMatches.flatMap((match) => getMatchPerks(match))),
        [data.filteredMatches]
    );
    const activeContextTags = useMemo(() => {
        const timeRangeLabel = TIME_RANGE_OPTIONS.find((option) => option.value === timeRange)?.label || 'All Time';
        const tags = [`Range: ${timeRangeLabel}`];
        if (entityFilters.ship[0]) tags.push(`Ship: ${entityFilters.ship[0]}`);
        if (entityFilters.prospectorWeapon[0]) tags.push(`Weapon: ${entityFilters.prospectorWeapon[0]}`);
        if (entityFilters.equipment[0]) tags.push(`Equipment: ${entityFilters.equipment[0]}`);
        if (entityFilters.perk[0]) tags.push(`Perk: ${entityFilters.perk[0]}`);
        if (entityFilters.update[0]) {
            tags.push(`Update: ${getUpdateLabel(entityFilters.update[0])}`);
        }
        return tags;
    }, [entityFilters, timeRange]);
    const filterSelectClassName = 'px-2.5 py-1.5 rounded-control border border-md-sys-outline/20 bg-md-sys-surface text-md-sys-on-surface text-label-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary';

    const onDrillDown = useCallback((name: string, type: DrillDownTarget['type']) => {
        setDrillDownTarget({
            name,
            type,
            matchIds: data.filteredMatches.map((match) => Number(match.id)).filter((id) => Number.isFinite(id)),
        });
    }, [data.filteredMatches, setDrillDownTarget]);

    const navigateTo = (view: AnalyticsView) => setCurrentView(view);
    const goBack = () => setCurrentView('overview');
    const openDetailedFromPro = (view: AnalyticsView) => {
        setCurrentView(view);
        setIsProMode(false);
    };

    useEffect(() => {
        if (!isActive) return;
        const onExternalNavigate = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ view?: AnalyticsView; proMode?: boolean }>;
            const targetView = customEvt?.detail?.view;
            const nextProMode = customEvt?.detail?.proMode;
            if (targetView && Object.prototype.hasOwnProperty.call(VIEW_LABELS, targetView)) {
                setCurrentView(targetView);
            }
            if (typeof nextProMode === 'boolean') {
                setIsProMode(nextProMode);
            }
        };
        window.addEventListener('analytics:navigate-view', onExternalNavigate as EventListener);
        return () => window.removeEventListener('analytics:navigate-view', onExternalNavigate as EventListener);
    }, [isActive]);

    const isInteractiveTarget = (target: EventTarget | null) => {
        const el = target as HTMLElement | null;
        if (!el) return false;
        return Boolean(el.closest('button, a, input, select, textarea, [data-no-pro-drill]'));
    };

    const renderProDrillTile = (view: AnalyticsView, label: string, content: React.ReactNode) => (
        <div
            role="button"
            tabIndex={0}
            aria-label={`Open ${label} detailed breakdown`}
            onClick={(e) => {
                if (isInteractiveTarget(e.target)) return;
                openDetailedFromPro(view);
            }}
            onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                openDetailedFromPro(view);
            }}
            className="group relative rounded-card cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary"
        >
            <button
                type="button"
                data-no-pro-drill
                onClick={(e) => {
                    e.stopPropagation();
                    openDetailedFromPro(view);
                }}
                className="absolute right-3 top-3 z-10 px-2 py-1 rounded-pill text-label-xs font-bold uppercase tracking-wide bg-md-sys-primary/14 text-md-sys-primary border border-md-sys-primary/25"
            >
                Open detail
            </button>
            {content}
        </div>
    );

    const getActiveCategory = (view: AnalyticsView): AnalyticsCategory => {
        if (view === 'overview') return 'overview';
        for (const [cat, views] of Object.entries(CATEGORY_SUBVIEWS)) {
            if (views.includes(view)) return cat as AnalyticsCategory;
        }
        return 'overview';
    };

    const activeCategory = getActiveCategory(currentView);

    const handleCategoryChange = (cat: AnalyticsCategory) => {
        if (cat === 'overview') {
            setCurrentView('overview');
        } else {
            // Default to first view in category
            const defaultView = CATEGORY_SUBVIEWS[cat][0];
            if (defaultView) setCurrentView(defaultView);
        }
    };

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
            case 'pro': return <EntityAnalyticsView data={data.entityAnalytics} onDrillDown={onDrillDown} />;
            case 'environment': return <EnvironmentView matches={data.filteredMatches} visualMode={visualMode} onDrillDown={onDrillDown} />;
            case 'synergy': return <SynergyView synergyMatrix={data.synergyMatrix} visualMode={visualMode} />;
            case 'essay': return <VisualEssayView matches={data.filteredMatches} winRate={data.winRate} currentStreak={data.currentStreak} momentum={data.momentum} sessionSummary={data.sessionSummary} periodComparison={data.periodComparison} timePatterns={data.timePatterns} killEfficiency={data.killEfficiency} socialData={data.socialData} synergyMatrix={data.synergyMatrix} visualMode={visualMode} />;
            default: return null;
        }
    };

    const modeBadge = currentMode === 'Artifact Brawl' ? 'bg-warning-soft text-warning border-warning-soft' : 'bg-info-soft text-info border-info-soft';
    const proTiles = useMemo(() => ([
        {
            view: 'momentum' as AnalyticsView,
            label: 'Momentum',
            category: 'core' as ProCategory,
            content: <MomentumView data={data.momentum} visualMode={visualMode} />,
        },
        {
            view: 'killEfficiency' as AnalyticsView,
            label: 'Kill Efficiency',
            category: 'core' as ProCategory,
            content: <KillEfficiencyView data={data.killEfficiency} visualMode={visualMode} />,
        },
        {
            view: 'placement' as AnalyticsView,
            label: 'Placement Distribution',
            category: 'core' as ProCategory,
            content: <PlacementDistView data={data.placementData} visualMode={visualMode} />,
        },
        {
            view: 'streaks' as AnalyticsView,
            label: 'Streak Timeline',
            category: 'core' as ProCategory,
            content: <StreakTimelineView data={data.streakHistory} visualMode={visualMode} />,
        },
        {
            view: 'timePatterns' as AnalyticsView,
            label: 'Time Patterns',
            category: 'timeline' as ProCategory,
            content: <TimePatternView data={data.timePatterns} visualMode={visualMode} />,
        },
        {
            view: 'period' as AnalyticsView,
            label: 'Period Comparison',
            category: 'timeline' as ProCategory,
            content: <PeriodComparisonView data={data.periodComparison} visualMode={visualMode} />,
        },
        {
            view: 'session' as AnalyticsView,
            label: 'Session Summary',
            category: 'timeline' as ProCategory,
            content: <SessionSummaryView data={data.sessionSummary} visualMode={visualMode} />,
        },
        {
            view: 'synergy' as AnalyticsView,
            label: 'Synergy Matrix',
            category: 'team' as ProCategory,
            content: <SynergyView synergyMatrix={data.synergyMatrix} visualMode={visualMode} />,
        },
        {
            view: 'social' as AnalyticsView,
            label: 'Social',
            category: 'team' as ProCategory,
            content: (
                <SocialView
                    socialData={data.socialData}
                    filteredMatches={data.filteredMatches}
                    currentUser={currentUser}
                    playerProfiles={data.playerProfiles}
                    onDrillDown={onDrillDown}
                    visualMode={visualMode}
                />
            ),
        },
        {
            view: 'insights' as AnalyticsView,
            label: 'Insights',
            category: 'team' as ProCategory,
            content: (
                <InsightsView
                    insights={data.insights}
                    relationshipInsights={data.relationshipInsights}
                    filteredMatches={data.filteredMatches}
                    onDrillDown={onDrillDown}
                    visualMode={visualMode}
                />
            ),
        },
        {
            view: 'environment' as AnalyticsView,
            label: 'Hazard Analysis',
            category: 'environment' as ProCategory,
            content: <EnvironmentView matches={data.filteredMatches} visualMode={visualMode} />,
        },
        {
            view: 'pro' as AnalyticsView,
            label: 'Detailed Analysis',
            category: 'detailed' as ProCategory,
            content: <EntityAnalyticsView data={data.entityAnalytics} />,
        },
    ]), [
        data.momentum,
        data.killEfficiency,
        data.placementData,
        data.streakHistory,
        data.timePatterns,
        data.periodComparison,
        data.sessionSummary,
        data.synergyMatrix,
        data.socialData,
        data.playerProfiles,
        data.insights,
        data.relationshipInsights,
        data.filteredMatches,
        data.entityAnalytics,
        visualMode,
        currentUser,
        onDrillDown,
    ]);
    const proCategoryCounts = useMemo(() => {
        const counts: Record<ProCategory, number> = {
            all: proTiles.length,
            core: 0,
            timeline: 0,
            team: 0,
            environment: 0,
            detailed: 0,
        };
        for (const tile of proTiles) {
            counts[tile.category] += 1;
        }
        return counts;
    }, [proTiles]);
    const visibleProTiles = useMemo(() => {
        if (proCategory === 'all') return proTiles;
        return proTiles.filter((tile) => tile.category === proCategory);
    }, [proCategory, proTiles]);
    const isCockpitView = !isProMode && currentView === 'overview';

    return (
        <div className={`twilight-solid-scope twilight-soft-shadows h-full flex flex-col gap-3 overflow-hidden rounded-modal shadow-lg ${isCockpitView ? 'analytics-shell-surface' : 'analytics-shell-gradient'}`}>
            {/* Header */}
            <div className="flex-shrink-0 rounded-card mg-surface-high p-3 md:p-4">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            {/* In standard mode, show Back button if not in overview */}
                            {!isProMode && currentView !== 'overview' && (
                                <button onClick={goBack} className="md3-icon-btn" aria-label="Back to analytics overview">
                                    <ArrowLeft size={16} />
                                </button>
                            )}
                            <div className="min-w-0">
                                <h2 className="text-base md:text-lg font-bold tracking-tight flex items-center gap-2 text-md-sys-on-surface">
                                    <Activity className="text-md-sys-primary" size={18} />
                                    <span className="truncate">
                                        {isProMode ? 'Pro Analytics' : (currentView === 'overview' ? 'Analytics Cockpit' : VIEW_LABELS[currentView])}
                                    </span>
                                </h2>
                                <div className="mt-1 flex items-center gap-2 text-label-sm font-semibold uppercase tracking-wider text-md-sys-on-surface/60">
                                    <span className={`px-2 py-0.5 rounded-pill border ${modeBadge}`}>{currentMode}</span>
                                    <span>
                                        {isProMode ? 'High Density View' : (currentView === 'overview' ? 'Performance Overview' : 'Deep Dive View')}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Pro Mode Toggle */}
                            <button
                                onClick={() => setIsProMode(!isProMode)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-control text-label-sm font-bold uppercase tracking-wide transition-all border ${
                                    isProMode
                                        ? 'bg-md-sys-primary text-md-sys-onPrimary border-md-sys-primary'
                                        : 'bg-md-sys-surfaceContainerHigh text-md-sys-on-surface/60 border-transparent hover:bg-md-sys-surfaceContainerHighest'
                                }`}
                            >
                                <LayoutGrid size={14} />
                                {isProMode ? 'Pro' : 'Standard'}
                                {isProMode ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            </button>

                            <button
                                onClick={async () => {
                                    setExporting(true);
                                    await exportAnalyticsAsImage(contentRef.current);
                                    setExporting(false);
                                }}
                                disabled={exporting || data.filteredMatches.length === 0}
                                className="md3-icon-btn text-md-sys-on-surface/60 hover:text-md-sys-primary disabled:opacity-disabled transition-colors"
                                title="Export analytics as PNG"
                                aria-label="Export analytics as PNG"
                            >
                                <Download size={16} className={exporting ? 'animate-pulse' : ''} />
                            </button>
                            <InlineNarrativeToggle visualMode={visualMode} onChange={setVisualMode} />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {TIME_RANGE_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setTimeRange(opt.value)}
                                className={`px-3 py-1.5 rounded-control text-label-sm font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary ${timeRange === opt.value
                                    ? 'bg-md-sys-primary text-md-sys-onPrimary shadow'
                                    : 'bg-md-sys-surfaceContainerLowest/70 text-md-sys-on-surface/60 hover:bg-md-sys-surfaceContainerHigh/70'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={entityFilters.ship[0] || ''}
                            onChange={(e) => setEntityFilters((prev) => ({ ...prev, ship: e.target.value ? [e.target.value] : [] }))}
                            className={filterSelectClassName}
                        >
                            <option value="">All Ships</option>
                            {shipFilterOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                        <select
                            value={entityFilters.prospectorWeapon[0] || ''}
                            onChange={(e) => setEntityFilters((prev) => ({ ...prev, prospectorWeapon: e.target.value ? [e.target.value] : [] }))}
                            className={filterSelectClassName}
                        >
                            <option value="">All Weapons</option>
                            {weaponFilterOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                        <select
                            value={entityFilters.equipment[0] || ''}
                            onChange={(e) => setEntityFilters((prev) => ({ ...prev, equipment: e.target.value ? [e.target.value] : [] }))}
                            className={filterSelectClassName}
                        >
                            <option value="">All Equipment</option>
                            {equipmentFilterOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                        <select
                            value={entityFilters.perk[0] || ''}
                            onChange={(e) => setEntityFilters((prev) => ({ ...prev, perk: e.target.value ? [e.target.value] : [] }))}
                            className={filterSelectClassName}
                        >
                            <option value="">All Perk Sets</option>
                            {perkFilterOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                        <select
                            value={entityFilters.update[0] || ''}
                            onChange={(e) => setEntityFilters((prev) => ({ ...prev, update: e.target.value ? [e.target.value] : [] }))}
                            className={filterSelectClassName}
                        >
                            <option value="">All Updates</option>
                            {UPDATE_DEFINITIONS.map((update) => (
                                <option key={update.key} value={update.key}>{update.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            {isProMode ? (
                // Pro Mode: High Density Grid
                <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-card mg-surface-high p-3">
                    <div className="space-y-4">
                        <ControlPanelView timeRange={timeRange} lastN={lastN} />

                        <div className="md3-card rounded-card p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                {PRO_CATEGORY_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => setProCategory(option.value)}
                                        className={`px-3 py-1.5 rounded-control text-label-sm font-bold uppercase tracking-wide transition-all border ${proCategory === option.value
                                            ? 'bg-md-sys-primary text-md-sys-onPrimary border-md-sys-primary'
                                            : 'bg-md-sys-surfaceContainerHigh text-md-sys-on-surface/60 border-transparent hover:bg-md-sys-surfaceContainerHighest'
                                            }`}
                                    >
                                        {option.label} ({proCategoryCounts[option.value]})
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            {visibleProTiles.map((tile) => (
                                <React.Fragment key={tile.view}>
                                    {renderProDrillTile(tile.view, tile.label, tile.content)}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                // Standard Mode
                <>
                    {/* Navigation Strip */}
                    {data.filteredMatches.length > 0 && (
                        <div className="flex-shrink-0">
                            <AnalyticsNavigation
                                activeCategory={activeCategory}
                                onSelectCategory={handleCategoryChange}
                            />
                        </div>
                    )}

                    {data.filteredMatches.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-md-sys-on-surface/40 animate-fade-in">
                            <div className="w-16 h-16 rounded-card bg-md-sys-primaryContainer/30 flex items-center justify-center">
                                <Activity size={28} className="text-md-sys-primary/40" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-body font-bold text-md-sys-on-surface/60">No match data yet</h3>
                                <p className="text-label-sm mt-1 text-md-sys-on-surface/40">Record some matches to unlock analytics</p>
                            </div>
                        </div>
                    ) : (
                        <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-card mg-surface-high p-3">
                            {currentView === 'overview' ? (
                                <AnalyticsCockpit
                                    visualMode={visualMode}
                                    onNavigate={navigateTo}
                                    onDrillDown={onDrillDown}
                                    winRate={data.winRate}
                                    totalMatches={data.filteredMatches.length}
                                    momentum={data.momentum}
                                    placementData={data.placementData}
                                    filteredMatches={data.filteredMatches}
                                    contextTags={activeContextTags}
                                />
                            ) : (
                                <>
                                    {/* Sub-Navigation for Detailed Views */}
                                    <div className="flex gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar px-1">
                                        {CATEGORY_SUBVIEWS[activeCategory]?.map((view) => (
                                            <button
                                                key={view}
                                                onClick={() => navigateTo(view)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label-sm font-bold uppercase tracking-wide whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary ${currentView === view
                                                    ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                                    : 'bg-md-sys-surfaceContainerLowest/70 text-md-sys-on-surface/60 hover:bg-md-sys-primaryContainer hover:text-md-sys-onPrimaryContainer'
                                                    }`}
                                            >
                                                {VIEW_LABELS[view]}
                                            </button>
                                        ))}
                                    </div>
                                    {renderExpandedView()}
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
