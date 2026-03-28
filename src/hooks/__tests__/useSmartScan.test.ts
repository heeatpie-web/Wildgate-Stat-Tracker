import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSmartScan } from '../useSmartScan';
import { captureScreen, smartAnalyzeScreen } from '../../utils/scanService';

const gameData = {
  setSessionTeams: vi.fn(),
  sessionTeams: {},
  pilotRegistry: [],
  selectedTeammates: [],
  setSelectedTeammates: vi.fn(),
  selectedOpponents: [],
  setSelectedOpponents: vi.fn(),
  updatePlayerIdMapping: vi.fn(),
  playerIdMap: {},
  sessionShipTypes: {},
  setSessionShipTypes: vi.fn(),
  setTimeMin: vi.fn(),
  setTimeSec: vi.fn(),
  setDamageTaken: vi.fn(),
  setSelectedReachModifiers: vi.fn(),
  selectedReachModifiers: [],
  addPendingReview: vi.fn(),
  pendingReviews: [],
  recordPlayerSighting: vi.fn(),
};

const uiState = {
  setToast: vi.fn(),
  setHiddenForScan: vi.fn(),
  activeUser: 'Pilot',
  visionStatus: 'idle',
  setVisionStatus: vi.fn(),
};

const appStoreState = {
  ocrMode: 'local',
  ocrCalibration: null,
  ocrRegions: undefined,
  ocrCorrections: {},
  ocrAliasModel: null,
  playerProfiles: {},
  knownMappings: {},
  uidMappings: { players: {} },
  resolveOcrAlias: vi.fn(() => null),
  ocrLearningEnabled: false,
  ocrAutoApplyMinScore: 0.85,
  dismissedRosterCandidateKeys: [],
  ocrAutoApplyMinCount: 2,
  ocrLearningStrictMode: false,
  ocrLearningQueueEnabled: false,
  ocrLearningReviewMode: 'balanced',
  ocrLearningAutoPromoteCount: 3,
  enqueueOcrLearningReview: vi.fn(),
  logOcrLearningDecision: vi.fn(),
};

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../../providers/UserPreferencesProvider', () => ({
  useUserPreferences: () => ({
    soundEnabled: false,
  }),
}));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

vi.mock('../../utils/electronAPI', () => ({
  isElectron: vi.fn(() => true),
}));

vi.mock('../../utils/scanService', () => ({
  captureScreen: vi.fn(),
  smartAnalyzeScreen: vi.fn(),
}));

vi.mock('../../utils/ocrAliasEngine', () => ({
  shouldQueueLearningReview: vi.fn(() => false),
}));

vi.mock('../../utils/ocrNameResolver', () => ({
  buildAliasVariantMap: vi.fn(() => ({})),
  buildOcrCandidatePool: vi.fn(({ seedNames = [] }: { seedNames?: string[] }) => seedNames),
  resolveOcrName: vi.fn(({ rawName }: { rawName: string }) => rawName),
}));

vi.mock('../../utils/pendingReviewUtils', () => ({
  deriveCanonicalRosterCandidateTargetKey: vi.fn(() => 'candidate'),
  shouldQueueCanonicalRosterCandidate: vi.fn(() => false),
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useSmartScan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uiState.visionStatus = 'idle';
    appStoreState.playerProfiles = {};
    appStoreState.knownMappings = {};
    appStoreState.uidMappings = { players: {} };
  });

  it('ignores overlapping scan requests while one scan is already in flight', async () => {
    let resolveCapture: ((value: { dataUrl: string; debugPath: string; filename: string }) => void) | null = null;
    vi.mocked(captureScreen).mockImplementation(() => (
      new Promise((resolve) => {
        resolveCapture = resolve;
      })
    ));
    vi.mocked(smartAnalyzeScreen).mockResolvedValue({
      mode: 'MatchStats',
      matchData: {
        time: '01:23',
        damage: 456,
        modifiers: ['Storm'],
      },
    } as any);

    const { result } = renderHook(() => useSmartScan());

    let firstScan: Promise<void> | null = null;
    await act(async () => {
      firstScan = result.current.handleSmartScan();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.handleSmartScan();
    });

    expect(vi.mocked(captureScreen)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(smartAnalyzeScreen)).not.toHaveBeenCalled();

    await act(async () => {
      resolveCapture?.({
        dataUrl: 'data:image/png;base64,ZmFrZQ==',
        debugPath: 'C:\\captures\\scan.png',
        filename: 'scan.png',
      });
      await firstScan;
    });

    expect(vi.mocked(smartAnalyzeScreen)).toHaveBeenCalledTimes(1);
    expect(gameData.setTimeMin).toHaveBeenCalledWith('01', 'ocr');
    expect(gameData.setTimeSec).toHaveBeenCalledWith('23', 'ocr');
    expect(gameData.setDamageTaken).toHaveBeenCalledWith('456', 'ocr');
    expect(gameData.setSelectedReachModifiers).toHaveBeenCalledWith(['Storm'], 'ocr');
    expect(uiState.setVisionStatus).toHaveBeenCalledWith('scanning');
    expect(uiState.setVisionStatus).toHaveBeenCalledWith('idle');

    vi.mocked(captureScreen).mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ZmFrZQ==',
      debugPath: 'C:\\captures\\scan-2.png',
      filename: 'scan-2.png',
    });

    await act(async () => {
      await result.current.handleSmartScan();
    });

    expect(vi.mocked(captureScreen)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(smartAnalyzeScreen)).toHaveBeenCalledTimes(2);
  });
});
