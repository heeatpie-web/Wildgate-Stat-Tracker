import { describe, it, expect } from 'vitest';
import {
  combinedNameSimilarityScore,
  containsNameScore,
  getAdaptiveNameDistanceThreshold,
  getAdaptiveNameSimilarityThreshold,
  levenshteinDistance,
  findClosestMatch,
  lcsLength,
  lcsRatio,
  charFrequencyOverlap,
  variantSimilarityScore,
  findBestVariantMatch,
  normalizeOcrText,
  isOcrNoise,
  cleanPlayerName,
  normalizeOcrName,
  cleanMissionName,
  tokenOverlapNameScore,
  tokenizeForNameSimilarity,
} from '../stringUtils';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('returns string length for empty comparison', () => {
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  it('calculates single edit distance', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
    expect(levenshteinDistance('cat', 'ca')).toBe(1);
  });

  it('handles multi-edit distances', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('findClosestMatch', () => {
  const candidates = ['Hunter', 'Bastion', 'Privateer', 'Scout'];

  it('returns exact match', () => {
    expect(findClosestMatch('Hunter', candidates)).toBe('Hunter');
  });

  it('returns closest within threshold', () => {
    expect(findClosestMatch('Huntar', candidates)).toBe('Hunter');
  });

  it('returns null when no match within threshold', () => {
    expect(findClosestMatch('ZZZZZZZ', candidates)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(findClosestMatch('hunter', candidates)).toBe('Hunter');
  });
});

describe('name similarity helpers', () => {
  it('combines token overlap and edit distance for roster-like names', () => {
    const score = combinedNameSimilarityScore('Jr Viper', 'Junior Viper');
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('scores containment matches above basic edit distance', () => {
    expect(containsNameScore('Ace', 'Ace Pilot')).toBeGreaterThanOrEqual(70);
  });

  it('scores token overlap for split names', () => {
    const score = tokenOverlapNameScore(
      tokenizeForNameSimilarity('Jr Viper'),
      tokenizeForNameSimilarity('Junior Viper')
    );
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('uses adaptive thresholds by name length', () => {
    expect(getAdaptiveNameSimilarityThreshold(4)).toBe(70);
    expect(getAdaptiveNameSimilarityThreshold(7)).toBe(65);
    expect(getAdaptiveNameSimilarityThreshold(8)).toBe(61);
    expect(getAdaptiveNameSimilarityThreshold(16)).toBe(58);
    expect(getAdaptiveNameDistanceThreshold(4)).toBe(1);
    expect(getAdaptiveNameDistanceThreshold(13)).toBe(4);
  });
});

describe('variant-aware helpers', () => {
  it('computes LCS length and ratio', () => {
    expect(lcsLength('adrian', 'bnfandria1nr4')).toBeGreaterThanOrEqual(6);
    expect(lcsRatio('bnfandria1nr4', 'adrian')).toBeGreaterThan(0.8);
  });

  it('computes char frequency overlap in [0,1]', () => {
    const score = charFrequencyOverlap('adrian', 'bnfandria1nr4');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('boosts variant similarity using known misreads', () => {
    const noVariants = variantSimilarityScore('bnfandria1nr4', 'Adrian', []);
    const withVariants = variantSimilarityScore('bnfandria1nr4', 'Adrian', ['aIeAdriankl']);
    expect(withVariants).toBeGreaterThanOrEqual(noVariants);
  });

  it('finds best variant match when score is above threshold', () => {
    const result = findBestVariantMatch(
      'bnfandria1nr4',
      ['Adrian', 'Charlie', 'Bob'],
      { Adrian: ['aIeAdriankl'] },
      55
    );
    expect(result?.match).toBe('Adrian');
    expect((result?.score || 0)).toBeGreaterThanOrEqual(55);
  });

  it('returns null when no candidate reaches threshold', () => {
    const result = findBestVariantMatch(
      'CompletelyDifferent',
      ['Adrian'],
      { Adrian: ['aIeAdriankl'] },
      75
    );
    expect(result).toBeNull();
  });
});

describe('normalizeOcrText', () => {
  it('fixes O-for-0 in numeric contexts', () => {
    expect(normalizeOcrText('O Ships')).toBe('0 Ships');
    expect(normalizeOcrText('O Hazards')).toBe('0 Hazards');
  });

  it('fixes I-for-1 in numeric contexts', () => {
    expect(normalizeOcrText('I Ships')).toBe('1 Ships');
  });

  it('fixes O in time strings', () => {
    expect(normalizeOcrText('05:O3')).toBe('05:03');
  });

  it('leaves normal text unchanged', () => {
    expect(normalizeOcrText('Hello World')).toBe('Hello World');
  });
});

describe('isOcrNoise', () => {
  it('detects engine debug stats', () => {
    expect(isOcrNoise('GANE: 60fps')).toBe(true);
    expect(isOcrNoise('GPU: RTX 3080')).toBe(true);
    expect(isOcrNoise('FPS: 120')).toBe(true);
  });

  it('rejects too-short strings', () => {
    expect(isOcrNoise('a')).toBe(true);
    expect(isOcrNoise('')).toBe(true);
  });

  it('rejects symbol-only strings', () => {
    expect(isOcrNoise('---')).toBe(true);
  });

  it('allows valid text', () => {
    expect(isOcrNoise('PlayerName123')).toBe(false);
    expect(isOcrNoise('The Bull')).toBe(false);
  });
});

describe('cleanPlayerName', () => {
  it('removes trailing symbols', () => {
    expect(cleanPlayerName('Scare(')).toBe('Scare');
    expect(cleanPlayerName('Test]')).toBe('Test');
  });

  it('removes leading bullets/dashes', () => {
    expect(cleanPlayerName('•Name')).toBe('Name');
    expect(cleanPlayerName('--Name')).toBe('Name');
  });

  it('leaves clean names unchanged', () => {
    expect(cleanPlayerName('CleanName')).toBe('CleanName');
  });
});

describe('cleanMissionName', () => {
  it('removes UI prefixes', () => {
    expect(cleanMissionName('GE•THE BULL')).toBe('THE BULL');
  });

  it('removes trailing alignment tags', () => {
    expect(cleanMissionName('THE BULL T')).toBe('THE BULL');
  });

  it('trims whitespace', () => {
    expect(cleanMissionName('  Some Name  ')).toBe('Some Name');
  });
});

describe('normalizeOcrName', () => {
  it('removes leading decorative glyphs', () => {
    expect(normalizeOcrName('🚢   TestPilot')).toBe('TestPilot');
    expect(normalizeOcrName('⚓Ghost')).toBe('Ghost');
  });

  it('removes trailing decorative glyphs', () => {
    expect(normalizeOcrName('TestPilot 🚀')).toBe('TestPilot');
  });
});

