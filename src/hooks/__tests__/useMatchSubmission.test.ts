import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMatchSubmission } from '../useMatchSubmission';
import { bundleMatchArtifacts, getMatchArtifactsStructured } from '../../utils/artifactService';

const setToast = vi.fn();
const setShowWizard = vi.fn();
const setPendingMatchData = vi.fn();
const setIsMatchInProgress = vi.fn();
const setMatchStartTime = vi.fn();
const addMatch = vi.fn();
const updateMatch = vi.fn();
const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => ({
    addMatch,
    setPendingMatchData,
    setPendingPlacement: vi.fn(),
    setPendingArtifactType: vi.fn(),
    setPendingKilledBy: vi.fn(),
    setPendingKilledByShip: vi.fn(),
    setSelectedTeammates: vi.fn(),
    setSelectedOpponents: vi.fn(),
    setTimeMin: vi.fn(),
    setTimeSec: vi.fn(),
    setDamageTaken: vi.fn(),
    setPoiEasy: vi.fn(),
    setPoiMedium: vi.fn(),
    setPoiEpic: vi.fn(),
    setCurrentNote: vi.fn(),
    setActiveWeapons: vi.fn(),
    setSelectedReachModifiers: vi.fn(),
    setKills: vi.fn(),
    setMatchStartTime,
    setIsMatchInProgress,
    updateMatch,
    recordPlayerSighting: vi.fn(),
    setTimelineEvents: vi.fn(),
    setSessionTeams: vi.fn(),
  }),
}));

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => ({
    setToast,
    setShowWizard,
  }),
}));

const mockStoreState: Record<string, any> = {
  activeUser: null,
  activeMode: 'Artifact Brawl',
  selectedTeammates: [],
  selectedOpponents: [],
  activeHero: 'Adrian',
  activeShip: 'Hunter',
  activeWeapons: {},
  currentLoadout: null,
  selectedReachModifiers: [],
  kills: {},
  timeMin: '',
  timeSec: '',
  isMatchInProgress: false,
  matchStartTime: null,
  damageTaken: '',
  currentNote: '',
  poiEasy: 0,
  poiMedium: 0,
  poiEpic: 0,
  pendingMatchData: null,
  showWizard: null,
  pendingPlacement: null,
  pendingArtifactType: '',
  pendingKilledBy: '',
  pendingKilledByShip: '',
  timelineEvents: [],
  sessionTeams: {},
  sessionShipTypes: {},
  matches: [],
  sessionStartTime: 1_700_000_000_000,
};

vi.mock('../../store/useAppStore', () => {
  const useAppStore = (selector: (s: any) => any) => selector(mockStoreState);
  useAppStore.getState = () => mockStoreState;
  return { useAppStore };
});

vi.mock('../../hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({
    playVictory: vi.fn(),
    playDefeat: vi.fn(),
  }),
}));

vi.mock('../../utils/artifactService', () => ({
  bundleMatchArtifacts: vi.fn().mockResolvedValue([]),
  getMatchArtifactsStructured: vi.fn().mockResolvedValue({ images: [], imageFiles: [], telemetry: [] }),
}));

vi.mock('../../utils/storage', () => ({
  StorageService: { flush: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

describe('useMatchSubmission', () => {
  beforeEach(() => {
    setToast.mockClear();
    setShowWizard.mockClear();
    setPendingMatchData.mockClear();
    addMatch.mockClear();
    updateMatch.mockClear();
    dispatchEventSpy.mockClear();
    Object.assign(mockStoreState, {
      activeUser: null,
      activeMode: 'Artifact Brawl',
      selectedTeammates: [],
      selectedOpponents: [],
      activeHero: 'Adrian',
      activeShip: 'Hunter',
      activeWeapons: {},
      currentLoadout: null,
      selectedReachModifiers: [],
      kills: {},
      timeMin: '',
      timeSec: '',
      isMatchInProgress: false,
      matchStartTime: null,
      damageTaken: '',
      currentNote: '',
      poiEasy: 0,
      poiMedium: 0,
      poiEpic: 0,
      pendingMatchData: null,
      showWizard: null,
      pendingPlacement: null,
      pendingArtifactType: '',
      pendingKilledBy: '',
      pendingKilledByShip: '',
      timelineEvents: [],
      sessionTeams: {},
      sessionShipTypes: {},
      matches: [],
      sessionStartTime: 1_700_000_000_000,
    });
    vi.mocked(bundleMatchArtifacts).mockReset();
    vi.mocked(bundleMatchArtifacts).mockResolvedValue([]);
    vi.mocked(getMatchArtifactsStructured).mockReset();
    vi.mocked(getMatchArtifactsStructured).mockResolvedValue({ images: [], imageFiles: [], telemetry: [] });
  });

  it('returns initiateSubmission, processFinalSubmission, and submitting', () => {
    const { result } = renderHook(() => useMatchSubmission());
    expect(result.current).toHaveProperty('initiateSubmission');
    expect(result.current).toHaveProperty('processFinalSubmission');
    expect(result.current).toHaveProperty('submitting');
    expect(typeof result.current.initiateSubmission).toBe('function');
    expect(typeof result.current.processFinalSubmission).toBe('function');
    expect(result.current.submitting).toBe(false);
  });

  it('initiateSubmission with no activeUser shows warning and still opens wizard', () => {
    mockStoreState.activeUser = null;

    const { result } = renderHook(() => useMatchSubmission());

    act(() => {
      result.current.initiateSubmission('Win');
    });

    expect(setToast).toHaveBeenCalledWith({ message: 'No profile selected. You can review now and pick one before finalizing.', type: 'warning' });
    expect(setShowWizard).toHaveBeenCalledWith('Win');
  });

  it('initiateSubmission reuses unresolved telemetry draft for pending match data', () => {
    const now = 1_700_000_100_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    mockStoreState.activeUser = 'Tester';
    mockStoreState.matches = [{
      id: 2468,
      timestamp: now - 30_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: ['Wing1'],
      opponents: ['Enemy1'],
      hero: 'Adrian',
      ship: 'Hunter',
      loadout: {
        hero: 'Adrian',
        ship: 'Hunter',
        weapons: ['Pulse'],
        equipment: ['Shield'],
      },
      reachModifiers: ['Ionized'],
      kills: { 'AI Legion': 2 },
      result: 'Draw',
      subType: 'Telemetry Draft',
      time: '09:12',
      notes: 'draft',
      artifacts: ['draft.png'],
      ocrState: 'queued',
    }];
    mockStoreState.selectedTeammates = [];
    mockStoreState.selectedOpponents = [];
    mockStoreState.selectedReachModifiers = [];
    mockStoreState.kills = {};
    mockStoreState.timeMin = '';
    mockStoreState.timeSec = '';
    mockStoreState.sessionStartTime = now - 120_000;

    const { result } = renderHook(() => useMatchSubmission());

    act(() => {
      result.current.initiateSubmission('Win');
    });

    const pendingArg = setPendingMatchData.mock.calls[0][0];
    expect(pendingArg.id).toBe(2468);
    expect(pendingArg.player).toBe('Tester');
    expect(pendingArg.time).toBe('09:12');
    expect(setShowWizard).toHaveBeenCalledWith('Win');
    nowSpy.mockRestore();
  });

  it('processFinalSubmission with no pendingMatchData does not call addMatch', async () => {
    mockStoreState.pendingMatchData = null;
    mockStoreState.showWizard = 'Win';

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    expect(addMatch).not.toHaveBeenCalled();
  });

  it('uses a 10-minute fallback artifact window when timer context is missing', async () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingMatchData = {
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      kills: {},
      reachModifiers: [],
    };
    mockStoreState.showWizard = 'Win';
    mockStoreState.timeMin = '';
    mockStoreState.timeSec = '';
    mockStoreState.matchStartTime = null;

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(bundleMatchArtifacts).toHaveBeenCalled();
    const args = vi.mocked(bundleMatchArtifacts).mock.calls[0];
    expect(args[1]).toBe(now - 600000);
    expect(args[2]).toBe(now);
    nowSpy.mockRestore();
  });

  it('uses pending match duration for artifact window when timer fields are empty', async () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingMatchData = {
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      kills: {},
      reachModifiers: [],
      time: '25:30',
    };
    mockStoreState.showWizard = 'Win';
    mockStoreState.timeMin = '';
    mockStoreState.timeSec = '';
    mockStoreState.matchStartTime = null;

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(bundleMatchArtifacts).toHaveBeenCalled();
    const args = vi.mocked(bundleMatchArtifacts).mock.calls[0];
    expect(args[1]).toBe(now - ((25 * 60 + 30) * 1000));
    expect(args[2]).toBe(now);
    nowSpy.mockRestore();
  });

  it('prefers explicit matchStartTime over fallback window', async () => {
    const now = 1_700_000_000_000;
    const explicitStart = now - 123000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingMatchData = {
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      kills: {},
      reachModifiers: [],
    };
    mockStoreState.showWizard = 'Win';
    mockStoreState.matchStartTime = explicitStart;
    mockStoreState.timeMin = '';
    mockStoreState.timeSec = '';

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(bundleMatchArtifacts).toHaveBeenCalled();
    const args = vi.mocked(bundleMatchArtifacts).mock.calls[0];
    expect(args[1]).toBe(explicitStart);
    expect(args[2]).toBe(now);
    nowSpy.mockRestore();
  });

  it('publishes match complete event and success toast with result label', async () => {
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingMatchData = {
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      kills: {},
      reachModifiers: [],
    };
    mockStoreState.showWizard = 'Win';
    mockStoreState.timeMin = '08';
    mockStoreState.timeSec = '12';

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    expect(setToast).toHaveBeenCalledWith({ message: 'Match recorded: Win', type: 'success' });
    const matchCompleteEvent = dispatchEventSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'recording:match-complete') as CustomEvent | undefined;
    expect(matchCompleteEvent).toBeDefined();
    expect(matchCompleteEvent?.detail).toEqual({ result: 'Win' });
  });

  it('updates an existing telemetry draft match instead of adding a duplicate', async () => {
    const draftId = 987654;
    mockStoreState.activeUser = 'Tester';
    mockStoreState.matches = [{
      id: draftId,
      timestamp: 1_700_000_000_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: { 'AI Legion': 0 },
      result: 'Draw',
      subType: 'Telemetry Draft',
      artifacts: ['old.png'],
      ocrState: 'queued',
    }];
    mockStoreState.pendingMatchData = {
      id: draftId,
      timestamp: 1_700_000_000_000,
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      kills: { 'AI Legion': 1 },
      reachModifiers: [],
      artifacts: ['old.png'],
      ocrState: 'queued',
      time: '12:00',
    };
    mockStoreState.showWizard = 'Win';
    mockStoreState.timeMin = '';
    mockStoreState.timeSec = '';

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    expect(addMatch).not.toHaveBeenCalled();
    expect(updateMatch).toHaveBeenCalled();
    const [updatedMatch] = updateMatch.mock.calls[0];
    expect(updatedMatch.id).toBe(draftId);
    expect(updatedMatch.result).toBe('Win');
    expect(updatedMatch.subType).toBe('Combat');
  });

  it('syncs on-disk match artifacts even when bundling finds none', async () => {
    const diskArtifact = 'C:\\Users\\Tester\\AppData\\Roaming\\wildgate\\match_artifacts\\555\\capture_1.png';
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingMatchData = {
      id: 555,
      timestamp: 1_700_000_000_000,
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      kills: {},
      reachModifiers: [],
      artifacts: [],
      time: '10:00',
    };
    mockStoreState.showWizard = 'Win';
    mockStoreState.matches = [{
      id: 555,
      timestamp: 1_700_000_000_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: { 'AI Legion': 0 },
      result: 'Draw',
      subType: 'Telemetry Draft',
      artifacts: [],
      ocrState: 'queued',
    }];
    vi.mocked(bundleMatchArtifacts).mockResolvedValue([]);
    vi.mocked(getMatchArtifactsStructured).mockResolvedValue({
      images: [diskArtifact],
      imageFiles: [],
      telemetry: [],
    });

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    const updatedWithArtifact = updateMatch.mock.calls
      .map(([match]) => match)
      .find((match) => Array.isArray(match?.artifacts) && match.artifacts.includes(diskArtifact));

    expect(updatedWithArtifact).toBeDefined();
    expect(bundleMatchArtifacts).toHaveBeenCalled();
    expect(getMatchArtifactsStructured).toHaveBeenCalledWith(555);
  });

  it('defaults placement to first when submitting a win without explicit placement', async () => {
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingPlacement = null;
    mockStoreState.pendingMatchData = {
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      kills: {},
      reachModifiers: [],
      time: '08:00',
    };
    mockStoreState.showWizard = 'Win';

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    expect(addMatch).toHaveBeenCalled();
    const [submitted] = addMatch.mock.calls[0];
    expect(submitted.placement).toBe(1);
  });
});
