/**
 * SIMPLE OCR Extractor - No fancy CV, just text parsing that works
 */

/**
 * Extract players from Crew Hub using simple text patterns
 * Uses ORIGINAL raw text (not trimmed) to preserve column positions
 */
function extractCrewHubSimple(rawText) {
  console.log('[SIMPLE] Extracting from raw text');

  const lines = rawText.split('\n'); // DON'T trim - need to preserve indentation

  const teammates = [];
  const enemyPlayers = [];

  // Known team names
  const TEAM_NAMES = {
    'MURDER SPAGHURDER': 'red',
    'MEANR THAN AVG': 'orange',
    'DODGE THE BULLET': 'user_team' // Skip this, it's the user's team
  };

  let currentTeamName = null;

  // UI noise to skip
  const SKIP_WORDS = new Set([
    'PARTY', 'VOICE', 'CREW', 'HUB', 'PUSH', 'TALK', 'CHANNEL', 'SWITCH',
    'YOUR', 'ON', 'OFF', 'SAY', 'ENEMY', 'CREWS', 'HOP', 'INTO', 'SAME',
    'JaiYeR7ol', 'ees', 'SSAHIACT', 'hans' // OCR garbage from UI
  ]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;

    const trimmed = line.trim();

    // Skip lines that are just UI headers
    if (trimmed.includes('Crew') || trimmed.includes('DODGE THE BULLET') ||
        trimmed.includes('Hop into') || trimmed.includes('voice channel')) {
      continue;
    }

    // Check if this line is a team name
    let matchedTeam = null;
    for (const teamName of Object.keys(TEAM_NAMES)) {
      if (trimmed.toUpperCase().includes(teamName)) {
        matchedTeam = teamName;
        break;
      }
    }

    if (matchedTeam) {
      if (TEAM_NAMES[matchedTeam] === 'user_team') {
        currentTeamName = null; // Don't assign players to user's team
      } else {
        currentTeamName = matchedTeam;
        console.log('[SIMPLE] Found team:', matchedTeam);
      }
      continue;
    }

    // Determine if this is left side (teammate) or right side (enemy)
    // Based on indentation: teammates start closer to left edge
    const leadingSpaces = line.length - line.trimLeft().length;
    const isLeftSide = leadingSpaces < 50; // Left side has less indentation
    const isRightSide = !isLeftSide || currentTeamName !== null;

    // Extract player names - try multiple patterns:
    // Pattern 1: "Name 12" - name with space before icon OCR
    // Pattern 2: "Namew" - icon OCRed into the name
    // Pattern 3: Look for words that contain known player patterns

    let name = null;

    // Try pattern 1: Name followed by space and garbage
    let match = trimmed.match(/([A-Za-z0-9_]{3,20})\s+[a-zA-Z0-9]{1,3}\s*$/);
    if (match) {
      name = match[1];
    } else {
      // Try pattern 2: Name with trailing single char (icon merged)
      match = trimmed.match(/([A-Za-z0-9_]{3,20})[wWdD]\s*$/);
      if (match) {
        name = match[1];
      }
    }

    if (!name) {
      // Try extracting any reasonable looking name from the line
      // Look for words with mixed case or underscores (likely player names)
      const words = trimmed.split(/\s+/);
      for (const word of words) {
        if (word.length >= 3 && word.length <= 20) {
          // Has letters and (numbers or underscores or mixed case)
          if (/[a-z]/.test(word) && (/[A-Z]/.test(word) || /[0-9_]/.test(word))) {
            name = word.replace(/[wWdD]$/, ''); // Remove trailing icon char
            break;
          }
        }
      }
    }

    if (name) {
      // Skip noise words
      if (SKIP_WORDS.has(name.toUpperCase())) continue;

      // Skip if it's all caps and short (likely UI element)
      if (name.length < 5 && name === name.toUpperCase()) continue;

      console.log('[SIMPLE] Found name:', name, 'indent:', leadingSpaces, isLeftSide ? '(teammate)' : '(enemy)');

      if (isLeftSide && !currentTeamName) {
        // Teammate (left side, no active enemy team)
        teammates.push({
          name: name,
          confidence: 80,
          isTeammate: true
        });
      } else if (isRightSide || currentTeamName) {
        // Enemy player (right side or active team)
        enemyPlayers.push({
          name: name,
          teamName: currentTeamName || 'Unknown Team',
          color: currentTeamName ? TEAM_NAMES[currentTeamName] : 'unknown'
        });
      }
    }
  }

  // Merge split names (like "ombat" + "Barbi3" = "c0mbat_Barbi3")
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

  console.log('[SIMPLE] Extracted:', mergedTeammates.length, 'teammates,', opponentTeams.length, 'teams');

  return {
    teammates: mergedTeammates,
    opponentTeams
  };
}

/**
 * Merge fragmented names like "ombat" + "Barbi3" -> "c0mbat_Barbi3"
 * Looks for consecutive names that look like fragments
 */
function mergeFragmentedNames(names) {
  if (names.length === 0) return [];

  const merged = [];
  let i = 0;

  while (i < names.length) {
    const current = names[i];

    // Check if next name might be a continuation
    if (i + 1 < names.length) {
      const next = names[i + 1];

      // Heuristic: if current ends lowercase and next starts uppercase (camelCase split)
      // OR if current is short and lowercase (likely missing prefix)
      // Examples: "ombat" + "Barbi3", "combat" + "Barbi3"
      if (shouldMerge(current.name, next.name)) {
        console.log('[SIMPLE] Merging:', current.name, '+', next.name);
        merged.push({
          name: current.name + '_' + next.name,
          confidence: Math.min(current.confidence, next.confidence),
          isTeammate: current.isTeammate
        });
        i += 2; // Skip both
        continue;
      }
    }

    // No merge, keep as is
    merged.push(current);
    i++;
  }

  return merged;
}

/**
 * Check if two name fragments should be merged
 */
function shouldMerge(name1, name2) {
  // Both must be reasonably short (parts of a name)
  if (name1.length > 15 || name2.length > 15) return false;

  // Pattern 1: first ends lowercase, second starts uppercase (camelCase break)
  const lastChar1 = name1[name1.length - 1];
  const firstChar2 = name2[0];
  if (/[a-z]/.test(lastChar1) && /[A-Z]/.test(firstChar2)) {
    console.log('[SIMPLE] Detected camelCase split:', name1, name2);
    return true;
  }

  // Pattern 2: first is all lowercase and short (likely missing prefix like "c0")
  if (name1.length <= 6 && name1 === name1.toLowerCase() && /[A-Z]/.test(name2)) {
    console.log('[SIMPLE] Detected prefix missing:', name1, name2);
    return true;
  }

  return false;
}

module.exports = {
  extractCrewHubSimple
};
