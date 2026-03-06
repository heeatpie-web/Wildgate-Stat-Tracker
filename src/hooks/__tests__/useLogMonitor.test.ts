import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addMatch = vi.fn();
const updateMatch = vi.fn();
const setLastActivity = vi.fn();
const setTelemetryStatus = vi.fn();
const processTelemetryEvent = vi.fn();

const gameDataState = {
  addMatch,
  updateMatch,
  playerIdMap: {},
  updatePlayerIdMapping: vi.fn(),
  pilotRegistry: [],
  addToRegistry: vi.fn(),
  activeHero: 'Adrian',
  setActiveHero: vi.fn(),
  activeShip: 'Hunter',
  setActiveShip: vi.fn(),
  activeWeapons: {},
  setActiveWeapons: vi.fn(),
  matchStartTime: null as number | null,
  setMatchStartTime: vi.fn(),
  isMatchInProgress: false,
  setIsMatchInProgress: vi.fn(),
  setTimeMin: vi.fn(),
  setTimeSec: vi.fn(),
  setLastActivity,
  setSelectedTeammates: vi.fn(),
  setCurrentLoadout: vi.fn(),
  currentLoadout: null,
  sessionStartTime: Date.now() - 5_000,
};

const uiState = {
  activeMode: 'Artifact Brawl',
  setActiveMode: vi.fn(),
  setToast: vi.fn(),
  setOverlayPhase: vi.fn(),
  enableAutoLogRecording: true,
  setShowWizard: vi.fn(),
  devMode: false,
  setTelemetryStatus,
  telemetryStatus: {},
};

const appStoreState = {
  telemetryPerformanceProfile: 'balanced',
  matches: [] as Array<Record<string, unknown>>,
  knownMappings: {},
  uidMappings: { players: {}, ships: {}, weapons: {}, equipment: {}, perks: {} },
  resetSelectionSourcesForNewMatch: vi.fn(),
  registerUnknownId: vi.fn(),
  setPlayerName: vi.fn(),
  activeWeapons: {},
};

const ipcCallbacks: Record<string, ((payload: unknown) => void) | undefined> = {};
const ipcMock = {
  send: vi.fn(),
  on: vi.fn((channel: string, callback: (payload: unknown) => void) => {
    ipcCallbacks[channel] = callback;
    return () => {
      delete ipcCallbacks[channel];
    };
  }),
};

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => gameDataState,
}));

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../../store/useAppStore', () => {
  const useAppStore = (selector: (s: typeof appStoreState) => unknown) => selector(appStoreState);
  useAppStore.getState = () => appStoreState;
  return { useAppStore };
});

vi.mock('../../hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({
    playStart: vi.fn(),
    playEnd: vi.fn(),
  }),
}));

vi.mock('../../utils/telemetryProcessor', () => ({
  processTelemetryEvent: (...args: unknown[]) => processTelemetryEvent(...args),
}));

vi.mock('../../utils/electronAPI', () => ({
  getElectronAPI: () => ipcMock,
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useLogMonitor', () => {
  beforeEach(() => {
    vi.resetModules();
    addMatch.mockClear();
    updateMatch.mockClear();
    setLastActivity.mockClear();
    setTelemetryStatus.mockClear();
    processTelemetryEvent.mockClear();
    appStoreState.setPlayerName.mockClear();
    appStoreState.resetSelectionSourcesForNewMatch.mockClear();
    appStoreState.registerUnknownId.mockClear();
    ipcMock.send.mockClear();
    ipcMock.on.mockClear();
    gameDataState.setCurrentLoadout.mockClear();
    gameDataState.setActiveWeapons.mockClear();
    gameDataState.setActiveHero.mockClear();
    gameDataState.setActiveShip.mockClear();
    gameDataState.updatePlayerIdMapping.mockClear();
    uiState.setToast.mockClear();
    gameDataState.sessionStartTime = Date.now() - 5_000;
    gameDataState.isMatchInProgress = false;
    gameDataState.currentLoadout = null;
    appStoreState.matches = [];
    appStoreState.activeWeapons = {};
    Object.keys(ipcCallbacks).forEach((key) => {
      delete ipcCallbacks[key];
    });
  });

  it('starts telemetry monitoring with the configured performance profile', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    expect(ipcMock.send).toHaveBeenCalledWith('start-log-monitoring', { performanceProfile: 'balanced' });
    expect(ipcMock.on).toHaveBeenCalledWith('log-status', expect.any(Function));
    expect(ipcMock.on).toHaveBeenCalledWith('log-data', expect.any(Function));
  });

  it('updates telemetry status and log feed when events arrive', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    const { result } = renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-status']?.({ exists: true, size: 123, lastCheck: 1 });
    });
    expect(setTelemetryStatus).toHaveBeenCalledWith({ exists: true, size: 123, lastCheck: 1 });

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'TelemetryPing',
          Payload: { some: 'payload' },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(result.current.logFeed).toHaveLength(1);
    expect(result.current.logFeed[0]?.EventName).toBe('TelemetryPing');
    expect(setLastActivity).toHaveBeenCalled();
    expect(setTelemetryStatus).toHaveBeenCalledWith(expect.objectContaining({ lastEventAt: expect.any(Number) }));
  });

  it('creates a telemetry draft on map-start signal', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(addMatch).toHaveBeenCalledTimes(1);
    expect(addMatch.mock.calls[0]?.[0]).toMatchObject({
      player: 'Pilot',
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      ocrState: 'queued',
    });
  });

  it('resets selection source gates and seeds hero/ship from latest telemetry loadout on match start', async () => {
    gameDataState.currentLoadout = {
      hero: 'Venture',
      ship: 'Scout (3 Player)',
      weapons: [],
      equipment: [],
      characterWeapons: [],
      characterEquipment: [],
    };

    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(appStoreState.resetSelectionSourcesForNewMatch).toHaveBeenCalledTimes(1);
    expect(gameDataState.setActiveHero).toHaveBeenCalledWith('Venture', 'telemetry');
    expect(gameDataState.setActiveShip).toHaveBeenCalledWith('Scout (3 Player)', 'telemetry');
  });

  it('does not create telemetry draft from session-id start without map start', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'TelemetryPing',
          Payload: { event: { some: 'payload' } },
          context: { matchSessionId: 'session-only-start' },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(addMatch).not.toHaveBeenCalled();
  });

  it('passes not-in-progress lifecycle context to telemetry processor on initial map start', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { event: { loadedMap: 'DesolationReach' } },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(processTelemetryEvent).toHaveBeenCalled();
    const context = processTelemetryEvent.mock.calls[0]?.[2] as { isMatchInProgress?: boolean } | undefined;
    expect(context?.isMatchInProgress).toBe(false);
  });

  it('reuses a recent unresolved telemetry draft instead of creating a duplicate', async () => {
    const now = Date.now();
    appStoreState.matches = [{
      id: 777001,
      timestamp: now - 2_000,
      date: new Date(now - 2_000).toLocaleDateString(),
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      loadout: {
        hero: 'Adrian',
        ship: 'Hunter',
        weapons: [],
        equipment: [],
        characterWeapons: [],
        characterEquipment: [],
      },
      weapons: {},
      reachModifiers: [],
      kills: { 'AI Legion': 0 },
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      time: '00:00',
      damageTaken: 0,
      notes: '',
      timelineEvents: [],
      artifacts: [],
      ocrState: 'queued',
    }];
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: Math.floor(now / 1000),
        },
      ]);
    });

    expect(addMatch).not.toHaveBeenCalled();
  });

  it('resolves nested telemetry weapon/equipment payloads into current loadout', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'CharacterLoadoutChanged',
          Payload: {
            isLocalPlayer: true,
            hero: 'Adrian',
            ship: 'Hunter',
            weapons: [
              { weaponName: 'Double Whammy' },
              { displayName: 'The Doctor' },
            ],
            equipmentSlots: [
              { name: 'Repair Drone' },
            ],
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(gameDataState.setCurrentLoadout).toHaveBeenCalled();
    const latestCall = gameDataState.setCurrentLoadout.mock.calls[gameDataState.setCurrentLoadout.mock.calls.length - 1];
    const latestLoadout = latestCall?.[0] as {
      weapons?: string[];
      equipment?: string[];
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.weapons || []).toHaveLength(0);
    expect(latestLoadout?.characterWeapons).toEqual(expect.arrayContaining(['Double Whammy', 'The Doctor']));
    expect(latestLoadout?.characterEquipment).toEqual(expect.arrayContaining(['Repair Drone']));
  });

  it('resolves telemetry perk payloads into prospector perks on current loadout', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'CharacterLoadoutChanged',
          Payload: {
            isLocalPlayer: true,
            hero: 'Adrian',
            ship: 'Hunter',
            perks: ['Boarder'],
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      characterPerks?: string[];
      perks?: string[];
    };
    expect(latestLoadout?.characterPerks || []).toEqual(expect.arrayContaining(['Boarder']));
    expect(latestLoadout?.perks || []).toEqual(expect.arrayContaining(['Boarder']));
  });

  it('captures tertiary telemetry weapon and equipment GUIDs in current loadout', async () => {
    appStoreState.uidMappings.weapons = {
      'GUID-ROCKET': 'Rocket Launcher',
    };
    appStoreState.uidMappings.equipment = {
      'GUID-REPULSOR': 'Repulsor',
    };

    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadoutSaved',
          Payload: {
            event: {
              isLocalPlayer: true,
              loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                guidWeaponTertiary: 'GUID-ROCKET',
                guidEquipmentTertiary: 'GUID-REPULSOR',
              },
            },
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.characterWeapons || []).toEqual(expect.arrayContaining(['Rocket Launcher']));
    expect(latestLoadout?.characterEquipment || []).toEqual(expect.arrayContaining(['Repulsor']));
  });

  it('registers unknown telemetry perk GUIDs for ID mapper resolution', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'CharacterLoadoutChanged',
          Payload: {
            isLocalPlayer: true,
            hero: 'Adrian',
            ship: 'Hunter',
            guidPerkPrimary: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(appStoreState.registerUnknownId).toHaveBeenCalledWith('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'Perk');
  });

  it('registers unknown telemetry perk names for ID mapper resolution', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'CharacterLoadoutChanged',
          Payload: {
            isLocalPlayer: true,
            hero: 'Adrian',
            ship: 'Hunter',
            perks: ['Voidweave Overdrive'],
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(appStoreState.registerUnknownId).toHaveBeenCalledWith('Voidweave Overdrive', 'Perk');
  });

  it('clears stale telemetry character loadout selections when payload explicitly sends empty slots', async () => {
    gameDataState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: [],
      characterWeapons: ['Double Whammy', 'The Doctor'],
      characterEquipment: ['Repair Drone'],
    };
    appStoreState.activeWeapons = {
      'Double Whammy': 1,
      'The Doctor': 1,
      'Repair Drone': 1,
    };

    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'CharacterLoadoutChanged',
          Payload: {
            isLocalPlayer: true,
            hero: 'Adrian',
            ship: 'Hunter',
            characterWeapons: [],
            characterEquipment: [],
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.characterWeapons || []).toEqual([]);
    expect(latestLoadout?.characterEquipment || []).toEqual([]);

    const latestActiveWeapons = gameDataState.setActiveWeapons.mock.calls.at(-1)?.[0] as Record<string, number>;
    expect(latestActiveWeapons['Double Whammy']).toBeUndefined();
    expect(latestActiveWeapons['The Doctor']).toBeUndefined();
    expect(latestActiveWeapons['Repair Drone']).toBeUndefined();
  });

  it('applies NebLoadoutSaved payloads to telemetry draft loadout while queue is active', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: nowSec,
        },
      ]);
    });

    const createdDraft = addMatch.mock.calls[0]?.[0];
    expect(createdDraft).toBeTruthy();
    appStoreState.matches = [createdDraft];

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadoutSaved',
          Payload: {
            event: {
              isLocalPlayer: true,
              bWasSavedInGame: false,
              loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                characterWeapons: ['Double Whammy'],
                characterEquipment: ['Repair Drone'],
              },
            },
          },
          ClientTimestamp: nowSec + 1,
        },
      ]);
    });

    expect(gameDataState.setCurrentLoadout).toHaveBeenCalled();
    const updatedDraftWithSave = updateMatch.mock.calls
      .map(([match]) => match as {
        telemetryConsistency?: { loadoutSaves?: Array<{ source?: string }> };
      })
      .find((match) => Array.isArray(match?.telemetryConsistency?.loadoutSaves) && match.telemetryConsistency.loadoutSaves.length > 0);
    expect(updatedDraftWithSave?.telemetryConsistency?.loadoutSaves?.[0]?.source).toBe('NebLoadoutSaved');
  });

  it('applies local loadout when telemetry only provides platform-account identity variants', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const platformAccountCompact = '1234567890abcdef1234567890abcdef';
    const platformAccountHyphenated = '12345678-90ab-cdef-1234-567890abcdef';

    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadoutSaved',
          context: {
            client: {
              platformAccountId: platformAccountCompact,
            },
          },
          Payload: {
            event: {
              actorId: platformAccountHyphenated,
              loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                characterWeapons: ['Double Whammy'],
                characterEquipment: ['Repair Drone'],
              },
            },
          },
          ClientTimestamp: nowSec,
        },
      ]);
    });

    expect(gameDataState.setCurrentLoadout).toHaveBeenCalled();
    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      hero?: string | null;
      ship?: string | null;
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.hero).toBe('Adrian');
    expect(String(latestLoadout?.ship || '')).toContain('Hunter');
    expect(latestLoadout?.characterWeapons).toEqual(expect.arrayContaining(['Double Whammy']));
    expect(latestLoadout?.characterEquipment).toEqual(expect.arrayContaining(['Repair Drone']));
  });

  it('captures matchmaker teammate and mode expectations only after match start', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebClientMatchmakerStateChange',
          Payload: {
            event: {
              playerIds: ['pilot-id', 'wing-1'],
              ticketMatchPool: 'FleetBattle',
            },
          },
          ClientTimestamp: nowSec - 1,
        },
      ]);
    });

    const beforeStartConsistency = updateMatch.mock.calls
      .map(([match]) => match as {
        telemetryConsistency?: { expectedTeammateCount?: number; expectedMode?: string };
      })
      .find((match) => typeof match?.telemetryConsistency?.expectedTeammateCount === 'number');
    expect(beforeStartConsistency).toBeUndefined();

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: nowSec,
        },
      ]);
    });

    const createdDraft = addMatch.mock.calls[0]?.[0];
    expect(createdDraft).toBeTruthy();
    expect((createdDraft?.telemetryConsistency as { expectedTeammateCount?: number } | undefined)?.expectedTeammateCount).toBeUndefined();
    appStoreState.matches = [createdDraft];

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebClientMatchmakerStateChange',
          Payload: {
            event: {
              playerIds: ['pilot-id', 'wing-1', 'wing-2', 'wing-3'],
              ticketMatchPool: 'ArtifactBrawl',
            },
          },
          ClientTimestamp: nowSec + 1,
        },
      ]);
    });

    const withConsistency = updateMatch.mock.calls
      .map(([match]) => match as {
        telemetryConsistency?: { expectedTeammateCount?: number; expectedMode?: string };
      })
      .find((match) => typeof match?.telemetryConsistency?.expectedTeammateCount === 'number');

    expect(withConsistency?.telemetryConsistency?.expectedTeammateCount).toBe(3);
    expect(withConsistency?.telemetryConsistency?.expectedMode).toBe('Artifact Brawl');
  });

  it('records loadout-related NebCloudSaveRecordSize snapshots and ignores unrelated keys', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: nowSec,
        },
      ]);
    });

    const createdDraft = addMatch.mock.calls[0]?.[0];
    expect(createdDraft).toBeTruthy();
    appStoreState.matches = [createdDraft];

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebCloudSaveRecordSize',
          Payload: { event: { recordKey: 'UnrelatedStatsBlob' } },
          ClientTimestamp: nowSec + 1,
        },
      ]);
    });

    const beforeLoadoutEventCount = updateMatch.mock.calls.length;

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebCloudSaveRecordSize',
          Payload: { event: { recordKey: 'CharacterLoadout_v2' } },
          ClientTimestamp: nowSec + 2,
        },
      ]);
    });

    expect(updateMatch.mock.calls.length).toBeGreaterThan(beforeLoadoutEventCount);
    const withSnapshot = updateMatch.mock.calls
      .map(([match]) => match as {
        telemetryConsistency?: { loadoutSaves?: Array<{ source?: string }> };
      })
      .find((match) => Array.isArray(match?.telemetryConsistency?.loadoutSaves)
        && match.telemetryConsistency.loadoutSaves.some((entry) => entry.source === 'NebCloudSaveRecordSize'));

    expect(withSnapshot).toBeTruthy();
  });

  it('resets telemetry draft duration when mission length exceeds 60 minutes', async () => {
    const baseSec = Math.floor(Date.now() / 1000);
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: baseSec,
        },
      ]);
    });

    const createdDraft = addMatch.mock.calls[0]?.[0];
    expect(createdDraft).toBeTruthy();
    appStoreState.matches = [createdDraft];

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'Frontend_MainMenu' },
          ClientTimestamp: baseSec + (74 * 60),
        },
      ]);
    });

    const finalizedDraft = updateMatch.mock.calls
      .map(([match]) => match as {
        notes?: string;
        time?: string;
        telemetryConsistency?: { telemetryDurationSeconds?: number };
      })
      .find((match) => typeof match.time === 'string' && match.telemetryConsistency !== undefined);

    expect(finalizedDraft).toBeTruthy();
    expect(finalizedDraft?.time).toBe('00:00');
    expect(finalizedDraft?.telemetryConsistency?.telemetryDurationSeconds).toBeUndefined();
    expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
  });

  it('ignores stale older NebLoadoutSaved events so newer loadout is not regressed', async () => {
    const baseSec = Math.floor(Date.now() / 1000);
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: baseSec,
        },
      ]);
    });

    const createdDraft = addMatch.mock.calls[0]?.[0];
    expect(createdDraft).toBeTruthy();
    appStoreState.matches = [createdDraft];

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadoutSaved',
          Payload: {
            event: {
              isLocalPlayer: true,
              bWasSavedInGame: true,
              loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                characterWeapons: ['Double Whammy'],
              },
            },
          },
          ClientTimestamp: baseSec + 5,
        },
      ]);
    });

    const callsAfterFreshSave = gameDataState.setCurrentLoadout.mock.calls.length;
    expect(callsAfterFreshSave).toBeGreaterThan(0);
    const latestAfterFresh = gameDataState.setCurrentLoadout.mock.calls[callsAfterFreshSave - 1]?.[0] as Record<string, unknown>;
    expect(latestAfterFresh?.hero).toBe('Adrian');

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadoutSaved',
          Payload: {
            event: {
              isLocalPlayer: true,
              bWasSavedInGame: false,
              loadout: {
                hero: 'Venture',
                ship: 'Hunter',
                characterWeapons: ['The Doctor'],
              },
            },
          },
          ClientTimestamp: baseSec + 2,
        },
      ]);
    });

    expect(gameDataState.setCurrentLoadout.mock.calls.length).toBe(callsAfterFreshSave);
    const staleApplyAttempt = gameDataState.setCurrentLoadout.mock.calls
      .map(([loadout]) => loadout as Record<string, unknown>)
      .find((loadout) => loadout?.hero === 'Venture');
    expect(staleApplyAttempt).toBeUndefined();
  });
});
