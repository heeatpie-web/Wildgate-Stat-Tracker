/**
 * @module resultFlashMonitor
 * Main-process result flash detection loop.
 *
 * The monitor samples a fixed absolute region via DXGI every 100ms, waits for
 * a sustained white flash, then notifies the renderer once for detection and
 * once more when the flash resolves.
 */

const { sampleRegion: dxgiSampleRegion } = require('./dxgiSampler.cjs');

const FLASH_SAMPLE_INTERVAL_MS = 100;
// The result-screen flash ramps up and down quickly, so two consecutive samples
// at roughly 90% brightness are enough to count as a real flash.
const FLASH_BRIGHT_HOLD_MS = 100;
const FLASH_WHITE_THRESHOLD = Math.ceil(255 * 0.9);
const FLASH_COOLDOWN_MS = 15_000;

let _timer = null;
let _state = null;

function normalizeAbsoluteRegion(region) {
  const x = Number(region?.x);
  const y = Number(region?.y);
  const width = Number(region?.width);
  const height = Number(region?.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function createSampleMeta(absoluteRegion) {
  return {
    source: 'primary-display',
    absoluteRegion: {
      x: Math.round(Number(absoluteRegion?.x) || 0),
      y: Math.round(Number(absoluteRegion?.y) || 0),
      width: Math.round(Number(absoluteRegion?.width) || 0),
      height: Math.round(Number(absoluteRegion?.height) || 0),
    },
  };
}

function attachSampleMeta(sample, absoluteRegion) {
  const meta = createSampleMeta(absoluteRegion);
  if (sample?.success) {
    return {
      success: true,
      data: sample.data,
      meta,
    };
  }
  return {
    success: false,
    error: sample?.error || 'DXGI sample failed',
    meta,
  };
}

function buildDebugSnapshot(status, overrides = {}) {
  if (!_state) return null;

  return {
    status,
    armAt: _state.armAt,
    armRemainingMs: Math.max(0, _state.armAt - Date.now()),
    absoluteRegion: _state.absoluteRegion,
    sampleIntervalMs: FLASH_SAMPLE_INTERVAL_MS,
    brightHoldMs: FLASH_BRIGHT_HOLD_MS,
    whiteThreshold: FLASH_WHITE_THRESHOLD,
    brightSinceMs: _state.brightSinceMs,
    waitingForFlashEnd: _state.waitingForFlashEnd,
    flashNotified: _state.flashNotified,
    pollInFlight: _state.pollInFlight,
    lastSampleResult: _state.lastSampleResult,
    lastSampleMeta: _state.lastSampleResult?.meta ?? null,
    lastIsWhiteFrame: _state.lastIsWhiteFrame,
    lastUpdatedAt: _state.lastUpdatedAt,
    ...overrides,
  };
}

function emitDebug(status, overrides = {}) {
  if (!_state?.onDebug) return;
  const snapshot = buildDebugSnapshot(status, overrides);
  if (!snapshot) return;
  _state.onDebug(snapshot);
}

async function pollOnce() {
  const state = _state;
  if (!state || state.pollInFlight) return;

  const now = Date.now();
  if (now < state.armAt) {
    state.lastUpdatedAt = now;
    emitDebug('arming-delay');
    return;
  }

  if (!state.waitingForFlashEnd && now < state.cooldownUntil) {
    state.lastUpdatedAt = now;
    emitDebug('sampling');
    return;
  }

  state.pollInFlight = true;
  state.lastUpdatedAt = now;
  emitDebug(state.waitingForFlashEnd ? 'waiting-flash-end' : 'sampling');

  try {
    const sample = await state.sampler(state.absoluteRegion);
    if (_state !== state) return;

    const normalizedSample = attachSampleMeta(sample, state.absoluteRegion);
    state.lastSampleResult = normalizedSample;
    state.lastUpdatedAt = Date.now();

    if (!normalizedSample.success) {
      state.lastIsWhiteFrame = null;
      emitDebug(state.waitingForFlashEnd ? 'waiting-flash-end' : 'sampling');
      return;
    }

    const avgBrightness = (
      Number(normalizedSample.data.avgR || 0)
      + Number(normalizedSample.data.avgG || 0)
      + Number(normalizedSample.data.avgB || 0)
    ) / 3;
    const isWhiteFrame = avgBrightness >= FLASH_WHITE_THRESHOLD;
    state.lastIsWhiteFrame = isWhiteFrame;

    if (state.waitingForFlashEnd) {
      if (isWhiteFrame) {
        emitDebug('waiting-flash-end');
        return;
      }

      state.waitingForFlashEnd = false;
      state.brightSinceMs = null;
      state.flashNotified = false;
      state.onResolved?.();
      emitDebug('sampling');
      return;
    }

    if (isWhiteFrame) {
      if (state.brightSinceMs == null) {
        state.brightSinceMs = state.lastUpdatedAt;
      }

      if ((state.lastUpdatedAt - state.brightSinceMs) >= FLASH_BRIGHT_HOLD_MS) {
        state.waitingForFlashEnd = true;
        if (!state.flashNotified) {
          state.flashNotified = true;
          state.cooldownUntil = state.lastUpdatedAt + FLASH_COOLDOWN_MS;
          state.onDetected?.();
        }
        emitDebug('waiting-flash-end');
        return;
      }

      emitDebug('sampling');
      return;
    }

    state.brightSinceMs = null;
    state.flashNotified = false;
    emitDebug('sampling');
  } catch (error) {
    if (_state !== state) return;

    state.lastSampleResult = attachSampleMeta({
      success: false,
      error: error?.message || 'DXGI sample failed',
    }, state.absoluteRegion);
    state.lastIsWhiteFrame = null;
    state.lastUpdatedAt = Date.now();
    emitDebug(state.waitingForFlashEnd ? 'waiting-flash-end' : 'sampling');
  } finally {
    if (_state === state) {
      state.pollInFlight = false;
      state.lastUpdatedAt = Date.now();
      emitDebug(state.waitingForFlashEnd ? 'waiting-flash-end' : 'sampling');
    }
  }
}

function startResultFlashMonitor({
  armAt,
  absoluteRegion,
  onDetected,
  onResolved,
  onDebug,
  _sampler,
} = {}) {
  stopResultFlashMonitor();

  const normalizedRegion = normalizeAbsoluteRegion(absoluteRegion);
  if (!normalizedRegion) {
    return false;
  }

  _state = {
    armAt: Number.isFinite(Number(armAt)) ? Math.round(Number(armAt)) : 0,
    absoluteRegion: normalizedRegion,
    onDetected,
    onResolved,
    onDebug,
    sampler: typeof _sampler === 'function' ? _sampler : dxgiSampleRegion,
    brightSinceMs: null,
    waitingForFlashEnd: false,
    flashNotified: false,
    pollInFlight: false,
    cooldownUntil: 0,
    lastSampleResult: null,
    lastIsWhiteFrame: null,
    lastUpdatedAt: Date.now(),
  };

  emitDebug(Date.now() < _state.armAt ? 'arming-delay' : 'sampling');
  void pollOnce();
  _timer = setInterval(() => {
    void pollOnce();
  }, FLASH_SAMPLE_INTERVAL_MS);
  return true;
}

function stopResultFlashMonitor() {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
  _state = null;
}

module.exports = {
  startResultFlashMonitor,
  stopResultFlashMonitor,
};
