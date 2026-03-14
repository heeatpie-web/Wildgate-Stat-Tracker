import { StateCreator } from 'zustand';
import { GameMode, ColorblindMode, Language, VisualMode } from '../../types';
import type { OcrCalibration } from '../../utils/scan/types';
import { normalizeOcrBatchThreshold } from '../../utils/ocrBatchActions';
import {
  appendCalibrationSample,
  buildCalibrationBuckets,
  OCR_CALIBRATION_MAX_SAMPLES,
  recommendCalibrationThreshold,
} from '../../utils/ocrCalibration';
import type { CalibrationSample } from '../../utils/ocrCalibration';

/** Visual style variant for the in-game overlay. */
export type OverlayStyle = 'compact' | 'transparent';

/** OCR engine mode (local OCR only). */
export type OcrMode = 'local';

/** Capture behavior: auto runs OCR immediately, deferred saves screenshot first. */
export type CaptureMode = 'auto' | 'deferred';
/** Result-click OCR behavior when queued captures exist. */
export type ResultOcrFlowMode = 'prompt' | 'background';

/** Telemetry monitoring profile: favors lower heat, balanced behavior, or faster updates. */
export type TelemetryPerformanceProfile = 'low-power' | 'balanced' | 'high-accuracy';
export type OcrThresholdRecommendationMode = 'manual' | 'assisted' | 'auto';
export type OcrLearningReviewMode = 'conservative' | 'balanced' | 'aggressive';
export type DashboardPreloadView = 'analytics' | 'history' | 'smart-captures' | 'players' | 'dev-ocr';
export const OCR_NAME_REROUTE_THRESHOLD_MIN = 50;
export const OCR_NAME_REROUTE_THRESHOLD_MAX = 95;
export const OCR_NAME_REROUTE_THRESHOLD_DEFAULT = 78;

export interface OcrBestGuessThresholds {
  merged: { player: number; mod: number; ship: number };
  local: { player: number; mod: number; ship: number };
  lowConfidenceBump: number;
}

export interface OcrThresholdHistoryEntry {
  timestamp: number;
  source: string;
  thresholds: OcrBestGuessThresholds;
}

export interface DashboardPreloadStat {
  openDurationsMs: number[];
  switchCount: number;
  lastVisitedAt: number;
}

export interface OcrRegionBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface OcrRegionSettings {
  crewHub: {
    leftPanel: OcrRegionBounds;
    enemyPanel: OcrRegionBounds;
    teamHeader: OcrRegionBounds;
    enemyName: OcrRegionBounds;
  };
  mapScreen: {
    yourShip: OcrRegionBounds;
    enemyShips: OcrRegionBounds;
    enemyShips2: OcrRegionBounds;
    enemyShips3: OcrRegionBounds;
    enemyShips4: OcrRegionBounds;
    hazards: OcrRegionBounds;
    players: OcrRegionBounds;
  };
}

export interface OcrRegionUpdate {
  crewHub?: Partial<OcrRegionSettings['crewHub']>;
  mapScreen?: Partial<OcrRegionSettings['mapScreen']>;
}

export interface OcrCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  avgHitTimeMs: number;
  avgMissTimeMs: number;
  hitRate: number;
  currentSize: number;
  maxSize: number;
}

export const normalizeOcrNameRerouteThreshold = (threshold: unknown): number => {
  const numeric = Number(threshold);
  if (!Number.isFinite(numeric)) return OCR_NAME_REROUTE_THRESHOLD_DEFAULT;
  return Math.max(
    OCR_NAME_REROUTE_THRESHOLD_MIN,
    Math.min(OCR_NAME_REROUTE_THRESHOLD_MAX, Math.round(numeric))
  );
};

export const createDefaultOcrRegions = (): OcrRegionSettings => ({
  crewHub: {
    leftPanel: { xMin: 0.0, xMax: 0.48, yMin: 0.05, yMax: 0.85 },
    enemyPanel: { xMin: 0.55, xMax: 1.0, yMin: 0.08, yMax: 0.95 },
    teamHeader: { xMin: 0.0, xMax: 0.50, yMin: 0.02, yMax: 0.15 },
    enemyName: { xMin: 0.63, xMax: 0.92, yMin: 0.08, yMax: 0.95 },
  },
  mapScreen: {
    yourShip: { xMin: 0.0, xMax: 0.30, yMin: 0.0, yMax: 0.25 },
    enemyShips: { xMin: 0.79, xMax: 0.98, yMin: 0.07, yMax: 0.22 },
    enemyShips2: { xMin: 0.79, xMax: 0.98, yMin: 0.22, yMax: 0.37 },
    enemyShips3: { xMin: 0.79, xMax: 0.98, yMin: 0.37, yMax: 0.52 },
    enemyShips4: { xMin: 0.79, xMax: 0.98, yMin: 0.52, yMax: 0.67 },
    hazards: { xMin: 0.60, xMax: 1.0, yMin: 0.28, yMax: 0.63 },
    players: { xMin: 0.0, xMax: 0.40, yMin: 0.70, yMax: 1.0 },
  },
});

export interface SettingsSlice {
  activeMode: GameMode;
  activeUser: string;
  appearanceMode: 'light' | 'dark' | 'twilight' | 'system';
  colorTheme: string;
  customHue: string;
  devMode: boolean;
  colorblindMode: ColorblindMode;
  disableAnimations: boolean;
  performanceMode: boolean;
  showSmartCaptureInHeader: boolean;
  tipsEnabled: boolean;
  tipLibraryIndex: number;
  soundEnabled: boolean;
  language: Language;
  showSessionTimer: boolean;
  lifecycleTrackingPaused: boolean;
  customBgUrl: string;
  enableAutoLogRecording: boolean;
  telemetryPerformanceProfile: TelemetryPerformanceProfile;
  adaptiveTelemetryPollingEnabled: boolean;
  telemetryDefaultsVersion: number;
  enableAutoBackup: boolean;
  startupSmartPreloadEnabled: boolean;
  overlayStyle: OverlayStyle;
  visualMode: VisualMode;
  ocrMode: OcrMode;
  captureMode: CaptureMode;
  resultOcrFlowMode: ResultOcrFlowMode;
  ocrAutoOpenAfterRerun: boolean;
  autoSequenceOnCapture: boolean;
  autoCaptureSendKeypresses: boolean;
  autoCaptureWaitMultiplier: number;
  tacticalMapKeybind: string;
  autoPopulateRosterOnSave: boolean;
  lockOcrTeams: boolean;
  ocrEnhancedNameRecoveryEnabled: boolean;
  ocrNameRerouteThreshold: number;
  ocrLearningEnabled: boolean;
  ocrAutoApplyMinScore: number;
  ocrAutoApplyMinCount: number;
  ocrLearningStrictMode: boolean;
  ocrLearningReviewMode: OcrLearningReviewMode;
  ocrLearningAutoPromoteCount: number;
  ocrLearningQueueEnabled: boolean;
  adaptivePreloadEnabled: boolean;
  adaptivePreloadBudgetMs: number;
  dashboardPreloadStats: Record<DashboardPreloadView, DashboardPreloadStat>;
  ocrThresholdRecommendationMode: OcrThresholdRecommendationMode;
  ocrThresholdHistory: OcrThresholdHistoryEntry[];
  ocrBestGuessThresholds: OcrBestGuessThresholds;
  ocrCalibration: OcrCalibration;
  ocrCalibrationSamples: CalibrationSample[];
  ocrBatchAcceptThreshold: number;
  ocrRegions: OcrRegionSettings;
  tutorialCompleted: boolean;

  setActiveMode: (mode: GameMode) => void;
  setActiveUser: (user: string) => void;
  setAppearanceMode: (mode: 'light' | 'dark' | 'twilight' | 'system') => void;
  setColorTheme: (theme: string) => void;
  setCustomHue: (hue: string) => void;
  setDevMode: (enabled: boolean) => void;
  setColorblindMode: (mode: ColorblindMode) => void;
  setDisableAnimations: (disabled: boolean) => void;
  setPerformanceMode: (enabled: boolean) => void;
  setShowSmartCaptureInHeader: (enabled: boolean) => void;
  setTipsEnabled: (enabled: boolean) => void;
  setTipLibraryIndex: (index: number) => void;
  advanceTipLibraryIndex: (step?: number) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setLanguage: (lang: Language) => void;
  setShowSessionTimer: (show: boolean) => void;
  setLifecycleTrackingPaused: (paused: boolean) => void;
  setCustomBgUrl: (url: string) => void;
  setEnableAutoLogRecording: (enabled: boolean) => void;
  setTelemetryPerformanceProfile: (profile: TelemetryPerformanceProfile) => void;
  setAdaptiveTelemetryPollingEnabled: (enabled: boolean) => void;
  setEnableAutoBackup: (enabled: boolean) => void;
  setStartupSmartPreloadEnabled: (enabled: boolean) => void;
  setOverlayStyle: (style: OverlayStyle) => void;
  setVisualMode: (mode: VisualMode) => void;
  setOcrMode: (mode: OcrMode) => void;
  setCaptureMode: (mode: CaptureMode) => void;
  setResultOcrFlowMode: (mode: ResultOcrFlowMode) => void;
  setOcrAutoOpenAfterRerun: (enabled: boolean) => void;
  setAutoSequenceOnCapture: (enabled: boolean) => void;
  setAutoCaptureSendKeypresses: (enabled: boolean) => void;
  setAutoCaptureWaitMultiplier: (multiplier: number) => void;
  setTacticalMapKeybind: (keybind: string) => void;
  setAutoPopulateRosterOnSave: (enabled: boolean) => void;
  setLockOcrTeams: (enabled: boolean) => void;
  setOcrEnhancedNameRecoveryEnabled: (enabled: boolean) => void;
  setOcrNameRerouteThreshold: (threshold: number) => void;
  setOcrLearningEnabled: (enabled: boolean) => void;
  setOcrAutoApplyMinScore: (score: number) => void;
  setOcrAutoApplyMinCount: (count: number) => void;
  setOcrLearningStrictMode: (enabled: boolean) => void;
  setOcrLearningReviewMode: (mode: OcrLearningReviewMode) => void;
  setOcrLearningAutoPromoteCount: (count: number) => void;
  setOcrLearningQueueEnabled: (enabled: boolean) => void;
  setAdaptivePreloadEnabled: (enabled: boolean) => void;
  setAdaptivePreloadBudgetMs: (budget: number) => void;
  recordDashboardPreloadVisit: (view: DashboardPreloadView, openDurationMs?: number) => void;
  resetDashboardPreloadStats: () => void;
  setOcrThresholdRecommendationMode: (mode: OcrThresholdRecommendationMode) => void;
  pushOcrThresholdHistory: (entry: OcrThresholdHistoryEntry) => void;
  popOcrThresholdHistory: () => OcrThresholdHistoryEntry | null;
  setOcrBestGuessThresholds: (update: Partial<OcrBestGuessThresholds>) => void;
  setOcrCalibration: (update: Partial<OcrCalibration>) => void;
  resetOcrCalibration: () => void;
  applyCalibrationRecommendations: () => void;
  recordCalibrationSample: (sample: CalibrationSample) => void;
  clearOcrCalibrationSamples: () => void;
  setOcrBatchAcceptThreshold: (threshold: number) => void;
  setOcrRegions: (update: OcrRegionUpdate) => void;
  resetOcrRegions: () => void;
  setTutorialCompleted: (completed: boolean) => void;
}

const defaultPreloadStats = (): Record<DashboardPreloadView, DashboardPreloadStat> => ({
  analytics: { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
  history: { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
  'smart-captures': { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
  players: { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
  'dev-ocr': { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
});

export const createSettingsSlice: StateCreator<SettingsSlice> = (set, get) => ({
  activeMode: 'Artifact Brawl',
  activeUser: '',
  appearanceMode: 'twilight',
  colorTheme: 'ocean',
  customHue: '0',
  devMode: false,
  colorblindMode: 'none',
  disableAnimations: false,
  performanceMode: false,
  showSmartCaptureInHeader: true,
  tipsEnabled: true,
  tipLibraryIndex: 0,
  soundEnabled: true,
  language: 'en',
  showSessionTimer: true,
  lifecycleTrackingPaused: false,
  customBgUrl: '',
  enableAutoLogRecording: true,
  telemetryPerformanceProfile: 'balanced',
  adaptiveTelemetryPollingEnabled: false,
  telemetryDefaultsVersion: 1,
  enableAutoBackup: true,
  startupSmartPreloadEnabled: true,
  overlayStyle: 'compact',
  visualMode: 'dense',
  ocrMode: 'local',
  captureMode: 'deferred',
  resultOcrFlowMode: 'background',
  ocrAutoOpenAfterRerun: false,
  autoSequenceOnCapture: true,
  autoCaptureSendKeypresses: true,
  autoCaptureWaitMultiplier: 1,
  tacticalMapKeybind: 'Tab',
  autoPopulateRosterOnSave: false,
  lockOcrTeams: false,
  ocrEnhancedNameRecoveryEnabled: true,
  ocrNameRerouteThreshold: OCR_NAME_REROUTE_THRESHOLD_DEFAULT,
  ocrLearningEnabled: true,
  ocrAutoApplyMinScore: 0.83,
  ocrAutoApplyMinCount: 3,
  ocrLearningStrictMode: true,
  ocrLearningReviewMode: 'conservative',
  ocrLearningAutoPromoteCount: 3,
  ocrLearningQueueEnabled: true,
  adaptivePreloadEnabled: true,
  adaptivePreloadBudgetMs: 900,
  dashboardPreloadStats: defaultPreloadStats(),
  ocrThresholdRecommendationMode: 'assisted',
  ocrThresholdHistory: [],
  ocrBestGuessThresholds: {
    merged: { player: 78, mod: 80, ship: 60 },
    local: { player: 84, mod: 87, ship: 68 },
    lowConfidenceBump: 4,
  },
  ocrCalibration: {
    sampleOffsetX: 0,
    sampleOffsetY: 0,
    sampleWidthAdjust: 0,
    sampleHeightAdjust: 0,
    saturationMin: 35,
    luminanceMin: 30
  },
  ocrCalibrationSamples: [],
  ocrBatchAcceptThreshold: 85,
  ocrRegions: createDefaultOcrRegions(),
  tutorialCompleted: false,

  setActiveMode: (mode) => set({ activeMode: mode }),
  setActiveUser: (user) => set({ activeUser: user }),
  setAppearanceMode: (mode) => set({ appearanceMode: mode }),
  setColorTheme: (theme) => set({ colorTheme: theme }),
  setCustomHue: (hue) => set({ customHue: hue }),
  setDevMode: (enabled) => set({ devMode: enabled }),
  setColorblindMode: (mode) => set({ colorblindMode: mode }),
  setDisableAnimations: (disabled) => set({ disableAnimations: disabled }),
  setPerformanceMode: (enabled) => set({ performanceMode: enabled, disableAnimations: enabled ? true : false }),
  setShowSmartCaptureInHeader: (enabled) => set({ showSmartCaptureInHeader: enabled }),
  setTipsEnabled: (enabled) => set({ tipsEnabled: enabled }),
  setTipLibraryIndex: (index) => set({ tipLibraryIndex: Math.max(0, Math.floor(Number(index) || 0)) }),
  advanceTipLibraryIndex: (step = 1) => set((state) => ({
    tipLibraryIndex: Math.max(0, Math.floor(Number(state.tipLibraryIndex || 0) + Number(step || 1))),
  })),
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  setLanguage: (lang) => set({ language: lang }),
  setShowSessionTimer: (show) => set({ showSessionTimer: show }),
  setLifecycleTrackingPaused: (paused) => set({ lifecycleTrackingPaused: paused }),
  setCustomBgUrl: (url) => set({ customBgUrl: url }),
  setEnableAutoLogRecording: (enabled) => set({ enableAutoLogRecording: enabled }),
  setTelemetryPerformanceProfile: (profile) => set({ telemetryPerformanceProfile: profile }),
  setAdaptiveTelemetryPollingEnabled: (enabled) => set({ adaptiveTelemetryPollingEnabled: enabled }),
  setEnableAutoBackup: (enabled) => set({ enableAutoBackup: enabled }),
  setStartupSmartPreloadEnabled: (enabled) => set({ startupSmartPreloadEnabled: enabled }),
  setOverlayStyle: (style) => set({ overlayStyle: style }),
  setVisualMode: (mode) => set({ visualMode: mode }),
  setOcrMode: (mode) => set({ ocrMode: mode }),
  setCaptureMode: (mode) => set({ captureMode: mode }),
  setResultOcrFlowMode: (mode) => set({
    resultOcrFlowMode: mode === 'background' ? 'background' : 'prompt'
  }),
  setOcrAutoOpenAfterRerun: (enabled) => set({ ocrAutoOpenAfterRerun: enabled }),
  setAutoSequenceOnCapture: (enabled) => set({ autoSequenceOnCapture: enabled }),
  setAutoCaptureSendKeypresses: (enabled) => set({ autoCaptureSendKeypresses: enabled }),
  setAutoCaptureWaitMultiplier: (multiplier) => set({
    autoCaptureWaitMultiplier: Math.max(0.5, Math.min(3, Math.round((Number(multiplier) || 1) * 10) / 10))
  }),
  setTacticalMapKeybind: (keybind) => {
    const trimmed = String(keybind || '').trim();
    set({ tacticalMapKeybind: trimmed });
  },
  setAutoPopulateRosterOnSave: (enabled) => set({ autoPopulateRosterOnSave: enabled }),
  setLockOcrTeams: (enabled) => set({ lockOcrTeams: enabled }),
  setOcrEnhancedNameRecoveryEnabled: (enabled) => set({ ocrEnhancedNameRecoveryEnabled: enabled }),
  setOcrNameRerouteThreshold: (threshold) => set({
    ocrNameRerouteThreshold: normalizeOcrNameRerouteThreshold(threshold)
  }),
  setOcrLearningEnabled: (enabled) => set({ ocrLearningEnabled: enabled }),
  setOcrAutoApplyMinScore: (score) => set({ ocrAutoApplyMinScore: Math.max(0.5, Math.min(0.99, Number(score) || 0.83)) }),
  setOcrAutoApplyMinCount: (count) => set({ ocrAutoApplyMinCount: Math.max(1, Math.min(10, Math.round(Number(count) || 3))) }),
  setOcrLearningStrictMode: (enabled) => set({ ocrLearningStrictMode: enabled }),
  setOcrLearningReviewMode: (mode) => set({
    ocrLearningReviewMode: (mode === 'aggressive' || mode === 'balanced' || mode === 'conservative')
      ? mode
      : 'conservative'
  }),
  setOcrLearningAutoPromoteCount: (count) => set({
    ocrLearningAutoPromoteCount: Math.max(1, Math.min(20, Math.round(Number(count) || 5)))
  }),
  setOcrLearningQueueEnabled: (enabled) => set({ ocrLearningQueueEnabled: enabled }),
  setAdaptivePreloadEnabled: (enabled) => set({ adaptivePreloadEnabled: enabled }),
  setAdaptivePreloadBudgetMs: (budget) => set({
    adaptivePreloadBudgetMs: Math.max(200, Math.min(2500, Math.round(Number(budget) || 900)))
  }),
  recordDashboardPreloadVisit: (view, openDurationMs) => set((state) => {
    const current = state.dashboardPreloadStats[view] || { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 };
    const durations = Number.isFinite(openDurationMs)
      ? [...current.openDurationsMs, Math.max(0, Math.round(Number(openDurationMs)))].slice(-30)
      : current.openDurationsMs;
    return {
      dashboardPreloadStats: {
        ...state.dashboardPreloadStats,
        [view]: {
          openDurationsMs: durations,
          switchCount: current.switchCount + 1,
          lastVisitedAt: Date.now(),
        }
      }
    };
  }),
  resetDashboardPreloadStats: () => set({ dashboardPreloadStats: defaultPreloadStats() }),
  setOcrThresholdRecommendationMode: (mode) => set({
    ocrThresholdRecommendationMode: mode === 'manual'
      ? 'manual'
      : mode === 'auto'
        ? 'auto'
        : 'assisted'
  }),
  pushOcrThresholdHistory: (entry) => set((state) => ({
    ocrThresholdHistory: [entry, ...(state.ocrThresholdHistory || [])].slice(0, 20)
  })),
  popOcrThresholdHistory: () => {
    const current = get().ocrThresholdHistory || [];
    if (current.length === 0) return null;
    const [top, ...rest] = current;
    set({ ocrThresholdHistory: rest });
    return top;
  },
  setOcrBestGuessThresholds: (update) => set(state => ({
    ocrBestGuessThresholds: {
      ...state.ocrBestGuessThresholds,
      ...update,
      merged: { ...state.ocrBestGuessThresholds.merged, ...(update.merged || {}) },
      local: { ...state.ocrBestGuessThresholds.local, ...(update.local || {}) },
    }
  })),
  setOcrCalibration: (update) => set(state => ({
    ocrCalibration: { ...state.ocrCalibration, ...update }
  })),
  resetOcrCalibration: () => set({
    ocrCalibration: {
      sampleOffsetX: 0,
      sampleOffsetY: 0,
      sampleWidthAdjust: 0,
      sampleHeightAdjust: 0,
      saturationMin: 35,
      luminanceMin: 30
    }
  }),
  applyCalibrationRecommendations: () => set((state) => {
    if (state.ocrThresholdRecommendationMode !== 'auto') {
      return {};
    }
    const samples = state.ocrCalibrationSamples || [];
    if (samples.length < 30) return {};

    const buckets = buildCalibrationBuckets(samples);
    const recommended = recommendCalibrationThreshold(buckets);
    if (recommended === null) return {};

    const modeKey = 'local';

    const nextThresholds: OcrBestGuessThresholds = {
      ...state.ocrBestGuessThresholds,
      [modeKey]: {
        ...state.ocrBestGuessThresholds[modeKey],
        player: recommended,
      },
    };

    return {
      ocrBestGuessThresholds: nextThresholds,
      ocrThresholdHistory: [
        {
          timestamp: Date.now(),
          source: `auto-calibration-${modeKey}:${recommended}`,
          thresholds: {
            merged: { ...state.ocrBestGuessThresholds.merged },
            local: { ...state.ocrBestGuessThresholds.local },
            lowConfidenceBump: state.ocrBestGuessThresholds.lowConfidenceBump,
          },
        },
        ...(state.ocrThresholdHistory || []),
      ].slice(0, 50),
    };
  }),
  recordCalibrationSample: (sample) => {
    set((state) => {
      const next = appendCalibrationSample(
        state.ocrCalibrationSamples || [],
        sample,
        OCR_CALIBRATION_MAX_SAMPLES
      );
      return { ocrCalibrationSamples: next };
    });
    const samples = get().ocrCalibrationSamples || [];
    if (samples.length > 0 && samples.length % 50 === 0) {
      get().applyCalibrationRecommendations?.();
    }
  },
  clearOcrCalibrationSamples: () => set({ ocrCalibrationSamples: [] }),
  setOcrBatchAcceptThreshold: (threshold) => set({ ocrBatchAcceptThreshold: normalizeOcrBatchThreshold(threshold) }),
  setOcrRegions: (update) => set(state => ({
    ocrRegions: {
      crewHub: {
        ...state.ocrRegions.crewHub,
        ...(update.crewHub || {}),
        leftPanel: { ...state.ocrRegions.crewHub.leftPanel, ...(update.crewHub?.leftPanel || {}) },
        enemyPanel: { ...state.ocrRegions.crewHub.enemyPanel, ...(update.crewHub?.enemyPanel || {}) },
        teamHeader: { ...state.ocrRegions.crewHub.teamHeader, ...(update.crewHub?.teamHeader || {}) },
        enemyName: { ...state.ocrRegions.crewHub.enemyName, ...(update.crewHub?.enemyName || {}) },
      },
      mapScreen: {
        ...state.ocrRegions.mapScreen,
        ...(update.mapScreen || {}),
        yourShip: { ...state.ocrRegions.mapScreen.yourShip, ...(update.mapScreen?.yourShip || {}) },
        enemyShips: { ...state.ocrRegions.mapScreen.enemyShips, ...(update.mapScreen?.enemyShips || {}) },
        enemyShips2: { ...state.ocrRegions.mapScreen.enemyShips2, ...(update.mapScreen?.enemyShips2 || {}) },
        enemyShips3: { ...state.ocrRegions.mapScreen.enemyShips3, ...(update.mapScreen?.enemyShips3 || {}) },
        enemyShips4: { ...state.ocrRegions.mapScreen.enemyShips4, ...(update.mapScreen?.enemyShips4 || {}) },
        hazards: { ...state.ocrRegions.mapScreen.hazards, ...(update.mapScreen?.hazards || {}) },
        players: { ...state.ocrRegions.mapScreen.players, ...(update.mapScreen?.players || {}) },
      },
    }
  })),
  resetOcrRegions: () => set({ ocrRegions: createDefaultOcrRegions() }),
  setTutorialCompleted: (completed) => set({ tutorialCompleted: completed }),
});

