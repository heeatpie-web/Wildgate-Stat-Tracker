import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { __test__, isValidPlayerName } = require('./crewHubExtractor.cjs');

describe('crewHubExtractor short-tag salvage', () => {
  it('keeps short lowercase handles that were truncated by common UI suffixes', () => {
    expect(__test__.isLikelyShortUiSuffixTagCandidate([{ text: 'eet15' }], 'eet')).toBe(true);
    expect(__test__.isLikelyShortUiSuffixTagCandidate([{ text: 'leet15' }], 'leet')).toBe(false);
    expect(__test__.isLikelyShortUiSuffixTagCandidate([{ text: 'CPU15' }], 'CPU')).toBe(false);
    expect(__test__.isLikelyShortUiSuffixTagCandidate([{ text: 'eet15' }, { text: 'extra' }], 'eet')).toBe(false);
  });
});

describe('crewHubExtractor geometry thresholds', () => {
  it('keeps the 1.2 percent line threshold capped by OCR-space geometry', () => {
    const threshold = __test__.computeLineMergeThreshold(800, { ocrScaleY: (1600 / 1080) * 0.5 });
    expect(threshold).toBeCloseTo(9.6, 4);
  });

  it('bases ultrawide x clustering on the active region width, not the full frame width', () => {
    const threshold = __test__.computeXProximityThreshold(1920, {
      geometry: { aspectProfile: 'ultrawide', ocrScaleX: 1 },
      regionWidth: 1920 * 0.45,
      baselineXThresholdPx: 1920 * 0.45 * 0.25,
    });
    expect(threshold).toBeCloseTo(216, 4);
  });
});

describe('crewHubExtractor UI-noise filtering', () => {
  it('rejects ship-bonus tooltip text as a player name candidate', () => {
    expect(isValidPlayerName('Reducefiresonshipby50')).toBe(false);
    expect(__test__.isValidOpponentName('Reducefiresonshipby50')).toBe(false);
  });
});
