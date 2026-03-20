import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';
import type { DeviceDisplayInfo, GameResolution } from '../store/slices/createDataSlice';
import {
    extractPixelMonitorSampleData,
    normalizePixelMonitorSampleResult,
    type PixelMonitorSampleResult,
    type PixelMonitorSampleData,
    type PixelMonitorSampleMeta,
} from '../utils/pixelMonitorSample';

const FLASH_SAMPLE_INTERVAL_MS = 100;
export const DEFAULT_FLASH_ARM_DELAY_MS = 45_000;
const FLASH_BRIGHT_HOLD_MS = 200;
const FLASH_WHITE_THRESHOLD = Math.ceil(255 * 0.98);
const RESULT_FLASH_SAMPLE_CHANNEL = 'result-flash-sample';
// Mirrors the OBS macro's ROI: X:64 Y:1013 W:107 H:21 on a 1920x1080 frame.
export const FLASH_SAMPLE_REGION = {
    x: 64 / 1920,
    y: 1013 / 1080,
    width: 107 / 1920,
    height: 21 / 1080,
};

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

export interface ResultFlashMonitorOptions {
    enabled: boolean;
    liveStartedAt: number | null;
    armDelayMs?: number;
    triggerLatched?: boolean;
    onFlashDetected?: () => void | Promise<void>;
    onFlashResolved: () => void | Promise<void>;
    onDebugStateChange?: (state: ResultFlashMonitorDebugSnapshot) => void;
}

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
    const brightSinceMsRef = useRef<number | null>(null);
    const waitingForFlashEndRef = useRef(false);
    const flashNotifiedRef = useRef(false);
    const pollInFlightRef = useRef(false);
    const lastSampleResultRef = useRef<PixelMonitorSampleResult | null>(null);
    const lastSampleMetaRef = useRef<PixelMonitorSampleMeta | null>(null);
    const lastIsWhiteFrameRef = useRef<boolean | null>(null);

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
        const emitDebugState = (status: ResultFlashMonitorDebugStatus) => {
            const callback = onDebugStateChangeRef.current;
            if (!callback) return;

            const normalizedLiveStartedAt = Number.isFinite(Number(liveStartedAt)) && Number(liveStartedAt) > 0
                ? Number(liveStartedAt)
                : null;
            const liveElapsedMs = normalizedLiveStartedAt == null
                ? null
                : Math.max(0, Date.now() - normalizedLiveStartedAt);
            const isArmed = liveElapsedMs != null && liveElapsedMs >= normalizedArmDelayMs;
            callback({
                status,
                enabled,
                triggerLatched,
                liveStartedAt: normalizedLiveStartedAt,
                liveElapsedMs,
                armDelayMs: normalizedArmDelayMs,
                armRemainingMs: liveElapsedMs == null
                    ? normalizedArmDelayMs
                    : Math.max(0, normalizedArmDelayMs - liveElapsedMs),
                isArmed,
                regions,
                sampleIntervalMs: FLASH_SAMPLE_INTERVAL_MS,
                brightHoldMs: FLASH_BRIGHT_HOLD_MS,
                whiteThreshold: FLASH_WHITE_THRESHOLD,
                brightSinceMs: brightSinceMsRef.current,
                waitingForFlashEnd: waitingForFlashEndRef.current,
                flashNotified: flashNotifiedRef.current,
                pollInFlight: pollInFlightRef.current,
                lastSampleResult: lastSampleResultRef.current,
                lastSampleMeta: lastSampleMetaRef.current,
                lastIsWhiteFrame: lastIsWhiteFrameRef.current,
                lastUpdatedAt: Date.now(),
            });
        };

        if (!enabled || triggerLatched || regions.length === 0) {
            brightSinceMsRef.current = null;
            waitingForFlashEndRef.current = false;
            flashNotifiedRef.current = false;
            pollInFlightRef.current = false;
            lastSampleResultRef.current = null;
            lastSampleMetaRef.current = null;
            lastIsWhiteFrameRef.current = null;
            emitDebugState(!enabled ? 'disabled' : triggerLatched ? 'latched' : 'no-regions');
            return;
        }

        const api = getElectronAPI();
        if (!api) {
            emitDebugState('no-api');
            return;
        }

        let cancelled = false;
        const resetSamplingState = () => {
            brightSinceMsRef.current = null;
            waitingForFlashEndRef.current = false;
            flashNotifiedRef.current = false;
            lastIsWhiteFrameRef.current = null;
        };

        const pollForFlash = async () => {
            if (cancelled || pollInFlightRef.current) return;
            if (triggerLatched) {
                resetSamplingState();
                emitDebugState('latched');
                return;
            }
            if (!Number.isFinite(Number(liveStartedAt)) || Number(liveStartedAt) <= 0) {
                resetSamplingState();
                emitDebugState('waiting-live-start');
                return;
            }
            if ((Date.now() - Number(liveStartedAt)) < normalizedArmDelayMs) {
                resetSamplingState();
                emitDebugState('arming-delay');
                return;
            }

            pollInFlightRef.current = true;
            emitDebugState(waitingForFlashEndRef.current ? 'waiting-flash-end' : 'sampling');
            try {
                const sampleResults = await Promise.all(
                    regions.map(async () => {
                        try {
                            return normalizePixelMonitorSampleResult(
                                await api.invoke(RESULT_FLASH_SAMPLE_CHANNEL, {
                                    normalizedRegion: FLASH_SAMPLE_REGION,
                                })
                            );
                        } catch (error) {
                            return {
                                success: false as const,
                                error: error instanceof Error && error.message
                                    ? error.message
                                    : 'Pixel monitor sample failed',
                            };
                        }
                    })
                );
                const samples = sampleResults.map((result) => extractPixelMonitorSampleData(result));
                lastSampleResultRef.current = sampleResults.find((result) => !result.success) ?? sampleResults[0] ?? null;
                if (lastSampleResultRef.current?.meta) {
                    lastSampleMetaRef.current = lastSampleResultRef.current.meta;
                }
                if (cancelled) return;

                const isWhiteFrame = areResultFlashSamplesWhite(samples);
                lastIsWhiteFrameRef.current = isWhiteFrame;
                if (waitingForFlashEndRef.current) {
                    if (isWhiteFrame) {
                        emitDebugState('waiting-flash-end');
                        return;
                    }
                    waitingForFlashEndRef.current = false;
                    brightSinceMsRef.current = null;
                    flashNotifiedRef.current = false;
                    await onFlashResolvedRef.current?.();
                    emitDebugState('sampling');
                    return;
                }

                if (isWhiteFrame) {
                    if (brightSinceMsRef.current == null) {
                        brightSinceMsRef.current = Date.now();
                    }
                    if ((Date.now() - brightSinceMsRef.current) >= FLASH_BRIGHT_HOLD_MS) {
                        waitingForFlashEndRef.current = true;
                        if (!flashNotifiedRef.current) {
                            flashNotifiedRef.current = true;
                            await onFlashDetectedRef.current?.();
                        }
                        emitDebugState('waiting-flash-end');
                    }
                    emitDebugState(waitingForFlashEndRef.current ? 'waiting-flash-end' : 'sampling');
                    return;
                }

                brightSinceMsRef.current = null;
                flashNotifiedRef.current = false;
                emitDebugState('sampling');
            } finally {
                pollInFlightRef.current = false;
                emitDebugState(waitingForFlashEndRef.current ? 'waiting-flash-end' : 'sampling');
            }
        };

        const timerId = window.setInterval(() => {
            void pollForFlash();
        }, FLASH_SAMPLE_INTERVAL_MS);

        void pollForFlash();

        return () => {
            cancelled = true;
            window.clearInterval(timerId);
            resetSamplingState();
            pollInFlightRef.current = false;
        };
    }, [enabled, liveStartedAt, normalizedArmDelayMs, regions, triggerLatched]);
}
