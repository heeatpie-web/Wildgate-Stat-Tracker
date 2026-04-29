import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { AnalyticsView, AnalyticsTimeRange, DrillDownTarget, EntityAnalyticsFilters } from '../../types';
import { Activity, ArrowLeft, Download, Pin, SlidersHorizontal } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';
import { TRANSLATIONS } from '../../utils/translations';
import { useAnalyticsData } from './useAnalyticsData';
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
import { MetaView } from './MetaView';
import { AnalyticsNavigation, AnalyticsCategory } from './AnalyticsNavigation';
import { StatExportModal } from './StatExportModal';
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
    meta: 'Meta Stats',
};

// Maps AnalyticsView names to their tile catalog ID (only views that have a corresponding tile)
const VIEW_TO_TILE_ID: Partial<Record<AnalyticsView, string>> = {
    momentum: 'momentum',
    placement: 'placement',
    killEfficiency: 'killEfficiency',
    period: 'periodComparison',
    timePatterns: 'timePatterns',
    streaks: 'streaks',
};

const TIME_RANGE_OPTIONS: { value: AnalyticsTimeRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'lastN', label: 'Last 20' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'all', label: 'All Time' },
    { value: 'ttk', label: '1.5 Update – TTK' },
    { value: 'custom', label: 'Custom' },
];

const CATEGORY_SUBVIEWS: Record<AnalyticsCategory, AnalyticsView[]> = {
    overview: [],
    performance: ['momentum', 'streaks', 'killEfficiency', 'placement', 'session', 'period', 'timePatterns'],
    team: ['social', 'insights', 'synergy'],
    environment: ['environment'],
    entities: ['pro'],
    meta: ['meta'],
};

type ProCategory = 'all' | 'core' | 'timeline' | 'team' | 'environment' | 'detailed';
type DisplayMode = 'standard' | 'dense' | 'all';

const PRO_CATEGORY_OPTIONS: Array<{ value: ProCategory; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'core', label: 'Core' },
    { value: 'timeline', label: 'Timeline' },
    { value: 'team', label: 'Team' },
    { value: 'environment', label: 'Environment' },
    { value: 'detailed', label: 'Detailed' },
];

const MODE_OPTIONS: Array<{ value: DisplayMode; label: string }> = [
    { value: 'standard', label: 'Standard' },
    { value: 'dense', label: 'Dense' },
    { value: 'all', label: 'All Views' },
];

interface AnalyticsShellProps {
    isActive?: boolean;
}

export const AnalyticsShell: React.FC<AnalyticsShellProps> = ({ isActive = true }) => {
    const { setDrillDownTarget } = useGameData();
    const { activeMode: currentMode, activeUser: currentUser } = useUIState();
    const { language, visualMode, setVisualMode } = useUserPreferences();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _t = TRANSLATIONS[language];

    const [currentView, setCurrentView] = useState<AnalyticsView>('overview');
    const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('all');
    const [customDateFrom, setCustomDateFrom] = useState('');
    const [customDateTo, setCustomDateTo] = useState('');
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
    const [pinnedTiles, setPinnedTiles] = useState<Set<string>>(new Set());
    const [showExportModal, setShowExportModal] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    // Derived 3-state display mode: standard (editorial) / dense / all (pro grid)
    const displayMode: DisplayMode = isProMode ? 'all' : (visualMode === 'dense' ? 'dense' : 'standard');
    const setDisplayMode = (mode: DisplayMode) => {
        if (mode === 'all') {
            setIsProMode(true);
        } else {
            setIsProMode(false);
            setVisualMode(mode === 'dense' ? 'dense' : 'editorial');
        }
    };

    const activeFilterCount = [
        entityFilters.ship[0],
        entityFilters.prospectorWeapon[0],
        entityFilters.equipment[0],
        entityFilters.perk[0],
        entityFilters.update[0],
    ].filter(Boolean).length;

    const requestedDataView = useMemo<AnalyticsView | undefined>(() => {
        // Standard overview only needs lightweight metrics.
        // All-Views (pro) overview renders many tiles and should request full analytics.
        if (isProMode && currentView === 'overview') return undefined;
        return currentView;
    }, [currentView, isProMode]);

    const customDateRange = useMemo(() => {
        if (timeRange !== 'custom' || !customDateFrom || !customDateTo) return null;
        const from = new Date(customDateFrom);
        from.setHours(0, 0, 0, 0);
        const to = new Date(customDateTo);
        to.setHours(23, 59, 59, 999);
        if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return null;
        return { from: from.getTime(), to: to.getTime() };
    }, [timeRange, customDateFrom, customDateTo]);

    const data = useAnalyticsData(timeRange, lastN, requestedDataView, entityFilters, customDateRange);
    const filterOptionSourceMatches = data.rangeFilteredMatches ?? data.filteredMatches;
    const collectSortedUnique = (values: string[]): string[] => (
        Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b))
    );
    const shipFilterOptions = useMemo(
        () => collectSortedUnique(filterOptionSourceMatches.map((match) => getMatchShip(match))),
        [filterOptionSourceMatches]
    );
    const weaponFilterOptions = useMemo(
        () => collectSortedUnique(filterOptionSourceMatches.flatMap((match) => getMatchProspectorWeapons(match))),
        [filterOptionSourceMatches]
    );
    const equipmentFilterOptions = useMemo(
        () => collectSortedUnique(filterOptionSourceMatches.flatMap((match) => getMatchEquipment(match))),
        [filterOptionSourceMatches]
    );
    const perkFilterOptions = useMemo(
        () => collectSortedUnique(filterOptionSourceMatches.flatMap((match) => getMatchPerks(match))),
        [filterOptionSourceMatches]
    );
    const activeContextTags = useMemo(() => {
        let timeRangeLabel = TIME_RANGE_OPTIONS.find((option) => option.value === timeRange)?.label || 'All Time';
        if (timeRange === 'custom' && customDateFrom && customDateTo) {
            timeRangeLabel = `${customDateFrom} → ${customDateTo}`;
        }
        const tags = [`Range: ${timeRangeLabel}`];
        if (entityFilters.ship[0]) tags.push(`Ship: ${entityFilters.ship[0]}`);
        if (entityFilters.prospectorWeapon[0]) tags.push(`Weapon: ${entityFilters.prospectorWeapon[0]}`);
        if (entityFilters.equipment[0]) tags.push(`Equipment: ${entityFilters.equipment[0]}`);
        if (entityFilters.perk[0]) tags.push(`Perk: ${entityFilters.perk[0]}`);
        if (entityFilters.update[0]) {
            tags.push(`Update: ${getUpdateLabel(entityFilters.update[0])}`);
        }
        return tags;
    }, [entityFilters, timeRange, customDateFrom, customDateTo]);

    const filterSelectClassName = 'px-2.5 py-1.5 rounded-control border border-md-sys-outline/20 bg-md-sys-surface text-md-sys-on-surface text-label-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary';

    const onDrillDown = useCallback((name: string, type: DrillDownTarget['type']) => {
        setDrillDownTarget({
            name,
            type,
            matchIds: data.filteredMatches.map((match) => Number(match.id)).filter((id) => Number.isFinite(id)),
        });
    }, [data.filteredMatches, setDrillDownTarget]);

    const togglePin = useCallback((id: string) => {
        setPinnedTiles(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

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

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setShowFilters(false);
            }
        };
        if (showFilters) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showFilters]);

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
            className="at-pro-drill group relative cursor-pointer overflow-hidden"
        >
            <button
                type="button"
                data-no-pro-drill
                onClick={(e) => {
                    e.stopPropagation();
                    openDetailedFromPro(view);
                }}
                className="at-open-detail-pill absolute right-3 top-3 z-10 px-2.5 py-1"
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
            case 'meta': return data.metaAnalytics ? <MetaView data={data.metaAnalytics} visualMode={visualMode} /> : null;
            default: return null;
        }
    };

    const modeBadge = currentMode === 'Artifact Brawl' ? 'bg-warning-soft text-warning border-warning-soft' : 'bg-info-soft text-info border-info-soft';
    const proTiles = useMemo(() => {
        if (!isProMode) return [];
        return [
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
        ];
    }, [
        isProMode,
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
    const exportTileData = {
        filteredMatches: data.filteredMatches,
        winRate: data.winRate,
        currentStreak: data.currentStreak,
        momentum: data.momentum,
        placementData: data.placementData,
        killEfficiency: data.killEfficiency,
        streakHistory: data.streakHistory,
        periodComparison: data.periodComparison,
        timePatterns: data.timePatterns,
    };

    return (
        <div className={`twilight-solid-scope twilight-soft-shadows analytics-telemetry-scope h-full flex flex-col gap-3 overflow-hidden rounded-modal shadow-lg ${isCockpitView ? 'analytics-shell-surface' : 'analytics-shell-gradient'}`}>
            {/* Header */}
            <div className="flex-shrink-0 at-header-slab p-3 md:p-4">
                <div className="flex flex-col gap-3">
                    {/* Row 1: Title + Controls */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            {!isProMode && currentView !== 'overview' && (
                                <button onClick={goBack} className="md3-icon-btn shrink-0" aria-label="Back to analytics overview">
                                    <ArrowLeft size={16} />
                                </button>
                            )}
                            <div className="min-w-0">
                                <div className="at-eyebrow">Wildgate · signal deck</div>
                                <h2 className="at-display text-base md:text-lg font-extrabold tracking-tight flex items-center gap-2 text-md-sys-on-surface mt-1.5">
                                    <Activity className="text-md-sys-primary shrink-0" size={18} aria-hidden />
                                    <span className="truncate">
                                        {isProMode ? 'All Views' : (currentView === 'overview' ? 'Analytics Cockpit' : VIEW_LABELS[currentView])}
                                    </span>
                                </h2>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-label-sm font-semibold text-md-sys-on-surface/55">
                                    <span className={`px-2 py-0.5 rounded-pill border font-mono text-[10px] tracking-wide uppercase ${modeBadge}`}>{currentMode}</span>
                                    <span className="font-mono text-[10px] tracking-widest uppercase text-md-sys-on-surface/45">
                                        {isProMode ? 'Lattice grid' : (currentView === 'overview' ? 'Orbit overview' : 'Deep slice')}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {/* 3-state mode segmented control: Standard / Dense / All Views */}
                            <div className="at-segment-track" role="group" aria-label="Display density">
                                {MODE_OPTIONS.map(({ value, label }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        data-active={displayMode === value ? 'true' : 'false'}
                                        onClick={() => setDisplayMode(value)}
                                        className={`at-segment-btn px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary ${
                                            displayMode === value ? '' : 'text-md-sys-on-surface/55 hover:text-md-sys-on-surface/80'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Filter button with popover */}
                            <div className="relative" ref={filterRef}>
                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label-sm font-bold uppercase tracking-wide transition-all border ${
                                        activeFilterCount > 0 || showFilters
                                            ? 'bg-md-sys-primary/15 text-md-sys-primary border-md-sys-primary/30'
                                            : 'bg-md-sys-surfaceContainerHigh text-md-sys-on-surface/60 border-transparent hover:bg-md-sys-surfaceContainerHighest'
                                    }`}
                                    aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
                                >
                                    <SlidersHorizontal size={13} />
                                    Filter
                                    {activeFilterCount > 0 && (
                                        <span className="min-w-[16px] h-4 rounded-full bg-md-sys-primary text-md-sys-onPrimary text-[10px] font-black flex items-center justify-center px-1">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </button>
                                {showFilters && (
                                    <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-card mg-surface-high border border-md-sys-outline/20 shadow-xl p-4 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Filters</span>
                                            {activeFilterCount > 0 && (
                                                <button
                                                    onClick={() => setEntityFilters({ ship: [], prospectorWeapon: [], equipment: [], perk: [], update: [] })}
                                                    className="text-label-xs font-bold text-md-sys-primary hover:underline"
                                                >
                                                    Clear all
                                                </button>
                                            )}
                                        </div>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-label-xs text-md-sys-on-surface/50 font-semibold">Ship</span>
                                            <select
                                                value={entityFilters.ship[0] || ''}
                                                onChange={(e) => setEntityFilters((prev) => ({ ...prev, ship: e.target.value ? [e.target.value] : [] }))}
                                                className={filterSelectClassName + ' w-full'}
                                            >
                                                <option value="">All Ships</option>
                                                {shipFilterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-label-xs text-md-sys-on-surface/50 font-semibold">Weapon</span>
                                            <select
                                                value={entityFilters.prospectorWeapon[0] || ''}
                                                onChange={(e) => setEntityFilters((prev) => ({ ...prev, prospectorWeapon: e.target.value ? [e.target.value] : [] }))}
                                                className={filterSelectClassName + ' w-full'}
                                            >
                                                <option value="">All Weapons</option>
                                                {weaponFilterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-label-xs text-md-sys-on-surface/50 font-semibold">Equipment</span>
                                            <select
                                                value={entityFilters.equipment[0] || ''}
                                                onChange={(e) => setEntityFilters((prev) => ({ ...prev, equipment: e.target.value ? [e.target.value] : [] }))}
                                                className={filterSelectClassName + ' w-full'}
                                            >
                                                <option value="">All Equipment</option>
                                                {equipmentFilterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-label-xs text-md-sys-on-surface/50 font-semibold">Perk Set</span>
                                            <select
                                                value={entityFilters.perk[0] || ''}
                                                onChange={(e) => setEntityFilters((prev) => ({ ...prev, perk: e.target.value ? [e.target.value] : [] }))}
                                                className={filterSelectClassName + ' w-full'}
                                            >
                                                <option value="">All Perk Sets</option>
                                                {perkFilterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-label-xs text-md-sys-on-surface/50 font-semibold">Update</span>
                                            <select
                                                value={entityFilters.update[0] || ''}
                                                onChange={(e) => setEntityFilters((prev) => ({ ...prev, update: e.target.value ? [e.target.value] : [] }))}
                                                className={filterSelectClassName + ' w-full'}
                                            >
                                                <option value="">All Updates</option>
                                                {UPDATE_DEFINITIONS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                                            </select>
                                        </label>
                                    </div>
                                )}
                            </div>

                            {/* Download */}
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
                        </div>
                    </div>

                    {/* Row 2: Time range pills */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="at-eyebrow mr-1 self-center hidden sm:inline">Time scope</span>
                        {TIME_RANGE_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                data-active={timeRange === opt.value ? 'true' : 'false'}
                                onClick={() => setTimeRange(opt.value)}
                                className="at-chip px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary"
                            >
                                {opt.label}
                            </button>
                        ))}
                        {timeRange === 'custom' && (
                            <>
                                <input
                                    type="date"
                                    value={customDateFrom}
                                    onChange={(e) => setCustomDateFrom(e.target.value)}
                                    className={filterSelectClassName}
                                    aria-label="Custom range start date"
                                />
                                <span className="text-label-sm text-md-sys-on-surface/40 font-bold">→</span>
                                <input
                                    type="date"
                                    value={customDateTo}
                                    min={customDateFrom || undefined}
                                    onChange={(e) => setCustomDateTo(e.target.value)}
                                    className={filterSelectClassName}
                                    aria-label="Custom range end date"
                                />
                            </>
                        )}
                    </div>

                    {/* Active filter tags — shown beneath time range when filters are set */}
                    {activeFilterCount > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {activeContextTags.slice(1).map((tag) => (
                                <span key={tag} className="at-context-tag px-2.5 py-0.5 text-label-xs">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            {isProMode ? (
                // All Views Mode: High Density Grid
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
                // Standard / Dense Mode
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

                    {/* Sub-view nav */}
                    {data.filteredMatches.length > 0 && currentView !== 'overview' && (
                        <div className="flex-shrink-0">
                            <div className="at-subnav flex items-center gap-0 overflow-x-auto no-scrollbar">
                                {CATEGORY_SUBVIEWS[activeCategory]?.map((view) => (
                                    <button
                                        key={view}
                                        type="button"
                                        onClick={() => navigateTo(view)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-label-sm font-bold uppercase tracking-wide whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary border-b-2 -mb-px ${
                                            currentView === view
                                                ? 'text-md-sys-on-surface border-b-md-sys-primary'
                                                : 'text-md-sys-on-surface/50 border-b-transparent hover:text-md-sys-on-surface/80 hover:border-b-md-sys-outline/40'
                                        }`}
                                    >
                                        {VIEW_LABELS[view]}
                                    </button>
                                ))}
                                {!!VIEW_TO_TILE_ID[currentView] && (
                                    <button
                                        type="button"
                                        onClick={() => togglePin(VIEW_TO_TILE_ID[currentView] ?? currentView)}
                                        className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-label-sm font-bold uppercase tracking-wide whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary border-b-2 -mb-px ${
                                            pinnedTiles.has(VIEW_TO_TILE_ID[currentView] ?? currentView)
                                                ? 'text-md-sys-primary border-b-md-sys-primary/40'
                                                : 'text-md-sys-on-surface/40 border-b-transparent hover:text-md-sys-on-surface/70'
                                        }`}
                                        aria-label={pinnedTiles.has(VIEW_TO_TILE_ID[currentView] ?? currentView) ? 'Unpin this view' : 'Pin this view for export'}
                                    >
                                        <Pin size={11} fill={pinnedTiles.has(VIEW_TO_TILE_ID[currentView] ?? currentView) ? 'currentColor' : 'none'} />
                                        {pinnedTiles.has(VIEW_TO_TILE_ID[currentView] ?? currentView) ? 'Pinned' : 'Pin'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {data.filteredMatches.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-md-sys-on-surface/40 animate-fade-in px-4">
                            <div className="at-empty-state w-full max-w-sm flex flex-col items-center justify-center gap-4 px-6 py-10">
                                <div className="w-16 h-16 rounded-2xl bg-md-sys-primaryContainer/25 border border-md-sys-primary/15 flex items-center justify-center shadow-lg">
                                    <Activity size={28} className="text-md-sys-primary/50" aria-hidden />
                                </div>
                                <div className="text-center">
                                    <h3 className="at-display text-body font-extrabold text-md-sys-on-surface/65">No signal yet</h3>
                                    <p className="text-label-sm mt-2 text-md-sys-on-surface/45 font-mono uppercase tracking-wider">Record matches to populate the deck</p>
                                </div>
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
                                    pinnedTiles={pinnedTiles}
                                    onTogglePin={togglePin}
                                />
                            ) : (
                                renderExpandedView()
                            )}
                            {pinnedTiles.size > 0 && (
                                <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 md3-card rounded-card p-3 border border-md-sys-primary/20 bg-md-sys-primary/5">
                                    <div className="flex items-center gap-2 text-label-sm font-bold text-md-sys-on-surface/70">
                                        <Pin size={14} className="text-md-sys-primary" fill="currentColor" />
                                        <span>{pinnedTiles.size} tile{pinnedTiles.size !== 1 ? 's' : ''} pinned</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPinnedTiles(new Set())}
                                            className="text-label-sm font-bold text-md-sys-on-surface/50 hover:text-md-sys-on-surface/80 transition-colors"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowExportModal(true)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label-sm font-bold uppercase tracking-wide bg-md-sys-primary text-md-sys-onPrimary hover:opacity-90 transition-opacity"
                                        >
                                            <Download size={12} />
                                            Export
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
            {showExportModal && (
                <StatExportModal
                    pinnedIds={[...pinnedTiles]}
                    analyticsData={exportTileData}
                    onClose={() => setShowExportModal(false)}
                    onClearPins={() => {
                        setPinnedTiles(new Set());
                        setShowExportModal(false);
                    }}
                />
            )}
        </div>
    );
};
