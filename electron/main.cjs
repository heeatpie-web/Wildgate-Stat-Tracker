const { app, BrowserWindow, shell, ipcMain, globalShortcut, Menu, Tray, screen } = require('electron');
const { autoUpdater } = require('electron-updater');

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const fsPromises = require('fs').promises;
const { registerOCRHandlers, processCapture, runOCR } = require('./ocrHandler.cjs');
const { mergeCaptures, isSameMatch } = require('./ocrMerger.cjs');
const artifactHelpers = require('./helpers/artifactHelpers.cjs');
const { runArtifactCanonicalMigration } = require('./helpers/artifactCanonicalMigration.cjs');
const telemetryArchiveHelpers = require('./helpers/telemetryArchiveHelpers.cjs');
const dbHelpers = require('./helpers/dbHelpers.cjs');
const { registerArtifactHandlers } = require('./handlers/artifactHandlers.cjs');
const {
  ok,
  fail,
  internal,
  IpcErrorCode,
  validatePathInRoots,
  validateAllowedExtension,
  validateHttpsUrlAllowlist,
  validateBodySize,
  validateBasenameToken,
  createScopedTokenRegistry,
  URL_ALLOWLIST_DISABLED,
} = require('./security/ipcValidation.cjs');
const isDev = !app.isPackaged;
// Normalize app name before any path resolution so dev/prod use the same userData root.
if (isDev && app.getName() !== 'Wildgate Stat Tracker') {
  app.setName('Wildgate Stat Tracker');
}
// Dev-only: override userData path for testing fresh-install flows (e.g. npm run electron:dev:newuser).
const userDataDirOverride = String(process.env.WILDGATE_USER_DATA_DIR || '').trim();
if (isDev && userDataDirOverride) {
  app.setPath('userData', path.resolve(userDataDirOverride));
}

// Keep Chromium cache/service-worker storage in a writable local path on Windows.
const SESSION_DATA_ROOT = (() => {
  const override = String(process.env.WILDGATE_SESSION_DATA_ROOT || '').trim();
  if (override) return path.resolve(override);
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    return path.resolve(path.join(localAppData, app.getName(), 'SessionData'));
  }
  return path.resolve(path.join(app.getPath('userData'), 'SessionData'));
})();
try {
  fs.mkdirSync(SESSION_DATA_ROOT, { recursive: true });
  app.setPath('sessionData', SESSION_DATA_ROOT);
} catch (e) {
  console.warn('[Startup] Failed to set sessionData path:', e?.message || e);
}

const ALLOW_RUNTIME_DEVTOOLS = process.env.WILDGATE_ALLOW_DEVTOOLS === '1';
const DEV_SERVER_URL = process.env.WILDGATE_DEV_SERVER_URL || 'http://localhost:5173';
const USER_DATA_ROOT = path.resolve(app.getPath('userData'));
const OCR_CORPUS_DIR = path.join(USER_DATA_ROOT, 'ocr-corpus');
const OCR_CORPUS_REPORTS_DIR = path.join(OCR_CORPUS_DIR, 'reports');
const REPO_OCR_CORPUS_DIR = path.resolve(app.getAppPath(), 'dataset', 'ocr-corpus');
const AUTO_SYNC_CORPUS_TO_REPO = process.env.WILDGATE_AUTO_SYNC_CORPUS_TO_REPO !== '0';
const ALLOWED_FILE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif']);
const ROI_PICKER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif']);
const ROI_MIME_BY_EXT = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
});
const ALLOWED_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const EXTERNAL_ALLOWED_HOSTS = new Set(
  (process.env.WILDGATE_ALLOWED_EXTERNAL_HOSTS || '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
);
const telemetryArchiveTokenRegistry = createScopedTokenRegistry({
  ttlMs: Number(process.env.WILDGATE_ARCHIVE_TOKEN_TTL_MS || (5 * 60 * 1000)),
  maxEntriesPerScope: Number(process.env.WILDGATE_ARCHIVE_TOKEN_MAX || 5000),
});
const TELEMETRY_RETENTION_MAX_BYTES = Number(process.env.WILDGATE_TELEMETRY_MAX_BYTES || (500 * 1024 * 1024));
const TELEMETRY_RETENTION_MAX_AGE_MS = Number(process.env.WILDGATE_TELEMETRY_MAX_AGE_MS || (90 * 24 * 60 * 60 * 1000));
const TELEMETRY_RETENTION_PROMPT_DISABLED = process.env.WILDGATE_TELEMETRY_DISABLE_RETENTION_PROMPT === '1';
const TELEMETRY_HISTORY_NDJSON_PATH = path.join(USER_DATA_ROOT, 'telemetry_permanent_history.ndjson');
const TELEMETRY_HISTORY_LEGACY_PATH = path.join(USER_DATA_ROOT, 'telemetry_permanent_history.json');
const TELEMETRY_HISTORY_COMPACTION_MIN_INTERVAL_MS = Number(process.env.WILDGATE_TELEMETRY_COMPACT_MIN_MS || (10 * 60 * 1000));
const LOG_SCAN_MAX_CONCURRENCY = Math.max(1, Number(process.env.WILDGATE_SCAN_EPIC_WORKERS || 4));
const LOG_SCAN_MAX_FILE_BYTES = Math.max(128 * 1024, Number(process.env.WILDGATE_SCAN_EPIC_MAX_FILE_BYTES || (8 * 1024 * 1024)));
const LOG_SCAN_MAX_DECODE_BYTES = Math.max(256 * 1024, Number(process.env.WILDGATE_SCAN_EPIC_MAX_DECODE_BYTES || (1024 * 1024)));
const getTelemetryArchiveScope = (webContentsId) => `telemetry-archive:${String(webContentsId)}`;

let telemetryRetentionTimer = null;
let telemetryPruneLastNotifiedAt = 0;
let telemetryHistoryLastCompactionAt = 0;
let telemetryLogTickInProgress = false;
let telemetryRetentionScanInProgress = false;
let telemetryRetentionLastExceeds = null;
let telemetryHistoryMigrated = false;
const recentTelemetrySignatures = new Set();
const recentTelemetrySignatureQueue = [];
const MAX_RECENT_TELEMETRY_SIGNATURES = Number(process.env.WILDGATE_RECENT_TELEMETRY_SIGNATURES || 50000);
const blockedSecurityCounters = new Map();
const PLAYER_ID_KEYS = new Set(['accountid', 'platformaccountid', 'userid', 'playerid', 'platform_account_id', 'puid']);
const HERO_ID_KEYS = new Set(['guidhero', 'heroguid', 'guid_hero', 'heroid', 'hero_id']);
const SHIP_ID_KEYS = new Set(['guidship', 'shipguid', 'guid_ship', 'shipid', 'ship_id']);
const WEAPON_ID_KEYS = new Set([
  'guidweaponprimary',
  'guidweaponsecondary',
  'guid_weapon_primary',
  'guid_weapon_secondary',
  'weaponid',
  'weapon_id',
  'primaryweaponid',
  'secondaryweaponid',
]);
const EQUIPMENT_ID_KEYS = new Set([
  'guidequipmentprimary',
  'guidequipmentsecondary',
  'guid_equipment_primary',
  'guid_equipment_secondary',
  'equipmentid',
  'equipment_id',
  'primaryequipmentid',
  'secondaryequipmentid',
]);
const PERK_ID_KEYS = new Set([
  'guidperkprimary',
  'guidperksecondary',
  'perkguidprimary',
  'perkguidsecondary',
  'guid_perk_primary',
  'guid_perk_secondary',
  'perkid',
  'perk_id',
  'primaryperkid',
  'secondaryperkid',
  'guidtraitprimary',
  'guidtraitsecondary',
  'traitguidprimary',
  'traitguidsecondary',
  'guid_trait_primary',
  'guid_trait_secondary',
  'traitid',
  'trait_id',
  'primarytraitid',
  'secondarytraitid',
]);
const MATCH_ID_KEYS = new Set(['matchid', 'match_id']);
const SESSION_ID_KEYS = new Set(['sessionid', 'session_id']);
const OUTCOME_KEYS = new Set(['result', 'matchresult', 'outcome']);

function recordSecurityBlock(channel, code, message) {
  const key = `${channel}:${code}`;
  const count = (blockedSecurityCounters.get(key) || 0) + 1;
  blockedSecurityCounters.set(key, count);
  console.warn(`[Security][Blocked][${channel}] code=${code} count=${count} message="${message}"`);
}

function errorResult(code, message, opts = {}) {
  const payload = { success: false, code, message };
  if (opts.includeLegacyError !== false) payload.error = message;
  return payload;
}

function decodeShiftedBufferToString(buffer, maxBytes) {
  if (!buffer || buffer.length === 0) return '';
  const decodeLen = Math.min(buffer.length, maxBytes || buffer.length);
  const shifted = Buffer.allocUnsafe(decodeLen);
  for (let i = 0; i < decodeLen; i += 1) {
    shifted[i] = (buffer[i] + 1) & 0xff;
  }
  return shifted.toString('utf8');
}

function getAllowedRendererRoots() {
  return [
    USER_DATA_ROOT,
    path.resolve(path.join(app.getPath('documents'), 'Wildgate Stat Tracker')),
    path.resolve(path.join(app.getPath('home'), 'AppData', 'Local', 'Nebula', 'Saved', 'Logs')),
    path.resolve(path.join(app.getPath('home'), 'AppData', 'Local', 'Wildgate', 'Saved', 'Logs')),
  ];
}

function resolveAllowedRendererPath(inputPath) {
  return validatePathInRoots(inputPath, getAllowedRendererRoots(), { isDev });
}

function isAllowedRendererPath(inputPath) {
  return resolveAllowedRendererPath(inputPath).success;
}

const RENDERER_ARTIFACT_PATH_PATTERN = /match_artifacts[\\/](\d+)[\\/](.+)$/i;

function decodeRendererFileUrl(inputPath) {
  const raw = String(inputPath || '').trim();
  if (!raw) return '';
  if (!/^file:/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    let pathname = decodeURIComponent(parsed.pathname || '');
    if (/^\/[a-z]:/i.test(pathname)) pathname = pathname.slice(1);
    if (parsed.hostname && parsed.hostname !== 'localhost') {
      return `\\\\${parsed.hostname}${pathname.replace(/\//g, '\\')}`;
    }
    return pathname.replace(/\//g, '\\');
  } catch {
    return raw.replace(/^file:\/+/i, '');
  }
}

function buildRendererReadCandidates(inputPath) {
  const decoded = decodeRendererFileUrl(inputPath);
  const normalized = path.normalize(decoded || '');
  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidatePath) => {
    const trimmed = String(candidatePath || '').trim();
    if (!trimmed) return;
    const key = trimmed.replace(/[\\/]+/g, '\\').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(trimmed);
  };

  addCandidate(decoded);
  addCandidate(normalized);
  addCandidate(normalized.replace(/\\/g, '/'));
  addCandidate(normalized.replace(/\//g, '\\'));

  const relMatch = normalized.match(RENDERER_ARTIFACT_PATH_PATTERN);
  if (relMatch?.[1] && relMatch?.[2]) {
    const folder = relMatch[1];
    const filename = path.basename(relMatch[2]);
    if (filename) {
      addCandidate(path.join(USER_DATA_ROOT, 'match_artifacts', folder, filename));
    }
  }

  return candidates;
}

function telemetryEventSignature(evt) {
  if (!evt || typeof evt !== 'object') return '';
  const ts = evt.ClientTimestamp ?? evt.timestamp ?? evt.ts ?? '';
  const name = evt.EventName ?? evt.eventName ?? evt.type ?? '';
  const matchId = evt.matchId ?? evt.MatchId ?? evt.sessionId ?? evt.SessionId ?? '';
  return `${String(ts)}_${String(name)}_${String(matchId)}`;
}

function parseTelemetryTimestampMs(evt) {
  if (!evt || typeof evt !== 'object') return null;
  const raw = evt.ClientTimestamp ?? evt.timestamp ?? evt.ts;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Heuristic: telemetry timestamps are often seconds, convert to ms when needed.
  return n < 100000000000 ? n * 1000 : n;
}

function pushRecentTelemetrySignature(signature) {
  if (!signature) return true;
  if (recentTelemetrySignatures.has(signature)) return false;
  recentTelemetrySignatures.add(signature);
  recentTelemetrySignatureQueue.push(signature);
  if (recentTelemetrySignatureQueue.length > MAX_RECENT_TELEMETRY_SIGNATURES) {
    const evicted = recentTelemetrySignatureQueue.shift();
    if (evicted) recentTelemetrySignatures.delete(evicted);
  }
  return true;
}

function extractTelemetryEvents(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.telemetry)) return data.telemetry;
  if (data.EventName || data.eventName) return [data];
  return [];
}

function normalizeScalarId(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.includes(':') ? trimmed.split(':').pop() : trimmed;
  return withoutPrefix ? withoutPrefix.trim() : null;
}

function collectUsableTelemetryFields(node, collector, depth = 0) {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectUsableTelemetryFields(item, collector, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [rawKey, value] of Object.entries(node)) {
    const key = String(rawKey || '').toLowerCase();
    const normalized = normalizeScalarId(value);

    if (normalized) {
      if (PLAYER_ID_KEYS.has(key)) collector.playerIds.add(normalized);
      if (HERO_ID_KEYS.has(key)) collector.heroIds.add(normalized);
      if (SHIP_ID_KEYS.has(key)) collector.shipIds.add(normalized);
      if (WEAPON_ID_KEYS.has(key)) collector.weaponIds.add(normalized);
      if (EQUIPMENT_ID_KEYS.has(key)) collector.equipmentIds.add(normalized);
      if (PERK_ID_KEYS.has(key)) collector.perkIds.add(normalized);
      if (MATCH_ID_KEYS.has(key)) collector.matchIds.add(normalized);
      if (SESSION_ID_KEYS.has(key)) collector.sessionIds.add(normalized);
      if (OUTCOME_KEYS.has(key)) collector.outcomes.add(normalized);
    }

    if (typeof value === 'object' && value != null) {
      collectUsableTelemetryFields(value, collector, depth + 1);
    }
  }
}

function firstSetValue(set) {
  if (!(set instanceof Set) || set.size === 0) return null;
  for (const value of set.values()) return value;
  return null;
}

function buildUsableTelemetryEvent(evt) {
  if (!evt || typeof evt !== 'object') return null;
  const timestampMs = parseTelemetryTimestampMs(evt);
  const eventNameRaw = evt.EventName ?? evt.eventName ?? evt.type ?? evt.name;
  const eventName = typeof eventNameRaw === 'string' ? eventNameRaw.trim() : '';

  const collector = {
    playerIds: new Set(),
    heroIds: new Set(),
    shipIds: new Set(),
    weaponIds: new Set(),
    equipmentIds: new Set(),
    perkIds: new Set(),
    matchIds: new Set(),
    sessionIds: new Set(),
    outcomes: new Set(),
  };
  collectUsableTelemetryFields(evt, collector);

  const matchId = normalizeScalarId(evt.matchId ?? evt.MatchId ?? firstSetValue(collector.matchIds));
  const sessionId = normalizeScalarId(evt.sessionId ?? evt.SessionId ?? firstSetValue(collector.sessionIds));
  const outcome = normalizeScalarId(evt.result ?? evt.matchResult ?? evt.outcome ?? firstSetValue(collector.outcomes));

  const hasAnyUsefulContent = Boolean(
    eventName
    || timestampMs
    || matchId
    || sessionId
    || collector.playerIds.size
    || collector.heroIds.size
    || collector.shipIds.size
    || collector.weaponIds.size
    || collector.equipmentIds.size
    || collector.perkIds.size
    || outcome
  );
  if (!hasAnyUsefulContent) return null;

  return {
    timestamp: timestampMs ?? Date.now(),
    eventName: eventName || 'unknown',
    matchId: matchId || undefined,
    sessionId: sessionId || undefined,
    outcome: outcome || undefined,
    playerIds: Array.from(collector.playerIds),
    heroIds: Array.from(collector.heroIds),
    shipIds: Array.from(collector.shipIds),
    weaponIds: Array.from(collector.weaponIds),
    equipmentIds: Array.from(collector.equipmentIds),
    perkIds: Array.from(collector.perkIds),
  };
}

function extractUsableTelemetryEvents(data) {
  const events = extractTelemetryEvents(data);
  const usable = [];
  for (const evt of events) {
    const normalized = buildUsableTelemetryEvent(evt);
    if (normalized) usable.push(normalized);
  }
  return usable;
}

async function ensureTelemetryHistoryMigrated() {
  if (telemetryHistoryMigrated) return;
  telemetryHistoryMigrated = true;
  await fsPromises.mkdir(path.dirname(TELEMETRY_HISTORY_NDJSON_PATH), { recursive: true });

  try {
    await fsPromises.access(TELEMETRY_HISTORY_NDJSON_PATH);
    return;
  } catch {
    // continue
  }

  let legacyEntries = [];
  try {
    const raw = await fsPromises.readFile(TELEMETRY_HISTORY_LEGACY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) legacyEntries = parsed;
    else if (parsed && Array.isArray(parsed.telemetry)) legacyEntries = parsed.telemetry;
    else if (parsed && typeof parsed === 'object') legacyEntries = [parsed];
  } catch {
    legacyEntries = [];
  }

  if (legacyEntries.length > 0) {
    const lines = legacyEntries
      .map(evt => buildUsableTelemetryEvent(evt))
      .filter(Boolean)
      .map(evt => {
        try {
          return JSON.stringify(evt);
        } catch {
          return '';
        }
      })
      .filter(Boolean);
    if (lines.length > 0) {
      await fsPromises.writeFile(TELEMETRY_HISTORY_NDJSON_PATH, `${lines.join('\n')}\n`, 'utf8');
    }
  }

  try {
    const backupPath = `${TELEMETRY_HISTORY_LEGACY_PATH}.migrated.bak`;
    await fsPromises.rename(TELEMETRY_HISTORY_LEGACY_PATH, backupPath);
  } catch {
    // ignore if missing
  }
}

async function appendTelemetryHistoryEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { addedCount: 0, skippedCount: 0 };
  }

  await ensureTelemetryHistoryMigrated();
  const lines = [];
  let skippedCount = 0;

  for (const evt of events) {
    const usableEvt = buildUsableTelemetryEvent(evt);
    if (!usableEvt) {
      skippedCount += 1;
      continue;
    }
    const signature = telemetryEventSignature(usableEvt);
    if (signature && !pushRecentTelemetrySignature(signature)) {
      skippedCount += 1;
      continue;
    }
    try {
      lines.push(JSON.stringify(usableEvt));
    } catch {
      skippedCount += 1;
    }
  }

  if (lines.length > 0) {
    await fsPromises.appendFile(TELEMETRY_HISTORY_NDJSON_PATH, `${lines.join('\n')}\n`, 'utf8');
  }
  return { addedCount: lines.length, skippedCount };
}

async function readTelemetryHistoryEntries() {
  await ensureTelemetryHistoryMigrated();
  let content = '';
  try {
    content = await fsPromises.readFile(TELEMETRY_HISTORY_NDJSON_PATH, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split('\n').filter(Boolean);
  const entries = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const bytes = Buffer.byteLength(`${line}\n`, 'utf8');
    try {
      const event = JSON.parse(line);
      entries.push({
        line,
        event,
        bytes,
        timestampMs: parseTelemetryTimestampMs(event),
        index: i,
      });
    } catch {
      // keep malformed lines out of the retained set during compaction/prune
    }
  }
  return entries;
}

function buildTelemetryPrunePlan(entries) {
  const sorted = [...entries].sort((a, b) => {
    const aTs = a.timestampMs ?? Number.MIN_SAFE_INTEGER;
    const bTs = b.timestampMs ?? Number.MIN_SAFE_INTEGER;
    if (aTs !== bTs) return aTs - bTs;
    return a.index - b.index;
  });

  const cutoffMs = Date.now() - TELEMETRY_RETENTION_MAX_AGE_MS;
  let totalBytes = sorted.reduce((sum, e) => sum + e.bytes, 0);
  let removeCount = 0;
  let removedBytes = 0;

  while (removeCount < sorted.length) {
    const oldest = sorted[removeCount];
    const oldestTs = oldest.timestampMs ?? 0;
    const exceedsAge = oldestTs > 0 ? oldestTs < cutoffMs : true;
    const exceedsSize = totalBytes > TELEMETRY_RETENTION_MAX_BYTES;
    if (!exceedsAge && !exceedsSize) break;

    removedBytes += oldest.bytes;
    totalBytes -= oldest.bytes;
    removeCount += 1;
  }

  const keepSet = new Set(sorted.slice(removeCount).map(e => e.index));
  const keepEntries = entries.filter(e => keepSet.has(e.index));
  return { removeCount, removedBytes, remainingBytes: totalBytes, keepEntries };
}

async function getTelemetryRetentionStatusInternal() {
  const entries = await readTelemetryHistoryEntries();
  const sizeBytes = entries.reduce((sum, e) => sum + e.bytes, 0);
  const timestampValues = entries.map(e => e.timestampMs).filter(v => Number.isFinite(v) && v > 0);
  const oldestTimestampMs = timestampValues.length ? Math.min(...timestampValues) : null;
  const newestTimestampMs = timestampValues.length ? Math.max(...timestampValues) : null;
  const cutoffMs = Date.now() - TELEMETRY_RETENTION_MAX_AGE_MS;
  const exceedsAge = oldestTimestampMs != null ? oldestTimestampMs < cutoffMs : false;
  const exceedsSize = sizeBytes > TELEMETRY_RETENTION_MAX_BYTES;
  const exceedsLimits = exceedsAge || exceedsSize;
  const preview = buildTelemetryPrunePlan(entries);

  return {
    exists: entries.length > 0,
    totalEntries: entries.length,
    sizeBytes,
    maxBytes: TELEMETRY_RETENTION_MAX_BYTES,
    maxAgeMs: TELEMETRY_RETENTION_MAX_AGE_MS,
    oldestTimestampMs,
    newestTimestampMs,
    exceedsAge,
    exceedsSize,
    exceedsLimits,
    prunePreview: {
      wouldRemoveEntries: preview.removeCount,
      wouldFreeBytes: preview.removedBytes,
      remainingBytes: preview.remainingBytes,
    },
  };
}

async function maybeCompactTelemetryHistory() {
  const now = Date.now();
  if ((now - telemetryHistoryLastCompactionAt) < TELEMETRY_HISTORY_COMPACTION_MIN_INTERVAL_MS) return;
  telemetryHistoryLastCompactionAt = now;
  const entries = await readTelemetryHistoryEntries();
  const seen = new Set();
  const compactedLines = [];
  for (const entry of entries) {
    const usable = buildUsableTelemetryEvent(entry.event);
    if (!usable) continue;
    const signature = telemetryEventSignature(usable);
    if (signature && seen.has(signature)) continue;
    if (signature) seen.add(signature);
    try {
      compactedLines.push(JSON.stringify(usable));
    } catch {
      // skip malformed
    }
  }
  const payload = compactedLines.join('\n');
  await fsPromises.writeFile(TELEMETRY_HISTORY_NDJSON_PATH, payload ? `${payload}\n` : '', 'utf8');
}

async function emitTelemetryPruneNeededIfNecessary(force = false) {
  if (TELEMETRY_RETENTION_PROMPT_DISABLED) return;
  if (!win || win.isDestroyed()) return;
  if (telemetryRetentionScanInProgress) return;
  const now = Date.now();
  if (!force && (now - telemetryPruneLastNotifiedAt) < 10 * 60 * 1000) return;

  telemetryRetentionScanInProgress = true;
  try {
    const status = await getTelemetryRetentionStatusInternal();
    if (telemetryRetentionLastExceeds !== status.exceedsLimits) {
      telemetryRetentionLastExceeds = status.exceedsLimits;
      console.log(`[TelemetryRetention] status=${status.exceedsLimits ? 'exceeded' : 'healthy'} entries=${status.totalEntries} sizeBytes=${status.sizeBytes}`);
    }
    if (status.exceedsLimits) {
      telemetryPruneLastNotifiedAt = now;
      win.webContents.send('telemetry-prune-needed', status);
      console.log(`[TelemetryRetention] prune-needed emitted remove=${status.prunePreview.wouldRemoveEntries} freeBytes=${status.prunePreview.wouldFreeBytes}`);
    }
  } catch (e) {
    console.warn('[TelemetryRetention] Failed to emit prune-needed event:', e?.message || e);
  } finally {
    telemetryRetentionScanInProgress = false;
  }
}

function getCorpusFilePath(name) {
  const allowed = new Set(['ground-truth.json', 'predictions.latest.json', 'baseline.json', 'reports/latest.json', 'reports/index.json']);
  if (!allowed.has(name)) return null;
  return path.join(OCR_CORPUS_DIR, name);
}

async function ensureCorpusDefaults() {
  await fsPromises.mkdir(OCR_CORPUS_DIR, { recursive: true });
  await fsPromises.mkdir(OCR_CORPUS_REPORTS_DIR, { recursive: true });

  const defaults = [
    {
      file: path.join(OCR_CORPUS_DIR, 'ground-truth.json'),
      content: JSON.stringify({ version: 1, samples: [] }, null, 2)
    },
    {
      file: path.join(OCR_CORPUS_DIR, 'predictions.latest.json'),
      content: JSON.stringify({ version: 1, generatedAt: '', samples: [] }, null, 2)
    },
    {
      file: path.join(OCR_CORPUS_DIR, 'baseline.json'),
      content: JSON.stringify({
        generatedAt: '',
        sourceReport: '',
        summary: {
          totalSamples: 0,
          teammateRecall: 0,
          opponentRecall: 0,
          modifierRecall: 0,
          teamGroupingAccuracy: 0,
          sessionUsablePassRate: 0
        }
      }, null, 2)
    }
  ];

  for (const d of defaults) {
    try {
      await fsPromises.access(d.file);
    } catch {
      await fsPromises.writeFile(d.file, d.content, 'utf8');
    }
  }
}

async function listFilesRecursive(rootDir) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = rel ? path.join(rootDir, rel) : rootDir;
    let entries = [];
    try {
      entries = await fsPromises.readdir(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const nextRel = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) stack.push(nextRel);
      else if (entry.isFile()) out.push(nextRel);
    }
  }
  return out;
}

async function syncCorpusToRepo(reason = 'unknown') {
  if (!isDev || !AUTO_SYNC_CORPUS_TO_REPO) {
    return { synced: false, copied: 0, reason: 'disabled' };
  }

  try {
    await fsPromises.access(OCR_CORPUS_DIR);
  } catch {
    return { synced: false, copied: 0, reason: 'missing-source' };
  }

  await fsPromises.mkdir(REPO_OCR_CORPUS_DIR, { recursive: true });
  const relFiles = await listFilesRecursive(OCR_CORPUS_DIR);
  let copied = 0;

  for (const rel of relFiles) {
    const src = path.join(OCR_CORPUS_DIR, rel);
    const dst = path.join(REPO_OCR_CORPUS_DIR, rel);
    await fsPromises.mkdir(path.dirname(dst), { recursive: true });
    await fsPromises.copyFile(src, dst);
    copied += 1;
  }

  console.log(`[OCR Corpus] Synced ${copied} file(s) to repo (${reason})`);
  return { synced: true, copied, reason };
}

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: app.getAppPath(),
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk || ''); });
    child.stderr.on('data', chunk => { stderr += String(chunk || ''); });
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
    child.on('error', err => {
      resolve({ code: 1, stdout, stderr: err.message || String(err) });
    });
  });
}

function resolveBundledScript(scriptName) {
  const candidates = [
    path.join(app.getAppPath(), 'scripts', scriptName),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'scripts', scriptName),
    path.join(process.resourcesPath || '', 'scripts', scriptName),
    path.resolve(__dirname, '..', 'scripts', scriptName),
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return path.join(app.getAppPath(), 'scripts', scriptName);
}

function sampleIdFromPath(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function importCorpusImageFiles(sourcePaths = []) {
  const corpusImagesDir = path.join(OCR_CORPUS_DIR, 'images');
  await fsPromises.mkdir(corpusImagesDir, { recursive: true });

  const truthPath = path.join(OCR_CORPUS_DIR, 'ground-truth.json');
  let truth;
  try {
    truth = JSON.parse(await fsPromises.readFile(truthPath, 'utf8'));
  } catch {
    truth = { version: 1, samples: [] };
  }

  const samples = Array.isArray(truth.samples) ? truth.samples : [];
  const existingIds = new Set(samples.map(s => s.sampleId));

  let imported = 0;
  let skipped = 0;
  const uniquePaths = Array.from(new Set(
    (Array.isArray(sourcePaths) ? sourcePaths : [])
      .filter((p) => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean)
  ));

  for (const rawPath of uniquePaths) {
    try {
      const src = path.resolve(rawPath);
      const stat = await fsPromises.stat(src);
      if (!stat.isFile()) {
        skipped += 1;
        continue;
      }

      const ext = path.extname(src).toLowerCase();
      if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
        skipped += 1;
        continue;
      }

      const baseId = sampleIdFromPath(src);
      let sampleId = baseId;
      let counter = 1;
      while (existingIds.has(sampleId)) {
        sampleId = `${baseId}_${counter}`;
        counter += 1;
      }

      const targetName = `${sampleId}${ext}`;
      const targetPath = path.join(corpusImagesDir, targetName);
      if (path.resolve(src) !== path.resolve(targetPath)) {
        await fsPromises.copyFile(src, targetPath);
      }

      const relPath = path.relative(OCR_CORPUS_DIR, targetPath).replace(/\\/g, '/');
      samples.push({
        sampleId,
        imagePath: relPath,
        teammates: [],
        opponentTeams: [],
        modifiers: []
      });
      existingIds.add(sampleId);
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  const nextTruth = {
    version: typeof truth.version === 'number' ? truth.version : 1,
    samples
  };
  await fsPromises.writeFile(truthPath, JSON.stringify(nextTruth, null, 2), 'utf8');
  return { imported, skipped };
}

function normalizeStringList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(v => String(v || '').trim()).filter(Boolean);
}

function normalizeOpponentTeamsForCorpus(teams) {
  if (!Array.isArray(teams)) return [];
  return teams
    .map((team) => {
      const teamName = String(team?.teamName || '').trim();
      const teamColor = String(team?.teamColor || '').trim();
      const players = normalizeStringList(team?.players || []);
      return {
        teamName,
        teamColor,
        players,
      };
    })
    .filter((team) => team.teamName || team.players.length > 0);
}

function normalizeScreenshotBase64(value) {
  if (!value) return '';
  return String(value)
    .replace(/^data:image\/\w+;base64,/, '')
    .replace(/\s+/g, '')
    .trim();
}

function buildCorpusSampleSignature({ teammates, opponentTeams, modifiers }) {
  const normalizedTeams = normalizeStringList(teammates || []).map((n) => n.toLowerCase()).sort();
  const normalizedModifiers = normalizeStringList(modifiers || []).map((n) => n.toLowerCase()).sort();
  const normalizedOpponents = normalizeOpponentTeamsForCorpus(opponentTeams || [])
    .map((team) => ({
      teamName: String(team.teamName || '').toLowerCase(),
      teamColor: String(team.teamColor || '').toLowerCase(),
      players: normalizeStringList(team.players || []).map((name) => name.toLowerCase()).sort(),
    }))
    .sort((a, b) => {
      const keyA = `${a.teamName}|${a.teamColor}|${a.players.join(',')}`;
      const keyB = `${b.teamName}|${b.teamColor}|${b.players.join(',')}`;
      return keyA.localeCompare(keyB);
    });
  const signaturePayload = JSON.stringify({
    teammates: normalizedTeams,
    opponentTeams: normalizedOpponents,
    modifiers: normalizedModifiers,
  });
  return crypto.createHash('sha1').update(signaturePayload).digest('hex');
}

const DEV_T0_MS = isDev ? Date.now() : 0;
function devMark(label) {
  if (!isDev) return;
  const dt = Date.now() - DEV_T0_MS;
  console.log(`[dev-timing] +${dt}ms ${label}`);
}

let win;
let tray = null;
function resolveAppIconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(__dirname, 'assets/icon.ico'),
    path.join(__dirname, 'assets/icon.png'),
    path.join(__dirname, '../public/app-icon.png'),
    path.join(__dirname, '../public/icon-512.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}
let previousBounds = { x: 0, y: 0, width: 1440, height: 900 };
let lastOverlayBounds = null;
let currentOverlayStyle = 'compact';
let windowVisibilityAnimation = null;
const DEFAULT_MIN_WINDOW_BOUNDS = { width: 1200, height: 768 };
const OVERLAY_MIN_WINDOW_BOUNDS = {
  compact: { width: 420, height: 520 },
  transparent: { width: 640, height: 420 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clearWindowVisibilityAnimation() {
  if (windowVisibilityAnimation) {
    clearInterval(windowVisibilityAnimation);
    windowVisibilityAnimation = null;
  }
}

function animateWindowOpacity(targetOpacity, { durationMs = 140, onComplete } = {}) {
  if (!win || win.isDestroyed()) return;
  clearWindowVisibilityAnimation();

  const startOpacity = typeof win.getOpacity === 'function' ? win.getOpacity() : 1;
  if (Math.abs(startOpacity - targetOpacity) < 0.01) {
    try { win.setOpacity(targetOpacity); } catch { /* no-op */ }
    if (typeof onComplete === 'function') onComplete();
    return;
  }

  const startTime = Date.now();
  windowVisibilityAnimation = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearWindowVisibilityAnimation();
      return;
    }
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    const nextOpacity = startOpacity + ((targetOpacity - startOpacity) * eased);
    try {
      win.setOpacity(Math.max(0, Math.min(1, nextOpacity)));
    } catch {
      clearWindowVisibilityAnimation();
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    if (progress >= 1) {
      clearWindowVisibilityAnimation();
      if (typeof onComplete === 'function') onComplete();
    }
  }, 16);
}

function showWindowSmooth({ focus = true, forceDashboard = false } = {}) {
  if (!win || win.isDestroyed()) return;
  clearWindowVisibilityAnimation();
  try { win.setOpacity(0); } catch { /* no-op */ }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  if (forceDashboard) {
    win.setSkipTaskbar(false);
    win.webContents.send('hotkey-toggle-overlay', false);
  }
  win.setAlwaysOnTop(true, 'screen-saver');
  if (focus) win.focus();
  animateWindowOpacity(1);
}

function hideWindowSmooth() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  animateWindowOpacity(0, {
    onComplete: () => {
      if (!win || win.isDestroyed()) return;
      win.minimize();
      try { win.setOpacity(1); } catch { /* no-op */ }
    },
  });
}

function toggleWindowVisibilitySmooth({ focusOnShow = true } = {}) {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && !win.isMinimized()) {
    hideWindowSmooth();
    return;
  }
  showWindowSmooth({ focus: focusOnShow });
}

function getOverlayBoundsForStyle(style, workAreaSize) {
  if (style === 'transparent') {
    return {
      width: clamp(Math.round(workAreaSize.width * 0.52), 760, 1420),
      height: clamp(Math.round(workAreaSize.height * 0.72), 520, 980),
      minWidth: OVERLAY_MIN_WINDOW_BOUNDS.transparent.width,
      minHeight: OVERLAY_MIN_WINDOW_BOUNDS.transparent.height,
    };
  }

  return {
    width: clamp(Math.round(workAreaSize.width * 0.34), 460, 760),
    height: clamp(Math.round(workAreaSize.height * 0.84), 620, 1100),
    minWidth: OVERLAY_MIN_WINDOW_BOUNDS.compact.width,
    minHeight: OVERLAY_MIN_WINDOW_BOUNDS.compact.height,
  };
}

function buildDevSplashDataUrl(targetUrl) {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Wildgate Stat Tracker</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        background: radial-gradient(circle at 30% 20%, rgba(56,189,248,0.20), transparent 45%),
                    radial-gradient(circle at 70% 10%, rgba(251,146,60,0.16), transparent 55%),
                    linear-gradient(180deg, rgba(8,12,18,1) 0%, rgba(5,8,12,1) 100%);
        color: rgba(255,255,255,0.86);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .card {
        width: min(560px, calc(100vw - 48px));
        padding: 18px 18px 16px;
        border-radius: 18px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.10);
        backdrop-filter: blur(14px);
        box-shadow: 0 20px 60px rgba(0,0,0,0.55);
      }
      .row { display: flex; align-items: center; gap: 12px; }
      .logo {
        width: 34px; height: 34px; border-radius: 12px;
        background: linear-gradient(135deg, rgba(56,189,248,1) 0%, rgba(251,146,60,1) 100%);
        display: grid; place-items: center;
        color: rgba(0,0,0,0.85);
        font-weight: 900;
      }
      h1 { margin: 0; font-size: 14px; letter-spacing: 0.14em; text-transform: uppercase; }
      .sub { margin-top: 10px; font-size: 12px; opacity: 0.75; line-height: 1.35; }
      .spinner {
        width: 14px; height: 14px;
        border-radius: 999px;
        border: 2px solid rgba(255,255,255,0.18);
        border-top-color: rgba(255,255,255,0.72);
        animation: spin 0.9s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="row">
        <div class="logo">W</div>
        <div style="min-width:0;">
          <h1>Wildgate Stat Tracker</h1>
          <div class="sub row" style="margin-top:6px;">
            <div class="spinner"></div>
            <div id="splash-status">Getting ready…</div>
          </div>
        </div>
      </div>
    </div>
    <script>
      var statuses = [
        'Getting ready…',
        'Starting up…',
        'Preparing to data track…',
        'Almost there…'
      ];
      var statusIndex = 0;
      var statusNode = document.getElementById('splash-status');
      var renderStatus = function () {
        if (!statusNode) return;
        statusNode.textContent = statuses[statusIndex % statuses.length];
        statusIndex += 1;
      };
      renderStatus();
      setInterval(renderStatus, 2500);
      window.__setSplashProgress = function () {};
    </script>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/** Last splash payload sent (for dedupe + monotonic percent). Keyed by win.id. */
const lastSplashByWin = new Map();

function setSplashProgress(targetWin, pct, status, detail = '') {
  if (!targetWin || targetWin.isDestroyed()) return;
  const key = targetWin.id;
  const prev = lastSplashByWin.get(key);
  const requestedPct = Math.max(0, Math.min(100, Number(pct) || 0));
  // Dev startup has multiple progress writers; keep splash percent monotonic.
  const safePct = Math.max(prev?.pct ?? 0, requestedPct);
  const payload = {
    pct: safePct,
    status: String(status || 'Loading...'),
    detail: String(detail || ''),
  };
  const same = prev && prev.pct === payload.pct && prev.status === payload.status && prev.detail === payload.detail;
  if (same) return;
  lastSplashByWin.set(key, payload);

  const statusArg = JSON.stringify(payload.status);
  const detailArg = JSON.stringify(payload.detail);
  const js = `window.__setSplashProgress && window.__setSplashProgress(${payload.pct}, ${statusArg}, ${detailArg});`;
  targetWin.webContents.executeJavaScript(js, true).catch(() => { });
}

function setSplashProgressDedupe(targetWin, pct, status, detail = '') {
  setSplashProgress(targetWin, pct, status, detail);
}

function probeUrlReady(urlString, timeoutMs = 450) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlString);
      const transport = u.protocol === 'https:' ? https : http;
      const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
      const req = transport.request(
        {
          method: 'GET',
          hostname: u.hostname,
          port,
          path: u.pathname && u.pathname !== '/' ? u.pathname : '/',
          timeout: timeoutMs,
          headers: {
            'Accept': 'text/html,*/*',
            'User-Agent': 'WildgateStatTrackerDevProbe',
            'Connection': 'close',
          },
        },
        (res) => {
          // Any response means the server is listening; no need to read the body.
          res.resume();
          resolve(true);
        }
      );

      req.on('timeout', () => {
        try { req.destroy(); } catch { }
        resolve(false);
      });
      req.on('error', () => resolve(false));
      req.end();
    } catch {
      resolve(false);
    }
  });
}

function startDevRendererWithRetry(win, targetUrl) {
  const url = targetUrl || DEV_SERVER_URL;
  const splashUrl = buildDevSplashDataUrl(url);

  let stopped = false;
  let inFlight = false;
  let attempt = 0;
  let retryTimer = null;
  const waitStartedAt = Date.now();
  const RETRY_DELAY_MS = Math.max(1000, parseInt(process.env.WILDGATE_DEV_RETRY_DELAY_MS || '2000', 10) || 2000);
  const MAX_DEV_ATTEMPTS = Math.max(60, parseInt(process.env.WILDGATE_DEV_MAX_ATTEMPTS || '240', 10) || 240);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    try { lastSplashByWin.delete(win.id); } catch { }
    try { win.webContents.removeListener('did-finish-load', onFinishLoad); } catch { }
  };

  const onFinishLoad = () => {
    try {
      const current = win.webContents.getURL() || '';
      if (current.startsWith(url)) {
        devMark(`dev URL loaded (attempt ${attempt})`);
        stop();
      }
    } catch { }
  };

  const HEARTBEAT_INTERVAL = 1;
  const tryLoad = async () => {
    if (stopped || inFlight || !win || win.isDestroyed()) return;
    inFlight = true;
    attempt += 1;
    if (attempt > MAX_DEV_ATTEMPTS) {
      setSplashProgressDedupe(
        win,
        96,
        'Waiting for dev server...',
        `Still starting after ${MAX_DEV_ATTEMPTS} attempts. Check Vite terminal output.`
      );
      inFlight = false;
      retryTimer = setTimeout(tryLoad, RETRY_DELAY_MS);
      return;
    }
    const elapsedMs = Date.now() - waitStartedAt;
    // Keep dev wait progress moving forward from the main-process 90% milestone
    // so long dependency re-optimization does not look frozen.
    const waitPct = Math.min(96, 90 + Math.floor(elapsedMs / 2500));
    const isFirst = attempt === 1;
    const isHeartbeat = attempt % HEARTBEAT_INTERVAL === 0;
    if (isFirst || isHeartbeat) {
      setSplashProgressDedupe(
        win,
        waitPct,
        'Waiting for dev server...',
        `Checking dev server (attempt ${attempt})`
      );
    }

    try {
      const ready = await probeUrlReady(url);
      if (!ready) {
        if (isFirst || isHeartbeat) {
          setSplashProgressDedupe(
            win,
            waitPct,
            'Waiting for dev server...',
            `Retrying connection (attempt ${attempt})`
          );
        }
        inFlight = false;
        retryTimer = setTimeout(tryLoad, RETRY_DELAY_MS);
        return;
      }

      setSplashProgressDedupe(win, 95, 'Loading interface...', 'Renderer is responding');
      await win.loadURL(url);
      // stop() happens on did-finish-load once the dev URL successfully loads.
      inFlight = false;
    } catch {
      if (isFirst || isHeartbeat) {
        setSplashProgressDedupe(
          win,
          waitPct,
          'Waiting for dev server...',
          `Retrying connection (attempt ${attempt})`
        );
      }
      inFlight = false;
      retryTimer = setTimeout(tryLoad, RETRY_DELAY_MS);
    }
  };

  win.webContents.on('did-finish-load', onFinishLoad);
  win.on('closed', stop);
  // Show a friendly splash instead of the Chromium "failed to load" page.
  devMark('splash shown');
  win.loadURL(splashUrl).then(() => {
    setSplashProgress(win, 12, 'Preparing renderer...', 'Splash ready');
    // Show splash immediately after it renders so startup feels responsive.
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show();
    }
  }).catch(() => { });
  retryTimer = setTimeout(tryLoad, 250);
}

function createTray() {
  try {
    const iconPath = resolveAppIconPath();
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show Dashboard', click: () => {
            if (win) {
              showWindowSmooth({ focus: true, forceDashboard: true });
            }
          }
        },
        {
          label: 'Toggle Overlay (F9)', click: () => {
            if (win) {
              toggleWindowVisibilitySmooth({ focusOnShow: true });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit', click: () => {
            app.quit();
          }
        }
      ]);

      tray.setToolTip('Wildgate Stat Tracker');
      tray.setContextMenu(contextMenu);

      tray.on('double-click', () => {
        if (win) {
          toggleWindowVisibilitySmooth({ focusOnShow: true });
        }
      });
    } else {
      console.warn('Tray icon not found at:', iconPath);
    }
  } catch (e) {
    console.error('Failed to create tray:', e);
  }
}

// Database Path
const DB_FILENAME = 'wildgate_db.json';
const DB_PATH = path.join(app.getPath('userData'), DB_FILENAME);
const DB_TEMP_PATH = `${DB_PATH}.tmp`;
const DB_PREV_PATH = DB_PATH.replace('.json', '.prev.json');
const DB_WAL_PATH = DB_PATH.replace('.json', '.wal.json');
const DB_BACKUP_DIR = path.join(app.getPath('documents'), 'Wildgate Stat Tracker', 'Backups');
let lastAutoBackupAtMs = 0;
let dbWriteQueue = Promise.resolve(true);

const LEGACY_APP_NAMES = ['Wildgate Stat Tracker', 'wildgate-stat-tracker', 'Wildgate Tracker'];
const LEGACY_APPDATA_ROOTS = [app.getPath('appData')];
if (process.platform === 'win32') {
  LEGACY_APPDATA_ROOTS.push(path.join(app.getPath('home'), 'AppData', 'Local'));
}
const LEGACY_DB_PATHS = LEGACY_APPDATA_ROOTS.flatMap(root =>
  LEGACY_APP_NAMES.map(name => path.join(root, name, DB_FILENAME))
);
const getDbCandidates = () => {
  const set = new Set([DB_PATH, DB_PREV_PATH, DB_TEMP_PATH, DB_WAL_PATH, ...LEGACY_DB_PATHS]);
  return Array.from(set);
};
const LOG_FILE_PATH = path.join(app.getPath('userData'), 'app_logs.txt');

// Artifact handlers (Phase 2: electron/handlers/*)
registerArtifactHandlers(ipcMain, { app, getWin: () => win, artifactHelpers });

ipcMain.handle('rerun-ocr-on-artifact', async (event, { imagePath, activeUser, ocrMode, ocrRegions, runtimeOptions }) => {
  try {
    const pathCheck = resolveAllowedRendererPath(imagePath);
    if (!pathCheck.success) {
      recordSecurityBlock('rerun-ocr-on-artifact', pathCheck.code || IpcErrorCode.PATH_NOT_ALLOWED, pathCheck.message || 'Path not allowed');
      return errorResult(pathCheck.code || IpcErrorCode.PATH_NOT_ALLOWED, pathCheck.message || 'Path not allowed');
    }
    const fullPath = pathCheck.data.resolved;
    const extCheck = validateAllowedExtension(fullPath, ALLOWED_FILE_EXTENSIONS, 'image');
    if (!extCheck.success) {
      recordSecurityBlock('rerun-ocr-on-artifact', extCheck.code, extCheck.message);
      return errorResult(extCheck.code, extCheck.message);
    }
    if (!fs.existsSync(fullPath)) return errorResult(IpcErrorCode.NOT_FOUND, 'File not found');
    const imageBuffer = await fsPromises.readFile(fullPath);
    const base64 = imageBuffer.toString('base64');
    // Pass sourceImagePath to skip duplicate debug save and cloud upload
    const safeRuntimeOptions = (runtimeOptions && typeof runtimeOptions === 'object' && !Array.isArray(runtimeOptions))
      ? runtimeOptions
      : {};
    const result = await processCapture(base64, activeUser, null, ocrMode || 'both', {
      sourceImagePath: fullPath,
      ocrRegions: ocrRegions || null,
      ...safeRuntimeOptions,
    });
    return result;
  } catch (e) {
    console.error('[rerun-ocr] Error:', e.message);
    return errorResult(IpcErrorCode.INTERNAL_ERROR, e.message || 'Unknown error');
  }
});

// Multi-image rerun: processes a match's screenshots sequentially so that
// each result is fed as existingData into the next processCapture call.
// This allows ocrMerger.mergeCaptures to do a proper server-side merge
// (combining tactical-map ship/hazard data with crew-hub player data).
ipcMain.handle('rerun-ocr-multi', async (event, { imagePaths, activeUser, ocrMode, ocrRegions, runtimeOptions }) => {
  try {
    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
      return errorResult(IpcErrorCode.INVALID_INPUT, 'imagePaths must be a non-empty array');
    }
    const safeRuntimeOptions = (runtimeOptions && typeof runtimeOptions === 'object' && !Array.isArray(runtimeOptions))
      ? runtimeOptions
      : {};
    const perFile = [];
    // Phase 1: process every image independently (no existingData chaining).
    // Passing the previous result as existingData would let its screenshotType
    // leak into the next image's PSM hint, causing the crew hub to be OCR'd with
    // mapScreen's PSM=11 and then misclassified, crashing the extractor.
    for (const imagePath of imagePaths) {
      const pathCheck = resolveAllowedRendererPath(imagePath);
      if (!pathCheck.success) {
        recordSecurityBlock('rerun-ocr-multi', pathCheck.code || IpcErrorCode.PATH_NOT_ALLOWED, pathCheck.message || 'Path not allowed');
        perFile.push({ imagePath, success: false, error: pathCheck.message || 'Path not allowed' });
        continue;
      }
      const fullPath = pathCheck.data.resolved;
      const extCheck = validateAllowedExtension(fullPath, ALLOWED_FILE_EXTENSIONS, 'image');
      if (!extCheck.success) {
        recordSecurityBlock('rerun-ocr-multi', extCheck.code, extCheck.message);
        perFile.push({ imagePath: fullPath, success: false, error: extCheck.message });
        continue;
      }
      if (!fs.existsSync(fullPath)) {
        perFile.push({ imagePath: fullPath, success: false, error: 'File not found' });
        continue;
      }
      try {
        const imageBuffer = await fsPromises.readFile(fullPath);
        const base64 = imageBuffer.toString('base64');
        const result = await processCapture(base64, activeUser, null, ocrMode || 'both', {
          sourceImagePath: fullPath,
          ocrRegions: ocrRegions || null,
          ...safeRuntimeOptions,
        });
        if (result && result.success && result.data) {
          perFile.push({ imagePath: fullPath, success: true, data: result.data });
        } else {
          perFile.push({ imagePath: fullPath, success: false, error: (result && result.error) || 'OCR returned no data' });
        }
      } catch (e) {
        console.error('[rerun-ocr-multi] Error processing', fullPath, ':', e.message);
        perFile.push({ imagePath: fullPath, success: false, error: e.message || 'Processing failed' });
      }
    }
    const successCount = perFile.filter(f => f.success).length;
    const _mDlogPath = require('path').join(require('os').tmpdir(), 'wildgate-ocr.log');
    const _mDlog = msg => { try { fs.appendFileSync(_mDlogPath, new Date().toISOString() + ' [multi] ' + msg + '\n'); } catch(_e) {} };
    if (successCount === 0) {
      const failSummary = perFile
        .map((f) => {
          const name = String(f.imagePath || '').split(/[\\/]/).pop() || 'unknown';
          const reason = String(f.error || 'OCR returned no data');
          return `${name}: ${reason}`;
        })
        .join(' | ');
      _mDlog('FAIL: all ' + perFile.length + ' images failed OCR' + (failSummary ? ' :: ' + failSummary : ''));
      return {
        success: false,
        code: IpcErrorCode.INTERNAL_ERROR,
        message: 'All images failed OCR processing',
        error: 'All images failed OCR processing',
        perFile,
      };
    }
    _mDlog('perFile: ' + perFile.map(f => f.imagePath.split(/[\\/]/).pop() + '=' + (f.success ? (f.data?.screenshotType || 'noType') : 'FAIL')).join(', '));
    // Phase 2: merge successful results sequentially so ocrMerger combines
    // tactical-map data (ship types, hazards) with crew-hub data (player names).
    let accumulatedData = null;
    for (const entry of perFile) {
      if (!entry.success || !entry.data) continue;
      if (!accumulatedData) {
        _mDlog('seed: type=' + (entry.data.screenshotType || '?') + ' oppTeams=' + (entry.data.opponentTeams?.length || 0) + ' file=' + entry.imagePath.split(/[\\/]/).pop());
        accumulatedData = entry.data;
        continue;
      }
      const _sameMatch = isSameMatch(accumulatedData, entry.data);
      _mDlog('isSameMatch(acc.type=' + (accumulatedData.screenshotType || '?') + ' vs ' + (entry.data.screenshotType || '?') + ')=' + _sameMatch + ' file=' + entry.imagePath.split(/[\\/]/).pop());
      if (_sameMatch) {
        accumulatedData = mergeCaptures(accumulatedData, entry.data);
        const _oppC = accumulatedData.opponentTeams?.length || 0;
        const _plC = (accumulatedData.opponentTeams || []).reduce((s, t) => s + (t.players?.length || 0), 0);
        _mDlog('merged: type=' + (accumulatedData.screenshotType || '?') + ' oppTeams=' + _oppC + ' totalPlayers=' + _plC);
      } else {
        // Rerun inputs are from one match's artifact list; prefer preserving aggregate
        // fields over clobbering previously merged data when classifier disagrees.
        _mDlog('MISMATCH forced-merge with type=' + (entry.data.screenshotType || '?') + ' file=' + entry.imagePath.split(/[\\/]/).pop());
        accumulatedData = mergeCaptures(accumulatedData, entry.data);
      }
    }
    const _finOppC = accumulatedData?.opponentTeams?.length || 0;
    const _finPlC = (accumulatedData?.opponentTeams || []).reduce((s, t) => s + (t.players?.length || 0), 0);
    _mDlog('FINAL: type=' + (accumulatedData?.screenshotType || '?') + ' oppTeams=' + _finOppC + ' totalPlayers=' + _finPlC);
    return { success: true, data: accumulatedData, perFile };
  } catch (e) {
    console.error('[rerun-ocr-multi] Error:', e.message);
    return errorResult(IpcErrorCode.INTERNAL_ERROR, e.message || 'Unknown error');
  }
});

// Log Persistence Handler
ipcMain.handle('persist-logs', async (event, logContent) => {
  try {
    const MAX_LOG_SIZE = 100 * 1024;
    let existing = '';
    try {
      existing = await fsPromises.readFile(LOG_FILE_PATH, 'utf-8');
    } catch (e) { /* File doesn't exist yet */ }

    const combined = existing + '\n--- SESSION ---\n' + logContent;
    const trimmed = combined.length > MAX_LOG_SIZE
      ? combined.slice(combined.length - MAX_LOG_SIZE)
      : combined;
    await fsPromises.writeFile(LOG_FILE_PATH, trimmed);
    return { success: true };
  } catch (e) {
    console.error('Failed to persist logs:', e);
    return { success: false, error: e.message };
  }
});

// Read persisted app logs for user-facing diagnostics copy/export actions.
ipcMain.handle('read-logs', async () => {
  try {
    const content = await fsPromises.readFile(LOG_FILE_PATH, 'utf-8');
    return { success: true, path: LOG_FILE_PATH, content };
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
      return { success: true, path: LOG_FILE_PATH, content: '' };
    }
    return { success: false, error: e?.message || 'Failed to read logs', path: LOG_FILE_PATH };
  }
});
// Legacy Windows OCR - replaced by Tesseract.js in ocrHandler.cjs
// const { recognizeBatchFromPath } = require('node-windows-ocr');
// ipcMain.handle('ocr-scan', async (event, imagePath) => {
//   try {
//     if (!fs.existsSync(imagePath)) throw new Error(`File not found: ${imagePath}`);
//     const results = await recognizeBatchFromPath([imagePath]);
//     return results[0]?.Result;
//   } catch (e) {
//     console.error('[OCR] Native Scan Error:', e);
//     throw e;
//   }
// });

// OCR Scan (compatibility for scan pipeline)
ipcMain.handle('ocr-scan', async (event, imagePath) => {
  try {
    const pathCheck = resolveAllowedRendererPath(imagePath);
    if (!pathCheck.success) {
      recordSecurityBlock('ocr-scan', pathCheck.code || IpcErrorCode.PATH_NOT_ALLOWED, pathCheck.message || 'Path not allowed');
      throw new Error(pathCheck.message || 'Path not allowed');
    }
    const fullPath = pathCheck.data.resolved;
    const extCheck = validateAllowedExtension(fullPath, ALLOWED_FILE_EXTENSIONS, 'image');
    if (!extCheck.success) {
      recordSecurityBlock('ocr-scan', extCheck.code, extCheck.message);
      throw new Error(extCheck.message || 'Unsupported image type');
    }
    if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${fullPath}`);
    const buffer = await fsPromises.readFile(fullPath);
    return await runOCR(buffer);
  } catch (e) {
    console.error('[OCR] Scan Error:', e);
    throw e;
  }
});

// Database Handlers
async function fsyncDirBestEffort(dirPath) {
  try {
    const dirHandle = await fsPromises.open(dirPath, 'r');
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  } catch {
    // Not supported on all platforms/filesystems.
  }
}

async function writeFileDurableAtomic(filePath, payload) {
  const tempPath = `${filePath}.tmp`;
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });

  const fileHandle = await fsPromises.open(tempPath, 'w');
  try {
    await fileHandle.writeFile(payload, 'utf-8');
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }

  const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOENT']);
  let renameError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await fsPromises.rename(tempPath, filePath);
      renameError = null;
      break;
    } catch (error) {
      renameError = error;
      const code = String(error?.code || '');
      if (!RETRYABLE_RENAME_CODES.has(code)) {
        throw error;
      }
      const waitMs = 25 * (attempt + 1) * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  if (renameError) {
    // Last-resort fallback for Windows rename contention: replace via copy + unlink.
    await fsPromises.copyFile(tempPath, filePath);
    try {
      await fsPromises.unlink(tempPath);
    } catch {
      // Best effort cleanup only.
    }
  }

  await fsyncDirBestEffort(path.dirname(filePath));
}

async function writeWalDurable(data) {
  const walPayload = JSON.stringify({
    version: 1,
    createdAt: Date.now(),
    data
  }, null, 2);
  await writeFileDurableAtomic(DB_WAL_PATH, walPayload);
}

async function clearWalBestEffort() {
  try {
    await fsPromises.unlink(DB_WAL_PATH);
    await fsyncDirBestEffort(path.dirname(DB_WAL_PATH));
  } catch {
    // Already gone or unavailable.
  }
}

async function replayWalIfPresent() {
  try {
    await fsPromises.access(DB_WAL_PATH);
  } catch {
    return null;
  }

  try {
    const walRaw = await fsPromises.readFile(DB_WAL_PATH, 'utf-8');
    const wal = JSON.parse(walRaw);
    if (!wal || typeof wal !== 'object' || !wal.data) throw new Error('Invalid WAL payload');
    const payload = JSON.stringify(wal.data, null, 2);
    await writeFileDurableAtomic(DB_PATH, payload);
    await clearWalBestEffort();
    console.log('[DB] WAL replay successful');
    return wal.data;
  } catch (e) {
    console.error('[DB] WAL replay failed:', e);
    return null;
  }
}

ipcMain.handle('db-read', async () => {
  try {
    const replayed = await replayWalIfPresent();
    if (replayed) return replayed;

    const candidates = getDbCandidates();
    // Extra safety: if the main DB is corrupt/missing, try the newest backups too.
    try {
      const backups = await dbHelpers.listRecentBackups(DB_BACKUP_DIR, 12);
      for (const b of backups) candidates.push(b);
    } catch { /* ignore */ }

    for (const candidate of candidates) {
      try {
        await fsPromises.access(candidate);
      } catch {
        continue;
      }
      try {
        const content = await fsPromises.readFile(candidate, 'utf-8');
        const parsed = JSON.parse(content);
        if (candidate !== DB_PATH && candidate !== DB_WAL_PATH) {
          await fsPromises.mkdir(path.dirname(DB_PATH), { recursive: true });
          await fsPromises.copyFile(candidate, DB_PATH);
          console.log(`[DB] Recovered/migrated DB from ${candidate} -> ${DB_PATH}`);
        }
        return parsed;
      } catch (e) {
        console.error(`[DB] Read/parse error for ${candidate}:`, e);
      }
    }
    if (isDev) {
      console.warn(`[DB] No database found. Searched: ${candidates.join(', ')}`);
    }
    return null;
  } catch (e) {
    console.error("DB Read Error", e);
    return null;
  }
});

ipcMain.handle('read-uid-seed', async () => {
  try {
    const candidates = [
      path.join(app.getPath('userData'), 'uid-seed.json'),
      path.join(app.getAppPath(), 'uid-seed.json'),
    ];
    for (const candidate of candidates) {
      try {
        await fsPromises.access(candidate);
      } catch {
        continue;
      }
      try {
        const raw = await fsPromises.readFile(candidate, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {
        console.warn('[UIDSeed] Invalid seed file at', candidate, e?.message || e);
      }
    }
    return null;
  } catch (e) {
    console.warn('[UIDSeed] Failed to load seed mappings', e?.message || e);
    return null;
  }
});

async function commitDbWrite(data) {
  try {
    // 1) Persist WAL first so a crash before DB write can still recover.
    await writeWalDurable(data);

    // 2) Safety: keep previous DB version for manual recovery.
    try {
      await fsPromises.access(DB_PATH);
      await fsPromises.copyFile(DB_PATH, DB_PREV_PATH);
    } catch { /* No existing DB to back up - first write */ }

    // 3) Durable atomic DB commit.
    const payload = JSON.stringify(data, null, 2);
    await writeFileDurableAtomic(DB_PATH, payload);

    // 4) WAL no longer needed after successful DB commit.
    await clearWalBestEffort();

    // 5) Throttled rolling backups (protect against userData corruption / accidental edits).
    const now = Date.now();
    if (now - lastAutoBackupAtMs > 5 * 60 * 1000) { // 5 minutes
      lastAutoBackupAtMs = now;
      void dbHelpers.createDbBackup(DB_PATH, DB_BACKUP_DIR, 'rolling');
    }
    return true;
  } catch (e) {
    console.error("DB Write Error", e);
    for (const tempPath of [DB_TEMP_PATH, `${DB_WAL_PATH}.tmp`]) {
      try {
        await fsPromises.unlink(tempPath);
      } catch {
        // Best-effort cleanup only.
      }
    }
    // Intentionally keep WAL for next startup replay.
    return false;
  }
}

ipcMain.handle('db-write', async (_event, data) => {
  const queuedWrite = dbWriteQueue.then(() => commitDbWrite(data));
  dbWriteQueue = queuedWrite.catch(() => true);
  return queuedWrite;
});

// Window Control Handlers
ipcMain.on('window-minimize', () => {
  if (win) win.minimize();
});

ipcMain.on('window-maximize', () => {
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (win) win.close();
});

ipcMain.handle('db-backup', () => {
  return dbHelpers.createDbBackup(DB_PATH, DB_BACKUP_DIR, 'manual', {
    includeArtifacts: true,
    userDataDir: app.getPath('userData'),
  });
});

// Log Monitoring Logic
let LOG_PATH = '';
let logMonitorInterval = null;
let lastLogContent = null;
let logMonitorProfile = 'balanced';
let logMonitorLastDecodeAt = 0;
let logMonitorLastSnapshotWriteAt = 0;
let logMonitorFingerprint = '';

function resolveLogMonitorProfile(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (raw === 'adaptive-low' || raw === 'adaptive_low' || raw === 'adaptivelow') return 'adaptive-low';
  if (raw === 'low-power' || raw === 'low_power' || raw === 'lowpower') return 'low-power';
  if (raw === 'high-accuracy' || raw === 'high_accuracy' || raw === 'highaccuracy') return 'high-accuracy';
  return 'balanced';
}

function getLogMonitorConfig(profile) {
  if (profile === 'adaptive-low') {
    return {
      pollMs: 180000,
      minDecodeIntervalMs: 180000,
      snapshotWriteIntervalMs: 180000,
    };
  }
  if (profile === 'low-power') {
    return {
      pollMs: 5000,
      minDecodeIntervalMs: 5000,
      snapshotWriteIntervalMs: 30000,
    };
  }
  if (profile === 'high-accuracy') {
    return {
      pollMs: 1000,
      minDecodeIntervalMs: 750,
      snapshotWriteIntervalMs: 3000,
    };
  }
  return {
    pollMs: 2000,
    minDecodeIntervalMs: 1500,
    snapshotWriteIntervalMs: 10000,
  };
}

// Optimization: Use Buffer for fast byte shifting + Async Chunking if needed
async function decodeLog() {
  try {
    if (!LOG_PATH) return { error: "Path not found" };

    try {
      await fsPromises.access(LOG_PATH);
    } catch {
      return { error: "Path not found" };
    }

    const stats = await fsPromises.stat(LOG_PATH);
    const MAX_READ_SIZE = 5 * 1024 * 1024; // Increased to 5MB
    if (stats.size > MAX_READ_SIZE) {
      return { error: "File too large to monitor safely" };
    }

    const buffer = await fsPromises.readFile(LOG_PATH);
    if (buffer.length === 0) return { error: "File empty" };

    // 1. Try direct JSON parse first
    try {
      const rawStr = buffer.toString('utf8');
      if (rawStr.trim().startsWith('[') || rawStr.trim().startsWith('{')) {
        return JSON.parse(rawStr);
      }
    } catch (e) { }

    // 2. Optimized Decoding (Buffer Manipulation)
    // Shift all bytes by +1
    const layer1Buf = Buffer.allocUnsafe(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      layer1Buf[i] = buffer[i] + 1;
    }

    let layer1Obj = null;
    try {
      layer1Obj = JSON.parse(layer1Buf.toString('utf8'));
    } catch (e) { }

    if (layer1Obj) {
      const abArray = layer1Obj.ArrayByte || layer1Obj.arrayByte;
      if (abArray && Array.isArray(abArray)) {
        // Double Decode Layer 2
        // abArray is bytes, we need to shift them +1 too?
        // Original code: layer2 += String.fromCharCode(b + 1);
        const layer2Buf = Buffer.allocUnsafe(abArray.length);
        for (let i = 0; i < abArray.length; i++) {
          layer2Buf[i] = abArray[i] + 1;
        }

        try {
          return JSON.parse(layer2Buf.toString('utf8'));
        } catch (e) {
          return { error: "Layer 2 JSON Parse Failed", rawHead: layer2Buf.toString('utf8', 0, 500) };
        }
      }
      return layer1Obj; // It was just 1 layer of encoding
    }

    return {
      error: "Format mismatch (Unknown Encoding)",
      rawHead: layer1Buf.toString('utf8', 0, 200)
    };
  } catch (e) {
    return { error: e.message };
  }
}

ipcMain.on('start-log-monitoring', (_event, options = {}) => {
  const requestedProfile = resolveLogMonitorProfile(options && typeof options === 'object' ? options.performanceProfile : null);
  const monitorCfg = getLogMonitorConfig(requestedProfile);

  const localAppData = path.join(app.getPath('home'), 'AppData', 'Local');
  const pathNebula = path.join(localAppData, 'Nebula', 'Saved', 'Logs', 'AccelByteTelemetryCache');
  const pathWildgate = path.join(localAppData, 'Wildgate', 'Saved', 'Logs', 'AccelByteTelemetryCache');

  let nextLogPath = pathNebula;
  // Logic: Prefer Wildgate (Local) if exists, else Nebula (Game)
  if (fs.existsSync(pathWildgate)) {
    nextLogPath = pathWildgate;
  } else if (fs.existsSync(pathNebula)) {
    nextLogPath = pathNebula;
  }

  const nextFingerprint = `${nextLogPath}|${requestedProfile}|${monitorCfg.pollMs}|${monitorCfg.minDecodeIntervalMs}|${monitorCfg.snapshotWriteIntervalMs}`;
  if (logMonitorInterval && logMonitorFingerprint === nextFingerprint) {
    if (win) {
      win.webContents.send('log-status', {
        exists: fs.existsSync(nextLogPath),
        path: nextLogPath,
        profile: requestedProfile,
        lastCheck: Date.now(),
      });
    }
    return;
  }

  if (logMonitorInterval) clearInterval(logMonitorInterval);
  LOG_PATH = nextLogPath;
  logMonitorProfile = requestedProfile;
  logMonitorFingerprint = nextFingerprint;
  logMonitorLastDecodeAt = 0;
  logMonitorLastSnapshotWriteAt = 0;

  console.log(`Starting log monitoring... ${LOG_PATH} (profile=${logMonitorProfile}, poll=${monitorCfg.pollMs}ms)`);

  // Initial status
  if (win) {
    win.webContents.send('log-status', {
      exists: fs.existsSync(LOG_PATH),
      path: LOG_PATH,
      profile: logMonitorProfile,
      lastCheck: Date.now()
    });
  }

  let lastMtime = 0;

  logMonitorInterval = setInterval(async () => {
    if (telemetryLogTickInProgress) return;
    telemetryLogTickInProgress = true;
    try {
      let stats = null;
      try {
        if (LOG_PATH) stats = await fsPromises.stat(LOG_PATH);
      } catch { }

      const exists = !!stats;

      // Only read if modified
      if (stats && stats.mtimeMs !== lastMtime) {
        const now = Date.now();
        if ((now - logMonitorLastDecodeAt) < monitorCfg.minDecodeIntervalMs) {
          return;
        }
        logMonitorLastDecodeAt = now;
        lastMtime = stats.mtimeMs;

        const data = await decodeLog();
        const hasError = data && data.error;

        if (win) {
          win.webContents.send('log-status', {
            exists,
            path: LOG_PATH,
            size: stats.size,
            profile: logMonitorProfile,
            lastCheck: Date.now(),
            dataFound: !!(data && !hasError),
            error: hasError ? data.error : null,
            rawHead: data?.rawHead || null
          });

          if (data && !hasError) {
            const usableTelemetryEvents = extractUsableTelemetryEvents(data);
            // Also Send Data
            win.webContents.send('log-data', data);
            const hasUsableTelemetry = usableTelemetryEvents.length > 0;
            if (hasUsableTelemetry) {
              telemetryArchiveHelpers.archiveTelemetry(telemetryArchiveHelpers.getArchiveDir(app), data);
            }

            let historyResult = { addedCount: 0, skippedCount: 0 };
            if (hasUsableTelemetry) {
              try {
                historyResult = await appendTelemetryHistoryEvents(usableTelemetryEvents);
                if (historyResult.addedCount > 0) {
                  console.log(`[Persistence] Appended ${historyResult.addedCount} usable telemetry event(s).`);
                }
                await maybeCompactTelemetryHistory();
                if (historyResult.addedCount > 0) {
                  await emitTelemetryPruneNeededIfNecessary(false);
                }
              } catch (err) {
                console.error("[Persistence] Failed to append telemetry history:", err);
              }
            }

            // Save a compact usable-telemetry snapshot (not full decoded payload),
            // but throttle writes to avoid unnecessary disk churn.
            const snapshotDue = (Date.now() - logMonitorLastSnapshotWriteAt) >= monitorCfg.snapshotWriteIntervalMs;
            if (hasUsableTelemetry && snapshotDue) {
              try {
                const decodedSavePath = path.join(app.getPath('userData'), 'telemetry_latest_decoded.json');
                await fsPromises.writeFile(decodedSavePath, JSON.stringify({
                  generatedAt: Date.now(),
                  telemetry: usableTelemetryEvents,
                }));
                logMonitorLastSnapshotWriteAt = Date.now();
              } catch (e) { console.error("Failed to save decoded logs", e); }
            } else if (historyResult.addedCount === 0) {
              // No-op: nothing new to persist this tick.
            }
          }

        }
      } else if (!exists && win) {
        // Notify if lost file
        win.webContents.send('log-status', { exists: false, path: LOG_PATH, profile: logMonitorProfile, lastCheck: Date.now() });
      }
    } catch (tickErr) {
      console.error('[LogMonitor] Tick error:', tickErr);
    } finally {
      telemetryLogTickInProgress = false;
    }
  }, monitorCfg.pollMs);
});

ipcMain.handle('load-archived-telemetry', async () => {
  return telemetryArchiveHelpers.loadArchivedTelemetry(telemetryArchiveHelpers.getArchiveDir(app));
});

ipcMain.on('stop-log-monitoring', () => {
  if (logMonitorInterval) {
    clearInterval(logMonitorInterval);
    logMonitorInterval = null;
  }
  logMonitorFingerprint = '';
  console.log("Stopped log monitoring.");
});

ipcMain.handle('scan-epic-ids', async () => {
  if (!LOG_PATH) {
    const localAppData = path.join(app.getPath('home'), 'AppData', 'Local');
    const pathNebula = path.join(localAppData, 'Nebula', 'Saved', 'Logs', 'AccelByteTelemetryCache');
    const pathWildgate = path.join(localAppData, 'Wildgate', 'Saved', 'Logs', 'AccelByteTelemetryCache');
    LOG_PATH = fs.existsSync(pathWildgate) ? pathWildgate : pathNebula;
  }

  const ids = new Set();
  const mappings = {}; // accountId -> platformAccountId
  const names = {}; // ID -> Name harvested from logs
  let error = null;

  const data = await decodeLog();
  if (data && data.error) error = data.error;

  const findIds = (obj) => {
    if (!obj) return;
    if (typeof obj === 'string') {
      const idRegex = /"(?:accountId|platformAccountId|userId|id|platform_account_id)":"([a-f0-9-]{32,36})"/gi;
      let m;
      while ((m = idRegex.exec(obj)) !== null) ids.add(m[1].toLowerCase().replace(/-/g, ''));
    } else if (Array.isArray(obj)) {
      obj.forEach(findIds);
    } else if (typeof obj === 'object') {
      const ctx = obj.context?.client || obj.Payload?.context?.client || obj.client || obj;
      if (ctx && ctx.accountId && ctx.platformAccountId && ctx.accountId !== ctx.platformAccountId) {
        mappings[ctx.accountId.toLowerCase()] = ctx.platformAccountId.toLowerCase();
      }

      const possibleId = obj.accountId || obj.userId || obj.platformAccountId || obj.id || obj.u;
      const possibleName = obj.displayName || obj.userName || obj.nickName || obj.player_name || obj.playerName || obj.n || obj.nick;

      if (possibleId && typeof possibleId === 'string' && possibleName && typeof possibleName === 'string') {
        const cleanId = possibleId.toLowerCase().split('|').pop().replace(/-/g, '');
        if (cleanId.length >= 32) names[cleanId] = possibleName;
      }

      Object.keys(obj).forEach(k => findIds(obj[k]));
    }
  };

  // 1. Global Scan on ALL log files in the directory
  try {
    const logDir = path.dirname(LOG_PATH);
    if (fs.existsSync(logDir)) {
      const logFiles = (await fsPromises.readdir(logDir)).filter(f => f.endsWith('.log') || f.includes('Cache'));
      const queue = [...logFiles];
      const workerCount = Math.min(LOG_SCAN_MAX_CONCURRENCY, queue.length);

      const scanSingleFile = async (file) => {
        try {
          const fullPath = path.join(logDir, file);
          const st = await fsPromises.stat(fullPath);
          if (!st.isFile() || st.size === 0 || st.size > LOG_SCAN_MAX_FILE_BYTES) {
            return;
          }
          const buffer = await fsPromises.readFile(fullPath);
          if (buffer.length === 0) return;

          const iStr = (file.includes('Telemetry') || file.includes('General'))
            ? decodeShiftedBufferToString(buffer, LOG_SCAN_MAX_DECODE_BYTES)
            : buffer.toString('utf8', 0, Math.min(buffer.length, LOG_SCAN_MAX_DECODE_BYTES));

          // Pattern: "id":"...", "name":"..."
          const nameMapRegex = /"(?:accountId|userId|id|u)":"([a-f0-9-|]{32,70})".*?"(?:displayName|userName|playerName|n|nick)":"(.*?)"/gi;
          let m;
          while ((m = nameMapRegex.exec(iStr)) !== null) {
            const rawId = m[1].toLowerCase();
            const idParts = rawId.split('|').map(p => p.replace(/-/g, ''));
            const name = m[2];

            idParts.forEach(id => {
              if (id.length >= 32) {
                ids.add(id);
                if (name && name.length > 2) names[id] = name;
              }
            });
            // Also store the full piped ID if it matches
            if (rawId.includes('|')) ids.add(rawId);
          }

          // Flat pattern (UE4 log style)
          const flatRegex = /([a-f0-9]{32,36})[ \t:="]+([^ \n\r\t,"]{3,20})/gi;
          while ((m = flatRegex.exec(iStr)) !== null) {
            const id = m[1].toLowerCase().replace(/-/g, '');
            const name = m[2];
            if (id.length >= 32 && !names[id] && !id.startsWith('0000')) {
              names[id] = name;
            }
          }

          const idRegex = /"(?:accountId|platformAccountId|puid|platform_account_id)":"([a-f0-9-|]{32,70})"/gi;
          while ((m = idRegex.exec(iStr)) !== null) {
            const rawId = m[1].toLowerCase();
            rawId.split('|').forEach(p => ids.add(p.replace(/-/g, '')));
            if (rawId.includes('|')) ids.add(rawId);
          }
        } catch {
          // Skip unreadable file and continue scanning.
        }
      };

      await Promise.all(Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          await scanSingleFile(next);
        }
      }));
    }
  } catch (e) { console.error("Global Log Scan Error", e); }

  if (data && !error) findIds(data);

  try {
    const archivedEvents = await telemetryArchiveHelpers.loadArchivedTelemetry(telemetryArchiveHelpers.getArchiveDir(app));
    archivedEvents.forEach(e => {
      const clientCtx = e.context?.client || e.Payload?.context?.client;
      if (clientCtx?.accountId && clientCtx?.platformAccountId && clientCtx.accountId !== clientCtx.platformAccountId) {
        mappings[clientCtx.accountId.toLowerCase()] = clientCtx.platformAccountId.toLowerCase();
      }
      if (clientCtx?.platformAccountId) ids.add(clientCtx.platformAccountId.toLowerCase().replace(/-/g, ''));
      if (clientCtx?.accountId) ids.add(clientCtx.accountId.toLowerCase().replace(/-/g, ''));
      findIds(e);
    });
  } catch (e) { console.error("Archive Scan Error", e); }

  // 3. Crash Log Scavenging (High Reliability for User Name)
  try {
    const nebulaPath = path.join(app.getPath('home'), 'AppData', 'Local', 'Nebula');
    const crashesDir = path.join(nebulaPath, 'Saved', 'Crashes');
    if (fs.existsSync(crashesDir)) {
      const crashFolders = await fsPromises.readdir(crashesDir);

      await Promise.all(crashFolders.map(async (folder) => {
        const xmlPath = path.join(crashesDir, folder, 'CrashContext.runtime-xml');
        try {
          // Access check then read
          await fsPromises.access(xmlPath);
          const xmlContent = await fsPromises.readFile(xmlPath, 'utf8');

          // Patterns for name and ID extraction
          const userRegex = /-epicusername=(.*?)[ \t\r\n"-]/i;
          const idRegex = /<EpicAccountId>(.*?)<\/EpicAccountId>/i;
          const idAltRegex = /-epicuserid=([a-f0-9]{32,36})/i;

          const userMatch = userRegex.exec(xmlContent);
          const idMatch = idRegex.exec(xmlContent) || idAltRegex.exec(xmlContent);

          if (idMatch && idMatch[1]) {
            const cleanId = idMatch[1].toLowerCase().replace(/-/g, '');
            ids.add(cleanId);
            if (userMatch && userMatch[1] && userMatch[1].length > 2) {
              names[cleanId] = userMatch[1];
              console.log(`[IDScan] Harvested Name from Crash Log: ${userMatch[1]} (${cleanId})`);
            }
          }
        } catch { }
      }));
    }
  } catch (e) { console.error("Crash Scavenge Error", e); }

  // Debug Logging & Report... (Kept same)
  console.log(`\n========== [IDScan] COMPREHENSIVE REPORT ==========`);
  console.log(`Total IDs Found: ${ids.size}`);
  console.log(`Total Names Harvested: ${Object.keys(names).length}`);
  console.log(`Total AB->Epic Mappings: ${Object.keys(mappings).length}`);
  // ... (Abbreviated debug logs if needed, but keeping full for now is safe)

  // Debug Snippet - Async read
  const urls = new Set();
  let rawSnip = '';
  try {
    const dbgBuffer = await fsPromises.readFile(LOG_PATH);
    rawSnip = decodeShiftedBufferToString(dbgBuffer, 500000);
    const urlRegex = /https?:\/\/[^\s"']+/g;
    let u;
    while ((u = urlRegex.exec(rawSnip)) !== null) urls.add(u[0]);
  } catch (e) { }

  let fileSize = 0;
  try {
    const st = await fsPromises.stat(LOG_PATH);
    fileSize = st.size;
  } catch { }

  return {
    success: true,
    ids: Array.from(ids),
    mappings,
    names,
    urls: Array.from(urls),
    debugSnippet: rawSnip.slice(0, 5000),
    path: LOG_PATH,
    error: error,
    fileSize: fileSize
  };
});



function createWindow() {
  const iconPath = resolveAppIconPath();
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: DEFAULT_MIN_WINDOW_BOUNDS.width,
    minHeight: DEFAULT_MIN_WINDOW_BOUNDS.height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: iconPath,
    autoHideMenuBar: true,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    show: false, // Prevent white flash by waiting for content
  });

  devMark('window created');

  let windowShown = false;
  const showWindowOnce = () => {
    if (!win || win.isDestroyed() || windowShown) return;
    windowShown = true;
    win.show();
  };

  win.once('ready-to-show', () => {
    showWindowOnce();
    // if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  // Packaged builds can occasionally stall before ready-to-show; avoid a dead zone.
  if (!isDev) {
    win.webContents.once('did-finish-load', showWindowOnce);
    setTimeout(showWindowOnce, 1500);
  }

  win.on('show', () => win.webContents.send('window-visibility-change', true));
  win.on('hide', () => win.webContents.send('window-visibility-change', false));
  win.on('restore', () => win.webContents.send('window-restored'));
  win.on('maximize', () => win.webContents.send('window-restored'));

  if (isDev) startDevRendererWithRetry(win, DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    const urlCheck = validateHttpsUrlAllowlist(url, EXTERNAL_ALLOWED_HOSTS);
    if (!urlCheck.success) {
      recordSecurityBlock('window-open', urlCheck.code || IpcErrorCode.URL_NOT_ALLOWED, `${urlCheck.message || 'URL not allowed'}: ${url}`);
      return { action: 'deny' };
    }
    shell.openExternal(urlCheck.data.toString());
    return { action: 'deny' };
  });
  const webContentsId = win.webContents.id;
  win.webContents.once('destroyed', () => {
    telemetryArchiveTokenRegistry.removeScope(getTelemetryArchiveScope(webContentsId));
  });
  win.on('closed', clearWindowVisibilityAnimation);

  ipcMain.on('open-devtools', () => {
    if (!win || !ALLOW_RUNTIME_DEVTOOLS) return;
    win.webContents.openDevTools();
  });
  ipcMain.on('minimize-window', () => { if (win) win.minimize(); });
  ipcMain.on('skip-taskbar', (event, skip) => { if (win) win.setSkipTaskbar(skip); });
  ipcMain.on('restore-window', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  ipcMain.on('set-always-on-top', (event, always) => { if (win) win.setAlwaysOnTop(always, 'screen-saver'); });

  ipcMain.on('toggle-overlay', (event, payload) => {
    if (!win) return;
    const isPayloadObj = payload && typeof payload === 'object' && !Array.isArray(payload);
    const isOverlay = isPayloadObj ? Boolean(payload.enabled) : Boolean(payload);
    const requestedStyle = isPayloadObj && payload.style === 'transparent' ? 'transparent' : 'compact';
    currentOverlayStyle = requestedStyle;
    if (isOverlay) {
      previousBounds = win.getBounds();
      if (win.isMaximized()) win.unmaximize();
      win.setResizable(true);
      const display = screen.getDisplayMatching(previousBounds);
      const workArea = display?.workArea || screen.getPrimaryDisplay().workArea;
      const overlayBounds = getOverlayBoundsForStyle(currentOverlayStyle, workArea);
      win.setMinimumSize(overlayBounds.minWidth, overlayBounds.minHeight);
      setTimeout(() => {
        // Default overlay size ~15–20% of viewport (spec 20.6)
        if (!win || win.isDestroyed()) return;
        const hasSavedOverlayBounds = lastOverlayBounds
          && lastOverlayBounds.width >= overlayBounds.minWidth
          && lastOverlayBounds.height >= overlayBounds.minHeight;

        if (hasSavedOverlayBounds) {
          win.setBounds({
            x: clamp(lastOverlayBounds.x, workArea.x, workArea.x + Math.max(0, workArea.width - overlayBounds.minWidth)),
            y: clamp(lastOverlayBounds.y, workArea.y, workArea.y + Math.max(0, workArea.height - overlayBounds.minHeight)),
            width: lastOverlayBounds.width,
            height: lastOverlayBounds.height,
          });
        } else {
          win.setSize(overlayBounds.width, overlayBounds.height);
          win.center();
        }
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setIgnoreMouseEvents(false);
      }, 50);
    } else {
      lastOverlayBounds = win.getBounds();
      win.setResizable(true);
      win.setSkipTaskbar(false);
      if (previousBounds && previousBounds.width > 0 && previousBounds.height > 0) {
        win.setBounds(previousBounds);
      } else {
        win.setSize(1440, 900);
        win.center();
      }
      // Reset click-through when exiting overlay
      win.setIgnoreMouseEvents(false);
      win.setMinimumSize(DEFAULT_MIN_WINDOW_BOUNDS.width, DEFAULT_MIN_WINDOW_BOUNDS.height);
    }
  });

  // Dynamic mouse event handling for partially transparent overlay
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (win) {
      const winOptions = options || { forward: true };
      win.setIgnoreMouseEvents(ignore, winOptions);
    }
  });

  // Overlay style handler - controls initial state
  ipcMain.on('set-overlay-style', (event, style) => {
    currentOverlayStyle = style === 'transparent' ? 'transparent' : 'compact';
    if (!win) return;
    // Keep transparent overlays interactive by default.
    win.setIgnoreMouseEvents(false);
  });

  // Overlay style handler - controls initial state
  ipcMain.on('set-overlay-mode', (event, enabled) => {
    if (win) {
      if (enabled) {
        // OVERLAY MODE
        win.setAlwaysOnTop(true, 'screen-saver'); // High priority
        win.setVisibleOnAllWorkspaces(true);
        win.setFullScreenable(false);

        // Ensure it can receive focus for clicks
        win.setFocusable(true);
        // Do not skip taskbar so user can find it if lost, or skip if preferred. 
        // Usually skipping taskbar is cleaner for overlays:
        win.setSkipTaskbar(true);

        // We don't set ignore mouse events here immediately; 
        // The frontend component (OverlayView) manages that fine-grained
      } else {
        // STANDARD MODE
        win.setAlwaysOnTop(false);
        win.setVisibleOnAllWorkspaces(false);
        win.setFullScreenable(true);
        win.setFocusable(true);
        win.setSkipTaskbar(false);

        // Reset mouse ignoring just in case
        win.setIgnoreMouseEvents(false);
      }
    }
  });

  ipcMain.on('resize-window', (event, { width, height }) => { if (win && !win.isMaximized()) win.setSize(Math.round(width), Math.round(height)); });
  ipcMain.on('set-window-bounds', (event, bounds) => { if (win && !win.isMaximized()) win.setBounds(bounds); });
  ipcMain.on('maximize-window', () => { if (win) { if (win.isMaximized()) win.unmaximize(); else win.maximize(); } });
  ipcMain.on('close-window', () => { if (win) win.close(); });

  ipcMain.on('check-for-updates', () => { if (!isDev) autoUpdater.checkForUpdates(); else if (win) win.webContents.send('update_not_available'); });
}


app.whenReady().then(async () => {
  devMark('app whenReady');
  try {
    await replayWalIfPresent();
  } catch (e) {
    console.warn('[DB] WAL preflight replay failed:', e?.message || e);
  }
  createWindow();
  createTray();

  // Keep expensive artifact migration off the critical paint path.
  setTimeout(() => {
    try {
      const migration = runArtifactCanonicalMigration({
        dbPath: DB_PATH,
        userData: app.getPath('userData'),
      });
      if (migration?.changed) {
        console.log(
          `[Artifacts] Canonical migration applied (assigned=${migration.assignedCanonicalNumbers}, renamedDirs=${migration.renamedDirs}, mergedDirs=${migration.mergedDirs}, duplicatesDeleted=${migration.duplicateFilesDeleted}, orphanReattached=${migration.orphanReattachedFiles}, orphanQuarantined=${migration.orphanQuarantinedFiles}, elapsedMs=${migration.elapsedMs})`
        );
      } else if (migration?.reason && migration.reason !== 'already-migrated') {
        console.log(`[Artifacts] Canonical migration skipped (${migration.reason})`);
      }
    } catch (e) {
      console.warn('[Artifacts] Canonical migration failed:', e?.message || e);
    }
  }, 0);

  // Do not block renderer startup on telemetry history migration.
  void ensureTelemetryHistoryMigrated().catch((e) => {
    console.warn('[TelemetryRetention] Migration check failed:', e?.message || e);
  });

  if (!telemetryRetentionTimer) {
    telemetryRetentionTimer = setInterval(() => {
      emitTelemetryPruneNeededIfNecessary(false).catch((e) => {
        console.warn('[TelemetryRetention] periodic check failed:', e?.message || e);
      });
    }, 10 * 60 * 1000);
  }
  emitTelemetryPruneNeededIfNecessary(true).catch((e) => {
    console.warn('[TelemetryRetention] startup check failed:', e?.message || e);
  });
  if (isDev) setSplashProgress(win, 20, 'Preparing services...', 'Starting startup tasks');
  // Archive cleanup can be expensive with many files; run off the critical path.
  setTimeout(() => {
    telemetryArchiveHelpers.cleanupOldArchives(telemetryArchiveHelpers.getArchiveDir(app));
  }, 0);
  if (isDev) setSplashProgress(win, 35, 'Preparing OCR...', 'Registering OCR handlers');
  registerOCRHandlers(win);  // Register new OCR IPC handlers (pass win for hide-during-capture)
  if (!isDev) autoUpdater.checkForUpdates();


  if (isDev) setSplashProgress(win, 90, 'Registering hotkeys...', 'Almost there');
  globalShortcut.register('F9', () => {
    if (win) {
      toggleWindowVisibilitySmooth({ focusOnShow: true });
      // Note: We NO LONGER send 'hotkey-toggle-overlay'. 
      // State (Overlay vs Dashboard) is preserved.
    }
  });
});

// Telemetry Decoding - PORTED FROM decode_script.cjs
ipcMain.handle('decode-telemetry-cache', async () => {
  try {
    const localAppData = process.env.LOCALAPPDATA;
    const logsDir = path.join(localAppData, 'Nebula', 'Saved', 'Logs');

    if (!fs.existsSync(logsDir)) {
      return { success: false, message: 'Logs directory not found' };
    }

    const files = await fsPromises.readdir(logsDir);
    let decodedCount = 0;

    for (const file of files) {
      if (!file.includes('AccelByteTelemetryCache')) continue;
      if (file.startsWith('decoded_') || file.endsWith('.json')) continue;

      const srcPath = path.join(logsDir, file);

      try {
        if (!(await fsPromises.stat(srcPath)).isFile()) continue;
        const buffer = await fsPromises.readFile(srcPath);
        if (buffer.length === 0) continue;

        // Layer 1 (+1 shift)
        const layer1Buf = Buffer.allocUnsafe(buffer.length);
        for (let i = 0; i < buffer.length; i++) layer1Buf[i] = buffer[i] + 1;

        let layer1Obj;
        try {
          layer1Obj = JSON.parse(layer1Buf.toString('utf8'));
        } catch (e) { continue; }

        let finalJson = layer1Obj;
        const abArray = layer1Obj.ArrayByte || layer1Obj.arrayByte;
        if (abArray && Array.isArray(abArray)) {
          const layer2Buf = Buffer.allocUnsafe(abArray.length);
          for (let i = 0; i < abArray.length; i++) layer2Buf[i] = abArray[i] + 1;
          try {
            finalJson = JSON.parse(layer2Buf.toString('utf8'));
          } catch (e) { }
        }

        const outPath = path.join(logsDir, `decoded_${file}.json`);
        await fsPromises.writeFile(outPath, JSON.stringify(finalJson, null, 2));
        decodedCount++;
      } catch (e) {
        console.error(`Failed to decode ${file}:`, e);
      }
    }

    return { success: true, message: `Successfully decoded ${decodedCount} file(s).` };
  } catch (e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('list-telemetry-archives', async (event) => {
  try {
    const archiveDir = telemetryArchiveHelpers.getArchiveDir(app);
    const files = await telemetryArchiveHelpers.listArchiveFiles(archiveDir);
    const scope = getTelemetryArchiveScope(event.sender.id);
    const archives = files.map((entry) => {
      const archiveId = telemetryArchiveTokenRegistry.issue(scope, { filename: entry.filename });
      return {
        archiveId,
        filename: entry.filename,
        date: entry.date,
        size: entry.size,
      };
    });
    return ok({ archives });
  } catch (e) {
    console.error('Failed to list telemetry archives:', e);
    return internal('Failed to list telemetry archives');
  }
});

ipcMain.handle('load-telemetry-archive-file', async (event, payload = {}) => {
  try {
    const archiveId = payload && typeof payload === 'object' ? payload.archiveId : '';
    if (typeof archiveId !== 'string' || !archiveId.trim()) {
      return fail(IpcErrorCode.INVALID_INPUT, 'archiveId required');
    }

    const scope = getTelemetryArchiveScope(event.sender.id);
    const resolved = telemetryArchiveTokenRegistry.resolve(scope, archiveId);
    if (!resolved || typeof resolved.filename !== 'string') {
      recordSecurityBlock('load-telemetry-archive-file', IpcErrorCode.INVALID_INPUT, 'Invalid or expired archiveId');
      return fail(IpcErrorCode.INVALID_INPUT, 'Invalid or expired archiveId');
    }

    const filenameCheck = validateBasenameToken(resolved.filename, 'filename');
    if (!filenameCheck.success) return filenameCheck;

    const archiveDir = telemetryArchiveHelpers.getArchiveDir(app);
    const fullPath = path.join(archiveDir, filenameCheck.data);
    const pathCheck = validatePathInRoots(fullPath, [archiveDir], { isDev });
    if (!pathCheck.success) {
      recordSecurityBlock('load-telemetry-archive-file', pathCheck.code, pathCheck.message);
      return pathCheck;
    }
    if (!fs.existsSync(fullPath)) {
      return fail(IpcErrorCode.NOT_FOUND, 'File not found');
    }
    const content = await fsPromises.readFile(fullPath, 'utf-8');
    return ok(JSON.parse(content));
  } catch (e) {
    console.error('Failed to load telemetry archive file:', e);
    return internal('Failed to load telemetry archive file');
  }
});

ipcMain.handle('clear-telemetry-archives', async () => {
  try {
    const archiveDir = telemetryArchiveHelpers.getArchiveDir(app);
    const result = await telemetryArchiveHelpers.clearArchiveFiles(archiveDir);
    return result;
  } catch (e) {
    console.error('Failed to clear telemetry archives:', e);
    return { success: false, message: e.message };
  }
});

ipcMain.handle('telemetry-retention-status', async () => {
  try {
    const status = await getTelemetryRetentionStatusInternal();
    return ok(status);
  } catch (e) {
    return internal('Failed to read retention status');
  }
});

ipcMain.handle('telemetry-prune-preview', async () => {
  try {
    const status = await getTelemetryRetentionStatusInternal();
    return ok({
      removeEntries: status.prunePreview.wouldRemoveEntries,
      freeBytes: status.prunePreview.wouldFreeBytes,
      remainingBytes: status.prunePreview.remainingBytes,
      exceedsLimits: status.exceedsLimits,
      status,
    });
  } catch (e) {
    return internal('Failed to build prune preview');
  }
});

ipcMain.handle('telemetry-prune-apply', async () => {
  try {
    const entries = await readTelemetryHistoryEntries();
    const plan = buildTelemetryPrunePlan(entries);
    if (plan.removeCount > 0) {
      const payload = plan.keepEntries.map(e => e.line).join('\n');
      await fsPromises.writeFile(TELEMETRY_HISTORY_NDJSON_PATH, payload ? `${payload}\n` : '', 'utf8');
      telemetryPruneLastNotifiedAt = Date.now();
      console.log(`[TelemetryRetention] prune-apply removedEntries=${plan.removeCount} freedBytes=${plan.removedBytes}`);
    } else {
      console.log('[TelemetryRetention] prune-apply no-op (already within limits)');
    }
    const status = await getTelemetryRetentionStatusInternal();
    telemetryRetentionLastExceeds = status.exceedsLimits;
    return ok({
      removedEntries: plan.removeCount,
      freedBytes: plan.removedBytes,
      remainingBytes: status.sizeBytes,
      status,
    });
  } catch (e) {
    return internal('Failed to apply telemetry prune');
  }
});

// Utility IPC handlers for contextIsolation (replaces direct fs/shell access in renderer)
ipcMain.handle('pick-roi-image', async (event) => {
  try {
    const { dialog } = require('electron');
    const artifactPaths = artifactHelpers.getArtifactPaths(app);
    const defaultPath = artifactPaths.matchArtifactsRoot;
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const dialogParent = senderWindow && !senderWindow.isDestroyed()
      ? senderWindow
      : (win && !win.isDestroyed() ? win : undefined);
    try {
      await fsPromises.mkdir(defaultPath, { recursive: true });
    } catch {
      // Fall through if directory creation fails; dialog can still open.
    }

    const picked = await dialog.showOpenDialog(dialogParent || undefined, {
      title: 'Load ROI Screenshot',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif'] }],
      defaultPath,
      properties: ['openFile'],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return ok({ canceled: true });
    }

    const selectedPath = picked.filePaths[0];
    const extCheck = validateAllowedExtension(selectedPath, ROI_PICKER_EXTENSIONS, 'roi image');
    if (!extCheck.success) {
      recordSecurityBlock('pick-roi-image', extCheck.code, extCheck.message);
      return extCheck;
    }

    const ext = path.extname(selectedPath).toLowerCase();
    const mime = ROI_MIME_BY_EXT[ext] || 'application/octet-stream';
    const imageBuffer = await fsPromises.readFile(selectedPath);
    return ok({
      canceled: false,
      filename: path.basename(selectedPath),
      sourcePath: selectedPath,
      mime,
      byteLength: imageBuffer.length,
      fileBytes: imageBuffer,
    });
  } catch (e) {
    console.error('[ROI] pick-roi-image error:', e?.message || e);
    return internal('Failed to open ROI image');
  }
});

ipcMain.handle('read-file-base64', async (event, filePath) => {
  try {
    const candidates = buildRendererReadCandidates(filePath);
    for (const candidate of candidates) {
      const pathCheck = resolveAllowedRendererPath(candidate);
      if (!pathCheck.success) continue;
      const resolved = pathCheck.data?.resolved || path.resolve(candidate);
      const ext = path.extname(resolved).toLowerCase();
      if (!ALLOWED_FILE_EXTENSIONS.has(ext)) continue;
      try {
        const data = await fsPromises.readFile(resolved);
        return data.toString('base64');
      } catch {
        // try next candidate
      }
    }
    return null;
  } catch (e) {
    return null;
  }
});

ipcMain.handle('ocr-corpus-list-images', async () => {
  try {
    await ensureCorpusDefaults();
    const imagesDir = path.join(OCR_CORPUS_DIR, 'images');
    const files = [];
    try {
      const relFiles = await listFilesRecursive(imagesDir);
      for (const rel of relFiles) {
        const ext = path.extname(rel).toLowerCase();
        if (!ALLOWED_FILE_EXTENSIONS.has(ext)) continue;
        const normalizedRel = rel.replace(/\\/g, '/');
        files.push({
          name: path.basename(normalizedRel),
          relativePath: `images/${normalizedRel}`,
        });
      }
    } catch {
      // no images dir yet
    }
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return { success: true, files };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-read-image', async (event, relativePath) => {
  try {
    const safe = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const abs = path.join(OCR_CORPUS_DIR, safe);
    const resolvedAbs = path.resolve(abs);
    const resolvedDir = path.resolve(OCR_CORPUS_DIR);
    if (!resolvedAbs.startsWith(resolvedDir + path.sep) && resolvedAbs !== resolvedDir) return null;
    const ext = path.extname(abs).toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.has(ext)) return null;
    const data = await fsPromises.readFile(abs);
    return data.toString('base64');
  } catch (e) {
    return null;
  }
});

ipcMain.handle('ocr-corpus-load', async (event, name) => {
  try {
    await ensureCorpusDefaults();
    const target = getCorpusFilePath(name);
    if (!target) return { success: false, error: 'Unsupported corpus file' };
    try {
      const content = await fsPromises.readFile(target, 'utf8');
      return { success: true, content };
    } catch {
      return { success: true, content: '' };
    }
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-sync-to-repo', async () => {
  try {
    await ensureCorpusDefaults();
    const result = await syncCorpusToRepo('manual');
    return { success: true, ...result };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-save', async (event, name, content) => {
  try {
    await ensureCorpusDefaults();
    const target = getCorpusFilePath(name);
    if (!target) return { success: false, error: 'Unsupported corpus file' };
    const payload = String(content ?? '');
    JSON.parse(payload); // validate JSON before writing
    await fsPromises.mkdir(path.dirname(target), { recursive: true });
    await fsPromises.writeFile(target, payload, 'utf8');
    await syncCorpusToRepo(`save:${name}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-eval', async () => {
  try {
    await ensureCorpusDefaults();
    const evalScript = resolveBundledScript('ocr_corpus_eval.cjs');
    if (!fs.existsSync(evalScript)) {
      return { success: false, error: `Missing eval script at ${evalScript}` };
    }

    const outPath = path.join(OCR_CORPUS_REPORTS_DIR, 'latest.json');
    const result = await runNodeScript(evalScript, [
      '--truth', path.join(OCR_CORPUS_DIR, 'ground-truth.json'),
      '--pred', path.join(OCR_CORPUS_DIR, 'predictions.latest.json'),
      '--baseline', path.join(OCR_CORPUS_DIR, 'baseline.json'),
      '--out', outPath
    ]);

    if (result.code !== 0) {
      return { success: false, error: result.stderr || result.stdout || 'Eval failed' };
    }

    let report = null;
    try {
      report = JSON.parse(await fsPromises.readFile(outPath, 'utf8'));
    } catch { }
    await syncCorpusToRepo('eval');

    return {
      success: true,
      output: result.stdout,
      report
    };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-threshold-recommend', async () => {
  try {
    await ensureCorpusDefaults();
    const recommendScript = resolveBundledScript('ocr_threshold_recommend.cjs');
    if (!fs.existsSync(recommendScript)) {
      return { success: false, error: `Missing threshold recommendation script at ${recommendScript}` };
    }

    const result = await runNodeScript(recommendScript, [
      '--report', path.join(OCR_CORPUS_REPORTS_DIR, 'latest.json'),
      '--baseline', path.join(OCR_CORPUS_DIR, 'baseline.json')
    ]);

    if (result.code !== 0) {
      return { success: false, error: result.stderr || result.stdout || 'Threshold recommendation failed' };
    }

    let recommendation = null;
    try {
      recommendation = JSON.parse(String(result.stdout || '{}'));
    } catch {
      return { success: false, error: 'Threshold recommendation output was not valid JSON' };
    }

    return {
      success: true,
      recommendation,
      output: result.stdout
    };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-promote-baseline', async () => {
  try {
    await ensureCorpusDefaults();
    const promoteScript = resolveBundledScript('ocr_promote_baseline.cjs');
    if (!fs.existsSync(promoteScript)) {
      return { success: false, error: `Missing baseline script at ${promoteScript}` };
    }

    const result = await runNodeScript(promoteScript, [
      '--report', path.join(OCR_CORPUS_REPORTS_DIR, 'latest.json'),
      '--baseline', path.join(OCR_CORPUS_DIR, 'baseline.json')
    ]);

    if (result.code !== 0) {
      return { success: false, error: result.stderr || result.stdout || 'Promote baseline failed' };
    }
    await syncCorpusToRepo('promote-baseline');
    return { success: true, output: result.stdout };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-import-images', async () => {
  try {
    await ensureCorpusDefaults();
    const { dialog } = require('electron');
    const corpusImagesDir = path.join(OCR_CORPUS_DIR, 'images');
    const picked = await dialog.showOpenDialog(win, {
      title: 'Import OCR Corpus Images',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
      defaultPath: corpusImagesDir,
      properties: ['openFile', 'multiSelections']
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { success: true, imported: 0, skipped: 0, canceled: true };
    }
    const { imported, skipped } = await importCorpusImageFiles(picked.filePaths);
    await syncCorpusToRepo('import-images');
    return { success: true, imported, skipped, canceled: false };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-import-images-from-paths', async (event, filePaths = []) => {
  try {
    await ensureCorpusDefaults();
    const paths = Array.isArray(filePaths) ? filePaths : [];
    if (paths.length === 0) {
      return { success: false, error: 'No image files were provided.' };
    }
    const { imported, skipped } = await importCorpusImageFiles(paths);
    await syncCorpusToRepo('import-images-drop');
    return { success: true, imported, skipped, canceled: false };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-add-corrected-sample', async (event, payload = {}) => {
  try {
    await ensureCorpusDefaults();

    const screenshotBase64 = normalizeScreenshotBase64(payload?.screenshotBase64);
    if (!screenshotBase64) {
      return { success: false, error: 'No screenshot data' };
    }

    const teammates = normalizeStringList(payload?.teammates);
    const opponentTeams = normalizeOpponentTeamsForCorpus(payload?.opponentTeams);
    const modifiers = normalizeStringList(payload?.modifiers);
    const totalOpponentPlayers = opponentTeams.reduce((sum, team) => sum + (team.players?.length || 0), 0);
    if ((teammates.length + totalOpponentPlayers + modifiers.length) === 0) {
      return { success: false, error: 'Insufficient correction data for corpus sample' };
    }

    let buffer;
    try {
      buffer = Buffer.from(screenshotBase64, 'base64');
    } catch {
      return { success: false, error: 'Invalid screenshot base64 payload' };
    }
    if (!buffer || buffer.length < 1024) {
      return { success: false, error: 'Screenshot payload too small' };
    }

    const imageHash = crypto.createHash('sha1').update(buffer).digest('hex');
    const signature = buildCorpusSampleSignature({ teammates, opponentTeams, modifiers });

    const truthPath = path.join(OCR_CORPUS_DIR, 'ground-truth.json');
    let truth;
    try {
      truth = JSON.parse(await fsPromises.readFile(truthPath, 'utf8'));
    } catch {
      truth = { version: 1, samples: [] };
    }
    const samples = Array.isArray(truth?.samples) ? truth.samples : [];

    const duplicate = samples.find((sample) => {
      const sampleHash = String(sample?.meta?.imageHash || '');
      const sampleSignature = String(sample?.meta?.signature || '');
      return sampleHash === imageHash && sampleSignature === signature;
    });
    if (duplicate) {
      return { success: true, sampleId: duplicate.sampleId, deduped: true };
    }

    const imagesDir = path.join(OCR_CORPUS_DIR, 'images');
    await fsPromises.mkdir(imagesDir, { recursive: true });

    const existingIds = new Set(samples.map((s) => String(s?.sampleId || '')).filter(Boolean));
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const baseId = `correction_${ts}_${imageHash.slice(0, 8)}`;
    let sampleId = baseId;
    let counter = 1;
    while (existingIds.has(sampleId)) {
      sampleId = `${baseId}_${counter}`;
      counter += 1;
    }

    const imageName = `${sampleId}.png`;
    const imagePath = path.join(imagesDir, imageName);
    await fsPromises.writeFile(imagePath, buffer);
    const relImagePath = `images/${imageName}`;

    samples.push({
      sampleId,
      imagePath: relImagePath,
      teammates,
      opponentTeams,
      modifiers,
      source: 'auto-correction',
      addedAt: new Date().toISOString(),
      meta: {
        imageHash,
        signature,
      },
    });

    await fsPromises.writeFile(truthPath, JSON.stringify({
      version: typeof truth?.version === 'number' ? truth.version : 1,
      samples,
    }, null, 2), 'utf8');

    await syncCorpusToRepo('auto-correction');
    return { success: true, sampleId, deduped: false };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('ocr-corpus-run-pipeline', async (event, opts = {}) => {
  try {
    await ensureCorpusDefaults();
    const truthPath = path.join(OCR_CORPUS_DIR, 'ground-truth.json');
    const predPath = path.join(OCR_CORPUS_DIR, 'predictions.latest.json');
    const truth = JSON.parse(await fsPromises.readFile(truthPath, 'utf8'));
    const samples = Array.isArray(truth.samples) ? truth.samples : [];

    const ocrMode = opts?.ocrMode || 'both';
    const activeUser = opts?.activeUser || null;
    const ocrRegions = opts?.ocrRegions || null;

    const predictions = [];
    const failures = [];

    for (const sample of samples) {
      try {
        const rawPath = String(sample.imagePath || '').trim();
        if (!rawPath) throw new Error('Missing imagePath');
        const resolvedPath = path.isAbsolute(rawPath)
          ? rawPath
          : path.resolve(OCR_CORPUS_DIR, rawPath);

        const imageBuffer = await fsPromises.readFile(resolvedPath);
        const base64 = imageBuffer.toString('base64');
        const result = await processCapture(base64, activeUser, null, ocrMode, {
          sourceImagePath: resolvedPath,
          skipDebugSave: true,
          ocrRegions,
        });

        if (!result?.success || !result?.data) {
          throw new Error(result?.error || 'OCR returned no data');
        }

        const data = result.data;
        predictions.push({
          sampleId: sample.sampleId,
          screenshotType: data.screenshotType || 'unknown',
          teammates: normalizeStringList((data.teammates || []).map(t => (typeof t === 'string' ? t : t?.name))),
          opponentTeams: Array.isArray(data.opponentTeams)
            ? data.opponentTeams.map(team => ({
              teamName: String(team?.teamName || '').trim(),
              players: normalizeStringList((team?.players || []).map(p => (typeof p === 'string' ? p : p?.name)))
            }))
            : [],
          modifiers: normalizeStringList((data.reachModifiers || []).map(m => (typeof m === 'string' ? m : m?.name)))
        });
      } catch (err) {
        failures.push({
          sampleId: sample.sampleId,
          error: err?.message || String(err)
        });
      }
    }

    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      ocrMode,
      samples: predictions,
      failures
    };

    await fsPromises.writeFile(predPath, JSON.stringify(payload, null, 2), 'utf8');
    await syncCorpusToRepo('run-pipeline');
    return {
      success: true,
      processed: predictions.length,
      failed: failures.length,
      total: samples.length,
      failures
    };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('db-status', async () => {
  try {
    const toMtime = async (p) => {
      try {
        const s = await fsPromises.stat(p);
        return s.mtimeMs || s.birthtimeMs || null;
      } catch {
        return null;
      }
    };

    const backupDir = path.join(app.getPath('documents'), 'Wildgate Stat Tracker/Backups');
    let lastBackupMtime = null;
    try {
      const files = await fsPromises.readdir(backupDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      for (const f of jsonFiles) {
        const m = await toMtime(path.join(backupDir, f));
        if (m && (!lastBackupMtime || m > lastBackupMtime)) lastBackupMtime = m;
      }
    } catch {
      // No backup directory yet.
    }

    const walExists = !!(await toMtime(DB_WAL_PATH));
    return {
      ok: true,
      walExists,
      dbMtime: await toMtime(DB_PATH),
      prevMtime: await toMtime(DB_PREV_PATH),
      walMtime: await toMtime(DB_WAL_PATH),
      lastBackupMtime,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      walExists: false,
      dbMtime: null,
      prevMtime: null,
      walMtime: null,
      lastBackupMtime: null
    };
  }
});

ipcMain.handle('open-path', async (event, targetPath) => {
  try {
    if (!isAllowedRendererPath(targetPath)) {
      return { success: false, error: 'Path not allowed' };
    }
    await shell.openPath(path.resolve(targetPath));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});


app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => {
  if (telemetryRetentionTimer) {
    clearInterval(telemetryRetentionTimer);
    telemetryRetentionTimer = null;
  }
  if (logMonitorInterval) {
    clearInterval(logMonitorInterval);
    logMonitorInterval = null;
  }
  logMonitorFingerprint = '';
});

autoUpdater.on('update-available', (info) => { if (win) win.webContents.send('update_available'); });
autoUpdater.on('update-not-available', (info) => { if (win) win.webContents.send('update_not_available'); });
autoUpdater.on('update-downloaded', (info) => { if (win) win.webContents.send('update_downloaded'); });
autoUpdater.on('error', (err) => { if (win) win.webContents.send('update_error', err.message); });
ipcMain.on('restart_app', () => autoUpdater.quitAndInstall());

