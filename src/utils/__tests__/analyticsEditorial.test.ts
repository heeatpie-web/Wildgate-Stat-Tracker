import { describe, it, expect } from 'vitest';
import {
  generateProEditorial,
  generateEnvironmentEditorial,
  generateSynergyEditorial,
  generateMomentumEditorial,
  generateTimePatternEditorial,
  generateKillEfficiencyEditorial,
  generatePeriodComparisonEditorial,
  generatePlacementEditorial,
  generateSessionSummaryEditorial,
  generateStreakEditorial,
  generateSocialEditorial,
  synthesizeNarrative,
} from '../analyticsEditorial';
import type { Match, MomentumData, TimePatternData, KillEfficiencyData, PeriodComparisonData, PlacementData, SessionSummaryData, StreakData } from '../../types';

// ── Helpers ──

const createMatch = (overrides: Partial<Match> = {}): Match => ({
  id: Date.now() + Math.random(),
  timestamp: Date.now(),
  date: new Date().toISOString(),
  mode: 'Artifact Brawl',
  player: 'TestPlayer',
  teammates: [],
  opponents: [],
  hero: 'Adrian',
  ship: 'Hunter (4 Player)',
  reachModifiers: [],
  kills: { 'AI Legion': 2 },
  result: 'Win',
  subType: '',
  ...overrides,
});

const makeMatches = (count: number, resultPattern: ('Win' | 'Loss')[] = ['Win']): Match[] =>
  Array.from({ length: count }, (_, i) =>
    createMatch({
      id: i,
      result: resultPattern[i % resultPattern.length],
      hero: i % 2 === 0 ? 'Adrian' : 'Kae',
      ship: i % 3 === 0 ? 'Hunter (4 Player)' : 'Scout (3 Player)',
      reachModifiers: i % 2 === 0 ? ['Ice Storm'] : ['Sandstorm'],
    })
  );

// ── generateProEditorial ──

describe('generateProEditorial', () => {
  it('returns prompt for insufficient matches', () => {
    const result = generateProEditorial(makeMatches(3));
    expect(result).toContain('Play more');
  });

  it('returns analysis for enough matches', () => {
    const matches = makeMatches(10, ['Win', 'Win', 'Loss']);
    const result = generateProEditorial(matches);
    expect(result.length).toBeGreaterThan(20);
    expect(result).toContain('%');
  });
});

// ── generateEnvironmentEditorial ──

describe('generateEnvironmentEditorial', () => {
  it('returns prompt for insufficient matches', () => {
    expect(generateEnvironmentEditorial(makeMatches(3))).toContain('More matches');
  });

  it('analyzes hazard impact', () => {
    const matches = makeMatches(10, ['Win', 'Loss']);
    const result = generateEnvironmentEditorial(matches);
    expect(result.length).toBeGreaterThan(10);
  });
});

// ── generateSynergyEditorial ──

describe('generateSynergyEditorial', () => {
  it('returns prompt for no combos', () => {
    expect(generateSynergyEditorial({})).toContain('Play more');
  });

  it('identifies best synergy', () => {
    const matrix = {
      'Hunter': {
        'Adrian': { wins: 5, total: 6 },
        'Kae': { wins: 1, total: 5 },
      },
    };
    const result = generateSynergyEditorial(matrix);
    expect(result).toContain('Adrian');
    expect(result).toContain('Hunter');
    expect(result).toContain('%');
  });
});

// ── generateMomentumEditorial ──

describe('generateMomentumEditorial', () => {
  it('returns prompt for insufficient data', () => {
    const data: MomentumData = { timeline: [], currentMomentum: 0, peakMomentum: 0, trend: 'stable' };
    expect(generateMomentumEditorial(data)).toContain('Keep playing');
  });

  it('describes rising trend', () => {
    const data: MomentumData = {
      timeline: Array.from({ length: 10 }, (_, i) => ({ matchIndex: i, score: 50 + i * 3 })),
      currentMomentum: 80,
      peakMomentum: 82,
      trend: 'rising',
    };
    expect(generateMomentumEditorial(data)).toContain('rise');
  });

  it('describes falling trend', () => {
    const data: MomentumData = {
      timeline: Array.from({ length: 10 }, (_, i) => ({ matchIndex: i, score: 80 - i * 3 })),
      currentMomentum: 40,
      peakMomentum: 80,
      trend: 'falling',
    };
    const result = generateMomentumEditorial(data);
    expect(result).toContain('dipped');
  });
});

// ── generateTimePatternEditorial ──

describe('generateTimePatternEditorial', () => {
  it('returns prompt for no data', () => {
    const data: TimePatternData = {
      byHour: Array.from({ length: 24 }, (_, i) => ({ hour: i, matches: 0, wins: 0, losses: 0, winRate: 0 })),
      byDayOfWeek: Array.from({ length: 7 }, (_, i) => ({ day: i, matches: 0, wins: 0, losses: 0, winRate: 0 })),
      peakHour: 0,
      peakDay: 0,
    };
    expect(generateTimePatternEditorial(data)).toContain('No time pattern');
  });

  it('identifies peak hour and day', () => {
    const byHour = Array.from({ length: 24 }, (_, i) => ({
      hour: i, matches: i === 20 ? 10 : 1, wins: i === 20 ? 7 : 0, losses: i === 20 ? 3 : 1, winRate: i === 20 ? 70 : 0,
    }));
    const byDayOfWeek = Array.from({ length: 7 }, (_, i) => ({
      day: i, matches: i === 5 ? 15 : 2, wins: i === 5 ? 10 : 1, losses: i === 5 ? 5 : 1, winRate: i === 5 ? 67 : 50,
    }));
    const data: TimePatternData = { byHour, byDayOfWeek, peakHour: 20, peakDay: 5 };
    const result = generateTimePatternEditorial(data);
    expect(result).toContain('20:00');
    expect(result).toContain('Friday');
  });
});

// ── generateKillEfficiencyEditorial ──

describe('generateKillEfficiencyEditorial', () => {
  it('returns prompt for insufficient data', () => {
    const data: KillEfficiencyData = {
      timeline: [], overallAvgKills: 0, trendDirection: 'stable',
      killsByShipType: {}, killsByHero: {},
    };
    expect(generateKillEfficiencyEditorial(data)).toContain('Play more');
  });

  it('describes kill trends', () => {
    const data: KillEfficiencyData = {
      timeline: Array.from({ length: 10 }, (_, i) => ({ matchIndex: i, kills: 3 + i })),
      overallAvgKills: 5,
      trendDirection: 'up',
      killsByShipType: { 'Hunter': { avgKills: 6, total: 5 } },
      killsByHero: { 'Adrian': { avgKills: 7, total: 4 } },
    };
    const result = generateKillEfficiencyEditorial(data);
    expect(result).toContain('5');
    expect(result).toContain('upward');
  });
});

// ── generatePeriodComparisonEditorial ──

describe('generatePeriodComparisonEditorial', () => {
  it('returns prompt for no data', () => {
    const data: PeriodComparisonData = {
      thisWeek: { matches: 0, winRate: 0, avgKills: 0 },
      lastWeek: { matches: 0, winRate: 0, avgKills: 0 },
      weekDelta: { winRate: 0, avgKills: 0 },
      thisMonth: { matches: 0, winRate: 0, avgKills: 0 },
      lastMonth: { matches: 0, winRate: 0, avgKills: 0 },
      monthDelta: { winRate: 0, avgKills: 0 },
    };
    expect(generatePeriodComparisonEditorial(data)).toContain('No match data');
  });

  it('describes weekly improvement', () => {
    const data: PeriodComparisonData = {
      thisWeek: { matches: 10, winRate: 70, avgKills: 5 },
      lastWeek: { matches: 10, winRate: 50, avgKills: 4 },
      weekDelta: { winRate: 20, avgKills: 1 },
      thisMonth: { matches: 20, winRate: 60, avgKills: 4.5 },
      lastMonth: { matches: 20, winRate: 55, avgKills: 4 },
      monthDelta: { winRate: 5, avgKills: 0.5 },
    };
    const result = generatePeriodComparisonEditorial(data);
    expect(result).toContain('up');
  });
});

// ── generatePlacementEditorial ──

describe('generatePlacementEditorial', () => {
  it('describes placement stats', () => {
    const data: PlacementData = {
      avgPlacement: 2.5,
      medianPlacement: 2,
      topQuartileRate: 55,
      distribution: [
        { placement: 1, count: 5 },
        { placement: 2, count: 8 },
        { placement: 3, count: 4 },
      ],
    };
    const result = generatePlacementEditorial(data);
    expect(result).toContain('2.5');
    expect(result).toContain('top quartile');
  });
});

// ── generateSessionSummaryEditorial ──

describe('generateSessionSummaryEditorial', () => {
  it('handles no matches today', () => {
    const data: SessionSummaryData = {
      today: null,
      yesterday: null,
      last7Days: [],
      dailyAverage: { matches: 0, wins: 0, losses: 0, winRate: 0 },
    };
    expect(generateSessionSummaryEditorial(data)).toContain('No matches played');
  });

  it('describes today session', () => {
    const data: SessionSummaryData = {
      today: { matches: 5, wins: 3, losses: 2, winRate: 60, totalKills: 12, bestStreak: 3 },
      yesterday: { matches: 4, wins: 1, losses: 3, winRate: 25, totalKills: 8, bestStreak: 1 },
      last7Days: [
        { matches: 5, wins: 3, losses: 2, winRate: 60 },
        { matches: 4, wins: 2, losses: 2, winRate: 50 },
        { matches: 3, wins: 1, losses: 2, winRate: 33 },
      ],
      dailyAverage: { matches: 4, wins: 2, losses: 2, winRate: 50 },
    };
    const result = generateSessionSummaryEditorial(data);
    expect(result).toContain('5 matches');
    expect(result).toContain('60%');
    expect(result).toContain('higher than yesterday');
  });
});

// ── generateStreakEditorial ──

describe('generateStreakEditorial', () => {
  it('returns prompt for insufficient data', () => {
    const data: StreakData = { currentStreak: 0, longestWinStreak: 0, longestLossStreak: 0, averageStreakLength: 0, timeline: [] };
    expect(generateStreakEditorial(data)).toContain('Play more');
  });

  it('describes current win streak', () => {
    const data: StreakData = {
      currentStreak: 3,
      longestWinStreak: 5,
      longestLossStreak: 2,
      averageStreakLength: 2.5,
      timeline: Array.from({ length: 10 }, (_, i) => ({ matchIndex: i, streak: i % 3 === 0 ? 1 : -1 })),
    };
    const result = generateStreakEditorial(data);
    expect(result).toContain('3-win streak');
  });

  it('describes current loss streak', () => {
    const data: StreakData = {
      currentStreak: -4,
      longestWinStreak: 3,
      longestLossStreak: 4,
      averageStreakLength: 2,
      timeline: Array.from({ length: 10 }, (_, i) => ({ matchIndex: i, streak: -1 })),
    };
    const result = generateStreakEditorial(data);
    expect(result).toContain('4-loss streak');
  });
});

// ── generateSocialEditorial ──

describe('generateSocialEditorial', () => {
  it('returns prompt for no repeat encounters', () => {
    const result = generateSocialEditorial({ teammates: [], opponents: [] });
    expect(result).toContain('Not enough');
  });

  it('identifies best wingman and toughest rival', () => {
    const socialData = {
      teammates: [
        ['Ally1', { wins: 8, total: 10 }] as [string, { wins: number; total: number }],
        ['Ally2', { wins: 2, total: 5 }] as [string, { wins: number; total: number }],
      ],
      opponents: [
        ['Rival1', { wins: 1, total: 6 }] as [string, { wins: number; total: number }],
        ['Rival2', { wins: 5, total: 6 }] as [string, { wins: number; total: number }],
      ],
    };
    const result = generateSocialEditorial(socialData);
    expect(result).toContain('Ally1');
    expect(result).toContain('Rival1');
  });
});

// ── synthesizeNarrative ──

describe('synthesizeNarrative', () => {
  const emptySocial = { teammates: [] as any[], opponents: [] as any[] };

  it('returns minimal essay for < 5 matches', () => {
    const result = synthesizeNarrative({
      matches: makeMatches(3),
      winRate: 67,
      currentStreak: 1,
      momentum: null,
      sessionSummary: null,
      periodComparison: null,
      timePatterns: null,
      killEfficiency: null,
      socialData: emptySocial,
      synergyMatrix: {},
    });
    expect(result.headline).toBe('Building Your Story');
    expect(result.sections).toHaveLength(1);
  });

  it('produces multi-section essay for sufficient data', () => {
    const matches = makeMatches(15, ['Win', 'Loss', 'Win']);
    const result = synthesizeNarrative({
      matches,
      winRate: 60,
      currentStreak: 2,
      momentum: {
        timeline: Array.from({ length: 15 }, (_, i) => ({ matchIndex: i, score: 50 + i })),
        currentMomentum: 65,
        peakMomentum: 70,
        trend: 'rising',
      },
      sessionSummary: null,
      periodComparison: null,
      timePatterns: null,
      killEfficiency: null,
      socialData: emptySocial,
      synergyMatrix: {},
    });
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
    expect(result.sections.find(s => s.id === 'overview')).toBeDefined();
  });

  it('sets headline based on performance', () => {
    const matches = makeMatches(10, ['Win', 'Win', 'Win', 'Loss']);
    const result = synthesizeNarrative({
      matches,
      winRate: 65,
      currentStreak: 0,
      momentum: null,
      sessionSummary: null,
      periodComparison: null,
      timePatterns: null,
      killEfficiency: null,
      socialData: emptySocial,
      synergyMatrix: {},
    });
    expect(result.headline).toBe('Dominant Form');
  });

  it('includes metrics in overview section', () => {
    const matches = makeMatches(10, ['Win', 'Loss']);
    const result = synthesizeNarrative({
      matches,
      winRate: 50,
      currentStreak: 0,
      momentum: null,
      sessionSummary: null,
      periodComparison: null,
      timePatterns: null,
      killEfficiency: null,
      socialData: emptySocial,
      synergyMatrix: {},
    });
    const overview = result.sections.find(s => s.id === 'overview');
    expect(overview?.metrics).toBeDefined();
    expect(overview?.metrics?.length).toBeGreaterThan(0);
  });
});
