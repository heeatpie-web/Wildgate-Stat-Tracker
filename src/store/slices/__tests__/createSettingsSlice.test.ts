import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createSettingsSlice, type SettingsSlice } from '../createSettingsSlice';

const makeStore = () => createStore<SettingsSlice>()(createSettingsSlice);

describe('createSettingsSlice external OCR policy', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('initializes external fallback and force-analysis defaults', () => {
    const state = store.getState();
    expect(state.externalFallbackEnabled).toBe(true);
    expect(state.externalFallbackThreshold).toBe(0.66);
    expect(state.externalOnDetectorDisagreement).toBe(true);
    expect(state.forceMaxAnalysis).toBe(false);
    expect(state.ocrNameRerouteThreshold).toBe(78);
  });

  it('clamps externalFallbackThreshold to [0, 1]', () => {
    store.getState().setExternalFallbackThreshold(1.8);
    expect(store.getState().externalFallbackThreshold).toBe(1);

    store.getState().setExternalFallbackThreshold(-0.5);
    expect(store.getState().externalFallbackThreshold).toBe(0);

    store.getState().setExternalFallbackThreshold(Number.NaN);
    expect(store.getState().externalFallbackThreshold).toBe(0.66);
  });

  it('updates boolean policy flags', () => {
    store.getState().setExternalFallbackEnabled(false);
    store.getState().setExternalOnDetectorDisagreement(false);
    store.getState().setForceMaxAnalysis(true);

    const state = store.getState();
    expect(state.externalFallbackEnabled).toBe(false);
    expect(state.externalOnDetectorDisagreement).toBe(false);
    expect(state.forceMaxAnalysis).toBe(true);
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
