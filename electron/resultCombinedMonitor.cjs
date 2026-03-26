'use strict';

/**
 * @module resultCombinedMonitor
 * Single-poll combined flash + text result-screen monitor.
 *
 * One DXGI captureImage() per 100 ms tick feeds both the flash brightness
 * check (the active-user HUD username region) and the text tripwire (headline
 * region with three sub-boxes), eliminating the duplicate full-screen capture
 * that the two separate monitors previously performed. When both need a sample
 * in the same tick, the text crop is taken first; headline A/B/C average
 * brightness OR’d with the username ROI can count as a white frame only if the
 * full text region’s tripwire-white ratio is high (same threshold as the text
 * flash guard), so normal result text does not fake a flash.
 */

let _nodeScreenshots = null;
function getNodeScreenshots() {
  if (_nodeScreenshots) return _nodeScreenshots;
  _nodeScreenshots = require('node-screenshots');
  return _nodeScreenshots;
}

const SAMPLE_INTERVAL_MS = 100;

// ── Flash constants ────────────────────────────────────────────────────────
const FLASH_BRIGHT_HOLD_MS = 200;
const FLASH_WHITE_THRESHOLD = 250;
const FLASH_COOLDOWN_MS = 15_000;
const MIN_PRE_ARM_FLASHES_TO_SKIP = 1;
const KNOWN_FLASH_PURE_WHITE_MS = 200;
const FLASH_MIN_VALID_DURATION_MS = 100;
const FLASH_MAX_VALID_DURATION_MS = 900;

// ── Text tripwire constants ────────────────────────────────────────────────
const TEXT_TRIPWIRE_SUSTAIN_MS = 300;
const TRIPWIRE_MIN_CONSECUTIVE_HITS = Math.max(1, Math.ceil(TEXT_TRIPWIRE_SUSTAIN_MS / SAMPLE_INTERVAL_MS));
const TRIPWIRE_MIN_ACTIVE_BOXES = 2;
const TRIPWIRE_MIN_BOX_WHITE_RATIO = 0.09;
const TRIPWIRE_BASELINE_ALPHA = 0.18;
const TRIPWIRE_MIN_BOX_WHITE_DELTA = 0.045;
const TRIPWIRE_MIN_TOTAL_WHITE_DELTA = 0.045;
const TRIPWIRE_WHITE_MIN_CHANNEL = 240;
const TRIPWIRE_WHITE_MAX_DRIFT = 20;
// If more than this fraction of the full text region is pure white, the screen
// is in a pure-white flash transition rather than showing the result screen.
const TRIPWIRE_FLASH_GUARD_RATIO = 0.60;
// Three sub-boxes within the result headline region (relative to text crop).
const TRIPWIRE_BOX_LAYOUT = Object.freeze([
  { id: 'result-a', left: 0.04, top: 0.24, width: 0.12, height: 0.76 },
  { id: 'result-b', left: 0.44, top: 0.12, width: 0.12, height: 0.76 },
  { id: 'result-c', left: 0.84, top: 0.12, width: 0.12, height: 0.76 },
]);

// ── Module-level state ─────────────────────────────────────────────────────
let _timer = null;
let _pollInFlight = false;
let _monitor = null;       // cached node-screenshots Monitor
let _monitorOffsetX = 0;  // monitor.x() — used to convert absolute → local coords
let _monitorOffsetY = 0;
let _flash = null;         // flash detection state
let _text = null;          // text tripwire state

// ── Flash helpers ──────────────────────────────────────────────────────────

function flashSamplingStatus(flash, now) {
  if (flash.waitingForFlashEnd) return 'waiting-flash-end';
  return now < flash.armAt ? 'arming-delay' : 'sampling';
}

function emitFlashDebug(status, overrides = {}) {
  if (!_flash?.onDebug) return;
  _flash.onDebug({
    status,
    armAt: _flash.armAt,
    armRemainingMs: Math.max(0, _flash.armAt - Date.now()),
    absoluteRegion: _flash.absoluteRegion,
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    brightHoldMs: FLASH_BRIGHT_HOLD_MS,
    whiteThreshold: FLASH_WHITE_THRESHOLD,
    preArmFlashCount: _flash.preArmFlashCount,
    minPreArmFlashesToSkip: MIN_PRE_ARM_FLASHES_TO_SKIP,
    brightSinceMs: _flash.brightSinceMs,
    waitingForFlashEnd: _flash.waitingForFlashEnd,
    flashNotified: _flash.flashNotified,
    pollInFlight: _pollInFlight,
    lastSampleResult: _flash.lastSampleResult,
    lastSampleMeta: _flash.lastSampleResult?.meta ?? null,
    lastIsWhiteFrame: _flash.lastIsWhiteFrame,
    lastHeadlineFlashAssist: _flash.lastHeadlineFlashAssist,
    lastUpdatedAt: _flash.lastUpdatedAt,
    ...overrides,
  });
}

function processFlashRaw(raw, now, options = {}) {
  const flash = _flash;
  if (flash?.disabledForMatch) return;
  if (!flash) return;

  const headlineFlashAssist = options.headlineFlashAssist === true;
  flash.lastHeadlineFlashAssist = headlineFlashAssist;

  const pixelCount = flash.absoluteRegion.width * flash.absoluteRegion.height;

  if (!raw || raw.length < pixelCount * 4) {
    flash.lastSampleResult = {
      success: false,
      error: 'Empty image data',
      meta: { source: 'primary-display', absoluteRegion: flash.absoluteRegion },
    };
    flash.lastIsWhiteFrame = null;
    flash.lastUpdatedAt = now;
    emitFlashDebug(flashSamplingStatus(flash, now));
    return;
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < raw.length; i += 4) {
    sumR += raw[i];
    sumG += raw[i + 1];
    sumB += raw[i + 2];
  }

  const avgBrightness = (sumR + sumG + sumB) / 3 / pixelCount;
  const tinyRoiIsWhite = avgBrightness >= FLASH_WHITE_THRESHOLD;
  const isWhiteFrame = tinyRoiIsWhite || headlineFlashAssist;

  flash.lastSampleResult = {
    success: true,
    data: {
      avgR: Math.round(sumR / pixelCount),
      avgG: Math.round(sumG / pixelCount),
      avgB: Math.round(sumB / pixelCount),
      tinyRoiIsWhite,
      headlineFlashAssist,
    },
    meta: {
      source: 'primary-display',
      absoluteRegion: flash.absoluteRegion,
      headlineFlashAssist,
    },
  };
  flash.lastIsWhiteFrame = isWhiteFrame;
  flash.lastUpdatedAt = now;

  if (flash.waitingForFlashEnd) {
    if (isWhiteFrame) {
      const flashDuration = now - (flash.brightSinceMs ?? now);
      if (flashDuration > FLASH_MAX_VALID_DURATION_MS) {
        flash.waitingForFlashEnd = false;
        flash.brightSinceMs = null;
        flash.flashNotified = false;
        flash.cooldownUntil = 0;
        emitFlashDebug(flashSamplingStatus(flash, now));
        return;
      }
      emitFlashDebug('waiting-flash-end');
      return;
    }

    const hadNotifiedFlash = flash.flashNotified === true;
    const flashDuration = now - (flash.brightSinceMs ?? now);
    const isValidDuration = flashDuration >= FLASH_MIN_VALID_DURATION_MS
      && flashDuration <= FLASH_MAX_VALID_DURATION_MS;
    flash.waitingForFlashEnd = false;
    flash.brightSinceMs = null;
    flash.flashNotified = false;
    if (hadNotifiedFlash && isValidDuration) {
      flash.onResolved?.();
    }
    emitFlashDebug(flashSamplingStatus(flash, now));
    return;
  }

  if (isWhiteFrame) {
    if (flash.brightSinceMs == null) {
      flash.brightSinceMs = now;
    }

    if ((now - flash.brightSinceMs) >= FLASH_BRIGHT_HOLD_MS) {
      const flashStartedBeforeArm = flash.brightSinceMs < flash.armAt;
      flash.waitingForFlashEnd = true;
      if (flashStartedBeforeArm && flash.preArmFlashCount < MIN_PRE_ARM_FLASHES_TO_SKIP) {
        flash.preArmFlashCount += 1;
        emitFlashDebug('waiting-flash-end');
        return;
      }
      if (now >= flash.armAt && !flash.flashNotified) {
        flash.flashNotified = true;
        flash.cooldownUntil = now + FLASH_COOLDOWN_MS;
        if (_text) {
          _text.disabledForMatch = true;
          _text.lastUpdatedAt = now;
        }
        flash.onDetected?.({ brightSinceMs: flash.brightSinceMs });
      }
      emitFlashDebug('waiting-flash-end');
      return;
    }

    emitFlashDebug('sampling');
    return;
  }

  flash.brightSinceMs = null;
  flash.flashNotified = false;
  emitFlashDebug(flashSamplingStatus(flash, now));
}

// ── Text helpers ───────────────────────────────────────────────────────────

function normalizeTripwireBox(box, imageWidth, imageHeight) {
  const left = Math.max(0, Math.min(imageWidth - 1, Math.floor(box.left * imageWidth)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.floor(box.top * imageHeight)));
  const width = Math.max(1, Math.min(imageWidth - left, Math.floor(box.width * imageWidth)));
  const height = Math.max(1, Math.min(imageHeight - top, Math.floor(box.height * imageHeight)));
  return { id: box.id, left, top, width, height };
}

function createTripwireBaseline(metrics) {
  return metrics.map((metric) => Number(metric?.whiteRatio || 0));
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
    return (previous * (1 - TRIPWIRE_BASELINE_ALPHA)) + (Number(metric?.whiteRatio || 0) * TRIPWIRE_BASELINE_ALPHA);
  });
}

function buildTripwireSnapshot(metrics, baseline) {
  const boxMetrics = metrics.map((metric, index) => {
    const whiteRatio = Number(metric.whiteRatio || 0);
    const avgBrightness = Number(metric.avgBrightness || 0);
    const baselineWhiteRatio = Number(Array.isArray(baseline) ? baseline[index] || 0 : 0);
    const whiteDelta = Math.max(0, whiteRatio - baselineWhiteRatio);
    return {
      id: metric.id,
      whiteRatio,
      avgBrightness,
      baselineWhiteRatio,
      whiteDelta,
      active: whiteRatio >= TRIPWIRE_MIN_BOX_WHITE_RATIO
        && whiteDelta >= TRIPWIRE_MIN_BOX_WHITE_DELTA,
    };
  });

  const activeBoxCount = boxMetrics.reduce((n, m) => n + (m.active ? 1 : 0), 0);
  const totalWhiteDelta = boxMetrics.reduce((s, m) => s + m.whiteDelta, 0);
  // result-a alone is sufficient: left-anchored placement text (e.g. 2nd place loss)
  // only lights up the leftmost box. B+C (centered headline) still require 2 boxes.
  const aOnlyActive = activeBoxCount === 1 && boxMetrics.some((m) => m.id === 'result-a' && m.active);
  return {
    triggered: (activeBoxCount >= TRIPWIRE_MIN_ACTIVE_BOXES || aOnlyActive)
      && totalWhiteDelta >= TRIPWIRE_MIN_TOTAL_WHITE_DELTA,
    activeBoxCount,
    totalWhiteDelta,
    boxes: boxMetrics,
  };
}

function analyzeTextBoxes(raw, imageWidth, imageHeight) {
  const channels = 4;
  const boxes = TRIPWIRE_BOX_LAYOUT.map((box) => normalizeTripwireBox(box, imageWidth, imageHeight));
  return boxes.map((box) => {
    let brightPixelCount = 0;
    let brightnessSum = 0;
    for (let y = box.top; y < box.top + box.height; y += 1) {
      for (let x = box.left; x < box.left + box.width; x += 1) {
        const offset = ((y * imageWidth) + x) * channels;
        const r = raw[offset];
        const g = raw[offset + 1];
        const b = raw[offset + 2];
        const minCh = Math.min(r, g, b);
        const maxCh = Math.max(r, g, b);
        if (minCh >= TRIPWIRE_WHITE_MIN_CHANNEL && (maxCh - minCh) <= TRIPWIRE_WHITE_MAX_DRIFT) {
          brightPixelCount += 1;
        }
        brightnessSum += (r + g + b) / 3;
      }
    }
    const pixelCount = Math.max(1, box.width * box.height);
    return { id: box.id, whiteRatio: brightPixelCount / pixelCount, avgBrightness: brightnessSum / pixelCount };
  });
}

function computeRegionWhiteRatio(raw, imageWidth, imageHeight) {
  const channels = 4;
  const total = imageWidth * imageHeight;
  let whiteCount = 0;
  for (let i = 0; i < total; i++) {
    const offset = i * channels;
    const r = raw[offset];
    const g = raw[offset + 1];
    const b = raw[offset + 2];
    if (Math.min(r, g, b) >= TRIPWIRE_WHITE_MIN_CHANNEL && (Math.max(r, g, b) - Math.min(r, g, b)) <= TRIPWIRE_WHITE_MAX_DRIFT) {
      whiteCount += 1;
    }
  }
  return whiteCount / Math.max(1, total);
}

/**
 * When the text tripwire crop is sampled in the same tick as flash, derive a
 * second flash signal from the headline A/B/C boxes: near-white average there
 * plus a high full-region white ratio (same idea as TRIPWIRE_FLASH_GUARD_RATIO)
 * avoids treating normal result text as a flash. OR with the tiny ROI path.
 */
function computeHeadlineFlashAssist(raw, imageWidth, imageHeight) {
  if (!raw || raw.length < imageWidth * imageHeight * 4) {
    return { avgBrightness: 0, regionWhiteRatio: 0, contributes: false };
  }
  const regionWhiteRatio = computeRegionWhiteRatio(raw, imageWidth, imageHeight);
  const boxes = TRIPWIRE_BOX_LAYOUT.map((box) => normalizeTripwireBox(box, imageWidth, imageHeight));
  let brightnessSum = 0;
  let pixelCount = 0;
  for (const box of boxes) {
    for (let y = box.top; y < box.top + box.height; y += 1) {
      for (let x = box.left; x < box.left + box.width; x += 1) {
        const offset = ((y * imageWidth) + x) * 4;
        brightnessSum += (raw[offset] + raw[offset + 1] + raw[offset + 2]) / 3;
        pixelCount += 1;
      }
    }
  }
  if (pixelCount < 1) {
    return { avgBrightness: 0, regionWhiteRatio, contributes: false };
  }
  const avgBrightness = brightnessSum / pixelCount;
  const contributes = avgBrightness >= FLASH_WHITE_THRESHOLD
    && regionWhiteRatio >= TRIPWIRE_FLASH_GUARD_RATIO;
  return { avgBrightness, regionWhiteRatio, contributes };
}

function emitTextDebug(status, overrides = {}) {
  if (!_text?.onDebug) return;
  _text.onDebug({
    status,
    armAt: _text.armAt,
    armRemainingMs: Math.max(0, _text.armAt - Date.now()),
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    captureRegion: _text.captureRegion,
    absoluteRegion: _text.absoluteRegion,
    detected: _text.detected,
    lastRecognizedText: _text.lastRecognizedText,
    lastSignal: _text.lastSignal,
    lastError: _text.lastError,
    lastTripwireActiveBoxCount: _text.lastTripwire?.activeBoxCount || 0,
    lastTripwireTotalWhiteDelta: _text.lastTripwire?.totalWhiteDelta || 0,
    lastTripwireBoxes: _text.lastTripwire?.boxes || [],
    lastUpdatedAt: _text.lastUpdatedAt,
    ...overrides,
  });
}

function createTripwireDetectionPayload(text, now) {
  const activeBoxes = Array.isArray(text?.lastTripwire?.boxes)
    ? text.lastTripwire.boxes.filter((box) => box?.active)
    : [];

  return {
    detectionMethod: 'text',
    result: null,
    armAt: text.armAt,
    detectedAt: now,
    captureRegion: text.captureRegion,
    activeBoxIds: activeBoxes.map((box) => box.id).filter(Boolean),
    tripwireActiveBoxCount: Number(text?.lastTripwire?.activeBoxCount || 0),
    tripwireTotalWhiteRatio: Number(text?.lastTripwire?.totalWhiteDelta || 0),
    tripwireTotalWhiteDelta: Number(text?.lastTripwire?.totalWhiteDelta || 0),
  };
}

function applyTextTripwireSample(text, boxMetrics, regionWhiteRatio, now) {
  const isArmed = now >= text.armAt;

  const emitFlashGuard = (tripwire, baseline) => {
    text.bootstrapHotStart = false;
    text.tripwireConsecutiveHits = 0;
    text.lastTripwire = tripwire;
    if (!Array.isArray(text.baselineWhiteRatios) || text.baselineWhiteRatios.length !== boxMetrics.length) {
      text.baselineWhiteRatios = baseline ?? null;
    }
    text.lastUpdatedAt = now;
    emitTextDebug('flash-guard', { regionWhiteRatio });
  };

  if (!isArmed) {
    text.baselineWhiteRatios = updateTripwireBaseline(text.baselineWhiteRatios, boxMetrics);
    text.lastTripwire = buildTripwireSnapshot(boxMetrics, text.baselineWhiteRatios);
    text.bootstrapHotStart = false;
    text.tripwireConsecutiveHits = 0;
    text.lastUpdatedAt = now;
    emitTextDebug('arming-delay');
    return;
  }

  if (
    !text.bootstrapHotStart
    && (
      !Array.isArray(text.baselineWhiteRatios)
      || text.baselineWhiteRatios.length !== boxMetrics.length
    )
  ) {
    const coldBaseline = createColdTripwireBaseline(boxMetrics);
    const bootstrapTripwire = buildTripwireSnapshot(boxMetrics, coldBaseline);
    if (bootstrapTripwire.triggered) {
      if (regionWhiteRatio >= TRIPWIRE_FLASH_GUARD_RATIO) {
        emitFlashGuard(bootstrapTripwire, null);
        return;
      }
      text.bootstrapHotStart = true;
      text.lastTripwire = bootstrapTripwire;
      text.tripwireConsecutiveHits = 1;
      text.lastUpdatedAt = now;
      emitTextDebug('sampling');
      return;
    }

    text.baselineWhiteRatios = createTripwireBaseline(boxMetrics);
    text.bootstrapHotStart = false;
    text.lastTripwire = buildTripwireSnapshot(boxMetrics, text.baselineWhiteRatios);
    text.tripwireConsecutiveHits = 0;
    text.lastUpdatedAt = now;
    emitTextDebug('sampling');
    return;
  }

  if (text.bootstrapHotStart) {
    const bootstrapTripwire = buildTripwireSnapshot(boxMetrics, createColdTripwireBaseline(boxMetrics));
    if (bootstrapTripwire.triggered && regionWhiteRatio >= TRIPWIRE_FLASH_GUARD_RATIO) {
      emitFlashGuard(bootstrapTripwire, null);
      return;
    }
    text.lastTripwire = bootstrapTripwire;

    if (bootstrapTripwire.triggered) {
      text.tripwireConsecutiveHits += 1;
      if (text.tripwireConsecutiveHits >= TRIPWIRE_MIN_CONSECUTIVE_HITS) {
        text.detected = true;
        if (_flash) {
          _flash.disabledForMatch = true;
          _flash.brightSinceMs = null;
          _flash.waitingForFlashEnd = false;
          _flash.flashNotified = false;
          _flash.lastUpdatedAt = now;
        }
        text.lastSignal = createTripwireDetectionPayload(text, now);
        text.lastUpdatedAt = now;
        text.onDetected?.(text.lastSignal);
        emitTextDebug('detected');
        return;
      }

      text.lastUpdatedAt = now;
      emitTextDebug('sampling');
      return;
    }

    text.bootstrapHotStart = false;
    text.baselineWhiteRatios = createTripwireBaseline(boxMetrics);
    text.lastTripwire = buildTripwireSnapshot(boxMetrics, text.baselineWhiteRatios);
    text.tripwireConsecutiveHits = 0;
    text.lastUpdatedAt = now;
    emitTextDebug('sampling');
    return;
  }

  const tripwire = buildTripwireSnapshot(boxMetrics, text.baselineWhiteRatios);
  if (tripwire.triggered && regionWhiteRatio >= TRIPWIRE_FLASH_GUARD_RATIO) {
    emitFlashGuard(tripwire, text.baselineWhiteRatios);
    return;
  }
  text.lastTripwire = tripwire;

  if (tripwire.triggered) {
    text.tripwireConsecutiveHits += 1;
    if (text.tripwireConsecutiveHits >= TRIPWIRE_MIN_CONSECUTIVE_HITS) {
      text.detected = true;
      if (_flash) {
        _flash.disabledForMatch = true;
        _flash.brightSinceMs = null;
        _flash.waitingForFlashEnd = false;
        _flash.flashNotified = false;
        _flash.lastUpdatedAt = now;
      }
      text.lastSignal = createTripwireDetectionPayload(text, now);
      text.lastUpdatedAt = now;
      text.onDetected?.(text.lastSignal);
      emitTextDebug('detected');
      return;
    }
  } else {
    text.tripwireConsecutiveHits = 0;
    text.baselineWhiteRatios = updateTripwireBaseline(text.baselineWhiteRatios, boxMetrics);
    text.lastTripwire = buildTripwireSnapshot(boxMetrics, text.baselineWhiteRatios);
  }

  text.lastUpdatedAt = now;
  emitTextDebug('sampling');
}

function processTextRaw(raw, imageWidth, imageHeight, now) {
  const text = _text;
  if (!text || text.detected || text.disabledForMatch) return;

  try {
    const boxMetrics = analyzeTextBoxes(raw, imageWidth, imageHeight);
    const regionWhiteRatio = computeRegionWhiteRatio(raw, imageWidth, imageHeight);
    applyTextTripwireSample(text, boxMetrics, regionWhiteRatio, now);
  } catch (error) {
    text.lastError = error?.message || 'Text tripwire failed';
    text.lastUpdatedAt = now;
    emitTextDebug(now < text.armAt ? 'arming-delay' : 'sampling');
  }
}

// ── Combined poll ──────────────────────────────────────────────────────────

async function pollOnce() {
  if (!_flash && !_text) return;
  if (_pollInFlight) return;

  const now = Date.now();

  const flashInCooldown = _flash
    && !_flash.disabledForMatch
    && !_flash.waitingForFlashEnd
    && now >= _flash.armAt
    && now < _flash.cooldownUntil;
  const flashNeedsSample = Boolean(_flash) && !_flash.disabledForMatch && !flashInCooldown;
  const textNeedsSample = Boolean(_text) && !_text.detected && !_text.disabledForMatch;

  if (!flashNeedsSample && !textNeedsSample) {
    if (_flash) {
      _flash.lastUpdatedAt = now;
      emitFlashDebug(flashSamplingStatus(_flash, now));
    }
    return;
  }

  _pollInFlight = true;

  try {
    const image = await _monitor.captureImage();
    const capturedAt = Date.now();

    let sharedTextRaw = null;
    let sharedTextW = 0;
    let sharedTextH = 0;
    let headlineFlashAssist = false;

    const combinedTextThenFlash = flashNeedsSample && textNeedsSample && _flash && _text;

    if (combinedTextThenFlash) {
      try {
        const { absoluteRegion } = _text;
        const localX = absoluteRegion.x - _monitorOffsetX;
        const localY = absoluteRegion.y - _monitorOffsetY;
        const crop = await image.crop(localX, localY, absoluteRegion.width, absoluteRegion.height);
        sharedTextRaw = await crop.toRaw(true);
        sharedTextW = absoluteRegion.width;
        sharedTextH = absoluteRegion.height;
        headlineFlashAssist = computeHeadlineFlashAssist(sharedTextRaw, sharedTextW, sharedTextH).contributes;
      } catch (err) {
        if (_text) {
          _text.lastError = err?.message || 'Crop failed';
          _text.lastUpdatedAt = capturedAt;
          emitTextDebug(capturedAt < _text.armAt ? 'arming-delay' : 'sampling');
        }
        sharedTextRaw = null;
      }
    }

    if (flashNeedsSample && _flash) {
      try {
        const { absoluteRegion } = _flash;
        const localX = absoluteRegion.x - _monitorOffsetX;
        const localY = absoluteRegion.y - _monitorOffsetY;
        const crop = await image.crop(localX, localY, absoluteRegion.width, absoluteRegion.height);
        const raw = await crop.toRaw(true);
        processFlashRaw(raw, capturedAt, { headlineFlashAssist });
      } catch (err) {
        if (_flash) {
          _flash.lastSampleResult = {
            success: false,
            error: err?.message || 'Crop failed',
            meta: { source: 'primary-display', absoluteRegion: _flash.absoluteRegion },
          };
          _flash.lastIsWhiteFrame = null;
          _flash.lastUpdatedAt = capturedAt;
          emitFlashDebug(flashSamplingStatus(_flash, capturedAt));
        }
      }
    }

    if (textNeedsSample && _text) {
      try {
        if (sharedTextRaw && combinedTextThenFlash) {
          processTextRaw(sharedTextRaw, sharedTextW, sharedTextH, capturedAt);
        } else {
          const { absoluteRegion } = _text;
          const localX = absoluteRegion.x - _monitorOffsetX;
          const localY = absoluteRegion.y - _monitorOffsetY;
          const crop = await image.crop(localX, localY, absoluteRegion.width, absoluteRegion.height);
          const raw = await crop.toRaw(true);
          processTextRaw(raw, absoluteRegion.width, absoluteRegion.height, capturedAt);
        }
      } catch (err) {
        if (_text) {
          _text.lastError = err?.message || 'Crop failed';
          _text.lastUpdatedAt = capturedAt;
          emitTextDebug(capturedAt < _text.armAt ? 'arming-delay' : 'sampling');
        }
      }
    }
  } catch (err) {
    // captureImage() itself failed — report to both sides
    const capturedAt = Date.now();
    if (_flash && flashNeedsSample) {
      _flash.lastSampleResult = {
        success: false,
        error: err?.message || 'DXGI capture failed',
        meta: { source: 'primary-display', absoluteRegion: _flash.absoluteRegion },
      };
      _flash.lastIsWhiteFrame = null;
      _flash.lastUpdatedAt = capturedAt;
      emitFlashDebug(flashSamplingStatus(_flash, capturedAt));
    }
    if (_text && textNeedsSample) {
      _text.lastError = err?.message || 'DXGI capture failed';
      _text.lastUpdatedAt = capturedAt;
      emitTextDebug(capturedAt < _text.armAt ? 'arming-delay' : 'sampling');
    }
  } finally {
    _pollInFlight = false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

function startResultMonitor({
  flashArmAt = 0,
  flashAbsoluteRegion = null,
  textArmAt = 0,
  textAbsoluteRegion = null,
  textCaptureRegion = null,
  onFlashDetected,
  onFlashResolved,
  onFlashDebug,
  onTextDetected,
  onTextDebug,
} = {}) {
  stopResultMonitor();

  if (!flashAbsoluteRegion && !textAbsoluteRegion) return false;

  // Resolve and cache the monitor once — both regions are on the primary display.
  const primaryRegion = flashAbsoluteRegion || textAbsoluteRegion;
  const { Monitor } = getNodeScreenshots();
  const monitors = Monitor.all();
  if (!monitors.length) return false;
  _monitor = Monitor.fromPoint(primaryRegion.x, primaryRegion.y)
    || monitors.find((m) => m.isPrimary())
    || monitors[0]
    || null;
  if (!_monitor) return false;

  _monitorOffsetX = Math.round(Number(_monitor.x()) || 0);
  _monitorOffsetY = Math.round(Number(_monitor.y()) || 0);

  const now = Date.now();

  if (flashAbsoluteRegion) {
    _flash = {
      armAt: Number.isFinite(Number(flashArmAt)) ? Math.round(Number(flashArmAt)) : 0,
      absoluteRegion: flashAbsoluteRegion,
      brightSinceMs: null,
      waitingForFlashEnd: false,
      flashNotified: false,
      disabledForMatch: false,
      preArmFlashCount: 0,
      cooldownUntil: 0,
      lastSampleResult: null,
      lastIsWhiteFrame: null,
      lastHeadlineFlashAssist: false,
      lastUpdatedAt: now,
      onDetected: onFlashDetected,
      onResolved: onFlashResolved,
      onDebug: onFlashDebug,
    };
    emitFlashDebug(now < _flash.armAt ? 'arming-delay' : 'sampling');
  }

  if (textAbsoluteRegion) {
    _text = {
      armAt: Number.isFinite(Number(textArmAt)) ? Math.round(Number(textArmAt)) : 0,
      absoluteRegion: textAbsoluteRegion,
      captureRegion: textCaptureRegion,
      detected: false,
      disabledForMatch: false,
      tripwireConsecutiveHits: 0,
      baselineWhiteRatios: null,
      bootstrapHotStart: false,
      lastTripwire: null,
      lastRecognizedText: '',
      lastSignal: null,
      lastError: null,
      lastUpdatedAt: now,
      onDetected: onTextDetected,
      onDebug: onTextDebug,
    };
    emitTextDebug(now < _text.armAt ? 'arming-delay' : 'sampling');
  }

  void pollOnce();
  _timer = setInterval(() => void pollOnce(), SAMPLE_INTERVAL_MS);
  return true;
}

function stopResultMonitor() {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
  _pollInFlight = false;
  _flash = null;
  _text = null;
  _monitor = null;
  _monitorOffsetX = 0;
  _monitorOffsetY = 0;
}

module.exports = {
  startResultMonitor,
  stopResultMonitor,
  KNOWN_FLASH_PURE_WHITE_MS,
  __test__: {
    TRIPWIRE_BOX_LAYOUT,
    TRIPWIRE_FLASH_GUARD_RATIO,
    FLASH_WHITE_THRESHOLD,
    createTripwireBaseline,
    createColdTripwireBaseline,
    updateTripwireBaseline,
    buildTripwireSnapshot,
    analyzeTextBoxes,
    computeRegionWhiteRatio,
    computeHeadlineFlashAssist,
    processFlashRaw,
    createTripwireDetectionPayload,
    applyTextTripwireSample,
  },
};
