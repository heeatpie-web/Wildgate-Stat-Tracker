/**
 * @module savedCategoriesLogic
 * Pure list-manipulation helpers for the user's saved match-category
 * autocomplete list (add/increment/remove/sort). No storage dependency —
 * kept separate from `savedCategories.ts` (which reads/writes the app
 * store) and `createDataSlice.ts` (which owns the persisted state) so
 * neither has to import the other.
 */
import { normalizeMatchCategory, getMatchCategoryKey } from './matchCategory';

export interface SavedCategory {
  key: string; // case-folded dedup/lookup key — not for display
  label: string; // display label
  count: number; // usage frequency
  lastUsedAt: number; // epoch ms
}

/** Coerces arbitrary persisted/loaded JSON into a safe SavedCategory[]. */
export const sanitizeSavedCategoryList = (value: unknown): SavedCategory[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof (item as Record<string, unknown>).key === 'string')
    .map((item) => ({
      key: String(item.key),
      label: String(item.label || item.key),
      count: Number.isFinite(Number(item.count)) ? Number(item.count) : 0,
      lastUsedAt: Number.isFinite(Number(item.lastUsedAt)) ? Number(item.lastUsedAt) : 0,
    }));
};

export const sortSavedCategories = (list: SavedCategory[]): SavedCategory[] => (
  [...list].sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt || a.label.localeCompare(b.label))
);

/** Adds a new category or bumps an existing one's usage count/timestamp. */
export const upsertSavedCategory = (
  list: SavedCategory[],
  label: string,
): { list: SavedCategory[]; normalized: string | null } => {
  const normalized = normalizeMatchCategory(label);
  if (!normalized) return { list, normalized: null };
  const key = getMatchCategoryKey(normalized);
  const now = Date.now();
  const idx = list.findIndex((c) => c.key === key);
  let next: SavedCategory[];
  if (idx >= 0) {
    next = list.slice();
    next[idx] = { ...next[idx], count: (next[idx].count || 0) + 1, lastUsedAt: now };
  } else {
    next = [...list, { key, label: normalized, count: 1, lastUsedAt: now }];
  }
  return { list: next, normalized };
};

export const removeSavedCategoryFromList = (list: SavedCategory[], keyOrLabel: string): SavedCategory[] => {
  const key = getMatchCategoryKey(keyOrLabel);
  if (!key) return list;
  return list.filter((c) => c.key !== key);
};
