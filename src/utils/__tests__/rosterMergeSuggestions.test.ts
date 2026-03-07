import { describe, expect, it } from 'vitest';
import {
  buildRosterMergePairKey,
  buildRosterMergeSuggestionGroups,
} from '../rosterMergeSuggestions';

describe('rosterMergeSuggestions', () => {
  it('builds a stable normalized pair key', () => {
    expect(buildRosterMergePairKey('Fancy Goose', 'FANCYGOOSE')).toBe('fancy goose::fancygoose');
    expect(buildRosterMergePairKey('FANCYGOOSE', 'Fancy Goose')).toBe('fancy goose::fancygoose');
  });

  it('groups fuzzy-related roster variants under one canonical name', () => {
    const groups = buildRosterMergeSuggestionGroups({
      pilotRegistry: ['Ace Crew', 'Ace Pilot', 'Ace Squad', 'OtherPilot'],
      autoMergeThresholdPct: 83,
    });

    expect(groups).toHaveLength(1);
    expect(new Set([groups[0].canonicalName, ...groups[0].variants.map((variant) => variant.name)])).toEqual(
      new Set(['Ace Crew', 'Ace Pilot', 'Ace Squad'])
    );
    expect(groups[0].pairKeys).toHaveLength(3);
  });

  it('excludes dismissed or already-aliased merge pairs', () => {
    const dismissedPairKey = buildRosterMergePairKey('PilotOne', 'Pilot0ne');
    const groups = buildRosterMergeSuggestionGroups({
      pilotRegistry: ['PilotOne', 'Pilot0ne', 'OtherPilot'],
      pilotAliases: { PilotOne: ['Pilot1'] },
      dismissedPairKeys: [dismissedPairKey],
      autoMergeThresholdPct: 83,
    });

    expect(groups).toEqual([]);
  });
});
