import React from 'react';
import { Minus, X, Maximize2, Minimize2 } from 'lucide-react';
import { APP_VERSION } from '../types';
import { getElectronAPI } from '../utils/electronAPI';

export const WindowFrame: React.FC = () => {
    const [isMaximized, setIsMaximized] = React.useState(false);
    const api = getElectronAPI();

    React.useEffect(() => {
        if (!api) return;

        const unsub = api.on('window-maximized-changed', (maximized: boolean) => {
            setIsMaximized(maximized);
        });

        return unsub;
    }, []);

    const handleMinimize = () => api?.send('minimize-window');
    const handleMaximize = () => api?.send('maximize-window');
    const handleClose = () => api?.send('close-window');

    return (
        <div
            className="h-9 premium-titlebar flex items-center justify-between px-3 shrink-0 select-none"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            {/* Left: App Identity */}
            <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-control bg-gradient-to-br from-md-sys-primary to-md-sys-tertiary flex items-center justify-center shadow-sm">
                    <span className="text-label-xs font-bold text-white">W</span>
                </div>
                <span className="text-label-sm font-semibold tracking-[0.08em] uppercase">Wildgate Stat Tracker</span>
                <span className="text-label-xs font-mono opacity-40">{APP_VERSION}</span>
            </div>

            {/* Right: Window Controls */}
            <div
                className="flex items-center gap-0.5"
                style={{ WebkitAppRegion: 'no-drag' } as any}
            >
                <button
                    onClick={handleMinimize}
                    className="md3-icon-btn w-9 h-7 rounded-control"
                    title="Minimize"
                >
                    <Minus size={14} className="opacity-60" />
                </button>
                <button
                    onClick={handleMaximize}
                    className="md3-icon-btn w-9 h-7 rounded-control"
                    title={isMaximized ? "Restore" : "Maximize"}
                >
                    {isMaximized ? (
                        <Minimize2 size={12} className="opacity-60" />
                    ) : (
                        <Maximize2 size={12} className="opacity-60" />
                    )}
                </button>
                <button
                    onClick={handleClose}
                    className="md3-icon-btn group w-9 h-7 rounded-control hover:bg-md-sys-error hover:text-md-sys-on-error"
                    title="Close"
                >
                    <X size={14} className="opacity-60 group-hover:opacity-100" />
                </button>
            </div>
        </div>
    );
};

