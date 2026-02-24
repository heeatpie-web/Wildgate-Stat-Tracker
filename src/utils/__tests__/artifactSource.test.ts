import { describe, expect, it } from 'vitest';
import {
  extractArtifactSourceFromReachModifiers,
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

  it('removes artifact prefixed modifiers from reach modifiers', () => {
    const stripped = stripArtifactSourceModifiers([
      'Artifact: Star Seed',
      'High Winds',
      'artifact - Rift Core',
    ]);
    expect(stripped).toEqual(['High Winds']);
  });
});
