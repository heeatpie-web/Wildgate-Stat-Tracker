import { describe, expect, it } from 'vitest';
import {
    emptySharedUidMappings,
    normalizeDetectedUnknownMappings,
    normalizeSharedUidMappings,
    toMappingEntityType,
} from '../mappingContract';

describe('mappingContract', () => {
    it('provides a default perks bucket for legacy mapping payloads', () => {
        const normalized = normalizeSharedUidMappings({
            players: { p1: 'Player One' },
            ships: { s1: 'Scout' },
            weapons: {},
            equipment: {},
        });

        expect(normalized.players.p1).toBe('Player One');
        expect(normalized.perks).toEqual({});
    });

    it('keeps explicit perk mappings when present', () => {
        const normalized = normalizeSharedUidMappings({
            players: {},
            ships: {},
            weapons: {},
            equipment: {},
            perks: { perk_1: 'Afterburn' },
        });

        expect(normalized.perks.perk_1).toBe('Afterburn');
    });

    it('strictly drops non-string mapping values', () => {
        const normalized = normalizeSharedUidMappings({
            players: {
                valid: 'Player One',
                invalidNumber: 42 as unknown as string,
            },
            ships: {},
            weapons: {},
            equipment: {},
            perks: {
                validPerk: 'Afterburn',
                invalidBoolean: true as unknown as string,
            },
        });

        expect(normalized.players).toEqual({ valid: 'Player One' });
        expect(normalized.perks).toEqual({ validPerk: 'Afterburn' });
    });

    it('maps mapping categories to concrete entity types', () => {
        expect(toMappingEntityType('perks')).toBe('Perk');
        expect(toMappingEntityType('ships')).toBe('Ship');
    });

    it('normalizes detected unknown mappings including perk values', () => {
        const unknowns = normalizeDetectedUnknownMappings({
            abc: { type: 'perk', lastSeen: 123 },
            def: { type: 'mystery', lastSeen: -1 },
        });

        expect(unknowns.abc).toEqual({ type: 'Perk', lastSeen: 123 });
        expect(unknowns.def).toEqual({ type: 'Unknown', lastSeen: 0 });
    });

    it('returns empty defaults from emptySharedUidMappings', () => {
        expect(emptySharedUidMappings()).toEqual({
            players: {},
            ships: {},
            weapons: {},
            equipment: {},
            perks: {},
        });
    });
});
