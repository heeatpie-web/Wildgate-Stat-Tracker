import React from 'react';
import { Minus, X, Maximize2, Minimize2 } from 'lucide-react';
import { APP_NAME, APP_VERSION } from '../types';
import { getElectronAPI } from '../utils/electronAPI';

export const WindowFrame: React.FC = () => {
    const [isMaximized, setIsMaximized] = React.useState(false);
    const api = React.useMemo(() => getElectronAPI(), []);

    React.useEffect(() => {
        if (!api) return;

        const unsub = api.on('window-maximized-changed', (maximized: boolean) => {
            setIsMaximized(maximized);
        });

        return unsub;
    }, [api]);

    const handleMinimize = () => api?.send('minimize-window');
    const handleMaximize = () => api?.send('maximize-window');
    const handleClose = () => {
        try {
            window.localStorage.setItem('wg_intentional_close_v1', String(Date.now()));
        } catch {
            // no-op
        }
        api?.send('close-window');
    };

    return (
        <div
            className="h-9 premium-titlebar flex items-center justify-between px-3 shrink-0 select-none"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            {/* Left: App Identity */}
            <div className="flex items-center gap-1.5">
                <img
                    src={`${import.meta.env.BASE_URL}icon-192.png`}
                    alt=""
                    width={16}
                    height={16}
                    className="w-4 h-4 rounded-control object-cover shadow-sm shrink-0"
                    draggable={false}
                />
                <span className="text-label-sm font-semibold tracking-wide-08 uppercase">{APP_NAME}</span>
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
                    aria-label="Minimize window"
                >
                    <Minus size={14} className="opacity-60" />
                </button>
                <button
                    onClick={handleMaximize}
                    className="md3-icon-btn w-9 h-7 rounded-control"
                    title={isMaximized ? "Restore" : "Maximize"}
                    aria-label={isMaximized ? "Restore window" : "Maximize window"}
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
                    aria-label="Close window"
                >
                    <X size={14} className="opacity-60 group-hover:opacity-100" />
                </button>
            </div>
        </div>
    );
};

