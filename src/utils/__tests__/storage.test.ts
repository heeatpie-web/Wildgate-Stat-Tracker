import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageData } from '../storage';

interface MockElectronApi {
  invoke: ReturnType<typeof vi.fn>;
}

const createStorageData = (overrides: Partial<StorageData> = {}): StorageData => ({
  matches: [],
  players: [],
  pilotRegistry: [],
  favorites: [],
  pilotNotes: {},
  settings: {},
  layouts: {},
  lastActivity: Date.now(),
  uidMappings: { players: {}, ships: {}, weapons: {}, equipment: {}, perks: {} },
  uidSeedState: { seedVersionApplied: null },
  storageMeta: {},
  ...overrides,
});

const loadStorageModule = async (mockElectronApi: MockElectronApi | null) => {
  vi.doMock('../electronAPI', () => ({
    getElectronAPI: () => mockElectronApi,
  }));
  vi.doMock('../logger', () => ({
    default: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }));
  return import('../storage');
};

describe('StorageService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('debounces multiple saves into a single latest write', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-write') return { success: true };
      if (channel === 'db-backup') return { success: true };
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const first = StorageService.save(createStorageData({ lastActivity: 100 }));
    const second = StorageService.save(createStorageData({ lastActivity: 200 }));

    await vi.advanceTimersByTimeAsync(299);
    expect(invoke).not.toHaveBeenCalledWith('db-write', expect.anything());

    await vi.advanceTimersByTimeAsync(2);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);

    const writeCalls = invoke.mock.calls.filter(([channel]) => channel === 'db-write');
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]?.[1]).toMatchObject({ lastActivity: 200 });
  });

  it('flush persists pending staged data immediately', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-write') return { success: true };
      if (channel === 'db-backup') return { success: true };
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const savePromise = StorageService.save(createStorageData({ lastActivity: 555 }));
    const flushResult = await StorageService.flush();

    expect(flushResult).toBe(true);
    await expect(savePromise).resolves.toBe(true);

    const writeCalls = invoke.mock.calls.filter(([channel]) => channel === 'db-write');
    expect(writeCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(500);
    const writeCallsAfterTimers = invoke.mock.calls.filter(([channel]) => channel === 'db-write');
    expect(writeCallsAfterTimers).toHaveLength(1);
  });

  it('returns false from save when write fails', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-write') {
        throw new Error('disk write failed');
      }
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const savePromise = StorageService.save(createStorageData({ lastActivity: 999 }));
    await vi.advanceTimersByTimeAsync(305);

    await expect(savePromise).resolves.toBe(false);
  });
});
