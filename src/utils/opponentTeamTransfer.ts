type TeamWithPlayers<TPlayer> = {
  players: TPlayer[];
};

export interface MoveOpponentPlayerParams {
  fromTeamIndex: number;
  fromPlayerIndex: number;
  toTeamIndex: number;
  toPlayerIndex?: number | null;
  preventDuplicateNames?: boolean;
  normalizeName?: (player: unknown) => string;
}

export type MoveOpponentPlayerReason =
  | 'moved'
  | 'invalid'
  | 'noop'
  | 'duplicate';

export interface MoveOpponentPlayerResult<TTeam> {
  teams: TTeam[];
  reason: MoveOpponentPlayerReason;
  movedPlayer?: string;
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
  return tryMoveOpponentPlayerBetweenTeams(teams, params).teams;
};

export const tryMoveOpponentPlayerBetweenTeams = <
  TPlayer,
  TTeam extends TeamWithPlayers<TPlayer>
>(
  teams: TTeam[],
  params: MoveOpponentPlayerParams
): MoveOpponentPlayerResult<TTeam> => {
  const { fromTeamIndex, fromPlayerIndex, toTeamIndex, toPlayerIndex } = params;
  const preventDuplicateNames = params.preventDuplicateNames !== false;
  const normalizeName = params.normalizeName || ((value: unknown) => (
    String(value || '').trim().toLowerCase()
  ));

  if (!Array.isArray(teams) || teams.length === 0) {
    return { teams, reason: 'invalid' };
  }
  if (fromTeamIndex < 0 || fromTeamIndex >= teams.length) {
    return { teams, reason: 'invalid' };
  }
  if (toTeamIndex < 0 || toTeamIndex >= teams.length) {
    return { teams, reason: 'invalid' };
  }

  const fromTeam = teams[fromTeamIndex];
  if (!fromTeam || fromPlayerIndex < 0 || fromPlayerIndex >= fromTeam.players.length) {
    return { teams, reason: 'invalid' };
  }

  const normalizedTargetIndex = toPlayerIndex == null
    ? teams[toTeamIndex].players.length
    : toPlayerIndex;

  if (
    fromTeamIndex === toTeamIndex &&
    (normalizedTargetIndex === fromPlayerIndex || normalizedTargetIndex === fromPlayerIndex + 1)
  ) {
    return { teams, reason: 'noop' };
  }

  const nextTeams = teams.map((team) => ({
    ...team,
    players: [...team.players],
  }));

  const [movedPlayer] = nextTeams[fromTeamIndex].players.splice(fromPlayerIndex, 1);
  if (movedPlayer === undefined) {
    return { teams, reason: 'invalid' };
  }

  const movedName = normalizeName(movedPlayer);
  if (preventDuplicateNames && movedName) {
    const targetPlayers = nextTeams[toTeamIndex].players;
    const duplicateExists = targetPlayers.some((player) => normalizeName(player) === movedName);
    if (duplicateExists) {
      return {
        teams,
        reason: 'duplicate',
        movedPlayer: String(movedPlayer || ''),
      };
    }
  }

  let insertionIndex = normalizedTargetIndex;
  if (fromTeamIndex === toTeamIndex && insertionIndex > fromPlayerIndex) {
    insertionIndex -= 1;
  }

  const targetPlayers = nextTeams[toTeamIndex].players;
  const safeInsertionIndex = clampIndex(insertionIndex, 0, targetPlayers.length);
  targetPlayers.splice(safeInsertionIndex, 0, movedPlayer);

  return {
    teams: nextTeams as TTeam[],
    reason: 'moved',
    movedPlayer: String(movedPlayer || ''),
  };
};
