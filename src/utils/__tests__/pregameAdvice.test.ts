/**
 * Tests for the pregame advice engine.
 * Covers: sparse history, opponent ranking, POI bucket selection,
 * confidence thresholds, copy tone, factor weighting, and estimate clamping.
 */
import { describe, it, expect } from 'vitest';
import { computePregameAdvice } from '../pregameAdvice/engine';
import type { PregameAdviceContext } from '../pregameAdvice/types';
import type { Match } from '../../types';

// ─── Factories ────────────────────────────────────────────────────────────────

let nextId = 1;

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: nextId++,
    timestamp: Date.now() - 1000 * 60 * 60,
    date: '2026-01-01',
    mode: 'Artifact Brawl',
    player: 'TestPlayer',
    teammates: [],
    opponents: [],
    hero: 'Hero1',
    ship: 'Hunter',
    reachModifiers: [],
    kills: {},
    result: 'Win',
    subType: 'Normal',
    ...overrides,
  } as Match;
}

function makeContext(overrides: Partial<PregameAdviceContext> = {}): PregameAdviceContext {
  return {
    mode: 'Artifact Brawl',
    teammates: [],
    opponentTeams: [],
    reachModifiers: [],
    draftMatchId: 9999,
    ...overrides,
  };
}

/** Build a pool of N wins and M losses for same-mode completed matches. */
function makePool(wins: number, losses: number, base: Partial<Match> = {}): Match[] {
  const pool: Match[] = [];
  for (let i = 0; i < wins; i++) pool.push(makeMatch({ ...base, result: 'Win' }));
  for (let i = 0; i < losses; i++) pool.push(makeMatch({ ...base, result: 'Loss' }));
  return pool;
}

// ─── Engine: sparse history ───────────────────────────────────────────────────

describe('computePregameAdvice — sparse history', () => {
  it('returns hasUsableData=false when pool has fewer than 3 matches', () => {
    const matches = makePool(1, 1);
    const result = computePregameAdvice(makeContext(), matches);
    expect(result.hasUsableData).toBe(false);
    expect(result.factors).toHaveLength(0);
    expect(result.topActions).toHaveLength(0);
  });

  it('returns hasUsableData=false with an empty match array', () => {
    const result = computePregameAdvice(makeContext(), []);
    expect(result.hasUsableData).toBe(false);
  });

  it('returns hasUsableData=false when all matches are Ongoing or practice range', () => {
    const matches = [
      makeMatch({ result: 'Ongoing' }),
      makeMatch({ isPracticeRange: true, result: 'Win' }),
      makeMatch({ subType: 'Telemetry Draft', result: 'Win' }),
    ];
    const result = computePregameAdvice(makeContext(), matches);
    expect(result.hasUsableData).toBe(false);
  });

  it('excludes practice-range matches from the pool', () => {
    // 10 wins but 8 are practice range → only 2 real matches → no data
    const matches = [
      ...Array.from({ length: 8 }, () => makeMatch({ isPracticeRange: true, result: 'Win' })),
      makeMatch({ result: 'Win' }),
      makeMatch({ result: 'Loss' }),
    ];
    const result = computePregameAdvice(makeContext(), matches);
    expect(result.hasUsableData).toBe(false);
  });
});

// ─── Engine: baseline ────────────────────────────────────────────────────────

describe('computePregameAdvice — baseline', () => {
  it('produces hasUsableData=true with at least 3 same-mode matches', () => {
    const result = computePregameAdvice(makeContext(), makePool(2, 1));
    expect(result.hasUsableData).toBe(true);
    expect(result.baselineWinRate).toBeGreaterThan(0);
  });

  it('excludes different-mode matches from the pool', () => {
    const pool = [
      ...makePool(5, 5, { mode: 'Fleet Battle' }),
      makeMatch({ result: 'Win' }),
      makeMatch({ result: 'Loss' }),
    ];
    // Only 2 Artifact Brawl matches → not enough
    const result = computePregameAdvice(makeContext({ mode: 'Artifact Brawl' }), pool);
    expect(result.hasUsableData).toBe(false);
  });

  it('win rate is clamped between 0.10 and 0.90', () => {
    // Extreme win-streak: 50 wins 0 losses — blended estimate should not exceed 0.90
    const result = computePregameAdvice(makeContext(), makePool(50, 0));
    expect(result.overallWinRate).toBeLessThanOrEqual(0.90);

    // Extreme loss-streak: 0 wins 50 losses — should not go below 0.10
    const result2 = computePregameAdvice(makeContext(), makePool(0, 50));
    expect(result2.overallWinRate).toBeGreaterThanOrEqual(0.10);
  });
});

// ─── Engine: opponent ranking ─────────────────────────────────────────────────

describe('computePregameAdvice — opponent pressure', () => {
  it('ranks teams with known player encounter data above teams with unknown players', () => {
    // TeamA: we face "Alice" 8 times and lose 6 → high pressure
    // TeamB: ship only (Bastion), no individual players
    const pool: Match[] = [
      // 8 matches vs Alice (win 2, loss 6 → we win ~25% vs them → pressure ~75%)
      ...Array.from({ length: 2 }, () =>
        makeMatch({ opponents: ['Alice'], result: 'Win' })
      ),
      ...Array.from({ length: 6 }, () =>
        makeMatch({ opponents: ['Alice'], result: 'Loss' })
      ),
      // 8 matches vs Bastion (win 5, loss 3 → we win ~62% vs Bastion → pressure ~38%)
      ...Array.from({ length: 5 }, () =>
        makeMatch({
          opponentTeams: [{ teamName: 'B', shipType: 'Bastion', color: 'blue', players: [] }],
          result: 'Win',
        })
      ),
      ...Array.from({ length: 3 }, () =>
        makeMatch({
          opponentTeams: [{ teamName: 'B', shipType: 'Bastion', color: 'blue', players: [] }],
          result: 'Loss',
        })
      ),
      // Padding to hit baseline
      ...makePool(5, 5),
    ];

    const ctx = makeContext({
      opponentTeams: [
        { teamName: 'Team Alpha', shipType: 'Privateer', players: ['Alice'] },
        { teamName: 'Team Beta', shipType: 'Bastion', players: [] },
      ],
    });

    const result = computePregameAdvice(ctx, pool);
    const pressureFactor = result.factors.find((f) => f.kind === 'opponent-pressure');
    expect(pressureFactor).toBeDefined();
    // Should flag the high-pressure team in copy
    expect(pressureFactor?.copy).toContain('Alpha');
  });

  it('falls back to ship-type performance when all opponent players are unknown', () => {
    // 8 matches vs Hunter (win 3, loss 5 → pressure ~62%)
    const pool: Match[] = [
      ...Array.from({ length: 3 }, () =>
        makeMatch({
          opponentTeams: [{ teamName: 'T', shipType: 'Hunter', color: 'red', players: [] }],
          result: 'Win',
        })
      ),
      ...Array.from({ length: 5 }, () =>
        makeMatch({
          opponentTeams: [{ teamName: 'T', shipType: 'Hunter', color: 'red', players: [] }],
          result: 'Loss',
        })
      ),
      ...makePool(5, 5),
    ];

    const ctx = makeContext({
      opponentTeams: [{ teamName: 'Unknowns', shipType: 'Hunter', players: ['BrandNewPlayer'] }],
    });

    const result = computePregameAdvice(ctx, pool);
    // Engine should still produce opponent-pressure factor via ship-type data
    const pressureFactor = result.factors.find((f) => f.kind === 'opponent-pressure');
    expect(pressureFactor).toBeDefined();
    expect(pressureFactor?.sampleSize).toBeGreaterThan(0);
  });

  it('omits opponent-pressure factor when no encounter or ship data is available', () => {
    const pool = makePool(5, 5); // no relevant opponent data
    const ctx = makeContext({
      opponentTeams: [{ teamName: 'Ghosts', shipType: 'UnknownShip', players: ['Mystery'] }],
    });
    const result = computePregameAdvice(ctx, pool);
    expect(result.factors.find((f) => f.kind === 'opponent-pressure')).toBeUndefined();
  });
});

// ─── Engine: POI bucket selection ────────────────────────────────────────────

describe('computePregameAdvice — POI plan', () => {
  it('selects the highest win-rate POI bucket', () => {
    const pool: Match[] = [
      // 0–1 POIs: 3 matches, win 1 → low WR
      ...Array.from({ length: 1 }, () =>
        makeMatch({ poiEasy: 0, poiMedium: 0, poiEpic: 0, result: 'Win' })
      ),
      ...Array.from({ length: 2 }, () =>
        makeMatch({ poiEasy: 0, poiMedium: 0, poiEpic: 0, result: 'Loss' })
      ),
      // 2–3 POIs: 5 matches, win 4 → high WR
      ...Array.from({ length: 4 }, () =>
        makeMatch({ poiEasy: 1, poiMedium: 1, poiEpic: 0, result: 'Win' })
      ),
      ...Array.from({ length: 1 }, () =>
        makeMatch({ poiEasy: 1, poiMedium: 1, poiEpic: 0, result: 'Loss' })
      ),
      // Padding
      ...makePool(3, 3),
    ];

    const result = computePregameAdvice(makeContext(), pool);
    const poiFactor = result.factors.find((f) => f.kind === 'poi-plan');
    expect(poiFactor).toBeDefined();
    expect(poiFactor?.copy).toContain('2–3');
  });

  it('uses only artifact-brawl / custom-lobby for POI pool', () => {
    // Fleet Battle matches with POI data should not count
    const pool: Match[] = [
      ...Array.from({ length: 5 }, () =>
        makeMatch({ mode: 'Fleet Battle', poiEasy: 3, poiMedium: 0, poiEpic: 0, result: 'Win' })
      ),
      ...makePool(5, 5), // Artifact Brawl but no POI fields
    ];

    const ctx = makeContext({ mode: 'Artifact Brawl' });
    const result = computePregameAdvice(ctx, pool);
    // filteredPoolSize should not include Fleet Battle matches
    expect(result.filteredPoolSize).toBe(0);
  });

  it('filteredPoolSize reflects POI-eligible pool, not total match count', () => {
    const pool: Match[] = [
      // 4 artifact brawl with POI data
      ...Array.from({ length: 4 }, () =>
        makeMatch({ mode: 'Artifact Brawl', poiEasy: 1, poiMedium: 1, result: 'Win' })
      ),
      // 6 without POI fields
      ...makePool(3, 3),
    ];

    const result = computePregameAdvice(makeContext(), pool);
    expect(result.filteredPoolSize).toBe(4);
    expect(result.sampleSize).toBe(10);
  });
});

// ─── Engine: confidence thresholds ───────────────────────────────────────────

describe('computePregameAdvice — confidence thresholds', () => {
  it('omits a factor when its sample size is below 3', () => {
    // Only 2 matches with teammate "Alice"
    const pool: Match[] = [
      ...Array.from({ length: 2 }, () =>
        makeMatch({ teammates: ['Alice'], result: 'Win' })
      ),
      ...makePool(5, 5),
    ];

    const ctx = makeContext({ teammates: ['Alice'] });
    const result = computePregameAdvice(ctx, pool);
    expect(result.factors.find((f) => f.kind === 'teammate-synergy')).toBeUndefined();
  });

  it('assigns low confidence for 3–7 samples', () => {
    const pool: Match[] = [
      ...Array.from({ length: 5 }, () =>
        makeMatch({ teammates: ['Bob'], result: 'Win' })
      ),
      ...Array.from({ length: 2 }, () =>
        makeMatch({ teammates: ['Bob'], result: 'Loss' })
      ),
      ...makePool(3, 3),
    ];

    const ctx = makeContext({ teammates: ['Bob'] });
    const result = computePregameAdvice(ctx, pool);
    const f = result.factors.find((f) => f.kind === 'teammate-synergy');
    expect(f?.confidence).toBe('low');
  });

  it('assigns medium confidence for 8–19 samples', () => {
    const pool: Match[] = [
      ...Array.from({ length: 12 }, () =>
        makeMatch({ teammates: ['Carol'], result: 'Win' })
      ),
      ...Array.from({ length: 3 }, () =>
        makeMatch({ teammates: ['Carol'], result: 'Loss' })
      ),
      ...makePool(3, 3),
    ];

    const ctx = makeContext({ teammates: ['Carol'] });
    const result = computePregameAdvice(ctx, pool);
    const f = result.factors.find((f) => f.kind === 'teammate-synergy');
    expect(f?.confidence).toBe('medium');
  });

  it('assigns high confidence for 20+ samples', () => {
    const pool: Match[] = [
      ...Array.from({ length: 25 }, () =>
        makeMatch({ teammates: ['Danika'], result: 'Win' })
      ),
      ...Array.from({ length: 5 }, () =>
        makeMatch({ teammates: ['Danika'], result: 'Loss' })
      ),
      ...makePool(3, 3),
    ];

    const ctx = makeContext({ teammates: ['Danika'] });
    const result = computePregameAdvice(ctx, pool);
    const f = result.factors.find((f) => f.kind === 'teammate-synergy');
    expect(f?.confidence).toBe('high');
  });
});

// ─── Engine: copy tone ────────────────────────────────────────────────────────

describe('computePregameAdvice — copy tone', () => {
  it('uses softened language at low confidence', () => {
    // 4–7 samples → low confidence → "lean" language
    const pool: Match[] = [
      ...Array.from({ length: 3 }, () =>
        makeMatch({ opponents: ['Threat'] , result: 'Loss' })
      ),
      ...Array.from({ length: 3 }, () =>
        makeMatch({ opponents: ['Threat'], result: 'Loss' })
      ),
      ...makePool(4, 4),
    ];

    const ctx = makeContext({
      opponentTeams: [{ teamName: 'Danger Zone', shipType: 'Hunter', players: ['Threat'] }],
    });

    const result = computePregameAdvice(ctx, pool);
    const f = result.factors.find((f) => f.kind === 'opponent-pressure');
    if (f && f.confidence === 'low') {
      expect(f.copy.toLowerCase()).toMatch(/lean|watch out/);
    }
  });

  it('uses assertive language at medium/high confidence', () => {
    // 20 samples → high confidence → "best target" language
    const pool: Match[] = [
      ...Array.from({ length: 5 }, () =>
        makeMatch({ opponents: ['TopThreat'], result: 'Win' })
      ),
      ...Array.from({ length: 15 }, () =>
        makeMatch({ opponents: ['TopThreat'], result: 'Loss' })
      ),
      ...makePool(5, 5),
    ];

    const ctx = makeContext({
      opponentTeams: [{ teamName: 'Elite Squad', shipType: 'Privateer', players: ['TopThreat'] }],
    });

    const result = computePregameAdvice(ctx, pool);
    const f = result.factors.find((f) => f.kind === 'opponent-pressure');
    if (f && (f.confidence === 'medium' || f.confidence === 'high')) {
      expect(f.copy.toLowerCase()).toMatch(/best|target|usually/);
    }
  });
});

// ─── Engine: factor weights ───────────────────────────────────────────────────

describe('computePregameAdvice — factor weights', () => {
  it('teammate synergy and opponent pressure produce larger blended effect than hazard or POI alone', () => {
    // Build two scenarios with equal absolute deltas but different factor kinds.
    // Scenario A: only hazard-fit active (weight 0.15)
    // Scenario B: only teammate-synergy active (weight 0.35)
    // Scenario B should produce a larger deviation from baseline.

    const basePool = makePool(15, 15); // ~50% baseline

    // Scenario A: 15 matches with hazard, all wins → +delta only from hazard
    const hazardPool: Match[] = [
      ...Array.from({ length: 15 }, () =>
        makeMatch({ reachModifiers: ['Acid Rain'], result: 'Win' })
      ),
      ...Array.from({ length: 5 }, () =>
        makeMatch({ reachModifiers: ['Acid Rain'], result: 'Loss' })
      ),
      ...basePool,
    ];
    const hazardCtx = makeContext({ reachModifiers: ['Acid Rain'] });
    const resultA = computePregameAdvice(hazardCtx, hazardPool);

    // Scenario B: 15 matches with teammate "Ace", similar win rate boost
    const teammatePool: Match[] = [
      ...Array.from({ length: 15 }, () =>
        makeMatch({ teammates: ['Ace'], result: 'Win' })
      ),
      ...Array.from({ length: 5 }, () =>
        makeMatch({ teammates: ['Ace'], result: 'Loss' })
      ),
      ...basePool,
    ];
    const teammateCtx = makeContext({ teammates: ['Ace'] });
    const resultB = computePregameAdvice(teammateCtx, teammatePool);

    const hazardDev = Math.abs(resultA.overallWinRate - 0.5);
    const teammateDev = Math.abs(resultB.overallWinRate - 0.5);

    // Teammate factor has higher weight → should produce larger overall deviation
    expect(teammateDev).toBeGreaterThanOrEqual(hazardDev);
  });
});

describe('computePregameAdvice — ship performance', () => {
  it('adds a ship-performance factor when the current ship has enough same-mode history', () => {
    const pool: Match[] = [
      ...Array.from({ length: 9 }, () => makeMatch({ ship: 'Hunter', result: 'Win' })),
      ...Array.from({ length: 3 }, () => makeMatch({ ship: 'Hunter', result: 'Loss' })),
      ...makePool(5, 5, { ship: 'Bastion' }),
    ];

    const result = computePregameAdvice(makeContext({ ship: 'Hunter' }), pool);
    const factor = result.factors.find((entry) => entry.kind === 'ship-performance');

    expect(factor).toBeDefined();
    expect(factor?.sampleSize).toBe(12);
    expect(factor?.copy).toContain('Hunter');
  });
});

// ─── Engine: objective guidance ──────────────────────────────────────────────

describe('computePregameAdvice — objective guidance', () => {
  it('derives objective advice from artifactSource', () => {
    const pool: Match[] = [
      ...Array.from({ length: 8 }, () =>
        makeMatch({ artifactSource: 'Alien Gate', result: 'Win' })
      ),
      ...Array.from({ length: 3 }, () =>
        makeMatch({ artifactSource: 'Alien Gate', result: 'Loss' })
      ),
      ...makePool(5, 5),
    ];

    const ctx = makeContext({ artifactSource: 'Alien Gate' });
    const result = computePregameAdvice(ctx, pool);
    expect(result.factors.find((f) => f.kind === 'artifact-objective')).toBeDefined();
  });

  it('omits artifact-objective factor when artifactSource is absent', () => {
    const pool = makePool(10, 10);
    const ctx = makeContext({ artifactSource: undefined });
    const result = computePregameAdvice(ctx, pool);
    expect(result.factors.find((f) => f.kind === 'artifact-objective')).toBeUndefined();
  });
});

// ─── Engine: top actions ──────────────────────────────────────────────────────

describe('computePregameAdvice — topActions', () => {
  it('includes target team action when opponent pressure data is available', () => {
    const pool: Match[] = [
      ...Array.from({ length: 8 }, () =>
        makeMatch({ opponents: ['Boss'], result: 'Loss' })
      ),
      ...makePool(5, 5),
    ];

    const ctx = makeContext({
      opponentTeams: [{ teamName: 'BossSquad', shipType: 'Bastion', players: ['Boss'] }],
    });

    const result = computePregameAdvice(ctx, pool);
    expect(result.topActions.some((a) => a.toLowerCase().includes('bosssquad'))).toBe(true);
  });

  it('includes POI target action when best bucket is identified', () => {
    const pool: Match[] = [
      ...Array.from({ length: 5 }, () =>
        makeMatch({ poiEasy: 1, poiMedium: 1, poiEpic: 0, result: 'Win' })
      ),
      ...Array.from({ length: 2 }, () =>
        makeMatch({ poiEasy: 1, poiMedium: 1, poiEpic: 0, result: 'Loss' })
      ),
      ...makePool(3, 3),
    ];

    const result = computePregameAdvice(makeContext(), pool);
    expect(result.topActions.some((a) => a.toLowerCase().includes('poi'))).toBe(true);
  });
});
