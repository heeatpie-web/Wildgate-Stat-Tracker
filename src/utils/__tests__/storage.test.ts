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
      debug: vi.fn(),
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
    expect((writeCalls[0] as any)?.[1]).toMatchObject({ lastActivity: 200 });
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

  it('does not mirror the full DB into localStorage in Electron', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-write') return { success: true };
      if (channel === 'db-backup') return { success: true };
      return null;
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const { StorageService } = await loadStorageModule({ invoke });

    const savePromise = StorageService.save(createStorageData({ lastActivity: 1234 }));
    await vi.advanceTimersByTimeAsync(305);

    await expect(savePromise).resolves.toBe(true);
    expect(setItemSpy).not.toHaveBeenCalledWith('wg_db', expect.any(String));
  });

  it('does not flush staged Electron saves when the document becomes hidden', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-write') return { success: true };
      if (channel === 'db-backup') return { success: true };
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    try {
      void StorageService.save(createStorageData({ lastActivity: 4321 }));
      document.dispatchEvent(new Event('visibilitychange'));

      const writeCalls = invoke.mock.calls.filter(([channel]) => channel === 'db-write');
      expect(writeCalls).toHaveLength(0);
    } finally {
      if (originalVisibilityDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
      }
    }
  });

  it('uses lightweight auto backups without requesting artifact bundles', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-write') return { success: true };
      if (channel === 'db-backup') return { success: true };
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const savePromise = StorageService.save(createStorageData({
      matches: Array.from({ length: 5 }, (_, index) => ({ id: index + 1 })) as StorageData['matches'],
      settings: { autoBackup: true },
    }));
    await vi.advanceTimersByTimeAsync(305);

    await expect(savePromise).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('db-backup', { reason: 'auto' });
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
          perks: {
            A7291E13434D4D67CFEAD0928F4CEA69: 'Boarder',
            '4F09C2D142262A675213A494006700AB': 'Charlie Teleport',
          },
        };
      }
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const loaded = await StorageService.init();

    expect(loaded!.uidMappings!.players.C0C3960248AD43D20AA6DDA8AEB81424).toBe('Captain Sal');
    expect(loaded!.uidMappings!.players.E7539B7C4483C338E55B15B102E2F006).toBe('Adrian');
    expect(loaded!.uidMappings!.ships['0BFFF89B44027290DC6348B95A6B0F11']).toBe('Hunter');
    expect(loaded!.uidMappings!.weapons.F350FD964B4A0E59F068AE88D6D9650C).toBe('The Doctor');
    expect(loaded!.uidMappings!.equipment.F2B54FEC47BBDBEA641EB9AD846A0A8D).toBe('Repair Drone');
    expect(loaded!.uidMappings!.perks!.A7291E13434D4D67CFEAD0928F4CEA69).toBe('Boarder');
    expect(loaded!.uidMappings!.perks!['4F09C2D142262A675213A494006700AB']).toBe('Charlie Teleport');
    expect(loaded!.uidSeedState!.seedVersionApplied).toBe(2);
  });

  it('hydrates teammate identity records from persisted storage', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-read') {
        return createStorageData({
          teammateIdentityRecords: {
            AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA: {
              playerId: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              status: 'auto_linked',
              currentName: 'Wingmate',
              firstSeenAt: 123,
              lastSeenAt: 456,
              sampleCount: 4,
              candidates: {
                wingmate: {
                  displayName: 'Wingmate',
                  sampleCount: 4,
                  weightedScore: 4.2,
                  maxOcrConfidence: 1,
                  firstSeenAt: 123,
                  lastSeenAt: 456,
                  sourceCounts: {
                    crew_hub: 4,
                    social: 0,
                    matchstats: 0,
                    telemetry_direct: 0,
                    manual: 0,
                    unknown: 0,
                  },
                },
              },
            },
          },
        });
      }
      if (channel === 'read-uid-seed') {
        return { version: 0, players: {}, ships: {}, weapons: {}, equipment: {}, perks: {} };
      }
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const loaded = await StorageService.init();

    expect(loaded?.teammateIdentityRecords?.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA?.currentName).toBe('Wingmate');
  });

  it('relocations in seed move a misplaced GUID from the wrong domain to the correct one', async () => {
    const PRIVATEER_GUID = 'DBCDD50744CF05BC84F52982E6567ACB';
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-read') {
        return createStorageData({
          uidMappings: {
            players: { [PRIVATEER_GUID]: 'Privateer' },
            ships: {},
            weapons: {},
            equipment: {},
            perks: {},
          },
          uidSeedState: { seedVersionApplied: 4 },
        });
      }
      if (channel === 'read-uid-seed') {
        return {
          version: 5,
          players: {},
          ships: { [PRIVATEER_GUID]: 'Privateer' },
          weapons: {},
          equipment: {},
          perks: {},
          relocations: [{ guid: PRIVATEER_GUID, from: 'players', to: 'ships' }],
        };
      }
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const loaded = await StorageService.init();

    expect(loaded!.uidMappings!.ships[PRIVATEER_GUID]).toBe('Privateer');
    expect(loaded!.uidMappings!.players[PRIVATEER_GUID]).toBeUndefined();
  });

  it('relocations in seed can move multiple misplaced GUIDs into weapons and equipment', async () => {
    const SONIC_BOOM_GUID = 'D67BB8DA4C46726739FDBC887F37A9C1';
    const THUNDER_DASH_GUID = '1FC6C97040714EF444F7119B75377054';
    const ATTACK_DRONE_GUID = '3E9EF2344C50F8026CDCAAAAF7777907';
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-read') {
        return createStorageData({
          uidMappings: {
            players: {
              [SONIC_BOOM_GUID]: 'Sonic Boom',
              [THUNDER_DASH_GUID]: 'Thunder Dash',
              [ATTACK_DRONE_GUID]: 'Attack Drone',
            },
            ships: {},
            weapons: {},
            equipment: {},
            perks: {},
          },
          uidSeedState: { seedVersionApplied: 7 },
        });
      }
      if (channel === 'read-uid-seed') {
        return {
          version: 8,
          players: {},
          ships: {},
          weapons: { [SONIC_BOOM_GUID]: 'Sonic Boom' },
          equipment: {
            [THUNDER_DASH_GUID]: 'Thunder Dash',
            [ATTACK_DRONE_GUID]: 'Attack Drone',
          },
          perks: {},
          relocations: [
            { guid: SONIC_BOOM_GUID, from: 'players', to: 'weapons' },
            { guid: THUNDER_DASH_GUID, from: 'players', to: 'equipment' },
            { guid: ATTACK_DRONE_GUID, from: 'players', to: 'equipment' },
          ],
        };
      }
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const loaded = await StorageService.init();

    expect(loaded!.uidMappings!.players[SONIC_BOOM_GUID]).toBeUndefined();
    expect(loaded!.uidMappings!.players[THUNDER_DASH_GUID]).toBeUndefined();
    expect(loaded!.uidMappings!.players[ATTACK_DRONE_GUID]).toBeUndefined();
    expect(loaded!.uidMappings!.weapons[SONIC_BOOM_GUID]).toBe('Sonic Boom');
    expect(loaded!.uidMappings!.equipment[THUNDER_DASH_GUID]).toBe('Thunder Dash');
    expect(loaded!.uidMappings!.equipment[ATTACK_DRONE_GUID]).toBe('Attack Drone');
  });

  it('strips ghost non-player player profiles and legacy player mappings even when the seed version is already applied', async () => {
    const THUNDER_DASH_GUID = '1FC6C97040714EF444F7119B75377054';
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-read') {
        return createStorageData({
          mappings: {
            [THUNDER_DASH_GUID]: 'Thunder Dash',
          },
          playerIdMap: {
            [THUNDER_DASH_GUID]: 'Thunder Dash',
          },
          playerProfiles: {
            [THUNDER_DASH_GUID]: {
              id: THUNDER_DASH_GUID,
              sightings: 4,
              firstSeen: 123,
              lastSeen: 456,
              teamsObserved: {},
              playedWith: {},
              playedAgainst: {},
              shipsObserved: {},
              ocrSightings: 0,
              manualSightings: 0,
              name: 'Thunder Dash',
            },
          },
          uidMappings: {
            players: {
              [THUNDER_DASH_GUID]: 'Thunder Dash',
            },
            ships: {},
            weapons: {},
            equipment: {},
            perks: {},
          },
          uidSeedState: { seedVersionApplied: 9 },
        });
      }
      if (channel === 'read-uid-seed') {
        return {
          version: 9,
          players: {},
          ships: {},
          weapons: {},
          equipment: {},
          perks: {},
          relocations: [
            { guid: THUNDER_DASH_GUID, from: 'players', to: 'equipment' },
          ],
        };
      }
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const loaded = await StorageService.init();

    expect(loaded!.uidMappings!.players[THUNDER_DASH_GUID]).toBeUndefined();
    expect(loaded?.mappings?.[THUNDER_DASH_GUID]).toBeUndefined();
    expect(loaded?.playerIdMap?.[THUNDER_DASH_GUID]).toBeUndefined();
    expect(loaded?.playerProfiles?.[THUNDER_DASH_GUID]).toBeUndefined();
  });

  it('canonicalizes corrected equipment names and rewrites the stale Thunder Dash alias to Drill Charge on upgrade', async () => {
    const STALE_GUID = '20C5C5A04C5A86EFAF1F9FAF2C0DD60C';
    const ROCK_GUID = '1FC6C97040714EF444F7119B75377054';
    const ADVENTURE_GUID = 'CD21C7B2468EC990E4AFDE8B27CFE398';
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-read') {
        return createStorageData({
          mappings: {
            [ADVENTURE_GUID]: 'Adventure Geat',
          },
          playerIdMap: {
            [ADVENTURE_GUID]: 'Adventure Geat',
          },
          playerProfiles: {
            [ADVENTURE_GUID]: {
              id: ADVENTURE_GUID,
              sightings: 1,
              firstSeen: 1,
              lastSeen: 1,
              teamsObserved: {},
              playedWith: {},
              playedAgainst: {},
              shipsObserved: {},
              ocrSightings: 0,
              manualSightings: 0,
              name: 'Adventure Geat',
            },
          },
          uidMappings: {
            players: {
              [ADVENTURE_GUID]: 'Adventure Geat',
            },
            ships: {},
            weapons: {},
            equipment: {
              [STALE_GUID]: 'Thunder Dash',
              [ROCK_GUID]: 'Rock',
              [ADVENTURE_GUID]: 'Adventure Geat',
            },
            perks: {},
          },
          uidSeedState: { seedVersionApplied: 10 },
        });
      }
      if (channel === 'read-uid-seed') {
        return {
          version: 12,
          players: {},
          ships: {},
          weapons: {},
          equipment: {
            [STALE_GUID]: 'Drill Charge',
            [ROCK_GUID]: 'Rock!',
            [ADVENTURE_GUID]: 'Adventure Gear',
          },
          perks: {},
          relocations: [
            { guid: STALE_GUID, from: 'players', to: 'equipment' },
            { guid: ROCK_GUID, from: 'players', to: 'equipment' },
            { guid: ADVENTURE_GUID, from: 'players', to: 'equipment' },
          ],
        };
      }
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const loaded = await StorageService.init();

    expect(loaded!.uidMappings!.equipment[STALE_GUID]).toBe('Drill Charge');
    expect(loaded!.uidMappings!.equipment[ROCK_GUID]).toBe('Rock!');
    expect(loaded!.uidMappings!.equipment[ADVENTURE_GUID]).toBe('Adventure Gear');
    expect(loaded!.uidMappings!.players[ADVENTURE_GUID]).toBeUndefined();
    expect(loaded?.mappings?.[ADVENTURE_GUID]).toBeUndefined();
    expect(loaded?.playerIdMap?.[ADVENTURE_GUID]).toBeUndefined();
    expect(loaded?.playerProfiles?.[ADVENTURE_GUID]).toBeUndefined();
  });

  it('strips bogus tertiary placeholder mappings and loadout entries during hydration', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db-read') {
        return createStorageData({
          matches: [{
            id: 1,
            notes: '',
            loadout: {
              hero: 'Adrian',
              ship: 'Hunter',
              perks: [],
              shipPerks: [],
              characterPerks: [],
              shipWeapons: [],
              weapons: ['Tertiary Weapon'],
              equipment: ['Tertiary Equipment'],
              characterWeapons: ['The Doctor', 'Tertiary Weapon'],
              characterEquipment: ['Repair Drone', 'Tertiary Equipment'],
            },
          } as unknown as StorageData['matches'][number]],
          uidMappings: {
            players: {},
            ships: {},
            weapons: {
              B1B367B8429C67883B88D5B315F997B0: 'Tertiary Weapon',
            },
            equipment: {
              B1B367B8429C67883B88D5B315F997B0: 'Tertiary Equipment',
              D758D49F45005A77CB13ABAE81E204EB: 'Repulsor',
            },
            perks: {},
          },
        });
      }
      return null;
    });
    const { StorageService } = await loadStorageModule({ invoke });

    const loaded = await StorageService.init();

    expect(loaded!.uidMappings!.weapons.B1B367B8429C67883B88D5B315F997B0).toBeUndefined();
    expect(loaded!.uidMappings!.equipment.B1B367B8429C67883B88D5B315F997B0).toBeUndefined();
    expect(loaded!.uidMappings!.equipment.D758D49F45005A77CB13ABAE81E204EB).toBe('Repulsor');
    expect(loaded?.matches[0]?.loadout?.weapons || []).toEqual([]);
    expect(loaded?.matches[0]?.loadout?.equipment || []).toEqual([]);
    expect(loaded?.matches[0]?.loadout?.characterWeapons || []).toEqual(['The Doctor']);
    expect(loaded?.matches[0]?.loadout?.characterEquipment || []).toEqual(['Repair Drone']);
  });
});
