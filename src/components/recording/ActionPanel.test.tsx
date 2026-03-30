import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const gameData = {
  sessionStartTime: Date.now() - 1000,
  matches: [],
  lastActivity: Date.now(),
  setLastActivity: vi.fn(),
  matchStartTime: null as number | null,
  isMatchInProgress: false,
  setMatchStartTime: vi.fn(),
  setIsMatchInProgress: vi.fn(),
  deleteMatch: vi.fn(),
  setPendingMatchData: vi.fn(),
  activeShip: 'Hunter',
  shipSource: 'manual',
  telemetryDetectedShip: undefined as string | undefined,
  activeHero: 'Adrian',
  heroSource: 'manual',
  telemetryDetectedHero: undefined as string | undefined,
  currentLoadout: null as { hero?: string | null; ship?: string | null; weapons?: string[]; equipment?: string[] } | null,
  pendingReviews: [],
  detectedUnknowns: {},
};

const uiState = {
  setShowWizard: vi.fn(),
  activeUser: 'TestPilot',
  setShowReviewQueue: vi.fn(),
  setShowIdMapper: vi.fn(),
  smartCaptureRequest: null as any,
  clearSmartCaptureRequest: vi.fn(),
  setToast: vi.fn(),
  pushNotification: vi.fn(),
};

const smartScan = {
  handleSmartScan: vi.fn(),
  isScanning: false,
  scanProgress: { pct: 0, status: 'Idle' },
  scanLogs: [] as string[],
};

const smartCaptureState = {
  isCapturing: false,
  isProcessing: false,
  processingStatus: null as { phase: string; message: string } | null,
  error: null as string | null,
  pendingData: null as any,
  queueDepth: 0,
  capturedScreenshots: [] as any[],
  savedCaptures: [] as any[],
  processingProgress: null as any,
  qualityHint: null as any,
};

const smartCaptureActions = {
  capture: vi.fn().mockResolvedValue(undefined),
  captureOnly: vi.fn().mockResolvedValue(null),
  processStoredImage: vi.fn().mockResolvedValue(undefined),
  processAllStored: vi.fn().mockResolvedValue(undefined),
  clearError: vi.fn(),
  clearCaptures: vi.fn(),
  dismissPendingData: vi.fn(),
  getPendingData: vi.fn(() => smartCaptureState.pendingData),
  reanalyzeCaptures: vi.fn(),
};

const initiateSubmission = vi.fn();
const discardCurrentMatch = vi.fn();
const startAutoCaptureMock = vi.fn().mockResolvedValue({ started: true });

const appStoreState = {
  discardMatch: vi.fn(),
  resultOcrFlowMode: 'prompt',
  ocrAutoOpenAfterRerun: false,
  showSmartCaptureInHeader: false,
  autoSequenceOnCapture: false,
  lifecycleTrackingPaused: false,
  setLifecycleTrackingPaused: vi.fn(),
  selectedMatchId: null as string | number | null,
  resetMatchTrackingForNewMatch: vi.fn(),
  resetMatchMetricsForNewMatch: vi.fn(),
  addMatch: vi.fn(),
  activeMode: 'Artifact Brawl',
  activeShip: 'Hunter',
  activeHero: 'Adrian',
  currentLoadout: null as any,
  pendingMatchData: null as any,
  matches: [] as any[],
  activeUser: 'TestPilot',
  sessionStartTime: Date.now() - 1_000,
  autoCaptureSendKeypresses: true,
  autoCaptureWaitMultiplier: 1,
  tacticalMapKeybind: 'Tab',
  holdTacticalMapKey: false,
  ocrEnhancedNameRecoveryEnabled: true,
  ocrNameRerouteThreshold: 78,
  ocrRegions: {
    crewHub: {},
    mapScreen: {},
  } as any,
  deviceDisplayInfo: null as any,
  gameResolution: null as any,
  isMatchInProgress: false,
  setPendingMatchData: vi.fn(),
  updateMatch: vi.fn(),
};

const useAppStoreMock = Object.assign(
  (selector: any) => selector(appStoreState),
  {
    getState: () => appStoreState,
  }
);

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../../hooks/useSmartScan', () => ({
  useSmartScan: () => smartScan,
}));

vi.mock('../../hooks/useSmartCapture', () => ({
  useSmartCapture: () => [smartCaptureState, smartCaptureActions],
}));

vi.mock('../../hooks/useMatchSubmission', () => ({
  useMatchSubmission: () => ({
    initiateSubmission,
    discardCurrentMatch,
    processFinalSubmission: vi.fn(),
    submitting: false,
  }),
}));

vi.mock('../../utils/electronBridge', () => ({
  startAutoCapture: (...args: unknown[]) => startAutoCaptureMock(...args),
}));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock('../SessionTimer', () => ({
  SessionTimer: () => <div data-testid="session-timer">SessionTimer</div>,
}));

describe('ActionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(gameData, {
      pendingReviews: [],
      detectedUnknowns: {},
      matches: [],
      isMatchInProgress: false,
      matchStartTime: null,
    });

    Object.assign(smartScan, {
      isScanning: false,
      scanProgress: { pct: 0, status: 'Idle' },
      scanLogs: [],
    });

    Object.assign(smartCaptureState, {
      isCapturing: false,
      isProcessing: false,
      processingStatus: null,
      error: null,
      pendingData: null,
      queueDepth: 0,
      capturedScreenshots: [],
      savedCaptures: [],
      processingProgress: null,
      qualityHint: null,
    });
    gameData.currentLoadout = null;
    appStoreState.resultOcrFlowMode = 'prompt';
    appStoreState.ocrAutoOpenAfterRerun = false;
    appStoreState.showSmartCaptureInHeader = false;
    appStoreState.lifecycleTrackingPaused = false;
    appStoreState.selectedMatchId = null;
    appStoreState.activeMode = 'Artifact Brawl';
    appStoreState.activeShip = 'Hunter';
    appStoreState.activeHero = 'Adrian';
    appStoreState.currentLoadout = null;
    appStoreState.pendingMatchData = null;
    appStoreState.matches = [];
    appStoreState.addMatch.mockReset().mockImplementation((match: any) => {
      appStoreState.matches = [...appStoreState.matches, match];
      gameData.matches = appStoreState.matches;
    });
    appStoreState.resetMatchTrackingForNewMatch.mockClear();
    appStoreState.resetMatchMetricsForNewMatch.mockClear();
    appStoreState.discardMatch.mockReset();
    appStoreState.setLifecycleTrackingPaused.mockReset();
    gameData.setIsMatchInProgress.mockReset().mockImplementation((next: boolean) => {
      gameData.isMatchInProgress = next;
    });
    gameData.setMatchStartTime.mockReset().mockImplementation((next: number | null) => {
      gameData.matchStartTime = next;
    });
    gameData.deleteMatch.mockReset().mockImplementation((id: number) => {
      gameData.matches = gameData.matches.filter((match: any) => match.id !== id);
      appStoreState.matches = appStoreState.matches.filter((match: any) => match.id !== id);
    });
    uiState.smartCaptureRequest = null;
    smartCaptureActions.capture.mockReset().mockResolvedValue(undefined);
    smartCaptureActions.captureOnly.mockReset().mockResolvedValue({
      filePath: 'capture-default.png',
      filename: 'capture-default.png',
      timestamp: Date.now(),
      matchId: null,
      ocrProcessed: false,
    });
    smartCaptureActions.processStoredImage.mockReset().mockResolvedValue(undefined);
    smartCaptureActions.processAllStored.mockReset().mockResolvedValue(undefined);
    smartCaptureActions.clearError.mockReset();
    smartCaptureActions.clearCaptures.mockReset();
    smartCaptureActions.dismissPendingData.mockReset();
    smartCaptureActions.getPendingData.mockReset().mockImplementation(() => smartCaptureState.pendingData);
    smartCaptureActions.reanalyzeCaptures.mockReset();
    discardCurrentMatch.mockReset();
    appStoreState.activeUser = 'TestPilot';
    appStoreState.sessionStartTime = Date.now() - 1_000;
    appStoreState.autoSequenceOnCapture = false;
    appStoreState.autoCaptureSendKeypresses = true;
    appStoreState.autoCaptureWaitMultiplier = 1;
    appStoreState.tacticalMapKeybind = 'Tab';
    appStoreState.holdTacticalMapKey = false;
    appStoreState.ocrEnhancedNameRecoveryEnabled = true;
    appStoreState.ocrNameRerouteThreshold = 78;
    appStoreState.ocrRegions = {
      crewHub: {},
      mapScreen: {},
    };
    appStoreState.deviceDisplayInfo = null;
    appStoreState.gameResolution = null;
    appStoreState.isMatchInProgress = false;
    startAutoCaptureMock.mockReset().mockResolvedValue({ started: true });
  });

  it('shows match recording header without redundant capture guidance', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    const { container } = render(<ActionPanel />);

    expect(container.querySelector('[data-recording-panel="match-recording"]')).toBeInTheDocument();
    expect(screen.queryByText(/primary capture lives in the top header/i)).not.toBeInTheDocument();
  }, 10000);

  it('shows a clear stop match timer button while a mission is in progress', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    gameData.isMatchInProgress = true;
    gameData.matchStartTime = Date.now() - 30_000;

    render(<ActionPanel />);

    expect(screen.getByRole('button', { name: /stop match timer/i })).toBeInTheDocument();
  });

  it('resets match-scoped recording fields before starting a fresh timer', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    const { rerender } = render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /start match timer/i }));
    rerender(<ActionPanel />);

    expect(appStoreState.resetMatchTrackingForNewMatch).toHaveBeenCalledTimes(1);
    expect(appStoreState.resetMatchMetricsForNewMatch).toHaveBeenCalledTimes(1);
    expect(gameData.setIsMatchInProgress).toHaveBeenCalledWith(true);
    expect(gameData.setMatchStartTime).toHaveBeenCalledWith(expect.any(Number));
  });

  it('deletes the locally created ongoing telemetry draft when stopping a manual match', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    const { rerender } = render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /start match timer/i }));
    rerender(<ActionPanel />);

    const createdDraft = appStoreState.matches[0];
    expect(createdDraft).toMatchObject({
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
    });

    fireEvent.click(screen.getByRole('button', { name: /stop match timer/i }));

    expect(gameData.deleteMatch).toHaveBeenCalledWith(createdDraft.id);
    expect(appStoreState.matches).toEqual([]);
  });

  it('reuses an existing telemetry draft instead of adding a duplicate when the timer starts', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const existingDraft = {
      id: 7331,
      timestamp: Date.now() - 5_000,
      player: 'TestPilot',
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
    };
    gameData.matches = [existingDraft] as any[];
    appStoreState.matches = [existingDraft] as any[];

    const { rerender } = render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /start match timer/i }));
    rerender(<ActionPanel />);

    expect(appStoreState.addMatch).not.toHaveBeenCalled();
    expect(appStoreState.matches).toEqual([existingDraft]);

    fireEvent.click(screen.getByRole('button', { name: /stop match timer/i }));

    expect(gameData.deleteMatch).toHaveBeenCalledWith(existingDraft.id);
  });

  it('stops the broader active ongoing draft when the timer was not started in the current component instance', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const ongoingDraft = {
      id: 9001,
      timestamp: Date.now(),
      player: 'TestPilot',
      result: 'Ongoing',
      subType: 'Telemetry Draft',
    };
    gameData.isMatchInProgress = true;
    gameData.matchStartTime = Date.now() - 20_000;
    gameData.matches = [ongoingDraft] as any[];
    appStoreState.matches = [ongoingDraft] as any[];

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /stop match timer/i }));

    expect(gameData.setMatchStartTime).toHaveBeenCalledWith(null);
    expect(gameData.setIsMatchInProgress).toHaveBeenCalledWith(false);
    expect(gameData.deleteMatch).toHaveBeenCalledWith(9001);
    expect(appStoreState.matches).toEqual([]);
  });

  it('routes live-match discard through the shared discard helper', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const ongoingDraft = {
      id: 4444,
      timestamp: Date.now(),
      player: 'TestPilot',
      result: 'Ongoing',
      subType: 'Telemetry Draft',
    };
    gameData.isMatchInProgress = true;
    gameData.matchStartTime = Date.now() - 15_000;
    gameData.matches = [ongoingDraft] as any[];
    appStoreState.matches = [ongoingDraft] as any[];

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /discard match/i }));

    expect(smartCaptureActions.clearCaptures).toHaveBeenCalledTimes(1);
    expect(discardCurrentMatch).toHaveBeenCalledWith(4444);
    expect(uiState.pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Match discarded. Ready for a fresh start.',
      type: 'info',
      source: 'user',
    }));
  });

  it('does not render legacy ID Mapper buttons in recording layouts', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    render(<ActionPanel />);
    expect(screen.queryByRole('button', { name: /id mapper/i })).toBeNull();

    vi.clearAllMocks();
    render(<ActionPanel variant="transparent" />);
    expect(screen.queryByRole('button', { name: /id mapper/i })).toBeNull();
  });

  it('does not render the legacy combined review button even when review work exists', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    gameData.pendingReviews = [{ id: 'review-1' } as any];
    gameData.detectedUnknowns = { UNKNOWN1: { type: 'Ship', lastSeen: Date.now() } };

    render(<ActionPanel />);

    expect(screen.queryByRole('button', { name: /intelligence review required/i })).toBeNull();
  });

  it('hides the in-panel Smart Capture button when header Smart Capture is enabled', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    appStoreState.showSmartCaptureInHeader = true;

    const { container } = render(<ActionPanel />);

    expect(container.querySelector('[data-tour="smart-capture"]')).toBeNull();
  });

  it('falls back to smart scan when smart capture callback is not provided', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    render(<ActionPanel variant="transparent" />);
    const smartCaptureButtons = screen.getAllByRole('button', { name: /smart capture/i });
    const primarySmartCaptureButton = smartCaptureButtons.find((button) => (
      button.getAttribute('title')?.toLowerCase().includes('capture screenshot') ?? false
    )) ?? smartCaptureButtons[0];
    fireEvent.click(primarySmartCaptureButton);

    expect(smartScan.handleSmartScan).toHaveBeenCalledTimes(1);
    expect(smartCaptureActions.capture).not.toHaveBeenCalled();
  });

  it('uses smart capture pipeline when smart capture callback is provided', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const onSmartCaptureData = vi.fn();

    render(<ActionPanel variant="transparent" onSmartCaptureData={onSmartCaptureData} />);
    fireEvent.click(screen.getByRole('button', { name: /smart capture/i }));

    await waitFor(() => {
      expect(smartCaptureActions.capture).toHaveBeenCalledWith('TestPilot');
    });
    expect(smartScan.handleSmartScan).not.toHaveBeenCalled();
  });

  it('runs the auto-sequence coordinator for manual smart capture when sequence mode is enabled', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const onSmartCaptureData = vi.fn();
    appStoreState.autoSequenceOnCapture = true;
    appStoreState.isMatchInProgress = true;
    appStoreState.matches = [{
      id: 42,
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      timestamp: Date.now(),
      player: 'TestPilot',
    }];
    gameData.matches = appStoreState.matches;

    render(<ActionPanel variant="transparent" onSmartCaptureData={onSmartCaptureData} />);
    fireEvent.click(screen.getByRole('button', { name: /smart capture/i }));

    await waitFor(() => {
      expect(startAutoCaptureMock).toHaveBeenCalledWith(expect.objectContaining({
        activeUser: 'TestPilot',
        matchId: 42,
      }));
    });
    expect(smartCaptureActions.capture).not.toHaveBeenCalled();
  });

  it('routes smart capture to the active telemetry draft instead of stale pending data', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const now = Date.now();
    const onSmartCaptureData = vi.fn();
    gameData.sessionStartTime = now - 120_000;
    appStoreState.pendingMatchData = {
      id: 501,
      timestamp: now - 300_000,
      player: 'TestPilot',
      subType: 'Combat',
    };
    appStoreState.matches = [
      {
        id: 501,
        timestamp: now - 300_000,
        player: 'TestPilot',
        subType: 'Combat',
      },
      {
        id: 9001,
        timestamp: now - 10_000,
        player: 'TestPilot',
        subType: 'Telemetry Draft',
        telemetryDraftState: 'active',
      },
    ];

    render(<ActionPanel variant="transparent" onSmartCaptureData={onSmartCaptureData} />);
    fireEvent.click(screen.getByRole('button', { name: /smart capture/i }));

    await waitFor(() => {
      expect(smartCaptureActions.capture).toHaveBeenCalledWith('TestPilot', 9001);
    });
  });

  it('consumes smart capture request from shared UI state channel', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    uiState.smartCaptureRequest = {
      requestId: 'header_1',
      activeUser: 'TestPilot',
      matchId: 42,
      source: 'header',
    };

    render(<ActionPanel />);

    await waitFor(() => {
      expect(smartCaptureActions.capture).toHaveBeenCalledWith('TestPilot', 42);
    });
    expect(uiState.clearSmartCaptureRequest).toHaveBeenCalledWith('header_1');
  });

  it('routes shared hotkey smart capture requests without a match to the active telemetry draft', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    gameData.isMatchInProgress = true;
    gameData.matches = [{
      id: 901,
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      timestamp: Date.now(),
      player: 'TestPilot',
    }];
    appStoreState.pendingMatchData = { id: 77 };
    appStoreState.matches = gameData.matches;
    uiState.smartCaptureRequest = {
      requestId: 'hotkey_1',
      activeUser: 'TestPilot',
      matchId: null,
      source: 'global-hotkey',
      behavior: 'single',
    };

    render(<ActionPanel />);

    await waitFor(() => {
      expect(smartCaptureActions.capture).toHaveBeenCalledWith('TestPilot', 901);
    });
    expect(uiState.clearSmartCaptureRequest).toHaveBeenCalledWith('hotkey_1');
  });

  it('starts the main-process auto-sequence coordinator when requested', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    appStoreState.isMatchInProgress = true;
    appStoreState.autoCaptureSendKeypresses = false;
    appStoreState.autoCaptureWaitMultiplier = 1.7;
    appStoreState.tacticalMapKeybind = 'KeyM';
    appStoreState.holdTacticalMapKey = true;
    appStoreState.deviceDisplayInfo = { aspectProfile: '21:9', width: 3440 };
    appStoreState.gameResolution = { width: 3440, height: 1440 };
    appStoreState.matches = [{
      id: 42,
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      timestamp: Date.now(),
      player: 'TestPilot',
    }];
    uiState.smartCaptureRequest = {
      requestId: 'auto_1',
      activeUser: 'TestPilot',
      matchId: 42,
      source: 'global-hotkey',
      behavior: 'auto-sequence',
    };

    render(<ActionPanel />);

    await waitFor(() => {
      expect(startAutoCaptureMock).toHaveBeenCalledWith(expect.objectContaining({
        activeUser: 'TestPilot',
        matchId: 42,
        isMatchInProgress: true,
        autoCaptureSendKeypresses: false,
        autoCaptureWaitMultiplier: 1.7,
        tacticalMapKeybind: 'KeyM',
        holdTacticalMapKey: true,
        ocrEnhancedNameRecoveryEnabled: true,
        ocrNameRerouteThreshold: 78,
        deviceDisplayInfo: { aspectProfile: '21:9', width: 3440 },
        gameResolution: { width: 3440, height: 1440 },
      }));
    });

    expect(uiState.clearSmartCaptureRequest).toHaveBeenCalledWith('auto_1');
    expect(smartCaptureActions.captureOnly).not.toHaveBeenCalled();
    expect(smartCaptureActions.processStoredImage).not.toHaveBeenCalled();
  });

  it('defaults behavior-less smart capture requests to the stored manual capture mode', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    appStoreState.autoSequenceOnCapture = true;
    appStoreState.isMatchInProgress = true;
    appStoreState.matches = [{
      id: 77,
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      timestamp: Date.now(),
      player: 'TestPilot',
    }];
    gameData.matches = appStoreState.matches;

    render(<ActionPanel />);
    window.dispatchEvent(new CustomEvent('smart-capture-request', {
      detail: {
        requestId: 'event_sequence_default',
        activeUser: 'TestPilot',
        matchId: 77,
        source: 'header',
      },
    }));

    await waitFor(() => {
      expect(startAutoCaptureMock).toHaveBeenCalledWith(expect.objectContaining({
        activeUser: 'TestPilot',
        matchId: 77,
      }));
    });
    expect(smartCaptureActions.capture).not.toHaveBeenCalled();
  });

  it('clears failed auto-sequence requests and surfaces the start error', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    appStoreState.isMatchInProgress = true;
    startAutoCaptureMock.mockResolvedValueOnce({
      started: false,
      reason: 'invalid-tactical-map-key',
      error: 'Unsupported tactical map key configured: "Mouse4"',
    });
    uiState.smartCaptureRequest = {
      requestId: 'auto_fail',
      activeUser: 'TestPilot',
      matchId: 42,
      source: 'global-hotkey',
      behavior: 'auto-sequence',
    };

    render(<ActionPanel />);

    await waitFor(() => {
      expect(startAutoCaptureMock).toHaveBeenCalled();
    });

    expect(uiState.clearSmartCaptureRequest).toHaveBeenCalledWith('auto_fail');
    expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Auto-capture failed: Unsupported tactical map key configured: "Mouse4"',
      type: 'error',
    }));
  });

  it('routes new captures to the active telemetry draft instead of a stale pending review during an in-progress match', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    gameData.isMatchInProgress = true;
    gameData.matches = [{
      id: 901,
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      timestamp: Date.now(),
      player: 'TestPilot',
    }];
    appStoreState.pendingMatchData = { id: 77 };
    appStoreState.matches = gameData.matches;

    render(<ActionPanel onSmartCaptureData={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /smart capture/i })[0]);

    await waitFor(() => {
      expect(smartCaptureActions.capture).toHaveBeenCalledWith('TestPilot', 901);
    });
  });

  it('sends pending smart capture payload into review callback and clears pending state', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const pendingPayload = { teammates: [{ name: 'Pilot' }] };
    appStoreState.pendingMatchData = { id: 77 };
    smartCaptureState.pendingData = null;
    smartCaptureState.savedCaptures = [{ matchId: 77, ocrProcessed: false }];
    smartCaptureActions.getPendingData.mockImplementation((matchId?: number | null) => (
      matchId === 77 ? pendingPayload : null
    ));

    render(<ActionPanel onSmartCaptureData={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /review/i }));

    const gateEvent = dispatchSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'submission:ocr-gate') as CustomEvent | undefined;
    expect(gateEvent).toBeDefined();
    expect(gateEvent?.detail?.data).toBe(pendingPayload);
    expect(gateEvent?.detail?.matchId).toBe(77);
    expect(smartCaptureActions.dismissPendingData).toHaveBeenCalledWith(77);
    dispatchSpy.mockRestore();
  });

  it('defers queued smart capture requests until the panel becomes active', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    uiState.smartCaptureRequest = {
      requestId: 'queued_1',
      activeUser: 'TestPilot',
      matchId: 42,
      source: 'header',
    };

    const { rerender } = render(<ActionPanel isActive={false} />);

    expect(smartCaptureActions.capture).not.toHaveBeenCalled();
    expect(uiState.clearSmartCaptureRequest).not.toHaveBeenCalled();

    rerender(<ActionPanel isActive />);

    await waitFor(() => {
      expect(smartCaptureActions.capture).toHaveBeenCalledWith('TestPilot', 42);
    });
    expect(uiState.clearSmartCaptureRequest).toHaveBeenCalledWith('queued_1');
  });

  it('ignores hidden smart-capture-request window events until active', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const { rerender } = render(<ActionPanel isActive={false} />);

    window.dispatchEvent(new CustomEvent('smart-capture-request', {
      detail: {
        requestId: 'event_1',
        activeUser: 'TestPilot',
        matchId: 99,
      },
    }));
    expect(smartCaptureActions.capture).not.toHaveBeenCalled();
    expect(smartCaptureActions.processAllStored).not.toHaveBeenCalled();

    rerender(<ActionPanel isActive />);
    window.dispatchEvent(new CustomEvent('smart-capture-request', {
      detail: {
        requestId: 'event_2',
        activeUser: 'TestPilot',
        matchId: 99,
      },
    }));

    await waitFor(() => {
      expect(smartCaptureActions.capture).toHaveBeenCalledWith('TestPilot', 99);
    });
  });

  it('ignores hidden submission-open events until the panel is active again', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const { rerender } = render(<ActionPanel isActive={false} />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('submission:open-result', { detail: { result: 'Win' } }));
    });
    expect(initiateSubmission).not.toHaveBeenCalled();

    await act(async () => {
      rerender(<ActionPanel isActive />);
    });
    await act(async () => {
      window.dispatchEvent(new CustomEvent('submission:open-result', { detail: { result: 'Win' } }));
    });

    await waitFor(() => {
      expect(initiateSubmission).toHaveBeenCalledWith('Win');
    });
  });

  it('preserves the OCR decision prompt across isActive toggles', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    smartCaptureState.savedCaptures = [{
      filePath: 'queued.png',
      filename: 'queued.png',
      timestamp: Date.now(),
      matchId: null,
      ocrProcessed: false,
    }];

    const { rerender } = render(<ActionPanel onSmartCaptureData={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /win/i }));

    expect(screen.getByText(/queued smart captures detected/i)).toBeInTheDocument();

    rerender(<ActionPanel isActive={false} onSmartCaptureData={vi.fn()} />);
    expect(screen.getByText(/queued smart captures detected/i)).toBeInTheDocument();

    rerender(<ActionPanel isActive onSmartCaptureData={vi.fn()} />);
    expect(screen.getByText(/queued smart captures detected/i)).toBeInTheDocument();
  });

  it('uses unified result button styling and 3-way layout', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    render(<ActionPanel />);

    const resultButtons = screen.getAllByRole('button', { name: /win|loss|draw/i });
    expect(resultButtons).toHaveLength(3);
    resultButtons.forEach((button) => {
      expect(button.className).toContain('recording-result-btn');
    });
  });

  it('routes Win/Loss/Draw clicks through submission hook', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /win/i }));
    fireEvent.click(screen.getByRole('button', { name: /loss/i }));
    fireEvent.click(screen.getByRole('button', { name: /draw/i }));

    expect(initiateSubmission).toHaveBeenNthCalledWith(1, 'Win');
    expect(initiateSubmission).toHaveBeenNthCalledWith(2, 'Loss');
    expect(initiateSubmission).toHaveBeenNthCalledWith(3, 'Draw');
  });

  it('opens OCR gate before submission when pending OCR data exists', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const onSmartCaptureData = vi.fn();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    appStoreState.pendingMatchData = { id: 77 };
    smartCaptureState.pendingData = {
      screenshotType: 'tactical_map',
      playerShip: undefined,
      playerTeamName: undefined,
      reachModifiers: [],
      enemyShips: [],
      teammates: [],
      opponentTeams: [],
      overallConfidence: 80,
      captureTimestamp: Date.now(),
    };

    render(<ActionPanel onSmartCaptureData={onSmartCaptureData} />);
    fireEvent.click(screen.getByRole('button', { name: /win/i }));

    expect(initiateSubmission).not.toHaveBeenCalled();
    const gateEvent = dispatchSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'submission:ocr-gate') as CustomEvent | undefined;
    expect(gateEvent).toBeDefined();
    expect(gateEvent?.detail?.result).toBe('Win');
    expect(gateEvent?.detail?.matchId).toBe(77);
    dispatchSpy.mockRestore();
  });

  it('shows blocking OCR decision prompt instead of auto-processing when queued captures exist', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    smartCaptureState.savedCaptures = [{
      filePath: 'queued.png',
      filename: 'queued.png',
      timestamp: Date.now(),
      matchId: null,
      ocrProcessed: false,
    }];

    render(<ActionPanel onSmartCaptureData={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /win/i }));

    expect(smartCaptureActions.processAllStored).not.toHaveBeenCalled();
    expect(initiateSubmission).not.toHaveBeenCalled();
    expect(screen.getByText(/queued smart captures detected/i)).toBeInTheDocument();
  });

  it('allows continuing to wizard without OCR from blocking prompt', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    smartCaptureState.savedCaptures = [{
      filePath: 'queued.png',
      filename: 'queued.png',
      timestamp: Date.now(),
      matchId: null,
      ocrProcessed: false,
    }];

    render(<ActionPanel onSmartCaptureData={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /loss/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue without ocr/i }));

    expect(initiateSubmission).toHaveBeenCalledWith('Loss');
    expect(smartCaptureActions.processAllStored).not.toHaveBeenCalled();
  });

  it('processes OCR only after explicit prompt confirmation and then opens OCR gate', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const reviewData = {
      screenshotType: 'crew_hub',
      playerShip: undefined,
      playerTeamName: undefined,
      reachModifiers: [],
      enemyShips: [],
      teammates: [],
      opponentTeams: [],
      overallConfidence: 78,
      captureTimestamp: Date.now(),
    };
    smartCaptureState.savedCaptures = [{
      filePath: 'queued.png',
      filename: 'queued.png',
      timestamp: Date.now(),
      matchId: null,
      ocrProcessed: false,
    }];
    smartCaptureActions.getPendingData.mockReturnValue(reviewData);

    render(<ActionPanel onSmartCaptureData={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /draw/i }));
    fireEvent.click(screen.getByRole('button', { name: /process ocr and review/i }));

    await waitFor(() => {
      expect(smartCaptureActions.processAllStored).toHaveBeenCalledWith('TestPilot', null);
    });
    expect(initiateSubmission).not.toHaveBeenCalled();

    const gateEvent = dispatchSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'submission:ocr-gate') as CustomEvent | undefined;
    expect(gateEvent).toBeDefined();
    expect(gateEvent?.detail?.result).toBe('Draw');
    expect(gateEvent?.detail?.matchId).toBeNull();
    dispatchSpy.mockRestore();
  });

  it('shows queued OCR progress inside the blocking prompt while processing', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    let resolveProcess: (() => void) | null = null;
    smartCaptureState.processingProgress = { current: 1, total: 4 };
    smartCaptureState.processingStatus = {
      phase: 'analyzing',
      message: 'Analyzing queued-1.png (1/4)...',
    };
    smartCaptureState.savedCaptures = [{
      filePath: 'queued.png',
      filename: 'queued.png',
      timestamp: Date.now(),
      matchId: null,
      ocrProcessed: false,
    }];
    smartCaptureActions.processAllStored.mockImplementation(() => new Promise<void>((resolve) => {
      resolveProcess = resolve;
    }));

    render(<ActionPanel onSmartCaptureData={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /win/i }));
    fireEvent.click(screen.getByRole('button', { name: /process ocr and review/i }));

    expect(screen.getByText('Analyzing queued-1.png (1/4)...')).toBeInTheDocument();
    expect(screen.getByText('1/4 images complete')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /queued ocr review progress/i })).toHaveAttribute('aria-valuenow', '25');

    await act(async () => {
      resolveProcess?.();
    });
  });

  it('opens wizard immediately and processes queued OCR in background when configured', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const reviewData = {
      screenshotType: 'crew_hub',
      playerShip: undefined,
      playerTeamName: undefined,
      reachModifiers: [],
      enemyShips: [],
      teammates: [],
      opponentTeams: [],
      overallConfidence: 82,
      captureTimestamp: Date.now(),
    };

    appStoreState.resultOcrFlowMode = 'background';
    appStoreState.pendingMatchData = { id: 901, ocrState: 'queued', artifacts: [] };
    appStoreState.matches = [{ id: 901, ocrState: 'queued' }];
    let backgroundProcessed = false;
    smartCaptureState.savedCaptures = [{
      filePath: 'queued.png',
      filename: 'queued.png',
      timestamp: Date.now(),
      matchId: 901,
      ocrProcessed: false,
    }];
    smartCaptureActions.processAllStored.mockImplementation(async () => {
      backgroundProcessed = true;
    });
    smartCaptureActions.getPendingData.mockImplementation(() => (
      backgroundProcessed ? reviewData : null
    ));

    render(<ActionPanel onSmartCaptureData={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: /win/i }), { button: 0 });

    expect(initiateSubmission).toHaveBeenCalledWith('Win');
    expect(screen.queryByText(/queued smart captures detected/i)).not.toBeInTheDocument();
    expect(uiState.pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'OCR is processing in the background. Results will be available shortly.',
      type: 'info',
      source: 'smart-capture',
      deepLink: expect.objectContaining({
        type: 'openView',
        view: 'smart-captures',
        focusMatchId: 901,
      }),
    }));
    await waitFor(() => {
      expect(smartCaptureActions.processAllStored).toHaveBeenCalledWith('TestPilot', 901);
    });
    const gateEvent = dispatchSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'submission:ocr-gate') as CustomEvent | undefined;
    expect(gateEvent).toBeDefined();
    expect(gateEvent?.detail?.result).toBe('Win');
    expect(gateEvent?.detail?.matchId).toBe(901);
    dispatchSpy.mockRestore();
  });

  it('auto-promotes completed OCR through the gate when auto-open is enabled', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    appStoreState.ocrAutoOpenAfterRerun = true;
    appStoreState.pendingMatchData = { id: 501 };
    smartCaptureState.pendingData = {
      screenshotType: 'crew_hub',
      playerShip: undefined,
      playerTeamName: undefined,
      reachModifiers: [],
      enemyShips: [],
      teammates: [],
      opponentTeams: [],
      artifacts: ['capture.png'],
      overallConfidence: 84,
      captureTimestamp: Date.now(),
    };
    smartCaptureState.processingStatus = {
      phase: 'completed',
      message: 'Completed OCR for capture.png.',
    };

    render(<ActionPanel onSmartCaptureData={vi.fn()} />);

    await waitFor(() => {
      const gateEvent = dispatchSpy.mock.calls
        .map(([evt]) => evt as Event)
        .find((evt) => evt.type === 'submission:ocr-gate') as CustomEvent | undefined;
      expect(gateEvent).toBeDefined();
      expect(gateEvent?.detail?.matchId).toBe(501);
      expect(gateEvent?.detail?.result).toBeUndefined();
    });
    dispatchSpy.mockRestore();
  });

  it('emits processing OCR toast when smart capture enters processing', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    smartCaptureState.isProcessing = true;

    render(<ActionPanel />);

    expect(uiState.pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Processing OCR...',
      type: 'info',
      source: 'smart-capture',
    }));
  });

  it('shows granular OCR processing status message in overlay', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    smartCaptureState.isProcessing = true;
    smartCaptureState.processingStatus = {
      phase: 'analyzing',
      message: 'Analyzing cap-2.png (2/4)...',
    };

    render(<ActionPanel />);

    expect(screen.getByText('Analyzing cap-2.png (2/4)...')).toBeInTheDocument();
  });

  it('keeps prospector weapon/equipment telemetry labels out of ActionPanel', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    render(<ActionPanel />);

    expect(screen.queryByText('Prospector Weapons')).not.toBeInTheDocument();
    expect(screen.queryByText('Prospector Equipment')).not.toBeInTheDocument();
    expect(screen.queryByText('(auto)')).not.toBeInTheDocument();
  });

});

