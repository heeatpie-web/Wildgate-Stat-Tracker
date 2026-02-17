import { describe, it, expect } from 'vitest';
import { capTeammateNames, capTeammatePlayers, getMaxTeammatesForShip } from '../teamLimits';

describe('teamLimits', () => {
  it('uses a safe 4-player fallback when ship capacity is unknown', () => {
    expect(getMaxTeammatesForShip('Unknown Ship')).toBe(3);
  });

  it('caps teammate names and dedupes case-insensitively', () => {
    const result = capTeammateNames(['Alice', 'alice', 'Bob', 'Charlie', 'Delta'], 'Hunter (4 Player)');
    expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('respects smaller ship capacities', () => {
    const result = capTeammateNames(['A', 'B', 'C'], 'Outlaw (2 Player)');
    expect(result).toEqual(['A']);
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
});

