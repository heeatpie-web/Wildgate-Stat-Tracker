import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const {
  startResultTextMonitor,
  stopResultTextMonitor,
  __test__,
} = require('./resultTextMonitor.cjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createTripwireImage(activeBoxIds = []) {
  const width = 800;
  const height = 240;
  const activeIds = new Set(activeBoxIds);
  const pixels = Buffer.alloc(width * height * 3, 12);

  for (const box of __test__.TRIPWIRE_BOX_LAYOUT) {
    if (!activeIds.has(box.id)) continue;

    const left = Math.floor(box.left * width);
    const top = Math.floor(box.top * height);
    const boxWidth = Math.max(1, Math.floor(box.width * width));
    const boxHeight = Math.max(1, Math.floor(box.height * height));

    for (let y = top; y < (top + boxHeight); y += 1) {
      for (let x = left; x < (left + boxWidth); x += 1) {
        const offset = ((y * width) + x) * 3;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
      }
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function createCustomTripwireImage(regions = []) {
  const width = 800;
  const height = 240;
  const pixels = Buffer.alloc(width * height * 3, 12);

  for (const region of regions) {
    const left = Math.max(0, Math.floor(region.left * width));
    const top = Math.max(0, Math.floor(region.top * height));
    const regionWidth = Math.max(1, Math.floor(region.width * width));
    const regionHeight = Math.max(1, Math.floor(region.height * height));

    for (let y = top; y < Math.min(height, top + regionHeight); y += 1) {
      for (let x = left; x < Math.min(width, left + regionWidth); x += 1) {
        const offset = ((y * width) + x) * 3;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
      }
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('resultTextMonitor text parsing', () => {
  it('builds a pure tripwire detection payload without OCR fields', () => {
    const payload = __test__.createTripwireDetectionPayload({
      armAt: 123,
      captureRegion: { left: 0.03, top: 0.55, width: 0.67, height: 0.22, normalized: true },
      lastUpdatedAt: 456,
      lastTripwire: {
        activeBoxCount: 1,
        totalWhiteDelta: 0.04,
        boxes: [
          { id: 'result-b', active: true },
        ],
      },
    });

    expect(payload).toMatchObject({
      detectionMethod: 'text',
      result: null,
      armAt: 123,
      detectedAt: 456,
      tripwireActiveBoxCount: 1,
      tripwireTotalWhiteDelta: 0.04,
      activeBoxIds: ['result-b'],
    });
  });
});

describe('resultTextMonitor tripwire helpers', () => {
  it('marks the tripwire as triggered when the headline box spikes above baseline', async () => {
    const baselineMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage());
    const hotMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage(['result-b']));
    const baseline = __test__.createTripwireBaseline(baselineMetrics);

    const snapshot = __test__.buildTripwireSnapshot(hotMetrics, baseline);

    expect(snapshot.triggered).toBe(true);
    expect(snapshot.activeBoxCount).toBe(1);
    expect(snapshot.totalWhiteDelta).toBeGreaterThan(0.02);
  });

  it('ignores sparse bright pixels that stay below the white coverage threshold', async () => {
    const baselineMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage());
    const headerMetrics = await __test__.analyzeTripwireBoxes(await createCustomTripwireImage([
      // Small patch inside result-b (x:348-553, y:68-239 at 800x240) — sparse enough to stay
      // below TRIPWIRE_MIN_BOX_WHITE_RATIO (0.09) and TRIPWIRE_MIN_TOTAL_WHITE_DELTA (0.045).
      { left: 0.46, top: 0.31, width: 0.02, height: 0.04 },
    ]));
    const baseline = __test__.createTripwireBaseline(baselineMetrics);

    const snapshot = __test__.buildTripwireSnapshot(headerMetrics, baseline);

    expect(snapshot.triggered).toBe(false);
    expect(snapshot.activeBoxCount).toBe(0);
    expect(snapshot.totalWhiteDelta).toBeGreaterThan(0);
    // With the 3-box layout the sparse pixels land in at most one sub-box; total delta stays well
    // below the TRIPWIRE_MIN_TOTAL_WHITE_DELTA threshold of 0.045.
    expect(snapshot.totalWhiteDelta).toBeLessThan(0.04);
  });
});

describe('resultTextMonitor loop', () => {
  beforeEach(() => {
    vi.useRealTimers();
    stopResultTextMonitor();
  });

  afterEach(() => {
    stopResultTextMonitor();
  });

  it('keeps OCR asleep until the tripwire sees sustained white result text', async () => {
    const baselineMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage());
    const hotMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage(['result-b']));
    const sampler = vi.fn()
      .mockResolvedValueOnce(baselineMetrics)
      .mockResolvedValueOnce(hotMetrics)
      .mockResolvedValueOnce(hotMetrics);
    const onDetected = vi.fn();

    startResultTextMonitor({
      armAt: Date.now(),
      intervalMs: 100,
      absoluteRegion: { x: 10, y: 20, width: 800, height: 240 },
      onDetected,
      _sampler: sampler,
    });

    await sleep(30);
    expect(onDetected).not.toHaveBeenCalled();

    await sleep(120);
    expect(onDetected).not.toHaveBeenCalled();

    await sleep(140);

    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected.mock.calls[0][0]).toMatchObject({
      detectionMethod: 'text',
      result: null,
      tripwireActiveBoxCount: 1,
      activeBoxIds: ['result-b'],
    });
  });

  it('samples during the arm delay to build baseline but does not fire before the monitor is armed', async () => {
    const hotMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage(['result-b']));
    const sampler = vi.fn().mockResolvedValue(hotMetrics);
    const onDetected = vi.fn();

    startResultTextMonitor({
      armAt: Date.now() + 350,
      intervalMs: 100,
      absoluteRegion: { x: 10, y: 20, width: 800, height: 240 },
      _sampler: sampler,
      onDetected,
    });

    await sleep(30);
    expect(sampler).toHaveBeenCalledTimes(1);
    expect(onDetected).not.toHaveBeenCalled();

    await sleep(260);

    expect(sampler.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onDetected).not.toHaveBeenCalled();
  });
});
