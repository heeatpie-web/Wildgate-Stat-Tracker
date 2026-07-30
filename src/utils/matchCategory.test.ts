import { describe, expect, it } from 'vitest';
import { getMatchCategoryKey, normalizeMatchCategory } from './matchCategory';

describe('normalizeMatchCategory', () => {
    it('collapses internal whitespace and trims', () => {
        expect(normalizeMatchCategory('  Spring   Invitational  ')).toBe('Spring Invitational');
    });

    it('caps at 48 characters', () => {
        const long = 'x'.repeat(60);
        expect(normalizeMatchCategory(long)).toHaveLength(48);
    });

    it('does not change the casing of the input — display casing is preserved', () => {
        expect(normalizeMatchCategory('rAnKeD')).toBe('rAnKeD');
    });

    it('returns an empty string for nullish input', () => {
        expect(normalizeMatchCategory(undefined)).toBe('');
        expect(normalizeMatchCategory(null)).toBe('');
    });
});

describe('getMatchCategoryKey', () => {
    it('case-folds so "Ranked", "ranked" and "RANKED" share one key', () => {
        expect(getMatchCategoryKey('Ranked')).toBe(getMatchCategoryKey('ranked'));
        expect(getMatchCategoryKey('Ranked')).toBe(getMatchCategoryKey('RANKED'));
    });

    it('keeps distinct categories distinct', () => {
        expect(getMatchCategoryKey('Ranked')).not.toBe(getMatchCategoryKey('Scrim'));
    });

    it('normalizes whitespace before folding case', () => {
        expect(getMatchCategoryKey('  Ranked  Cup ')).toBe(getMatchCategoryKey('ranked cup'));
    });
});
