import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';
import type { DeviceDisplayInfo, GameResolution } from '../store/slices/createDataSlice';
import {
    normalizePixelMonitorSampleMeta,
    normalizePixelMonitorSampleResult,
    type PixelMonitorSampleResult,
    type PixelMonitorSampleData,
    type PixelMonitorSampleMeta,
} from '../utils/pixelMonitorSample';

const FLASH_SAMPLE_INTERVAL_MS = 100;
export const DEFAULT_FLASH_ARM_DELAY_MS = 45_000;
// The end-game flash fades into and out of white, so we accept two consecutive
// samples at roughly 90% brightness instead of requiring a longer pure-white plateau.
const FLASH_BRIGHT_HOLD_MS = 100;
const FLASH_WHITE_THRESHOLD = Math.ceil(255 * 0.9);

// Mirrors the OBS macro's ROI: X:64 Y:1013 W:107 H:21 on a 1920x1080 frame.
export const FLASH_SAMPLE_REGION = {
    x: 64 / 1920,
    y: 1013 / 1080,
    width: 107 / 1920,
    height: 21 / 1080,
};

const SEND_START = 'result-flash-start';
const SEND_STOP = 'result-flash-stop';
const RECEIVE_DETECTED = 'result-flash-detected';
const RECEIVE_RESOLVED = 'result-flash-resolved';
const RECEIVE_DEBUG = 'result-flash-debug';

type MainResultFlashDebugStatus = 'arming-delay' | 'sampling' | 'waiting-flash-end';

interface MainResultFlashDebugSnapshot {
    status: MainResultFlashDebugStatus;
    armAt?: number;
    armRemainingMs?: number;
    brightSinceMs?: number | null;
    waitingForFlashEnd?: boolean;
    flashNotified?: boolean;
    pollInFlight?: boolean;
    lastSampleResult?: unknown;
    lastSampleMeta?: unknown;
    lastIsWhiteFrame?: boolean | null;
    lastUpdatedAt?: number;
}

export type ResultFlashMonitorDebugStatus =
    | 'disabled'
    | 'latched'
    | 'no-regions'
    | 'no-api'
    | 'waiting-live-start'
    | 'arming-delay'
    | 'sampling'
    | 'waiting-flash-end';

export interface ResultFlashMonitorDebugSnapshot {
    status: ResultFlashMonitorDebugStatus;
    enabled: boolean;
    triggerLatched: boolean;
    liveStartedAt: number | null;
    liveElapsedMs: number | null;
    armDelayMs: number;
    armRemainingMs: number | null;
    isArmed: boolean;
    regions: Array<{ x: number; y: number; width: number; height: number }>;
    sampleIntervalMs: number;
    brightHoldMs: number;
    whiteThreshold: number;
    brightSinceMs: number | null;
    waitingForFlashEnd: boolean;
    flashNotified: boolean;
    pollInFlight: boolean;
    lastSampleResult: PixelMonitorSampleResult | null;
    lastSampleMeta?: PixelMonitorSampleMeta | null;
    lastIsWhiteFrame: boolean | null;
    lastUpdatedAt: number;
}

export interface ResultFlashDetectedPayload {
    brightSinceMs: number;
}

export interface ResultFlashMonitorOptions {
    enabled: boolean;
    liveStartedAt: number | null;
    armDelayMs?: number;
    triggerLatched?: boolean;
    onFlashDetected?: (payload: ResultFlashDetectedPayload) => void | Promise<void>;
    onFlashResolved: () => void | Promise<void>;
    onDebugStateChange?: (state: ResultFlashMonitorDebugSnapshot) => void;
}

interface RuntimeDebugState {
    brightSinceMs: number | null;
    waitingForFlashEnd: boolean;
    flashNotified: boolean;
    pollInFlight: boolean;
    lastSampleResult: PixelMonitorSampleResult | null;
    lastSampleMeta: PixelMonitorSampleMeta | null;
    lastIsWhiteFrame: boolean | null;
    lastUpdatedAt: number;
}

const createEmptyRuntimeDebugState = (): RuntimeDebugState => ({
    brightSinceMs: null,
    waitingForFlashEnd: false,
    flashNotified: false,
    pollInFlight: false,
    lastSampleResult: null,
    lastSampleMeta: null,
    lastIsWhiteFrame: null,
    lastUpdatedAt: Date.now(),
});

const toPositiveDimension = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
};

const resolveFlashMonitorDimensions = (
    gameResolution: GameResolution | null | undefined,
    deviceDisplayInfo: DeviceDisplayInfo | null | undefined,
): { width: number; height: number } | null => {
    const gameWidth = toPositiveDimension(gameResolution?.resX);
    const gameHeight = toPositiveDimension(gameResolution?.resY);
    if (gameWidth && gameHeight) {
        return { width: gameWidth, height: gameHeight };
    }

    const virtualWidth = toPositiveDimension(deviceDisplayInfo?.virtualWidth);
    const virtualHeight = toPositiveDimension(deviceDisplayInfo?.virtualHeight);
    if (virtualWidth && virtualHeight) {
        return { width: virtualWidth, height: virtualHeight };
    }

    const displayWidth = toPositiveDimension(deviceDisplayInfo?.displayWidth);
    const displayHeight = toPositiveDimension(deviceDisplayInfo?.displayHeight);
    if (displayWidth && displayHeight) {
        return { width: displayWidth, height: displayHeight };
    }

    if (typeof window !== 'undefined' && typeof window.screen !== 'undefined') {
        const scaleFactor = Math.max(1, Number(window.devicePixelRatio) || 1);
        const screenWidth = toPositiveDimension(window.screen.width * scaleFactor);
        const screenHeight = toPositiveDimension(window.screen.height * scaleFactor);
        if (screenWidth && screenHeight) {
            return { width: screenWidth, height: screenHeight };
        }
    }

    return null;
};

export const buildResultFlashSampleRegions = (
    gameResolution: GameResolution | null | undefined,
    deviceDisplayInfo: DeviceDisplayInfo | null | undefined,
): Array<{ x: number; y: number; width: number; height: number }> => {
    const dimensions = resolveFlashMonitorDimensions(gameResolution, deviceDisplayInfo);
    if (!dimensions) return [];

    const regionWidth = Math.max(1, Math.round(dimensions.width * FLASH_SAMPLE_REGION.width));
    const regionHeight = Math.max(1, Math.round(dimensions.height * FLASH_SAMPLE_REGION.height));
    const maxX = Math.max(0, dimensions.width - regionWidth);
    const maxY = Math.max(0, dimensions.height - regionHeight);
    return [{
        x: Math.min(maxX, Math.max(0, Math.round(dimensions.width * FLASH_SAMPLE_REGION.x))),
        y: Math.min(maxY, Math.max(0, Math.round(dimensions.height * FLASH_SAMPLE_REGION.y))),
        width: regionWidth,
        height: regionHeight,
    }];
};

export const isNearWhiteSample = (
    sample: PixelMonitorSampleData | null | undefined,
    threshold = FLASH_WHITE_THRESHOLD,
): boolean => {
    if (!sample) return false;
    const avgR = Number(sample.avgR);
    const avgG = Number(sample.avgG);
    const avgB = Number(sample.avgB);
    if (!Number.isFinite(avgR) || !Number.isFinite(avgG) || !Number.isFinite(avgB)) return false;
    return ((avgR + avgG + avgB) / 3) >= threshold;
};

export const areResultFlashSamplesWhite = (
    samples: Array<PixelMonitorSampleData | null | undefined>,
    threshold = FLASH_WHITE_THRESHOLD,
): boolean => (
    Array.isArray(samples)
    && samples.length === 1
    && samples.every((sample) => isNearWhiteSample(sample, threshold))
);

export function useResultFlashMonitor({
    enabled,
    liveStartedAt,
    armDelayMs = DEFAULT_FLASH_ARM_DELAY_MS,
    triggerLatched = false,
    onFlashDetected,
    onFlashResolved,
    onDebugStateChange,
}: ResultFlashMonitorOptions) {
    const deviceDisplayInfo = useAppStore((state) => state.deviceDisplayInfo as DeviceDisplayInfo | null | undefined);
    const gameResolution = useAppStore((state) => state.gameResolution as GameResolution | null | undefined);

    const regions = useMemo(
        () => buildResultFlashSampleRegions(gameResolution, deviceDisplayInfo),
        [deviceDisplayInfo, gameResolution],
    );
    const normalizedArmDelayMs = Math.max(0, Number(armDelayMs) || 0);

    const onFlashDetectedRef = useRef(onFlashDetected);
    const onFlashResolvedRef = useRef(onFlashResolved);
    const onDebugStateChangeRef = useRef(onDebugStateChange);
    const regionsRef = useRef(regions);
    const runtimeDebugStateRef = useRef<RuntimeDebugState>(createEmptyRuntimeDebugState());

    useEffect(() => {
        onFlashDetectedRef.current = onFlashDetected;
    }, [onFlashDetected]);

    useEffect(() => {
        onFlashResolvedRef.current = onFlashResolved;
    }, [onFlashResolved]);

    useEffect(() => {
        onDebugStateChangeRef.current = onDebugStateChange;
    }, [onDebugStateChange]);

    useEffect(() => {
        regionsRef.current = regions;
    }, [regions]);

    useEffect(() => {
        const emitDebugState = (
            status: ResultFlashMonitorDebugStatus,
            overrides: Partial<RuntimeDebugState> = {},
        ) => {
            const callback = onDebugStateChangeRef.current;
            if (!callback) return;

            const nextRuntimeState = {
                ...runtimeDebugStateRef.current,
                ...overrides,
            };
            runtimeDebugStateRef.current = nextRuntimeState;

            const normalizedLiveStartedAt = Number.isFinite(Number(liveStartedAt)) && Number(liveStartedAt) > 0
                ? Number(liveStartedAt)
                : null;
            const liveElapsedMs = normalizedLiveStartedAt == null
                ? null
                : Math.max(0, Date.now() - normalizedLiveStartedAt);
            const armRemainingMs = normalizedLiveStartedAt == null
                ? normalizedArmDelayMs
                : Math.max(0, (normalizedLiveStartedAt + normalizedArmDelayMs) - Date.now());
            const isArmed = normalizedLiveStartedAt != null && armRemainingMs <= 0;

            callback({
                status,
                enabled,
                triggerLatched,
                liveStartedAt: normalizedLiveStartedAt,
                liveElapsedMs,
                armDelayMs: normalizedArmDelayMs,
                armRemainingMs,
                isArmed,
                regions: regionsRef.current,
                sampleIntervalMs: FLASH_SAMPLE_INTERVAL_MS,
                brightHoldMs: FLASH_BRIGHT_HOLD_MS,
                whiteThreshold: FLASH_WHITE_THRESHOLD,
                brightSinceMs: nextRuntimeState.brightSinceMs,
                waitingForFlashEnd: nextRuntimeState.waitingForFlashEnd,
                flashNotified: nextRuntimeState.flashNotified,
                pollInFlight: nextRuntimeState.pollInFlight,
                lastSampleResult: nextRuntimeState.lastSampleResult,
                lastSampleMeta: nextRuntimeState.lastSampleMeta,
                lastIsWhiteFrame: nextRuntimeState.lastIsWhiteFrame,
                lastUpdatedAt: nextRuntimeState.lastUpdatedAt,
            });
        };

        const resetRuntimeState = () => {
            runtimeDebugStateRef.current = createEmptyRuntimeDebugState();
        };

        if (!enabled) {
            getElectronAPI()?.send(SEND_STOP);
            resetRuntimeState();
            emitDebugState('disabled');
            return;
        }

        if (triggerLatched) {
            getElectronAPI()?.send(SEND_STOP);
            resetRuntimeState();
            emitDebugState('latched');
            return;
        }

        const api = getElectronAPI();
        if (!api) {
            resetRuntimeState();
            emitDebugState('no-api');
            return;
        }

        const normalizedLiveStartedAt = Number.isFinite(Number(liveStartedAt)) && Number(liveStartedAt) > 0
            ? Number(liveStartedAt)
            : null;
        if (normalizedLiveStartedAt == null) {
            api.send(SEND_STOP);
            resetRuntimeState();
            emitDebugState('waiting-live-start');
            return;
        }

        const armAt = normalizedLiveStartedAt + normalizedArmDelayMs;

        const unsubDetected = api.on(RECEIVE_DETECTED, (payload: unknown) => {
            const brightSinceMs = typeof (payload as Record<string, unknown>)?.brightSinceMs === 'number'
                ? (payload as Record<string, unknown>).brightSinceMs as number
                : Date.now();
            void onFlashDetectedRef.current?.({ brightSinceMs });
        });

        const unsubResolved = api.on(RECEIVE_RESOLVED, () => {
            void onFlashResolvedRef.current?.();
        });

        const unsubDebug = api.on(RECEIVE_DEBUG, (snapshot: MainResultFlashDebugSnapshot) => {
            const lastSampleResult = snapshot.lastSampleResult == null
                ? null
                : normalizePixelMonitorSampleResult(snapshot.lastSampleResult);
            const lastSampleMeta = snapshot.lastSampleMeta == null
                ? (lastSampleResult?.meta ?? null)
                : (normalizePixelMonitorSampleMeta(snapshot.lastSampleMeta) ?? null);
            const lastUpdatedAt = Number.isFinite(Number(snapshot.lastUpdatedAt))
                ? Number(snapshot.lastUpdatedAt)
                : Date.now();

            emitDebugState(snapshot.status, {
                brightSinceMs: snapshot.brightSinceMs == null ? null : Number(snapshot.brightSinceMs),
                waitingForFlashEnd: snapshot.waitingForFlashEnd === true,
                flashNotified: snapshot.flashNotified === true,
                pollInFlight: snapshot.pollInFlight === true,
                lastSampleResult,
                lastSampleMeta,
                lastIsWhiteFrame: snapshot.lastIsWhiteFrame == null ? null : snapshot.lastIsWhiteFrame === true,
                lastUpdatedAt,
            });
        });

        api.send(SEND_START, {
            armAt,
            normalizedRegion: FLASH_SAMPLE_REGION,
        });

        emitDebugState(Date.now() < armAt ? 'arming-delay' : 'sampling');

        return () => {
            api.send(SEND_STOP);
            unsubDetected?.();
            unsubResolved?.();
            unsubDebug?.();
            resetRuntimeState();
        };
    }, [enabled, liveStartedAt, normalizedArmDelayMs, triggerLatched]);
}
