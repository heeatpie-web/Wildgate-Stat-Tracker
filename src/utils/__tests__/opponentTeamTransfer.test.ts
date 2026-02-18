import { describe, expect, it } from 'vitest';
import { moveOpponentPlayerBetweenTeams } from '../opponentTeamTransfer';

describe('moveOpponentPlayerBetweenTeams', () => {
  it('moves a player to another team and appends when no target index is provided', () => {
    const teams = [
      { teamName: 'Red', players: ['A', 'B'] },
      { teamName: 'Blue', players: ['C'] },
    ];

    const moved = moveOpponentPlayerBetweenTeams(teams, {
      fromTeamIndex: 0,
      fromPlayerIndex: 1,
      toTeamIndex: 1,
    });

    expect(moved[0].players).toEqual(['A']);
    expect(moved[1].players).toEqual(['C', 'B']);
  });

  it('reorders within the same team', () => {
    const teams = [{ teamName: 'Red', players: ['A', 'B', 'C'] }];
    const moved = moveOpponentPlayerBetweenTeams(teams, {
      fromTeamIndex: 0,
      fromPlayerIndex: 0,
      toTeamIndex: 0,
      toPlayerIndex: 3,
    });

    expect(moved[0].players).toEqual(['B', 'C', 'A']);
  });

  it('keeps original data immutable when move is valid', () => {
    const teams = [
      { teamName: 'Red', players: ['A', 'B'] },
      { teamName: 'Blue', players: ['C'] },
    ];
    const moved = moveOpponentPlayerBetweenTeams(teams, {
      fromTeamIndex: 0,
      fromPlayerIndex: 0,
      toTeamIndex: 1,
      toPlayerIndex: 0,
    });

    expect(teams[0].players).toEqual(['A', 'B']);
    expect(teams[1].players).toEqual(['C']);
    expect(moved).not.toBe(teams);
    expect(moved[0]).not.toBe(teams[0]);
    expect(moved[1]).not.toBe(teams[1]);
  });

  it('returns original reference when indices are invalid', () => {
    const teams = [{ teamName: 'Red', players: ['A'] }];
    const moved = moveOpponentPlayerBetweenTeams(teams, {
      fromTeamIndex: 0,
      fromPlayerIndex: 3,
      toTeamIndex: 0,
    });

    expect(moved).toBe(teams);
  });
});

