import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle, Info, Sparkles, X } from 'lucide-react';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { playSoundCue } from '../utils/soundCues';
import { runtimeConfig } from '../config/runtimeConfig';
import type { NotificationKind } from '../store/slices/createUISlice';

export interface ToastProps {
  message: string;
  type?: NotificationKind;
  duration?: number;
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = runtimeConfig.ui.toastDurationMs, onClose, action }) => {
  const { soundEnabled } = useUserPreferences();

  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  useEffect(() => {
    if (!soundEnabled) return;
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
    if (type === 'tip') {
      playSoundCue('info');
      return;
    }
    playSoundCue('info');
  }, [message, soundEnabled, type]);

  const accentClass = type === 'success'
    ? 'border-success text-success'
    : type === 'error'
      ? 'border-danger text-danger'
      : type === 'warning'
        ? 'border-warning text-warning'
        : type === 'tip'
          ? 'border-accent text-accent'
          : 'border-info text-info';
  const icon = type === 'success'
    ? <CheckCircle size={20} />
    : type === 'error'
      ? <AlertCircle size={20} />
      : type === 'warning'
        ? <AlertCircle size={20} />
        : type === 'tip'
          ? <Sparkles size={20} />
          : <Info size={20} />;

  return createPortal(
    <div
      className="fixed bottom-6 right-6 z-overlay rounded-2xl shadow-2xl flex items-start gap-3 animate-slide-up w-[min(30rem,calc(100vw-2rem))] overflow-hidden border border-md-sys-outline/20 bg-md-sys-surface-container-high text-md-sys-on-surface"
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
        <div className={`w-1.5 self-stretch shrink-0 border-r ${accentClass}`} />
        <div className="pt-3 pb-3 pl-1">
            <div className={accentClass}>{icon}</div>
        </div>
        <div className="font-semibold text-body leading-tight flex-1 py-3 pr-1">{message}</div>
        {action && (
            <button
                onClick={() => { action.onClick(); onClose(); }}
                className="my-3 text-label-sm font-black uppercase tracking-wide underline underline-offset-2 hover:no-underline px-1 shrink-0"
            >
                {action.label}
            </button>
        )}
        <button onClick={onClose} className="m-2 p-1 hover:bg-md-sys-on-surface/10 rounded-full shrink-0" aria-label="Dismiss notification"><X size={16}/></button>
    </div>,
    document.body
  );
};

