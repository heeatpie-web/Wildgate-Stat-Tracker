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
  processAllStored: vi.fn().mockResolvedValue(undefined),
  clearError: vi.fn(),
  dismissPendingData: vi.fn(),
  getPendingData: vi.fn(() => smartCaptureState.pendingData),
  reanalyzeCaptures: vi.fn(),
};

const initiateSubmission = vi.fn();

const appStoreState = {
  ocrMode: 'both',
  resultOcrFlowMode: 'prompt',
  ocrAutoOpenAfterRerun: false,
  showSmartCaptureInHeader: false,
  resetMatchTrackingForNewMatch: vi.fn(),
  resetMatchMetricsForNewMatch: vi.fn(),
  pendingMatchData: null as any,
  matches: [] as any[],
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
    processFinalSubmission: vi.fn(),
    submitting: false,
  }),
}));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock('../SessionTimer', () => ({
  SessionTimer: () => <div data-testid="session-timer">SessionTimer</div>,
}));

describe('ActionPanel', () => {
  beforeEach(() => {
    Object.assign(gameData, {
      pendingReviews: [],
      detectedUnknowns: {},
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
    appStoreState.pendingMatchData = null;
    appStoreState.matches = [];
    appStoreState.resetMatchTrackingForNewMatch.mockClear();
    appStoreState.resetMatchMetricsForNewMatch.mockClear();
    smartCaptureActions.getPendingData.mockImplementation(() => smartCaptureState.pendingData);
    uiState.smartCaptureRequest = null;

    vi.clearAllMocks();
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

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /start match timer/i }));

    expect(appStoreState.resetMatchTrackingForNewMatch).toHaveBeenCalledTimes(1);
    expect(appStoreState.resetMatchMetricsForNewMatch).toHaveBeenCalledTimes(1);
    expect(gameData.setIsMatchInProgress).toHaveBeenCalledWith(true);
    expect(gameData.setMatchStartTime).toHaveBeenCalledWith(expect.any(Number));
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

  it('routes new captures to the active telemetry draft instead of a stale pending review during an in-progress match', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    gameData.isMatchInProgress = true;
    gameData.matches = [{
      id: 901,
      subType: 'Telemetry Draft',
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

