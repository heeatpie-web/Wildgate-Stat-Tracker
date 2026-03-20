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
const THRESHOLD_SAMPLE = { avgR: 230, avgG: 230, avgB: 230 };
const BELOW_THRESHOLD_SAMPLE = { avgR: 229, avgG: 229, avgB: 229 };

const flushAsyncWork = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const queueFlashFrame = (sample: { avgR: number; avgG: number; avgB: number }) => {
  for (let index = 0; index < 5; index += 1) {
    invokeMock.mockResolvedValueOnce(sample);
  }
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
      vi.advanceTimersByTime(300);
      await flushAsyncWork();
    });

    expect(invokeMock).toHaveBeenCalledTimes(5);
  });

  it('arms on consecutive white frames and waits for the flash to end before triggering OCR', async () => {
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
      vi.advanceTimersByTime(150);
      await flushAsyncWork();
    });
    expect(onFlashDetected).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(150);
      await flushAsyncWork();
    });
    expect(onFlashDetected).toHaveBeenCalledTimes(1);
    expect(onFlashResolved).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(150);
      await flushAsyncWork();
    });
    expect(onFlashResolved).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(150);
      await flushAsyncWork();
    });
    expect(onFlashResolved).toHaveBeenCalledTimes(1);
  });

  it('accepts samples at the relaxed white threshold and rejects samples just below it', async () => {
    const { isNearWhiteSample } = await import('../useResultFlashMonitor');

    expect(isNearWhiteSample(THRESHOLD_SAMPLE)).toBe(true);
    expect(isNearWhiteSample(BELOW_THRESHOLD_SAMPLE)).toBe(false);
  });

  it('builds the five 6x6 sample boxes around the documented normalized centers', async () => {
    const { buildResultFlashSampleRegions, FLASH_SAMPLE_POINTS } = await import('../useResultFlashMonitor');

    expect(FLASH_SAMPLE_POINTS).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.2, y: 0.8 },
      { x: 0.8, y: 0.8 },
    ]);

    expect(buildResultFlashSampleRegions(
      { resX: 1920, resY: 1080 },
      null,
    )).toEqual([
      { x: 957, y: 537, width: 6, height: 6 },
      { x: 381, y: 213, width: 6, height: 6 },
      { x: 1533, y: 213, width: 6, height: 6 },
      { x: 381, y: 861, width: 6, height: 6 },
      { x: 1533, y: 861, width: 6, height: 6 },
    ]);
  });

  it('does not trigger when bright gameplay leaves at least one sampled point below white', async () => {
    const onFlashResolved = vi.fn();
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
    let sampleIndex = 0;
    invokeMock.mockImplementation(() => {
      sampleIndex += 1;
      return Promise.resolve(sampleIndex % 5 === 0 ? DARK_SAMPLE : WHITE_SAMPLE);
    });

    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
      onFlashResolved,
    }));

    await act(async () => {
      vi.advanceTimersByTime(1_200);
      await flushAsyncWork();
    });

    expect(onFlashResolved).not.toHaveBeenCalled();
  });
});
