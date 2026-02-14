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
  pendingReviews: [],
  detectedUnknowns: {},
};

const uiState = {
  setShowWizard: vi.fn(),
  activeUser: 'Alec',
  setShowReviewQueue: vi.fn(),
  setShowIdMapper: vi.fn(),
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
  reanalyzeCaptures: vi.fn(),
};

const initiateSubmission = vi.fn();

const appStoreState = {
  ocrMode: 'both',
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

    vi.clearAllMocks();
  });

  it('shows match recording header without redundant capture guidance', async () => {
    const { ActionPanel } = await import('./ActionPanel');

    render(<ActionPanel />);

    expect(screen.getByText(/match recording/i)).toBeInTheDocument();
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

  it('emits processing OCR toast when smart capture enters processing', async () => {
    const { ActionPanel } = await import('./ActionPanel');
    smartCaptureState.isProcessing = true;

    render(<ActionPanel />);

    expect(uiState.setToast).toHaveBeenCalledWith({ message: 'Processing OCR...', type: 'info' });
  });

});
