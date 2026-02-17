import { describe, expect, it } from 'vitest';
import type { Match } from '../../types';
import {
  buildCooccurrenceMatrix,
  getTeammateSuggestions,
  getTopCooccurrencePairs,
} from '../patternRecognition';

const makeMatch = (
  id: number,
  player: string,
  teammates: string[],
  timestamp: number,
  result: Match['result'] = 'Win'
): Match => ({
  id,
  timestamp,
  date: new Date(timestamp).toISOString(),
  mode: 'Artifact Brawl',
  player,
  teammates,
  opponents: [],
  hero: 'Catalyst',
  ship: 'Hunter',
  reachModifiers: [],
  kills: {},
  result,
  subType: '',
});

describe('patternRecognition', () => {
  it('builds co-occurrence matrix with repeated teammate encounters', () => {
    const now = Date.UTC(2026, 1, 17);
    const matches: Match[] = [
      makeMatch(1, 'Alpha', ['Bravo'], now - 1000, 'Win'),
      makeMatch(2, 'Alpha', ['Bravo'], now - 2000, 'Loss'),
      makeMatch(3, 'Alpha', ['Charlie'], now - 3000, 'Win'),
    ];

    const matrix = buildCooccurrenceMatrix(matches, { referenceTimestamp: now });
    const alphaPatterns = matrix.get('alpha') || [];
    expect(alphaPatterns.length).toBe(2);

    const bravoPattern = alphaPatterns.find((pattern) => pattern.playerB === 'Bravo');
    const charliePattern = alphaPatterns.find((pattern) => pattern.playerB === 'Charlie');
    expect(bravoPattern?.encounters).toBe(2);
    expect(charliePattern?.encounters).toBe(1);
    expect((bravoPattern?.confidence || 0) > 0).toBe(true);
    expect((charliePattern?.confidence || 0) > 0).toBe(true);
  });

  it('returns ranked teammate suggestions from detected players', () => {
    const now = Date.UTC(2026, 1, 17);
    const matches: Match[] = [
      makeMatch(1, 'Alpha', ['Bravo'], now - 1000, 'Win'),
      makeMatch(2, 'Alpha', ['Bravo'], now - 2000, 'Win'),
      makeMatch(3, 'Alpha', ['Charlie'], now - 3000, 'Loss'),
      makeMatch(4, 'Delta', ['Bravo'], now - 4000, 'Win'),
    ];
    const matrix = buildCooccurrenceMatrix(matches, { referenceTimestamp: now });
    const suggestions = getTeammateSuggestions(['Alpha'], matrix, { maxSuggestions: 3 });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].player).toBe('Bravo');
    expect(suggestions.some((entry) => entry.player === 'Charlie')).toBe(true);
  });

  it('prefers recent pairings when old and recent encounters are equal', () => {
    const now = Date.UTC(2026, 1, 17);
    const dayMs = 24 * 60 * 60 * 1000;
    const matches: Match[] = [
      makeMatch(1, 'Alpha', ['Echo'], now - dayMs, 'Win'),
      makeMatch(2, 'Alpha', ['Foxtrot'], now - (180 * dayMs), 'Win'),
    ];
    const matrix = buildCooccurrenceMatrix(matches, {
      referenceTimestamp: now,
      halfLifeDays: 30,
    });
    const suggestions = getTeammateSuggestions(['Alpha'], matrix, { maxSuggestions: 2 });

    expect(suggestions.length).toBe(2);
    expect(suggestions[0].player).toBe('Echo');

    const topPairs = getTopCooccurrencePairs(matrix, 2);
    expect(topPairs.length).toBe(2);
    expect(topPairs[0].confidence >= topPairs[1].confidence).toBe(true);
  });
});
