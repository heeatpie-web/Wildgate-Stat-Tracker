import { describe, expect, it } from 'vitest';
import {
  getHighConfidenceEligible,
  getLowConfidenceEligible,
  normalizeOcrBatchThreshold,
} from '../ocrBatchActions';

describe('ocrBatchActions', () => {
  it('normalizes threshold to 70-95 range with 5-point steps', () => {
    expect(normalizeOcrBatchThreshold(69)).toBe(70);
    expect(normalizeOcrBatchThreshold(72)).toBe(70);
    expect(normalizeOcrBatchThreshold(73)).toBe(75);
    expect(normalizeOcrBatchThreshold(96)).toBe(95);
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
});
