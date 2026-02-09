/**
 * OCR Parser
 * Text parsing, fuzzy matching, and data extraction utilities
 */

// Simple Levenshtein distance implementation
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

  // Exact match first
  const exactMatch = validValues.find(
    v => v.toUpperCase() === normalizedInput
  );
  if (exactMatch) return exactMatch;

  // Fuzzy match
  let bestMatch: string | null = null;
  let bestDistance = maxDistance + 1;

  for (const value of validValues) {
    const normalizedValue = value.toUpperCase();
    const dist = distance(normalizedInput, normalizedValue);

    // Scale max distance by string length for longer strings
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

  // Too short
  if (upper.length < 2) return true;

  // Exact noise word match
  if (NOISE_WORDS.includes(upper)) return true;

  // HUD pattern match
  if (HUD_PATTERNS.some(pattern => pattern.test(upper))) return true;

  // Pure numbers or single characters
  if (/^\d+$/.test(upper)) return true;
  if (/^[A-Z]$/.test(upper)) return true;

  return false;
}

/**
 * Clean extracted player name
 */
export function cleanPlayerName(rawName: string): string {
  let cleaned = rawName
    // Remove common OCR artifacts
    .replace(/[\[\](){}|\\\/]/g, '')
    // Remove leading/trailing punctuation
    .replace(/^[.,;:!?'"]+|[.,;:!?'"]+$/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Remove trailing numbers that look like ping/level
  cleaned = cleaned.replace(/\s+\d{2,4}$/, '');

  return cleaned;
}

/**
 * Extract reach modifiers from OCR text
 */
export function extractModifiers(text: string): ExtractedModifier[] {
  const modifiers: ExtractedModifier[] = [];
  const upperText = text.toUpperCase();

  // Check against modifier map
  for (const [ocrKey, modifierName] of Object.entries(REACH_MODIFIER_MAP)) {
    if (upperText.includes(ocrKey)) {
      modifiers.push({
        name: modifierName,
        confidence: 95,
        rawText: ocrKey,
      });
    }
  }

  // Fuzzy match against valid modifiers for anything missed
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

  // Direct map lookup
  for (const [ocrKey, shipName] of Object.entries(SHIP_MAP)) {
    if (upper.includes(ocrKey)) {
      return shipName;
    }
  }

  // Keyword-based detection
  for (const keyword of SHIP_KEYWORDS) {
    if (upper.includes(keyword)) {
      // Try to construct full ship name
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

  // Check Crew Hub indicators
  const crewHubScore = SCREENSHOT_TYPE_INDICATORS.crew_hub.filter(
    indicator => upper.includes(indicator)
  ).length;

  // Check Tactical Map indicators
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

  // Check saturation and luminance minimums
  if (s < 25 || l < 15 || l > 90) {
    return 'unknown';
  }

  // Red wraps around 0/360
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

  // Sort by Y coordinate
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const lines: OCRLine[] = [];

  for (const word of sorted) {
    const midY = (word.bbox.y0 + word.bbox.y1) / 2;

    // Find existing line that this word belongs to
    const existingLine = lines.find(line => {
      const lineMidY = (line.bbox.y0 + line.bbox.y1) / 2;
      return Math.abs(midY - lineMidY) < threshold;
    });

    if (existingLine) {
      existingLine.words.push(word);
      // Expand bounding box
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

  // Sort words within each line by X and build text
  for (const line of lines) {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    line.text = line.words.map(w => w.text).join(' ');
  }

  // Sort lines by Y
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

    // Skip noise
    if (isNoiseText(cleanedText)) continue;

    // Skip ship types
    if (extractShipType(cleanedText)) continue;

    // Skip very short names
    if (cleanedText.length < 3) continue;

    // Determine if teammate based on screen position
    const centerX = (line.bbox.x0 + line.bbox.x1) / 2;
    const isTeammate = isLeftSide !== undefined
      ? isLeftSide
      : centerX < screenWidth * 0.45;

    // Calculate confidence from word confidences
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

  // Merge player ship (prefer higher confidence)
  if (newData.playerShip) {
    if (!merged.playerShip || newData.playerShip.confidence > merged.playerShip.confidence) {
      merged.playerShip = newData.playerShip;
    }
  }

  // Merge reach modifiers (union, dedupe by name)
  if (newData.reachModifiers) {
    const existingNames = new Set((merged.reachModifiers || []).map(m => m.name));
    const newMods = newData.reachModifiers.filter(m => !existingNames.has(m.name));
    merged.reachModifiers = [...(merged.reachModifiers || []), ...newMods];
  }

  // Merge teammates (union, dedupe by name)
  if (newData.teammates) {
    const existingNames = new Set((merged.teammates || []).map(t => t.name.toLowerCase()));
    const newTeammates = newData.teammates.filter(
      t => !existingNames.has(t.name.toLowerCase())
    );
    merged.teammates = [...(merged.teammates || []), ...newTeammates];
  }

  // Merge opponent teams — cross-reference by color or name to combine
  // ship types (from map screen) with player lists (from crew hub)
  if (newData.opponentTeams) {
    const existingArr = [...(merged.opponentTeams || [])];

    for (const newTeam of newData.opponentTeams) {
      // Try to find matching existing team by color first, then name
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
        // Merge into existing team
        const existing = existingArr[matchIdx];
        // Prefer longer/non-empty team name
        if ((newTeam.teamName?.length || 0) > (existing.teamName?.length || 0)) {
          existing.teamName = newTeam.teamName;
        }
        // Fill in ship type if missing
        if (!existing.shipType && newTeam.shipType) {
          existing.shipType = newTeam.shipType;
        }
        // Fill in color if missing
        if ((!existing.color || existing.color === 'unknown') && newTeam.color && newTeam.color !== 'unknown') {
          existing.color = newTeam.color;
        }
        // Merge players (dedupe by name)
        const existingNames = new Set(existing.players.map(p => p.name.toLowerCase()));
        const newPlayers = newTeam.players.filter(p => !existingNames.has(p.name.toLowerCase()));
        existing.players = [...existing.players, ...newPlayers];
        // Keep higher confidence
        existing.confidence = Math.max(existing.confidence, newTeam.confidence);
      } else {
        // No match — add as new team
        existingArr.push({ ...newTeam, players: [...newTeam.players] });
      }
    }
    merged.opponentTeams = existingArr;
  }

  return merged;
}

/**
 * Calculate overall confidence score
 */
export function calculateOverallConfidence(data: Partial<OCRExtractedData>): number {
  const confidences: number[] = [];

  if (data.playerShip?.confidence) {
    confidences.push(data.playerShip.confidence);
  }

  for (const mod of data.reachModifiers || []) {
    confidences.push(mod.confidence);
  }

  for (const teammate of data.teammates || []) {
    confidences.push(teammate.confidence);
  }

  for (const team of data.opponentTeams || []) {
    confidences.push(team.confidence);
    for (const player of team.players) {
      confidences.push(player.confidence);
    }
  }

  if (confidences.length === 0) return 0;

  return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}

/**
 * Validate and clean extracted data
 */
export function validateExtractedData(data: OCRExtractedData): OCRExtractedData {
  // Filter out low-confidence teammates
  const validTeammates = data.teammates.filter(t => t.confidence >= 50);

  // Filter out low-confidence modifiers
  const validModifiers = data.reachModifiers.filter(m => m.confidence >= 60);

  // Clean opponent teams
  const validOpponentTeams = data.opponentTeams
    .filter(team => team.confidence >= 40)
    .map(team => ({
      ...team,
      players: team.players.filter(p => p.confidence >= 50),
    }))
    .filter(team => team.players.length > 0 || team.teamName);

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
