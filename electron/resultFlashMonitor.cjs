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
const MIN_PRE_ARM_FLASHES_TO_SKIP = 1;
// Known pure-white duration of the result flash. Used to schedule the capture
// precisely at flash-end rather than mid-flash.
const KNOWN_FLASH_PURE_WHITE_MS = 541;
// Minimum / maximum plausible flash durations for validation.
// A "flash" that resolves in under 200ms or runs longer than 900ms is not the result flash.
const FLASH_MIN_VALID_DURATION_MS = 200;
const FLASH_MAX_VALID_DURATION_MS = 900;

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
    preArmFlashCount: _state.preArmFlashCount,
    minPreArmFlashesToSkip: MIN_PRE_ARM_FLASHES_TO_SKIP,
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

function getSamplingStatus(state) {
  return state.waitingForFlashEnd
    ? 'waiting-flash-end'
    : (Date.now() < state.armAt ? 'arming-delay' : 'sampling');
}

async function pollOnce() {
  const state = _state;
  if (!state || state.pollInFlight) return;

  const now = Date.now();
  if (!state.waitingForFlashEnd && now >= state.armAt && now < state.cooldownUntil) {
    state.lastUpdatedAt = now;
    emitDebug('sampling');
    return;
  }

  state.pollInFlight = true;
  state.lastUpdatedAt = now;
  emitDebug(getSamplingStatus(state));

  try {
    const sample = await state.sampler(state.absoluteRegion);
    if (_state !== state) return;

    const normalizedSample = attachSampleMeta(sample, state.absoluteRegion);
    state.lastSampleResult = normalizedSample;
    state.lastUpdatedAt = Date.now();

    if (!normalizedSample.success) {
      state.lastIsWhiteFrame = null;
      emitDebug(getSamplingStatus(state));
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
        // Bail early if the flash has run way past the expected duration —
        // it's not a result flash and we shouldn't act on it.
        const flashDuration = state.lastUpdatedAt - (state.brightSinceMs ?? state.lastUpdatedAt);
        if (flashDuration > FLASH_MAX_VALID_DURATION_MS) {
          state.waitingForFlashEnd = false;
          state.brightSinceMs = null;
          state.flashNotified = false;
          state.cooldownUntil = 0;
          emitDebug(getSamplingStatus(state));
          return;
        }
        emitDebug('waiting-flash-end');
        return;
      }

      const hadNotifiedFlash = state.flashNotified === true;
      const flashDuration = state.lastUpdatedAt - (state.brightSinceMs ?? state.lastUpdatedAt);
      const isValidDuration = flashDuration >= FLASH_MIN_VALID_DURATION_MS
        && flashDuration <= FLASH_MAX_VALID_DURATION_MS;
      state.waitingForFlashEnd = false;
      state.brightSinceMs = null;
      state.flashNotified = false;
      if (hadNotifiedFlash && isValidDuration) {
        state.onResolved?.();
      }
      emitDebug(getSamplingStatus(state));
      return;
    }

    if (isWhiteFrame) {
      if (state.brightSinceMs == null) {
        state.brightSinceMs = state.lastUpdatedAt;
      }

      if ((state.lastUpdatedAt - state.brightSinceMs) >= FLASH_BRIGHT_HOLD_MS) {
        const flashStartedBeforeArm = state.brightSinceMs < state.armAt;
        state.waitingForFlashEnd = true;
        if (flashStartedBeforeArm && state.preArmFlashCount < MIN_PRE_ARM_FLASHES_TO_SKIP) {
          state.preArmFlashCount += 1;
          emitDebug('waiting-flash-end');
          return;
        }
        if (state.lastUpdatedAt >= state.armAt && !state.flashNotified) {
          state.flashNotified = true;
          state.cooldownUntil = state.lastUpdatedAt + FLASH_COOLDOWN_MS;
          // Pass brightSinceMs so the renderer can calculate how much of the
          // 541ms flash has already elapsed and schedule capture at flash-end.
          state.onDetected?.({ brightSinceMs: state.brightSinceMs });
        }
        emitDebug('waiting-flash-end');
        return;
      }

      emitDebug('sampling');
      return;
    }

    state.brightSinceMs = null;
    state.flashNotified = false;
    emitDebug(getSamplingStatus(state));
  } catch (error) {
    if (_state !== state) return;

    state.lastSampleResult = attachSampleMeta({
      success: false,
      error: error?.message || 'DXGI sample failed',
    }, state.absoluteRegion);
    state.lastIsWhiteFrame = null;
    state.lastUpdatedAt = Date.now();
    emitDebug(getSamplingStatus(state));
  } finally {
    if (_state === state) {
      state.pollInFlight = false;
      state.lastUpdatedAt = Date.now();
      emitDebug(getSamplingStatus(state));
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
    preArmFlashCount: 0,
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
  KNOWN_FLASH_PURE_WHITE_MS,
};
