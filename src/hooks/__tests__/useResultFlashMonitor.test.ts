import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appStoreState = {
  deviceDisplayInfo: {
    displayWidth: 1920,
    displayHeight: 1080,
    virtualWidth: 1920,
    virtualHeight: 1080,
    aspectProfile: '16:9',
  },
  gameResolution: null as { resX: number; resY: number } | null,
};

const invokeMock = vi.fn();
const electronApiMock = {
  invoke: (...args: unknown[]) => invokeMock(...args),
};

const WHITE_SAMPLE = { avgR: 255, avgG: 255, avgB: 255 };
const DARK_SAMPLE = { avgR: 12, avgG: 18, avgB: 24 };
const THRESHOLD_SAMPLE = { avgR: 250, avgG: 250, avgB: 250 };
const BELOW_THRESHOLD_SAMPLE = { avgR: 249, avgG: 249, avgB: 249 };

const flushAsyncWork = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const queueFlashFrame = (sample: { avgR: number; avgG: number; avgB: number }) => {
  invokeMock.mockResolvedValueOnce({ success: true, data: sample });
};

vi.mock('../../store/useAppStore', () => {
  const useAppStore = (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState);
  return { useAppStore };
});

vi.mock('../../utils/electronAPI', () => ({
  getElectronAPI: () => electronApiMock,
}));

describe('useResultFlashMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T12:00:00.000Z'));
    invokeMock.mockReset();
    appStoreState.gameResolution = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not sample the screen until live play has lasted at least 45 seconds', async () => {
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: Date.now(),
      onFlashResolved: vi.fn(),
    }));

    await act(async () => {
      vi.advanceTimersByTime(44_850);
      await flushAsyncWork();
    });

    expect(invokeMock).not.toHaveBeenCalled();

    queueFlashFrame(WHITE_SAMPLE);
    await act(async () => {
      vi.advanceTimersByTime(200);
      await flushAsyncWork();
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('arms after the watched ROI stays bright for 0.20 seconds and waits for the flash to end before triggering OCR', async () => {
    const onFlashDetected = vi.fn();
    const onFlashResolved = vi.fn();
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');

    queueFlashFrame(DARK_SAMPLE);
    queueFlashFrame(WHITE_SAMPLE);
    queueFlashFrame(WHITE_SAMPLE);
    queueFlashFrame(WHITE_SAMPLE);
    queueFlashFrame(DARK_SAMPLE);

    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
      onFlashDetected,
      onFlashResolved,
    }));

    await act(async () => {
      await flushAsyncWork();
    });
    expect(onFlashDetected).not.toHaveBeenCalled();
    expect(onFlashResolved).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
      await flushAsyncWork();
    });
    expect(onFlashDetected).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
      await flushAsyncWork();
    });
    expect(onFlashDetected).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
      await flushAsyncWork();
    });
    expect(onFlashDetected).toHaveBeenCalledTimes(1);
    expect(onFlashResolved).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
      await flushAsyncWork();
    });
    expect(onFlashResolved).toHaveBeenCalledTimes(1);
  });

  it('accepts samples at the OBS-like brightness threshold and rejects samples just below it', async () => {
    const { isNearWhiteSample } = await import('../useResultFlashMonitor');

    expect(isNearWhiteSample(THRESHOLD_SAMPLE)).toBe(true);
    expect(isNearWhiteSample(BELOW_THRESHOLD_SAMPLE)).toBe(false);
  });

  it('builds the OBS-style bottom-left ROI from normalized 1920x1080 coordinates', async () => {
    const { buildResultFlashSampleRegions, FLASH_SAMPLE_REGION } = await import('../useResultFlashMonitor');

    expect(FLASH_SAMPLE_REGION).toEqual({
      x: 64 / 1920,
      y: 1013 / 1080,
      width: 107 / 1920,
      height: 21 / 1080,
    });

    expect(buildResultFlashSampleRegions(
      { resX: 1920, resY: 1080 },
      null,
    )).toEqual([{ x: 64, y: 1013, width: 107, height: 21 }]);
  });

  it('does not trigger when the watched ROI stays below the brightness threshold', async () => {
    const onFlashResolved = vi.fn();
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
    invokeMock.mockResolvedValue({ success: true, data: DARK_SAMPLE });

    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
      onFlashResolved,
    }));

    await act(async () => {
      vi.advanceTimersByTime(800);
      await flushAsyncWork();
    });

    expect(onFlashResolved).not.toHaveBeenCalled();
  });
});
