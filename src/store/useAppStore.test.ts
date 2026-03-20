import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const createPersistedData = (
  settings: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) => ({
  matches: [],
  players: [],
  pilotRegistry: [],
  favorites: [],
  pilotNotes: {},
  settings,
  layouts: {},
  lastActivity: Date.now(),
  mappings: {},
  playerProfiles: {},
  timelineEvents: [],
  uidMappings: { players: {}, ships: {}, weapons: {}, equipment: {}, perks: {} },
  uidSeedState: { seedVersionApplied: null },
  storageMeta: {},
  ...overrides,
});

const loadStore = async (settings: Record<string, unknown>, overrides: Record<string, unknown> = {}) => {
  vi.resetModules();
  const saveMock = vi.fn().mockResolvedValue(true);
  vi.doMock('../utils/storage', () => ({
    StorageService: {
      init: vi.fn().mockResolvedValue(createPersistedData(settings, overrides)),
      save: saveMock,
    },
  }));
  const module = await import('./useAppStore');
  await waitFor(() => {
    expect(module.useAppStore.getState().isLoading).toBe(false);
  });
  return {
    store: module.useAppStore,
    saveMock,
  };
};

describe('useAppStore OCR preference hydration', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('falls back to deferred capture and background result OCR when settings are unset', async () => {
    const { store } = await loadStore({});

    expect(store.getState().captureMode).toBe('deferred');
    expect(store.getState().resultOcrFlowMode).toBe('background');
    expect(store.getState().autoSequenceOnCapture).toBe(true);
    expect(store.getState().autoCaptureSendKeypresses).toBe(true);
    expect(store.getState().autoCaptureWaitMultiplier).toBe(0.5);
    expect(store.getState().tacticalMapKeybind).toBe('');
    expect(store.getState().autoPopulateRosterOnSave).toBe(true);
    expect(store.getState().pixelMonitorEnabled).toBe(false);
    expect(store.getState().pixelMonitorX).toBe(1492);
    expect(store.getState().pixelMonitorY).toBe(203);
    expect(store.getState().pixelMonitorWidth).toBe(170);
    expect(store.getState().pixelMonitorHeight).toBe(56);
    expect(store.getState().pixelMonitorIntervalMs).toBe(3000);
    expect(store.getState().pixelMonitorChangeSensitivity).toBe(30);
    expect(store.getState().fullAutoEnabled).toBe(false);
  });

  it('preserves explicit saved OCR preferences for existing users', async () => {
    const { store } = await loadStore({
      captureMode: 'auto',
      resultOcrFlowMode: 'prompt',
      autoSequenceOnCapture: true,
      autoCaptureSendKeypresses: false,
      autoCaptureWaitMultiplier: 2.2,
    });

    expect(store.getState().captureMode).toBe('auto');
    expect(store.getState().resultOcrFlowMode).toBe('prompt');
    expect(store.getState().autoSequenceOnCapture).toBe(true);
    expect(store.getState().autoCaptureSendKeypresses).toBe(false);
    expect(store.getState().autoCaptureWaitMultiplier).toBe(2.2);
  });

  it('preserves an explicit roster auto-populate opt-out', async () => {
    const { store } = await loadStore({
      autoPopulateRosterOnSave: false,
    });

    expect(store.getState().autoPopulateRosterOnSave).toBe(false);
  });

  it('preserves explicit persisted tactical map keys from either storage field', async () => {
    const { store: explicitSettingStore } = await loadStore({
      tacticalMapKeybind: 'KeyM',
    });
    expect(explicitSettingStore.getState().tacticalMapKeybind).toBe('KeyM');

    const { store: legacySettingStore } = await loadStore({
      autoCaptureTacticalMapKey: 'Tab',
    });
    expect(legacySettingStore.getState().tacticalMapKeybind).toBe('Tab');
  });

  it('hydrates persisted perk mappings from uidMappings', async () => {
    const { store } = await loadStore({}, {
      uidMappings: {
        players: {},
        ships: {},
        weapons: {},
        equipment: {},
        perks: { PERK_VOIDWEAVE: 'Afterburn' },
      },
    });

    expect(store.getState().uidMappings.perks).toEqual({ PERK_VOIDWEAVE: 'Afterburn' });
  });

  it('persists full auto and pixel monitor settings through storage', async () => {
    const { store, saveMock } = await loadStore({});

    store.setState({
      fullAutoEnabled: true,
      pixelMonitorEnabled: true,
      pixelMonitorX: 1820,
      pixelMonitorY: 240,
      pixelMonitorWidth: 220,
      pixelMonitorHeight: 72,
      pixelMonitorIntervalMs: 4200,
      pixelMonitorChangeSensitivity: 41,
    });

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalled();
    });

    const savedPayload = saveMock.mock.calls.at(-1)?.[0];
    expect(savedPayload.settings).toEqual(expect.objectContaining({
      fullAutoEnabled: true,
      pixelMonitorEnabled: true,
      pixelMonitorX: 1820,
      pixelMonitorY: 240,
      pixelMonitorWidth: 220,
      pixelMonitorHeight: 72,
      pixelMonitorIntervalMs: 4200,
      pixelMonitorChangeSensitivity: 41,
    }));
  });
});
