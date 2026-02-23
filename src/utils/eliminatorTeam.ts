import type { OpponentTeam } from '../types';
import { normalizeTeamColor } from './ocr/teamColorAssignment';
import { normalizeOcrName } from './stringUtils';

type EliminatorTeam = Pick<OpponentTeam, 'teamName' | 'color'>;

const toComparableTeamName = (value: string | null | undefined): string =>
  normalizeOcrName(String(value || '')).toLowerCase();

const toDisplayColor = (color: string): string =>
  color ? `${color.charAt(0).toUpperCase()}${color.slice(1)} Team` : '';

export const getPrimaryEliminatedByTeamValue = (team: EliminatorTeam): string => {
  const parsedColor = normalizeTeamColor(team.color);
  if (parsedColor !== 'unknown') return parsedColor;
  return String(team.teamName || '').trim();
};

export const getEliminatorDisplayLabel = (team: EliminatorTeam): string => {
  const parsedColor = normalizeTeamColor(team.color);
  if (parsedColor !== 'unknown') {
    return toDisplayColor(parsedColor);
  }
  return String(team.teamName || '').trim();
};

export const isEliminatedByTeamMatch = (
  eliminatedByTeam: string | null | undefined,
  team: EliminatorTeam
): boolean => {
  const storedValue = String(eliminatedByTeam || '').trim();
  if (!storedValue) return false;

  const storedColor = normalizeTeamColor(storedValue);
  if (storedColor !== 'unknown') {
    return normalizeTeamColor(team.color) === storedColor;
  }

  const storedName = toComparableTeamName(storedValue);
  const teamName = toComparableTeamName(team.teamName);
  return !!storedName && !!teamName && storedName === teamName;
};
