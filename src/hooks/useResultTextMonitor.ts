import { useEffect, useRef } from 'react';
import { getElectronAPI } from '../utils/electronAPI';

export const DEFAULT_RESULT_TEXT_ARM_DELAY_MS = 45_000;
export const RESULT_TEXT_SAMPLE_INTERVAL_MS = 500;
export const RESULT_TEXT_SAMPLE_REGION = {
    left: 0.115,
    top: 0.095,
    width: 0.57,
    height: 0.18,
    normalized: true,
} as const;

const SEND_START = 'result-text-start';
const SEND_STOP = 'result-text-stop';
const RECEIVE_DETECTED = 'result-text-detected';
const RECEIVE_DEBUG = 'result-text-debug';

export type ResultTextMonitorDebugStatus =
    | 'disabled'
    | 'latched'
    | 'no-api'
    | 'waiting-live-start'
    | 'arming-delay'
    | 'sampling'
    | 'detected';

export interface ResultTextDetectionPayload {
    detectionMethod: 'text';
    result: 'Win' | 'Loss' | null;
    winType?: 'combat' | 'artifact';
    placement?: 1 | 2 | 3 | 4 | 5;
    text?: string;
    activeBoxIds?: string[];
    tripwireActiveBoxCount?: number;
    tripwireTotalWhiteDelta?: number;
    armAt?: number;
    detectedAt?: number;
    captureRegion?: {
        left: number;
        top: number;
        width: number;
        height: number;
        normalized?: boolean;
    } | null;
}

export interface ResultTextMonitorDebugSnapshot {
    status: ResultTextMonitorDebugStatus;
    enabled: boolean;
    triggerLatched: boolean;
    liveStartedAt: number | null;
    liveElapsedMs: number | null;
    armDelayMs: number;
    armRemainingMs: number | null;
    isArmed: boolean;
    sampleIntervalMs: number;
    captureRegion: typeof RESULT_TEXT_SAMPLE_REGION;
    detected: boolean;
    lastRecognizedText: string;
    lastSignal: ResultTextDetectionPayload | null;
    lastError?: string | null;
    lastUpdatedAt: number;
}

export interface ResultTextMonitorOptions {
    enabled: boolean;
    liveStartedAt: number | null;
    armDelayMs?: number;
    triggerLatched?: boolean;
    onResultDetected?: (payload: ResultTextDetectionPayload) => void | Promise<void>;
    onDebugStateChange?: (state: ResultTextMonitorDebugSnapshot) => void;
}

interface MainResultTextDebugSnapshot {
    status?: unknown;
    armAt?: unknown;
    armRemainingMs?: unknown;
    detected?: unknown;
    lastRecognizedText?: unknown;
    lastSignal?: unknown;
    lastError?: unknown;
    lastUpdatedAt?: unknown;
}

const toFiniteNumber = (value: unknown): number | null => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizePlacement = (value: unknown): ResultTextDetectionPayload['placement'] => {
    const parsed = toFiniteNumber(value);
    if (parsed == null) return undefined;
    const rounded = Math.round(parsed);
    return rounded >= 1 && rounded <= 5 ? rounded as ResultTextDetectionPayload['placement'] : undefined;
};

const normalizeWinType = (value: unknown): ResultTextDetectionPayload['winType'] => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'artifact' || normalized === 'combat'
        ? normalized
        : undefined;
};

const normalizeDetectionPayload = (value: unknown): ResultTextDetectionPayload => {
    const record = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
    const normalizedResult = String(record.result || '').trim();
    return {
        detectionMethod: 'text',
        result: normalizedResult === 'Win' || normalizedResult === 'Loss'
            ? normalizedResult
            : null,
        winType: normalizeWinType(record.winType),
        placement: normalizePlacement(record.placement),
        text: typeof record.text === 'string' ? record.text : undefined,
        activeBoxIds: Array.isArray(record.activeBoxIds)
            ? record.activeBoxIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : undefined,
        tripwireActiveBoxCount: toFiniteNumber(record.tripwireActiveBoxCount) ?? undefined,
        tripwireTotalWhiteDelta: toFiniteNumber(record.tripwireTotalWhiteDelta) ?? undefined,
        armAt: toFiniteNumber(record.armAt) ?? undefined,
        detectedAt: toFiniteNumber(record.detectedAt) ?? undefined,
        captureRegion: record.captureRegion && typeof record.captureRegion === 'object'
            ? {
                left: Number((record.captureRegion as Record<string, unknown>).left || 0),
                top: Number((record.captureRegion as Record<string, unknown>).top || 0),
                width: Number((record.captureRegion as Record<string, unknown>).width || 0),
                height: Number((record.captureRegion as Record<string, unknown>).height || 0),
                normalized: (record.captureRegion as Record<string, unknown>).normalized === true,
            }
            : null,
    };
};

export function useResultTextMonitor({
    enabled,
    liveStartedAt,
    armDelayMs = DEFAULT_RESULT_TEXT_ARM_DELAY_MS,
    triggerLatched = false,
    onResultDetected,
    onDebugStateChange,
}: ResultTextMonitorOptions) {
    const onResultDetectedRef = useRef(onResultDetected);
    const onDebugStateChangeRef = useRef(onDebugStateChange);

    useEffect(() => {
        onResultDetectedRef.current = onResultDetected;
    }, [onResultDetected]);

    useEffect(() => {
        onDebugStateChangeRef.current = onDebugStateChange;
    }, [onDebugStateChange]);

    useEffect(() => {
        const emitDebugState = (
            status: ResultTextMonitorDebugStatus,
            overrides: Partial<Omit<ResultTextMonitorDebugSnapshot, 'status' | 'enabled' | 'triggerLatched' | 'liveStartedAt' | 'liveElapsedMs' | 'armDelayMs' | 'armRemainingMs' | 'isArmed' | 'sampleIntervalMs' | 'captureRegion'>> = {},
        ) => {
            const callback = onDebugStateChangeRef.current;
            if (!callback) return;

            const normalizedLiveStartedAt = toFiniteNumber(liveStartedAt);
            const liveElapsedMs = normalizedLiveStartedAt == null
                ? null
                : Math.max(0, Date.now() - normalizedLiveStartedAt);
            const normalizedArmDelayMs = Math.max(0, Number(armDelayMs) || 0);
            const armRemainingMs = normalizedLiveStartedAt == null
                ? normalizedArmDelayMs
                : Math.max(0, (normalizedLiveStartedAt + normalizedArmDelayMs) - Date.now());

            callback({
                status,
                enabled,
                triggerLatched,
                liveStartedAt: normalizedLiveStartedAt,
                liveElapsedMs,
                armDelayMs: normalizedArmDelayMs,
                armRemainingMs,
                isArmed: normalizedLiveStartedAt != null && armRemainingMs <= 0,
                sampleIntervalMs: RESULT_TEXT_SAMPLE_INTERVAL_MS,
                captureRegion: RESULT_TEXT_SAMPLE_REGION,
                detected: overrides.detected ?? false,
                lastRecognizedText: overrides.lastRecognizedText ?? '',
                lastSignal: overrides.lastSignal ?? null,
                lastError: overrides.lastError,
                lastUpdatedAt: overrides.lastUpdatedAt ?? Date.now(),
            });
        };

        const api = getElectronAPI();
        const normalizedLiveStartedAt = toFiniteNumber(liveStartedAt);
        const normalizedArmDelayMs = Math.max(0, Number(armDelayMs) || 0);

        if (!enabled) {
            api?.send(SEND_STOP);
            emitDebugState('disabled');
            return;
        }

        if (triggerLatched) {
            api?.send(SEND_STOP);
            emitDebugState('latched');
            return;
        }

        if (!api) {
            emitDebugState('no-api');
            return;
        }

        if (normalizedLiveStartedAt == null) {
            api.send(SEND_STOP);
            emitDebugState('waiting-live-start');
            return;
        }

        const armAt = normalizedLiveStartedAt + normalizedArmDelayMs;
        const unsubDetected = api.on(RECEIVE_DETECTED, (payload: unknown) => {
            void onResultDetectedRef.current?.(normalizeDetectionPayload(payload));
        });
        const unsubDebug = api.on(RECEIVE_DEBUG, (snapshot: MainResultTextDebugSnapshot) => {
            emitDebugState(
                String(snapshot?.status || 'sampling') as ResultTextMonitorDebugStatus,
                {
                    detected: snapshot?.detected === true,
                    lastRecognizedText: typeof snapshot?.lastRecognizedText === 'string' ? snapshot.lastRecognizedText : '',
                    lastSignal: snapshot?.lastSignal == null ? null : normalizeDetectionPayload(snapshot.lastSignal),
                    lastError: typeof snapshot?.lastError === 'string' ? snapshot.lastError : null,
                    lastUpdatedAt: toFiniteNumber(snapshot?.lastUpdatedAt) ?? Date.now(),
                },
            );
        });

        api.send(SEND_START, {
            armAt,
            intervalMs: RESULT_TEXT_SAMPLE_INTERVAL_MS,
            captureRegion: RESULT_TEXT_SAMPLE_REGION,
        });

        emitDebugState(Date.now() < armAt ? 'arming-delay' : 'sampling');

        return () => {
            api.send(SEND_STOP);
            unsubDetected?.();
            unsubDebug?.();
        };
    }, [armDelayMs, enabled, liveStartedAt, triggerLatched]);
}
