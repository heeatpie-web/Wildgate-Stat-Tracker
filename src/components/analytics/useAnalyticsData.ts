import { useDeferredValue, useMemo } from 'react';
import {
    AnalyticsTimeRange,
    AnalyticsView,
    TimePatternData,
    SessionSummaryData,
    PeriodComparisonData,
    KillEfficiencyData,
    MomentumData,
    StreakData,
    PlacementData,
    EntityAnalyticsData,
    EntityAnalyticsFilters,
    EntityComparison,
    EntityDimensionKey,
    EntityMetricRow,
    MetaAnalyticsData,
} from '../../types';
import {
    calculateInsights,
    calculateSocialData,
    calculateSynergyMatrix,
    calculateRelationshipAnalytics,
    calculateTimePatterns,
    calculateStreakHistory,
    calculateSessionSummary,
    calculatePeriodComparison,
    calculateKillEfficiency,
    calculatePlacementDistribution,
    calculatePerformanceMomentum,
    calculateMetaAnalytics,
} from '../../utils/analytics';
import { buildAnalyticsIdentityResolver } from '../../utils/analyticsIdentity';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { getUpdateLabel } from '../../data/gamePatches';
import { getMatchCategory, getMatchEquipment, getMatchPerks, getMatchProspectorWeapons, getMatchShip, getMatchUpdateKey } from '../patch/patchEntityCatalog';

const METRIC_MIN_SAMPLE = 5;
const DELTA_MIN_SAMPLE = 10;
const LOW_SAMPLE_THRESHOLD = 10;

const EMPTY_TIME_PATTERNS: TimePatternData = {
    byHour: [],
    byDayOfWeek: [],
    heatmap: [],
    peakHour: 0,
    peakDay: 0,
};

const EMPTY_SESSION_SUMMARY: SessionSummaryData = {
    today: null,
    yesterday: null,
    last7Days: [],
    dailyAverage: { matches: 0, wins: 0, kills: 0 },
};

const EMPTY_PERIOD_COMPARISON: PeriodComparisonData = {
    thisWeek: { matches: 0, wins: 0, losses: 0, winRate: 0, avgKills: 0, avgDamage: 0 },
    lastWeek: { matches: 0, wins: 0, losses: 0, winRate: 0, avgKills: 0, avgDamage: 0 },
    thisMonth: { matches: 0, wins: 0, losses: 0, winRate: 0, avgKills: 0, avgDamage: 0 },
    lastMonth: { matches: 0, wins: 0, losses: 0, winRate: 0, avgKills: 0, avgDamage: 0 },
    weekDelta: { winRate: 0, matches: 0, avgKills: 0, avgDamage: 0 },
    monthDelta: { winRate: 0, matches: 0, avgKills: 0, avgDamage: 0 },
};

const EMPTY_KILL_EFF: KillEfficiencyData = {
    timeline: [],
    overallAvgKills: 0,
    killsByShipType: {},
    killsByHero: {},
    trendDirection: 'stable',
};

const EMPTY_PLACEMENT: PlacementData = {
    distribution: [],
    avgPlacement: 0,
    medianPlacement: 0,
    topQuartileRate: 0,
};

const EMPTY_MOMENTUM: MomentumData = {
    timeline: [],
    currentMomentum: 0,
    peakMomentum: 0,
    trend: 'stable',
};

const EMPTY_STREAK: StreakData = {
    timeline: [],
    longestWinStreak: 0,
    longestLossStreak: 0,
    currentStreak: 0,
    averageStreakLength: 0,
};

const EMPTY_ENTITY_FILTERS: EntityAnalyticsFilters = {
    ship: [],
    prospectorWeapon: [],
    equipment: [],
    perk: [],
    update: [],
    category: [],
};

const toPct = (value: number): number => Math.round(value * 1000) / 10;

const toPlacementBucket = (placement: number | undefined | null): string => {
    const parsed = Number(placement || 0);
    if (!Number.isInteger(parsed) || parsed <= 0) return 'unknown';
    if (parsed === 1) return '1';
    if (parsed <= 3) return '2-3';
    if (parsed <= 5) return '4-5';
    return '6+';
};

const calculateComparison = (
    label: string,
    selectedMatches: any[],
    baselineMatches: any[]
): EntityComparison => {
    const selectedSample = selectedMatches.length;
    const baselineSample = baselineMatches.length;
    const selectedWinRate = selectedSample > 0
        ? toPct(selectedMatches.filter((m) => m.result === 'Win').length / selectedSample)
        : 0;
    const baselineWinRate = baselineSample > 0
        ? toPct(baselineMatches.filter((m) => m.result === 'Win').length / baselineSample)
        : 0;
    const gated = selectedSample < DELTA_MIN_SAMPLE || baselineSample < DELTA_MIN_SAMPLE;
    if (gated) {
        return {
            label,
            selectedSample,
            baselineSample,
            selectedWinRate,
            baselineWinRate,
            absoluteDelta: null,
            relativeDelta: null,
            gated: true,
            gateReason: `Minimum ${DELTA_MIN_SAMPLE} matches per side required`,
        };
    }
    const absoluteDelta = toPct((selectedWinRate - baselineWinRate) / 100);
    const relativeDelta = baselineWinRate > 0
        ? toPct((selectedWinRate - baselineWinRate) / baselineWinRate)
        : null;
    return {
        label,
        selectedSample,
        baselineSample,
        selectedWinRate,
        baselineWinRate,
        absoluteDelta,
        relativeDelta,
        gated: false,
    };
};

const buildEntityRows = (
    matches: any[],
    dimension: EntityDimensionKey
): EntityMetricRow[] => {
    const counters: Record<string, {
        label: string;
        total: number;
        wins: number;
        placements: Record<string, number>;
    }> = {};
    matches.forEach((match) => {
        const labels = (() => {
            switch (dimension) {
                case 'ship': {
                    const ship = getMatchShip(match);
                    return ship ? [ship] : ['Unknown'];
                }
                case 'prospectorWeapon':
                    return getMatchProspectorWeapons(match);
                case 'equipment':
                    return getMatchEquipment(match);
                case 'perk':
                    return getMatchPerks(match);
                case 'update':
                    return [getMatchUpdateKey(match)];
                case 'category': {
                    const category = getMatchCategory(match);
                    return category ? [category] : [];
                }
                default:
                    return [];
            }
        })();
        const unique = Array.from(new Set(labels.map((entry) => String(entry || '').trim()).filter(Boolean)));
        unique.forEach((label) => {
            const key = label.toLowerCase();
            if (!counters[key]) {
                counters[key] = { label, total: 0, wins: 0, placements: {} };
            }
            counters[key].total += 1;
            if (match.result === 'Win') counters[key].wins += 1;
            const bucket = toPlacementBucket(match.placement);
            counters[key].placements[bucket] = (counters[key].placements[bucket] || 0) + 1;
        });
    });
    const totalMatches = Math.max(matches.length, 1);
    return Object.entries(counters)
        .map(([key, value]) => ({
            key,
            label: dimension === 'update' ? getUpdateLabel(key) : value.label,
            sampleCount: value.total,
            usageRate: toPct(value.total / totalMatches),
            winRate: toPct(value.wins / Math.max(value.total, 1)),
            placementDistribution: value.placements,
            lowSample: value.total < LOW_SAMPLE_THRESHOLD,
        }))
        .filter((row) => row.sampleCount >= METRIC_MIN_SAMPLE)
        .sort((a, b) => b.sampleCount - a.sampleCount);
};

const matchPassesFilters = (match: any, filters: EntityAnalyticsFilters): boolean => {
    const ship = getMatchShip(match);
    const weapons = getMatchProspectorWeapons(match);
    const equipment = getMatchEquipment(match);
    const perks = getMatchPerks(match);
    const update = getMatchUpdateKey(match);
    const category = getMatchCategory(match);
    if (filters.ship.length > 0 && !filters.ship.some((candidate) => candidate.toLowerCase() === ship.toLowerCase())) {
        return false;
    }
    if (filters.prospectorWeapon.length > 0 && !filters.prospectorWeapon.some((candidate) => weapons.some((entry) => entry.toLowerCase() === candidate.toLowerCase()))) {
        return false;
    }
    if (filters.equipment.length > 0 && !filters.equipment.some((candidate) => equipment.some((entry) => entry.toLowerCase() === candidate.toLowerCase()))) {
        return false;
    }
    if (filters.perk.length > 0 && !filters.perk.every((candidate) => perks.some((entry) => entry.toLowerCase() === candidate.toLowerCase()))) {
        return false;
    }
    if (filters.update.length > 0 && !filters.update.includes(update)) {
        return false;
    }
    if (filters.category.length > 0 && !filters.category.some((candidate) => candidate.toLowerCase() === category.toLowerCase())) {
        return false;
    }
    return true;
};

const EMPTY_ENTITY_ANALYTICS: EntityAnalyticsData = {
    filters: EMPTY_ENTITY_FILTERS,
    filteredCount: 0,
    thresholds: {
        showMetricsAt: METRIC_MIN_SAMPLE,
        showDeltasAt: DELTA_MIN_SAMPLE,
        lowSampleBelow: LOW_SAMPLE_THRESHOLD,
    },
    dimensions: {
        ship: [],
        prospectorWeapon: [],
        equipment: [],
        perk: [],
        update: [],
        category: [],
    },
    comparisons: {
        periodVsPrevious: {
            label: 'Current Period vs Previous Period',
            baselineSample: 0,
            selectedSample: 0,
            baselineWinRate: 0,
            selectedWinRate: 0,
            absoluteDelta: null,
            relativeDelta: null,
            gated: true,
            gateReason: `Minimum ${DELTA_MIN_SAMPLE} matches per side required`,
        },
        selectedPerkSetVsAll: {
            label: 'Selected Perk Set vs All Matches',
            baselineSample: 0,
            selectedSample: 0,
            baselineWinRate: 0,
            selectedWinRate: 0,
            absoluteDelta: null,
            relativeDelta: null,
            gated: true,
            gateReason: `Minimum ${DELTA_MIN_SAMPLE} matches per side required`,
        },
        selectedLoadoutVsGlobal: {
            label: 'Selected Ship/Loadout vs Global Baseline',
            baselineSample: 0,
            selectedSample: 0,
            baselineWinRate: 0,
            selectedWinRate: 0,
            absoluteDelta: null,
            relativeDelta: null,
            gated: true,
            gateReason: `Minimum ${DELTA_MIN_SAMPLE} matches per side required`,
        },
    },
};

export const useAnalyticsData = (
    timeRange: AnalyticsTimeRange,
    lastN: number = 20,
    view?: AnalyticsView,
    entityFilters: EntityAnalyticsFilters = EMPTY_ENTITY_FILTERS,
    customDateRange: { from: number; to: number } | null = null
) => {
    const {
        matches,
        pilotRegistry,
        pilotAliases,
        playerProfiles,
        knownMappings,
        ocrAliasModel,
        isMatchInProgress,
        matchStartTime,
    } = useGameData();
    const { activeMode } = useUIState();

    // Mapping/profile mutations (e.g. batched OCR corrections) fire far more
    // often than the analytics view needs to re-canonicalise the whole match
    // history. Defer the *inputs* to the identity resolver — not its output —
    // so React can keep the UI responsive and catch the resolver (and every
    // memo downstream of it, incl. `modeMatches`'s full-history canonicalize)
    // up in a lower-priority render. Mirrors PlayerHub.tsx's
    // `deferredPilotRegistry` pattern.
    const deferredPilotRegistry = useDeferredValue(pilotRegistry);
    const deferredPilotAliases = useDeferredValue(pilotAliases);
    const deferredKnownMappings = useDeferredValue(knownMappings);
    const deferredPlayerProfiles = useDeferredValue(playerProfiles);
    const deferredOcrAliasModel = useDeferredValue(ocrAliasModel);

    const analyticsIdentity = useMemo(() => buildAnalyticsIdentityResolver({
        pilotRegistry: deferredPilotRegistry,
        pilotAliases: deferredPilotAliases,
        knownMappings: deferredKnownMappings,
        playerProfiles: deferredPlayerProfiles,
        aliasModel: deferredOcrAliasModel,
    }), [deferredPilotAliases, deferredPilotRegistry, deferredKnownMappings, deferredOcrAliasModel, deferredPlayerProfiles]);

    const canonicalPlayerProfiles = useMemo(
        () => analyticsIdentity.canonicalizePlayerProfiles(deferredPlayerProfiles),
        [analyticsIdentity, deferredPlayerProfiles]
    );

    const rangeStart = useMemo(() => {
        if (timeRange === 'today') {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        }
        if (timeRange === 'week') {
            const d = new Date();
            d.setDate(d.getDate() - d.getDay());
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        }
        if (timeRange === 'month') {
            const d = new Date();
            d.setDate(1);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        }
        return 0;
    }, [timeRange]);

    const modeMatches = useMemo(
        () => analyticsIdentity
            .canonicalizeMatches(matches.filter(m => m.mode === activeMode))
            .sort((a, b) => a.timestamp - b.timestamp),
        [analyticsIdentity, matches, activeMode]
    );
    const completedModeMatches = useMemo(
        () => modeMatches.filter((m) => m.result !== 'Ongoing' && m.result !== 'Saved'),
        [modeMatches]
    );
    const stableCompletedModeMatches = useMemo(() => {
        if (!isMatchInProgress) return completedModeMatches;
        const activeWindowStart = typeof matchStartTime === 'number' ? matchStartTime : 0;
        if (!Number.isFinite(activeWindowStart) || activeWindowStart <= 0) return completedModeMatches;
        return completedModeMatches.filter((match) => Number(match.timestamp || 0) < activeWindowStart);
    }, [completedModeMatches, isMatchInProgress, matchStartTime]);

    const rangeFilteredMatches = useMemo(() => {
        let result: typeof stableCompletedModeMatches;
        if (timeRange === 'lastN') {
            result = stableCompletedModeMatches.slice(-lastN);
        } else if (timeRange === 'ttk') {
            result = stableCompletedModeMatches.filter(m => m.timestamp >= new Date('2026-04-28').getTime());
        } else if (timeRange === 'today' || timeRange === 'week' || timeRange === 'month') {
            result = stableCompletedModeMatches.filter(m => m.timestamp >= rangeStart);
        } else if (timeRange === 'custom' && customDateRange) {
            result = stableCompletedModeMatches.filter(
                m => m.timestamp >= customDateRange.from && m.timestamp <= customDateRange.to
            );
        } else {
            result = stableCompletedModeMatches;
        }
        return result;
    }, [stableCompletedModeMatches, timeRange, lastN, rangeStart, customDateRange]);
    const filteredMatches = useMemo(
        () => rangeFilteredMatches.filter((match) => matchPassesFilters(match, entityFilters)),
        [rangeFilteredMatches, entityFilters]
    );

    const isOverview = view === 'overview';
    const wantFullSuite = view === 'reactor' || view === 'essay' || !view;
    const wantSession = wantFullSuite || view === 'session';
    const wantMomentum = wantFullSuite || isOverview || view === 'momentum';
    const wantPeriod = wantFullSuite || view === 'period';
    const wantTimePatterns = wantFullSuite || view === 'timePatterns';
    const wantStreaks = wantFullSuite || view === 'streaks';
    const wantKillEfficiency = wantFullSuite || view === 'killEfficiency';
    const wantPlacement = wantFullSuite || isOverview || view === 'placement';
    const wantInsights = wantFullSuite || view === 'insights';
    const wantSocial = wantFullSuite || view === 'social';
    const wantSynergy = wantFullSuite || view === 'synergy';
    const wantEntities = wantFullSuite || view === 'pro';
    const wantMeta = wantFullSuite || view === 'meta';

    const winRate = useMemo(() => {
        if (filteredMatches.length === 0) return 0;
        return Math.round((filteredMatches.filter(m => m.result === 'Win').length / filteredMatches.length) * 100);
    }, [filteredMatches]);

    const currentStreak = useMemo(() => {
        const reversed = [...filteredMatches].reverse();
        let streak = 0;
        for (const m of reversed) {
            if (m.result === 'Win') streak++;
            else break;
        }
        return streak;
    }, [filteredMatches]);

    const insights = useMemo(
        () => (wantInsights ? calculateInsights(filteredMatches) : []),
        [wantInsights, filteredMatches]
    );

    const socialData = useMemo(
        () => (wantSocial ? calculateSocialData(filteredMatches) : { teammates: [], opponents: [] }),
        [wantSocial, filteredMatches]
    );

    const synergyMatrix = useMemo(
        () => (wantSynergy ? calculateSynergyMatrix(filteredMatches) : {}),
        [wantSynergy, filteredMatches]
    );

    const relationshipInsights = useMemo(
        () => (wantSocial ? calculateRelationshipAnalytics(canonicalPlayerProfiles as any, deferredKnownMappings) : []),
        [wantSocial, canonicalPlayerProfiles, deferredKnownMappings]
    );

    const timePatterns = useMemo(
        () => (wantTimePatterns ? calculateTimePatterns(filteredMatches) : EMPTY_TIME_PATTERNS),
        [wantTimePatterns, filteredMatches]
    );

    const streakHistory = useMemo(
        () => (wantStreaks ? calculateStreakHistory(filteredMatches) : EMPTY_STREAK),
        [wantStreaks, filteredMatches]
    );

    const sessionSummary = useMemo(
        () => (wantSession ? calculateSessionSummary(filteredMatches) : EMPTY_SESSION_SUMMARY),
        [wantSession, filteredMatches]
    );

    const periodComparison = useMemo(
        () => (wantPeriod ? calculatePeriodComparison(filteredMatches) : EMPTY_PERIOD_COMPARISON),
        [wantPeriod, filteredMatches]
    );

    const killEfficiency = useMemo(
        () => (wantKillEfficiency ? calculateKillEfficiency(filteredMatches) : EMPTY_KILL_EFF),
        [wantKillEfficiency, filteredMatches]
    );

    const placementData = useMemo(
        () => (wantPlacement ? calculatePlacementDistribution(filteredMatches) : EMPTY_PLACEMENT),
        [wantPlacement, filteredMatches]
    );

    const momentum = useMemo(
        () => (wantMomentum ? calculatePerformanceMomentum(filteredMatches) : EMPTY_MOMENTUM),
        [wantMomentum, filteredMatches]
    );

    const avgSortiesPerDay = useMemo(() => {
        if (filteredMatches.length === 0) return 0;
        const now = Date.now();
        let start: number;
        let end: number;

        if (timeRange === 'all' || timeRange === 'lastN' || timeRange === 'ttk') {
            // rangeStart is 0 for these ranges, so the previous fallthrough
            // produced a ~57-year span and a near-zero sorties/day value.
            // Use the actual first/last filtered match timestamps instead.
            start = filteredMatches[0]?.timestamp || now;
            end = filteredMatches[filteredMatches.length - 1]?.timestamp || now;
        } else if (timeRange === 'custom' && customDateRange) {
            start = customDateRange.from;
            end = customDateRange.to;
        } else {
            start = rangeStart;
            end = now;
        }

        const spanDays = Math.max(1, Math.ceil((end - start) / 86400000));
        return Math.round(filteredMatches.length / spanDays);
    }, [filteredMatches, timeRange, rangeStart, customDateRange]);

    const entityAnalytics = useMemo(() => {
        if (!wantEntities) return EMPTY_ENTITY_ANALYTICS;
        const selectedMatches = filteredMatches;
        const allInRange = rangeFilteredMatches;
        const half = Math.floor(allInRange.length / 2);
        const previousPeriodMatches = allInRange.slice(0, half);
        const currentPeriodMatches = allInRange.slice(half);
        // A loadout/perk comparison is only meaningful when there's a filter
        // that distinguishes the "selected" side from the baseline — otherwise
        // selected === allInRange and the delta is always exactly 0pp, which
        // looks like a real measurement but isn't.
        const hasLoadoutFilter = (
            entityFilters.ship.length > 0
            || entityFilters.prospectorWeapon.length > 0
            || entityFilters.equipment.length > 0
            || entityFilters.perk.length > 0
        );
        const hasPerkFilter = entityFilters.perk.length > 0;
        const selectedPerkMatches = hasPerkFilter
            ? allInRange.filter((match) => matchPassesFilters(match, { ...EMPTY_ENTITY_FILTERS, perk: entityFilters.perk }))
            : selectedMatches;
        const noPerkFilterGate: EntityComparison = {
            label: 'Selected Perk Set vs All Matches',
            selectedSample: 0,
            baselineSample: allInRange.length,
            selectedWinRate: 0,
            baselineWinRate: 0,
            absoluteDelta: null,
            relativeDelta: null,
            gated: true,
            gateReason: 'Pick a perk to compare against all matches',
        };
        const noLoadoutFilterGate: EntityComparison = {
            label: 'Selected Ship/Loadout vs Global Baseline',
            selectedSample: 0,
            baselineSample: allInRange.length,
            selectedWinRate: 0,
            baselineWinRate: 0,
            absoluteDelta: null,
            relativeDelta: null,
            gated: true,
            gateReason: 'Pick a ship, weapon, equipment, or perk to compare',
        };
        const analytics = {
            filters: entityFilters,
            filteredCount: selectedMatches.length,
            thresholds: {
                showMetricsAt: METRIC_MIN_SAMPLE,
                showDeltasAt: DELTA_MIN_SAMPLE,
                lowSampleBelow: LOW_SAMPLE_THRESHOLD,
            },
            dimensions: {
                ship: buildEntityRows(selectedMatches, 'ship'),
                prospectorWeapon: buildEntityRows(selectedMatches, 'prospectorWeapon'),
                equipment: buildEntityRows(selectedMatches, 'equipment'),
                perk: buildEntityRows(selectedMatches, 'perk'),
                update: buildEntityRows(selectedMatches, 'update'),
                category: buildEntityRows(selectedMatches, 'category'),
            },
            comparisons: {
                periodVsPrevious: calculateComparison('Current Period vs Previous Period', currentPeriodMatches, previousPeriodMatches),
                selectedPerkSetVsAll: hasPerkFilter
                    ? calculateComparison('Selected Perk Set vs All Matches', selectedPerkMatches, allInRange)
                    : noPerkFilterGate,
                selectedLoadoutVsGlobal: hasLoadoutFilter
                    ? calculateComparison('Selected Ship/Loadout vs Global Baseline', selectedMatches, allInRange)
                    : noLoadoutFilterGate,
            },
        } satisfies EntityAnalyticsData;
        return analytics;
    }, [wantEntities, filteredMatches, rangeFilteredMatches, entityFilters]);

    const metaAnalytics = useMemo(
        () => (wantMeta ? calculateMetaAnalytics(filteredMatches) : null),
        [wantMeta, filteredMatches]
    );

    return {
        rangeFilteredMatches,
        filteredMatches,
        winRate,
        currentStreak,
        insights,
        socialData,
        synergyMatrix,
        relationshipInsights,
        timePatterns,
        streakHistory,
        sessionSummary,
        periodComparison,
        killEfficiency,
        placementData,
        momentum,
        avgSortiesPerDay,
        playerProfiles: canonicalPlayerProfiles,
        entityAnalytics,
        metaAnalytics,
    };
};
