import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const loggerInfo = vi.fn();
const loggerWarn = vi.fn();
const getElectronAPIMock = vi.fn(() => null);
const discardTelemetryDraftMock = vi.fn();
const autoFinalizeResultScreenCaptureMock = vi.fn();
const startAutoCaptureMock = vi.fn();
const useResultFlashMonitorMock = vi.fn();
const useResultTextMonitorMock = vi.fn();
const sendGameUiActionMock = vi.fn();
const playCaptureMock = vi.fn();
const playAutomationStartMock = vi.fn();
const playAutomationCompleteMock = vi.fn();
const playAutomationFailedMock = vi.fn();

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
  showSetupWizard: false,
  setShowSetupWizard: vi.fn(),
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
  telemetryLifecycleStage: 'idle' as 'idle' | 'loading' | 'pregame' | 'live' | 'menu',
  setTelemetryLifecycleStage: vi.fn((stage: 'idle' | 'loading' | 'pregame' | 'live' | 'menu') => {
    uiState.telemetryLifecycleStage = stage;
  }),
  telemetryLifecycleIsPracticeRange: false,
  setTelemetryLifecycleIsPracticeRange: vi.fn((isPracticeRange: boolean) => {
    uiState.telemetryLifecycleIsPracticeRange = isPracticeRange;
  }),
  telemetryAutomationStatus: null as any,
  setTelemetryAutomationStatus: vi.fn((status: any) => {
    uiState.telemetryAutomationStatus = status;
    appStoreState.telemetryAutomationStatus = status;
  }),
  showSettings: false,
  setShowSettings: vi.fn(),
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
  setFullAutoEnabled: vi.fn((enabled: boolean) => {
    appStoreState.fullAutoEnabled = enabled;
  }),
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
    fullAutoEnabled: false,
    telemetryAutomationStatus: null as any,
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
    autoFinalizeResultScreenCapture: (...args: unknown[]) => autoFinalizeResultScreenCaptureMock(...args),
    discardTelemetryDraft: (...args: unknown[]) => discardTelemetryDraftMock(...args),
    submitting: false,
  }),
}));

vi.mock('./hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({
    playCapture: playCaptureMock,
    playAutomationStart: playAutomationStartMock,
    playAutomationComplete: playAutomationCompleteMock,
    playAutomationFailed: playAutomationFailedMock,
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
  isElectron: () => getElectronAPIMock() !== null,
}));

vi.mock('./utils/electronBridge', () => ({
  startAutoCapture: (...args: unknown[]) => startAutoCaptureMock(...args),
  sendGameUiAction: (...args: unknown[]) => sendGameUiActionMock(...args),
}));

vi.mock('./hooks/useResultMonitor', () => ({
  useResultMonitor: (options: Record<string, unknown>) => {
    useResultFlashMonitorMock({
      ...options,
      onFlashDetected: (payload?: { brightSinceMs?: number }) => (
        options?.onFlashDetected as ((payload: { brightSinceMs: number }) => void | Promise<void>) | undefined
      )?.({
        brightSinceMs: typeof payload?.brightSinceMs === 'number' ? payload.brightSinceMs : Date.now(),
      }),
    });
    useResultTextMonitorMock({
      ...options,
      onResultDetected: options?.onTextDetected,
    });
  },
}));

vi.mock('./hooks/useResultFlashMonitor', () => ({
  useResultFlashMonitor: (...args: unknown[]) => useResultFlashMonitorMock(...args),
}));

vi.mock('./hooks/useResultTextMonitor', () => ({
  useResultTextMonitor: (...args: unknown[]) => useResultTextMonitorMock(...args),
}));

vi.mock('./utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: (...args: unknown[]) => loggerInfo(...args),
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
    vi.useRealTimers();
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    loggerInfo.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
    getElectronAPIMock.mockReturnValue(null);
    discardTelemetryDraftMock.mockReset();
    autoFinalizeResultScreenCaptureMock.mockReset();
    autoFinalizeResultScreenCaptureMock.mockResolvedValue({ success: false, reason: 'unconfirmed' });
    startAutoCaptureMock.mockReset();
    startAutoCaptureMock.mockResolvedValue({ started: true });
    useResultFlashMonitorMock.mockReset();
    useResultTextMonitorMock.mockReset();
    sendGameUiActionMock.mockReset();
    sendGameUiActionMock.mockResolvedValue({ success: true, action: 'show-damage-sources', key: ']' });
    playCaptureMock.mockReset();
    playAutomationStartMock.mockReset();
    playAutomationCompleteMock.mockReset();
    playAutomationFailedMock.mockReset();
    uiState.activeUser = 'Pilot';
    uiState.activeView = 'recording';
    uiState.isOverlayMode = false;
    uiState.showChangelog = false;
    uiState.showSettings = false;
    uiState.showIdMapper = false;
    uiState.telemetryLifecycleStage = 'idle';
    uiState.telemetryLifecycleIsPracticeRange = false;
    uiState.telemetryAutomationStatus = null;
    uiState.setTelemetryAutomationStatus.mockClear();
    uiState.setTelemetryLifecycleStage.mockClear();
    uiState.setTelemetryLifecycleIsPracticeRange.mockClear();
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
    appStoreState.fullAutoEnabled = false;
    appStoreState.telemetryAutomationStatus = null;
    uiState.showSetupWizard = false;
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

  it('shows a one-time tactical map setup popup when no keybind is configured', async () => {
    appStoreState.tacticalMapKeybind = '';
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Set your Tactical Map key before using auto-sequence.'),
        type: 'warning',
        popup: true,
        action: expect.objectContaining({ label: 'Go to settings' }),
        deepLink: expect.objectContaining({
          type: 'openSettings',
          tab: 'ocr-capture',
          section: 'tactical map key',
        }),
      }));
    });

    expect(window.localStorage.getItem('wg_tactical_map_key_prompt_seen_v1')).toBe('1');
  });

  it('opens capture settings from the tactical map popup action', async () => {
    appStoreState.tacticalMapKeybind = '';
    const { default: App } = await import('./App');
    render(<App />);

    let tacticalPrompt: any;
    await waitFor(() => {
      tacticalPrompt = uiState.setToast.mock.calls
        .map(([payload]) => payload)
        .find((payload) => payload?.popup === true && String(payload?.message || '').includes('Tactical Map key'));
      expect(tacticalPrompt).toBeTruthy();
    });

    act(() => {
      tacticalPrompt.action.onClick();
    });

    expect(uiState.setShowSettings).toHaveBeenCalledWith(true);
    expect(window.sessionStorage.getItem('wg_settings_focus_section_v1')).toContain('"tab":"ocr-capture"');
    expect(window.sessionStorage.getItem('wg_settings_focus_section_v1')).toContain('"search":"tactical map key"');
  });

  it('does not show the tactical map popup again after it has already been seen', async () => {
    window.localStorage.setItem('wg_tactical_map_key_prompt_seen_v1', '1');
    appStoreState.tacticalMapKeybind = '';
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Welcome, Pilot! Tracking is ready.',
        type: 'success',
      }));
    });

    expect(uiState.setToast).not.toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Set your Tactical Map key before using auto-sequence.'),
      popup: true,
    }));
  });

  it('auto-enables full auto once setup is complete and the tactical map key is configured', async () => {
    const { default: App } = await import('./App');
    appStoreState.fullAutoEnabled = false;
    appStoreState.activeUser = 'Pilot';
    appStoreState.tacticalMapKeybind = 'Tab';
    uiState.showSetupWizard = false;

    render(<App />);

    await waitFor(() => {
      expect(appStoreState.setFullAutoEnabled).toHaveBeenCalledWith(true);
    });
    expect(window.localStorage.getItem('wg_full_auto_auto_enabled_after_setup_v1')).toBe('1');
  });

  it('does not auto-enable full auto again after the setup-triggered activation has already happened', async () => {
    window.localStorage.setItem('wg_full_auto_auto_enabled_after_setup_v1', '1');
    const { default: App } = await import('./App');
    appStoreState.fullAutoEnabled = false;
    appStoreState.activeUser = 'Pilot';
    appStoreState.tacticalMapKeybind = 'Tab';
    uiState.showSetupWizard = false;

    render(<App />);

    await waitFor(() => {
      expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Welcome, Pilot! Tracking is ready.',
        type: 'success',
      }));
    });
    expect(appStoreState.setFullAutoEnabled).not.toHaveBeenCalled();
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

  it('suppresses the telemetry-ready prompt when full auto falls back to manual handling', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    const { default: App } = await import('./App');
    render(<App />);

    act(() => {
      window.dispatchEvent(new CustomEvent('telemetry:draft-ready', {
        detail: { matchId: 321, duration: '12:34' },
      }));
    });

    expect(screen.queryByRole('region', { name: /telemetry match ready/i })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.queryByRole('region', { name: /telemetry match ready/i })).not.toBeInTheDocument();
    expect(uiState.setTelemetryAutomationStatus).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'manual-result-needed',
      message: 'Manual result needed',
      matchId: 321,
      level: 'warning',
    }));
    expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Use the recording view buttons if you want to finalize it manually.'),
      type: 'warning',
    }));
    vi.useRealTimers();
  });

  it('suppresses the deferred telemetry-ready prompt when the draft resolves first', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    const { default: App } = await import('./App');
    render(<App />);

    act(() => {
      window.dispatchEvent(new CustomEvent('telemetry:draft-ready', {
        detail: { matchId: 321, duration: '12:34' },
      }));
      vi.advanceTimersByTime(5_000);
      window.dispatchEvent(new CustomEvent('telemetry-draft:resolved', {
        detail: { matchId: 321 },
      }));
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.queryByRole('region', { name: /telemetry match ready/i })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('waits for a real result signal after telemetry draft ready instead of capturing immediately', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'menu';
    const draft = {
      id: 321,
      timestamp: Date.now(),
      date: '3/19/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'ready',
      artifacts: [],
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];
    const api = {
      invoke: vi.fn((channel: string, payload?: unknown) => {
        if (channel === 'telemetry-retention-status') {
          return Promise.resolve(null);
        }
        return Promise.resolve(payload ?? null);
      }),
      send: vi.fn(),
      on: vi.fn(() => vi.fn()),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    const { default: App } = await import('./App');
    render(<App />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('telemetry:draft-ready', {
        detail: { matchId: 321, duration: '12:34', readyTrigger: 'session-end' },
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    const captureCallsBeforeResolve = api.invoke.mock.calls.filter(([channel]) => channel === 'capture-screen').length;
    expect(captureCallsBeforeResolve).toBe(0);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('telemetry-draft:resolved', {
        detail: { matchId: 321 },
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    const captureCallsShortlyAfterResolve = api.invoke.mock.calls.filter(([channel]) => channel === 'capture-screen').length;
    expect(captureCallsShortlyAfterResolve).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    const captureCallsAfterResolve = api.invoke.mock.calls.filter(([channel]) => channel === 'capture-screen').length;
    expect(captureCallsAfterResolve).toBe(0);
    vi.useRealTimers();
  });

  it('waits briefly before showing manual fallback when telemetry draft ready came from a frontend return', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'menu';
    const draft = {
      id: 654,
      timestamp: Date.now(),
      date: '3/22/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'ready',
      artifacts: [],
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const api = {
      invoke: vi.fn(() => Promise.resolve(null)),
      send: vi.fn(),
      on: vi.fn(() => vi.fn()),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    const { default: App } = await import('./App');
    render(<App />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('telemetry:draft-ready', {
        detail: { matchId: 654, duration: '12:34', readyTrigger: 'frontend' },
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(1_999);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.invoke.mock.calls.filter(([channel]) => channel === 'capture-screen')).toHaveLength(0);
    expect(uiState.setTelemetryAutomationStatus).not.toHaveBeenCalledWith(expect.objectContaining({
      phase: 'manual-result-needed',
      message: 'Returned to menu before a result screen was confirmed',
      matchId: 654,
      level: 'warning',
    }));

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uiState.setTelemetryAutomationStatus).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'manual-result-needed',
      message: 'Returned to menu before a result screen was confirmed',
      matchId: 654,
      level: 'warning',
    }));
    vi.useRealTimers();
  });

  it('keeps result watchers enabled during telemetry menu stage for an active draft', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'menu';
    const draft = {
      id: 9876,
      timestamp: Date.now(),
      date: '3/21/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'ready',
      artifacts: [],
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const { default: App } = await import('./App');
    render(<App />);

    expect(useResultFlashMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 0,
      flashEnabled: true,
      textEnabled: true,
      armAnchorAt: expect.any(Number),
    }));
    expect(useResultTextMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 0,
      flashEnabled: true,
      textEnabled: true,
      armAnchorAt: expect.any(Number),
    }));
    vi.useRealTimers();
  });

  it('arms the flash watcher immediately in practice range', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'live';
    uiState.telemetryLifecycleIsPracticeRange = true;
    const draft = {
      id: 321,
      timestamp: Date.now(),
      date: '3/19/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const { default: App } = await import('./App');
    render(<App />);

    expect(useResultFlashMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 0,
      armAnchorAt: expect.any(Number),
    }));
    expect(useResultTextMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 0,
      armAnchorAt: expect.any(Number),
    }));

    expect(startAutoCaptureMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('arms the flash watcher immediately when the active draft is tagged as practice range', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'live';
    uiState.telemetryLifecycleIsPracticeRange = false;
    const draft = {
      id: 654,
      timestamp: Date.now(),
      date: '3/20/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      isPracticeRange: true,
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const { default: App } = await import('./App');
    render(<App />);

    expect(useResultFlashMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 0,
      armAnchorAt: expect.any(Number),
    }));
    expect(useResultTextMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 0,
      armAnchorAt: expect.any(Number),
    }));

    expect(startAutoCaptureMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not auto-start capture when standard/custom telemetry enters live', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'live';
    uiState.telemetryLifecycleIsPracticeRange = false;
    const draft = {
      id: 7070,
      timestamp: Date.now(),
      date: '3/21/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      matchMode: 'custom',
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const { default: App } = await import('./App');
    render(<App />);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });

    expect(startAutoCaptureMock).not.toHaveBeenCalled();
    expect(useResultFlashMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 0,
      armAnchorAt: expect.any(Number),
    }));
    expect(useResultTextMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 0,
      armAnchorAt: expect.any(Number),
    }));
    expect(uiState.setTelemetryAutomationStatus).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'watching-result-flash',
      message: 'Watching for match-end flash or result text',
      matchId: 7070,
    }));
    expect(uiState.setTelemetryAutomationStatus).not.toHaveBeenCalledWith(expect.objectContaining({
      phase: 'capturing-live-fallback',
    }));
    vi.useRealTimers();
  });

  it('arms Artifacts & Gates result monitoring from the first pregame detection without waiting for live', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'pregame';
    const draft = {
      id: 7171,
      timestamp: Date.now(),
      date: '3/21/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      matchMode: 'artifactsandgates',
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const { default: App } = await import('./App');
    render(<App />);

    expect(useResultFlashMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 120_000,
      flashEnabled: true,
      textEnabled: true,
      armAnchorAt: expect.any(Number),
    }));
    expect(useResultTextMonitorMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 120_000,
      flashEnabled: true,
      textEnabled: true,
      armAnchorAt: expect.any(Number),
    }));
    vi.useRealTimers();
  });

  it('restores Artifacts & Gates result monitoring at the five-minute fallback for the same draft', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'pregame';
    const draft = {
      id: 7272,
      timestamp: Date.now(),
      date: '3/21/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      matchMode: 'artifactsandgates',
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const { default: App } = await import('./App');
    const { rerender } = render(<App />);

    const initialOptions = useResultFlashMonitorMock.mock.calls.at(-1)?.[0] as {
      armAnchorAt?: number | null;
    };
    expect(initialOptions.armAnchorAt).toEqual(expect.any(Number));
    const initialArmAnchorAt = Number(initialOptions.armAnchorAt);

    await act(async () => {
      uiState.telemetryLifecycleStage = 'loading';
      rerender(<App />);
      await Promise.resolve();
    });

    expect(useResultFlashMonitorMock).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: false,
      armDelayMs: 120_000,
      armAnchorAt: initialArmAnchorAt,
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useResultFlashMonitorMock).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: true,
      armDelayMs: 120_000,
      armAnchorAt: initialArmAnchorAt,
      textEnabled: true,
    }));
    expect(loggerInfo).toHaveBeenCalledWith(
      'ResultMonitor',
      'Artifacts & Gates fallback restored result monitoring',
      expect.objectContaining({
        matchId: 7272,
        action: 'restore',
      }),
    );
    vi.useRealTimers();
  });

  it('clears the old Artifacts & Gates pregame anchor when the active draft changes', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'pregame';
    const firstDraft = {
      id: 7373,
      timestamp: Date.now(),
      date: '3/21/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      matchMode: 'artifactsandgates',
    };
    gameDataState.matches = [firstDraft];
    appStoreState.matches = [firstDraft];

    const { default: App } = await import('./App');
    const { rerender } = render(<App />);

    const firstAnchorAt = Number((useResultFlashMonitorMock.mock.calls.at(-1)?.[0] as {
      armAnchorAt?: number | null;
    }).armAnchorAt);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    const nextDraft = {
      ...firstDraft,
      id: 7474,
      timestamp: Date.now() + 1_000,
    };
    gameDataState.matches = [nextDraft];
    appStoreState.matches = [nextDraft];

    await act(async () => {
      rerender(<App />);
      await Promise.resolve();
    });

    const secondAnchorAt = Number((useResultFlashMonitorMock.mock.calls.at(-1)?.[0] as {
      armAnchorAt?: number | null;
    }).armAnchorAt);
    expect(secondAnchorAt).toEqual(expect.any(Number));
    expect(secondAnchorAt).not.toBe(firstAnchorAt);
    vi.useRealTimers();
  });

  it('fires the pregame lobby macro once after the delayed lobby settle window', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'pregame';
    const draft = {
      id: 8080,
      timestamp: Date.now(),
      date: '3/21/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      matchMode: 'artifactsandgates',
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const { default: App } = await import('./App');
    render(<App />);

    expect(startAutoCaptureMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(4_999);
      await Promise.resolve();
    });
    expect(startAutoCaptureMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startAutoCaptureMock).toHaveBeenCalledTimes(1);
    expect(startAutoCaptureMock).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 8080,
      telemetryLifecycleStage: 'pregame',
      isMatchInProgress: false,
    }));
    expect(loggerInfo).toHaveBeenCalledWith(
      'AutoCapture',
      expect.stringContaining('Pregame auto-capture triggered'),
    );

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(startAutoCaptureMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('moves Artifacts & Gates into watching-result as soon as lobby auto-capture completes', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'pregame';
    const draft = {
      id: 8123,
      timestamp: Date.now(),
      date: '3/22/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      matchMode: 'artifactsandgates',
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const api = {
      invoke: vi.fn(() => Promise.resolve(null)),
      on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
        handlers[channel] = callback;
        return vi.fn();
      }),
      send: vi.fn(),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    const { default: App } = await import('./App');
    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startAutoCaptureMock).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 8123,
      telemetryLifecycleStage: 'pregame',
    }));
    expect(handlers['auto-capture-status']).toBeTypeOf('function');

    act(() => {
      handlers['auto-capture-status']({
        phase: 'started',
        matchId: 8123,
      });
      handlers['auto-capture-status']({
        phase: 'completed',
        matchId: 8123,
      });
    });

    expect(uiState.setTelemetryAutomationStatus).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'watching-result-flash',
      message: 'Watching for match-end flash or result text',
      matchId: 8123,
      level: 'info',
    }));
    vi.useRealTimers();
  });

  it('does not auto-trigger the pregame lobby macro after a manual auto-sequence already ran for the same match', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'pregame';
    const draft = {
      id: 8181,
      timestamp: Date.now(),
      date: '3/22/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      matchMode: 'artifactsandgates',
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const api = {
      invoke: vi.fn(() => Promise.resolve(null)),
      on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
        handlers[channel] = callback;
        return vi.fn();
      }),
      send: vi.fn(),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    const { default: App } = await import('./App');
    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(handlers['auto-capture-status']).toBeTypeOf('function');

    act(() => {
      handlers['auto-capture-status']({
        phase: 'started',
        matchId: 8181,
      });
      handlers['auto-capture-status']({
        phase: 'completed',
        matchId: 8181,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startAutoCaptureMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('skips the pregame lobby macro for practice range even if the stage enters pregame', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'pregame';
    uiState.telemetryLifecycleIsPracticeRange = true;
    const draft = {
      id: 9090,
      timestamp: Date.now(),
      date: '3/21/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      isPracticeRange: true,
      matchMode: 'practice range',
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const { default: App } = await import('./App');
    render(<App />);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(startAutoCaptureMock).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledWith(
      'AutoCapture',
      expect.stringContaining('Skipping pregame auto-capture for practice range'),
    );
    vi.useRealTimers();
  });

  it('starts the result screenshot burst 400ms after flash detection', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'live';
    const draft = {
      id: 4321,
      timestamp: Date.now(),
      date: '3/20/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];
    autoFinalizeResultScreenCaptureMock.mockResolvedValue({ success: true });

    const api = {
      invoke: vi.fn((channel: string) => {
        if (channel === 'capture-screen') {
          return Promise.resolve('image-base64');
        }
        if (channel === 'save-screenshot') {
          return Promise.resolve({
            success: true,
            data: { filePath: 'C:\\match_artifacts\\4321\\capture_result.png' },
          });
        }
        if (channel === 'scan-result-screen') {
          return Promise.resolve({ data: { result: 'Win' } });
        }
        if (channel === 'telemetry-retention-status') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      }),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const { default: App } = await import('./App');
      render(<App />);

      const flashOptions = useResultFlashMonitorMock.mock.calls.at(-1)?.[0] as {
        onFlashDetected?: () => Promise<void>;
      };
      expect(flashOptions?.onFlashDetected).toBeTypeOf('function');

      let triggerPromise: Promise<void> | undefined;
      await act(async () => {
        triggerPromise = flashOptions.onFlashDetected?.();
        await Promise.resolve();
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Brain] Flash signal received - scheduling result capture in 400ms',
        expect.objectContaining({ matchId: 4321, delayMs: 400 }),
      );
      expect(api.invoke).not.toHaveBeenCalledWith('capture-screen');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(api.invoke).toHaveBeenCalledWith('capture-screen');
      expect(api.invoke).toHaveBeenCalledWith('save-screenshot', {
        imageBase64: 'image-base64',
        matchId: 4321,
      });

      // Advance past FULL_AUTO_FINAL_MOMENTS_SETTLE_MS (2000ms) so captureDamageSourcesArtifact completes.
      // capture-result-screen-region is not mocked here so tab1Base64 is null → returns null → [] artifacts.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      await triggerPromise;

      expect(autoFinalizeResultScreenCaptureMock).toHaveBeenCalledWith(expect.objectContaining({
        imageBase64: 'image-base64',
        resultData: expect.objectContaining({ result: 'Win', detectionMethod: 'flash' }),
        matchId: 4321,
        persistedPrimaryArtifactPath: 'C:\\match_artifacts\\4321\\capture_result.png',
        supplementalArtifacts: [],
      }));
      expect(api.invoke).not.toHaveBeenCalledWith('capture-result-screen-region', expect.anything());
    } finally {
      consoleLogSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('skips saving transition frames and loss follow-up crops when the primary flash capture has no result context', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'live';
    const draft = {
      id: 4322,
      timestamp: Date.now(),
      date: '3/20/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];
    autoFinalizeResultScreenCaptureMock.mockResolvedValue({ success: false, reason: 'unconfirmed' });

    const api = {
      invoke: vi.fn((channel: string) => {
        if (channel === 'capture-screen') {
          return Promise.resolve('image-base64');
        }
        if (channel === 'save-screenshot') {
          return Promise.resolve({
            success: true,
            data: { filePath: 'C:\\match_artifacts\\4322\\capture_result.png' },
          });
        }
        if (channel === 'scan-result-screen') {
          return Promise.resolve({ data: { result: null } });
        }
        if (channel === 'capture-result-screen-region') {
          return Promise.resolve({ success: false, imageBase64: null });
        }
        if (channel === 'telemetry-retention-status') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      }),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    const { default: App } = await import('./App');
    render(<App />);

    const flashOptions = useResultFlashMonitorMock.mock.calls.at(-1)?.[0] as {
      onFlashDetected?: () => Promise<void>;
    };
    expect(flashOptions?.onFlashDetected).toBeTypeOf('function');

    let triggerPromise: Promise<void> | undefined;
    await act(async () => {
      triggerPromise = flashOptions.onFlashDetected?.();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await triggerPromise;

    expect(api.invoke.mock.calls.filter(([channel]) => channel === 'capture-screen')).toHaveLength(1);
    expect(api.invoke.mock.calls.filter(([channel]) => channel === 'scan-result-screen')).toHaveLength(1);
    expect(api.invoke.mock.calls.filter(([channel]) => channel === 'save-screenshot')).toHaveLength(0);
    expect(api.invoke.mock.calls.filter(([channel]) => channel === 'capture-result-screen-region')).toHaveLength(0);
    expect(autoFinalizeResultScreenCaptureMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('ignores text tripwire once flash detection has already won for the match', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'live';
    const draft = {
      id: 4545,
      timestamp: Date.now(),
      date: '3/22/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
      matchMode: 'artifactsandgates',
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];
    autoFinalizeResultScreenCaptureMock.mockResolvedValue({ success: true });

    const api = {
      invoke: vi.fn((channel: string, payload?: any) => {
        if (channel === 'capture-screen') {
          return Promise.resolve('image-base64');
        }
        if (channel === 'save-screenshot') {
          return Promise.resolve({
            success: true,
            data: { filePath: 'C:\\match_artifacts\\4545\\capture_result.png' },
          });
        }
        if (channel === 'capture-result-screen-region') {
          return Promise.resolve({ success: false, imageBase64: null });
        }
        if (channel === 'scan-result-screen') {
          return Promise.resolve({ data: { result: 'Loss', winType: 'combat', placement: 4, detectionMethod: 'flash' } });
        }
        if (channel === 'telemetry-retention-status') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      }),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    const { default: App } = await import('./App');
    render(<App />);

    const flashOptions = useResultFlashMonitorMock.mock.calls.at(-1)?.[0] as {
      onFlashDetected?: () => Promise<void>;
    };
    const textOptions = useResultTextMonitorMock.mock.calls.at(-1)?.[0] as {
      onResultDetected?: (payload: {
        detectionMethod: 'text';
        result: 'Win' | 'Loss' | null;
        placement?: number;
        text?: string;
      }) => Promise<void>;
    };
    expect(flashOptions?.onFlashDetected).toBeTypeOf('function');
    expect(textOptions?.onResultDetected).toBeTypeOf('function');

    let flashPromise: Promise<void> | undefined;
    act(() => {
      flashPromise = flashOptions.onFlashDetected?.();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await textOptions.onResultDetected?.({
        detectionMethod: 'text',
        result: 'Loss',
        placement: 4,
        text: '4TH PLACE',
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flashPromise;

    const resultScanCalls = api.invoke.mock.calls.filter(([channel]) => channel === 'scan-result-screen');
    expect(resultScanCalls.length).toBeGreaterThan(0);
    expect(resultScanCalls.every(([, payload]) => payload?.detectionMethod === 'flash')).toBe(true);
    expect(autoFinalizeResultScreenCaptureMock).toHaveBeenCalledWith(expect.objectContaining({
      imageBase64: 'image-base64',
      resultData: expect.objectContaining({ result: 'Loss', detectionMethod: 'flash' }),
      matchId: 4545,
      persistedPrimaryArtifactPath: 'C:\\match_artifacts\\4545\\capture_result.png',
    }));
    vi.useRealTimers();
  });

  it('captures a cropped damage-sources follow-up when text detection wins the result race', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'live';
    const draft = {
      id: 5432,
      timestamp: Date.now(),
      date: '3/21/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];
    autoFinalizeResultScreenCaptureMock.mockResolvedValue({ success: true });

    const api = {
      invoke: vi.fn((channel: string, payload?: any) => {
        if (channel === 'capture-screen') {
          return Promise.resolve('image-base64');
        }
        if (channel === 'save-screenshot') {
          return Promise.resolve({
            success: true,
            data: { filePath: 'C:\\match_artifacts\\5432\\capture_result.png' },
          });
        }
        if (channel === 'scan-result-screen') {
          // First call: result-screen scan (no imageBase64 in payload matching damage-region)
          // Second call: tab1 discard check (imageBase64 = 'damage-region')
          if (payload?.imageBase64 === 'damage-region') {
            return Promise.resolve({ data: { result: 'Loss', damageTaken: 1234 } });
          }
          return Promise.resolve({ data: { result: 'Loss', winType: 'combat', placement: 4, detectionMethod: 'text' } });
        }
        if (channel === 'capture-result-screen-region') {
          return Promise.resolve({ success: true, imageBase64: 'damage-region' });
        }
        if (channel === 'telemetry-retention-status') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      }),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    const { default: App } = await import('./App');
    render(<App />);

    const textOptions = useResultTextMonitorMock.mock.calls.at(-1)?.[0] as {
      onResultDetected?: (payload: {
        detectionMethod: 'text';
        result: 'Win' | 'Loss' | null;
        placement?: number;
        text?: string;
      }) => Promise<void>;
    };
    expect(textOptions?.onResultDetected).toBeTypeOf('function');

    let triggerPromise: Promise<void> | undefined;
    await act(async () => {
      triggerPromise = textOptions.onResultDetected?.({
        detectionMethod: 'text',
        result: 'Loss',
        placement: 4,
        text: '4TH PLACE',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.invoke).not.toHaveBeenCalledWith('capture-screen');

    // Advance past the 50ms OCR delay so the initial result screenshot can run.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.invoke).toHaveBeenCalledWith('capture-screen');

    // After the initial capture, wait through the 2000ms settle before toggling to tab 2.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
      await Promise.resolve();
      await Promise.resolve();
      await triggerPromise;
    });

    expect(api.invoke).toHaveBeenCalledWith('scan-result-screen', {
      imageBase64: 'image-base64',
      detectionMethod: 'text',
    });
    expect(sendGameUiActionMock).toHaveBeenCalledWith('show-damage-sources');

    // Tab 1 and tab 2 are both fresh captures (no imageBase64 in payload)
    expect(api.invoke).toHaveBeenCalledWith('capture-result-screen-region', expect.objectContaining({
      cropRegion: expect.objectContaining({
        left: expect.any(Number),
        top: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
        normalized: true,
      }),
    }));
    expect(autoFinalizeResultScreenCaptureMock).toHaveBeenCalledWith(expect.objectContaining({
      imageBase64: 'image-base64',
      resultData: expect.objectContaining({
        result: 'Loss',
        placement: 4,
        detectionMethod: 'text',
      }),
      matchId: 5432,
      persistedPrimaryArtifactPath: 'C:\\match_artifacts\\5432\\capture_result.png',
      supplementalArtifacts: [
        { imageBase64: 'damage-region', kind: 'damage-sources' },
        { imageBase64: 'damage-region', kind: 'damage-ships' },
      ],
    }));
    vi.useRealTimers();
  });

  it('does not launch the old delayed practice-range auto-capture path', async () => {
    vi.useFakeTimers();
    appStoreState.fullAutoEnabled = true;
    uiState.telemetryLifecycleStage = 'live';
    uiState.telemetryLifecycleIsPracticeRange = true;
    const draft = {
      id: 654,
      timestamp: Date.now(),
      date: '3/19/2026',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Venture',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      artifacts: [],
    };
    gameDataState.matches = [draft];
    appStoreState.matches = [draft];

    const { default: App } = await import('./App');
    render(<App />);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });

    expect(startAutoCaptureMock).not.toHaveBeenCalled();
    vi.useRealTimers();
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

  it('keeps the auto-capture hotkey snapshot fresh with a heartbeat', async () => {
    const { default: App } = await import('./App');
    const api = {
      send: vi.fn(),
      invoke: vi.fn(() => Promise.resolve(null)),
      on: vi.fn(() => vi.fn()),
      removeAllListeners: vi.fn(),
    };
    getElectronAPIMock.mockReturnValue(api);

    render(<App />);

    await waitFor(() => {
      expect(api.send).toHaveBeenCalledWith('sync-auto-capture-hotkey-state', expect.any(Object));
    });

    const initialSendCount = api.send.mock.calls.length;

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 3_200));
    });

    expect(api.send.mock.calls.length).toBeGreaterThan(initialSendCount);
    expect(api.send).toHaveBeenLastCalledWith('sync-auto-capture-hotkey-state', expect.any(Object));
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

  it('surfaces detailed auto-capture failures from electron', async () => {
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
        phase: 'failed',
        matchId: 321,
        message: 'Auto-Capture failed at Step 1 — Open Tactical Map',
        detail: 'Open Tactical Map: Failed to confirm Wildgate focus before sending Open Tactical Map.',
      });
    });

    expect(loggerWarn).toHaveBeenCalledWith(
      'Hotkeys',
      'Received auto-capture failure status',
      expect.objectContaining({
        matchId: 321,
        detail: 'Open Tactical Map: Failed to confirm Wildgate focus before sending Open Tactical Map.',
      })
    );
    expect(uiState.setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Auto-Capture failed at Step 1 — Open Tactical Map Open Tactical Map: Failed to confirm Wildgate focus before sending Open Tactical Map.',
      type: 'error',
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

  it('does not add Unknown Player when promoting the friendly OCR team into teammates', async () => {
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
            { name: 'Unknown Player', confidence: 90 },
            { name: 'Wing2', confidence: 89 },
          ],
          confidence: 90,
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
      opponentTeams: [],
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
