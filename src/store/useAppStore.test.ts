import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const createPersistedData = (settings: Record<string, unknown>) => ({
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
});

const loadStore = async (settings: Record<string, unknown>) => {
  vi.resetModules();
  vi.doMock('../utils/storage', () => ({
    StorageService: {
      init: vi.fn().mockResolvedValue(createPersistedData(settings)),
      save: vi.fn().mockResolvedValue(true),
    },
  }));
  const module = await import('./useAppStore');
  await waitFor(() => {
    expect(module.useAppStore.getState().isLoading).toBe(false);
  });
  return module.useAppStore;
};

describe('useAppStore OCR preference hydration', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('falls back to deferred capture and background result OCR when settings are unset', async () => {
    const store = await loadStore({});

    expect(store.getState().captureMode).toBe('deferred');
    expect(store.getState().resultOcrFlowMode).toBe('background');
  });

  it('preserves explicit saved OCR preferences for existing users', async () => {
    const store = await loadStore({
      captureMode: 'auto',
      resultOcrFlowMode: 'prompt',
    });

    expect(store.getState().captureMode).toBe('auto');
    expect(store.getState().resultOcrFlowMode).toBe('prompt');
  });
});
