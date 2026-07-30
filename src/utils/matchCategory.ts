export const normalizeMatchCategory = (value: unknown): string => {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.slice(0, 48);
};

/**
 * Case-folded comparison/grouping key for a match category.
 *
 * "Ranked", "ranked" and "RANKED" all resolve to the same key here so they
 * group as a single Analytics row / a single autocomplete suggestion.
 * `normalizeMatchCategory()` above stays display-preserving (no case
 * change) so the user's original casing is still what gets stored and
 * shown — only the comparison key is folded.
 */
export const getMatchCategoryKey = (value: unknown): string => (
  normalizeMatchCategory(value).toLowerCase()
);

