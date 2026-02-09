/**
 * @module electronAPI
 * Typed access to the Electron IPC bridge exposed by preload.cjs via contextBridge.
 * All renderer code should use this module instead of window.require('electron').
 *
 * Falls back gracefully to null when running outside Electron (web dev, tests).
 */

export interface ElectronAPI {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    send: (channel: string, ...args: any[]) => void;
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
    removeAllListeners: (channel: string) => void;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

/**
 * Returns the electronAPI bridge if available, or null in non-Electron contexts.
 */
export const getElectronAPI = (): ElectronAPI | null => {
    if (typeof window !== 'undefined' && window.electronAPI) {
        return window.electronAPI;
    }
    return null;
};

/**
 * Convenience: returns true when running inside Electron with the bridge active.
 */
export const isElectron = (): boolean => getElectronAPI() !== null;
