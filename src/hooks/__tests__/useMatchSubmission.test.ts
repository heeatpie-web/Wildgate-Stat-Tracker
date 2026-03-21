import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMatchSubmission } from '../useMatchSubmission';
import { applyArtifactRepair, bundleMatchArtifacts, getMatchArtifactsStructured, removeAllMatchArtifacts } from '../../utils/artifactService';
import { StorageService } from '../../utils/storage';

const setToast = vi.fn();
const setShowWizard = vi.fn();
const setPendingMatchData = vi.fn();
const setPendingPlacement = vi.fn();
const setPendingArtifactType = vi.fn();
const setPendingKilledBy = vi.fn();
const setPendingKilledByShip = vi.fn();
const setSelectedTeammates = vi.fn();
const setSelectedOpponents = vi.fn();
const setSessionShipTypes = vi.fn();
const setTimeMin = vi.fn();
const setTimeSec = vi.fn();
const setDamageTaken = vi.fn();
const setPoiEasy = vi.fn();
const setPoiMedium = vi.fn();
const setPoiEpic = vi.fn();
const setCurrentNote = vi.fn();
const setActiveWeapons = vi.fn();
const setSelectedReachModifiers = vi.fn();
const setKills = vi.fn();
const setIsMatchInProgress = vi.fn();
const setMatchStartTime = vi.fn();
const setTimelineEvents = vi.fn();
const setSessionTeams = vi.fn();
const setCurrentLoadout = vi.fn();
const addMatch = vi.fn();
const deleteMatch = vi.fn();
const updateMatch = vi.fn();
const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
const electronInvokeMock = vi.fn();

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => ({
    addMatch,
    deleteMatch,
    setPendingMatchData,
    setPendingPlacement,
    setPendingArtifactType,
    setPendingKilledBy,
    setPendingKilledByShip,
    setSelectedTeammates,
    setSelectedOpponents,
    setSessionShipTypes,
    setTimeMin,
    setTimeSec,
    setDamageTaken,
    setPoiEasy,
    setPoiMedium,
    setPoiEpic,
    setCurrentNote,
    setActiveWeapons,
    setSelectedReachModifiers,
    setKills,
    setMatchStartTime,
    setIsMatchInProgress,
    updateMatch,
    recordPlayerSighting: vi.fn(),
    setTimelineEvents,
    setSessionTeams,
    setCurrentLoadout,
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
  discardMatch: vi.fn(),
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
  applyArtifactRepair: vi.fn().mockResolvedValue({ summary: { mode: 'apply', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0, appliedLinks: 0, updatedMatches: 0 }, candidates: [], applied: [] }),
  bundleMatchArtifacts: vi.fn().mockResolvedValue([]),
  getMatchArtifactsStructured: vi.fn().mockResolvedValue({ images: [], imageFiles: [], telemetry: [] }),
  removeAllMatchArtifacts: vi.fn().mockResolvedValue({ removedPaths: [], failedPaths: [] }),
}));

vi.mock('../../utils/storage', () => ({
  StorageService: { flush: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../utils/electronAPI', () => ({
  getElectronAPI: () => ({
    invoke: (...args: unknown[]) => electronInvokeMock(...args),
    send: vi.fn(),
    on: vi.fn(() => () => {}),
    removeAllListeners: vi.fn(),
  }),
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

describe('useMatchSubmission', () => {
  beforeEach(() => {
    setToast.mockClear();
    setShowWizard.mockClear();
    setPendingMatchData.mockClear();
    setPendingPlacement.mockClear();
    setPendingArtifactType.mockClear();
    setPendingKilledBy.mockClear();
    setPendingKilledByShip.mockClear();
    setSelectedTeammates.mockClear();
    setSelectedOpponents.mockClear();
    setSessionShipTypes.mockClear();
    setTimeMin.mockClear();
    setTimeSec.mockClear();
    setDamageTaken.mockClear();
    setPoiEasy.mockClear();
    setPoiMedium.mockClear();
    setPoiEpic.mockClear();
    setCurrentNote.mockClear();
    setActiveWeapons.mockClear();
    setSelectedReachModifiers.mockClear();
    setKills.mockClear();
    setMatchStartTime.mockClear();
    setIsMatchInProgress.mockClear();
    setTimelineEvents.mockClear();
    setSessionTeams.mockClear();
    setCurrentLoadout.mockClear();
    addMatch.mockClear();
    deleteMatch.mockClear();
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
    mockStoreState.discardMatch.mockClear();
    vi.mocked(bundleMatchArtifacts).mockReset();
    vi.mocked(bundleMatchArtifacts).mockResolvedValue([]);
    vi.mocked(applyArtifactRepair).mockReset();
    vi.mocked(applyArtifactRepair).mockResolvedValue({ summary: { mode: 'apply', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0, appliedLinks: 0, updatedMatches: 0 }, candidates: [], applied: [] });
    vi.mocked(getMatchArtifactsStructured).mockReset();
    vi.mocked(getMatchArtifactsStructured).mockResolvedValue({ images: [], imageFiles: [], telemetry: [] });
    vi.mocked(removeAllMatchArtifacts).mockReset();
    vi.mocked(removeAllMatchArtifacts).mockResolvedValue({ removedPaths: [], failedPaths: [] });
    vi.mocked(StorageService.flush).mockClear();
    electronInvokeMock.mockReset();
    electronInvokeMock.mockResolvedValue({ success: true, data: { filePath: 'C:\\match_artifacts\\999\\capture_result.png' } });
  });

  it('returns initiateSubmission, processFinalSubmission, and submitting', () => {
    const { result } = renderHook(() => useMatchSubmission());
    expect(result.current).toHaveProperty('initiateSubmission');
    expect(result.current).toHaveProperty('processFinalSubmission');
    expect(result.current).toHaveProperty('saveResultDraft');
    expect(result.current).toHaveProperty('autoFinalizeResultScreenCapture');
    expect(result.current).toHaveProperty('discardCurrentMatch');
    expect(result.current).toHaveProperty('discardTelemetryDraft');
    expect(result.current).toHaveProperty('submitting');
    expect(typeof result.current.initiateSubmission).toBe('function');
    expect(typeof result.current.processFinalSubmission).toBe('function');
    expect(typeof result.current.saveResultDraft).toBe('function');
    expect(typeof result.current.autoFinalizeResultScreenCapture).toBe('function');
    expect(typeof result.current.discardCurrentMatch).toBe('function');
    expect(typeof result.current.discardTelemetryDraft).toBe('function');
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

  it('initiateSubmission reopens a ready telemetry draft for pending match data', () => {
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
      telemetryDraftState: 'ready',
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

  it('warns when entered teammate count mismatches telemetry expectation', () => {
    const now = 1_700_000_100_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    mockStoreState.activeUser = 'Tester';
    mockStoreState.selectedTeammates = ['Wing1'];
    mockStoreState.matches = [{
      id: 1111,
      timestamp: now - 10_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: ['Wing1'],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      time: '10:00',
      telemetryConsistency: {
        expectedTeammateCount: 3,
        expectedMode: 'Artifact Brawl',
        telemetryDurationSeconds: 600,
      },
    }];

    const { result } = renderHook(() => useMatchSubmission());

    act(() => {
      result.current.initiateSubmission('Win');
    });

    expect(setToast.mock.calls.some(([toast]) =>
      typeof toast?.message === 'string' && toast.message.includes('team count mismatch')
    )).toBe(true);
    nowSpy.mockRestore();
  });

  it('warns when entered duration mismatches telemetry duration', () => {
    const now = 1_700_000_200_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    mockStoreState.activeUser = 'Tester';
    mockStoreState.timeMin = '04';
    mockStoreState.timeSec = '00';
    mockStoreState.selectedTeammates = ['Wing1'];
    mockStoreState.matches = [{
      id: 2222,
      timestamp: now - 10_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: ['Wing1'],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      time: '04:00',
      telemetryConsistency: {
        expectedTeammateCount: 1,
        expectedMode: 'Artifact Brawl',
        telemetryDurationSeconds: 600,
        durationToleranceSeconds: 45,
      },
    }];

    const { result } = renderHook(() => useMatchSubmission());

    act(() => {
      result.current.initiateSubmission('Win');
    });

    expect(setToast.mock.calls.some(([toast]) =>
      typeof toast?.message === 'string' && toast.message.includes('duration off by')
    )).toBe(true);
    nowSpy.mockRestore();
  });

  it('warns when entered mode mismatches telemetry-inferred mode', () => {
    const now = 1_700_000_300_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    mockStoreState.activeUser = 'Tester';
    mockStoreState.activeMode = 'Artifact Brawl';
    mockStoreState.selectedTeammates = ['Wing1'];
    mockStoreState.matches = [{
      id: 3333,
      timestamp: now - 10_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: ['Wing1'],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      time: '08:00',
      telemetryConsistency: {
        expectedTeammateCount: 1,
        expectedMode: 'Fleet Battle',
        telemetryDurationSeconds: 480,
      },
    }];

    const { result } = renderHook(() => useMatchSubmission());

    act(() => {
      result.current.initiateSubmission('Win');
    });

    expect(setToast.mock.calls.some(([toast]) =>
      typeof toast?.message === 'string' && toast.message.includes('mode mismatch')
    )).toBe(true);
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

  it('persists evaluated telemetry consistency checks on final submission payload', async () => {
    mockStoreState.activeUser = 'Tester';
    mockStoreState.selectedTeammates = ['Wing1'];
    mockStoreState.timeMin = '04';
    mockStoreState.timeSec = '00';
    mockStoreState.pendingMatchData = {
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: ['Wing1'],
      opponents: [],
      kills: {},
      reachModifiers: [],
      telemetryConsistency: {
        expectedTeammateCount: 3,
        expectedMode: 'Fleet Battle',
        telemetryDurationSeconds: 600,
        durationToleranceSeconds: 45,
      },
    };
    mockStoreState.showWizard = 'Win';

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    expect(addMatch).toHaveBeenCalled();
    const [submitted] = addMatch.mock.calls[0];
    expect(submitted.telemetryConsistency?.checks).toEqual({
      teammateCount: 'warn',
      mode: 'warn',
      duration: 'warn',
    });
    expect(submitted.telemetryConsistency?.durationDeltaSeconds).toBe(360);
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
    expect(matchCompleteEvent?.detail).toEqual(expect.objectContaining({ result: 'Win' }));
  });

  it('preserves the cached telemetry loadout after final submission for the next match reseed', async () => {
    mockStoreState.activeUser = 'Tester';
    mockStoreState.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: ['Pulse'],
      equipment: ['Shield'],
      characterWeapons: ['Voltaic Pistol'],
      characterEquipment: ['Pulse Scanner'],
      characterPerks: ['Quick Hands'],
    };
    mockStoreState.pendingMatchData = {
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      kills: {},
      reachModifiers: [],
    };
    mockStoreState.showWizard = 'Win';
    mockStoreState.timeMin = '06';
    mockStoreState.timeSec = '10';

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    expect(addMatch).toHaveBeenCalled();
    expect(setCurrentLoadout).not.toHaveBeenCalled();
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

  it('reuses the matching telemetry draft by timestamp when pendingMatchData has no id', async () => {
    const draftId = 43210;
    const draftTimestamp = 1_700_000_222_000;
    mockStoreState.activeUser = 'Tester';
    mockStoreState.matches = [{
      id: draftId,
      timestamp: draftTimestamp,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: { 'AI Legion': 0 },
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      artifacts: ['existing.png'],
      ocrState: 'queued',
    }];
    mockStoreState.pendingMatchData = {
      timestamp: draftTimestamp,
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      kills: { 'AI Legion': 1 },
      reachModifiers: [],
      artifacts: ['pending.png'],
      ocrState: 'reviewing',
      time: '11:00',
    };
    mockStoreState.showWizard = 'Win';

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    expect(addMatch).not.toHaveBeenCalled();
    expect(updateMatch).toHaveBeenCalled();
    const [updatedMatch] = updateMatch.mock.calls[0];
    expect(updatedMatch.id).toBe(draftId);
    expect(updatedMatch.artifacts).toEqual(['existing.png', 'pending.png']);
    const resolvedEvent = dispatchEventSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'telemetry-draft:resolved') as CustomEvent | undefined;
    expect(resolvedEvent?.detail).toEqual({ matchId: draftId });
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
    expect(getMatchArtifactsStructured).toHaveBeenCalledWith(555, expect.any(Array));
  });


  it('dispatches artifact consumption after final submission saves the match', async () => {
    const rawCapture = 'C:\\screenshots\\capture_2026-03-08T10-00-00-000Z.png';
    const bundledCapture = 'C:\\match_artifacts\\555\\capture_2026-03-08T10-00-00-000Z.png';
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
      artifacts: [rawCapture],
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
    vi.mocked(bundleMatchArtifacts).mockResolvedValue([bundledCapture]);
    vi.mocked(getMatchArtifactsStructured).mockResolvedValue({
      images: [bundledCapture],
      imageFiles: [],
      telemetry: [],
      missingImages: [rawCapture],
      resolvedFromDisk: true,
    } as any);

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    const consumedEvent = dispatchEventSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'smart-capture:artifacts-consumed') as CustomEvent | undefined;
    expect(consumedEvent?.detail).toEqual({
      matchId: 555,
      artifactPaths: [rawCapture, bundledCapture],
    });
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

  it('persists eliminatedByTeam for loss submissions', async () => {
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingPlacement = 2;
    mockStoreState.pendingMatchData = {
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      kills: {},
      reachModifiers: [],
      eliminatedByTeam: 'red',
      time: '08:00',
    };
    mockStoreState.showWizard = 'Loss';

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    expect(addMatch).toHaveBeenCalled();
    const [submitted] = addMatch.mock.calls[0];
    expect(submitted.result).toBe('Loss');
    expect(submitted.eliminatedByTeam).toBe('red');
  });

  it('persists reviewed OCR state when finalizing a match', async () => {
    mockStoreState.activeUser = 'Tester';
    mockStoreState.showWizard = 'Win';
    mockStoreState.pendingMatchData = {
      id: 223,
      timestamp: 1_700_000_000_000,
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: ['EnemyOne'],
      hero: 'Adrian',
      ship: 'Hunter',
      kills: {},
      reachModifiers: [],
      result: 'Win',
      time: '06:30',
      ocrState: 'ready',
      ocrReviewedAt: 1_700_000_123_000,
    };
    mockStoreState.matches = [{
      id: 223,
      timestamp: 1_700_000_000_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: ['EnemyOne'],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      ocrState: 'reviewing',
    }];

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.processFinalSubmission('Combat');
    });

    expect(updateMatch).toHaveBeenCalled();
    const [submitted] = updateMatch.mock.calls[0];
    expect(submitted.ocrState).toBe('saved');
    expect(submitted.ocrReviewedAt).toBe(1_700_000_123_000);
  });

  it('saveResultDraft uses pending draft result precedence and skips artifact bundling', async () => {
    mockStoreState.activeUser = 'Tester';
    mockStoreState.showWizard = 'Loss';
    mockStoreState.pendingMatchData = {
      id: 222,
      timestamp: 1_700_000_000_000,
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      kills: {},
      reachModifiers: [],
      result: 'Win',
      time: '06:30',
      artifacts: ['capture.png'],
      ocrState: 'reviewing',
    };
    mockStoreState.matches = [{
      id: 222,
      timestamp: 1_700_000_000_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      artifacts: ['capture.png'],
      ocrState: 'reviewing',
    }];

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.saveResultDraft('Artifact');
    });

    expect(updateMatch).toHaveBeenCalled();
    const [savedMatch] = updateMatch.mock.calls[0];
    expect(savedMatch.result).toBe('Win');
    expect(savedMatch.subType).toBe('Artifact');
    expect(savedMatch.ocrState).toBe('reviewing');
    expect(bundleMatchArtifacts).not.toHaveBeenCalled();
    expect(mockStoreState.discardMatch).toHaveBeenCalledTimes(1);
    expect(setSelectedTeammates).not.toHaveBeenCalled();
    expect(setSelectedOpponents).not.toHaveBeenCalled();
    expect(setSessionTeams).toHaveBeenCalledWith({});
    expect(setSessionShipTypes).toHaveBeenCalledWith({}, 'manual');
    expect(setToast).toHaveBeenCalledWith({ message: 'Results saved. You can return to OCR later.', type: 'success' });
  });

  it('saveResultDraft reuses timestamp-matched telemetry draft and unions artifacts', async () => {
    const draftId = 76543;
    const draftTimestamp = 1_700_000_333_000;
    mockStoreState.activeUser = 'Tester';
    mockStoreState.showWizard = 'Loss';
    mockStoreState.pendingMatchData = {
      timestamp: draftTimestamp,
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      kills: {},
      reachModifiers: [],
      result: 'Win',
      time: '06:30',
      artifacts: ['pending.png'],
      ocrState: 'reviewing',
    };
    mockStoreState.matches = [{
      id: draftId,
      timestamp: draftTimestamp,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      artifacts: ['existing.png'],
      ocrState: 'queued',
    }];

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.saveResultDraft('Artifact');
    });

    expect(addMatch).not.toHaveBeenCalled();
    expect(updateMatch).toHaveBeenCalled();
    const [savedMatch] = updateMatch.mock.calls[0];
    expect(savedMatch.id).toBe(draftId);
    expect(savedMatch.artifacts).toEqual(['existing.png', 'pending.png']);
    const resolvedEvent = dispatchEventSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'telemetry-draft:resolved') as CustomEvent | undefined;
    expect(resolvedEvent?.detail).toEqual({ matchId: draftId });
  });

  it('autoFinalizeResultScreenCapture refuses incomplete combat losses', async () => {
    const { result } = renderHook(() => useMatchSubmission());

    let finalized;
    await act(async () => {
      finalized = await result.current.autoFinalizeResultScreenCapture({
        imageBase64: 'data:image/png;base64,ZmFrZQ==',
        resultData: { result: 'Loss', winType: 'combat', placement: null },
      });
    });

    expect(finalized).toEqual({ success: false, reason: 'incomplete' });
    expect(addMatch).not.toHaveBeenCalled();
    expect(updateMatch).not.toHaveBeenCalled();
    expect(electronInvokeMock).not.toHaveBeenCalled();
  });

  it('autoFinalizeResultScreenCapture requires an active telemetry draft', async () => {
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingMatchData = {
      timestamp: 1_700_000_555_000,
      player: 'Tester',
      mode: 'Artifact Brawl',
    };

    const { result } = renderHook(() => useMatchSubmission());

    let finalized;
    await act(async () => {
      finalized = await result.current.autoFinalizeResultScreenCapture({
        imageBase64: 'data:image/png;base64,ZmFrZQ==',
        resultData: { result: 'Win', winType: 'artifact', placement: 1 },
      });
    });

    expect(finalized).toEqual({ success: false, reason: 'no-draft' });
    expect(addMatch).not.toHaveBeenCalled();
    expect(updateMatch).not.toHaveBeenCalled();
    expect(electronInvokeMock).not.toHaveBeenCalled();
  });

  it('autoFinalizeResultScreenCapture updates the active telemetry draft and attaches the screenshot', async () => {
    const draftId = 9090;
    const draftTimestamp = 1_700_000_666_000;
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingMatchData = {
      timestamp: draftTimestamp,
      player: 'Tester',
      mode: 'Artifact Brawl',
      teammates: ['Teammate One'],
      artifacts: ['existing_capture.png'],
      ocrState: 'reviewing',
      damageTaken: 22,
    };
    mockStoreState.damageTaken = '48';
    mockStoreState.matches = [{
      id: draftId,
      timestamp: draftTimestamp,
      date: '3/19/2026',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: ['Teammate One'],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      damageTaken: 12,
      time: '00:00',
      notes: '',
      artifacts: ['existing_capture.png'],
      telemetryDraftState: 'ready',
      ocrState: 'queued',
    }];
    vi.mocked(getMatchArtifactsStructured).mockResolvedValue({
      images: ['existing_capture.png', 'C:\\match_artifacts\\9090\\capture_result.png'],
      imageFiles: [],
      telemetry: [],
    });
    electronInvokeMock.mockResolvedValue({
      success: true,
      data: { filePath: 'C:\\match_artifacts\\9090\\capture_result.png' },
    });

    const { result } = renderHook(() => useMatchSubmission());

    let finalized;
    await act(async () => {
      finalized = await result.current.autoFinalizeResultScreenCapture({
        imageBase64: 'data:image/png;base64,ZmFrZQ==',
        resultData: {
          result: 'Loss',
          winType: 'combat',
          placement: 2,
          damageTaken: 114,
        },
      });
    });

    expect(finalized).toEqual({
      success: true,
      matchId: draftId,
      artifactPath: 'C:\\match_artifacts\\9090\\capture_result.png',
      artifactPaths: ['C:\\match_artifacts\\9090\\capture_result.png'],
    });
    expect(addMatch).not.toHaveBeenCalled();
    expect(electronInvokeMock).toHaveBeenCalledWith('save-screenshot', {
      imageBase64: 'ZmFrZQ==',
      matchId: draftId,
    });
    expect(updateMatch).toHaveBeenCalled();
    const [updatedMatch] = updateMatch.mock.calls[0];
    expect(updatedMatch.id).toBe(draftId);
    expect(updatedMatch.result).toBe('Loss');
    expect(updatedMatch.subType).toBe('Combat');
    expect(updatedMatch.placement).toBe(2);
    expect(updatedMatch.damageTaken).toBe(114);
    expect(updatedMatch.resultDetectionMethod).toBeUndefined();
    expect(updatedMatch.artifacts).toEqual([
      'existing_capture.png',
      'C:\\match_artifacts\\9090\\capture_result.png',
    ]);
    const resolvedEvent = dispatchEventSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'telemetry-draft:resolved') as CustomEvent | undefined;
    expect(resolvedEvent?.detail).toEqual({ matchId: draftId });
  });

  it('autoFinalizeResultScreenCapture honors an explicit active telemetry draft id', async () => {
    const activeDraftId = 9191;
    const activeDraftTimestamp = 1_700_000_777_000;
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingMatchData = {
      timestamp: activeDraftTimestamp,
      player: 'Tester',
      mode: 'Artifact Brawl',
    };
    mockStoreState.matches = [{
      id: activeDraftId,
      timestamp: activeDraftTimestamp,
      date: '3/20/2026',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: ['Teammate One'],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      damageTaken: 12,
      time: '00:00',
      notes: '',
      artifacts: ['existing_capture.png'],
      telemetryDraftState: 'active',
      ocrState: 'queued',
    }];
    vi.mocked(getMatchArtifactsStructured).mockResolvedValue({
      images: ['existing_capture.png', 'C:\\match_artifacts\\9191\\capture_result.png'],
      imageFiles: [],
      telemetry: [],
    });
    electronInvokeMock.mockResolvedValue({
      success: true,
      data: { filePath: 'C:\\match_artifacts\\9191\\capture_result.png' },
    });

    const { result } = renderHook(() => useMatchSubmission());

    let finalized;
    await act(async () => {
      finalized = await result.current.autoFinalizeResultScreenCapture({
        imageBase64: 'data:image/png;base64,ZmFrZQ==',
        resultData: {
          result: 'Win',
          winType: 'artifact',
          placement: 1,
          damageTaken: 88,
        },
        matchId: activeDraftId,
      });
    });

    expect(finalized).toEqual({
      success: true,
      matchId: activeDraftId,
      artifactPath: 'C:\\match_artifacts\\9191\\capture_result.png',
      artifactPaths: ['C:\\match_artifacts\\9191\\capture_result.png'],
    });
    expect(electronInvokeMock).toHaveBeenCalledWith('save-screenshot', {
      imageBase64: 'ZmFrZQ==',
      matchId: activeDraftId,
    });
    expect(updateMatch).toHaveBeenCalled();
    const [updatedMatch] = updateMatch.mock.calls[0];
    expect(updatedMatch.id).toBe(activeDraftId);
    expect(updatedMatch.result).toBe('Win');
    expect(updatedMatch.subType).toBe('Artifact');
    expect(updatedMatch.resultDetectionMethod).toBeUndefined();
    expect(updatedMatch.artifacts).toEqual([
      'existing_capture.png',
      'C:\\match_artifacts\\9191\\capture_result.png',
    ]);
  });

  it('autoFinalizeResultScreenCapture saves a cropped damage-sources artifact and merges its OCR text', async () => {
    const draftId = 7070;
    const draftTimestamp = 1_700_000_888_000;
    mockStoreState.activeUser = 'Tester';
    mockStoreState.pendingMatchData = {
      timestamp: draftTimestamp,
      player: 'Tester',
      mode: 'Artifact Brawl',
      damageSourcesText: ['Existing Panel Line'],
    };
    mockStoreState.matches = [{
      id: draftId,
      timestamp: draftTimestamp,
      date: '3/21/2026',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: ['Teammate One'],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      damageTaken: 12,
      time: '00:00',
      notes: '',
      artifacts: ['existing_capture.png'],
      telemetryDraftState: 'active',
      ocrState: 'queued',
    }];
    vi.mocked(getMatchArtifactsStructured).mockResolvedValue({
      images: [
        'existing_capture.png',
        'C:\\match_artifacts\\7070\\capture_result.png',
        'C:\\match_artifacts\\7070\\damage_sources.png',
      ],
      imageFiles: [],
      telemetry: [],
    });
    electronInvokeMock.mockImplementation((channel: string, payload?: any) => {
      if (channel === 'save-screenshot') {
        if (payload?.imageBase64 === 'ZmFrZQ==') {
          return Promise.resolve({
            success: true,
            data: { filePath: 'C:\\match_artifacts\\7070\\capture_result.png' },
          });
        }
        if (payload?.imageBase64 === 'ZGFtYWdl') {
          return Promise.resolve({
            success: true,
            data: { filePath: 'C:\\match_artifacts\\7070\\damage_sources.png' },
          });
        }
      }
      if (channel === 'ocr-scan') {
        return Promise.resolve({
          text: 'Damage Taken in Last 2 Minutes\nAsteroid\nTurret',
        });
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useMatchSubmission());

    let finalized;
    await act(async () => {
      finalized = await result.current.autoFinalizeResultScreenCapture({
        imageBase64: 'data:image/png;base64,ZmFrZQ==',
        resultData: {
          result: 'Loss',
          winType: 'combat',
          placement: 3,
          damageTaken: 41,
          detectionMethod: 'text',
          damageSourcesAvailable: true,
        },
        matchId: draftId,
        supplementalArtifacts: [
          {
            imageBase64: 'data:image/png;base64,ZGFtYWdl',
            kind: 'damage-sources',
          },
        ],
      });
    });

    expect(finalized).toEqual({
      success: true,
      matchId: draftId,
      artifactPath: 'C:\\match_artifacts\\7070\\capture_result.png',
      artifactPaths: [
        'C:\\match_artifacts\\7070\\capture_result.png',
        'C:\\match_artifacts\\7070\\damage_sources.png',
      ],
    });
    expect(electronInvokeMock).toHaveBeenCalledWith('save-screenshot', {
      imageBase64: 'ZmFrZQ==',
      matchId: draftId,
    });
    expect(electronInvokeMock).toHaveBeenCalledWith('save-screenshot', {
      imageBase64: 'ZGFtYWdl',
      matchId: draftId,
    });
    expect(electronInvokeMock).toHaveBeenCalledWith('ocr-scan', 'C:\\match_artifacts\\7070\\damage_sources.png');
    const [updatedMatch] = updateMatch.mock.calls[0];
    expect(updatedMatch.resultDetectionMethod).toBe('text');
    expect(updatedMatch.damageSourcesAvailable).toBe(true);
    expect(updatedMatch.damageSourcesText).toEqual([
      'Existing Panel Line',
      'Damage Taken in Last 2 Minutes',
      'Asteroid',
      'Turret',
    ]);
    expect(updatedMatch.artifacts).toEqual([
      'existing_capture.png',
      'C:\\match_artifacts\\7070\\capture_result.png',
      'C:\\match_artifacts\\7070\\damage_sources.png',
    ]);
  });

  it('discardTelemetryDraft removes draft artifacts, deletes the draft, and clears submission state', async () => {
    mockStoreState.matches = [{
      id: 4242,
      timestamp: 1_700_000_444_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      artifacts: ['C:\\match_artifacts\\4242\\capture_a.png', 'C:\\match_artifacts\\4242\\capture_b.png'],
    }];
    vi.mocked(getMatchArtifactsStructured).mockResolvedValue({
      images: ['C:\\match_artifacts\\4242\\capture_a.png', 'C:\\match_artifacts\\4242\\capture_b.png'],
      imageFiles: [
        { artifactId: 'artifact-a', filename: 'capture_a.png', path: 'C:\\match_artifacts\\4242\\capture_a.png' },
        { artifactId: 'artifact-b', filename: 'capture_b.png', path: 'C:\\match_artifacts\\4242\\capture_b.png' },
      ],
      telemetry: [],
      missingImages: [],
      resolvedFromDisk: true,
    });
    vi.mocked(removeAllMatchArtifacts).mockResolvedValue({
      removedPaths: ['C:\\match_artifacts\\4242\\capture_a.png', 'C:\\match_artifacts\\4242\\capture_b.png'],
      failedPaths: [],
    });

    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.discardTelemetryDraft(4242);
    });

    expect(removeAllMatchArtifacts).toHaveBeenCalledWith(4242, [
      'C:\\match_artifacts\\4242\\capture_a.png',
      'C:\\match_artifacts\\4242\\capture_b.png',
    ]);
    expect(deleteMatch).toHaveBeenCalledWith(4242);
    expect(mockStoreState.discardMatch).toHaveBeenCalledTimes(1);
    expect(setPendingKilledBy).toHaveBeenCalledWith('');
    expect(setPendingKilledByShip).toHaveBeenCalledWith('');
    expect(setSessionTeams).toHaveBeenCalledWith({});
    expect(setSessionShipTypes).toHaveBeenCalledWith({}, 'manual');
    expect(setTimelineEvents).toHaveBeenCalledWith([]);
    expect(setTimeMin).toHaveBeenCalledWith('');
    expect(setTimeSec).toHaveBeenCalledWith('');
    expect(setDamageTaken).toHaveBeenCalledWith('');
    expect(setActiveWeapons).not.toHaveBeenCalled();
    expect(StorageService.flush).toHaveBeenCalled();

    const resolvedEvent = dispatchEventSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'telemetry-draft:resolved') as CustomEvent | undefined;
    expect(resolvedEvent?.detail).toEqual({ matchId: 4242 });

    const consumedEvent = dispatchEventSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'smart-capture:artifacts-consumed') as CustomEvent | undefined;
    expect(consumedEvent?.detail).toEqual({
      matchId: 4242,
      artifactPaths: ['C:\\match_artifacts\\4242\\capture_a.png', 'C:\\match_artifacts\\4242\\capture_b.png'],
    });

    expect(setToast).toHaveBeenCalledWith({
      message: 'Match discarded. Removed 2 recorded screenshots.',
      type: 'info',
    });
  });

  it('discardCurrentMatch deletes the draft and clears submission state through the store helper', async () => {
    mockStoreState.matches = [{
      id: 31337,
      timestamp: 1_700_000_333_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Tester',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      artifacts: ['C:\\match_artifacts\\31337\\capture_a.png'],
    }];
    vi.mocked(removeAllMatchArtifacts).mockResolvedValue({
      removedPaths: ['C:\\match_artifacts\\31337\\capture_a.png'],
      failedPaths: [],
    });
    const { result } = renderHook(() => useMatchSubmission());

    await act(async () => {
      await result.current.discardCurrentMatch(31337);
    });

    expect(removeAllMatchArtifacts).toHaveBeenCalledWith(31337, ['C:\\match_artifacts\\31337\\capture_a.png']);
    expect(deleteMatch).toHaveBeenCalledWith(31337);
    expect(mockStoreState.discardMatch).toHaveBeenCalledTimes(1);
    expect(setPendingKilledBy).toHaveBeenCalledWith('');
    expect(setPendingKilledByShip).toHaveBeenCalledWith('');
    expect(setSessionTeams).toHaveBeenCalledWith({});
    expect(setSessionShipTypes).toHaveBeenCalledWith({}, 'manual');
    expect(setTimelineEvents).toHaveBeenCalledWith([]);
    expect(setTimeMin).toHaveBeenCalledWith('');
    expect(setTimeSec).toHaveBeenCalledWith('');
    expect(setDamageTaken).toHaveBeenCalledWith('');
    const consumedEvent = dispatchEventSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'smart-capture:artifacts-consumed') as CustomEvent | undefined;
    expect(consumedEvent?.detail).toEqual({
      matchId: 31337,
      artifactPaths: ['C:\\match_artifacts\\31337\\capture_a.png'],
    });
  });
});

