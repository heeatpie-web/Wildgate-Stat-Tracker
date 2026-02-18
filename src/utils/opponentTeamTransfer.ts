type TeamWithPlayers<TPlayer> = {
  players: TPlayer[];
};

export interface MoveOpponentPlayerParams {
  fromTeamIndex: number;
  fromPlayerIndex: number;
  toTeamIndex: number;
  toPlayerIndex?: number | null;
}

const clampIndex = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const moveOpponentPlayerBetweenTeams = <
  TPlayer,
  TTeam extends TeamWithPlayers<TPlayer>
>(
  teams: TTeam[],
  params: MoveOpponentPlayerParams
): TTeam[] => {
  const { fromTeamIndex, fromPlayerIndex, toTeamIndex, toPlayerIndex } = params;

  if (!Array.isArray(teams) || teams.length === 0) return teams;
  if (fromTeamIndex < 0 || fromTeamIndex >= teams.length) return teams;
  if (toTeamIndex < 0 || toTeamIndex >= teams.length) return teams;

  const fromTeam = teams[fromTeamIndex];
  if (!fromTeam || fromPlayerIndex < 0 || fromPlayerIndex >= fromTeam.players.length) {
    return teams;
  }

  const normalizedTargetIndex = toPlayerIndex == null
    ? teams[toTeamIndex].players.length
    : toPlayerIndex;

  if (
    fromTeamIndex === toTeamIndex &&
    (normalizedTargetIndex === fromPlayerIndex || normalizedTargetIndex === fromPlayerIndex + 1)
  ) {
    return teams;
  }

  const nextTeams = teams.map((team) => ({
    ...team,
    players: [...team.players],
  }));

  const [movedPlayer] = nextTeams[fromTeamIndex].players.splice(fromPlayerIndex, 1);
  if (movedPlayer === undefined) return teams;

  let insertionIndex = normalizedTargetIndex;
  if (fromTeamIndex === toTeamIndex && insertionIndex > fromPlayerIndex) {
    insertionIndex -= 1;
  }

  const targetPlayers = nextTeams[toTeamIndex].players;
  const safeInsertionIndex = clampIndex(insertionIndex, 0, targetPlayers.length);
  targetPlayers.splice(safeInsertionIndex, 0, movedPlayer);

  return nextTeams as TTeam[];
};

