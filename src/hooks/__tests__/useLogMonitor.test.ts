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
  uidMappings: { players: {}, ships: {}, weapons: {}, equipment: {} },
  registerUnknownId: vi.fn(),
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
    ipcMock.send.mockClear();
    ipcMock.on.mockClear();
    gameDataState.sessionStartTime = Date.now() - 5_000;
    gameDataState.isMatchInProgress = false;
    appStoreState.matches = [];
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
});
