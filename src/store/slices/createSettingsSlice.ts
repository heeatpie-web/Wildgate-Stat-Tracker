import { StateCreator } from 'zustand';
import { GameMode, ColorblindMode, Language, VisualMode } from '../../types';
import type { OcrCalibration } from '../../utils/scan/types';

/** Visual style variant for the in-game overlay. */
export type OverlayStyle = 'compact' | 'transparent';

/** OCR engine mode: local Tesseract, Google Cloud Vision, merged, or merged+Gemini refinement. */
export type OcrMode = 'local' | 'cloud' | 'both' | 'hybrid-plus';

/** Capture behavior: auto runs OCR immediately, deferred saves screenshot first. */
export type CaptureMode = 'auto' | 'deferred';

/** Telemetry monitoring profile: favors lower heat, balanced behavior, or faster updates. */
export type TelemetryPerformanceProfile = 'low-power' | 'balanced' | 'high-accuracy';

export interface OcrBestGuessThresholds {
  cloud: { player: number; mod: number; ship: number };
  merged: { player: number; mod: number; ship: number };
  local: { player: number; mod: number; ship: number };
  lowConfidenceBump: number;
}

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
  soundEnabled: boolean;
  language: Language;
  showSessionTimer: boolean;
  customBgUrl: string;
  enableAutoLogRecording: boolean;
  telemetryPerformanceProfile: TelemetryPerformanceProfile;
  enableAutoBackup: boolean;
  overlayStyle: OverlayStyle;
  visualMode: VisualMode;
  ocrMode: OcrMode;
  captureMode: CaptureMode;
  lockOcrTeams: boolean;
  ocrBestGuessThresholds: OcrBestGuessThresholds;
  ocrCalibration: OcrCalibration;
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
  setSoundEnabled: (enabled: boolean) => void;
  setLanguage: (lang: Language) => void;
  setShowSessionTimer: (show: boolean) => void;
  setCustomBgUrl: (url: string) => void;
  setEnableAutoLogRecording: (enabled: boolean) => void;
  setTelemetryPerformanceProfile: (profile: TelemetryPerformanceProfile) => void;
  setEnableAutoBackup: (enabled: boolean) => void;
  setOverlayStyle: (style: OverlayStyle) => void;
  setVisualMode: (mode: VisualMode) => void;
  setOcrMode: (mode: OcrMode) => void;
  setCaptureMode: (mode: CaptureMode) => void;
  setLockOcrTeams: (enabled: boolean) => void;
  setOcrBestGuessThresholds: (update: Partial<OcrBestGuessThresholds>) => void;
  setOcrCalibration: (update: Partial<OcrCalibration>) => void;
  resetOcrCalibration: () => void;
  setTutorialCompleted: (completed: boolean) => void;
}

export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
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
  soundEnabled: true,
  language: 'en',
  showSessionTimer: true,
  customBgUrl: '',
  enableAutoLogRecording: true,
  telemetryPerformanceProfile: 'balanced',
  enableAutoBackup: true,
  overlayStyle: 'compact',
  visualMode: 'dense',
  ocrMode: 'both',
  captureMode: 'auto',
  lockOcrTeams: false,
  ocrBestGuessThresholds: {
    cloud: { player: 80, mod: 82, ship: 62 },
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
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  setLanguage: (lang) => set({ language: lang }),
  setShowSessionTimer: (show) => set({ showSessionTimer: show }),
  setCustomBgUrl: (url) => set({ customBgUrl: url }),
  setEnableAutoLogRecording: (enabled) => set({ enableAutoLogRecording: enabled }),
  setTelemetryPerformanceProfile: (profile) => set({ telemetryPerformanceProfile: profile }),
  setEnableAutoBackup: (enabled) => set({ enableAutoBackup: enabled }),
  setOverlayStyle: (style) => set({ overlayStyle: style }),
  setVisualMode: (mode) => set({ visualMode: mode }),
  setOcrMode: (mode) => set({ ocrMode: mode }),
  setCaptureMode: (mode) => set({ captureMode: mode }),
  setLockOcrTeams: (enabled) => set({ lockOcrTeams: enabled }),
  setOcrBestGuessThresholds: (update) => set(state => ({
    ocrBestGuessThresholds: {
      ...state.ocrBestGuessThresholds,
      ...update,
      cloud: { ...state.ocrBestGuessThresholds.cloud, ...(update.cloud || {}) },
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
  setTutorialCompleted: (completed) => set({ tutorialCompleted: completed }),
});

