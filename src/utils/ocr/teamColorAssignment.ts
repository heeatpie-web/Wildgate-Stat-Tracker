import { normalizeOcrName } from '../stringUtils';

export type TeamColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'cyan' | 'purple' | 'unknown';

const DEFAULT_COLOR_ORDER: TeamColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'cyan', 'purple'];
const COLOR_SET = new Set<TeamColor>([...DEFAULT_COLOR_ORDER, 'unknown']);

export interface TeamColorAssignmentInput {
  teamName?: string | null;
  shipType?: string | null;
  color?: string | null;
  players?: string[];
}

export interface TeamColorAssignmentOptions {
  playerColorHints?: Record<string, string>;
  colorOrder?: TeamColor[];
}

const normalizeKey = (value: string | null | undefined): string =>
  normalizeOcrName(String(value || '')).toLowerCase();

const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const toColorOrder = (input?: TeamColor[]): TeamColor[] => {
  const source = Array.isArray(input) && input.length > 0 ? input : DEFAULT_COLOR_ORDER;
  const order: TeamColor[] = [];
  source.forEach((raw) => {
    const normalized = normalizeTeamColor(raw);
    if (normalized === 'unknown') return;
    if (!order.includes(normalized)) order.push(normalized);
  });
  return order.length > 0 ? order : [...DEFAULT_COLOR_ORDER];
};

const inferColorFromPlayers = (
  players: string[],
  hints: Record<string, TeamColor>,
  colorOrder: TeamColor[]
): TeamColor => {
  const counts: Record<string, number> = {};
  players.forEach((player) => {
    const key = normalizeKey(player);
    if (!key) return;
    const hinted = hints[key];
    if (!hinted || hinted === 'unknown') return;
    counts[hinted] = (counts[hinted] || 0) + 1;
  });
  const ranked = Object.entries(counts).sort((a, b) => {
    const countDiff = b[1] - a[1];
    if (countDiff !== 0) return countDiff;
    return colorOrder.indexOf(a[0] as TeamColor) - colorOrder.indexOf(b[0] as TeamColor);
  });
  if (ranked.length === 0) return 'unknown';
  return normalizeTeamColor(ranked[0][0]);
};

const pickDeterministicFallback = (
  identityKey: string,
  used: Set<TeamColor>,
  colorOrder: TeamColor[]
): TeamColor => {
  const available = colorOrder.filter((color) => !used.has(color));
  if (available.length === 0) return 'unknown';
  const offset = stableHash(identityKey) % available.length;
  return available[offset];
};

export const normalizeTeamColor = (rawColor: string | null | undefined): TeamColor => {
  const normalized = String(rawColor || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (COLOR_SET.has(normalized as TeamColor)) {
    return normalized as TeamColor;
  }
  if (normalized.includes('red')) return 'red';
  if (normalized.includes('orange')) return 'orange';
  if (normalized.includes('yellow')) return 'yellow';
  if (normalized.includes('green')) return 'green';
  if (normalized.includes('blue')) return 'blue';
  if (normalized.includes('cyan')) return 'cyan';
  if (normalized.includes('purple')) return 'purple';
  return 'unknown';
};

export const buildPlayerColorHints = (
  sessionTeams: Record<string, string[]> | null | undefined
): Record<string, TeamColor> => {
  const hints: Record<string, TeamColor> = {};
  const entries = Object.entries(sessionTeams || {}).sort((a, b) => a[0].localeCompare(b[0]));
  entries.forEach(([rawColor, players]) => {
    const normalizedColor = normalizeTeamColor(rawColor);
    if (normalizedColor === 'unknown') return;
    if (!Array.isArray(players)) return;
    players.forEach((player) => {
      const key = normalizeKey(player);
      if (!key || hints[key]) return;
      hints[key] = normalizedColor;
    });
  });
  return hints;
};

export const buildPlayerColorHintsFromOpponentTeams = (
  teams: Array<{ color?: string | null; players?: string[] }> | null | undefined
): Record<string, TeamColor> => {
  const hints: Record<string, TeamColor> = {};
  (teams || []).forEach((team) => {
    const color = normalizeTeamColor(team?.color);
    if (color === 'unknown') return;
    (team?.players || []).forEach((player) => {
      const key = normalizeKey(player);
      if (!key || hints[key]) return;
      hints[key] = color;
    });
  });
  return hints;
};

export const assignDeterministicTeamColors = (
  teams: TeamColorAssignmentInput[],
  options: TeamColorAssignmentOptions = {}
): TeamColor[] => {
  if (!Array.isArray(teams) || teams.length === 0) return [];

  const colorOrder = toColorOrder(options.colorOrder);
  const normalizedHints: Record<string, TeamColor> = {};
  Object.entries(options.playerColorHints || {}).forEach(([rawName, rawColor]) => {
    const key = normalizeKey(rawName);
    if (!key) return;
    normalizedHints[key] = normalizeTeamColor(rawColor);
  });

  const descriptors = teams.map((team, index) => {
    const uniquePlayers = Array.from(new Set((team.players || []).map((name) => String(name || '').trim()).filter(Boolean)));
    const playerKeys = uniquePlayers.map((name) => normalizeKey(name)).filter(Boolean).sort();
    const teamNameKey = normalizeKey(team.teamName || '');
    const shipKey = normalizeKey(team.shipType || '');
    const identityKey = `${teamNameKey}|${shipKey}|${playerKeys.join(',')}`;
    const hintedColor = inferColorFromPlayers(uniquePlayers, normalizedHints, colorOrder);
    const parsedColor = normalizeTeamColor(team.color);
    const preferredColor = hintedColor !== 'unknown' ? hintedColor : parsedColor;
    return {
      index,
      identityKey: identityKey || `team_${index}`,
      preferredColor,
    };
  });

  const sorted = [...descriptors].sort((a, b) => {
    const keyDiff = a.identityKey.localeCompare(b.identityKey);
    if (keyDiff !== 0) return keyDiff;
    return a.index - b.index;
  });

  const used = new Set<TeamColor>();
  const assigned = new Array<TeamColor>(teams.length).fill('unknown');
  sorted.forEach((team) => {
    if (team.preferredColor !== 'unknown' && !used.has(team.preferredColor)) {
      assigned[team.index] = team.preferredColor;
      used.add(team.preferredColor);
      return;
    }
    const fallback = pickDeterministicFallback(team.identityKey, used, colorOrder);
    assigned[team.index] = fallback;
    if (fallback !== 'unknown') used.add(fallback);
  });

  return assigned;
};
