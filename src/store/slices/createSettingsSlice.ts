/**
 * @module createSettingsSlice
 * Persisted user preferences: appearance mode, color theme, colorblind filter,
 * language, sound, overlay style, and the active game mode / user profile.
 */
import { StateCreator } from 'zustand';
import { GameMode, ColorblindMode, Language, VisualMode } from '../../types';
import type { OcrCalibration } from '../../utils/scan/types';

/** Visual style variant for the in-game overlay. */
export type OverlayStyle = 'compact' | 'transparent';

/** OCR engine mode: local Tesseract, Google Cloud Vision, or both merged. */
export type OcrMode = 'local' | 'cloud' | 'both';

/** Capture behavior: auto runs OCR immediately, deferred saves screenshot first. */
export type CaptureMode = 'auto' | 'deferred';

export interface SettingsSlice {
  activeMode: GameMode;
  activeUser: string;
  appearanceMode: 'light' | 'dark' | 'twilight' | 'system';
  colorTheme: string;
  customHue: string;
  devMode: boolean;
  colorblindMode: ColorblindMode;
  disableAnimations: boolean;
  soundEnabled: boolean;
  language: Language;
  showSessionTimer: boolean;
  customBgUrl: string;
  enableAutoLogRecording: boolean;
  enableAutoBackup: boolean;
  overlayStyle: OverlayStyle;
  visualMode: VisualMode;
  ocrMode: OcrMode;
  captureMode: CaptureMode;
  ocrCalibration: OcrCalibration;

  setActiveMode: (mode: GameMode) => void;
  setActiveUser: (user: string) => void;
  setAppearanceMode: (mode: 'light' | 'dark' | 'twilight' | 'system') => void;
  setColorTheme: (theme: string) => void;
  setCustomHue: (hue: string) => void;
  setDevMode: (enabled: boolean) => void;
  setColorblindMode: (mode: ColorblindMode) => void;
  setDisableAnimations: (disabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setLanguage: (lang: Language) => void;
  setShowSessionTimer: (show: boolean) => void;
  setCustomBgUrl: (url: string) => void;
  setEnableAutoLogRecording: (enabled: boolean) => void;
  setEnableAutoBackup: (enabled: boolean) => void;
  setOverlayStyle: (style: OverlayStyle) => void;
  setVisualMode: (mode: VisualMode) => void;
  setOcrMode: (mode: OcrMode) => void;
  setCaptureMode: (mode: CaptureMode) => void;
  setOcrCalibration: (update: Partial<OcrCalibration>) => void;
  resetOcrCalibration: () => void;
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
  soundEnabled: true,
  language: 'en',
  showSessionTimer: true,
  customBgUrl: '',
  enableAutoLogRecording: true,
  enableAutoBackup: true,
  overlayStyle: 'compact',
  visualMode: 'dense',
  ocrMode: 'both',
  captureMode: 'auto',
  ocrCalibration: {
    sampleOffsetX: 0,
    sampleOffsetY: 0,
    sampleWidthAdjust: 0,
    sampleHeightAdjust: 0,
    saturationMin: 35,
    luminanceMin: 30
  },

  setActiveMode: (mode) => set({ activeMode: mode }),
  setActiveUser: (user) => set({ activeUser: user }),
  setAppearanceMode: (mode) => set({ appearanceMode: mode }),
  setColorTheme: (theme) => set({ colorTheme: theme }),
  setCustomHue: (hue) => set({ customHue: hue }),
  setDevMode: (enabled) => set({ devMode: enabled }),
  setColorblindMode: (mode) => set({ colorblindMode: mode }),
  setDisableAnimations: (disabled) => set({ disableAnimations: disabled }),
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  setLanguage: (lang) => set({ language: lang }),
  setShowSessionTimer: (show) => set({ showSessionTimer: show }),
  setCustomBgUrl: (url) => set({ customBgUrl: url }),
  setEnableAutoLogRecording: (enabled) => set({ enableAutoLogRecording: enabled }),
  setEnableAutoBackup: (enabled) => set({ enableAutoBackup: enabled }),
  setOverlayStyle: (style) => set({ overlayStyle: style }),
  setVisualMode: (mode) => set({ visualMode: mode }),
  setOcrMode: (mode) => set({ ocrMode: mode }),
  setCaptureMode: (mode) => set({ captureMode: mode }),
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
});
