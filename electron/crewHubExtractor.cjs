/**
 * Crew Hub Extractor
 *
 * Extracts player and team data from Crew Hub screenshots:
 * - Left Panel: Your team (team name + players)
 * - Right Panel: Enemy crews (up to 4 teams with colored badges)
 *
 * Features:
 * - Dynamic user anchor (activeUser from store)
 * - Color-based team detection
 * - Chinese character support
 * - Position fallback when user not found
 */

const { detectBadgeColorNearText, detectColorInRegion } = require('./colorUtils.cjs');

/**
 * Screen layout constants (percentage-based for scaling)
 */
const LAYOUT = {
  // Left panel: Your team
  LEFT_PANEL: {
    xMin: 0,
    xMax: 0.40, // Left 40%
    yMin: 0.10,
    yMax: 0.80,
  },
  // Right panel: Enemy crews
  RIGHT_PANEL: {
    xMin: 0.55, // Right 45%
    xMax: 1.0,
    yMin: 0.10,
    yMax: 0.90,
  },
  // Team name header region (contains "'s Crew")
  TEAM_HEADER: {
    xMin: 0,
    xMax: 0.45,
    yMin: 0.05,
    yMax: 0.20,
  },
};

/**
 * Noise words to filter out (UI elements)
 */
const NOISE_WORDS = new Set([
  'PARTY', 'VOICE', 'CREW', 'HUB', 'PUSH', 'TALK', 'MUTE', 'OPTIONS', 'BACK',
  'SWITCH', 'DISABLE', 'ENABLE', 'YOUR', 'TEAM', 'CHANGE', 'MAP', 'SEED',
  'ENEMY', 'CREWS', 'CHANNEL', 'INTO', 'SAME', 'WITH', 'THE', 'HOP',
  'HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SHIP',
  'ON', 'OFF', 'TO', 'DODGE', 'BULLET', 'BULLETS',
]);

/**
 * Main entry point: Extract all data from Crew Hub screenshot
 * @param {Buffer} imageBuffer - Preprocessed image buffer
 * @param {string} activeUser - Current user's display name (for anchor)
 * @param {Object} ocrResult - Tesseract OCR result { words, lines, text }
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @param {number} scale - Image scale factor from preprocessing (default 1)
 * @returns {Promise<Object>} Extracted data
 */
async function extractCrewHub(imageBuffer, activeUser, ocrResult, imageWidth, imageHeight, scale = 1) {
  console.log('[CrewHub] Starting extraction, activeUser:', activeUser);

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

  const words = ocrResult.words || [];
  const lines = ocrResult.lines || [];
  const text = ocrResult.text || '';

  if (words.length === 0 && lines.length === 0) {
    console.warn('[CrewHub] No OCR word/line data available');
    return result;
  }

  try {
    // Step 1: Extract your team from left panel
    const yourTeamData = await extractLeftPanel(
      imageBuffer,
      activeUser,
      words,
      lines,
      text,
      imageWidth,
      imageHeight
    );
    result.yourTeam = yourTeamData;

    // Step 2: Extract enemy teams from right panel (pass scale for color detection)
    const enemyTeamsData = await extractRightPanel(
      imageBuffer,
      words,
      lines,
      text,
      imageWidth,
      imageHeight,
      scale
    );
    result.enemyTeams = enemyTeamsData;

    // Step 3: Calculate confidence
    const playerCount = result.yourTeam.players.length +
      result.enemyTeams.reduce((sum, t) => sum + t.players.length, 0);
    result.confidence = Math.min(95, 50 + playerCount * 5);

    // Check if this might be a partial capture (scrolling needed)
    if (result.enemyTeams.length > 0) {
      const maxPlayersPerTeam = Math.max(...result.enemyTeams.map(t => t.players.length));
      if (maxPlayersPerTeam < 4 && result.enemyTeams.some(t => t.players.length < 4)) {
        result.isPartialCapture = true;
      }
    }

    console.log('[CrewHub] Extraction complete:', {
      teamName: result.yourTeam.name,
      teammates: result.yourTeam.players.length,
      enemyTeams: result.enemyTeams.length,
      totalEnemies: result.enemyTeams.reduce((sum, t) => sum + t.players.length, 0),
    });

  } catch (error) {
    console.error('[CrewHub] Extraction failed:', error);
  }

  return result;
}

/**
 * Extract your team data from left panel
 */
async function extractLeftPanel(imageBuffer, activeUser, words, lines, text, imageWidth, imageHeight) {
  console.log('[CrewHub] Extracting left panel (your team)');

  const teamData = {
    name: '',
    players: [],
  };

  // Define left panel bounds
  const leftBounds = {
    xMin: imageWidth * LAYOUT.LEFT_PANEL.xMin,
    xMax: imageWidth * LAYOUT.LEFT_PANEL.xMax,
    yMin: imageHeight * LAYOUT.LEFT_PANEL.yMin,
    yMax: imageHeight * LAYOUT.LEFT_PANEL.yMax,
  };

  // Step 1: Find team name (look for "'s Crew" pattern)
  const teamNameMatch = text.match(/([A-Z][A-Z\s]{2,30})['']s\s*Crew/i);
  if (teamNameMatch) {
    teamData.name = teamNameMatch[1].trim();
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

  // Step 3: Group words into lines by Y position (with X-proximity clustering)
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

  // Step 5: Extract player names
  for (const line of groupedLines) {
    const playerName = extractPlayerNameFromLine(line.words);
    if (!playerName) continue;

    // Validate as player name
    if (!isValidPlayerName(playerName)) continue;

    // Skip team name if it matches
    if (teamData.name && playerName.toUpperCase().includes(teamData.name.toUpperCase())) continue;

    teamData.players.push(playerName);
    console.log('[CrewHub] Found teammate:', playerName);
  }

  // Deduplicate
  teamData.players = [...new Set(teamData.players)];

  return teamData;
}

/**
 * Extract enemy teams from right panel
 * @param {number} scale - Image scale factor from preprocessing (default 1)
 */
async function extractRightPanel(imageBuffer, words, lines, text, imageWidth, imageHeight, scale = 1) {
  console.log('[CrewHub] Extracting right panel (enemy teams)');

  const enemyTeams = [];
  const teamMap = new Map(); // color -> { name, players }

  // Define right panel bounds
  const rightBounds = {
    xMin: imageWidth * LAYOUT.RIGHT_PANEL.xMin,
    xMax: imageWidth * LAYOUT.RIGHT_PANEL.xMax,
    yMin: imageHeight * LAYOUT.RIGHT_PANEL.yMin,
    yMax: imageHeight * LAYOUT.RIGHT_PANEL.yMax,
  };

  // Filter words in right panel
  const rightPanelWords = words.filter(w => {
    if (!w.bbox) return false;
    const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    return centerX >= rightBounds.xMin && centerX <= rightBounds.xMax &&
           centerY >= rightBounds.yMin && centerY <= rightBounds.yMax;
  });

  console.log('[CrewHub] Right panel words:', rightPanelWords.length);

  // Group into lines (with X-proximity clustering)
  const groupedLines = groupWordsIntoLines(rightPanelWords, imageHeight, imageWidth);

  // Process each line, detecting team badge colors
  let currentTeamColor = 'unknown';
  let currentTeamName = '';

  console.log('[CrewHub] Processing', groupedLines.length, 'lines in right panel');

  for (const line of groupedLines) {
    const lineText = line.words.map(w => w.text).join(' ').trim();
    const firstWord = line.words[0];

    console.log('[CrewHub] Line:', lineText.substring(0, 50), '| words:', line.words.length);

    // Try to detect badge color for this line
    if (firstWord && firstWord.bbox && imageBuffer) {
      try {
        // FIXED: Pass actual scale from preprocessing instead of hardcoded 1
        const colorResult = await detectBadgeColorNearText(imageBuffer, firstWord.bbox, scale);
        if (colorResult.color !== 'unknown' && colorResult.confidence > 40) {
          currentTeamColor = colorResult.color;
          console.log('[CrewHub] Detected team color:', currentTeamColor, 'for line:', lineText.substring(0, 30));
        }
      } catch (e) {
        // Color detection failed, continue with current color
      }
    }

    // Check if this line is a team name (all caps, multiple words, no numbers)
    if (isTeamName(lineText)) {
      currentTeamName = lineText;
      console.log('[CrewHub] Found team name:', currentTeamName, 'color:', currentTeamColor);

      // Initialize team in map if not exists
      const teamKey = currentTeamColor !== 'unknown' ? currentTeamColor : currentTeamName;
      if (!teamMap.has(teamKey)) {
        teamMap.set(teamKey, {
          name: currentTeamName,
          color: currentTeamColor,
          players: [],
          confidence: 70,
        });
      } else {
        // Update team name if we found a better one
        teamMap.get(teamKey).name = currentTeamName;
      }
      continue;
    }

    // Try to extract player name
    const playerName = extractPlayerNameFromLine(line.words);
    if (!playerName) {
      console.log('[CrewHub]   -> No player name extracted');
      continue;
    }

    // Validate as player name
    if (!isValidPlayerName(playerName)) {
      console.log('[CrewHub]   -> Invalid player name:', playerName);
      continue;
    }

    // Skip if it looks like a team name
    if (isTeamName(playerName)) {
      console.log('[CrewHub]   -> Looks like team name:', playerName);
      continue;
    }

    // Add to current team
    const teamKey = currentTeamColor !== 'unknown' ? currentTeamColor : currentTeamName || 'unknown';
    if (!teamMap.has(teamKey)) {
      teamMap.set(teamKey, {
        name: currentTeamName || `Team ${teamMap.size + 1}`,
        color: currentTeamColor,
        players: [],
        confidence: 60,
      });
    }

    teamMap.get(teamKey).players.push(playerName);
    console.log('[CrewHub] Found enemy player:', playerName, 'team:', teamKey);
  }

  // Convert map to array (up to 4 teams)
  for (const [, team] of teamMap) {
    if (team.players.length > 0) {
      // Deduplicate players
      team.players = [...new Set(team.players)];
      enemyTeams.push(team);
    }
  }

  // Sort by player count (most players first) and limit to 4 teams
  enemyTeams.sort((a, b) => b.players.length - a.players.length);
  if (enemyTeams.length > 4) {
    console.warn('[CrewHub] More than 4 enemy teams detected, keeping top 4');
    return enemyTeams.slice(0, 4);
  }

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

    // Skip platform indicators at end
    if (/^[XPCD]$/i.test(text) && validParts.length > 0) continue;

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
    .replace(/[.,:;!?'"]/g, '')
    .replace(/\\/g, '')      // Backslashes
    .replace(/[|]/g, '')     // Pipes
    .replace(/[~#%&*^]/g, '') // Common OCR noise symbols
    // Remove trailing platform indicators
    .replace(/\s*[XPCD]$/i, '')
    // Remove common OCR prefixes/suffixes
    .replace(/^[A-Z]{1,3}(?=[A-Z][a-z])/g, '') // Remove short caps prefix before CamelCase (e.g., "GNAlixThus" -> "AlixThus")
    .replace(/[=\-]+$/g, '') // Remove trailing = or - (e.g., "oSalad=" -> "oSalad")
    .replace(/^[=\-]+/g, '') // Remove leading = or -
    // Clean edges (allow Latin, extended Latin, Cyrillic, CJK, numbers, underscore)
    .replace(/^[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+/, '')
    .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]+$/, '')
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

/**
 * Check if text looks like a team name (not a player name)
 */
function isTeamName(text) {
  if (!text || text.length < 4 || text.length > 30) return false;

  // Team names are typically:
  // - All uppercase
  // - Multiple words
  // - No numbers
  // - No underscores

  const isAllCaps = text === text.toUpperCase();
  const hasMultipleWords = text.trim().split(/\s+/).length > 1;
  const hasNumbers = /[0-9]/.test(text);
  const hasUnderscore = /_/.test(text);

  return isAllCaps && hasMultipleWords && !hasNumbers && !hasUnderscore;
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
  extractRightPanel,
  groupWordsIntoLines,
  extractPlayerNameFromLine,
  cleanupPlayerName,
  isValidPlayerName,
  isTeamName,
  fuzzyMatchName,
  levenshteinDistance,
  scoreAsPlayerName,
};
