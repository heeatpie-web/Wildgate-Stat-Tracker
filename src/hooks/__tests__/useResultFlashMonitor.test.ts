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

const eventListeners: Record<string, Array<(...args: unknown[]) => void>> = {};

const sendMock = vi.fn();
const electronApiMock = {
  send: (...args: unknown[]) => sendMock(...args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!eventListeners[channel]) eventListeners[channel] = [];
    eventListeners[channel].push(callback);
    return () => {
      eventListeners[channel] = eventListeners[channel].filter((listener) => listener !== callback);
    };
  },
};

const fireEvent = (channel: string, ...args: unknown[]) => {
  (eventListeners[channel] || []).forEach((listener) => listener(...args));
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
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
    sendMock.mockReset();
    Object.keys(eventListeners).forEach((channel) => delete eventListeners[channel]);
    appStoreState.gameResolution = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends result-flash-start with the correct arm timestamp and normalized region', async () => {
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
    const liveStartedAt = Date.now() - 10_000;

    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt,
      armDelayMs: 45_000,
      onFlashResolved: vi.fn(),
    }));

    expect(sendMock).toHaveBeenCalledWith('result-flash-start', {
      armAt: liveStartedAt + 45_000,
      normalizedRegion: {
        x: 64 / 1920,
        y: 1013 / 1080,
        width: 107 / 1920,
        height: 21 / 1080,
      },
    });
  });

  it('sends result-flash-stop when enabled becomes false', async () => {
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useResultFlashMonitor({
        enabled,
        liveStartedAt: Date.now() - 10_000,
        onFlashResolved: vi.fn(),
      }),
      { initialProps: { enabled: true } },
    );

    sendMock.mockClear();
    rerender({ enabled: false });

    expect(sendMock).toHaveBeenCalledWith('result-flash-stop');
  });

  it('sends result-flash-stop on unmount', async () => {
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
    const { unmount } = renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 10_000,
      onFlashResolved: vi.fn(),
    }));

    sendMock.mockClear();
    unmount();

    expect(sendMock).toHaveBeenCalledWith('result-flash-stop');
  });

  it('subscribes to the detected, resolved, and debug channels while active', async () => {
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');

    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
      onFlashResolved: vi.fn(),
    }));

    expect(eventListeners['result-flash-detected']).toHaveLength(1);
    expect(eventListeners['result-flash-resolved']).toHaveLength(1);
    expect(eventListeners['result-flash-debug']).toHaveLength(1);
  });

  it('invokes onFlashDetected and onFlashResolved when main-process events arrive', async () => {
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
    const onFlashDetected = vi.fn();
    const onFlashResolved = vi.fn();

    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
      onFlashDetected,
      onFlashResolved,
    }));

    await act(async () => {
      fireEvent('result-flash-detected');
      fireEvent('result-flash-resolved');
    });

    expect(onFlashDetected).toHaveBeenCalledTimes(1);
    expect(onFlashResolved).toHaveBeenCalledTimes(1);
  });

  it('normalizes debug snapshots from the main process into the existing debug contract', async () => {
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
    const onDebugStateChange = vi.fn();

    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
      onFlashResolved: vi.fn(),
      onDebugStateChange,
    }));

    await act(async () => {
      fireEvent('result-flash-debug', {
        status: 'waiting-flash-end',
        brightSinceMs: Date.now() - 350,
        waitingForFlashEnd: true,
        flashNotified: true,
        pollInFlight: false,
        lastSampleResult: {
          success: true,
          data: { avgR: 255, avgG: 255, avgB: 255 },
          meta: {
            source: 'primary-display',
            absoluteRegion: { x: 64, y: 1013, width: 107, height: 21 },
          },
        },
        lastIsWhiteFrame: true,
        lastUpdatedAt: Date.now(),
      });
    });

    expect(onDebugStateChange).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'waiting-flash-end',
      enabled: true,
      triggerLatched: false,
      isArmed: true,
      regions: [{ x: 64, y: 1013, width: 107, height: 21 }],
      waitingForFlashEnd: true,
      flashNotified: true,
      lastSampleMeta: {
        source: 'primary-display',
        absoluteRegion: { x: 64, y: 1013, width: 107, height: 21 },
      },
      lastSampleResult: {
        success: true,
        data: { avgR: 255, avgG: 255, avgB: 255 },
        meta: {
          source: 'primary-display',
          absoluteRegion: { x: 64, y: 1013, width: 107, height: 21 },
        },
      },
      lastIsWhiteFrame: true,
    }));
  });

  it('emits waiting-live-start debug state and does not start the monitor without a live timestamp', async () => {
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');
    const onDebugStateChange = vi.fn();

    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: null,
      onFlashResolved: vi.fn(),
      onDebugStateChange,
    }));

    expect(sendMock).toHaveBeenCalledWith('result-flash-stop');
    expect(sendMock).not.toHaveBeenCalledWith('result-flash-start', expect.anything());
    expect(onDebugStateChange).toHaveBeenCalledWith(expect.objectContaining({
      status: 'waiting-live-start',
      isArmed: false,
      regions: [{ x: 64, y: 1013, width: 107, height: 21 }],
    }));
  });

  it('does not start the monitor when triggerLatched is true', async () => {
    const { useResultFlashMonitor } = await import('../useResultFlashMonitor');

    renderHook(() => useResultFlashMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
      triggerLatched: true,
      onFlashResolved: vi.fn(),
    }));

    expect(sendMock).toHaveBeenCalledWith('result-flash-stop');
    expect(sendMock).not.toHaveBeenCalledWith('result-flash-start', expect.anything());
  });

  it('accepts fade-transition samples at the relaxed brightness threshold and rejects samples just below it', async () => {
    const { isNearWhiteSample } = await import('../useResultFlashMonitor');

    expect(isNearWhiteSample({ avgR: 230, avgG: 230, avgB: 230 })).toBe(true);
    expect(isNearWhiteSample({ avgR: 229, avgG: 229, avgB: 229 })).toBe(false);
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
});
