import { describe, expect, it, afterEach } from 'vitest';
import { getElectronAPI, isElectron, type ElectronAPI } from '../electronAPI';

const originalWindowElectronAPI = (window as Window & { electronAPI?: ElectronAPI }).electronAPI;

describe('electronAPI bridge helpers', () => {
  afterEach(() => {
    (window as Window & { electronAPI?: ElectronAPI }).electronAPI = originalWindowElectronAPI;
  });

  it('returns null when bridge is not available', () => {
    (window as Window & { electronAPI?: ElectronAPI }).electronAPI = undefined;
    expect(getElectronAPI()).toBeNull();
    expect(isElectron()).toBe(false);
  });

  it('returns bridge methods when bridge is available', () => {
    const mockBridge: ElectronAPI = {
      invoke: async () => ({ ok: true }),
      send: () => {},
      on: () => () => {},
      removeAllListeners: () => {},
    };

    (window as Window & { electronAPI?: ElectronAPI }).electronAPI = mockBridge;
    expect(getElectronAPI()).toBe(mockBridge);
    expect(isElectron()).toBe(true);
  });
});

