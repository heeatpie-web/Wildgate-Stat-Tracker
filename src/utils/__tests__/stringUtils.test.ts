import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  findClosestMatch,
  normalizeOcrText,
  isOcrNoise,
  cleanPlayerName,
  cleanMissionName,
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
