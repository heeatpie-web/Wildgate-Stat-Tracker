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
export type VirtualGamepadButton = 'DPAD_UP' | 'DPAD_DOWN' | 'DPAD_LEFT' | 'DPAD_RIGHT' | 'A' | 'B' | 'X' | 'Y' | 'LEFT_SHOULDER' | 'RIGHT_SHOULDER' | 'START' | 'BACK' | 'LEFT_THUMB' | 'RIGHT_THUMB';

export interface MacroStepConfig {
  button: VirtualGamepadButton;
  count: number;
}

export interface MacroSequenceConfig {
  openMenu: MacroStepConfig[];
  navigate: MacroStepConfig[];
  moveRight: MacroStepConfig[];
  moveEnd: MacroStepConfig[];
  exit: MacroStepConfig[];
}

export const DEFAULT_MACRO_SEQUENCE_CONFIG: MacroSequenceConfig = {
  openMenu: [{ button: 'START', count: 1 }],
  navigate: [{ button: 'DPAD_UP', count: 4 }, { button: 'A', count: 1 }],
  moveRight: [{ button: 'DPAD_RIGHT', count: 2 }],
  moveEnd: [{ button: 'DPAD_DOWN', count: 1 }],
  exit: [{ button: 'B', count: 1 }],
};

const clampMacroStepCount = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(10, Math.round(numeric)));
};

export const sanitizeMacroStepConfig = (steps: unknown): MacroStepConfig[] => {
  if (!Array.isArray(steps)) return [];
  return steps
    .filter((step): step is { button: string; count: number } =>
      step && typeof step === 'object'
      && typeof step.button === 'string'
      && VIRTUAL_GAMEPAD_BUTTON_SET.has(step.button as VirtualGamepadButton)
    )
    .map((step) => ({
      button: step.button as VirtualGamepadButton,
      count: clampMacroStepCount(step.count),
    }))
    .slice(0, 10);
};

export const sanitizeMacroSequenceConfig = (config: unknown): MacroSequenceConfig => {
  if (!config || typeof config !== 'object') return { ...DEFAULT_MACRO_SEQUENCE_CONFIG };
  const raw = config as Partial<Record<keyof MacroSequenceConfig, unknown>>;
  return {
    openMenu: sanitizeMacroStepConfig(raw.openMenu).length > 0 ? sanitizeMacroStepConfig(raw.openMenu) : DEFAULT_MACRO_SEQUENCE_CONFIG.openMenu,
    navigate: sanitizeMacroStepConfig(raw.navigate).length > 0 ? sanitizeMacroStepConfig(raw.navigate) : DEFAULT_MACRO_SEQUENCE_CONFIG.navigate,
    moveRight: sanitizeMacroStepConfig(raw.moveRight).length > 0 ? sanitizeMacroStepConfig(raw.moveRight) : DEFAULT_MACRO_SEQUENCE_CONFIG.moveRight,
    moveEnd: sanitizeMacroStepConfig(raw.moveEnd).length > 0 ? sanitizeMacroStepConfig(raw.moveEnd) : DEFAULT_MACRO_SEQUENCE_CONFIG.moveEnd,
    exit: sanitizeMacroStepConfig(raw.exit).length > 0 ? sanitizeMacroStepConfig(raw.exit) : DEFAULT_MACRO_SEQUENCE_CONFIG.exit,
  };
};
export type VirtualGamepadTrigger = 'LEFT_TRIGGER' | 'RIGHT_TRIGGER';
export type VirtualGamepadMovementId = 'UP_LEFT' | 'UP' | 'UP_RIGHT' | 'LEFT' | 'NONE' | 'RIGHT' | 'DOWN_LEFT' | 'DOWN' | 'DOWN_RIGHT';

const VIRTUAL_GAMEPAD_BUTTON_SET = new Set<VirtualGamepadButton>([
  'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT',
  'A', 'B', 'X', 'Y',
  'LEFT_SHOULDER', 'RIGHT_SHOULDER',
  'START', 'BACK',
  'LEFT_THUMB', 'RIGHT_THUMB',
]);

const VIRTUAL_GAMEPAD_TRIGGER_SET = new Set<VirtualGamepadTrigger>([
  'LEFT_TRIGGER',
  'RIGHT_TRIGGER',
]);

export const sanitizeVirtualGamepadMovement = (movement: unknown): VirtualGamepadMovementId => (
  movement === 'UP_LEFT'
  || movement === 'UP'
  || movement === 'UP_RIGHT'
  || movement === 'LEFT'
  || movement === 'NONE'
  || movement === 'RIGHT'
  || movement === 'DOWN_LEFT'
  || movement === 'DOWN'
  || movement === 'DOWN_RIGHT'
    ? movement
    : 'NONE'
);

const clampVirtualGamepadPercent = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.max(25, Math.min(100, Math.round(numeric)));
};

const clampVirtualGamepadHoldDurationMs = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 180;
  return Math.max(60, Math.min(800, Math.round(numeric)));
};

const clampVirtualGamepadRepeatCount = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(10, Math.round(numeric)));
};

export const sanitizeVirtualGamepadButtons = (buttons: unknown): VirtualGamepadButton[] => {
  if (!Array.isArray(buttons)) return [];
  return Array.from(new Set(buttons.filter((button): button is VirtualGamepadButton => (
    typeof button === 'string' && VIRTUAL_GAMEPAD_BUTTON_SET.has(button as VirtualGamepadButton)
  ))));
};

export const sanitizeVirtualGamepadTriggers = (triggers: unknown): VirtualGamepadTrigger[] => {
  if (!Array.isArray(triggers)) return [];
  return Array.from(new Set(triggers.filter((trigger): trigger is VirtualGamepadTrigger => (
    typeof trigger === 'string' && VIRTUAL_GAMEPAD_TRIGGER_SET.has(trigger as VirtualGamepadTrigger)
  ))));
};

export const buildVirtualGamepadAxes = (
  movement: VirtualGamepadMovementId,
  intensityPercent: number,
): Partial<Record<'LEFT_STICK_X' | 'LEFT_STICK_Y', number>> => {
  const clampedIntensity = clampVirtualGamepadPercent(intensityPercent);
  if (movement === 'NONE' || clampedIntensity <= 0) return {};
  const full = Math.max(1, Math.round((32767 * clampedIntensity) / 100));
  const diagonal = Math.max(1, Math.round(full * 0.78));
  switch (movement) {
    case 'UP_LEFT':
      return { LEFT_STICK_X: -diagonal, LEFT_STICK_Y: diagonal };
    case 'UP':
      return { LEFT_STICK_Y: full };
    case 'UP_RIGHT':
      return { LEFT_STICK_X: diagonal, LEFT_STICK_Y: diagonal };
    case 'LEFT':
      return { LEFT_STICK_X: -full };
    case 'RIGHT':
      return { LEFT_STICK_X: full };
    case 'DOWN_LEFT':
      return { LEFT_STICK_X: -diagonal, LEFT_STICK_Y: -diagonal };
    case 'DOWN':
      return { LEFT_STICK_Y: -full };
    case 'DOWN_RIGHT':
      return { LEFT_STICK_X: diagonal, LEFT_STICK_Y: -diagonal };
    default:
      return {};
  }
};

export const buildVirtualGamepadSliders = (
  selectedTriggers: VirtualGamepadTrigger[],
  triggerIntensityPercent: number,
): Partial<Record<VirtualGamepadTrigger, number>> => {
  const clampedIntensity = clampVirtualGamepadPercent(triggerIntensityPercent);
  const triggerValue = Math.round((255 * clampedIntensity) / 100);
  return sanitizeVirtualGamepadTriggers(selectedTriggers).reduce<Partial<Record<VirtualGamepadTrigger, number>>>((acc, trigger) => {
    acc[trigger] = triggerValue;
    return acc;
  }, {});
};

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
  /** When true, performance mode auto-follows game-exe detection (manual toggle overrides until next transition). */
  autoPerformanceMode: boolean;
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
  holdTacticalMapKey: boolean;
  gamepadModeEnabled: boolean;
  virtualGamepadHotkeyEnabled: boolean;
  virtualGamepadMovement: VirtualGamepadMovementId;
  virtualGamepadButtons: VirtualGamepadButton[];
  virtualGamepadTriggers: VirtualGamepadTrigger[];
  virtualGamepadStickIntensityPercent: number;
  virtualGamepadTriggerIntensityPercent: number;
  virtualGamepadHoldDurationMs: number;
  virtualGamepadRepeatCount: number;
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
  macroSequenceConfig: MacroSequenceConfig;
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
  setAutoPerformanceMode: (enabled: boolean) => void;
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
  setHoldTacticalMapKey: (hold: boolean) => void;
  setGamepadModeEnabled: (enabled: boolean) => void;
  setVirtualGamepadHotkeyEnabled: (enabled: boolean) => void;
  setVirtualGamepadMovement: (movement: VirtualGamepadMovementId) => void;
  setVirtualGamepadButtons: (buttons: VirtualGamepadButton[]) => void;
  setVirtualGamepadTriggers: (triggers: VirtualGamepadTrigger[]) => void;
  setVirtualGamepadStickIntensityPercent: (intensity: number) => void;
  setVirtualGamepadTriggerIntensityPercent: (intensity: number) => void;
  setVirtualGamepadHoldDurationMs: (durationMs: number) => void;
  setVirtualGamepadRepeatCount: (count: number) => void;
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
  setMacroSequenceConfig: (config: MacroSequenceConfig) => void;
  updateMacroSequenceStep: (step: keyof MacroSequenceConfig, steps: MacroStepConfig[]) => void;
  resetMacroSequenceConfig: () => void;
  setTutorialCompleted: (completed: boolean) => void;

  fullAutoEnabled: boolean;
  setFullAutoEnabled: (enabled: boolean) => void;

  pregameAdviceEnabled: boolean;
  setPregameAdviceEnabled: (enabled: boolean) => void;

  tacticalMapAutoCapture: boolean;
  setTacticalMapAutoCapture: (enabled: boolean) => void;
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
  autoPerformanceMode: true,
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
  visualMode: 'editorial',
  ocrMode: 'local',
  captureMode: 'deferred',
  resultOcrFlowMode: 'background',
  ocrAutoOpenAfterRerun: false,
  autoSequenceOnCapture: true,
  autoCaptureSendKeypresses: true,
  autoCaptureWaitMultiplier: 0.5,
  tacticalMapKeybind: '',
  holdTacticalMapKey: false,
  gamepadModeEnabled: false,
  virtualGamepadHotkeyEnabled: true,
  virtualGamepadMovement: 'NONE',
  virtualGamepadButtons: [],
  virtualGamepadTriggers: [],
  virtualGamepadStickIntensityPercent: 100,
  virtualGamepadTriggerIntensityPercent: 100,
  virtualGamepadHoldDurationMs: 180,
  virtualGamepadRepeatCount: 1,
  autoPopulateRosterOnSave: true,
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
  macroSequenceConfig: { ...DEFAULT_MACRO_SEQUENCE_CONFIG },
  tutorialCompleted: false,
  fullAutoEnabled: true,
  pregameAdviceEnabled: true,
  tacticalMapAutoCapture: false,

  setActiveMode: (mode) => set({ activeMode: mode }),
  setActiveUser: (user) => set({ activeUser: user }),
  setAppearanceMode: (mode) => set({ appearanceMode: mode }),
  setColorTheme: (theme) => set({ colorTheme: theme }),
  setCustomHue: (hue) => set({ customHue: hue }),
  setDevMode: (enabled) => set({ devMode: enabled }),
  setColorblindMode: (mode) => set({ colorblindMode: mode }),
  setDisableAnimations: (disabled) => set({ disableAnimations: disabled }),
  setPerformanceMode: (enabled) => set({ performanceMode: enabled, disableAnimations: enabled ? true : false }),
  setAutoPerformanceMode: (enabled) => set({ autoPerformanceMode: enabled }),
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
  setHoldTacticalMapKey: (hold) => set({ holdTacticalMapKey: Boolean(hold) }),
  setGamepadModeEnabled: (enabled) => set({ gamepadModeEnabled: Boolean(enabled) }),
  setVirtualGamepadHotkeyEnabled: (enabled) => set({ virtualGamepadHotkeyEnabled: Boolean(enabled) }),
  setVirtualGamepadMovement: (movement) => set({ virtualGamepadMovement: sanitizeVirtualGamepadMovement(movement) }),
  setVirtualGamepadButtons: (buttons) => set({ virtualGamepadButtons: sanitizeVirtualGamepadButtons(buttons) }),
  setVirtualGamepadTriggers: (triggers) => set({ virtualGamepadTriggers: sanitizeVirtualGamepadTriggers(triggers) }),
  setVirtualGamepadStickIntensityPercent: (intensity) => set({ virtualGamepadStickIntensityPercent: clampVirtualGamepadPercent(intensity) }),
  setVirtualGamepadTriggerIntensityPercent: (intensity) => set({ virtualGamepadTriggerIntensityPercent: clampVirtualGamepadPercent(intensity) }),
  setVirtualGamepadHoldDurationMs: (durationMs) => set({ virtualGamepadHoldDurationMs: clampVirtualGamepadHoldDurationMs(durationMs) }),
  setVirtualGamepadRepeatCount: (count) => set({ virtualGamepadRepeatCount: clampVirtualGamepadRepeatCount(count) }),
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
  setMacroSequenceConfig: (config) => set({ macroSequenceConfig: sanitizeMacroSequenceConfig(config) }),
  updateMacroSequenceStep: (step, steps) => set((state) => ({
    macroSequenceConfig: {
      ...state.macroSequenceConfig,
      [step]: sanitizeMacroStepConfig(steps).length > 0
        ? sanitizeMacroStepConfig(steps)
        : DEFAULT_MACRO_SEQUENCE_CONFIG[step],
    },
  })),
  resetMacroSequenceConfig: () => set({ macroSequenceConfig: { ...DEFAULT_MACRO_SEQUENCE_CONFIG } }),
  setTutorialCompleted: (completed) => set({ tutorialCompleted: completed }),
  setFullAutoEnabled: (enabled) => set({ fullAutoEnabled: Boolean(enabled) }),
  setPregameAdviceEnabled: (enabled) => set({ pregameAdviceEnabled: Boolean(enabled) }),
  setTacticalMapAutoCapture: (enabled) => set({ tacticalMapAutoCapture: Boolean(enabled) }),
});
