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
    yMin: 0,
    yMax: 0.35,
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
  'MANY ASTEROIDS': 'Many Asteroids',
  'ROGUE TURRETS': 'Rogue Turrets',
  'SANDSTORM': 'Sandstorm',
};

/**
 * Main entry point: Extract all data from Map Screen
 * @param {Buffer} imageBuffer - Preprocessed image buffer
 * @param {Object} ocrResult - Tesseract OCR result { words, lines, text }
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {Promise<Object>} Extracted data
 */
async function extractMapScreen(imageBuffer, ocrResult, imageWidth, imageHeight) {
  console.log('[MapScreen] Starting extraction');

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
      imageHeight
    );

    // Step 2: Extract ENEMY SHIPS info
    result.enemyShips = await extractEnemyShips(
      imageBuffer,
      words,
      lines,
      text,
      imageWidth,
      imageHeight
    );

    // Step 3: Extract HAZARDS
    result.hazards = extractHazards(text);

    // Step 4: Extract player list (bottom-left)
    result.players = extractPlayerList(words, imageWidth, imageHeight);

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
async function extractYourShip(imageBuffer, words, lines, text, imageWidth, imageHeight) {
  console.log('[MapScreen] Extracting YOUR SHIP');

  // Define region bounds
  const bounds = {
    xMin: imageWidth * LAYOUT.YOUR_SHIP.xMin,
    xMax: imageWidth * LAYOUT.YOUR_SHIP.xMax,
    yMin: imageHeight * LAYOUT.YOUR_SHIP.yMin,
    yMax: imageHeight * LAYOUT.YOUR_SHIP.yMax,
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
      teamName = formatTeamName(lineText);
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
async function extractEnemyShips(imageBuffer, words, lines, text, imageWidth, imageHeight) {
  console.log('[MapScreen] Extracting ENEMY SHIPS');

  const enemyShips = [];

  // Define region bounds
  const bounds = {
    xMin: imageWidth * LAYOUT.ENEMY_SHIPS.xMin,
    xMax: imageWidth * LAYOUT.ENEMY_SHIPS.xMax,
    yMin: imageHeight * LAYOUT.ENEMY_SHIPS.yMin,
    yMax: imageHeight * LAYOUT.ENEMY_SHIPS.yMax,
  };

  // Filter words in ENEMY SHIPS region
  const regionWords = words.filter(w => {
    if (!w.bbox) return false;
    const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    return centerX >= bounds.xMin && centerX <= bounds.xMax &&
           centerY >= bounds.yMin && centerY <= bounds.yMax;
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
      pendingTeamName = formatTeamName(lineText);
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
function extractHazards(text) {
  const hazards = [];
  const upperText = text.toUpperCase();

  for (const [pattern, displayName] of Object.entries(KNOWN_HAZARDS)) {
    if (upperText.includes(pattern)) {
      hazards.push(displayName);
    }
  }

  // Remove duplicates
  return [...new Set(hazards)];
}

/**
 * Extract player list from bottom-left region
 */
function extractPlayerList(words, imageWidth, imageHeight) {
  const players = [];

  // Define region bounds
  const bounds = {
    xMin: imageWidth * LAYOUT.PLAYERS.xMin,
    xMax: imageWidth * LAYOUT.PLAYERS.xMax,
    yMin: imageHeight * LAYOUT.PLAYERS.yMin,
    yMax: imageHeight * LAYOUT.PLAYERS.yMax,
  };

  // Filter words in player list region
  const regionWords = words.filter(w => {
    if (!w.bbox) return false;
    const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    return centerX >= bounds.xMin && centerX <= bounds.xMax &&
           centerY >= bounds.yMin && centerY <= bounds.yMax;
  });

  // Group into lines
  const groupedLines = groupWordsIntoLines(regionWords, imageHeight);

  for (const line of groupedLines) {
    const playerName = extractPlayerNameFromLine(line.words);
    if (playerName && isValidPlayerName(playerName)) {
      players.push(playerName);
    }
  }

  return [...new Set(players)];
}

/**
 * Group words into lines by Y position
 */
function groupWordsIntoLines(words, imageHeight) {
  const lines = [];
  const lineThreshold = imageHeight * 0.02;

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

  const NOISE = new Set([
    'PARTY', 'VOICE', 'CREW', 'HUB', 'PUSH', 'TALK', 'YOUR', 'TEAM',
    'HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SHIP',
  ]);

  const parts = [];

  for (const word of words) {
    const text = word.text?.trim();
    if (!text) continue;
    if (NOISE.has(text.toUpperCase())) continue;
    if (text.length < 2) continue;
    if (/^[XPCD]$/i.test(text) && parts.length > 0) continue;

    parts.push(text);
  }

  if (parts.length === 0) return null;

  let name = parts.join('');

  // Clean up (supports Latin, Extended Latin, Cyrillic, CJK)
  // \u00C0-\u024F: Extended Latin (accented characters)
  // \u0400-\u04FF: Cyrillic
  // \u4e00-\u9fff: CJK
  name = name
    .replace(/@/g, 'Q')
    .replace(/[{}()\[\]]/g, '')
    // Preserve periods between alphanumeric chars (e.g. "River.Banks")
    .replace(/(?<![a-zA-Z0-9])[.,:;!?]+/g, '')
    .replace(/[,:;!?]+(?![a-zA-Z0-9])/g, '')
    .replace(/\.(?![a-zA-Z0-9])/g, '')
    .replace(/(?<![a-zA-Z0-9])\./g, '')
    .replace(/\s*[XPCD]$/i, '')
    .replace(/^[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+/, '')
    .replace(/[^a-zA-Z0-9_.\-\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+$/, '')
    .trim();

  return name.length >= 3 ? name : null;
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

  // All caps short words are likely UI
  if (name === name.toUpperCase() && name.length < 10 && !hasNumbers) {
    return false;
  }

  return true;
}

/**
 * Format team name (clean and standardize)
 */
function formatTeamName(name) {
  if (!name) return '';

  return name
    .replace(/[^\w\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
};
