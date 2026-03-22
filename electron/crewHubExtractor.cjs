/**
 * Crew Hub Extractor — v3 (Row-Based Card Scanner)
 *
 * Extracts player and team data from Crew Hub screenshots.
 *
 * ACTUAL Crew Hub layout (1920×1080):
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LEFT PANEL (0–48%)           │ RIGHT PANEL (55–100%)                    │
 * │                              │                                          │
 * │ "CREW HUB" header            │ "Enemy Crews" header                     │
 * │ "ShipName's Crew" (cyan)     │                                          │
 * │                              │ ┌─ Player Card (~78px tall) ───────────┐ │
 * │ [Your username — large]      │ │ [Portrait] PlayerName      [P]       │ │
 * │ [voice/party controls]       │ │            ████ TeamName ████        │ │
 * │                              │ │            (colored bar, ~22px)       │ │
 * │ [Teammate1] [PARTY VOICE]    │ └─────────────────────────────────────┘ │
 * │ [Teammate2] [PARTY VOICE]    │ ┌─ Player Card ──────────────────────┐ │
 * │ [Teammate3] [PARTY VOICE]    │ │ [Portrait] PlayerName      [P]      │ │
 * │                              │ │            ████ TeamName ████        │ │
 * └──────────────────────────────┴─└─────────────────────────────────────┘─┘
 *
 * Key insight: Each enemy player has their OWN colored bar below their name.
 * The bar's color = team color (one of 32 Wildgate colors; see WILDGATE_COLORS in colorUtils.cjs).
 * Players grouped by matching bar color = same team.
 * There is NO separate "team header row" — just player card after player card.
 *
 * The right panel scrolls vertically; up to 9 cards visible at once.
 * Multiple screenshots may be needed to capture all enemy players.
 */

const { detectTeamColorBarBelow, detectColorInRegion, clusterByHue, WILDGATE_COLORS, nearestWildgateColor, hueDistance, rgbToHsl } = require('./colorUtils.cjs');
const HAZARD_CATALOG = require('./hazardCatalog.json');
const _fs = require('fs');
const _os = require('os');
const DLOG_PATH = require('path').join(_os.tmpdir(), 'wildgate-ocr.log');
const dlog = msg => { try { _fs.appendFileSync(DLOG_PATH, new Date().toISOString() + ' ' + msg + '\n'); } catch(_e) {} };
const REFERENCE_WIDTH = 1920;

// Precomputed hue for each Wildgate color name — used for hue-proximity group matching
// so that adjacent color names like 'skyBlue' and 'periwinkle' can be recognised as
// the same team when their sampled hues are within the merge threshold.
const WILDGATE_COLOR_HUE = new Map(
  WILDGATE_COLORS.map(c => {
    const hsl = rgbToHsl(c.r, c.g, c.b);
    return [c.name, hsl.s < 10 ? null : hsl.h];
  })
);

/**
 * // LAYOUT-DEPENDENT
 * Screen layout constants (percentage-based, calibrated from real 1920×1080 screenshots)
 */
const LAYOUT = {
  // Left panel: Your team
  LEFT_PANEL: {
    xMin: 0,
    xMax: 0.48,  // names can extend to ~46%, allow margin
    yMin: 0.22,  // skip team-name banner (~top 22% = y<238 on 1080p); player cards start below this
    yMax: 0.85,  // includes split PARTY/TEAM layouts in holdout (match117/match118)
  },
  // Right panel: Enemy crews — single scrollable list of player cards
  ENEMY_PANEL: {
    xMin: 0.55,  // portraits start at ~55%
    xMax: 1.0,
    yMin: 0.08,
    // Older purple-gradient crew-hub layouts (e.g. holdout match72) still fit
    // inside this window; misses there are OCR/parsing quality, not bounds clip.
    yMax: 0.95,
  },
  // Team name header region (contains "'s Crew")
  TEAM_HEADER: {
    xMin: 0,
    xMax: 0.50,
    yMin: 0.02,
    yMax: 0.18,
  },
  // Enemy player name text typically starts at x≈68% and extends to ~88%
  ENEMY_NAME: {
    xMin: 0.60,
    xMax: 0.92,
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

function resolveCrewHubLayout(layoutOverrides) {
  const source = (layoutOverrides && typeof layoutOverrides === 'object') ? layoutOverrides : {};
  return {
    LEFT_PANEL: sanitizeBounds(source.leftPanel, LAYOUT.LEFT_PANEL),
    ENEMY_PANEL: sanitizeBounds(source.enemyPanel || source.rightPanel, LAYOUT.ENEMY_PANEL),
    TEAM_HEADER: sanitizeBounds(source.teamHeader, LAYOUT.TEAM_HEADER),
    ENEMY_NAME: sanitizeBounds(source.enemyName || {
      xMin: LAYOUT.ENEMY_NAME.xMin,
      xMax: LAYOUT.ENEMY_NAME.xMax,
      yMin: LAYOUT.ENEMY_PANEL.yMin,
      yMax: LAYOUT.ENEMY_PANEL.yMax,
    }, {
      xMin: LAYOUT.ENEMY_NAME.xMin,
      xMax: LAYOUT.ENEMY_NAME.xMax,
      yMin: LAYOUT.ENEMY_PANEL.yMin,
      yMax: LAYOUT.ENEMY_PANEL.yMax,
    }),
  };
}

function getGeometryScale(geometry, axis = 'y', fallback = 1) {
  const key = axis === 'x' ? 'ocrScaleX' : 'ocrScaleY';
  const value = Number(geometry?.[key]);
  if (Number.isFinite(value) && value > 0) return value;
  const fallbackValue = Number(fallback);
  if (Number.isFinite(fallbackValue) && fallbackValue > 0) return fallbackValue;
  return 1;
}

function scaleReferencePx(referencePx, geometry, axis = 'y', fallback = 1) {
  const value = Number(referencePx);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.round(value * getGeometryScale(geometry, axis, fallback)));
}

function computeLineMergeThreshold(imageHeight, geometry) {
  return Math.min(
    imageHeight * 0.012,
    scaleReferencePx(15, geometry, 'y', 1)
  );
}

function computeXProximityThreshold(imageWidth, options = {}) {
  const geometry = options?.geometry || null;
  const regionWidth = Number(options?.regionWidth);
  const activeWidth = Number.isFinite(regionWidth) && regionWidth > 0
    ? regionWidth
    : (Number.isFinite(imageWidth) && imageWidth > 0 ? imageWidth : 0);
  const aspectProfile = String(geometry?.aspectProfile || 'standard').toLowerCase();
  const xProximityFactor = aspectProfile === 'standard' ? 0.25 : 0.12;
  const regionThreshold = activeWidth > 0 ? activeWidth * xProximityFactor : 0;
  const baselineXThresholdPx = Number(options?.baselineXThresholdPx);
  const baselineThreshold = Number.isFinite(baselineXThresholdPx) && baselineXThresholdPx > 0
    ? scaleReferencePx(baselineXThresholdPx, geometry, 'x', 1)
    : 0;
  const minimumThreshold = scaleReferencePx(80, geometry, 'x', 1);
  return Math.max(regionThreshold, baselineThreshold, minimumThreshold);
}

function formatLayoutBounds(bounds, imageWidth, imageHeight) {
  return {
    x: [
      Math.round(imageWidth * bounds.xMin),
      Math.round(imageWidth * bounds.xMax),
    ],
    y: [
      Math.round(imageHeight * bounds.yMin),
      Math.round(imageHeight * bounds.yMax),
    ],
  };
}

function logCrewHubLayoutDebug(enabled, label, payload) {
  if (!enabled) return;
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  console.log(`[CrewHub][Layout] ${label}: ${message}`);
}

/**
 * Noise words to filter out (UI elements)
 */
const NOISE_WORDS = new Set([
  'PARTY', 'VOICE', 'CREW', 'HUB', 'PUSH', 'TALK', 'MUTE', 'OPTIONS', 'BACK',
  'SWITCH', 'DISABLE', 'ENABLE', 'YOUR', 'TEAM', 'CHANGE', 'MAP', 'SEED',
  'ENEMY', 'NEMY', 'CREWS', 'CHANNEL', 'INTO', 'SAME', 'WITH', 'THE', 'HOP',
  'ON', 'OFF', 'TO', 'DEAFEN', 'UNMUTE', 'SAY', 'TEXT', 'PINGS',
  'OF', 'IN', 'AT', 'IS', 'BY', 'OR', 'AN',
  'INVITE', 'KICK', 'SPECTATE', 'REPORT',  // Phase 3: additional UI false-positive blockers
  'CHANGE VOICE', 'THEIR PLAYERS',
  'UNKNOWN USER', 'UNKNOWN', 'UNKNOWN PLAYER',  // Game placeholder for players whose profiles haven't loaded
  // Crew-hub section headers / UI labels — never player or team names
  'KNOWN', 'HAZARDS', 'HAZARD', 'WILDGATE', 'HEALTH', 'FASTER', 'SHIELDS',
  'DOWN', 'ARTIFACT', 'ASTEROIDS', 'ALTITUDE', 'FOG', 'PATROLS', 'LEGION',
  'ROGUE', 'TURRETS', 'HEALING', 'CRYON', 'RIFT', 'SHIPS', 'WORLDS',
  'CURSOR', 'LABELS', 'TOGGLE', 'CLOSE', 'PING', 'EPIC', 'DEAD', 'LOOT',
  // Tactical map grid row labels (A-H) — prevent misclassification
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  // Phase A3: Extended UI blocklist — crew hub chrome, menus, HUD elements
  // Navigation / menu UI
  'SETTINGS', 'MENU', 'LOBBY', 'MATCHMAKING', 'LOADING', 'SEARCHING', 'WAITING',
  'READY', 'ACCEPT', 'DECLINE', 'CONFIRM', 'CANCEL', 'CONTINUE', 'EXIT', 'QUIT',
  'LEAVE', 'JOIN', 'PLAY', 'SELECT', 'SELECTED', 'REFRESH', 'HOME',
  // Audio / comms UI
  'VOLUME', 'AUDIO', 'MICROPHONE', 'HEADSET', 'INPUT', 'OUTPUT', 'SPEAKER',
  // Connection status overlays
  'DISCONNECTED', 'RECONNECT', 'RECONNECTING', 'CONNECTED', 'CONNECTING',
  // Scoreboard / results overlays
  'VICTORY', 'DEFEAT', 'SCOREBOARD', 'RESULTS', 'SCORE', 'TOTAL',
  // HUD indicators that leak into crew hub OCR
  'SHIELD', 'ARMOR', 'SPEED', 'BOOST', 'FUEL', 'ENERGY', 'POWER', 'REPAIR',
  'FIRE', 'STEER', 'HELM', 'ANCHOR', 'DOCK', 'SAILS',
  // In-game labels / misc chrome
  'PLAYER', 'PLAYERS', 'PIRATE', 'PIRATES', 'FLEET', 'BOUNTY', 'CARGO',
  'WAYPOINT', 'COMPASS', 'MARKER', 'MINIMAP', 'ICON',
  'GATE', 'VAULT', 'STORM', 'SWARM', 'SWARMS',
  'RANK', 'LEVEL', 'PRESTIGE', 'PROGRESS',
  'SMALL CREW BONUS', 'SMALLCREWBONUS', 'SMALL CREWBONUS', 'SMALLCREW BONUS',
  'REDUCED FIRES', 'REDUCEDFIRES', 'REDUCED FIRED', 'REDUCEDFIRED',
]);
const UI_NOISE_PHRASES = [
  'CREW HUB',
  'PARTY',
  'TEAM VOICE',
  'PUSH TO TALK',
  'MUTE VOICE',
  'CHANGE VOICE',
  'BACK',
  'SWITCH',
  'VOICE CHANNEL',
  'YOUR VOICE',
  'SMALL CREW BONUS',
  'SMALLCREWBONUS',
  'REDUCED FIRES',
  'REDUCEDFIRES',
  'REDUCED FIRED',
  'REDUCEDFIRED',
  'AUTO-ICEWHENDAMAGE',
  'AUTOICEWHENDAMAGE',
  'ICEWHENDAMAGE',
  'UNKNOWN PLAYER',
  'UNKNOWN USER',
];
const SAME_COLOR_BASE_GAP_MULTIPLIER = 1.35;
const SAME_COLOR_SPECTATOR_GAP_MULTIPLIER = 0.95;
const SAME_COLOR_MERGE_GAP_MULTIPLIER = 2.2;
const MAX_SPECTATOR_GAP_SLOTS = 2;
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
const UNDERCREW_SHIP_BONUS_COMPACT_PATTERN = /(?:SMALLCREWBONUS|REDUCE(?:D)?FIRES?(?:ONSHIP)?(?:BY50)?)/;

function containsUiNoisePhrase(input) {
  const normalized = String(input || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  return UI_NOISE_PHRASES.some(phrase => normalized.includes(phrase));
}

function containsUnderCrewBonusPhrase(input) {
  const normalized = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  if (UNDERCREW_SHIP_BONUS_PHRASES.has(normalized)) return true;
  const compact = normalized.replace(/\s+/g, '');
  if (!compact) return false;
  return UNDERCREW_SHIP_BONUS_COMPACT_PATTERN.test(compact);
}

function countAnchorsBetween(anchorYs, a, b) {
  if (!Array.isArray(anchorYs) || anchorYs.length === 0) return 0;
  const minY = Math.min(a, b);
  const maxY = Math.max(a, b);
  return anchorYs.filter((y) => Number.isFinite(y) && y > minY && y < maxY).length;
}

function getSameColorSplitGap(cardHeight, skippedAnchorCount = 0) {
  const baseHeight = Number.isFinite(cardHeight) && cardHeight > 0 ? cardHeight : 78;
  const extraSlots = Math.max(0, Math.min(MAX_SPECTATOR_GAP_SLOTS, Math.round(Number(skippedAnchorCount) || 0)));
  return baseHeight * (SAME_COLOR_BASE_GAP_MULTIPLIER + (extraSlots * SAME_COLOR_SPECTATOR_GAP_MULTIPLIER));
}

function getSameColorMergeGap(cardHeight, skippedAnchorCount = 0) {
  const baseHeight = Number.isFinite(cardHeight) && cardHeight > 0 ? cardHeight : 78;
  const extraSlots = Math.max(0, Math.min(MAX_SPECTATOR_GAP_SLOTS, Math.round(Number(skippedAnchorCount) || 0)));
  return baseHeight * SAME_COLOR_MERGE_GAP_MULTIPLIER + (extraSlots * baseHeight * SAME_COLOR_SPECTATOR_GAP_MULTIPLIER);
}

function isNearSkippedAnchor(anchorYs, y, cardHeight, toleranceMultiplier = 0.55) {
  if (!Array.isArray(anchorYs) || anchorYs.length === 0 || !Number.isFinite(y)) return false;
  const baseHeight = Number.isFinite(cardHeight) && cardHeight > 0 ? cardHeight : 78;
  const tolerance = baseHeight * toleranceMultiplier;
  return anchorYs.some((anchorY) => Number.isFinite(anchorY) && Math.abs(anchorY - y) <= tolerance);
}

/**
 * Known hazard patterns → display names (mirrors mapScreenExtractor KNOWN_HAZARDS).
 * Used to extract hazard info from the crew hub "KNOWN HAZARDS" section as a
 * fallback when the tactical map extraction fails or finds no hazards.
 */
const buildCrewHubHazardMap = () => {
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

const CREW_HUB_HAZARDS = buildCrewHubHazardMap();

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
    if (mismatches.length === 1) return true;
    if (mismatches.length === 2) {
      const [i, j] = mismatches;
      return j === i + 1 && a[i] === b[j] && a[j] === b[i];
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
    li += 1;
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

/**
 * Main entry point: Extract all data from Crew Hub screenshot.
 *
 * @param {Buffer} imageBuffer - Preprocessed image buffer (for OCR word positions)
 * @param {string} activeUser - Current user's display name (anchor for left panel)
 * @param {Object} ocrResult - Tesseract OCR result { words, lines, text }
 * @param {number} imageWidth - Image width (of preprocessed image)
 * @param {number} imageHeight - Image height (of preprocessed image)
 * @param {number} [scale=1] - Preprocessing scale factor
 * @param {Buffer} [colorImageBuffer] - ORIGINAL color image for team-color sampling
 * @param {Object} [layoutOverrides] - Optional layout overrides
 * @returns {Promise<Object>} Extracted data
 */
async function extractCrewHub(
  imageBuffer,
  activeUser,
  ocrResult,
  imageWidth,
  imageHeight,
  scale = 1,
  colorImageBuffer = null,
  layoutOverrides = null,
  options = null
) {
  console.log('[CrewHub] Starting extraction, activeUser:', activeUser);
  const colorBuffer = colorImageBuffer || imageBuffer;
  const layout = resolveCrewHubLayout(layoutOverrides);
  const extractorOptions = (options && typeof options === 'object') ? options : {};
  const geometry = extractorOptions.geometry || null;
  const debugLayout = extractorOptions.debugLayout === true;

  const result = {
    screenType: 'crewHub',
    yourTeam: {
      name: '',
      players: [],
    },
    enemyTeams: [],
    hazards: [],
    isPartialCapture: false,
    confidence: 0,
  };

  // Safety checks
  if (!ocrResult) {
    console.error('[CrewHub] No OCR result provided');
    return result;
  }

  const words = ocrResult.allWords || ocrResult.words || [];
  const lines = ocrResult.lines || [];
  const text = ocrResult.text || '';

  if (words.length === 0 && lines.length === 0) {
    console.warn('[CrewHub] No OCR word/line data available');
    return result;
  }

  try {
    // Initialise the debug log for this extraction run
    try { _fs.appendFileSync(DLOG_PATH, '=== extractCrewHub ' + new Date().toISOString() + ' ===\n'); } catch(_e) {}
    logCrewHubLayoutDebug(debugLayout, 'geometry', {
      original: geometry ? `${geometry.originalWidth}x${geometry.originalHeight}` : null,
      ocrInput: geometry ? `${geometry.ocrWidth}x${geometry.ocrHeight}` : `${imageWidth}x${imageHeight}`,
      aspectProfile: geometry?.aspectProfile || 'unknown',
      ocrScaleX: Number(geometry?.ocrScaleX || 1).toFixed(4),
      ocrScaleY: Number(geometry?.ocrScaleY || 1).toFixed(4),
    });
    logCrewHubLayoutDebug(debugLayout, 'regions', {
      leftPanel: formatLayoutBounds(layout.LEFT_PANEL, imageWidth, imageHeight),
      enemyPanel: formatLayoutBounds(layout.ENEMY_PANEL, imageWidth, imageHeight),
      enemyName: formatLayoutBounds(layout.ENEMY_NAME, imageWidth, imageHeight),
      teamHeader: formatLayoutBounds(layout.TEAM_HEADER, imageWidth, imageHeight),
    });

    // Step 1: Extract your team from left panel
    result.yourTeam = await extractLeftPanel(
      imageBuffer,
      activeUser,
      words,
      lines,
      text,
      imageWidth,
      imageHeight,
      layout,
      ocrResult && ocrResult.leftPanelTeamName,
      { geometry, debugLayout }
    );

    // Step 2: Extract enemy teams from right panel using row-based card scanner
    result.enemyTeams = await extractEnemyPanel(
      colorBuffer,
      words,
      lines,
      text,
      imageWidth,
      imageHeight,
      scale,
      layout,
      { geometry, debugLayout }
    );

    // Step 3: Extract hazards from the "KNOWN HAZARDS" section of the crew hub.
    // This is a fallback source — used by ocrMerger when the tactical map
    // extraction returns no hazards (e.g. map screenshot was missing or unclear).
    {
      const upperText = text.toUpperCase();
      const foundHazards = new Set();
      const exactMatchedPatterns = new Set();
      for (const [pattern, displayName] of Object.entries(CREW_HUB_HAZARDS)) {
        if (!upperText.includes(pattern)) continue;
        foundHazards.add(displayName);
        exactMatchedPatterns.add(pattern);
      }
      const normalizedWords = normalizeHazardTokenSequence(text);
      if (normalizedWords.length > 0) {
        for (const [pattern, displayName] of Object.entries(CREW_HUB_HAZARDS)) {
          if (exactMatchedPatterns.has(pattern)) continue;
          const patternWords = normalizeHazardTokenSequence(pattern);
          if (fuzzyHazardPatternMatch(normalizedWords, patternWords)) {
            foundHazards.add(displayName);
          }
        }
      }
      if (foundHazards.size > 0) {
        result.hazards = Array.from(foundHazards).sort();
        dlog('[CrewHub] Hazards from crew hub: ' + result.hazards.join(', '));
      }
    }

    // Step 4: Calculate confidence
    const playerCount = result.yourTeam.players.length +
      result.enemyTeams.reduce((sum, t) => sum + t.players.length, 0);
    result.confidence = Math.min(95, 50 + playerCount * 5);

    // Check partial capture heuristic
    if (result.enemyTeams.length > 0) {
      const counts = result.enemyTeams.map(t => t.players.length);
      const maxCount = Math.max(...counts);
      const minCount = Math.min(...counts);
      const isInconsistent = maxCount - minCount >= 2;
      const isUniversallySparse = maxCount <= 1 && result.enemyTeams.length >= 2;
      if (isInconsistent || isUniversallySparse) {
        result.isPartialCapture = true;
      }
    }

    console.log('[CrewHub] Extraction complete:', {
      teamName: result.yourTeam.name,
      teammates: result.yourTeam.players.length,
      enemyTeams: result.enemyTeams.length,
      totalEnemies: result.enemyTeams.reduce((sum, t) => sum + t.players.length, 0),
      colors: result.enemyTeams.map(t => `${t.color}(${t.players.length})`).join(', '),
    });

  } catch (error) {
    console.error('[CrewHub] Extraction failed:', error);
  }

  return result;
}

/**
 * Extract your team data from left panel
 */
async function extractLeftPanel(imageBuffer, activeUser, words, lines, text, imageWidth, imageHeight, layout = LAYOUT, leftPanelTeamName = null, options = null) {
  dlog('[CrewHub] Extracting left panel (your team)');
  const geometry = options?.geometry || null;
  const debugLayout = options?.debugLayout === true;

  const teamData = {
    name: '',
    players: [],
  };

  // Define left panel bounds
  const leftBounds = {
    xMin: imageWidth * layout.LEFT_PANEL.xMin,
    xMax: imageWidth * layout.LEFT_PANEL.xMax,
    yMin: imageHeight * layout.LEFT_PANEL.yMin,
    yMax: imageHeight * layout.LEFT_PANEL.yMax,
  };

  // Step 1: Find YOUR team name via the "'s Crew" banner (left panel only).
  // Allow !, digits, hyphens etc. in team names (e.g. "SPEED RUN!'s Crew")
  // Primary: dedicated banner-box OCR read passed in via leftPanelTeamName param
  // Fallback: regex on the full PSM4 text
  if (leftPanelTeamName) {
    teamData.name = formatTeamName(leftPanelTeamName);
    dlog('[CrewHub] Found team name from banner box: ' + teamData.name);
  } else {
    const teamNameMatch = text.match(/([A-Za-z][A-Za-z0-9 !_\-]{2,30}?)[\u2019\u2018'']s\s*Crew/i);
    if (teamNameMatch) {
      teamData.name = formatTeamName(teamNameMatch[1].trim());
      dlog('[CrewHub] Found team name from regex: ' + teamData.name);
    } else {
      dlog('[CrewHub] No team name found (no \'s Crew pattern in text)');
    }
  }

  // Step 2: Filter words in left panel
  const leftPanelWords = words.filter(w => {
    if (!w.bbox) return false;
    const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    return centerX >= leftBounds.xMin && centerX <= leftBounds.xMax &&
           centerY >= leftBounds.yMin && centerY <= leftBounds.yMax;
  });

  dlog('[CrewHub] Left panel words: ' + leftPanelWords.length + ' (bounds xMin=' + Math.round(leftBounds.xMin) + ' xMax=' + Math.round(leftBounds.xMax) + ' yMin=' + Math.round(leftBounds.yMin) + ' yMax=' + Math.round(leftBounds.yMax) + ')');
  dlog('[CrewHub] Left panel all words: ' + leftPanelWords.map(w => '"' + w.text + '"(c' + Math.round(w.confidence) + ')@x' + Math.round((w.bbox.x0+w.bbox.x1)/2) + '@y' + Math.round((w.bbox.y0+w.bbox.y1)/2)).join(' '));

  // Step 3: Group words into lines by Y position
  const groupedLines = groupWordsIntoLines(leftPanelWords, imageHeight, imageWidth, {
    geometry,
    regionWidth: Math.max(1, leftBounds.xMax - leftBounds.xMin),
    debugLayout,
    debugLabel: 'leftPanel',
  });
  dlog('[CrewHub] Left panel lines: ' + groupedLines.length + ' ys=' + groupedLines.map(l=>Math.round(l.y)).join(','));

  // Step 4: Try to find activeUser first (anchor)
  let foundActiveUser = false;
  let activeUserYPos = null;

  if (activeUser) {
    const normalizedActiveUser = activeUser.toLowerCase();

    for (const line of groupedLines) {
      const lineText = line.words.map(w => w.text).join('').toLowerCase();
      const fuzzyMatch = fuzzyMatchName(lineText, normalizedActiveUser);

      if (fuzzyMatch) {
        foundActiveUser = true;
        activeUserYPos = line.y;
        dlog('[CrewHub] Found activeUser anchor at Y: ' + activeUserYPos);
        break;
      }
    }
  }

  // Teammate column max X — widened to ~48% to catch long names
  const teammateColumnMaxX = imageWidth * 0.48;

  const parsePlayersFromLines = (lineSet) => {
    const out = [];
    // Narrow x-band for the name column: portraits are ~0-8%, names ~8-32%.
    // Lock at ~38%: this excludes icon/control chrome while preserving
    // legitimate right-edge glyphs from long teammate names.
    // Keep a small margin so right-edge glyphs (e.g. trailing "V" in long names)
    // still fall inside the accepted teammate-name column.
    const nameColXMax = imageWidth * 0.38;
    for (const line of lineSet) {
      if (Math.abs(line.y - 1355) < 10) {
        dlog('[LPdbg1355] words=' + line.words.map(w => '"'+w.text+'"(c'+Math.round(w.confidence)+')bbox=['+[w.bbox&&w.bbox.x0,w.bbox&&w.bbox.x1,w.bbox&&w.bbox.y0,w.bbox&&w.bbox.y1].join(',')+']').join(' '));
      }
      const lineMinX = getLineMinX(line.words);
      if (lineMinX > teammateColumnMaxX) { dlog('[LPdbg] y=' + Math.round(line.y) + ' SKIP lineMinX=' + Math.round(lineMinX) + '>' + Math.round(teammateColumnMaxX)); continue; }
      // Filter line words to the name column only — this strips adjacent UI
      // control text (party/voice icons) that appear at the same Y as the name.
      // Apply x-column filter then a confidence floor — low-conf left-panel
      // words (e.g. "Bay" c29, "Sng" c8) are almost always noise fragments from
      // adjacent UI chrome rather than genuine teammate names.
      const nameColWords = line.words
        .filter(w => !w.bbox || (w.bbox.x0 + w.bbox.x1) / 2 < nameColXMax)
        .filter(w => {
          const conf = w.confidence || 0;
          if (conf >= 30) return true;
          // Exception: strong gamertag structure (mixed-case + adequate length) overrides
          // near-zero confidence — e.g. "JrMJr"(c0) scores 50 and should be kept.
          const t = (w.text || '').trim();
          return t.length >= 4 && scoreAsPlayerName(t) >= 40;
        });
      if (nameColWords.length === 0) { dlog('[LPdbg] y=' + Math.round(line.y) + ' → nameColWords empty after x<' + Math.round(nameColXMax) + ' / conf<30 filter'); continue; }
      // If any word in this line is a high-confidence UI control keyword (conf≥60),
      // the whole line is a voice/party button row — skip it entirely.
      // This prevents OCR corruptions of "PARTY" (e.g. "parry") being extracted
      // as a player name when PARTY/VOICE/TEAM/PUSH appear on the same line.
      const UI_CONTROL_RE = /^(PARTY|VOICE|TEAM|PUSH|TALK|CHANNEL|MUTE|DEAFEN|TEXT|PINGS|HOP|SWITCH)$/i;
      if (nameColWords.some(w => (w.confidence || 0) >= 60 && UI_CONTROL_RE.test(w.text.trim()))) {
        dlog('[LPdbg] y=' + Math.round(line.y) + ' → SKIP UI button row (high-conf control word)');
        continue;
      }
      let playerName = extractPlayerNameFromLine(nameColWords);
      playerName = sanitizeLeftPanelPlayerName(playerName);
      if (Math.abs(line.y - 1355) < 10) dlog('[LPdbg1355b] extractResult="' + playerName + '" nameColWords=' + nameColWords.length);
      if (!playerName) { dlog('[LPdbg] y=' + Math.round(line.y) + ' → no name from: ' + nameColWords.map(w=>'"'+w.text+'"(c'+Math.round(w.confidence)+')').join(' ')); continue; }
      if (containsUnderCrewBonusPhrase(playerName)) { dlog('[LPdbg] y=' + Math.round(line.y) + ' → filtered ship-bonus phrase "' + playerName + '"'); continue; }
      if (!isValidPlayerName(playerName)) { dlog('[LPdbg] y=' + Math.round(line.y) + ' → invalid: "' + playerName + '"'); continue; }
      // Filter team name banner fragments.
      // e.g. "PEED ED RUN!s" ← "SPEED RUN!'s" — handles:
      //   (a) compact substring/Levenshtein on letters+digits (catches "PEEDRUN")
      //   (b) word-level: any 4-char+ word in playerName appears inside teamName
      //       (catches "PEED" being a substring of "SPEED RUN")
      if (teamData.name) {
        const normS  = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const normSp = s => s.toUpperCase().replace(/[^A-Z ]+/g, ' ').trim().replace(/\s+/g, ' ');
        const tnN    = normS(teamData.name);   // "SPEEDRUN"
        const pnN    = normS(playerName);      // "PEEDEDRUNS"
        const tnNSp  = normSp(teamData.name);  // "SPEED RUN"
        if (pnN.length >= 3 && tnN.length >= 3) {
          const isSubstr  = pnN.includes(tnN) || tnN.includes(pnN);
          const maxLen    = Math.max(pnN.length, tnN.length);
          const isFuzzy   = maxLen >= 5 && levenshteinDistance(pnN, tnN) / maxLen <= 0.40;
          // Word-level: any 4+ char word of playerName is a substring of the team name
          const pnWords4  = normSp(playerName).split(' ').filter(w => w.length >= 4);
          const isWordSub = pnWords4.some(pw => tnNSp.includes(pw));
          if (isSubstr || isFuzzy || isWordSub) continue;
        }
      }
      if (/PARTY|CREW|HUB|VOICE|CHANNEL|PUSH|TALK|MUTE|DISABLE|DEAFEN|UNMUTE|TEXT|PINGS/i.test(playerName)) continue;
      if (/'S$/i.test(playerName)) continue;
      // Left-panel specific noise filters (gamertags rarely look like these):
      // (a) 4+ space-separated fragments are almost always UI label garble
      // (3-word names like "sticks and stones" are valid)
      if (playerName.split(/\s+/).length >= 4) continue;
      // (b) Very short all-lowercase names are often OCR noise fragments.
      // Keep 6+ chars by default, but allow high-confidence short single-token
      // names so cleaned OCR like "leetI9" -> "leet" survives.
      const lineMaxConfidence = nameColWords.reduce((max, word) => Math.max(max, Number(word?.confidence || 0)), 0);
      if (
        /^[a-z\s]+$/.test(playerName) &&
        playerName.replace(/\s+/g, '').length < 6 &&
        !(playerName.length >= 4 && !playerName.includes(' ') && lineMaxConfidence >= 70)
      ) continue;
      // (c) All-uppercase name 5 or fewer letters = button/label fragment (e.g. "ATTLE", "N JI")
      if (/^[A-Z\s]+$/.test(playerName) && playerName.replace(/\s+/g, '').length <= 5) continue;
      pushUniquePlayerName(out, playerName);
      dlog('[LPdbg] y=' + Math.round(line.y) + ' → ADD "' + playerName + '"');
    }
    return out;
  };

  // First pass: anchor-window around active user to reduce UI noise.
  // Use 40% of image height so the 4th player card (~30-35% below the active
  // user anchor) is always included even with small positional variance.
  let parsedPlayers = [];
  if (foundActiveUser && activeUserYPos !== null) {
    const anchorLines = groupedLines.filter(line => Math.abs(line.y - activeUserYPos) <= imageHeight * 0.40);
    parsedPlayers = parsePlayersFromLines(anchorLines);
  }

  // Fallback: full left panel if anchor-window under-captures
  if (parsedPlayers.length < 3) {
    const expanded = parsePlayersFromLines(groupedLines);
    if (expanded.length > parsedPlayers.length) {
      parsedPlayers = expanded;
    }
  }

  // Second sweep for split PARTY/TEAM left-panel layouts:
  // in some captures the active user is in PARTY while teammates are listed in a
  // separate TEAM section below the voice controls.
  const isTeamHeaderLine = (line) => {
    const raw = line.words
      .map((w) => String(w?.text || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!raw) return false;
    if (/^\W*TEAM\W*$/i.test(raw)) return true;
    const compact = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
    return compact === 'TEAM';
  };
  const teamHeaderLines = groupedLines
    .filter(isTeamHeaderLine)
    .sort((a, b) => a.y - b.y);
  if (teamHeaderLines.length > 0) {
    const teamHeader = teamHeaderLines[teamHeaderLines.length - 1];
    const teamSectionLines = groupedLines.filter((line) => (
      line.y > teamHeader.y &&
      line.y <= leftBounds.yMax &&
      (line.y - teamHeader.y) <= imageHeight * 0.34
    ));
    const teamSectionPlayers = parsePlayersFromLines(teamSectionLines);
    for (const name of teamSectionPlayers) {
      pushUniquePlayerName(parsedPlayers, name);
    }
    if (teamSectionPlayers.length > 0) {
      dlog('[CrewHub] TEAM sweep merged players below y=' + Math.round(teamHeader.y) + ': ' + teamSectionPlayers.join(', '));
    }
  }

  const bottomLeftCandidates = extractBottomLeftTeammateCandidates(words, imageWidth, imageHeight, { geometry, debugLayout });
  if (bottomLeftCandidates.length > 0) {
    const repairedPlayers = [];
    const usedBottomIdx = new Set();

    for (const name of parsedPlayers) {
      let bestName = name;
      let bestIdx = -1;
      for (let i = 0; i < bottomLeftCandidates.length; i += 1) {
        if (usedBottomIdx.has(i)) continue;
        const candidate = bottomLeftCandidates[i];
        if (!namesAreNearDuplicate(name, candidate)) continue;
        bestName = chooseBetterTeammateDisplay(bestName, candidate);
        bestIdx = i;
        break;
      }
      if (bestIdx >= 0) usedBottomIdx.add(bestIdx);
      pushUniquePlayerName(repairedPlayers, bestName);
    }

    // Bottom-left roster repeats are often cleaner than left-row OCR and can
    // recover missing teammates when the left panel is partially occluded.
    for (let i = 0; i < bottomLeftCandidates.length && repairedPlayers.length < 4; i += 1) {
      if (usedBottomIdx.has(i)) continue;
      pushUniquePlayerName(repairedPlayers, bottomLeftCandidates[i]);
    }

    if (repairedPlayers.length > 0) {
      parsedPlayers = repairedPlayers;
    }
  }

  teamData.players = [...new Set(parsedPlayers)];
  if (teamData.players.length === 0) {
    dlog('[CrewHub] Left panel: no teammates found after all filters');
  } else {
    for (const name of teamData.players) {
      dlog('[CrewHub] Found teammate: ' + name);
    }
  }
  dlog('[CrewHub] Left panel done — name="' + teamData.name + '" players=' + teamData.players.length);

  return teamData;
}

/**
 * Extract enemy teams from the right-side enemy panel using row-based card scanning.
 *
 * Architecture: Row-Based Card Scanner (v3)
 *
 * The Crew Hub right panel shows enemy player "cards" stacked vertically:
 *   Each card ~78px tall contains:
 *   - Portrait (42×42 left side)
 *   - Player name (white text, x ≈ 63-92%)
 *   - ~22px colored bar 11px below the name (color = team identity)
 *
 * Algorithm:
 *   1. Filter all OCR words to the ENEMY_NAME x-band (63-92%)
 *   2. Group into lines by Y proximity
 *   3. For each line, extract player name and sample color bar below
 *   4. Group players by detected color → form teams
 *   5. Self-improvement: inherit color from neighbors at ~78px card spacing
 *
 * @param {Buffer} colorImageBuffer - Original unprocessed color image buffer
 * @param {Array} words - All OCR words from Tesseract
 * @param {Array} lines - OCR lines (unused, kept for API compat)
 * @param {string} text - Full OCR text (unused)
 * @param {number} imageWidth - Image width in pixels
 * @param {number} imageHeight - Image height in pixels
 * @param {number} scale - Image scale factor from preprocessing (default 1)
 * @param {Object} layout - Layout constants
 */
async function extractEnemyPanel(colorImageBuffer, words, lines, text, imageWidth, imageHeight, scale = 1, layout = LAYOUT, options = null) {
  dlog('=== extractEnemyPanel ' + new Date().toISOString() + ' ===');
  dlog('[CrewHub] Extracting enemy panel — row-based card scanner v3');
  const geometry = options?.geometry || null;
  const debugLayout = options?.debugLayout === true;

  const SPECTATOR_PATTERNS = [
    /FIEND\s*(OR|0R)\s*FOE/i,
    /SPECTATOR/i,
    /OBSERVER/i,
  ];
  const isSpectatorLine = (s) => SPECTATOR_PATTERNS.some(p => p.test(s));

  // ── Bounds ──────────────────────────────────────────────────────────────────
  const panelXMin = imageWidth  * layout.ENEMY_PANEL.xMin;   // ~0.55
  const panelXMax = imageWidth  * layout.ENEMY_PANEL.xMax;   // ~1.0
  let panelYMin = imageHeight * layout.ENEMY_PANEL.yMin;     // ~0.08
  const panelYMax = imageHeight * layout.ENEMY_PANEL.yMax;   // ~0.95

  // Enemy name X-band: narrower filter to isolate player name text
  const nameXMin = imageWidth * layout.ENEMY_NAME.xMin;      // ~0.63
  const nameXMax = imageWidth * layout.ENEMY_NAME.xMax;      // ~0.92
  const enemyRegionWidth = Math.max(1, panelXMax - panelXMin);
  const referenceEnemyRegionWidth = REFERENCE_WIDTH * (LAYOUT.ENEMY_PANEL.xMax - LAYOUT.ENEMY_PANEL.xMin);

  const topHudWords = (words || []).filter((word) => {
    if (!word?.bbox || !word?.text) return false;
    const cx = (word.bbox.x0 + word.bbox.x1) / 2;
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    if (cx < nameXMin || cx > panelXMax) return false;
    if (cy < panelYMin || cy > imageHeight * 0.20) return false;

    const compact = String(word.text || '').toUpperCase().replace(/[^A-Z0-9%]/g, '');
    return compact === 'FPS'
      || compact === 'GPU'
      || compact === 'CPU'
      || compact === 'LAT'
      || /^FPS\d+$/.test(compact)
      || /^GPU\d+%?$/.test(compact)
      || /^CPU\d+%?$/.test(compact)
      || /^LAT\d+MS?$/.test(compact);
  });
  if (topHudWords.length > 0) {
    const hudBottomY = Math.max(...topHudWords.map((word) => Number(word?.bbox?.y1 || 0)));
    panelYMin = Math.min(panelYMax, Math.max(panelYMin, hudBottomY + Math.round(imageHeight * 0.015)));
    dlog('[CrewHub] Raised enemy panel yMin to skip top HUD: ' + Math.round(panelYMin));
  }

  // ── Step 1: Filter words into enemy name X-band ─────────────────────────────
  const enemyWords = [];
  for (const w of words) {
    if (!w.bbox || !w.text) continue;
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    if (cx < nameXMin || cx > nameXMax) continue;
    if (cy < panelYMin || cy > panelYMax) continue;
    // Confidence floors by token length to balance recall vs noise:
    //   ≥7 chars → 8
    //   4-6 chars → 10
    //   1-3 chars → 12
    const tlen = w.text.trim().length;
    const confFloor = tlen >= 7 ? 8 : tlen >= 4 ? 10 : 12;
    if ((w.confidence || 0) < confFloor) continue;
    enemyWords.push(w);
  }

  dlog('[CrewHub] Enemy panel words in name band: ' + enemyWords.length + ' (imageSize=' + imageWidth + 'x' + imageHeight + ' scale=' + scale + ')');
  dlog('[CrewHub] All words (' + enemyWords.length + '): ' + enemyWords.map(w => '"' + w.text + '"(c' + Math.round(w.confidence) + ')@y' + Math.round((w.bbox.y0+w.bbox.y1)/2)).join(' '));

  if (enemyWords.length === 0) {
    dlog('[CrewHub] No words found in enemy name band — returning empty');
    return [];
  }

  // ── Step 1b: Pre-merge fragmented bracket tokens ─────────────────────────────
  // Tesseract/PaddleOCR sometimes splits rank prefixes like "[6*]Tiblolan" into
  // two tokens: "[6*]" (or "[") and "Tiblolan". Merge them back when the bracket
  // token is immediately left-adjacent (gap < 1 char width) to a name token.
  {
    const merged = [];
    const used = new Set();
    for (let i = 0; i < enemyWords.length; i++) {
      if (used.has(i)) continue;
      const w = enemyWords[i];
      const t = (w.text || '').trim();
      // Candidate bracket token: starts with '[' and is short (≤6 chars)
      if (/^\[[\d*°+~]*\]?$/.test(t) && t.length <= 6 && w.bbox) {
        // Look for an adjacent word to the right on the same row
        for (let j = i + 1; j < enemyWords.length; j++) {
          if (used.has(j)) continue;
          const n = enemyWords[j];
          if (!n.bbox) continue;
          const cy1 = (w.bbox.y0 + w.bbox.y1) / 2;
          const cy2 = (n.bbox.y0 + n.bbox.y1) / 2;
          const lineH = w.bbox.y1 - w.bbox.y0;
          if (Math.abs(cy1 - cy2) > lineH * 1.2) continue; // different row
          const gap = n.bbox.x0 - w.bbox.x1;
          const charW = Math.max(scaleReferencePx(4, geometry, 'x', scale), (w.bbox.x1 - w.bbox.x0) / Math.max(1, t.length));
          if (gap < charW * 2) {
            // Merge: "[6*]" + "Tiblolan" → "[6*]Tiblolan"
            const mergedWord = {
              text: t + (n.text || '').trim(),
              confidence: Math.min(w.confidence || 0, n.confidence || 0),
              bbox: {
                x0: w.bbox.x0, y0: Math.min(w.bbox.y0, n.bbox.y0),
                x1: n.bbox.x1, y1: Math.max(w.bbox.y1, n.bbox.y1),
              },
            };
            dlog('[CrewHub] Bracket merge: "' + t + '" + "' + (n.text||'').trim() + '" → "' + mergedWord.text + '"');
            merged.push(mergedWord);
            used.add(i);
            used.add(j);
            break;
          }
        }
        if (used.has(i)) continue;
      }
      merged.push(w);
    }
    if (merged.length < enemyWords.length) {
      dlog('[CrewHub] Bracket pre-merge: ' + enemyWords.length + ' → ' + merged.length + ' words');
      enemyWords.length = 0;
      for (const w of merged) enemyWords.push(w);
    }
  }

  // ── Step 2: Group words into lines ──────────────────────────────────────────
  const groupedLines = groupWordsIntoLines(enemyWords, imageHeight, imageWidth, {
    geometry,
    regionWidth: enemyRegionWidth,
    baselineXThresholdPx: referenceEnemyRegionWidth * 0.25,
    debugLayout,
    debugLabel: 'enemyPanel',
  });
  dlog('[CrewHub] Enemy lines found: ' + groupedLines.length + ' | ys=' + groupedLines.map(l => Math.round(l.y)).join(','));

  // ── Step 3: For each line, extract name + sample color bar below ────────────
  const CARD_HEIGHT = scaleReferencePx(78, geometry, 'y', scale);
  const BAR_OFFSET = scaleReferencePx(11, geometry, 'y', scale);
  const BAR_HEIGHT = scaleReferencePx(28, geometry, 'y', scale);
  const BAR_ZONE_MARGIN = scaleReferencePx(5, geometry, 'y', scale);
  const MIN_COLOR_BBOX_WIDTH = scaleReferencePx(24, geometry, 'x', scale);
  const COLOR_BBOX_INSET_MIN = scaleReferencePx(2, geometry, 'x', scale);
  logCrewHubLayoutDebug(debugLayout, 'enemyThresholds', {
    lineMergeThreshold: Number(computeLineMergeThreshold(imageHeight, geometry).toFixed(2)),
    xProximityThreshold: Number(computeXProximityThreshold(imageWidth, {
      geometry,
      regionWidth: enemyRegionWidth,
      baselineXThresholdPx: referenceEnemyRegionWidth * 0.25,
    }).toFixed(2)),
    cardHeight: CARD_HEIGHT,
    barOffset: BAR_OFFSET,
    barHeight: BAR_HEIGHT,
  });

  // Tracks Y zones (in scaled OCR coords) occupied by detected color bars.
  // Any OCR line whose center falls in one of these zones is bar text, not a player name.
  const barZones = []; // { min, max }

  const cards = []; // { y, name, color, confidence, bbox }
  const capturedTeamNames = new Map(); // color → cleanest team name seen
  const spectatorCardYs = []; // Y positions of skipped spectator/black cards
  const skippedSpectatorNameKeys = new Set();

  // Helper: extract the raw team name text from a line's word list
  // (used when the line is identified as a team-name bar, not a player name)
  function extractRawTeamNameFromLine(lineWords) {
    const normalizeTeamToken = (token) => String(token || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const dedupeRepeatedTokens = (tokens) => {
      const out = [];
      const seen = new Set();
      for (const token of tokens) {
        const norm = normalizeTeamToken(token);
        if (!norm) continue;
        if (seen.has(norm)) continue;
        seen.add(norm);
        out.push(token);
      }
      return out;
    };

    // Drop near-zero-confidence words — Tesseract sometimes returns garbage
    // all-caps strings (e.g. "ISM"/"NGUARD" at conf=4) that happen to pass
    // the caps filter but are not real text.  The actual team name bar text
    // (e.g. "VANGUARD" at conf=88) will appear in a later, cleaner read.
    const confWords = lineWords.filter(w => (w.confidence || 0) >= 15);
    if (confWords.length === 0) return null;
    // Priority 1: longest hyphenated all-caps compound (e.g. "ATTACK-O-LANTERN")
    const sorted = [...confWords].sort((a, b) => b.text.trim().length - a.text.trim().length);
    for (const w of sorted) {
      const t = w.text.trim();
      if (/^[A-Z0-9]{2,}(-[A-Z0-9]+)+$/.test(t)) return t;
    }
    // Priority 2: join all-caps words of length ≥3 (filters leading noise like "Y", "|", "NY")
    const capsWordsRaw = confWords.map(w => w.text.trim()).filter(t => /^[A-Z]{3,}$/.test(t));
    const capsWords = dedupeRepeatedTokens(capsWordsRaw);
    if (capsWords.length >= 2) return capsWords.join(' ');
    if (capsWords.length === 1 && capsWords[0].length >= 5) return capsWords[0];
    return null;
  }

  // Build a tighter bbox around the core OCR words for color-bar sampling.
  // Paddle line boxes can be much wider than the actual name text and cause
  // color bleed from adjacent bars; we keep y-range from matched words and
  // tighten x-range further with a small inset.
  function buildTightColorDetectBbox(lineWords, targetText, fallbackBbox) {
    const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normTarget = norm(targetText);
    const targetParts = String(targetText || '')
      .toLowerCase()
      .split(/\s+/)
      .map(part => norm(part))
      .filter(Boolean);

    const matched = lineWords.filter((w) => {
      if (!w?.bbox || !w?.text) return false;
      const t = norm(w.text);
      if (!t) return false;
      if (normTarget && (t === normTarget || normTarget.includes(t) || t.includes(normTarget))) return true;
      if (targetParts.length === 0) return false;
      return targetParts.some(part => part === t || part.includes(t) || t.includes(part));
    });

    const source = matched.length > 0 ? matched : lineWords.filter(w => w?.bbox);
    if (source.length === 0 || !fallbackBbox) return fallbackBbox;

    let bbox = {
      x0: Math.min(...source.map(w => w.bbox.x0)),
      y0: Math.min(...source.map(w => w.bbox.y0)),
      x1: Math.max(...source.map(w => w.bbox.x1)),
      y1: Math.max(...source.map(w => w.bbox.y1)),
    };

    const width = Math.max(0, bbox.x1 - bbox.x0);
    if (width >= MIN_COLOR_BBOX_WIDTH) {
      const inset = Math.max(COLOR_BBOX_INSET_MIN, Math.round(width * 0.08));
      if ((bbox.x1 - inset) > (bbox.x0 + inset)) {
        bbox = {
          ...bbox,
          x0: bbox.x0 + inset,
          x1: bbox.x1 - inset,
        };
      }
    }

    return bbox;
  }

  // Team bars repeat once per player card. Repetition is a strong prior that a
  // token is a bar label rather than a player name.
  const normalizeBarToken = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const barLabelFrequency = new Map();
  for (const tLine of groupedLines) {
    const raw = extractRawTeamNameFromLine(tLine.words);
    if (!raw) continue;
    const key = normalizeBarToken(raw);
    if (!key) continue;
    barLabelFrequency.set(key, (barLabelFrequency.get(key) || 0) + 1);
  }

  // Pre-pass: build player-y → team-name-text map using sequential Y-order.
  // In the enemy panel the pattern is always: PlayerName line, TeamBarText line,
  // PlayerName line, TeamBarText line, … This gives us correct team names
  // regardless of colour detection quality — used as fallback for capturedTeamNames.
  const playerYToTextTeamName = new Map();
  for (let gi = 0; gi < groupedLines.length - 1; gi++) {
    const cur = groupedLines[gi];
    const nxt = groupedLines[gi + 1];
    if (!cur || !nxt) continue;
    const curName = extractPlayerNameFromLine(cur.words);
    if (!curName || !isValidOpponentName(curName)) continue;
    const nxtBar = extractRawTeamNameFromLine(nxt.words);
    if (!nxtBar) continue;
    playerYToTextTeamName.set(Math.round(cur.y), nxtBar);
  }

  for (const line of groupedLines) {
    // ── Skip lines that fall inside a known bar zone (ship name text) ──────────
    const inBarZone = barZones.some(z => line.y >= z.min && line.y <= z.max);
    if (inBarZone) { dlog('[CrewHub] SKIP bar-zone line: "' + line.words.map(w => w.text).join(' ') + '" y=' + Math.round(line.y)); continue; }
    const lineText = line.words.map(w => w.text).join(' ').trim();
    if (!lineText || lineText.length < 2) { dlog('[CrewHub] SKIP too-short line: "' + lineText + '" y=' + Math.round(line.y)); continue; }
    if (containsUiNoisePhrase(lineText)) { dlog('[CrewHub] SKIP ui-noise phrase line: "' + lineText + '"'); continue; }
    if (isSpectatorLine(lineText)) { dlog('[CrewHub] SKIP spectator line: "' + lineText + '"'); continue; }

    // Check if all words are noise
    const wordsUpper = lineText.toUpperCase().split(/\s+/);
    const allNoise = wordsUpper.every(w => NOISE_WORDS.has(w) || w.length <= 1)
      && scoreAsPlayerName(lineText) < 25;
    if (allNoise) { dlog('[CrewHub] SKIP all-noise line: "' + lineText + '"'); continue; }

    // Extract player name
    let playerName = extractPlayerNameFromLine(line.words);
    if (!playerName) { dlog('[CrewHub] SKIP no-name extracted from: "' + lineText + '"'); continue; }
    if (containsUiNoisePhrase(playerName)) { dlog('[CrewHub] SKIP ui-noise phrase name: "' + playerName + '"'); continue; }

    // Build a synthetic bbox spanning the whole line — needed for both the
    // team-name-bar detection path and the regular color sampling path below.
    const firstWord = line.words[0];
    if (!firstWord?.bbox) continue;
    const lineBbox = {
      x0: Math.min(...line.words.map(w => w.bbox.x0)),
      y0: Math.min(...line.words.map(w => w.bbox.y0)),
      x1: Math.max(...line.words.map(w => w.bbox.x1)),
      y1: Math.max(...line.words.map(w => w.bbox.y1)),
    };

    // ── Detect team-name bars BEFORE player-name validation ──────────────────
    // isValidOpponentName will also reject these, but by checking here first
    // we can capture the actual team name text and its color.
    const isBarLine = isTeamName(playerName)
      || /^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(playerName)  // ATTACK-O-LANTERN
      || /^T{0,1}TACK(-O)?-LANTERN/i.test(playerName); // garbled variants
    const linePlayerScore = scoreAsPlayerName(playerName);
    const barToken = normalizeBarToken(playerName);
    const barTokenFreq = barLabelFrequency.get(barToken) || 0;
    const likelyGamertagCaps = /[0-9_]/.test(playerName) || linePlayerScore >= 35;
    // Bar-first classification unless a strong player-looking token clearly wins.
    if (isBarLine && linePlayerScore < 60 && barTokenFreq >= 2 && !likelyGamertagCaps) {
      if (colorImageBuffer) {
        const rawName = extractRawTeamNameFromLine(line.words);
        if (rawName) {
          try {
            const barColorDetectBbox = buildTightColorDetectBbox(line.words, rawName, lineBbox);
            const cr = await detectTeamColorBarBelow(colorImageBuffer, barColorDetectBbox, scale);
            if (cr.color !== 'unknown' && cr.color !== 'spectator' && cr.color !== 'black') {
              // Prefer the LONGEST captured name for each color (most complete read)
              const existing = capturedTeamNames.get(cr.color);
              // Don't register the same team name under two different colors
              // (can happen when a bar appears near a color-bleed from an adjacent bar).
              const alreadyByName = [...capturedTeamNames.values()]
                .some(n => n.toUpperCase() === rawName.toUpperCase());
              if (!alreadyByName && (!existing || rawName.length > existing.length)) {
                capturedTeamNames.set(cr.color, rawName);
                dlog('[CrewHub] Captured team name "' + rawName + '" color=' + cr.color);
              }
            }
          } catch (_) {}
        }
      }
      dlog('[CrewHub] Team name bar (skipping as player): "' + playerName + '"');
      continue;
    }

    // Some valid one-word all-caps handles look like team bars ("BIGTOWER").
    // If this token is not repeated as a bar label, soft-case it and re-validate.
    if (isTeamName(playerName) && barTokenFreq < 2 && !/[ _-]/.test(playerName)) {
      const softCased = playerName.charAt(0) + playerName.slice(1).toLowerCase();
      if (softCased && softCased !== playerName) {
        playerName = softCased;
      }
    }

    const allowShortTagCandidate = isLikelyShortUiSuffixTagCandidate(line.words, playerName);
    if (!isValidOpponentName(playerName) && !allowShortTagCandidate) {
      // Try stripping a leading digit-noise fragment to recover the real player name
      // e.g. "4s lirolake" → strip "4s" → test "lirolake" alone
      const _nameParts = playerName.trim().split(/\s+/);
      if (_nameParts.length >= 2 && /^\d/.test(_nameParts[0])) {
        const _stripped = _nameParts.slice(1).join(' ');
        if (isValidOpponentName(_stripped) || isLikelyShortUiSuffixTagCandidate(line.words, _stripped)) {
          playerName = _stripped;
        } else { dlog('[CrewHub] SKIP invalid-name: "' + playerName + '"'); continue; }
      } else { dlog('[CrewHub] SKIP invalid-name: "' + playerName + '"'); continue; }
    }
    if (/\b(?:PARTY|CREW|HUB|VOICE|CHANNEL|PUSH|TALK|MUTE|DISABLE|DEAFEN|UNMUTE|SAY|TEXT|PINGS)\b/i.test(playerName)) { dlog('[CrewHub] SKIP ui-word: "' + playerName + '"'); continue; }
    // 4+ word names are almost always OCR noise fragments joined together.
    // 3-word names like "sticks and stones" are valid gamertags.
    // Exception: if the first word alone is a strong valid name (e.g. "wootywoot"
    // or "Ledurricane" with noise fragments appended by the row-slice scan),
    // salvage it rather than discarding the whole line.
    if (playerName.trim().split(/\s+/).length >= 4) {
      const fp = playerName.trim().split(/\s+/)[0];
      if (fp && isValidOpponentName(fp) && scoreAsPlayerName(fp) >= 15) {
        playerName = fp;
      } else {
        dlog('[CrewHub] SKIP multi-word noise: "' + playerName + '"');
        continue;
      }
    }

    // ── Phantom numeric suffix filter ────────────────────────────────────────
    // OCR sometimes appends "19" to a name due to rank-badge bleed on the same
    // row.  "19" is the most common phantom artifact in this game's rank UI.
    // We ONLY strip the literal string "19" when preceded by a non-digit, so
    // that intentional numeric suffixes like "84", "16", "1", "9" are never
    // touched.  Names with digits before the "19" (e.g. "smu519", "Wobbly319")
    // are also protected because the penultimate char is a digit.
    // Examples stripped:  "Limler19"→"Limler", "Pu4uPu4u19"→"Pu4uPu4u",
    //                     "Daafin19"→"Daafin"
    // Examples protected: "primord1" (not 19), "itamare84" (not 19),
    //                     "smu519" (preceding char is digit), "Wobbly319" (same)
    {
      const phantomMatch = playerName.match(/^(.*[^0-9])(19)$/);
      if (phantomMatch) {
        const base = phantomMatch[1];
        const suffix = phantomMatch[2];
        if (base.length >= 4 && isValidOpponentName(base)) {
          dlog('[CrewHub] Phantom suffix strip: "' + playerName + '" → "' + base + '" (removed "' + suffix + '")');
          playerName = base;
        }
      }
    }

    // Get the bounding box of the first word (for color sampling reference)
    // (lineBbox already computed above)

    // Use a tight bbox around the name word(s) only for color bar detection.
    // The full lineBbox can extend below into neighbouring bar zones when noise
    // words land on a lower row (e.g. "-"@y884 pushes the window past the
    // BOREALIS red bar into FANCY GOOSE orange region, mis-assigning the card).
    const colorDetectBbox = buildTightColorDetectBbox(
      line.words,
      playerName.replace(/^\[\d+[*°+~]\]\s*/, ''),
      lineBbox
    );

    // Sample the colored bar BELOW the name text
    let detectedColor = 'unknown';
    let colorConfidence = 0;
    let rawHue = null;

    if (colorImageBuffer) {
      try {
        const colorDetectWidth = Math.max(0, (colorDetectBbox?.x1 || 0) - (colorDetectBbox?.x0 || 0));
        const colorDetectHeight = Math.max(0, (colorDetectBbox?.y1 || 0) - (colorDetectBbox?.y0 || 0));
        if (colorDetectWidth < scaleReferencePx(20, geometry, 'x', scale) || colorDetectHeight < scaleReferencePx(20, geometry, 'y', scale)) {
          dlog('[CrewHub] SKIP color detect: tiny bbox w=' + Math.round(colorDetectWidth) + ' h=' + Math.round(colorDetectHeight) + ' for "' + playerName + '"');
        } else {
          const cr = await detectTeamColorBarBelow(colorImageBuffer, colorDetectBbox, scale);
          rawHue = typeof cr?.rawHue === 'number' ? cr.rawHue : null;
          if (cr.color !== 'unknown' && cr.color !== 'spectator' && cr.color !== 'black' && cr.confidence > 30) {
            detectedColor = cr.color;
            colorConfidence = cr.confidence;
          } else if (cr.color === 'spectator' || cr.color === 'black') {
            console.log('[CrewHub] Skipping spectator/black card:', playerName);
            spectatorCardYs.push(line.y);
            skippedSpectatorNameKeys.add(normalizeNameKey(playerName));
            continue;
          }
        }
      } catch (e) {
        console.warn('[CrewHub] Color detection failed for', playerName, ':', e.message);
      }
    }

    const textTeamName = playerYToTextTeamName.get(Math.round(line.y)) || '';
    // Populate capturedTeamNames from text if colour detection didn't already do it.
    if (textTeamName && detectedColor !== 'unknown' && !capturedTeamNames.has(detectedColor)) {
      capturedTeamNames.set(detectedColor, textTeamName);
      dlog('[CrewHub] capturedTeamNames (text fallback): ' + detectedColor + ' → "' + textTeamName + '"');
    }

    cards.push({
      y: line.y,
      name: playerName,
      color: detectedColor,
      rawHue,
      confidence: colorConfidence,
      textTeamName,
      bbox: lineBbox,
    });

    // Register the bar zone so subsequent lines from the same card get skipped.
    // Safety guard: if the "player name" itself looks like a ship name (e.g. an
    // all-caps hyphenated word that slipped past isValidOpponentName), skip the
    // bar zone registration — a misplaced bar zone can block the NEXT real player
    // name from being processed (e.g., "LEASE" bar zone at y≈775 blocked
    // "Scipion" at y≈841 in the eng+chi_sim fallback path).
    const looksLikeShipNameBar = /^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(playerName)
      || (/^[A-Z]{6,}$/.test(playerName) && /(?:LANTERN|PLEASE|WITCH|ATTACK|SPAGHURDER)/.test(playerName));
    if (!looksLikeShipNameBar) {
      barZones.push({
        min: lineBbox.y1 + BAR_OFFSET - BAR_ZONE_MARGIN,
        max: lineBbox.y1 + BAR_OFFSET + BAR_HEIGHT + BAR_ZONE_MARGIN,
      });
    } else {
      dlog('[CrewHub] SKIP bar-zone for ship-name-like card: "' + playerName + '"');
    }

    dlog('[CrewHub] Card: ' + playerName + ' | color: ' + detectedColor + ' | conf: ' + colorConfidence + ' | y: ' + Math.round(line.y));
  }

  // ── Step 3b: Deduplicate cards that are within the same card-height zone ────
  // The team name bar text (e.g. "WITCH PLEASE") appears ~30-60px below the
  // player name in the same card. Use 0.4× card height (~62px) so we catch the
  // bar (24-50px away) without merging consecutive player cards (~78px+).
  const deduped = [];
  for (const card of cards) {
    const nearby = deduped.find(k => Math.abs(k.y - card.y) < CARD_HEIGHT * 0.4);
    if (nearby) {
      // Prefer the name with the higher player-name score, not simply the longer one.
      // Known-color card only displaces an unknown-color card when the name quality
      // is comparable (within 15 pts); a weak OCR read like "thong"(c37,score=20)
      // must NOT replace a strong read like "fartingPuppy"(c89,score=40).
      const newScore    = scoreAsPlayerName(card.name);
      const nearbyScore = scoreAsPlayerName(nearby.name);
      const keepNew = (card.color !== 'unknown' && nearby.color === 'unknown'
                        && newScore >= nearbyScore - 15)
        || (card.color === nearby.color && newScore > nearbyScore);
      if (keepNew) {
        deduped.splice(deduped.indexOf(nearby), 1, card);
        dlog('[CrewHub] Dedup: replaced "' + nearby.name + '" with "' + card.name + '" (same zone y=' + Math.round(card.y) + ')');
      } else {
        dlog('[CrewHub] Dedup: dropped "' + card.name + '" near "' + nearby.name + '" (dist=' + Math.round(Math.abs(nearby.y - card.y)) + 'px)');
      }
      continue;
    }
    deduped.push(card);
  }
  logCrewHubLayoutDebug(debugLayout, 'cardsPreDedup', cards.map((card) => ({
    name: card.name,
    color: card.color,
    y: Math.round(card.y),
    confidence: card.confidence,
  })));
  const uniqueCards = deduped;
  dlog('[CrewHub] Cards after dedup: ' + uniqueCards.length + ' — ' + uniqueCards.map(c => c.name + '(' + c.color + ')').join(', '));
  logCrewHubLayoutDebug(debugLayout, 'cardsPostDedup', uniqueCards.map((card) => ({
    name: card.name,
    color: card.color,
    y: Math.round(card.y),
    confidence: card.confidence,
  })));

  // ── Step 3b-post: Remove cards whose name is a garbled form of a captured team name ─
  // e.g. "Fancy Goose" == "FANCY GOOSE", "ANGUAR" ⊂ "VANGUARD", "VANCUARP" ≈ "VANGUARD"
  if (capturedTeamNames.size > 0) {
    const normS = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (let i = uniqueCards.length - 1; i >= 0; i--) {
      const card = uniqueCards[i];
      const pn   = normS(card.name);
      if (!pn || pn.length < 3) continue;
      let isFragment = false;
      for (const [, tn] of capturedTeamNames) {
        const t = normS(tn);
        if (!t || t.length < 4) continue;
        if (pn === t || pn.includes(t) || t.includes(pn)) { isFragment = true; break; }
        if (pn.length >= 5 && t.length >= 5) {
          const maxLen = Math.max(pn.length, t.length);
          if (levenshteinDistance(pn, t) / maxLen <= 0.25) { isFragment = true; break; }
        }
      }
      if (isFragment) {
        dlog('[CrewHub] Post-dedup: removed team-name fragment "' + card.name + '"');
        uniqueCards.splice(i, 1);
      }
    }
  }

  // ── Step 3c: Capture team names from bar-zone lines ──────────────────────────
  // Team name bars appear near their player cards in Y. Find the nearest known-
  // color card above the bar within a search window. First captured name wins —
  // never override a name already captured for a color.
  for (const tLine of groupedLines) {
    const rawTeamName = extractRawTeamNameFromLine(tLine.words);
    if (!rawTeamName) continue;
    if (!isTeamName(rawTeamName) && !/^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(rawTeamName)) continue;
    // Find the nearest known-color card above OR below this line
    let bestCard = null, bestDist = Infinity;
    for (const card of uniqueCards) {
      if (card.color === 'unknown') continue;
      const dist = Math.abs(tLine.y - card.y);
      if (dist < CARD_HEIGHT * 4 && dist < bestDist) { bestDist = dist; bestCard = card; }
    }
    // Block exact duplicates AND near-duplicates (≤15% edit distance) so that
    // OCR misreads like "EANCY GOOSE" don't create a second entry for a name
    // already captured as "FANCY GOOSE" for a different color.
    const normFuz = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rawNorm = normFuz(rawTeamName);
    const alreadyByName3c = [...capturedTeamNames.values()]
      .some(n => {
        if (n.toUpperCase() === rawTeamName.toUpperCase()) return true;
        const nN = normFuz(n);
        if (nN.length >= 6 && rawNorm.length >= 6) {
          const maxLen = Math.max(nN.length, rawNorm.length);
          return levenshteinDistance(nN, rawNorm) / maxLen <= 0.15;
        }
        return false;
      });
    if (bestCard && !capturedTeamNames.has(bestCard.color) && !alreadyByName3c) {
      capturedTeamNames.set(bestCard.color, rawTeamName);
      dlog('[CrewHub] Step3c captured "' + rawTeamName + '" for color=' + bestCard.color + ' (nearest card: ' + bestCard.name + ', dist=' + Math.round(bestDist) + 'px)');
    }
  }

  // ── Step 3c-post: Re-run team-name-fragment filter now that Step 3c has
  //    populated capturedTeamNames from bar-zone lines (e.g. VANGUARD whose
  //    bar fell inside a player card's bar-zone and was missed in the first pass).
  if (capturedTeamNames.size > 0) {
    const normS3c = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (let i = uniqueCards.length - 1; i >= 0; i--) {
      const card = uniqueCards[i];
      const pn   = normS3c(card.name);
      if (!pn || pn.length < 3) continue;
      let isFragment = false;
      for (const [, tn] of capturedTeamNames) {
        const t = normS3c(tn);
        if (!t || t.length < 4) continue;
        if (pn === t || pn.includes(t) || t.includes(pn)) { isFragment = true; break; }
        if (pn.length >= 5 && t.length >= 5) {
          const maxLen = Math.max(pn.length, t.length);
          if (levenshteinDistance(pn, t) / maxLen <= 0.25) { isFragment = true; break; }
        }
      }
      if (isFragment) {
        dlog('[CrewHub] Step3c-post: removed team-name fragment "' + card.name + '"');
        uniqueCards.splice(i, 1);
      }
    }
  }
  const sameColorSplitBaseHeight = Number.isFinite(CARD_HEIGHT) && CARD_HEIGHT > 0 ? CARD_HEIGHT : 78;
  const getSplitGapForRange = (a, b) => getSameColorSplitGap(
    sameColorSplitBaseHeight,
    countAnchorsBetween(spectatorCardYs, a, b)
  );
  const getMergeGapForRange = (a, b) => getSameColorMergeGap(
    sameColorSplitBaseHeight,
    countAnchorsBetween(spectatorCardYs, a, b)
  );
  const isSkippedSpectatorRow = (y) => isNearSkippedAnchor(spectatorCardYs, y, sameColorSplitBaseHeight);

  function normalizeBadgeKey(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function canonicalizeBadgeKey(rawKey, existingKeys) {
    if (!rawKey) return rawKey;
    for (const key of existingKeys) {
      if (!key) continue;
      if (rawKey === key) return key;
      if (rawKey.length >= 6 && key.length >= 6 && (rawKey.includes(key) || key.includes(rawKey))) {
        return key.length >= rawKey.length ? key : rawKey;
      }
      if (rawKey.length >= 8 && key.length >= 8) {
        const maxLen = Math.max(rawKey.length, key.length);
        if (levenshteinDistance(rawKey, key) / maxLen <= 0.2) return key;
      }
    }
    return rawKey;
  }

  // ── Step 4a: Badge-first grouping (player line + repeated badge line below) ─
  const minBadgeGap = scaleReferencePx(18, geometry, 'y', scale);
  const maxBadgeGap = scaleReferencePx(120, geometry, 'y', scale);
  const idealBadgeGap = scaleReferencePx(38, geometry, 'y', scale);
  const badgeLineCandidates = [];
  const badgeFreq = new Map();
  const badgeDisplay = new Map();
  for (const tLine of groupedLines) {
    const rawTeamName = extractRawTeamNameFromLine(tLine.words);
    if (!rawTeamName) continue;
    if (!isTeamName(rawTeamName) && !/^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(rawTeamName)) continue;
    // Skip badge lines whose Y falls within the bar zone of a skipped spectator/black card.
    const isSpectatorBadge = spectatorCardYs.some(sy => {
      const barMin = sy + BAR_OFFSET - sameColorSplitBaseHeight * 0.2;
      const barMax = sy + BAR_OFFSET + BAR_HEIGHT + sameColorSplitBaseHeight * 0.2;
      return tLine.y >= barMin && tLine.y <= barMax;
    });
    if (isSpectatorBadge) continue;
    const rawKey = normalizeBadgeKey(rawTeamName);
    if (!rawKey || rawKey.length < 4) continue;
    const key = canonicalizeBadgeKey(rawKey, badgeFreq.keys());
    badgeLineCandidates.push({ y: tLine.y, key, raw: rawTeamName });
    badgeFreq.set(key, (badgeFreq.get(key) || 0) + 1);
    const existingDisplay = badgeDisplay.get(key);
    if (!existingDisplay || rawTeamName.length > existingDisplay.length) {
      badgeDisplay.set(key, rawTeamName);
    }
  }

  const badgeGroups = new Map(); // key -> { key, badgeName, cards[], minY, maxY, confidence, colorHints[] }
  const assignedCardIds = new Set();
  const sortedCardsByY = [...uniqueCards].sort((a, b) => a.y - b.y);
  for (const card of sortedCardsByY) {
    let best = null;
    for (const cand of badgeLineCandidates) {
      const gap = cand.y - card.y;
      if (gap < minBadgeGap || gap > maxBadgeGap) continue;
      const dist = Math.abs(gap - idealBadgeGap);
      if (!best || dist < best.dist) {
        best = { ...cand, gap, dist };
      }
    }
    if (!best) continue;
    // Keep only repeated badge labels; one-off labels are usually OCR noise.
    const freq = badgeFreq.get(best.key) || 0;
    if (freq < 2) continue;
    if (!badgeGroups.has(best.key)) {
      badgeGroups.set(best.key, {
        key: best.key,
        badgeName: badgeDisplay.get(best.key) || best.raw,
        cards: [],
        minY: Infinity,
        maxY: -Infinity,
        confidence: 0,
        colorHints: [],
      });
    }
    const g = badgeGroups.get(best.key);
    g.cards.push(card);
    g.minY = Math.min(g.minY, card.y);
    g.maxY = Math.max(g.maxY, card.y);
    g.confidence = Math.max(g.confidence, card.confidence || 0);
    if (card.color && card.color !== 'unknown') g.colorHints.push(card.color);
    assignedCardIds.add(card);
  }

  let knownGroups = [];
  const badgeGroupedCardCount = [...badgeGroups.values()].reduce((sum, g) => sum + g.cards.length, 0);
  const useBadgeGrouping = badgeGroups.size >= 2 && badgeGroupedCardCount >= Math.max(3, Math.floor(uniqueCards.length * 0.5));

  if (useBadgeGrouping) {
    dlog('[CrewHub] Step4a badge grouping active: groups=' + badgeGroups.size + ' cards=' + badgeGroupedCardCount + '/' + uniqueCards.length);

    for (const g of badgeGroups.values()) {
      // Use majority card color as a hint only; badge text defines grouping.
      let color = 'unknown';
      if (g.colorHints.length > 0) {
        const counts = new Map();
        for (const c of g.colorHints) counts.set(c, (counts.get(c) || 0) + 1);
        color = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] || 'unknown';
      }
      knownGroups.push({
        color,
        badgeName: g.badgeName,
        cards: g.cards,
        minY: g.minY,
        maxY: g.maxY,
        confidence: g.confidence || 0,
      });
    }

    // Assign ungrouped cards to nearest badge group by Y distance.
    const unassigned = uniqueCards.filter(c => !assignedCardIds.has(c));
    for (const card of unassigned) {
      // Preserve singleton teams when a card has a known color that is not
      // represented in repeated-badge groups (e.g. Riv1P/FANCY GOOSE, Tycdaddy/THE MUNGUS).
      // Use hue proximity (±25°) rather than exact name equality so that adjacent
      // Wildgate names like 'skyBlue' and 'periwinkle' are recognised as the same
      // team and don't each spawn a spurious extra group.
      if (card.color && card.color !== 'unknown') {
        const cardHue = typeof card.rawHue === 'number' ? card.rawHue : null;
        const HUE_MERGE_THRESHOLD = 25;
        const sameColorExisting = knownGroups.find(g => {
          if (g.color === card.color) return true;
          if (g.color === 'unknown' || cardHue === null) return false;
          const groupHue = WILDGATE_COLOR_HUE.get(g.color);
          return typeof groupHue === 'number' && hueDistance(cardHue, groupHue) <= HUE_MERGE_THRESHOLD;
        });
        if (!sameColorExisting) {
          knownGroups.push({
            color: card.color,
            badgeName: capturedTeamNames.get(card.color) || '',
            cards: [card],
            minY: card.y,
            maxY: card.y,
            confidence: card.confidence || 0,
          });
          dlog('[CrewHub] Step4a preserve singleton color "' + card.name + '" -> color=' + card.color);
          continue;
        }
      }

      let bestGroup = null;
      let bestDist = Infinity;
      for (const g of knownGroups) {
        const dist = card.y < g.minY ? g.minY - card.y
          : card.y > g.maxY ? card.y - g.maxY
            : 0;
        if (dist < bestDist) {
          bestDist = dist;
          bestGroup = g;
        }
      }
      // Use a wider gap tolerance for unknown-color cards to handle spectator-card
      // gaps (only where skipped spectator cards were actually detected), so
      // yellow-team players whose color bar
      // detection failed don't get silently dropped and fall into a spurious "Team 1".
      const groupEdgeY = card.y < bestGroup?.minY ? bestGroup.minY
        : card.y > bestGroup?.maxY ? bestGroup.maxY
          : card.y;
      const distLimit = (card.color === 'unknown')
        ? Math.max(CARD_HEIGHT * 2.4, getSplitGapForRange(card.y, groupEdgeY))
        : CARD_HEIGHT * 2.4;
      if (bestGroup && bestDist <= distLimit) {
        const colorMismatch = card.color && card.color !== 'unknown'
          && bestGroup.color && bestGroup.color !== card.color;
        if (colorMismatch && bestDist > CARD_HEIGHT * 0.9) {
          knownGroups.push({
            color: card.color,
            badgeName: capturedTeamNames.get(card.color) || '',
            cards: [card],
            minY: card.y,
            maxY: card.y,
            confidence: card.confidence || 0,
          });
          dlog('[CrewHub] Step4a split ungrouped "' + card.name + '" into singleton color=' + card.color + ' (dist=' + Math.round(bestDist) + 'px)');
          continue;
        }
        bestGroup.cards.push(card);
        bestGroup.minY = Math.min(bestGroup.minY, card.y);
        bestGroup.maxY = Math.max(bestGroup.maxY, card.y);
        bestGroup.confidence = Math.max(bestGroup.confidence, card.confidence || 0);
        dlog('[CrewHub] Step4a assign ungrouped "' + card.name + '" -> ' + (bestGroup.badgeName || bestGroup.color) + ' (dist=' + Math.round(bestDist) + 'px)');
      }
    }
  } else {
    // ── Fallback: hue-first clustering for ALL chromatic cards ────────────────
    // Route every card that has a rawHue (named or unknown) through clusterByHue
    // so that adjacent Wildgate color names from the same bar (e.g. 'skyBlue' vs
    // 'periwinkle' from slightly different sample positions) land in the same
    // cluster.  Within each hue cluster, subClusterByYGap then splits truly
    // separate same-colour teams by spatial gap.
    // Cards without rawHue (truly achromatic / failed bars) remain as singletons.

    function subClusterByYGap(cards) {
      if (cards.length <= 1) return [cards];
      const sorted = [...cards].sort((a, b) => a.y - b.y);
      const clusters = [[sorted[0]]];
      for (let i = 1; i < sorted.length; i += 1) {
        const gap = sorted[i].y - sorted[i - 1].y;
        const gapThreshold = getSplitGapForRange(sorted[i - 1].y, sorted[i].y);
        if (gap > gapThreshold) {
          clusters.push([sorted[i]]);
        } else {
          clusters[clusters.length - 1].push(sorted[i]);
        }
      }
      return clusters;
    }

    const chromaticCards = uniqueCards.filter(c => typeof c.rawHue === 'number');
    const achromaticCards = uniqueCards.filter(c => typeof c.rawHue !== 'number' && c.color === 'unknown');

    knownGroups = [];

    if (chromaticCards.length > 0) {
      const huePlayers = chromaticCards.map(c => ({ name: c.name, hue: c.rawHue, card: c }));
      // maxTeams=5: one more than the game max (4) to allow edge-case overflow
      const hueClusters = clusterByHue(huePlayers, 5, 15);

      for (const hueCluster of hueClusters) {
        const clusterCards = hueCluster.map(p => p.card);
        const hues = hueCluster.map(p => p.hue);

        // Circular-mean hue for a stable centroid label
        const sinSum = hues.reduce((s, h) => s + Math.sin(h * Math.PI / 180), 0);
        const cosSum = hues.reduce((s, h) => s + Math.cos(h * Math.PI / 180), 0);
        const meanRad = Math.atan2(sinSum / hues.length, cosSum / hues.length);
        const centroidHue = Math.round(((meanRad * 180 / Math.PI) + 360) % 360);

        // Prefer the majority named color (keeps legacy names like 'orange'/'red'
        // stable); fall back to the centroid-mapped Wildgate name.
        const namedColors = clusterCards.map(c => c.color).filter(c => c && c !== 'unknown');
        let colorLabel;
        if (namedColors.length > 0) {
          const counts = new Map();
          for (const c of namedColors) counts.set(c, (counts.get(c) || 0) + 1);
          colorLabel = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }
        colorLabel = colorLabel || nearestWildgateColor(centroidHue).name;

        // Y-gap sub-clustering handles the rare case of two teams with the same
        // colour appearing at different vertical positions on screen.
        const yClusters = subClusterByYGap(clusterCards);
        if (yClusters.length > 1) {
          dlog('[CrewHub] Step4b: splitting hue-cluster color=' + colorLabel + ' into ' + yClusters.length + ' Y-gap sub-groups');
        }
        for (const yCluster of yClusters) {
          const ys = yCluster.map(c => c.y);
          knownGroups.push({
            color: colorLabel,
            cards: yCluster,
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
            confidence: Math.max(...yCluster.map(c => c.confidence || 0)),
          });
        }
        console.log('[CrewHub] Hue-clustered', clusterCards.length, 'cards as', colorLabel, 'at hues', hues.map(h => h + '°').join(', '));
      }
    }

    // Cards with no hue (truly black/undetectable bars that slipped through)
    // create isolated unknown groups as before.
    for (const card of achromaticCards) {
      knownGroups.push({ color: 'unknown', cards: [card], minY: card.y, maxY: card.y, confidence: 0 });
    }
  }

  // ── Step 5d: Merge tiny same-color fallback splits ──────────────────────────
  // When badge capture misses a row, fallback color clustering can produce
  // adjacent "Team 1/Team 2" shards of the same color for what is really one team.
  // Merge only when a shard is tiny and spatially close to avoid collapsing
  // legitimately distinct same-color teams.
  for (let i = 0; i < knownGroups.length; i += 1) {
    const a = knownGroups[i];
    if (!a || !a.color || a.color === 'unknown') continue;
    for (let j = i + 1; j < knownGroups.length; j += 1) {
      const b = knownGroups[j];
      if (!b || b.color !== a.color) continue;
      if (a.badgeName || b.badgeName) continue; // badge-grouped teams should stay separate

      const aSize = (a.cards || []).length;
      const bSize = (b.cards || []).length;
      const gap = b.minY > a.maxY ? b.minY - a.maxY
        : a.minY > b.maxY ? a.minY - b.maxY
          : 0;
      const tinySplit = aSize <= 2 || bSize <= 2;
      if (!tinySplit) continue;
      if (gap > getMergeGapForRange(a.maxY, b.minY)) continue;

      a.cards = [...(a.cards || []), ...(b.cards || [])];
      a.minY = Math.min(a.minY, b.minY);
      a.maxY = Math.max(a.maxY, b.maxY);
      a.confidence = Math.max(a.confidence || 0, b.confidence || 0);
      knownGroups.splice(j, 1);
      j -= 1;
      dlog('[CrewHub] Step5d merged tiny same-color split color=' + a.color + ' sizes=' + aSize + '+' + bSize + ' gap=' + Math.round(gap) + 'px');
    }
  }

  dlog('[CrewHub] Groups after assignment: ' + knownGroups.length + ' — ' + knownGroups.map(g => g.color + '(' + g.cards.length + ')').join(', '));

  // ── Step 5c: Second-pass team name capture with fully-resolved colors ────────
  // Step 3c runs before unknown cards get color-assigned in Step 5. Re-run the
  // same nearest-card matching on the fully-resolved card set to fill any gaps.
  {
    const allCards = [];
    for (const g of knownGroups) {
      if (g.color === 'unknown') continue;
      for (const c of g.cards) allCards.push({ color: g.color, y: c.y });
    }
    for (const tLine of groupedLines) {
      const rawTeamName = extractRawTeamNameFromLine(tLine.words);
      if (!rawTeamName) continue;
      if (!isTeamName(rawTeamName) && !/^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(rawTeamName)) continue;
      let bestCard = null, bestDist = Infinity;
      for (const c of allCards) {
        const dist = Math.abs(tLine.y - c.y);
        if (dist < CARD_HEIGHT * 4 && dist < bestDist) { bestDist = dist; bestCard = c; }
      }
      const alreadyByName5c = [...capturedTeamNames.values()]
        .some(n => n.toUpperCase() === rawTeamName.toUpperCase());
      if (bestCard && !capturedTeamNames.has(bestCard.color) && !alreadyByName5c) {
        capturedTeamNames.set(bestCard.color, rawTeamName);
        dlog('[CrewHub] Step5c captured "' + rawTeamName + '" for color=' + bestCard.color + ' (dist=' + Math.round(bestDist) + 'px)');
      }
    }
  }

  // ── Build output ─────────────────────────────────────────────────────────────
  let teamCounter = 1;
  const enemyTeams = [];
  const hasKnownColorGroups = knownGroups.some(g => g.color && g.color !== 'unknown');
  const knownColorGroups = knownGroups.filter(g => g.color && g.color !== 'unknown');
  const clustersBySourceRow = [...knownGroups].sort((a, b) => {
    const aY = Number(a?.minY ?? a?.maxY ?? 0);
    const bY = Number(b?.minY ?? b?.maxY ?? 0);
    return aY - bY;
  });
  const clusterRowIndexMap = new Map(clustersBySourceRow.map((cluster, index) => [cluster, index]));
  const isColorWordOnlyName = (name, color) => {
    if (!name || !color) return false;
    const n = String(name).trim().toLowerCase();
    const c = String(color).trim().toLowerCase();
    // Reject team names that are just a color word (color bar text bled through OCR)
    const colorWords = new Set(WILDGATE_COLORS.map(wc => wc.name.toLowerCase()));
    colorWords.add('unknown');
    return n === c || colorWords.has(n);
  };

  for (const cluster of knownGroups) {
    // Keep unknown clusters only when no known-color groups exist. This preserves
    // no-color fallback behavior while still blocking mixed-color spectator noise.
    if (cluster.color === 'unknown' && hasKnownColorGroups) {
      const topScore = Math.max(0, ...(cluster.cards || []).map(c => scoreAsPlayerName(c.name || '')));
      const hasStrongName = topScore >= 30;
      let nearestKnownDist = Number.POSITIVE_INFINITY;
      for (const g of knownColorGroups) {
        const dist = cluster.minY > g.maxY
          ? cluster.minY - g.maxY
          : g.minY > cluster.maxY
            ? g.minY - cluster.maxY
            : 0;
        if (dist < nearestKnownDist) nearestKnownDist = dist;
      }
      // Keep strong unknown clusters that are spatially separated from known
      // groups; these are often real singleton teams whose color sampling failed.
      const keepUnknown = hasStrongName && nearestKnownDist >= CARD_HEIGHT * 0.9;
      if (!keepUnknown) {
        dlog('[CrewHub] Skip unknown cluster to avoid spectator/near-black pollution');
        continue;
      }
      dlog('[CrewHub] Keep unknown cluster (likely real team): ' + (cluster.cards || []).map(c => c.name).join(', '));
    }

    const players = [];
    for (const card of cluster.cards) {
      pushUniquePlayerName(players, card.name);
    }

    let filteredPlayers = players.filter(p => !isTeamName(p));

    // Solo-ship rescue: if isTeamName filtered every card out, but we have a
    // captured badge/bar name that exactly matches one of those cards, keep it.
    // This handles the pattern where a solo player's handle looks like a team
    // name (e.g. all-caps "GHOST" → isTeamName returns true, but it IS the player).
    if (filteredPlayers.length === 0 && players.length > 0) {
      const clusterCapturedName = cluster.badgeName || capturedTeamNames.get(cluster.color);
      if (clusterCapturedName) {
        const capturedNorm = clusterCapturedName.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g, '');
        filteredPlayers = players.filter(p => {
          const pNorm = String(p).toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g, '');
          return capturedNorm.length >= 3 && pNorm === capturedNorm;
        });
      }
    }

    if (filteredPlayers.length === 0) continue;

    const capturedName = cluster.badgeName || capturedTeamNames.get(cluster.color);
    let teamName = capturedName
      || (cluster.color !== 'unknown' ? cluster.color : `Team ${teamCounter++}`);
    const hasAnyCapturedBarName = capturedTeamNames.size > 0;
    if (hasAnyCapturedBarName && isColorWordOnlyName(teamName, cluster.color)) {
      teamName = '';
    }
    if (isSpectatorLine(teamName)) continue;

    enemyTeams.push({
      name: teamName || `Team ${teamCounter++}`,
      nameSource: capturedName ? 'team_bar' : 'fallback',
      color: cluster.color || 'unknown',
      shipType: '',
      players: filteredPlayers,
      confidence: cluster.confidence || 50,
      sourceRowIndex: clusterRowIndexMap.get(cluster),
      sourceRowY: Number.isFinite(cluster.minY) ? cluster.minY : cluster.maxY,
    });
  }

  // Under-capture guard: if we found color clusters but too few players, salvage
  // unmatched valid names and assign them to nearest known-color team by Y.
  const knownColorTeams = enemyTeams.filter(t => t.color && t.color !== 'unknown');
  const totalPlayers = enemyTeams.reduce((sum, t) => sum + (t.players?.length || 0), 0);
  if (knownColorTeams.length > 0 && totalPlayers < Math.max(6, knownColorTeams.length * 3)) {
    const existingNames = new Set(enemyTeams.flatMap(t => (t.players || []).map(p => normalizeNameKey(p))));
    const pickSalvageNameFromLine = (lineWords) => {
      let primary = extractPlayerNameFromLine(lineWords);
      if (primary && (isValidOpponentName(primary) || isLikelyShortUiSuffixTagCandidate(lineWords, primary))) {
        // Mirror the phantom-19 strip applied in the main extraction loop so that
        // a stripped name (e.g. "Pu4uPu4u") already in existingNames blocks the
        // un-stripped salvage candidate ("Pu4uPu4u19") from leaking into a second team.
        const pm = primary.match(/^(.*[^0-9])(19)$/);
        if (pm && pm[1].length >= 4 && isValidOpponentName(pm[1])) primary = pm[1];
        return primary;
      }

      // Fallback: duplicated OCR tokens on the same row can produce a combined
      // string that fails validation (e.g. "IAH_11 IAH_1111"). In under-capture
      // mode, salvage the strongest valid single-token handle from the row.
      let best = null;
      let bestScore = -1;
      for (const word of lineWords || []) {
        const raw = String(word?.text || '').trim();
        if (!raw) continue;
        const candidate = cleanupPlayerName(raw);
        if (!candidate || (!isValidOpponentName(candidate) && !isLikelyShortUiSuffixTagCandidate([word], candidate))) continue;
        const score = scoreAsPlayerName(candidate);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (best && bestScore >= 35) return best;
      return null;
    };

    const salvageCandidates = groupedLines
      .map(line => {
        const inBarZone = barZones.some(z => line.y >= z.min && line.y <= z.max);
        if (inBarZone) return null;
        const name = pickSalvageNameFromLine(line.words);
        if (!name) return null;
        const key = normalizeNameKey(name);
        if (!key || existingNames.has(key)) return null;
        if (skippedSpectatorNameKeys.has(key) || isSkippedSpectatorRow(line.y)) return null;
        return { name, y: line.y };
      })
      .filter(Boolean);
    for (const candidate of salvageCandidates) {
      let best = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const team of knownColorTeams) {
        const yValues = (team.players || [])
          .map(p => uniqueCards.find(c => namesAreNearDuplicate(c.name, p))?.y)
          .filter(v => Number.isFinite(v));
        const anchorY = yValues.length > 0 ? yValues.reduce((a, b) => a + b, 0) / yValues.length : null;
        if (!Number.isFinite(anchorY)) continue;
        const dist = Math.abs(candidate.y - anchorY);
        if (dist < bestDist) {
          bestDist = dist;
          best = team;
        }
      }
      if (best && bestDist < CARD_HEIGHT * 2.6) {
        pushUniquePlayerName(best.players, candidate.name);
        existingNames.add(normalizeNameKey(candidate.name));
        dlog('[CrewHub] Under-capture salvage: assigned "' + candidate.name + '" -> ' + best.color);
      }
    }
  }

  // Sort by player count (most players first), cap at 4 teams
  enemyTeams.sort((a, b) => b.players.length - a.players.length);
  logCrewHubLayoutDebug(debugLayout, 'finalTeamGrouping', enemyTeams.map((team) => ({
    teamName: team.name || '',
    color: team.color,
    players: [...(team.players || [])],
  })));
  if (enemyTeams.length > 4) {
    console.warn('[CrewHub] More than 4 enemy teams detected, merging overflow into top 4');
    const kept = enemyTeams.slice(0, 4);
    const overflow = enemyTeams.slice(4);
    for (const spill of overflow) {
      let target = kept.find(t => t.color !== 'unknown' && spill.color !== 'unknown' && t.color === spill.color);
      if (!target) target = kept.reduce((best, t) => (t.players.length < best.players.length ? t : best), kept[0]);
      for (const p of spill.players || []) pushUniquePlayerName(target.players, p);
    }
    return kept;
  }

  console.log('[CrewHub] Enemy teams found:', enemyTeams.length, enemyTeams.map(t => `${t.color}(${t.players.length})`).join(', '));
  return enemyTeams;
}

/**
 * Group words into lines by Y position with X-proximity clustering
 * This prevents horizontally distant words from merging into the same line
 */
function groupWordsIntoLines(words, imageHeight, imageWidth = null, options = null) {
  const lines = [];
  const groupOptions = (options && typeof options === 'object') ? options : {};
  const geometry = groupOptions.geometry || null;
  const lineThreshold = Number.isFinite(Number(groupOptions.lineThreshold))
    ? Number(groupOptions.lineThreshold)
    : computeLineMergeThreshold(imageHeight, geometry);
  const xProximityThreshold = Number.isFinite(Number(groupOptions.xProximityThreshold))
    ? Number(groupOptions.xProximityThreshold)
    : computeXProximityThreshold(imageWidth, groupOptions);
  logCrewHubLayoutDebug(groupOptions.debugLayout === true, groupOptions.debugLabel || 'lineGrouping', {
    lineMergeThreshold: Number(lineThreshold.toFixed(2)),
    xProximityThreshold: Number(xProximityThreshold.toFixed(2)),
    regionWidth: Number.isFinite(Number(groupOptions.regionWidth)) ? Number(groupOptions.regionWidth) : null,
  });

  for (const word of words) {
    if (!word.bbox || !word.text) continue;

    const wordY = (word.bbox.y0 + word.bbox.y1) / 2;
    const wordX = word.bbox.x0;
    let foundLine = false;

    for (const line of lines) {
      // Check Y proximity (same vertical level)
      if (Math.abs(line.y - wordY) < lineThreshold) {
        // Use full x-span of the line (min x0 to max x1) to decide membership.
        // Checking only the last-added word's x1 fails when a later word was
        // appended further right (e.g. "fg)" at x=2780 after "Hoff" at x=2450)
        // causing a legitimate word like "07" (x0=2460) to look like it's
        // 320px to the LEFT of the line end and be wrongly excluded.
        const lineXmin = Math.min(...line.words.map(w => w.bbox.x0));
        const lineXmax = Math.max(...line.words.map(w => w.bbox.x1));
        const xDistFromRight = wordX - lineXmax;   // positive = right of span
        const xDistFromLeft  = lineXmin - (word.bbox.x1 || wordX); // positive = left of span

        // Accept if the word is inside the span, or within xProximityThreshold of either end
        const withinSpan   = xDistFromRight <= 0  && xDistFromLeft <= 0;
        const closeToRight = xDistFromRight >= 0  && xDistFromRight < xProximityThreshold;
        const closeToLeft  = xDistFromLeft  >= 0  && xDistFromLeft  < xProximityThreshold;

        if (withinSpan || closeToRight || closeToLeft) {
          line.words.push(word);
          foundLine = true;
          break;
        }
      }
    }

    if (!foundLine) {
      lines.push({ y: wordY, words: [word] });
    }
  }

  // Sort words within each line by X position
  for (const line of lines) {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  }

  // Sort lines by Y position
  lines.sort((a, b) => a.y - b.y);

  return lines;
}

/**
 * Phase 5: Assemble adjacent words in the same row into candidate multi-word names.
 * Handles names like "Sticks and Stones" which Tesseract reads as 3 separate words.
 * Returns the original words PLUS any assembled multi-word candidates.
 * The extraction logic downstream picks the best match.
 */
function assembleMultiWordNames(words) {
  if (!words || words.length <= 1) return words;
  // Sort by x position (left to right)
  const sorted = [...words].filter(w => w.bbox).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (sorted.length <= 1) return words;

  const assembled = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].bbox.x0 - (current.bbox ? current.bbox.x1 : 0);
    const avgCharWidth = current.bbox
      ? (current.bbox.x1 - current.bbox.x0) / Math.max(1, (current.text || '').length)
      : 10;
    // Must be in the same row (y-centre within 1.5× line height)
    const curCy = current.bbox ? (current.bbox.y0 + current.bbox.y1) / 2 : 0;
    const nextCy = (sorted[i].bbox.y0 + sorted[i].bbox.y1) / 2;
    const lineH = current.bbox ? (current.bbox.y1 - current.bbox.y0) : 30;
    const sameRow = Math.abs(curCy - nextCy) < lineH * 1.5;
    // Skip merging words with identical text (duplicates from different OCR passes)
    const isDuplicateText = (current.text || '').trim().toLowerCase() === (sorted[i].text || '').trim().toLowerCase();
    // Skip merging short purely-numeric tokens (e.g. "10", "1D" — rank/prestige badges)
    const nextTextTrim = (sorted[i].text || '').trim();
    const isPureNumericSuffix = nextTextTrim.length <= 3 && /^[0-9][0-9A-D]*$/i.test(nextTextTrim);
    // If gap is less than 3 character widths AND same row AND not duplicate AND not numeric suffix, combine
    if (sameRow && !isDuplicateText && !isPureNumericSuffix && gap >= 0 && gap < avgCharWidth * 3) {
      current = {
        text: (current.text || '') + ' ' + (sorted[i].text || ''),
        confidence: Math.round(((current.confidence || 0) + (sorted[i].confidence || 0)) / 2),
        bbox: {
          x0: current.bbox.x0,
          y0: Math.min(current.bbox.y0, sorted[i].bbox.y0),
          x1: sorted[i].bbox.x1,
          y1: Math.max(current.bbox.y1, sorted[i].bbox.y1),
        },
      };
    } else {
      assembled.push(current);
      current = { ...sorted[i] };
    }
  }
  assembled.push(current);

  // Only emit merged candidates that look like real multi-word names
  const merged = assembled.filter(a => (a.text || '').includes(' '));
  const gated = merged.filter(m => {
    if ((m.text || '').length < 6) return false;        // too short
    if ((m.confidence || 0) < 40) return false;          // too low confidence
    // Must have some alphabetic characters
    if (!(/[a-zA-Z]{2,}/.test(m.text || ''))) return false;
    return true;
  });

  // Return originals + gated merged candidates
  return [...words, ...gated];
}

/**
 * Extract player name from a line of words
 * Uses smarter filtering to find the most likely player name
 */
function extractPlayerNameFromLine(words) {
  if (!words || words.length === 0) return null;

  // Phase 5: Assemble multi-word name candidates before extraction.
  // This adds merged candidates (e.g. "Sticks and Stones") alongside the originals
  // so the best-scoring name can win whether it's a single token or multi-word.
  const wordsWithMultiWord = assembleMultiWordNames(words);
  const specialPipeName = normalizePipeSpacerPlayerName(
    wordsWithMultiWord.map((word) => String(word?.text || '')).join(' ')
  );
  if (specialPipeName) return specialPipeName;

  // Pre-pass: detect rank/prestige prefix tokens like "[6°]", "[7*]" before the
  // general noise filters discard them (bracket-containing tokens are skipped by
  // default). OCR reads "[6*]" as "[6°]" (degree symbol), so we normalise ° → *.
  let rankPrefix = null;
  for (const word of wordsWithMultiWord) {
    const t = word.text?.trim();
    if (!t) continue;
    const rm = t.match(/^\[(\d{1,2})[°*+~]\]$/);
    if (rm) { rankPrefix = '[' + rm[1] + '*]'; break; }
  }
  const prependRank = (name) => rankPrefix ? rankPrefix + ' ' + name : name;

  const validParts = [];
  let bestSingleWord = null;
  let bestSingleWordScore = 0;

  for (const word of wordsWithMultiWord) {
    const text = word.text?.trim();
    if (!text) continue;

    // Skip near-zero-confidence reads — Tesseract assigns near-0 to
    // hallucinated tokens it has no confidence in at all.
    // Exception: strong gamertag structure (mixed-case + adequate length) can override
    // a displayed-c0 read — e.g. "JrMJr"(c0) is clearly a gamertag pattern (score≥40)
    // while noise like "parryvoce"(c0, all-lowercase) scores below 40 and stays blocked.
    if ((word.confidence || 0) < 1) {
      if (scoreAsPlayerName(text) < 40) continue;
    }

    // Skip noise words — strip trailing punctuation first so "crew!" == "CREW", etc.
    const upperToken = text.toUpperCase().replace(/[!?.,;:]+$/, '');
    if (NOISE_WORDS.has(upperToken)) {
      // Allow title-case "Crews" as a valid handle candidate.
      const isLikelyCrewsPlayer = /^Crews$/i.test(text) && /[a-z]/.test(text);
      if (!isLikelyCrewsPlayer) continue;
    }

    // Skip very short fragments (likely OCR noise) unless they're numbers (part of name)
    if (text.length < 2 && !/[0-9]/.test(text)) continue;

    // Skip single character noise
    if (text.length === 1 && /[^0-9a-zA-Z\u4e00-\u9fff]/.test(text)) continue;

    // Filter tactical map grid coordinate labels (e.g. A1, B3, H8)
    if (/^[A-H]\d{1,2}$/i.test(text)) continue;

    // Skip platform indicators at end
    if (/^[XPCD]$/i.test(text) && validParts.length > 0) continue;

    // Skip tokens that are OCR noise with brackets/parens (e.g. "fg)", "[P]", "(x")
    if (/[()\[\]{}]/.test(text) && !/[A-Z0-9_]{3,}/i.test(text)) continue;

    // Skip common OCR noise patterns
    if (/^[|=\-~#%&*]+$/.test(text)) continue;
    if (/^[a-z]{1,2}$/.test(text) && validParts.length === 0) continue; // Skip short lowercase prefix

    // Score this word as potential player name
    const score = scoreAsPlayerName(text);
    if (score > bestSingleWordScore) {
      bestSingleWordScore = score;
      bestSingleWord = text;
    }

    validParts.push(text);
  }

  // Strategy 1: single dominant word — threshold 40 (was 50) so mixed-case names
  // like "fartingPuppy" (score=40) pass without requiring numbers/underscore.
  // The "other parts are non-name" threshold is 41 so that short ≤4-char
  // names like "Salo"/"Sune"/"Riv" (score≤40 = +10 len + +20 mixed + +10 cap)
  // don't prevent a longer dominant name like "Saln_Reclaimer" (score=65)
  // from being used alone.  Genuine 2-word names like "Lanky Bastard" both
  // score ≥50 so neither word passes the < 41 test and Strategy 1 is skipped.
  if (bestSingleWord && bestSingleWordScore >= 40 && validParts.length <= 3) {
    const otherParts = validParts.filter(p => p !== bestSingleWord);
    const allOthersAreNonName = otherParts.every(
      p => scoreAsPlayerName(p) < 41 || /^\d{1,5}$/.test(p)
    );
    if (allOthersAreNonName) {
      const cleaned = cleanupPlayerName(bestSingleWord);
      if (cleaned.length >= 3) return prependRank(cleaned);
    }
  }

  // Strategy 1b: Best word is decent but all other "words" score 0
  // (e.g., "Hoff"+"OF" → "Hoff"; "Scipion"+"kD)"+"10" → "Scipion")
  // No length restriction on noise: any score=0 fragment is treated as noise.
  // Exception: a 1-2 digit token that immediately follows the best word in the
  // line (x-gap ≤ 15px in OCR coords) is treated as a numeric name suffix
  // e.g. "Hoff 07" where "07" sits directly beside "Hoff".
  // Threshold 15 (was 25) so all-lowercase names ≥5 chars like "lirolake" (score=20) pass.
  if (bestSingleWord && bestSingleWordScore >= 15 && validParts.length >= 2) {
    const otherParts = validParts.filter(p => p !== bestSingleWord);
    const allOthersAreNoise = otherParts.every(p => scoreAsPlayerName(p) === 0);
    if (allOthersAreNoise) {
      const bestWordObj = words.find(w => w.text?.trim() === bestSingleWord);
      const bestWordHasDigit = /[0-9]/.test(bestSingleWord);
      const adjacentNums = words.filter(w => {
        const t = w.text?.trim();
        if (!t || !/^\d{1,2}$/.test(t)) return false;
        if (!bestWordObj?.bbox || !w.bbox) return false;
        const gap = w.bbox.x0 - bestWordObj.bbox.x1;
        return gap >= -5 && gap <= 15; // immediately follows the name word
      })
      .map(w => w.text.trim())
      .filter(num => {
        // Left-panel voice/platform glyphs are frequently OCR'd as "1" or "15"
        // immediately after a teammate name (e.g. "AlixThus1"). Keep true numeric
        // suffixes for already numeric tags, but suppress this icon drift for plain names.
        if (num !== '1' && num !== '15') return true;
        return bestWordHasDigit;
      });
      const nameParts = adjacentNums.length > 0
        ? [bestSingleWord, ...adjacentNums]
        : [bestSingleWord];
      const cleaned = cleanupPlayerName(nameParts.join(' '));
      if (cleaned.length >= 3) return prependRank(cleaned);
    }
  }

  // Strategy 2: Join consecutive parts that look like they belong together
  if (validParts.length === 0) return null;

  // Filter out likely noise parts.
  // Require at least one letter — pure numbers ("12", "120", kill-count indicators)
  // adjacent to a name must not be joined into the username string.
  // Also filter level-badge reads: "10", "1D", "10D", "12D", "ID", "1" etc.
  let filteredParts = validParts.filter(p => {
    if (!/[a-zA-Z\u4e00-\u9fff\u0400-\u04FF]/.test(p)) return false; // pure number/symbol → skip
    if (/^\d{0,3}[ID]$/i.test(p)) return false; // level-badge indicators: "10D", "1D", "ID"
    if (/^\d{1,2}[a-zA-Z]{1,2}$/.test(p)) return false; // short digit+letter fragments: "4s", "10x"
    if (/^(.)\1+$/i.test(p)) return false; // all-same-letter OCR garbage: "EEE", "lll", "III"
    if (/[a-zA-Z0-9\u4e00-\u9fff]{2,}/.test(p)) return true;
    return false;
  });

  if (filteredParts.length === 0) return null;

  // Deduplicate near-identical consecutive tokens — handles double OCR reads where
  // the same name is read twice with slight variation e.g. "RapidWarrior RapldWarrior"
  // or "H4VOK_XP H4YOK_XP".  Keep the higher-scoring token from each near-identical pair.
  if (filteredParts.length >= 2) {
    const ddParts = [filteredParts[0]];
    for (let i = 1; i < filteredParts.length; i++) {
      const cur  = filteredParts[i];
      const prev = ddParts[ddParts.length - 1];
      // Near-identical: same length ±1 AND ≤2 positional char differences (covers 1-char OCR substitution)
      const lenDiff = Math.abs(cur.length - prev.length);
      if (cur.length >= 4 && prev.length >= 4 && lenDiff <= 1) {
        const minLen = Math.min(cur.length, prev.length);
        let diffs = lenDiff;
        for (let k = 0; k < minLen; k++) {
          if (cur[k].toLowerCase() !== prev[k].toLowerCase()) diffs++;
        }
        if (diffs <= 2) {
          // Keep the higher-scored one
          if (scoreAsPlayerName(cur) > scoreAsPlayerName(prev)) {
            ddParts[ddParts.length - 1] = cur;
          }
          continue; // skip adding cur — discard the near-duplicate
        }
      }
      ddParts.push(cur);
    }
    filteredParts = ddParts;
  }

  // Join parts with space — preserves multi-word names like "Sticks and Stones"
  let name = filteredParts.join(' ');

  // Clean up OCR artifacts
  name = cleanupPlayerName(name);

  return name.length >= 3 ? prependRank(name) : null;
}

function getLineCenterX(words) {
  if (!Array.isArray(words) || words.length === 0) return 0;
  const xs = words
    .map(w => w?.bbox)
    .filter(Boolean)
    .flatMap(b => [b.x0, b.x1])
    .filter(v => Number.isFinite(v));
  if (xs.length === 0) return 0;
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

function getLineMinX(words) {
  if (!Array.isArray(words) || words.length === 0) return Number.POSITIVE_INFINITY;
  const xs = words
    .map(w => w?.bbox?.x0)
    .filter(v => Number.isFinite(v));
  if (xs.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...xs);
}

/**
 * Score how likely a word is to be a player name (0-100)
 */
function scoreAsPlayerName(text) {
  if (!text || text.length < 3) return 0;
  if (normalizePipeSpacerPlayerName(text)) return 42;
  if (containsUnderCrewBonusPhrase(text) || containsUiNoisePhrase(text)) return 0;

  let score = 0;

  // Length bonus (sweet spot 5-15 chars)
  if (text.length >= 5 && text.length <= 15) score += 20;
  else if (text.length >= 3 && text.length <= 20) score += 10;

  // Has numbers (common in usernames)
  if (/[0-9]/.test(text)) score += 15;

  // Has underscore (common in usernames)
  if (/_/.test(text)) score += 15;

  // Mixed case (common in usernames like "AlixThus")
  if (/[a-z]/.test(text) && /[A-Z]/.test(text)) score += 20;

  // CJK characters (valid player name)
  if (/[\u4e00-\u9fff]/.test(text)) score += 30;

  // Cyrillic characters
  if (/[\u0400-\u04FF]/.test(text)) score += 30;

  // Starts with capital (common for names)
  if (/^[A-Z]/.test(text)) score += 10;

  // Penalize if mostly noise characters
  const noiseRatio = (text.match(/[^a-zA-Z0-9_\u4e00-\u9fff\u0400-\u04FF]/g) || []).length / text.length;
  if (noiseRatio > 0.3) score -= 30;

  // Penalize short all-caps (likely UI element) — extended to ≤7 chars to catch
  // 6-char noise fragments like "LUEVAY", "ANGUAR" etc. that aren't real names.
  if (text === text.toUpperCase() && text.length < 7 && !/[0-9]/.test(text)) score -= 20;

  // Multi-word gamertags (e.g. "sticks and stones", "Lanky Bastard"):
  // if every space-separated part is ≥3 chars the spaces are intentional, not OCR noise.
  const spaceParts = text.split(/\s+/);
  if (spaceParts.length >= 2 && spaceParts.every(p => p.length >= 3)) score += 15;

  return Math.max(0, Math.min(100, score));
}

/**
 * Clean up OCR artifacts from player name
 * Supports: Latin, Extended Latin, Cyrillic, CJK characters
 */
function splitCamelCaseFallback(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (/\s/.test(raw)) return raw;
  if (raw.length <= 8) return raw;
  const uppercaseCount = (raw.match(/[A-Z]/g) || []).length;
  if (uppercaseCount < 3) return raw;
  if (!/[a-z][A-Z]/.test(raw) && !/[A-Z][A-Z][a-z]/.test(raw)) return raw;
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

const PIPE_SPACER_PLAYER_NAME = '| |';
function normalizePipeSpacerPlayerName(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return /^\|+\s+\|+$/.test(normalized) ? PIPE_SPACER_PLAYER_NAME : '';
}

function cleanupPlayerName(name) {
  if (!name) return '';
  const specialPipeName = normalizePipeSpacerPlayerName(name);
  if (specialPipeName) return specialPipeName;

  let cleaned = name
    // Common OCR substitutions
    .replace(/@/g, 'Q')      // @ -> Q
    .replace(/&/g, '4')       // & -> 4 (OCR misreads digit 4 as ampersand)
    .replace(/[éèêëÉÈÊË]/g, '4') // accented E variants misread for digit 4 (e.g. G4zZy → GézZy)
    .replace(/[àáâãäåÀÁÂÃÄÅ]/g, '4') // accented A variants misread for digit 4
    .replace(/»/g, 'a')      // >> -> a
    .replace(/«/g, '')       // <<
    .replace(/[{}()\[\]<>]/g, '')
    .replace(/[¥£€¢]/g, '')
    // Preserve periods/dots that appear BETWEEN alphanumeric chars (e.g. "River.Banks")
    // Only strip isolated or trailing punctuation
    .replace(/(?<![a-zA-Z0-9])[.,:;!?'"]+/g, '') // Leading punctuation
    .replace(/[,:;!?'"]+(?![a-zA-Z0-9])/g, '')   // Trailing punctuation (keep dots mid-name)
    .replace(/\.(?![a-zA-Z0-9])/g, '')             // Trailing dot only
    .replace(/(?<![a-zA-Z0-9])\./g, '')             // Leading dot only
    .replace(/\\/g, '')      // Backslashes
    .replace(/[|]/g, '')     // Pipes
    .replace(/[~#%&*^]/g, '') // Common OCR noise symbols
    // Remove trailing platform indicators (must be space-separated, e.g. "PlayerName P")
    // Using \s+ (not \s*) so trailing letters that are part of the name
    // (e.g. "H4VOK_XP" ending in P) are not incorrectly stripped.
    .replace(/\s+[XPCD]$/i, '')
    // Remove common OCR prefixes/suffixes
    .replace(/^[A-Z]{1,3}(?=[A-Z][a-z])/g, '') // Remove short caps prefix before CamelCase (e.g., "GNAlixThus" -> "AlixThus")
    .replace(/[=]+$/g, '')   // Remove trailing = (e.g., "oSalad=" -> "oSalad")
    .replace(/^[=]+/g, '')   // Remove leading =
    // Clean edges (allow Latin, extended Latin, Cyrillic, CJK, numbers, underscore, period, hyphen)
    .replace(/^[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+/, '')
    .replace(/[^a-zA-Z0-9_.\-\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+$/, '')
    .trim();

  // Additional cleanup: remove single isolated characters at start/end
  cleaned = cleaned.replace(/^[a-z](?=[A-Z])/, ''); // Single lowercase before uppercase
  cleaned = cleaned.replace(/[a-zA-Z]$(?<=[a-z][A-Z])/, ''); // Single uppercase after lowercase at end

  // OCR commonly misreads digit "1" as "l" or "i" inside mixed-case names.
  // Heuristic: if a mixed-case word (10+ chars, starts uppercase) ends in 2+
  // chars from the {i, l} confusion set, convert those trailing chars to "1"s.
  // Example: "PerfectSinil" → "PerfectSin11"  ("11" mis-read as "il")
  // The 10-char minimum prevents false positives on short English words ("Basil" etc.)
  cleaned = cleaned.replace(
    /^([A-Z][a-zA-Z0-9]{8,}[a-zA-Z0-9])[il]{2,}$/,
    (m, p1) => p1 + '1'.repeat(m.length - p1.length)
  );

  cleaned = stripLikelyCrewHubUiDigitSuffix(cleaned);
  cleaned = stripLikelyCrewHubI9ArtifactSuffix(cleaned);
  cleaned = splitCamelCaseFallback(cleaned);

  return cleaned;
}

function stripLikelyCrewHubUiDigitSuffix(name) {
  const value = String(name || '').trim();
  const m = value.match(/^([A-Za-z0-9_.\-\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]{3,})(15|1)$/);
  if (!m) return value;

  const stem = m[1];
  const suffix = m[2];
  const stemDigits = (stem.match(/[0-9]/g) || []).length;
  const isMixedCase = /[A-Z]/.test(stem) && /[a-z]/.test(stem);
  const hasSeparators = /[_\-.]/.test(stem);

  if (suffix === '15') {
    if (stemDigits === 0 || isMixedCase || hasSeparators) return stem;
    return value;
  }

  if (suffix === '1') {
    if (stemDigits === 0 && (isMixedCase || hasSeparators || stem.length <= 4)) return stem;
  }

  return value;
}

function stripLikelyCrewHubI9ArtifactSuffix(name) {
  const value = String(name || '').trim();
  const m = value.match(/^([A-Za-z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]{4,5})([Ii1l]9)$/);
  if (!m) return value;
  const stem = m[1];
  if (/[0-9]/.test(stem)) return value;
  return stem;
}

function stripLikelyLeftPanelSlotDigitSuffix(name) {
  const value = String(name || '').trim();
  const m = value.match(/^([A-Za-z0-9_.\-\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]{3,})([1-5])$/);
  if (!m) return value;

  const stem = m[1];
  const suffix = m[2];
  if (/[0-9]/.test(stem)) return value;

  const letterCount = (stem.match(/[A-Za-z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g) || []).length;
  if (letterCount < 3) return value;

  const isMixedCase = /[A-Z]/.test(stem) && /[a-z]/.test(stem);
  const hasSeparators = /[_\-.]/.test(stem);
  // Keep underscore/dot/hyphen suffix tags (e.g. "Barbi3") — these are common real handles.
  if (hasSeparators) return value;
  // "5" suffixes are less likely to be party-slot artifacts; only strip when the
  // stem already looks like a compact player handle.
  if (suffix === '5' && !(isMixedCase || stem.length <= 5)) return value;
  if (isMixedCase || stem.length <= 6) return stem;
  return value;
}

function sanitizeLeftPanelPlayerName(name) {
  if (!name) return null;
  const specialPipeName = normalizePipeSpacerPlayerName(name);
  if (specialPipeName) return specialPipeName;

  const UI_EDGE_TOKENS = new Set([
    'PARTY', 'VOICE', 'TEAM', 'PUSH', 'TALK', 'CHANNEL', 'MUTE', 'DEAFEN',
    'TEXT', 'PINGS', 'HOP', 'SWITCH', 'INVITE', 'KICK', 'CREW', 'HUB'
  ]);

  const normalizeToken = (token) => String(token || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const isUiEdgeToken = (token) => {
    const n = normalizeToken(token);
    if (!n) return true;
    if (UI_EDGE_TOKENS.has(n)) return true;
    if (/^\d{1,2}$/.test(n)) return true;
    if (/^[XPDC]$/.test(n)) return true;
    if (/^[A-Z]{1,2}$/.test(n) && scoreAsPlayerName(token) < 10) return true;
    return false;
  };

  let parts = String(name).trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && isUiEdgeToken(parts[0])) parts.shift();
  while (parts.length > 1 && isUiEdgeToken(parts[parts.length - 1])) parts.pop();

  let value = parts.join(' ').trim();
  value = stripLikelyCrewHubUiDigitSuffix(value);
  value = stripLikelyLeftPanelSlotDigitSuffix(value);
  value = repairKnownLeftPanelMisreads(value);

  return value || null;
}

function isLikelyShortUiSuffixTagCandidate(lineWords, candidate) {
  const cleaned = String(candidate || '').trim();
  if (!/^[a-z]{3}$/i.test(cleaned)) return false;

  const rawTokens = (lineWords || [])
    .map((word) => String(word?.text || '').trim())
    .filter(Boolean);
  if (rawTokens.length !== 1) return false;

  const rawToken = rawTokens[0];
  const normalizedRaw = rawToken
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  const normalizedCandidate = cleaned.toLowerCase();
  if (!normalizedRaw || normalizedRaw === normalizedCandidate) return false;
  if (!normalizedRaw.startsWith(normalizedCandidate)) return false;
  if (!/^(15|19)$/.test(normalizedRaw.slice(normalizedCandidate.length))) return false;

  // Keep this exception narrow: lowercase-ish short tags with a common crew-hub
  // icon/rank suffix should survive long enough for the shared OCR resolver to
  // map them back to known pilots like "leet".
  return /[a-z]/.test(rawToken) && normalizedRaw === normalizedRaw.toLowerCase();
}

function extractBottomLeftTeammateCandidates(words, imageWidth, imageHeight, options = null) {
  const bounds = {
    xMin: imageWidth * 0.0,
    xMax: imageWidth * 0.42,
    yMin: imageHeight * 0.68,
    yMax: imageHeight * 0.99,
  };
  const bottomWords = (words || []).filter((w) => {
    if (!w?.bbox) return false;
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    return cx >= bounds.xMin && cx <= bounds.xMax && cy >= bounds.yMin && cy <= bounds.yMax;
  });
  if (bottomWords.length === 0) return [];

  const lines = groupWordsIntoLines(bottomWords, imageHeight, imageWidth, {
    geometry: options?.geometry || null,
    regionWidth: Math.max(1, bounds.xMax - bounds.xMin),
    debugLayout: options?.debugLayout === true,
    debugLabel: 'bottomLeftTeammates',
  });
  const out = [];
  for (const line of lines) {
    const lineMinX = getLineMinX(line.words);
    if (lineMinX > bounds.xMax) continue;
    const lineWords = line.words
      .filter((w) => !w?.bbox || ((w.bbox.x0 + w.bbox.x1) / 2) <= bounds.xMax)
      .filter((w) => {
        const conf = Number(w?.confidence || 0);
        if (conf >= 28) return true;
        const token = String(w?.text || '').trim();
        return token.length >= 4 && scoreAsPlayerName(token) >= 40;
      });
    if (lineWords.length === 0) continue;

    let candidate = extractPlayerNameFromLine(lineWords);
    candidate = sanitizeLeftPanelPlayerName(candidate);
    if (!candidate) continue;
    if (containsUnderCrewBonusPhrase(candidate)) continue;
    if (!isValidPlayerName(candidate)) continue;
    if (scoreAsPlayerName(candidate) < 18) continue;
    if (/PARTY|VOICE|TEAM|CREW|HUB|CHANNEL|PUSH|TALK|MUTE|DEAFEN|TEXT|PINGS/i.test(candidate)) continue;
    pushUniquePlayerName(out, candidate);
  }

  return out.slice(0, 4);
}

function chooseBetterTeammateDisplay(currentName, candidateName) {
  const scoreDisplay = (value) => {
    const text = String(value || '').trim();
    if (!text) return -1;
    let score = scoreAsPlayerName(text);
    if (/[0-9_]/.test(text)) score += 8;
    if (/[A-Z]/.test(text) && /[a-z]/.test(text)) score += 4;
    if (/[\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/.test(text)) score += 4;
    score += Math.min(6, Math.floor(text.length / 3));
    return score;
  };
  return scoreDisplay(candidateName) > scoreDisplay(currentName) ? candidateName : currentName;
}

function repairKnownLeftPanelMisreads(name) {
  const value = String(name || '').trim();
  if (!value) return value;
  const key = normalizeNameKey(value);
  if (
    key === 'ombatbarbi3' ||
    key === 'combatbarbi3' ||
    key === 'ombatbarbie' ||
    key === 'combatbarbie'
  ) return 'c0mbat_Barbi3';
  return value;
}

/**
 * Check if a name looks like a valid player name
 * - Has letters (Latin, Extended Latin, Cyrillic, or CJK)
 * - Has some distinguishing feature (numbers, underscore, mixed case, non-ASCII)
 * - Length 3-25 characters
 */
function isValidPlayerName(name) {
  if (normalizePipeSpacerPlayerName(name)) return true;
  if (!name || name.length < 4 || name.length > 25) return false;
  if (containsUnderCrewBonusPhrase(name)) return false;

  // Must have at least some letters (Latin, Extended Latin, Cyrillic, or CJK)
  // \u00C0-\u024F: Extended Latin (accented characters)
  // \u0400-\u04FF: Cyrillic
  // \u4e00-\u9fff: CJK
  const hasLetters = /[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/.test(name);
  if (!hasLetters) return false;

  // Phase 3: Require at least 2 alphabetic characters (reject mostly-numeric/symbol junk)
  const alphaCount = (name.match(/[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g) || []).length;
  if (alphaCount < 2) return false;

  // Phase 3: Block known UI strings that Tesseract picks up as player names
  if (NOISE_WORDS.has(name.toUpperCase())) {
    // Allow title-case "Crews" as a real gamertag; keep uppercase UI "CREWS" blocked.
    const isLikelyCrewsPlayer = /^Crews$/i.test(name) && /[a-z]/.test(name);
    if (!isLikelyCrewsPlayer) return false;
  }

  // Must have some distinguishing feature for basic Latin names
  // (CJK, Cyrillic, Extended Latin are inherently distinguishing)
  const hasCJK = /[\u4e00-\u9fff]/.test(name);
  const hasCyrillic = /[\u0400-\u04FF]/.test(name);
  const hasExtendedLatin = /[\u00C0-\u024F]/.test(name);
  const hasNumbers = /[0-9]/.test(name);
  const hasUnderscore = /_/.test(name);
  const hasMixedCase = /[a-z]/.test(name) && /[A-Z]/.test(name);

  if (hasCJK || hasCyrillic || hasExtendedLatin) return true;
  if (hasNumbers || hasUnderscore || hasMixedCase) return true;

  // FIXED: Only reject very short all-caps words that match known UI elements
  // Allow longer all-caps names as they could be valid player names (e.g., "SHTER", "MYNWINER")
  if (name === name.toUpperCase() && name.length <= 5 && !hasNumbers) {
    // Check against known UI noise words before rejecting
    const upperName = name.toUpperCase();
    if (NOISE_WORDS.has(upperName)) {
      return false;
    }
  }

  return true;
}

function isValidOpponentName(name) {
  if (normalizePipeSpacerPlayerName(name)) return true;
  if (!name || name.length < 4 || name.length > 28) return false;
  if (containsUnderCrewBonusPhrase(name)) return false;
  if (/^[0-9]/.test(name)) {
    // Some valid gamertags start with digits (e.g. "20Aira20", "2026Civic").
    // Keep rejecting mostly-numeric noise while allowing mixed alnum names.
    const letterCount = (name.match(/[A-Za-z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g) || []).length;
    if (letterCount < 2) return false;
  }

  // Reject names where any space-separated component is a single ASCII letter —
  // these are OCR glyph artefacts joined to a real token (e.g. "E Hg", "E ar").
  // Single-letter names like [S] are always single tokens (brackets = 3 chars) so unaffected.
  if (name.includes(' ') && name.trim().split(/\s+/).some(p => /^[A-Za-z]$/.test(p))) return false;

  // Reject pure title-case multi-word names — these are garbled team-name bar text,
  // not player names (e.g. "Fancy Goose", "Attack O"). Real multi-word player names
  // always have numbers, underscores, or at least one non-title-case word.
  if (name.includes(' ') && !/[0-9_]/.test(name)) {
    const _pp = name.trim().split(/\s+/);
    // Only block 2-word title-case short names (e.g. 'Fancy Goose'). Allow 3+ word names like 'Sushi Mc Beef' or 'Nathan Fielder'.
    if (_pp.length === 2 && _pp.every(p => /^[A-Z][a-z]+$/.test(p)) && _pp.every(p => p.length < 6)) return false;
  }

  if (!/[a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/.test(name)) return false;
  if (NOISE_WORDS.has(name.toUpperCase())) {
    const isLikelyCrewsPlayer = /^Crews$/i.test(name) && /[a-z]/.test(name);
    if (!isLikelyCrewsPlayer) return false;
  }
  if (/\b(?:PARTY|CREW|HUB|VOICE|CHANNEL|SPECTATOR|OBSERVER)\b/i.test(name)) return false;
  if (/^[|=\-~#%&*]+$/.test(name)) return false;

  // Reject ship name patterns:
  // 1. All-caps hyphenated compound words (e.g. "ATTACK-O-LANTERN", "TTACK-O-LANTERN")
  if (/^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(name)) return false;

  // 2. Merged all-caps ship names (e.g. "WITCHPLEASE", "NACKOLANTERN")
  if (/^[A-Z]{8,}$/.test(name) && /(?:LANTERN|PLEASE|WITCH|SPAGHURDER|MEANR|ATTACK)/.test(name)) return false;

  // 3. Multi-word all-caps team name bars (e.g. "WITCH PLEASE", "Y WITCH PLEASE")
  //    These are the colored bar labels rendered inside opponent cards, not player names.
  if (isTeamName(name)) return false;

  // 4. Very low-scoring tokens are almost certainly OCR noise (e.g. "amy" from
  //    the "Enemy Crews" header) — reject only the very bottom tier.
  if (scoreAsPlayerName(name) < 10) return false;

  return true;
}

// UI section headers that appear in the crew-hub right panel but are NOT team
// name bars. All-caps multi-word phrases that isTeamName would otherwise accept.
const NON_TEAM_PHRASES = new Set([
  'KNOWN HAZARDS', 'ENEMY CREWS', 'CREW SIZE', 'KNOWN HAZARDS &',
  'FASTER SHIELDS', 'FASTER SHIELDS DOWN', 'LOW ALTITUDE FOG',
  'FEW ASTEROIDS', 'LEGION PATROLS', 'ROGUE TURRETS', 'FEW SHIPS',
  'DEAD WORLDS', 'EPIC LOOT', 'CRYON RIFT', 'ARTIFACT HEALING',
  'ARTIFACT WEAPON', 'PING AT CURSOR', 'TOGGLE LABELS', 'TOGGLE CURSOR',
]);

/**
 * Check if text looks like a team name (not a player name)
 */
function isTeamName(text) {
  if (!text) return false;

  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 4 || cleaned.length > 40) return false;

  // Block known UI section headers that are all-caps multi-word but not teams
  if (NON_TEAM_PHRASES.has(cleaned.toUpperCase())) return false;

  const words = cleaned.split(/\s+/);

  const letters = cleaned.match(/[A-Za-z]/g) || [];
  const upperLetters = cleaned.match(/[A-Z]/g) || [];
  const upperRatio = letters.length > 0 ? upperLetters.length / letters.length : 0;
  const hasNumbers = /[0-9]/.test(cleaned);
  const hasUnderscore = /_/.test(cleaned);
  const hasMixedCase = /[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned);

  // Single all-caps word (e.g. VANGUARD, BOREALIS) counts as a team name
  if (words.length < 2) {
    if (hasUnderscore || hasNumbers) return false;
    return upperRatio === 1 && letters.length >= 5;
  }
  // Only accept multi-word team names if ALL CAPS (no lowercase at all)
  if (words.length >= 2 && (!/[a-z]/.test(cleaned)) && upperRatio >= 0.9) {
    return true;
  }

  // Avoid misclassifying player names
  if (hasUnderscore) return false;
  if (hasMixedCase && upperRatio < 0.9) return false;
  if (hasNumbers && words.length < 3) return false;

  return upperRatio >= 0.6;
}

function normalizeNameKey(input) {
  if (normalizePipeSpacerPlayerName(input)) return 'pipe-spacer-player';
  return (input || '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g, '');
}

function namesAreNearDuplicate(a, b) {
  const aKey = normalizeNameKey(a);
  const bKey = normalizeNameKey(b);
  if (!aKey || !bKey) return false;
  if (aKey === bKey) return true;
  // Substring containment only when the shorter string is long enough to be
  // unambiguous — prevents "riv" ⊆ "riv2" false-positive.
  const shorter = aKey.length <= bKey.length ? aKey : bKey;
  const longer  = aKey.length <= bKey.length ? bKey : aKey;
  if (shorter.length >= 8 && longer.includes(shorter)) return true;
  // Phantom-suffix dedup: "Daafin" and "Daafin19" are the same player —
  // the digit suffix is an OCR badge artifact.  Match when the shorter name
  // is a prefix of the longer and the extra chars are 1–2 digits only.
  if (shorter.length >= 4 && longer.startsWith(shorter) && /^\d{1,2}$/.test(longer.slice(shorter.length))) return true;
  // Fuzzy dedup (OCR typo tolerance): allow edit distance <=1 for medium+ names.
  // Keep short tags strict to avoid conflating distinct short handles.
  if (
    Math.abs(aKey.length - bKey.length) <= 1 &&
    Math.min(aKey.length, bKey.length) >= 8
  ) {
    return levenshteinDistance(aKey, bKey) <= 1;
  }
  return false;
}

function pushUniquePlayerName(players, candidate) {
  if (!candidate) return;
  const exists = players.some(p => namesAreNearDuplicate(p, candidate));
  if (!exists) players.push(candidate);
}

function findNearestTeamIndexByColor(teams, color, lineY, maxGap) {
  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    if (!t || t.color !== color) continue;
    const dist = lineY - (t.lastY || t.anchorY || 0);
    if (dist < 0 || dist > maxGap) continue;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function findNearestTeamIndexByY(teams, lineY, maxGap) {
  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    if (!t) continue;
    const dist = lineY - (t.lastY || t.anchorY || 0);
    if (dist < 0 || dist > maxGap) continue;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Format team/ship names while preserving punctuation and spacing
 */
function formatTeamName(name) {
  if (!name) return '';
  // Preserve punctuation valid in team names (!, ?, -, _, ., ')
  return name
    .replace(/[^a-zA-Z0-9_.\-'!? ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fuzzy match player name (allows for OCR errors)
 * Uses Levenshtein distance with threshold
 */
function fuzzyMatchName(text, targetName) {
  if (!text || !targetName) return false;

  // Direct substring match
  if (text.includes(targetName)) return true;

  // Calculate Levenshtein distance for each word
  const words = text.split(/\s+/);
  for (const word of words) {
    const distance = levenshteinDistance(word, targetName);
    // Allow up to 2 character differences
    if (distance <= 2) return true;
  }

  return false;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

module.exports = {
  extractCrewHub,
  extractLeftPanel,
  extractEnemyPanel,
  groupWordsIntoLines,
  extractPlayerNameFromLine,
  assembleMultiWordNames,
  cleanupPlayerName,
  isValidPlayerName,
  isTeamName,
  fuzzyMatchName,
  levenshteinDistance,
  scoreAsPlayerName,
  formatTeamName,
  __test__: {
    computeLineMergeThreshold,
    computeXProximityThreshold,
    countAnchorsBetween,
    getSameColorSplitGap,
    getSameColorMergeGap,
    isNearSkippedAnchor,
    isLikelyShortUiSuffixTagCandidate,
    isValidOpponentName,
  },
};
