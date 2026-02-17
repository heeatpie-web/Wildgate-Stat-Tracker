import { describe, expect, it } from 'vitest';
import {
  appendCalibrationSample,
  buildCalibrationBuckets,
  normalizeOcrCalibrationMode,
  recommendCalibrationThreshold,
  type CalibrationSample,
} from '../ocrCalibration';

const sample = (confidence: number, wasCorrect: boolean): CalibrationSample => ({
  predictedConfidence: confidence,
  wasCorrect,
  ocrMode: 'merged',
  fieldType: 'player',
  timestamp: Date.now(),
});

describe('ocrCalibration', () => {
  it('caps calibration samples to the configured maximum when appending', () => {
    let samples: CalibrationSample[] = [];
    for (let index = 0; index < 1005; index += 1) {
      samples = appendCalibrationSample(samples, sample(index % 100, index % 2 === 0), 1000);
    }

    expect(samples).toHaveLength(1000);
  });

  it('builds calibration buckets with expected sample and accuracy values', () => {
    const buckets = buildCalibrationBuckets([
      sample(10, true),
      sample(15, false),
      sample(35, true),
      sample(85, true),
      sample(90, false),
      sample(99, true),
    ]);

    expect(buckets[0].samples).toBe(2);
    expect(buckets[0].accuracy).toBeCloseTo(50, 4);
    expect(buckets[1].samples).toBe(1);
    expect(buckets[1].accuracy).toBeCloseTo(100, 4);
    expect(buckets[4].samples).toBe(3);
    expect(buckets[4].accuracy).toBeCloseTo(66.666, 2);
  });

  it('recommends the lowest threshold bucket meeting the target accuracy', () => {
    const buckets = buildCalibrationBuckets([
      sample(10, false),
      sample(30, false),
      sample(50, false),
      sample(70, false),
      sample(85, true),
      sample(95, true),
    ]);

    expect(recommendCalibrationThreshold(buckets, 90)).toBe(80);
  });

  it('returns null when no bucket meets minimum accuracy', () => {
    const buckets = buildCalibrationBuckets([
      sample(10, false),
      sample(25, false),
      sample(45, false),
      sample(65, false),
      sample(85, false),
    ]);

    expect(recommendCalibrationThreshold(buckets, 90)).toBeNull();
  });

  it('normalizes non-local/cloud modes to merged', () => {
    expect(normalizeOcrCalibrationMode('local')).toBe('local');
    expect(normalizeOcrCalibrationMode('cloud')).toBe('cloud');
    expect(normalizeOcrCalibrationMode('both')).toBe('merged');
    expect(normalizeOcrCalibrationMode('hybrid-plus')).toBe('merged');
  });
});
