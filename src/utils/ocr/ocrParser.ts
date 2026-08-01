import type {
  OCRExtractedData,
  ScreenshotType,
  TeamColor,
  ExtractedPlayer,
  ExtractedModifier,
  ExtractedOpponentTeam,
  OCRLine,
  OCRWord,
} from './ocrTypes';
import {
  REACH_MODIFIER_MAP,
  SHIP_MAP,
  SHIP_KEYWORDS,
  NOISE_WORDS,
  HUD_PATTERNS,
  VALID_MODIFIERS,
  SCREENSHOT_TYPE_INDICATORS,
  TEAM_COLOR_RANGES,
} from './ocrMappings';
import { capTeammatePlayers } from '../teamLimits';
import { deduplicatePlayersByLikelyName } from './playerNameMatching';
import { normalizePipeSpacerPlayerName } from '../stringUtils';
import { isReachModifierUiPlayerNoise } from '../reachModifierUiNoise';
import { isKnownMapName } from '../constants';

function distance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

const MAX_OPPONENT_TEAMS = 8;
const MAX_OPPONENT_PLAYERS_PER_TEAM = 4;
const UNDERCREW_SHIP_BONUS_PHRASES = new Set([
  'SMALL CREW BONUS',
  'SMALLCREWBONUS',
  'SMALL CREWBONUS',
  'SMALLCREW BONUS',
  'REDUCED FIRES',
  'REDUCEDFIRES',
  'REDUCED FIRED',
  'REDUCEDFIRED',
]);

const isUnderCrewShipBonusText = (value?: string | null): boolean => {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  if (UNDERCREW_SHIP_BONUS_PHRASES.has(normalized)) return true;
  return isReachModifierUiPlayerNoise(value);
};

const capOpponentPlayers = (players: ExtractedPlayer[] = []): ExtractedPlayer[] => {
  if (!Array.isArray(players) || players.length <= MAX_OPPONENT_PLAYERS_PER_TEAM) return players || [];
  const ranked = [...players].sort((a, b) => {
    if ((b.confidence || 0) !== (a.confidence || 0)) return (b.confidence || 0) - (a.confidence || 0);
    return (a.name || '').localeCompare(b.name || '');
  });
  return ranked.slice(0, MAX_OPPONENT_PLAYERS_PER_TEAM);
};

const isUnknownTeamColor = (value?: TeamColor | string): boolean => {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'unknown';
};

// Lobby OCR sometimes assigns the ship-class line (e.g. "Hunter") to the team-name field
// instead of a real team label. Known ships and known map names are never meaningful team
// identities, so they get treated as placeholders alongside "Team 1" / "Unknown" etc.
const KNOWN_SHIP_TEAM_NAME_KEYS: ReadonlySet<string> = new Set(
  [...Object.keys(SHIP_MAP), ...Object.values(SHIP_MAP)]
    .map((name) => normalizeKey(String(name || '')))
    .filter(Boolean)
);

const isKnownShipTeamName = (value?: string): boolean => {
  const key = normalizeKey(String(value || ''));
  return Boolean(key) && KNOWN_SHIP_TEAM_NAME_KEYS.has(key);
};

export const isPlaceholderTeamName = (value?: string): boolean => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  if (/^team\s*\d*$/.test(normalized)) return true;
  if (/^enemy\s*team\s*\d*$/.test(normalized)) return true;
  if (/^unknown(\s*team)?$/.test(normalized)) return true;
  if (isKnownShipTeamName(normalized)) return true;
  if (isKnownMapName(normalized)) return true;
  return false;
};

const normalizedTeamName = (value?: string): string => normalizeKey(String(value || ''));

const sameOrNearTeamName = (a?: string, b?: string): boolean => {
  if (!a || !b) return false;
  if (isPlaceholderTeamName(a) || isPlaceholderTeamName(b)) return false;
  const aNorm = normalizedTeamName(a);
  const bNorm = normalizedTeamName(b);
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) return true;
  if (aNorm.length >= 4 && bNorm.length >= 4 && (aNorm.includes(bNorm) || bNorm.includes(aNorm))) return true;
  const threshold = Math.max(1, Math.min(2, Math.floor(Math.min(aNorm.length, bNorm.length) / 5)));
  return distance(aNorm, bNorm) <= threshold;
};

const teamRosterOverlapRatio = (a: ExtractedOpponentTeam, b: ExtractedOpponentTeam): number => {
  const aPlayers = new Set((a.players || []).map((p) => normalizeKey(p.name)).filter(Boolean));
  const bPlayers = new Set((b.players || []).map((p) => normalizeKey(p.name)).filter(Boolean));
  if (aPlayers.size === 0 || bPlayers.size === 0) return 0;
  let overlap = 0;
  aPlayers.forEach((key) => {
    if (bPlayers.has(key)) overlap++;
  });
  return overlap / Math.min(aPlayers.size, bPlayers.size);
};

type EnemyShipEntry = OCRExtractedData['enemyShips'][number];

const hasMeaningfulEnemyTeamName = (value?: string): boolean => {
  const trimmed = String(value || '').trim();
  return !!trimmed && !isPlaceholderTeamName(trimmed);
};

const normalizeEnemyShipKey = (
  entry: EnemyShipEntry,
  anonymousCounts: Map<string, number>
): { key: string; shipType: string } | null => {
  const normalizedType = String(entry.shipType || '').trim();
  if (!normalizedType) return null;
  const shipTypeKey = normalizedType.toLowerCase();
  const rawTeamName = String(entry.teamName || '').trim();
  const teamNameKey = hasMeaningfulEnemyTeamName(rawTeamName) ? normalizedTeamName(rawTeamName) : '';
  const colorKey = String(entry.color || 'unknown').trim().toLowerCase();
  if (teamNameKey) {
    return { key: `team:${teamNameKey}`, shipType: normalizedType };
  }
  if (colorKey && colorKey !== 'unknown') {
    return { key: `color:${colorKey}:${shipTypeKey}`, shipType: normalizedType };
  }

  // Keep slot-level multiplicity when OCR only yields anonymous entries.
  const nextIndex = (anonymousCounts.get(shipTypeKey) || 0) + 1;
  anonymousCounts.set(shipTypeKey, nextIndex);
  return { key: `anon:${shipTypeKey}:${nextIndex}`, shipType: normalizedType };
};

const shouldPreferEnemyShipEntry = (current: EnemyShipEntry, candidate: EnemyShipEntry): boolean => {
  if (current.color === 'unknown' && candidate.color !== 'unknown') return true;
  const currentHasTeamName = hasMeaningfulEnemyTeamName(current.teamName);
  const candidateHasTeamName = hasMeaningfulEnemyTeamName(candidate.teamName);
  if (!currentHasTeamName && candidateHasTeamName) return true;
  if (currentHasTeamName && candidateHasTeamName && (current.teamName?.length || 0) < (candidate.teamName?.length || 0)) {
    return true;
  }
  return false;
};

const findBestOpponentTeamMatchIndex = (
  existingArr: ExtractedOpponentTeam[],
  newTeam: ExtractedOpponentTeam
): number => {
  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < existingArr.length; i++) {
    const existing = existingArr[i];
    const hasStrongNameMatch = sameOrNearTeamName(existing.teamName, newTeam.teamName);
    const bothHaveNamedTeam = !isPlaceholderTeamName(existing.teamName) && !isPlaceholderTeamName(newTeam.teamName);
    const colorMatch = !isUnknownTeamColor(existing.color) && existing.color === newTeam.color;
    const rosterOverlap = teamRosterOverlapRatio(existing, newTeam);

    const oneHasNoPlayers = (newTeam.players?.length ?? 0) === 0 || (existing.players?.length ?? 0) === 0;

    // Guardrail: if both teams have strong, different names and no roster/color/player evidence, do not merge.
    if (bothHaveNamedTeam && !hasStrongNameMatch && rosterOverlap <= 0 && !colorMatch && !oneHasNoPlayers) {
      continue;
    }

    let score = 0;
    if (hasStrongNameMatch) score += 100;
    if (colorMatch) score += 24;
    if (rosterOverlap > 0) score += 40 * rosterOverlap;

    // Require enough evidence for fallback matches when names are weak/missing.
    // Allow color-only match when one side has no players — this happens when merging
    // tactical-map OCR (which reads ship/color but has no player lists) with crew-hub OCR.
    // In Wildgate each team has a unique color per match, so color alone disambiguates.
    const fallbackAcceptable = hasStrongNameMatch
      || (colorMatch && rosterOverlap > 0)
      || (colorMatch && oneHasNoPlayers)
      || rosterOverlap >= 0.5;

    if (!fallbackAcceptable) continue;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
};

function normalizeKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Fuzzy match a string against a list of valid values
 * @param input - The OCR-extracted string
 * @param validValues - Array of valid values to match against
 * @param maxDistance - Maximum edit distance for a match (default: 2)
 * @returns The best match or null if no close match found
 */
export function fuzzyMatch(
  input: string,
  validValues: string[],
  maxDistance: number = 2
): string | null {
  if (!input || input.length < 2) return null;

  const normalizedInput = input.toUpperCase().trim();
  const exactMatch = validValues.find(
    v => v.toUpperCase() === normalizedInput
  );
  if (exactMatch) return exactMatch;
  let bestMatch: string | null = null;
  let bestDistance = maxDistance + 1;

  for (const value of validValues) {
    const normalizedValue = value.toUpperCase();
    const dist = distance(normalizedInput, normalizedValue);
    const scaledMax = Math.max(maxDistance, Math.min(3, Math.floor(value.length / 5)));

    if (dist < bestDistance && dist <= scaledMax) {
      bestDistance = dist;
      bestMatch = value;
    }
  }

  return bestMatch;
}

/**
 * Check if text is likely noise/UI element
 */
export function isNoiseText(text: string): boolean {
  if (normalizePipeSpacerPlayerName(text)) return false;
  const upper = text.toUpperCase().trim();
  if (upper.length < 2) return true;
  if (isUnderCrewShipBonusText(text)) return true;
  if (NOISE_WORDS.includes(upper)) return true;
  if (HUD_PATTERNS.some(pattern => pattern.test(upper))) return true;
  if (/^\d+$/.test(upper)) return true;
  if (/^[A-Z]$/.test(upper)) return true;

  return false;
}

/**
 * Clean extracted player name
 */
export function cleanPlayerName(rawName: string): string {
  const specialPipeName = normalizePipeSpacerPlayerName(rawName);
  if (specialPipeName) return specialPipeName;

  let cleaned = rawName
    .replace(/[\[\](){}|\\\/]/g, '')
    .replace(/^[.,;:!?'"]+|[.,;:!?'"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = cleaned.replace(/\s+\d{2,4}$/, '');

  return isUnderCrewShipBonusText(cleaned) ? '' : cleaned;
}

/**
 * Extract reach modifiers from OCR text
 */
export function extractModifiers(text: string): ExtractedModifier[] {
  const modifiers: ExtractedModifier[] = [];
  const upperText = text.toUpperCase();
  for (const [ocrKey, modifierName] of Object.entries(REACH_MODIFIER_MAP)) {
    if (upperText.includes(ocrKey)) {
      modifiers.push({
        name: modifierName,
        confidence: 95,
        rawText: ocrKey,
      });
    }
  }
  const words = upperText.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const twoWordCombo = `${words[i]} ${words[i + 1]}`;
    const match = fuzzyMatch(twoWordCombo, VALID_MODIFIERS, 2);
    if (match && !modifiers.some(m => m.name === match)) {
      modifiers.push({
        name: match,
        confidence: 80,
        rawText: twoWordCombo,
      });
    }
  }

  return modifiers;
}

/**
 * Extract ship type from text
 */
export function extractShipType(text: string): string | null {
  const upper = text.toUpperCase();
  for (const [ocrKey, shipName] of Object.entries(SHIP_MAP)) {
    if (upper.includes(ocrKey)) {
      return shipName;
    }
  }
  for (const keyword of SHIP_KEYWORDS) {
    if (upper.includes(keyword)) {
      if (upper.includes('HUNTER')) return 'Hunter';
      if (upper.includes('BASTION')) return 'Bastion';
      if (upper.includes('PRIVATEER')) return 'Privateer';
      if (upper.includes('BATTLE') && upper.includes('SCOUT')) return 'Battle Scout';
      if (upper.includes('SCOUT')) return 'Scout';
      if (upper.includes('SOLO') && upper.includes('OUTLAW')) return 'Solo Outlaw';
      if (upper.includes('OUTLAW')) return 'Outlaw';
    }
  }

  return null;
}

const extractShipMetadataCandidate = (value: string): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withoutBrackets = raw.replace(/^\[+|\]+$/g, '').trim();
  const withoutCapacity = withoutBrackets.replace(/\s*\(\s*\d+\s*player[s]?\s*\)\s*$/i, '').trim();
  const fromShipScan = extractShipType(withoutCapacity);
  if (!fromShipScan) return null;
  const shipTokenCount = withoutCapacity.split(/\s+/).filter(Boolean).length;
  if (/\bship\b/i.test(withoutBrackets) || /\(\s*\d+\s*player/i.test(withoutBrackets) || shipTokenCount <= 3) {
    return fromShipScan;
  }
  return null;
};

/**
 * Detect screenshot type from text content
 */
export function detectScreenshotType(text: string): ScreenshotType {
  const upper = text.toUpperCase();
  const crewHubScore = SCREENSHOT_TYPE_INDICATORS.crew_hub.filter(
    indicator => upper.includes(indicator)
  ).length;
  const tacticalScore = SCREENSHOT_TYPE_INDICATORS.tactical_map.filter(
    indicator => upper.includes(indicator)
  ).length;

  if (crewHubScore > tacticalScore && crewHubScore >= 1) {
    return 'crew_hub';
  }
  if (tacticalScore > crewHubScore && tacticalScore >= 1) {
    return 'tactical_map';
  }

  return 'unknown';
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Detect team color from RGB values
 */
export function detectTeamColor(r: number, g: number, b: number): TeamColor {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (s < 25 || l < 15 || l > 90) {
    return 'unknown';
  }
  if ((h >= 340 || h < 20) && s > 40) return 'red';
  if (h >= 15 && h < 40 && s > 40) return 'orange';
  const isDarkOliveGreen = h >= 56 && h < 66 && s > 40 && l <= 42;
  if (isDarkOliveGreen) return 'green';
  if (h >= 40 && h < 66 && s > 40 && l >= 40) return 'yellow';
  if (h >= 66 && h < 150 && s > 30) return 'green';
  if (h >= 150 && h < 210 && s > 30) return 'cyan';
  if (h >= 210 && h < 270 && s > 30) return 'blue';
  if (h >= 270 && h < 340 && s > 30) return 'purple';

  return 'unknown';
}

/**
 * Group OCR words into lines based on Y-coordinate proximity
 */
export function groupWordsIntoLines(words: OCRWord[], threshold: number = 15): OCRLine[] {
  if (!words || words.length === 0) return [];
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const lines: OCRLine[] = [];

  for (const word of sorted) {
    const midY = (word.bbox.y0 + word.bbox.y1) / 2;
    const existingLine = lines.find(line => {
      const lineMidY = (line.bbox.y0 + line.bbox.y1) / 2;
      return Math.abs(midY - lineMidY) < threshold;
    });

    if (existingLine) {
      existingLine.words.push(word);
      existingLine.bbox.x0 = Math.min(existingLine.bbox.x0, word.bbox.x0);
      existingLine.bbox.y0 = Math.min(existingLine.bbox.y0, word.bbox.y0);
      existingLine.bbox.x1 = Math.max(existingLine.bbox.x1, word.bbox.x1);
      existingLine.bbox.y1 = Math.max(existingLine.bbox.y1, word.bbox.y1);
    } else {
      lines.push({
        text: '',
        words: [word],
        bbox: { ...word.bbox },
      });
    }
  }
  for (const line of lines) {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    line.text = line.words.map(w => w.text).join(' ');
  }
  lines.sort((a, b) => a.bbox.y0 - b.bbox.y0);

  return lines;
}

/**
 * Parse players from OCR lines
 */
export function parsePlayersFromLines(
  lines: OCRLine[],
  screenWidth: number,
  isLeftSide?: boolean
): ExtractedPlayer[] {
  const players: ExtractedPlayer[] = [];

  for (const line of lines) {
    const cleanedText = cleanPlayerName(line.text);
    if (isNoiseText(cleanedText)) continue;
    if (extractShipType(cleanedText)) continue;
    if (cleanedText.length < 3) continue;
    const centerX = (line.bbox.x0 + line.bbox.x1) / 2;
    const isTeammate = isLeftSide !== undefined
      ? isLeftSide
      : (Number.isFinite(screenWidth) && screenWidth > 0) ? centerX < screenWidth * 0.45 : true;
    const avgConfidence = line.words.reduce((sum, w) => sum + w.confidence, 0) / line.words.length;

    players.push({
      name: cleanedText,
      confidence: avgConfidence,
      isTeammate,
    });
  }

  return players;
}

/**
 * Merge OCR data from multiple captures
 */
export function mergeOCRData(
  existing: Partial<OCRExtractedData>,
  newData: Partial<OCRExtractedData>
): Partial<OCRExtractedData> {
  const merged: Partial<OCRExtractedData> = { ...existing };
  const normalizeTeamLabel = (value?: string | null): string => {
    const text = String(value || '').trim();
    return text && text.toLowerCase() !== 'your team' ? text : '';
  };
  const normalizeShipLabel = (value?: string | null, shipType?: string | null): string => {
    const strippedCrewSuffix = String(value || '')
      .replace(/\s*['’]s\s+crew\s*$/i, '')
      .trim();
    if (!strippedCrewSuffix) return '';
    const lowered = strippedCrewSuffix.toLowerCase();
    if (lowered === 'your team' || lowered === 'friendly team' || lowered === 'my crew') return '';
    const shipTypeKey = String(shipType || '')
      .replace(/\s*\(\s*\d+\s*player[s]?\s*\)\s*$/i, '')
      .trim()
      .toLowerCase();
    if (shipTypeKey && lowered === shipTypeKey) return '';
    return strippedCrewSuffix;
  };
  if (newData.playerShip) {
    const existingShip = merged.playerShip;
    const incomingShip = {
      ...newData.playerShip,
      teamName: normalizeTeamLabel(newData.playerShip.teamName) || undefined,
    };
    if (!existingShip || incomingShip.confidence >= (existingShip.confidence || 0) + 3) {
      merged.playerShip = {
        ...incomingShip,
        teamName: incomingShip.teamName || normalizeTeamLabel(existingShip?.teamName) || undefined,
      };
    } else if (!normalizeTeamLabel(existingShip.teamName) && incomingShip.teamName) {
      merged.playerShip = {
        ...existingShip,
        teamName: incomingShip.teamName,
      };
    }
  }
  const incomingPlayerTeamName = normalizeTeamLabel(newData.playerTeamName);
  const existingPlayerTeamName = normalizeTeamLabel(merged.playerTeamName);
  const playerShipTeamName = normalizeTeamLabel(merged.playerShip?.teamName);
  merged.playerTeamName = incomingPlayerTeamName || existingPlayerTeamName || playerShipTeamName || undefined;
  const shipTypeHint = newData.playerShip?.shipType || merged.playerShip?.shipType;
  const incomingPlayerShipName = normalizeShipLabel(newData.playerShipName, shipTypeHint);
  const existingPlayerShipName = normalizeShipLabel(merged.playerShipName, shipTypeHint);
  const fallbackShipName = normalizeShipLabel(
    incomingPlayerTeamName || existingPlayerTeamName || playerShipTeamName,
    shipTypeHint
  );
  merged.playerShipName = incomingPlayerShipName || existingPlayerShipName || fallbackShipName || undefined;
  if (newData.reachModifiers) {
    const existingMods = new Map<string, ExtractedModifier>();
    for (const mod of merged.reachModifiers || []) {
      existingMods.set(normalizeKey(mod.name), mod);
    }
    for (const mod of newData.reachModifiers) {
      const key = normalizeKey(mod.name);
      const prev = existingMods.get(key);
      if (!prev || mod.confidence > prev.confidence) {
        existingMods.set(key, mod);
      }
    }
    merged.reachModifiers = Array.from(existingMods.values());
  }
  if (newData.teammates) {
    const mergedPlayers = deduplicatePlayersByLikelyName([
      ...(merged.teammates || []),
      ...newData.teammates,
    ]);
    const shipForTeammateCap = newData.playerShip?.shipType || merged.playerShip?.shipType;
    merged.teammates = capTeammatePlayers(mergedPlayers, shipForTeammateCap);
  }
  if (newData.opponentTeams) {
    const existingArr = [...(merged.opponentTeams || [])];

    for (const newTeam of newData.opponentTeams) {
      const matchIdx = findBestOpponentTeamMatchIndex(existingArr, newTeam);

      if (matchIdx >= 0) {
        const existing = existingArr[matchIdx];
        if ((newTeam.teamName?.length || 0) > (existing.teamName?.length || 0)) {
          existing.teamName = newTeam.teamName;
        }
        if (!existing.shipType && newTeam.shipType) {
          existing.shipType = newTeam.shipType;
        }
        if ((!existing.color || existing.color === 'unknown') && newTeam.color && newTeam.color !== 'unknown') {
          existing.color = newTeam.color;
        }
        existing.players = capOpponentPlayers(
          deduplicatePlayersByLikelyName([
            ...(existing.players || []),
            ...(newTeam.players || []),
          ])
        );
        existing.confidence = Math.max(existing.confidence, newTeam.confidence);
      } else {
        existingArr.push({
          ...newTeam,
          players: capOpponentPlayers(deduplicatePlayersByLikelyName([...(newTeam.players || [])])),
        });
      }
    }
    merged.opponentTeams = existingArr
      .map((team) => ({
        ...team,
        players: capOpponentPlayers(deduplicatePlayersByLikelyName(team.players || [])),
      }))
      .sort((a, b) => {
        const bySize = (b.players?.length || 0) - (a.players?.length || 0);
        if (bySize !== 0) return bySize;
        return (b.confidence || 0) - (a.confidence || 0);
      })
      .slice(0, MAX_OPPONENT_TEAMS);
  }
  if (newData.enemyShips) {
    const enemyShipMap = new Map<string, EnemyShipEntry>();
    const addEntry = (entry: EnemyShipEntry, anonymousCounts: Map<string, number>) => {
      const normalized = normalizeEnemyShipKey(entry, anonymousCounts);
      if (!normalized) return;
      const existingEntry = enemyShipMap.get(normalized.key);
      const storedEntry: EnemyShipEntry = {
        ...entry,
        shipType: normalized.shipType,
        teamName: String(entry.teamName || '').trim(),
      };
      if (!existingEntry) {
        enemyShipMap.set(normalized.key, storedEntry);
        return;
      }
      if (shouldPreferEnemyShipEntry(existingEntry, storedEntry)) {
        enemyShipMap.set(normalized.key, storedEntry);
      }
    };
    const existingAnonymousCounts = new Map<string, number>();
    const incomingAnonymousCounts = new Map<string, number>();
    (merged.enemyShips || []).forEach((entry) => addEntry(entry, existingAnonymousCounts));
    newData.enemyShips.forEach((entry) => addEntry(entry, incomingAnonymousCounts));
    merged.enemyShips = Array.from(enemyShipMap.values());
  }
  if (newData.hazards) {
    const existing = new Set((merged.hazards || []).map(h => h.toLowerCase()));
    const next = [...(merged.hazards || [])];
    newData.hazards.forEach(h => {
      if (!existing.has(h.toLowerCase())) next.push(h);
    });
    merged.hazards = next;
  }
  if (newData.spectators) {
    const existing = new Set((merged.spectators || []).map(s => s.toLowerCase()));
    const next = [...(merged.spectators || [])];
    newData.spectators.forEach(s => {
      if (s && !existing.has(s.toLowerCase())) next.push(s);
    });
    merged.spectators = next;
  }

  return merged;
}

/**
 * Calculate overall confidence score
 */
export function calculateOverallConfidence(data: Partial<OCRExtractedData>): number {
  const weighted: Array<{ value: number; weight: number }> = [];

  if (data.playerShip?.confidence) {
    weighted.push({ value: data.playerShip.confidence, weight: 2.0 });
  }

  for (const mod of data.reachModifiers || []) {
    weighted.push({ value: mod.confidence, weight: 1.0 });
  }

  for (const teammate of data.teammates || []) {
    weighted.push({ value: teammate.confidence, weight: 1.0 });
  }

  for (const team of data.opponentTeams || []) {
    weighted.push({ value: team.confidence, weight: 1.2 });
    for (const player of team.players) {
      weighted.push({ value: player.confidence, weight: 0.9 });
    }
  }

  if (weighted.length === 0) return 0;

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const total = weighted.reduce((sum, w) => sum + (w.value * w.weight), 0);
  return totalWeight > 0 ? total / totalWeight : 0;
}

/**
 * Validate and clean extracted data
 */
export function validateExtractedData(data: OCRExtractedData): OCRExtractedData {
  // Build a set of normalized real team name keys for team-name-as-player heuristic filtering.
  // Only use non-placeholder team names with enough length to be meaningful.
  const knownTeamNameKeys = new Set<string>(
    (data.opponentTeams || [])
      .filter(team => !isPlaceholderTeamName(team.teamName))
      .map(team => normalizeKey(team.teamName))
      .filter(key => key.length >= 4)
  );

  const validTeammates = capTeammatePlayers(
    data.teammates
      .filter(t => t.confidence >= 50)
      .filter(t => !isUnderCrewShipBonusText(t.name)),
    data.playerShip?.shipType
  );
  const validModifiers = data.reachModifiers.filter(m => m.confidence >= 60);
  const validOpponentTeams = data.opponentTeams
    .filter(team => team.confidence >= 0)
    .map(team => {
      let inferredShipType = String(team.shipType || '').trim();
      const filteredPlayers = team.players
        .filter(p => p.confidence >= 0)
        .filter(p => !isUnderCrewShipBonusText(p.name))
        .filter(p => {
          // Heuristic: skip players whose normalized name exactly matches a known team name label.
          // This prevents OCR misclassifying a team banner as a player entry.
          // Exception: solo-ship pattern where the player's handle equals their own team name.
          if (!p.name || knownTeamNameKeys.size === 0) return true;
          const playerKey = normalizeKey(p.name);
          if (playerKey.length < 4) return true;
          if (knownTeamNameKeys.has(playerKey)) {
            // Allow if the match is only against this team's own name (solo-ship pattern).
            if (!isPlaceholderTeamName(team.teamName) && normalizeKey(team.teamName) === playerKey) return true;
            return false;
          }
          return true;
        })
        .filter(p => {
          const shipCandidate = extractShipMetadataCandidate(p.name || '');
          if (!shipCandidate) return true;
          if (!inferredShipType) {
            inferredShipType = shipCandidate;
          }
          return false;
        });
      return {
        ...team,
        shipType: inferredShipType,
        players: capOpponentPlayers(filteredPlayers),
      };
    })
    .filter(team => team.players.length > 0 || team.teamName)
    .sort((a, b) => {
      const bySize = b.players.length - a.players.length;
      if (bySize !== 0) return bySize;
      return (b.confidence || 0) - (a.confidence || 0);
    })
    .slice(0, MAX_OPPONENT_TEAMS);

  return {
    ...data,
    teammates: validTeammates,
    reachModifiers: validModifiers,
    opponentTeams: validOpponentTeams,
    overallConfidence: calculateOverallConfidence({
      ...data,
      teammates: validTeammates,
      reachModifiers: validModifiers,
      opponentTeams: validOpponentTeams,
    }),
  };
}

