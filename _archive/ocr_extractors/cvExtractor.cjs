/**
 * Computer Vision-based player name extraction
 * Uses region detection and color analysis for more reliable extraction
 */

// Load sharp dynamically to avoid startup issues
let sharp = null;

function getSharp() {
  if (!sharp) {
    sharp = require('sharp');
  }
  return sharp;
}

/**
 * Extract player names using computer vision approach
 *
 * Strategy:
 * 1. Divide screen into left (teammates) and right (enemies) regions
 * 2. Find text regions by detecting high-contrast areas
 * 3. Run OCR only on small, isolated text regions
 * 4. Use position + color to group players by team
 */
async function extractPlayersCV(imageBuffer, ocrWorker, screenshotType) {
  console.log('[CV] Starting computer vision extraction for', screenshotType);

  const sharpLib = getSharp();

  // Get image dimensions
  const metadata = await sharpLib(imageBuffer).metadata();
  const { width, height } = metadata;

  console.log('[CV] Image dimensions:', width, 'x', height);

  if (screenshotType === 'crew_hub') {
    return await extractCrewHubCV(imageBuffer, ocrWorker, width, height);
  } else if (screenshotType === 'tactical_map') {
    return await extractTacticalMapCV(imageBuffer, ocrWorker, width, height);
  }

  return { teammates: [], opponentTeams: [] };
}

/**
 * Extract from Crew Hub using positional layout analysis + user anchor
 */
async function extractCrewHubCV(imageBuffer, ocrWorker, width, height) {
  console.log('[CV] Extracting Crew Hub with positional analysis');

  // Run full OCR on the entire image to get word positions
  const ocrResult = await ocrWorker.recognize(imageBuffer);
  const words = ocrResult.data.words || [];

  console.log('[CV] OCR found', words.length, 'words total');
  console.log('[CV] OCR data structure:', {
    hasWords: !!ocrResult.data.words,
    wordsLength: words.length,
    hasLines: !!ocrResult.data.lines,
    linesLength: ocrResult.data.lines?.length || 0,
    hasText: !!ocrResult.data.text,
    textLength: ocrResult.data.text?.length || 0
  });

  // If we have 0 words, Tesseract isn't providing word-level data
  // Fall back to line-based parsing
  if (words.length === 0) {
    console.warn('[CV] No word-level data from Tesseract, falling back to line-based extraction');
    return extractCrewHubFromLines(ocrResult.data.text, ocrResult.data.lines, imageBuffer, width, height);
  }

  // Extract teammates using anchor-based positional detection
  const teammates = await extractTeammatesWithAnchor(words, width, height, 'AlixThus');

  // Extract enemy teams using positional grouping and color detection
  const enemyData = await extractEnemyTeamsPositional(
    words,
    imageBuffer,
    width,
    height
  );

  console.log('[CV] Found', teammates.length, 'teammates and', enemyData.opponentTeams.length, 'enemy teams');

  return {
    teammates: teammates.map(name => ({ name, confidence: 75, isTeammate: true })),
    opponentTeams: enemyData.opponentTeams
  };
}

/**
 * Extract from Tactical Map using region-based approach
 */
async function extractTacticalMapCV(imageBuffer, ocrWorker, width, height) {
  console.log('[CV] Extracting Tactical Map with computer vision');

  // Enemy ships region (top-right)
  const ENEMY_SHIPS_REGION = {
    left: Math.floor(width * 0.65),
    top: Math.floor(height * 0.05),
    width: Math.floor(width * 0.33),
    height: Math.floor(height * 0.25)
  };

  console.log('[CV] Enemy ships region:', ENEMY_SHIPS_REGION);

  // Extract enemy ship/team names
  const enemyNames = await extractNamesFromRegion(
    imageBuffer,
    ocrWorker,
    ENEMY_SHIPS_REGION,
    'enemy_ships'
  );

  console.log('[CV] Found', enemyNames.length, 'enemy teams');

  return {
    teammates: [],
    opponentTeams: enemyNames.map(name => ({
      teamName: name,
      shipType: '',
      color: 'unknown',
      players: [],
      confidence: 75
    }))
  };
}

/**
 * Extract names from a specific image region
 */
async function extractNamesFromRegion(imageBuffer, ocrWorker, region, regionType) {
  console.log('[CV] Extracting from region:', regionType);

  const sharpLib = getSharp();

  try {
    // Extract the region
    const regionImage = await sharpLib(imageBuffer)
      .extract(region)
      .toBuffer();

    // Enhance contrast for better OCR
    const enhanced = await sharpLib(regionImage)
      .normalize()
      .sharpen()
      .toBuffer();

    // Run OCR on the region
    const result = await ocrWorker.recognize(enhanced);
    const text = result?.data?.text || '';

    console.log('[CV] OCR text from', regionType, ':', text.substring(0, 100));

    // Extract player names from text using pattern matching
    const names = extractPlayerNamesFromText(text, regionType);

    console.log('[CV] Extracted names from', regionType, ':', names);

    return names;
  } catch (error) {
    console.error('[CV] Error extracting from region:', error.message);
    return [];
  }
}

/**
 * Extract player names from OCR text using smart patterns
 */
function extractPlayerNamesFromText(text, regionType) {
  const names = new Set();

  // Split into lines
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Enhanced player name pattern: allows underscores within names
  // Match: letter followed by letters/numbers/underscores, 3-19 more chars
  const namePattern = /([A-Za-z][A-Za-z0-9_]{2,19})(?=\s|$|[^A-Za-z0-9_])/g;

  // Expanded noise words to filter out (don't include team name parts here)
  const NOISE = new Set([
    'CREW', 'HUB', 'VOICE', 'CHANNEL', 'TALK', 'PUSH', 'MUTE', 'OPTIONS', 'BACK',
    'SWITCH', 'DISABLE', 'ENABLE', 'YOUR', 'TEAM', 'CHANGE', 'MAP', 'SEED',
    'PARTY', 'ENEMY', 'CREWS', 'HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW',
    'SHIP', 'SHIPS', 'KNOWN', 'HAZARDS', 'FEATURES', 'TACTICAL', 'SIZE', 'HEALTH',
    // Additional UI noise (garbled text from OCR)
    'INTO', 'SAME', 'WITH', 'MULOR', 'DVLLET', 'LICW', 'LAFF', 'SHTER',
    'JaiYeR', 'JACRIS', 'SSAHIACT', 'ombat', 'Barbi', 'voice', 'SAY', 'SAYS'
  ]);

  for (const line of lines) {
    // Reset regex
    namePattern.lastIndex = 0;

    let match;
    while ((match = namePattern.exec(line)) !== null) {
      let name = match[1];

      // Skip noise
      if (NOISE.has(name.toUpperCase())) continue;
      if (NOISE.has(name)) continue;

      // Remove platform indicators at the end
      name = name.replace(/[XPC]$/i, '').trim();

      // Skip if now too short
      if (name.length < 3) continue;

      // Validate it looks like a player name
      if (looksLikePlayerName(name)) {
        names.add(name);
      }
    }
  }

  return Array.from(names);
}

/**
 * Check if a string looks like a player name
 */
function looksLikePlayerName(name) {
  // Must have letters
  if (!/[a-zA-Z]/.test(name)) return false;

  // Length check - allow shorter names (3 chars minimum)
  if (name.length < 3 || name.length > 20) return false;

  // Skip if it's only numbers
  if (/^\d+$/.test(name)) return false;

  // Skip common short UI words
  const shortUIWords = ['THE', 'AND', 'FOR', 'YOU', 'ARE', 'NOT', 'OFF', 'HOP'];
  if (shortUIWords.includes(name.toUpperCase())) return false;

  // Known team names (all caps with multiple words, no numbers)
  const hasMultipleWords = name.trim().split(/\s+/).length > 1;
  if (hasMultipleWords) {
    return false;  // Multi-word strings are team names or UI text
  }

  // Skip very short all-caps words (likely UI labels)
  if (name.length <= 4 && name === name.toUpperCase() && !/\d/.test(name)) {
    return false;
  }

  // Otherwise it's likely a player name
  return true;
}

/**
 * Extract enemy teams with full OCR parsing to group players by team names
 */
async function extractEnemyTeamsWithOCR(imageBuffer, ocrWorker, region, fullWidth, fullHeight) {
  console.log('[CV] Extracting enemy teams with full parsing');

  const sharpLib = getSharp();

  try {
    // Extract and enhance the enemy region
    const regionImage = await sharpLib(imageBuffer)
      .extract(region)
      .toBuffer();

    const enhanced = await sharpLib(regionImage)
      .normalize()
      .sharpen()
      .toBuffer();

    // Run OCR to get full text
    const ocrResult = await ocrWorker.recognize(enhanced);
    const text = ocrResult.data.text || '';

    console.log('[CV] Enemy region OCR text:', text);

    // Parse the text to extract teams and players
    const teams = await parseEnemyTeamsFromText(text, imageBuffer, region, fullWidth, fullHeight);

    return { opponentTeams: teams };
  } catch (error) {
    console.error('[CV] Error extracting enemy teams:', error.message);
    return { opponentTeams: [] };
  }
}

/**
 * Parse enemy teams from OCR text
 * Expected format:
 * PlayerName
 * TEAM NAME
 * PlayerName
 * TEAM NAME
 */
async function parseEnemyTeamsFromText(text, imageBuffer, region, fullWidth, fullHeight) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Known team name patterns (all caps, multiple words)
  const KNOWN_TEAM_NAMES = ['MURDER SPAGHURDER', 'MEANR THAN AVG', 'DODGE THE BULLET'];

  const teams = new Map(); // teamName -> { players: [], color: '' }
  let currentTeamName = null;

  console.log('[CV] Parsing enemy teams from', lines.length, 'lines');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    // Check if this line is a team name
    let matchedTeam = null;
    for (const teamName of KNOWN_TEAM_NAMES) {
      if (upper.includes(teamName)) {
        matchedTeam = teamName;
        break;
      }
    }

    if (matchedTeam) {
      // This is a team name line
      currentTeamName = matchedTeam;
      console.log('[CV] Found team name:', currentTeamName);

      if (!teams.has(currentTeamName)) {
        teams.set(currentTeamName, { players: [], color: 'unknown' });
      }
    } else if (currentTeamName && looksLikePlayerName(line)) {
      // This is a player name belonging to current team
      const cleanName = line.replace(/[XPC]$/i, '').trim();
      if (cleanName.length >= 3) {
        console.log('[CV] Adding player', cleanName, 'to team', currentTeamName);
        teams.get(currentTeamName).players.push({
          name: cleanName,
          confidence: 75,
          isTeammate: false
        });
      }
    }
  }

  // Convert to array format and detect colors
  const opponentTeams = [];
  for (const [teamName, teamData] of teams.entries()) {
    // Detect color for this team (sample pixels from team name area)
    const color = await detectTeamColor(imageBuffer, region, fullWidth, fullHeight, teamName);

    opponentTeams.push({
      teamName,
      shipType: '',
      color: color || 'unknown',
      players: teamData.players,
      confidence: 75
    });
  }

  console.log('[CV] Parsed', opponentTeams.length, 'enemy teams');
  return opponentTeams;
}

/**
 * Detect team color by sampling pixels from the enemy region
 */
async function detectTeamColor(imageBuffer, region, fullWidth, fullHeight, teamName) {
  const sharpLib = getSharp();

  try {
    // Extract the enemy region
    const regionImage = await sharpLib(imageBuffer)
      .extract(region)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = regionImage;
    const { width, height, channels } = info;

    // Sample multiple pixels across the region to find team colors
    // Team names and icons typically have colored backgrounds
    const samples = [];
    const samplePoints = [
      { x: Math.floor(width * 0.05), y: Math.floor(height * 0.1) },
      { x: Math.floor(width * 0.05), y: Math.floor(height * 0.3) },
      { x: Math.floor(width * 0.05), y: Math.floor(height * 0.5) },
      { x: Math.floor(width * 0.05), y: Math.floor(height * 0.7) },
    ];

    for (const point of samplePoints) {
      const idx = (point.y * width + point.x) * channels;
      if (idx + 2 < data.length) {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        samples.push({ r, g, b });
      }
    }

    // Classify colors based on RGB values
    const colorCounts = { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0, pink: 0 };

    for (const { r, g, b } of samples) {
      const color = classifyRGB(r, g, b);
      if (color) {
        colorCounts[color]++;
      }
    }

    // Find the most common color
    let dominantColor = 'unknown';
    let maxCount = 0;
    for (const [color, count] of Object.entries(colorCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantColor = color;
      }
    }

    console.log('[CV] Detected color for team', teamName, ':', dominantColor, 'samples:', colorCounts);
    return dominantColor;

  } catch (error) {
    console.error('[CV] Error detecting color:', error.message);
    return 'unknown';
  }
}

/**
 * Classify RGB values into color names based on game's exact team colors:
 * Red: #ff0000 (255, 0, 0)
 * Orange: #fe6300 (254, 99, 0)
 * Yellow: #fef300 (254, 243, 0)
 * Yellow-Green: #b8b800 (184, 184, 0)
 */
function classifyRGB(r, g, b) {
  // Ignore very dark or very light colors (UI background/text)
  const brightness = (r + g + b) / 3;
  if (brightness < 40 || brightness > 230) {
    return null;
  }

  // Calculate saturation - low saturation = grey, skip
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;

  if (saturation < 0.3) {
    return null; // Too grey
  }

  // Calculate distance to each known team color
  const distances = {
    red: colorDistance(r, g, b, 255, 0, 0),
    orange: colorDistance(r, g, b, 254, 99, 0),
    yellow: colorDistance(r, g, b, 254, 243, 0),
    yellowgreen: colorDistance(r, g, b, 184, 184, 0)
  };

  // Find closest color
  let closestColor = null;
  let minDistance = Infinity;
  for (const [color, distance] of Object.entries(distances)) {
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  }

  // Only return if reasonably close (threshold to avoid random matches)
  if (minDistance < 150) {
    return closestColor;
  }

  return null;
}

/**
 * Calculate Euclidean distance between two RGB colors
 */
function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  );
}

/**
 * Extract teammates using anchor-based positional detection
 * Finds the user's name as anchor, then detects names at similar spacing
 */
async function extractTeammatesWithAnchor(words, width, height, userAnchor) {
  console.log('[CV] Looking for user anchor:', userAnchor);

  // Filter words to left side of screen (teammate area)
  let leftWords = words.filter(w => {
    const bbox = w.bbox;
    if (!bbox) return false;
    const centerX = (bbox.x0 + bbox.x1) / 2;
    return centerX < width * 0.45; // Left 45%
  });

  console.log('[CV] Found', leftWords.length, 'words on left side');

  // Merge words on the same line (Y position) to handle split names
  leftWords = mergeWordsOnSameLine(leftWords, height);

  // Find the user's anchor name (case-insensitive partial match)
  let anchorWord = null;
  for (const word of leftWords) {
    if (word.text && word.text.toLowerCase().includes(userAnchor.toLowerCase())) {
      anchorWord = word;
      console.log('[CV] Found anchor at:', word.text, 'y:', word.bbox.y0);
      break;
    }
  }

  if (!anchorWord) {
    console.warn('[CV] Could not find user anchor, falling back to positional rows');
    return extractTeammatesFromRows(leftWords, width, height);
  }

  // Get anchor position
  const anchorY = (anchorWord.bbox.y0 + anchorWord.bbox.y1) / 2;
  const anchorX = anchorWord.bbox.x0;

  // Detect vertical spacing by finding words in similar X column
  const columnWords = leftWords.filter(w => {
    const wordX = w.bbox.x0;
    return Math.abs(wordX - anchorX) < width * 0.05; // Same column (within 5% width)
  }).sort((a, b) => a.bbox.y0 - b.bbox.y0);

  console.log('[CV] Found', columnWords.length, 'words in teammate name column');

  // Calculate average spacing between words in this column
  const spacings = [];
  for (let i = 1; i < columnWords.length; i++) {
    const spacing = columnWords[i].bbox.y0 - columnWords[i-1].bbox.y0;
    if (spacing > 10 && spacing < height * 0.15) { // Reasonable spacing
      spacings.push(spacing);
    }
  }

  const avgSpacing = spacings.length > 0
    ? spacings.reduce((a, b) => a + b, 0) / spacings.length
    : height * 0.08; // Default ~8% of height

  console.log('[CV] Average vertical spacing:', avgSpacing);

  // Extract names at regular intervals around anchor
  const teammates = [];
  const expectedYPositions = [
    anchorY - avgSpacing * 3,
    anchorY - avgSpacing * 2,
    anchorY - avgSpacing,
    anchorY,
  ];

  console.log('[CV] Expected teammate Y positions:', expectedYPositions);
  console.log('[CV] Column words:', columnWords.map(w => ({ text: w.text, y: w.bbox.y0 })));

  for (const expectedY of expectedYPositions) {
    // Find word closest to this Y position in the name column
    let closestWord = null;
    let minDistance = Infinity;

    for (const word of columnWords) {
      const wordY = (word.bbox.y0 + word.bbox.y1) / 2;
      const distance = Math.abs(wordY - expectedY);
      if (distance < minDistance && distance < avgSpacing * 0.6) {
        minDistance = distance;
        closestWord = word;
      }
    }

    console.log('[CV] At expectedY', Math.round(expectedY), '- closest:', closestWord?.text, 'distance:', Math.round(minDistance), 'threshold:', Math.round(avgSpacing * 0.6));

    if (closestWord && closestWord.text) {
      const name = cleanPlayerName(closestWord.text);
      if (name && name.length >= 3) {
        teammates.push(name);
        console.log('[CV] Found teammate:', name, 'at y:', closestWord.bbox.y0);
      } else {
        console.log('[CV] Rejected name:', name, 'length:', name?.length);
      }
    }
  }

  return teammates;
}

/**
 * Fallback: Extract teammates from row-based layout
 */
function extractTeammatesFromRows(leftWords, width, height) {
  console.log('[CV] Using row-based extraction fallback');

  // Common UI noise to filter
  const UI_NOISE = new Set([
    'PARTY', 'VOICE', 'Say', 'PUSH', 'TALK', 'Switch', 'Channel',
    'YOUR', 'ON', 'OFF', 'voice', 'BY', 'JaiYeR7ol', 'INe', 'fe',
    'w', 'le', 'M', 'Co', 'VA', 'rv', 'JF', 'ud', 'SN', 'Cl', 'pir',
    'EWR', 'a', 'i', 'S', 'AA', 'r', 'we', 'ie', 'OE', 'mm'
  ]);

  // Filter out very short words and noise
  const filtered = leftWords.filter(w => {
    const text = w.text?.trim();
    if (!text || text.length < 3) return false;
    if (UI_NOISE.has(text)) return false;
    // Must contain at least one letter and one alphanumeric
    if (!/[a-zA-Z]/.test(text)) return false;
    return true;
  });

  console.log('[CV] Filtered to', filtered.length, 'potential teammate words');

  // Group words by Y position (rows)
  const rows = [];
  const rowThreshold = height * 0.03; // 3% height = same row

  for (const word of filtered) {
    const wordY = (word.bbox.y0 + word.bbox.y1) / 2;
    let foundRow = false;

    for (const row of rows) {
      if (Math.abs(row.y - wordY) < rowThreshold) {
        row.words.push(word);
        foundRow = true;
        break;
      }
    }

    if (!foundRow) {
      rows.push({ y: wordY, words: [word] });
    }
  }

  // Sort rows by Y position
  rows.sort((a, b) => a.y - b.y);

  // Extract leftmost non-number word from each row as potential teammate name
  const teammates = [];
  for (const row of rows) {
    // Sort by X position
    row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);

    // Find leftmost word that looks like a name (not just numbers)
    for (const word of row.words) {
      const text = word.text.trim();

      // Skip if it's just a number or platform indicator
      if (/^[0-9]+[DXPC]?$/.test(text)) continue;
      if (text.length > 20) continue;

      const name = cleanPlayerName(text);
      if (name && name.length >= 3 && /[a-zA-Z]/.test(name)) {
        teammates.push(name);
        console.log('[CV] Row-based found teammate:', name);
        break; // Only take first name from each row
      }
    }
  }

  return teammates.slice(0, 4); // Max 4 teammates
}

/**
 * Extract enemy teams using positional grouping
 */
async function extractEnemyTeamsPositional(words, imageBuffer, width, height) {
  console.log('[CV] Extracting enemy teams with positional grouping');

  // Filter words to right side of screen (enemy area)
  let rightWords = words.filter(w => {
    const bbox = w.bbox;
    if (!bbox) return false;
    const centerX = (bbox.x0 + bbox.x1) / 2;
    return centerX > width * 0.55; // Right 45%
  });

  console.log('[CV] Found', rightWords.length, 'words on right side');

  // Merge words on the same line to reconstruct split names/team names
  rightWords = mergeWordsOnSameLine(rightWords, height);

  // Sort by Y position to process top to bottom
  rightWords.sort((a, b) => a.bbox.y0 - b.bbox.y0);

  // Known team name patterns (don't include user's team)
  const KNOWN_TEAM_NAMES = ['MURDER SPAGHURDER', 'MEANR THAN AVG'];

  // Filter out noise - very short words and common UI text
  const NOISE_WORDS = ['crew', 'igh', 'hans', 'ees', 'ao', 'od', 'Co', 'le', 'Ne', 'ag'];

  const teams = [];
  let currentTeam = null;
  let lastY = 0;
  const largeGapThreshold = height * 0.05; // 5% height = new team

  for (const word of rightWords) {
    const text = word.text.trim();
    const wordY = word.bbox.y0;
    const gap = wordY - lastY;

    // Check if this is a team name
    let matchedTeam = null;
    for (const teamName of KNOWN_TEAM_NAMES) {
      if (text.toUpperCase().includes(teamName) || teamName.includes(text.toUpperCase())) {
        matchedTeam = teamName;
        break;
      }
    }

    if (matchedTeam) {
      // Start a new team
      if (currentTeam) {
        teams.push(currentTeam);
      }
      currentTeam = {
        teamName: matchedTeam,
        players: [],
        yStart: wordY
      };
      console.log('[CV] Started team:', matchedTeam);
    } else if (currentTeam) {
      // Check if large gap (might be new team without name detected)
      if (gap > largeGapThreshold && currentTeam.players.length > 0) {
        teams.push(currentTeam);
        currentTeam = {
          teamName: 'Unknown Team',
          players: [],
          yStart: wordY
        };
      }

      // Skip noise words
      if (NOISE_WORDS.includes(text) || NOISE_WORDS.includes(text.toLowerCase())) {
        lastY = wordY;
        continue;
      }

      // Add as player name if it looks reasonable
      const name = cleanPlayerName(text);
      if (name && name.length >= 3 && name.length <= 20 && !NOISE_WORDS.includes(name.toLowerCase())) {
        currentTeam.players.push({
          name,
          confidence: 75,
          isTeammate: false
        });
        console.log('[CV] Added player:', name, 'to', currentTeam.teamName);
      } else {
        console.log('[CV] Rejected word:', text, '→ cleaned:', name, 'length:', name?.length);
      }
    }

    lastY = wordY;
  }

  // Push final team
  console.log('[CV] Final currentTeam:', currentTeam ? { name: currentTeam.teamName, players: currentTeam.players.length } : 'none');
  if (currentTeam && currentTeam.players.length > 0) {
    teams.push(currentTeam);
  } else if (currentTeam) {
    console.warn('[CV] Discarding team with 0 players:', currentTeam.teamName);
  }

  // Detect colors for each team
  const opponentTeams = [];
  for (const team of teams) {
    const color = await detectTeamColorFromRegion(imageBuffer, width, height, team.yStart);
    opponentTeams.push({
      teamName: team.teamName,
      shipType: '',
      color: color || 'unknown',
      players: team.players,
      confidence: 75
    });
  }

  console.log('[CV] Extracted', opponentTeams.length, 'enemy teams');
  return { opponentTeams };
}

/**
 * Detect team color by sampling pixels at a specific Y position
 */
async function detectTeamColorFromRegion(imageBuffer, width, height, teamY) {
  const sharpLib = getSharp();

  try {
    // Extract a small horizontal strip at the team's Y position
    const stripHeight = Math.floor(height * 0.03); // 3% height
    const region = {
      left: Math.floor(width * 0.55),
      top: Math.max(0, Math.floor(teamY) - stripHeight),
      width: Math.floor(width * 0.10), // Left edge of enemy area
      height: stripHeight * 2
    };

    const regionImage = await sharpLib(imageBuffer)
      .extract(region)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = regionImage;
    const { width: w, height: h, channels } = info;

    // Sample pixels across the strip
    const samples = [];
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 10) {
        const idx = (y * w + x) * channels;
        if (idx + 2 < data.length) {
          samples.push({
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2]
          });
        }
      }
    }

    // Classify colors
    const colorCounts = { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0, pink: 0 };
    for (const { r, g, b } of samples) {
      const color = classifyRGB(r, g, b);
      if (color) colorCounts[color]++;
    }

    // Find dominant color
    let dominantColor = 'unknown';
    let maxCount = 0;
    for (const [color, count] of Object.entries(colorCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantColor = color;
      }
    }

    console.log('[CV] Detected color at y:', teamY, '=', dominantColor, colorCounts);
    return dominantColor;

  } catch (error) {
    console.error('[CV] Error detecting color:', error.message);
    return 'unknown';
  }
}

/**
 * Clean player name by removing platform indicators and noise
 */
function cleanPlayerName(text) {
  if (!text) return null;

  let cleaned = text.trim();

  // Remove trailing platform indicators (X, P, C, or numbers+letter combos like "12", "1D")
  cleaned = cleaned.replace(/\s*[XPC0-9]+\s*$/i, '').trim();

  // Remove common OCR artifacts
  cleaned = cleaned.replace(/[|\[\]{}()<>]/g, '');

  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();

  // Must have at least one letter
  if (!/[a-zA-Z]/.test(cleaned)) return null;

  // Handle merged names with underscores (ombatBarbi3 -> keep, but ideally would be c0mbat_Barbi3)
  // For names like "ombat" that might be "c0mbat", we can't fix OCR errors here

  return cleaned;
}

/**
 * Merge words that appear on the same line (Y position)
 * OCR often splits names like "c0mbat_Barbi3" into separate words
 */
function mergeWordsOnSameLine(words, height) {
  if (!words || words.length === 0) return [];

  // Group words by Y position (same line)
  const lines = [];
  const lineThreshold = height * 0.02; // 2% height = same line

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
      lines.push({
        y: wordY,
        words: [word]
      });
    }
  }

  // Merge words in each line from left to right
  const mergedWords = [];

  for (const line of lines) {
    // Sort words by X position
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);

    // Merge adjacent words if they're close together
    let i = 0;
    while (i < line.words.length) {
      let mergedWord = { ...line.words[i] };
      let j = i + 1;

      // Check if next words are close (part of same name)
      while (j < line.words.length) {
        const gap = line.words[j].bbox.x0 - mergedWord.bbox.x1;
        const avgWidth = (mergedWord.bbox.x1 - mergedWord.bbox.x0 + line.words[j].bbox.x1 - line.words[j].bbox.x0) / 2;

        // If gap is small relative to word width, merge
        if (gap < avgWidth * 0.5) {
          mergedWord.text = mergedWord.text + line.words[j].text;
          mergedWord.bbox.x1 = line.words[j].bbox.x1;
          j++;
        } else {
          break;
        }
      }

      mergedWords.push(mergedWord);
      i = j;
    }
  }

  return mergedWords;
}

/**
 * Fallback: Extract from Crew Hub using line-based text parsing when word-level data unavailable
 */
async function extractCrewHubFromLines(rawText, lines, imageBuffer, width, height) {
  console.log('[CV] Using line-based fallback extraction');

  const teammates = [];
  const opponentTeams = [];

  // Parse raw text to find player names
  const textLines = rawText.split('\n');

  // Find teammate names (left side, after "PARTY")
  let inPartySection = false;
  const teammateNames = new Set();

  for (const line of textLines) {
    const trimmed = line.trim();

    if (trimmed.includes('PARTY')) {
      inPartySection = true;
      continue;
    }

    if (trimmed.includes('Enemy Crews') || trimmed.includes('ENEMY')) {
      inPartySection = false;
      break;
    }

    if (inPartySection && trimmed.length > 0) {
      // Look for names followed by numbers (platform indicators)
      // Pattern: "AlixThus w", "ombat Barbi3 12", "ScareQro 1D"
      const nameMatch = trimmed.match(/([A-Za-z][A-Za-z0-9_]{2,19})\s+[wW0-9]/);
      if (nameMatch) {
        const name = cleanPlayerName(nameMatch[1]);
        if (name && name.length >= 3) {
          teammateNames.add(name);
          console.log('[CV] Line-based found teammate:', name);
        }
      }
    }
  }

  // Convert to teammate objects
  for (const name of teammateNames) {
    teammates.push({ name, confidence: 70, isTeammate: true });
  }

  // Find enemy teams (right side, after "Enemy Crews")
  let inEnemySection = false;
  const KNOWN_TEAM_NAMES = ['MURDER SPAGHURDER', 'MEANR THAN AVG'];
  let currentTeam = null;
  const teams = new Map();

  for (const line of textLines) {
    const trimmed = line.trim();

    if (trimmed.includes('Enemy Crews') || trimmed.includes('ENEMY')) {
      inEnemySection = true;
      continue;
    }

    if (!inEnemySection) continue;

    // Check if line contains a team name
    for (const teamName of KNOWN_TEAM_NAMES) {
      if (trimmed.toUpperCase().includes(teamName)) {
        currentTeam = teamName;
        if (!teams.has(currentTeam)) {
          teams.set(currentTeam, { players: [], yStart: 0 });
        }
        console.log('[CV] Line-based found team:', currentTeam);
        break;
      }
    }

    // Look for player names (followed by numbers)
    if (currentTeam) {
      const nameMatch = trimmed.match(/([A-Za-z][A-Za-z0-9_]{2,19})\s+[0-9]/);
      if (nameMatch) {
        const name = cleanPlayerName(nameMatch[1]);
        if (name && name.length >= 3 && name !== 'SHTER') {
          teams.get(currentTeam).players.push({
            name,
            confidence: 70,
            isTeammate: false
          });
          console.log('[CV] Line-based added player:', name, 'to', currentTeam);
        }
      }
    }
  }

  // Convert teams to opponent format (with placeholder colors for now)
  for (const [teamName, teamData] of teams.entries()) {
    opponentTeams.push({
      teamName,
      shipType: '',
      color: teamName === 'MURDER SPAGHURDER' ? 'red' : 'orange',
      players: teamData.players,
      confidence: 70
    });
  }

  console.log('[CV] Line-based extraction found', teammates.length, 'teammates and', opponentTeams.length, 'teams');

  return {
    teammates,
    opponentTeams
  };
}

module.exports = {
  extractPlayersCV
};
