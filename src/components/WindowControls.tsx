import React from 'react';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

interface WindowControlsProps {
    className?: string;
}

export const WindowControls: React.FC<WindowControlsProps> = ({ className = '' }) => {
    if (!ipcRenderer) return null;

    const handleMinimize = () => ipcRenderer.send('minimize-window');
    const handleMaximize = () => ipcRenderer.send('maximize-window');
    const handleClose = () => ipcRenderer.send('close-window');

    const btnBase = "h-6 w-9 flex items-center justify-center transition-colors text-gray-400 hover:text-white";
    const btnHover = "hover:bg-white/10";
    const closeHover = "hover:bg-red-500 hover:text-white";

    return (
        <div className={`flex items-center ${className}`} style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button onClick={handleMinimize} className={`${btnBase} ${btnHover}`} title="Minimize">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 5.5H10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                </svg>
            </button>
            <button onClick={handleMaximize} className={`${btnBase} ${btnHover}`} title="Maximize / Restore">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1" />
                </svg>
            </button>
            <button onClick={handleClose} className={`${btnBase} ${closeHover}`} title="Close">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L10 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                    <path d="M10 1L1 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                </svg>
            </button>
        </div>
    );
};
