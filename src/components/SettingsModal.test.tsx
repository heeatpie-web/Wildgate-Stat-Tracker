import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const userPrefs = {
  appearanceMode: 'twilight' as const,
  setAppearanceMode: vi.fn(),
  colorTheme: 'ocean',
  setColorTheme: vi.fn(),
  customHue: '180',
  setCustomHue: vi.fn(),
  disableAnimations: false,
  setDisableAnimations: vi.fn(),
  performanceMode: false,
  setPerformanceMode: vi.fn(),
  soundEnabled: true,
  setSoundEnabled: vi.fn(),
  showSessionTimer: true,
  setShowSessionTimer: vi.fn(),
  customBgUrl: '',
  setCustomBgUrl: vi.fn(),
  overlayStyle: 'compact' as const,
  setOverlayStyle: vi.fn(),
};

const uiState = {
  showSettings: true,
  setShowSettings: vi.fn(),
  isOverlayMode: false,
  updateStatus: 'idle',
  setUpdateStatus: vi.fn(),
  setToast: vi.fn(),
  setShowResetConfirm: vi.fn(),
  setShowTutorial: vi.fn(),
  setNotificationsSuspended: vi.fn(),
  activeUser: 'Pilot',
  enableAutoLogRecording: true,
  setEnableAutoLogRecording: vi.fn(),
  setShowIdMapper: vi.fn(),
  devMode: false,
  setDevMode: vi.fn(),
};

const gameData = {
  matches: [],
  players: ['Pilot'],
  pilotRegistry: ['Pilot'],
};

const storeState = {
  captureMode: 'auto',
  setCaptureMode: vi.fn(),
  resultOcrFlowMode: 'prompt',
  setResultOcrFlowMode: vi.fn(),
  ocrAutoOpenAfterRerun: false,
  setOcrAutoOpenAfterRerun: vi.fn(),
  showSmartCaptureInHeader: true,
  setShowSmartCaptureInHeader: vi.fn(),
  tipsEnabled: true,
  setTipsEnabled: vi.fn(),
  telemetryPerformanceProfile: 'balanced',
  setTelemetryPerformanceProfile: vi.fn(),
  adaptiveTelemetryPollingEnabled: true,
  setAdaptiveTelemetryPollingEnabled: vi.fn(),
  startupSmartPreloadEnabled: true,
  setStartupSmartPreloadEnabled: vi.fn(),
  ocrEnhancedNameRecoveryEnabled: true,
  setOcrEnhancedNameRecoveryEnabled: vi.fn(),
  ocrNameRerouteThreshold: 78,
  setOcrNameRerouteThreshold: vi.fn(),
  ocrLearningEnabled: true,
  setOcrLearningEnabled: vi.fn(),
  ocrAutoApplyMinScore: 0.83,
  setOcrAutoApplyMinScore: vi.fn(),
  ocrAutoApplyMinCount: 3,
  setOcrAutoApplyMinCount: vi.fn(),
  ocrLearningStrictMode: true,
  setOcrLearningStrictMode: vi.fn(),
  ocrLearningReviewMode: 'balanced',
  setOcrLearningReviewMode: vi.fn(),
  ocrLearningAutoPromoteCount: 3,
  setOcrLearningAutoPromoteCount: vi.fn(),
  ocrLearningQueueEnabled: true,
  setOcrLearningQueueEnabled: vi.fn(),
  adaptivePreloadEnabled: true,
  setAdaptivePreloadEnabled: vi.fn(),
  adaptivePreloadBudgetMs: 900,
  setAdaptivePreloadBudgetMs: vi.fn(),
  ocrBestGuessThresholds: {
    merged: { player: 78, mod: 80, ship: 60 },
    local: { player: 84, mod: 87, ship: 68 },
    lowConfidenceBump: 4,
  },
  setOcrBestGuessThresholds: vi.fn(),
  resetBestGuessThresholds: vi.fn(),
  ocrAliasModel: { entries: {}, blocklist: {} },
  ocrLearningEvents: [],
  ocrLearningQueue: [],
  recordOcrAliasCorrection: vi.fn(),
  removeOcrAliasCorrection: vi.fn(),
  blockOcrAlias: vi.fn(),
  unblockOcrAlias: vi.fn(),
  clearResolvedOcrLearningEvents: vi.fn(),
  rollbackOcrLearningEvent: vi.fn(),
  dashboardPreloadStats: {
    analytics: { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
    history: { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
    'smart-captures': { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
    players: { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
    'dev-ocr': { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
  },
  resetDashboardPreloadStats: vi.fn(),
  tutorialCompleted: false,
  enableAutoBackup: true,
  setEnableAutoBackup: vi.fn(),
  ocrRegions: {
    crewHub: {
      leftPanel: { xMin: 0, xMax: 0.48, yMin: 0.05, yMax: 0.85 },
      enemyPanel: { xMin: 0.55, xMax: 1, yMin: 0.08, yMax: 0.95 },
      teamHeader: { xMin: 0, xMax: 0.5, yMin: 0.02, yMax: 0.15 },
      enemyName: { xMin: 0.63, xMax: 0.92, yMin: 0.08, yMax: 0.95 },
    },
    mapScreen: {
      yourShip: { xMin: 0, xMax: 0.3, yMin: 0, yMax: 0.25 },
      enemyShips: { xMin: 0.79, xMax: 0.98, yMin: 0.07, yMax: 0.22 },
      enemyShips2: { xMin: 0.79, xMax: 0.98, yMin: 0.22, yMax: 0.37 },
      enemyShips3: { xMin: 0.79, xMax: 0.98, yMin: 0.37, yMax: 0.52 },
      enemyShips4: { xMin: 0.79, xMax: 0.98, yMin: 0.52, yMax: 0.67 },
      hazards: { xMin: 0.6, xMax: 1, yMin: 0.28, yMax: 0.63 },
      players: { xMin: 0, xMax: 0.4, yMin: 0.7, yMax: 1 },
    },
  },
  setOcrRegions: vi.fn(),
};

vi.mock('../providers/UserPreferencesProvider', () => ({
  useUserPreferences: () => userPrefs,
}));

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => React.createRef<HTMLDivElement>(),
}));

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('../utils/electronAPI', () => ({
  getElectronAPI: () => null,
}));

vi.mock('../utils/storage', () => ({
  StorageService: {
    init: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('./OcrRegionEditorModal', () => ({
  default: () => null,
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userPrefs.customBgUrl = '';
    uiState.showSettings = true;
    uiState.isOverlayMode = false;
    storeState.captureMode = 'auto';
    storeState.resultOcrFlowMode = 'prompt';
  });

  it('renders the widened desktop dialog and keeps interface controls above background url', async () => {
    const { SettingsModal } = await import('./SettingsModal');
    const { container } = render(<SettingsModal />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-w-7xl');

    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Interface' })).toBeInTheDocument();
    expect(screen.getByText('Workspace Background')).toBeInTheDocument();

    const textContent = container.textContent || '';
    expect(textContent.indexOf('Performance Mode')).toBeLessThan(textContent.indexOf('Background URL'));
    expect(textContent.indexOf('Session Timer')).toBeLessThan(textContent.indexOf('Background URL'));
    expect(textContent.indexOf('Sound Effects')).toBeLessThan(textContent.indexOf('Background URL'));
  });

  it('routes telemetry search results to the data tab', async () => {
    const { SettingsModal } = await import('./SettingsModal');
    render(<SettingsModal />);

    fireEvent.change(screen.getByPlaceholderText(/search settings/i), {
      target: { value: 'telemetry' },
    });
    fireEvent.click(screen.getByRole('button', { name: /telemetry performance/i }));

    expect(screen.getByText('Telemetry & Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Telemetry Monitoring')).toBeInTheDocument();
  });

  it('uses a wrapping quick setup grid on the OCR tab', async () => {
    const { SettingsModal } = await import('./SettingsModal');
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole('button', { name: /ocr\/capture/i }));

    const grid = screen.getByTestId('settings-quick-setup-grid');
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' });
    expect(screen.getByText('Capture')).toBeInTheDocument();
    expect(screen.getByText('Capture Defaults')).toBeInTheDocument();
  });
});
