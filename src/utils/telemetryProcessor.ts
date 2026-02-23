/**
 * @module telemetryProcessor
 * Stateless processor for telemetry events received from the game log watcher.
 * Handles match lifecycle (NebMatchStart, NebMatchEnd), timer updates,
 * result detection, and overlay phase transitions.
 * Called by useLogMonitor with injected actions and context.
 */
import Logger from './logger';
import type { DataSource } from '../store/slices/createDataSlice';
import type { WizardResult } from '../types';
import { UNNAMED_PLAYER_PREFIX } from './constants';

const MAX_TELEMETRY_MATCH_DURATION_SECONDS = 60 * 60;

const isTrustedTelemetryDuration = (seconds: number) =>
    Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_TELEMETRY_MATCH_DURATION_SECONDS;

const applyTelemetryDuration = (
    totalSeconds: number,
    actions: Pick<TelemetryActions, 'setTimeMin' | 'setTimeSec'>,
) => {
    if (isTrustedTelemetryDuration(totalSeconds)) {
        actions.setTimeMin(Math.floor(totalSeconds / 60).toString().padStart(2, '0'), 'telemetry');
        actions.setTimeSec((totalSeconds % 60).toString().padStart(2, '0'), 'telemetry');
        return;
    }
    if (totalSeconds > MAX_TELEMETRY_MATCH_DURATION_SECONDS) {
        Logger.warn(
            'TelemetryProcessor',
            `Ignored impossible telemetry duration (${totalSeconds}s > ${MAX_TELEMETRY_MATCH_DURATION_SECONDS}s)`,
        );
        actions.setTimeMin('00', 'telemetry');
        actions.setTimeSec('00', 'telemetry');
    }
};

/** Store actions injected into the processor by useLogMonitor. */
export interface TelemetryActions {
    setTimeMin: (v: string, source?: DataSource) => void;
    setTimeSec: (v: string, source?: DataSource) => void;
    setIsMatchInProgress: (is: boolean) => void;
    setMatchStartTime: (ts: number | null) => void;
    setOverlayPhase: (phase: 'Setup' | 'Live' | 'Result') => void;
    setToast: (toast: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
    updatePlayerIdMapping: (id: string, name: string) => void;
    setShowWizard: (result: WizardResult | null) => void;
    setLastMatchSessionId?: (id: string) => void;
}

export interface TelemetryContext {
    matchStartTime: number | null;
    isMatchInProgress: boolean;
    playerIdMap: Record<string, string>;
    pilotRegistry: string[];
    lastMatchSessionId?: string;
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

    // --- matchSessionId lifecycle tracking ---
    const matchSessionId = event.context?.matchSessionId || event.Payload?.context?.matchSessionId || '';
    if (matchSessionId && matchSessionId.length > 0 && !context.isMatchInProgress && (!context.lastMatchSessionId || context.lastMatchSessionId.length === 0)) {
        // matchSessionId appeared (empty → non-empty) while not in match → match starting
        Logger.info('TelemetryProcessor', `matchSessionId appeared: ${matchSessionId} — secondary match start signal`);
    }
    if ((!matchSessionId || matchSessionId.length === 0) && context.lastMatchSessionId && context.lastMatchSessionId.length > 0 && context.isMatchInProgress) {
        // matchSessionId disappeared (non-empty → empty) while in match → match ending
        Logger.info('TelemetryProcessor', `matchSessionId cleared — secondary match end signal (left game?)`);

        // Calculate match duration from matchStartTime
        let totalSeconds = 0;
        if (context.matchStartTime) {
            const durationMs = gameTime - context.matchStartTime;
            totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
        }
        applyTelemetryDuration(totalSeconds, actions);

        actions.setIsMatchInProgress(false);
        actions.setMatchStartTime(null);
        actions.setOverlayPhase('Result');
        actions.setToast({ message: "Match ended (session cleared) — Ready for Submission", type: 'success' });
        Logger.info('TelemetryProcessor', `Match End (session clear). Duration: ${formatDuration(totalSeconds * 1000)}`);
    }
    // Update tracking ref via action
    if (actions.setLastMatchSessionId) {
        actions.setLastMatchSessionId(matchSessionId);
    }

    // --- Match Events ---

    // Match Start: check BOTH loadedMap and loadingMap for compatibility with different telemetry formats
    const startMapName = payload.loadedMap || payload.loadingMap;
    if (name === 'NebLoadingScreen' && startMapName && !startMapName.includes('Frontend') && !context.isMatchInProgress) {
        const matchId = payload.matchId || payload.match_id || payload.MatchId;
        actions.setMatchStartTime(gameTime);
        actions.setIsMatchInProgress(true);
        actions.setOverlayPhase('Setup');
        actions.setToast({ message: `Loading ${startMapName}...`, type: 'info' });
        Logger.info('TelemetryProcessor', `Match Start Detected: ${startMapName} (ID: ${matchId || 'Unknown'})`);
    }

    // Match End
    // FIXED: Check both loadedMap and loadingMap for compatibility with different telemetry formats
    const mapName = payload.loadedMap || payload.loadingMap;
    if (name === 'NebLoadingScreen' && mapName?.includes('Frontend') && context.isMatchInProgress) {
        let totalSeconds = 0;
        const payloadDurationSeconds = Number(payload.matchDuration);
        if (Number.isFinite(payloadDurationSeconds) && payloadDurationSeconds > 0) {
            totalSeconds = Math.floor(payloadDurationSeconds);
        } else if (context.matchStartTime) {
            const durationMs = gameTime - context.matchStartTime;
            totalSeconds = Math.floor(durationMs / 1000);
        }

        applyTelemetryDuration(totalSeconds, actions);

        actions.setIsMatchInProgress(false);
        actions.setMatchStartTime(null);
        actions.setOverlayPhase('Result');
        actions.setToast({ message: "Mission Accomplished - Ready for Submission", type: 'success' });

        Logger.info('TelemetryProcessor', `Match End Detected. Duration: ${formatDuration(totalSeconds * 1000)}`);
    }

    // Loadout events (for debugging)
    if (name === 'NebLoadoutSaved') {
        Logger.debug('TelemetryProcessor', `Loadout Event: ${JSON.stringify(payload)}`);
    }

    // Ship/Prospector selection signal (Bug 9)
    if (name === 'NebCloudSaveRecordSize') {
        const recordKey = payload.recordKey || '';
        if (recordKey.includes('GameModeShipSelection')) {
            Logger.info('TelemetryProcessor', `Ship selection changed (record size: ${payload.recordSize || 'unknown'})`);
            // Loadout telemetry now syncs directly into draft/session state; suppress noisy prompts.
        }
    }
};

const formatDuration = (ms: number) => {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};
