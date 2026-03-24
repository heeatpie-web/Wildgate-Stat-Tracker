import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  __test__,
} = require('./resultCombinedMonitor.cjs');

function createRawTripwireImage(activeBoxIds = [], options = {}) {
  const width = 800;
  const height = 240;
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

  for (const box of __test__.TRIPWIRE_BOX_LAYOUT) {
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
  it('triggers from baseline deltas when left-anchored placement text only lights result-a', () => {
    const baselineImage = createRawTripwireImage();
    const hotImage = createRawTripwireImage(['result-a']);
    const baselineMetrics = __test__.analyzeTextBoxes(baselineImage.raw, baselineImage.width, baselineImage.height);
    const hotMetrics = __test__.analyzeTextBoxes(hotImage.raw, hotImage.width, hotImage.height);
    const baseline = __test__.createTripwireBaseline(baselineMetrics);

    const snapshot = __test__.buildTripwireSnapshot(hotMetrics, baseline);

    expect(snapshot.triggered).toBe(true);
    expect(snapshot.activeBoxCount).toBe(1);
    expect(snapshot.totalWhiteDelta).toBeGreaterThan(0.045);
    expect(snapshot.boxes.find((box) => box.id === 'result-a')).toMatchObject({
      active: true,
    });
  });

  it('detects sustained text when the first armed sample is already hot', () => {
    const hotImage = createRawTripwireImage(['result-b', 'result-c']);
    const hotMetrics = __test__.analyzeTextBoxes(hotImage.raw, hotImage.width, hotImage.height);
    const regionWhiteRatio = __test__.computeRegionWhiteRatio(hotImage.raw, hotImage.width, hotImage.height);
    const text = createTextState({ armAt: 10 });

    __test__.applyTextTripwireSample(text, hotMetrics, regionWhiteRatio, 10);
    expect(text.detected).toBe(false);
    expect(text.bootstrapHotStart).toBe(true);
    expect(text.tripwireConsecutiveHits).toBe(1);

    __test__.applyTextTripwireSample(text, hotMetrics, regionWhiteRatio, 110);
    expect(text.detected).toBe(false);
    expect(text.tripwireConsecutiveHits).toBe(2);

    __test__.applyTextTripwireSample(text, hotMetrics, regionWhiteRatio, 210);

    expect(text.detected).toBe(true);
    expect(text.onDetected).toHaveBeenCalledTimes(1);
    expect(text.onDetected.mock.calls[0][0]).toMatchObject({
      detectionMethod: 'text',
      result: null,
      activeBoxIds: ['result-b', 'result-c'],
      tripwireActiveBoxCount: 2,
    });
    expect(text.onDetected.mock.calls[0][0].tripwireTotalWhiteDelta).toBeGreaterThan(0.045);
  });

  it('blocks hot tripwire samples during a pure-white transition flash', () => {
    const whiteImage = createRawTripwireImage([], { fullWhite: true });
    const whiteMetrics = __test__.analyzeTextBoxes(whiteImage.raw, whiteImage.width, whiteImage.height);
    const regionWhiteRatio = __test__.computeRegionWhiteRatio(whiteImage.raw, whiteImage.width, whiteImage.height);
    const text = createTextState({ armAt: 5 });

    __test__.applyTextTripwireSample(text, whiteMetrics, regionWhiteRatio, 5);

    expect(regionWhiteRatio).toBeGreaterThanOrEqual(0.6);
    expect(text.detected).toBe(false);
    expect(text.bootstrapHotStart).toBe(false);
    expect(text.tripwireConsecutiveHits).toBe(0);
    expect(text.baselineWhiteRatios).toBeNull();
    expect(text.lastTripwire?.triggered).toBe(true);
    expect(text.onDetected).not.toHaveBeenCalled();
  });
});
