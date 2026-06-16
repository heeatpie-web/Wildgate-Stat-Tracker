import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { formatDayHeader, getRowBg, timeAgo } from './historyUtils';
import type { Match } from '../../types';

describe('historyUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats relative time across units', () => {
    const now = Date.now();
    expect(timeAgo(now - 30_000, now)).toBe('30s ago');
    expect(timeAgo(now - 120_000, now)).toBe('2m ago');
    expect(timeAgo(now - 7_200_000, now)).toBe('2h ago');
    expect(timeAgo(now - 172_800_000, now)).toBe('2d ago');
    expect(timeAgo(now - 5_184_000_000, now)).toBe('2mo ago');
    expect(timeAgo(now - 63_072_000_000, now)).toBe('2y ago');
  });

  it('returns empty time string when timestamp is missing', () => {
    expect(timeAgo(0, Date.now())).toBe('');
  });

  it('labels today and yesterday correctly', () => {
    const now = Date.now();
    const yesterday = now - 86_400_000;
    expect(formatDayHeader(now)).toBe('Today');
    expect(formatDayHeader(yesterday)).toBe('Yesterday');
  });

  it('returns a calendar label for older dates', () => {
    const older = new Date('2025-01-10T12:00:00.000Z').getTime();
    const label = formatDayHeader(older);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Yesterday');
    expect(label.length).toBeGreaterThan(0);
  });

  it('maps row background classes from result', () => {
    const baseMatch = {
      id: 1,
      player: 'A',
      hero: 'B',
      ship: 'C',
      result: 'Draw',
      timestamp: Date.now(),
      date: '2026-01-01',
      teammates: [],
      opponents: [],
      reachModifiers: [],
      kills: {},
      time: '00:00',
      mode: 'Fleet Battle',
      subType: '',
    } as Match;

    expect(getRowBg({ ...baseMatch, result: 'Win' })).toContain('bg-success/10');
    expect(getRowBg({ ...baseMatch, result: 'Loss' })).toContain('bg-danger/10');
    expect(getRowBg({ ...baseMatch, result: 'Draw' })).toContain('bg-neutral/10');
    expect(getRowBg({ ...baseMatch, result: 'Ongoing' })).toContain('bg-info/10');
  });
});

