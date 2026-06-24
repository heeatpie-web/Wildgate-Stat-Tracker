/**
 * @module useAutoPerformanceMode
 * Drives performance mode from game-exe detection.
 *
 * Behaviour (matches the "Auto-drive, manual override" decision):
 * - When the game process is NOT running, performance mode is OFF so the app
 *   runs at full speed.
 * - When the game process is detected (or, as a fallback, a match starts) it
 *   flips performance mode ON so OCR/animation work yields CPU to the game.
 * - The auto-driver is *edge-triggered*: it only writes performance mode on a
 *   transition of the game-running state. Between transitions the user's manual
 *   toggle wins, so a manual override sticks until the next time the game starts
 *   or stops.
 *
 * The main process polls the exe (see electron/main.cjs `_pollGameProcessStatus`)
 * and emits `game-process-status` on every transition. The optional
 * `matchStartFallback` flag lets callers force the ON edge when the log/result
 * monitors detect a match starting even if exe detection is unavailable.
 */
import { useEffect, useRef } from 'react';
import { getElectronAPI } from '../utils/electronAPI';
import { useAppStore } from '../store/useAppStore';

export interface GameProcessStatusEvent {
    running: boolean;
    processName?: string;
    pid?: number | null;
    detectedAt?: number;
}

export interface UseAutoPerformanceModeOptions {
    /**
     * When true, treat "a match is starting" as a game-running ON edge even if
     * the process poll hasn't reported the exe yet. Wire this from the existing
     * match-start signals (log monitor / result monitor).
     */
    matchStartFallback?: boolean;
}

export const useAutoPerformanceMode = ({ matchStartFallback = false }: UseAutoPerformanceModeOptions = {}): void => {
    const autoPerformanceMode = useAppStore((s) => s.autoPerformanceMode);
    const setPerformanceMode = useAppStore((s) => s.setPerformanceMode);

    // Tracks the last game-running state we *acted on* so we only write on edges.
    const lastRunningRef = useRef<boolean | null>(null);

    // Subscribe to the main-process game-process-status events.
    useEffect(() => {
        if (!autoPerformanceMode) {
            // Auto disabled: reset edge tracking so re-enabling re-syncs cleanly.
            lastRunningRef.current = null;
            return;
        }
        const api = getElectronAPI();
        if (!api) return;

        const applyEdge = (running: boolean) => {
            if (lastRunningRef.current === running) return; // not a transition
            lastRunningRef.current = running;
            setPerformanceMode(running);
        };

        const unsubscribe = api.on('game-process-status', (payload: GameProcessStatusEvent) => {
            applyEdge(Boolean(payload?.running));
        });

        return () => {
            try { unsubscribe?.(); } catch { /* noop */ }
        };
    }, [autoPerformanceMode, setPerformanceMode]);

    // Fallback ON edge when a match is detected as starting.
    useEffect(() => {
        if (!autoPerformanceMode) return;
        if (!matchStartFallback) return;
        if (lastRunningRef.current === true) return;
        lastRunningRef.current = true;
        setPerformanceMode(true);
    }, [autoPerformanceMode, matchStartFallback, setPerformanceMode]);
};

export default useAutoPerformanceMode;
