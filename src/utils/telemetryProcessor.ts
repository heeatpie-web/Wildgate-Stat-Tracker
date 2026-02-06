/**
 * @module telemetryProcessor
 * Stateless processor for telemetry events received from the game log watcher.
 * Handles match lifecycle (NebMatchStart, NebMatchEnd), timer updates,
 * result detection, and overlay phase transitions.
 * Called by useLogMonitor with injected actions and context.
 */
import Logger from './logger';
import type { DataSource } from '../store/slices/createDataSlice';
import { UNNAMED_PLAYER_PREFIX } from './constants';

/** Store actions injected into the processor by useLogMonitor. */
export interface TelemetryActions {
    setTimeMin: (v: string, source?: DataSource) => void;
    setTimeSec: (v: string, source?: DataSource) => void;
    setIsMatchInProgress: (is: boolean) => void;
    setMatchStartTime: (ts: number | null) => void;
    setOverlayPhase: (phase: 'Setup' | 'Live' | 'Result') => void;
    setToast: (toast: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
    updatePlayerIdMapping: (id: string, name: string) => void;
    setShowWizard: (result: 'Win' | 'Loss' | 'Draw' | null) => void;
}

export interface TelemetryContext {
    matchStartTime: number | null;
    isMatchInProgress: boolean;
    playerIdMap: Record<string, string>;
    pilotRegistry: string[];
}

export const processTelemetryEvent = (
    event: any,
    actions: TelemetryActions,
    context: TelemetryContext
) => {
    const name = event.EventName;
    const payload = event.Payload?.event || event.Payload || {};
    const gameTime = event.ClientTimestamp ? event.ClientTimestamp * 1000 : Date.now(); // Simulation time or Live time

    // --- ID Discovery ---
    // Check context for Platform ID (Epic)
    const clientCtx = event.context?.client || event.Payload?.context?.client;
    const platformId = clientCtx?.platformAccountId;
    const potentialId = payload.accountId || payload.userId || payload.playerId || payload.player_id || platformId;
    const potentialName = payload.displayName || payload.playerName || payload.name || payload.playerNameString || payload.callsign;

    if (potentialId && potentialName && typeof potentialName === 'string' && potentialName.length > 0) {
        // Link ID to Name
        const currentMappedName = context.playerIdMap[potentialId];
        if (currentMappedName && currentMappedName.startsWith(UNNAMED_PLAYER_PREFIX) && currentMappedName !== potentialName) {
            actions.updatePlayerIdMapping(potentialId, potentialName);
            actions.setToast({ message: `Identity Discovered: ${potentialName}`, type: 'success' });
        } else if (!currentMappedName && !context.pilotRegistry.includes(potentialName)) {
            // New discovery
            Logger.debug('TelemetryProcessor', `observed unknown player: ${potentialName} (${potentialId})`);
        }
    }

    // --- Match Events ---

    // Match Start
    if (name === 'NebLoadingScreen' && payload.loadingMap && !payload.loadingMap.includes('Frontend')) {
        const matchId = payload.matchId || payload.match_id || payload.MatchId;
        actions.setMatchStartTime(gameTime);
        actions.setIsMatchInProgress(true);
        actions.setOverlayPhase('Setup');
        actions.setToast({ message: `Loading ${payload.loadingMap}...`, type: 'info' });
        Logger.info('TelemetryProcessor', `Match Start Detected: ${payload.loadingMap} (ID: ${matchId || 'Unknown'})`);
    }

    // Match End
    // FIXED: Check both loadedMap and loadingMap for compatibility with different telemetry formats
    const mapName = payload.loadedMap || payload.loadingMap;
    if (name === 'NebLoadingScreen' && mapName?.includes('Frontend') && context.isMatchInProgress) {
        let totalSeconds = 0;
        if (payload.matchDuration) {
            totalSeconds = Math.floor(payload.matchDuration);
        } else if (context.matchStartTime) {
            const durationMs = gameTime - context.matchStartTime;
            totalSeconds = Math.floor(durationMs / 1000);
        }

        if (totalSeconds > 0) {
            actions.setTimeMin(Math.floor(totalSeconds / 60).toString().padStart(2, '0'), 'telemetry');
            actions.setTimeSec((totalSeconds % 60).toString().padStart(2, '0'), 'telemetry');
        }

        actions.setIsMatchInProgress(false);
        actions.setMatchStartTime(null);
        actions.setOverlayPhase('Result');
        actions.setToast({ message: "Mission Accomplished - Ready for Submission", type: 'success' });

        // Open Wizard without assuming a result - let user select
        // FIX: Previously hardcoded 'Win' which was incorrect
        actions.setShowWizard(null);

        Logger.info('TelemetryProcessor', `Match End Detected. Duration: ${formatDuration(totalSeconds * 1000)}`);
    }

    // Loadout events (for debugging)
    if (name === 'NebLoadoutSaved') {
        Logger.debug('TelemetryProcessor', `Loadout Event: ${JSON.stringify(payload)}`);
    }
};

const formatDuration = (ms: number) => {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};
