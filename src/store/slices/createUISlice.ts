/**
 * @module createUISlice
 * Ephemeral UI state: modal visibility, toast messages, layout config,
 * overlay mode, dev mode toggle, session timer, and view routing.
 * Not persisted to disk (except layouts).
 */
import { StateCreator } from 'zustand';
import { DrillDownTarget } from '../../types';

export interface UISlice {
    isLoading: boolean;
    showWelcome: boolean;
    showTutorial: boolean;
    showSettings: boolean;
    showChangelog: boolean;
    showResetConfirm: boolean;
    isRearranging: boolean;
    toast: { message: string, type?: 'info' | 'warning' | 'error' | 'success' } | null;
    drillDownTarget: DrillDownTarget | null;
    showWelcomeBack: boolean;
    isLayoutReady: boolean;
    updateStatus: 'idle' | 'checking' | 'available' | 'downloaded' | 'not-available';
    inputMode: 'Smart' | 'Manual';
    showArtifactSelect: boolean;
    sessionStartTime: number;
    layouts: any;
    isOverlayMode: boolean;
    isAlwaysOnTop: boolean;
    overlayTab: 'Mission' | 'Squadron' | 'Social';
    overlayPhase: 'Setup' | 'Live' | 'Result';
    activeView: 'recording' | 'analytics' | 'history' | 'smart-captures' | 'dev-ocr';
    visionStatus: 'idle' | 'capturing' | 'scanning' | 'processing';
    telemetryStatus: { exists: boolean, size?: number, lastCheck?: number, error?: string, path?: string };

    setIsLoading: (isLoading: boolean) => void;
    setShowWelcome: (show: boolean) => void;
    setShowTutorial: (show: boolean) => void;
    setShowSettings: (show: boolean) => void;
    setShowChangelog: (show: boolean) => void;
    setShowResetConfirm: (show: boolean) => void;
    setIsRearranging: (isRearranging: boolean) => void;
    setToast: (toast: { message: string, type?: 'info' | 'warning' | 'error' | 'success' } | null) => void;
    setDrillDownTarget: (target: DrillDownTarget | null) => void;
    setShowWelcomeBack: (show: boolean) => void;
    setIsLayoutReady: (ready: boolean) => void;
    setUpdateStatus: (status: 'idle' | 'checking' | 'available' | 'downloaded' | 'not-available') => void;
    setInputMode: (mode: 'Smart' | 'Manual') => void;
    setShowArtifactSelect: (show: boolean) => void;
    setLayouts: (layouts: any) => void;
    setIsOverlayMode: (isOverlay: boolean) => void;
    setIsAlwaysOnTop: (always: boolean) => void;
    setOverlayTab: (tab: 'Mission' | 'Squadron' | 'Social') => void;
    setOverlayPhase: (phase: 'Setup' | 'Live' | 'Result') => void;
    setActiveView: (view: 'recording' | 'analytics' | 'history' | 'smart-captures' | 'dev-ocr') => void;
    showIdMapper: boolean;
    setShowIdMapper: (show: boolean) => void;
    setVisionStatus: (status: 'idle' | 'capturing' | 'scanning' | 'processing') => void;
    setTelemetryStatus: (status: any) => void;
    smartCapturesFocusMatchId: number | null;
    setSmartCapturesFocusMatchId: (id: number | null) => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
    isLoading: true,
    showWelcome: false,
    showTutorial: false,
    showSettings: false,
    showChangelog: false,
    showResetConfirm: false,
    isRearranging: false,
    toast: null,
    drillDownTarget: null,
    showWelcomeBack: false,
    isLayoutReady: false,
    updateStatus: 'idle',
    inputMode: 'Manual',
    showArtifactSelect: false,
    sessionStartTime: Date.now(),
    isOverlayMode: false,
    isAlwaysOnTop: false,
    overlayTab: 'Mission',
    overlayPhase: 'Setup',
    activeView: 'recording',
    visionStatus: 'idle',
    telemetryStatus: { exists: false },
    layouts: {
        lg: [
            { i: 'squadron', x: 0, y: 0, w: 6, h: 9 },
            { i: 'roster', x: 6, y: 0, w: 6, h: 9 },
            { i: 'actions', x: 0, y: 9, w: 12, h: 6 },
            { i: 'mission', x: 0, y: 15, w: 12, h: 14 },
            { i: 'analytics', x: 0, y: 29, w: 6, h: 16 },
            { i: 'timeline', x: 6, y: 29, w: 6, h: 16 },
            { i: 'history', x: 0, y: 45, w: 12, h: 23 }
        ],
        md: [
            { i: 'squadron', x: 0, y: 0, w: 5, h: 9 },
            { i: 'roster', x: 5, y: 0, w: 5, h: 9 },
            { i: 'actions', x: 0, y: 9, w: 10, h: 6 },
            { i: 'mission', x: 0, y: 15, w: 10, h: 14 },
            { i: 'analytics', x: 0, y: 29, w: 10, h: 16 },
            { i: 'history', x: 0, y: 45, w: 10, h: 23 }
        ],
        sm: [
            { i: 'squadron', x: 0, y: 0, w: 3, h: 9 },
            { i: 'roster', x: 3, y: 0, w: 3, h: 9 },
            { i: 'actions', x: 0, y: 9, w: 6, h: 6 },
            { i: 'mission', x: 0, y: 15, w: 6, h: 14 },
            { i: 'analytics', x: 0, y: 29, w: 6, h: 16 },
            { i: 'history', x: 0, y: 45, w: 6, h: 23 }
        ]
    },

    setIsLoading: (isLoading) => set({ isLoading }),
    setShowWelcome: (show) => set({ showWelcome: show }),
    setShowTutorial: (show) => set({ showTutorial: show }),
    setShowSettings: (show) => set({ showSettings: show }),
    setShowChangelog: (show) => set({ showChangelog: show }),
    setShowResetConfirm: (show) => set({ showResetConfirm: show }),
    setIsRearranging: (isRearranging) => set({ isRearranging }),
    setToast: (toast) => set({ toast }),
    setDrillDownTarget: (target) => set({ drillDownTarget: target }),
    setShowWelcomeBack: (show) => set({ showWelcomeBack: show }),
    setIsLayoutReady: (ready) => set({ isLayoutReady: ready }),
    setUpdateStatus: (status) => set({ updateStatus: status }),
    setInputMode: (mode) => set((state) => {
        const nextLayouts = { ...state.layouts };
        Object.keys(nextLayouts).forEach(key => {
            nextLayouts[key] = nextLayouts[key].map((item: any) => {
                if (item.i === 'mission') {
                    return { ...item, h: mode === 'Smart' ? 2 : 14 };
                }
                if (item.i === 'analytics') {
                    return { ...item, y: mode === 'Smart' ? 17 : 29, h: 16 };
                }
                if (item.i === 'history') {
                    return { ...item, y: mode === 'Smart' ? 33 : 45 };
                }
                return item;
            });
        });
        return { inputMode: mode, layouts: nextLayouts };
    }),
    setShowArtifactSelect: (show) => set({ showArtifactSelect: show }),
    setLayouts: (layouts) => set({ layouts }),
    setIsOverlayMode: (isOverlay) => {
        // IPC call handled in effect or here? Better in effect in App.tsx to keep store pure
        set({ isOverlayMode: isOverlay });
    },
    setIsAlwaysOnTop: (always) => set({ isAlwaysOnTop: always }),
    setOverlayTab: (tab) => set({ overlayTab: tab }),
    setOverlayPhase: (phase) => set({ overlayPhase: phase }),
    setActiveView: (view) => set({ activeView: view }),
    showIdMapper: false,
    setShowIdMapper: (show) => set({ showIdMapper: show }),
    setVisionStatus: (status) => set({ visionStatus: status }),
    setTelemetryStatus: (status) => set({ telemetryStatus: status }),
    smartCapturesFocusMatchId: null,
    setSmartCapturesFocusMatchId: (id) => set({ smartCapturesFocusMatchId: id }),
});