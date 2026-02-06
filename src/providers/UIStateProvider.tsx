/**
 * @module UIStateProvider
 * React context for ephemeral UI state: modals, toasts, overlay mode,
 * layout config, and view routing. Mixes Zustand store fields (via
 * useShallow) with local React state for transient modal values.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { GameMode } from '../types';

interface ToastData {
    message: string;
    type?: 'success' | 'error' | 'warning' | 'info';
}

interface RenameModalState {
    type: 'new' | 'rename' | 'share_code';
    oldName?: string;
}

interface UIStateContextType {
    activeMode: GameMode;
    setActiveMode: (mode: GameMode) => void;
    // ...
    renameModal: RenameModalState | null;
    setRenameModal: (state: RenameModalState | null) => void;
    renameValue: string;
    setRenameValue: (val: string) => void;
    activeUser: string;
    setActiveUser: (user: string) => void;
    isRearranging: boolean;
    setIsRearranging: (is: boolean) => void;
    toast: ToastData | null;
    setToast: (toast: ToastData | null) => void;
    isOverlayMode: boolean;
    setIsOverlayMode: (is: boolean) => void;
    showWelcome: boolean;
    setShowWelcome: (show: boolean) => void;
    showTutorial: boolean;
    setShowTutorial: (show: boolean) => void;
    showSettings: boolean;
    setShowSettings: (show: boolean) => void;

    showReviewQueue: boolean;
    setShowReviewQueue: (show: boolean) => void;

    showChangelog: boolean;
    setShowChangelog: (show: boolean) => void;
    showResetConfirm: boolean;
    setShowResetConfirm: (show: boolean) => void;
    showWelcomeBack: boolean;
    setShowWelcomeBack: (show: boolean) => void;
    isLayoutReady: boolean;
    setIsLayoutReady: (ready: boolean) => void;
    updateStatus: string;
    setUpdateStatus: (status: 'idle' | 'checking' | 'available' | 'downloaded' | 'not-available') => void;
    inputMode: 'Smart' | 'Manual';
    setInputMode: (mode: 'Smart' | 'Manual') => void;
    showArtifactSelect: boolean;
    setShowArtifactSelect: (show: boolean) => void;
    layouts: any;
    setLayouts: (layouts: any) => void;
    isAlwaysOnTop: boolean;
    setIsAlwaysOnTop: (is: boolean) => void;
    overlayTab: string;
    setOverlayTab: (tab: 'Mission' | 'Squadron' | 'Social') => void;
    overlayPhase: string;
    setOverlayPhase: (phase: 'Setup' | 'Live' | 'Result') => void;
    enableAutoLogRecording: boolean;
    setEnableAutoLogRecording: (enabled: boolean) => void;
    showWizard: 'Win' | 'Loss' | 'Draw' | null;
    setShowWizard: (result: 'Win' | 'Loss' | 'Draw' | null) => void;
    devMode: boolean;
    setDevMode: (enabled: boolean) => void;
    activeView: 'recording' | 'analytics' | 'history' | 'dev-ocr';
    setActiveView: (view: 'recording' | 'analytics' | 'history' | 'dev-ocr') => void;
    hiddenForScan: boolean;
    setHiddenForScan: (hidden: boolean) => void;
    showIdMapper: boolean;
    setShowIdMapper: (show: boolean) => void;
    // soundEnabled is in UserPreferences, so no change here actually. 
    // I need to correct useSmartScan to pull it from the right hook.
}

const UIStateContext = createContext<UIStateContextType | null>(null);

export const useUIState = () => {
    const context = useContext(UIStateContext);
    if (!context) {
        throw new Error('useUIState must be used within a UIStateProvider');
    }
    return context;
};

export const UIStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const store = useAppStore(useShallow(s => ({
        activeMode: s.activeMode, setActiveMode: s.setActiveMode,
        activeUser: s.activeUser, setActiveUser: s.setActiveUser,
        isRearranging: s.isRearranging, setIsRearranging: s.setIsRearranging,
        toast: s.toast, setToast: s.setToast,
        isOverlayMode: s.isOverlayMode, setIsOverlayMode: s.setIsOverlayMode,
        showWelcome: s.showWelcome, setShowWelcome: s.setShowWelcome,
        showTutorial: s.showTutorial, setShowTutorial: s.setShowTutorial,
        showSettings: s.showSettings, setShowSettings: s.setShowSettings,
        showChangelog: s.showChangelog, setShowChangelog: s.setShowChangelog,
        showResetConfirm: s.showResetConfirm, setShowResetConfirm: s.setShowResetConfirm,
        showWelcomeBack: s.showWelcomeBack, setShowWelcomeBack: s.setShowWelcomeBack,
        isLayoutReady: s.isLayoutReady, setIsLayoutReady: s.setIsLayoutReady,
        updateStatus: s.updateStatus, setUpdateStatus: s.setUpdateStatus,
        inputMode: s.inputMode, setInputMode: s.setInputMode,
        showArtifactSelect: s.showArtifactSelect, setShowArtifactSelect: s.setShowArtifactSelect,
        layouts: s.layouts, setLayouts: s.setLayouts,
        isAlwaysOnTop: s.isAlwaysOnTop, setIsAlwaysOnTop: s.setIsAlwaysOnTop,
        overlayTab: s.overlayTab, setOverlayTab: s.setOverlayTab,
        overlayPhase: s.overlayPhase, setOverlayPhase: s.setOverlayPhase,
        enableAutoLogRecording: s.enableAutoLogRecording, setEnableAutoLogRecording: s.setEnableAutoLogRecording,
        showWizard: s.showWizard, setShowWizard: s.setShowWizard,
        devMode: s.devMode, setDevMode: s.setDevMode,
        activeView: s.activeView, setActiveView: s.setActiveView,
        showIdMapper: s.showIdMapper, setShowIdMapper: s.setShowIdMapper,
    })));

    const [renameModal, setRenameModal] = React.useState<RenameModalState | null>(null);
    const [renameValue, setRenameValue] = React.useState<string>("");
    const [hiddenForScan, setHiddenForScan] = React.useState(false);
    const [showReviewQueue, setShowReviewQueue] = React.useState(false);

    const value = useMemo(() => ({
        ...store,
        renameModal, setRenameModal,
        renameValue, setRenameValue,
        showReviewQueue, setShowReviewQueue,
        hiddenForScan, setHiddenForScan,
    }), [store, renameModal, renameValue, hiddenForScan, showReviewQueue]);

    return (
        <UIStateContext.Provider value={value}>
            {children}
        </UIStateContext.Provider>
    );
};
