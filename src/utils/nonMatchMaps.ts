const NON_MATCH_MAP_PATTERNS = Object.freeze([
  'frontend',
  'gameentrypoint',
  'mainmenu',
  'lobbymap',
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

export { NON_MATCH_MAP_PATTERNS };
