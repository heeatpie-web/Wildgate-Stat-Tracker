/**
 * @module pixelMonitor
 * Monitors a configurable screen region for pixel changes.
 * Used to auto-detect the victory/defeat result screen and trigger smart capture.
 *
 * Detection: frame-diff change detection — captures the configured region in a
 * single native call via screen.grabRegion() and computes the average RGB across
 * all pixels. When the average per-channel difference between frames exceeds
 * `changeSensitivity`, the `onTrigger` callback fires (with a cooldown guard).
 */

/** Milliseconds to suppress re-triggering after a detection event. */
const COOLDOWN_MS = 15000;

let _timer = null;
let _cooldownUntil = 0;
let _prevSample = null; // [avgR, avgG, avgB]
let _busy = false;

// Lazy-load nut-js to avoid require() at module load time
let _nut = null;
function getNut() {
    if (_nut) return _nut;
    _nut = require('@nut-tree-fork/nut-js');
    return _nut;
}

/**
 * Sample the region via a single native grabRegion() call.
 * Returns averaged RGB values across all pixels in the region.
 *
 * The grabbed Image buffer uses BGRA byte ordering (4 channels, 32 bpp):
 *   byte 0 = B, byte 1 = G, byte 2 = R, byte 3 = A
 *
 * @param {{ x: number, y: number, width: number, height: number }} config
 * @returns {Promise<{ avgR: number, avgG: number, avgB: number } | null>}
 */
async function sampleRegion(config) {
    try {
        const { screen, Region } = getNut();
        const img = await screen.grabRegion(
            new Region(config.x, config.y, config.width, config.height)
        );

        const buf = img.data;
        // Buffer is BGRA: channels = [B, G, R, A] per pixel
        let sumR = 0, sumG = 0, sumB = 0;
        const pixelCount = buf.length / 4;

        for (let i = 0; i < buf.length; i += 4) {
            sumB += buf[i];
            sumG += buf[i + 1];
            sumR += buf[i + 2];
            // buf[i + 3] is alpha — ignored
        }

        return {
            avgR: Math.round(sumR / pixelCount),
            avgG: Math.round(sumG / pixelCount),
            avgB: Math.round(sumB / pixelCount),
        };
    } catch {
        return null;
    }
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
            if (Date.now() < _cooldownUntil) return;

            const sample = await sampleRegion(config);
            if (!sample) return;

            const { avgR, avgG, avgB } = sample;

            if (_prevSample) {
                const [pR, pG, pB] = _prevSample;
                const diff = (Math.abs(avgR - pR) + Math.abs(avgG - pG) + Math.abs(avgB - pB)) / 3;

                if (diff >= config.changeSensitivity) {
                    _cooldownUntil = Date.now() + COOLDOWN_MS;
                    _prevSample = [avgR, avgG, avgB];
                    onTrigger();
                    return;
                }
            }

            _prevSample = [avgR, avgG, avgB];
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
    _prevSample = null;
    _busy = false;
}

module.exports = { startMonitor, stopMonitor, sampleRegion };
