import { describe, it, expect } from 'vitest';
import {
    calculateTimePatterns,
    calculateStreakHistory,
    calculateSessionSummary,
    calculatePeriodComparison,
    calculateKillEfficiency,
    calculatePlacementDistribution,
    calculatePerformanceMomentum,
} from '../analytics';
import type { Match } from '../../types';

function createMatch(overrides: Partial<Match> = {}): Match {
    return {
        id: Math.floor(Math.random() * 100000),
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0],
        mode: 'Artifact Brawl',
        player: 'TestPlayer',
        teammates: [],
        opponents: [],
        hero: 'Adrian',
        ship: 'Hunter (2 Player)',
        subType: 'Standard',
        reachModifiers: [],
        kills: { Hunter: 1 },
        result: 'Win',
        damageTaken: 500,
        time: '10:00',
        ...overrides,
    };
}

function createMatchesOverDays(count: number): Match[] {
    const matches: Match[] = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
        const ts = now - (count - i) * 3600000; // 1 hour apart
        matches.push(createMatch({
            id: i,
            timestamp: ts,
            date: new Date(ts).toISOString().split('T')[0],
            result: i % 3 === 0 ? 'Loss' : 'Win',
            kills: { Hunter: i % 4, Bastion: i % 2 },
            damageTaken: 200 + i * 50,
            hero: ['Adrian', 'Venture', 'Kae'][i % 3],
            ship: ['Hunter (2 Player)', 'Bastion (4 Player)', 'Scout (Solo Outlaw)'][i % 3],
        }));
    }
    return matches;
}

describe('calculateTimePatterns', () => {
    it('returns 24 hour buckets and 7 day buckets', () => {
        const matches = createMatchesOverDays(20);
        const result = calculateTimePatterns(matches);
        expect(result.byHour).toHaveLength(24);
        expect(result.byDayOfWeek).toHaveLength(7);
        expect(result.peakHour).toBeGreaterThanOrEqual(0);
        expect(result.peakHour).toBeLessThan(24);
        expect(result.peakDay).toBeGreaterThanOrEqual(0);
        expect(result.peakDay).toBeLessThan(7);
    });

    it('handles empty matches', () => {
        const result = calculateTimePatterns([]);
        expect(result.byHour).toHaveLength(24);
        expect(result.heatmap).toHaveLength(0);
    });

    it('win rates are between 0 and 100', () => {
        const matches = createMatchesOverDays(30);
        const result = calculateTimePatterns(matches);
        result.byHour.forEach(h => {
            expect(h.winRate).toBeGreaterThanOrEqual(0);
            expect(h.winRate).toBeLessThanOrEqual(100);
        });
    });
});

describe('calculateStreakHistory', () => {
    it('returns correct current streak', () => {
        const matches = [
            createMatch({ timestamp: 1000, result: 'Win' }),
            createMatch({ timestamp: 2000, result: 'Win' }),
            createMatch({ timestamp: 3000, result: 'Win' }),
        ];
        const result = calculateStreakHistory(matches);
        expect(result.currentStreak).toBe(3);
        expect(result.longestWinStreak).toBe(3);
        expect(result.longestLossStreak).toBe(0);
    });

    it('tracks negative streaks', () => {
        const matches = [
            createMatch({ timestamp: 1000, result: 'Loss' }),
            createMatch({ timestamp: 2000, result: 'Loss' }),
            createMatch({ timestamp: 3000, result: 'Win' }),
        ];
        const result = calculateStreakHistory(matches);
        expect(result.currentStreak).toBe(1);
        expect(result.longestLossStreak).toBe(2);
        expect(result.timeline).toHaveLength(3);
    });

    it('handles empty matches', () => {
        const result = calculateStreakHistory([]);
        expect(result.currentStreak).toBe(0);
        expect(result.timeline).toHaveLength(0);
    });

    it('computes average streak length', () => {
        const matches = [
            createMatch({ timestamp: 1000, result: 'Win' }),
            createMatch({ timestamp: 2000, result: 'Win' }),
            createMatch({ timestamp: 3000, result: 'Loss' }),
            createMatch({ timestamp: 4000, result: 'Win' }),
        ];
        const result = calculateStreakHistory(matches);
        expect(result.averageStreakLength).toBeGreaterThan(0);
    });
});

describe('calculateSessionSummary', () => {
    it('returns today and dailyAverage', () => {
        const now = Date.now();
        const matches = [
            createMatch({ timestamp: now - 1000, result: 'Win' }),
            createMatch({ timestamp: now - 2000, result: 'Loss' }),
        ];
        const result = calculateSessionSummary(matches);
        expect(result.today).not.toBeNull();
        expect(result.today!.matches).toBe(2);
        expect(result.today!.wins).toBe(1);
        expect(result.today!.losses).toBe(1);
        expect(result.today!.winRate).toBe(50);
        expect(result.dailyAverage.matches).toBeGreaterThan(0);
    });

    it('returns null for today if no matches today', () => {
        const oldTs = Date.now() - 7 * 86400000;
        const matches = [createMatch({ timestamp: oldTs })];
        const result = calculateSessionSummary(matches);
        expect(result.today).toBeNull();
    });

    it('handles empty matches', () => {
        const result = calculateSessionSummary([]);
        expect(result.today).toBeNull();
        expect(result.yesterday).toBeNull();
        expect(result.last7Days).toHaveLength(0);
    });
});

describe('calculatePeriodComparison', () => {
    it('returns period stats with deltas', () => {
        const matches = createMatchesOverDays(30);
        const result = calculatePeriodComparison(matches);
        expect(result.thisWeek).toHaveProperty('matches');
        expect(result.thisWeek).toHaveProperty('winRate');
        expect(result.weekDelta).toHaveProperty('winRate');
        expect(result.monthDelta).toHaveProperty('matches');
    });

    it('handles empty matches', () => {
        const result = calculatePeriodComparison([]);
        expect(result.thisWeek.matches).toBe(0);
        expect(result.lastWeek.matches).toBe(0);
    });
});

describe('calculateKillEfficiency', () => {
    it('returns timeline and overall avg kills', () => {
        const matches = createMatchesOverDays(20);
        const result = calculateKillEfficiency(matches);
        expect(result.timeline).toHaveLength(20);
        expect(result.overallAvgKills).toBeGreaterThanOrEqual(0);
        expect(Object.keys(result.killsByShipType).length).toBeGreaterThan(0);
        expect(Object.keys(result.killsByHero).length).toBeGreaterThan(0);
        expect(['up', 'down', 'stable']).toContain(result.trendDirection);
    });

    it('handles empty matches', () => {
        const result = calculateKillEfficiency([]);
        expect(result.timeline).toHaveLength(0);
        expect(result.overallAvgKills).toBe(0);
    });
});

describe('calculatePlacementDistribution', () => {
    it('returns null for insufficient data', () => {
        const matches = [createMatch({ placement: 1 }), createMatch({ placement: 2 })];
        const result = calculatePlacementDistribution(matches);
        expect(result).toBeNull();
    });

    it('computes distribution for sufficient data', () => {
        const matches = Array.from({ length: 10 }, (_, i) =>
            createMatch({ placement: (i % 4) + 1 })
        );
        const result = calculatePlacementDistribution(matches);
        expect(result).not.toBeNull();
        expect(result!.distribution.length).toBeGreaterThan(0);
        expect(result!.avgPlacement).toBeGreaterThan(0);
        expect(result!.medianPlacement).toBeGreaterThan(0);
        expect(result!.topQuartileRate).toBeGreaterThanOrEqual(0);
    });

    it('ignores matches without placement', () => {
        const matches = Array.from({ length: 10 }, () => createMatch());
        const result = calculatePlacementDistribution(matches);
        expect(result).toBeNull();
    });
});

describe('calculatePerformanceMomentum', () => {
    it('returns momentum scores 0-100', () => {
        const matches = createMatchesOverDays(20);
        const result = calculatePerformanceMomentum(matches);
        expect(result.timeline).toHaveLength(20);
        result.timeline.forEach(t => {
            expect(t.score).toBeGreaterThanOrEqual(0);
            expect(t.score).toBeLessThanOrEqual(100);
        });
        expect(result.currentMomentum).toBeGreaterThanOrEqual(0);
        expect(result.peakMomentum).toBeGreaterThanOrEqual(result.currentMomentum);
        expect(['rising', 'falling', 'stable']).toContain(result.trend);
    });

    it('handles empty matches', () => {
        const result = calculatePerformanceMomentum([]);
        expect(result.timeline).toHaveLength(0);
        expect(result.currentMomentum).toBe(0);
        expect(result.peakMomentum).toBe(0);
    });

    it('respects custom window size', () => {
        const matches = createMatchesOverDays(15);
        const result = calculatePerformanceMomentum(matches, 5);
        expect(result.timeline).toHaveLength(15);
    });
});
