import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMatchSubmission } from '../useMatchSubmission';

const setToast = vi.fn();
const setShowWizard = vi.fn();
const setPendingMatchData = vi.fn();
const setIsMatchInProgress = vi.fn();
const setMatchStartTime = vi.fn();
const addMatch = vi.fn();

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
    updateMatch: vi.fn(),
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
    });
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

  it('initiateSubmission with no activeUser shows toast and does not open wizard', () => {
    mockStoreState.activeUser = null;

    const { result } = renderHook(() => useMatchSubmission());

    act(() => {
      result.current.initiateSubmission('Win');
    });

    expect(setToast).toHaveBeenCalledWith({ message: 'Select a profile first!', type: 'error' });
    expect(setShowWizard).not.toHaveBeenCalled();
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
});
