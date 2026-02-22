/**
 * @module electron/helpers/artifactPathResolver
 * Resolves match artifact folder paths using canonical match numbers.
 */
const fs = require('fs');
const path = require('path');
const { buildCanonicalMatchNumberMaps, toPositiveInt } = require('./canonicalMatchNumbers.cjs');

let cache = {
  dbPath: null,
  mtimeMs: 0,
  size: 0,
  snapshot: null,
};

function readDbSnapshot(dbPath) {
  let stat = null;
  try {
    stat = fs.statSync(dbPath);
  } catch {
    return {
      idToCanonical: new Map(),
      canonicalToId: new Map(),
      nextCanonicalMatchNumber: 1,
    };
  }
  const mtimeMs = Number(stat.mtimeMs || 0);
  const size = Number(stat.size || 0);
  if (
    cache.snapshot
    && cache.dbPath === dbPath
    && cache.mtimeMs === mtimeMs
    && cache.size === size
  ) {
    return cache.snapshot;
  }

  let raw = null;
  try {
    raw = fs.readFileSync(dbPath, 'utf-8');
  } catch {
    raw = null;
  }

  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  const matches = Array.isArray(parsed?.matches) ? parsed.matches : [];
  const nextHint = toPositiveInt(parsed?.storageMeta?.nextCanonicalMatchNumber) || 1;
  const maps = buildCanonicalMatchNumberMaps(matches, { mutateMissing: false, nextCanonicalHint: nextHint });
  cache = {
    dbPath,
    mtimeMs,
    size,
    snapshot: maps,
  };
  return maps;
}

function invalidateCache() {
  cache = {
    dbPath: null,
    mtimeMs: 0,
    size: 0,
    snapshot: null,
  };
}

function normalizeMatchId(matchId) {
  return toPositiveInt(matchId);
}

function resolveMatchArtifactDir({ userData, matchId, mode = 'read' } = {}) {
  const normalizedMatchId = normalizeMatchId(matchId);
  if (!normalizedMatchId || !userData) return null;

  const matchArtifactsRoot = path.join(userData, 'match_artifacts');
  const dbPath = path.join(userData, 'wildgate_db.json');
  const maps = readDbSnapshot(dbPath);
  const canonical = toPositiveInt(maps.idToCanonical.get(normalizedMatchId));

  const canonicalDir = canonical
    ? path.join(matchArtifactsRoot, String(canonical))
    : null;
  const legacyDir = path.join(matchArtifactsRoot, String(normalizedMatchId));

  const canonicalExists = !!(canonicalDir && fs.existsSync(canonicalDir));
  const legacyExists = fs.existsSync(legacyDir);

  let matchDir = legacyDir;
  if (mode === 'write') {
    if (canonicalDir) matchDir = canonicalDir;
    else matchDir = legacyDir;
  } else if (canonicalExists) {
    matchDir = canonicalDir;
  } else if (legacyExists) {
    matchDir = legacyDir;
  } else if (canonicalDir) {
    matchDir = canonicalDir;
  }

  return {
    matchId: normalizedMatchId,
    canonicalMatchNumber: canonical || null,
    folderName: path.basename(matchDir),
    matchDir,
    canonicalDir: canonicalDir || legacyDir,
    legacyDir,
    matchArtifactsRoot,
  };
}

function resolveMatchIdForFolder(userData, folderNumber) {
  const normalizedFolder = toPositiveInt(folderNumber);
  if (!normalizedFolder || !userData) return null;
  const dbPath = path.join(userData, 'wildgate_db.json');
  const maps = readDbSnapshot(dbPath);
  if (maps.canonicalToId.has(normalizedFolder)) return maps.canonicalToId.get(normalizedFolder);
  return normalizedFolder;
}

function getCanonicalSnapshot(userData) {
  if (!userData) {
    return {
      idToCanonical: new Map(),
      canonicalToId: new Map(),
      nextCanonicalMatchNumber: 1,
    };
  }
  const dbPath = path.join(userData, 'wildgate_db.json');
  return readDbSnapshot(dbPath);
}

module.exports = {
  resolveMatchArtifactDir,
  resolveMatchIdForFolder,
  getCanonicalSnapshot,
  invalidateCache,
};

