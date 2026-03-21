import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../utils/electronAPI', () => ({
  getElectronAPI: () => electronApiMock,
}));

describe('useResultTextMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T12:00:00.000Z'));
    sendMock.mockReset();
    Object.keys(eventListeners).forEach((channel) => delete eventListeners[channel]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends result-text-start with the correct arm timestamp, interval, and normalized region', async () => {
    const { useResultTextMonitor, RESULT_TEXT_SAMPLE_REGION } = await import('../useResultTextMonitor');
    const liveStartedAt = Date.now() - 10_000;

    renderHook(() => useResultTextMonitor({
      enabled: true,
      liveStartedAt,
    }));

    expect(sendMock).toHaveBeenCalledWith('result-text-start', {
      armAt: liveStartedAt + 45_000,
      intervalMs: 500,
      captureRegion: RESULT_TEXT_SAMPLE_REGION,
    });
  });

  it('sends result-text-stop when disabled and when an active monitor unmounts', async () => {
    const { useResultTextMonitor } = await import('../useResultTextMonitor');
    const { rerender, unmount } = renderHook(
      ({ enabled }: { enabled: boolean }) => useResultTextMonitor({
        enabled,
        liveStartedAt: Date.now() - 46_000,
      }),
      { initialProps: { enabled: true } },
    );

    sendMock.mockClear();
    rerender({ enabled: false });
    expect(sendMock).toHaveBeenCalledWith('result-text-stop');

    sendMock.mockClear();
    unmount();
    expect(sendMock).not.toHaveBeenCalled();

    const activeHook = renderHook(() => useResultTextMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
    }));

    sendMock.mockClear();
    activeHook.unmount();
    expect(sendMock).toHaveBeenCalledWith('result-text-stop');
  });

  it('subscribes to detected and debug channels while active', async () => {
    const { useResultTextMonitor } = await import('../useResultTextMonitor');

    renderHook(() => useResultTextMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
    }));

    expect(eventListeners['result-text-detected']).toHaveLength(1);
    expect(eventListeners['result-text-debug']).toHaveLength(1);
  });

  it('normalizes result-text payloads from the main process', async () => {
    const { useResultTextMonitor } = await import('../useResultTextMonitor');
    const onResultDetected = vi.fn();

    renderHook(() => useResultTextMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
      onResultDetected,
    }));

    await act(async () => {
      fireEvent('result-text-detected', {
        detectionMethod: 'text',
        result: 'Loss',
        winType: 'combat',
        placement: 2,
        text: '2ND PLACE',
        detectedAt: Date.now(),
      });
    });

    expect(onResultDetected).toHaveBeenCalledWith(expect.objectContaining({
      detectionMethod: 'text',
      result: 'Loss',
      winType: 'combat',
      placement: 2,
      text: '2ND PLACE',
    }));
  });

  it('emits waiting-live-start debug state and does not start the monitor without a live timestamp', async () => {
    const { useResultTextMonitor } = await import('../useResultTextMonitor');
    const onDebugStateChange = vi.fn();

    renderHook(() => useResultTextMonitor({
      enabled: true,
      liveStartedAt: null,
      onDebugStateChange,
    }));

    expect(sendMock).toHaveBeenCalledWith('result-text-stop');
    expect(sendMock).not.toHaveBeenCalledWith('result-text-start', expect.anything());
    expect(onDebugStateChange).toHaveBeenCalledWith(expect.objectContaining({
      status: 'waiting-live-start',
      isArmed: false,
      captureRegion: {
        left: 0.03,
        top: 0.55,
        width: 0.67,
        height: 0.22,
        normalized: true,
      },
    }));
  });

  it('does not start the monitor when triggerLatched is true', async () => {
    const { useResultTextMonitor } = await import('../useResultTextMonitor');

    renderHook(() => useResultTextMonitor({
      enabled: true,
      liveStartedAt: Date.now() - 46_000,
      triggerLatched: true,
    }));

    expect(sendMock).toHaveBeenCalledWith('result-text-stop');
    expect(sendMock).not.toHaveBeenCalledWith('result-text-start', expect.anything());
  });
});
