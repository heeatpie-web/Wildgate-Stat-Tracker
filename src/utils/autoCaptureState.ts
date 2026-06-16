import type { Match } from '../types';
import { useAppStore } from '../store/useAppStore';
import type { TelemetryLifecycleStage } from '../store/slices/createUISlice';
import type { MacroSequenceConfig } from '../store/slices/createSettingsSlice';

export const AUTO_CAPTURE_DRAFT_LOOKBACK_MS = 6 * 60 * 60 * 1000;
export const AUTO_CAPTURE_DRAFT_SESSION_BUFFER_MS = 60_000;
export const MAX_SYNCED_AUTO_CAPTURE_DRAFTS = 12;

export interface AutoCaptureStateSnapshot {
    activeUser: string;
    matches: Match[];
    pendingMatchData: unknown;
    sessionStartTime: number | null;
    isMatchInProgress: boolean;
    lifecycleActive: boolean;
    telemetryLifecycleStage: TelemetryLifecycleStage;
    autoCaptureSendKeypresses: boolean;
    autoCaptureWaitMultiplier: number | undefined;
    tacticalMapKeybind: string;
    holdTacticalMapKey: boolean;
    gamepadModeEnabled: boolean;
    macroSequenceConfig: MacroSequenceConfig | null;
    ocrRegions: unknown;
    ocrEnhancedNameRecoveryEnabled: boolean;
    ocrNameRerouteThreshold: number | undefined;
    deviceDisplayInfo: unknown;
    gameResolution: unknown;
    matchId?: string | number | null;
}

export const buildAutoCaptureStateSnapshot = (
    overrides: Partial<AutoCaptureStateSnapshot> = {}
): AutoCaptureStateSnapshot => {
    const state = useAppStore.getState();
    const sessionStartTime = typeof state.sessionStartTime === 'number' && state.sessionStartTime > 0
        ? state.sessionStartTime
        : null;
    const recentCutoff = sessionStartTime != null
        ? (sessionStartTime - AUTO_CAPTURE_DRAFT_SESSION_BUFFER_MS)
        : (Date.now() - AUTO_CAPTURE_DRAFT_LOOKBACK_MS);
    const recentTelemetryDrafts = (Array.isArray(state.matches) ? state.matches : [])
        .filter((match): match is Match => Boolean(match) && match.subType === 'Telemetry Draft')
        .filter((match) => Number(match.timestamp || 0) >= recentCutoff)
        .sort((left, right) => {
            const rightTimestamp = Number(right.timestamp || 0);
            const leftTimestamp = Number(left.timestamp || 0);
            if (rightTimestamp !== leftTimestamp) {
                return rightTimestamp - leftTimestamp;
            }
            return Number(right.id || 0) - Number(left.id || 0);
        })
        .slice(0, MAX_SYNCED_AUTO_CAPTURE_DRAFTS);

    return {
        activeUser: typeof overrides.activeUser === 'string'
            ? overrides.activeUser.trim()
            : (typeof state.activeUser === 'string' ? state.activeUser.trim() : ''),
        matches: Array.isArray(overrides.matches) ? overrides.matches : recentTelemetryDrafts,
        pendingMatchData: Object.prototype.hasOwnProperty.call(overrides, 'pendingMatchData')
            ? overrides.pendingMatchData
            : (state.pendingMatchData || null),
        sessionStartTime: Object.prototype.hasOwnProperty.call(overrides, 'sessionStartTime')
            ? (overrides.sessionStartTime ?? null)
            : sessionStartTime,
        isMatchInProgress: overrides.isMatchInProgress === true || (
            !Object.prototype.hasOwnProperty.call(overrides, 'isMatchInProgress')
            && state.isMatchInProgress === true
        ),
        lifecycleActive: overrides.lifecycleActive === true || (
            !Object.prototype.hasOwnProperty.call(overrides, 'lifecycleActive')
            && ['loading', 'pregame', 'live'].includes(String(state.telemetryLifecycleStage || '').trim())
        ),
        telemetryLifecycleStage: Object.prototype.hasOwnProperty.call(overrides, 'telemetryLifecycleStage')
            ? (overrides.telemetryLifecycleStage ?? 'idle')
            : (
                ['loading', 'pregame', 'live', 'menu'].includes(String(state.telemetryLifecycleStage || '').trim())
                    ? state.telemetryLifecycleStage
                    : 'idle'
            ),
        autoCaptureSendKeypresses: Object.prototype.hasOwnProperty.call(overrides, 'autoCaptureSendKeypresses')
            ? overrides.autoCaptureSendKeypresses !== false
            : state.autoCaptureSendKeypresses !== false,
        autoCaptureWaitMultiplier: Object.prototype.hasOwnProperty.call(overrides, 'autoCaptureWaitMultiplier')
            ? overrides.autoCaptureWaitMultiplier
            : state.autoCaptureWaitMultiplier,
        tacticalMapKeybind: typeof overrides.tacticalMapKeybind === 'string'
            ? overrides.tacticalMapKeybind
            : (typeof state.tacticalMapKeybind === 'string' ? state.tacticalMapKeybind : ''),
        holdTacticalMapKey: overrides.holdTacticalMapKey === true || (
            !Object.prototype.hasOwnProperty.call(overrides, 'holdTacticalMapKey')
            && state.holdTacticalMapKey === true
        ),
        gamepadModeEnabled: overrides.gamepadModeEnabled === true || (
            !Object.prototype.hasOwnProperty.call(overrides, 'gamepadModeEnabled')
            && state.gamepadModeEnabled === true
        ),
        macroSequenceConfig: Object.prototype.hasOwnProperty.call(overrides, 'macroSequenceConfig')
            ? (overrides.macroSequenceConfig ?? null)
            : (state.macroSequenceConfig || null),
        ocrRegions: Object.prototype.hasOwnProperty.call(overrides, 'ocrRegions')
            ? (overrides.ocrRegions ?? null)
            : (state.ocrRegions || null),
        ocrEnhancedNameRecoveryEnabled: overrides.ocrEnhancedNameRecoveryEnabled === true || (
            !Object.prototype.hasOwnProperty.call(overrides, 'ocrEnhancedNameRecoveryEnabled')
            && state.ocrEnhancedNameRecoveryEnabled === true
        ),
        ocrNameRerouteThreshold: Object.prototype.hasOwnProperty.call(overrides, 'ocrNameRerouteThreshold')
            ? overrides.ocrNameRerouteThreshold
            : state.ocrNameRerouteThreshold,
        deviceDisplayInfo: Object.prototype.hasOwnProperty.call(overrides, 'deviceDisplayInfo')
            ? (overrides.deviceDisplayInfo ?? null)
            : (state.deviceDisplayInfo || null),
        gameResolution: Object.prototype.hasOwnProperty.call(overrides, 'gameResolution')
            ? (overrides.gameResolution ?? null)
            : (state.gameResolution || null),
        matchId: Object.prototype.hasOwnProperty.call(overrides, 'matchId')
            ? (overrides.matchId ?? null)
            : undefined,
    };
};
