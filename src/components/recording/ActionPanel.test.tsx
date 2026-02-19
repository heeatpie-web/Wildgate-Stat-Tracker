import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  activeUser: 'Alec',
  setShowReviewQueue: vi.fn(),
  setShowIdMapper: vi.fn(),
  smartCaptureRequest: null as any,
  clearSmartCaptureRequest: vi.fn(),
  setToast: vi.fn(),
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
};

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
  useAppStore: (selector: any) => selector(appStoreState),
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

  it('falls back to smart scan when smart capture callback is not provided', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    render(<ActionPanel variant="transparent" />);
    fireEvent.click(screen.getByRole('button', { name: /smart capture/i }));

    expect(smartScan.handleSmartScan).toHaveBeenCalledTimes(1);
    expect(smartCaptureActions.capture).not.toHaveBeenCalled();
  });

  it('uses smart capture pipeline when smart capture callback is provided', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const onSmartCaptureData = vi.fn();

    render(<ActionPanel variant="transparent" onSmartCaptureData={onSmartCaptureData} />);
    fireEvent.click(screen.getByRole('button', { name: /smart capture/i }));

    await waitFor(() => {
      expect(smartCaptureActions.capture).toHaveBeenCalledWith('Alec');
    });
    expect(smartScan.handleSmartScan).not.toHaveBeenCalled();
  });

  it('consumes smart capture request from shared UI state channel', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    uiState.smartCaptureRequest = {
      requestId: 'header_1',
      activeUser: 'Alec',
      matchId: 42,
      source: 'header',
    };

    render(<ActionPanel />);

    await waitFor(() => {
      expect(smartCaptureActions.capture).toHaveBeenCalledWith('Alec', 42);
    });
    expect(uiState.clearSmartCaptureRequest).toHaveBeenCalledWith('header_1');
  });

  it('sends pending smart capture payload into review callback and clears pending state', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const onSmartCaptureData = vi.fn();
    const pendingPayload = { teammates: [{ name: 'Pilot' }] };
    smartCaptureState.pendingData = pendingPayload;
    smartCaptureState.capturedScreenshots = [{ id: '1' }];

    render(<ActionPanel onSmartCaptureData={onSmartCaptureData} />);
    fireEvent.click(screen.getByRole('button', { name: /review/i }));

    expect(onSmartCaptureData).toHaveBeenCalledWith(pendingPayload);
    expect(smartCaptureActions.dismissPendingData).toHaveBeenCalledTimes(1);
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
      expect(smartCaptureActions.processAllStored).toHaveBeenCalledWith('Alec', null);
    });
    expect(initiateSubmission).not.toHaveBeenCalled();

    const gateEvent = dispatchSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'submission:ocr-gate') as CustomEvent | undefined;
    expect(gateEvent).toBeDefined();
    expect(gateEvent?.detail?.result).toBe('Draw');
    dispatchSpy.mockRestore();
  });

  it('opens wizard immediately and processes queued OCR in background when configured', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    const onSmartCaptureData = vi.fn();
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
    smartCaptureState.savedCaptures = [{
      filePath: 'queued.png',
      filename: 'queued.png',
      timestamp: Date.now(),
      matchId: null,
      ocrProcessed: false,
    }];
    smartCaptureActions.getPendingData.mockReturnValue(reviewData);

    render(<ActionPanel onSmartCaptureData={onSmartCaptureData} />);
    fireEvent.click(screen.getByRole('button', { name: /win/i }));

    expect(initiateSubmission).toHaveBeenCalledWith('Win');
    expect(screen.queryByText(/queued smart captures detected/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(smartCaptureActions.processAllStored).toHaveBeenCalledWith('Alec', null);
    });
    expect(onSmartCaptureData).toHaveBeenCalledWith(reviewData);
  });

  it('emits processing OCR toast when smart capture enters processing', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    smartCaptureState.isProcessing = true;

    render(<ActionPanel />);

    expect(uiState.setToast).toHaveBeenCalledWith({ message: 'Processing OCR...', type: 'info' });
  });

  it('labels telemetry-detected prospector slots as auto-selected', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    gameData.currentLoadout = {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: [],
      equipment: [],
      characterWeapons: ['Bolt Rifle'],
      characterEquipment: ['Shield Matrix'],
    };

    render(<ActionPanel />);

    expect(screen.getByText('Prospector Weapons')).toBeInTheDocument();
    expect(screen.getByText('Prospector Equipment')).toBeInTheDocument();
    expect(screen.getAllByText('(auto)')).toHaveLength(2);
  });

});
