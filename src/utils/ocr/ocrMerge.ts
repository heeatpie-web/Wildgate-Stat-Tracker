/**
 * OCR Data Merging Utilities
 * Intelligently merge multiple OCR captures from the same match
 */

import type { OCRExtractedData, ExtractedPlayer, ExtractedOpponentTeam, ExtractedModifier } from './ocrTypes';
import { deduplicatePlayersByLikelyName } from './playerNameMatching';

/**
 * Deduplicate players by likely OCR-normalized name
 * Keeps highest confidence while preferring cleaner display names
 */
function deduplicatePlayers(players: ExtractedPlayer[]): ExtractedPlayer[] {
  return deduplicatePlayersByLikelyName(players);
}

/**
 * Deduplicate modifiers by name (case-insensitive)
 * Keeps the entry with the highest confidence
 */
function deduplicateModifiers(modifiers: ExtractedModifier[]): ExtractedModifier[] {
  const modifierMap = new Map<string, ExtractedModifier>();

  for (const modifier of modifiers) {
    const key = modifier.name.toLowerCase();
    const existing = modifierMap.get(key);

    if (!existing || modifier.confidence > existing.confidence) {
      modifierMap.set(key, modifier);
    }
  }

  return Array.from(modifierMap.values());
}

/**
 * Merge opponent teams by team name
 * Combines player lists and uses highest confidence values
 */
function mergeOpponentTeams(
  existing: ExtractedOpponentTeam[],
  incoming: ExtractedOpponentTeam[]
): ExtractedOpponentTeam[] {
  const teamMap = new Map<string, ExtractedOpponentTeam>();

  // Add existing teams
  for (const team of existing) {
    const key = team.teamName.toLowerCase();
    teamMap.set(key, team);
  }

  // Merge incoming teams
  for (const incomingTeam of incoming) {
    const key = incomingTeam.teamName.toLowerCase();
    const existingTeam = teamMap.get(key);

    if (existingTeam) {
      // Merge: combine players and use better data
      const mergedTeam: ExtractedOpponentTeam = {
        teamName: existingTeam.confidence >= incomingTeam.confidence
          ? existingTeam.teamName
          : incomingTeam.teamName,
        shipType: existingTeam.shipType || incomingTeam.shipType,
        color: existingTeam.color !== 'unknown' ? existingTeam.color : incomingTeam.color,
        players: deduplicatePlayers([
          ...existingTeam.players,
          ...incomingTeam.players
        ]),
        confidence: Math.max(existingTeam.confidence, incomingTeam.confidence),
      };

      teamMap.set(key, mergedTeam);
    } else {
      // New team
      teamMap.set(key, incomingTeam);
    }
  }

  return Array.from(teamMap.values());
}

/**
 * Merge two OCR results from the same match
 *
 * Strategy:
 * - Teammates: deduplicate by name, keep highest confidence
 * - Opponent teams: merge by team name, combine player lists
 * - Modifiers: deduplicate by name, keep highest confidence
 * - Ship info: prefer non-empty values, use highest confidence
 * - Timestamps: use earliest capture time
 * - Confidence: recalculate based on merged data
 *
 * @param existing - The existing accumulated OCR data
 * @param incoming - New OCR data to merge in
 * @returns Merged OCR data
 */
export function mergeFullOCRData(
  existing: OCRExtractedData,
  incoming: OCRExtractedData
): OCRExtractedData {
  console.log('[OCR Merge] Merging data:', {
    existingType: existing.screenshotType,
    incomingType: incoming.screenshotType,
    existingTeammates: existing.teammates.length,
    incomingTeammates: incoming.teammates.length,
    existingOpponents: existing.opponentTeams.length,
    incomingOpponents: incoming.opponentTeams.length,
  });

  // Merge teammates
  const mergedTeammates = deduplicatePlayers([
    ...existing.teammates,
    ...incoming.teammates
  ]);

  // Merge opponent teams
  const mergedOpponentTeams = mergeOpponentTeams(
    existing.opponentTeams,
    incoming.opponentTeams
  );

  // Merge modifiers
  const mergedModifiers = deduplicateModifiers([
    ...existing.reachModifiers,
    ...incoming.reachModifiers
  ]);

  // Merge enemy ships (from tactical map) - deduplicate by team name
  const enemyShipMap = new Map<string, typeof existing.enemyShips[0]>();

  for (const ship of existing.enemyShips) {
    enemyShipMap.set(ship.teamName.toLowerCase(), ship);
  }

  for (const ship of incoming.enemyShips) {
    const key = ship.teamName.toLowerCase();
    const existingShip = enemyShipMap.get(key);

    if (!existingShip || ship.color !== 'unknown') {
      enemyShipMap.set(key, ship);
    }
  }

  const mergedEnemyShips = Array.from(enemyShipMap.values());

  // Player ship: prefer non-empty values, use higher confidence
  let mergedPlayerShip = existing.playerShip;
  if (incoming.playerShip) {
    if (!mergedPlayerShip || incoming.playerShip.confidence > mergedPlayerShip.confidence) {
      mergedPlayerShip = incoming.playerShip;
    }
  }

  // Player team name: prefer non-empty
  const mergedPlayerTeamName = existing.playerTeamName || incoming.playerTeamName;

  // Calculate overall confidence based on merged data
  const allConfidences = [
    ...mergedTeammates.map(t => t.confidence),
    ...mergedOpponentTeams.map(t => t.confidence),
    ...mergedModifiers.map(m => m.confidence),
    mergedPlayerShip?.confidence || 0,
  ].filter(c => c > 0);

  const mergedConfidence = allConfidences.length > 0
    ? allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length
    : Math.max(existing.overallConfidence, incoming.overallConfidence);

  // Screenshot type: prefer more specific types
  const typePreference = { 'crew_hub': 3, 'tactical_map': 2, 'unknown': 1 };
  const mergedType = typePreference[existing.screenshotType] >= typePreference[incoming.screenshotType]
    ? existing.screenshotType
    : incoming.screenshotType;

  // Use earliest timestamp
  const mergedTimestamp = Math.min(existing.captureTimestamp, incoming.captureTimestamp);

  // Merge hazards (deduplicate case-insensitively)
  const mergedHazards = (() => {
    const both = [...(existing.hazards || []), ...(incoming.hazards || [])];
    if (both.length === 0) return undefined;
    const seen = new Set<string>();
    return both.filter(h => {
      const key = h.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  // Artifact type: prefer non-empty value
  const mergedArtifactType = existing.artifactType || incoming.artifactType;

  // Raw text: only concatenate if at least one is present
  const mergedRawText = (existing.rawText || incoming.rawText)
    ? (existing.rawText || '') + (existing.rawText && incoming.rawText ? '\n---MERGE---\n' : '') + (incoming.rawText || '')
    : undefined;

  const merged: OCRExtractedData = {
    screenshotType: mergedType,
    playerShip: mergedPlayerShip,
    playerTeamName: mergedPlayerTeamName,
    reachModifiers: mergedModifiers,
    enemyShips: mergedEnemyShips,
    teammates: mergedTeammates,
    opponentTeams: mergedOpponentTeams,
    overallConfidence: mergedConfidence,
    captureTimestamp: mergedTimestamp,
    ...(mergedHazards !== undefined && { hazards: mergedHazards }),
    ...(mergedArtifactType !== undefined && { artifactType: mergedArtifactType }),
    ...(mergedRawText !== undefined && { rawText: mergedRawText }),
  };

  console.log('[OCR Merge] Merge complete:', {
    teammates: merged.teammates.length,
    opponentTeams: merged.opponentTeams.length,
    totalPlayers: merged.teammates.length + merged.opponentTeams.reduce((sum, t) => sum + t.players.length, 0),
  });

  return merged;
}

/**
 * Check if two OCR captures are likely from the same match session
 *
 * @param data1 - First OCR capture
 * @param data2 - Second OCR capture
 * @param maxTimeDiffMs - Maximum time difference in milliseconds (default: 5 minutes)
 * @returns True if captures are likely from the same match
 */
export function isSameMatchSession(
  data1: OCRExtractedData,
  data2: OCRExtractedData,
  maxTimeDiffMs: number = 5 * 60 * 1000 // 5 minutes
): boolean {
  // Check timestamp proximity
  const timeDiff = Math.abs(data1.captureTimestamp - data2.captureTimestamp);
  if (timeDiff > maxTimeDiffMs) {
    return false;
  }

  // If both have player ship info, team names should match
  if (data1.playerTeamName && data2.playerTeamName) {
    if (data1.playerTeamName.toLowerCase() !== data2.playerTeamName.toLowerCase()) {
      return false;
    }
  }

  // If both have modifiers, at least some should overlap
  if (data1.reachModifiers.length > 0 && data2.reachModifiers.length > 0) {
    const modifiers1 = new Set(data1.reachModifiers.map(m => m.name.toLowerCase()));
    const modifiers2 = new Set(data2.reachModifiers.map(m => m.name.toLowerCase()));

    let overlap = 0;
    for (const mod of modifiers1) {
      if (modifiers2.has(mod)) overlap++;
    }

    // At least 30% overlap in modifiers
    if (overlap / Math.min(modifiers1.size, modifiers2.size) < 0.3) {
      return false;
    }
  }

  return true;
}

/**
 * Create an empty OCR data structure for accumulation
 */
export function createEmptyOCRData(): OCRExtractedData {
  return {
    screenshotType: 'unknown',
    reachModifiers: [],
    enemyShips: [],
    teammates: [],
    opponentTeams: [],
    overallConfidence: 0,
    captureTimestamp: Date.now(),
  };
}
