/**
 * Fallback artifact relinker helper.
 * Keeps IPC contract stable even when no relink strategy is available yet.
 */
const fs = require('fs');

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function getMatchCount(db) {
  if (!db || typeof db !== 'object') return 0;
  if (Array.isArray(db.matches)) return db.matches.length;
  if (Array.isArray(db.history)) return db.history.length;
  return 0;
}

function previewArtifactRepair({ dbPath } = {}) {
  const db = readJsonSafe(dbPath);
  return {
    summary: {
      mode: 'preview',
      matches: getMatchCount(db),
      candidatesScanned: 0,
      candidatesEligible: 0,
      plannedLinks: 0,
    },
    candidates: [],
  };
}

function applyArtifactRepair({ dbPath } = {}) {
  const db = readJsonSafe(dbPath);
  return {
    summary: {
      mode: 'apply',
      matches: getMatchCount(db),
      candidatesScanned: 0,
      candidatesEligible: 0,
      plannedLinks: 0,
      appliedLinks: 0,
      updatedMatches: 0,
    },
    candidates: [],
    applied: [],
  };
}

module.exports = {
  previewArtifactRepair,
  applyArtifactRepair,
};
