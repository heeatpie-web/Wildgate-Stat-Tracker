import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle, Info, Sparkles, X } from 'lucide-react';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { playSoundCue } from '../utils/soundCues';
import { runtimeConfig } from '../config/runtimeConfig';
import { useAppStore } from '../store/useAppStore';
import type { AppNotification, NotificationKind } from '../store/slices/createUISlice';

export interface ToastProps {
  message: string;
  type?: NotificationKind;
  duration?: number;
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}

interface RenderToast {
  id: string;
  message: string;
  type: NotificationKind;
  durationMs: number;
  action?: { label: string; onClick: () => void };
  fromStore: boolean;
}

const MAX_VISIBLE_TOASTS = 5;

const resolveAccentClass = (type: NotificationKind) => (
  type === 'success'
    ? 'border-success text-success'
    : type === 'error'
      ? 'border-danger text-danger'
      : type === 'warning'
        ? 'border-warning text-warning'
        : type === 'tip'
          ? 'border-accent text-accent'
          : 'border-info text-info'
);

const resolveIcon = (type: NotificationKind) => (
  type === 'success'
    ? <CheckCircle size={20} />
    : type === 'error'
      ? <AlertCircle size={20} />
      : type === 'warning'
        ? <AlertCircle size={20} />
        : type === 'tip'
          ? <Sparkles size={20} />
          : <Info size={20} />
);

const playNotificationSound = (type: NotificationKind) => {
  if (type === 'success') {
    playSoundCue('success');
    return;
  }
  if (type === 'error') {
    playSoundCue('error');
    return;
  }
  if (type === 'warning') {
    playSoundCue('warning');
    return;
  }
  playSoundCue('info');
};

const isVisiblePopup = (notification: AppNotification | undefined): notification is AppNotification => (
  !!notification && notification.popup && !notification.readAt
);

interface ToastCardProps {
  toast: RenderToast;
  soundEnabled: boolean;
  onClose: () => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ toast, soundEnabled, onClose }) => {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs]);

  useEffect(() => {
    if (!soundEnabled) return;
    playNotificationSound(toast.type);
  }, [toast.id, soundEnabled, toast.type]);

  const accentClass = resolveAccentClass(toast.type);
  const icon = resolveIcon(toast.type);

  return (
    <div
      className="pointer-events-auto rounded-2xl shadow-[0_24px_56px_rgba(0,0,0,0.46)] flex items-start gap-3 animate-slide-up w-full overflow-hidden border border-md-sys-outline bg-md-sys-surface text-md-sys-on-surface"
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className={`w-1.5 self-stretch shrink-0 border-r ${accentClass}`} />
      <div className="pt-3 pb-3 pl-1">
        <div className={accentClass}>{icon}</div>
      </div>
      <div className="font-semibold text-body leading-tight flex-1 py-3 pr-1 tracking-tight">{toast.message}</div>
      {toast.action && (
        <button
          onClick={() => { toast.action?.onClick(); onCloseRef.current(); }}
          className="my-3 text-label-sm font-black uppercase tracking-wide underline underline-offset-2 hover:no-underline px-1 shrink-0 text-md-sys-primary"
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={() => onCloseRef.current()} className="m-1.5 p-2 hover:bg-md-sys-on-surface/10 rounded-full shrink-0" aria-label="Dismiss notification"><X size={16} /></button>
    </div>
  );
};

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = runtimeConfig.ui.toastDurationMs, onClose, action }) => {
  const { soundEnabled } = useUserPreferences();
  const dismissNotification = useAppStore((state) => state.dismissNotification);
  const hasStoreToastState = useAppStore((state) => (
    !!state.toast || !!state.activeNotificationId || state.notificationQueue.length > 0
  ));
  const stackedToasts = useAppStore((state) => {
    const notificationsById = new Map(state.notifications.map((item) => [item.id, item]));
    return state.notificationQueue
      .map((id) => notificationsById.get(id))
      .filter((item): item is AppNotification => isVisiblePopup(item))
      .map((item): RenderToast => ({
        id: item.id,
        message: item.message,
        type: item.type,
        durationMs: item.durationMs,
        action: item.action,
        fromStore: true,
      }));
  });

  const fallbackMessage = String(message || '').trim();
  const fallbackToast: RenderToast[] = fallbackMessage
    ? [{
      id: '__toast_fallback__',
      message: fallbackMessage,
      type,
      durationMs: duration,
      action,
      fromStore: false,
    }]
    : [];
  const toasts = stackedToasts.length > 0
    ? stackedToasts
    : hasStoreToastState
      ? []
      : fallbackToast;
  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS);
  if (visibleToasts.length === 0) {
    return null;
  }

  return createPortal(
    <div className="fixed top-4 right-4 sm:top-6 sm:right-6 bottom-auto left-auto z-overlay w-[min(30rem,calc(100vw-2rem))] flex flex-col gap-3 pointer-events-none">
      {visibleToasts.map((toastItem) => (
        <ToastCard
          key={toastItem.id}
          toast={toastItem}
          soundEnabled={soundEnabled}
          onClose={toastItem.fromStore
            ? () => dismissNotification(toastItem.id)
            : onClose}
        />
      ))}
    </div>,
    document.body
  );
};

