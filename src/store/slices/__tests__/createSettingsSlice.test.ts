import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createSettingsSlice, type SettingsSlice } from '../createSettingsSlice';

const makeStore = () => createStore<SettingsSlice>()(createSettingsSlice);

describe('createSettingsSlice OCR policy', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('defaults new users to deferred capture and background result OCR', () => {
    expect(store.getState().captureMode).toBe('deferred');
    expect(store.getState().resultOcrFlowMode).toBe('background');
    expect(store.getState().autoSequenceOnCapture).toBe(true);
    expect(store.getState().autoCaptureSendKeypresses).toBe(true);
    expect(store.getState().autoCaptureWaitMultiplier).toBe(0.5);
    expect(store.getState().tacticalMapKeybind).toBe('');
    expect(store.getState().autoPopulateRosterOnSave).toBe(true);
  });

  it('clamps auto-capture wait multiplier into the supported range', () => {
    store.getState().setAutoCaptureWaitMultiplier(2.37);
    expect(store.getState().autoCaptureWaitMultiplier).toBe(2.4);

    store.getState().setAutoCaptureWaitMultiplier(9);
    expect(store.getState().autoCaptureWaitMultiplier).toBe(3);

    store.getState().setAutoCaptureWaitMultiplier(0.1);
    expect(store.getState().autoCaptureWaitMultiplier).toBe(0.5);
  });

  it('allows clearing the tactical map keybind explicitly', () => {
    store.getState().setTacticalMapKeybind('');
    expect(store.getState().tacticalMapKeybind).toBe('');
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

  it('defaults sound volume to 100 and clamps to the 0-100 range', () => {
    expect(store.getState().soundVolume).toBe(100);

    store.getState().setSoundVolume(45.6);
    expect(store.getState().soundVolume).toBe(46);

    store.getState().setSoundVolume(-10);
    expect(store.getState().soundVolume).toBe(0);

    store.getState().setSoundVolume(500);
    expect(store.getState().soundVolume).toBe(100);

    store.getState().setSoundVolume(Number.NaN);
    expect(store.getState().soundVolume).toBe(100);
  });

  it('defaults the ship-kill popup auto-dismiss to 30s and clamps into range', () => {
    expect(store.getState().shipKillPopupAutoDismissMs).toBe(30_000);

    store.getState().setShipKillPopupAutoDismissMs(5_000);
    expect(store.getState().shipKillPopupAutoDismissMs).toBe(10_000);

    store.getState().setShipKillPopupAutoDismissMs(999_000);
    expect(store.getState().shipKillPopupAutoDismissMs).toBe(120_000);

    store.getState().setShipKillPopupAutoDismissMs(60_000);
    expect(store.getState().shipKillPopupAutoDismissMs).toBe(60_000);

    store.getState().setShipKillPopupAutoDismissMs(Number.NaN);
    expect(store.getState().shipKillPopupAutoDismissMs).toBe(30_000);
  });

  it('treats 0 (or negative) as the "never auto-dismiss" sentinel', () => {
    store.getState().setShipKillPopupAutoDismissMs(0);
    expect(store.getState().shipKillPopupAutoDismissMs).toBe(0);

    store.getState().setShipKillPopupAutoDismissMs(60_000);
    expect(store.getState().shipKillPopupAutoDismissMs).toBe(60_000);

    store.getState().setShipKillPopupAutoDismissMs(-500);
    expect(store.getState().shipKillPopupAutoDismissMs).toBe(0);
  });
});
