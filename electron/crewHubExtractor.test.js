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

describe('crewHubExtractor singleton team preservation', () => {
  it('preserves a distinct one-off text team label for a solo enemy card', () => {
    const label = __test__.getDistinctTextTeamSingletonName(
      { name: 'BusyDaGr8', textTeamName: 'Thezinka' },
      ['Gun Jumpers'],
      new Map([
        ['THEZINKA', 1],
        ['GUNJUMPERS', 4],
      ]),
    );

    expect(label).toBe('Thezinka');
  });

  it('ignores one-off text team labels that duplicate an existing team', () => {
    const label = __test__.getDistinctTextTeamSingletonName(
      { name: 'BusyDaGr8', textTeamName: 'Gun Jumpers' },
      ['GUNJUMPERS'],
      new Map([
        ['GUNJUMPERS', 1],
      ]),
    );

    expect(label).toBe('');
  });

  it('does not salvage a known team label back into player names', () => {
    expect(__test__.shouldSkipSalvageCandidateForKnownTeamLabel('Thezinka', [
      { name: 'The Zinka', players: ['BusyDaGr8'] },
      { name: 'Gun Jumpers', players: ['Alpha', 'Beta'] },
    ])).toBe(true);

    expect(__test__.shouldSkipSalvageCandidateForKnownTeamLabel('BusyDaGr8', [
      { name: 'The Zinka', players: ['BusyDaGr8'] },
    ])).toBe(false);
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

describe('splitHueClusterByNamedColor', () => {
  const entry = (name, color, hue, confidence = 88, y = 500) => ({
    name,
    hue,
    card: { name, color, confidence, y, rawHue: hue },
  });

  it('splits red and orange cards that clusterByHue merged (hues only ~12° apart)', () => {
    // Match-788 regression: red @5.22° + orange @17.62°/17.85° fell inside the
    // 15° hue gap and collapsed into a single orange(3) team.
    const cluster = [
      entry('PermanentWinner', 'red', 5.22, 90),
      entry('JusCallmeZae643', 'orange', 17.62, 88),
      entry('Khalifa205166', 'orange', 17.85, 88),
    ];
    const parts = __test__.splitHueClusterByNamedColor(cluster);
    expect(parts).toHaveLength(2);
    const sizes = parts.map(p => p.length).sort();
    expect(sizes).toEqual([1, 2]);
    const redPart = parts.find(p => p[0].card.color === 'red');
    expect(redPart.map(p => p.name)).toEqual(['PermanentWinner']);
  });

  it('keeps single-team name jitter merged when centroids are close', () => {
    // Same bar sampled twice can flip between adjacent names (skyBlue vs
    // periwinkle); measured hues stay within a few degrees so no split.
    const cluster = [
      entry('A', 'skyBlue', 203, 85),
      entry('B', 'periwinkle', 206, 84),
    ];
    expect(__test__.splitHueClusterByNamedColor(cluster)).toHaveLength(1);
  });

  it('keeps interleaved same-hue names merged (red/orange measured at the same hue)', () => {
    const cluster = [
      entry('A', 'red', 18.64, 87),
      entry('B', 'red', 21.73, 86),
      entry('C', 'orange', 19.93, 85),
    ];
    expect(__test__.splitHueClusterByNamedColor(cluster)).toHaveLength(1);
  });

  it('assigns low-confidence and unknown cards to the nearest named part', () => {
    const cluster = [
      entry('A', 'red', 5, 90),
      entry('B', 'orange', 18, 88),
      entry('C', 'unknown', 6.5, 0),
      entry('D', 'orange', 17, 30), // below confidence floor → treated as unnamed
    ];
    const parts = __test__.splitHueClusterByNamedColor(cluster);
    expect(parts).toHaveLength(2);
    const redPart = parts.find(p => p[0].card.color === 'red');
    const orangePart = parts.find(p => p[0].card.color === 'orange');
    expect(redPart.map(p => p.name).sort()).toEqual(['A', 'C']);
    expect(orangePart.map(p => p.name).sort()).toEqual(['B', 'D']);
  });
});
