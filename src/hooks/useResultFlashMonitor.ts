import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';
import type { DeviceDisplayInfo, GameResolution } from '../store/slices/createDataSlice';
import {
    extractPixelMonitorSampleData,
    type PixelMonitorSampleData,
} from '../utils/pixelMonitorSample';

const FLASH_SAMPLE_INTERVAL_MS = 100;
const FLASH_ARM_DELAY_MS = 45_000;
const FLASH_BRIGHT_HOLD_MS = 200;
const FLASH_WHITE_THRESHOLD = Math.ceil(255 * 0.98);
// Mirrors the OBS macro's ROI: X:64 Y:1013 W:107 H:21 on a 1920x1080 frame.
export const FLASH_SAMPLE_REGION = {
    x: 64 / 1920,
    y: 1013 / 1080,
    width: 107 / 1920,
    height: 21 / 1080,
};

export interface ResultFlashMonitorOptions {
    enabled: boolean;
    liveStartedAt: number | null;
    triggerLatched?: boolean;
    onFlashDetected?: () => void | Promise<void>;
    onFlashResolved: () => void | Promise<void>;
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
    triggerLatched = false,
    onFlashDetected,
    onFlashResolved,
}: ResultFlashMonitorOptions) {
    const deviceDisplayInfo = useAppStore((state) => state.deviceDisplayInfo as DeviceDisplayInfo | null | undefined);
    const gameResolution = useAppStore((state) => state.gameResolution as GameResolution | null | undefined);

    const regions = useMemo(
        () => buildResultFlashSampleRegions(gameResolution, deviceDisplayInfo),
        [deviceDisplayInfo, gameResolution],
    );

    const onFlashDetectedRef = useRef(onFlashDetected);
    const onFlashResolvedRef = useRef(onFlashResolved);
    const brightSinceMsRef = useRef<number | null>(null);
    const waitingForFlashEndRef = useRef(false);
    const flashNotifiedRef = useRef(false);
    const pollInFlightRef = useRef(false);

    useEffect(() => {
        onFlashDetectedRef.current = onFlashDetected;
    }, [onFlashDetected]);

    useEffect(() => {
        onFlashResolvedRef.current = onFlashResolved;
    }, [onFlashResolved]);

    useEffect(() => {
        if (!enabled || triggerLatched || regions.length === 0) {
            brightSinceMsRef.current = null;
            waitingForFlashEndRef.current = false;
            flashNotifiedRef.current = false;
            pollInFlightRef.current = false;
            return;
        }

        const api = getElectronAPI();
        if (!api) return;

        let cancelled = false;
        const resetSamplingState = () => {
            brightSinceMsRef.current = null;
            waitingForFlashEndRef.current = false;
            flashNotifiedRef.current = false;
        };

        const pollForFlash = async () => {
            if (cancelled || pollInFlightRef.current) return;
            if (triggerLatched) {
                resetSamplingState();
                return;
            }
            if (!Number.isFinite(Number(liveStartedAt)) || Number(liveStartedAt) <= 0) {
                resetSamplingState();
                return;
            }
            if ((Date.now() - Number(liveStartedAt)) < FLASH_ARM_DELAY_MS) {
                resetSamplingState();
                return;
            }

            pollInFlightRef.current = true;
            try {
                const samples = await Promise.all(
                    regions.map(async (region) => extractPixelMonitorSampleData(
                        await api.invoke('pixel-monitor-sample', region)
                    ))
                );
                if (cancelled) return;

                const isWhiteFrame = areResultFlashSamplesWhite(samples);
                if (waitingForFlashEndRef.current) {
                    if (isWhiteFrame) return;
                    waitingForFlashEndRef.current = false;
                    brightSinceMsRef.current = null;
                    flashNotifiedRef.current = false;
                    await onFlashResolvedRef.current?.();
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
                    }
                    return;
                }

                brightSinceMsRef.current = null;
                flashNotifiedRef.current = false;
            } finally {
                pollInFlightRef.current = false;
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
    }, [enabled, liveStartedAt, regions, triggerLatched]);
}
