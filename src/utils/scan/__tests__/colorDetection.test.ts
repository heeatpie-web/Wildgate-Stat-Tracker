import { describe, it, expect } from 'vitest';
import { getTeamColor } from '../colorDetection';

describe('getTeamColor', () => {
  // ── Primary Colors ──

  it('detects Red', () => {
    expect(getTeamColor(220, 40, 40)).toBe('Red');
    expect(getTeamColor(255, 0, 0)).toBe('Red');
    expect(getTeamColor(200, 50, 50)).toBe('Red');
  });

  it('detects Orange', () => {
    expect(getTeamColor(240, 140, 30)).toBe('Orange');
    expect(getTeamColor(255, 165, 0)).toBe('Orange');
  });

  it('detects Yellow', () => {
    expect(getTeamColor(240, 240, 30)).toBe('Yellow');
    expect(getTeamColor(255, 255, 0)).toBe('Yellow');
  });

  it('detects Green', () => {
    expect(getTeamColor(30, 200, 30)).toBe('Green');
    expect(getTeamColor(0, 200, 0)).toBe('Green');
    expect(getTeamColor(50, 180, 80)).toBe('Green');
  });

  it('detects Cyan', () => {
    expect(getTeamColor(30, 200, 200)).toBe('Cyan');
    expect(getTeamColor(0, 255, 255)).toBe('Cyan');
  });

  it('detects Blue', () => {
    expect(getTeamColor(30, 30, 220)).toBe('Blue');
    expect(getTeamColor(0, 0, 255)).toBe('Blue');
    expect(getTeamColor(50, 80, 200)).toBe('Blue');
  });

  it('detects Purple', () => {
    expect(getTeamColor(180, 30, 220)).toBe('Purple');
    expect(getTeamColor(160, 32, 240)).toBe('Purple');
  });

  // ── Edge Cases ──

  it('returns Unknown for low delta (gray)', () => {
    expect(getTeamColor(128, 128, 128)).toBe('Unknown');
    expect(getTeamColor(100, 110, 105)).toBe('Unknown');
  });

  it('returns Unknown for very dark colors', () => {
    expect(getTeamColor(10, 10, 10)).toBe('Unknown');
    expect(getTeamColor(5, 20, 5)).toBe('Unknown');
  });

  it('returns Unknown for near-white', () => {
    expect(getTeamColor(250, 250, 250)).toBe('Unknown');
  });

  it('returns Unknown for black', () => {
    expect(getTeamColor(0, 0, 0)).toBe('Unknown');
  });

  // ── Custom Options ──

  it('respects custom luminanceMin', () => {
    // A color that would normally be detected but is dim
    const color = getTeamColor(40, 0, 0, { luminanceMin: 50 });
    expect(color).toBe('Unknown');
  });

  // ── Boundary Hue Values ──

  it('handles hue boundary at 340-360 (red wraps around)', () => {
    // Deep red-magenta near 340 degrees → should be Red or Purple depending on exact hue
    const color = getTeamColor(200, 20, 60);
    expect(['Red', 'Purple']).toContain(color);
  });

  it('handles hue boundary at 0-15 (red-orange transition)', () => {
    // Orange-red boundary
    const color = getTeamColor(255, 80, 20);
    expect(['Red', 'Orange']).toContain(color);
  });
});
