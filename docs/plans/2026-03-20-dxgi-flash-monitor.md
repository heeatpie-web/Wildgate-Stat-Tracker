# DXGI Flash Monitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the nut-js + PowerShell-based result flash pixel sampler with a DXGI-backed sampler (`node-screenshots`) running entirely in the main process, eliminating per-sample IPC round-trips and game window geometry lookups.

**Architecture:** The main process owns the entire flash detection loop — it samples a fixed screen region every 100ms using DXGI, evaluates brightness, and fires a single IPC event when a flash is detected. The renderer hook stops polling and becomes a thin event listener that sends start/stop commands. Screen coordinates are derived once from `Electron.screen.getPrimaryDisplay()` — no PowerShell, no game window lookup, ever.

**Tech Stack:** `node-screenshots` (DXGI-backed Rust native module), `Electron.screen` API, existing Vitest test suite.

---

## Background: What Is Being Replaced

Current broken path (one per 100ms sample):
```
Renderer setInterval(100ms)
  → IPC invoke('result-flash-sample')
  → main: lookupGameWindowGeometry() [PowerShell, 4–800ms, degrades to 65s]
  → main: nut-js grabRegion() [50–200ms]
  → IPC return value → renderer evaluates brightness
```

New path:
```
Renderer: api.send('result-flash-start', { armAt, normalizedRegion })
Main process setInterval(100ms) [independent, never blocked]
  → node-screenshots captureArea() [DXGI, 5–20ms]
  → evaluate brightness in main process
  → if flash: api.webContents.send('result-flash-detected')
Renderer: api.on('result-flash-detected', ...) triggers OCR capture
```

## IPC Contract

| Direction | Channel | Payload |
|---|---|---|
| Renderer → Main (send) | `result-flash-start` | `{ armAt: number, normalizedRegion: { x, y, width, height } }` |
| Renderer → Main (send) | `result-flash-stop` | *(none)* |
| Main → Renderer (on) | `result-flash-detected` | *(none)* |
| Main → Renderer (on) | `result-flash-resolved` | *(none)* |
| Main → Renderer (on) | `result-flash-debug` | `ResultFlashDebugSnapshot` |

Channels removed: `result-flash-sample` (INVOKE).

## Flash Sample Region

The normalized region is preserved from the existing system:
```js
// Mirrors OBS macro ROI: X:64 Y:1013 W:107 H:21 on a 1920×1080 frame
const FLASH_SAMPLE_REGION = {
    x: 64 / 1920,      // 0.03333...
    y: 1013 / 1080,    // 0.93796...
    width: 107 / 1920, // 0.05572...
    height: 21 / 1080, // 0.01944...
};
```

The main process converts to absolute pixels using `Electron.screen.getPrimaryDisplay()`:
```js
const { bounds, scaleFactor } = screen.getPrimaryDisplay();
const physW = bounds.width * scaleFactor;
const physH = bounds.height * scaleFactor;
const absRegion = {
    x: Math.round(normalizedRegion.x * physW),
    y: Math.round(normalizedRegion.y * physH),
    width: Math.max(1, Math.round(normalizedRegion.width * physW)),
    height: Math.max(1, Math.round(normalizedRegion.height * physH)),
};
```

---

## Task 1: Install node-screenshots

**Files:**
- Modify: `package.json`

**Step 1: Install the package**
```bash
cd "N:\Coding (backup)"
npm install node-screenshots
```

**Step 2: Verify the package loads in a Node context**
```bash
node -e "const { Screen } = require('node-screenshots'); const screens = Screen.all(); console.log('screens:', screens.length, screens.map(s => ({ id: s.id, w: s.width, h: s.height, primary: s.isPrimary })));"
```
Expected: prints an array with at least one screen entry showing your monitor dimensions.

**Step 3: Commit**
```bash
git add package.json package-lock.json
git commit -m "chore: add node-screenshots for DXGI pixel sampling"
```

---

## Task 2: Create `electron/dxgiSampler.cjs`

**Files:**
- Create: `electron/dxgiSampler.cjs`

This module wraps `node-screenshots` and exposes a single function: sample an absolute pixel region and return averaged RGB.

**Step 1: Create the file**

```js
/**
 * @module dxgiSampler
 * Samples a screen region using DXGI Desktop Duplication via node-screenshots.
 * Returns averaged RGB across all pixels in the region.
 *
 * Buffer format from node-screenshots is BGRA (4 bytes/pixel):
 *   byte 0 = B, byte 1 = G, byte 2 = R, byte 3 = A
 */

let _nodeScreenshots = null;

function getNodeScreenshots() {
    if (_nodeScreenshots) return _nodeScreenshots;
    _nodeScreenshots = require('node-screenshots');
    return _nodeScreenshots;
}

/**
 * @param {number} x - Left edge in physical pixels
 * @param {number} y - Top edge in physical pixels
 * @param {number} width - Region width in physical pixels
 * @param {number} height - Region height in physical pixels
 * @returns {Promise<{ success: true, data: { avgR: number, avgG: number, avgB: number } } | { success: false, error: string }>}
 */
async function sampleRegion(x, y, width, height) {
    try {
        const { Screen } = getNodeScreenshots();

        // Get the screen that contains this region's top-left corner
        const targetScreen = Screen.fromPoint(x, y) ?? Screen.all()[0];
        if (!targetScreen) {
            return { success: false, error: 'No screen found for region coordinates' };
        }

        // Capture full screen frame — DXGI grabs from GPU backbuffer
        const image = await targetScreen.capture();
        if (!image || !image.data || !image.width || !image.height) {
            return { success: false, error: 'DXGI capture returned empty frame' };
        }

        // Clamp region to screen bounds
        const sx = Math.max(0, Math.min(x - targetScreen.x, image.width - 1));
        const sy = Math.max(0, Math.min(y - targetScreen.y, image.height - 1));
        const sw = Math.max(1, Math.min(width, image.width - sx));
        const sh = Math.max(1, Math.min(height, image.height - sy));
        const pixelCount = sw * sh;

        // Extract region from raw buffer (BGRA, 4 bytes/pixel)
        let sumR = 0, sumG = 0, sumB = 0;
        const buf = image.data;
        const stride = image.width * 4;
        for (let row = sy; row < sy + sh; row++) {
            for (let col = sx; col < sx + sw; col++) {
                const offset = row * stride + col * 4;
                sumB += buf[offset];
                sumG += buf[offset + 1];
                sumR += buf[offset + 2];
                // buf[offset + 3] is alpha — ignored
            }
        }

        return {
            success: true,
            data: {
                avgR: Math.round(sumR / pixelCount),
                avgG: Math.round(sumG / pixelCount),
                avgB: Math.round(sumB / pixelCount),
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message || 'DXGI sample failed' };
    }
}

module.exports = { sampleRegion };
```

> **Note:** Verify the `node-screenshots` image data format. Run:
> ```bash
> node -e "
> const { Screen } = require('node-screenshots');
> const s = Screen.all()[0];
> s.capture().then(img => {
>   console.log('width:', img.width, 'height:', img.height, 'data length:', img.data.length);
>   console.log('expected BGRA:', img.width * img.height * 4, '=== actual:', img.data.length);
>   console.log('top-left pixel BGRA:', img.data[0], img.data[1], img.data[2], img.data[3]);
> });
> "
> ```
> If the buffer length is `width * height * 3` (RGB, no alpha), change the stride to `image.width * 3` and channel offsets to `[offset+2, offset+1, offset]`.

**Step 2: Commit**
```bash
git add electron/dxgiSampler.cjs
git commit -m "feat: add dxgiSampler using node-screenshots for DXGI screen region sampling"
```

---

## Task 3: Create `electron/resultFlashMonitor.cjs`

**Files:**
- Create: `electron/resultFlashMonitor.cjs`

This is a direct port of the detection state machine from `src/hooks/useResultFlashMonitor.ts`, moved to the main process. It owns the 100ms sampling loop, arm delay check, brightness hold timer, flash/resolved callbacks, and debug snapshots.

**Step 1: Create the file**

```js
/**
 * @module resultFlashMonitor
 * Main-process result flash detection loop.
 * Samples a fixed screen region via DXGI every 100ms.
 * Fires callbacks when a sustained white flash is detected and when it ends.
 *
 * Detection state machine:
 *   arming-delay → sampling → (flash holds 200ms) → waiting-flash-end → sampling
 *
 * Ported from src/hooks/useResultFlashMonitor.ts.
 */

const { sampleRegion: dxgiSampleRegion } = require('./dxgiSampler.cjs');

const FLASH_SAMPLE_INTERVAL_MS = 100;
const FLASH_BRIGHT_HOLD_MS = 200;
const FLASH_WHITE_THRESHOLD = Math.ceil(255 * 0.98); // 250 — same as frontend hook
const FLASH_COOLDOWN_MS = 15_000;

let _timer = null;
let _state = null;

/**
 * Start monitoring for the result flash.
 *
 * @param {object} options
 * @param {number} options.armAt - Epoch ms timestamp before which detections are suppressed
 * @param {{ x: number, y: number, width: number, height: number }} options.absoluteRegion - Physical pixel coordinates
 * @param {() => void} [options.onDetected] - Called when flash is confirmed (200ms hold)
 * @param {() => void} [options.onResolved] - Called when flash ends (screen goes dark again)
 * @param {(snapshot: object) => void} [options.onDebug] - Called on each state change with a debug snapshot
 * @param {Function} [options._sampler] - Injected sampler for testing (default: dxgiSampleRegion)
 */
function startResultFlashMonitor({ armAt, absoluteRegion, onDetected, onResolved, onDebug, _sampler } = {}) {
    stopResultFlashMonitor();

    const sampler = typeof _sampler === 'function' ? _sampler : dxgiSampleRegion;

    _state = {
        armAt: Number(armAt) || 0,
        absoluteRegion,
        onDetected,
        onResolved,
        onDebug,
        sampler,
        brightSince: null,
        waitingForFlashEnd: false,
        flashNotified: false,
        cooldownUntil: 0,
    };

    void _poll();
    _timer = setInterval(() => { void _poll(); }, FLASH_SAMPLE_INTERVAL_MS);
}

function stopResultFlashMonitor() {
    if (_timer !== null) {
        clearInterval(_timer);
        _timer = null;
    }
    _state = null;
}

function _emitDebug(status, extra = {}) {
    if (!_state?.onDebug) return;
    _state.onDebug({
        status,
        armAt: _state.armAt,
        absoluteRegion: _state.absoluteRegion,
        brightSince: _state.brightSince,
        waitingForFlashEnd: _state.waitingForFlashEnd,
        flashNotified: _state.flashNotified,
        ...extra,
    });
}

async function _poll() {
    if (!_state) return;

    const now = Date.now();

    if (now < _state.cooldownUntil) return;

    if (now < _state.armAt) {
        _emitDebug('arming-delay', { armRemainingMs: _state.armAt - now });
        return;
    }

    const sample = await _state.sampler(
        _state.absoluteRegion.x,
        _state.absoluteRegion.y,
        _state.absoluteRegion.width,
        _state.absoluteRegion.height,
    );

    if (!_state) return; // stopped while awaiting

    if (!sample.success) {
        _emitDebug('sampling', { error: sample.error });
        return;
    }

    const avg = (sample.data.avgR + sample.data.avgG + sample.data.avgB) / 3;
    const isWhite = avg >= FLASH_WHITE_THRESHOLD;

    if (_state.waitingForFlashEnd) {
        _emitDebug('waiting-flash-end', { lastAvgBrightness: Math.round(avg) });
        if (!isWhite) {
            _state.waitingForFlashEnd = false;
            _state.brightSince = null;
            _state.flashNotified = false;
            _state.onResolved?.();
            _emitDebug('sampling');
        }
        return;
    }

    if (isWhite) {
        if (_state.brightSince === null) {
            _state.brightSince = now;
        }
        const heldMs = now - _state.brightSince;
        if (heldMs >= FLASH_BRIGHT_HOLD_MS && !_state.flashNotified) {
            _state.flashNotified = true;
            _state.waitingForFlashEnd = true;
            _state.cooldownUntil = now + FLASH_COOLDOWN_MS;
            _state.onDetected?.();
            _emitDebug('waiting-flash-end', { lastAvgBrightness: Math.round(avg) });
        } else {
            _emitDebug('sampling', { lastAvgBrightness: Math.round(avg), brightHeldMs: heldMs });
        }
    } else {
        _state.brightSince = null;
        _emitDebug('sampling', { lastAvgBrightness: Math.round(avg) });
    }
}

module.exports = { startResultFlashMonitor, stopResultFlashMonitor };
```

**Step 2: Write tests**

Create `src/hooks/__tests__/resultFlashMonitor.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We import the CJS module directly — vitest handles this in Node environment
const { startResultFlashMonitor, stopResultFlashMonitor } =
    await import('../../../electron/resultFlashMonitor.cjs');

const WHITE = { success: true as const, data: { avgR: 255, avgG: 255, avgB: 255 } };
const DARK  = { success: true as const, data: { avgR: 12, avgG: 18, avgB: 24 } };

describe('resultFlashMonitor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
        stopResultFlashMonitor();
    });

    afterEach(() => {
        stopResultFlashMonitor();
        vi.useRealTimers();
    });

    it('does not fire before armAt timestamp', async () => {
        const onDetected = vi.fn();
        const sampler = vi.fn().mockResolvedValue(WHITE);
        const armAt = Date.now() + 45_000;

        startResultFlashMonitor({
            armAt,
            absoluteRegion: { x: 64, y: 1013, width: 107, height: 21 },
            onDetected,
            onResolved: vi.fn(),
            _sampler: sampler,
        });

        await vi.runAllTimersAsync();
        expect(onDetected).not.toHaveBeenCalled();
        expect(sampler).not.toHaveBeenCalled();
    });

    it('fires onDetected after the white frame holds for 200ms', async () => {
        const onDetected = vi.fn();
        const onResolved = vi.fn();
        const frames = [DARK, WHITE, WHITE, WHITE, DARK];
        let idx = 0;
        const sampler = vi.fn().mockImplementation(() => Promise.resolve(frames[idx++] ?? DARK));

        startResultFlashMonitor({
            armAt: Date.now() - 1,
            absoluteRegion: { x: 64, y: 1013, width: 107, height: 21 },
            onDetected,
            onResolved,
            _sampler: sampler,
        });

        // First poll fires immediately (dark — no trigger)
        await vi.runAllTimersAsync();

        // Advance 100ms — white frame 1
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
        expect(onDetected).not.toHaveBeenCalled();

        // Advance 100ms — white frame 2 (200ms total hold)
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
        expect(onDetected).not.toHaveBeenCalled();

        // Advance 100ms — white frame 3 (300ms hold, triggers)
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
        expect(onDetected).toHaveBeenCalledTimes(1);
        expect(onResolved).not.toHaveBeenCalled();

        // Advance 100ms — dark frame → resolved
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
        expect(onResolved).toHaveBeenCalledTimes(1);
    });

    it('does not re-trigger during the 15-second cooldown', async () => {
        const onDetected = vi.fn();
        const sampler = vi.fn().mockResolvedValue(WHITE);

        startResultFlashMonitor({
            armAt: Date.now() - 1,
            absoluteRegion: { x: 64, y: 1013, width: 107, height: 21 },
            onDetected,
            onResolved: vi.fn(),
            _sampler: sampler,
        });

        // Let it trigger
        vi.advanceTimersByTime(500);
        await vi.runAllTimersAsync();
        expect(onDetected).toHaveBeenCalledTimes(1);

        // Advance 14 seconds — still in cooldown
        vi.advanceTimersByTime(14_000);
        await vi.runAllTimersAsync();
        expect(onDetected).toHaveBeenCalledTimes(1);
    });

    it('stopResultFlashMonitor halts sampling immediately', async () => {
        const sampler = vi.fn().mockResolvedValue(DARK);

        startResultFlashMonitor({
            armAt: Date.now() - 1,
            absoluteRegion: { x: 64, y: 1013, width: 107, height: 21 },
            onDetected: vi.fn(),
            onResolved: vi.fn(),
            _sampler: sampler,
        });

        stopResultFlashMonitor();
        vi.advanceTimersByTime(1000);
        await vi.runAllTimersAsync();

        // Only the immediate first poll before stop may have fired
        expect(sampler.mock.calls.length).toBeLessThanOrEqual(1);
    });
});
```

> **Note on importing CJS in vitest:** If vitest fails to resolve the `electron/` path, add an alias in `vite.config.ts`:
> ```ts
> resolve: { alias: { electron: path.resolve(__dirname, 'electron') } }
> ```
> Or use `createRequire` in the test file:
> ```ts
> import { createRequire } from 'module';
> const require = createRequire(import.meta.url);
> const { startResultFlashMonitor, stopResultFlashMonitor } = require('../../electron/resultFlashMonitor.cjs');
> ```

**Step 3: Run tests**
```bash
cd "N:\Coding (backup)"
npx vitest run src/hooks/__tests__/resultFlashMonitor.test.ts
```
Expected: all tests pass.

**Step 4: Commit**
```bash
git add electron/resultFlashMonitor.cjs src/hooks/__tests__/resultFlashMonitor.test.ts
git commit -m "feat: add main-process result flash monitor with DXGI sampler and dependency-injected tests"
```

---

## Task 4: Update `electron/preload.cjs`

**Files:**
- Modify: `electron/preload.cjs`

**Step 1: Remove the old invoke channel, add send and receive channels**

In `INVOKE_CHANNELS`, remove:
```js
'result-flash-sample',
```

In `SEND_CHANNELS`, add:
```js
'result-flash-start', 'result-flash-stop',
```

In `RECEIVE_CHANNELS`, add:
```js
'result-flash-detected', 'result-flash-resolved', 'result-flash-debug',
```

After the edit, `INVOKE_CHANNELS` should no longer contain `result-flash-sample`. `SEND_CHANNELS` should contain the two new entries. `RECEIVE_CHANNELS` should contain the three new entries.

**Step 2: Commit**
```bash
git add electron/preload.cjs
git commit -m "feat: update IPC channel allowlist for DXGI flash monitor (send/receive replaces invoke)"
```

---

## Task 5: Update `electron/main.cjs`

**Files:**
- Modify: `electron/main.cjs`

### Step 1: Add imports at the top of main.cjs

Near the other `require` statements at the top of the file, add:
```js
const { startResultFlashMonitor, stopResultFlashMonitor } = require('./resultFlashMonitor.cjs');
```

### Step 2: Add screen dimension helper

Add this function somewhere before the IPC handler section (near other helper functions):

```js
// ── Screen resolution for result flash ROI ──────────────────────────────────
let _cachedScreenDimensions = null;

function getPhysicalScreenDimensions() {
    if (_cachedScreenDimensions) return _cachedScreenDimensions;
    const display = require('electron').screen.getPrimaryDisplay();
    const physW = Math.round(display.bounds.width * display.scaleFactor);
    const physH = Math.round(display.bounds.height * display.scaleFactor);
    _cachedScreenDimensions = { width: physW, height: physH };
    return _cachedScreenDimensions;
}
```

Then in the app `whenReady` block (or wherever `screen` events are available), register a display-change listener to invalidate the cache:
```js
require('electron').screen.on('display-metrics-changed', () => {
    _cachedScreenDimensions = null;
    console.log('[ResultFlash] Screen metrics changed — dimension cache cleared');
});
```

### Step 3: Remove the old sampleResultFlashRegion IPC handler

Find and remove this block:
```js
ipcMain.handle('result-flash-sample', async (_event, config) => sampleResultFlashRegion(config));
```

Also remove (or keep for reference) the `sampleResultFlashRegion` function itself (lines 842–896). It is no longer called.

### Step 4: Add the new result-flash-start / result-flash-stop handlers

In the pixel monitor IPC section (near the existing `pixel-monitor-start` handler), add:

```js
// ── Result Flash Monitor (DXGI) ─────────────────────────────────────────────
ipcMain.on('result-flash-start', (_event, payload) => {
    const { armAt, normalizedRegion } = payload || {};

    if (!normalizedRegion || typeof armAt !== 'number') {
        console.warn('[ResultFlash] result-flash-start received invalid payload', payload);
        return;
    }

    const { width: physW, height: physH } = getPhysicalScreenDimensions();
    const absoluteRegion = {
        x: Math.round(normalizedRegion.x * physW),
        y: Math.round(normalizedRegion.y * physH),
        width: Math.max(1, Math.round(normalizedRegion.width * physW)),
        height: Math.max(1, Math.round(normalizedRegion.height * physH)),
    };

    console.log(`[ResultFlash] Starting DXGI monitor armAt=${armAt} region=${JSON.stringify(absoluteRegion)}`);

    startResultFlashMonitor({
        armAt,
        absoluteRegion,
        onDetected: () => {
            console.log('[ResultFlash] Flash detected — notifying renderer');
            if (win && !win.isDestroyed()) win.webContents.send('result-flash-detected');
        },
        onResolved: () => {
            console.log('[ResultFlash] Flash resolved — notifying renderer');
            if (win && !win.isDestroyed()) win.webContents.send('result-flash-resolved');
        },
        onDebug: (snapshot) => {
            if (win && !win.isDestroyed()) win.webContents.send('result-flash-debug', snapshot);
        },
    });
});

ipcMain.on('result-flash-stop', () => {
    console.log('[ResultFlash] Stopping DXGI monitor');
    stopResultFlashMonitor();
});
```

**Step 5: Commit**
```bash
git add electron/main.cjs
git commit -m "feat: wire DXGI result flash monitor into main process IPC (remove PowerShell geometry path)"
```

---

## Task 6: Rewrite `src/hooks/useResultFlashMonitor.ts`

**Files:**
- Modify: `src/hooks/useResultFlashMonitor.ts`

The hook goes from 354 lines to ~120. The detection state machine is gone (it lives in main process now). The hook's job is:
1. On `enabled=true` + valid `liveStartedAt`: compute `armAt` and send `result-flash-start`
2. On `enabled=false`, `triggerLatched=true`, or unmount: send `result-flash-stop`
3. Listen for `result-flash-detected`, `result-flash-resolved`, `result-flash-debug` events

Keep all existing exports that other code or tests use: `FLASH_SAMPLE_REGION`, `DEFAULT_FLASH_ARM_DELAY_MS`, `buildResultFlashSampleRegions`, `isNearWhiteSample`, `areResultFlashSamplesWhite`, the `ResultFlashMonitorDebugSnapshot` type.

**Step 1: Rewrite the hook**

```ts
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

export const DEFAULT_FLASH_ARM_DELAY_MS = 45_000;
const FLASH_WHITE_THRESHOLD = Math.ceil(255 * 0.98);

// Mirrors OBS macro ROI: X:64 Y:1013 W:107 H:21 on a 1920×1080 frame
export const FLASH_SAMPLE_REGION = {
    x: 64 / 1920,
    y: 1013 / 1080,
    width: 107 / 1920,
    height: 21 / 1080,
};

// ── Channel names ──────────────────────────────────────────────────────────
const SEND_START   = 'result-flash-start';
const SEND_STOP    = 'result-flash-stop';
const ON_DETECTED  = 'result-flash-detected';
const ON_RESOLVED  = 'result-flash-resolved';
const ON_DEBUG     = 'result-flash-debug';

// ── Re-exported types (kept for compatibility) ─────────────────────────────
export type ResultFlashMonitorDebugStatus =
    | 'disabled' | 'latched' | 'no-regions' | 'no-api'
    | 'waiting-live-start' | 'arming-delay' | 'sampling' | 'waiting-flash-end';

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

// ── Pure utility functions (preserved — used by tests and other hooks) ──────

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
    if (gameWidth && gameHeight) return { width: gameWidth, height: gameHeight };

    const virtualWidth = toPositiveDimension(deviceDisplayInfo?.virtualWidth);
    const virtualHeight = toPositiveDimension(deviceDisplayInfo?.virtualHeight);
    if (virtualWidth && virtualHeight) return { width: virtualWidth, height: virtualHeight };

    const displayWidth = toPositiveDimension(deviceDisplayInfo?.displayWidth);
    const displayHeight = toPositiveDimension(deviceDisplayInfo?.displayHeight);
    if (displayWidth && displayHeight) return { width: displayWidth, height: displayHeight };

    if (typeof window !== 'undefined' && typeof window.screen !== 'undefined') {
        const scaleFactor = Math.max(1, Number(window.devicePixelRatio) || 1);
        const screenWidth = toPositiveDimension(window.screen.width * scaleFactor);
        const screenHeight = toPositiveDimension(window.screen.height * scaleFactor);
        if (screenWidth && screenHeight) return { width: screenWidth, height: screenHeight };
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

// ── Hook ───────────────────────────────────────────────────────────────────

export function useResultFlashMonitor({
    enabled,
    liveStartedAt,
    armDelayMs = DEFAULT_FLASH_ARM_DELAY_MS,
    triggerLatched = false,
    onFlashDetected,
    onFlashResolved,
    onDebugStateChange,
}: ResultFlashMonitorOptions) {
    const onFlashDetectedRef = useRef(onFlashDetected);
    const onFlashResolvedRef = useRef(onFlashResolved);
    const onDebugStateChangeRef = useRef(onDebugStateChange);

    useEffect(() => { onFlashDetectedRef.current = onFlashDetected; }, [onFlashDetected]);
    useEffect(() => { onFlashResolvedRef.current = onFlashResolved; }, [onFlashResolved]);
    useEffect(() => { onDebugStateChangeRef.current = onDebugStateChange; }, [onDebugStateChange]);

    const normalizedArmDelayMs = Math.max(0, Number(armDelayMs) || 0);

    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;

        const shouldRun = enabled && !triggerLatched && Number.isFinite(Number(liveStartedAt)) && Number(liveStartedAt) > 0;

        if (!shouldRun) {
            api.send(SEND_STOP);
            return;
        }

        const armAt = Number(liveStartedAt) + normalizedArmDelayMs;

        api.send(SEND_START, {
            armAt,
            normalizedRegion: FLASH_SAMPLE_REGION,
        });

        const unsubDetected = api.on(ON_DETECTED, () => {
            void onFlashDetectedRef.current?.();
        });

        const unsubResolved = api.on(ON_RESOLVED, () => {
            void onFlashResolvedRef.current?.();
        });

        const unsubDebug = api.on(ON_DEBUG, (snapshot: ResultFlashMonitorDebugSnapshot) => {
            onDebugStateChangeRef.current?.(snapshot);
        });

        return () => {
            api.send(SEND_STOP);
            unsubDetected?.();
            unsubResolved?.();
            unsubDebug?.();
        };
    }, [enabled, liveStartedAt, normalizedArmDelayMs, triggerLatched]);
}
```

**Step 2: Commit**
```bash
git add src/hooks/useResultFlashMonitor.ts
git commit -m "feat: convert useResultFlashMonitor from IPC polling to event-driven (main process owns sampling loop)"
```

---

## Task 7: Update `src/hooks/__tests__/useResultFlashMonitor.test.ts`

**Files:**
- Modify: `src/hooks/__tests__/useResultFlashMonitor.test.ts`

The existing tests mock `api.invoke` and test timing — both are no longer applicable. The tests need to verify:
1. `api.send('result-flash-start', ...)` is called with correct `armAt` and `normalizedRegion`
2. `api.send('result-flash-stop')` is called on disable/unmount
3. `api.on` subscriptions are set up for detected/resolved/debug channels
4. Incoming events trigger the correct callbacks
5. Pure functions (`isNearWhiteSample`, `buildResultFlashSampleRegions`) still work correctly (these tests are unchanged)

**Step 1: Rewrite the test file**

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appStoreState = {
    deviceDisplayInfo: {
        displayWidth: 1920,
        displayHeight: 1080,
        virtualWidth: 1920,
        virtualHeight: 1080,
        aspectProfile: '16:9',
    },
    gameResolution: null as { resX: number; resY: number } | null,
};

// Capture event callbacks registered via api.on so tests can fire them
const eventListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

const sendMock = vi.fn();
const electronApiMock = {
    send: (...args: unknown[]) => sendMock(...args),
    on: (channel: string, callback: (...args: unknown[]) => void) => {
        if (!eventListeners[channel]) eventListeners[channel] = [];
        eventListeners[channel].push(callback);
        return () => {
            eventListeners[channel] = eventListeners[channel].filter(fn => fn !== callback);
        };
    },
};

// Helper: fire a main-process event into the hook
function fireEvent(channel: string, ...args: unknown[]) {
    (eventListeners[channel] ?? []).forEach(fn => fn(...args));
}

vi.mock('../../store/useAppStore', () => {
    const useAppStore = (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState);
    return { useAppStore };
});

vi.mock('../../utils/electronAPI', () => ({
    getElectronAPI: () => electronApiMock,
}));

describe('useResultFlashMonitor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
        sendMock.mockReset();
        Object.keys(eventListeners).forEach(k => delete eventListeners[k]);
        appStoreState.gameResolution = null;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('sends result-flash-start with correct armAt when enabled with a live timestamp', async () => {
        const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
        const liveStartedAt = Date.now() - 10_000;

        renderHook(() => useResultFlashMonitor({
            enabled: true,
            liveStartedAt,
            armDelayMs: 45_000,
            onFlashResolved: vi.fn(),
        }));

        expect(sendMock).toHaveBeenCalledWith('result-flash-start', {
            armAt: liveStartedAt + 45_000,
            normalizedRegion: {
                x: 64 / 1920,
                y: 1013 / 1080,
                width: 107 / 1920,
                height: 21 / 1080,
            },
        });
    });

    it('sends result-flash-stop when enabled becomes false', async () => {
        const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
        const { rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) => useResultFlashMonitor({
                enabled,
                liveStartedAt: Date.now() - 10_000,
                onFlashResolved: vi.fn(),
            }),
            { initialProps: { enabled: true } },
        );

        sendMock.mockClear();
        rerender({ enabled: false });

        expect(sendMock).toHaveBeenCalledWith('result-flash-stop');
    });

    it('sends result-flash-stop on unmount', async () => {
        const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
        const { unmount } = renderHook(() => useResultFlashMonitor({
            enabled: true,
            liveStartedAt: Date.now() - 10_000,
            onFlashResolved: vi.fn(),
        }));

        sendMock.mockClear();
        unmount();

        expect(sendMock).toHaveBeenCalledWith('result-flash-stop');
    });

    it('calls onFlashDetected when main process fires result-flash-detected', async () => {
        const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
        const onFlashDetected = vi.fn();

        renderHook(() => useResultFlashMonitor({
            enabled: true,
            liveStartedAt: Date.now() - 46_000,
            onFlashDetected,
            onFlashResolved: vi.fn(),
        }));

        await act(async () => { fireEvent('result-flash-detected'); });

        expect(onFlashDetected).toHaveBeenCalledTimes(1);
    });

    it('calls onFlashResolved when main process fires result-flash-resolved', async () => {
        const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
        const onFlashResolved = vi.fn();

        renderHook(() => useResultFlashMonitor({
            enabled: true,
            liveStartedAt: Date.now() - 46_000,
            onFlashResolved,
        }));

        await act(async () => { fireEvent('result-flash-resolved'); });

        expect(onFlashResolved).toHaveBeenCalledTimes(1);
    });

    it('does not send result-flash-start when triggerLatched is true', async () => {
        const { useResultFlashMonitor } = await import('../useResultFlashMonitor');

        renderHook(() => useResultFlashMonitor({
            enabled: true,
            liveStartedAt: Date.now() - 46_000,
            triggerLatched: true,
            onFlashResolved: vi.fn(),
        }));

        expect(sendMock).not.toHaveBeenCalledWith('result-flash-start', expect.anything());
    });

    it('does not send result-flash-start when liveStartedAt is null', async () => {
        const { useResultFlashMonitor } = await import('../useResultFlashMonitor');

        renderHook(() => useResultFlashMonitor({
            enabled: true,
            liveStartedAt: null,
            onFlashResolved: vi.fn(),
        }));

        expect(sendMock).not.toHaveBeenCalledWith('result-flash-start', expect.anything());
    });

    // ── Pure function tests (unchanged from original) ──────────────────────

    it('accepts samples at the OBS-like brightness threshold and rejects samples just below it', async () => {
        const { isNearWhiteSample } = await import('../useResultFlashMonitor');
        expect(isNearWhiteSample({ avgR: 250, avgG: 250, avgB: 250 })).toBe(true);
        expect(isNearWhiteSample({ avgR: 249, avgG: 249, avgB: 249 })).toBe(false);
    });

    it('builds the OBS-style bottom-left ROI from normalized 1920×1080 coordinates', async () => {
        const { buildResultFlashSampleRegions, FLASH_SAMPLE_REGION } = await import('../useResultFlashMonitor');
        expect(FLASH_SAMPLE_REGION).toEqual({
            x: 64 / 1920,
            y: 1013 / 1080,
            width: 107 / 1920,
            height: 21 / 1080,
        });
        expect(buildResultFlashSampleRegions({ resX: 1920, resY: 1080 }, null))
            .toEqual([{ x: 64, y: 1013, width: 107, height: 21 }]);
    });
});
```

**Step 2: Run the full test suite**
```bash
cd "N:\Coding (backup)"
npx vitest run
```
Expected: all existing tests pass, new tests pass.

**Step 3: Commit**
```bash
git add src/hooks/__tests__/useResultFlashMonitor.test.ts
git commit -m "test: rewrite useResultFlashMonitor tests for event-driven IPC architecture"
```

---

## Task 8: Smoke Test (Manual)

**Step 1: Build and launch the app**
```bash
npm run dev
```

**Step 2: Open DevTools console in the Electron window and verify**

You should see on startup:
```
[ResultFlash] Screen metrics: physW=1920 physH=1080  (or your resolution)
```

When a match starts (or when you manually send the IPC from DevTools):
```
electronAPI.send('result-flash-start', { armAt: Date.now(), normalizedRegion: { x: 64/1920, y: 1013/1080, width: 107/1920, height: 21/1080 } })
```

In the main process console you should see:
```
[ResultFlash] Starting DXGI monitor armAt=... region={"x":64,"y":1013,"width":107,"height":21}
```

**Step 3: Verify debug events reach the renderer**

In DevTools console:
```js
electronAPI.on('result-flash-debug', (snap) => console.log('debug:', snap))
```

You should see snapshots arriving with `status: 'sampling'` or `status: 'arming-delay'`.

**Step 4: Check log output during a real practice range match**

Look for:
- `[ResultFlash] Starting DXGI monitor` — confirms monitor is armed
- Sampling status in debug events — confirms 100ms intervals are maintained
- `[ResultFlash] Flash detected` — confirms the flash was caught
- No `[GameWindow]` or `[PowerShell]` log lines in the flash monitor path

**Step 5: Final commit if any fixups were needed**
```bash
git add -p
git commit -m "fix: <describe any fixups found during smoke test>"
```

---

## Summary of Changes

| File | Action |
|---|---|
| `package.json` | Add `node-screenshots` dependency |
| `electron/dxgiSampler.cjs` | **New** — DXGI region sampler |
| `electron/resultFlashMonitor.cjs` | **New** — main-process detection loop |
| `electron/preload.cjs` | Update IPC channel allowlists |
| `electron/main.cjs` | Remove `sampleResultFlashRegion`, wire new handlers |
| `src/hooks/useResultFlashMonitor.ts` | Replace polling loop with event listener |
| `src/hooks/__tests__/useResultFlashMonitor.test.ts` | Rewrite for new IPC contract |
| `src/hooks/__tests__/resultFlashMonitor.test.ts` | **New** — unit tests for detection state machine |
