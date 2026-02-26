/**
 * Hybrid OCR Extractor - Uses word positions + smart text parsing
 * Best of both worlds: CV spatial awareness + simple text patterns
 */

/**
 * Extract from Crew Hub using word positions and spatial awareness
 */
async function extractCrewHubHybrid(ocrResult, imageBuffer, width, height) {
  console.log('[HYBRID] Starting extraction');

  const words = ocrResult.data.words || [];
  const text = ocrResult.data.text || '';

  console.log('[HYBRID] Words available:', words.length);

  if (words.length === 0) {
    // Fallback to text-only parsing
    console.warn('[HYBRID] No word-level data, using text fallback');
    return extractCrewHubFromText(text);
  }

  const teammates = [];
  const enemyPlayers = [];

  // Known team names
  const TEAM_NAMES = {
    'MURDER SPAGHURDER': 'red',
    'MEANR THAN AVG': 'orange',
  };

  let currentTeamName = null;

  // Noise to skip
  const NOISE = new Set([
    'PARTY', 'VOICE', 'CREW', 'HUB', 'PUSH', 'TALK', 'CHANNEL', 'SWITCH',
    'YOUR', 'ON', 'OFF', 'SAY', 'ENEMY', 'CREWS', 'HOP', 'INTO', 'SAME',
    'w', 'le', 'M', 'Co', 'VA', 'rv', 'JF', 'ud', 'SN', 'Cl', 'pir',
    'fe', 'INe', 'AA', 'r', 'we', 'ie', 'OE', 'mm', 'EWR', 'a', 'i', 'S'
  ]);

  // Divide screen into regions
  const MIDDLE_X = width * 0.5;

  // Group words by proximity (merge split names like "ombat Barbi3")
  const wordGroups = groupWordsByProximity(words, width, height);

  for (const group of wordGroups) {
    const centerX = group.centerX;
    const text = group.text;

    // Skip noise
    if (NOISE.has(text) || NOISE.has(text.toUpperCase())) continue;
    if (text.length < 3 || text.length > 25) continue;

    // Check if this is a team name
    let matchedTeam = null;
    for (const teamName of Object.keys(TEAM_NAMES)) {
      if (text.toUpperCase().includes(teamName)) {
        matchedTeam = teamName;
        break;
      }
    }

    if (matchedTeam) {
      currentTeamName = matchedTeam;
      console.log('[HYBRID] Found team:', matchedTeam, 'at x:', centerX);
      continue;
    }

    // Clean the text (remove platform indicators)
    const cleanText = text.replace(/\s*[wWdD0-9]{1,3}\s*$/g, '').trim();
    if (cleanText.length < 3) continue;

    // Skip short all-caps (UI elements)
    if (cleanText.length < 5 && cleanText === cleanText.toUpperCase()) continue;

    // Determine side
    const isLeftSide = centerX < MIDDLE_X;

    console.log('[HYBRID] Word:', cleanText, 'x:', Math.round(centerX), isLeftSide ? '(left)' : '(right)');

    if (isLeftSide && !currentTeamName) {
      // Teammate
      teammates.push({
        name: cleanText,
        confidence: 80,
        isTeammate: true
      });
    } else {
      // Enemy
      enemyPlayers.push({
        name: cleanText,
        teamName: currentTeamName || 'Unknown Team',
        color: currentTeamName ? TEAM_NAMES[currentTeamName] : 'unknown'
      });
    }
  }

  // Merge fragmented teammate names
  const mergedTeammates = mergeFragmentedNames(teammates);

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
      confidence: 80,
      isTeammate: false
    });
  }

  const opponentTeams = Array.from(teamMap.values()).map(team => ({
    teamName: team.teamName,
    shipType: '',
    color: team.color,
    players: team.players,
    confidence: 80
  }));

  console.log('[HYBRID] Extracted:', mergedTeammates.length, 'teammates,', opponentTeams.length, 'teams');

  return {
    teammates: mergedTeammates,
    opponentTeams
  };
}

/**
 * Group words that are close together (merge split names)
 */
function groupWordsByProximity(words, width, height) {
  const groups = [];
  const processed = new Set();

  // Sort by Y, then X
  const sorted = [...words].sort((a, b) => {
    const yDiff = (a.bbox?.y0 || 0) - (b.bbox?.y0 || 0);
    if (Math.abs(yDiff) < 5) {
      return (a.bbox?.x0 || 0) - (b.bbox?.x0 || 0);
    }
    return yDiff;
  });

  for (let i = 0; i < sorted.length; i++) {
    if (processed.has(i)) continue;

    const word = sorted[i];
    if (!word.bbox || !word.text) continue;

    const group = {
      text: word.text,
      centerX: (word.bbox.x0 + word.bbox.x1) / 2,
      centerY: (word.bbox.y0 + word.bbox.y1) / 2,
      words: [word]
    };

    processed.add(i);

    // Look ahead for adjacent words on same line
    for (let j = i + 1; j < sorted.length; j++) {
      if (processed.has(j)) continue;

      const next = sorted[j];
      if (!next.bbox || !next.text) continue;

      const yDiff = Math.abs(next.bbox.y0 - word.bbox.y0);
      const xGap = next.bbox.x0 - word.bbox.x1;

      // Same line and close together?
      if (yDiff < height * 0.02 && xGap < width * 0.05 && xGap >= 0) {
        group.text += next.text;
        group.words.push(next);
        processed.add(j);
      } else if (yDiff > height * 0.02) {
        break; // Moved to next line
      }
    }

    groups.push(group);
  }

  console.log('[HYBRID] Grouped', words.length, 'words into', groups.length, 'groups');
  return groups;
}

/**
 * Merge fragmented names like "ombat" + "Barbi3"
 */
function mergeFragmentedNames(names) {
  if (names.length === 0) return [];

  const merged = [];
  let i = 0;

  while (i < names.length) {
    const current = names[i];

    if (i + 1 < names.length) {
      const next = names[i + 1];

      // Check if should merge (camelCase split or missing prefix)
      const lastChar = current.name[current.name.length - 1];
      const firstChar = next.name[0];

      const isCamelSplit = /[a-z]/.test(lastChar) && /[A-Z]/.test(firstChar);
      const isMissingPrefix = current.name.length <= 6 &&
                               current.name === current.name.toLowerCase() &&
                               /[A-Z]/.test(firstChar);

      if (isCamelSplit || isMissingPrefix) {
        console.log('[HYBRID] Merging:', current.name, '+', next.name);
        merged.push({
          name: current.name + '_' + next.name,
          confidence: Math.min(current.confidence, next.confidence),
          isTeammate: current.isTeammate
        });
        i += 2;
        continue;
      }
    }

    merged.push(current);
    i++;
  }

  return merged;
}

/**
 * Fallback: text-only extraction when no word data
 */
function extractCrewHubFromText(text) {
  console.log('[HYBRID] Text-only fallback');

  const teammates = [];
  const opponentTeams = [];

  // Simple pattern: find names followed by numbers
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/([A-Za-z0-9_]{3,20})\s+[0-9wWdD]{1,3}\s*$/);
    if (match) {
      teammates.push({
        name: match[1],
        confidence: 60,
        isTeammate: true
      });
    }
  }

  return { teammates, opponentTeams };
}

module.exports = {
  extractCrewHubHybrid
};
