/**
 * Accurate OCR Extractor - Built from actual game screenshots
 *
 * CREW HUB LAYOUT:
 * - Left side (0-45% width): Party members with names + platform icons
 * - Right side (55-100% width): Enemy crews with colored badges + names
 * - Team names appear as colored badges (MURDER SPAGHURDER = red, MEANR THAN AVG = orange)
 *
 * TACTICAL MAP LAYOUT:
 * - Top right: ENEMY SHIPS section with team badges
 */

/**
 * Extract from Crew Hub using precise spatial layout
 */
async function extractCrewHubAccurate(ocrResult, imageBuffer, width, height) {
  console.log('[ACCURATE] Extracting from Crew Hub');

  // Safety checks for OCR result structure
  if (!ocrResult) {
    console.error('[ACCURATE] Invalid OCR result - null or undefined');
    return { teammates: [], opponentTeams: [] };
  }

  // OCR result can be either { data: { words, text } } or { words, text } directly
  const data = ocrResult.data || ocrResult;
  const words = data.words || [];
  const text = data.text || '';

  console.log('[ACCURATE] OCR data available:', {
    hasWords: !!words,
    wordCount: words.length,
    hasText: !!text,
    textLength: text.length
  });

  if (words.length === 0) {
    console.warn('[ACCURATE] No word data, falling back to text parsing');
    return extractFromTextOnly(text);
  }

  const teammates = [];
  const enemyPlayers = [];

  // Known team names and their colors
  const TEAM_INFO = {
    'MURDER SPAGHURDER': { color: 'red', shortName: 'MURDER' },
    'MEANR THAN AVG': { color: 'orange', shortName: 'MEANR' },
    'DODGE THE BULLET': { color: 'user', shortName: 'DODGE' } // User's team
  };

  // Screen regions based on actual UI
  // Left side: 0% to 35% of screen = Party members
  // Right side: 60% to 100% of screen = Enemy crews
  const LEFT_MAX = width * 0.35;
  const RIGHT_MIN = width * 0.60;

  // Noise words to skip (UI elements)
  const NOISE = new Set([
    'PARTY', 'VOICE', 'CREW', 'HUB', 'PUSH', 'TALK', 'Disable', 'Switch', 'Channel',
    'YOUR', 'TEAM', 'Enemy', 'Crews', 'Hop', 'into', 'same', 'voice', 'channel',
    'to', 'talk', 'with', 'your', 'crew'
  ]);

  let currentTeam = null;

  console.log('[ACCURATE] Processing', words.length, 'words');

  // Group words by line (same Y position)
  const lines = groupWordsIntoLines(words, height);

  for (const line of lines) {
    const lineText = line.words.map(w => w.text).join(' ');
    const leftmost = line.words[0];
    const leftmostX = (leftmost.bbox.x0 + leftmost.bbox.x1) / 2;

    // Check if this line contains a team name
    let matchedTeam = null;
    for (const [teamName, info] of Object.entries(TEAM_INFO)) {
      if (lineText.toUpperCase().includes(teamName) ||
          lineText.toUpperCase().includes(info.shortName)) {
        matchedTeam = teamName;
        break;
      }
    }

    if (matchedTeam) {
      if (TEAM_INFO[matchedTeam].color === 'user') {
        currentTeam = null; // Don't track user's team for enemies
      } else {
        currentTeam = matchedTeam;
        console.log('[ACCURATE] Found enemy team:', matchedTeam, 'at x:', Math.round(leftmostX));
      }
      continue;
    }

    // Extract player name from this line (returns {name, word})
    const extracted = extractPlayerNameFromLineWithPosition(line.words, NOISE);
    if (!extracted || extracted.name.length < 3) continue;

    let name = extracted.name;
    const nameWord = extracted.word;

    // Clean up OCR artifacts in names
    name = cleanupName(name);

    // Determine if left (teammate) or right (enemy) using ACTUAL name position
    const centerX = (nameWord.bbox.x0 + nameWord.bbox.x1) / 2;
    const isLeftSide = centerX < LEFT_MAX;
    const isRightSide = centerX >= RIGHT_MIN;

    console.log('[ACCURATE] Name:', name, 'x:', Math.round(centerX),
                isLeftSide ? '(LEFT)' : isRightSide ? '(RIGHT)' : '(MIDDLE)');

    if (isLeftSide) {
      // Teammate
      teammates.push({
        name: name,
        confidence: 85,
        isTeammate: true
      });
    } else if (isRightSide && currentTeam) {
      // Enemy player
      enemyPlayers.push({
        name: name,
        teamName: currentTeam,
        color: TEAM_INFO[currentTeam].color
      });
    }
  }

  // Group enemies by team
  const teamMap = new Map();
  for (const player of enemyPlayers) {
    if (!teamMap.has(player.teamName)) {
      teamMap.set(player.teamName, {
        teamName: player.teamName,
        color: player.color,
        players: []
      });
    }
    teamMap.get(player.teamName).players.push({
      name: player.name,
      confidence: 85,
      isTeammate: false
    });
  }

  const opponentTeams = Array.from(teamMap.values()).map(team => ({
    teamName: team.teamName,
    shipType: '',
    color: team.color,
    players: team.players,
    confidence: 85
  }));

  console.log('[ACCURATE] Results:', teammates.length, 'teammates,', opponentTeams.length, 'enemy teams');

  return {
    teammates,
    opponentTeams
  };
}

/**
 * Group words into lines based on Y position
 */
function groupWordsIntoLines(words, height) {
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

  // Sort words within each line by X position
  for (const line of lines) {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  }

  return lines;
}

/**
 * Extract player name from a line of words
 * Names are typically ONE word (or TWO if split like "c0mbat_Barbi3")
 * Returns {name, word} where word is the actual word object with bbox
 */
function extractPlayerNameFromLineWithPosition(words, noiseSet) {
  let nameParts = [];
  let nameWord = null; // The actual word object

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const text = word.text.trim();
    if (!text) continue;

    // Skip noise
    if (noiseSet.has(text) || noiseSet.has(text.toUpperCase())) continue;

    // Skip very short fragments (1-2 chars)
    if (text.length <= 2) continue;

    // Check if this looks like a player name
    // Must have letters AND (numbers OR mixed case OR underscore)
    // Reject if too many special chars or not enough alphanumeric
    const hasLetters = /[a-zA-Z]/.test(text);
    const hasNumbers = /[0-9]/.test(text);
    const hasUnderscore = /_/.test(text);
    const hasMixedCase = /[a-z]/.test(text) && /[A-Z]/.test(text);

    // Count alphanumeric vs special characters
    const alphanumericCount = (text.match(/[a-zA-Z0-9_]/g) || []).length;
    const specialCount = text.length - alphanumericCount;

    // Accept if mostly alphanumeric (allow up to 40% special chars to catch OCR errors)
    const isValidName = hasLetters &&
                       (hasNumbers || hasUnderscore || hasMixedCase) &&
                       alphanumericCount >= 3 &&
                       specialCount / text.length <= 0.4;

    if (isValidName) {
      nameParts.push(text);
      nameWord = word; // Store the word object

      // Check if next word might be second part of name (like "ombat" + "Barbi3")
      if (i + 1 < words.length && nameParts.length === 1) {
        const nextText = words[i + 1].text.trim();
        const nextHasLetters = /[a-zA-Z]/.test(nextText);
        const nextStartsUpper = /^[A-Z]/.test(nextText);
        const currentEndsLower = /[a-z]$/.test(text);

        // Only merge if it looks like camelCase split (ombat + Barbi3)
        if (nextText.length >= 3 && nextHasLetters && currentEndsLower && nextStartsUpper) {
          nameParts.push(nextText);
          i++; // Skip next word
        }
      }

      // Stop after finding 1-2 name parts
      break;
    }
  }

  if (nameParts.length === 0 || !nameWord) return null;

  // Join with underscore
  let name = nameParts.join('_');

  // Remove trailing platform indicator (w, D, etc) and numbers
  name = name.replace(/[wWdDxXpPcC0-9]+$/,  '').replace(/_$/,  '');

  return { name, word: nameWord };
}

/**
 * Clean up OCR artifacts from names
 */
function cleanupName(name) {
  // Replace common OCR mistakes
  name = name
    .replace(/@/g, 'Q')  // @ → Q (Scare@ro → ScareQro)
    .replace(/»/g, 'a')  // » → a (oY». → oYa.)
    .replace(/[{}()\[\]]/g, '')  // Remove brackets
    .replace(/[¥£€]/g, '')   // Remove currency symbols
    .replace(/[.,:;]/g, '')  // Remove punctuation
    .trim();

  // Remove leading/trailing special chars (keep underscore and numbers)
  name = name.replace(/^[^a-zA-Z0-9_]+/, '').replace(/[^a-zA-Z0-9_]+$/, '');

  return name;
}

/**
 * Fallback: Extract from text only when no word data
 */
function extractFromTextOnly(text) {
  console.log('[ACCURATE] Text-only fallback');

  const teammates = [];
  const opponentTeams = [];

  // Find names followed by platform indicators
  const lines = text.split('\n');
  for (const line of lines) {
    // Pattern: Name (possibly with underscore) followed by space and 1-2 chars
    const match = line.match(/([A-Za-z0-9_]{3,20})\s+[A-Za-z0-9]{1,2}\s/);
    if (match) {
      const name = match[1];
      // Basic check: has mixed case or underscore
      if (/_/.test(name) || (/[a-z]/.test(name) && /[A-Z0-9]/.test(name))) {
        teammates.push({
          name: name,
          confidence: 70,
          isTeammate: true
        });
      }
    }
  }

  return { teammates, opponentTeams };
}

module.exports = {
  extractCrewHubAccurate
};
