import { describe, expect, it } from 'vitest';
import { createRosterFuzzyMatcher } from '../rosterFuzzyMatch';

describe('createRosterFuzzyMatcher', () => {
  it('matches a near-miss OCR name to an existing roster pilot', () => {
    const matcher = createRosterFuzzyMatcher(['PilotOne', 'Falcon']);
    const result = matcher.resolve('PliotOne');
    expect(result).not.toBeNull();
    expect(result?.match).toBe('PilotOne');
    expect(result?.score).toBeGreaterThan(0);
  });

  it('returns null for an exact roster match (handled separately)', () => {
    const matcher = createRosterFuzzyMatcher(['PilotOne']);
    expect(matcher.resolve('PilotOne')).toBeNull();
    expect(matcher.exactKeys.has('pilotone')).toBe(true);
  });

  it('returns null when nothing is within distance threshold', () => {
    const matcher = createRosterFuzzyMatcher(['PilotOne']);
    expect(matcher.resolve('CompletelyDifferent')).toBeNull();
  });

  it('ignores empty / whitespace input', () => {
    const matcher = createRosterFuzzyMatcher(['PilotOne']);
    expect(matcher.resolve('')).toBeNull();
    expect(matcher.resolve('   ')).toBeNull();
  });

  it('falls back to the bundled lexicon when no roster name is close', () => {
    const matcher = createRosterFuzzyMatcher([], { bundledSeedNames: ['Falcon'] });
    const result = matcher.resolve('Falcn');
    expect(result?.match).toBe('Falcon');
  });

  it('honors a custom key normalizer for exact-match exclusion', () => {
    const trimLower = (v: string) => String(v || '').trim().toLowerCase();
    const matcher = createRosterFuzzyMatcher(['PilotOne'], { normalizeKey: trimLower });
    expect(matcher.resolve(' pilotone ')).toBeNull();
  });
});
