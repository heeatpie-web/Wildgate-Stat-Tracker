/**
 * @module useGameExitCleanup
 * Clears stale match state when the game process exits.
 *
 * Why: `isMatchInProgress` is normally cleared by a detected match end, a
 * result submission, or the next mission start. If the game is closed (or
 * crashes) mid-match, none of those fire and the flag stays stuck ON — which
 * keeps background machinery (screen monitors, capture eligibility) alive
 * indefinitely while the app sits in the tray.
 *
 * This hook listens to the main process's `game-process-status` events (the
 * same feed useAutoPerformanceMode consumes). When the game goes down it starts
 * a grace timer; if the game is still down when it fires and a match is still
 * flagged in progress, the flag is cleared. The grace period lets the log
 * monitor finish processing the tail of the game log (a legitimate match end
 * right at exit still resolves normally and wins the race).
 *
 * The telemetry draft is deliberately left untouched — only the "in progress"
 * flag and match-start time are cleared, so a match interrupted by a crash can
 * still be reviewed/submitted manually.
 */
import { useEffect, useRef } from 'react';
import { getElectronAPI } from '../utils/electronAPI';
import { useAppStore } from '../store/useAppStore';
import { Logger } from '../utils/logger';

export const GAME_EXIT_MATCH_CLEAR_GRACE_MS = 60_000;

interface GameProcessStatusPayload {
    running?: boolean;
}

export function useGameExitCleanup(): void {
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;

        const clearTimer = () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };

        const unsubscribe = api.on('game-process-status', (payload: GameProcessStatusPayload) => {
            const running = Boolean(payload?.running);
            if (running) {
                // Game (re)appeared inside the grace window — cancel the cleanup.
                clearTimer();
                return;
            }
            if (timerRef.current !== null) return; // grace timer already pending

            timerRef.current = window.setTimeout(() => {
                timerRef.current = null;
                const state = useAppStore.getState();
                if (!state.isMatchInProgress) return;
                Logger.warn(
                    'GameExitCleanup',
                    'Game process exited with a match still flagged in progress — clearing stale match state.',
                );
                state.setIsMatchInProgress(false);
                state.setMatchStartTime(null);
            }, GAME_EXIT_MATCH_CLEAR_GRACE_MS);
        });

        return () => {
            clearTimer();
            try { unsubscribe?.(); } catch { /* noop */ }
        };
    }, []);
}
