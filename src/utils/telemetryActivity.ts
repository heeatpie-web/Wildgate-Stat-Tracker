import { runtimeConfig } from '../config/runtimeConfig';

export type TelemetryActivityState = 'receiving' | 'connected' | 'offline';

export const getTelemetryActivityState = (
    exists: boolean | undefined,
    lastEventAt: number | undefined,
    now = Date.now(),
): TelemetryActivityState => {
    if (!exists) return 'offline';
    if (
        typeof lastEventAt === 'number'
        && Number.isFinite(lastEventAt)
        && (now - lastEventAt) <= runtimeConfig.systemPulse.telemetryReceivingWindowMs
    ) {
        return 'receiving';
    }
    return 'connected';
};
