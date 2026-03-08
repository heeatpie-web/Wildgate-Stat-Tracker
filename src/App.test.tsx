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
  setNotificationsSuspended: vi.fn(),
  showChangelog: false,
  setShowChangelog: vi.fn(),
  showWizard: null as 'Win' | 'Loss' | 'Draw' | 'Match Result' | null,
  setShowWizard: vi.fn(),
  activeUser: 'Pilot',
  activeMode: 'Artifact Brawl',
  activeView: 'recording' as 'recording' | 'analytics' | 'smart-captures' | 'players' | 'id-mapper' | 'history' | 'dev-ocr',
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
  selectedTeammates: [] as string[],
  ocrLearningEnabled: false,
  resolveOcrAlias: vi.fn(() => ({ resolvedName: null, suggestedName: null, reason: 'none' })),
  ocrAutoApplyMinScore: 0.85,
  ocrAutoApplyMinCount: 2,
  ocrLearningStrictMode: false,
  ocrLearningReviewMode: 'balanced',
  ocrLearningAutoPromoteCount: 3,
  ocrCorrections: {},
  ocrAliasModel: {},
  matches: [] as any[],
  pendingMatchData: {},
  setPendingArtifactType: vi.fn(),
  setPendingMatchData: vi.fn(),
  updateMatch: vi.fn(),
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
vi.mock('./components/SettingsModal', () => ({ SettingsModal: () => (uiState.showSettings ? <div data-testid="settings-modal" /> : null) }));
vi.mock('./components/ResetConfirmModal', () => ({ ResetConfirmModal: () => <div data-testid="reset-confirm-modal" /> }));
vi.mock('./components/DevTools', () => ({ DevTools: () => <div data-testid="dev-tools" /> }));
vi.mock('./components/TelemetryPanel', () => ({ TelemetryPanel: () => <div data-testid="telemetry-panel" /> }));
vi.mock('./components/ReviewQueueModal', () => ({ ReviewQueueModal: () => <div data-testid="review-queue" /> }));
vi.mock('./components/Tutorial', () => ({ default: () => <div data-testid="tutorial" /> }));
vi.mock('./components/WindowResizer', () => ({ WindowResizer: () => <div data-testid="window-resizer" /> }));
vi.mock('./components/Toast', () => ({ Toast: ({ message }: { message: string }) => <div role="status">{message}</div> }));
vi.mock('./components/IdMapper', () => ({ IdMapper: () => <div data-testid="id-mapper" /> }));
describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    getElectronAPIMock.mockReturnValue(null);
    uiState.activeView = 'recording';
    uiState.isOverlayMode = false;
    uiState.showChangelog = false;
    uiState.showIdMapper = false;
    gameDataState.selectedOpponents = [];
    gameDataState.selectedReachModifiers = [];
    gameDataState.sessionTeams = {};
    gameDataState.sessionShipTypes = {};
    appStoreState.selectedTeammates = [];
    appStoreState.matches = [];
    appStoreState.pendingMatchData = {};
  });

  it('uses first-launch welcome copy before the app has ever been opened', async () => {
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Welcome, Pilot! Tracking is ready.',
        type: 'success',
      }));
    });
  });

  it('uses welcome-back copy after the first recorded launch', async () => {
    window.localStorage.setItem('wg_has_launched_before_v1', '1');
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Welcome back Pilot',
        type: 'success',
      }));
    });
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

  it('renders retention prompts in the top overlay layer via portal', async () => {
    const { default: App } = await import('./App');
    const api = {
      invoke: vi.fn((channel: string) => {
        if (channel === 'telemetry-retention-status') {
          return Promise.resolve({
            exceedsLimits: true,
            exceedsSize: true,
            exceedsAge: false,
            totalEntries: 12,
            sizeBytes: 1024,
            maxBytes: 512,
            maxAgeMs: 86400000,
            prunePreview: {
              wouldRemoveEntries: 4,
              wouldFreeBytes: 512,
              remainingBytes: 512,
            },
          });
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
      expect(screen.getByText(/telemetry retention needs cleanup/i)).toBeInTheDocument();
    });

    const overlayStack = document.querySelector('.fixed.z-top');
    expect(overlayStack).not.toBeNull();
    expect(overlayStack?.textContent).toContain('Telemetry retention needs cleanup');
  });

  it('renders changelog dialog semantics and closes on Escape', async () => {
    uiState.showChangelog = true;
    const { default: App } = await import('./App');
    render(<App />);

    expect(screen.getByRole('dialog', { name: /update/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(uiState.setShowChangelog).toHaveBeenCalledWith(false);
  });

  it('renders ID Mapper inline when routed to the ID Mapper tab', async () => {
    uiState.activeView = 'id-mapper';
    uiState.showIdMapper = true;
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('id-mapper')).toBeInTheDocument();
    });
  });

  it('reseeds OCR apply from the canonical match when gate matchId differs from pending draft', async () => {
    const { default: App } = await import('./App');
    appStoreState.pendingMatchData = {
      id: 12,
      result: 'Loss',
      artifacts: ['wrong-row.png'],
    };
    appStoreState.matches = [{
      id: 77,
      timestamp: 1_700_000_000_000,
      date: '1/1/2024',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: ['Wing1'],
      opponents: ['Enemy1'],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: ['Ionized'],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      artifacts: ['canonical.png'],
    }];

    render(<App />);

    const ocrPayload = {
      screenshotType: 'crew_hub',
      playerShip: { shipType: 'Bastion', confidence: 90 },
      playerTeamName: 'Friendly Team',
      reachModifiers: [{ name: 'Ionized', confidence: 80, rawText: 'Ionized' }],
      enemyShips: [],
      teammates: [{ name: 'Wing2', confidence: 90 }],
      opponentTeams: [{
        teamName: 'Enemy Team',
        shipType: 'Scout',
        color: 'red',
        players: [{ name: 'Enemy2', confidence: 88 }],
        confidence: 88,
      }],
      artifacts: ['ocr.png'],
      overallConfidence: 88,
      captureTimestamp: Date.now(),
    } as const;

    window.dispatchEvent(new CustomEvent('submission:ocr-gate', {
      detail: {
        result: 'Win',
        matchId: 77,
        data: ocrPayload,
      },
    }));

    await waitFor(() => {
      expect(appStoreState.setPendingMatchData).toHaveBeenCalledWith(expect.objectContaining({
        id: 77,
        ship: 'Bastion',
        teammates: ['Wing2'],
        opponents: ['Enemy2'],
        reachModifiers: ['Ionized'],
        artifacts: ['canonical.png', 'ocr.png'],
        ocrState: 'reviewing',
      }));
    });
    expect(appStoreState.updateMatch).toHaveBeenCalledWith(expect.objectContaining({
      id: 77,
      artifacts: ['canonical.png', 'ocr.png'],
      ocrState: 'reviewing',
    }));
    expect(uiState.setShowWizard).toHaveBeenCalledWith('Win');
  });
});

