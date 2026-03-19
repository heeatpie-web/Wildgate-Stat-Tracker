/**
 * @module UIStateProvider
 * React context for ephemeral UI state: modals, toasts, overlay mode,
 * layout config, and view routing. Mixes Zustand store fields (via
 * useShallow) with local React state for transient modal values.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { GameMode, WizardResult } from '../types';
import type {
    AppNotification,
    NotificationInput,
    TelemetryAutomationStatusState,
    TelemetryLifecycleStage,
    TelemetryStatusState,
    ToastState,
} from '../store/slices/createUISlice';

interface RenameModalState {
    type: 'new' | 'rename' | 'share_code';
    oldName?: string;
    blocking?: boolean;
}

type SmartCaptureBehavior = 'single' | 'auto-sequence';

interface SmartCaptureRequest {
    requestId: string;
    activeUser: string | null;
    source?: string;
    matchId?: string | number | null;
    forceOcr?: boolean;
    behavior?: SmartCaptureBehavior;
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
    toast: ToastState | null;
    setToast: (toast: NotificationInput | null) => void;
    notifications: AppNotification[];
    pushNotification: (notification: NotificationInput) => void;
    dismissActiveNotification: () => void;
    markNotificationRead: (id: string) => void;
    markAllNotificationsRead: () => void;
    clearNotifications: () => void;
    notificationCenterOpen: boolean;
    setNotificationCenterOpen: (open: boolean) => void;
    notificationsSuspended: boolean;
    setNotificationsSuspended: (suspended: boolean) => void;
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
    smartCaptureRequest: SmartCaptureRequest | null;
    requestSmartCapture: (request: {
        activeUser?: string | null;
        source?: string;
        matchId?: string | number | null;
        requestId?: string;
        forceOcr?: boolean;
        behavior?: SmartCaptureBehavior;
    }) => string;
    clearSmartCaptureRequest: (requestId?: string) => void;

    showChangelog: boolean;
    setShowChangelog: (show: boolean) => void;
    showResetConfirm: boolean;
    setShowResetConfirm: (show: boolean) => void;
    showWelcomeBack: boolean;
    setShowWelcomeBack: (show: boolean) => void;
    showSetupWizard: boolean;
    setShowSetupWizard: (show: boolean) => void;
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
    telemetryLifecycleStage: TelemetryLifecycleStage;
    setTelemetryLifecycleStage: (stage: TelemetryLifecycleStage) => void;
    telemetryAutomationStatus: TelemetryAutomationStatusState | null;
    setTelemetryAutomationStatus: (status: TelemetryAutomationStatusState | null) => void;
    sidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean) => void;
    enableAutoLogRecording: boolean;
    setEnableAutoLogRecording: (enabled: boolean) => void;
    showWizard: WizardResult | null;
    setShowWizard: (result: WizardResult | null) => void;
    wizardInitialTab: 'result' | 'ocr' | null;
    setWizardInitialTab: (tab: 'result' | 'ocr' | null) => void;
    devMode: boolean;
    setDevMode: (enabled: boolean) => void;
    activeView: 'recording' | 'analytics' | 'smart-captures' | 'players' | 'id-mapper' | 'history' | 'dev-ocr';
    setActiveView: (view: 'recording' | 'analytics' | 'smart-captures' | 'players' | 'id-mapper' | 'history' | 'dev-ocr') => void;
    hiddenForScan: boolean;
    setHiddenForScan: (hidden: boolean) => void;
    showIdMapper: boolean;
    setShowIdMapper: (show: boolean) => void;
    visionStatus: 'idle' | 'capturing' | 'scanning' | 'processing';
    telemetryStatus: TelemetryStatusState;
    setVisionStatus: (status: 'idle' | 'capturing' | 'scanning' | 'processing') => void;
    setTelemetryStatus: (status: Partial<TelemetryStatusState>) => void;
    smartCapturesFocusMatchId: number | null;
    setSmartCapturesFocusMatchId: (id: number | null) => void;
    smartCapturesOpenOcrReviewMatchId: number | null;
    setSmartCapturesOpenOcrReviewMatchId: (id: number | null) => void;
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
        notifications: s.notifications,
        pushNotification: s.pushNotification,
        dismissActiveNotification: s.dismissActiveNotification,
        markNotificationRead: s.markNotificationRead,
        markAllNotificationsRead: s.markAllNotificationsRead,
        clearNotifications: s.clearNotifications,
        notificationCenterOpen: s.notificationCenterOpen,
        setNotificationCenterOpen: s.setNotificationCenterOpen,
        notificationsSuspended: s.notificationsSuspended,
        setNotificationsSuspended: s.setNotificationsSuspended,
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
        telemetryLifecycleStage: s.telemetryLifecycleStage, setTelemetryLifecycleStage: s.setTelemetryLifecycleStage,
        telemetryAutomationStatus: s.telemetryAutomationStatus, setTelemetryAutomationStatus: s.setTelemetryAutomationStatus,
        sidebarCollapsed: s.sidebarCollapsed, setSidebarCollapsed: s.setSidebarCollapsed,
        enableAutoLogRecording: s.enableAutoLogRecording, setEnableAutoLogRecording: s.setEnableAutoLogRecording,
        showWizard: s.showWizard, setShowWizard: s.setShowWizard,
        wizardInitialTab: s.wizardInitialTab, setWizardInitialTab: s.setWizardInitialTab,
        devMode: s.devMode, setDevMode: s.setDevMode,
        activeView: s.activeView, setActiveView: s.setActiveView,
        showIdMapper: s.showIdMapper, setShowIdMapper: s.setShowIdMapper,
        visionStatus: s.visionStatus, setVisionStatus: s.setVisionStatus,
        telemetryStatus: s.telemetryStatus, setTelemetryStatus: s.setTelemetryStatus,
        smartCapturesFocusMatchId: s.smartCapturesFocusMatchId, setSmartCapturesFocusMatchId: s.setSmartCapturesFocusMatchId,
        smartCapturesOpenOcrReviewMatchId: s.smartCapturesOpenOcrReviewMatchId, setSmartCapturesOpenOcrReviewMatchId: s.setSmartCapturesOpenOcrReviewMatchId,
    })));

    const [renameModal, setRenameModal] = React.useState<RenameModalState | null>(null);
    const [renameValue, setRenameValue] = React.useState<string>("");
    const [hiddenForScan, setHiddenForScan] = React.useState(false);
    const [showReviewQueue, setShowReviewQueue] = React.useState(false);
    const [showSetupWizard, setShowSetupWizard] = React.useState(false);
    const [smartCaptureRequest, setSmartCaptureRequest] = React.useState<SmartCaptureRequest | null>(null);

    const requestSmartCapture = React.useCallback((request: {
        activeUser?: string | null;
        source?: string;
        matchId?: string | number | null;
        requestId?: string;
        forceOcr?: boolean;
        behavior?: SmartCaptureBehavior;
    }) => {
        const requestId = request.requestId || `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setSmartCaptureRequest({
            requestId,
            activeUser: request.activeUser ?? null,
            source: request.source,
            matchId: request.matchId ?? null,
            forceOcr: request.forceOcr === true,
            behavior: request.behavior === 'auto-sequence' ? 'auto-sequence' : 'single',
        });
        return requestId;
    }, []);

    const clearSmartCaptureRequest = React.useCallback((requestId?: string) => {
        setSmartCaptureRequest((current) => {
            if (!current) return null;
            if (!requestId || current.requestId === requestId) return null;
            return current;
        });
    }, []);

    const value = useMemo(() => ({
        ...store,
        renameModal, setRenameModal,
        renameValue, setRenameValue,
        showReviewQueue, setShowReviewQueue,
        showSetupWizard, setShowSetupWizard,
        smartCaptureRequest, requestSmartCapture, clearSmartCaptureRequest,
        hiddenForScan, setHiddenForScan,
    }), [store, renameModal, renameValue, hiddenForScan, showReviewQueue, showSetupWizard, smartCaptureRequest, requestSmartCapture, clearSmartCaptureRequest]);

    return (
        <UIStateContext.Provider value={value}>
            {children}
        </UIStateContext.Provider>
    );
};
