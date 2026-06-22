import { describe, expect, it } from 'vitest';
import { filterRosterByQuery, foldLikelyOcrDigits } from '../rosterFilter';

describe('foldLikelyOcrDigits', () => {
  it('folds digits that OCR confuses with letters', () => {
    expect(foldLikelyOcrDigits('Pil0t1ne')).toBe('Pilotine');
    expect(foldLikelyOcrDigits('5niper')).toBe('sniper');
  });

  it('leaves the digit 2 alone', () => {
    expect(foldLikelyOcrDigits('Agent2')).toBe('Agent2');
  });
});

describe('filterRosterByQuery', () => {
  const roster = ['PilotOne', 'Falcon', 'Nighthawk', 'Pioneer'];

  it('returns the head of the roster for an empty query', () => {
    expect(filterRosterByQuery(roster, '', 2)).toEqual(['PilotOne', 'Falcon']);
  });

  it('ranks an exact-ish match first', () => {
    const result = filterRosterByQuery(roster, 'pilotone');
    expect(result[0]).toBe('PilotOne');
  });

  it('matches digit-folded OCR variants', () => {
    const result = filterRosterByQuery(roster, 'Pil0t0ne');
    expect(result).toContain('PilotOne');
  });

  it('respects the result limit', () => {
    expect(filterRosterByQuery(roster, 'p', 1).length).toBeLessThanOrEqual(1);
  });

  it('excludes names that are nowhere near the query', () => {
    expect(filterRosterByQuery(roster, 'Falcon')).not.toContain('Nighthawk');
  });
});
