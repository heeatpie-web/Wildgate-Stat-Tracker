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
    module,
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
    expect(store.getState().fullAutoEnabled).toBe(true);
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

  it('defaults Full Auto on while preserving an explicit persisted opt-out', async () => {
    const { store: disabledStore } = await loadStore({
      fullAutoEnabled: false,
    });
    expect(disabledStore.getState().fullAutoEnabled).toBe(false);

    const { store: defaultStore } = await loadStore({});
    expect(defaultStore.getState().fullAutoEnabled).toBe(true);
  });

  it('hydrates persisted gamepad mode preference', async () => {
    const { store: enabledStore } = await loadStore({
      gamepadModeEnabled: true,
    });
    expect(enabledStore.getState().gamepadModeEnabled).toBe(true);

    const { store: defaultStore } = await loadStore({});
    expect(defaultStore.getState().gamepadModeEnabled).toBe(false);
  });

  it('persists full auto settings through storage', async () => {
    const { store, saveMock } = await loadStore({});

    store.setState({
      fullAutoEnabled: true,
    });

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalled();
    });

    const latestCall = saveMock.mock.calls[saveMock.mock.calls.length - 1];
    const savedPayloadFactory = latestCall?.[0];
    const savedPayload = typeof savedPayloadFactory === 'function'
      ? savedPayloadFactory()
      : savedPayloadFactory;
    expect(savedPayload.settings).toEqual(expect.objectContaining({
      fullAutoEnabled: true,
    }));
    expect(latestCall?.[1]).toEqual(expect.objectContaining({
      debounceMs: 300,
    }));
  });

  it('persists gamepad mode through storage', async () => {
    const { store, saveMock } = await loadStore({});

    store.setState({
      gamepadModeEnabled: true,
    });

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalled();
    });

    const latestCall = saveMock.mock.calls[saveMock.mock.calls.length - 1];
    const savedPayloadFactory = latestCall?.[0];
    const savedPayload = typeof savedPayloadFactory === 'function'
      ? savedPayloadFactory()
      : savedPayloadFactory;
    expect(savedPayload.settings).toEqual(expect.objectContaining({
      gamepadModeEnabled: true,
    }));
  });

  it('uses telemetry-burst debounce for telemetry draft-only match churn', async () => {
    const { module } = await loadStore({});
    const { shouldUseTelemetryBurstDebounce } = module.__test__;
    const previousDraft = { id: 11, subType: 'Telemetry Draft', result: 'Ongoing' } as any;
    const nextDraft = { ...previousDraft, notes: 'updated from telemetry' } as any;

    const shouldDebounce = shouldUseTelemetryBurstDebounce(
      {
        matches: [previousDraft],
        lastActivity: 100,
        activeHero: 'Prospector',
        activeShip: 'Hunter',
        activeWeapons: { Railgun: 1 },
        characterLoadouts: {},
        currentLoadout: null,
      },
      {
        matches: [nextDraft],
        lastActivity: 101,
        activeHero: 'Prospector',
        activeShip: 'Hunter',
        activeWeapons: { Railgun: 1 },
        characterLoadouts: {},
        currentLoadout: null,
      },
    );

    expect(shouldDebounce).toBe(true);
  });

  it('does not use telemetry-burst debounce when a non-draft match changes', async () => {
    const { module } = await loadStore({});
    const { shouldUseTelemetryBurstDebounce } = module.__test__;
    const previousMatch = { id: 22, subType: 'Manual', result: 'Win' } as any;
    const nextMatch = { ...previousMatch, notes: 'edited' } as any;

    const shouldDebounce = shouldUseTelemetryBurstDebounce(
      {
        matches: [previousMatch],
        lastActivity: 100,
        activeHero: 'Prospector',
        activeShip: 'Hunter',
        activeWeapons: {},
        characterLoadouts: {},
        currentLoadout: null,
      },
      {
        matches: [nextMatch],
        lastActivity: 101,
        activeHero: 'Prospector',
        activeShip: 'Hunter',
        activeWeapons: {},
        characterLoadouts: {},
        currentLoadout: null,
      },
    );

    expect(shouldDebounce).toBe(false);
  });
});
