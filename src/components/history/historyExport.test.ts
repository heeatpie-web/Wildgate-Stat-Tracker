import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '../../types';
import { exportMatchesAsImage } from './historyExport';

const makeMatch = (id: number): Match => ({
  id,
  timestamp: Date.now(),
  date: '2026-03-05',
  mode: 'Artifact Brawl',
  player: 'Pilot',
  teammates: ['Ally1', 'Ally2'],
  opponents: ['Enemy1', 'Enemy2'],
  hero: 'Slinger',
  ship: 'Hunter',
  reachModifiers: ['Sandstorm'],
  kills: {},
  result: 'Win',
  subType: 'Combat',
});

const createCanvasContextStub = () => {
  const ctx: Partial<CanvasRenderingContext2D> & Record<string, unknown> = {
    fillRect: vi.fn(),
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 64 }),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    font: '',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
  };
  return ctx as CanvasRenderingContext2D;
};

describe('exportMatchesAsImage', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
      getPropertyValue: () => '',
    } as unknown as CSSStyleDeclaration));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => createCanvasContextStub());
    (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = vi.fn(() => 'blob:test');
    (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (URL as unknown as { createObjectURL: typeof URL.createObjectURL }).createObjectURL = originalCreateObjectURL;
    (URL as unknown as { revokeObjectURL: typeof URL.revokeObjectURL }).revokeObjectURL = originalRevokeObjectURL;
  });

  it('downloads with blob encoding when toBlob succeeds', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['ok'], { type: 'image/png' })));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    await exportMatchesAsImage([makeMatch(1), makeMatch(2)]);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('falls back to data URL when toBlob returns null', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null));
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/png;base64,AAAA');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    await exportMatchesAsImage([makeMatch(3), makeMatch(4)]);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('throws when both blob and data URL encoding fail', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null));
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:,');

    await expect(exportMatchesAsImage([makeMatch(5)])).rejects.toThrow('Failed to encode PNG.');
  });
});
