import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  startResultFlashMonitor,
  stopResultFlashMonitor,
} = require('./resultFlashMonitor.cjs');

const WHITE = { success: true, data: { avgR: 255, avgG: 255, avgB: 255 } };
const NEAR_WHITE = { success: true, data: { avgR: 250, avgG: 250, avgB: 250 } };
const BRIGHT_FADE = { success: true, data: { avgR: 249, avgG: 249, avgB: 249 } };
const DARK = { success: true, data: { avgR: 12, avgG: 18, avgB: 24 } };

const flushAsyncWork = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

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

  it('does not notify before the arm timestamp, even while pre-arm sampling is active', async () => {
    const onDetected = vi.fn();
    const sampler = vi.fn().mockResolvedValue(WHITE);
    const onDebug = vi.fn();

    startResultFlashMonitor({
      armAt: Date.now() + 45_000,
      absoluteRegion: { x: 150, y: 979, width: 107, height: 21 },
      onDetected,
      onResolved: vi.fn(),
      onDebug,
      _sampler: sampler,
    });

    await vi.advanceTimersByTimeAsync(2_000);

    expect(onDetected).not.toHaveBeenCalled();
    expect(sampler).toHaveBeenCalled();
    expect(onDebug).toHaveBeenCalledWith(expect.objectContaining({
      status: 'arming-delay',
      armRemainingMs: expect.any(Number),
    }));
  });

  it('absorbs one flash that starts before arming and still detects the next live flash', async () => {
    const onDetected = vi.fn();
    const onResolved = vi.fn();
    const sampler = vi.fn()
      .mockResolvedValueOnce(DARK)
      .mockResolvedValueOnce(WHITE)
      .mockResolvedValueOnce(WHITE)
      .mockResolvedValueOnce(WHITE)
      .mockResolvedValueOnce(DARK)
      .mockResolvedValueOnce(WHITE)
      .mockResolvedValueOnce(WHITE)
      .mockResolvedValueOnce(WHITE)
      .mockResolvedValueOnce(DARK);

    startResultFlashMonitor({
      armAt: Date.now() + 250,
      absoluteRegion: { x: 150, y: 979, width: 107, height: 21 },
      onDetected,
      onResolved,
      _sampler: sampler,
    });

    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(300);
    expect(onDetected).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(onDetected).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('fires onDetected for a fade-style white flash and resolves on the next dim frame', async () => {
    const onDetected = vi.fn();
    const onResolved = vi.fn();
    const frames = [DARK, NEAR_WHITE, WHITE, WHITE, BRIGHT_FADE, DARK];
    const sampler = vi.fn().mockImplementation(() => Promise.resolve(frames.shift() || DARK));

    startResultFlashMonitor({
      armAt: Date.now() - 1,
      absoluteRegion: { x: 150, y: 979, width: 107, height: 21 },
      onDetected,
      onResolved,
      _sampler: sampler,
    });

    await flushAsyncWork();
    expect(onDetected).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(onDetected).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(onDetected).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onResolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('does not re-trigger during cooldown after the flash resolves', async () => {
    const onDetected = vi.fn();
    const onResolved = vi.fn();
    const sampler = vi.fn()
      .mockResolvedValueOnce(WHITE)
      .mockResolvedValueOnce(WHITE)
      .mockResolvedValueOnce(WHITE)
      .mockResolvedValueOnce(DARK)
      .mockResolvedValue(WHITE);

    startResultFlashMonitor({
      armAt: Date.now() - 1,
      absoluteRegion: { x: 150, y: 979, width: 107, height: 21 },
      onDetected,
      onResolved,
      _sampler: sampler,
    });

    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(300);
    expect(onDetected).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(onResolved).toHaveBeenCalledTimes(1);

    const callCountAfterResolve = sampler.mock.calls.length;
    await vi.advanceTimersByTimeAsync(14_000);
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(sampler.mock.calls.length).toBe(callCountAfterResolve);
  });

  it('stopResultFlashMonitor halts sampling immediately', async () => {
    const sampler = vi.fn().mockResolvedValue(DARK);

    startResultFlashMonitor({
      armAt: Date.now() - 1,
      absoluteRegion: { x: 150, y: 979, width: 107, height: 21 },
      onDetected: vi.fn(),
      onResolved: vi.fn(),
      _sampler: sampler,
    });

    await flushAsyncWork();
    stopResultFlashMonitor();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sampler.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
