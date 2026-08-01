/**
 * @module savedCategories
 * Public API for the saved match-category autocomplete list. Previously
 * this read/wrote raw `localStorage` directly, which meant additions could
 * silently fail to survive an app restart: localStorage commits in Electron
 * are not flushed synchronously, and this module had no flush-on-quit hook
 * (unlike `storage.ts`, which the rest of the app uses and which explicitly
 * flushes on `beforeunload`/interval failsafe before the process exits).
 *
 * Categories now live in the Zustand store (`savedMatchCategories`, see
 * `createDataSlice.ts`) and ride the same debounced-write-plus-flush
 * pipeline as every other piece of app data, persisted to the on-disk DB
 * via `StorageService`/IPC. This module just re-exports thin wrappers so
 * existing call sites don't need to change.
 */
import { useAppStore } from '../store/useAppStore';
import { sortSavedCategories } from './savedCategoriesLogic';

export type { SavedCategory } from './savedCategoriesLogic';

export const loadSavedCategories = () => sortSavedCategories(useAppStore.getState().savedMatchCategories || []);

export const addOrIncrementCategory = (label: string) => (
  useAppStore.getState().addOrIncrementSavedCategory(label)
);

export const incrementCategoryUse = (labelOrKey: string) => (
  useAppStore.getState().incrementSavedCategoryUse(labelOrKey)
);

export const removeSavedCategory = (keyOrLabel: string) => (
  useAppStore.getState().removeSavedMatchCategory(keyOrLabel)
);
