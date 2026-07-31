import { normalizeMatchCategory, getMatchCategoryKey } from './matchCategory';

export interface SavedCategory {
  key: string; // case-folded dedup/lookup key — not for display
  label: string; // display label
  count: number; // usage frequency
  lastUsedAt: number; // epoch ms
}

const STORAGE_KEY = 'wg_saved_match_categories_v1';

const readRaw = (): SavedCategory[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.key === 'string').map((item) => ({
      key: String(item.key),
      label: String(item.label || item.key),
      count: Number.isFinite(Number(item.count)) ? Number(item.count) : 0,
      lastUsedAt: Number.isFinite(Number(item.lastUsedAt)) ? Number(item.lastUsedAt) : 0,
    }));
  } catch (e) {
    return [];
  }
};

const writeRaw = (items: SavedCategory[]) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    // swallow
  }
};

export const loadSavedCategories = (): SavedCategory[] => {
  const raw = readRaw();
  return raw.sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt || a.label.localeCompare(b.label));
};

export const addOrIncrementCategory = (label: string) => {
  const normalized = normalizeMatchCategory(label);
  if (!normalized) return null;
  const key = getMatchCategoryKey(normalized);
  const now = Date.now();
  const list = readRaw();
  const idx = list.findIndex((c) => c.key === key);
  if (idx >= 0) {
    list[idx].count = (list[idx].count || 0) + 1;
    list[idx].lastUsedAt = now;
  } else {
    list.push({ key, label: normalized, count: 1, lastUsedAt: now });
  }
  writeRaw(list);
  return normalized;
};

export const incrementCategoryUse = (labelOrKey: string) => {
  const normalized = normalizeMatchCategory(labelOrKey);
  if (!normalized) return null;
  const key = getMatchCategoryKey(normalized);
  const now = Date.now();
  const list = readRaw();
  const idx = list.findIndex((c) => c.key === key);
  if (idx >= 0) {
    list[idx].count = (list[idx].count || 0) + 1;
    list[idx].lastUsedAt = now;
  } else {
    list.push({ key, label: normalized, count: 1, lastUsedAt: now });
  }
  writeRaw(list);
  return normalized;
};

export const removeSavedCategory = (keyOrLabel: string) => {
  const key = getMatchCategoryKey(keyOrLabel);
  if (!key) return false;
  const list = readRaw().filter((c) => c.key !== key);
  writeRaw(list);
  return true;
};
