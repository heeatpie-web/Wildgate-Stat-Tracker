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
        soundEnabled: s.soundEnabled, setSoundEnabled: s.setSoundEnabled,
        language: s.language, setLanguage: s.setLanguage,
        showSessionTimer: s.showSessionTimer, setShowSessionTimer: s.setShowSessionTimer,
        customBgUrl: s.customBgUrl, setCustomBgUrl: s.setCustomBgUrl,
        overlayStyle: s.overlayStyle, setOverlayStyle: s.setOverlayStyle,
        visualMode: s.visualMode, setVisualMode: s.setVisualMode,
    })));

    // Side Effects moved from App.tsx

    // 1. Apply Theme Classes
    useEffect(() => {
        const root = document.documentElement;

        // Remove existing theme classes
        root.classList.remove('theme-light', 'theme-dark', 'theme-twilight');
        root.classList.add(`theme-${appearanceMode}`);

        // Apply color theme
        root.setAttribute('data-theme', colorTheme);

        // Apply Custom Hue if not using a preset
        if (customHue !== '0') {
            root.style.setProperty('--md-sys-primary-hue', customHue);
        } else {
            root.style.removeProperty('--md-sys-primary-hue');
        }

    }, [appearanceMode, colorTheme, customHue]);

    // 2. Apply Colorblind Mode
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-colorblind', colorblindMode);
    }, [colorblindMode]);

    // 3. Apply Animations Setting
    useEffect(() => {
        if (disableAnimations) {
            document.body.classList.add('reduce-motion');
        } else {
            document.body.classList.remove('reduce-motion');
        }
    }, [disableAnimations]);

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
        soundEnabled, setSoundEnabled,
        language, setLanguage,
        showSessionTimer, setShowSessionTimer,
        customBgUrl, setCustomBgUrl,
        overlayStyle, setOverlayStyle,
        visualMode, setVisualMode
    }), [appearanceMode, setAppearanceMode, colorTheme, setColorTheme, customHue, setCustomHue,
        colorblindMode, setColorblindMode, disableAnimations, setDisableAnimations,
        soundEnabled, setSoundEnabled, language, setLanguage, showSessionTimer, setShowSessionTimer,
        customBgUrl, setCustomBgUrl, overlayStyle, setOverlayStyle, visualMode, setVisualMode]);

    return (
        <UserPreferencesContext.Provider value={value}>
            {children}
        </UserPreferencesContext.Provider>
    );
};
