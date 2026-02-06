/**
 * @module createSettingsSlice
 * Persisted user preferences: appearance mode, color theme, colorblind filter,
 * language, sound, overlay style, and the active game mode / user profile.
 */
import { StateCreator } from 'zustand';
import { GameMode, ColorblindMode, Language } from '../../types';

/** Visual style variant for the in-game overlay. */
export type OverlayStyle = 'compact' | 'transparent';

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
  overlayStyle: OverlayStyle;

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
  setOverlayStyle: (style: OverlayStyle) => void;
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
  overlayStyle: 'compact',

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
  setOverlayStyle: (style) => set({ overlayStyle: style }),
});