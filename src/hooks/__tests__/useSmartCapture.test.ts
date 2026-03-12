import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { resolveLobbyTagShipType, useSmartCapture } from '../useSmartCapture';
import { captureGameWindow, saveScreenshot, isElectron } from '../../utils/electronBridge';
import { rerunOCROnArtifact } from '../../utils/artifactService';

const mockStoreState: Record<string, unknown> = {
  ocrMode: 'local',
  captureMode: 'auto',
  performanceMode: false,
  ocrEnhancedNameRecoveryEnabled: true,
  ocrNameRerouteThreshold: 78,
  lockOcrTeams: false,
  pilotRegistry: [],
  ocrCorrections: {},
  ocrAliasModel: null,
  playerProfiles: {},
};

const playCaptureMock = vi.fn();
const playSuccessMock = vi.fn();
const playErrorMock = vi.fn();

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
  mergeOCRData: vi.fn((existing: any = {}, next: any = {}) => ({
    ...existing,
    ...next,
    playerShip: next.playerShip ?? existing.playerShip,
    reachModifiers: next.reachModifiers ?? existing.reachModifiers ?? [],
    hazards: next.hazards ?? existing.hazards ?? [],
    teammates: next.teammates ?? existing.teammates ?? [],
    opponentTeams: next.opponentTeams ?? existing.opponentTeams ?? [],
  })),
  calculateOverallConfidence: vi.fn().mockReturnValue(0),
}));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(mockStoreState),
}));

vi.mock('../../hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({ playCapture: playCaptureMock, playSuccess: playSuccessMock, playError: playErrorMock }),
}));

vi.mock('../../utils/stringUtils', () => ({
  combinedNameSimilarityScore: vi.fn((a: string, b: string) => (a === b ? 100 : 65)),
  findClosestMatch: vi.fn().mockReturnValue(null),
  getAdaptiveNameSimilarityThreshold: vi.fn().mockReturnValue(68),
  findBestVariantMatch: vi.fn().mockReturnValue(null),
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
    mockStoreState.ocrMode = 'local';
    mockStoreState.captureMode = 'auto';
    mockStoreState.performanceMode = false;
    mockStoreState.ocrEnhancedNameRecoveryEnabled = true;
    mockStoreState.ocrNameRerouteThreshold = 78;
    mockStoreState.lockOcrTeams = false;
    mockStoreState.pilotRegistry = [];
    mockStoreState.ocrCorrections = {};
    mockStoreState.ocrAliasModel = null;
    mockStoreState.playerProfiles = {};
    vi.mocked(isElectron).mockReturnValue(false);
    vi.mocked(captureGameWindow).mockResolvedValue({ success: false, error: 'not-mocked' });
    vi.mocked(saveScreenshot).mockResolvedValue({ success: true, filePath: '', filename: '' });
    vi.mocked(rerunOCROnArtifact).mockResolvedValue({ success: false, error: 'not-mocked' });
  });

  it('returns a tuple [state, actions] with expected state shape', () => {
    const { result } = renderHook(() => useSmartCapture());
    const [state] = result.current;

    expect(state).toHaveProperty('isCapturing');
    expect(state).toHaveProperty('isProcessing');
    expect(state).toHaveProperty('processingStatus');
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
    expect(state.processingStatus).toBeNull();
  });

  it('treats colored OCR tag text as ship metadata candidates', () => {
    expect(resolveLobbyTagShipType({
      name: '[Bastion (2 Player)]',
      teamColor: 'Red',
      confidence: 82,
      source: 'OCR',
      isTag: true,
    })).toBe('Bastion');
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

  it('capture reports a clear error outside Electron runtime', async () => {
    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.capture('Pilot');
    });

    expect(result.current[0].error).toBe('Smart Capture is only available in the desktop app');
  });

  it('plays the capture cue immediately after a screenshot is taken', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    vi.mocked(saveScreenshot).mockResolvedValue({
      success: true,
      filePath: 'C:\\captures\\capture-sound.png',
      filename: 'capture-sound.png',
    });

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-sound');
    });

    expect(playCaptureMock).toHaveBeenCalledTimes(1);
    expect(playSuccessMock).not.toHaveBeenCalled();
  });

  it('processStoredImage marks capture processed and stages pending data', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    vi.mocked(saveScreenshot).mockResolvedValue({
      success: true,
      filePath: 'C:\\captures\\cap-1.png',
      filename: 'cap-1.png',
    });
    vi.mocked(rerunOCROnArtifact).mockResolvedValue({
      success: true,
      data: {
        screenshotType: 'crew_hub',
        playerShip: { shipType: 'Hunter (4 Player)', confidence: 90, rawText: 'Hunter' },
        playerTeamName: '',
        reachModifiers: [],
        enemyShips: [],
        teammates: [{ name: 'Wingman', confidence: 88, isTeammate: true, rawText: 'Wingman' }],
        opponentTeams: [],
        overallConfidence: 88,
        captureTimestamp: Date.now(),
      },
    });

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-42');
    });

    await act(async () => {
      await actions.processStoredImage('C:\\captures\\cap-1.png', 'Pilot');
    });

    expect(vi.mocked(rerunOCROnArtifact)).toHaveBeenCalledWith(
      'C:\\captures\\cap-1.png',
      'Pilot',
      'local',
      undefined,
      expect.objectContaining({
        routingProfile: 'names-only',
        fontProfile: 'ealing-black-italic',
        nameRerouteThreshold: 78,
        maxReroutePasses: 1,
      })
    );
    expect(result.current[0].savedCaptures[0]?.ocrProcessed).toBe(true);
    expect(actions.getPendingData('match-42')).not.toBeNull();
  });
  it('removes consumed screenshots from the saved capture queue after submission finalizes', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    vi.mocked(saveScreenshot).mockResolvedValue({
      success: true,
      filePath: 'C:\\captures\\consumed.png',
      filename: 'consumed.png',
    });
    vi.mocked(rerunOCROnArtifact).mockResolvedValue({
      success: true,
      data: {
        screenshotType: 'crew_hub',
        playerShip: { shipType: 'Hunter (4 Player)', confidence: 90, rawText: 'Hunter' },
        playerTeamName: '',
        reachModifiers: [],
        enemyShips: [],
        teammates: [{ name: 'Wingman', confidence: 88, isTeammate: true, rawText: 'Wingman' }],
        opponentTeams: [],
        overallConfidence: 88,
        captureTimestamp: Date.now(),
      },
    });

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-consumed');
      await actions.processStoredImage('C:\\captures\\consumed.png', 'Pilot');
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('smart-capture:artifacts-consumed', {
        detail: {
          matchId: 'match-consumed',
          artifactPaths: ['C:\\captures\\consumed.png'],
        },
      }));
    });

    expect(result.current[0].savedCaptures).toEqual([]);
    expect(actions.getPendingData('match-consumed')).toBeNull();
  });

  it('dismisses one scope without canceling another scope queued for auto OCR', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T12:00:00.000Z'));
    try {
      vi.mocked(isElectron).mockReturnValue(true);
      vi.mocked(captureGameWindow).mockResolvedValue({
        success: true,
        imageBase64: 'ZmFrZQ==',
      });
      vi.mocked(saveScreenshot).mockImplementation(async (_image, matchId) => {
        const scope = String(matchId || 'unscoped');
        return {
          success: true,
          filePath: `C:\\captures\\${scope}.png`,
          filename: `${scope}.png`,
        };
      });
      vi.mocked(rerunOCROnArtifact).mockImplementation(async (filePath) => ({
        success: true,
        data: {
          screenshotType: 'crew_hub',
          playerShip: undefined,
          playerTeamName: '',
          reachModifiers: [],
          enemyShips: [],
          teammates: [{
            name: String(filePath).includes('match-b') ? 'Match B Wingman' : 'Match A Wingman',
            confidence: 88,
            isTeammate: true,
            rawText: 'Wingman',
          }],
          opponentTeams: [],
          overallConfidence: 88,
          captureTimestamp: Date.now(),
        },
      }));

      const { result } = renderHook(() => useSmartCapture());
      const [, actions] = result.current;

      await act(async () => {
        await actions.capture('Pilot', 'match-a');
      });

      vi.setSystemTime(new Date('2026-03-12T12:00:00.700Z'));
      await act(async () => {
        await actions.capture('Pilot', 'match-b');
      });

      act(() => {
        actions.dismissPendingData('match-a');
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(vi.mocked(rerunOCROnArtifact)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(rerunOCROnArtifact).mock.calls[0]?.[0]).toBe('C:\\captures\\match-b.png');
      expect(actions.getPendingData('match-a')).toBeNull();
      expect(actions.getPendingData('match-b')?.teammates?.[0]?.name).toBe('Match B Wingman');
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves hazards in pending OCR data and merged results', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    vi.mocked(saveScreenshot).mockResolvedValue({
      success: true,
      filePath: 'C:\\captures\\hazards.png',
      filename: 'hazards.png',
    });
    vi.mocked(rerunOCROnArtifact).mockResolvedValue({
      success: true,
      data: {
        screenshotType: 'crew_hub',
        playerShip: undefined,
        playerTeamName: '',
        reachModifiers: [],
        hazards: ['Sandstorm'],
        enemyShips: [],
        teammates: [],
        opponentTeams: [],
        overallConfidence: 84,
        captureTimestamp: Date.now(),
      },
    });

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-hazards');
    });
    await act(async () => {
      await actions.processStoredImage('C:\\captures\\hazards.png', 'Pilot');
    });

    expect(result.current[1].getPendingData('match-hazards')?.hazards).toEqual(['Sandstorm']);
    expect(result.current[1].getMergedData()?.hazards).toEqual(['Sandstorm']);
  });

  it('preserves explicit OCR artifactType when tactical-map modifiers come from the hazard list', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    vi.mocked(saveScreenshot).mockResolvedValue({
      success: true,
      filePath: 'C:\\captures\\artifact-type.png',
      filename: 'artifact-type.png',
    });
    vi.mocked(rerunOCROnArtifact).mockResolvedValue({
      success: true,
      data: {
        screenshotType: 'tactical_map',
        playerShip: undefined,
        playerTeamName: '',
        reachModifiers: [],
        artifactType: 'ice',
        hazards: ['Sandstorm'],
        enemyShips: [],
        teammates: [],
        opponentTeams: [],
        overallConfidence: 84,
        captureTimestamp: Date.now(),
      },
    });

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-artifact-type');
    });
    await act(async () => {
      await actions.processStoredImage('C:\\captures\\artifact-type.png', 'Pilot');
    });

    expect(result.current[1].getPendingData('match-artifact-type')?.artifactType).toBe('ice');
    expect(result.current[1].getMergedData()?.artifactType).toBe('ice');
  });

  it('does not classify crew-hub hazard-only OCR as empty output', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    vi.mocked(saveScreenshot).mockResolvedValue({
      success: true,
      filePath: 'C:\\captures\\hazard-only.png',
      filename: 'hazard-only.png',
    });
    vi.mocked(rerunOCROnArtifact).mockResolvedValue({
      success: true,
      data: {
        screenshotType: 'crew_hub',
        playerShip: undefined,
        playerTeamName: '',
        reachModifiers: [],
        hazards: ['Ancient Vault'],
        enemyShips: [],
        teammates: [],
        opponentTeams: [],
        overallConfidence: 86,
        captureTimestamp: Date.now(),
      },
    });

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-hazard-only');
    });
    await act(async () => {
      await actions.processStoredImage('C:\\captures\\hazard-only.png', 'Pilot');
    });

    expect(result.current[0].qualityHint?.level).not.toBe('poor');
  });

  it('uses configured OCR name reroute threshold in runtime options', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    mockStoreState.ocrNameRerouteThreshold = 86;

    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    vi.mocked(saveScreenshot).mockResolvedValue({
      success: true,
      filePath: 'C:\\captures\\cap-threshold.png',
      filename: 'cap-threshold.png',
    });
    vi.mocked(rerunOCROnArtifact).mockResolvedValue({
      success: true,
      data: {
        screenshotType: 'crew_hub',
        playerShip: { shipType: 'Hunter (4 Player)', confidence: 90, rawText: 'Hunter' },
        playerTeamName: '',
        reachModifiers: [],
        enemyShips: [],
        teammates: [{ name: 'Wingman', confidence: 88, isTeammate: true, rawText: 'Wingman' }],
        opponentTeams: [],
        overallConfidence: 88,
        captureTimestamp: Date.now(),
      },
    });

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-threshold');
    });
    await act(async () => {
      await actions.processStoredImage('C:\\captures\\cap-threshold.png', 'Pilot');
    });

    expect(vi.mocked(rerunOCROnArtifact)).toHaveBeenCalledWith(
      'C:\\captures\\cap-threshold.png',
      'Pilot',
      'local',
      undefined,
      expect.objectContaining({
        nameRerouteThreshold: 86,
      })
    );
  });

  it('updates OCR processingStatus through analyze and completed phases', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    vi.mocked(saveScreenshot).mockResolvedValue({
      success: true,
      filePath: 'C:\\captures\\phase-1.png',
      filename: 'phase-1.png',
    });

    let resolveOcr: ((value: any) => void) | null = null;
    vi.mocked(rerunOCROnArtifact).mockImplementation(() =>
      new Promise((resolve) => {
        resolveOcr = resolve;
      })
    );

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-phases');
    });

    let processingPromise: Promise<void> | null = null;
    await act(async () => {
      processingPromise = actions.processStoredImage('C:\\captures\\phase-1.png', 'Pilot');
      await Promise.resolve();
    });

    expect(result.current[0].processingStatus?.phase).toBe('analyzing');
    expect(result.current[0].processingStatus?.message).toContain('phase-1.png');

    await act(async () => {
      resolveOcr?.({
        success: true,
        data: {
          screenshotType: 'crew_hub',
          playerShip: { shipType: 'Hunter (4 Player)', confidence: 90, rawText: 'Hunter' },
          playerTeamName: '',
          reachModifiers: [],
          enemyShips: [],
          teammates: [{ name: 'Wingman', confidence: 88, isTeammate: true, rawText: 'Wingman' }],
          opponentTeams: [],
          overallConfidence: 88,
          captureTimestamp: Date.now(),
        },
      });
      await processingPromise;
    });

    expect(result.current[0].processingStatus?.phase).toBe('completed');
    expect(result.current[0].processingStatus?.message).toContain('Completed OCR');
  });

  it('processAllStored runs one OCR job at a time in performance mode', async () => {
    mockStoreState.performanceMode = true;
    mockStoreState.ocrMode = 'local';

    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    let saveIndex = 0;
    vi.mocked(saveScreenshot).mockImplementation(async () => {
      saveIndex += 1;
      return {
        success: true,
        filePath: `C:\\captures\\cap-${saveIndex}.png`,
        filename: `cap-${saveIndex}.png`,
      };
    });

    const makeOcrData = () => ({
      screenshotType: 'crew_hub' as const,
      playerShip: { shipType: 'Hunter (4 Player)', confidence: 90, rawText: 'Hunter' },
      playerTeamName: '',
      reachModifiers: [],
      enemyShips: [],
      teammates: [{ name: 'Wingman', confidence: 88, isTeammate: true, rawText: 'Wingman' }],
      opponentTeams: [],
      overallConfidence: 88,
      captureTimestamp: Date.now(),
    });

    const resolvers: Array<() => void> = [];
    vi.mocked(rerunOCROnArtifact).mockImplementation(() =>
      new Promise((resolve) => {
        resolvers.push(() => resolve({ success: true, data: makeOcrData() }));
      })
    );

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-42');
      await actions.captureOnly('match-42');
    });

    let batchPromise: Promise<void> | null = null;
    await act(async () => {
      batchPromise = actions.processAllStored('Pilot', 'match-42');
      await Promise.resolve();
    });

    expect(vi.mocked(rerunOCROnArtifact)).toHaveBeenCalledTimes(1);

    resolvers.shift()?.();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(vi.mocked(rerunOCROnArtifact)).toHaveBeenCalledTimes(2);

    resolvers.shift()?.();
    await act(async () => {
      await batchPromise;
    });

    expect(result.current[0].savedCaptures.every((capture) => capture.ocrProcessed)).toBe(true);
  });

  it('promotes stable teammate names with temporal fusion when enhancement is enabled', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    mockStoreState.ocrEnhancedNameRecoveryEnabled = true;

    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    let saveIndex = 0;
    vi.mocked(saveScreenshot).mockImplementation(async () => {
      saveIndex += 1;
      return {
        success: true,
        filePath: `C:\\captures\\stable-${saveIndex}.png`,
        filename: `stable-${saveIndex}.png`,
      };
    });

    const makeData = (confidence: number) => ({
      screenshotType: 'crew_hub' as const,
      playerShip: { shipType: 'Hunter (4 Player)', confidence: 90, rawText: 'Hunter' },
      playerTeamName: '',
      reachModifiers: [],
      enemyShips: [],
      teammates: [{ name: 'Wingman', confidence, isTeammate: true, rawText: 'Wingman' }],
      opponentTeams: [],
      overallConfidence: confidence,
      captureTimestamp: Date.now(),
    });
    vi.mocked(rerunOCROnArtifact)
      .mockResolvedValueOnce({ success: true, data: makeData(70) } as any)
      .mockResolvedValueOnce({ success: true, data: makeData(65) } as any);

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-55');
      await actions.captureOnly('match-55');
    });
    await act(async () => {
      await actions.processAllStored('Pilot', 'match-55');
    });

    const pending = actions.getPendingData('match-55');
    const teammate = pending?.teammates?.find((entry) => entry.name === 'Wingman');
    expect(teammate).toBeTruthy();
    expect(Number(teammate?.confidence || 0)).toBeGreaterThanOrEqual(88);
  });

  it('does not apply temporal fusion boost when enhancement is disabled', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    mockStoreState.ocrEnhancedNameRecoveryEnabled = false;

    vi.mocked(captureGameWindow).mockResolvedValue({
      success: true,
      imageBase64: 'ZmFrZQ==',
    });
    let saveIndex = 0;
    vi.mocked(saveScreenshot).mockImplementation(async () => {
      saveIndex += 1;
      return {
        success: true,
        filePath: `C:\\captures\\legacy-${saveIndex}.png`,
        filename: `legacy-${saveIndex}.png`,
      };
    });

    const makeData = (confidence: number) => ({
      screenshotType: 'crew_hub' as const,
      playerShip: { shipType: 'Hunter (4 Player)', confidence: 90, rawText: 'Hunter' },
      playerTeamName: '',
      reachModifiers: [],
      enemyShips: [],
      teammates: [{ name: 'Wingman', confidence, isTeammate: true, rawText: 'Wingman' }],
      opponentTeams: [],
      overallConfidence: confidence,
      captureTimestamp: Date.now(),
    });
    vi.mocked(rerunOCROnArtifact)
      .mockResolvedValueOnce({ success: true, data: makeData(70) } as any)
      .mockResolvedValueOnce({ success: true, data: makeData(65) } as any);

    const { result } = renderHook(() => useSmartCapture());
    const [, actions] = result.current;

    await act(async () => {
      await actions.captureOnly('match-56');
      await actions.captureOnly('match-56');
    });
    await act(async () => {
      await actions.processAllStored('Pilot', 'match-56');
    });

    const pending = actions.getPendingData('match-56');
    const teammate = pending?.teammates?.find((entry) => entry.name === 'Wingman');
    expect(teammate).toBeTruthy();
    expect(Number(teammate?.confidence || 0)).toBeLessThan(88);
  });
});

