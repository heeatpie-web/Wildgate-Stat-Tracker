/**
 * @module pixelMonitor
 * Monitors a configurable screen region for pixel changes.
 * Used to auto-detect the victory/defeat result screen and trigger smart capture.
 *
 * Detection: two-stage frame-diff confirmation. We first detect a significant
 * change, then require the next sample to remain close to that changed state
 * before firing. This avoids reacting to brief HUD/world motion while still
 * triggering on persistent result-screen transitions.
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
            if (!sample) return;

            const sampleTuple = [sample.avgR, sample.avgG, sample.avgB];

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
    shouldConfirmPendingTrigger,
};

module.exports = { startMonitor, stopMonitor, sampleRegion, __test__ };
