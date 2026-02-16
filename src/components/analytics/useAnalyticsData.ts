import { useMemo } from 'react';
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
} from '../../utils/analytics';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';

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

export const useAnalyticsData = (timeRange: AnalyticsTimeRange, lastN: number = 20, view?: AnalyticsView) => {
    const { matches, playerProfiles } = useGameData();
    const { activeMode } = useUIState();

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
        () => matches.filter(m => m.mode === activeMode).sort((a, b) => a.timestamp - b.timestamp),
        [matches, activeMode]
    );
    const completedModeMatches = useMemo(
        () => modeMatches.filter((m) => m.result !== 'Ongoing'),
        [modeMatches]
    );

    const filteredMatches = useMemo(() => {
        if (timeRange === 'lastN') return completedModeMatches.slice(-lastN);
        if (timeRange === 'today' || timeRange === 'week' || timeRange === 'month') {
            return completedModeMatches.filter(m => m.timestamp >= rangeStart);
        }
        return completedModeMatches;
    }, [completedModeMatches, timeRange, lastN, rangeStart]);

    const wantOverview = view === 'overview' || view === 'reactor' || view === 'essay' || !view;
    const wantSession = wantOverview || view === 'session';
    const wantMomentum = wantOverview || view === 'momentum';
    const wantPeriod = wantOverview || view === 'period';
    const wantTimePatterns = wantOverview || view === 'timePatterns';
    const wantStreaks = wantOverview || view === 'streaks';
    const wantKillEfficiency = wantOverview || view === 'killEfficiency';
    const wantPlacement = wantOverview || view === 'placement';
    const wantInsights = wantOverview || view === 'insights';
    const wantSocial = wantOverview || view === 'social';
    const wantSynergy = wantOverview || view === 'synergy';

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
        () => (wantSocial ? calculateRelationshipAnalytics(playerProfiles as any, {}) : []),
        [wantSocial, playerProfiles]
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
        let start = rangeStart;
        let end = now;

        if (timeRange === 'all' || timeRange === 'lastN') {
            start = filteredMatches[0]?.timestamp || now;
            end = filteredMatches[filteredMatches.length - 1]?.timestamp || now;
        }

        const spanDays = Math.max(1, Math.ceil((end - start) / 86400000));
        return Math.round(filteredMatches.length / spanDays);
    }, [filteredMatches, timeRange, rangeStart]);

    return {
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
        playerProfiles,
    };
};
