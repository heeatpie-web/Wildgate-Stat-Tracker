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

const MAX_OPPONENT_TEAMS = 4;
const MAX_OPPONENT_PLAYERS_PER_TEAM = 4;

const capOpponentPlayers = (players: ExtractedPlayer[] = []): ExtractedPlayer[] => {
  if (!Array.isArray(players) || players.length <= MAX_OPPONENT_PLAYERS_PER_TEAM) return players || [];
  const ranked = [...players].sort((a, b) => {
    if ((b.confidence || 0) !== (a.confidence || 0)) return (b.confidence || 0) - (a.confidence || 0);
    return (a.name || '').localeCompare(b.name || '');
  });
  return ranked.slice(0, MAX_OPPONENT_PLAYERS_PER_TEAM);
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
    const scaledMax = Math.max(maxDistance, Math.floor(value.length / 4));

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
  const upper = text.toUpperCase().trim();
  if (upper.length < 2) return true;
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
  let cleaned = rawName
    .replace(/[\[\](){}|\\\/]/g, '')
    .replace(/^[.,;:!?'"]+|[.,;:!?'"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = cleaned.replace(/\s+\d{2,4}$/, '');

  return cleaned;
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
      if (upper.includes('HUNTER')) return 'Hunter (4 Player)';
      if (upper.includes('BASTION')) return 'Bastion (4 Player)';
      if (upper.includes('PRIVATEER')) return 'Privateer (4 Player)';
      if (upper.includes('SCOUT')) return 'Scout (3 Player)';
      if (upper.includes('SOLO') && upper.includes('OUTLAW')) return 'Solo Outlaw';
      if (upper.includes('OUTLAW')) return 'Outlaw (2 Player)';
    }
  }

  return null;
}

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
  if (h >= 15 && h < 45 && s > 40) return 'orange';
  if (h >= 45 && h < 75 && s > 40) return 'yellow';
  if (h >= 75 && h < 150 && s > 30) return 'green';
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
      : centerX < screenWidth * 0.45;
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
  if (newData.playerShip) {
    if (!merged.playerShip || newData.playerShip.confidence >= (merged.playerShip.confidence || 0) + 3) {
      merged.playerShip = newData.playerShip;
    }
  }
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
    const existingPlayers = new Map<string, ExtractedPlayer>();
    for (const player of merged.teammates || []) {
      existingPlayers.set(normalizeKey(player.name), player);
    }
    for (const player of newData.teammates) {
      const key = normalizeKey(player.name);
      const prev = existingPlayers.get(key);
      if (!prev || player.confidence > prev.confidence) {
        existingPlayers.set(key, player);
      }
    }
    const shipForTeammateCap = newData.playerShip?.shipType || merged.playerShip?.shipType;
    merged.teammates = capTeammatePlayers(Array.from(existingPlayers.values()), shipForTeammateCap);
  }
  if (newData.opponentTeams) {
    const existingArr = [...(merged.opponentTeams || [])];

    for (const newTeam of newData.opponentTeams) {
      let matchIdx = -1;
      if (newTeam.color && newTeam.color !== 'unknown') {
        matchIdx = existingArr.findIndex(t => t.color === newTeam.color);
      }
      if (matchIdx < 0 && newTeam.teamName) {
        matchIdx = existingArr.findIndex(
          t => t.teamName.toLowerCase() === newTeam.teamName.toLowerCase()
        );
      }

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
        const existingPlayers = new Map<string, ExtractedPlayer>();
        for (const p of existing.players) {
          existingPlayers.set(normalizeKey(p.name), p);
        }
        for (const p of newTeam.players) {
          const key = normalizeKey(p.name);
          const prev = existingPlayers.get(key);
          if (!prev || p.confidence > prev.confidence) {
            existingPlayers.set(key, p);
          }
        }
        existing.players = capOpponentPlayers(Array.from(existingPlayers.values()));
        existing.confidence = Math.max(existing.confidence, newTeam.confidence);
      } else {
        existingArr.push({ ...newTeam, players: capOpponentPlayers([...(newTeam.players || [])]) });
      }
    }
    merged.opponentTeams = existingArr
      .map((team) => ({
        ...team,
        players: capOpponentPlayers(team.players || []),
      }))
      .sort((a, b) => {
        const bySize = (b.players?.length || 0) - (a.players?.length || 0);
        if (bySize !== 0) return bySize;
        return (b.confidence || 0) - (a.confidence || 0);
      })
      .slice(0, MAX_OPPONENT_TEAMS);
  }
  if (newData.hazards) {
    const existing = new Set((merged.hazards || []).map(h => h.toLowerCase()));
    const next = [...(merged.hazards || [])];
    newData.hazards.forEach(h => {
      if (!existing.has(h.toLowerCase())) next.push(h);
    });
    merged.hazards = next;
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
  const validTeammates = capTeammatePlayers(
    data.teammates.filter(t => t.confidence >= 50),
    data.playerShip?.shipType
  );
  const validModifiers = data.reachModifiers.filter(m => m.confidence >= 60);
  const validOpponentTeams = data.opponentTeams
    .filter(team => team.confidence >= 40)
    .map(team => ({
      ...team,
      players: capOpponentPlayers(team.players.filter(p => p.confidence >= 50)),
    }))
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

