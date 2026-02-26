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
 * The bar's color = team color (red/orange/yellow/yellowGreen).
 * Players grouped by matching bar color = same team.
 * There is NO separate "team header row" — just player card after player card.
 *
 * The right panel scrolls vertically; up to 9 cards visible at once.
 * Multiple screenshots may be needed to capture all enemy players.
 */

const { detectTeamColorBarBelow, detectColorInRegion } = require('./colorUtils.cjs');
const _fs = require('fs');
const _os = require('os');
const DLOG_PATH = require('path').join(_os.tmpdir(), 'wildgate-ocr.log');
const dlog = msg => { try { _fs.appendFileSync(DLOG_PATH, new Date().toISOString() + ' ' + msg + '\n'); } catch(_e) {} };

/**
 * Screen layout constants (percentage-based, calibrated from real 1920×1080 screenshots)
 */
const LAYOUT = {
  // Left panel: Your team
  LEFT_PANEL: {
    xMin: 0,
    xMax: 0.48,  // names can extend to ~46%, allow margin
    yMin: 0.05,
    yMax: 0.85,
  },
  // Right panel: Enemy crews — single scrollable list of player cards
  ENEMY_PANEL: {
    xMin: 0.55,  // portraits start at ~55%
    xMax: 1.0,
    yMin: 0.08,
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
    xMin: 0.63,
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

/**
 * Noise words to filter out (UI elements)
 */
const NOISE_WORDS = new Set([
  'PARTY', 'VOICE', 'CREW', 'HUB', 'PUSH', 'TALK', 'MUTE', 'OPTIONS', 'BACK',
  'SWITCH', 'DISABLE', 'ENABLE', 'YOUR', 'TEAM', 'CHANGE', 'MAP', 'SEED',
  'ENEMY', 'CREWS', 'CHANNEL', 'INTO', 'SAME', 'WITH', 'THE', 'HOP',
  'ON', 'OFF', 'TO', 'DEAFEN', 'UNMUTE', 'SAY', 'TEXT', 'PINGS',
  // Tactical map grid row labels (A-H) — prevent misclassification
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
]);

/**
 * Ship type names — not relevant in Crew Hub (only on tactical map),
 * but filter them for safety.
 */
const SHIP_TYPES = new Set(['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW']);

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
  layoutOverrides = null
) {
  console.log('[CrewHub] Starting extraction, activeUser:', activeUser);
  const colorBuffer = colorImageBuffer || imageBuffer;
  const layout = resolveCrewHubLayout(layoutOverrides);

  const result = {
    screenType: 'crewHub',
    yourTeam: {
      name: '',
      players: [],
    },
    enemyTeams: [],
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
    // Step 1: Extract your team from left panel
    result.yourTeam = await extractLeftPanel(
      imageBuffer,
      activeUser,
      words,
      lines,
      text,
      imageWidth,
      imageHeight,
      layout
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
      layout
    );

    // Step 3: Calculate confidence
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
async function extractLeftPanel(imageBuffer, activeUser, words, lines, text, imageWidth, imageHeight, layout = LAYOUT) {
  console.log('[CrewHub] Extracting left panel (your team)');

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

  // Step 1: Find team name (look for "'s Crew" pattern)
  const teamNameMatch = text.match(/([A-Z][A-Z\s]{2,30})['']s\s*Crew/i);
  if (teamNameMatch) {
    teamData.name = formatTeamName(teamNameMatch[1]);
    console.log('[CrewHub] Found team name:', teamData.name);
  }

  // Step 2: Filter words in left panel
  const leftPanelWords = words.filter(w => {
    if (!w.bbox) return false;
    const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    return centerX >= leftBounds.xMin && centerX <= leftBounds.xMax &&
           centerY >= leftBounds.yMin && centerY <= leftBounds.yMax;
  });

  console.log('[CrewHub] Left panel words:', leftPanelWords.length);

  // Step 3: Group words into lines by Y position
  const groupedLines = groupWordsIntoLines(leftPanelWords, imageHeight, imageWidth);

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
        console.log('[CrewHub] Found activeUser anchor at Y:', activeUserYPos);
        break;
      }
    }
  }

  // Teammate column max X — widened to ~48% to catch long names
  const teammateColumnMaxX = imageWidth * 0.48;

  const parsePlayersFromLines = (lineSet) => {
    const out = [];
    for (const line of lineSet) {
      if (getLineCenterX(line.words) > teammateColumnMaxX) continue;
      const playerName = extractPlayerNameFromLine(line.words);
      if (!playerName) continue;
      if (!isValidPlayerName(playerName)) continue;
      if (teamData.name && playerName.toUpperCase().includes(teamData.name.toUpperCase())) continue;
      if (/PARTY|CREW|HUB|VOICE|CHANNEL|PUSH|TALK|MUTE|DISABLE|DEAFEN|UNMUTE|TEXT|PINGS/i.test(playerName)) continue;
      if (/'S$/i.test(playerName)) continue;
      pushUniquePlayerName(out, playerName);
    }
    return out;
  };

  // First pass: anchor-window around active user to reduce UI noise
  let parsedPlayers = [];
  if (foundActiveUser && activeUserYPos !== null) {
    const anchorLines = groupedLines.filter(line => Math.abs(line.y - activeUserYPos) <= imageHeight * 0.30);
    parsedPlayers = parsePlayersFromLines(anchorLines);
  }

  // Fallback: full left panel if anchor-window under-captures
  if (parsedPlayers.length < 3) {
    const expanded = parsePlayersFromLines(groupedLines);
    if (expanded.length > parsedPlayers.length) {
      parsedPlayers = expanded;
    }
  }

  teamData.players = [...new Set(parsedPlayers)];
  for (const name of parsedPlayers) {
    console.log('[CrewHub] Found teammate:', name);
  }

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
async function extractEnemyPanel(colorImageBuffer, words, lines, text, imageWidth, imageHeight, scale = 1, layout = LAYOUT) {
  try { _fs.writeFileSync(DLOG_PATH, '=== extractEnemyPanel ' + new Date().toISOString() + ' ===\n'); } catch(_e) {}
  dlog('[CrewHub] Extracting enemy panel — row-based card scanner v3');

  const SPECTATOR_PATTERNS = [
    /FIEND\s*(OR|0R)\s*FOE/i,
    /SPECTATOR/i,
    /OBSERVER/i,
  ];
  const isSpectatorLine = (s) => SPECTATOR_PATTERNS.some(p => p.test(s));

  // ── Bounds ──────────────────────────────────────────────────────────────────
  const panelXMin = imageWidth  * layout.ENEMY_PANEL.xMin;   // ~0.55
  const panelXMax = imageWidth  * layout.ENEMY_PANEL.xMax;   // ~1.0
  const panelYMin = imageHeight * layout.ENEMY_PANEL.yMin;   // ~0.08
  const panelYMax = imageHeight * layout.ENEMY_PANEL.yMax;   // ~0.95

  // Enemy name X-band: narrower filter to isolate player name text
  const nameXMin = imageWidth * layout.ENEMY_NAME.xMin;      // ~0.63
  const nameXMax = imageWidth * layout.ENEMY_NAME.xMax;      // ~0.92

  // ── Step 1: Filter words into enemy name X-band ─────────────────────────────
  const enemyWords = [];
  for (const w of words) {
    if (!w.bbox || !w.text) continue;
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    if (cx < nameXMin || cx > nameXMax) continue;
    if (cy < panelYMin || cy > panelYMax) continue;
    enemyWords.push(w);
  }

  dlog('[CrewHub] Enemy panel words in name band: ' + enemyWords.length + ' (imageSize=' + imageWidth + 'x' + imageHeight + ' scale=' + scale + ')');
  dlog('[CrewHub] All words (' + enemyWords.length + '): ' + enemyWords.map(w => '"' + w.text + '"(c' + Math.round(w.confidence) + ')@y' + Math.round((w.bbox.y0+w.bbox.y1)/2)).join(' '));

  if (enemyWords.length === 0) {
    dlog('[CrewHub] No words found in enemy name band — returning empty');
    return [];
  }

  // ── Step 2: Group words into lines ──────────────────────────────────────────
  const groupedLines = groupWordsIntoLines(enemyWords, imageHeight, imageWidth);
  dlog('[CrewHub] Enemy lines found: ' + groupedLines.length + ' | ys=' + groupedLines.map(l => Math.round(l.y)).join(','));

  // ── Step 3: For each line, extract name + sample color bar below ────────────
  // Card height is ~78px at 1080p original resolution; OCR bbox Y coords are in
  // scaled image space, so multiply by scale for correct threshold comparisons.
  const CARD_HEIGHT = Math.round(78 * (scale || 1));
  // BAR_HEIGHT: the team-name bar is ~22px tall at original res = 22*scale in OCR coords
  // BAR_OFFSET: bar sits ~11px below name text bottom at original res = 11*scale in OCR coords
  const BAR_OFFSET = Math.round(11 * (scale || 1));
  const BAR_HEIGHT = Math.round(28 * (scale || 1)); // slightly generous

  // Tracks Y zones (in scaled OCR coords) occupied by detected color bars.
  // Any OCR line whose center falls in one of these zones is bar text, not a player name.
  const barZones = []; // { min, max }

  const cards = []; // { y, name, color, confidence, bbox }

  for (const line of groupedLines) {
    // ── Skip lines that fall inside a known bar zone (ship name text) ──────────
    const inBarZone = barZones.some(z => line.y >= z.min && line.y <= z.max);
    if (inBarZone) { dlog('[CrewHub] SKIP bar-zone line: "' + line.words.map(w => w.text).join(' ') + '" y=' + Math.round(line.y)); continue; }
    const lineText = line.words.map(w => w.text).join(' ').trim();
    if (!lineText || lineText.length < 2) { dlog('[CrewHub] SKIP too-short line: "' + lineText + '" y=' + Math.round(line.y)); continue; }
    if (isSpectatorLine(lineText)) { dlog('[CrewHub] SKIP spectator line: "' + lineText + '"'); continue; }

    // Check if all words are noise
    const wordsUpper = lineText.toUpperCase().split(/\s+/);
    const allNoise = wordsUpper.every(w => NOISE_WORDS.has(w) || w.length <= 1);
    if (allNoise) { dlog('[CrewHub] SKIP all-noise line: "' + lineText + '"'); continue; }

    // Extract player name
    const playerName = extractPlayerNameFromLine(line.words);
    if (!playerName) { dlog('[CrewHub] SKIP no-name extracted from: "' + lineText + '"'); continue; }
    if (!isValidOpponentName(playerName)) { dlog('[CrewHub] SKIP invalid-name: "' + playerName + '"'); continue; }
    if (/PARTY|CREW|HUB|VOICE|CHANNEL|PUSH|TALK|MUTE|DISABLE|DEAFEN|UNMUTE|SAY|TEXT|PINGS/i.test(playerName)) { dlog('[CrewHub] SKIP ui-word: "' + playerName + '"'); continue; }

    // Get the bounding box of the first word (for color sampling reference)
    const firstWord = line.words[0];
    if (!firstWord?.bbox) continue;

    // Build a synthetic bbox spanning the whole line for color detection
    const lineBbox = {
      x0: Math.min(...line.words.map(w => w.bbox.x0)),
      y0: Math.min(...line.words.map(w => w.bbox.y0)),
      x1: Math.max(...line.words.map(w => w.bbox.x1)),
      y1: Math.max(...line.words.map(w => w.bbox.y1)),
    };

    // Sample the colored bar BELOW the name text
    let detectedColor = 'unknown';
    let colorConfidence = 0;

    if (colorImageBuffer) {
      try {
        const cr = await detectTeamColorBarBelow(colorImageBuffer, lineBbox, scale);
        if (cr.color !== 'unknown' && cr.color !== 'spectator' && cr.confidence > 30) {
          detectedColor = cr.color;
          colorConfidence = cr.confidence;
        } else if (cr.color === 'spectator') {
          console.log('[CrewHub] Skipping spectator card:', playerName);
          continue;
        }
      } catch (e) {
        console.warn('[CrewHub] Color detection failed for', playerName, ':', e.message);
      }
    }

    cards.push({
      y: line.y,
      name: playerName,
      color: detectedColor,
      confidence: colorConfidence,
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
      barZones.push({ min: lineBbox.y1 + BAR_OFFSET - 5, max: lineBbox.y1 + BAR_OFFSET + BAR_HEIGHT + 5 });
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
      // Prefer the name with the higher player-name score, not simply the longer one
      const keepNew = (card.color !== 'unknown' && nearby.color === 'unknown')
        || (card.color === nearby.color && scoreAsPlayerName(card.name) > scoreAsPlayerName(nearby.name));
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
  const uniqueCards = deduped;
  dlog('[CrewHub] Cards after dedup: ' + uniqueCards.length + ' — ' + uniqueCards.map(c => c.name + '(' + c.color + ')').join(', '));

  // ── Step 4: Group by known color (primary method) ──────────────────────────
  const colorGroups = new Map(); // color → { cards[], minY, maxY }

  for (const card of uniqueCards) {
    if (card.color !== 'unknown') {
      if (!colorGroups.has(card.color)) {
        colorGroups.set(card.color, { color: card.color, cards: [], minY: Infinity, maxY: -Infinity, confidence: 0 });
      }
      const g = colorGroups.get(card.color);
      g.cards.push(card);
      g.minY = Math.min(g.minY, card.y);
      g.maxY = Math.max(g.maxY, card.y);
      g.confidence = Math.max(g.confidence, card.confidence);
    }
  }

  const unknownCards = uniqueCards.filter(c => c.color === 'unknown');

  // ── Step 5: Assign unknown-color cards to nearest known group ───────────────
  const knownGroups = [...colorGroups.values()];

  if (knownGroups.length > 0) {
    for (const card of unknownCards) {
      let bestGroup = null;
      let bestDist = Infinity;
      for (const g of knownGroups) {
        // Distance to the group's Y range (0 if inside range)
        const dist = card.y < g.minY ? g.minY - card.y
                   : card.y > g.maxY ? card.y - g.maxY
                   : 0;
        if (dist < bestDist) { bestDist = dist; bestGroup = g; }
      }
      if (bestGroup && bestDist < CARD_HEIGHT * 3) {
        bestGroup.cards.push(card);
        bestGroup.minY = Math.min(bestGroup.minY, card.y);
        bestGroup.maxY = Math.max(bestGroup.maxY, card.y);
        console.log('[CrewHub] Assigned unknown-color', card.name, '→', bestGroup.color, '(dist', Math.round(bestDist), 'px)');
      } else {
        // No nearby known group — create isolated unknown group
        knownGroups.push({ color: 'unknown', cards: [card], minY: card.y, maxY: card.y, confidence: 0 });
      }
    }
  } else {
    // ── Step 5b: Fallback — pure Y-gap clustering when ALL colors unknown ──────
    console.log('[CrewHub] No color info — falling back to Y-gap clustering');
    const TEAM_GAP_THRESHOLD = CARD_HEIGHT * 1.8;
    let currentCluster = null;
    for (const card of uniqueCards) {
      if (!currentCluster) {
        currentCluster = { color: 'unknown', cards: [card], minY: card.y, maxY: card.y, confidence: 0 };
      } else {
        const gap = card.y - currentCluster.maxY;
        if (gap > TEAM_GAP_THRESHOLD) {
          knownGroups.push(currentCluster);
          currentCluster = { color: 'unknown', cards: [card], minY: card.y, maxY: card.y, confidence: 0 };
        } else {
          currentCluster.cards.push(card);
          currentCluster.maxY = card.y;
        }
      }
    }
    if (currentCluster && currentCluster.cards.length > 0) knownGroups.push(currentCluster);
  }

  dlog('[CrewHub] Groups after assignment: ' + knownGroups.length + ' — ' + knownGroups.map(g => g.color + '(' + g.cards.length + ')').join(', '));

  // ── Build output ─────────────────────────────────────────────────────────────
  let teamCounter = 1;
  const enemyTeams = [];

  for (const cluster of knownGroups) {
    const players = [];
    for (const card of cluster.cards) {
      pushUniquePlayerName(players, card.name);
    }

    const filteredPlayers = players.filter(p => !isTeamName(p));
    if (filteredPlayers.length === 0) continue;

    const teamName = cluster.color !== 'unknown' ? cluster.color : `Team ${teamCounter++}`;
    if (isSpectatorLine(teamName)) continue;

    enemyTeams.push({
      name: teamName,
      color: cluster.color || 'unknown',
      shipType: '',
      players: filteredPlayers,
      confidence: cluster.confidence || 50,
    });
  }

  // Sort by player count (most players first), cap at 4 teams
  enemyTeams.sort((a, b) => b.players.length - a.players.length);
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
function groupWordsIntoLines(words, imageHeight, imageWidth = null) {
  const lines = [];
  // FIXED: Use 1.2% of height or max 15px (was 2.5% = 27px on 1080p, too loose)
  const lineThreshold = Math.min(15, imageHeight * 0.012);
  // X-proximity threshold: words farther apart than this are separate lines
  const xProximityThreshold = imageWidth ? imageWidth * 0.25 : 400; // 25% of width or 400px default

  for (const word of words) {
    if (!word.bbox || !word.text) continue;

    const wordY = (word.bbox.y0 + word.bbox.y1) / 2;
    const wordX = word.bbox.x0;
    let foundLine = false;

    for (const line of lines) {
      // Check Y proximity (same vertical level)
      if (Math.abs(line.y - wordY) < lineThreshold) {
        // Also check X proximity to prevent merging distant text
        const lastWordInLine = line.words[line.words.length - 1];
        const lineEndX = lastWordInLine ? lastWordInLine.bbox.x1 : 0;
        const lineStartX = line.words[0]?.bbox.x0 || 0;

        // Word should be within reasonable X distance of existing line content
        const xDistFromEnd = wordX - lineEndX;
        const xDistFromStart = lineStartX - (word.bbox.x1 || wordX);

        // Accept if word is close to either end of the line
        if (xDistFromEnd < xProximityThreshold && xDistFromEnd > -50 ||
            xDistFromStart < xProximityThreshold && xDistFromStart > -50) {
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
 * Extract player name from a line of words
 * Uses smarter filtering to find the most likely player name
 */
function extractPlayerNameFromLine(words) {
  if (!words || words.length === 0) return null;

  const validParts = [];
  let bestSingleWord = null;
  let bestSingleWordScore = 0;

  for (const word of words) {
    const text = word.text?.trim();
    if (!text) continue;

    // Skip noise words
    if (NOISE_WORDS.has(text.toUpperCase())) continue;

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

  // Strategy 1: If we have a single high-confidence word, use it
  if (bestSingleWord && bestSingleWordScore >= 50 && validParts.length <= 3) {
    const cleaned = cleanupPlayerName(bestSingleWord);
    if (cleaned.length >= 3) return cleaned;
  }

  // Strategy 1b: Best word is decent but secondary "words" are all 2-char noise
  // (e.g., platform icon OCR'd as "OF", "07"; prevents "HoffOF" from being returned)
  if (bestSingleWord && bestSingleWordScore >= 25 && validParts.length >= 2) {
    const otherParts = validParts.filter(p => p !== bestSingleWord);
    const allOthersAreNoise = otherParts.every(p => p.length <= 2 && scoreAsPlayerName(p) === 0);
    if (allOthersAreNoise) {
      const cleaned = cleanupPlayerName(bestSingleWord);
      if (cleaned.length >= 3) return cleaned;
    }
  }

  // Strategy 2: Join consecutive parts that look like they belong together
  if (validParts.length === 0) return null;

  // Filter out likely noise parts
  const filteredParts = validParts.filter(p => {
    // Keep if it has alphanumeric content
    if (/[a-zA-Z0-9\u4e00-\u9fff]{2,}/.test(p)) return true;
    // Keep numbers that might be part of username
    if (/^\d+$/.test(p) && p.length <= 4) return true;
    return false;
  });

  if (filteredParts.length === 0) return null;

  // Join parts
  let name = filteredParts.join('');

  // Clean up OCR artifacts
  name = cleanupPlayerName(name);

  return name.length >= 3 ? name : null;
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

/**
 * Score how likely a word is to be a player name (0-100)
 */
function scoreAsPlayerName(text) {
  if (!text || text.length < 3) return 0;

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

  // Penalize short all-caps (likely UI element)
  if (text === text.toUpperCase() && text.length < 6 && !/[0-9]/.test(text)) score -= 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Clean up OCR artifacts from player name
 * Supports: Latin, Extended Latin, Cyrillic, CJK characters
 */
function cleanupPlayerName(name) {
  if (!name) return '';

  let cleaned = name
    // Common OCR substitutions
    .replace(/@/g, 'Q')      // @ -> Q
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
    // Remove trailing platform indicators
    .replace(/\s*[XPCD]$/i, '')
    // Remove common OCR prefixes/suffixes
    .replace(/^[A-Z]{1,3}(?=[A-Z][a-z])/g, '') // Remove short caps prefix before CamelCase (e.g., "GNAlixThus" -> "AlixThus")
    .replace(/[=]+$/g, '')   // Remove trailing = (e.g., "oSalad=" -> "oSalad")
    .replace(/^[=]+/g, '')   // Remove leading =
    // Clean edges (allow Latin, extended Latin, Cyrillic, CJK, numbers, underscore, period, hyphen)
    .replace(/^[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+/, '')
    .replace(/[^a-zA-Z0-9_.\-\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+$/, '')
    .trim();

  // Additional cleanup: remove single isolated characters at start/end
  cleaned = cleaned.replace(/^[a-zA-Z](?=[A-Z])/, ''); // Single lowercase before uppercase
  cleaned = cleaned.replace(/[a-zA-Z]$(?<=[a-z][A-Z])/, ''); // Single uppercase after lowercase at end

  return cleaned;
}

/**
 * Check if a name looks like a valid player name
 * - Has letters (Latin, Extended Latin, Cyrillic, or CJK)
 * - Has some distinguishing feature (numbers, underscore, mixed case, non-ASCII)
 * - Length 3-25 characters
 */
function isValidPlayerName(name) {
  if (!name || name.length < 3 || name.length > 25) return false;

  // Must have at least some letters (Latin, Extended Latin, Cyrillic, or CJK)
  // \u00C0-\u024F: Extended Latin (accented characters)
  // \u0400-\u04FF: Cyrillic
  // \u4e00-\u9fff: CJK
  const hasLetters = /[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/.test(name);
  if (!hasLetters) return false;

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
  if (!name || name.length < 3 || name.length > 28) return false;
  if (/^[0-9]/.test(name)) return false; // names never start with a digit

  if (!/[a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/.test(name)) return false;
  if (NOISE_WORDS.has(name.toUpperCase())) return false;
  if (/PARTY|CREW|HUB|VOICE|CHANNEL|SPECTATOR|OBSERVER/i.test(name)) return false;
  if (/^[|=\-~#%&*]+$/.test(name)) return false;

  // Reject ship name patterns:
  // 1. All-caps hyphenated compound words (e.g. "ATTACK-O-LANTERN", "TTACK-O-LANTERN")
  if (/^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(name)) return false;

  // 2. Mixed-case word that ends with a known game ship-name suffix joined by OCR
  //    e.g. "NACKOLANTERN" = "ANACKO" + "LANTERN", "WITCHPLEASE" = "WITCH"+"PLEASE"
  //    Pattern: all-caps, >= 8 chars, ends/contains with known ship-name suffixes
  if (/^[A-Z]{8,}$/.test(name) && /(?:LANTERN|PLEASE|WITCH|SPAGHURDER|MEANR|ATTACK)/.test(name)) return false;

  return true;
}

/**
 * Check if text looks like a team name (not a player name)
 */
function isTeamName(text) {
  if (!text) return false;

  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 4 || cleaned.length > 40) return false;

  const words = cleaned.split(/\s+/);
  if (words.length < 2) return false;

  const letters = cleaned.match(/[A-Za-z]/g) || [];
  const upperLetters = cleaned.match(/[A-Z]/g) || [];
  const upperRatio = letters.length > 0 ? upperLetters.length / letters.length : 0;

  const hasNumbers = /[0-9]/.test(cleaned);
  const hasUnderscore = /_/.test(cleaned);
  const hasMixedCase = /[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned);

  // Avoid misclassifying player names
  if (hasUnderscore) return false;
  if (hasMixedCase && upperRatio < 0.9) return false;
  if (hasNumbers && words.length < 3) return false;

  return upperRatio >= 0.6;
}

function normalizeNameKey(input) {
  return (input || '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g, '');
}

function namesAreNearDuplicate(a, b) {
  const aKey = normalizeNameKey(a);
  const bKey = normalizeNameKey(b);
  if (!aKey || !bKey) return false;
  if (aKey === bKey) return true;
  if (aKey.includes(bKey) || bKey.includes(aKey)) return true;
  return levenshteinDistance(aKey, bKey) <= 1;
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
  return name
    .replace(/[^a-zA-Z0-9_.\-'\s]/g, '')
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
  cleanupPlayerName,
  isValidPlayerName,
  isTeamName,
  fuzzyMatchName,
  levenshteinDistance,
  scoreAsPlayerName,
  formatTeamName,
};
