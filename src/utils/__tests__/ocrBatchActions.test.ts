import { describe, expect, it } from 'vitest';
import {
  getHighConfidenceEligible,
  getLowConfidenceEligible,
  normalizeOcrBatchThreshold,
} from '../ocrBatchActions';

describe('ocrBatchActions', () => {
  it('normalizes threshold to 50-100 range with 5-point steps', () => {
    expect(normalizeOcrBatchThreshold(49)).toBe(50);
    expect(normalizeOcrBatchThreshold(52)).toBe(50);
    expect(normalizeOcrBatchThreshold(53)).toBe(55);
    expect(normalizeOcrBatchThreshold(101)).toBe(100);
    expect(normalizeOcrBatchThreshold(undefined)).toBe(85);
  });

  it('returns high-confidence eligible candidates excluding ignored and corrected entries', () => {
    const candidates = [
      { name: 'A', confidence: 95 },
      { name: 'B', confidence: 90 },
      { name: 'C', confidence: 80 },
      { name: 'D', confidence: 70 },
    ];
    const corrections = { B: 'PilotB' };
    const ignored = new Set<string>(['D']);
    const eligible = getHighConfidenceEligible(candidates, corrections, ignored, 85);
    expect(eligible.map(candidate => candidate.name)).toEqual(['A']);
  });

  it('returns low-confidence eligible candidates excluding ignored and corrected entries', () => {
    const candidates = [
      { name: 'A', confidence: 95 },
      { name: 'B', confidence: 90 },
      { name: 'C', confidence: 80 },
      { name: 'D', confidence: 70 },
    ];
    const corrections = { C: 'PilotC' };
    const ignored = new Set<string>(['B']);
    const eligible = getLowConfidenceEligible(candidates, corrections, ignored, 85);
    expect(eligible.map(candidate => candidate.name)).toEqual(['D']);
  });

  it('skips candidates with unknown confidence in both batch lists', () => {
    const candidates = [
      { name: 'KnownHigh', confidence: 92 },
      { name: 'KnownLow', confidence: 62 },
      { name: 'Unknown' },
    ];

    expect(getHighConfidenceEligible(candidates, {}, new Set<string>(), 85).map(candidate => candidate.name)).toEqual(['KnownHigh']);
    expect(getLowConfidenceEligible(candidates, {}, new Set<string>(), 85).map(candidate => candidate.name)).toEqual(['KnownLow']);
  });
});
