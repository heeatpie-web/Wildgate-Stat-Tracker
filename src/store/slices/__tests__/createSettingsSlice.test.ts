import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createSettingsSlice, type SettingsSlice } from '../createSettingsSlice';

const makeStore = () => createStore<SettingsSlice>()(createSettingsSlice);

describe('createSettingsSlice OCR policy', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('clamps OCR name reroute threshold to integer percent bounds', () => {
    store.getState().setOcrNameRerouteThreshold(84.6);
    expect(store.getState().ocrNameRerouteThreshold).toBe(85);

    store.getState().setOcrNameRerouteThreshold(999);
    expect(store.getState().ocrNameRerouteThreshold).toBe(95);

    store.getState().setOcrNameRerouteThreshold(3);
    expect(store.getState().ocrNameRerouteThreshold).toBe(50);

    store.getState().setOcrNameRerouteThreshold(Number.NaN);
    expect(store.getState().ocrNameRerouteThreshold).toBe(78);
  });
});
