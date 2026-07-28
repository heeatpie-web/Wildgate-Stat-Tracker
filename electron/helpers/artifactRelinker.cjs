/**
 * @module electron/helpers/artifactRelinker
 * Repairs missing artifact links by mapping local image files to likely matches.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildCanonicalMatchNumberMaps, toPositiveInt } = require('./canonicalMatchNumbers.cjs');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);
const DEFAULT_MAX_DELTA_MS = Number(process.env.WILDGATE_ARTIFACT_REPAIR_MAX_DELTA_MS || (30 * 60 * 1000));
const DEFAULT_FALLBACK_MAX_DELTA_MS = Number(process.env.WILDGATE_ARTIFACT_REPAIR_FALLBACK_MAX_DELTA_MS || (12 * 60 * 60 * 1000));
const MAX_CANDIDATES = Number(process.env.WILDGATE_ARTIFACT_REPAIR_MAX_RESULTS || 2000);
const AUTO_CAPTURE_FILENAME_PATTERN = /^capture_/i;
const RELINKED_SUFFIX_PATTERN = /(?:__relinked_\d+)+(?=\.[^.]+$)/ig;

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
  if (parts.length === 2) {
    return ((parts[0] * 60) + parts[1]) * 1000;
  }
  if (parts.length === 3) {
    return ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
  }
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

function normalizeRepairScope(scope) {
  if (!scope || typeof scope !== 'object') return null;
  const normalized = {};
  const matchId = Number(scope.matchId || 0);
  if (Number.isInteger(matchId) && matchId > 0) normalized.matchId = matchId;
  const startTime = normalizeEpochMs(scope.startTime);
  if (startTime > 0) normalized.startTimeMs = startTime;
  const endTime = normalizeEpochMs(scope.endTime);
  if (endTime > 0) normalized.endTimeMs = endTime;
  if (normalized.startTimeMs && normalized.endTimeMs && normalized.endTimeMs < normalized.startTimeMs) {
    const nextStart = normalized.endTimeMs;
    normalized.endTimeMs = normalized.startTimeMs;
    normalized.startTimeMs = nextStart;
  }
  if (!normalized.matchId && !normalized.startTimeMs && !normalized.endTimeMs) return null;
  return normalized;
}

function getMatchCount(db) {
  if (!db || typeof db !== 'object') return 0;
  if (Array.isArray(db.matches)) return db.matches.length;
  if (Array.isArray(db.history)) return db.history.length;
  return 0;
}

function isAutoCaptureArtifact(value) {
  return AUTO_CAPTURE_FILENAME_PATTERN.test(path.basename(String(value || '')).trim());
}

function stripRelinkSuffixes(value) {
  const baseName = path.basename(String(value || '').trim());
  if (!baseName) return '';
  return baseName.replace(RELINKED_SUFFIX_PATTERN, '');
}

function isRelinkedAutoCaptureArtifact(value) {
  const baseName = path.basename(String(value || '').trim());
  if (!isAutoCaptureArtifact(baseName)) return false;
  return stripRelinkSuffixes(baseName).toLowerCase() !== baseName.toLowerCase();
}

function getAutoCaptureCanonicalFilename(value) {
  const baseName = path.basename(String(value || '').trim());
  if (!baseName) return '';
  if (!isAutoCaptureArtifact(baseName)) return baseName.toLowerCase();
  return stripRelinkSuffixes(baseName).toLowerCase();
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

function getSourceMatchId(filePath, matchArtifactsRoot, matchIdSet, canonicalToId) {
  const relative = path.relative(matchArtifactsRoot, filePath);
  if (!relative || relative.startsWith('..')) return null;
  const firstSegment = relative.split(path.sep)[0];
  if (!/^\d+$/.test(firstSegment)) return null;
  const value = Number(firstSegment);
  if (!Number.isSafeInteger(value)) return null;
  if (matchIdSet?.has(value)) return value;
  if (canonicalToId?.has(value)) return canonicalToId.get(value);
  return null;
}

function hashFile(filePath, hashCache) {
  const key = toPathKey(filePath);
  if (hashCache.has(key)) return hashCache.get(key);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  hashCache.set(key, hash);
  return hash;
}

function areFilesIdentical(sourcePath, targetPath, sourceSize, hashCache) {
  const targetStat = safeStat(targetPath);
  if (!targetStat || !targetStat.isFile()) return false;
  const expectedSize = Number(sourceSize || 0);
  if (!Number.isFinite(expectedSize) || expectedSize <= 0) return false;
  if (Number(targetStat.size || -1) !== expectedSize) return false;
  return hashFile(sourcePath, hashCache) === hashFile(targetPath, hashCache);
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

function collectCandidates(userData, mappingContext = {}, scope = null) {
  const matchArtifactsRoot = path.join(userData, 'match_artifacts');

  // buildRepairPlan already hard-discards any match_artifacts candidate whose
  // containing folder doesn't match scope.matchId (folder-derived id always
  // wins over content), so when a matchId scope is given, only that match's
  // own subfolder(s) need walking instead of the entire match_artifacts tree.
  // Folder naming has varied historically (raw match id vs canonical match
  // number), so both are checked.
  let matchArtifactsRoots;
  if (scope?.matchId) {
    const folderNames = new Set([String(scope.matchId)]);
    const canonical = mappingContext.idToCanonical?.get(scope.matchId);
    if (canonical != null) folderNames.add(String(canonical));
    matchArtifactsRoots = Array.from(folderNames, (name) => path.join(matchArtifactsRoot, name));
  } else {
    matchArtifactsRoots = [matchArtifactsRoot];
  }

  const sources = [
    ...matchArtifactsRoots.map((root) => ({ kind: 'match_artifacts', root })),
    { kind: 'screenshots', root: path.join(userData, 'screenshots') },
    { kind: 'ocr-debug', root: path.join(userData, 'ocr-debug') },
  ];

  const dedup = new Map();
  for (const source of sources) {
    const files = walkFiles(source.root);
    for (const filePath of files) {
      if (!isImageFile(filePath)) continue;
      if (source.kind === 'match_artifacts' && isRelinkedAutoCaptureArtifact(filePath)) continue;

      // The shared screenshots/ocr-debug pools have no per-match subfolders to
      // scope by directory, so when a time-bounded scope is given, skip the
      // fs.statSync call entirely for files clearly outside the window using
      // the filename timestamp (zero I/O). Files with no parseable filename
      // timestamp keep the stat-based fallback below.
      let filenameTimestampMs = null;
      if (source.kind !== 'match_artifacts' && (scope?.startTimeMs || scope?.endTimeMs)) {
        filenameTimestampMs = parseCaptureTimestampMs(path.basename(filePath));
        if (filenameTimestampMs != null) {
          if (scope.startTimeMs && filenameTimestampMs < scope.startTimeMs) continue;
          if (scope.endTimeMs && filenameTimestampMs > scope.endTimeMs) continue;
        }
      }

      const stat = safeStat(filePath);
      if (!stat || !stat.isFile()) continue;
      const key = toPathKey(filePath);
      if (dedup.has(key)) continue;

      const timestampMs = filenameTimestampMs
        || parseCaptureTimestampMs(path.basename(filePath))
        || Number(stat.birthtimeMs || stat.mtimeMs || 0)
        || null;

      dedup.set(key, {
        filename: path.basename(filePath),
        sourcePath: path.resolve(filePath),
        sourceKind: source.kind,
        sourceMatchId: source.kind === 'match_artifacts'
          ? getSourceMatchId(filePath, matchArtifactsRoot, mappingContext.matchIdSet, mappingContext.canonicalToId)
          : null,
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
    const ts = parseMatchTimestampMs(match);
    const durationMs = parseMatchDurationMs(match);
    byId.set(id, match);
    if (ts > 0) {
      sorted.push({ id, timestamp: ts, durationMs });
    }
  }
  sorted.sort((a, b) => a.timestamp - b.timestamp);
  return { byId, sorted };
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

function findBestWindowMatch(matchWindows, timestampMs, fallbackMaxDeltaMs) {
  let best = null;
  for (const matchWindow of matchWindows) {
    if (timestampMs < matchWindow.startMs || timestampMs > matchWindow.endMs) continue;
    const deltaMs = Math.abs(matchWindow.timestamp - timestampMs);
    if (deltaMs > fallbackMaxDeltaMs) continue;
    if (!best || deltaMs < best.deltaMs) {
      best = { id: matchWindow.id, deltaMs, timestamp: matchWindow.timestamp };
    }
  }
  return best;
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

function chooseTargetPath(targetDir, preferredName, sourcePath, sourceSize, takenPathKeys, hashCache) {
  const preferredPath = path.join(targetDir, preferredName);
  const preferredKey = toPathKey(preferredPath);
  if (preferredKey === toPathKey(sourcePath)) return preferredPath;
  if (fs.existsSync(preferredPath) && areFilesIdentical(sourcePath, preferredPath, sourceSize, hashCache)) {
    return preferredPath;
  }
  if (!takenPathKeys.has(preferredKey) && !fs.existsSync(preferredPath)) return preferredPath;

  const parsed = path.parse(preferredName);
  for (let i = 1; i <= 1000; i += 1) {
    const nextName = `${parsed.name}__relinked_${i}${parsed.ext}`;
    const nextPath = path.join(targetDir, nextName);
    const nextKey = toPathKey(nextPath);
    if (fs.existsSync(nextPath) && areFilesIdentical(sourcePath, nextPath, sourceSize, hashCache)) {
      return nextPath;
    }
    if (takenPathKeys.has(nextKey)) continue;
    if (!fs.existsSync(nextPath)) return nextPath;
  }
  return path.join(targetDir, `${Date.now()}_${preferredName}`);
}

function scoreCandidate(sourceKind, reason, deltaMs) {
  let score = 500;
  if (reason === 'directory-id') score += 5000;
  if (reason === 'timeline-window') score += 2600;
  if (Number.isFinite(deltaMs)) score += Math.max(0, 1800 - Math.floor(deltaMs / 1000));
  if (sourceKind === 'screenshots') score += 140;
  if (sourceKind === 'match_artifacts') score += 90;
  if (sourceKind === 'ocr-debug') score += 50;
  return score;
}

function buildRepairPlan(db, userData, scopeOptions) {
  const scope = normalizeRepairScope(scopeOptions);
  const matches = Array.isArray(db?.matches) ? db.matches : [];
  const { byId, sorted } = buildMatchMaps(matches);
  const canonicalMaps = buildCanonicalMatchNumberMaps(matches, {
    mutateMissing: false,
    nextCanonicalHint: toPositiveInt(db?.storageMeta?.nextCanonicalMatchNumber) || 1,
  });
  const { globalPaths, perMatch } = buildExistingArtifactSets(matches);
  const hashCache = new Map();
  const maxDeltaMs = Number.isFinite(DEFAULT_MAX_DELTA_MS) && DEFAULT_MAX_DELTA_MS > 0
    ? DEFAULT_MAX_DELTA_MS
    : (30 * 60 * 1000);
  const fallbackMaxDeltaMs = Number.isFinite(DEFAULT_FALLBACK_MAX_DELTA_MS) && DEFAULT_FALLBACK_MAX_DELTA_MS > 0
    ? DEFAULT_FALLBACK_MAX_DELTA_MS
    : (12 * 60 * 60 * 1000);
  const targetMatches = scope?.matchId
    ? sorted.filter((match) => Number(match.id) === Number(scope.matchId))
    : sorted;
  const targetMatchWindows = buildMatchWindows(targetMatches, fallbackMaxDeltaMs);

  const candidates = collectCandidates(userData, {
    matchIdSet: new Set(Array.from(byId.keys())),
    canonicalToId: canonicalMaps.canonicalToId,
    idToCanonical: canonicalMaps.idToCanonical,
  }, scope);
  const plansByKey = new Map();

  for (const candidate of candidates) {
    if (scope?.startTimeMs || scope?.endTimeMs) {
      if (!Number.isFinite(candidate.timestampMs)) continue;
      if (scope.startTimeMs && Number(candidate.timestampMs) < scope.startTimeMs) continue;
      if (scope.endTimeMs && Number(candidate.timestampMs) > scope.endTimeMs) continue;
    }
    const sourceKey = toPathKey(candidate.sourcePath);
    const autoCaptureCandidate = isAutoCaptureArtifact(candidate.filename);
    if (globalPaths.has(sourceKey)) continue;

    let target = null;
    let reason = 'timestamp';
    let deltaMs = null;

    if (autoCaptureCandidate && Number.isFinite(candidate.timestampMs)) {
      const windowMatch = findBestWindowMatch(targetMatchWindows, Number(candidate.timestampMs), fallbackMaxDeltaMs);
      if (!windowMatch) continue;
      target = { id: windowMatch.id };
      reason = 'timeline-window';
      deltaMs = windowMatch.deltaMs;
    } else if (candidate.sourceMatchId && byId.has(candidate.sourceMatchId)) {
      target = { id: candidate.sourceMatchId };
      reason = 'directory-id';
      if (Number.isFinite(candidate.timestampMs)) {
        deltaMs = Math.abs(parseMatchTimestampMs(byId.get(candidate.sourceMatchId)) - Number(candidate.timestampMs));
      }
    } else if (Number.isFinite(candidate.timestampMs)) {
      const nearest = findNearestMatch(targetMatches, candidate.timestampMs, maxDeltaMs);
      if (nearest) {
        target = { id: nearest.id };
        deltaMs = nearest.deltaMs;
      } else {
        const windowMatch = findBestWindowMatch(targetMatchWindows, candidate.timestampMs, fallbackMaxDeltaMs);
        if (!windowMatch) continue;
        target = { id: windowMatch.id };
        reason = 'timeline-window';
        deltaMs = windowMatch.deltaMs;
      }
    }

    if (!target || !byId.has(target.id)) continue;
    if (scope?.matchId && Number(target.id) !== Number(scope.matchId)) continue;

    if (autoCaptureCandidate) {
      const targetMatch = byId.get(Number(target.id));
      const existingArtifacts = Array.isArray(targetMatch?.artifacts) ? targetMatch.artifacts : [];
      const candidateCanonicalFilename = getAutoCaptureCanonicalFilename(candidate.filename);
      const existingFilenameMatch = existingArtifacts.some((artifactPath) => (
        getAutoCaptureCanonicalFilename(artifactPath) === candidateCanonicalFilename
      ));
      if (existingFilenameMatch) continue;
    }

    const canonical = canonicalMaps.idToCanonical.get(Number(target.id)) || Number(target.id);
    const targetDir = path.join(userData, 'match_artifacts', String(canonical));
    const targetPath = chooseTargetPath(
      targetDir,
      candidate.filename,
      candidate.sourcePath,
      candidate.size,
      globalPaths,
      hashCache
    );
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
    cleanupPlans: [],
    candidatesOut,
    summary: {
      matches: getMatchCount(db),
      candidatesScanned: candidates.length,
      candidatesEligible: plans.length,
      plannedLinks: plans.length,
      plannedAdds: plans.length,
      plannedRemovals: 0,
      scopeMatchId: scope?.matchId || null,
      scopeStartTime: scope?.startTimeMs || null,
      scopeEndTime: scope?.endTimeMs || null,
    },
  };
}
function createBackup(dbPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.bak.${timestamp}`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function previewArtifactRepair({ dbPath, userData, scope } = {}) {
  try {
    const db = readJsonSafe(dbPath);
    const plan = buildRepairPlan(db, userData, scope);
    return {
      summary: {
        mode: 'preview',
        matches: plan.summary.matches,
        candidatesScanned: plan.summary.candidatesScanned,
        candidatesEligible: plan.summary.candidatesEligible,
        plannedLinks: plan.summary.plannedLinks,
        plannedAdds: plan.summary.plannedAdds,
        plannedRemovals: plan.summary.plannedRemovals,
        scopeMatchId: plan.summary.scopeMatchId,
        scopeStartTime: plan.summary.scopeStartTime,
        scopeEndTime: plan.summary.scopeEndTime,
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
        plannedAdds: 0,
        plannedRemovals: 0,
      },
      candidates: [],
      error: error?.message || 'Artifact repair preview failed',
    };
  }
}

function applyArtifactRepair({ dbPath, userData, scope } = {}) {
  try {
    const db = readJsonSafe(dbPath);
    const plan = buildRepairPlan(db, userData, scope);
    const hasPlannedChanges = plan.plans.length > 0;
    if (!hasPlannedChanges) {
      return {
        summary: {
          mode: 'apply',
          matches: plan.summary.matches,
          candidatesScanned: plan.summary.candidatesScanned,
          candidatesEligible: plan.summary.candidatesEligible,
          plannedLinks: 0,
          plannedAdds: 0,
          plannedRemovals: 0,
          appliedLinks: 0,
          removedLinks: 0,
          deletedFiles: 0,
          updatedMatches: 0,
          scopeMatchId: plan.summary.scopeMatchId,
          scopeStartTime: plan.summary.scopeStartTime,
          scopeEndTime: plan.summary.scopeEndTime,
        },
        candidates: plan.candidatesOut,
        applied: [],
      };
    }

    const backupPath = createBackup(dbPath);
    const matchById = new Map();
    for (const match of db.matches || []) matchById.set(Number(match.id), match);
    const appliedByMatch = new Map();
    const failures = [];
    const hashCache = new Map();
    let appliedLinks = 0;

    const ensureAppliedEntry = (matchId) => {
      const normalizedMatchId = Number(matchId || 0);
      if (!appliedByMatch.has(normalizedMatchId)) {
        appliedByMatch.set(normalizedMatchId, {
          matchId: normalizedMatchId,
          addedPaths: [],
          removedPaths: [],
        });
      }
      return appliedByMatch.get(normalizedMatchId);
    };

    for (const planItem of plan.plans) {
      try {
        const match = matchById.get(Number(planItem.matchId));
        if (!match) continue;

        const targetDir = path.dirname(planItem.targetPath);
        fs.mkdirSync(targetDir, { recursive: true });

        const artifacts = ensureArtifactsArray(match);
        const existing = new Set(artifacts.map(toPathKey));

        let finalTargetPath = planItem.targetPath;
        let finalKey = toPathKey(finalTargetPath);
        const sourceKey = toPathKey(planItem.sourcePath);
        if (existing.has(finalKey)) continue;

        const sourceStat = safeStat(planItem.sourcePath);
        if (!sourceStat || !sourceStat.isFile()) {
          throw new Error('Source file missing or unreadable');
        }

        if (sourceKey !== finalKey) {
          if (!fs.existsSync(finalTargetPath)) {
            fs.copyFileSync(planItem.sourcePath, finalTargetPath);
          } else {
            const sameContent = areFilesIdentical(
              planItem.sourcePath,
              finalTargetPath,
              Number(sourceStat.size || 0),
              hashCache
            );
            if (!sameContent) {
              finalTargetPath = chooseTargetPath(
                targetDir,
                path.basename(planItem.targetPath),
                planItem.sourcePath,
                sourceStat.size,
                existing,
                hashCache
              );
              finalKey = toPathKey(finalTargetPath);
              if (!existing.has(finalKey)) {
                fs.copyFileSync(planItem.sourcePath, finalTargetPath);
              }
            }
          }
        }

        if (existing.has(finalKey)) continue;
        artifacts.push(finalTargetPath);
        const uniqueArtifacts = Array.from(new Set(artifacts.map(toPathKey)));
        if (uniqueArtifacts.length !== artifacts.length) {
          const restored = [];
          const restoredKeys = new Set();
          for (const artifactPath of artifacts) {
            const key = toPathKey(artifactPath);
            if (restoredKeys.has(key)) continue;
            restoredKeys.add(key);
            restored.push(artifactPath);
          }
          match.artifacts = restored;
        }
        ensureAppliedEntry(Number(match.id)).addedPaths.push(finalTargetPath);
        appliedLinks += 1;
      } catch (error) {
        failures.push({
          matchId: planItem.matchId,
          sourcePath: planItem.sourcePath,
          targetPath: planItem.targetPath,
          error: error?.message || 'Failed to apply candidate',
        });
      }
    }

    if (appliedLinks > 0) {
      writeJsonPretty(dbPath, db);
    }

    const applied = Array.from(appliedByMatch.values()).filter((entry) => entry.addedPaths.length > 0 || entry.removedPaths.length > 0);

    return {
      summary: {
        mode: 'apply',
        matches: plan.summary.matches,
        candidatesScanned: plan.summary.candidatesScanned,
        candidatesEligible: plan.summary.candidatesEligible,
        plannedLinks: plan.summary.plannedLinks,
        plannedAdds: plan.summary.plannedAdds,
        plannedRemovals: plan.summary.plannedRemovals,
        appliedLinks,
        removedLinks: 0,
        deletedFiles: 0,
        updatedMatches: applied.length,
        failedLinks: failures.length,
        backupPath,
        scopeMatchId: plan.summary.scopeMatchId,
        scopeStartTime: plan.summary.scopeStartTime,
        scopeEndTime: plan.summary.scopeEndTime,
      },
      candidates: plan.candidatesOut,
      applied,
      failed: failures,
    };
  } catch (error) {
    return {
      summary: {
        mode: 'apply',
        matches: 0,
        candidatesScanned: 0,
        candidatesEligible: 0,
        plannedLinks: 0,
        plannedAdds: 0,
        plannedRemovals: 0,
        appliedLinks: 0,
        removedLinks: 0,
        deletedFiles: 0,
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

