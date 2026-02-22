/**
 * @module electron/helpers/artifactCanonicalMigration
 * One-time migration to canonical artifact folder numbering and duplicate cleanup.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildCanonicalMatchNumberMaps, toPositiveInt } = require('./canonicalMatchNumbers.cjs');
const artifactPathResolver = require('./artifactPathResolver.cjs');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);
const DEFAULT_MAX_DELTA_MS = Number(process.env.WILDGATE_ARTIFACT_REPAIR_MAX_DELTA_MS || (30 * 60 * 1000));
const DEFAULT_FALLBACK_MAX_DELTA_MS = Number(process.env.WILDGATE_ARTIFACT_REPAIR_FALLBACK_MAX_DELTA_MS || (12 * 60 * 60 * 1000));
const MIGRATION_MARKER_KEY = 'artifactCanonicalMigrationV1At';

function toPathKey(inputPath) {
  return path.resolve(inputPath).replace(/[\\/]+/g, '\\').toLowerCase();
}

function readJsonSafe(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function writeJsonPrettyAtomic(filePath, value) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tempPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tempPath, payload, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function createBackup(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.artifact-canonical-migration.${stamp}.bak`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function walkFiles(rootPath) {
  const output = [];
  if (!rootPath || !fs.existsSync(rootPath)) return output;
  const stack = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        output.push(fullPath);
      }
    }
  }
  return output;
}

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function parseCaptureTimestampMs(name) {
  const match = String(name || '').match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/);
  if (!match) return null;
  const token = match[0];
  const iso = `${token.slice(0, 13)}:${token.slice(14, 16)}:${token.slice(17, 19)}.${token.slice(20, 23)}Z`;
  const millis = Date.parse(iso);
  return Number.isFinite(millis) ? millis : null;
}

function normalizeEpochMs(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed < 1000000000000 ? parsed * 1000 : parsed;
}

function parseMatchDurationMs(match) {
  if (!match || typeof match !== 'object') return 0;
  const timeValue = typeof match.time === 'string' ? match.time.trim() : '';
  if (!timeValue || !timeValue.includes(':')) return 0;
  const parts = timeValue.split(':').map((token) => Number(token));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  if (parts.length === 2) return ((parts[0] * 60) + parts[1]) * 1000;
  if (parts.length === 3) return ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
  return 0;
}

function parseMatchTimestampMs(match) {
  if (!match || typeof match !== 'object') return 0;
  const direct = normalizeEpochMs(match.timestamp);
  if (direct > 0) return direct;
  const dateString = typeof match.date === 'string' ? match.date.trim() : '';
  if (!dateString) return 0;
  const parsedDate = Date.parse(dateString);
  return Number.isFinite(parsedDate) ? parsedDate : 0;
}

function buildMatchWindows(sortedMatches, fallbackMaxDeltaMs) {
  return sortedMatches.map((match, index) => {
    const prev = index > 0 ? sortedMatches[index - 1] : null;
    const next = index < sortedMatches.length - 1 ? sortedMatches[index + 1] : null;
    const midpointStart = prev ? Math.round((prev.timestamp + match.timestamp) / 2) : (match.timestamp - fallbackMaxDeltaMs);
    const midpointEnd = next ? Math.round((next.timestamp + match.timestamp) / 2) : (match.timestamp + fallbackMaxDeltaMs);
    const durationStart = match.durationMs > 0 ? Math.max(0, match.timestamp - match.durationMs) : midpointStart;
    return {
      id: match.id,
      timestamp: match.timestamp,
      startMs: Math.min(midpointStart, durationStart),
      endMs: midpointEnd,
    };
  });
}

function findWindowMatch(matchWindows, timestampMs, fallbackMaxDeltaMs) {
  for (const matchWindow of matchWindows) {
    if (timestampMs < matchWindow.startMs || timestampMs > matchWindow.endMs) continue;
    const deltaMs = Math.abs(matchWindow.timestamp - timestampMs);
    if (deltaMs > fallbackMaxDeltaMs) continue;
    return { id: matchWindow.id, deltaMs };
  }
  return null;
}

function findNearestMatch(sortedMatches, timestampMs, maxDeltaMs) {
  let nearest = null;
  let bestDelta = Number.MAX_SAFE_INTEGER;
  for (const match of sortedMatches) {
    const delta = Math.abs(Number(match.timestamp || 0) - Number(timestampMs));
    if (delta < bestDelta) {
      bestDelta = delta;
      nearest = match;
    }
  }
  if (!nearest || bestDelta > maxDeltaMs) return null;
  return { id: nearest.id, deltaMs: bestDelta };
}

function buildSortedMatchMeta(matches) {
  const sorted = [];
  for (const match of matches) {
    const id = toPositiveInt(match?.id);
    if (!id) continue;
    const ts = parseMatchTimestampMs(match);
    if (!ts) continue;
    sorted.push({
      id,
      timestamp: ts,
      durationMs: parseMatchDurationMs(match),
    });
  }
  sorted.sort((a, b) => a.timestamp - b.timestamp);
  return sorted;
}

function moveFileSync(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch {
    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }
}

function deleteFileBestEffort(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function removeDirBestEffort(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function hashFile(filePath, hashCache) {
  const key = toPathKey(filePath);
  if (hashCache.has(key)) return hashCache.get(key);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  hashCache.set(key, hash);
  return hash;
}

function areFilesIdentical(pathA, pathB, hashCache) {
  const statA = safeStat(pathA);
  const statB = safeStat(pathB);
  if (!statA || !statB || !statA.isFile() || !statB.isFile()) return false;
  if (Number(statA.size) !== Number(statB.size)) return false;
  return hashFile(pathA, hashCache) === hashFile(pathB, hashCache);
}

function chooseUniquePath(basePath, sourcePath, hashCache) {
  if (!fs.existsSync(basePath)) return basePath;
  if (areFilesIdentical(basePath, sourcePath, hashCache)) return basePath;
  const parsed = path.parse(basePath);
  for (let i = 1; i <= 5000; i += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}__migrated_${i}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    if (areFilesIdentical(candidate, sourcePath, hashCache)) return candidate;
  }
  return path.join(parsed.dir, `${Date.now()}_${path.basename(basePath)}`);
}

function moveOrDedupeFile(sourcePath, targetPath, hashCache) {
  if (!fs.existsSync(targetPath)) {
    moveFileSync(sourcePath, targetPath);
    return { finalPath: targetPath, moved: true, duplicateDeleted: false, renamed: false };
  }
  if (areFilesIdentical(sourcePath, targetPath, hashCache)) {
    deleteFileBestEffort(sourcePath);
    return { finalPath: targetPath, moved: false, duplicateDeleted: true, renamed: false };
  }
  const uniquePath = chooseUniquePath(targetPath, sourcePath, hashCache);
  if (toPathKey(uniquePath) === toPathKey(targetPath) && fs.existsSync(uniquePath)) {
    deleteFileBestEffort(sourcePath);
    return { finalPath: uniquePath, moved: false, duplicateDeleted: true, renamed: false };
  }
  moveFileSync(sourcePath, uniquePath);
  return { finalPath: uniquePath, moved: true, duplicateDeleted: false, renamed: toPathKey(uniquePath) !== toPathKey(targetPath) };
}

function mergeDirectoryInto(sourceDir, targetDir, stats, hashCache, rewriteMap) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  const files = walkFiles(sourceDir);
  for (const sourcePath of files) {
    const relative = path.relative(sourceDir, sourcePath);
    const preferredTarget = path.join(targetDir, relative);
    const moveResult = moveOrDedupeFile(sourcePath, preferredTarget, hashCache);
    if (moveResult.moved) stats.filesMoved += 1;
    if (moveResult.duplicateDeleted) stats.duplicateFilesDeleted += 1;
    if (moveResult.renamed) stats.conflictRenames += 1;
    rewriteMap.set(toPathKey(sourcePath), moveResult.finalPath);
  }
  removeDirBestEffort(sourceDir);
}

function pickTargetMatchId(timestampMs, sortedMatches, matchWindows, maxDeltaMs, fallbackMaxDeltaMs) {
  if (!Number.isFinite(timestampMs)) return null;
  const nearest = findNearestMatch(sortedMatches, timestampMs, maxDeltaMs);
  if (nearest) return nearest.id;
  const windowed = findWindowMatch(matchWindows, timestampMs, fallbackMaxDeltaMs);
  if (windowed) return windowed.id;
  return null;
}

function rewriteArtifactArrayPaths(match, context) {
  const artifacts = Array.isArray(match.artifacts) ? match.artifacts : [];
  if (artifacts.length === 0) return false;

  const nextArtifacts = [];
  const seen = new Set();
  const id = toPositiveInt(match.id);
  const canonical = id ? (context.idToCanonical.get(id) || id) : null;
  const legacyDir = id ? path.join(context.matchArtifactsRoot, String(id)) : null;
  const canonicalDir = canonical ? path.join(context.matchArtifactsRoot, String(canonical)) : null;

  for (const rawPath of artifacts) {
    if (typeof rawPath !== 'string' || !rawPath.trim()) continue;
    let nextPath = rawPath.trim();
    const rawKey = toPathKey(nextPath);

    if (context.rewriteMap.has(rawKey)) {
      nextPath = context.rewriteMap.get(rawKey);
    } else if (context.duplicatePathMap.has(rawKey)) {
      nextPath = context.duplicatePathMap.get(rawKey);
    } else if (legacyDir && canonicalDir) {
      const rel = path.relative(legacyDir, nextPath);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        const rewritten = path.join(canonicalDir, rel);
        if (fs.existsSync(rewritten) || !fs.existsSync(nextPath)) {
          nextPath = rewritten;
        }
      }
    }

    const absolute = path.resolve(nextPath);
    const key = toPathKey(absolute);
    if (seen.has(key)) continue;
    seen.add(key);
    nextArtifacts.push(absolute);
  }

  const changed = nextArtifacts.length !== artifacts.length
    || nextArtifacts.some((value, index) => value !== artifacts[index]);
  if (changed) {
    match.artifacts = nextArtifacts;
  }
  return changed;
}

function dedupeCanonicalFolder(folderPath, hashCache, duplicatePathMap, stats) {
  if (!fs.existsSync(folderPath)) return;
  const files = walkFiles(folderPath).filter(isImageFile);
  const hashToKeeper = new Map();
  for (const filePath of files) {
    const key = toPathKey(filePath);
    const hash = hashFile(filePath, hashCache);
    if (!hashToKeeper.has(hash)) {
      hashToKeeper.set(hash, filePath);
      continue;
    }
    const keeper = hashToKeeper.get(hash);
    duplicatePathMap.set(key, keeper);
    deleteFileBestEffort(filePath);
    stats.duplicateFilesDeleted += 1;
  }
}

function processOrphanDirectory(orphanDir, orphanName, context) {
  const files = walkFiles(orphanDir);
  if (files.length === 0) {
    removeDirBestEffort(orphanDir);
    return;
  }

  for (const sourcePath of files) {
    const relative = path.relative(orphanDir, sourcePath);
    if (!relative || relative.startsWith('..')) continue;
    const stat = safeStat(sourcePath);
    if (!stat || !stat.isFile()) continue;

    let moved = false;
    if (isImageFile(sourcePath)) {
      const timestampMs = parseCaptureTimestampMs(path.basename(sourcePath))
        || Number(stat.birthtimeMs || stat.mtimeMs || 0)
        || null;
      const targetMatchId = pickTargetMatchId(
        timestampMs,
        context.sortedMatches,
        context.matchWindows,
        context.maxDeltaMs,
        context.fallbackMaxDeltaMs
      );
      if (targetMatchId && context.idToCanonical.has(targetMatchId)) {
        const canonical = context.idToCanonical.get(targetMatchId);
        const targetDir = path.join(context.matchArtifactsRoot, String(canonical));
        const preferredTarget = path.join(targetDir, path.basename(sourcePath));
        const moveResult = moveOrDedupeFile(sourcePath, preferredTarget, context.hashCache);
        if (moveResult.moved || moveResult.duplicateDeleted) {
          context.rewriteMap.set(toPathKey(sourcePath), moveResult.finalPath);
          context.stats.orphanReattachedFiles += 1;
          if (moveResult.duplicateDeleted) context.stats.duplicateFilesDeleted += 1;
          moved = true;
        }
      }
    }

    if (moved) continue;

    const quarantineTarget = path.join(
      context.matchArtifactsRoot,
      '_orphan_unmapped',
      orphanName,
      relative
    );
    const finalQuarantine = chooseUniquePath(quarantineTarget, sourcePath, context.hashCache);
    moveFileSync(sourcePath, finalQuarantine);
    context.stats.orphanQuarantinedFiles += 1;
  }

  removeDirBestEffort(orphanDir);
}

function runArtifactCanonicalMigration({ dbPath, userData, force = false } = {}) {
  const startedAt = Date.now();
  const summary = {
    changed: false,
    skipped: false,
    reason: '',
    backupPath: null,
    assignedCanonicalNumbers: 0,
    nextCanonicalMatchNumber: null,
    renamedDirs: 0,
    mergedDirs: 0,
    filesMoved: 0,
    conflictRenames: 0,
    duplicateFilesDeleted: 0,
    orphanDirsProcessed: 0,
    orphanReattachedFiles: 0,
    orphanQuarantinedFiles: 0,
    artifactRowsRewritten: 0,
    elapsedMs: 0,
  };

  try {
    if (!dbPath || !userData || !fs.existsSync(dbPath)) {
      summary.skipped = true;
      summary.reason = 'db-missing';
      summary.elapsedMs = Date.now() - startedAt;
      return summary;
    }

    const db = readJsonSafe(dbPath);
    if (!db || typeof db !== 'object') {
      summary.skipped = true;
      summary.reason = 'db-invalid';
      summary.elapsedMs = Date.now() - startedAt;
      return summary;
    }

    if (!db.storageMeta || typeof db.storageMeta !== 'object') db.storageMeta = {};
    const migrationMarker = toPositiveInt(db.storageMeta[MIGRATION_MARKER_KEY]);
    if (migrationMarker && !force) {
      summary.skipped = true;
      summary.reason = 'already-migrated';
      summary.nextCanonicalMatchNumber = toPositiveInt(db.storageMeta.nextCanonicalMatchNumber) || null;
      summary.elapsedMs = Date.now() - startedAt;
      return summary;
    }

    const matches = Array.isArray(db.matches) ? db.matches : [];
    const nextHint = toPositiveInt(db.storageMeta.nextCanonicalMatchNumber) || 1;
    const maps = buildCanonicalMatchNumberMaps(matches, { mutateMissing: true, nextCanonicalHint: nextHint });
    summary.assignedCanonicalNumbers = maps.assignedMissingCount;
    summary.nextCanonicalMatchNumber = maps.nextCanonicalMatchNumber;
    db.storageMeta.nextCanonicalMatchNumber = maps.nextCanonicalMatchNumber;

    const matchArtifactsRoot = path.join(userData, 'match_artifacts');
    const hashCache = new Map();
    const rewriteMap = new Map();
    const duplicatePathMap = new Map();

    if (fs.existsSync(matchArtifactsRoot)) {
      for (const match of matches) {
        const id = toPositiveInt(match?.id);
        if (!id || !maps.idToCanonical.has(id)) continue;
        const canonical = maps.idToCanonical.get(id);
        const legacyDir = path.join(matchArtifactsRoot, String(id));
        const canonicalDir = path.join(matchArtifactsRoot, String(canonical));
        if (toPathKey(legacyDir) === toPathKey(canonicalDir)) continue;
        if (!fs.existsSync(legacyDir)) continue;

        if (!fs.existsSync(canonicalDir)) {
          fs.mkdirSync(path.dirname(canonicalDir), { recursive: true });
          try {
            fs.renameSync(legacyDir, canonicalDir);
            summary.renamedDirs += 1;
          } catch {
            summary.mergedDirs += 1;
            mergeDirectoryInto(legacyDir, canonicalDir, summary, hashCache, rewriteMap);
          }
        } else {
          summary.mergedDirs += 1;
          mergeDirectoryInto(legacyDir, canonicalDir, summary, hashCache, rewriteMap);
        }
      }

      const sortedMatchMeta = buildSortedMatchMeta(matches);
      const matchWindows = buildMatchWindows(sortedMatchMeta, DEFAULT_FALLBACK_MAX_DELTA_MS);
      const numericDirs = fs.readdirSync(matchArtifactsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
        .map((entry) => entry.name);
      const canonicalSet = new Set(Array.from(maps.idToCanonical.values()).map((value) => String(value)));
      const orphanDirs = numericDirs.filter((folderName) => !canonicalSet.has(folderName));

      const orphanContext = {
        matchArtifactsRoot,
        idToCanonical: maps.idToCanonical,
        sortedMatches: sortedMatchMeta,
        matchWindows,
        maxDeltaMs: Number.isFinite(DEFAULT_MAX_DELTA_MS) && DEFAULT_MAX_DELTA_MS > 0 ? DEFAULT_MAX_DELTA_MS : (30 * 60 * 1000),
        fallbackMaxDeltaMs: Number.isFinite(DEFAULT_FALLBACK_MAX_DELTA_MS) && DEFAULT_FALLBACK_MAX_DELTA_MS > 0 ? DEFAULT_FALLBACK_MAX_DELTA_MS : (12 * 60 * 60 * 1000),
        rewriteMap,
        hashCache,
        stats: summary,
      };

      for (const orphanName of orphanDirs) {
        const orphanDir = path.join(matchArtifactsRoot, orphanName);
        summary.orphanDirsProcessed += 1;
        processOrphanDirectory(orphanDir, orphanName, orphanContext);
      }

      const canonicalNumbers = new Set(Array.from(maps.idToCanonical.values()));
      for (const canonical of canonicalNumbers) {
        const canonicalDir = path.join(matchArtifactsRoot, String(canonical));
        dedupeCanonicalFolder(canonicalDir, hashCache, duplicatePathMap, summary);
      }
    }

    let rowsRewritten = 0;
    for (const match of matches) {
      if (rewriteArtifactArrayPaths(match, {
        idToCanonical: maps.idToCanonical,
        matchArtifactsRoot,
        rewriteMap,
        duplicatePathMap,
      })) {
        rowsRewritten += 1;
      }
    }
    summary.artifactRowsRewritten = rowsRewritten;

    db.storageMeta[MIGRATION_MARKER_KEY] = Date.now();
    summary.backupPath = createBackup(dbPath);
    writeJsonPrettyAtomic(dbPath, db);
    artifactPathResolver.invalidateCache();

    summary.changed = true;
    summary.elapsedMs = Date.now() - startedAt;
    return summary;
  } catch (error) {
    summary.skipped = true;
    summary.reason = error?.message || 'migration-failed';
    summary.elapsedMs = Date.now() - startedAt;
    return summary;
  }
}

module.exports = {
  runArtifactCanonicalMigration,
};

