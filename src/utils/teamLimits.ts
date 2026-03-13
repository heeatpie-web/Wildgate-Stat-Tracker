import { getShipCapacity, UNKNOWN_PLAYER_LABELS } from '../types';
import { normalizeOcrName } from './stringUtils';

const toMaxTeammates = (capacity: number): number => {
  const normalizedCapacity = capacity > 1 ? capacity : 4;
  return Math.max(0, normalizedCapacity - 1);
};

export const getMaxTeammatesForShip = (shipType?: string | null): number =>
  toMaxTeammates(getShipCapacity(shipType || ''));

const toNameKey = (value: string): string =>
  normalizeOcrName(value).toLowerCase();

const isUnknownPlayerLabel = (value: string): boolean =>
  UNKNOWN_PLAYER_LABELS.has(toNameKey(value));

export const capTeammateNames = (
  names: Array<string | null | undefined> | null | undefined,
  shipType?: string | null
): string[] => {
  const maxTeammates = getMaxTeammatesForShip(shipType);
  if (!Array.isArray(names) || maxTeammates <= 0) return [];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const cleaned = String(raw || '').trim();
    if (!cleaned) continue;
    if (isUnknownPlayerLabel(cleaned)) continue;
    const key = toNameKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
    if (unique.length >= maxTeammates) break;
  }
  return unique;
};

export const capTeammatePlayers = <T extends { name?: string | null }>(
  teammates: T[] | null | undefined,
  shipType?: string | null
): T[] => {
  const maxTeammates = getMaxTeammatesForShip(shipType);
  if (!Array.isArray(teammates) || maxTeammates <= 0) return [];
  const unique: T[] = [];
  const seen = new Set<string>();
  for (const teammate of teammates) {
    if (!teammate) continue;
    const cleaned = String(teammate.name || '').trim();
    if (!cleaned) continue;
    if (isUnknownPlayerLabel(cleaned)) continue;
    const key = toNameKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...teammate, name: cleaned });
    if (unique.length >= maxTeammates) break;
  }
  return unique;
};

