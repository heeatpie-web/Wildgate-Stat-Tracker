import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { playSoundCue } from '../utils/soundCues';
import { runtimeConfig } from '../config/runtimeConfig';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = runtimeConfig.ui.toastDurationMs, onClose }) => {
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
    playSoundCue('info');
  }, [message, soundEnabled, type]);

  const bg = type === 'success' ? 'bg-success' : type === 'error' ? 'bg-danger' : type === 'warning' ? 'bg-warning' : 'bg-info';
  const icon = type === 'success' ? <CheckCircle size={20}/> : type === 'error' ? <AlertCircle size={20}/> : type === 'warning' ? <AlertCircle size={20}/> : <Info size={20}/>;

  return createPortal(
    <div
      className={`fixed bottom-6 right-6 z-overlay ${bg} text-on-scrim px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-slide-up max-w-sm`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
        <div>{icon}</div>
        <div className="font-bold text-body leading-tight">{message}</div>
        <button onClick={onClose} className="p-1 hover:bg-md-sys-on-surface/20 rounded-full" aria-label="Dismiss notification"><X size={16}/></button>
    </div>,
    document.body
  );
};

