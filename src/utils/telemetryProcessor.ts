/**
 * @module telemetryProcessor
 * Stateless processor for telemetry events received from the game log watcher.
 * Handles match lifecycle (NebMatchStart, NebMatchEnd), timer updates,
 * result detection, and overlay phase transitions.
 * Called by useLogMonitor with injected actions and context.
 */
import Logger from './logger';
import type { DataSource } from '../store/slices/createDataSlice';
import { isNonMatchMap } from './nonMatchMaps';
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

const toTelemetryTimestampMs = (event: any): number => {
    const raw = event?.ClientTimestamp ?? event?.timestamp ?? event?.ts;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return Date.now();
    return numeric < 100000000000 ? numeric * 1000 : numeric;
};

const getCaseInsensitiveValue = (record: unknown, keys: string[]): unknown => {
    if (!record || typeof record !== 'object') return undefined;
    const source = record as Record<string, unknown>;
    for (const key of keys) {
        if (source[key] !== undefined) return source[key];
    }
    const expected = new Set(keys.map((key) => key.toLowerCase()));
    for (const [key, value] of Object.entries(source)) {
        if (expected.has(key.toLowerCase())) return value;
    }
    return undefined;
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
    setDeviceDisplayInfo?: (info: {
        displayWidth: number;
        displayHeight: number;
        virtualWidth: number;
        virtualHeight: number;
        aspectProfile: 'standard' | 'ultrawide' | 'superultrawide' | 'unknown';
    }) => void;
    setGameResolution?: (res: { resX: number; resY: number }) => void;
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
    const detectAspectProfile = (width: number, height: number): 'standard' | 'ultrawide' | 'superultrawide' | 'unknown' => {
        const safeWidth = Number(width);
        const safeHeight = Number(height);
        if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
            return 'unknown';
        }
        const ratio = safeWidth / safeHeight;
        if (ratio <= 1.8) return 'standard';
        if (ratio <= 2.5) return 'ultrawide';
        if (ratio <= 4.0) return 'superultrawide';
        return 'unknown';
    };

    const name = event.EventName;
    const payload = event.Payload?.event || event.Payload || {};
    const gameTime = toTelemetryTimestampMs(event); // Simulation time or live time

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
    const matchSessionIdValueCandidates = [
        getCaseInsensitiveValue(event.context, ['matchSessionId', 'sessionId', 'sESSIONId']),
        getCaseInsensitiveValue(event.Payload?.context, ['matchSessionId', 'sessionId', 'sESSIONId']),
        getCaseInsensitiveValue(payload, ['matchSessionId', 'sessionId', 'sESSIONId']),
    ];
    const matchSessionIdValue = matchSessionIdValueCandidates.find((value) => value !== undefined);
    const hasMatchSessionIdSignal = matchSessionIdValue !== undefined;
    const matchSessionId = String(matchSessionIdValue || '').trim();
    if (
        hasMatchSessionIdSignal
        && matchSessionId.length > 0
        && !context.isMatchInProgress
        && (!context.lastMatchSessionId || context.lastMatchSessionId.length === 0)
    ) {
        // matchSessionId appeared (empty → non-empty) while not in match → match starting
        Logger.info('TelemetryProcessor', `matchSessionId appeared: ${matchSessionId} — secondary match start signal`);
    }
    if (
        hasMatchSessionIdSignal
        && (!matchSessionId || matchSessionId.length === 0)
        && context.lastMatchSessionId
        && context.lastMatchSessionId.length > 0
        && context.isMatchInProgress
    ) {
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
    if (hasMatchSessionIdSignal && actions.setLastMatchSessionId) {
        actions.setLastMatchSessionId(matchSessionId);
    }

    // --- Match Events ---

    // Case-insensitive map name extraction (game telemetry may use LoadedMap, loadingMap, etc.)
    const rawMapName = getCaseInsensitiveValue(payload, ['loadedMap', 'loadingMap']);
    const startMapName = typeof rawMapName === 'string' ? rawMapName : '';
    if (name === 'NebLoadingScreen' && startMapName && isNonMatchMap(startMapName)) {
        Logger.debug('TelemetryProcessor', `Skipping non-match map load: ${String(startMapName)}`);
    }
    if (name === 'NebLoadingScreen' && startMapName && !isNonMatchMap(startMapName) && !context.isMatchInProgress) {
        const matchId = payload.matchId || payload.match_id || payload.MatchId;
        actions.setMatchStartTime(gameTime);
        actions.setIsMatchInProgress(true);
        actions.setOverlayPhase('Setup');
        actions.setToast({ message: `Loading ${startMapName}...`, type: 'info' });
        Logger.info('TelemetryProcessor', `Match Start Detected: ${startMapName} (ID: ${matchId || 'Unknown'})`);
    }

    // Match End
    const mapName = startMapName;
    const normalizedMapName = mapName.toLowerCase();
    if (name === 'NebLoadingScreen' && normalizedMapName.includes('frontend') && context.isMatchInProgress) {
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

    if (name === 'NebDeviceInfo') {
        const displayWidth = Number(payload.primaryDisplayWidth);
        const displayHeight = Number(payload.primaryDisplayHeight);
        const virtualWidth = Number(payload.virtualDisplayWidth);
        const virtualHeight = Number(payload.virtualDisplayHeight);
        if (displayWidth > 0 && displayHeight > 0) {
            const aspectProfile = detectAspectProfile(displayWidth, displayHeight);
            actions.setDeviceDisplayInfo?.({
                displayWidth,
                displayHeight,
                virtualWidth: Number.isFinite(virtualWidth) ? virtualWidth : 0,
                virtualHeight: Number.isFinite(virtualHeight) ? virtualHeight : 0,
                aspectProfile,
            });
            Logger.info(
                'TelemetryProcessor',
                `Display: ${displayWidth}x${displayHeight} (virtual: ${Number.isFinite(virtualWidth) ? virtualWidth : 0}x${Number.isFinite(virtualHeight) ? virtualHeight : 0}) ratio=${(displayWidth / displayHeight).toFixed(3)} profile=${aspectProfile}`,
            );
        }
    }

    if (name === 'NebUserSettings') {
        const resX = Number(payload.resolutionSizeX);
        const resY = Number(payload.resolutionSizeY);
        if (resX > 0 && resY > 0) {
            actions.setGameResolution?.({ resX, resY });
            Logger.info('TelemetryProcessor', `Game resolution: ${resX}x${resY}`);
        }
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
