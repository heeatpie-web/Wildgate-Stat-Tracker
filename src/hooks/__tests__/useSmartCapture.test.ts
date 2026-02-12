import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSmartCapture } from '../useSmartCapture';

vi.mock('../../utils/electronBridge', () => ({
  captureGameWindow: vi.fn().mockResolvedValue(undefined),
  ocrProcessCapture: vi.fn().mockResolvedValue({}),
  saveScreenshot: vi.fn().mockResolvedValue({ success: true, filePath: '', filename: '' }),
  isElectron: vi.fn().mockReturnValue(false),
}));

vi.mock('../../utils/artifactService', () => ({
  rerunOCROnArtifact: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../utils/ocr/ocrParser', () => ({
  mergeOCRData: vi.fn().mockReturnValue({}),
  calculateOverallConfidence: vi.fn().mockReturnValue(0),
}));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: (selector: (s: any) => any) =>
    selector({
      ocrMode: 'both',
      captureMode: 'manual',
      lockOcrTeams: false,
      pilotRegistry: {},
      ocrCorrections: {},
    }),
}));

vi.mock('../../hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({ playSuccess: vi.fn(), playError: vi.fn() }),
}));

vi.mock('../../utils/stringUtils', () => ({
  findClosestMatch: vi.fn().mockReturnValue(null),
  normalizeOcrName: vi.fn((s: string) => s),
}));

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => ({
    visionStatus: 'idle',
    setVisionStatus: vi.fn(),
    setToast: vi.fn(),
  }),
}));

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => ({
    setTimeMin: vi.fn(),
    setTimeSec: vi.fn(),
    setDamageTaken: vi.fn(),
    setSelectedReachModifiers: vi.fn(),
    setSelectedTeammates: vi.fn(),
    selectedTeammates: [],
    setSelectedOpponents: vi.fn(),
    selectedOpponents: [],
    sessionTeams: {},
    setSessionTeams: vi.fn(),
    setSessionShipTypes: vi.fn(),
  }),
}));

vi.mock('../../utils/scanService', () => ({
  smartAnalyzeScreen: vi.fn().mockResolvedValue(null),
}));

describe('useSmartCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a tuple [state, actions] with expected state shape', () => {
    const { result } = renderHook(() => useSmartCapture());
    const [state] = result.current;

    expect(state).toHaveProperty('isCapturing');
    expect(state).toHaveProperty('isProcessing');
    expect(state).toHaveProperty('error');
    expect(state).toHaveProperty('pendingData');
    expect(state).toHaveProperty('capturedScreenshots');
    expect(state).toHaveProperty('queueDepth');
    expect(state).toHaveProperty('savedCaptures');
    expect(state).toHaveProperty('processingProgress');
    expect(state).toHaveProperty('qualityHint');

    expect(typeof state.isCapturing).toBe('boolean');
    expect(typeof state.isProcessing).toBe('boolean');
    expect(Array.isArray(state.capturedScreenshots)).toBe(true);
    expect(Array.isArray(state.savedCaptures)).toBe(true);
  });

  it('returns a tuple [state, actions] with expected action keys', () => {
    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    expect(actions).toHaveProperty('capture');
    expect(actions).toHaveProperty('captureMultiple');
    expect(actions).toHaveProperty('captureOnly');
    expect(actions).toHaveProperty('processStoredImage');
    expect(actions).toHaveProperty('processAllStored');
    expect(actions).toHaveProperty('clearCaptures');
    expect(actions).toHaveProperty('clearError');
    expect(actions).toHaveProperty('dismissPendingData');
    expect(actions).toHaveProperty('getMergedData');
    expect(actions).toHaveProperty('reanalyzeCaptures');
    expect(actions).toHaveProperty('resetCaptureSession');

    expect(typeof actions.capture).toBe('function');
    expect(typeof actions.clearError).toBe('function');
    expect(typeof actions.getMergedData).toBe('function');
  });

  it('getMergedData returns null when no captured screenshots', () => {
    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;
    expect(actions.getMergedData()).toBeNull();
  });

  it('clearCaptures and clearError can be called without throwing', () => {
    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;
    act(() => {
      actions.clearCaptures();
      actions.clearError();
    });
    expect(result.current[0].capturedScreenshots).toEqual([]);
    expect(result.current[0].error).toBeNull();
  });
});
