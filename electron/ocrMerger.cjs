/**
 * OCR Data Merger
 *
 * Merges multiple OCR captures (e.g., from scrolling in Crew Hub)
 * into accumulated match data without duplicates.
 *
 * Features:
 * - Match teams by name + color
 * - Deduplicate players by name (case-insensitive)
 * - Preserve team associations
 * - Update confidence scores
 */

/**
 * Merge new capture data with existing data
 * @param {Object} existing - Existing accumulated data
 * @param {Object} newData - New capture data to merge
 * @returns {Object} Merged result
 */
function mergeCaptures(existing, newData) {
  // If no existing data, return new data as-is
  if (!existing || Object.keys(existing).length === 0) {
    return { ...newData };
  }

  // If no new data, return existing as-is
  if (!newData || Object.keys(newData).length === 0) {
    return { ...existing };
  }

  // Determine screen type (prefer new data's type if both exist)
  const screenType = newData.screenType || existing.screenType;

  // Merge based on screen type
  if (screenType === 'crewHub') {
    return mergeCrewHubData(existing, newData);
  } else if (screenType === 'mapScreen') {
    return mergeMapScreenData(existing, newData);
  }

  // Unknown type - return new data
  return { ...newData };
}

/**
 * Merge Crew Hub data
 */
function mergeCrewHubData(existing, newData) {
  const result = {
    screenType: 'crewHub',
    yourTeam: mergeYourTeam(existing.yourTeam, newData.yourTeam),
    enemyTeams: mergeEnemyTeams(existing.enemyTeams, newData.enemyTeams),
    isPartialCapture: false,
    confidence: 0,
  };

  // Calculate combined confidence
  const existingConf = existing.confidence || 0;
  const newConf = newData.confidence || 0;
  result.confidence = Math.round((existingConf + newConf) / 2);

  // Update partial capture status
  if (result.enemyTeams.some(t => t.players.length < 4)) {
    result.isPartialCapture = true;
  }

  return result;
}

/**
 * Merge Map Screen data
 */
function mergeMapScreenData(existing, newData) {
  const result = {
    screenType: 'mapScreen',
    yourShip: newData.yourShip || existing.yourShip,
    enemyShips: mergeEnemyShips(existing.enemyShips, newData.enemyShips),
    hazards: mergeHazards(existing.hazards, newData.hazards),
    players: mergePlayers(existing.players, newData.players),
    confidence: 0,
  };

  // Calculate combined confidence
  const existingConf = existing.confidence || 0;
  const newConf = newData.confidence || 0;
  result.confidence = Math.round((existingConf + newConf) / 2);

  return result;
}

/**
 * Merge your team data
 */
function mergeYourTeam(existing, newData) {
  if (!existing) return newData;
  if (!newData) return existing;

  return {
    name: newData.name || existing.name,
    players: mergePlayers(existing.players || [], newData.players || []),
  };
}

/**
 * Merge enemy teams arrays
 * Matches teams by name similarity or color
 */
function mergeEnemyTeams(existingTeams = [], newTeams = []) {
  if (!existingTeams.length) return newTeams;
  if (!newTeams.length) return existingTeams;

  const mergedTeams = [...existingTeams];

  for (const newTeam of newTeams) {
    // Try to find matching existing team
    const matchIndex = findMatchingTeam(mergedTeams, newTeam);

    if (matchIndex >= 0) {
      // Merge into existing team
      const existingTeam = mergedTeams[matchIndex];

      // Update team name if new one is longer/more complete
      if ((newTeam.name?.length || 0) > (existingTeam.name?.length || 0)) {
        existingTeam.name = newTeam.name;
      }

      // Update color if we didn't have one
      if (existingTeam.color === 'unknown' && newTeam.color !== 'unknown') {
        existingTeam.color = newTeam.color;
      }

      // Merge players
      existingTeam.players = mergePlayers(existingTeam.players, newTeam.players);

      // Update confidence (average)
      existingTeam.confidence = Math.round(
        ((existingTeam.confidence || 0) + (newTeam.confidence || 0)) / 2
      );
    } else {
      // Add as new team (if under limit)
      if (mergedTeams.length < 4) {
        mergedTeams.push({ ...newTeam });
      } else {
        console.warn('[Merger] Max 4 teams reached, ignoring additional team:', newTeam.name);
      }
    }
  }

  return mergedTeams;
}

/**
 * Find matching team in array by name or color
 * @param {Array} teams - Existing teams
 * @param {Object} target - Team to match
 * @returns {number} Index of matching team, or -1
 */
function findMatchingTeam(teams, target) {
  // Priority 1: Exact name match (case-insensitive)
  const nameNormalized = normalizeTeamName(target.name);
  let idx = teams.findIndex(t => normalizeTeamName(t.name) === nameNormalized);
  if (idx >= 0) return idx;

  // Priority 2: Color match (if both have colors)
  if (target.color && target.color !== 'unknown') {
    idx = teams.findIndex(t => t.color === target.color);
    if (idx >= 0) return idx;
  }

  // Priority 3: Fuzzy name match
  idx = teams.findIndex(t => fuzzyTeamNameMatch(t.name, target.name));
  if (idx >= 0) return idx;

  return -1;
}

/**
 * Normalize team name for comparison
 */
function normalizeTeamName(name) {
  if (!name) return '';
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Fuzzy match team names (allows for OCR errors)
 */
function fuzzyTeamNameMatch(name1, name2) {
  if (!name1 || !name2) return false;

  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Check Levenshtein distance
  if (n1.length >= 5 && n2.length >= 5) {
    const distance = levenshteinDistance(n1, n2);
    const maxLen = Math.max(n1.length, n2.length);
    // Allow up to 20% difference
    if (distance / maxLen <= 0.2) return true;
  }

  return false;
}

/**
 * Merge enemy ships arrays
 */
function mergeEnemyShips(existing = [], newShips = []) {
  if (!existing.length) return newShips;
  if (!newShips.length) return existing;

  const merged = [...existing];

  for (const newShip of newShips) {
    const matchIdx = merged.findIndex(s =>
      normalizeTeamName(s.teamName) === normalizeTeamName(newShip.teamName) ||
      (s.color !== 'unknown' && s.color === newShip.color)
    );

    if (matchIdx >= 0) {
      // Update existing ship info
      const ship = merged[matchIdx];
      if (!ship.shipType && newShip.shipType) ship.shipType = newShip.shipType;
      if (!ship.teamName && newShip.teamName) ship.teamName = newShip.teamName;
      if (ship.color === 'unknown' && newShip.color !== 'unknown') ship.color = newShip.color;
      ship.confidence = Math.round(((ship.confidence || 0) + (newShip.confidence || 0)) / 2);
    } else {
      merged.push({ ...newShip });
    }
  }

  return merged;
}

/**
 * Merge hazards arrays
 */
function mergeHazards(existing = [], newHazards = []) {
  const combined = [...existing, ...newHazards];
  return [...new Set(combined)];
}

/**
 * Merge player arrays (deduplicate by name)
 * Works with both string arrays and player object arrays
 */
function mergePlayers(existing = [], newPlayers = []) {
  const seen = new Map(); // lowercase name -> original entry

  // Add existing players
  for (const player of existing) {
    const name = typeof player === 'string' ? player : player?.name;
    if (name) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, player);
      }
    }
  }

  // Add new players (deduplicating)
  for (const player of newPlayers) {
    const name = typeof player === 'string' ? player : player?.name;
    if (name) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, player);
      } else if (typeof player !== 'string') {
        // If new player has more data, update existing
        const existingPlayer = seen.get(key);
        if (typeof existingPlayer !== 'string') {
          // Merge player objects
          seen.set(key, {
            ...existingPlayer,
            ...player,
            confidence: Math.round(
              ((existingPlayer.confidence || 0) + (player.confidence || 0)) / 2
            ),
          });
        }
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Calculate Levenshtein distance
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
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Create a fingerprint for deduplication
 * Used to identify if two captures are of the same match
 */
function createCaptureFingerprint(data) {
  if (!data) return '';

  const parts = [];

  // Your team name
  if (data.yourTeam?.name) {
    parts.push('Y:' + normalizeTeamName(data.yourTeam.name));
  }

  // First few players from each enemy team
  if (data.enemyTeams?.length > 0) {
    for (const team of data.enemyTeams) {
      if (team.name) parts.push('E:' + normalizeTeamName(team.name));
      if (team.players?.length > 0) {
        const firstPlayer = team.players[0];
        const name = typeof firstPlayer === 'string' ? firstPlayer : firstPlayer?.name;
        if (name) parts.push('P:' + name.toLowerCase().substring(0, 8));
      }
    }
  }

  // Enemy ships
  if (data.enemyShips?.length > 0) {
    for (const ship of data.enemyShips) {
      if (ship.teamName) parts.push('S:' + normalizeTeamName(ship.teamName));
    }
  }

  return parts.join('|');
}

/**
 * Check if two captures are from the same match
 */
function isSameMatch(data1, data2) {
  const fp1 = createCaptureFingerprint(data1);
  const fp2 = createCaptureFingerprint(data2);

  if (!fp1 || !fp2) return false;

  // Check for significant overlap
  const parts1 = fp1.split('|');
  const parts2 = new Set(fp2.split('|'));

  let matches = 0;
  for (const part of parts1) {
    if (parts2.has(part)) matches++;
  }

  // Consider same match if >50% overlap
  return matches / Math.max(parts1.length, parts2.size) > 0.5;
}

module.exports = {
  mergeCaptures,
  mergeCrewHubData,
  mergeMapScreenData,
  mergeYourTeam,
  mergeEnemyTeams,
  mergeEnemyShips,
  mergeHazards,
  mergePlayers,
  findMatchingTeam,
  normalizeTeamName,
  fuzzyTeamNameMatch,
  createCaptureFingerprint,
  isSameMatch,
};
