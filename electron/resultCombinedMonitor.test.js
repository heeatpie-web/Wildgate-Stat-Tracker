import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  __test__,
} = require('./resultCombinedMonitor.cjs');

const STANDARD_CAPTURE_REGION = { left: 0.2489, top: 0.105, width: 0.3991, height: 0.145, normalized: true };
const STANDARD_ABSOLUTE_REGION = { x: 478, y: 113, width: 766, height: 157 };
const STANDARD_LAYOUT = __test__.buildPlaceTripwireLayout({
  absoluteRegion: STANDARD_ABSOLUTE_REGION,
  captureRegion: STANDARD_CAPTURE_REGION,
});

function createRawTripwireImage(activeBoxIds = [], options = {}) {
  const width = options.width ?? STANDARD_ABSOLUTE_REGION.width;
  const height = options.height ?? STANDARD_ABSOLUTE_REGION.height;
  const layout = options.layout ?? STANDARD_LAYOUT;
  const activeIds = new Set(activeBoxIds);
  const pixels = Buffer.alloc(width * height * 4, 12);

  for (let i = 3; i < pixels.length; i += 4) {
    pixels[i] = 255;
  }

  if (options.fullWhite === true) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
    }
    return { raw: pixels, width, height };
  }

  for (const box of layout) {
    if (!activeIds.has(box.id)) continue;

    const left = Math.floor(box.left * width);
    const top = Math.floor(box.top * height);
    const boxWidth = Math.max(1, Math.floor(box.width * width));
    const boxHeight = Math.max(1, Math.floor(box.height * height));

    for (let y = top; y < (top + boxHeight); y += 1) {
      for (let x = left; x < (left + boxWidth); x += 1) {
        const offset = ((y * width) + x) * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
      }
    }
  }

  return { raw: pixels, width, height };
}

function createTextState(overrides = {}) {
  return {
    armAt: 0,
    captureRegion: { left: 0.2489, top: 0.105, width: 0.3991, height: 0.145, normalized: true },
    absoluteRegion: STANDARD_ABSOLUTE_REGION,
    tripwireBoxLayout: STANDARD_LAYOUT,
    detected: false,
    disabledForMatch: false,
    tripwireConsecutiveHits: 0,
    baselineWhiteRatios: null,
    bootstrapHotStart: false,
    lastTripwire: null,
    lastRecognizedText: '',
    lastSignal: null,
    lastError: null,
    lastUpdatedAt: 0,
    onDetected: vi.fn(),
    onDebug: null,
    ...overrides,
  };
}

describe('resultCombinedMonitor tripwire helpers', () => {
  it('triggers when at least three place anchors are at 98% brightness or higher', () => {
    const baselineImage = createRawTripwireImage();
    const hotImage = createRawTripwireImage(['place-p', 'place-a', 'place-e']);
    const baselineMetrics = __test__.analyzeTextBoxes(
      baselineImage.raw,
      baselineImage.width,
      baselineImage.height,
      STANDARD_LAYOUT,
    );
    const hotMetrics = __test__.analyzeTextBoxes(
      hotImage.raw,
      hotImage.width,
      hotImage.height,
      STANDARD_LAYOUT,
    );
    const baseline = __test__.createTripwireBaseline(baselineMetrics);

    const snapshot = __test__.buildTripwireSnapshot(hotMetrics, baseline);

    expect(snapshot.triggered).toBe(true);
    expect(snapshot.activeBoxCount).toBe(3);
    expect(snapshot.totalWhiteDelta).toBeGreaterThanOrEqual(0.6);
    expect(snapshot.boxes.find((box) => box.id === 'place-p')).toMatchObject({
      active: true,
    });
  });

  it('detects sustained place text after the 200ms hold requirement', () => {
    const hotImage = createRawTripwireImage(['place-p', 'place-l', 'place-a']);
    const hotMetrics = __test__.analyzeTextBoxes(
      hotImage.raw,
      hotImage.width,
      hotImage.height,
      STANDARD_LAYOUT,
    );
    const regionWhiteRatio = __test__.computeRegionWhiteRatio(hotImage.raw, hotImage.width, hotImage.height);
    const text = createTextState({ armAt: 10 });

    __test__.applyTextTripwireSample(text, hotMetrics, regionWhiteRatio, 10);
    expect(text.detected).toBe(false);
    expect(text.tripwireConsecutiveHits).toBe(1);

    __test__.applyTextTripwireSample(text, hotMetrics, regionWhiteRatio, 110);
    expect(text.detected).toBe(true);
    expect(text.onDetected).toHaveBeenCalledTimes(1);
    expect(text.onDetected.mock.calls[0][0]).toMatchObject({
      detectionMethod: 'text',
      result: null,
      activeBoxIds: ['place-p', 'place-l', 'place-a'],
      tripwireActiveBoxCount: 3,
    });
    expect(text.onDetected.mock.calls[0][0].tripwireTotalWhiteDelta).toBeGreaterThanOrEqual(0.6);
  });

  it('blocks hot tripwire samples during a pure-white transition flash', () => {
    const whiteImage = createRawTripwireImage([], { fullWhite: true });
    const whiteMetrics = __test__.analyzeTextBoxes(
      whiteImage.raw,
      whiteImage.width,
      whiteImage.height,
      STANDARD_LAYOUT,
    );
    const regionWhiteRatio = __test__.computeRegionWhiteRatio(whiteImage.raw, whiteImage.width, whiteImage.height);
    const text = createTextState({ armAt: 5 });

    __test__.applyTextTripwireSample(text, whiteMetrics, regionWhiteRatio, 5);

    expect(regionWhiteRatio).toBeGreaterThanOrEqual(0.6);
    expect(text.detected).toBe(false);
    expect(text.tripwireConsecutiveHits).toBe(0);
    expect(text.lastTripwire?.triggered).toBe(true);
    expect(text.onDetected).not.toHaveBeenCalled();
  });

  it('builds the approved ultrawide place-anchor layout from the shared text crop', () => {
    const layout = __test__.buildPlaceTripwireLayout({
      absoluteRegion: { x: 940, y: 165, width: 1508, height: 228 },
      captureRegion: STANDARD_CAPTURE_REGION,
    });

    expect(layout).toEqual([
      { id: 'place-p', left: 337 / 1508, top: 91 / 228, width: 47 / 1508, height: 19 / 228 },
      { id: 'place-l', left: 417 / 1508, top: 186 / 228, width: 54 / 1508, height: 23 / 228 },
      { id: 'place-a', left: 514 / 1508, top: 173 / 228, width: 68 / 1508, height: 19 / 228 },
      { id: 'place-c', left: 666 / 1508, top: 96 / 228, width: 54 / 1508, height: 13 / 228 },
      { id: 'place-e', left: 737 / 1508, top: 186 / 228, width: 57 / 1508, height: 23 / 228 },
    ]);
  });
});

describe('computeHeadlineFlashAssist (same-tick OR path for flash)', () => {
  it('contributes on full-frame tripwire-white flash (matches text flash guard region)', () => {
    const whiteImage = createRawTripwireImage([], { fullWhite: true });
    const out = __test__.computeHeadlineFlashAssist(whiteImage.raw, whiteImage.width, whiteImage.height, STANDARD_LAYOUT);
    expect(out.regionWhiteRatio).toBeGreaterThanOrEqual(__test__.TRIPWIRE_FLASH_GUARD_RATIO);
    expect(out.avgBrightness).toBeGreaterThanOrEqual(__test__.FLASH_WHITE_THRESHOLD);
    expect(out.contributes).toBe(true);
  });

  it('does not contribute for normal tripwire-hot result text (low region white ratio)', () => {
    const hotImage = createRawTripwireImage(['place-a', 'place-c', 'place-e']);
    const out = __test__.computeHeadlineFlashAssist(hotImage.raw, hotImage.width, hotImage.height, STANDARD_LAYOUT);
    expect(out.regionWhiteRatio).toBeLessThan(__test__.TRIPWIRE_FLASH_GUARD_RATIO);
    expect(out.contributes).toBe(false);
  });

  it('does not contribute when region is mostly flash-white but headline boxes stay dark', () => {
    const width = 800;
    const height = 240;
    const pixels = Buffer.alloc(width * height * 4, 12);
    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = 255;
    }
    const boxes = STANDARD_LAYOUT;
    for (const box of boxes) {
      const left = Math.floor(box.left * width);
      const top = Math.floor(box.top * height);
      const boxWidth = Math.max(1, Math.floor(box.width * width));
      const boxHeight = Math.max(1, Math.floor(box.height * height));
      for (let y = top; y < top + boxHeight; y += 1) {
        for (let x = left; x < left + boxWidth; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = 20;
          pixels[offset + 1] = 20;
          pixels[offset + 2] = 20;
        }
      }
    }
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      if (r === 20) continue;
      pixels[i] = 250;
      pixels[i + 1] = 250;
      pixels[i + 2] = 250;
    }
    const out = __test__.computeHeadlineFlashAssist(pixels, width, height);
    expect(out.regionWhiteRatio).toBeGreaterThanOrEqual(__test__.TRIPWIRE_FLASH_GUARD_RATIO);
    expect(out.avgBrightness).toBeLessThan(__test__.FLASH_WHITE_THRESHOLD);
    expect(out.contributes).toBe(false);
  });
});
