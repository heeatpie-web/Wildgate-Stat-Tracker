import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';
import type { DeviceDisplayInfo, GameResolution } from '../store/slices/createDataSlice';
import {
    extractPixelMonitorSampleData,
    type PixelMonitorSampleData,
} from '../utils/pixelMonitorSample';

const FLASH_SAMPLE_INTERVAL_MS = 150;
const FLASH_ARM_DELAY_MS = 45_000;
const FLASH_CONSECUTIVE_WHITE_SAMPLES = 2;
const FLASH_WHITE_THRESHOLD = 230;
const FLASH_SAMPLE_BOX_SIZE = 6;
// Full-auto samples the center and four quadrants of the result screen.
// On a 1920x1080 display, these map to roughly (960,540), (384,216), (1536,216),
// (384,864), and (1536,864).
export const FLASH_SAMPLE_POINTS = [
    { x: 0.5, y: 0.5 },
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.2, y: 0.8 },
    { x: 0.8, y: 0.8 },
];

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

    const halfBox = Math.floor(FLASH_SAMPLE_BOX_SIZE / 2);
    const maxX = Math.max(0, dimensions.width - FLASH_SAMPLE_BOX_SIZE);
    const maxY = Math.max(0, dimensions.height - FLASH_SAMPLE_BOX_SIZE);

    return FLASH_SAMPLE_POINTS.map((point) => {
        const centerX = Math.round(dimensions.width * point.x);
        const centerY = Math.round(dimensions.height * point.y);
        return {
            x: Math.min(maxX, Math.max(0, centerX - halfBox)),
            y: Math.min(maxY, Math.max(0, centerY - halfBox)),
            width: FLASH_SAMPLE_BOX_SIZE,
            height: FLASH_SAMPLE_BOX_SIZE,
        };
    });
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
    && samples.length === FLASH_SAMPLE_POINTS.length
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
    const consecutiveWhiteSamplesRef = useRef(0);
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
            consecutiveWhiteSamplesRef.current = 0;
            waitingForFlashEndRef.current = false;
            flashNotifiedRef.current = false;
            pollInFlightRef.current = false;
            return;
        }

        const api = getElectronAPI();
        if (!api) return;

        let cancelled = false;
        const resetSamplingState = () => {
            consecutiveWhiteSamplesRef.current = 0;
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
                    consecutiveWhiteSamplesRef.current = 0;
                    flashNotifiedRef.current = false;
                    await onFlashResolvedRef.current?.();
                    return;
                }

                if (isWhiteFrame) {
                    consecutiveWhiteSamplesRef.current += 1;
                    if (
                        consecutiveWhiteSamplesRef.current >= FLASH_CONSECUTIVE_WHITE_SAMPLES
                        && !waitingForFlashEndRef.current
                    ) {
                        waitingForFlashEndRef.current = true;
                        if (!flashNotifiedRef.current) {
                            flashNotifiedRef.current = true;
                            await onFlashDetectedRef.current?.();
                        }
                    }
                    return;
                }

                consecutiveWhiteSamplesRef.current = 0;
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
