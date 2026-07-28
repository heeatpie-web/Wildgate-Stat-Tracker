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

  it('still suggests a roster match for a name that exactly matches the bundled lexicon', () => {
    // Regression: bundled-lexicon names used to share the exact-key set with
    // roster names, so `resolve` short-circuited to null for them. The caller
    // then saw neither a fuzzy suggestion nor a roster hit, and offered "add to
    // roster" for a pilot who already had a close roster entry.
    const matcher = createRosterFuzzyMatcher(['PilotOne'], { bundledSeedNames: ['PliotOne'] });
    expect(matcher.resolve('PliotOne')?.match).toBe('PilotOne');
  });

  it('separates roster keys from bundled-lexicon keys', () => {
    const matcher = createRosterFuzzyMatcher(['PilotOne'], { bundledSeedNames: ['Falcon'] });
    expect(matcher.rosterExactKeys.has('pilotone')).toBe(true);
    // Knowing a spelling is not the same as having that pilot on the roster.
    expect(matcher.rosterExactKeys.has('falcon')).toBe(false);
    expect(matcher.exactKeys.has('falcon')).toBe(true);
  });
});
