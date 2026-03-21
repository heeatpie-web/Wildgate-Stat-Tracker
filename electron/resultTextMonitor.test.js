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

describe('resultTextMonitor text parsing', () => {
  it('recognizes defeat and placement text signals', () => {
    expect(__test__.detectResultTextSignal('DEFEAT 3RD PLACE')).toMatchObject({
      detected: true,
      result: 'Loss',
      placement: 3,
      detectionMethod: 'text',
    });

    expect(__test__.detectResultTextSignal('VICTORY')).toMatchObject({
      detected: true,
      result: 'Win',
      detectionMethod: 'text',
    });

    expect(__test__.detectResultTextSignal('Final Moments Recap')).toMatchObject({
      detected: false,
    });
  });
});

describe('resultTextMonitor tripwire helpers', () => {
  it('marks the tripwire as triggered when multiple white-text boxes spike above baseline', async () => {
    const baselineMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage());
    const hotMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage(['center-a', 'center-b']));
    const baseline = __test__.createTripwireBaseline(baselineMetrics);

    const snapshot = __test__.buildTripwireSnapshot(hotMetrics, baseline);

    expect(snapshot.triggered).toBe(true);
    expect(snapshot.activeBoxCount).toBeGreaterThanOrEqual(2);
    expect(snapshot.totalWhiteDelta).toBeGreaterThan(0.02);
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
    const hotMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage(['center-a', 'center-b', 'left-a']));
    const sampler = vi.fn().mockResolvedValue(Buffer.from('sample'));
    const tripwireAnalyzer = vi.fn()
      .mockResolvedValueOnce(baselineMetrics)
      .mockResolvedValueOnce(hotMetrics)
      .mockResolvedValueOnce(hotMetrics);
    const recognizer = vi.fn().mockResolvedValue('2nd place');
    const onDetected = vi.fn();

    startResultTextMonitor({
      armAt: Date.now(),
      intervalMs: 100,
      onDetected,
      _sampler: sampler,
      _recognizer: recognizer,
      _tripwireAnalyzer: tripwireAnalyzer,
    });

    await sleep(30);
    expect(recognizer).not.toHaveBeenCalled();

    await sleep(120);
    expect(recognizer).not.toHaveBeenCalled();

    await sleep(140);

    expect(recognizer).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected.mock.calls[0][0]).toMatchObject({
      detectionMethod: 'text',
      result: 'Loss',
      placement: 2,
    });
  });

  it('samples during the arm delay to build baseline but does not OCR before the monitor is armed', async () => {
    const hotMetrics = await __test__.analyzeTripwireBoxes(await createTripwireImage(['center-a', 'center-b', 'left-a']));
    const sampler = vi.fn().mockResolvedValue(Buffer.from('sample'));
    const tripwireAnalyzer = vi.fn().mockResolvedValue(hotMetrics);
    const recognizer = vi.fn().mockResolvedValue('VICTORY');

    startResultTextMonitor({
      armAt: Date.now() + 350,
      intervalMs: 100,
      _sampler: sampler,
      _recognizer: recognizer,
      _tripwireAnalyzer: tripwireAnalyzer,
    });

    await sleep(30);
    expect(sampler).toHaveBeenCalledTimes(1);
    expect(tripwireAnalyzer).toHaveBeenCalledTimes(1);
    expect(recognizer).not.toHaveBeenCalled();

    await sleep(260);

    expect(sampler.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(tripwireAnalyzer.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(recognizer).not.toHaveBeenCalled();
  });
});
