import { describe, expect, it } from 'vitest';
import { getMatchEquipment, getMatchPerks, getMatchProspectorWeapons } from './patchEntityCatalog';
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

describe('loadout entry normalization', () => {
    it('splits combined prospector weapon strings into individual entries', () => {
        const match = baseMatch({
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                characterWeapons: ['Side Long Double Whammy and Attack Drum'],
                characterEquipment: [],
                weapons: [],
                equipment: [],
            },
        });
        expect(getMatchProspectorWeapons(match)).toEqual(['Side Long Double Whammy', 'Attack Drum']);
    });

    it('splits combined equipment strings into individual entries', () => {
        const match = baseMatch({
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                characterWeapons: [],
                characterEquipment: ['Shield Matrix and Repair Drone'],
                weapons: [],
                equipment: [],
            },
        });
        expect(getMatchEquipment(match)).toEqual(['Shield Matrix', 'Repair Drone']);
    });
});
