const NON_MATCH_MAP_PATTERNS = Object.freeze([
  'frontend',
  'gameentrypoint',
  'mainmenu',
  'lobbymap',
  'pregamelobby',
  'pregame',
  'waitingroom',
  'startingzone',
  'customlobby',
]);

const PREGAME_LOBBY_MAP_PATTERNS = Object.freeze([
  'lobbymap',
  'pregamelobby',
  'pregame',
  'waitingroom',
  'startingzone',
  'customlobby',
]);

const normalizeMapName = (mapName: unknown): string => {
  if (typeof mapName !== 'string') return '';
  return mapName.trim().toLowerCase();
};

export const isNonMatchMap = (mapName: unknown): boolean => {
  const normalized = normalizeMapName(mapName);
  if (!normalized) return false;
  return NON_MATCH_MAP_PATTERNS.some((pattern) => normalized.includes(pattern));
};

export const isPregameLobbyMap = (mapName: unknown): boolean => {
  const normalized = normalizeMapName(mapName);
  if (!normalized) return false;
  return PREGAME_LOBBY_MAP_PATTERNS.some((pattern) => normalized.includes(pattern));
};

export { NON_MATCH_MAP_PATTERNS, PREGAME_LOBBY_MAP_PATTERNS };
