import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = 5000, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bg = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : type === 'warning' ? 'bg-amber-500' : 'bg-blue-500';
  const icon = type === 'success' ? <CheckCircle size={20}/> : type === 'error' ? <AlertCircle size={20}/> : type === 'warning' ? <AlertCircle size={20}/> : <Info size={20}/>;

  return createPortal(
    <div className={`fixed bottom-6 right-6 z-[9999] ${bg} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-slide-up max-w-sm`}>
        <div>{icon}</div>
        <div className="font-bold text-sm leading-tight">{message}</div>
        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full"><X size={16}/></button>
    </div>,
    document.body
  );
};
