/**
 * @module skipEmptyUpdates
 * Zustand middleware that turns a "nothing changed" update into a true no-op.
 *
 * Slice actions signal "no change" by returning an empty partial (`return {}`),
 * which reads as free but is not: Zustand still builds a new state object, so
 * every subscriber is notified, every `useGameData()` consumer re-renders, and
 * the persist middleware queues a full-database write. With ~50 such paths
 * across the slices, guards like "this player is already on the roster" were
 * costing exactly as much as a real mutation.
 *
 * Applied inside `persist` so it only sees slice-action writes — rehydration and
 * other middleware calls go through `api.setState` and are unaffected.
 */
import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

type SkipEmptyUpdates = <
    T,
    Mps extends [StoreMutatorIdentifier, unknown][] = [],
    Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
    initializer: StateCreator<T, Mps, Mcs>,
) => StateCreator<T, Mps, Mcs>;

const isEmptyPartial = (value: unknown): boolean => (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).length === 0
);

type AnySet = (partial: unknown, replace?: boolean) => void;

const skipEmptyUpdatesImpl = <T>(
    initializer: StateCreator<T, [], []>,
): StateCreator<T, [], []> => (set, get, api) => {
    const guardedSet: AnySet = (partial, replace) => {
        // `replace: true` with an empty object genuinely means "clear the state",
        // so only the merge form is safe to skip.
        if (!replace) {
            const resolved = typeof partial === 'function'
                ? (partial as (state: T) => unknown)(get())
                : partial;
            if (isEmptyPartial(resolved)) return;
            (set as AnySet)(resolved, replace);
            return;
        }
        (set as AnySet)(partial, replace);
    };

    return initializer(guardedSet as typeof set, get, api);
};

export const skipEmptyUpdates = skipEmptyUpdatesImpl as unknown as SkipEmptyUpdates;
