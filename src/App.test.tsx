import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const loggerWarn = vi.fn();
const getElectronAPIMock = vi.fn(() => null);
const discardTelemetryDraftMock = vi.fn();
const playCaptureMock = vi.fn();

const buildRestoreSessionSnapshot = () => JSON.stringify({
  version: 1,
  savedAt: Date.now(),
  payload: {
    activeView: 'recording',
    showWizard: null,
    pendingMatchData: { player: 'Pilot' },
    selectedTeammates: [],
    selectedOpponents: [],
    sessionTeams: {},
    sessionShipTypes: {},
    activeShip: null,
    activeHero: null,
    activeWeapons: {},
    currentLoadout: null,
    selectedReachModifiers: [],
    timeMin: '',
    timeSec: '',
    damageTaken: '',
    kills: {},
    poiEasy: 0,
    poiMedium: 0,
    poiEpic: 0,
    pendingPlacement: null,
    pendingArtifactType: '',
    pendingKilledBy: '',
    pendingKilledByShip: '',
    matchStartTime: null,
    isMatchInProgress: false,
  },
});

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
  setMatches: vi.fn(),
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
  activeUser: 'Pilot',
  sessionStartTime: Date.now() - 1_000,
  startupSmartPreloadEnabled: false,
  adaptivePreloadEnabled: true,
  adaptivePreloadBudgetMs: 900,
  dashboardPreloadStats: {},
  recordDashboardPreloadVisit: vi.fn(),
  isAlwaysOnTop: false,
  isOverlayMode: false,
  activeHero: 'Venture',
  activeShip: 'Hunter (4 Player)',
  currentLoadout: null as any,
  selectedTeammates: [] as string[],
  ocrLearningEnabled: false,
  resolveOcrAlias: vi.fn(() => ({ resolvedName: null, suggestedName: null, reason: 'none' })),
  ocrAutoApplyMinScore: 0.85,
  ocrAutoApplyMinCount: 2,
  ocrLearningStrictMode: false,
  ocrLearningReviewMode: 'balanced',
  ocrLearningAutoPromoteCount: 3,
  autoSequenceOnCapture: false,
   autoCaptureSendKeypresses: true,
   autoCaptureWaitMultiplier: 1,
   tacticalMapKeybind: 'Tab',
   holdTacticalMapKey: false,
   ocrEnhancedNameRecoveryEnabled: true,
   ocrNameRerouteThreshold: 78,
   ocrRegions: {
     crewHub: {},
     mapScreen: {},
   },
   deviceDisplayInfo: null,
   gameResolution: null,
   isMatchInProgress: false,
  dismissedRosterCandidateKeys: [] as string[],
  ocrCorrections: {},
  ocrAliasModel: {},
  matches: [] as any[],
  addMatch: vi.fn((match: any) => {
    appStoreState.matches = [...appStoreState.matches, match];
  }),
  pendingMatchData: null as any,
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

vi.mock('./hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('./hooks/useMatchSubmission', () => ({
  useMatchSubmission: () => ({
    initiateSubmission: vi.fn(),
    processFinalSubmission: vi.fn(),
    saveResultDraft: vi.fn(),
    discardTelemetryDraft: (...args: unknown[]) => discardTelemetryDraftMock(...args),
    submitting: false,
  }),
}));

vi.mock('./hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({
    playCapture: playCaptureMock,
  }),
}));

vi.mock('./store/useAppStore', () => {
  const useAppStore = (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState);
  useAppStore.getState = () => appStoreState;
  useAppStore.subscribe = vi.fn(() => () => {});
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
vi.mock('./components/AnalyticsPanel', () => ({ default: () => <div data-testid="analytics-panel" /> }));
vi.mock('./components/HistoryTable', () => ({ default: () => <div data-testid="history-table" /> }));
vi.mock('./components/SmartCapturesPanel', () => ({ default: () => <div data-testid="smart-captures-panel" /> }));
vi.mock('./components/PlayerHub', () => ({ default: () => <div data-testid="player-hub" /> }));
vi.mock('./components/DevOCRPanel', () => ({ default: () => <div data-testid="dev-ocr-panel" /> }));
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
    discardTelemetryDraftMock.mockReset();
    playCaptureMock.mockReset();
    uiState.activeUser = 'Pilot';
    uiState.activeView = 'recording';
    uiState.isOverlayMode = false;
    uiState.showChangelog = false;
    uiState.showIdMapper = false;
    gameDataState.selectedOpponents = [];
    gameDataState.selectedReachModifiers = [];
    gameDataState.matches = [];
    gameDataState.sessionTeams = {};
    gameDataState.sessionShipTypes = {};
    gameDataState.setMatches.mockReset();
    appStoreState.selectedTeammates = [];
    appStoreState.dismissedRosterCandidateKeys = [];
    appStoreState.matches = [];
    appStoreState.addMatch.mockClear();
    appStoreState.activeUser = 'Pilot';
    appStoreState.sessionStartTime = Date.now() - 1_000;
    appStoreState.pendingMatchData = null;
    appStoreState.currentLoadout = null;
    appStoreState.autoSequenceOnCapture = false;
    appStoreState.autoCaptureSendKeypresses = true;
    appStoreState.autoCaptureWaitMultiplier = 1;
    appStoreState.tacticalMapKeybind = 'Tab';
    appStoreState.holdTacticalMapKey = false;
    appStoreState.deviceDisplayInfo = null;
    appStoreState.gameResolution = null;
    appStoreState.isMatchInProgress = false;
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

  it('shows restore session only after an unclean shutdown', async () => {
    window.localStorage.setItem('wg_restore_session_v1', buildRestoreSessionSnapshot());
    window.localStorage.setItem('wg_session_exit_state_v1', 'running');
    const { default: App } = await import('./App');
    render(<App />);

    expect(await screen.findByText('Restore Session')).toBeInTheDocument();
  });

  it('suppresses restore session after a clean shutdown', async () => {
    window.localStorage.setItem('wg_restore_session_v1', buildRestoreSessionSnapshot());
    window.localStorage.setItem('wg_session_exit_state_v1', 'clean');
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Restore Session')).not.toBeInTheDocument();
    });
  });

  it('marks the session clean during normal window unload', async () => {
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(window.localStorage.getItem('wg_session_exit_state_v1')).toBe('running');
    });

    fireEvent(window, new Event('beforeunload'));

    expect(window.localStorage.getItem('wg_session_exit_state_v1')).toBe('clean');
  });

  it('offers discard from the telemetry-ready prompt and confirms before cleanup', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    gameDataState.matches = [{
      id: 99,
      timestamp: Date.now(),
      date: '3/9/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
    }];
    const { default: App } = await import('./App');
    render(<App />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('telemetry:draft-ready', {
        detail: { matchId: 99, duration: '12:34' },
      }));
    });

    fireEvent.click(await screen.findByRole('button', { name: /discard match/i }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(
        'Discard this telemetry draft? Recorded screenshots will be deleted and the current submission state will be cleared.'
      );
      expect(discardTelemetryDraftMock).toHaveBeenCalledWith(99);
    });

    confirmSpy.mockRestore();
  });

  it('renders the telemetry match-start prompt as a centered dialog', async () => {
    const { default: App } = await import('./App');
    render(<App />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('telemetry:draft-started', {
        detail: { matchId: 321 },
      }));
    });

    expect(screen.getByRole('dialog', { name: /telemetry match detected/i })).toBeInTheDocument();
    expect(screen.getByText(/telemetry detected mission start/i)).toBeInTheDocument();
  });

  it('starts smart capture directly from the telemetry match-start prompt', async () => {
    const { default: App } = await import('./App');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    uiState.activeView = 'analytics';
    render(<App />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('telemetry:draft-started', {
        detail: { matchId: 321 },
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: /start smart capture/i }));

    expect(uiState.requestSmartCapture).toHaveBeenCalledWith(expect.objectContaining({
      activeUser: 'Pilot',
      source: 'telemetry-draft-prompt',
      matchId: 321,
      requestId: expect.stringMatching(/^telemetry-draft-321-/),
    }));

    const captureEvent = dispatchSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'smart-capture-request') as CustomEvent | undefined;
    expect(captureEvent).toBeDefined();
    expect(captureEvent?.detail).toEqual(expect.objectContaining({
      activeUser: 'Pilot',
      source: 'telemetry-draft-prompt',
      matchId: 321,
      requestId: 'req_1',
    }));
    expect(uiState.setActiveView).toHaveBeenCalledWith('recording');
    expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Smart Capture started. Opening Recording so you can capture immediately.',
      type: 'info',
    }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /telemetry match detected/i })).not.toBeInTheDocument();
    });

    dispatchSpy.mockRestore();
  });

  it('starts auto-sequence capture directly from the telemetry in-game event', async () => {
    const { default: App } = await import('./App');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    uiState.activeView = 'analytics';
    render(<App />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('telemetry:draft-ingame-auto-capture', {
        detail: { matchId: 321 },
      }));
    });

    expect(uiState.requestSmartCapture).toHaveBeenCalledWith(expect.objectContaining({
      activeUser: 'Pilot',
      source: 'telemetry-ingame-auto-capture',
      matchId: 321,
      behavior: 'auto-sequence',
      requestId: expect.stringMatching(/^telemetry-ingame-321-/),
    }));

    const captureEvent = dispatchSpy.mock.calls
      .map(([evt]) => evt as Event)
      .find((evt) => evt.type === 'smart-capture-request') as CustomEvent | undefined;
    expect(captureEvent).toBeDefined();
    expect(captureEvent?.detail).toEqual(expect.objectContaining({
      activeUser: 'Pilot',
      source: 'telemetry-ingame-auto-capture',
      matchId: 321,
      behavior: 'auto-sequence',
      requestId: 'req_1',
    }));
    expect(uiState.setActiveView).toHaveBeenCalledWith('recording');
    expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Telemetry marked the match as in-game. Starting Auto-Capture and opening Recording.',
      type: 'info',
    }));

    dispatchSpy.mockRestore();
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

  it('routes telemetry retention reminders into inbox notifications instead of auto-popup overlays', async () => {
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
      expect(uiState.pushNotification).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Telemetry retention needs cleanup. Open the prompt from Notifications when you are ready.',
        type: 'warning',
        source: 'telemetry',
        deepLink: { type: 'openTelemetryPrune' },
      }));
    });
    expect(screen.queryByText(/telemetry retention needs cleanup/i)).not.toBeInTheDocument();
  });

  it('syncs auto-capture hotkey state to electron on mount', async () => {
    const { default: App } = await import('./App');
    appStoreState.isMatchInProgress = true;
    appStoreState.matches = [{
      id: 321,
      subType: 'Telemetry Draft',
      timestamp: Date.now(),
      player: 'Pilot',
      artifacts: [],
    }];
    const api = {
      send: vi.fn(),
      invoke: vi.fn(() => Promise.resolve(null)),
      on: vi.fn(() => vi.fn()),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    render(<App />);

    await waitFor(() => {
      expect(api.send).toHaveBeenCalledWith('sync-auto-capture-hotkey-state', expect.objectContaining({
        activeUser: 'Pilot',
        isMatchInProgress: true,
        autoCaptureSendKeypresses: true,
        autoCaptureWaitMultiplier: 1,
        tacticalMapKeybind: 'Tab',
        matches: [
          expect.objectContaining({
            id: 321,
            subType: 'Telemetry Draft',
          }),
        ],
      }));
    });
    appStoreState.matches = [];
    appStoreState.isMatchInProgress = false;
  });

  it('syncs only recent telemetry drafts into the hotkey snapshot', async () => {
    const { default: App } = await import('./App');
    const now = Date.now();
    appStoreState.sessionStartTime = now;
    appStoreState.matches = [
      {
        id: 101,
        subType: 'Telemetry Draft',
        timestamp: now - 10_000,
        player: 'Pilot',
        artifacts: [],
      },
      {
        id: 102,
        subType: 'Telemetry Draft',
        timestamp: now - (7 * 60 * 60 * 1000),
        player: 'Pilot',
        artifacts: [],
      },
      {
        id: 103,
        subType: 'Manual Match',
        timestamp: now - 5_000,
        player: 'Pilot',
        artifacts: [],
      },
    ];
    const api = {
      send: vi.fn(),
      invoke: vi.fn(() => Promise.resolve(null)),
      on: vi.fn(() => vi.fn()),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    render(<App />);

    await waitFor(() => {
      expect(api.send).toHaveBeenCalledWith('sync-auto-capture-hotkey-state', expect.objectContaining({
        matches: [
          expect.objectContaining({ id: 101, subType: 'Telemetry Draft' }),
        ],
      }));
    });
  });

  it('clears auto-capture hotkey state on unmount', async () => {
    const { default: App } = await import('./App');
    const api = {
      send: vi.fn(),
      invoke: vi.fn(() => Promise.resolve(null)),
      on: vi.fn(() => vi.fn()),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(api.send).toHaveBeenCalledWith('sync-auto-capture-hotkey-state', expect.any(Object));
    });

    unmount();

    expect(api.send).toHaveBeenCalledWith('sync-auto-capture-hotkey-state', null);
  });

  it('plays the capture sound when auto-capture progress is reported from electron', async () => {
    const { default: App } = await import('./App');
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const api = {
      invoke: vi.fn(() => Promise.resolve(null)),
      send: vi.fn(),
      on: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
        handlers[channel] = cb;
        return vi.fn();
      }),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    render(<App />);

    await waitFor(() => {
      expect(handlers['auto-capture-status']).toBeTypeOf('function');
    });

    act(() => {
      handlers['auto-capture-status']({
        phase: 'capture-started',
        captureIndex: 2,
        totalCaptures: 3,
        matchId: 321,
      });
    });

    expect(playCaptureMock).toHaveBeenCalledTimes(1);

    act(() => {
      handlers['auto-capture-status']({
        phase: 'capture-progress',
        captureIndex: 2,
        totalCaptures: 3,
        matchId: 321,
        filePath: 'C:\\match_artifacts\\321\\capture_2.png',
      });
    });

    expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: '2/3',
      type: 'info',
    }));
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
      artifactType: 'ice',
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
        artifactSource: 'ice',
        artifacts: ['canonical.png', 'ocr.png'],
        ocrState: 'reviewing',
      }));
    });
    expect(appStoreState.updateMatch).toHaveBeenCalledWith(expect.objectContaining({
      id: 77,
      artifactSource: 'ice',
      artifacts: ['canonical.png', 'ocr.png'],
      ocrState: 'reviewing',
    }));
    expect(gameDataState.setSelectedOpponents).not.toHaveBeenCalled();
    expect(gameDataState.setSessionTeams).not.toHaveBeenCalled();
    expect(gameDataState.setSessionShipTypes).not.toHaveBeenCalled();
    expect(appStoreState.setPendingArtifactType).toHaveBeenCalledWith('ice');
    expect(uiState.setShowWizard).toHaveBeenCalledWith('Win');
  });

  it('preserves string reach modifiers when OCR gate data comes from queued startup captures', async () => {
    const { default: App } = await import('./App');
    render(<App />);

    const ocrPayload: any = {
      screenshotType: 'crew_hub',
      playerShip: { shipType: 'Bastion', confidence: 90 },
      playerTeamName: 'Friendly Team',
      reachModifiers: ['Ionized', 'Artifact: Ice'],
      artifactType: 'ice',
      enemyShips: [],
      teammates: [],
      opponentTeams: [],
      overallConfidence: 86,
      captureTimestamp: Date.now(),
    };

    window.dispatchEvent(new CustomEvent('submission:ocr-gate', {
      detail: {
        result: 'Win',
        data: ocrPayload,
      },
    }));

    await waitFor(() => {
      expect(gameDataState.setSelectedReachModifiers).toHaveBeenCalledWith(['Ionized', 'Artifact: Ice'], 'manual');
      expect(appStoreState.setPendingMatchData).toHaveBeenCalledWith(expect.objectContaining({
        ship: 'Bastion',
        reachModifiers: ['Ionized', 'Artifact: Ice'],
        artifactSource: 'ice',
        ocrState: 'reviewing',
      }));
    });
    expect(uiState.setShowWizard).toHaveBeenCalledWith('Win');
  });

  it('drops OCR opponent teams that duplicate the friendly roster', async () => {
    const { default: App } = await import('./App');
    appStoreState.selectedTeammates = ['Wing1'];
    appStoreState.pendingMatchData = {
      teammates: ['Wing1'],
      ship: 'Hunter',
    };

    render(<App />);

    const ocrPayload = {
      screenshotType: 'crew_hub',
      playerShip: { shipType: 'Hunter', teamName: 'Starlight', confidence: 92 },
      playerTeamName: 'Starlight',
      playerShipName: "Starlight's Crew",
      reachModifiers: [],
      enemyShips: [],
      teammates: [],
      opponentTeams: [
        {
          teamName: 'Starlight',
          shipType: 'Hunter',
          color: 'blue',
          players: [
            { name: 'Pilot', confidence: 93 },
            { name: 'Wing1', confidence: 90 },
            { name: 'Wing2', confidence: 89 },
          ],
          confidence: 90,
        },
        {
          teamName: 'Enemy Team',
          shipType: 'Scout',
          color: 'red',
          players: [{ name: 'Enemy1', confidence: 88 }],
          confidence: 88,
        },
      ],
      artifacts: ['ocr.png'],
      overallConfidence: 90,
      captureTimestamp: Date.now(),
    } as const;

    window.dispatchEvent(new CustomEvent('submission:ocr-gate', {
      detail: {
        result: 'Win',
        data: ocrPayload,
      },
    }));

    await waitFor(() => {
      expect(gameDataState.setSelectedTeammates).toHaveBeenCalledWith(['Wing1', 'Wing2']);
    });

    expect(appStoreState.setPendingMatchData).toHaveBeenCalledWith(expect.objectContaining({
      teammates: ['Wing1', 'Wing2'],
      opponents: ['Enemy1'],
      opponentTeams: [
        expect.objectContaining({
          teamName: 'Enemy Team',
          players: ['Enemy1'],
        }),
      ],
      ocrState: 'reviewing',
    }));
  });

  it('uses the latest active user when OCR gate data arrives after a user switch', async () => {
    const { default: App } = await import('./App');
    const { rerender } = render(<App />);

    uiState.activeUser = 'Ace';
    rerender(<App />);

    const ocrPayload = {
      screenshotType: 'crew_hub',
      playerShip: { shipType: 'Hunter', confidence: 92 },
      playerTeamName: '',
      playerShipName: '',
      reachModifiers: [],
      enemyShips: [],
      teammates: [],
      opponentTeams: [
        {
          teamName: 'Enemy Team',
          shipType: 'Scout',
          color: 'blue',
          players: [
            { name: 'Ace', confidence: 93 },
            { name: 'Enemy1', confidence: 88 },
          ],
          confidence: 90,
        },
      ],
      artifacts: ['ocr.png'],
      overallConfidence: 90,
      captureTimestamp: Date.now(),
    } as const;

    act(() => {
      window.dispatchEvent(new CustomEvent('submission:ocr-gate', {
        detail: {
          result: 'Win',
          data: ocrPayload,
        },
      }));
    });

    await waitFor(() => {
      expect(appStoreState.setPendingMatchData).toHaveBeenCalledWith(expect.objectContaining({
        teammates: ['Enemy1'],
        opponents: [],
        opponentTeams: [],
      }));
    });
  });
});
