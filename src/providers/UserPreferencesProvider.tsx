/**
 * @module UserPreferencesProvider
 * React context for persisted user preferences (theme, language, a11y).
 * Also owns DOM side effects: applying theme classes/attributes,
 * colorblind mode, animation settings, and document language.
 */
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { ColorblindMode, Language, VisualMode } from '../types';
import { OverlayStyle } from '../store/slices/createSettingsSlice';

interface UserPreferencesContextType {
    appearanceMode: 'light' | 'dark' | 'twilight' | 'system';
    setAppearanceMode: (mode: 'light' | 'dark' | 'twilight' | 'system') => void;
    colorTheme: string;
    setColorTheme: (theme: string) => void;
    customHue: string;
    setCustomHue: (hue: string) => void;
    colorblindMode: ColorblindMode;
    setColorblindMode: (mode: ColorblindMode) => void;
    disableAnimations: boolean;
    setDisableAnimations: (disabled: boolean) => void;
    performanceMode: boolean;
    setPerformanceMode: (enabled: boolean) => void;
    soundEnabled: boolean;
    setSoundEnabled: (enabled: boolean) => void;
    language: Language;
    setLanguage: (lang: Language) => void;
    showSessionTimer: boolean;
    setShowSessionTimer: (show: boolean) => void;
    customBgUrl: string;
    setCustomBgUrl: (url: string) => void;
    overlayStyle: OverlayStyle;
    setOverlayStyle: (style: OverlayStyle) => void;
    visualMode: VisualMode;
    setVisualMode: (mode: VisualMode) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | null>(null);

export const useUserPreferences = () => {
    const context = useContext(UserPreferencesContext);
    if (!context) {
        throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
    }
    return context;
};

export const UserPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        appearanceMode, setAppearanceMode,
        colorTheme, setColorTheme,
        customHue, setCustomHue,
        colorblindMode, setColorblindMode,
        disableAnimations, setDisableAnimations,
        performanceMode, setPerformanceMode,
        soundEnabled, setSoundEnabled,
        language, setLanguage,
        showSessionTimer, setShowSessionTimer,
        customBgUrl, setCustomBgUrl,
        overlayStyle, setOverlayStyle,
        visualMode, setVisualMode
    } = useAppStore(useShallow(s => ({
        appearanceMode: s.appearanceMode, setAppearanceMode: s.setAppearanceMode,
        colorTheme: s.colorTheme, setColorTheme: s.setColorTheme,
        customHue: s.customHue, setCustomHue: s.setCustomHue,
        colorblindMode: s.colorblindMode, setColorblindMode: s.setColorblindMode,
        disableAnimations: s.disableAnimations, setDisableAnimations: s.setDisableAnimations,
        performanceMode: s.performanceMode, setPerformanceMode: s.setPerformanceMode,
        soundEnabled: s.soundEnabled, setSoundEnabled: s.setSoundEnabled,
        language: s.language, setLanguage: s.setLanguage,
        showSessionTimer: s.showSessionTimer, setShowSessionTimer: s.setShowSessionTimer,
        customBgUrl: s.customBgUrl, setCustomBgUrl: s.setCustomBgUrl,
        overlayStyle: s.overlayStyle, setOverlayStyle: s.setOverlayStyle,
        visualMode: s.visualMode, setVisualMode: s.setVisualMode,
    })));

    // Side Effects moved from App.tsx

    // 1. Apply theme + accent directly on body (CSS tokens key off body[data-mode]/[data-theme]).
    useEffect(() => {
        const body = document.body;
        const root = document.documentElement;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const resolvedMode = appearanceMode === 'system' ? (media.matches ? 'dark' : 'light') : appearanceMode;

        body.setAttribute('data-mode', resolvedMode);
        body.setAttribute('data-theme', colorTheme);

        // Keep root attributes in sync for components that read from documentElement.
        root.setAttribute('data-mode', resolvedMode);
        root.setAttribute('data-theme', colorTheme);

        // Custom hue is wired through --app-hue when theme is "custom".
        if (colorTheme === 'custom') {
            body.style.setProperty('--app-hue', customHue);
        } else {
            body.style.removeProperty('--app-hue');
        }

        // Keep class hooks in sync for any class-based theme selectors.
        body.classList.toggle('theme-light', resolvedMode === 'light');
        body.classList.toggle('theme-dark', resolvedMode === 'dark');
        body.classList.toggle('theme-twilight', resolvedMode === 'twilight');
        root.classList.toggle('theme-light', resolvedMode === 'light');
        root.classList.toggle('theme-dark', resolvedMode === 'dark');
        root.classList.toggle('theme-twilight', resolvedMode === 'twilight');

        // In system mode, react immediately to OS theme changes.
        if (appearanceMode !== 'system') return;
        const onSystemThemeChange = () => {
            const mode = media.matches ? 'dark' : 'light';
            body.setAttribute('data-mode', mode);
            root.setAttribute('data-mode', mode);
            body.classList.toggle('theme-light', mode === 'light');
            body.classList.toggle('theme-dark', mode === 'dark');
            body.classList.toggle('theme-twilight', false);
            root.classList.toggle('theme-light', mode === 'light');
            root.classList.toggle('theme-dark', mode === 'dark');
            root.classList.toggle('theme-twilight', false);
        };
        media.addEventListener('change', onSystemThemeChange);
        return () => media.removeEventListener('change', onSystemThemeChange);
    }, [appearanceMode, colorTheme, customHue]);

    // 2. Apply Colorblind Mode
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-colorblind', colorblindMode);
    }, [colorblindMode]);

    // 3. Apply Animations Setting
    useEffect(() => {
        if (disableAnimations || performanceMode) {
            document.body.classList.add('reduce-motion');
        } else {
            document.body.classList.remove('reduce-motion');
        }
    }, [disableAnimations, performanceMode]);

    useEffect(() => {
        if (performanceMode) {
            document.body.classList.add('perf-lite');
        } else {
            document.body.classList.remove('perf-lite');
        }
    }, [performanceMode]);

    // 4. Set Language on Body (for CSS targeting if needed)
    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    const value = useMemo(() => ({
        appearanceMode, setAppearanceMode,
        colorTheme, setColorTheme,
        customHue, setCustomHue,
        colorblindMode, setColorblindMode,
        disableAnimations, setDisableAnimations,
        performanceMode, setPerformanceMode,
        soundEnabled, setSoundEnabled,
        language, setLanguage,
        showSessionTimer, setShowSessionTimer,
        customBgUrl, setCustomBgUrl,
        overlayStyle, setOverlayStyle,
        visualMode, setVisualMode
    }), [appearanceMode, setAppearanceMode, colorTheme, setColorTheme, customHue, setCustomHue,
        colorblindMode, setColorblindMode, disableAnimations, setDisableAnimations,
        performanceMode, setPerformanceMode,
        soundEnabled, setSoundEnabled, language, setLanguage, showSessionTimer, setShowSessionTimer,
        customBgUrl, setCustomBgUrl, overlayStyle, setOverlayStyle, visualMode, setVisualMode]);

    return (
        <UserPreferencesContext.Provider value={value}>
            {children}
        </UserPreferencesContext.Provider>
    );
};
