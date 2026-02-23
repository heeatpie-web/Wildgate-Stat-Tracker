import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const loggerWarn = vi.fn();
const getElectronAPIMock = vi.fn(() => null);

const uiState = {
  isOverlayMode: false,
  setIsOverlayMode: vi.fn(),
  showTutorial: false,
  setShowTutorial: vi.fn(),
  showChangelog: false,
  setShowChangelog: vi.fn(),
  showWizard: null as 'Win' | 'Loss' | 'Draw' | 'Match Result' | null,
  setShowWizard: vi.fn(),
  activeUser: 'Pilot',
  activeMode: 'Artifact Brawl',
  activeView: 'recording' as 'recording' | 'analytics' | 'smart-captures' | 'players' | 'history' | 'dev-ocr',
  setActiveView: vi.fn(),
  pushNotification: vi.fn(),
  toast: null as { message: string; type?: 'success' | 'error' | 'warning' | 'info' | 'tip'; durationMs?: number } | null,
  setToast: vi.fn(),
  dismissActiveNotification: vi.fn(),
  updateStatus: 'idle',
  setUpdateStatus: vi.fn(),
  hiddenForScan: false,
  showReviewQueue: false,
  setShowReviewQueue: vi.fn(),
  requestSmartCapture: vi.fn().mockReturnValue('req_1'),
  showIdMapper: false,
  setShowIdMapper: vi.fn(),
  sidebarCollapsed: false,
  setSidebarCollapsed: vi.fn(),
};

const gameDataState = {
  matches: [],
  sessionStartTime: Date.now() - 1_000,
  setPendingMatchData: vi.fn(),
  pilotRegistry: [],
  setSelectedTeammates: vi.fn(),
  selectedOpponents: [],
  setSelectedOpponents: vi.fn(),
  activeShip: 'Hunter (4 Player)',
  setActiveShip: vi.fn(),
  selectedReachModifiers: [],
  setSelectedReachModifiers: vi.fn(),
  addPendingReview: vi.fn(),
  pendingReviews: [],
  sessionTeams: {},
  setSessionTeams: vi.fn(),
  setSessionShipTypes: vi.fn(),
};

const appStoreState = {
  setTutorialCompleted: vi.fn(),
  isLoading: false,
  startupSmartPreloadEnabled: false,
  adaptivePreloadEnabled: true,
  adaptivePreloadBudgetMs: 900,
  dashboardPreloadStats: {},
  recordDashboardPreloadVisit: vi.fn(),
  isAlwaysOnTop: false,
  isOverlayMode: false,
  activeShip: 'Hunter (4 Player)',
  pendingMatchData: {},
  setPendingArtifactType: vi.fn(),
  setPendingMatchData: vi.fn(),
};

vi.mock('./providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('./providers/GameDataProvider', () => ({
  useGameData: () => gameDataState,
}));

vi.mock('./providers/UserPreferencesProvider', () => ({
  useUserPreferences: () => ({
    overlayStyle: 'compact',
    soundEnabled: false,
    performanceMode: false,
  }),
}));

vi.mock('./hooks/useLogMonitor', () => ({
  useLogMonitor: () => ({ logFeed: [], logStatus: {} }),
}));

vi.mock('./hooks/useDiscordRPC', () => ({
  useDiscordRPC: vi.fn(),
}));

vi.mock('./hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('./store/useAppStore', () => {
  const useAppStore = (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState);
  useAppStore.getState = () => appStoreState;
  return { useAppStore };
});

vi.mock('./utils/electronAPI', () => ({
  getElectronAPI: () => getElectronAPIMock(),
}));

vi.mock('./utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: vi.fn(),
    captureException: vi.fn(),
  },
}));

vi.mock('./components/Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock('./components/RecordingView', () => ({ RecordingView: () => <div data-testid="recording-view" /> }));
vi.mock('./components/Header', () => ({ Header: () => <div data-testid="header" /> }));
vi.mock('./components/WindowFrame', () => ({ WindowFrame: () => <div data-testid="window-frame" /> }));
vi.mock('./components/OverlayView', () => ({ OverlayView: () => <div data-testid="overlay-view" /> }));
vi.mock('./components/Wizard', () => ({ Wizard: () => <div data-testid="wizard" /> }));
vi.mock('./components/RenameModal', () => ({ RenameModal: () => <div data-testid="rename-modal" /> }));
vi.mock('./components/DrillDownOverlay', () => ({ DrillDownOverlay: () => <div data-testid="drilldown" /> }));
vi.mock('./components/SettingsModal', () => ({ SettingsModal: () => <div data-testid="settings-modal" /> }));
vi.mock('./components/ResetConfirmModal', () => ({ ResetConfirmModal: () => <div data-testid="reset-confirm-modal" /> }));
vi.mock('./components/DevTools', () => ({ DevTools: () => <div data-testid="dev-tools" /> }));
vi.mock('./components/TelemetryPanel', () => ({ TelemetryPanel: () => <div data-testid="telemetry-panel" /> }));
vi.mock('./components/ReviewQueueModal', () => ({ ReviewQueueModal: () => <div data-testid="review-queue" /> }));
vi.mock('./components/Tutorial', () => ({ default: () => <div data-testid="tutorial" /> }));
vi.mock('./components/WindowResizer', () => ({ WindowResizer: () => <div data-testid="window-resizer" /> }));
vi.mock('./components/Toast', () => ({ Toast: ({ message }: { message: string }) => <div role="status">{message}</div> }));
vi.mock('./components/IdMapper', () => ({ IdMapper: () => <div data-testid="id-mapper" /> }));
vi.mock('./components/ocr/OCRReviewModal', () => ({ OCRReviewModal: () => <div data-testid="ocr-review-modal" /> }));

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getElectronAPIMock.mockReturnValue(null);
    uiState.activeView = 'recording';
    uiState.isOverlayMode = false;
    uiState.showChangelog = false;
    uiState.showIdMapper = false;
  });

  it('renders recording view in default dashboard mode', async () => {
    const { default: App } = await import('./App');
    render(<App />);
    expect(screen.getByTestId('recording-view')).toBeInTheDocument();
  });

  it('logs telemetry retention status invoke failures instead of silently swallowing them', async () => {
    const { default: App } = await import('./App');
    const api = {
      invoke: vi.fn((channel: string) => {
        if (channel === 'telemetry-retention-status') {
          return Promise.reject(new Error('invoke failed'));
        }
        return Promise.resolve(null);
      }),
      send: vi.fn(),
      on: vi.fn(() => vi.fn()),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    render(<App />);

    await waitFor(() => {
      expect(loggerWarn).toHaveBeenCalledWith(
        'TelemetryRetention',
        'Failed to read telemetry retention status',
        expect.any(Error)
      );
    });
  });

  it('renders changelog dialog semantics and closes on Escape', async () => {
    uiState.showChangelog = true;
    const { default: App } = await import('./App');
    render(<App />);

    expect(screen.getByRole('dialog', { name: /update/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(uiState.setShowChangelog).toHaveBeenCalledWith(false);
  });

  it('renders id mapper dialog semantics and closes on Escape', async () => {
    uiState.showIdMapper = true;
    const { default: App } = await import('./App');
    render(<App />);

    expect(screen.getAllByRole('dialog', { name: /id mapper/i }).length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(uiState.setShowIdMapper).toHaveBeenCalledWith(false);
  });
});
