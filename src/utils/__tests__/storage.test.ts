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

  it('applies bundled UID seed entries without overwriting user mappings', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-read') {
        return createStorageData({
          uidMappings: {
            players: {
              C0C3960248AD43D20AA6DDA8AEB81424: 'Captain Sal',
            },
            ships: {},
            weapons: {},
            equipment: {},
            perks: {},
          },
        });
      }
      if (channel === 'read-uid-seed') {
        return {
          version: 2,
          players: {
            'C0C3960248AD43D20AA6DDA8AEB81424': 'Sal',
            'E7539B7C4483C338E55B15B102E2F006': 'Adrian',
          },
          ships: {
            '0BFFF89B44027290DC6348B95A6B0F11': 'Hunter',
          },
          weapons: {
            'F350FD964B4A0E59F068AE88D6D9650C': 'The Doctor',
          },
          equipment: {
            'F2B54FEC47BBDBEA641EB9AD846A0A8D': 'Repair Drone',
          },
          perks: {},
        };
      }
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const loaded = await StorageService.init();

    expect(loaded?.uidMappings.players.C0C3960248AD43D20AA6DDA8AEB81424).toBe('Captain Sal');
    expect(loaded?.uidMappings.players.E7539B7C4483C338E55B15B102E2F006).toBe('Adrian');
    expect(loaded?.uidMappings.ships['0BFFF89B44027290DC6348B95A6B0F11']).toBe('Hunter');
    expect(loaded?.uidMappings.weapons.F350FD964B4A0E59F068AE88D6D9650C).toBe('The Doctor');
    expect(loaded?.uidMappings.equipment.F2B54FEC47BBDBEA641EB9AD846A0A8D).toBe('Repair Drone');
    expect(loaded?.uidSeedState.seedVersionApplied).toBe(2);
  });
});
