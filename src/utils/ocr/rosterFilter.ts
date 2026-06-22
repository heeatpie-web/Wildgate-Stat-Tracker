/**
 * @module rosterFilter
 * Shared roster autocomplete ranking used by the OCR Correction modal and the
 * Player Hub OCR Workbench so both surfaces rank typeahead suggestions the same
 * way: Levenshtein similarity (with OCR digit-folding) plus contains/prefix/exact
 * boosts.
 */
import { similarityScore } from '../stringUtils';

const normalizeKey = (value: string): string => String(value || '').trim().toLowerCase();

/**
 * Fold characters that OCR commonly confuses with digits back to letters so a
 * scanned "Pil0t" still ranks against "Pilot".
 */
export const foldLikelyOcrDigits = (value: string): string => (
  String(value || '').replace(/[013456789]/g, (char) => (
    char === '0' ? 'o'
      : char === '1' ? 'i'
        : char === '3' ? 'e'
          : char === '4' ? 'a'
            : char === '5' ? 's'
              : char === '6' ? 'g'
                : char === '7' ? 't'
                  : char === '8' ? 'b'
                    : char === '9' ? 'g'
                      : char
  ))
);

/**
 * Rank a roster against a query and return up to `limit` best matches. An empty
 * query returns the first `limit` roster names unchanged.
 */
export const filterRosterByQuery = (registry: string[], rawQuery: string, limit = 10): string[] => {
  const pool = Array.isArray(registry) ? registry : [];
  const query = normalizeKey(rawQuery);
  if (!query) return pool.slice(0, limit);

  const foldedQuery = foldLikelyOcrDigits(query);
  const minScore = query.length >= 6 ? 58 : 52;
  return pool
    .map((pilot) => {
      const normalizedPilot = normalizeKey(pilot);
      const foldedPilot = foldLikelyOcrDigits(normalizedPilot);
      const containsBoost = normalizedPilot.includes(query) ? 35 : 0;
      const prefixBoost = normalizedPilot.startsWith(query) ? 15 : 0;
      const exactBoost = normalizedPilot === query ? 100 : 0;
      const score = Math.max(
        similarityScore(query, normalizedPilot),
        similarityScore(foldedQuery, foldedPilot)
      ) + containsBoost + prefixBoost + exactBoost;
      return { pilot, score };
    })
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score || a.pilot.localeCompare(b.pilot))
    .slice(0, limit)
    .map((entry) => entry.pilot);
};
