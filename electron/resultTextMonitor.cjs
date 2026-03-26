'use strict';

const { sampleBoxes: dxgiSampleBoxes } = require('./dxgiSampler.cjs');

const DEFAULT_SAMPLE_INTERVAL_MS = 100;
const TEXT_TRIPWIRE_SUSTAIN_MS = 300;
const TRIPWIRE_BASELINE_ALPHA = 0.18;
const TRIPWIRE_MIN_CONSECUTIVE_HITS = Math.max(1, Math.ceil(TEXT_TRIPWIRE_SUSTAIN_MS / DEFAULT_SAMPLE_INTERVAL_MS));
const TRIPWIRE_MIN_BOX_WHITE_RATIO = 0.09;
const TRIPWIRE_MIN_BOX_WHITE_DELTA = 0.045;
const TRIPWIRE_MIN_TOTAL_WHITE_DELTA = 0.045;
const TRIPWIRE_WHITE_MIN_CHANNEL = 240;
const TRIPWIRE_WHITE_MAX_DRIFT = 30;

// Three horizontal sub-boxes within the result-headline region.
// A samples the lower part of the left headline slot where shifted placement text settles,
// while B+C track the centered headline text more tightly.
// Relative coords within RESULT_TEXT_SAMPLE_REGION (left=0.2489, width=0.3991).
const TRIPWIRE_BOX_LAYOUT = Object.freeze([
  { id: 'result-a', left: 0.0501, top: 0.6434, width: 0.2571, height: 0.3566 },
  { id: 'result-b', left: 0.4357, top: 0.2868, width: 0.2571, height: 0.7132 },
  { id: 'result-c', left: 0.6928, top: 0.2868, width: 0.2571, height: 0.7132 },
]);

let _timer = null;
let _state = null;
let _sharp = null;

function getSharp() {
  if (_sharp) return _sharp;
  _sharp = require('sharp');
  return _sharp;
}

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

function normalizeTripwireBox(box, imageWidth, imageHeight) {
  const left = Math.max(0, Math.min(imageWidth - 1, Math.floor(box.left * imageWidth)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.floor(box.top * imageHeight)));
  const width = Math.max(1, Math.min(imageWidth - left, Math.floor(box.width * imageWidth)));
  const height = Math.max(1, Math.min(imageHeight - top, Math.floor(box.height * imageHeight)));

  return {
    id: box.id,
    left,
    top,
    width,
    height,
  };
}

function createTripwireBaseline(metrics) {
  return metrics.map((metric) => metric.whiteRatio);
}

function createColdTripwireBaseline(metrics) {
  return metrics.map(() => 0);
}

function updateTripwireBaseline(currentBaseline, metrics) {
  if (!Array.isArray(currentBaseline) || currentBaseline.length !== metrics.length) {
    return createTripwireBaseline(metrics);
  }

  return metrics.map((metric, index) => {
    const previous = Number(currentBaseline[index] || 0);
    return (previous * (1 - TRIPWIRE_BASELINE_ALPHA)) + (metric.whiteRatio * TRIPWIRE_BASELINE_ALPHA);
  });
}

function buildTripwireSnapshot(metrics, baseline) {
  const boxMetrics = metrics.map((metric, index) => {
    const whiteRatio = Number(metric.whiteRatio || 0);
    const avgBrightness = Number(metric.avgBrightness || 0);
    const baselineWhiteRatio = Number(Array.isArray(baseline) ? baseline[index] || 0 : 0);
    const whiteDelta = Math.max(0, whiteRatio - baselineWhiteRatio);
    const active = whiteRatio >= TRIPWIRE_MIN_BOX_WHITE_RATIO
      && whiteDelta >= TRIPWIRE_MIN_BOX_WHITE_DELTA;

    return {
      id: metric.id,
      whiteRatio,
      avgBrightness,
      baselineWhiteRatio,
      whiteDelta,
      active,
    };
  });

  const activeBoxCount = boxMetrics.reduce((count, metric) => count + (metric.active ? 1 : 0), 0);
  const totalWhiteDelta = boxMetrics.reduce((sum, metric) => sum + metric.whiteDelta, 0);
  const activeBoxIds = new Set(
    boxMetrics
      .filter((metric) => metric.active)
      .map((metric) => metric.id)
  );
  const leftAlignedTriggered = activeBoxIds.has('result-a');
  const centeredTriggered = activeBoxIds.has('result-b') && activeBoxIds.has('result-c');

  return {
    triggered: (leftAlignedTriggered || centeredTriggered)
      && totalWhiteDelta >= TRIPWIRE_MIN_TOTAL_WHITE_DELTA,
    activeBoxCount,
    totalWhiteDelta,
    boxes: boxMetrics,
  };
}

async function analyzeTripwireBoxes(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('Result text tripwire image buffer is unavailable');
  }

  const sharp = getSharp();
  const { data, info } = await sharp(imageBuffer, { failOn: 'none' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const imageWidth = Number(info?.width || 0);
  const imageHeight = Number(info?.height || 0);
  const channels = Number(info?.channels || 0);
  if (imageWidth <= 0 || imageHeight <= 0 || channels < 3) {
    throw new Error('Result text tripwire image metadata is invalid');
  }

  const boxes = TRIPWIRE_BOX_LAYOUT.map((box) => normalizeTripwireBox(box, imageWidth, imageHeight));

  return boxes.map((box) => {
    let brightPixelCount = 0;
    let brightnessSum = 0;

    for (let y = box.top; y < (box.top + box.height); y += 1) {
      for (let x = box.left; x < (box.left + box.width); x += 1) {
        const offset = ((y * imageWidth) + x) * channels;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);

        if (minChannel >= TRIPWIRE_WHITE_MIN_CHANNEL && (maxChannel - minChannel) <= TRIPWIRE_WHITE_MAX_DRIFT) {
          brightPixelCount += 1;
        }

        brightnessSum += (r + g + b) / 3;
      }
    }

    const pixelCount = Math.max(1, box.width * box.height);

    return {
      id: box.id,
      whiteRatio: brightPixelCount / pixelCount,
      avgBrightness: brightnessSum / pixelCount,
    };
  });
}

function createDebugSnapshot(status, overrides = {}) {
  if (!_state) return null;

  return {
    status,
    armAt: _state.armAt,
    armRemainingMs: Math.max(0, _state.armAt - Date.now()),
    sampleIntervalMs: _state.intervalMs,
    captureRegion: _state.captureRegion,
    absoluteRegion: _state.absoluteRegion,
    detected: _state.detected,
    lastRecognizedText: _state.lastRecognizedText,
    lastSignal: _state.lastSignal,
    lastError: _state.lastError,
    lastTripwireActiveBoxCount: _state.lastTripwire?.activeBoxCount || 0,
    lastTripwireTotalWhiteDelta: _state.lastTripwire?.totalWhiteDelta || 0,
    lastTripwireBoxes: _state.lastTripwire?.boxes || [],
    lastUpdatedAt: _state.lastUpdatedAt,
    ...overrides,
  };
}

function emitDebug(status, overrides = {}) {
  if (!_state?.onDebug) return;
  const snapshot = createDebugSnapshot(status, overrides);
  if (!snapshot) return;
  _state.onDebug(snapshot);
}

function createTripwireDetectionPayload(state) {
  const activeBoxes = Array.isArray(state?.lastTripwire?.boxes)
    ? state.lastTripwire.boxes.filter((box) => box?.active)
    : [];

  return {
    detectionMethod: 'text',
    result: null,
    armAt: state.armAt,
    detectedAt: state.lastUpdatedAt,
    captureRegion: state.captureRegion,
    activeBoxIds: activeBoxes
      .map((box) => (typeof box?.id === 'string' ? box.id : ''))
      .filter(Boolean),
    tripwireActiveBoxCount: Number(state?.lastTripwire?.activeBoxCount || 0),
    tripwireTotalWhiteDelta: Number(state?.lastTripwire?.totalWhiteDelta || 0),
  };
}

async function pollOnce() {
  const state = _state;
  if (!state || state.pollInFlight || state.detected) return;

  state.pollInFlight = true;
  state.lastUpdatedAt = Date.now();
  emitDebug(Date.now() < state.armAt ? 'arming-delay' : 'sampling');

  try {
    const boxMetrics = await state.sampler(state.absoluteRegion);
    if (_state !== state) return;
    if (!Array.isArray(boxMetrics) || boxMetrics.length === 0) {
      throw new Error('Result text sampler returned no tripwire metrics');
    }
    const isArmed = Date.now() >= state.armAt;

    if (!state.bootstrapHotStart && (!Array.isArray(state.baselineWhiteRatios) || state.baselineWhiteRatios.length !== boxMetrics.length)) {
      // If the first armed frame already contains the result headline, seeding the
      // baseline from that hot frame makes the signal invisible forever. Bootstrap
      // those runs against a cold baseline until the text either latches or cools off.
      if (isArmed) {
        const coldBaseline = createColdTripwireBaseline(boxMetrics);
        const bootstrapTripwire = buildTripwireSnapshot(boxMetrics, coldBaseline);

        if (bootstrapTripwire.triggered) {
          state.bootstrapHotStart = true;
          state.lastTripwire = bootstrapTripwire;
          state.tripwireConsecutiveHits = 1;
          state.lastUpdatedAt = Date.now();
          emitDebug('sampling');
          return;
        }
      }

      state.baselineWhiteRatios = createTripwireBaseline(boxMetrics);
      state.bootstrapHotStart = false;
      state.lastTripwire = buildTripwireSnapshot(boxMetrics, state.baselineWhiteRatios);
      state.tripwireConsecutiveHits = 0;
      state.lastUpdatedAt = Date.now();
      emitDebug(isArmed ? 'sampling' : 'arming-delay');
      return;
    }

    if (!isArmed) {
      state.baselineWhiteRatios = updateTripwireBaseline(state.baselineWhiteRatios, boxMetrics);
      state.lastTripwire = buildTripwireSnapshot(boxMetrics, state.baselineWhiteRatios);
      state.tripwireConsecutiveHits = 0;
      state.lastUpdatedAt = Date.now();
      emitDebug('arming-delay');
      return;
    }

    if (state.bootstrapHotStart) {
      const bootstrapTripwire = buildTripwireSnapshot(boxMetrics, createColdTripwireBaseline(boxMetrics));
      state.lastTripwire = bootstrapTripwire;

      if (bootstrapTripwire.triggered) {
        state.tripwireConsecutiveHits += 1;

        if (state.tripwireConsecutiveHits >= TRIPWIRE_MIN_CONSECUTIVE_HITS) {
          state.detected = true;
          state.lastSignal = createTripwireDetectionPayload(state);
          state.lastUpdatedAt = Date.now();
          state.onDetected?.(state.lastSignal);
          emitDebug('detected');
          return;
        }
      } else {
        state.bootstrapHotStart = false;
        state.baselineWhiteRatios = createTripwireBaseline(boxMetrics);
        state.lastTripwire = buildTripwireSnapshot(boxMetrics, state.baselineWhiteRatios);
        state.tripwireConsecutiveHits = 0;
      }

      state.lastUpdatedAt = Date.now();
      emitDebug('sampling');
      return;
    }

    const tripwire = buildTripwireSnapshot(boxMetrics, state.baselineWhiteRatios);
    state.lastTripwire = tripwire;

    if (tripwire.triggered) {
      state.tripwireConsecutiveHits += 1;

      if (state.tripwireConsecutiveHits >= TRIPWIRE_MIN_CONSECUTIVE_HITS) {
        state.detected = true;
        state.lastSignal = createTripwireDetectionPayload(state);
        state.lastUpdatedAt = Date.now();
        state.onDetected?.(state.lastSignal);
        emitDebug('detected');
        return;
      }
    } else {
      state.tripwireConsecutiveHits = 0;
      state.baselineWhiteRatios = updateTripwireBaseline(state.baselineWhiteRatios, boxMetrics);
      state.lastTripwire = buildTripwireSnapshot(boxMetrics, state.baselineWhiteRatios);
    }

    state.lastUpdatedAt = Date.now();
    emitDebug('sampling');
  } catch (error) {
    if (_state !== state) return;

    state.lastError = error?.message || 'Result text tripwire failed';
    state.lastUpdatedAt = Date.now();
    emitDebug(Date.now() < state.armAt ? 'arming-delay' : 'sampling');
  } finally {
    if (_state === state) {
      state.pollInFlight = false;
      state.lastUpdatedAt = Date.now();
      emitDebug(state.detected ? 'detected' : (Date.now() < state.armAt ? 'arming-delay' : 'sampling'));
    }
  }
}

function startResultTextMonitor({
  armAt = 0,
  intervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  captureRegion = null,
  absoluteRegion = null,
  onDetected,
  onDebug,
  _sampler,
} = {}) {
  stopResultTextMonitor();

  const normalizedAbsoluteRegion = normalizeAbsoluteRegion(absoluteRegion);
  const sampler = typeof _sampler === 'function'
    ? _sampler
    : async (region) => {
      const sample = await dxgiSampleBoxes({
        ...region,
        boxes: TRIPWIRE_BOX_LAYOUT,
        whiteMinChannel: TRIPWIRE_WHITE_MIN_CHANNEL,
        whiteMaxDrift: TRIPWIRE_WHITE_MAX_DRIFT,
      });
      if (!sample?.success) {
        throw new Error(sample?.error || 'DXGI tripwire sample failed');
      }
      return Array.isArray(sample?.data?.boxes) ? sample.data.boxes : [];
    };
  const safeIntervalMs = Math.max(100, Math.round(Number(intervalMs) || DEFAULT_SAMPLE_INTERVAL_MS));

  if (!normalizedAbsoluteRegion || typeof sampler !== 'function') {
    return false;
  }

  _state = {
    armAt: Number.isFinite(Number(armAt)) ? Math.round(Number(armAt)) : 0,
    intervalMs: safeIntervalMs,
    captureRegion,
    absoluteRegion: normalizedAbsoluteRegion,
    sampler,
    onDetected,
    onDebug,
    detected: false,
    pollInFlight: false,
    lastRecognizedText: '',
    lastSignal: null,
    lastError: null,
    lastTripwire: null,
    tripwireConsecutiveHits: 0,
    baselineWhiteRatios: null,
    bootstrapHotStart: false,
    lastUpdatedAt: Date.now(),
  };

  emitDebug(Date.now() < _state.armAt ? 'arming-delay' : 'sampling');
  void pollOnce();
  _timer = setInterval(() => {
    void pollOnce();
  }, safeIntervalMs);
  return true;
}

function stopResultTextMonitor() {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
  _state = null;
}

const __test__ = {
  analyzeTripwireBoxes,
  buildTripwireSnapshot,
  createTripwireBaseline,
  createTripwireDetectionPayload,
  TRIPWIRE_BOX_LAYOUT,
  updateTripwireBaseline,
};

module.exports = {
  startResultTextMonitor,
  stopResultTextMonitor,
  __test__,
};
