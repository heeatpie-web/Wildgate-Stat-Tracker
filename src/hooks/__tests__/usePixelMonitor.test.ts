import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appStoreState = {
  pixelMonitorEnabled: true,
  pixelMonitorX: 1492,
  pixelMonitorY: 203,
  pixelMonitorWidth: 170,
  pixelMonitorHeight: 56,
  pixelMonitorIntervalMs: 3000,
  pixelMonitorChangeSensitivity: 30,
  fullAutoEnabled: false,
};

const gameDataState = {
  isMatchInProgress: true,
};

const handleSmartScanMock = vi.fn();
const sendMock = vi.fn();
let pixelMonitorTriggerHandler: (() => Promise<void> | void) | null = null;

vi.mock('../../store/useAppStore', () => {
  const useAppStore = (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState);
  return { useAppStore };
});

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => gameDataState,
}));

vi.mock('../../utils/electronAPI', () => ({
  getElectronAPI: () => ({
    send: sendMock,
    on: vi.fn((channel: string, callback: () => Promise<void> | void) => {
      if (channel === 'pixel-monitor-trigger') {
        pixelMonitorTriggerHandler = callback;
      }
      return () => {
        if (channel === 'pixel-monitor-trigger') {
          pixelMonitorTriggerHandler = null;
        }
      };
    }),
  }),
}));

vi.mock('../useSmartScan', () => ({
  useSmartScan: () => ({
    handleSmartScan: handleSmartScanMock,
    isScanning: false,
  }),
}));

describe('usePixelMonitor', () => {
  beforeEach(() => {
    sendMock.mockReset();
    handleSmartScanMock.mockReset();
    pixelMonitorTriggerHandler = null;
    appStoreState.pixelMonitorEnabled = true;
    appStoreState.fullAutoEnabled = false;
    appStoreState.pixelMonitorIntervalMs = 3000;
    appStoreState.pixelMonitorChangeSensitivity = 30;
  });

  it('starts the configurable monitor when Full Auto is off', async () => {
    const { usePixelMonitor } = await import('../usePixelMonitor');

    renderHook(() => usePixelMonitor());

    expect(sendMock).toHaveBeenCalledWith('pixel-monitor-start', expect.objectContaining({
      x: 1492,
      y: 203,
      width: 170,
      height: 56,
      intervalMs: 3000,
      changeSensitivity: 30,
    }));
  });

  it('keeps the configurable monitor stopped while Full Auto is on', async () => {
    appStoreState.fullAutoEnabled = true;
    const { usePixelMonitor } = await import('../usePixelMonitor');

    renderHook(() => usePixelMonitor());

    expect(sendMock).toHaveBeenCalledWith('pixel-monitor-stop');
    expect(sendMock).not.toHaveBeenCalledWith('pixel-monitor-start', expect.anything());
  });

  it('routes pixel-monitor triggers to smart scan', async () => {
    const { usePixelMonitor } = await import('../usePixelMonitor');

    renderHook(() => usePixelMonitor());

    await act(async () => {
      await pixelMonitorTriggerHandler?.();
    });

    expect(handleSmartScanMock).toHaveBeenCalledTimes(1);
  });
});
