import type { DeviceDisplayInfo, GameResolution } from '../store/slices/createDataSlice';

const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;
const ULTRAWIDE_WIDTH_GROWTH_DIVISOR = 24;
const ULTRAWIDE_X_SHIFT_DIVISOR = 448;

const FLASH_SAMPLE_REFERENCE_RECT = {
    x: 150,
    y: 979,
    width: 107,
    height: 21,
} as const;

// Reference ROI on a 1920x1080 frame. Runtime geometry derives from this box.
export const FLASH_SAMPLE_REGION = {
    x: FLASH_SAMPLE_REFERENCE_RECT.x / REFERENCE_WIDTH,
    y: FLASH_SAMPLE_REFERENCE_RECT.y / REFERENCE_HEIGHT,
    width: FLASH_SAMPLE_REFERENCE_RECT.width / REFERENCE_WIDTH,
    height: FLASH_SAMPLE_REFERENCE_RECT.height / REFERENCE_HEIGHT,
} as const;

const toPositiveDimension = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
};

const clampToBounds = (value: number, min: number, max: number): number => (
    Math.min(max, Math.max(min, value))
);

export const resolveResultFlashMonitorDimensions = (
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

const buildResultFlashSampleRegionForDimensions = (
    dimensions: { width: number; height: number },
): { x: number; y: number; width: number; height: number } => {
    const verticalScale = dimensions.height / REFERENCE_HEIGHT;
    const referenceCanvasWidthAtHeight = dimensions.height * (REFERENCE_WIDTH / REFERENCE_HEIGHT);
    const extraUltrawideWidth = Math.max(0, dimensions.width - referenceCanvasWidthAtHeight);

    // The HUD row anchors by height, but on ultrawide layouts the active-name
    // bar stretches slightly wider than pure height scaling predicts.
    const regionWidth = Math.max(
        1,
        Math.round((FLASH_SAMPLE_REFERENCE_RECT.width * verticalScale) + (extraUltrawideWidth / ULTRAWIDE_WIDTH_GROWTH_DIVISOR)),
    );
    const regionHeight = Math.max(1, Math.round(FLASH_SAMPLE_REFERENCE_RECT.height * verticalScale));
    const maxX = Math.max(0, dimensions.width - regionWidth);
    const maxY = Math.max(0, dimensions.height - regionHeight);

    return {
        x: clampToBounds(
            Math.round((FLASH_SAMPLE_REFERENCE_RECT.x * verticalScale) - (extraUltrawideWidth / ULTRAWIDE_X_SHIFT_DIVISOR)),
            0,
            maxX,
        ),
        y: clampToBounds(Math.round(FLASH_SAMPLE_REFERENCE_RECT.y * verticalScale), 0, maxY),
        width: regionWidth,
        height: regionHeight,
    };
};

export const buildResultFlashSampleRegions = (
    gameResolution: GameResolution | null | undefined,
    deviceDisplayInfo: DeviceDisplayInfo | null | undefined,
): Array<{ x: number; y: number; width: number; height: number }> => {
    const dimensions = resolveResultFlashMonitorDimensions(gameResolution, deviceDisplayInfo);
    if (!dimensions) return [];
    return [buildResultFlashSampleRegionForDimensions(dimensions)];
};

export const buildResultFlashSampleNormalizedRegion = (
    gameResolution: GameResolution | null | undefined,
    deviceDisplayInfo: DeviceDisplayInfo | null | undefined,
): { x: number; y: number; width: number; height: number } | null => {
    const dimensions = resolveResultFlashMonitorDimensions(gameResolution, deviceDisplayInfo);
    if (!dimensions) return null;

    const region = buildResultFlashSampleRegionForDimensions(dimensions);
    return {
        x: region.x / dimensions.width,
        y: region.y / dimensions.height,
        width: region.width / dimensions.width,
        height: region.height / dimensions.height,
    };
};
