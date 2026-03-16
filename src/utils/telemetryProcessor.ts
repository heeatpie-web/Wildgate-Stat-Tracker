/**
 * @module telemetryProcessor
 * Stateless secondary telemetry processor.
 * Lifecycle state is owned by useLogMonitor; this helper only applies
 * non-lifecycle telemetry such as ID discovery, device info, and logging.
 */
import Logger from './logger';
import { UNNAMED_PLAYER_PREFIX } from './constants';

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

const findNestedCaseInsensitiveValue = (
    value: unknown,
    keys: string[],
    maxDepth = 4,
): unknown => {
    if (value == null || !Array.isArray(keys) || keys.length === 0) return undefined;

    let bestValue: unknown = undefined;
    let bestDepth = Number.MAX_SAFE_INTEGER;

    const visit = (candidate: unknown, depth: number) => {
        if (candidate == null || depth > maxDepth) return;
        if (Array.isArray(candidate)) {
            candidate.forEach((entry) => visit(entry, depth + 1));
            return;
        }
        if (!candidate || typeof candidate !== 'object') return;

        const direct = getCaseInsensitiveValue(candidate, keys);
        if (direct !== undefined && depth < bestDepth) {
            bestValue = direct;
            bestDepth = depth;
        }

        Object.values(candidate as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
    };

    visit(value, 0);
    return bestValue;
};

const pickCaseInsensitiveValue = (
    sources: unknown[],
    keys: string[],
    maxDepth = 4,
): unknown => {
    for (const source of sources) {
        const direct = getCaseInsensitiveValue(source, keys);
        if (direct !== undefined) return direct;
    }
    for (const source of sources) {
        const nested = findNestedCaseInsensitiveValue(source, keys, maxDepth);
        if (nested !== undefined) return nested;
    }
    return undefined;
};

export interface TelemetryActions {
    setToast: (toast: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
    updatePlayerIdMapping: (id: string, name: string) => void;
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
    playerIdMap: Record<string, string>;
    pilotRegistry: string[];
}

export const processTelemetryEvent = (
    event: any,
    actions: TelemetryActions,
    context: TelemetryContext,
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
    const payloadEnvelope = event.Payload && typeof event.Payload === 'object' ? event.Payload : {};
    const payloadEnvelopeEvent = payloadEnvelope && typeof payloadEnvelope.event === 'object' ? payloadEnvelope.event : {};
    const payloadEnvelopeLower = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const payloadEnvelopeLowerEvent = payloadEnvelopeLower && typeof payloadEnvelopeLower.event === 'object' ? payloadEnvelopeLower.event : {};
    const payloadSources = [
        payload,
        payloadEnvelopeEvent,
        payloadEnvelope,
        payloadEnvelopeLowerEvent,
        payloadEnvelopeLower,
        event.event,
    ];

    const clientCtx = event.context?.client || event.Payload?.context?.client;
    const platformId = clientCtx?.platformAccountId;
    const potentialId = payload.accountId || payload.userId || payload.playerId || payload.player_id || platformId;
    const potentialName = payload.displayName || payload.playerName || payload.name || payload.playerNameString || payload.callsign;

    if (potentialId && potentialName && typeof potentialName === 'string' && potentialName.length > 0) {
        const currentMappedName = context.playerIdMap[potentialId];
        if (currentMappedName && currentMappedName.startsWith(UNNAMED_PLAYER_PREFIX) && currentMappedName !== potentialName) {
            actions.updatePlayerIdMapping(potentialId, potentialName);
            actions.setToast({ message: `Identity Discovered: ${potentialName}`, type: 'success' });
        } else if (!currentMappedName && !context.pilotRegistry.includes(potentialName)) {
            Logger.debug('TelemetryProcessor', `observed unknown player: ${potentialName} (${potentialId})`);
        }
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

    if (name === 'NebLoadoutSaved') {
        Logger.debug('TelemetryProcessor', `Loadout Event: ${JSON.stringify(payload)}`);
    }

    if (name === 'NebCloudSaveRecordSize') {
        const recordKey = String(
            pickCaseInsensitiveValue(payloadSources, ['recordKey', 'record_key', 'key']) || '',
        ).trim();
        if (recordKey.includes('GameModeShipSelection')) {
            Logger.info('TelemetryProcessor', `Ship selection changed (record key: ${recordKey})`);
        }
    }
};
