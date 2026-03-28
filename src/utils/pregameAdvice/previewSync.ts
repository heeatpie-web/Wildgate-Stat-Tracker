import type { Match, OpponentTeam } from '../../types';
import type { OCRExtractedData } from '../ocr/ocrTypes';
import { extractArtifactSourceFromOcrData } from '../artifactSource';
import { backfillOpponentTeamShipTypes } from '../ocr/opponentTeamShipTypes';
import { normalizeOcrName } from '../stringUtils';

const toNameKey = (value: string | null | undefined): string =>
  normalizeOcrName(String(value || '')).toLowerCase();

const dedupeStrings = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  return values.reduce<string[]>((acc, value) => {
    const trimmed = String(value || '').trim();
    const key = toNameKey(trimmed);
    if (!trimmed || !key || seen.has(key)) return acc;
    seen.add(key);
    acc.push(trimmed);
    return acc;
  }, []);
};

const sameStringArray = (left: string[] = [], right: string[] = []): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const sameOpponentTeams = (left: OpponentTeam[] = [], right: OpponentTeam[] = []): boolean => (
  left.length === right.length
  && left.every((team, index) => {
    const other = right[index];
    return Boolean(other)
      && team.teamName === other.teamName
      && team.shipType === other.shipType
      && team.color === other.color
      && team.sourceRowIndex === other.sourceRowIndex
      && team.sourceRowY === other.sourceRowY
      && sameStringArray(team.players, other.players);
  })
);

const isPregamePreviewDraft = (match: Match): boolean => (
  match.subType === 'Telemetry Draft'
  && (match.telemetryDraftState === 'active' || match.result === 'Ongoing')
);

const toOpponentTeams = (data: OCRExtractedData): OpponentTeam[] => {
  const baseTeams: OpponentTeam[] = (data.opponentTeams || [])
    .map((team) => ({
      teamName: String(team.teamName || '').trim() || 'Unknown Team',
      shipType: String(team.shipType || '').trim(),
      color: String(team.color || 'unknown').trim() || 'unknown',
      players: dedupeStrings((team.players || []).map((player) => player?.name)),
      sourceRowIndex: typeof team.sourceRowIndex === 'number' ? team.sourceRowIndex : undefined,
      sourceRowY: typeof team.sourceRowY === 'number' ? team.sourceRowY : undefined,
    }))
    .filter((team) => team.players.length > 0 || team.teamName || team.shipType);

  return backfillOpponentTeamShipTypes(baseTeams, {
    enemyShips: data.enemyShips,
  });
};

const toReachModifiers = (data: OCRExtractedData): string[] => (
  dedupeStrings([
    ...(data.reachModifiers || []).map((modifier) => modifier?.name),
    ...((data.hazards || []) as string[]),
  ])
);

export const buildTelemetryDraftPregamePreviewPatch = (
  currentMatch: Match | null | undefined,
  data: OCRExtractedData
): Partial<Match> | null => {
  if (!currentMatch || !isPregamePreviewDraft(currentMatch)) {
    return null;
  }

  const teammates = dedupeStrings((data.teammates || []).map((teammate) => teammate?.name));
  const opponentTeams = toOpponentTeams(data);
  const opponents = dedupeStrings(opponentTeams.flatMap((team) => team.players || []));
  const reachModifiers = toReachModifiers(data);
  const artifactSourceFromOcr = extractArtifactSourceFromOcrData(
    data.reachModifiers,
    data.hazards,
    data.artifactType
  );
  const artifactSource = String(
    artifactSourceFromOcr || currentMatch.artifactSource || ''
  ).trim() || undefined;
  const ship = String(data.playerShip?.shipType || currentMatch.ship || '').trim();

  const patch: Partial<Match> = {};

  if (ship && ship !== currentMatch.ship) {
    patch.ship = ship;
  }
  if (!sameStringArray(teammates, currentMatch.teammates || [])) {
    patch.teammates = teammates;
  }
  if (!sameStringArray(opponents, currentMatch.opponents || [])) {
    patch.opponents = opponents;
  }
  if (!sameStringArray(reachModifiers, currentMatch.reachModifiers || [])) {
    patch.reachModifiers = reachModifiers;
  }
  if (!sameOpponentTeams(opponentTeams, currentMatch.opponentTeams || [])) {
    patch.opponentTeams = opponentTeams;
  }

  const currentArtifactSource = String(currentMatch.artifactSource || '').trim() || undefined;
  if (artifactSource !== currentArtifactSource) {
    patch.artifactSource = artifactSource;
  }

  return Object.keys(patch).length > 0 ? patch : null;
};
