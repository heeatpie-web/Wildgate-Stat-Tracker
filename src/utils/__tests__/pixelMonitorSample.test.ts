import { describe, expect, it } from 'vitest';
import {
  normalizePixelMonitorSampleMeta,
  normalizePixelMonitorSampleResult,
} from '../pixelMonitorSample';

describe('pixelMonitorSample', () => {
  it('preserves window-region metadata on successful samples', () => {
    expect(normalizePixelMonitorSampleResult({
      success: true,
      data: { avgR: 251.6, avgG: 250.4, avgB: 249.2 },
      meta: {
        source: 'window-region',
        absoluteRegion: { x: 364.2, y: 1192.6, width: 107.1, height: 21.4 },
        clientRect: { left: 300.3, top: 179.7, width: 1920, height: 1080 },
        geometryAgeMs: 144.4,
        processName: 'Wildgate-Win64-Shipping.exe',
        processId: 1234,
        windowHandle: 5678,
        windowTitle: 'Wildgate',
      },
    })).toEqual({
      success: true,
      data: { avgR: 252, avgG: 250, avgB: 249 },
      meta: {
        source: 'window-region',
        absoluteRegion: { x: 364, y: 1193, width: 107, height: 21 },
        clientRect: { left: 300, top: 180, width: 1920, height: 1080 },
        geometryAgeMs: 144,
        processName: 'Wildgate-Win64-Shipping.exe',
        processId: 1234,
        windowHandle: 5678,
        windowTitle: 'Wildgate',
      },
    });
  });

  it('drops invalid metadata fields instead of failing the sample', () => {
    expect(normalizePixelMonitorSampleMeta({
      source: '',
      absoluteRegion: { x: 'left', y: 20, width: 30, height: 40 },
      clientRect: { left: 0, top: 0, width: 1920, height: 1080 },
      geometryAgeMs: 'stale',
      processId: 'bad',
      windowHandle: null,
    })).toEqual({
      clientRect: { left: 0, top: 0, width: 1920, height: 1080 },
      geometryAgeMs: null,
      processId: null,
    });
  });
});
