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
  // ENEMY SHIPS region (top-right).
  // Text starts at x≈85%; x=60-83% contains badge/icon noise — exclude it.
  ENEMY_SHIPS: {
    xMin: 0.83,
    xMax: 1.0,
    yMin: 0.00,
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
    resolved.HAZARDS.yMax = Math.min(1, headerY + 0.42);
  }
  return resolved;
}

/**
 * Known ship types
 */
const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'SOLO OUTLAW', 'OUTLAW'];

/**
 * Known hazards/modifiers
 */
const KNOWN_HAZARDS = {
  // Artifact modifiers
  'HEALING ARTIFACT': 'Artifact: Healing',
  'ARTIFACT HEALING': 'Artifact: Healing',
  'ICE ARTIFACT': 'Artifact: Ice',
  'CE ARTIFACT': 'Artifact: Ice',    // OCR misreads I as | → "| CE" or "CE"
  'WEAPON ARTIFACT': 'Artifact: Weapon',
  // Named modifiers
  'ANCIENT VAULT': 'Ancient Vault',
  'CRYON REACH': 'Cryon Reach',
  'CRYON RIFT': 'Cryon Rift',
  'DEAD SENSORS': 'Dead Sensors',
  'DEAD WORLDS': 'Dead Worlds',
  'DEADWORLDS': 'Dead Worlds',
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
  'PATROLS': 'Legion Patrols',       // OCR sometimes only reads second word
  'LOW ALTITUDE FOG': 'Low Altitude Fog',
  'LOW LATITUDE FOG': 'Low Altitude Fog',
  'MANY ASTEROIDS': 'Many Asteroids',
  'ROGUE TURRETS': 'Rogue Turrets',
  'SANDSTORM': 'Sandstorm',
  'SAND STORM': 'Sandstorm',         // OCR sometimes splits as two words
  // NOTE: 'ARTIFACT SPECIAL LOOT', 'WILDGATE RESOURCES', 'LUCKY DOCKS' are
  // map POI icon labels (below the modifier list), NOT modifiers — do not add them here.
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

  // Filter words in YOUR SHIP region.
  // Drop very-low-confidence words (icon artefacts) and the far-left icon column (x<5%).
  const regionWords = words.filter(w => {
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
    const foundShip = SHIP_TYPES.find(type => lineText.includes(type));
    if (foundShip) {
      shipType = foundShip.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');

      // Team name may appear before AND/OR after the ship type on the same line
      // (e.g. Tesseract groups "DODGE OUTLAW THE BULLET" all on one line)
      const shipIdx = lineText.indexOf(foundShip);
      const beforeShip = lineText.substring(0, shipIdx).trim();
      const afterShip  = lineText.substring(shipIdx + foundShip.length).trim();
      if (beforeShip.length >= 2) teamNameParts.push(formatTeamName(beforeShip));
      if (afterShip.length >= 2 && looksLikeTeamName(afterShip)) {
        teamNameParts.push(formatTeamName(afterShip));
      }
    } else if (!shipType && lineText.length >= 2 && lineText.length <= 40) {
      // Accumulate team name parts — team names can span multiple words/lines
      if (looksLikeTeamName(lineText)) {
        teamNameParts.push(formatTeamName(lineText));
      }
    }
  }

  const teamName = teamNameParts.join(' ').trim();

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

  const toTitle = (raw) => String(raw || '')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
  const findShipType = (upperText) => {
    let foundShip = SHIP_TYPES.find(type => upperText.includes(type));
    if (foundShip) return foundShip;
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
    if (/KNOWN|HAZARD|FEATURE|ARTIFACT|RESOURCES|WILDGATE|SPECIAL/.test(t)) return true;
    if (/^ENEMY TEAM \d+$/i.test(t)) return true;
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
      const beforeShip = upperText.substring(0, rawShipIdx).trim();
      const afterShip = upperText.substring(rawShipIdx + foundShip.length).trim();
      if (beforeShip.length >= 2) lineTeam = formatTeamName(beforeShip);
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

    const likelyEnemySlot = slotIdx <= 1 || Boolean(foundShip);
    if (likelyEnemySlot && (foundShip || teamName) && !isNoiseTeamLabel(teamName)) {
      enemyShips.push({
        teamName: teamName || `Enemy Team ${enemyShips.length + 1}`,
        shipType: foundShip ? toTitle(foundShip) : 'Unknown',
        color: slotColor,
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
    if (bestIdx >= 0 && bestDist < imageHeight * 0.08) {
      ship.shipType = shipWordCandidates[bestIdx].shipType;
      ship.confidence = Math.max(ship.confidence || 0, 70);
      usedCandidateIdx.add(bestIdx);
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
          shipType: foundShip.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
          color: 'unknown',
          confidence: teamName ? 65 : 50,
        });

        usedLines.add(i);
      }
    }
  }

  return enemyShips.map(({ _slotIndex, _slotCenterY, ...rest }) => rest);
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
    // Anchor hazard search to the "KNOWN HAZARDS" or "HAZARDS" header word.
    // The list position shifts up/down with the number of enemy ship rows,
    // so we cannot use a fixed yMin percentage.
    const rightXMin = imageWidth * layout.HAZARDS.xMin;
    const rightXWords = words.filter(w => {
      if (!w.bbox) return false;
      return (w.bbox.x0 + w.bbox.x1) / 2 >= rightXMin;
    });

    // Find the header Y — look for a word that is "HAZARDS" or "KNOWN"
    let headerY = null;
    for (const w of rightXWords) {
      const t = (w.text || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (t === 'HAZARDS' || t === 'KNOWN') {
        headerY = (w.bbox.y0 + w.bbox.y1) / 2;
        break;
      }
    }

    // If header found, scan below it; otherwise fall back to lower 60% of image
    const scanYMin = headerY != null
      ? headerY                        // start right at the header row itself
      : imageHeight * 0.25;            // generous fallback — catches even at top
    const scanYMax = headerY != null
      ? headerY + imageHeight * 0.40   // ~40% of screen height below header
      : imageHeight * 0.75;

    const regionWords = rightXWords.filter(w => {
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      return cy >= scanYMin && cy <= scanYMax;
    });

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
  // Preserve punctuation valid in team names (!, ?, -, _, ., ')
  return name
    .replace(/[^a-zA-Z0-9_.'\-!? ]/g, '')
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
