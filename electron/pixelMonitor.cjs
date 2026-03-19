/**
 * @module pixelMonitor
 * Monitors a configurable screen region for pixel changes.
 * Used to auto-detect the victory/defeat result screen and trigger smart capture.
 *
 * Detection: frame-diff change detection — samples a 4×4 grid of pixels across
 * the configured region using nut-js screen.colorAt(). When the average per-channel
 * difference between frames exceeds `changeSensitivity`, the `onTrigger` callback
 * fires (with a cooldown guard).
 */

/** Number of samples per axis (4×4 = 16 total). */
const SAMPLES = 4;

/** Milliseconds to suppress re-triggering after a detection event. */
const COOLDOWN_MS = 15000;

let _timer = null;
let _cooldownUntil = 0;
let _prevSample = null; // [avgR, avgG, avgB]

// IPC: lazy-load nut-js screen object
let _nutScreen = null;
function getNutScreen() {
    if (_nutScreen) return _nutScreen;
    _nutScreen = require('@nut-tree-fork/nut-js').screen;
    return _nutScreen;
}

/**
 * Sample a 4×4 grid of pixels evenly distributed across the region.
 * Returns averaged RGB values across all 16 samples.
 * @param {{ x: number, y: number, width: number, height: number }} config
 * @returns {Promise<{ avgR: number, avgG: number, avgB: number } | null>}
 */
async function sampleRegion(config) {
    try {
        const s = getNutScreen();
        let sumR = 0, sumG = 0, sumB = 0, count = 0;

        for (let row = 0; row < SAMPLES; row++) {
            for (let col = 0; col < SAMPLES; col++) {
                const x = Math.round(config.x + (col / (SAMPLES - 1)) * (config.width - 1));
                const y = Math.round(config.y + (row / (SAMPLES - 1)) * (config.height - 1));
                const c = await s.colorAt({ x, y });
                sumR += c.red;
                sumG += c.green;
                sumB += c.blue;
                count++;
            }
        }

        return {
            avgR: Math.round(sumR / count),
            avgG: Math.round(sumG / count),
            avgB: Math.round(sumB / count),
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
}

module.exports = { startMonitor, stopMonitor, sampleRegion };
