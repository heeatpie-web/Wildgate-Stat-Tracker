import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { __test__, isValidPlayerName } = require('./crewHubExtractor.cjs');
const { clusterByHue } = require('./colorUtils.cjs');

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

describe('clusterByHue grouping', () => {
  it('clusterByHue groups a custom-color all-unknown lobby into separate teams', () => {
    // Simulate two teams with custom colors: pink (~330°) and green (~90°)
    const players = [
      { name: 'A', hue: 328 }, { name: 'B', hue: 332 }, { name: 'C', hue: 330 },
      { name: 'D', hue: 88 },  { name: 'E', hue: 92 },  { name: 'F', hue: 90 },
    ];
    const clusters = clusterByHue(players);
    expect(clusters).toHaveLength(2);
    const pinkTeam = clusters.find(c => c.some(p => p.hue > 300));
    const greenTeam = clusters.find(c => c.some(p => p.hue < 120));
    expect(pinkTeam).toHaveLength(3);
    expect(greenTeam).toHaveLength(3);
  });

  it('clusterByHue handles mixed lobby: known-color fast path + custom unknowns', () => {
    // Only unknown-color players passed to clusterByHue:
    const unknowns = [
      { name: 'X', hue: 270 }, { name: 'Y', hue: 275 }, // purple team
    ];
    const clusters = clusterByHue(unknowns);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(2);
  });
});
