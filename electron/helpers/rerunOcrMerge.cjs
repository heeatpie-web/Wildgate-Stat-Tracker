'use strict';

const { mergeCaptures, isSameMatch, pickPreferredTeammateRoster } = require('../ocrMerger.cjs');

/**
 * Merge the per-image OCR results of one rerun batch into a single extraction.
 *
 * This is the single source of truth for the rerun merge so the in-app
 * "Rerun OCR" path and the ground-truth corpus runner cannot drift apart. They
 * previously each had their own copy, which is why the corpus did not catch the
 * bug where tactical-map results overwrote crew-hub rosters.
 *
 * @param {Array<{imagePath?: string, success?: boolean, data?: object}>} perFile
 *   Per-image results, in the order they should be merged. Callers pass crew_hub
 *   captures ahead of tactical_map captures so the accumulator seeds from the
 *   roster-bearing screenshot.
 * @param {{log?: (message: string) => void}} [options]
 * @returns {object|null} merged extraction, or null when nothing succeeded.
 */
function mergeRerunResults(perFile, options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  const entries = Array.isArray(perFile) ? perFile : [];

  let accumulatedData = null;
  for (const entry of entries) {
    if (!entry || entry.success === false || !entry.data) continue;
    const label = String(entry.imagePath || '').split(/[\\/]/).pop() || 'unknown';
    if (!accumulatedData) {
      log('seed: type=' + (entry.data.screenshotType || '?')
        + ' oppTeams=' + (entry.data.opponentTeams?.length || 0) + ' file=' + label);
      accumulatedData = entry.data;
      continue;
    }
    const sameMatch = isSameMatch(accumulatedData, entry.data);
    log('isSameMatch(acc.type=' + (accumulatedData.screenshotType || '?')
      + ' vs ' + (entry.data.screenshotType || '?') + ')=' + sameMatch + ' file=' + label);
    if (!sameMatch) {
      // A rerun batch is always one match's artifacts, so a classifier
      // disagreement should not discard already-merged aggregate fields.
      log('MISMATCH forced-merge with type=' + (entry.data.screenshotType || '?') + ' file=' + label);
    }
    accumulatedData = mergeCaptures(accumulatedData, entry.data);
    const teamCount = accumulatedData.opponentTeams?.length || 0;
    const playerCount = (accumulatedData.opponentTeams || [])
      .reduce((sum, team) => sum + (team.players?.length || 0), 0);
    log('merged: type=' + (accumulatedData.screenshotType || '?')
      + ' oppTeams=' + teamCount + ' totalPlayers=' + playerCount);
  }

  if (!accumulatedData) return null;

  // The crew hub is the authoritative roster view; prefer its teammate list over
  // whatever survived the cross-type merge.
  let preferredCrewHubTeammates = [];
  for (const entry of entries) {
    if (!entry || entry.success === false || !entry.data) continue;
    if (entry.data.screenshotType !== 'crew_hub') continue;
    preferredCrewHubTeammates = pickPreferredTeammateRoster(
      preferredCrewHubTeammates,
      entry.data.teammates || []
    );
  }
  if (preferredCrewHubTeammates.length > 0) {
    const priorTeammates = Array.isArray(accumulatedData.teammates) ? accumulatedData.teammates : [];
    const resolvedTeammates = pickPreferredTeammateRoster(priorTeammates, preferredCrewHubTeammates);
    const rosterKey = (list) => list
      .map((player) => (typeof player === 'string' ? player : player?.name || ''))
      .join('|');
    const priorRosterKey = rosterKey(priorTeammates);
    const resolvedRosterKey = rosterKey(resolvedTeammates);
    if (resolvedRosterKey && resolvedRosterKey !== priorRosterKey) {
      log('teammates preferred from crew_hub=' + resolvedRosterKey);
      accumulatedData = { ...accumulatedData, teammates: resolvedTeammates };
    }
  }

  return accumulatedData;
}

module.exports = { mergeRerunResults };
