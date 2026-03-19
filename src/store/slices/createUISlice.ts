/**
 * @module createUISlice
 * Ephemeral UI state: modal visibility, toast messages, layout config,
 * overlay mode, dev mode toggle, session timer, and view routing.
 * Not persisted to disk (except layouts).
 */
import { StateCreator } from 'zustand';
import { DrillDownTarget } from '../../types';
import { runtimeConfig } from '../../config/runtimeConfig';

const MAX_NOTIFICATION_HISTORY = 200;
const DEFAULT_NOTIFICATION_DURATION_MS = runtimeConfig.ui.toastDurationMs;
const DUPLICATE_NOTIFICATION_WINDOW_MS = 8_000;

export type AppView = 'recording' | 'analytics' | 'smart-captures' | 'players' | 'id-mapper' | 'history' | 'dev-ocr';
export type NotificationKind = 'info' | 'warning' | 'error' | 'success' | 'tip';
export type NotificationSource =
    | 'system'
    | 'smart-capture'
    | 'id-mapper'
    | 'ocr'
    | 'wizard'
    | 'history'
    | 'settings'
    | 'telemetry'
    | 'review-queue'
    | 'user';

export type NotificationDeepLink =
    | { type: 'openView'; view: AppView; focusMatchId?: number | null }
    | { type: 'openSettings'; tab: 'identity' | 'interface' | 'ocr-capture' | 'data'; section?: string }
    | { type: 'openIdMapper' }
    | { type: 'openReviewQueue' }
    | { type: 'openTelemetryPrune' }
    | { type: 'openWizard'; result?: 'Win' | 'Loss' | 'Draw' | 'Match Result' }
    | { type: 'openSmartCaptureOcrReview'; matchId: number };

export interface NotificationAction {
    label: string;
    onClick: () => void;
}

export interface NotificationInput {
    message: string;
    type?: NotificationKind;
    action?: NotificationAction;
    source?: NotificationSource;
    popup?: boolean;
    durationMs?: number;
    deepLink?: NotificationDeepLink;
}

export interface ToastState {
    id: string;
    message: string;
    type: NotificationKind;
    action?: NotificationAction;
    durationMs: number;
}

export interface AppNotification {
    id: string;
    message: string;
    type: NotificationKind;
    action?: NotificationAction;
    source: NotificationSource;
    popup: boolean;
    durationMs: number;
    deepLink?: NotificationDeepLink;
    createdAt: number;
    readAt: number | null;
}

export interface TelemetryStatusState {
    exists: boolean;
    size?: number;
    lastCheck?: number;
    error?: string;
    path?: string;
    lastEventAt?: number;
}

export type TelemetryLifecycleStage = 'idle' | 'loading' | 'pregame' | 'live' | 'result';
export type TelemetryAutomationStatusPhase =
    | 'idle'
    | 'loading-match'
    | 'pregame-detected'
    | 'capturing-lobby'
    | 'lobby-complete'
    | 'live-match'
    | 'capturing-live-fallback'
    | 'watching-result'
    | 'result-ocr'
    | 'manual-result-needed'
    | 'failed';
export type TelemetryAutomationStatusLevel = 'info' | 'success' | 'warning' | 'error';

export interface TelemetryAutomationStatusState {
    phase: TelemetryAutomationStatusPhase;
    message: string;
    matchId?: number | null;
    updatedAt: number;
    level: TelemetryAutomationStatusLevel;
}

export interface UISlice {
    isLoading: boolean;
    showWelcome: boolean;
    showTutorial: boolean;
    showSettings: boolean;
    showChangelog: boolean;
    showResetConfirm: boolean;
    isRearranging: boolean;
    toast: ToastState | null;
    notifications: AppNotification[];
    notificationQueue: string[];
    activeNotificationId: string | null;
    notificationCenterOpen: boolean;
    notificationsSuspended: boolean;
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
    telemetryLifecycleStage: TelemetryLifecycleStage;
    telemetryAutomationStatus: TelemetryAutomationStatusState | null;
    sidebarCollapsed: boolean;
    activeView: AppView;
    visionStatus: 'idle' | 'capturing' | 'scanning' | 'processing';
    telemetryStatus: TelemetryStatusState;

    setIsLoading: (isLoading: boolean) => void;
    setShowWelcome: (show: boolean) => void;
    setShowTutorial: (show: boolean) => void;
    setShowSettings: (show: boolean) => void;
    setShowChangelog: (show: boolean) => void;
    setShowResetConfirm: (show: boolean) => void;
    setIsRearranging: (isRearranging: boolean) => void;
    setToast: (toast: NotificationInput | null) => void;
    pushNotification: (notification: NotificationInput) => void;
    dismissActiveNotification: () => void;
    dismissNotification: (id: string) => void;
    markNotificationRead: (id: string) => void;
    markAllNotificationsRead: () => void;
    clearNotifications: () => void;
    setNotificationCenterOpen: (open: boolean) => void;
    setNotificationsSuspended: (suspended: boolean) => void;
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
    setTelemetryLifecycleStage: (stage: TelemetryLifecycleStage) => void;
    setTelemetryAutomationStatus: (status: TelemetryAutomationStatusState | null) => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setActiveView: (view: AppView) => void;
    showIdMapper: boolean;
    setShowIdMapper: (show: boolean) => void;
    setVisionStatus: (status: 'idle' | 'capturing' | 'scanning' | 'processing') => void;
    setTelemetryStatus: (status: Partial<TelemetryStatusState>) => void;
    smartCapturesFocusMatchId: number | null;
    setSmartCapturesFocusMatchId: (id: number | null) => void;
    smartCapturesOpenOcrReviewMatchId: number | null;
    setSmartCapturesOpenOcrReviewMatchId: (id: number | null) => void;
}

type NotificationStateShape = Pick<
    UISlice,
    'toast' | 'notifications' | 'notificationQueue' | 'activeNotificationId'
>;

const buildNotificationId = () => `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const toPositiveDuration = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_NOTIFICATION_DURATION_MS;
    return Math.round(parsed);
};

const createNotification = (input: NotificationInput): AppNotification => {
    const type = input.type ?? 'info';
    return {
        id: buildNotificationId(),
        message: String(input.message || '').trim(),
        type,
        action: input.action,
        source: input.source ?? 'system',
        popup: input.popup === true,
        durationMs: toPositiveDuration(input.durationMs),
        deepLink: input.deepLink,
        createdAt: Date.now(),
        readAt: null,
    };
};

const toToastState = (notification: AppNotification): ToastState => ({
    id: notification.id,
    message: notification.message,
    type: notification.type,
    action: notification.action,
    durationMs: notification.durationMs,
});

const trimNotificationState = (
    state: NotificationStateShape,
    notificationsSuspended = false
): NotificationStateShape => {
    const notifications = state.notifications.slice(0, MAX_NOTIFICATION_HISTORY);
    const notificationsById = new Map(notifications.map((item) => [item.id, item]));
    const seen = new Set<string>();
    const notificationQueue: string[] = [];
    const collect = (id: string | null | undefined) => {
        if (!id || seen.has(id)) return;
        const notification = notificationsById.get(id);
        if (!notification || !notification.popup || notification.readAt) return;
        seen.add(id);
        notificationQueue.push(id);
    };
    collect(state.activeNotificationId);
    (state.notificationQueue || []).forEach((id) => collect(id));
    const activeNotificationId = notificationQueue.length > 0 ? notificationQueue[0] : null;
    const activeNotification = activeNotificationId
        ? notificationsById.get(activeNotificationId) ?? null
        : null;
    if (notificationsSuspended) {
        return {
            notifications,
            notificationQueue,
            activeNotificationId: null,
            toast: null,
        };
    }
    return {
        notifications,
        notificationQueue,
        activeNotificationId,
        toast: activeNotification ? toToastState(activeNotification) : null,
    };
};

const pushNotificationState = (
    state: NotificationStateShape,
    input: NotificationInput,
    notificationsSuspended = false
): NotificationStateShape => {
    const normalizedMessage = String(input.message || '').trim();
    if (input.type !== 'tip') {
        const maybeDuplicate = state.notifications.find((item) => (
            item.message === normalizedMessage
            && item.type === (input.type ?? 'info')
            && item.source === (input.source ?? 'system')
            && (Date.now() - item.createdAt) <= DUPLICATE_NOTIFICATION_WINDOW_MS
        ));
        if (maybeDuplicate) {
            return trimNotificationState(state, notificationsSuspended);
        }
    }

    const notification = createNotification(input);
    let nextState: NotificationStateShape = {
        notifications: [notification, ...state.notifications],
        notificationQueue: [...state.notificationQueue],
        activeNotificationId: state.activeNotificationId,
        toast: state.toast,
    };

    if (notification.popup) {
        nextState.notificationQueue = [notification.id, state.activeNotificationId, ...nextState.notificationQueue]
            .filter((id): id is string => !!id);
        nextState.activeNotificationId = null;
        nextState.toast = toToastState(notification);
    }

    if (notification.type === 'tip') {
        const readAt = Date.now();
        const staleTipIds = new Set(
            nextState.notifications
                .filter((item) => item.type === 'tip' && item.id !== notification.id)
                .map((item) => item.id)
        );
        if (staleTipIds.size > 0) {
            nextState.notifications = nextState.notifications.map((item) => (
                staleTipIds.has(item.id) && !item.readAt
                    ? { ...item, readAt }
                    : item
            ));
            nextState.notificationQueue = nextState.notificationQueue.filter((id) => !staleTipIds.has(id));
            if (nextState.activeNotificationId && staleTipIds.has(nextState.activeNotificationId)) {
                nextState.activeNotificationId = null;
                nextState.toast = null;
            }
        }
    }

    nextState = trimNotificationState(nextState, notificationsSuspended);
    return nextState;
};

const dismissNotificationState = (
    state: NotificationStateShape,
    notificationId: string,
    notificationsSuspended = false
): NotificationStateShape => {
    const id = String(notificationId || '').trim();
    if (!id) {
        return trimNotificationState(state, notificationsSuspended);
    }
    const readAt = Date.now();
    return trimNotificationState({
        notifications: state.notifications.map((item) =>
            item.id === id && !item.readAt
                ? { ...item, readAt }
                : item
        ),
        notificationQueue: state.notificationQueue.filter((queuedId) => queuedId !== id),
        activeNotificationId: state.activeNotificationId === id ? null : state.activeNotificationId,
        toast: null,
    }, notificationsSuspended);
};

const dismissActiveNotificationState = (
    state: NotificationStateShape,
    notificationsSuspended = false
): NotificationStateShape => {
    const activeId = state.activeNotificationId ?? state.notificationQueue[0] ?? null;
    if (!activeId) {
        return trimNotificationState({
            notifications: state.notifications,
            notificationQueue: state.notificationQueue,
            activeNotificationId: state.activeNotificationId,
            toast: state.toast,
        }, notificationsSuspended);
    }
    return dismissNotificationState(state, activeId, notificationsSuspended);
};

export const createUISlice: StateCreator<UISlice> = (set) => ({
    isLoading: true,
    showWelcome: false,
    showTutorial: false,
    showSettings: false,
    showChangelog: false,
    showResetConfirm: false,
    isRearranging: false,
    toast: null,
    notifications: [],
    notificationQueue: [],
    activeNotificationId: null,
    notificationCenterOpen: false,
    notificationsSuspended: false,
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
    telemetryLifecycleStage: 'idle',
    telemetryAutomationStatus: null,
    sidebarCollapsed: false,
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
    setToast: (toast) => set((state) => {
        if (!toast) {
            return dismissActiveNotificationState(state, state.notificationsSuspended);
        }
        return pushNotificationState(state, {
            ...toast,
            popup: toast.popup === true,
        }, state.notificationsSuspended);
    }),
    pushNotification: (notification) => set((state) => pushNotificationState(state, notification, state.notificationsSuspended)),
    dismissActiveNotification: () => set((state) => dismissActiveNotificationState(state, state.notificationsSuspended)),
    dismissNotification: (id) => set((state) => dismissNotificationState(state, id, state.notificationsSuspended)),
    markNotificationRead: (id) => set((state) => trimNotificationState({
        notifications: state.notifications.map((item) =>
            item.id === id && !item.readAt
                ? { ...item, readAt: Date.now() }
                : item
        ),
        notificationQueue: state.notificationQueue.filter((queuedId) => queuedId !== id),
        activeNotificationId: state.activeNotificationId === id ? null : state.activeNotificationId,
        toast: state.toast,
    }, state.notificationsSuspended)),
    markAllNotificationsRead: () => set((state) => {
        const readAt = Date.now();
        return trimNotificationState({
            notifications: state.notifications.map((item) =>
                item.readAt ? item : { ...item, readAt }
            ),
            notificationQueue: [],
            activeNotificationId: null,
            toast: null,
        }, state.notificationsSuspended);
    }),
    clearNotifications: () => set({
        notifications: [],
        notificationQueue: [],
        activeNotificationId: null,
        toast: null,
        notificationCenterOpen: false,
    }),
    setNotificationCenterOpen: (open) => set({ notificationCenterOpen: open }),
    setNotificationsSuspended: (suspended) => set((state) => ({
        notificationsSuspended: suspended,
        notificationCenterOpen: suspended ? false : state.notificationCenterOpen,
        ...trimNotificationState({
            notifications: state.notifications,
            notificationQueue: state.notificationQueue,
            activeNotificationId: state.activeNotificationId,
            toast: state.toast,
        }, suspended),
    })),
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
    setTelemetryLifecycleStage: (stage) => set({ telemetryLifecycleStage: stage }),
    setTelemetryAutomationStatus: (status) => set({
        telemetryAutomationStatus: status
            ? {
                ...status,
                updatedAt: Number.isFinite(Number(status.updatedAt))
                    ? Number(status.updatedAt)
                    : Date.now(),
            }
            : null,
    }),
    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    setActiveView: (view) => set({
        activeView: view,
        showIdMapper: view === 'id-mapper',
    }),
    showIdMapper: false,
    setShowIdMapper: (show) => set((state) => ({
        showIdMapper: show,
        activeView: show
            ? 'id-mapper'
            : (state.activeView === 'id-mapper' ? 'recording' : state.activeView),
    })),
    setVisionStatus: (status) => set({ visionStatus: status }),
    setTelemetryStatus: (status) => set((state) => ({ telemetryStatus: { ...state.telemetryStatus, ...status } })),
    smartCapturesFocusMatchId: null,
    setSmartCapturesFocusMatchId: (id) => set({ smartCapturesFocusMatchId: id }),
    smartCapturesOpenOcrReviewMatchId: null,
    setSmartCapturesOpenOcrReviewMatchId: (id) => set({ smartCapturesOpenOcrReviewMatchId: id }),
});
