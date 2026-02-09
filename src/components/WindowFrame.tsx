import React from 'react';
import { Minus, Square, X, Maximize2, Minimize2 } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { APP_VERSION } from '../types';
import { getElectronAPI } from '../utils/electronAPI';

export const WindowFrame: React.FC = () => {
    const { isAlwaysOnTop } = useUIState();
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
            className="h-8 bg-md-sys-surface2 flex items-center justify-between px-3 shrink-0 select-none"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            {/* Left: App Identity */}
            <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gradient-to-br from-md-sys-primary to-md-sys-secondary flex items-center justify-center">
                    <span className="text-[8px] font-black text-white">W</span>
                </div>
                <span className="text-xs font-bold opacity-70">Wildgate Tracker</span>
                <span className="text-[10px] font-mono opacity-40">{APP_VERSION}</span>
                {isAlwaysOnTop && (
                    <span className="text-[9px] font-bold bg-md-sys-primary/20 text-md-sys-primary px-1.5 py-0.5 rounded">
                        Pinned
                    </span>
                )}
            </div>

            {/* Right: Window Controls */}
            <div
                className="flex items-center gap-0.5"
                style={{ WebkitAppRegion: 'no-drag' } as any}
            >
                <button
                    onClick={handleMinimize}
                    className="w-10 h-7 flex items-center justify-center hover:bg-md-sys-surface3 transition-colors rounded"
                    title="Minimize"
                >
                    <Minus size={14} className="opacity-70" />
                </button>
                <button
                    onClick={handleMaximize}
                    className="w-10 h-7 flex items-center justify-center hover:bg-md-sys-surface3 transition-colors rounded"
                    title={isMaximized ? "Restore" : "Maximize"}
                >
                    {isMaximized ? (
                        <Minimize2 size={12} className="opacity-70" />
                    ) : (
                        <Maximize2 size={12} className="opacity-70" />
                    )}
                </button>
                <button
                    onClick={handleClose}
                    className="w-10 h-7 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors rounded"
                    title="Close"
                >
                    <X size={14} className="opacity-70 group-hover:opacity-100" />
                </button>
            </div>
        </div>
    );
};
