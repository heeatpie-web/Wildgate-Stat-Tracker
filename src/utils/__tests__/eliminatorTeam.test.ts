import { describe, expect, it } from 'vitest';
import {
  getEliminatorDisplayLabel,
  getPrimaryEliminatedByTeamValue,
  isEliminatedByTeamMatch,
} from '../eliminatorTeam';

describe('eliminatorTeam utils', () => {
  it('uses normalized team color as primary eliminated-by value', () => {
    expect(getPrimaryEliminatedByTeamValue({
      teamName: 'Raiders',
      color: 'Red Team',
    })).toBe('red');
  });

  it('falls back to team name when color is unknown', () => {
    expect(getPrimaryEliminatedByTeamValue({
      teamName: 'Unknown Raiders',
      color: 'unknown',
    })).toBe('Unknown Raiders');
  });

  it('formats display labels from known colors', () => {
    expect(getEliminatorDisplayLabel({
      teamName: 'Raiders',
      color: 'green',
    })).toBe('Green Team');
  });

  it('matches new color-based values even if team name changed', () => {
    expect(isEliminatedByTeamMatch('red', {
      teamName: 'Renamed Team',
      color: 'Red',
    })).toBe(true);
  });

  it('matches legacy name-based values when color is unknown', () => {
    expect(isEliminatedByTeamMatch('Legacy Team', {
      teamName: 'Legacy Team',
      color: 'unknown',
    })).toBe(true);
  });
});
