/**
 * @module pixelMonitor
 * Monitors a configurable screen region for pixel changes.
 * Used to auto-detect the victory/defeat result screen and trigger smart capture.
 *
 * Detection: frame-diff change detection — compares a small screen region against
 * the previous frame. When the average per-channel pixel difference exceeds
 * `changeSensitivity`, the `onTrigger` callback fires (with a cooldown guard).
 */

const { desktopCapturer, screen } = require('electron');

/** Capture at 1/4 native resolution to minimize CPU/memory overhead. */
const SCALE = 4;

/** Milliseconds to suppress re-triggering after a detection event. */
const COOLDOWN_MS = 15000;

let _timer = null;
let _cooldownUntil = 0;
let _prevRegion = null;

/**
 * Extract a flat BGR array for the specified region from a raw BGRA bitmap.
 * @param {Buffer} bitmap - BGRA flat buffer from NativeImage.getBitmap()
 * @param {number} imgW   - Width (in pixels) of the full thumbnail image
 * @param {number} rx     - Region left edge (scaled coords)
 * @param {number} ry     - Region top edge (scaled coords)
 * @param {number} rw     - Region width (scaled coords)
 * @param {number} rh     - Region height (scaled coords)
 * @returns {number[]}
 */
function extractRegion(bitmap, imgW, rx, ry, rw, rh) {
    const buf = [];
    for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
            const idx = ((ry + dy) * imgW + (rx + dx)) * 4;
            buf.push(bitmap[idx], bitmap[idx + 1], bitmap[idx + 2]); // BGR
        }
    }
    return buf;
}

/**
 * Compute the average absolute per-channel difference between two BGR arrays.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} 0–255
 */
function avgDiff(a, b) {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < a.length; i++) {
        total += Math.abs(a[i] - b[i]);
    }
    return total / a.length;
}

/**
 * Start the pixel monitor.
 * @param {{ x: number, y: number, width: number, height: number, intervalMs: number, changeSensitivity: number }} config
 * @param {() => void} onTrigger - Called when a significant change is detected
 */
function startMonitor(config, onTrigger) {
    stopMonitor();
    _prevRegion = null;

    _timer = setInterval(async () => {
        try {
            if (Date.now() < _cooldownUntil) return;

            const display = screen.getPrimaryDisplay();
            const { width, height } = display.size;
            const thumbW = Math.ceil(width / SCALE);
            const thumbH = Math.ceil(height / SCALE);

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: thumbW, height: thumbH },
            });

            if (!sources || sources.length === 0) return;

            const img = sources[0].thumbnail;
            const bitmap = img.getBitmap(); // BGRA flat buffer
            const { width: imgW } = img.getSize();

            // Scale the configured coordinates down to thumbnail space
            const rx = Math.max(0, Math.round(config.x / SCALE));
            const ry = Math.max(0, Math.round(config.y / SCALE));
            const rw = Math.max(1, Math.round(config.width / SCALE));
            const rh = Math.max(1, Math.round(config.height / SCALE));

            const region = extractRegion(bitmap, imgW, rx, ry, rw, rh);

            if (_prevRegion && avgDiff(region, _prevRegion) >= config.changeSensitivity) {
                _cooldownUntil = Date.now() + COOLDOWN_MS;
                _prevRegion = region;
                onTrigger();
            } else {
                _prevRegion = region;
            }
        } catch (err) {
            // Silently swallow errors (e.g. desktopCapturer unavailable mid-restart)
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
    _prevRegion = null;
}

/**
 * Perform a one-shot sample of the configured region.
 * Returns average RGB values for calibration/testing purposes.
 * @param {{ x: number, y: number, width: number, height: number }} config
 * @returns {Promise<{ avgR: number, avgG: number, avgB: number } | null>}
 */
async function sampleRegion(config) {
    try {
        const display = screen.getPrimaryDisplay();
        const { width, height } = display.size;
        const thumbW = Math.ceil(width / SCALE);
        const thumbH = Math.ceil(height / SCALE);

        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: thumbW, height: thumbH },
        });

        if (!sources || sources.length === 0) return null;

        const img = sources[0].thumbnail;
        const bitmap = img.getBitmap();
        const { width: imgW } = img.getSize();

        const rx = Math.max(0, Math.round(config.x / SCALE));
        const ry = Math.max(0, Math.round(config.y / SCALE));
        const rw = Math.max(1, Math.round(config.width / SCALE));
        const rh = Math.max(1, Math.round(config.height / SCALE));

        const region = extractRegion(bitmap, imgW, rx, ry, rw, rh);
        if (region.length === 0) return null;

        // extractRegion gives [B,G,R, B,G,R, ...] per pixel
        let sumR = 0, sumG = 0, sumB = 0;
        const pixelCount = region.length / 3;
        for (let i = 0; i < region.length; i += 3) {
            sumB += region[i];
            sumG += region[i + 1];
            sumR += region[i + 2];
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

module.exports = { startMonitor, stopMonitor, sampleRegion };
