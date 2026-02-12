import { useMemo } from 'react';
import {
    Match,
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
    calculateInsights, calculateSocialData, calculateSynergyMatrix,
    calculateRelationshipAnalytics, calculateTimePatterns,
    calculateStreakHistory, calculateSessionSummary,
    calculatePeriodComparison, calculateKillEfficiency,
    calculatePlacementDistribution, calculatePerformanceMomentum,
} from '../../utils/analytics';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';

export const useAnalyticsData = (timeRange: AnalyticsTimeRange, lastN: number = 20, view?: AnalyticsView) => {
    const { matches, playerProfiles } = useGameData();
    const { activeMode } = useUIState();

    const rangeStart = useMemo(() => {
        if (timeRange === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            return startOfDay.getTime();
        }
        if (timeRange === 'week') {
            const startOfWeek = new Date();
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            return startOfWeek.getTime();
        }
        if (timeRange === 'month') {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            return startOfMonth.getTime();
        }
        return 0;
    }, [timeRange]);

    const filteredMatches = useMemo(() => {
        let m = matches.filter(m => m.mode === activeMode).sort((a, b) => a.timestamp - b.timestamp);
        if (timeRange === 'today') {
            m = m.filter(x => x.timestamp >= rangeStart);
        } else if (timeRange === 'week') {
            m = m.filter(x => x.timestamp >= rangeStart);
        } else if (timeRange === 'month') {
            m = m.filter(x => x.timestamp >= rangeStart);
        } else if (timeRange === 'lastN') {
            m = m.slice(-lastN);
        }
        return m;
    }, [matches, activeMode, timeRange, lastN, rangeStart]);

    const wantOverview = view === 'overview' || view === 'essay' || !view;
    const wantSession = wantOverview || view === 'session';
    const wantMomentum = wantOverview || view === 'momentum';
    const wantPeriod = wantOverview || view === 'period';
    const wantTimePatterns = wantOverview || view === 'timePatterns';
    const wantStreaks = wantOverview || view === 'streaks';
    const wantKillEfficiency = wantOverview || view === 'killEfficiency';
    const wantPlacement = wantOverview || view === 'placement';
    const wantInsights = wantOverview || view === 'insights';
    const wantSocial = wantOverview || view === 'social';
    const wantPro = wantOverview || view === 'pro';
    const wantEnvironment = wantOverview || view === 'environment';
    const wantSynergy = wantOverview || view === 'synergy';

    const winRate = useMemo(() => {
        if (filteredMatches.length === 0) return 0;
        return Math.round((filteredMatches.filter(m => m.result === 'Win').length / filteredMatches.length) * 100);
    }, [filteredMatches]);

    const currentStreak = useMemo(() => {
        const reversed = [...filteredMatches].reverse();
        let streak = 0;
        for (const m of reversed) { if (m.result === 'Win') streak++; else break; }
        return streak;
    }, [filteredMatches]);

    // Deps intentionally omit want* flags: the guard still prevents computing
    // until the view is first needed, but once computed the cache persists across
    // view switches (only invalidated when filteredMatches actually changes).
    const insights = useMemo(() => (wantInsights ? calculateInsights(filteredMatches) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredMatches]);
    const socialData = useMemo(() => (wantSocial ? calculateSocialData(filteredMatches) : null), [filteredMatches]); // eslint-disable-line react-hooks/exhaustive-deps
    const synergyMatrix = useMemo(() => (wantSynergy ? calculateSynergyMatrix(filteredMatches) : {}), [filteredMatches]); // eslint-disable-line react-hooks/exhaustive-deps
    const relationshipInsights = useMemo(() => (wantSocial ? calculateRelationshipAnalytics(playerProfiles as any, {}) : []), [playerProfiles]); // eslint-disable-line react-hooks/exhaustive-deps

    // New V2 analytics
    const timePatterns = useMemo(() => (wantTimePatterns ? calculateTimePatterns(filteredMatches) : null), [filteredMatches]); // eslint-disable-line react-hooks/exhaustive-deps
    const streakHistory = useMemo(() => (wantStreaks ? calculateStreakHistory(filteredMatches) : { timeline: [], longestWinStreak: 0, longestLossStreak: 0, currentStreak: 0, averageStreakLength: 0 } as StreakData), [filteredMatches]); // eslint-disable-line react-hooks/exhaustive-deps
    const sessionSummary = useMemo(() => (wantSession ? calculateSessionSummary(filteredMatches) : null), [filteredMatches]); // eslint-disable-line react-hooks/exhaustive-deps
    const periodComparison = useMemo(() => (wantPeriod ? calculatePeriodComparison(filteredMatches) : null), [filteredMatches]); // eslint-disable-line react-hooks/exhaustive-deps
    const killEfficiency = useMemo(() => (wantKillEfficiency ? calculateKillEfficiency(filteredMatches) : null), [filteredMatches]); // eslint-disable-line react-hooks/exhaustive-deps
    const placementData = useMemo(() => (wantPlacement ? calculatePlacementDistribution(filteredMatches) : { distribution: [], avgPlacement: 0, medianPlacement: 0, topQuartileRate: 0 } as PlacementData), [filteredMatches]); // eslint-disable-line react-hooks/exhaustive-deps
    const momentum = useMemo(() => (wantMomentum ? calculatePerformanceMomentum(filteredMatches) : null), [filteredMatches]); // eslint-disable-line react-hooks/exhaustive-deps

    const avgSortiesPerDay = useMemo(() => {
        if (filteredMatches.length === 0) return 0;
        const now = Date.now();
        let start = rangeStart;
        let end = now;
        if (timeRange === 'all') {
            start = filteredMatches[0]?.timestamp || now;
            end = filteredMatches[filteredMatches.length - 1]?.timestamp || now;
        } else if (timeRange === 'lastN') {
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
        socialData: socialData || { teammates: [], opponents: [] },
        synergyMatrix,
        relationshipInsights,
        timePatterns: timePatterns || ({
            byHour: [],
            byDayOfWeek: [],
            heatmap: [],
            peakHour: 0,
            peakDay: 0
        } as TimePatternData),
        streakHistory,
        sessionSummary: sessionSummary || ({
            today: null,
            yesterday: null,
            last7Days: [],
            dailyAverage: { matches: 0, wins: 0, kills: 0 }
        } as SessionSummaryData),
        periodComparison: periodComparison || ({
            thisWeek: { matches: 0, wins: 0, losses: 0, winRate: 0, avgKills: 0, avgDamage: 0 },
            lastWeek: { matches: 0, wins: 0, losses: 0, winRate: 0, avgKills: 0, avgDamage: 0 },
            thisMonth: { matches: 0, wins: 0, losses: 0, winRate: 0, avgKills: 0, avgDamage: 0 },
            lastMonth: { matches: 0, wins: 0, losses: 0, winRate: 0, avgKills: 0, avgDamage: 0 },
            weekDelta: { winRate: 0, matches: 0, avgKills: 0, avgDamage: 0 },
            monthDelta: { winRate: 0, matches: 0, avgKills: 0, avgDamage: 0 }
        } as PeriodComparisonData),
        killEfficiency: killEfficiency || ({
            timeline: [],
            overallAvgKills: 0,
            killsByShipType: {},
            killsByHero: {},
            trendDirection: 'stable'
        } as KillEfficiencyData),
        placementData,
        momentum: momentum || ({
            timeline: [],
            currentMomentum: 0,
            peakMomentum: 0,
            trend: 'stable'
        } as MomentumData),
        avgSortiesPerDay,
        playerProfiles,
    };
};
