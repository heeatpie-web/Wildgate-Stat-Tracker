import { describe, expect, it } from 'vitest';
import {
  assignDeterministicTeamColors,
  buildPlayerColorHints,
  buildPlayerColorHintsFromOpponentTeams,
  normalizeTeamColor,
} from '../teamColorAssignment';

describe('teamColorAssignment', () => {
  it('normalizes team colors from noisy strings', () => {
    expect(normalizeTeamColor(' Red Team ')).toBe('red');
    expect(normalizeTeamColor('BLUE')).toBe('blue');
    expect(normalizeTeamColor('yellow-green')).toBe('green');
    expect(normalizeTeamColor('yellowgreen')).toBe('green');
    expect(normalizeTeamColor('unknown')).toBe('unknown');
    expect(normalizeTeamColor('n/a')).toBe('unknown');
  });

  it('assigns deterministic colors independent of input order', () => {
    const teams = [
      { teamName: 'Gamma', shipType: 'Hunter', color: 'unknown', players: ['Gina', 'Gabe'] },
      { teamName: 'Alpha', shipType: 'Bastion', color: 'red', players: ['Ari', 'Ava'] },
      { teamName: 'Beta', shipType: 'Scout', color: 'red', players: ['Ben', 'Bea'] },
    ];
    const reversed = [...teams].reverse();

    const firstPass = assignDeterministicTeamColors(teams);
    const secondPass = assignDeterministicTeamColors(reversed);

    const mapByTeam = (inputTeams: typeof teams, colors: string[]) => {
      const map: Record<string, string> = {};
      inputTeams.forEach((team, index) => {
        map[team.teamName] = colors[index];
      });
      return map;
    };

    const a = mapByTeam(teams, firstPass);
    const b = mapByTeam(reversed, secondPass);
    expect(a.Alpha).toBe(b.Alpha);
    expect(a.Beta).toBe(b.Beta);
    expect(a.Gamma).toBe(b.Gamma);
    expect(new Set(Object.values(a).filter((color) => color !== 'unknown')).size).toBe(3);
  });

  it('prefers hinted player colors when available', () => {
    const hints = buildPlayerColorHints({
      red: ['Rogue'],
      blue: ['Bolt'],
    });
    const teams = [
      { teamName: 'Unknown 1', color: 'unknown', players: ['Rogue', 'X'] },
      { teamName: 'Unknown 2', color: 'unknown', players: ['Bolt', 'Y'] },
    ];
    const assigned = assignDeterministicTeamColors(teams, { playerColorHints: hints });
    expect(assigned).toEqual(['red', 'blue']);
  });

  it('builds player hints from existing opponent teams', () => {
    const hints = buildPlayerColorHintsFromOpponentTeams([
      { color: 'Green', players: ['Echo', 'Eve'] },
      { color: 'unknown', players: ['Ignored'] },
      { color: 'orange', players: ['Odin'] },
    ]);
    expect(hints.echo).toBe('green');
    expect(hints.eve).toBe('green');
    expect(hints.odin).toBe('orange');
    expect(hints.ignored).toBeUndefined();
  });
});
