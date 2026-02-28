import { describe, expect, it } from 'vitest';
import { getMatchPerks } from './patchEntityCatalog';
import type { Match } from '../../types';

const baseMatch = (overrides: Partial<Match> = {}): Match => ({
    id: 1,
    timestamp: Date.now(),
    date: new Date().toISOString(),
    mode: 'Artifact Brawl',
    player: 'Tester',
    teammates: [],
    opponents: [],
    hero: 'Adrian',
    ship: 'Hunter',
    reachModifiers: [],
    kills: {},
    result: 'Win',
    subType: 'Combat',
    ...overrides,
});

describe('getMatchPerks', () => {
    it('reads fallback perk fields for backward compatibility', () => {
        const match = baseMatch({
            perks: ['Boarder', 'Defender'],
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
                perks: ['Boarder'],
            },
        });
        expect(getMatchPerks(match)).toEqual(['Boarder', 'Defender']);
    });
});
