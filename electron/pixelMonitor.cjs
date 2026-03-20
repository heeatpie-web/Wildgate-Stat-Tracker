/**
 * @module pixelMonitor
 * Monitors a configurable screen region for pixel changes.
 * Used to auto-detect the victory/defeat result screen and trigger smart capture.
 *
 * Detection: two-stage frame-diff confirmation. We first detect a significant
 * change, then require the next sample to remain close to that changed state
 * before firing. This avoids reacting to brief HUD/world motion while still
 * triggering on persistent result-screen transitions.
 *
 * sampleRegion() returns a structured payload:
 *   { success: true, data: { avgR, avgG, avgB } }
 *   { success: false, error: '...' }
 */

/** Milliseconds to suppress re-triggering after a detection event. */
const COOLDOWN_MS = 15000;
const MIN_CONFIRM_WINDOW_MS = 4000;
const CONFIRM_WINDOW_MULTIPLIER = 2;
const CONFIRM_STABILITY_FACTOR = 0.55;
const MIN_CONFIRM_DIFF = 10;

let _timer = null;
let _cooldownUntil = 0;
let _prevSample = null; // [avgR, avgG, avgB]
let _pendingTrigger = null; // { sample: [avgR, avgG, avgB], expiresAt: number }
let _busy = false;
let _sharp = null;

// Lazy-load nut-js to avoid require() at module load time
let _nut = null;
function getNut() {
    if (_nut) return _nut;
    _nut = require('@nut-tree-fork/nut-js');
    return _nut;
}

function getSharp() {
    if (_sharp) return _sharp;
    _sharp = require('sharp');
    return _sharp;
}

function createSampleSuccess(data) {
    return { success: true, data };
}

function createSampleError(error, fallbackMessage = 'Pixel monitor sample failed') {
    const message = typeof error === 'string'
        ? error.trim()
        : error?.message;
    return {
        success: false,
        error: message || fallbackMessage,
    };
}

function normalizeRegionConfig(config) {
    const x = Number(config?.x);
    const y = Number(config?.y);
    const width = Number(config?.width);
    const height = Number(config?.height);

    if (![x, y, width, height].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0) return null;

    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
    };
}

function clampRegionToBounds(regionConfig, imageWidth, imageHeight) {
    const safeImageWidth = Math.max(0, Math.round(Number(imageWidth) || 0));
    const safeImageHeight = Math.max(0, Math.round(Number(imageHeight) || 0));
    if (safeImageWidth <= 0 || safeImageHeight <= 0) return null;

    const x = Math.min(Math.max(0, regionConfig.x), safeImageWidth - 1);
    const y = Math.min(Math.max(0, regionConfig.y), safeImageHeight - 1);
    const width = Math.min(regionConfig.width, safeImageWidth - x);
    const height = Math.min(regionConfig.height, safeImageHeight - y);
    if (width <= 0 || height <= 0) return null;

    return { x, y, width, height };
}

/**
 * Sample the region via a single native grabRegion() call.
 * Returns averaged RGB values across all pixels in the region.
 *
 * The grabbed Image buffer uses BGRA byte ordering (4 channels, 32 bpp):
 *   byte 0 = B, byte 1 = G, byte 2 = R, byte 3 = A
 *
 * @param {{ x: number, y: number, width: number, height: number }} config
 * @returns {Promise<{ success: true, data: { avgR: number, avgG: number, avgB: number } } | { success: false, error: string }>}
 */
async function sampleRegion(config) {
    try {
        const regionConfig = normalizeRegionConfig(config);
        if (!regionConfig) {
            return createSampleError('Invalid pixel monitor region configuration');
        }
        const { screen, Region } = getNut();
        const img = await screen.grabRegion(
            new Region(regionConfig.x, regionConfig.y, regionConfig.width, regionConfig.height)
        );

        const buf = img.data;
        // Buffer is BGRA: channels = [B, G, R, A] per pixel
        let sumR = 0, sumG = 0, sumB = 0;
        const pixelCount = buf.length / 4;
        if (!pixelCount) {
            return createSampleError('Pixel monitor sample returned empty image data');
        }

        for (let i = 0; i < buf.length; i += 4) {
            sumB += buf[i];
            sumG += buf[i + 1];
            sumR += buf[i + 2];
            // buf[i + 3] is alpha — ignored
        }

        return createSampleSuccess({
            avgR: Math.round(sumR / pixelCount),
            avgG: Math.round(sumG / pixelCount),
            avgB: Math.round(sumB / pixelCount),
        });
    } catch (error) {
        return createSampleError(error);
    }
}

async function sampleImageBufferRegion(imageBuffer, config) {
    try {
        const regionConfig = normalizeRegionConfig(config);
        if (!regionConfig) {
            return createSampleError('Invalid pixel monitor region configuration');
        }
        if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
            return createSampleError('Pixel monitor image buffer is unavailable');
        }

        const sharp = getSharp();
        const image = sharp(imageBuffer, { failOn: 'none' });
        const metadata = await image.metadata();
        const imageWidth = Number(metadata.width || 0);
        const imageHeight = Number(metadata.height || 0);
        const boundedRegion = clampRegionToBounds(regionConfig, imageWidth, imageHeight);
        if (!boundedRegion) {
            return createSampleError('Pixel monitor region falls outside the captured image');
        }

        const { data, info } = await image
            .extract({
                left: boundedRegion.x,
                top: boundedRegion.y,
                width: boundedRegion.width,
                height: boundedRegion.height,
            })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const channels = Number(info?.channels || 0);
        const pixelCount = boundedRegion.width * boundedRegion.height;
        if (!pixelCount || channels < 3) {
            return createSampleError('Pixel monitor sample returned empty image data');
        }

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        for (let i = 0; i < data.length; i += channels) {
            sumR += data[i];
            sumG += data[i + 1];
            sumB += data[i + 2];
        }

        return createSampleSuccess({
            avgR: Math.round(sumR / pixelCount),
            avgG: Math.round(sumG / pixelCount),
            avgB: Math.round(sumB / pixelCount),
        });
    } catch (error) {
        return createSampleError(error);
    }
}

function averageChannelDiff(leftSample, rightSample) {
    if (!Array.isArray(leftSample) || !Array.isArray(rightSample)) return Infinity;
    return (
        Math.abs(Number(leftSample[0] || 0) - Number(rightSample[0] || 0)) +
        Math.abs(Number(leftSample[1] || 0) - Number(rightSample[1] || 0)) +
        Math.abs(Number(leftSample[2] || 0) - Number(rightSample[2] || 0))
    ) / 3;
}

function buildPendingTrigger(sampleTuple, config, now) {
    const intervalMs = Math.max(0, Number(config?.intervalMs || 0));
    return {
        sample: sampleTuple,
        expiresAt: now + Math.max(MIN_CONFIRM_WINDOW_MS, intervalMs * CONFIRM_WINDOW_MULTIPLIER),
    };
}

function shouldConfirmPendingTrigger(pendingTrigger, sampleTuple, changeSensitivity) {
    if (!pendingTrigger || !Array.isArray(sampleTuple)) return false;
    const confirmThreshold = Math.max(
        MIN_CONFIRM_DIFF,
        Number(changeSensitivity || 0) * CONFIRM_STABILITY_FACTOR
    );
    return averageChannelDiff(pendingTrigger.sample, sampleTuple) <= confirmThreshold;
}

/**
 * Start the pixel monitor.
 * @param {{ x: number, y: number, width: number, height: number, intervalMs: number, changeSensitivity: number }} config
 * @param {() => void} onTrigger - Called when a significant change is detected
 */
function startMonitor(config, onTrigger) {
    stopMonitor();

    _timer = setInterval(async () => {
        if (_busy) return;
        _busy = true;
        try {
            const now = Date.now();
            if (now < _cooldownUntil) return;

            const sample = await sampleRegion(config);
            if (!sample.success) return;

            const sampleTuple = [sample.data.avgR, sample.data.avgG, sample.data.avgB];

            if (_pendingTrigger && now <= _pendingTrigger.expiresAt) {
                if (shouldConfirmPendingTrigger(_pendingTrigger, sampleTuple, config.changeSensitivity)) {
                    _cooldownUntil = now + COOLDOWN_MS;
                    _pendingTrigger = null;
                    _prevSample = sampleTuple;
                    onTrigger();
                    return;
                }
            } else if (_pendingTrigger && now > _pendingTrigger.expiresAt) {
                _pendingTrigger = null;
            }

            if (_prevSample) {
                const diff = averageChannelDiff(sampleTuple, _prevSample);

                if (diff >= config.changeSensitivity) {
                    _pendingTrigger = buildPendingTrigger(sampleTuple, config, now);
                    _prevSample = sampleTuple;
                    return;
                }
            }

            _prevSample = sampleTuple;
        } catch {
            // Silently swallow errors (e.g. nut-js unavailable mid-restart)
        } finally {
            _busy = false;
        }
    }, config.intervalMs);
}

/**
 * Stop the pixel monitor and clear all state.
 */
function stopMonitor() {
    if (_timer !== null) {
        clearInterval(_timer);
        _timer = null;
    }
    _cooldownUntil = 0;
    _prevSample = null;
    _pendingTrigger = null;
    _busy = false;
}

const __test__ = {
    averageChannelDiff,
    buildPendingTrigger,
    clampRegionToBounds,
    createSampleError,
    createSampleSuccess,
    normalizeRegionConfig,
    sampleImageBufferRegion,
    shouldConfirmPendingTrigger,
};

module.exports = { startMonitor, stopMonitor, sampleRegion, sampleImageBufferRegion, __test__ };
