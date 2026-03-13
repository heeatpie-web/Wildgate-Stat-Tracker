import { describe, it, expect } from 'vitest';
import { capTeammateNames, capTeammatePlayers, getMaxTeammatesForShip } from '../teamLimits';

describe('teamLimits', () => {
  it('uses a safe 4-player fallback when ship capacity is unknown', () => {
    expect(getMaxTeammatesForShip('Unknown Ship')).toBe(3);
  });

  it('treats Battle Scout as a 4-player ship', () => {
    expect(getMaxTeammatesForShip('Battle Scout')).toBe(3);
    expect(getMaxTeammatesForShip('Battle Scout (4 Player)')).toBe(3);
  });

  it('caps teammate names and dedupes case-insensitively', () => {
    const result = capTeammateNames(['Alice', 'alice', 'Bob', 'Charlie', 'Delta'], 'Hunter (4 Player)');
    expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('respects smaller ship capacities', () => {
    const result = capTeammateNames(['A', 'B', 'C'], 'Outlaw (2 Player)');
    expect(result).toEqual(['A']);
  });

  it('drops unknown placeholder teammate labels', () => {
    const result = capTeammateNames(['Unknown Player', 'N/A', 'Alice', '?', 'Bob'], 'Hunter (4 Player)');
    expect(result).toEqual(['Alice', 'Bob']);
  });

  it('caps teammate player objects and preserves first-seen entries', () => {
    const result = capTeammatePlayers(
      [
        { name: '  Alpha  ', confidence: 91 },
        { name: 'alpha', confidence: 99 },
        { name: 'Bravo', confidence: 80 },
        { name: 'Charlie', confidence: 75 },
      ],
      'Hunter (4 Player)'
    );
    expect(result).toEqual([
      { name: 'Alpha', confidence: 91 },
      { name: 'Bravo', confidence: 80 },
      { name: 'Charlie', confidence: 75 },
    ]);
  });

  it('drops unknown placeholder teammate player rows', () => {
    const result = capTeammatePlayers(
      [
        { name: 'Unknown Player', confidence: 100 },
        { name: 'N/A', confidence: 100 },
        { name: 'Alpha', confidence: 91 },
        { name: 'Bravo', confidence: 80 },
      ],
      'Hunter (4 Player)'
    );
    expect(result).toEqual([
      { name: 'Alpha', confidence: 91 },
      { name: 'Bravo', confidence: 80 },
    ]);
  });
});

