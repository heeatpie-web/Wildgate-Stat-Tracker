import React from 'react';
import { Bell, CheckCheck, Sparkles, Trash2, XCircle } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
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
    } = useUIState();
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const unreadCount = notifications.reduce((count, item) => count + (item.readAt ? 0 : 1), 0);
    const unread = notifications.filter((item) => !item.readAt);
    const read = notifications.filter((item) => !!item.readAt);

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
        if (deepLink.type === 'openWizard') {
            setActiveView('recording');
            if (deepLink.result) {
                setShowWizard(deepLink.result);
            }
        }
    }, [
        setActiveView,
        setShowIdMapper,
        setShowReviewQueue,
        setShowSettings,
        setShowWizard,
        setSmartCapturesFocusMatchId,
    ]);

    const onItemClick = (item: AppNotification) => {
        markNotificationRead(item.id);
        executeDeepLink(item.deepLink);
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
                className="w-8 h-8 rounded-control flex items-center justify-center border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 text-secondary relative"
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
                    className="absolute right-0 top-10 z-popover w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-md-sys-outline/20 bg-md-sys-surface-container-high shadow-2xl overflow-hidden"
                >
                    <div className="px-3 py-2 border-b border-md-sys-outline/10 flex items-center justify-between">
                        <div className="text-label-sm font-bold uppercase tracking-wide">Notifications</div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                className="h-7 px-2 rounded-control md3-btn-tonal text-label-xs font-bold"
                                onClick={() => markAllNotificationsRead()}
                                disabled={notifications.length === 0}
                                title="Mark all read"
                            >
                                <CheckCheck size={12} />
                            </button>
                            <button
                                type="button"
                                className="h-7 px-2 rounded-control md3-btn-tonal text-label-xs font-bold"
                                onClick={() => clearNotifications()}
                                disabled={notifications.length === 0}
                                title="Clear all"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-2">
                        {notifications.length === 0 && (
                            <div className="rounded-xl border border-md-sys-outline/10 bg-md-sys-surface px-3 py-4 text-label-sm opacity-70">
                                App updates and tips will appear here.
                            </div>
                        )}

                        {unread.length > 0 && (
                            <div className="px-2 pt-1 text-label-xs font-bold uppercase tracking-wide opacity-60">Unread</div>
                        )}
                        {unread.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onItemClick(item)}
                                className="w-full text-left rounded-xl border border-md-sys-outline/12 bg-md-sys-surface px-3 py-2 hover:bg-md-sys-surface-container-highest/80 transition-colors"
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
                                    <div className="text-label-xs opacity-50 shrink-0">{formatTime(item.createdAt)}</div>
                                </div>
                                <div className="mt-1 text-label-sm font-semibold leading-snug">{item.message}</div>
                            </button>
                        ))}

                        {read.length > 0 && (
                            <div className="px-2 pt-1 text-label-xs font-bold uppercase tracking-wide opacity-60">Earlier</div>
                        )}
                        {read.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onItemClick(item)}
                                className="w-full text-left rounded-xl border border-md-sys-outline/8 bg-md-sys-surface/70 px-3 py-2 hover:bg-md-sys-surface-container-high/70 transition-colors opacity-85"
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
                                    <div className="text-label-xs opacity-50 shrink-0">{formatTime(item.createdAt)}</div>
                                </div>
                                <div className="mt-1 text-label-sm leading-snug">{item.message}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;
