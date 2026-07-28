/**
 * @module rosterFuzzyMatch
 * Shared roster fuzzy-matching used by both the OCR Correction modal and the
 * Player Hub OCR Workbench so the two surfaces resolve names identically.
 *
 * Given a set of seed names (the current roster) plus an optional bundled
 * lexicon fallback, it finds the closest Levenshtein match for an OCR name,
 * excluding names that already match a candidate exactly.
 */
import { findClosestMatch, getAdaptiveNameDistanceThreshold, normalizeOcrName, similarityScore } from '../stringUtils';
import { buildOcrCandidatePool } from '../ocrNameResolver';

export interface RosterFuzzyMatch {
  /** The matched candidate name (normalized OCR form). */
  match: string;
  /** Similarity score 0-100 between the input and the matched candidate. */
  score: number;
}

export interface CreateRosterFuzzyMatcherOptions {
  /** Fallback lexicon used when no roster seed name is close enough. */
  bundledSeedNames?: string[];
  /**
   * Key normalizer used for exact-match exclusion and de-duplication. Defaults
   * to `normalizeOcrName(value).toLowerCase()`. Callers can pass their own to
   * stay consistent with an existing name-key map.
   */
  normalizeKey?: (value: string) => string;
}

export interface RosterFuzzyMatcher {
  /**
   * Normalized keys for names that already exist exactly in the candidate pool,
   * roster and bundled lexicon combined.
   */
  exactKeys: Set<string>;
  /**
   * Normalized keys for roster names only. Use this to decide "is this pilot on
   * the roster?" — `exactKeys` also contains bundled-lexicon names, which are
   * merely known spellings and say nothing about roster membership.
   */
  rosterExactKeys: Set<string>;
  /**
   * Closest fuzzy match for a name, or null when nothing is within threshold or
   * the name already matches a roster candidate exactly.
   */
  resolve: (name: string) => RosterFuzzyMatch | null;
}

const defaultNormalizeKey = (value: string): string => normalizeOcrName(String(value || '')).toLowerCase();

export const createRosterFuzzyMatcher = (
  rosterNames: string[],
  options: CreateRosterFuzzyMatcherOptions = {},
): RosterFuzzyMatcher => {
  const normalizeKey = options.normalizeKey ?? defaultNormalizeKey;
  const primaryCandidates = buildOcrCandidatePool({ seedNames: rosterNames });
  const fallbackCandidates = options.bundledSeedNames && options.bundledSeedNames.length > 0
    ? buildOcrCandidatePool({ bundledSeedNames: options.bundledSeedNames })
    : [];

  const rosterExactKeys = new Set<string>();
  primaryCandidates.forEach((candidate) => {
    const key = normalizeKey(candidate);
    if (key) rosterExactKeys.add(key);
  });
  const exactKeys = new Set<string>(rosterExactKeys);
  fallbackCandidates.forEach((candidate) => {
    const key = normalizeKey(candidate);
    if (key) exactKeys.add(key);
  });

  const resolve = (name: string): RosterFuzzyMatch | null => {
    const cleaned = String(name || '').trim();
    const key = normalizeKey(cleaned);
    if (!cleaned || !key) return null;
    // Only a roster hit means "nothing to suggest". A name that merely matches a
    // bundled-lexicon spelling is still not on the roster, so it must keep its
    // suggestion — otherwise the caller shows an "add to roster" affordance for a
    // pilot that already has a close roster entry.
    if (rosterExactKeys.has(key)) return null;

    const threshold = getAdaptiveNameDistanceThreshold(cleaned.length);
    const match = findClosestMatch(cleaned, primaryCandidates, threshold)
      || findClosestMatch(cleaned, fallbackCandidates, threshold);
    if (!match) return null;
    if (normalizeKey(match) === key) return null;

    return { match, score: similarityScore(cleaned, match) };
  };

  return { exactKeys, rosterExactKeys, resolve };
};
