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
  // ENEMY SHIPS region (top-right)
  ENEMY_SHIPS: {
    xMin: 0.60,
    xMax: 1.0,
    yMin: 0.00,
    yMax: 0.10,
  },
  ENEMY_SHIPS2: {
    xMin: 0.60,
    xMax: 1.0,
    yMin: 0.10,
    yMax: 0.20,
  },
  ENEMY_SHIPS3: {
    xMin: 0.60,
    xMax: 1.0,
    yMin: 0.20,
    yMax: 0.30,
  },
  ENEMY_SHIPS4: {
    xMin: 0.60,
    xMax: 1.0,
    yMin: 0.30,
    yMax: 0.40,
  },
  // HAZARDS region (right side, middle)
  HAZARDS: {
    xMin: 0.60,
    xMax: 1.0,
    yMin: 0.30,
    yMax: 0.70,
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
  return {
    YOUR_SHIP: sanitizeBounds(source.yourShip, LAYOUT.YOUR_SHIP),
    ENEMY_SHIPS: sanitizeBounds(source.enemyShips, LAYOUT.ENEMY_SHIPS),
    ENEMY_SHIPS2: sanitizeBounds(source.enemyShips2, LAYOUT.ENEMY_SHIPS2),
    ENEMY_SHIPS3: sanitizeBounds(source.enemyShips3, LAYOUT.ENEMY_SHIPS3),
    ENEMY_SHIPS4: sanitizeBounds(source.enemyShips4, LAYOUT.ENEMY_SHIPS4),
    HAZARDS: sanitizeBounds(source.hazards, LAYOUT.HAZARDS),
    PLAYERS: sanitizeBounds(source.players, LAYOUT.PLAYERS),
  };
}

/**
 * Known ship types
 */
const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'SOLO OUTLAW', 'OUTLAW'];

/**
 * Known hazards/modifiers
 */
const KNOWN_HAZARDS = {
  'HEALING ARTIFACT': 'Artifact: Healing',
  'ARTIFACT HEALING': 'Artifact: Healing',
  'ICE ARTIFACT': 'Artifact: Ice',
  'WEAPON ARTIFACT': 'Artifact: Weapon',
  'ANCIENT VAULT': 'Ancient Vault',
  'CRYON REACH': 'Cryon Reach',
  'DEAD SENSORS': 'Dead Sensors',
  'DEADWORLDS': 'Deadworlds',
  'EASY LOOT': 'Easy Loot',
  'EPIC LOOT': 'Epic Loot',
  'FAST GATE': 'Fast Gate',
  'FEW ASTEROIDS': 'Few Asteroids',
  'FEW SHIPS': 'Few Ships',
  'GLOAMING EXPANSE': 'Gloaming Expanse',
  'HAUNTED STORM': 'Haunted Storm',
  'ICE STORM': 'Ice Storm',
  'LAVA EPICS': 'Lava Epics',
  'LEECH SWARMS': 'Leech Swarms',
  'LEGION PATROLS': 'Legion Patrols',
  'LOW ALTITUDE FOG': 'Low Altitude Fog',
  'LOW LATITUDE FOG': 'Low Altitude Fog',
  'MANY ASTEROIDS': 'Many Asteroids',
  'ROGUE TURRETS': 'Rogue Turrets',
  'SANDSTORM': 'Sandstorm',
};

const PLAYER_NOISE_WORDS = new Set([
  'YOUR', 'SHIP', 'ENEMY', 'SHIPS', 'HAZARDS', 'PARTY', 'VOICE',
  'HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO',
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
async function extractMapScreen(imageBuffer, ocrResult, imageWidth, imageHeight, layoutOverrides = null) {
  console.log('[MapScreen] Starting extraction');
  const layout = resolveMapLayout(layoutOverrides);

  const result = {
    screenType: 'mapScreen',
    yourShip: null,
    enemyShips: [],
    hazards: [],
    players: [],
    confidence: 0,
  };

  // Safety checks
  if (!ocrResult) {
    console.error('[MapScreen] No OCR result provided');
    return result;
  }

  const words = ocrResult.words || [];
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
      layout
    );

    // Step 2: Extract ENEMY SHIPS info
    result.enemyShips = await extractEnemyShips(
      imageBuffer,
      words,
      lines,
      text,
      imageWidth,
      imageHeight,
      layout
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
async function extractYourShip(imageBuffer, words, lines, text, imageWidth, imageHeight, layout = LAYOUT) {
  console.log('[MapScreen] Extracting YOUR SHIP');

  // Define region bounds
  const bounds = {
    xMin: imageWidth * layout.YOUR_SHIP.xMin,
    xMax: imageWidth * layout.YOUR_SHIP.xMax,
    yMin: imageHeight * layout.YOUR_SHIP.yMin,
    yMax: imageHeight * layout.YOUR_SHIP.yMax,
  };

  // Filter words in YOUR SHIP region
  const regionWords = words.filter(w => {
    if (!w.bbox) return false;
    const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    return centerX >= bounds.xMin && centerX <= bounds.xMax &&
           centerY >= bounds.yMin && centerY <= bounds.yMax;
  });

  // Group into lines
  const groupedLines = groupWordsIntoLines(regionWords, imageHeight);

  let teamName = '';
  let shipType = '';

  // Look for ship type and team name
  for (const line of groupedLines) {
    const lineText = line.words.map(w => w.text).join(' ').toUpperCase().trim();

    // Skip "YOUR SHIP" header
    if (lineText.includes('YOUR') && lineText.includes('SHIP')) continue;

    // Check for ship type
    const foundShip = SHIP_TYPES.find(type => lineText.includes(type));
    if (foundShip) {
      shipType = foundShip.charAt(0) + foundShip.slice(1).toLowerCase();

      // Team name might be in same line before ship type
      const beforeShip = lineText.substring(0, lineText.indexOf(foundShip)).trim();
      if (beforeShip.length >= 3 && !teamName) {
        teamName = formatTeamName(beforeShip);
      }
    } else if (!shipType && lineText.length >= 3 && lineText.length <= 30) {
      // This might be the team name (appears before ship type)
      if (looksLikeTeamName(lineText)) {
        teamName = formatTeamName(lineText);
      }
    }
  }

  if (shipType) {
    return {
      teamName: teamName || 'Your Team',
      shipType,
      confidence: teamName ? 85 : 70,
    };
  }

  // Fallback: Try to find in raw text
  const yourShipSection = text.substring(0, text.indexOf('ENEMY') > -1 ? text.indexOf('ENEMY') : 500);
  for (const shipName of SHIP_TYPES) {
    if (yourShipSection.toUpperCase().includes(shipName)) {
      return {
        teamName: 'Your Team',
        shipType: shipName.charAt(0) + shipName.slice(1).toLowerCase(),
        confidence: 60,
      };
    }
  }

  return null;
}

/**
 * Extract ENEMY SHIPS info from top-right region
 */
async function extractEnemyShips(imageBuffer, words, lines, text, imageWidth, imageHeight, layout = LAYOUT) {
  console.log('[MapScreen] Extracting ENEMY SHIPS');

  const enemyShips = [];
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

  // Filter words in ENEMY SHIPS region
  const regionWords = words.filter(w => {
    if (!w.bbox) return false;
    const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    return boundsList.some((bounds) => (
      centerX >= bounds.xMin && centerX <= bounds.xMax &&
      centerY >= bounds.yMin && centerY <= bounds.yMax
    ));
  });

  // Group into lines and sort by Y
  const groupedLines = groupWordsIntoLines(regionWords, imageHeight);

  // Process lines looking for team name + ship type pattern
  let pendingTeamName = '';
  let pendingColor = 'unknown';

  for (let i = 0; i < groupedLines.length; i++) {
    const line = groupedLines[i];
    const lineText = line.words.map(w => w.text).join(' ').trim();
    const upperText = lineText.toUpperCase();

    // Skip "ENEMY SHIPS" header
    if (upperText.includes('ENEMY') && upperText.includes('SHIP')) continue;

    // Detect color for this line
    const firstWord = line.words[0];
    if (firstWord && firstWord.bbox && imageBuffer) {
      try {
        const colorResult = await detectBadgeColorNearText(imageBuffer, firstWord.bbox, 1);
        if (colorResult.color !== 'unknown' && colorResult.confidence > 40) {
          pendingColor = colorResult.color;
        }
      } catch (e) {
        // Continue without color
      }
    }

    // Check if this line is a ship type
    const foundShip = SHIP_TYPES.find(type => upperText.includes(type));

    if (foundShip) {
      // This line has a ship type - extract team name
      let teamName = pendingTeamName;

      // Check if team name is in same line before ship type
      const beforeShip = upperText.substring(0, upperText.indexOf(foundShip)).trim();
      if (beforeShip.length >= 3) {
        teamName = formatTeamName(beforeShip);
      }

      enemyShips.push({
        teamName: teamName || `Enemy Team ${enemyShips.length + 1}`,
        shipType: foundShip.charAt(0) + foundShip.slice(1).toLowerCase(),
        color: pendingColor,
        confidence: teamName ? 80 : 60,
      });

      // Reset pending values
      pendingTeamName = '';
      pendingColor = 'unknown';
    } else if (lineText.length >= 3 && lineText.length <= 30) {
      // This might be a team name (for next ship type line)
      if (looksLikeTeamName(lineText)) {
        pendingTeamName = formatTeamName(lineText);
      }
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

        enemyShips.push({
          teamName: teamName || `Enemy Team ${enemyShips.length + 1}`,
          shipType: foundShip.charAt(0) + foundShip.slice(1).toLowerCase(),
          color: 'unknown',
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
  const upperText = String(text || '').toUpperCase();

  for (const [pattern, displayName] of Object.entries(KNOWN_HAZARDS)) {
    if (upperText.includes(pattern)) {
      hazards.add(displayName);
    }
  }

  if (Array.isArray(words) && words.length > 0 && imageWidth > 0 && imageHeight > 0) {
    const bounds = {
      xMin: imageWidth * layout.HAZARDS.xMin,
      xMax: imageWidth * layout.HAZARDS.xMax,
      yMin: imageHeight * layout.HAZARDS.yMin,
      yMax: imageHeight * layout.HAZARDS.yMax,
    };
    const regionWords = filterWordsInBounds(words, bounds);
    if (regionWords.length > 0) {
      const regionText = groupWordsIntoLines(regionWords, imageHeight)
        .map(line => line.words.map(w => w.text).join(' ').trim())
        .join('\n')
        .toUpperCase();
      for (const [pattern, displayName] of Object.entries(KNOWN_HAZARDS)) {
        if (regionText.includes(pattern)) {
          hazards.add(displayName);
        }
      }
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
      candidates.push(playerName);
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

/**
 * Extract player name from line of words
 */
function extractPlayerNameFromLine(words) {
  if (!words || words.length === 0) return null;

  const parts = [];
  let bestToken = '';
  let bestTokenScore = 0;

  for (const word of words) {
    const text = word.text?.trim();
    if (!text) continue;
    if (PLAYER_NOISE_WORDS.has(text.toUpperCase())) continue;
    if (text.length < 2) continue;
    // Filter tactical map grid coordinate labels (e.g. A1, B3, H8)
    if (/^[A-H]\d{1,2}$/i.test(text)) continue;
    if (/^[XPCD]$/i.test(text) && parts.length > 0) continue;
    if (/^[|=\-~#%&*]+$/.test(text)) continue;

    const cleanedToken = cleanupPlayerToken(text);
    const tokenScore = scoreAsMapPlayerToken(cleanedToken);
    if (tokenScore > bestTokenScore) {
      bestTokenScore = tokenScore;
      bestToken = cleanedToken;
    }
    parts.push(cleanedToken);
  }

  if (parts.length === 0) return null;

  // For tiny map text, a single strong token is often better than joining noisy neighbors.
  if (bestToken && bestTokenScore >= 45 && parts.length <= 3) {
    return bestToken.length >= 3 ? bestToken : null;
  }

  const joined = cleanupPlayerToken(parts.join(''));
  return joined.length >= 3 ? joined : null;
}

/**
 * Check if name is valid player name
 * Supports: Latin, Extended Latin, Cyrillic, CJK characters
 */
function isValidPlayerName(name) {
  if (!name || name.length < 3 || name.length > 25) return false;

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
  return (input || '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g, '');
}

function dedupePlayerNames(players) {
  const out = [];
  for (const candidate of players) {
    const key = normalizeNameKey(candidate);
    if (!key) continue;
    const exists = out.some(existing => {
      const existingKey = normalizeNameKey(existing);
      return existingKey === key || existingKey.includes(key) || key.includes(existingKey);
    });
    if (!exists) out.push(candidate);
  }
  return out;
}

/**
 * Format team name (clean and standardize)
 */
function formatTeamName(name) {
  if (!name) return '';

  return name
    .replace(/[^a-zA-Z0-9_.\-'\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Heuristic: team names are usually multi-word and mostly uppercase
 */
function looksLikeTeamName(text) {
  if (!text) return false;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 4 || cleaned.length > 40) return false;

  const words = cleaned.split(/\s+/);
  if (words.length < 2) return false;

  const letters = cleaned.match(/[A-Za-z]/g) || [];
  const upperLetters = cleaned.match(/[A-Z]/g) || [];
  const upperRatio = letters.length > 0 ? upperLetters.length / letters.length : 0;

  const hasUnderscore = /_/.test(cleaned);
  const hasMixedCase = /[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned);

  if (hasUnderscore) return false;
  if (hasMixedCase && upperRatio < 0.9) return false;

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
