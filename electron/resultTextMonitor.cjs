'use strict';

const { cropImageBuffer } = require('./resultCaptureHelper.cjs');

const DEFAULT_SAMPLE_INTERVAL_MS = 500;
const TRIPWIRE_BASELINE_ALPHA = 0.18;
const TRIPWIRE_MIN_CONSECUTIVE_HITS = 2;
const TRIPWIRE_MIN_ACTIVE_BOXES = 2;
const TRIPWIRE_MIN_BOX_WHITE_RATIO = 0.015;
const TRIPWIRE_MIN_BOX_WHITE_DELTA = 0.0075;
const TRIPWIRE_MIN_TOTAL_WHITE_DELTA = 0.02;
const TRIPWIRE_WHITE_MIN_CHANNEL = 210;
const TRIPWIRE_WHITE_MAX_DRIFT = 30;
const OCR_CONFIRM_COOLDOWN_MS = 1_000;

const TRIPWIRE_BOX_LAYOUT = Object.freeze([
  { id: 'center-a', left: 0.34, top: 0.04, width: 0.16, height: 0.24 },
  { id: 'center-b', left: 0.52, top: 0.04, width: 0.16, height: 0.24 },
  { id: 'left-a', left: 0.06, top: 0.28, width: 0.18, height: 0.24 },
  { id: 'left-b', left: 0.26, top: 0.28, width: 0.18, height: 0.24 },
  { id: 'left-c', left: 0.46, top: 0.28, width: 0.18, height: 0.24 },
]);

let _timer = null;
let _state = null;
let _defaultRecognizer = null;
let _sharp = null;

function getDefaultRecognizer() {
  if (_defaultRecognizer) return _defaultRecognizer;
  _defaultRecognizer = require('./paddleOcrHandler.cjs').paddleRecognizeBuffer;
  return _defaultRecognizer;
}

function getSharp() {
  if (_sharp) return _sharp;
  _sharp = require('sharp');
  return _sharp;
}

function normalizeRecognizedText(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function parsePlacementFromText(text) {
  const normalized = normalizeRecognizedText(text);
  const compact = normalized.replace(/\s+/g, '');

  let match = compact.match(/([1-5])(ST|ND|RD|TH)PLACE/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }

  match = compact.match(/([1-5])(ST|ND|RD|TH)/);
  if (match && (compact.includes('PLACE') || compact.includes('PLACEMENT'))) {
    return Number.parseInt(match[1], 10);
  }

  match = normalized.match(/\b([1-5])(ST|ND|RD|TH)\b/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }

  return undefined;
}

function detectResultTextSignal(text) {
  const normalized = normalizeRecognizedText(text);
  const compact = normalized.replace(/\s+/g, '');
  const placement = parsePlacementFromText(normalized);

  const hasVictory = compact.includes('VICTORY') || compact.includes('VICTOR');
  const hasDefeat = compact.includes('DEFEAT');
  const hasEliminated = compact.includes('ELIMINATED');
  const hasPlacementKeyword = compact.includes('PLACE')
    || compact.includes('PLACEMENT')
    || placement != null;

  const detected = hasVictory || hasDefeat || hasEliminated || hasPlacementKeyword;
  let result = null;
  let winType;

  if (hasVictory) {
    result = 'Win';
    winType = compact.includes('ARTIFACT') ? 'artifact' : 'combat';
  } else if (hasDefeat || hasEliminated || hasPlacementKeyword) {
    result = 'Loss';
    winType = compact.includes('ARTIFACT') ? 'artifact' : 'combat';
  }

  return {
    detected,
    detectionMethod: 'text',
    result,
    winType,
    placement,
    text: normalized,
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

  return {
    triggered: activeBoxCount >= TRIPWIRE_MIN_ACTIVE_BOXES
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

async function confirmRecognizedResult(state, cropBuffer) {
  const recognizedText = await state.recognizer(cropBuffer);
  const signal = detectResultTextSignal(recognizedText);

  state.lastRecognizedText = String(recognizedText || '');
  state.lastSignal = signal;
  state.lastUpdatedAt = Date.now();

  if (!signal.detected || state.detected) {
    return false;
  }

  state.detected = true;
  state.onDetected?.({
    ...signal,
    armAt: state.armAt,
    captureRegion: state.captureRegion,
    detectedAt: state.lastUpdatedAt,
  });
  emitDebug('detected');
  return true;
}

async function pollOnce() {
  const state = _state;
  if (!state || state.pollInFlight || state.detected) return;

  state.pollInFlight = true;
  state.lastUpdatedAt = Date.now();
  emitDebug(Date.now() < state.armAt ? 'arming-delay' : 'sampling');

  try {
    const sampled = await state.sampler(state.captureRegion);
    if (_state !== state) return;

    if (!Buffer.isBuffer(sampled) || sampled.length === 0) {
      throw new Error('Result text sampler returned an empty buffer');
    }

    const cropBuffer = state.captureRegion
      ? await cropImageBuffer(sampled, state.captureRegion)
      : sampled;

    const boxMetrics = await state.tripwireAnalyzer(cropBuffer);
    const isArmed = Date.now() >= state.armAt;

    if (!Array.isArray(state.baselineWhiteRatios) || state.baselineWhiteRatios.length !== boxMetrics.length) {
      state.baselineWhiteRatios = createTripwireBaseline(boxMetrics);
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

    const tripwire = buildTripwireSnapshot(boxMetrics, state.baselineWhiteRatios);
    state.lastTripwire = tripwire;

    if (tripwire.triggered) {
      state.tripwireConsecutiveHits += 1;

      if (
        state.tripwireConsecutiveHits >= TRIPWIRE_MIN_CONSECUTIVE_HITS
        && Date.now() >= state.ocrCooldownUntil
      ) {
        state.ocrCooldownUntil = Date.now() + OCR_CONFIRM_COOLDOWN_MS;
        const confirmed = await confirmRecognizedResult(state, cropBuffer);
        if (confirmed) {
          return;
        }
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
  onDetected,
  onDebug,
  _sampler,
  _recognizer,
  _tripwireAnalyzer,
} = {}) {
  stopResultTextMonitor();

  const sampler = typeof _sampler === 'function' ? _sampler : null;
  const recognizer = typeof _recognizer === 'function' ? _recognizer : getDefaultRecognizer();
  const tripwireAnalyzer = typeof _tripwireAnalyzer === 'function'
    ? _tripwireAnalyzer
    : analyzeTripwireBoxes;
  const safeIntervalMs = Math.max(100, Math.round(Number(intervalMs) || DEFAULT_SAMPLE_INTERVAL_MS));

  if (!sampler || typeof recognizer !== 'function' || typeof tripwireAnalyzer !== 'function') {
    return false;
  }

  _state = {
    armAt: Number.isFinite(Number(armAt)) ? Math.round(Number(armAt)) : 0,
    intervalMs: safeIntervalMs,
    captureRegion,
    sampler,
    recognizer,
    tripwireAnalyzer,
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
    ocrCooldownUntil: 0,
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
  detectResultTextSignal,
  normalizeRecognizedText,
  parsePlacementFromText,
  TRIPWIRE_BOX_LAYOUT,
  updateTripwireBaseline,
};

module.exports = {
  startResultTextMonitor,
  stopResultTextMonitor,
  __test__,
};
