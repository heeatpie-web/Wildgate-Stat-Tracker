import { describe, expect, it } from 'vitest';
import {
  extractArtifactSourceFromOcrData,
  extractArtifactSourceFromReachModifiers,
  formatArtifactSourceModifier,
  normalizeArtifactSource,
  stripArtifactSourceModifiers,
} from '../artifactSource';

describe('artifactSource helpers', () => {
  it('extracts artifact source from modifier prefix text', () => {
    const source = extractArtifactSourceFromReachModifiers([
      'Low Gravity',
      'Artifact: Ancient Relic',
      'Fog',
    ]);
    expect(source).toBe('Ancient Relic');
  });

  it('extracts artifact source from structured modifier objects', () => {
    const source = extractArtifactSourceFromReachModifiers([
      { name: 'Storm' },
      { name: 'Noise', rawText: 'Artifact - Rift Core' },
    ]);
    expect(source).toBe('Rift Core');
  });

  it('falls back to explicit OCR artifactType when modifiers do not include artifact text', () => {
    const source = extractArtifactSourceFromOcrData([
      { name: 'Sandstorm' },
    ], [], 'ice');
    expect(source).toBe('ice');
  });

  it('extracts artifact source from OCR hazards when tactical map data keeps it out of reach modifiers', () => {
    const source = extractArtifactSourceFromOcrData([
      { name: 'Sandstorm' },
    ], [
      'Artifact: Ice',
      'Low Gravity',
    ], '');
    expect(source).toBe('ice');
  });

  it('normalizes explicit artifact values to canonical type keys', () => {
    expect(normalizeArtifactSource('Artifact: Ice')).toBe('ice');
  });

  it('formats stored artifact source as a reach modifier label', () => {
    expect(formatArtifactSourceModifier('ice')).toBe('Artifact: Ice');
  });

  it('removes artifact prefixed modifiers from reach modifiers', () => {
    const stripped = stripArtifactSourceModifiers([
      'Artifact: Star Seed',
      'High Winds',
      'artifact - Rift Core',
    ]);
    expect(stripped).toEqual(['High Winds']);
  });
});
