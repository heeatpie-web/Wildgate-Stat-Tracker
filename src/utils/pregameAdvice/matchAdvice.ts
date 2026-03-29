import type { Match, OpponentTeam } from '../../types';
import { computePregameAdvice } from './engine';
import type {
  PregameAdviceContext,
  PregameAdviceOpponentTeam,
  PregameAdviceResult,
  PregameAdviceSnapshot,
} from './types';

const dedupeStrings = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  return values.reduce<string[]>((acc, value) => {
    const trimmed = String(value || '').trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || !key || seen.has(key)) return acc;
    seen.add(key);
    acc.push(trimmed);
    return acc;
  }, []);
};

const toOpponentTeamContext = (teams: OpponentTeam[] = [], opponents: string[] = []): PregameAdviceOpponentTeam[] => {
  const normalizedTeams = (teams || [])
    .map((team) => ({
      teamName: String(team?.teamName || '').trim() || 'Unknown Team',
      shipType: String(team?.shipType || '').trim(),
      players: dedupeStrings(team?.players || []),
    }))
    .filter((team) => team.players.length > 0 || team.shipType || team.teamName);

  if (normalizedTeams.length > 0) return normalizedTeams;

  const fallbackPlayers = dedupeStrings(opponents || []);
  if (fallbackPlayers.length === 0) return [];

  return [{
    teamName: 'Unknown Team',
    shipType: '',
    players: fallbackPlayers,
  }];
};

export const buildPregameAdviceContextFromMatch = (
  match: Match | null | undefined
): PregameAdviceContext | null => {
  if (!match) return null;

  const mode = String(match.mode || '').trim();
  const draftMatchId = Number(match.id || 0);
  if (!mode || !Number.isInteger(draftMatchId) || draftMatchId <= 0) {
    return null;
  }

  return {
    mode,
    ship: String(match.ship || '').trim() || undefined,
    teammates: dedupeStrings(match.teammates || []),
    opponentTeams: toOpponentTeamContext(match.opponentTeams || [], match.opponents || []),
    reachModifiers: dedupeStrings(match.reachModifiers || []),
    artifactSource: String(match.artifactSource || '').trim() || undefined,
    draftMatchId,
  };
};

export const hasPregameLobbyContext = (match: Match | null | undefined): boolean => {
  const context = buildPregameAdviceContextFromMatch(match);
  if (!context) return false;
  return context.teammates.length > 0
    || context.opponentTeams.some((team) => team.players.length > 0 || Boolean(String(team.shipType || '').trim()))
    || context.reachModifiers.length > 0
    || Boolean(String(context.artifactSource || '').trim());
};

export const computePregameAdviceForMatch = (
  match: Match | null | undefined,
  allMatches: Match[] = []
): PregameAdviceResult | null => {
  const context = buildPregameAdviceContextFromMatch(match);
  if (!context) return null;
  return computePregameAdvice(context, allMatches || []);
};

const sameStringArray = (left: string[] = [], right: string[] = []): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const sameFactors = (
  left: PregameAdviceResult['factors'] = [],
  right: PregameAdviceResult['factors'] = []
): boolean => (
  left.length === right.length
  && left.every((factor, index) => {
    const other = right[index];
    return Boolean(other)
      && factor.kind === other.kind
      && factor.label === other.label
      && factor.direction === other.direction
      && factor.delta === other.delta
      && factor.confidence === other.confidence
      && factor.sampleSize === other.sampleSize
      && factor.copy === other.copy;
  })
);

export const isPregameAdviceSnapshotEqual = (
  left: PregameAdviceSnapshot | null | undefined,
  right: PregameAdviceSnapshot | null | undefined
): boolean => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.overallWinRate === right.overallWinRate
    && left.baselineWinRate === right.baselineWinRate
    && left.confidence === right.confidence
    && left.sampleSize === right.sampleSize
    && left.filteredPoolSize === right.filteredPoolSize
    && left.headline === right.headline
    && left.hasUsableData === right.hasUsableData
    && sameStringArray(left.topActions, right.topActions)
    && sameFactors(left.factors, right.factors);
};

export const buildPregameAdviceSnapshotForMatch = (
  match: Match | null | undefined,
  allMatches: Match[] = [],
  updatedAt = Date.now()
): PregameAdviceSnapshot | undefined => {
  const advice = computePregameAdviceForMatch(match, allMatches);
  if (!advice) return undefined;
  return {
    ...advice,
    updatedAt,
  };
};
