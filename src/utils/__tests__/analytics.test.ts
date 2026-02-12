import { describe, it, expect } from 'vitest';
import { calculateInsights } from '../analytics';
import type { Match } from '../../types';

/** Helper to create a minimal valid match record. */
function createMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: Math.floor(Math.random() * 100000),
    timestamp: Date.now(),
    date: '2025-01-01',
    mode: 'Artifact Brawl',
    player: 'TestPlayer',
    teammates: [],
    opponents: [],
    hero: 'Adrian',
    ship: 'Hunter (2 Player)',
    subType: 'Standard',
    reachModifiers: [],
    kills: {},
    result: 'Win',
    damageTaken: 500,
    time: '10:00',
    ...overrides,
  };
}

describe('calculateInsights', () => {
  it('returns empty array for fewer than 5 matches', () => {
    const matches = [createMatch(), createMatch(), createMatch()];
    expect(calculateInsights(matches)).toEqual([]);
  });

  it('returns empty for 5 zero-data matches (all filtered out)', () => {
    const matches = Array.from({ length: 5 }, () =>
      createMatch({ damageTaken: 0, time: '00:00' })
    );
    expect(calculateInsights(matches)).toEqual([]);
  });

  it('returns insights for 10+ valid matches', () => {
    const matches = Array.from({ length: 12 }, (_, i) =>
      createMatch({
        result: i % 3 === 0 ? 'Loss' : 'Win',
        damageTaken: 200 + i * 100,
        time: `${10 + i}:00`,
        hero: i % 2 === 0 ? 'Adrian' : 'Venture',
        ship: i % 2 === 0 ? 'Hunter (2 Player)' : 'Bastion (4 Player)',
        teammates: i % 3 === 0 ? [] : ['Ally1'],
        reachModifiers: i % 4 === 0 ? ['The Bull'] : [],
      })
    );
    const insights = calculateInsights(matches);
    expect(insights.length).toBeGreaterThan(0);
    // Each insight should have the required shape
    for (const insight of insights) {
      expect(insight).toHaveProperty('title');
      expect(insight).toHaveProperty('value');
      expect(insight).toHaveProperty('priority');
      expect(typeof insight.priority).toBe('number');
    }
  });

  it('handles string-typed damageTaken without NaN or concatenation', () => {
    const matches = Array.from({ length: 10 }, (_, i) =>
      createMatch({
        result: i % 2 === 0 ? 'Win' : 'Loss',
        damageTaken: '350' as any, // string coercion edge case
        time: '10:00',
      })
    );
    const insights = calculateInsights(matches);
    // Should not crash and should produce valid insights
    expect(insights.length).toBeGreaterThanOrEqual(0);
    for (const insight of insights) {
      expect(insight.value).not.toContain('NaN');
      expect(insight.title).not.toContain('NaN');
    }
  });

  it('handles zero-damage matches mixed with normal matches', () => {
    const matches = [
      ...Array.from({ length: 6 }, (_, i) =>
        createMatch({ result: 'Win', damageTaken: 400 + i * 50, time: '10:00' })
      ),
      ...Array.from({ length: 4 }, () =>
        createMatch({ result: 'Loss', damageTaken: 0, time: '05:00' })
      ),
    ];
    const insights = calculateInsights(matches);
    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      expect(typeof insight.priority).toBe('number');
      expect(Number.isFinite(insight.priority)).toBe(true);
    }
  });

  it('handles undefined damageTaken gracefully', () => {
    const matches = Array.from({ length: 8 }, (_, i) =>
      createMatch({
        result: i % 2 === 0 ? 'Win' : 'Loss',
        damageTaken: undefined,
        time: '10:00',
      })
    );
    const insights = calculateInsights(matches);
    // Should not crash — undefined damage is treated as 0
    expect(Array.isArray(insights)).toBe(true);
  });

  it('insights are sorted by priority (descending)', () => {
    const matches = Array.from({ length: 15 }, (_, i) =>
      createMatch({
        result: i % 2 === 0 ? 'Win' : 'Loss',
        damageTaken: 300 + i * 50,
        time: `${8 + i}:00`,
        hero: ['Adrian', 'Venture', 'Kae'][i % 3],
        ship: ['Hunter (2 Player)', 'Bastion (4 Player)', 'Scout (Solo Outlaw)'][i % 3],
        teammates: i % 2 === 0 ? ['Ally1', 'Ally2'] : [],
        reachModifiers: i % 3 === 0 ? ['The Bull', 'Tempest'] : [],
      })
    );
    const insights = calculateInsights(matches);
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1].priority).toBeGreaterThanOrEqual(insights[i].priority);
    }
  });
});
