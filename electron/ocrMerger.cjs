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

const MAX_TEAM_PLAYERS = 4;
const TEAM_COLOR_ORDER = ['red', 'orange', 'yellow', 'yellowgreen', 'green', 'blue', 'purple', 'unknown'];

function capPlayerEntries(players = [], maxPlayers = MAX_TEAM_PLAYERS) {
  if (!Array.isArray(players) || players.length <= maxPlayers) return players || [];

  const scored = [...players].sort((a, b) => {
    const aConf = typeof a === 'string' ? 60 : Number(a?.confidence || 0);
    const bConf = typeof b === 'string' ? 60 : Number(b?.confidence || 0);
    if (bConf !== aConf) return bConf - aConf;
    const aName = (typeof a === 'string' ? a : a?.name || '').toLowerCase();
    const bName = (typeof b === 'string' ? b : b?.name || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  return scored.slice(0, maxPlayers);
}

function normalizeColorKey(color) {
  return String(color || '').trim().toLowerCase();
}

function colorSortRank(color) {
  const key = normalizeColorKey(color);
  const idx = TEAM_COLOR_ORDER.indexOf(key);
  return idx >= 0 ? idx : TEAM_COLOR_ORDER.length;
}

function sortTeamsByColor(teams = [], getColor) {
  if (!Array.isArray(teams) || teams.length <= 1) return teams || [];
  return [...teams].sort((a, b) => {
    const aRank = colorSortRank(getColor(a));
    const bRank = colorSortRank(getColor(b));
    if (aRank !== bRank) return aRank - bRank;
    const aName = String(a?.teamName || a?.name || '').toLowerCase();
    const bName = String(b?.teamName || b?.name || '').toLowerCase();
    return aName.localeCompare(bName);
  });
}

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

  // ── Internal format (screenType field) ──────────────────────────────────────
  const existScreenType = existing.screenType;
  const newScreenType   = newData.screenType;

  // Same-type internal merges
  if (existScreenType === 'crewHub' && newScreenType === 'crewHub') return mergeCrewHubData(existing, newData);
  if (existScreenType === 'mapScreen' && newScreenType === 'mapScreen') return mergeMapScreenData(existing, newData);

  // Cross-type internal: crewHub + mapScreen → enrich crewHub with ship types & hazards
  if ((existScreenType === 'crewHub' && newScreenType === 'mapScreen') ||
      (existScreenType === 'mapScreen' && newScreenType === 'crewHub')) {
    const crew = existScreenType === 'crewHub' ? existing : newData;
    const map  = existScreenType === 'mapScreen' ? existing : newData;
    return crossMergeInternalCrewAndMap(crew, map);
  }

  // ── Legacy format (screenshotType field) ────────────────────────────────────
  const existType = existing.screenshotType;
  const newType   = newData.screenshotType;

  // Same-type legacy merges
  if (existType === 'crew_hub' && newType === 'crew_hub') {
    return mergeLegacyCrewHub(existing, newData);
  }
  if (existType === 'tactical_map' && newType === 'tactical_map') {
    return mergeLegacyTacticalMap(existing, newData);
  }

  // Cross-type: crew_hub + tactical_map → enrich crew_hub with ship types & hazards
  if ((existType === 'crew_hub' && newType === 'tactical_map') ||
      (existType === 'tactical_map' && newType === 'crew_hub')) {
    const crewHub = existType === 'crew_hub' ? existing : newData;
    const tactMap = existType === 'tactical_map' ? existing : newData;
    return crossMergeCrewHubAndMap(crewHub, tactMap);
  }

  // Unknown type - return new data
  return { ...newData };
}

/**
 * Merge two legacy crew_hub captures.
 * Deduplicates teammates and per-team players.
 */
function mergeLegacyCrewHub(existing, newData) {
  const mergedTeammates = mergePlayers(existing.teammates || [], newData.teammates || []);

  // Merge opponentTeams by teamName then by color
  const mergedTeams = [...(existing.opponentTeams || [])];
  for (const nt of (newData.opponentTeams || [])) {
    const normNew = normalizeTeamName(nt.teamName);
    let idx = mergedTeams.findIndex(et => normalizeTeamName(et.teamName) === normNew);
    if (idx < 0) idx = mergedTeams.findIndex(et => et.color && et.color !== 'unknown' && et.color === nt.color);
    if (idx >= 0) {
      const et = mergedTeams[idx];
      mergedTeams[idx] = {
        ...et,
        teamName: (nt.teamName?.length || 0) > (et.teamName?.length || 0) ? nt.teamName : et.teamName,
        shipType: et.shipType || nt.shipType,
        color: et.color === 'unknown' ? nt.color : et.color,
        players: capPlayerEntries(mergePlayers(et.players || [], nt.players || [])),
        confidence: Math.round(((et.confidence || 0) + (nt.confidence || 0)) / 2),
      };
    } else if (mergedTeams.length < 4) {
      mergedTeams.push({ ...nt, players: capPlayerEntries(nt.players || []) });
    }
  }

  const shipTypeHint = newData.playerShip?.shipType || existing.playerShip?.shipType || '';
  const mergedPlayerShipName = normalizePlayerShipName(newData.playerShipName, shipTypeHint)
    || normalizePlayerShipName(existing.playerShipName, shipTypeHint)
    || normalizePlayerShipName(newData.playerTeamName, shipTypeHint)
    || normalizePlayerShipName(existing.playerTeamName, shipTypeHint)
    || undefined;

  return {
    ...existing,
    screenshotType: 'crew_hub',
    playerTeamName: newData.playerTeamName || existing.playerTeamName,
    playerShipName: mergedPlayerShipName,
    playerShip: existing.playerShip || newData.playerShip,
    teammates: capPlayerEntries(mergedTeammates),
    opponentTeams: sortTeamsByColor(mergedTeams, (team) => team?.color || team?.teamColor),
    reachModifiers: mergeHazards(existing.reachModifiers || [], newData.reachModifiers || []),
    overallConfidence: Math.round(((existing.overallConfidence || 0) + (newData.overallConfidence || 0)) / 2),
    isPartialCapture: (existing.isPartialCapture || newData.isPartialCapture) && false, // recalc below
    captureTimestamp: newData.captureTimestamp || existing.captureTimestamp,
  };
}

/**
 * Merge two legacy tactical_map captures.
 */
function mergeLegacyTacticalMap(existing, newData) {
  const shipTypeHint = newData.playerShip?.shipType || existing.playerShip?.shipType || '';
  const mergedPlayerShipName = normalizePlayerShipName(newData.playerShipName, shipTypeHint)
    || normalizePlayerShipName(existing.playerShipName, shipTypeHint)
    || normalizePlayerShipName(newData.playerTeamName, shipTypeHint)
    || normalizePlayerShipName(existing.playerTeamName, shipTypeHint)
    || undefined;

  return {
    ...existing,
    screenshotType: 'tactical_map',
    playerShipName: mergedPlayerShipName,
    playerShip: newData.playerShip || existing.playerShip,
    opponentTeams: sortTeamsByColor(
      mergeEnemyShips(existing.opponentTeams || [], newData.opponentTeams || []),
      (team) => team?.color || team?.teamColor
    ),
    reachModifiers: mergeHazards(existing.reachModifiers || [], newData.reachModifiers || []),
    teammates: capPlayerEntries(mergePlayers(existing.teammates || [], newData.teammates || [])),
    overallConfidence: Math.round(((existing.overallConfidence || 0) + (newData.overallConfidence || 0)) / 2),
    captureTimestamp: newData.captureTimestamp || existing.captureTimestamp,
  };
}

/**
 * Cross-merge: crew_hub (player names/colors) + tactical_map (ship types/hazards).
 * Result is an enriched crew_hub with shipType filled in on each opponent team,
 * and the user's own ship type populated from playerShip.
 */
function crossMergeCrewHubAndMap(crewHub, tactMap) {
  // Map ship type lookup: normalized team name → shipType string
  const mapShipByName = new Map();
  for (const ship of (tactMap.opponentTeams || [])) {
    if (ship.teamName && ship.shipType) {
      mapShipByName.set(normalizeTeamName(ship.teamName), ship.shipType);
    }
  }

  // Also index by normalized shipType for partial fallback
  const mapShipsByType = [];
  for (const ship of (tactMap.opponentTeams || [])) {
    if (ship.shipType) mapShipsByType.push(ship);
  }

  const enrichedTeams = (crewHub.opponentTeams || []).map(team => {
    if (team.shipType) return team; // already has one

    const normName = normalizeTeamName(team.teamName);

    // 1. Exact name match
    let shipType = mapShipByName.get(normName);

    // 2. Fuzzy name match (one contains the other, or common prefix ≥5)
    if (!shipType) {
      for (const [mapName, st] of mapShipByName.entries()) {
        if (mapName.length < 3 || normName.length < 3) continue;
        if (mapName.includes(normName) || normName.includes(mapName)) { shipType = st; break; }
        const minLen = Math.min(mapName.length, normName.length);
        if (minLen >= 5) {
          let cp = 0;
          while (cp < minLen && mapName[cp] === normName[cp]) cp++;
          if (cp >= 5) { shipType = st; break; }
        }
      }
    }

    if (shipType) {
      const mapShip = (tactMap.opponentTeams || []).find(s => normalizeTeamName(s.teamName) === normalizeTeamName(team.teamName) || (team.color && s.color === team.color));
      const resolvedTeamName = pickPreferredTeamName(
        team.teamName,
        mapShip?.teamName || '',
        {
          color: team.color || mapShip?.color || '',
          preferCandidate: Boolean(team.teamNameSource !== 'team_bar' && mapShip?.teamName),
        }
      );
      return {
        ...team,
        teamName: resolvedTeamName,
        shipType,
      };
    }
    return team;
  });

  // Preserve map-only ships as empty teams so later crew captures (that include those
  // teams) can merge by color/name without forcing positional mis-assignment.
  const mapOnlyTeams = mapShipsByType.filter((ship) => {
    const shipColor = String(ship?.color || ship?.teamColor || '').trim().toLowerCase();
    const shipNameKey = normalizeTeamName(ship?.teamName || '');
    return !enrichedTeams.some((team) => {
      const teamColor = String(team?.color || team?.teamColor || '').trim().toLowerCase();
      const teamNameKey = normalizeTeamName(team?.teamName || '');
      if (shipColor && shipColor !== 'unknown' && teamColor && teamColor !== 'unknown' && shipColor === teamColor) {
        return true;
      }
      return Boolean(shipNameKey && teamNameKey && shipNameKey === teamNameKey);
    });
  }).map((ship, idx) => ({
    teamName: String(ship?.teamName || '').trim() || `Enemy Team ${enrichedTeams.length + idx + 1}`,
    teamColor: String(ship?.color || ship?.teamColor || '').trim() || 'unknown',
    color: String(ship?.color || ship?.teamColor || '').trim() || 'unknown',
    shipType: ship?.shipType || '',
    players: [],
    confidence: Number(ship?.confidence || 60),
  }));

  const combinedTeams = [...enrichedTeams, ...mapOnlyTeams];

  const shipTypeHint = crewHub.playerShip?.shipType || tactMap.playerShip?.shipType || '';
  const mergedPlayerShipName = normalizePlayerShipName(crewHub.playerShipName, shipTypeHint)
    || normalizePlayerShipName(tactMap.playerShipName, shipTypeHint)
    || normalizePlayerShipName(crewHub.playerTeamName, shipTypeHint)
    || normalizePlayerShipName(tactMap.playerTeamName, shipTypeHint)
    || undefined;

  return {
    ...crewHub,
    screenshotType: 'crew_hub',
    playerShipName: mergedPlayerShipName,
    playerShip: crewHub.playerShip || tactMap.playerShip,
    teammates: mergePlayers(crewHub.teammates || [], tactMap.teammates || []).slice(0, MAX_TEAM_PLAYERS),
    opponentTeams: sortTeamsByColor(
      combinedTeams.map(team => {
        if (!isPlaceholderTeamName(team.teamName, team.color)) return team;
        const byColor = (tactMap.opponentTeams || []).find(s => s.color && team.color && s.color === team.color && !isPlaceholderTeamName(s.teamName, s.color));
        if (!byColor?.teamName) return team;
        return { ...team, teamName: byColor.teamName };
      }),
      (team) => team?.color || team?.teamColor
    ),
    reachModifiers: mergeHazards(crewHub.reachModifiers || [], tactMap.reachModifiers || []),
    captureTimestamp: crewHub.captureTimestamp || tactMap.captureTimestamp,
  };
}

/**
 * Cross-merge internal-format crewHub + mapScreen.
 * Produces a merged object with the full enemy-team list enriched with
 * ship types pulled from the map screen by color or fuzzy name match.
 */
function crossMergeInternalCrewAndMap(crew, map) {
  // Index map ships by color (as array — map may have >1 ship per color due to
  // OCR colour-detection errors) and by normalized name.
  const mapByColorArr = new Map(); // color → Ship[]
  const mapByName     = new Map(); // normalizedName → Ship
  for (const ship of (map.enemyShips || [])) {
    if (ship.color) {
      if (!mapByColorArr.has(ship.color)) mapByColorArr.set(ship.color, []);
      mapByColorArr.get(ship.color).push(ship);
    }
    if (ship.teamName) mapByName.set(normalizeTeamName(ship.teamName), ship);
  }

  // Track map ships claimed by name-match so colour-match won't double-use them.
  const claimedNames = new Set();

  const enrichedTeams = (crew.enemyTeams || []).map(team => {
    if (team.shipType) return team;

    const isColorLabel = !team.name || team.name.toLowerCase() === (team.color || '').toLowerCase();

    let mapShip = null;

    // 1. Name match first (when the crew team has a real name, not just the colour label).
    //    This handles cases where the map assigned the wrong colour to a ship — we still
    //    identify it correctly by name.
    if (!isColorLabel && team.name) {
      const normName = normalizeTeamName(team.name);
      mapShip = mapByName.get(normName);
      if (!mapShip) {
        for (const [mn, s] of mapByName.entries()) {
          if (mn.length < 3 || normName.length < 3) continue;
          if (mn.includes(normName) || normName.includes(mn)) { mapShip = s; break; }
          const minLen = Math.min(mn.length, normName.length);
          if (minLen >= 5) {
            let cp = 0; while (cp < minLen && mn[cp] === normName[cp]) cp++;
            if (cp >= 5) { mapShip = s; break; }
          }
        }
      }
      if (mapShip) claimedNames.add(normalizeTeamName(mapShip.teamName || ''));
    }

    // 2. Colour match (fallback).  Skip ships already claimed by the name-match above,
    //    and when multiple ships share the same colour pick the first unclaimed one.
    if (!mapShip && team.color) {
      const candidates = (mapByColorArr.get(team.color) || []).filter(
        s => !claimedNames.has(normalizeTeamName(s.teamName || ''))
      );
      if (candidates.length > 0) {
        mapShip = candidates[0];
        claimedNames.add(normalizeTeamName(mapShip.teamName || ''));
      }
    }

    return mapShip ? {
      ...team,
      shipType: mapShip.shipType,
      name: (() => {
        if (isColorLabel) {
          return pickPreferredTeamName(team.name, mapShip.teamName, { color: team.color, preferCandidate: true });
        }
        const normCrewName = normalizeTeamName(team.name);
        const crewNameIsWrongColor = (() => {
          if (mapByName.has(normCrewName) && mapByName.get(normCrewName).color !== team.color) return true;
          if (team.color) {
            for (const [mn, s] of mapByName.entries()) {
              if ((s.color || '') === team.color) continue;
              if (mn.length < 5 || normCrewName.length < 5) continue;
              const dist = levenshteinDistance(mn, normCrewName);
              if (dist / Math.max(mn.length, normCrewName.length) <= 0.15) return true;
            }
          }
          return false;
        })();
        const preferMapName = crewNameIsWrongColor || Boolean(team.nameSource !== 'team_bar');
        return pickPreferredTeamName(team.name, mapShip.teamName, { color: team.color, preferCandidate: preferMapName });
      })(),
    } : team;
  });

  // Positional fallback: if exactly one crew team unmatched & one map ship unmatched
  const unmatched = enrichedTeams.filter(t => !t.shipType);
  const matchedColors = new Set(enrichedTeams.filter(t => t.shipType).map(t => t.color));
  const unusedMapShips = (map.enemyShips || []).filter(s => !matchedColors.has(s.color));
  if (unmatched.length === 1 && unusedMapShips.length === 1) {
    const idx = enrichedTeams.findIndex(t => !t.shipType);
    enrichedTeams[idx] = { ...enrichedTeams[idx], shipType: unusedMapShips[0].shipType };
  }

  // Map-only teams: include any map ship not matched by any crew team (ship type known,
  // but crew OCR found no players for that team).  Ensures teams seen on the map are
  // never dropped simply because the crew-hub OCR failed for that team.
  {
    const finalMatchedColors = new Set(enrichedTeams.map(t => t.color));
    const finalMatchedNames  = new Set(enrichedTeams.map(t => normalizeTeamName(t.name || '')));
    for (const orphan of (map.enemyShips || [])) {
      if (finalMatchedColors.has(orphan.color)) continue;
      if (orphan.teamName && finalMatchedNames.has(normalizeTeamName(orphan.teamName))) continue;
      enrichedTeams.push({
        color:    orphan.color,
        name:     orphan.teamName || '',
        shipType: orphan.shipType || '',
        players:  [],
      });
    }
  }

  // Drop artifact enemy teams: unknown-color entries with no map-identified
  // shipType are UI noise (e.g. "Ping at Cursor" / "Toggle Labels" map overlay
  // text that Tesseract read as player cards).
  const finalEnrichedTeams = enrichedTeams
    .map(team => {
      if (!isPlaceholderTeamName(team.name, team.color)) return team;
      const mapBySameColor = (map.enemyShips || []).find(s => s.color && team.color && s.color === team.color && !isPlaceholderTeamName(s.teamName, s.color));
      if (!mapBySameColor?.teamName) return team;
      return { ...team, name: mapBySameColor.teamName };
    })
    .filter(t => t.color !== 'unknown' || t.shipType);

  // Cross-enemy dedup: if a player appears in more than one enemy team
  // (e.g. from Y-gap colour inheritance giving a card to the wrong team),
  // keep them only in the team where they have the most companions
  // (largest team = most data = most reliable colour assignment).
  {
    const normKey = s => (s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u4e00-\u9fff]/g, '');
    const playerTeamCount = new Map();
    for (const t of finalEnrichedTeams) {
      for (const p of (t.players || [])) {
        const k = normKey(typeof p === 'string' ? p : (p?.name || ''));
        if (k) playerTeamCount.set(k, (playerTeamCount.get(k) || 0) + 1);
      }
    }
    for (const [k, count] of playerTeamCount) {
      if (count < 2) continue;
      const teamsWithPlayer = finalEnrichedTeams
        .filter(t => (t.players || []).some(p => normKey(typeof p === 'string' ? p : (p?.name || '')) === k))
        .sort((a, b) => (b.players?.length || 0) - (a.players?.length || 0));
      // Keep in the largest team; remove from all others
      for (let i = 1; i < teamsWithPlayer.length; i++) {
        teamsWithPlayer[i].players = (teamsWithPlayer[i].players || [])
          .filter(p => normKey(typeof p === 'string' ? p : (p?.name || '')) !== k);
      }
    }
  }

  // Cross-team dedup: if a name that ended up in YOUR TEAM is also definitively
  // assigned to an enemy team, it was an OCR mis-assignment — remove it from YOUR
  // TEAM.  Use EXACT normalised-key matching so similar-but-different names like
  // "Riv2" (your player) and "Rive" (enemy) are NOT conflated.
  const normKey = s => (s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u4e00-\u9fff]/g, '');
  const enemyPlayerKeys = new Set(
    finalEnrichedTeams
      .filter(t => t.color && t.color !== 'unknown')
      .flatMap(t => (t.players || []).map(normKey))
  );
  const yourPlayersFiltered = (crew.yourTeam?.players || []).filter(p => !enemyPlayerKeys.has(normKey(p)));

  // Use map's team name as fallback when crew extraction didn't capture it
  const yourTeamName = (crew.yourTeam?.name && crew.yourTeam.name !== 'Your Team')
    ? crew.yourTeam.name
    : (map.yourShip?.teamName && map.yourShip.teamName !== 'Your Team' ? map.yourShip.teamName : crew.yourTeam?.name);

  return {
    screenType: 'crewHub',
    yourTeam: {
      ...crew.yourTeam,
      name: yourTeamName,
      shipType: map.yourShip?.shipType || crew.yourTeam?.shipType,
      players: mergePlayers(yourPlayersFiltered, map.players || []),
    },
    enemyTeams: sortTeamsByColor(finalEnrichedTeams, (team) => team?.color || team?.teamColor),
    hazards: (map.hazards && map.hazards.length > 0) ? map.hazards : (crew.hazards || []),
    mapSeed: map.mapSeed,
    isPartialCapture: crew.isPartialCapture,
    confidence: Math.round(((crew.confidence || 0) + (map.confidence || 0)) / 2),
  };
}

/**
 * Merge Crew Hub data
 */
function mergeCrewHubData(existing, newData) {
  const result = {
    screenType: 'crewHub',
    yourTeam: mergeYourTeam(existing.yourTeam, newData.yourTeam),
    enemyTeams: mergeEnemyTeams(existing.enemyTeams, newData.enemyTeams),
    hazards: mergeHazards(existing.hazards || [], newData.hazards || []),
    isPartialCapture: false,
    confidence: 0,
  };

  // Calculate combined confidence
  const existingConf = existing.confidence || 0;
  const newConf = newData.confidence || 0;
  result.confidence = Math.round((existingConf + newConf) / 2);

  // Update partial capture status using the same heuristic as the extractor:
  // flag only when counts are inconsistent (some teams much larger than others)
  // OR when universally sparse. Also require that the roster actually grew during
  // this merge — if it's stable, the teams are probably legitimately small.
  const existingTotal = (existing.enemyTeams || []).reduce((s, t) => s + (t.players?.length || 0), 0);
  const mergedTotal = result.enemyTeams.reduce((s, t) => s + t.players.length, 0);
  const rosterGrew = mergedTotal > existingTotal;
  const counts = result.enemyTeams.map(t => t.players.length);
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
  const minCount = counts.length > 0 ? Math.min(...counts) : 0;
  const isInconsistent = maxCount - minCount >= 2;
  const isUniversallySparse = maxCount <= 1 && result.enemyTeams.length >= 2;
  result.isPartialCapture = (isInconsistent || isUniversallySparse) && rosterGrew;

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
    players: capPlayerEntries(mergePlayers(existing.players, newData.players)),
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
    players: capPlayerEntries(mergePlayers(existing.players || [], newData.players || [])),
  };
}

/**
 * Merge enemy teams arrays
 * Matches teams by name similarity or color
 */
function mergeEnemyTeams(existingTeams = [], newTeams = []) {
  if (!existingTeams.length) {
    return (newTeams || []).map((team) => ({
      ...team,
      players: capPlayerEntries(team.players || []),
    }));
  }
  if (!newTeams.length) {
    return (existingTeams || []).map((team) => ({
      ...team,
      players: capPlayerEntries(team.players || []),
    }));
  }

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

      // Fill in ship type if missing
      if (!existingTeam.shipType && newTeam.shipType) {
        existingTeam.shipType = newTeam.shipType;
      }

      // Merge players
      existingTeam.players = capPlayerEntries(mergePlayers(existingTeam.players, newTeam.players));

      // Update confidence (average)
      existingTeam.confidence = Math.round(
        ((existingTeam.confidence || 0) + (newTeam.confidence || 0)) / 2
      );
    } else {
      // Add as new team (if under limit)
      if (mergedTeams.length < 4) {
        // Before adding, check if this team's name is a near-duplicate (≤15% edit
        // distance) of a name already claimed by a DIFFERENT color.  This happens
        // in 4-enemy-team matches where the scrolled crew2 screenshot still shows
        // the previous team's banner at the top — e.g. "EANCY GOOSE" (misread of
        // "FANCY GOOSE") gets assigned to yellowGreen while yellow already owns
        // "FANCY GOOSE".  Clear the bogus name so the map-screen name wins later.
        let cleanedName = newTeam.name || '';
        if (cleanedName && newTeam.color && newTeam.color !== 'unknown') {
          const normNew = normalizeTeamName(cleanedName);
          for (const existing of mergedTeams) {
            if (!existing.name || existing.color === newTeam.color) continue;
            const normEx = normalizeTeamName(existing.name);
            if (normEx.length >= 6 && normNew.length >= 6) {
              const ratio = levenshteinDistance(normNew, normEx) / Math.max(normNew.length, normEx.length);
              if (ratio <= 0.15) {
                console.warn('[Merger] Cleared leaked banner name "' + cleanedName + '" (near-dup of "' + existing.name + '" for color=' + existing.color + ')');
                cleanedName = '';
                break;
              }
            }
          }
        }
        mergedTeams.push({
          ...newTeam,
          name: cleanedName,
          players: capPlayerEntries(newTeam.players || []),
        });
      } else {
        console.warn('[Merger] Max 4 teams reached, ignoring additional team:', newTeam.name);
      }
    }
  }

  return sortTeamsByColor(
    mergedTeams.map((team) => ({
      ...team,
      players: capPlayerEntries(team.players || []),
    })),
    (team) => team?.color || team?.teamColor
  );
}

/**
 * Find matching team in array by name or color.
 * With v3 card scanner, team identity is primarily COLOR (from the bar below
 * each player name), so color match takes Priority 1.
 * @param {Array} teams - Existing teams
 * @param {Object} target - Team to match
 * @returns {number} Index of matching team, or -1
 */
function findMatchingTeam(teams, target) {
  // Priority 1: Color match (most reliable signal from v3 card scanner)
  if (target.color && target.color !== 'unknown') {
    const idx = teams.findIndex(t => t.color === target.color);
    if (idx >= 0) return idx;
  }

  // Priority 2: Exact name match — but reject if colors contradict
  const nameNormalized = normalizeTeamName(target.name);
  if (nameNormalized) {
    let idx = teams.findIndex(t => normalizeTeamName(t.name) === nameNormalized);
    if (idx >= 0) {
      const candidate = teams[idx];
      const colorContradicts =
        target.color && target.color !== 'unknown' &&
        candidate.color && candidate.color !== 'unknown' &&
        target.color !== candidate.color;
      if (!colorContradicts) return idx;
    }
  }

  // Priority 3: Fuzzy name match — also reject on color contradiction
  const fuzzyIdx = teams.findIndex(t => fuzzyTeamNameMatch(t.name, target.name));
  if (fuzzyIdx >= 0) {
    const candidate = teams[fuzzyIdx];
    const colorContradicts =
      target.color && target.color !== 'unknown' &&
      candidate.color && candidate.color !== 'unknown' &&
      target.color !== candidate.color;
    if (!colorContradicts) return fuzzyIdx;
  }

  return -1;
}

/**
 * Normalize team name for comparison
 */
function normalizeTeamName(name) {
  if (!name) return '';
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeShipTypeKey(value) {
  return String(value || '')
    .replace(/\s*\(\s*\d+\s*player[s]?\s*\)\s*$/i, '')
    .trim()
    .toLowerCase();
}

function normalizePlayerShipName(value, shipType = '') {
  const stripped = String(value || '')
    .replace(/\s*['’]s\s+crew\s*$/i, '')
    .trim();
  if (!stripped) return '';
  const lowered = stripped.toLowerCase();
  if (lowered === 'your team' || lowered === 'friendly team' || lowered === 'my crew') return '';
  const shipKey = normalizeShipTypeKey(shipType);
  if (shipKey && normalizeShipTypeKey(stripped) === shipKey) return '';
  return stripped;
}

function isPlaceholderTeamName(name, color = '') {
  const n = String(name || '').trim().toLowerCase();
  const c = String(color || '').trim().toLowerCase();
  if (!n) return true;
  if (/^enemy team \d+$/i.test(n) || /^team \d+$/i.test(n) || n === 'unknown team') return true;
  const colorWords = new Set(['red', 'orange', 'yellow', 'yellowgreen', 'green', 'blue', 'purple', 'unknown']);
  if (colorWords.has(n)) return true;
  if (c && n === c) return true;
  return false;
}

function pickPreferredTeamName(currentName, candidateName, context = {}) {
  const curr = String(currentName || '').trim();
  const cand = String(candidateName || '').trim();
  if (!cand) return curr;
  if (!curr) return cand;
  const currPlaceholder = isPlaceholderTeamName(curr, context.color || '');
  const candPlaceholder = isPlaceholderTeamName(cand, context.color || '');
  if (currPlaceholder && !candPlaceholder) return cand;
  if (!currPlaceholder && candPlaceholder) return curr;
  if (context.preferCandidate) return cand;
  return cand.length > curr.length ? cand : curr;
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

function normalizeColorToken(color) {
  return String(color || '').trim().toLowerCase();
}

function shouldMergeEnemyShipEntry(existingShip, incomingShip) {
  const existingNameRaw = String(existingShip?.teamName || '').trim();
  const incomingNameRaw = String(incomingShip?.teamName || '').trim();
  const existingNameKey = normalizeTeamName(existingNameRaw);
  const incomingNameKey = normalizeTeamName(incomingNameRaw);

  if (existingNameKey && incomingNameKey && existingNameKey === incomingNameKey) {
    return true;
  }

  const existingColor = normalizeColorToken(existingShip?.color || existingShip?.teamColor || '');
  const incomingColor = normalizeColorToken(incomingShip?.color || incomingShip?.teamColor || '');
  const existingShipTypeKey = normalizeShipTypeKey(existingShip?.shipType || '');
  const incomingShipTypeKey = normalizeShipTypeKey(incomingShip?.shipType || '');
  if (
    existingColor === 'unknown' &&
    incomingColor === 'unknown' &&
    existingShipTypeKey &&
    incomingShipTypeKey &&
    existingShipTypeKey === incomingShipTypeKey
  ) {
    return true;
  }
  if (!existingColor || !incomingColor || existingColor === 'unknown' || incomingColor === 'unknown') {
    return false;
  }
  if (existingColor !== incomingColor) return false;

  const existingPlaceholder = isPlaceholderTeamName(existingNameRaw, existingColor);
  const incomingPlaceholder = isPlaceholderTeamName(incomingNameRaw, incomingColor);
  if (!existingPlaceholder && !incomingPlaceholder) {
    // Two named teams sharing a color should stay separate.
    return false;
  }

  if (existingShipTypeKey && incomingShipTypeKey && existingShipTypeKey !== incomingShipTypeKey) {
    // Same color placeholder rows can still represent distinct ships.
    return false;
  }
  return true;
}

/**
 * Merge enemy ships arrays
 */
function mergeEnemyShips(existing = [], newShips = []) {
  if (!existing.length) return newShips;
  if (!newShips.length) return existing;

  const merged = [...existing];

  for (const newShip of newShips) {
    const matchIdx = merged.findIndex((ship) => shouldMergeEnemyShipEntry(ship, newShip));

    if (matchIdx >= 0) {
      // Update existing ship info
      const ship = merged[matchIdx];
      if (!ship.shipType && newShip.shipType) ship.shipType = newShip.shipType;
      ship.teamName = pickPreferredTeamName(ship.teamName, newShip.teamName, {
        color: ship.color || newShip.color || '',
      });
      if (normalizeColorToken(ship.color) === 'unknown' && normalizeColorToken(newShip.color) !== 'unknown') {
        ship.color = newShip.color;
      }
      ship.confidence = Math.round(((ship.confidence || 0) + (newShip.confidence || 0)) / 2);
    } else {
      merged.push({ ...newShip });
    }
  }

  return sortTeamsByColor(merged, (team) => team?.color || team?.teamColor);
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

  // Add new players (deduplicating, with fuzzy fallback for near-identical names
  // such as "Ondra-ocasek" vs "Ondra-ocasex" where OCR misread one trailing char).
  for (const player of newPlayers) {
    const name = typeof player === 'string' ? player : player?.name;
    if (name) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        // Fuzzy check: for names ≥8 chars, see if we already have a near-identical one (≤2 edits)
        let fuzzyKey = null;
        if (name.length >= 8) {
          for (const existingKey of seen.keys()) {
            if (Math.abs(existingKey.length - key.length) > 2) continue;
            const minLen = Math.min(existingKey.length, key.length);
            const keyHasDigit = /\d/.test(key);
            const existingHasDigit = /\d/.test(existingKey);
            // Avoid conflating short digit-suffixed tags with letter-only tags
            // (e.g. Riv2... vs Rive...): keep strict unless the shared stem is long.
            if (keyHasDigit !== existingHasDigit && minLen < 10) continue;
            if (levenshteinDistance(key, existingKey) <= 2) { fuzzyKey = existingKey; break; }
          }
        }
        if (fuzzyKey) {
          // Near-duplicate: keep the longer version (more OCR chars recovered)
          const existingName = (() => { const e = seen.get(fuzzyKey); return typeof e === 'string' ? e : (e?.name || ''); })();
          if (name.length > existingName.length) seen.set(fuzzyKey, player);
          // else keep existing as-is
        } else {
          seen.set(key, player);
        }
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

  // ── Internal format ────────────────────────────────────────────────────────
  if (data.yourTeam?.name) {
    parts.push('Y:' + normalizeTeamName(data.yourTeam.name));
  }
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
  if (data.enemyShips?.length > 0) {
    for (const ship of data.enemyShips) {
      if (ship.teamName) parts.push('S:' + normalizeTeamName(ship.teamName));
    }
  }
  if (data.yourShip?.teamName) {
    parts.push('Y:' + normalizeTeamName(data.yourShip.teamName));
  }

  // ── Legacy format (screenshotType: 'crew_hub' | 'tactical_map') ───────────
  if (data.playerTeamName) {
    parts.push('Y:' + normalizeTeamName(data.playerTeamName));
  }
  if (data.opponentTeams?.length > 0) {
    for (const team of data.opponentTeams) {
      if (team.teamName) parts.push('E:' + normalizeTeamName(team.teamName));
      if (team.players?.length > 0) {
        const firstPlayer = team.players[0];
        const name = typeof firstPlayer === 'string' ? firstPlayer : firstPlayer?.name;
        if (name) parts.push('P:' + name.toLowerCase().substring(0, 8));
      }
    }
  }
  if (data.teammates?.length > 0) {
    const firstTm = data.teammates[0];
    const name = typeof firstTm === 'string' ? firstTm : firstTm?.name;
    if (name) parts.push('TM:' + name.toLowerCase().substring(0, 8));
  }
  if (data.playerShip?.teamName) {
    parts.push('Y:' + normalizeTeamName(data.playerShip.teamName));
  }

  // Deduplicate parts
  return [...new Set(parts)].join('|');
}

/**
 * Check if two captures are from the same match
 */
function isSameMatch(data1, data2) {
  const fp1 = createCaptureFingerprint(data1);
  const fp2 = createCaptureFingerprint(data2);

  if (!fp1 || !fp2) return false;

  const parts1 = fp1.split('|');
  const parts2 = new Set(fp2.split('|'));

  // Categorise each shared part
  let yourTeamShared = 0;
  let enemyTeamShared = 0;
  let totalShared = 0;
  for (const part of parts1) {
    if (!parts2.has(part)) continue;
    totalShared++;
    if (part.startsWith('Y:') || part.startsWith('S:')) yourTeamShared++;
    if (part.startsWith('E:') || part.startsWith('P:') || part.startsWith('TM:')) enemyTeamShared++;
  }

  // Strong cross-type signal: your-team name + at least one enemy indicator shared.
  // This handles tactical-map vs crew-hub pairings where only some enemy team names
  // overlap (e.g. one team name was read differently in each screenshot).
  if (yourTeamShared >= 1 && enemyTeamShared >= 1) return true;

  // Fallback for cross-type (tac-map vs crew-hub) when the crew-hub OCR didn't capture
  // the player's own team name banner: matching 2+ enemy team names is strong enough
  // evidence that both captures are from the same match.
  if (enemyTeamShared >= 2) return true;

  // Fallback: plain ratio check (>50% of ALL parts in common)
  return totalShared / Math.max(parts1.length, parts2.size) > 0.5;
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
