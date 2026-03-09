/**
 * Map Screen (Tactical Map) Extractor
 *
 * Extracts data from Tactical Map screenshots:
 * - YOUR SHIP: Top-left, team name + ship type
 * - ENEMY SHIPS: Top-right, colored boxes with team name + ship type
 * - HAZARDS: Right panel, list of map hazards
 * - Player List: Bottom-left player names
 */

const { detectBadgeColorNearText, detectColorInRegion } = require('./colorUtils.cjs');
const HAZARD_CATALOG = require('./hazardCatalog.json');

/**
 * Screen layout constants (percentage-based)
 */
const LAYOUT = {
  // YOUR SHIP region (top-left)
  YOUR_SHIP: {
    xMin: 0,
    xMax: 0.30,
    yMin: 0,
    yMax: 0.25,
  },
  // ENEMY SHIPS region (top-right).
  // Text starts at x≈85%; x=60-83% contains badge/icon noise — exclude it.
  ENEMY_SHIPS: {
    xMin: 0.83,
    xMax: 1.0,
    yMin: 0.06, // start below game perf HUD (FPS/GPU/CPU/LAT bar lives at ~0-3%)
    yMax: 0.10,
  },
  ENEMY_SHIPS2: {
    xMin: 0.83,
    xMax: 1.0,
    yMin: 0.10,
    yMax: 0.20,
  },
  ENEMY_SHIPS3: {
    xMin: 0.83,
    xMax: 1.0,
    yMin: 0.20,
    yMax: 0.30,
  },
  ENEMY_SHIPS4: {
    xMin: 0.83,
    xMax: 1.0,
    yMin: 0.30,
    yMax: 0.40,
  },
  // HAZARDS region (right panel only — modifier list runs y≈28-63%;
  // At 1080p the list starts at ~31% of screen height; at 4K ~38%.
  // Widening to 0.28 captures all items at both resolutions.
  // ARTIFACT SPECIAL LOOT and WILDGATE RESOURCES below 0.63 are map POI labels)
  HAZARDS: {
    xMin: 0.60,
    xMax: 1.0,
    yMin: 0.28,
    yMax: 0.63,
  },
  // MAP CENTER dead-zone: the actual game map graphic — no useful text here.
  // x=28-60%, y=6-72%  (left UI strip and right panel are outside this box)
  MAP_CENTER: {
    xMin: 0.28,
    xMax: 0.60,
    yMin: 0.06,
    yMax: 0.72,
  },
  // Player list (bottom-left)
  PLAYERS: {
    xMin: 0,
    xMax: 0.40,
    yMin: 0.70,
    yMax: 1.0,
  },
};

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function sanitizeBounds(input, fallback) {
  const source = (input && typeof input === 'object') ? input : {};
  let xMin = clamp01(source.xMin, fallback.xMin);
  let xMax = clamp01(source.xMax, fallback.xMax);
  let yMin = clamp01(source.yMin, fallback.yMin);
  let yMax = clamp01(source.yMax, fallback.yMax);

  if (xMin >= xMax) {
    if (xMin >= 1) xMin = Math.max(0, xMax - 0.01);
    else xMax = Math.min(1, xMin + 0.01);
  }
  if (yMin >= yMax) {
    if (yMin >= 1) yMin = Math.max(0, yMax - 0.01);
    else yMax = Math.min(1, yMin + 0.01);
  }

  return { xMin, xMax, yMin, yMax };
}

function resolveMapLayout(layoutOverrides) {
  const source = (layoutOverrides && typeof layoutOverrides === 'object') ? layoutOverrides : {};
  const resolved = {
    YOUR_SHIP: sanitizeBounds(source.yourShip, LAYOUT.YOUR_SHIP),
    ENEMY_SHIPS: sanitizeBounds(source.enemyShips, LAYOUT.ENEMY_SHIPS),
    ENEMY_SHIPS2: sanitizeBounds(source.enemyShips2, LAYOUT.ENEMY_SHIPS2),
    ENEMY_SHIPS3: sanitizeBounds(source.enemyShips3, LAYOUT.ENEMY_SHIPS3),
    ENEMY_SHIPS4: sanitizeBounds(source.enemyShips4, LAYOUT.ENEMY_SHIPS4),
    HAZARDS: sanitizeBounds(source.hazards, LAYOUT.HAZARDS),
    MAP_CENTER: sanitizeBounds(source.mapCenter, LAYOUT.MAP_CENTER),
    PLAYERS: sanitizeBounds(source.players, LAYOUT.PLAYERS),
  };
  const anchors = (source.__anchors && typeof source.__anchors === 'object') ? source.__anchors : null;
  if (anchors?.enemyShipsHeaderY != null) {
    const headerY = Math.max(0, Math.min(1, Number(anchors.enemyShipsHeaderY)));
    const slotH = 0.105;
    const slotGap = 0.006;
    const firstY = Math.max(0, headerY + 0.02);
    const slots = ['ENEMY_SHIPS', 'ENEMY_SHIPS2', 'ENEMY_SHIPS3', 'ENEMY_SHIPS4'];
    slots.forEach((slot, idx) => {
      const yMin = Math.max(0, firstY + idx * (slotH + slotGap));
      const yMax = Math.min(0.98, yMin + slotH);
      resolved[slot].yMin = yMin;
      resolved[slot].yMax = yMax;
    });
  }
  if (anchors?.hazardsHeaderY != null) {
    const headerY = Math.max(0, Math.min(1, Number(anchors.hazardsHeaderY)));
    resolved.HAZARDS.yMin = Math.max(0, headerY - 0.01);
    resolved.HAZARDS.yMax = Math.min(1, headerY + 0.55);
  }
  return resolved;
}

/**
 * Known ship types
 */
// Keep multi-word / more specific ship names before generic ones so findShipType
// matches "BATTLE SCOUT" instead of the shorter "SCOUT", and "SOLO OUTLAW"
// before "OUTLAW".
const SHIP_TYPES = ['SOLO OUTLAW', 'BATTLE SCOUT', 'PRIVATEER', 'BASTION', 'HUNTER', 'SCOUT', 'OUTLAW'];
const SHIP_TYPE_COMPACT_MAP = new Map(
  SHIP_TYPES.map((type) => [type.replace(/[^A-Z0-9]/g, ''), type])
);
const SHIP_TYPE_TEAM_WORDS = new Set(['SOLO', 'OUTLAW', 'BATTLE', 'SCOUT', 'PRIVATEER', 'BASTION', 'HUNTER']);
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
const HUD_TEAM_LABEL_NOISE_FRAGMENTS = [
  'YOURSHIP',
  'CREWSIZE',
  'HEALTH',
  'GUNSHIP',
  'SHIELDSDOWN',
  'FASTERSHIELDSDOWN',
];

function hasHudStatNoiseText(input) {
  const compact = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact) return false;
  return HUD_TEAM_LABEL_NOISE_FRAGMENTS.some((fragment) => compact.includes(fragment));
}

function normalizeShipTypeKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function isKnownShipType(value) {
  const key = normalizeShipTypeKey(value);
  return Boolean(key) && key !== 'UNKNOWN';
}

function isShipOnlyTeamLabel(input) {
  const cleaned = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return false;
  if (SHIP_TYPES.includes(cleaned)) return true;
  const compact = cleaned.replace(/[^A-Z0-9]/g, '');
  if (SHIP_TYPE_COMPACT_MAP.has(compact)) return true;
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0) return false;
  return words.every((word) => SHIP_TYPE_TEAM_WORDS.has(word));
}

function isUnderCrewShipBonusText(input) {
  const normalized = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  return UNDERCREW_SHIP_BONUS_PHRASES.has(normalized);
}

function sanitizeExtractedTeamName(rawTeamName, shipType = '') {
  const cleaned = formatTeamName(String(rawTeamName || '')).trim();
  if (!cleaned) return '';
  if (isUnderCrewShipBonusText(cleaned)) return '';
  const teamNameKey = normalizeShipTypeKey(cleaned);
  const shipKey = normalizeShipTypeKey(shipType);
  if (SHIP_TYPES.includes(teamNameKey)) return '';
  if (shipKey && teamNameKey === shipKey) return '';
  if (isShipOnlyTeamLabel(cleaned)) return '';
  return cleaned;
}

function sanitizePlayerShipName(rawShipName, shipType = '') {
  const strippedCrewSuffix = String(rawShipName || '')
    .replace(/\s*['’]s\s+crew\s*$/i, '')
    .trim();
  const cleaned = formatTeamName(strippedCrewSuffix).trim();
  if (!cleaned) return '';
  if (isUnderCrewShipBonusText(cleaned)) return '';
  const normalized = cleaned.toLowerCase();
  if (normalized === 'your team' || normalized === 'friendly team' || normalized === 'my crew') {
    return '';
  }
  const shipKey = normalizeShipTypeKey(shipType);
  const nameKey = normalizeShipTypeKey(cleaned);
  if (SHIP_TYPES.includes(nameKey)) return '';
  if (shipKey && nameKey === shipKey) return '';
  return cleaned;
}

/**
 * Known hazards/modifiers
 */
const buildKnownHazardMap = () => {
  const next = {};
  [...(HAZARD_CATALOG.artifacts || []), ...(HAZARD_CATALOG.hazards || [])].forEach((entry) => {
    [entry.displayName, ...(entry.aliases || [])].forEach((alias) => {
      const key = String(alias || '').trim().toUpperCase();
      if (!key) return;
      next[key] = entry.displayName;
    });
  });
  return next;
};

const KNOWN_HAZARDS = buildKnownHazardMap();
const KNOWN_HAZARD_COMPACT_KEYS = new Set(
  Object.keys(KNOWN_HAZARDS)
    .map((key) => String(key || '').toUpperCase().replace(/[^A-Z]/g, ''))
    .filter(Boolean)
);

function normalizeHazardTokenSequence(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function isSingleEditOrTranspositionAway(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || !b) return false;
  if (a === b) return true;

  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > 1) return false;

  if (a.length === b.length) {
    const mismatches = [];
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) mismatches.push(i);
      if (mismatches.length > 2) return false;
    }
    if (mismatches.length === 1) return true; // substitution
    if (mismatches.length === 2) {
      const [i, j] = mismatches;
      return j === i + 1 && a[i] === b[j] && a[j] === b[i]; // transposition
    }
    return false;
  }

  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let si = 0;
  let li = 0;
  let edits = 0;

  while (si < shorter.length && li < longer.length) {
    if (shorter[si] === longer[li]) {
      si += 1;
      li += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    li += 1; // one insertion/deletion
  }

  return true;
}

function fuzzyHazardPatternMatch(textWords, patternWords) {
  if (!Array.isArray(textWords) || !Array.isArray(patternWords)) return false;
  if (patternWords.length === 0 || textWords.length === 0) return false;

  if (patternWords.length === 1) {
    return textWords.some((word) => isSingleEditOrTranspositionAway(patternWords[0], word));
  }

  if (patternWords.length > textWords.length) return false;
  for (let start = 0; start <= (textWords.length - patternWords.length); start += 1) {
    let matchedWords = 0;
    let windowMatch = true;
    for (let i = 0; i < patternWords.length; i += 1) {
      if (!isSingleEditOrTranspositionAway(patternWords[i], textWords[start + i])) {
        windowMatch = false;
        break;
      }
      matchedWords += 1;
    }
    if (windowMatch && matchedWords >= 2) return true;
  }

  return false;
}

function looksLikeHazardHeaderToken(rawToken) {
  const token = String(rawToken || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!token) return false;
  if (token === 'KNOWN' || token === 'HAZARDS') return true;
  if (token.includes('HAZARD')) return true;
  return isSingleEditOrTranspositionAway(token, 'HAZARD')
    || isSingleEditOrTranspositionAway(token, 'HAZARDS');
}

const PLAYER_NOISE_WORDS = new Set([
  'YOUR', 'SHIP', 'ENEMY', 'SHIPS', 'HAZARDS', 'PARTY', 'VOICE',
  'HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO', 'BATTLE',
  'ARTIFACT', 'HEALING', 'ICE', 'WEAPON', 'ANCIENT', 'VAULT',
  'CRYON', 'REACH', 'DEAD', 'SENSORS', 'DEADWORLDS', 'EASY', 'LOOT',
  'EPIC', 'FAST', 'GATE', 'FEW', 'MANY', 'ASTEROIDS', 'LAVA', 'LEGION',
  'PATROLS', 'LOW', 'ALTITUDE', 'LATITUDE', 'FOG', 'ROGUE', 'TURRETS',
  'LEECH', 'SWARMS', 'HAUNTED', 'STORM', 'SANDSTORM', 'GLOAMING', 'EXPANSE',
  // Tactical map grid row labels (A-H)
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
]);

/**
 * Main entry point: Extract all data from Map Screen
 * @param {Buffer} imageBuffer - Preprocessed image buffer
 * @param {Object} ocrResult - Tesseract OCR result { words, lines, text }
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @param {Object} layoutOverrides - Optional percentage-based layout overrides
 * @returns {Promise<Object>} Extracted data
 */
async function extractMapScreen(imageBuffer, ocrResult, imageWidth, imageHeight, layoutOverrides = null, options = null) {
  console.log('[MapScreen] Starting extraction');
  const layout = resolveMapLayout(layoutOverrides);

  const result = {
    screenType: 'mapScreen',
    yourShip: null,
    enemyShips: [],
    hazards: [],
    players: [],
    routingMeta: {
      anchorsUsed: (layoutOverrides && layoutOverrides.__anchors) || null,
    },
    confidence: 0,
  };

  // Safety checks
  if (!ocrResult) {
    console.error('[MapScreen] No OCR result provided');
    return result;
  }

  // Pre-filter: drop words that fall inside the map-centre dead-zone.
  // The actual game-map graphic occupies the middle of the screen and produces
  // nothing but noise (POI grid labels, legend icons, etc.).
  const mapCenterBounds = {
    xMin: imageWidth  * layout.MAP_CENTER.xMin,
    xMax: imageWidth  * layout.MAP_CENTER.xMax,
    yMin: imageHeight * layout.MAP_CENTER.yMin,
    yMax: imageHeight * layout.MAP_CENTER.yMax,
  };
  const isInMapCenter = (w) => {
    if (!w.bbox) return false;
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    return cx >= mapCenterBounds.xMin && cx <= mapCenterBounds.xMax &&
           cy >= mapCenterBounds.yMin && cy <= mapCenterBounds.yMax;
  };

  const rawWords = ocrResult.words || [];
  const words = rawWords.filter(w => !isInMapCenter(w));
  console.log(`[MapScreen] Words after map-centre exclusion: ${words.length}/${rawWords.length}`);
  const lines = ocrResult.lines || [];
  const text = ocrResult.text || '';

  try {
    // Step 1: Extract YOUR SHIP info
    result.yourShip = await extractYourShip(
      imageBuffer,
      words,
      lines,
      text,
      imageWidth,
      imageHeight,
      layout,
      options?.yourShipRegionWords
    );

    // Step 2: Extract ENEMY SHIPS info
    result.enemyShips = await extractEnemyShips(
      imageBuffer,
      words,
      lines,
      text,
      imageWidth,
      imageHeight,
      layout,
      result.yourShip?.shipType || ''
    );

    // Step 3: Extract HAZARDS
    result.hazards = extractHazards(text, words, imageWidth, imageHeight, layout);

    // Step 4: Extract player list (bottom-left)
    result.players = extractPlayerList(words, imageWidth, imageHeight, layout);

    // Calculate confidence
    let confPoints = 0;
    if (result.yourShip) confPoints += 30;
    if (result.enemyShips.length > 0) confPoints += 30;
    if (result.hazards.length > 0) confPoints += 20;
    if (result.players.length > 0) confPoints += 20;
    result.confidence = Math.min(95, confPoints);

    console.log('[MapScreen] Extraction complete:', {
      yourShip: result.yourShip?.shipType,
      enemyShips: result.enemyShips.length,
      hazards: result.hazards.length,
      players: result.players.length,
    });

  } catch (error) {
    console.error('[MapScreen] Extraction failed:', error);
  }

  return result;
}

/**
 * Extract YOUR SHIP info from top-left region
 */
async function extractYourShip(
  imageBuffer,
  words,
  lines,
  text,
  imageWidth,
  imageHeight,
  layout = LAYOUT,
  yourShipRegionWords = null
) {
  console.log('[MapScreen] Extracting YOUR SHIP');

  const dedicatedRegionWords = Array.isArray(yourShipRegionWords)
    ? yourShipRegionWords
    : [];
  if (dedicatedRegionWords.length > 0) {
    const preview = dedicatedRegionWords
      .map((word) => String(word?.text || '').trim())
      .filter(Boolean)
      .slice(0, 18);
    console.log(`[MapScreen] YOUR_SHIP dedicated region OCR words (${dedicatedRegionWords.length}): ${preview.join(' | ')}`);
  }
  const candidateWords = [...(Array.isArray(words) ? words : []), ...dedicatedRegionWords];

  // Define region bounds
  const bounds = {
    xMin: imageWidth * layout.YOUR_SHIP.xMin,
    xMax: imageWidth * layout.YOUR_SHIP.xMax,
    yMin: imageHeight * layout.YOUR_SHIP.yMin,
    yMax: imageHeight * layout.YOUR_SHIP.yMax,
  };

  // Filter words in YOUR SHIP region.
  // Drop very-low-confidence words (icon artefacts) and the far-left icon column (x<5%).
  const regionWords = candidateWords.filter(w => {
    if (!w.bbox) return false;
    const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    const inBounds = centerX >= bounds.xMin && centerX <= bounds.xMax &&
                     centerY >= bounds.yMin && centerY <= bounds.yMax;
    if (!inBounds) return false;
    // Skip leftmost icon strip (x < 5%) and garbage-confidence words
    if (centerX < imageWidth * 0.05) return false;
    if ((w.confidence || 0) < 30) return false;
    return true;
  });

  // Group into lines
  const groupedLines = groupWordsIntoLines(regionWords, imageHeight);


  const teamNameParts = [];
  let shipType = '';

  // UI words to strip from line text before team-name extraction.
  // These appear in the YOUR SHIP panel but are never part of a team name.
  const MAP_SHIP_UI_LABELS = new Set([
    'SHIP', 'YOUR', 'SHIPS', 'ENEMY', 'HEALTH', 'CREWSIZE', 'CREW',
    'FAST', 'GUN', 'KNOWN', 'HAZARDS', 'FEATURES', 'PARTY', 'VOICE',
    'SIZE', 'HEALTH',
  ]);

  // Look for ship type and team name
  for (const line of groupedLines) {
    // Filter out known UI label words from the line before processing.
    // This handles lines where e.g. "SHIP" and "DODGE THE BULLET" land on the
    // same grouped line due to close Y proximity at scaled coords.
    const lineWords = line.words
      .map(w => w.text.toUpperCase().trim())
      .filter(t => !MAP_SHIP_UI_LABELS.has(t));
    const lineText = lineWords.join(' ').trim();
    if (!lineText) continue;
    if (lineText.includes('YOUR') && lineText.includes('SHIP')) continue;

    // Check for ship type
    const compactLineText = lineText.replace(/[^A-Z0-9]/g, '');
    const foundShip = SHIP_TYPES.find(type => lineText.includes(type))
      || Array.from(SHIP_TYPE_COMPACT_MAP.entries()).find(([compactShip]) => compactLineText.includes(compactShip))?.[1];
    if (foundShip) {
      shipType = foundShip.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');

      // Team name may appear before AND/OR after the ship type on the same line
      // (e.g. Tesseract groups "DODGE OUTLAW THE BULLET" all on one line)
      const shipIdx = lineText.indexOf(foundShip);
      const beforeShip = lineText.substring(0, shipIdx).trim();
      const afterShip  = lineText.substring(shipIdx + foundShip.length).trim();
      if (beforeShip.length >= 2 && looksLikeFriendlyTeamName(beforeShip)) {
        teamNameParts.push(formatTeamName(beforeShip));
      }
      if (afterShip.length >= 2 && looksLikeFriendlyTeamName(afterShip)) {
        teamNameParts.push(formatTeamName(afterShip));
      }
    } else if (!shipType && lineText.length >= 2 && lineText.length <= 40) {
      // Accumulate team name parts — team names can span multiple words/lines
      if (looksLikeFriendlyTeamName(lineText)) {
        teamNameParts.push(formatTeamName(lineText));
      }
    }
  }

  const teamName = sanitizeExtractedTeamName(teamNameParts.join(' ').trim(), shipType);
  const playerShipName = sanitizePlayerShipName(teamName, shipType);

  if (shipType) {
    return {
      teamName: teamName || 'Your Team',
      shipName: playerShipName || undefined,
      shipType,
      confidence: teamName ? 85 : 70,
    };
  }

  // Fallback: Try to find in raw text
  const yourShipSection = text.substring(0, text.indexOf('ENEMY') > -1 ? text.indexOf('ENEMY') : 500);
  for (const shipName of SHIP_TYPES) {
    const compactShipSection = yourShipSection.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (yourShipSection.toUpperCase().includes(shipName) || compactShipSection.includes(shipName.replace(/[^A-Z0-9]/g, ''))) {
      return {
        teamName: 'Your Team',
        shipType: shipName.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
        confidence: 60,
      };
    }
  }

  return null;
}

/**
 * Extract ENEMY SHIPS info from top-right region
 */
async function extractEnemyShips(imageBuffer, words, lines, text, imageWidth, imageHeight, layout = LAYOUT, yourShipType = '') {
  console.log('[MapScreen] Extracting ENEMY SHIPS');

  let enemyShips = [];
  const enemyRegions = [
    layout.ENEMY_SHIPS,
    layout.ENEMY_SHIPS2,
    layout.ENEMY_SHIPS3,
    layout.ENEMY_SHIPS4,
  ].filter(Boolean);
  const boundsList = enemyRegions.map((region) => ({
    xMin: imageWidth * region.xMin,
    xMax: imageWidth * region.xMax,
    yMin: imageHeight * region.yMin,
    yMax: imageHeight * region.yMax,
  }));

  const toTitle = (raw) => String(raw || '')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
  const findShipType = (upperText) => {
    const compactUpper = String(upperText || '').replace(/[^A-Z0-9]/g, '');
    if (compactUpper.includes('SOLOOUTLAW')) return 'SOLO OUTLAW';
    if (compactUpper.includes('BATTLESCOUT')) return 'BATTLE SCOUT';
    const hasWord = (word) => new RegExp(`\\b${word}\\b`).test(upperText);
    // Handle split-token OCR where "SOLO" / "BATTLE" can be separated from ship word.
    if (hasWord('SOLO') && hasWord('OUTLAW')) return 'SOLO OUTLAW';
    if (hasWord('BATTLE') && hasWord('SCOUT')) return 'BATTLE SCOUT';
    let foundShip = SHIP_TYPES.find(type => upperText.includes(type));
    if (foundShip) return foundShip;
    for (const [compactShip, fullShip] of SHIP_TYPE_COMPACT_MAP.entries()) {
      if (compactUpper.includes(compactShip)) return fullShip;
    }
    const lineWords = upperText.split(/\s+/);
    for (const type of SHIP_TYPES) {
      if (lineWords.some(w => {
        const stripped = w.replace(/^[^A-Z]/, '');
        return stripped.length >= 4 && type.endsWith(stripped) && stripped.length >= type.length - 1;
      })) {
        foundShip = type;
        break;
      }
    }
    return foundShip;
  };

  const shipWordCandidates = [];
  const isNoiseTeamLabel = (input) => {
    const t = String(input || '').toUpperCase().trim();
    if (!t) return true;
    if (isUnderCrewShipBonusText(t)) return true;
    if (hasHudStatNoiseText(t)) return true;
    const compact = t.replace(/[^A-Z]/g, '');
    if (KNOWN_HAZARD_COMPACT_KEYS.has(compact)) return true;
    if (/KNOWN|HAZARD|FEATURE|ARTIFACT|RESOURCES|WILDGATE|SPECIAL/.test(t)) return true;
    if (/^ENEMY TEAM \d+$/i.test(t)) return true;
    if (isShipOnlyTeamLabel(t)) return true;
    return false;
  };

  for (const w of words || []) {
    if (!w?.bbox || !w?.text) continue;
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    const inEnemyBand = cx >= boundsList[0].xMin && cx <= boundsList[0].xMax && cy >= boundsList[0].yMin && cy <= boundsList[Math.max(1, boundsList.length - 1)].yMax;
    if (!inEnemyBand) continue;
    const upper = String(w.text).toUpperCase().trim();
    const tokenShip = findShipType(upper);
    if (!tokenShip) continue;
    shipWordCandidates.push({
      shipType: toTitle(tokenShip),
      y: cy,
      confidence: Number(w.confidence || 0),
    });
  }

  for (let slotIdx = 0; slotIdx < boundsList.length; slotIdx++) {
    const slotBounds = boundsList[slotIdx];
    const slotWords = words.filter(w => {
      if (!w?.bbox) return false;
      const cx = (w.bbox.x0 + w.bbox.x1) / 2;
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      return cx >= slotBounds.xMin && cx <= slotBounds.xMax && cy >= slotBounds.yMin && cy <= slotBounds.yMax;
    });
    if (slotWords.length === 0) continue;

    const groupedLines = groupWordsIntoLines(slotWords, imageHeight);
    let slotColor = 'unknown';
    let bestColorConf = -1;
    if (imageBuffer) {
      for (const line of groupedLines) {
        const firstWord = line.words[0];
        if (!firstWord?.bbox) continue;
        try {
          const colorResult = await detectBadgeColorNearText(imageBuffer, firstWord.bbox, 1);
          if (colorResult.color !== 'unknown' && colorResult.confidence > bestColorConf) {
            slotColor = colorResult.color;
            bestColorConf = colorResult.confidence;
          }
        } catch (_) {}
      }
    }

    let foundShip = '';
    let teamName = '';
    let confidence = 55;
    for (const line of groupedLines) {
      const lineText = line.words.map(w => String(w.text || '').trim()).join(' ').trim();
      const upperText = lineText.toUpperCase();
      if (!upperText || /^ENEMY(\s+SHIPS?)?$/.test(upperText) || /^SHIPS?$/.test(upperText)) continue;
      const ship = findShipType(upperText);
      if (!ship) {
        if (!teamName && lineText.length >= 2 && lineText.length <= 34 && looksLikeTeamName(upperText)) {
          teamName = formatTeamName(upperText);
          confidence = Math.max(confidence, 66);
        }
        continue;
      }
      foundShip = ship;
      let lineTeam = '';
      let rawShipIdx = upperText.includes(foundShip) ? upperText.indexOf(foundShip) : -1;
      if (rawShipIdx < 0) rawShipIdx = 0;
      let beforeShip = upperText.substring(0, rawShipIdx).trim();
      let afterShip = upperText.substring(rawShipIdx + foundShip.length).trim();
      // If we matched a ship using split-token logic (e.g. SOLO + OUTLAW), don't
      // let modifier words leak into teamName.
      if (foundShip === 'SOLO OUTLAW') {
        beforeShip = beforeShip.replace(/\bSOLO\b/g, ' ').trim();
        afterShip = afterShip.replace(/\bSOLO\b/g, ' ').trim();
      } else if (foundShip === 'BATTLE SCOUT') {
        beforeShip = beforeShip.replace(/\bBATTLE\b/g, ' ').trim();
        afterShip = afterShip.replace(/\bBATTLE\b/g, ' ').trim();
      }
      if (beforeShip.length >= 2 && looksLikeTeamName(beforeShip)) lineTeam = formatTeamName(beforeShip);
      if (afterShip.length >= 3 && looksLikeTeamName(afterShip)) {
        lineTeam = lineTeam ? `${lineTeam} ${formatTeamName(afterShip)}` : formatTeamName(afterShip);
      }
      if (lineTeam && (!teamName || lineTeam.length > teamName.length)) {
        teamName = lineTeam;
      }
      confidence = Math.max(confidence, teamName ? 82 : 70);
      break;
    }

    if (!foundShip) {
      const joinedUpper = groupedLines
        .map(line => line.words.map(w => String(w.text || '').trim()).join(' ').trim())
        .filter(Boolean)
        .join(' ')
        .toUpperCase();
      foundShip = findShipType(joinedUpper) || '';
      if (foundShip && !teamName && looksLikeTeamName(joinedUpper.replace(foundShip, ' ').trim())) {
        teamName = formatTeamName(joinedUpper.replace(foundShip, ' ').trim());
      }
      if (foundShip) confidence = Math.max(confidence, teamName ? 74 : 62);
    }

    const likelyEnemySlot = Boolean(foundShip) || Boolean(teamName);
    const displayShipType = foundShip ? toTitle(foundShip) : 'Unknown';
    const sanitizedTeamName = sanitizeExtractedTeamName(teamName, displayShipType);
    const hasStrongAnonymousShipSignal = Boolean(foundShip)
      && slotColor !== 'unknown'
      && confidence >= 78;
    if (likelyEnemySlot && (sanitizedTeamName || hasStrongAnonymousShipSignal) && !isNoiseTeamLabel(sanitizedTeamName)) {
      enemyShips.push({
        teamName: sanitizedTeamName || `Enemy Team ${enemyShips.length + 1}`,
        shipType: displayShipType,
        teamColor: slotColor,
        color: slotColor,
        players: [],
        confidence,
        _slotIndex: slotIdx,
        _slotCenterY: (slotBounds.yMin + slotBounds.yMax) / 2,
      });
    }
  }

  const usedCandidateIdx = new Set();
  for (const ship of enemyShips) {
    if (ship.shipType && ship.shipType !== 'Unknown') continue;
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < shipWordCandidates.length; i++) {
      if (usedCandidateIdx.has(i)) continue;
      const candidate = shipWordCandidates[i];
      const dist = Math.abs((ship._slotCenterY || 0) - candidate.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDist < imageHeight * 0.12) {
      ship.shipType = shipWordCandidates[bestIdx].shipType;
      ship.confidence = Math.max(ship.confidence || 0, 70);
      usedCandidateIdx.add(bestIdx);
    }
  }

  // Supplemental parse: pair team-name lines with the next ship-type line by Y order.
  // This recovers rows when slot segmentation misses one lane but OCR text is present.
  {
    const pairByY = async () => {
      const bandXMin = boundsList[0].xMin;
      const bandXMax = boundsList[0].xMax;

      const rightBandWords = (words || []).filter((w) => {
        if (!w?.bbox || !w?.text) return false;
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;
        return cx >= bandXMin && cx <= bandXMax;
      });
      if (rightBandWords.length === 0) return [];

      let hazardsHeaderY = null;
      for (const w of rightBandWords) {
        if (looksLikeHazardHeaderToken(w.text || '')) {
          const y = (w.bbox.y0 + w.bbox.y1) / 2;
          if (hazardsHeaderY == null || y < hazardsHeaderY) hazardsHeaderY = y;
        }
      }
      const maxEnemyY = (hazardsHeaderY != null ? hazardsHeaderY - Math.max(6, imageHeight * 0.01) : imageHeight * 0.72);
      const upperWords = rightBandWords.filter((w) => {
        const cy = (w.bbox.y0 + w.bbox.y1) / 2;
        return cy >= boundsList[0].yMin && cy <= maxEnemyY;
      });
      if (upperWords.length === 0) return [];

      const linesParsed = groupWordsIntoLines(upperWords, imageHeight).map((line) => {
        const lineText = line.words.map(w => String(w.text || '').trim()).join(' ').trim();
        const upperText = lineText.toUpperCase();
        const firstWord = line.words[0] || null;
        const y = line.y;

        let foundShip = findShipType(upperText) || '';
        let inlineTeam = '';
        if (foundShip) {
          const rawShipIdx = upperText.indexOf(foundShip);
          const beforeShip = (rawShipIdx >= 0 ? upperText.substring(0, rawShipIdx) : '').trim();
          const afterShip = (rawShipIdx >= 0 ? upperText.substring(rawShipIdx + foundShip.length) : '').trim();
          if (beforeShip.length >= 2 && looksLikeTeamName(beforeShip)) inlineTeam = formatTeamName(beforeShip);
          if (afterShip.length >= 2 && looksLikeTeamName(afterShip)) {
            inlineTeam = inlineTeam ? `${inlineTeam} ${formatTeamName(afterShip)}` : formatTeamName(afterShip);
          }
        }

        const teamOnly = (!foundShip && looksLikeTeamName(upperText) && !isNoiseTeamLabel(upperText))
          ? formatTeamName(upperText)
          : '';

        return {
          y,
          firstWord,
          foundShip,
          inlineTeam,
          teamOnly,
        };
      });

      const immediate = [];
      const teamOnlyLines = [];
      const shipOnlyLines = [];
      for (const line of linesParsed) {
        if (line.foundShip && line.inlineTeam && !isNoiseTeamLabel(line.inlineTeam)) {
          immediate.push({
            teamName: line.inlineTeam,
            shipType: toTitle(line.foundShip),
            y: line.y,
            firstWord: line.firstWord,
          });
        } else if (line.foundShip) {
          shipOnlyLines.push(line);
        } else if (line.teamOnly) {
          teamOnlyLines.push(line);
        }
      }

      const paired = [...immediate];
      const usedShipIdx = new Set();
      const maxPairGap = Math.max(24, imageHeight * 0.09);
      for (const teamLine of teamOnlyLines.sort((a, b) => a.y - b.y)) {
        let bestIdx = -1;
        let bestGap = Number.POSITIVE_INFINITY;
        for (let i = 0; i < shipOnlyLines.length; i++) {
          if (usedShipIdx.has(i)) continue;
          const gap = shipOnlyLines[i].y - teamLine.y;
          if (gap <= 0 || gap > maxPairGap) continue;
          if (gap < bestGap) {
            bestGap = gap;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          usedShipIdx.add(bestIdx);
          paired.push({
            teamName: teamLine.teamOnly,
            shipType: toTitle(shipOnlyLines[bestIdx].foundShip),
            y: teamLine.y,
            firstWord: teamLine.firstWord,
          });
        }
      }

      const out = [];
      for (const item of paired) {
        const teamName = sanitizeExtractedTeamName(item.teamName, item.shipType);
        if (!teamName || isNoiseTeamLabel(teamName)) continue;
        let slotColor = 'unknown';
        if (imageBuffer && item.firstWord?.bbox) {
          try {
            const colorResult = await detectBadgeColorNearText(imageBuffer, item.firstWord.bbox, 1);
            if (colorResult?.color) slotColor = colorResult.color;
          } catch (_) {}
        }
        out.push({
          teamName,
          shipType: String(item.shipType || '').trim() || 'Unknown',
          teamColor: slotColor,
          color: slotColor,
          players: [],
          confidence: 78,
        });
      }

      const normalizeKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const dedup = [];
      for (const team of out) {
        const color = String(team?.color || team?.teamColor || '').trim().toLowerCase();
        const key = normalizeKey(team?.teamName);
        const idx = dedup.findIndex((existing) => {
          const existingColor = String(existing?.color || existing?.teamColor || '').trim().toLowerCase();
          if (color && color !== 'unknown' && existingColor === color) return true;
          const existingKey = normalizeKey(existing?.teamName);
          return Boolean(key && existingKey && key === existingKey);
        });
        if (idx < 0) {
          dedup.push(team);
        } else {
          const cur = dedup[idx];
          dedup[idx] = {
            ...cur,
            teamName: (team.teamName?.length || 0) > (cur.teamName?.length || 0) ? team.teamName : cur.teamName,
            shipType: cur.shipType && cur.shipType !== 'Unknown' ? cur.shipType : team.shipType,
            teamColor: cur.teamColor || team.teamColor,
            color: cur.color || team.color,
            confidence: Math.max(Number(cur.confidence || 0), Number(team.confidence || 0)),
          };
        }
      }
      return dedup.slice(0, 4);
    };

    const yPairShips = await pairByY();
    if (yPairShips.length > 0) {
      const normalizeKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const merged = [...enemyShips];
      for (const yShip of yPairShips) {
        const yColor = String(yShip?.color || yShip?.teamColor || '').trim().toLowerCase();
        const yNameKey = normalizeKey(yShip?.teamName);
        let idx = merged.findIndex((existing) => {
          const eColor = String(existing?.color || existing?.teamColor || '').trim().toLowerCase();
          return Boolean(yColor && yColor !== 'unknown' && eColor === yColor);
        });
        if (idx < 0) {
          idx = merged.findIndex((existing) => {
            const eNameKey = normalizeKey(existing?.teamName);
            return Boolean(yNameKey && eNameKey && yNameKey === eNameKey);
          });
        }
        if (idx < 0) {
          merged.push({ ...yShip });
        } else {
          const cur = merged[idx];
          const curShip = String(cur?.shipType || '').trim();
          const yShipType = String(yShip?.shipType || '').trim();
          const shipsConflict = isKnownShipType(curShip)
            && isKnownShipType(yShipType)
            && normalizeShipTypeKey(curShip) !== normalizeShipTypeKey(yShipType);
          const preferYShipType = isKnownShipType(yShipType) && (
            !isKnownShipType(curShip)
            || (
              shipsConflict
              && (
                Number(cur?._slotIndex) === 0
                || Number(cur?.confidence || 0) + 4 < Number(yShip?.confidence || 0)
              )
            )
          );
          merged[idx] = {
            ...cur,
            teamName: (yShip.teamName?.length || 0) > (cur.teamName?.length || 0) ? yShip.teamName : cur.teamName,
            shipType: preferYShipType
              ? yShipType
              : (isKnownShipType(curShip) ? curShip : yShipType || curShip),
            teamColor: cur.teamColor || yShip.teamColor,
            color: cur.color || yShip.color,
            confidence: Math.max(Number(cur.confidence || 0), Number(yShip.confidence || 0)),
          };
        }
      }
      enemyShips = merged;
    }
  }

  if (enemyShips.length < 2) {
    const bandXMin = boundsList[0].xMin;
    const bandXMax = boundsList[0].xMax;
    const rightBandWords = (words || []).filter((w) => {
      if (!w?.bbox || !w?.text) return false;
      const cx = (w.bbox.x0 + w.bbox.x1) / 2;
      return cx >= bandXMin && cx <= bandXMax;
    });
    let hazardsHeaderY = null;
    for (const w of rightBandWords) {
      if (looksLikeHazardHeaderToken(w.text || '')) {
        const y = (w.bbox.y0 + w.bbox.y1) / 2;
        if (hazardsHeaderY == null || y < hazardsHeaderY) hazardsHeaderY = y;
      }
    }
    const upperWords = rightBandWords.filter((w) => {
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      return cy >= boundsList[0].yMin && cy <= (hazardsHeaderY != null ? hazardsHeaderY : imageHeight * 0.72);
    });
    if (upperWords.length > 0) {
      const pendingTeamNames = [];
      const supplementalShips = [];
      const groupedLines = groupWordsIntoLines(upperWords, imageHeight);
      for (const line of groupedLines) {
        const lineText = line.words.map((w) => String(w.text || '').trim()).join(' ').trim();
        const upperText = lineText.toUpperCase();
        if (!upperText || /^ENEMY(\s+SHIPS?)?$/.test(upperText) || /^SHIPS?$/.test(upperText)) continue;
        const ship = findShipType(upperText);
        if (!ship) {
          if (looksLikeTeamName(upperText) && !isNoiseTeamLabel(upperText)) {
            pendingTeamNames.push(formatTeamName(upperText));
            if (pendingTeamNames.length > 4) pendingTeamNames.shift();
          }
          continue;
        }
        const rawShipIdx = upperText.includes(ship) ? upperText.indexOf(ship) : -1;
        const beforeShip = rawShipIdx >= 0 ? upperText.substring(0, rawShipIdx).trim() : '';
        const afterShip = rawShipIdx >= 0 ? upperText.substring(rawShipIdx + ship.length).trim() : '';
        let inlineTeam = '';
        if (beforeShip.length >= 2 && looksLikeTeamName(beforeShip)) inlineTeam = formatTeamName(beforeShip);
        if (afterShip.length >= 2 && looksLikeTeamName(afterShip)) {
          inlineTeam = inlineTeam ? `${inlineTeam} ${formatTeamName(afterShip)}` : formatTeamName(afterShip);
        }
        const pairedTeamName = inlineTeam || pendingTeamNames.pop() || '';
        const teamName = sanitizeExtractedTeamName(pairedTeamName, toTitle(ship));
        if (!teamName || isNoiseTeamLabel(teamName)) continue;
        supplementalShips.push({
          teamName,
          shipType: toTitle(ship),
          teamColor: 'unknown',
          color: 'unknown',
          players: [],
          confidence: 72,
        });
      }
      if (supplementalShips.length > 0) {
        const merged = [...enemyShips];
        const normalizeKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        supplementalShips.forEach((candidate) => {
          const candidateKey = normalizeKey(candidate.teamName);
          const existingIdx = merged.findIndex((entry) => normalizeKey(entry.teamName) === candidateKey);
          if (existingIdx >= 0) {
            const currentShip = String(merged[existingIdx].shipType || '').trim();
            if (!currentShip || currentShip.toLowerCase() === 'unknown') {
              merged[existingIdx] = { ...merged[existingIdx], shipType: candidate.shipType, confidence: Math.max(Number(merged[existingIdx].confidence || 0), 72) };
            }
          } else {
            merged.push(candidate);
          }
        });
        enemyShips = merged;
      }
    }
  }

  if (enemyShips.length < 4) {
    const textLines = String(text || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    let inEnemySection = false;
    let pendingTeamName = '';
    const linePairs = [];
    const yourShipKey = normalizeShipTypeKey(yourShipType);
    for (let lineIdx = 0; lineIdx < textLines.length; lineIdx++) {
      const line = textLines[lineIdx];
      const upperLine = line.toUpperCase();
      const compactLine = upperLine.replace(/[^A-Z0-9]/g, '');
      if (!inEnemySection) {
        if (compactLine.includes('ENEMYSHIPS')) inEnemySection = true;
        continue;
      }
      if (compactLine.includes('KNOWNHAZARDS') || compactLine.includes('KNOWNHAZARDSFEATURES')) break;
      if (!upperLine || hasHudStatNoiseText(upperLine)) continue;
      let ship = findShipType(upperLine);
      if (ship) {
        if (pendingTeamName) {
          if (yourShipKey && normalizeShipTypeKey(ship) === yourShipKey) {
            for (let lookAheadIdx = lineIdx + 1; lookAheadIdx < Math.min(textLines.length, lineIdx + 4); lookAheadIdx++) {
              const lookAheadLine = String(textLines[lookAheadIdx] || '').trim();
              const lookAheadUpper = lookAheadLine.toUpperCase();
              const lookAheadCompact = lookAheadUpper.replace(/[^A-Z0-9]/g, '');
              if (!lookAheadUpper) continue;
              if (lookAheadCompact.includes('KNOWNHAZARDS') || lookAheadCompact.includes('KNOWNHAZARDSFEATURES')) break;
              if (looksLikeTeamName(lookAheadUpper) && !isNoiseTeamLabel(lookAheadUpper)) break;
              const lookAheadShip = findShipType(lookAheadUpper);
              if (!lookAheadShip) continue;
              if (normalizeShipTypeKey(lookAheadShip) !== yourShipKey) {
                ship = lookAheadShip;
                lineIdx = lookAheadIdx;
                break;
              }
            }
          }
          const teamName = sanitizeExtractedTeamName(pendingTeamName, toTitle(ship));
          if (teamName && !isNoiseTeamLabel(teamName)) {
            linePairs.push({
              teamName,
              shipType: toTitle(ship),
              teamColor: 'unknown',
              color: 'unknown',
              players: [],
              confidence: 76,
            });
          }
          pendingTeamName = '';
        }
        continue;
      }
      if (looksLikeTeamName(upperLine) && !isNoiseTeamLabel(upperLine)) {
        pendingTeamName = formatTeamName(upperLine);
      }
    }
    if (linePairs.length > 0) {
      const normalizeKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const merged = [...enemyShips];
      linePairs.forEach((candidate) => {
        const candidateKey = normalizeKey(candidate.teamName);
        const existingIdx = merged.findIndex((entry) => normalizeKey(entry.teamName) === candidateKey);
        if (existingIdx < 0) {
          merged.push(candidate);
          return;
        }
        const currentShip = String(merged[existingIdx].shipType || '').trim();
        const candidateShip = String(candidate.shipType || '').trim();
        if (!candidateShip) return;
        if (!currentShip || currentShip.toLowerCase() === 'unknown' || currentShip !== candidateShip) {
          merged[existingIdx] = {
            ...merged[existingIdx],
            shipType: candidateShip,
            confidence: Math.max(Number(merged[existingIdx].confidence || 0), Number(candidate.confidence || 0)),
          };
        }
      });
      enemyShips = merged;
    }
  }

  // Fallback: Try text-based extraction if we found nothing
  if (enemyShips.length === 0) {
    console.log('[MapScreen] Trying text-based enemy ship extraction');

    const textLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const usedLines = new Set();

    for (let i = 0; i < Math.min(textLines.length, 30); i++) {
      const line = textLines[i];
      const upperLine = line.toUpperCase();

      // Skip headers
      if (upperLine === 'ENEMY SHIPS' || upperLine === 'YOUR SHIP') continue;
      if (usedLines.has(i)) continue;

      const foundShip = SHIP_TYPES.find(type => upperLine.includes(type));

      if (foundShip) {
        // Look back for team name
        let teamName = '';

        const beforeShip = upperLine.substring(0, upperLine.indexOf(foundShip)).trim();
        if (beforeShip.length >= 3) {
          teamName = formatTeamName(beforeShip);
        } else {
          // Check previous lines
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (usedLines.has(j)) continue;
            const prevLine = textLines[j].trim();
            if (prevLine.length >= 3 && prevLine.length <= 30 &&
                !SHIP_TYPES.some(s => prevLine.toUpperCase().includes(s))) {
              teamName = formatTeamName(prevLine);
              usedLines.add(j);
              break;
            }
          }
        }

        const sanitizedTeamName = sanitizeExtractedTeamName(
          teamName,
          foundShip.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
        );
        enemyShips.push({
          teamName: sanitizedTeamName || `Enemy Team ${enemyShips.length + 1}`,
          shipType: foundShip.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
          teamColor: 'unknown',
          color: 'unknown',
          players: [],
          confidence: teamName ? 65 : 50,
        });

        usedLines.add(i);
      }
    }
  }

  return enemyShips;
}

/**
 * Extract hazards from text
 */
function extractHazards(text, words = [], imageWidth = 0, imageHeight = 0, layout = LAYOUT) {
  const hazards = new Set();
  const exactMatchedPatterns = new Set();
  const scanForHazards = (sourceText) => {
    const upperText = String(sourceText || '').toUpperCase();
    const compactText = upperText.replace(/[^A-Z0-9]/g, '');
    for (const [pattern, displayName] of Object.entries(KNOWN_HAZARDS)) {
      if (upperText.includes(pattern)) {
        hazards.add(displayName);
        exactMatchedPatterns.add(pattern);
        continue;
      }
      const compactPattern = pattern.replace(/[^A-Z0-9]/g, '');
      if (compactPattern && compactText.includes(compactPattern)) {
        hazards.add(displayName);
        exactMatchedPatterns.add(pattern);
      }
    }

    const normalizedWords = normalizeHazardTokenSequence(sourceText);
    if (normalizedWords.length === 0) return;
    for (const [pattern, displayName] of Object.entries(KNOWN_HAZARDS)) {
      if (exactMatchedPatterns.has(pattern)) continue;
      const patternWords = normalizeHazardTokenSequence(pattern);
      if (fuzzyHazardPatternMatch(normalizedWords, patternWords)) {
        hazards.add(displayName);
      }
    }
  };

  scanForHazards(text);

  if (Array.isArray(words) && words.length > 0 && imageWidth > 0 && imageHeight > 0) {
    // Anchor hazard search to the "KNOWN HAZARDS" or "HAZARDS" header word.
    // The list position shifts up/down with the number of enemy ship rows,
    // so we cannot use a fixed yMin percentage.
    const rightXMin = imageWidth * layout.HAZARDS.xMin;
    const rightXWords = words.filter(w => {
      if (!w.bbox) return false;
      return (w.bbox.x0 + w.bbox.x1) / 2 >= rightXMin;
    });

    // Find the header Y — tolerate OCR variants around "HAZARD(S)".
    let headerY = null;
    for (const w of rightXWords) {
      if (looksLikeHazardHeaderToken(w.text || '')) {
        headerY = (w.bbox.y0 + w.bbox.y1) / 2;
        break;
      }
    }

    // If header found, scan deeper below it; otherwise fall back to a broad lower pane.
    const scanYMin = headerY != null
      ? headerY
      : imageHeight * 0.15;
    const scanYMax = headerY != null
      ? headerY + imageHeight * 0.55
      : imageHeight * 0.90;

    const regionWords = rightXWords.filter(w => {
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      return cy >= scanYMin && cy <= scanYMax;
    });

    if (regionWords.length > 0) {
      const regionText = groupWordsIntoLines(regionWords, imageHeight)
        .map(line => line.words.map(w => w.text).join(' ').trim())
        .join('\n')
        .toUpperCase();
      scanForHazards(regionText);
    }
  }

  return Array.from(hazards);
}

/**
 * Extract player list from bottom-left region
 */
function extractPlayerList(words, imageWidth, imageHeight, layout = LAYOUT) {
  const playersLayout = layout.PLAYERS || layout.players || LAYOUT.PLAYERS;
  const broadBounds = {
    xMin: imageWidth * playersLayout.xMin,
    xMax: imageWidth * playersLayout.xMax,
    yMin: imageHeight * playersLayout.yMin,
    yMax: imageHeight * playersLayout.yMax,
  };

  // Region-specific mitigation: tighter teammate strip for small map-name text.
  const playerRegionWidth = Math.max(1, broadBounds.xMax - broadBounds.xMin);
  const playerRegionHeight = Math.max(1, broadBounds.yMax - broadBounds.yMin);
  const focusedBounds = {
    xMin: broadBounds.xMin,
    xMax: broadBounds.xMin + (playerRegionWidth * 0.85),
    yMin: Math.max(0, broadBounds.yMin - (playerRegionHeight * 0.25)),
    yMax: Math.min(imageHeight, broadBounds.yMax),
  };

  const broadWords = filterWordsInBounds(words, broadBounds);
  const focusedWords = filterWordsInBounds(words, focusedBounds);

  const candidates = [];
  const collectCandidates = (lineSet) => {
    for (const line of lineSet) {
      const playerName = extractPlayerNameFromLine(line.words);
      if (!playerName || !isValidPlayerName(playerName)) continue;
      candidates.push({
        name: playerName,
        confidence: estimatePlayerLineConfidence(line.words, playerName),
        confidenceSource: 'direct_ocr',
      });
    }
  };

  collectCandidates(groupWordsIntoLinesWithThreshold(focusedWords, Math.max(10, imageHeight * 0.012)));
  collectCandidates(groupWordsIntoLinesWithThreshold(broadWords, Math.max(14, imageHeight * 0.016)));

  return dedupePlayerNames(candidates);
}

/**
 * Group words into lines by Y position
 */
function groupWordsIntoLines(words, imageHeight) {
  return groupWordsIntoLinesWithThreshold(words, imageHeight * 0.02);
}

function groupWordsIntoLinesWithThreshold(words, lineThreshold) {
  const lines = [];

  for (const word of words) {
    if (!word.bbox || !word.text) continue;

    const wordY = (word.bbox.y0 + word.bbox.y1) / 2;
    let foundLine = false;

    for (const line of lines) {
      if (Math.abs(line.y - wordY) < lineThreshold) {
        line.words.push(word);
        foundLine = true;
        break;
      }
    }

    if (!foundLine) {
      lines.push({ y: wordY, words: [word] });
    }
  }

  // Sort words within each line by X
  for (const line of lines) {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  }

  // Sort lines by Y
  lines.sort((a, b) => a.y - b.y);

  return lines;
}

const PIPE_SPACER_PLAYER_NAME = '| |';
function normalizePipeSpacerPlayerName(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return /^\|+\s+\|+$/.test(normalized) ? PIPE_SPACER_PLAYER_NAME : '';
}

/**
 * Extract player name from line of words
 */
function extractPlayerNameFromLine(words) {
  if (!words || words.length === 0) return null;
  const specialPipeName = normalizePipeSpacerPlayerName(
    words.map((word) => String(word?.text || '')).join(' ')
  );
  if (specialPipeName) return specialPipeName;

  const scoredTokens = [];
  let bestToken = '';
  let bestTokenScore = 0;

  for (const word of words) {
    const text = word.text?.trim();
    if (!text) continue;
    if (PLAYER_NOISE_WORDS.has(text.toUpperCase())) continue;
    if (text.length < 2) continue;
    // Filter tactical map grid coordinate labels (e.g. A1, B3, H8)
    if (/^[A-H]\d{1,2}$/i.test(text)) continue;
    if (/^[XPCD]$/i.test(text)) continue;
    if (/^[|=\-~#%&*]+$/.test(text)) continue;

    const cleanedToken = cleanupPlayerToken(text);
    const tokenScore = scoreAsMapPlayerToken(cleanedToken);
    // Keep only plausible name tokens; this drops tiny UI fragments ("Je", "x", "g")
    // that otherwise pollute multi-token joins.
    if (tokenScore < 18) continue;
    if (tokenScore > bestTokenScore) {
      bestTokenScore = tokenScore;
      bestToken = cleanedToken;
    }
    scoredTokens.push({ token: cleanedToken, score: tokenScore });
  }

  if (scoredTokens.length === 0) return null;

  if (scoredTokens.length === 1) {
    return scoredTokens[0].token.length >= 3 ? scoredTokens[0].token : null;
  }

  const hasLongToken = scoredTokens.some(({ token }) => token.length >= 4);
  if (hasLongToken) {
    const joined = cleanupPlayerToken(scoredTokens.map(({ token }) => token).join(''));
    if (joined.length >= 3) return joined;
  }

  // Fallback: if only short fragments remain, return the strongest token.
  if (bestToken && bestTokenScore >= 18) {
    return bestToken.length >= 3 ? bestToken : null;
  }

  return null;
}

/**
 * Check if name is valid player name
 * Supports: Latin, Extended Latin, Cyrillic, CJK characters
 */
function isValidPlayerName(name) {
  if (!name || name.length < 3 || name.length > 25) return false;
  if (normalizePipeSpacerPlayerName(name)) return true;

  // \u00C0-\u024F: Extended Latin (accented characters)
  // \u0400-\u04FF: Cyrillic
  // \u4e00-\u9fff: CJK
  const hasLetters = /[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/.test(name);
  if (!hasLetters) return false;

  const hasCJK = /[\u4e00-\u9fff]/.test(name);
  const hasCyrillic = /[\u0400-\u04FF]/.test(name);
  const hasExtendedLatin = /[\u00C0-\u024F]/.test(name);
  const hasNumbers = /[0-9]/.test(name);
  const hasUnderscore = /_/.test(name);
  const hasMixedCase = /[a-z]/.test(name) && /[A-Z]/.test(name);

  if (hasCJK || hasCyrillic || hasExtendedLatin) return true;
  if (hasNumbers || hasUnderscore || hasMixedCase) return true;

  // Allow all-caps map names if they are not known UI labels.
  if (name === name.toUpperCase() && name.length < 10 && !hasNumbers) {
    if (PLAYER_NOISE_WORDS.has(name.toUpperCase())) {
      return false;
    }
  }

  return true;
}

function cleanupPlayerToken(name) {
  if (!name) return '';
  const specialPipeName = normalizePipeSpacerPlayerName(name);
  if (specialPipeName) return specialPipeName;
  return name
    .replace(/@/g, 'Q')
    .replace(/»/g, 'a')
    .replace(/[{}()\[\]<>]/g, '')
    .replace(/[|]/g, '')
    .replace(/[~#%&*^]/g, '')
    .replace(/(?<![a-zA-Z0-9])[.,:;!?]+/g, '')
    .replace(/[,:;!?]+(?![a-zA-Z0-9])/g, '')
    .replace(/\.(?![a-zA-Z0-9])/g, '')
    .replace(/(?<![a-zA-Z0-9])\./g, '')
    .replace(/\s*[XPCD]$/i, '')
    .replace(/^[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+/, '')
    .replace(/[^a-zA-Z0-9_.\-\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+$/, '')
    .trim();
}

function scoreAsMapPlayerToken(token) {
  if (!token || token.length < 3) return 0;
  if (normalizePipeSpacerPlayerName(token)) return 36;
  let score = 0;
  if (token.length >= 4 && token.length <= 16) score += 20;
  if (/[0-9]/.test(token)) score += 12;
  if (/_/.test(token)) score += 12;
  if (/[a-z]/.test(token) && /[A-Z]/.test(token)) score += 18;
  if (/[\u4e00-\u9fff\u0400-\u04FF]/.test(token)) score += 20;
  if (/^[A-Z]/.test(token)) score += 8;
  const noiseRatio = (token.match(/[^a-zA-Z0-9_\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff.\-]/g) || []).length / token.length;
  if (noiseRatio > 0.25) score -= 20;
  if (PLAYER_NOISE_WORDS.has(token.toUpperCase())) score -= 40;
  return Math.max(0, Math.min(100, score));
}

function filterWordsInBounds(words, bounds) {
  return words.filter(w => {
    if (!w.bbox) return false;
    const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    return centerX >= bounds.xMin && centerX <= bounds.xMax &&
      centerY >= bounds.yMin && centerY <= bounds.yMax;
  });
}

function normalizeNameKey(input) {
  if (normalizePipeSpacerPlayerName(input)) return 'pipe-spacer-player';
  return (input || '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g, '');
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function getPlayerCandidateName(candidate) {
  return typeof candidate === 'string' ? candidate : String(candidate?.name || '');
}

function getPlayerCandidateConfidence(candidate) {
  const numeric = Number(candidate?.confidence);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(99, numeric));
}

function estimatePlayerLineConfidence(words, playerName) {
  if (!Array.isArray(words) || words.length === 0) return 0;
  const playerKey = normalizeNameKey(playerName);
  const relevant = words.filter((word) => {
    const tokenKey = normalizeNameKey(word?.text || '');
    if (!tokenKey || !playerKey) return false;
    if (tokenKey === playerKey) return true;
    if (playerKey.includes(tokenKey) || tokenKey.includes(playerKey)) return true;
    return Math.abs(tokenKey.length - playerKey.length) <= 1 && levenshteinDistance(tokenKey, playerKey) <= 1;
  });
  const sourceWords = relevant.length > 0 ? relevant : words;
  const confidences = sourceWords
    .map((word) => Number(word?.confidence))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (confidences.length === 0) return 0;
  const average = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  const peak = Math.max(...confidences);
  return Math.max(0, Math.min(99, Math.round((average * 0.7) + (peak * 0.3))));
}

function getPlayerNameVariantScore(name) {
  const value = String(name || '').trim();
  if (!value) return 0;
  let score = 0;
  if (/\s/.test(value)) score += 20;
  if (/[._-]/.test(value)) score += 8;
  if (/[a-z][A-Z]/.test(value) || /[A-Z]{2}[a-z]/.test(value)) score += 6;
  if (/'/.test(value)) score += 2;
  return score;
}

function dedupePlayerNames(players) {
  const out = [];
  for (const candidate of players) {
    const candidateName = getPlayerCandidateName(candidate);
    const key = normalizeNameKey(candidateName);
    if (!key) continue;
    const existingIdx = out.findIndex(existing => {
      const existingName = getPlayerCandidateName(existing);
      const existingKey = normalizeNameKey(existingName);
      if (existingKey === key) return true;
      // Keep short tags strict: don't collapse names like "Riv", "Rive", "Riv2".
      const shorter = existingKey.length <= key.length ? existingKey : key;
      const longer = existingKey.length <= key.length ? key : existingKey;
      return shorter.length >= 10 && longer.includes(shorter);
    });
    if (existingIdx === -1) {
      out.push(candidate);
      continue;
    }
    const candidateVariantScore = getPlayerNameVariantScore(candidateName);
    const existingVariantScore = getPlayerNameVariantScore(getPlayerCandidateName(out[existingIdx]));
    if (
      candidateVariantScore > existingVariantScore
      || (
        candidateVariantScore === existingVariantScore
        && getPlayerCandidateConfidence(candidate) > getPlayerCandidateConfidence(out[existingIdx])
      )
    ) {
      out[existingIdx] = candidate;
    }
  }
  return out;
}

/**
 * Format team name (clean and standardize)
 */
function formatTeamName(name) {
  if (!name) return '';
  // Preserve punctuation valid in team names (!, ?, -, _, ., ')
  return name
    .replace(/[^a-zA-Z0-9_.'\-!? ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Friendly-team labels (your ship name) are often title-case or mixed-case,
 * unlike enemy team bars which skew heavily uppercase. Keep this check permissive
 * but aggressively filter known HUD/noise tokens.
 */
function looksLikeFriendlyTeamName(text) {
  if (!text) return false;
  const cleaned = formatTeamName(text);
  if (cleaned.length < 3 || cleaned.length > 40) return false;
  if (isUnderCrewShipBonusText(cleaned)) return false;
  if (hasHudStatNoiseText(cleaned)) return false;
  if (isShipOnlyTeamLabel(cleaned)) return false;

  const upper = cleaned.toUpperCase();
  const compact = upper.replace(/[^A-Z]/g, '');
  if (KNOWN_HAZARD_COMPACT_KEYS.has(compact)) return false;
  if (/^(YOUR|SHIP|YOUR SHIP|ENEMY SHIPS?|HEALTH|CREW SIZE|KNOWN HAZARDS?|FEATURES|ARTIFACT)$/i.test(upper)) return false;

  const letterCount = (cleaned.match(/[A-Za-z]/g) || []).length;
  if (letterCount < 2) return false;

  return true;
}

/**
 * Heuristic: team names are usually multi-word and mostly uppercase
 */
function looksLikeTeamName(text) {
  if (!text) return false;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 4 || cleaned.length > 40) return false;
  if (isUnderCrewShipBonusText(cleaned)) return false;
  if (hasHudStatNoiseText(cleaned)) return false;
  if (isShipOnlyTeamLabel(cleaned)) return false;

  const letters = cleaned.match(/[A-Za-z]/g) || [];
  const upperLetters = cleaned.match(/[A-Z]/g) || [];
  const upperRatio = letters.length > 0 ? upperLetters.length / letters.length : 0;

  const hasUnderscore = /_/.test(cleaned);
  const hasMixedCase = /[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned);

  // Game-specific noise: ship stat description lines start with a digit
  if (/^\d/.test(cleaned)) return false;

  if (hasUnderscore) return false;
  if (hasMixedCase && upperRatio < 0.9) return false;

  // Accept single-word all-caps names of 4+ letters (e.g. BOREALIS, VANGUARD)
  // as well as multi-word names
  if (letters.length < 4) return false;
  return upperRatio >= 0.6;
}

module.exports = {
  extractMapScreen,
  extractYourShip,
  extractEnemyShips,
  extractHazards,
  extractPlayerList,
  groupWordsIntoLines,
  KNOWN_HAZARDS,
  SHIP_TYPES,
  looksLikeTeamName,
};
