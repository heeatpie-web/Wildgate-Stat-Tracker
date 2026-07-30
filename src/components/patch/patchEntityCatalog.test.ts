import { describe, expect, it } from 'vitest';
import { getKnownMatchCategories, getMatchCategory, getMatchEquipment, getMatchPerks, getMatchProspectorWeapons, getMatchUpdateKey, getPerkCatalog, getPerkCatalogWithLegacyNames, getPerkNameAliasPairs, isPerkAllowedForProspector } from './patchEntityCatalog';
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

describe('getMatchUpdateKey', () => {
    it('assigns matches on or after 2026-03-12 to the current update bucket', () => {
        const match = baseMatch({
            timestamp: new Date(2026, 2, 12, 12, 0, 0).getTime(),
        });
        expect(getMatchUpdateKey(match)).toBe('drill-charge-ram-bastion-2026-03-12');
    });

    it('assigns matches between 2026-01-01 and 2026-03-12 to the baseline launch bucket', () => {
        const match = baseMatch({
            timestamp: new Date(2026, 2, 11, 23, 59, 59).getTime(),
        });
        expect(getMatchUpdateKey(match)).toBe('baseline-launch');
    });

    it('leaves pre-update matches unassigned', () => {
        const match = baseMatch({
            timestamp: new Date(2025, 11, 31, 23, 59, 59).getTime(),
        });
        expect(getMatchUpdateKey(match)).toBe('');
    });
});

describe('getMatchCategory', () => {
    it('preserves the stored casing for display', () => {
        const match = baseMatch({ matchCategory: 'Ranked' });
        expect(getMatchCategory(match)).toBe('Ranked');
    });

    it('returns an empty string when no category is set', () => {
        expect(getMatchCategory(baseMatch())).toBe('');
    });
});

describe('getKnownMatchCategories', () => {
    it('dedupes case-insensitively, keeping the first-seen casing', () => {
        const matches = [
            baseMatch({ id: 1, matchCategory: 'Ranked' }),
            baseMatch({ id: 2, matchCategory: 'ranked' }),
            baseMatch({ id: 3, matchCategory: 'RANKED' }),
            baseMatch({ id: 4, matchCategory: 'Scrim' }),
            baseMatch({ id: 5, matchCategory: undefined }),
        ];
        expect(getKnownMatchCategories(matches)).toEqual(['Ranked', 'Scrim']);
    });
});

describe('perk renames preserve history', () => {
    it('exposes only the current name to pickers and capture-time resolution', () => {
        const catalog = getPerkCatalog();
        expect(catalog).toContain('Protected Pilot');
        expect(catalog).not.toContain('Pilot');
    });

    it('still recognises the pre-rename name for already-recorded matches', () => {
        const legacyInclusive = getPerkCatalogWithLegacyNames();
        expect(legacyInclusive).toContain('Protected Pilot');
        expect(legacyInclusive).toContain('Pilot');
    });

    it('maps the old name to the current one for newly recorded matches only', () => {
        const pairs = getPerkNameAliasPairs();
        const byAlias = new Map(pairs.map((p) => [p.alias, p.current]));
        expect(byAlias.get('Pilot')).toBe('Protected Pilot');
        expect(byAlias.get('Protected Pilot')).toBe('Protected Pilot');
    });

    it('does not invent aliases for perks that were never renamed', () => {
        const pairs = getPerkNameAliasPairs();
        const boarder = pairs.filter((p) => p.current === 'Boarder');
        expect(boarder).toEqual([{ alias: 'Boarder', current: 'Boarder' }]);
    });

    it('applies prospector restrictions through legacy names too', () => {
        expect(isPerkAllowedForProspector('Pilot', 'Sal')).toBe(true);
        expect(isPerkAllowedForProspector('Sal Inventor', 'Sal')).toBe(true);
        expect(isPerkAllowedForProspector('Sal Inventor', 'Kae')).toBe(false);
    });
});
