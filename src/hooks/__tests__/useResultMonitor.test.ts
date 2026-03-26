import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appStoreState = {
  deviceDisplayInfo: {
    displayWidth: 1920,
    displayHeight: 1080,
    virtualWidth: 1920,
    virtualHeight: 1080,
    aspectProfile: 'standard',
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

vi.mock('../../store/useAppStore', () => {
  const useAppStore = (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState);
  return { useAppStore };
});

vi.mock('../../utils/electronAPI', () => ({
  getElectronAPI: () => electronApiMock,
}));

describe('useResultMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T12:00:00.000Z'));
    sendMock.mockReset();
    Object.keys(eventListeners).forEach((channel) => delete eventListeners[channel]);
    appStoreState.deviceDisplayInfo = {
      displayWidth: 1920,
      displayHeight: 1080,
      virtualWidth: 1920,
      virtualHeight: 1080,
      aspectProfile: 'standard',
    };
    appStoreState.gameResolution = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds the approved ultrawide flash ROI over the active-user HUD name', async () => {
    const { buildFlashSampleRegions } = await import('../useResultMonitor');

    expect(buildFlashSampleRegions(
      { resX: 3840, resY: 1600 },
      null,
    )).toEqual([{ x: 220, y: 1450, width: 200, height: 31 }]);
  });

  it('sends the dynamic ultrawide flash region when the combined monitor starts', async () => {
    const { useResultMonitor } = await import('../useResultMonitor');
    appStoreState.gameResolution = { resX: 3840, resY: 1600 };
    const armAnchorAt = Date.now() - 10_000;

    renderHook(() => useResultMonitor({
      enabled: true,
      flashEnabled: true,
      textEnabled: false,
      armAnchorAt,
      onFlashResolved: vi.fn(),
    }));

    expect(sendMock).toHaveBeenCalledWith('result-monitor-start', {
      armAt: armAnchorAt + 45_000,
      flashRegion: {
        x: 220 / 3840,
        y: 1450 / 1600,
        width: 200 / 3840,
        height: 31 / 1600,
      },
      textRegion: null,
    });
  });
});
