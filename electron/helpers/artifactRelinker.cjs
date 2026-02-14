/**
 * @module electron/helpers/artifactRelinker
 * Repairs missing artifact links by mapping local image files to likely matches.
 */
const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);
const DEFAULT_MAX_DELTA_MS = Number(process.env.WILDGATE_ARTIFACT_REPAIR_MAX_DELTA_MS || (30 * 60 * 1000));
const MAX_CANDIDATES = Number(process.env.WILDGATE_ARTIFACT_REPAIR_MAX_RESULTS || 2000);

function toPathKey(inputPath) {
  return path.resolve(inputPath).replace(/[\\/]+/g, '\\').toLowerCase();
}

function readJsonSafe(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function writeJsonPretty(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function parseCaptureTimestampMs(name) {
  const match = String(name || '').match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/);
  if (!match) return null;
  const token = match[0];
  const iso = `${token.slice(0, 13)}:${token.slice(14, 16)}:${token.slice(17, 19)}.${token.slice(20, 23)}Z`;
  const millis = Date.parse(iso);
  return Number.isFinite(millis) ? millis : null;
}

function getMatchCount(db) {
  if (!db || typeof db !== 'object') return 0;
  if (Array.isArray(db.matches)) return db.matches.length;
  if (Array.isArray(db.history)) return db.history.length;
  return 0;
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function getSourceMatchId(filePath, matchArtifactsRoot) {
  const relative = path.relative(matchArtifactsRoot, filePath);
  if (!relative || relative.startsWith('..')) return null;
  const firstSegment = relative.split(path.sep)[0];
  if (!/^\d+$/.test(firstSegment)) return null;
  const value = Number(firstSegment);
  return Number.isSafeInteger(value) ? value : null;
}

function walkFiles(rootPath) {
  const result = [];
  if (!rootPath || !fs.existsSync(rootPath)) return result;
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
        continue;
      }
      if (entry.isFile()) result.push(fullPath);
    }
  }
  return result;
}

function collectCandidates(userData) {
  const matchArtifactsRoot = path.join(userData, 'match_artifacts');
  const sources = [
    { kind: 'match_artifacts', root: matchArtifactsRoot },
    { kind: 'screenshots', root: path.join(userData, 'screenshots') },
    { kind: 'ocr-debug', root: path.join(userData, 'ocr-debug') },
  ];

  const dedup = new Map();
  for (const source of sources) {
    const files = walkFiles(source.root);
    for (const filePath of files) {
      if (!isImageFile(filePath)) continue;
      const stat = safeStat(filePath);
      if (!stat || !stat.isFile()) continue;
      const key = toPathKey(filePath);
      if (dedup.has(key)) continue;

      const timestampMs = parseCaptureTimestampMs(path.basename(filePath))
        || Number(stat.birthtimeMs || stat.mtimeMs || 0)
        || null;

      dedup.set(key, {
        filename: path.basename(filePath),
        sourcePath: path.resolve(filePath),
        sourceKind: source.kind,
        sourceMatchId: source.kind === 'match_artifacts' ? getSourceMatchId(filePath, matchArtifactsRoot) : null,
        timestampMs,
        size: Number(stat.size || 0),
      });
    }
  }
  return Array.from(dedup.values());
}

function ensureArtifactsArray(match) {
  if (!Array.isArray(match.artifacts)) match.artifacts = [];
  return match.artifacts;
}

function buildMatchMaps(matches) {
  const byId = new Map();
  const sorted = [];
  for (const match of matches) {
    if (!match || !Number.isFinite(Number(match.id))) continue;
    const id = Number(match.id);
    const ts = Number(match.timestamp || 0);
    byId.set(id, match);
    sorted.push({ id, timestamp: Number.isFinite(ts) ? ts : 0 });
  }
  sorted.sort((a, b) => a.timestamp - b.timestamp);
  return { byId, sorted };
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

function buildExistingArtifactSets(matches) {
  const globalPaths = new Set();
  const perMatch = new Map();
  for (const match of matches) {
    const id = Number(match.id);
    const set = new Set();
    const artifacts = Array.isArray(match.artifacts) ? match.artifacts : [];
    for (const artifactPath of artifacts) {
      if (typeof artifactPath !== 'string' || !artifactPath.trim()) continue;
      const key = toPathKey(artifactPath);
      set.add(key);
      globalPaths.add(key);
    }
    perMatch.set(id, set);
  }
  return { globalPaths, perMatch };
}

function chooseTargetPath(targetDir, preferredName, sourcePath, sourceSize, takenPathKeys) {
  const preferredPath = path.join(targetDir, preferredName);
  const preferredKey = toPathKey(preferredPath);
  if (preferredKey === toPathKey(sourcePath)) return preferredPath;
  if (!takenPathKeys.has(preferredKey) && !fs.existsSync(preferredPath)) return preferredPath;

  if (fs.existsSync(preferredPath)) {
    const existingStat = safeStat(preferredPath);
    if (existingStat && Number(existingStat.size || -1) === Number(sourceSize || -2)) {
      return preferredPath;
    }
  }

  const parsed = path.parse(preferredName);
  for (let i = 1; i <= 1000; i += 1) {
    const nextName = `${parsed.name}__relinked_${i}${parsed.ext}`;
    const nextPath = path.join(targetDir, nextName);
    const nextKey = toPathKey(nextPath);
    if (takenPathKeys.has(nextKey)) continue;
    if (!fs.existsSync(nextPath)) return nextPath;
  }
  return path.join(targetDir, `${Date.now()}_${preferredName}`);
}

function scoreCandidate(sourceKind, reason, deltaMs) {
  let score = 500;
  if (reason === 'directory-id') score += 5000;
  if (Number.isFinite(deltaMs)) score += Math.max(0, 1800 - Math.floor(deltaMs / 1000));
  if (sourceKind === 'screenshots') score += 140;
  if (sourceKind === 'match_artifacts') score += 90;
  if (sourceKind === 'ocr-debug') score += 50;
  return score;
}

function buildRepairPlan(db, userData) {
  const matches = Array.isArray(db?.matches) ? db.matches : [];
  const { byId, sorted } = buildMatchMaps(matches);
  const { globalPaths, perMatch } = buildExistingArtifactSets(matches);
  const maxDeltaMs = Number.isFinite(DEFAULT_MAX_DELTA_MS) && DEFAULT_MAX_DELTA_MS > 0
    ? DEFAULT_MAX_DELTA_MS
    : (30 * 60 * 1000);

  const candidates = collectCandidates(userData);
  const plansByKey = new Map();

  for (const candidate of candidates) {
    const sourceKey = toPathKey(candidate.sourcePath);
    if (globalPaths.has(sourceKey)) continue;

    let target = null;
    let reason = 'timestamp';
    let deltaMs = null;

    if (candidate.sourceMatchId && byId.has(candidate.sourceMatchId)) {
      target = { id: candidate.sourceMatchId };
      reason = 'directory-id';
      if (Number.isFinite(candidate.timestampMs)) {
        deltaMs = Math.abs(Number(byId.get(candidate.sourceMatchId).timestamp || 0) - Number(candidate.timestampMs));
      }
    } else if (Number.isFinite(candidate.timestampMs)) {
      const nearest = findNearestMatch(sorted, candidate.timestampMs, maxDeltaMs);
      if (!nearest) continue;
      target = { id: nearest.id };
      deltaMs = nearest.deltaMs;
    }

    if (!target || !byId.has(target.id)) continue;

    const targetDir = path.join(userData, 'match_artifacts', String(target.id));
    const targetPath = chooseTargetPath(targetDir, candidate.filename, candidate.sourcePath, candidate.size, globalPaths);
    const targetKey = toPathKey(targetPath);
    const matchSet = perMatch.get(target.id) || new Set();
    if (matchSet.has(targetKey)) continue;

    const score = scoreCandidate(candidate.sourceKind, reason, deltaMs);
    const dedupeKey = `${target.id}|${targetKey}`;
    const existing = plansByKey.get(dedupeKey);
    if (!existing || score > existing.score) {
      plansByKey.set(dedupeKey, {
        matchId: target.id,
        sourcePath: candidate.sourcePath,
        targetPath,
        filename: path.basename(targetPath),
        score,
        timestamp: Number.isFinite(candidate.timestampMs) ? candidate.timestampMs : Date.now(),
        deltaMs,
      });
    }

    globalPaths.add(targetKey);
    if (!perMatch.has(target.id)) perMatch.set(target.id, new Set());
    perMatch.get(target.id).add(targetKey);
  }

  const plans = Array.from(plansByKey.values()).sort((a, b) => b.score - a.score);
  const candidatesOut = plans.slice(0, Math.max(1, MAX_CANDIDATES)).map(plan => ({
    filename: plan.filename,
    sourcePath: plan.sourcePath,
    matchId: plan.matchId,
    score: plan.score,
    timestamp: plan.timestamp,
  }));

  return {
    plans,
    candidatesOut,
    summary: {
      matches: getMatchCount(db),
      candidatesScanned: candidates.length,
      candidatesEligible: plans.length,
      plannedLinks: plans.length,
    },
  };
}

function createBackup(dbPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.bak.${timestamp}`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function previewArtifactRepair({ dbPath, userData } = {}) {
  try {
    const db = readJsonSafe(dbPath);
    const plan = buildRepairPlan(db, userData);
    return {
      summary: {
        mode: 'preview',
        matches: plan.summary.matches,
        candidatesScanned: plan.summary.candidatesScanned,
        candidatesEligible: plan.summary.candidatesEligible,
        plannedLinks: plan.summary.plannedLinks,
      },
      candidates: plan.candidatesOut,
    };
  } catch (error) {
    return {
      summary: {
        mode: 'preview',
        matches: 0,
        candidatesScanned: 0,
        candidatesEligible: 0,
        plannedLinks: 0,
      },
      candidates: [],
      error: error?.message || 'Artifact repair preview failed',
    };
  }
}

function applyArtifactRepair({ dbPath, userData } = {}) {
  try {
    const db = readJsonSafe(dbPath);
    const plan = buildRepairPlan(db, userData);
    if (plan.plans.length === 0) {
      return {
        summary: {
          mode: 'apply',
          matches: plan.summary.matches,
          candidatesScanned: plan.summary.candidatesScanned,
          candidatesEligible: plan.summary.candidatesEligible,
          plannedLinks: 0,
          appliedLinks: 0,
          updatedMatches: 0,
        },
        candidates: plan.candidatesOut,
        applied: [],
      };
    }

    const backupPath = createBackup(dbPath);
    const matchById = new Map();
    for (const match of db.matches || []) matchById.set(Number(match.id), match);
    const appliedByMatch = new Map();
    let appliedLinks = 0;

    for (const planItem of plan.plans) {
      const match = matchById.get(Number(planItem.matchId));
      if (!match) continue;

      const targetDir = path.dirname(planItem.targetPath);
      fs.mkdirSync(targetDir, { recursive: true });

      let finalTargetPath = planItem.targetPath;
      const sourceKey = toPathKey(planItem.sourcePath);
      const targetKey = toPathKey(finalTargetPath);

      if (sourceKey !== targetKey) {
        if (!fs.existsSync(finalTargetPath)) {
          fs.copyFileSync(planItem.sourcePath, finalTargetPath);
        } else {
          const sourceStat = safeStat(planItem.sourcePath);
          const targetStat = safeStat(finalTargetPath);
          const sameSize = sourceStat && targetStat && Number(sourceStat.size) === Number(targetStat.size);
          if (!sameSize) {
            finalTargetPath = chooseTargetPath(targetDir, path.basename(planItem.targetPath), planItem.sourcePath, sourceStat ? sourceStat.size : 0, new Set());
            fs.copyFileSync(planItem.sourcePath, finalTargetPath);
          }
        }
      }

      const artifacts = ensureArtifactsArray(match);
      const existing = new Set(artifacts.map(toPathKey));
      const finalKey = toPathKey(finalTargetPath);
      if (existing.has(finalKey)) continue;

      artifacts.push(finalTargetPath);
      if (!appliedByMatch.has(Number(match.id))) appliedByMatch.set(Number(match.id), []);
      appliedByMatch.get(Number(match.id)).push(finalTargetPath);
      appliedLinks += 1;
    }

    if (appliedLinks > 0) {
      writeJsonPretty(dbPath, db);
    }

    const applied = Array.from(appliedByMatch.entries()).map(([matchId, addedPaths]) => ({
      matchId,
      addedPaths,
    }));

    return {
      summary: {
        mode: 'apply',
        matches: plan.summary.matches,
        candidatesScanned: plan.summary.candidatesScanned,
        candidatesEligible: plan.summary.candidatesEligible,
        plannedLinks: plan.summary.plannedLinks,
        appliedLinks,
        updatedMatches: applied.length,
        backupPath,
      },
      candidates: plan.candidatesOut,
      applied,
    };
  } catch (error) {
    return {
      summary: {
        mode: 'apply',
        matches: 0,
        candidatesScanned: 0,
        candidatesEligible: 0,
        plannedLinks: 0,
        appliedLinks: 0,
        updatedMatches: 0,
      },
      candidates: [],
      applied: [],
      error: error?.message || 'Artifact repair apply failed',
    };
  }
}

module.exports = {
  previewArtifactRepair,
  applyArtifactRepair,
};
