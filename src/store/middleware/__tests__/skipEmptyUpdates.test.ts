import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { skipEmptyUpdates } from '../skipEmptyUpdates';

interface TestState {
    count: number;
    items: string[];
    bump: () => void;
    noop: () => void;
    noopFromFunction: () => void;
    addItem: (value: string) => void;
}

const makeStore = () => createStore<TestState>()(skipEmptyUpdates((set, get) => ({
    count: 0,
    items: [],
    bump: () => set({ count: get().count + 1 }),
    noop: () => set({}),
    noopFromFunction: () => set(() => ({})),
    addItem: (value) => set((state) => (
        state.items.includes(value) ? {} : { items: [...state.items, value] }
    )),
})));

describe('skipEmptyUpdates', () => {
    it('does not notify subscribers for an empty partial', () => {
        const store = makeStore();
        let notifications = 0;
        const unsubscribe = store.subscribe(() => { notifications += 1; });

        store.getState().noop();
        store.getState().noopFromFunction();

        expect(notifications).toBe(0);
        unsubscribe();
    });

    it('still applies real updates', () => {
        const store = makeStore();
        let notifications = 0;
        const unsubscribe = store.subscribe(() => { notifications += 1; });

        store.getState().bump();
        store.getState().bump();

        expect(store.getState().count).toBe(2);
        expect(notifications).toBe(2);
        unsubscribe();
    });

    it('skips the write when a guard clause short-circuits', () => {
        const store = makeStore();
        let notifications = 0;
        const unsubscribe = store.subscribe(() => { notifications += 1; });

        store.getState().addItem('a');
        store.getState().addItem('a'); // already present — guarded no-op

        expect(store.getState().items).toEqual(['a']);
        expect(notifications).toBe(1);
        unsubscribe();
    });

    it('keeps the state object identical across a skipped update', () => {
        const store = makeStore();
        const before = store.getState();

        store.getState().noop();

        // Identity must hold, otherwise useShallow selectors and the persist
        // middleware would both still see a change.
        expect(store.getState()).toBe(before);
    });

    it('does not interfere with an explicit replace', () => {
        const store = makeStore();
        store.getState().bump();

        store.setState({ ...store.getState(), count: 42, items: [] }, true);

        expect(store.getState().count).toBe(42);
    });
});
