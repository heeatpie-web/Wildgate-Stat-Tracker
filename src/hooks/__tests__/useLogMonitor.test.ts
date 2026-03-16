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
  clearTelemetryDetected: vi.fn(),
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
  adaptiveTelemetryPollingEnabled: false,
  matches: [] as Array<Record<string, unknown>>,
  knownMappings: {},
  uidMappings: { players: {}, ships: {}, weapons: {}, equipment: {}, perks: {} },
  resetSelectionSourcesForNewMatch: vi.fn(),
  resetMatchTrackingForNewMatch: vi.fn(),
  resetMatchMetricsForNewMatch: vi.fn(),
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
    appStoreState.resetMatchTrackingForNewMatch.mockClear();
    appStoreState.resetMatchMetricsForNewMatch.mockClear();
    appStoreState.registerUnknownId.mockClear();
    ipcMock.send.mockClear();
    ipcMock.on.mockClear();
    gameDataState.setCurrentLoadout.mockClear();
    gameDataState.setActiveWeapons.mockClear();
    gameDataState.setActiveHero.mockClear();
    gameDataState.setActiveShip.mockClear();
    gameDataState.clearTelemetryDetected.mockClear();
    gameDataState.updatePlayerIdMapping.mockClear();
    uiState.activeMode = 'Artifact Brawl';
    uiState.setToast.mockClear();
    gameDataState.sessionStartTime = Date.now() - 5_000;
    gameDataState.isMatchInProgress = false;
    gameDataState.currentLoadout = null;
    appStoreState.adaptiveTelemetryPollingEnabled = false;
    appStoreState.matches = [];
    appStoreState.activeWeapons = {};
    Object.keys(ipcCallbacks).forEach((key) => {
      delete ipcCallbacks[key];
    });
  });

  it('registers listeners before starting telemetry monitoring and begins in high-accuracy mode', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    expect(ipcMock.send).toHaveBeenCalledWith('start-log-monitoring', { performanceProfile: 'high-accuracy' });
    expect(ipcMock.on).toHaveBeenCalledWith('log-status', expect.any(Function));
    expect(ipcMock.on).toHaveBeenCalledWith('log-data', expect.any(Function));
    expect(ipcMock.on.mock.invocationCallOrder[0]).toBeLessThan(ipcMock.send.mock.invocationCallOrder[0]);
    expect(ipcMock.on.mock.invocationCallOrder[1]).toBeLessThan(ipcMock.send.mock.invocationCallOrder[0]);
  });

  it('uses adaptive polling profiles when adaptive telemetry is enabled', async () => {
    appStoreState.adaptiveTelemetryPollingEnabled = true;

    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    expect(ipcMock.send).toHaveBeenCalledWith('start-log-monitoring', { performanceProfile: 'high-accuracy' });
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

  it('stops telemetry monitoring on unmount', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    const { unmount } = renderHook(() => useLogMonitor('Pilot'));

    unmount();

    expect(ipcMock.send).toHaveBeenCalledWith('stop-log-monitoring');
  });

  it('preserves telemetry-derived loadout state when the game closes', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    gameDataState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: [],
      characterWeapons: ['Scattergun'],
      characterEquipment: ['Shield Matrix'],
      characterPerks: ['Boarder'],
      perks: ['Boarder'],
    };
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-status']?.({ exists: false, size: 0, lastCheck: 1 });
    });

    expect(gameDataState.clearTelemetryDetected).toHaveBeenCalled();
    expect(gameDataState.setCurrentLoadout).not.toHaveBeenCalled();
    expect(gameDataState.setActiveWeapons).not.toHaveBeenCalled();
  });

  it('creates a telemetry draft on map-start signal', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
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
      telemetryDraftState: 'active',
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'telemetry:draft-started' }));
    dispatchSpy.mockRestore();
  });

  it('creates a telemetry draft when loadingMap is only present on the payload envelope', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: {
            event: { traceId: 'map-start-envelope' },
            loadingMap: 'DesolationReach',
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(addMatch).toHaveBeenCalledTimes(1);
  });

  it('treats practice-range map loads as a telemetry lifecycle start and creates a draft', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'PracticeRange_LobbyMap' },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(addMatch).toHaveBeenCalledTimes(1);
    expect(addMatch.mock.calls[0]?.[0]).toMatchObject({
      player: 'Pilot',
      result: 'Ongoing',
      subType: 'Telemetry Draft',
    });
  });

  it('uses the latest active mode when creating telemetry drafts after a mode change', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    const { rerender } = renderHook(() => useLogMonitor('Pilot'));

    uiState.activeMode = 'Fleet Battle';
    rerender();

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(addMatch).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'Fleet Battle',
    }));
  });

  it('skips stale map-start events before they can create telemetry drafts', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    gameDataState.sessionStartTime = Date.now();
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'DesolationReach' },
          ClientTimestamp: Math.floor((Date.now() - 180_000) / 1000),
        },
      ]);
    });

    expect(addMatch).not.toHaveBeenCalled();
    expect(appStoreState.resetSelectionSourcesForNewMatch).not.toHaveBeenCalled();
    expect(processTelemetryEvent).not.toHaveBeenCalled();
  });

  it('clears a stale active-match flag when the next mission start is detected', async () => {
    gameDataState.isMatchInProgress = true;
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

    expect(gameDataState.setIsMatchInProgress).toHaveBeenCalledWith(false);
    expect(gameDataState.setMatchStartTime).toHaveBeenCalledWith(null);
    expect(addMatch).toHaveBeenCalledTimes(1);
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
    expect(appStoreState.resetMatchTrackingForNewMatch).toHaveBeenCalledTimes(1);
    expect(appStoreState.resetMatchMetricsForNewMatch).toHaveBeenCalledTimes(1);
    expect(gameDataState.setActiveHero).toHaveBeenCalledWith('Venture', 'manual');
    expect(gameDataState.setActiveShip).toHaveBeenCalledWith('Scout (3 Player)', 'manual');
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

  it('does not create telemetry draft from a boot-time matchmaker state change alone', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebClientMatchmakerStateChange',
          Payload: {
            sessionId: 'boot-session-id',
            state: 'Searching',
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(addMatch).not.toHaveBeenCalled();
    expect(gameDataState.setIsMatchInProgress).not.toHaveBeenCalledWith(true);
  });

  it('starts lifecycle from a live matchmaker state when the map-start event is missing', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebClientMatchmakerStateChange',
          Payload: {
            sessionId: 'training-session-id',
            state: 'InProgress',
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    expect(addMatch).toHaveBeenCalledTimes(1);
    expect(gameDataState.setIsMatchInProgress).toHaveBeenCalledWith(true);
    expect(gameDataState.setMatchStartTime).toHaveBeenCalled();
    expect(uiState.setOverlayPhase).toHaveBeenCalledWith('Setup');
  });

  it('does not finalize a live telemetry draft when a later event omits sessionId', async () => {
    const baseSec = Math.floor(Date.now() / 1000);
    const { useLogMonitor } = await import('../useLogMonitor');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
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
          EventName: 'NebClientMatchmakerStateChange',
          Payload: { sessionId: 'live-session-id', state: 'InProgress' },
          ClientTimestamp: baseSec + 1,
        },
      ]);
    });

    const updateCountBeforePing = updateMatch.mock.calls.length;

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'TelemetryPing',
          Payload: { event: { some: 'payload' } },
          ClientTimestamp: baseSec + 36,
        },
      ]);
    });

    expect(updateMatch.mock.calls.length).toBe(updateCountBeforePing);
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'telemetry:draft-ready' }));
    dispatchSpy.mockRestore();
  });

  it('finalizes a live telemetry draft when sessionId is explicitly cleared after match start', async () => {
    const baseSec = Math.floor(Date.now() / 1000);
    const { useLogMonitor } = await import('../useLogMonitor');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
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
          EventName: 'NebClientMatchmakerStateChange',
          Payload: { sessionId: 'live-session-id', state: 'InProgress' },
          ClientTimestamp: baseSec + 1,
        },
      ]);
    });

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebClientMatchmakerStateChange',
          Payload: { sessionId: '' },
          ClientTimestamp: baseSec + 90,
        },
      ]);
    });

    const finalizedDraft = updateMatch.mock.calls
      .map(([match]) => match as { time?: string })
      .find((match) => typeof match?.time === 'string');

    expect(finalizedDraft).toBeTruthy();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'telemetry:draft-ready' }));
    dispatchSpy.mockRestore();
  });

  it('finalizes a practice-range telemetry draft when sessionId is explicitly cleared after queue start', async () => {
    const baseSec = Math.floor(Date.now() / 1000);
    const { useLogMonitor } = await import('../useLogMonitor');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'PracticeRange_LobbyMap' },
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
          EventName: 'NebClientMatchmakerStateChange',
          Payload: { sessionId: 'practice-session-id', state: 'InProgress' },
          ClientTimestamp: baseSec + 1,
        },
      ]);
    });

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebClientMatchmakerStateChange',
          Payload: { sessionId: '' },
          ClientTimestamp: baseSec + 90,
        },
      ]);
    });

    const finalizedDraft = updateMatch.mock.calls
      .map(([match]) => match as { time?: string })
      .find((match) => typeof match?.time === 'string');

    expect(finalizedDraft).toBeTruthy();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'telemetry:draft-ready' }));
    dispatchSpy.mockRestore();
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

  it('clears stale telemetry ship detection when carrying the previous loadout into a new match', async () => {
    const { useLogMonitor } = await import('../useLogMonitor');
    gameDataState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: [],
      characterWeapons: [],
      characterEquipment: [],
    };
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

    expect(gameDataState.clearTelemetryDetected).toHaveBeenCalled();
    expect(gameDataState.setActiveHero).toHaveBeenCalledWith('Adrian', 'manual');
    expect(gameDataState.setActiveShip).toHaveBeenCalledWith('Hunter', 'manual');
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
      telemetryDraftState: 'active',
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

  it('does not reuse a finalized telemetry draft when the next match starts', async () => {
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

    const firstDraft = addMatch.mock.calls[0]?.[0] as { id?: number; telemetryDraftState?: string } | undefined;
    expect(firstDraft?.telemetryDraftState).toBe('active');
    appStoreState.matches = firstDraft ? [firstDraft] : [];

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebClientMatchmakerStateChange',
          Payload: { sessionId: 'live-session-id', state: 'InProgress' },
          ClientTimestamp: baseSec + 1,
        },
      ]);
    });

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebClientMatchmakerStateChange',
          Payload: { sessionId: '' },
          ClientTimestamp: baseSec + 90,
        },
      ]);
    });

    const finalizedDraft = updateMatch.mock.calls
      .map(([match]) => match as { id?: number; telemetryDraftState?: string })
      .find((match) => match.id === firstDraft?.id && match.telemetryDraftState === 'ready');
    expect(finalizedDraft).toBeTruthy();
    appStoreState.matches = finalizedDraft ? [{ ...firstDraft, ...finalizedDraft }] : [];

    addMatch.mockClear();

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'MinesOfMatar' },
          ClientTimestamp: baseSec + 180,
        },
      ]);
    });

    expect(addMatch).toHaveBeenCalledTimes(1);
    expect(addMatch.mock.calls[0]?.[0]?.id).not.toBe(firstDraft?.id);
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

  it('sets hero and ship from nested loadout payloads after lifecycle start', async () => {
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

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'CharacterLoadoutChanged',
          Payload: {
            isLocalPlayer: true,
            payload: {
              snapshot: {
                currentLoadout: {
                  hero: 'Venture',
                  ship: 'Scout',
                  characterWeapons: ['The Doctor'],
                  characterEquipment: ['Repair Drone'],
                },
              },
            },
          },
          ClientTimestamp: nowSec + 1,
        },
      ]);
    });

    expect(gameDataState.setActiveHero).toHaveBeenCalledWith('Venture', 'telemetry');
    expect(gameDataState.setActiveShip).toHaveBeenCalledWith('Scout', 'telemetry');
    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      hero?: string | null;
      ship?: string | null;
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.hero).toBe('Venture');
    expect(latestLoadout?.ship).toBe('Scout');
    expect(latestLoadout?.characterWeapons || []).toEqual(expect.arrayContaining(['The Doctor']));
    expect(latestLoadout?.characterEquipment || []).toEqual(expect.arrayContaining(['Repair Drone']));
  });

  it('applies nested practice-range loadout payload variants to hero and ship after queue start', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'PracticeRange_LobbyMap' },
          ClientTimestamp: nowSec,
        },
      ]);
    });

    const createdDraft = addMatch.mock.calls[0]?.[0];
    expect(createdDraft).toBeTruthy();
    appStoreState.matches = [createdDraft];
    gameDataState.setActiveHero.mockClear();
    gameDataState.setActiveShip.mockClear();
    gameDataState.setCurrentLoadout.mockClear();

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebCloudSaveRecordSize',
          Payload: {
            event: {
              isLocalPlayer: true,
            },
            data: {
              recordKey: 'CharacterLoadout_v2',
              selection: {
                snapshot: {
                  prospectorName: 'Venture',
                  selectedShipName: 'Scout',
                  characterWeapons: ['The Doctor'],
                  characterEquipment: ['Repair Drone'],
                },
              },
            },
          },
          ClientTimestamp: nowSec + 1,
        },
      ]);
    });

    expect(gameDataState.setActiveHero).toHaveBeenCalledWith('Venture', 'telemetry');
    expect(gameDataState.setActiveShip).toHaveBeenCalledWith('Scout', 'telemetry');
    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      hero?: string | null;
      ship?: string | null;
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.hero).toBe('Venture');
    expect(latestLoadout?.ship).toBe('Scout');
    expect(latestLoadout?.characterWeapons || []).toEqual(expect.arrayContaining(['The Doctor']));
    expect(latestLoadout?.characterEquipment || []).toEqual(expect.arrayContaining(['Repair Drone']));
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

  it('captures telemetry weapon and equipment GUIDs in current loadout using two-slot parsing', async () => {
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
                guidWeaponSecondary: 'GUID-ROCKET',
                guidEquipmentSecondary: 'GUID-REPULSOR',
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

  it('does not clear prospector loadout when telemetry omits character slot fields', async () => {
    gameDataState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: [],
      characterWeapons: ['Double Whammy'],
      characterEquipment: ['Repair Drone'],
    };
    appStoreState.activeWeapons = {
      'Double Whammy': 1,
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
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.characterWeapons || []).toEqual(['Double Whammy']);
    expect(latestLoadout?.characterEquipment || []).toEqual(['Repair Drone']);

    const latestActiveWeapons = gameDataState.setActiveWeapons.mock.calls.at(-1)?.[0] as Record<string, number>;
    expect(latestActiveWeapons).toMatchObject({
      'Double Whammy': 1,
      'Repair Drone': 1,
    });
  });

  it('drops stale prospector equipment beyond the two-slot limit when telemetry loadout syncs', async () => {
    gameDataState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: ['Shield Matrix'],
      characterWeapons: ['Double Whammy'],
      characterEquipment: ['Repair Drone', 'Repulsor'],
    };
    appStoreState.activeWeapons = {
      'Double Whammy': 1,
      'Repair Drone': 1,
      'Repulsor': 1,
      'Shield Matrix': 1,
      Railgun: 3,
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
            characterWeapons: ['Double Whammy'],
            characterEquipment: ['Repair Drone', 'Repulsor'],
          },
          ClientTimestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    });

    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      equipment?: string[];
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.equipment || []).toEqual(['Shield Matrix']);
    expect(latestLoadout?.characterWeapons || []).toEqual(['Double Whammy']);
    expect(latestLoadout?.characterEquipment || []).toEqual(['Repair Drone', 'Repulsor']);

    const latestActiveWeapons = gameDataState.setActiveWeapons.mock.calls.at(-1)?.[0] as Record<string, number>;
    expect(latestActiveWeapons).toMatchObject({
      'Double Whammy': 1,
      'Repair Drone': 1,
      'Repulsor': 1,
      Railgun: 3,
    });
    expect(latestActiveWeapons['Shield Matrix']).toBeUndefined();
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

  it('skips stale loadout-save events before they can mutate draft or player state', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    gameDataState.sessionStartTime = Date.now();
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
    updateMatch.mockClear();
    processTelemetryEvent.mockClear();
    appStoreState.setPlayerName.mockClear();
    gameDataState.setCurrentLoadout.mockClear();
    gameDataState.updatePlayerIdMapping.mockClear();

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadoutSaved',
          Payload: {
            accountId: 'stale-player-id',
            displayName: 'Stale Pilot',
            event: {
              isLocalPlayer: true,
              bWasSavedInGame: true,
              loadout: {
                hero: 'Venture',
                ship: 'Scout',
                characterWeapons: ['The Doctor'],
              },
            },
          },
          ClientTimestamp: nowSec - 180,
        },
      ]);
    });

    expect(updateMatch).not.toHaveBeenCalled();
    expect(processTelemetryEvent).not.toHaveBeenCalled();
    expect(appStoreState.setPlayerName).not.toHaveBeenCalled();
    expect(gameDataState.updatePlayerIdMapping).not.toHaveBeenCalled();
    expect(gameDataState.setCurrentLoadout).not.toHaveBeenCalled();
  });

  it('accepts loadout events inside the session grace window and rejects older ones', async () => {
    const baseNow = Date.now();
    gameDataState.sessionStartTime = baseNow;
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
            characterWeapons: ['Double Whammy'],
          },
          ClientTimestamp: Math.floor((baseNow - 55_000) / 1000),
        },
      ]);
    });

    expect(gameDataState.setCurrentLoadout).toHaveBeenCalled();

    gameDataState.setCurrentLoadout.mockClear();
    gameDataState.setActiveHero.mockClear();
    gameDataState.setActiveShip.mockClear();

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'CharacterLoadoutChanged',
          Payload: {
            isLocalPlayer: true,
            hero: 'Venture',
            ship: 'Scout',
            characterWeapons: ['The Doctor'],
          },
          ClientTimestamp: Math.floor((baseNow - 75_000) / 1000),
        },
      ]);
    });

    expect(gameDataState.setCurrentLoadout).not.toHaveBeenCalled();
    expect(gameDataState.setActiveHero).not.toHaveBeenCalled();
    expect(gameDataState.setActiveShip).not.toHaveBeenCalled();
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

  it('applies shared ship-selection telemetry from a non-local lobby leader without overwriting the local hero loadout', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    gameDataState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: [],
      characterWeapons: ['Double Whammy'],
      characterEquipment: ['Repair Drone'],
    };

    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebCloudSaveRecordSize',
          context: {
            client: {
              platformAccountId: 'pilot-local-id',
            },
          },
          Payload: {
            recordKey: 'GameModeShipSelection_v2',
            event: {
              actorId: 'lobby-leader-id',
              selection: {
                shipName: 'Scout',
              },
            },
          },
          ClientTimestamp: nowSec,
        },
      ]);
    });

    expect(gameDataState.setActiveShip).toHaveBeenCalledWith('Scout', 'telemetry');
    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      hero?: string | null;
      ship?: string | null;
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.hero).toBe('Adrian');
    expect(latestLoadout?.ship).toBe('Scout');
    expect(latestLoadout?.characterWeapons || []).toEqual(['Double Whammy']);
    expect(latestLoadout?.characterEquipment || []).toEqual(['Repair Drone']);
    expect(gameDataState.setActiveHero).not.toHaveBeenCalled();
  });

  it('applies shared ship-selection telemetry when recordKey is nested below the payload envelope', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    gameDataState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: [],
      characterWeapons: ['Double Whammy'],
      characterEquipment: ['Repair Drone'],
    };

    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebCloudSaveRecordSize',
          Payload: {
            event: {
              actorId: 'lobby-leader-id',
            },
            data: {
              recordKey: 'GameModeShipSelection_v2',
              selection: {
                shipName: 'Scout',
              },
            },
          },
          ClientTimestamp: nowSec,
        },
      ]);
    });

    expect(gameDataState.setActiveShip).toHaveBeenCalledWith('Scout', 'telemetry');
    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      hero?: string | null;
      ship?: string | null;
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.hero).toBe('Adrian');
    expect(latestLoadout?.ship).toBe('Scout');
    expect(latestLoadout?.characterWeapons || []).toEqual(['Double Whammy']);
    expect(latestLoadout?.characterEquipment || []).toEqual(['Repair Drone']);
    expect(gameDataState.setActiveHero).not.toHaveBeenCalled();
  });

  it('ignores weak shared ship-selection labels that are not exact ship names', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    gameDataState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: [],
      characterWeapons: ['Double Whammy'],
      characterEquipment: ['Repair Drone'],
    };

    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));
    gameDataState.setActiveShip.mockClear();
    gameDataState.setCurrentLoadout.mockClear();

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebCloudSaveRecordSize',
          Payload: {
            recordKey: 'GameModeShipSelection_v2',
            event: {
              actorId: 'lobby-leader-id',
              selection: {
                shipName: 'HunterLeaderSlot',
              },
            },
          },
          ClientTimestamp: nowSec,
        },
      ]);
    });

    expect(gameDataState.setActiveShip).not.toHaveBeenCalled();
    expect(gameDataState.setCurrentLoadout).not.toHaveBeenCalled();
  });

  it('does not let weak practice-range placeholder labels overwrite a trusted local loadout', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    gameDataState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: [],
      characterWeapons: ['Double Whammy'],
      characterEquipment: ['Repair Drone'],
    };

    const { useLogMonitor } = await import('../useLogMonitor');
    renderHook(() => useLogMonitor('Pilot'));

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'NebLoadingScreen',
          Payload: { loadingMap: 'PracticeRange_LobbyMap' },
          ClientTimestamp: nowSec,
        },
      ]);
    });

    gameDataState.setActiveHero.mockClear();
    gameDataState.setActiveShip.mockClear();
    gameDataState.setCurrentLoadout.mockClear();

    act(() => {
      ipcCallbacks['log-data']?.([
        {
          EventName: 'CharacterLoadoutChanged',
          Payload: {
            isLocalPlayer: true,
            selection: {
              snapshot: {
                prospectorName: 'Unknown Prospector',
                selectedShipName: 'HunterLeaderSlot',
                characterWeapons: ['The Doctor'],
                characterEquipment: ['Repair Drone'],
              },
            },
          },
          ClientTimestamp: nowSec + 1,
        },
      ]);
    });

    expect(gameDataState.setActiveHero).not.toHaveBeenCalled();
    expect(gameDataState.setActiveShip).not.toHaveBeenCalled();
    const latestLoadout = gameDataState.setCurrentLoadout.mock.calls.at(-1)?.[0] as {
      hero?: string | null;
      ship?: string | null;
      characterWeapons?: string[];
      characterEquipment?: string[];
    };
    expect(latestLoadout?.hero).toBe('Adrian');
    expect(latestLoadout?.ship).toBe('Hunter');
    expect(latestLoadout?.characterWeapons || []).toEqual(expect.arrayContaining(['The Doctor']));
    expect(latestLoadout?.characterEquipment || []).toEqual(expect.arrayContaining(['Repair Drone']));
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
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
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
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'telemetry:draft-ready' }));
    dispatchSpy.mockRestore();
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
