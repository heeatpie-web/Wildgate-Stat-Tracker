import React from 'react';
import { Bell, CheckCheck, Sparkles, Trash2, X, XCircle } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import type { AppNotification, NotificationDeepLink } from '../store/slices/createUISlice';

const SETTINGS_FOCUS_SECTION_STORAGE_KEY = 'wg_settings_focus_section_v1';

const sourceLabel: Record<AppNotification['source'], string> = {
    system: 'System',
    'smart-capture': 'Smart Capture',
    'id-mapper': 'ID Mapper',
    ocr: 'OCR',
    wizard: 'Wizard',
    history: 'History',
    settings: 'Settings',
    telemetry: 'Telemetry',
    'review-queue': 'Review Queue',
    user: 'User',
};

const iconToneClass = (type: AppNotification['type']) => {
    if (type === 'success') return 'text-success';
    if (type === 'error') return 'text-danger';
    if (type === 'warning') return 'text-warning';
    if (type === 'tip') return 'text-accent';
    return 'text-info';
};

const formatTime = (timestamp: number) => {
    try {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
};

export const NotificationCenter: React.FC = () => {
    const {
        notifications,
        notificationCenterOpen,
        setNotificationCenterOpen,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotifications,
        setActiveView,
        setShowSettings,
        setShowIdMapper,
        setShowReviewQueue,
        setShowWizard,
        setSmartCapturesFocusMatchId,
        setSmartCapturesOpenOcrReviewMatchId,
    } = useUIState();
    const dismissNotification = useAppStore((state) => state.dismissNotification);
    const advanceTipLibraryIndex = useAppStore((state) => state.advanceTipLibraryIndex);
    const setTipsEnabled = useAppStore((state) => state.setTipsEnabled);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(() => new Set());

    React.useEffect(() => {
        setDismissedIds((previous) => {
            if (previous.size === 0) return previous;
            const liveIds = new Set(notifications.map((item) => item.id));
            const next = new Set<string>();
            previous.forEach((id) => {
                if (liveIds.has(id)) next.add(id);
            });
            return next.size === previous.size ? previous : next;
        });
    }, [notifications]);

    const visibleNotifications = React.useMemo(
        () => notifications.filter((item) => !dismissedIds.has(item.id)),
        [notifications, dismissedIds]
    );
    const unreadCount = visibleNotifications.reduce((count, item) => count + (item.readAt ? 0 : 1), 0);
    const unread = visibleNotifications.filter((item) => !item.readAt);
    const read = visibleNotifications.filter((item) => !!item.readAt);
    const tipNotifications = React.useMemo(
        () => [...visibleNotifications.filter((item) => item.type === 'tip')].sort((a, b) => b.createdAt - a.createdAt),
        [visibleNotifications]
    );
    const pinnedTip = tipNotifications[0] || null;
    const unreadNonTips = unread.filter((item) => item.type !== 'tip');
    const readNonTips = read.filter((item) => item.type !== 'tip');

    const executeDeepLink = React.useCallback((deepLink?: NotificationDeepLink) => {
        if (!deepLink) return;
        if (deepLink.type === 'openView') {
            setActiveView(deepLink.view);
            if (deepLink.focusMatchId != null) {
                setSmartCapturesFocusMatchId(deepLink.focusMatchId);
            }
            return;
        }
        if (deepLink.type === 'openSettings') {
            setShowSettings(true);
            try {
                window.sessionStorage.setItem(
                    SETTINGS_FOCUS_SECTION_STORAGE_KEY,
                    JSON.stringify({
                        tab: deepLink.tab,
                        search: deepLink.section || '',
                    })
                );
            } catch {
                // ignore sessionStorage access issues
            }
            window.dispatchEvent(new CustomEvent('settings:focus-section', {
                detail: {
                    tab: deepLink.tab,
                    search: deepLink.section || '',
                },
            }));
            return;
        }
        if (deepLink.type === 'openIdMapper') {
            setShowIdMapper(true);
            return;
        }
        if (deepLink.type === 'openReviewQueue') {
            setShowReviewQueue(true);
            return;
        }
        if (deepLink.type === 'openTelemetryPrune') {
            window.dispatchEvent(new CustomEvent('telemetry:open-prune-modal'));
            return;
        }
        if (deepLink.type === 'openWizard') {
            setActiveView('recording');
            setShowWizard(deepLink.result || 'Match Result');
            return;
        }
        if (deepLink.type === 'openSmartCaptureOcrReview') {
            setActiveView('smart-captures');
            setSmartCapturesFocusMatchId(deepLink.matchId);
            setSmartCapturesOpenOcrReviewMatchId(deepLink.matchId);
        }
    }, [
        setActiveView,
        setShowIdMapper,
        setShowReviewQueue,
        setShowSettings,
        setShowWizard,
        setSmartCapturesFocusMatchId,
        setSmartCapturesOpenOcrReviewMatchId,
    ]);

    const onItemClick = (item: AppNotification) => {
        markNotificationRead(item.id);
        executeDeepLink(item.deepLink);
    };

    const onItemKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, item: AppNotification) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onItemClick(item);
        }
    };

    const onItemDismiss = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
        event.preventDefault();
        event.stopPropagation();
        setDismissedIds((previous) => {
            if (previous.has(id)) return previous;
            const next = new Set(previous);
            next.add(id);
            return next;
        });
        dismissNotification(id);
    };

    const handleMarkAllRead = () => {
        markAllNotificationsRead();
        setNotificationCenterOpen(false);
    };

    const handleClearAll = () => {
        clearNotifications();
        setNotificationCenterOpen(false);
    };

    React.useEffect(() => {
        if (!notificationCenterOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(event.target as Node)) {
                setNotificationCenterOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setNotificationCenterOpen(false);
            }
        };
        window.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [notificationCenterOpen, setNotificationCenterOpen]);

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                className="w-8 h-8 rounded-control flex items-center justify-center border border-md-sys-outline/15 bg-md-sys-surface-container-highest hover:bg-md-sys-surface-container-high text-secondary relative shadow-sm"
                onClick={() => setNotificationCenterOpen(!notificationCenterOpen)}
                aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
                aria-expanded={notificationCenterOpen}
                aria-controls="notification-center-panel"
                title="Notifications"
            >
                <Bell size={16} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-md-sys-error text-md-sys-onError text-label-xs font-bold flex items-center justify-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {notificationCenterOpen && (
                <div
                    id="notification-center-panel"
                    role="dialog"
                    aria-label="Notification inbox"
                    className="fixed right-4 top-20 z-top w-[min(30rem,calc(100vw-2rem))] max-h-[calc(100vh-7rem)] rounded-2xl border border-md-sys-outline/30 bg-md-sys-surface-container-highest text-md-sys-on-surface shadow-[0_24px_56px_rgba(0,0,0,0.52)] overflow-hidden"
                >
                    <div className="px-4 py-3 border-b border-md-sys-outline/14 flex items-center justify-between">
                        <div className="text-label-sm font-bold uppercase tracking-wide">Notifications</div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                className="h-7 px-2 rounded-control md3-btn-tonal text-label-xs font-bold"
                                onClick={handleMarkAllRead}
                                disabled={visibleNotifications.length === 0}
                                title="Mark all read"
                            >
                                <CheckCheck size={12} />
                            </button>
                            <button
                                type="button"
                                className="h-7 px-2 rounded-control md3-btn-tonal text-label-xs font-bold"
                                onClick={handleClearAll}
                                disabled={visibleNotifications.length === 0}
                                title="Clear all"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[calc(100vh-11rem)] overflow-y-auto custom-scrollbar p-3 space-y-2 bg-md-sys-surface-container-highest">
                        {visibleNotifications.length === 0 && (
                            <div className="rounded-xl border border-md-sys-outline/20 bg-md-sys-surface-container-high px-3 py-4 text-body-sm opacity-90">
                                App updates and tips will appear here.
                            </div>
                        )}

                        {pinnedTip && (
                            <div
                                onClick={() => onItemClick(pinnedTip)}
                                onKeyDown={(event) => onItemKeyDown(event, pinnedTip)}
                                role="button"
                                tabIndex={0}
                                className="w-full text-left rounded-xl border border-md-sys-outline/25 bg-md-sys-surface-container-high px-3 py-3 hover:bg-accent-soft/25 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/30"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Sparkles size={13} className="text-accent" />
                                        <span className="text-label-sm font-bold uppercase tracking-wide text-accent">
                                            Tip
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            className="h-7 px-2.5 rounded-control text-label-sm font-bold bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                                            aria-label="Next tip"
                                            title="Next tip"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                if (typeof advanceTipLibraryIndex === 'function') {
                                                    advanceTipLibraryIndex(1);
                                                }
                                            }}
                                        >
                                            Next Tip
                                        </button>
                                        <button
                                            type="button"
                                            className="h-7 px-2.5 rounded-control text-label-sm font-bold bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                                            aria-label="Hide tips"
                                            title="Hide tips"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setTipsEnabled(false);
                                                dismissNotification(pinnedTip.id);
                                            }}
                                        >
                                            Hide Tips
                                        </button>
                                        <button
                                            type="button"
                                            className="w-6 h-6 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/55 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                                            aria-label="Dismiss tip"
                                            title="Dismiss tip"
                                            onClick={(event) => onItemDismiss(event, pinnedTip.id)}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-1.5 text-body-sm font-semibold leading-snug">{pinnedTip.message}</div>
                            </div>
                        )}

                        {unreadNonTips.length > 0 && (
                            <div className="px-2 pt-1 text-label-xs font-bold uppercase tracking-wide opacity-60">Unread</div>
                        )}
                        {unreadNonTips.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => onItemClick(item)}
                                onKeyDown={(event) => onItemKeyDown(event, item)}
                                role="button"
                                tabIndex={0}
                                className="w-full text-left rounded-xl border border-md-sys-outline/16 bg-md-sys-surface-container px-3 py-3 hover:bg-md-sys-surface-container-high transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-md-sys-primary/25"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={iconToneClass(item.type)}>
                                            {item.type === 'tip' ? <Sparkles size={14} /> : <Bell size={14} />}
                                        </span>
                                        <div className="text-label-xs font-semibold uppercase tracking-wide-06 opacity-60 truncate">
                                            {sourceLabel[item.source]}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <div className="text-label-xs opacity-50">{formatTime(item.createdAt)}</div>
                                        <button
                                            type="button"
                                            className="w-6 h-6 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/55 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                                            aria-label="Dismiss notification"
                                            title="Dismiss"
                                            onClick={(event) => onItemDismiss(event, item.id)}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-1 text-body-sm font-semibold leading-snug">{item.message}</div>
                            </div>
                        ))}

                        {readNonTips.length > 0 && (
                            <div className="px-2 pt-1 text-label-xs font-bold uppercase tracking-wide opacity-60">Earlier</div>
                        )}
                        {readNonTips.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => onItemClick(item)}
                                onKeyDown={(event) => onItemKeyDown(event, item)}
                                role="button"
                                tabIndex={0}
                                className="w-full text-left rounded-xl border border-md-sys-outline/14 bg-md-sys-surface-container-low px-3 py-3 hover:bg-md-sys-surface-container transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-md-sys-primary/20"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={iconToneClass(item.type)}>
                                            {item.type === 'tip' ? <Sparkles size={14} /> : <XCircle size={14} />}
                                        </span>
                                        <div className="text-label-xs font-semibold uppercase tracking-wide-06 opacity-60 truncate">
                                            {sourceLabel[item.source]}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <div className="text-label-xs opacity-50">{formatTime(item.createdAt)}</div>
                                        <button
                                            type="button"
                                            className="w-6 h-6 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/55 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                                            aria-label="Dismiss notification"
                                            title="Dismiss"
                                            onClick={(event) => onItemDismiss(event, item.id)}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-1 text-body-sm leading-snug">{item.message}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;
