const { app, BrowserWindow, shell, ipcMain, globalShortcut, Menu, Tray, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const DiscordRPC = require('discord-rpc');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const fsPromises = require('fs').promises;
const { registerOCRHandlers, processCapture, runOCR } = require('./ocrHandler.cjs');
const gcloudService = require('./gcloudService.cjs');
const gcloudSyncService = require('./gcloudSyncService.cjs');
const geminiService = require('./geminiService.cjs');
const artifactHelpers = require('./helpers/artifactHelpers.cjs');
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
const DEV_SERVER_URL = process.env.WILDGATE_DEV_SERVER_URL || 'http://localhost:5173';
const USER_DATA_ROOT = path.resolve(app.getPath('userData'));
const OCR_CORPUS_DIR = path.join(USER_DATA_ROOT, 'ocr-corpus');
const OCR_CORPUS_REPORTS_DIR = path.join(OCR_CORPUS_DIR, 'reports');
const REPO_OCR_CORPUS_DIR = path.resolve(app.getAppPath(), 'dataset', 'ocr-corpus');
const AUTO_SYNC_CORPUS_TO_REPO = process.env.WILDGATE_AUTO_SYNC_CORPUS_TO_REPO !== '0';
const ALLOWED_FILE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif']);
const ALLOWED_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_EPIC_REQUEST_HOSTS = [
  'api.accelbyte.io',
  'services.accelbyte.io',
  'epicgames.com',
  'www.epicgames.com',
];
const EPIC_REQUEST_ALLOWED_HOSTS = new Set(
  (process.env.WILDGATE_ALLOWED_API_HOSTS || DEFAULT_EPIC_REQUEST_HOSTS.join(','))
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
);
const EXTERNAL_ALLOWED_HOSTS = new Set(
  (process.env.WILDGATE_ALLOWED_EXTERNAL_HOSTS || '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
);
const MAX_EPIC_REQUEST_BODY_BYTES = Number(process.env.WILDGATE_MAX_EPIC_BODY_BYTES || (2 * 1024 * 1024));
const telemetryArchiveTokenRegistry = createScopedTokenRegistry({
  ttlMs: Number(process.env.WILDGATE_ARCHIVE_TOKEN_TTL_MS || (5 * 60 * 1000)),
  maxEntriesPerScope: Number(process.env.WILDGATE_ARCHIVE_TOKEN_MAX || 5000),
});
const TELEMETRY_RETENTION_MAX_BYTES = Number(process.env.WILDGATE_TELEMETRY_MAX_BYTES || (100 * 1024 * 1024));
const TELEMETRY_RETENTION_MAX_AGE_MS = Number(process.env.WILDGATE_TELEMETRY_MAX_AGE_MS || (14 * 24 * 60 * 60 * 1000));
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

function isAllowedEpicHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return Array.from(EPIC_REQUEST_ALLOWED_HOSTS).some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

function sanitizeForwardHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    const cleanKey = key.trim();
    if (!cleanKey) continue;
    if (/[\r\n]/.test(cleanKey) || /[\r\n]/.test(value)) continue;
    if (cleanKey.toLowerCase() === 'host') continue;
    safe[cleanKey] = value;
  }
  return safe;
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

function sampleIdFromPath(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[^a-zA-Z0-9_-]/g, '_');
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

// Force app name to match productName so app.getPath('userData') resolves
// to the same directory in both dev and production (e.g. "Wildgate Stat Tracker").
// Without this, dev mode uses the package "name" field which differs from productName.
if (isDev) {
  app.setName('Wildgate Stat Tracker');
}

const DEV_T0_MS = isDev ? Date.now() : 0;
function devMark(label) {
  if (!isDev) return;
  const dt = Date.now() - DEV_T0_MS;
  console.log(`[dev-timing] +${dt}ms ${label}`);
}

let win;
let tray = null;
let previousBounds = { x: 0, y: 0, width: 1440, height: 900 };
let lastOverlayBounds = null;
let currentOverlayStyle = 'compact';
const DEFAULT_MIN_WINDOW_BOUNDS = { width: 1200, height: 768 };
const OVERLAY_MIN_WINDOW_BOUNDS = {
  compact: { width: 420, height: 520 },
  transparent: { width: 640, height: 420 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
      .progress-wrap { margin-top: 12px; }
      .progress-track {
        width: 100%;
        height: 8px;
        border-radius: 999px;
        background: rgba(255,255,255,0.10);
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.14);
      }
      .progress-fill {
        width: 0%;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(56,189,248,1) 0%, rgba(251,146,60,1) 100%);
        box-shadow: 0 0 16px rgba(56,189,248,0.35);
        transition: width 180ms ease;
      }
      .meta {
        margin-top: 8px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 11px;
        opacity: 0.78;
      }
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
            <div id="splash-status">Booting app shell...</div>
          </div>
          <div class="progress-wrap">
            <div class="progress-track">
              <div id="splash-progress-fill" class="progress-fill"></div>
            </div>
            <div class="meta">
              <div id="splash-detail">Initializing</div>
              <div id="splash-pct">0%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <script>
      window.__setSplashProgress = function (pct, status, detail) {
        var v = Math.max(0, Math.min(100, Number(pct) || 0));
        var fill = document.getElementById('splash-progress-fill');
        var pctNode = document.getElementById('splash-pct');
        var statusNode = document.getElementById('splash-status');
        var detailNode = document.getElementById('splash-detail');
        if (fill) fill.style.width = v + '%';
        if (pctNode) pctNode.textContent = Math.round(v) + '%';
        if (statusNode && typeof status === 'string' && status.trim()) statusNode.textContent = status;
        if (detailNode && typeof detail === 'string' && detail.trim()) detailNode.textContent = detail;
      };
      window.__setSplashProgress(2, 'Booting app shell...', 'Preparing startup');
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

  const HEARTBEAT_INTERVAL = 5; // Update splash every N attempts to avoid spam
  const tryLoad = async () => {
    if (stopped || inFlight || !win || win.isDestroyed()) return;
    inFlight = true;
    attempt += 1;
    const isFirst = attempt === 1;
    const isHeartbeat = attempt % HEARTBEAT_INTERVAL === 0;
    if (isFirst || isHeartbeat) {
      setSplashProgressDedupe(win, Math.min(92, 18 + attempt * 3), 'Connecting renderer...', `Checking dev server (attempt ${attempt})`);
    }

    try {
      const ready = await probeUrlReady(url);
      if (!ready) {
        if (isFirst || isHeartbeat) {
          setSplashProgressDedupe(win, Math.min(92, 16 + attempt * 2), 'Waiting for dev server...', `Retrying connection (attempt ${attempt})`);
        }
        const delay = Math.min(1400, 90 + (attempt * 90));
        inFlight = false;
        retryTimer = setTimeout(tryLoad, delay);
        return;
      }

      setSplashProgressDedupe(win, 95, 'Loading interface...', 'Renderer is responding');
      await win.loadURL(url);
      // stop() happens on did-finish-load once the dev URL successfully loads.
      inFlight = false;
    } catch {
      if (isFirst || isHeartbeat) {
        setSplashProgressDedupe(win, Math.min(92, 16 + attempt * 2), 'Waiting for dev server...', `Retrying connection (attempt ${attempt})`);
      }
      const delay = Math.min(1400, 90 + (attempt * 90));
      inFlight = false;
      retryTimer = setTimeout(tryLoad, delay);
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
  retryTimer = setTimeout(tryLoad, 25);
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../public/favicon.png');
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show Dashboard', click: () => {
            if (win) {
              win.show();
              win.setSkipTaskbar(false);
              win.webContents.send('hotkey-toggle-overlay', false); // Ensure overlay is off
            }
          }
        },
        {
          label: 'Toggle Overlay (F9)', click: () => {
            if (win) {
              if (win.isVisible()) win.hide();
              else win.show();
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
          if (win.isVisible()) win.hide();
          else win.show();
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
registerArtifactHandlers(ipcMain, { app, getWin: () => win, artifactHelpers, gcloudSyncService });

ipcMain.handle('rerun-ocr-on-artifact', async (event, { imagePath, activeUser, ocrMode }) => {
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
    const result = await processCapture(base64, activeUser, null, ocrMode || 'both', { sourceImagePath: fullPath });
    return result;
  } catch (e) {
    console.error('[rerun-ocr] Error:', e.message);
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

  await fsPromises.rename(tempPath, filePath);
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

ipcMain.handle('db-write', async (event, data) => {
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
    try {
      await fsPromises.unlink(DB_TEMP_PATH);
    } catch (unlinkErr) {
      console.error("Failed to cleanup temp file", unlinkErr);
    }
    // Intentionally keep WAL for next startup replay.
    return false;
  }
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
  return dbHelpers.createDbBackup(DB_PATH, DB_BACKUP_DIR, 'manual');
});

ipcMain.handle('epic-request', async (event, payload = {}) => {
  try {
    const {
      url,
      method = 'GET',
      headers = {},
      body = undefined,
    } = payload || {};

    if (typeof url !== 'string' || !url.trim()) {
      return { ok: false, status: 400, statusText: 'Bad Request', error: 'Invalid URL' };
    }

    const urlCheck = validateHttpsUrlAllowlist(url, EPIC_REQUEST_ALLOWED_HOSTS);
    if (!urlCheck.success) {
      recordSecurityBlock('epic-request', urlCheck.code || IpcErrorCode.URL_NOT_ALLOWED, urlCheck.message || 'URL not allowed');
      return {
        ok: false,
        status: urlCheck.code === IpcErrorCode.INVALID_INPUT ? 400 : 403,
        statusText: urlCheck.code === IpcErrorCode.INVALID_INPUT ? 'Bad Request' : 'Forbidden',
        error: urlCheck.message || 'URL not allowed',
        code: urlCheck.code || IpcErrorCode.URL_NOT_ALLOWED,
      };
    }

    const parsed = urlCheck.data;
    if (!URL_ALLOWLIST_DISABLED && !isAllowedEpicHost(parsed.hostname)) {
      recordSecurityBlock('epic-request', IpcErrorCode.URL_NOT_ALLOWED, `Host not allowed: ${parsed.hostname}`);
      return { ok: false, status: 403, statusText: 'Forbidden', error: `Host not allowed: ${parsed.hostname}`, code: IpcErrorCode.URL_NOT_ALLOWED };
    }

    const normalizedMethod = String(method || 'GET').toUpperCase();
    if (!ALLOWED_HTTP_METHODS.has(normalizedMethod)) {
      recordSecurityBlock('epic-request', IpcErrorCode.METHOD_NOT_ALLOWED, `Method not allowed: ${normalizedMethod}`);
      return { ok: false, status: 405, statusText: 'Method Not Allowed', error: `Method not allowed: ${normalizedMethod}`, code: IpcErrorCode.METHOD_NOT_ALLOWED };
    }

    let requestBody = undefined;
    if (body !== undefined && body !== null) {
      const bodyCheck = validateBodySize(body, MAX_EPIC_REQUEST_BODY_BYTES);
      if (!bodyCheck.success) {
        recordSecurityBlock('epic-request', bodyCheck.code, bodyCheck.message);
        return { ok: false, status: bodyCheck.code === IpcErrorCode.PAYLOAD_TOO_LARGE ? 413 : 400, statusText: 'Bad Request', error: bodyCheck.message, code: bodyCheck.code };
      }
      if (typeof body === 'string') requestBody = body;
      else if (typeof body === 'object') requestBody = JSON.stringify(body);
      else return { ok: false, status: 400, statusText: 'Bad Request', error: 'Invalid request body type', code: IpcErrorCode.INVALID_INPUT };
    }

    const safeHeaders = sanitizeForwardHeaders(headers);
    const fetchOptions = {
      method: normalizedMethod,
      headers: {
        'User-Agent': 'AccelByte-SDK',
        ...safeHeaders
      },
      body: requestBody
    };

    const response = await fetch(parsed.toString(), fetchOptions);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      statusText: response.statusText
    };
  } catch (error) {
    console.error("IPC Request Error:", error);
    return { ok: false, status: 0, statusText: 'Network Error', error: error.message };
  }
});

// Log Monitoring Logic
let LOG_PATH = '';
let logMonitorInterval = null;
let lastLogContent = null;
let logMonitorProfile = 'balanced';
let logMonitorLastDecodeAt = 0;
let logMonitorLastSnapshotWriteAt = 0;

function resolveLogMonitorProfile(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (raw === 'low-power' || raw === 'low_power' || raw === 'lowpower') return 'low-power';
  if (raw === 'high-accuracy' || raw === 'high_accuracy' || raw === 'highaccuracy') return 'high-accuracy';
  return 'balanced';
}

function getLogMonitorConfig(profile) {
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
  if (logMonitorInterval) clearInterval(logMonitorInterval);
  logMonitorProfile = resolveLogMonitorProfile(options && typeof options === 'object' ? options.performanceProfile : null);
  const monitorCfg = getLogMonitorConfig(logMonitorProfile);
  logMonitorLastDecodeAt = 0;
  logMonitorLastSnapshotWriteAt = 0;

  const localAppData = path.join(app.getPath('home'), 'AppData', 'Local');
  const pathNebula = path.join(localAppData, 'Nebula', 'Saved', 'Logs', 'AccelByteTelemetryCache');
  const pathWildgate = path.join(localAppData, 'Wildgate', 'Saved', 'Logs', 'AccelByteTelemetryCache');

  // Logic: Prefer Wildgate (Local) if exists, else Nebula (Game)
  if (fs.existsSync(pathNebula)) {
    LOG_PATH = pathNebula;
  } else if (fs.existsSync(pathWildgate)) {
    LOG_PATH = pathWildgate;
  } else {
    // If neither exists, check if we have a saved DECODED log to fallback on?
    // For now default to Nebula path to keep watching
    LOG_PATH = pathNebula;
  }

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

// Discord RPC Setup
const clientId = '1331154341514117120';
DiscordRPC.register(clientId);
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

function logDiscordRpcIssue(err, phase) {
  const message = err && err.message ? err.message : String(err || 'Unknown RPC error');
  const isBenign = /connection closed|could not connect|ENOENT|ECONNREFUSED/i.test(message);
  if (isBenign) {
    if (isDev) console.warn(`[DiscordRPC] ${phase}: ${message}`);
    return;
  }
  console.error(`[DiscordRPC] ${phase}: ${message}`);
}

rpc.on('error', (err) => {
  logDiscordRpcIssue(err, 'client-error');
});

async function setActivity(stats) {
  if (!rpc || !win) return;
  try {
    const { sessionWins, sessionTotal, activeMode } = stats;
    const winRate = sessionTotal > 0 ? Math.round((sessionWins / sessionTotal) * 100) : 0;
    rpc.setActivity({
      details: `${activeMode}`,
      state: `Session: ${sessionWins}W - ${sessionTotal - sessionWins}L (${winRate}%)`,
      startTimestamp: stats.startTime || Date.now(),
      largeImageKey: 'logo',
      largeImageText: 'Wildgate Stat Tracker',
      instance: false,
    }).catch(() => { });
  } catch (e) { }
}

function createWindow() {
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
    icon: path.join(__dirname, '../public/favicon.png'),
    autoHideMenuBar: true,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    show: false, // Prevent white flash by waiting for content
  });

  devMark('window created');

  win.once('ready-to-show', () => {
    win.show();
    // if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

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

  ipcMain.on('open-devtools', () => win.webContents.openDevTools());
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
  ipcMain.on('update-presence', (event, stats) => setActivity(stats));
  ipcMain.on('check-for-updates', () => { if (!isDev) autoUpdater.checkForUpdates(); else if (win) win.webContents.send('update_not_available'); });
}

// GCloud OCR IPC Handler
ipcMain.handle('gcloud-ocr-scan', async (event, imagePath) => {
  return await gcloudService.performOCR(imagePath);
});

// GCloud Training Sync IPC Handler
ipcMain.handle('sync-training-sample', async (event, sampleId) => {
  const trainingDir = path.join(app.getPath('userData'), 'training_data');
  return await gcloudSyncService.syncSample(trainingDir, sampleId);
});

// GCloud one-time backfill: upload all local screenshots, deduped against bucket contents
ipcMain.handle('gcloud-backfill-screenshots', async () => {
  return await gcloudSyncService.backfillScreenshots(app.getPath('userData'));
});

app.whenReady().then(async () => {
  devMark('app whenReady');
  createWindow();
  createTray();

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
  if (isDev) setSplashProgress(win, 50, 'OCR ready', 'Checking cloud integrations');

  // Initialize GCloud services (only if key file exists on this machine)
  const GCLOUD_KEY =
    process.env.WILDGATE_GCLOUD_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(app.getPath('documents'), 'GCloudInfo', 'service-account.json');
  const GCLOUD_BUCKET = process.env.WILDGATE_GCLOUD_BUCKET || 'wildgate-training-heeatpie';
  if (fs.existsSync(GCLOUD_KEY)) {
    if (isDev) setSplashProgress(win, 60, 'Initializing cloud OCR...', 'Connecting to Google Cloud');
    // Keep cloud init in the background so dev splash can appear immediately.
    void (async () => {
      try {
        gcloudService.initialize(GCLOUD_KEY);
        await gcloudSyncService.initialize(GCLOUD_KEY, GCLOUD_BUCKET);
        geminiService.initialize(GCLOUD_KEY);
        if (isDev) setSplashProgress(win, 92, 'Cloud services ready', 'Renderer loading');
      } catch (e) {
        console.warn('[GCloud] Background init failed:', e?.message || e);
        if (isDev) setSplashProgress(win, 72, 'Cloud OCR disabled', 'Background init failed');
      }
    })();
  } else {
    console.warn('[GCloud] Key file not found, GCloud services disabled');
    if (isDev) setSplashProgress(win, 72, 'Cloud OCR disabled', 'No credentials found');
  }
  if (!isDev) autoUpdater.checkForUpdates();
  if (isDev) setSplashProgress(win, 84, 'Initializing presence...', 'Connecting Discord RPC');
  rpc.login({ clientId }).catch((err) => {
    logDiscordRpcIssue(err, 'login');
  });

  if (isDev) setSplashProgress(win, 90, 'Registering hotkeys...', 'Almost there');
  globalShortcut.register('F9', () => {
    if (win) {
      if (win.isVisible() && !win.isMinimized()) {
        // If visible and focused (or just visible), Hide it (Dismiss)
        // We used to minimize, but hide() is cleaner for "toggling away"
        win.hide();
      } else {
        // If hidden or minimized, Bring it up
        if (win.isMinimized()) win.restore();
        win.show();
        win.setAlwaysOnTop(true, 'screen-saver'); // Ensure it pops over game
        win.focus();
      }
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
ipcMain.handle('read-file-base64', async (event, filePath) => {
  try {
    if (!isAllowedRendererPath(filePath)) return null;
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.has(ext)) return null;
    const data = await fsPromises.readFile(resolved);
    return data.toString('base64');
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
      const entries = await fsPromises.readdir(imagesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (ALLOWED_FILE_EXTENSIONS.has(ext)) {
            files.push({ name: e.name, relativePath: `images/${e.name}` });
          }
        }
      }
    } catch {
      // no images dir yet
    }
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
    const evalScript = path.join(app.getAppPath(), 'scripts', 'ocr_corpus_eval.cjs');
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
    const recommendScript = path.join(app.getAppPath(), 'scripts', 'ocr_threshold_recommend.cjs');
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
    const promoteScript = path.join(app.getAppPath(), 'scripts', 'ocr_promote_baseline.cjs');
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
    const picked = await dialog.showOpenDialog(win, {
      title: 'Import OCR Corpus Images',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
      properties: ['openFile', 'multiSelections']
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { success: true, imported: 0, skipped: 0, canceled: true };
    }

    const corpusImagesDir = path.join(OCR_CORPUS_DIR, 'images');
    await fsPromises.mkdir(corpusImagesDir, { recursive: true });
    const truthPath = path.join(OCR_CORPUS_DIR, 'ground-truth.json');
    const truth = JSON.parse(await fsPromises.readFile(truthPath, 'utf8'));
    const samples = Array.isArray(truth.samples) ? truth.samples : [];
    const existingIds = new Set(samples.map(s => s.sampleId));

    let imported = 0;
    let skipped = 0;

    for (const src of picked.filePaths) {
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
      await fsPromises.copyFile(src, targetPath);
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
    }

    const nextTruth = {
      version: typeof truth.version === 'number' ? truth.version : 1,
      samples
    };
    await fsPromises.writeFile(truthPath, JSON.stringify(nextTruth, null, 2), 'utf8');
    await syncCorpusToRepo('import-images');
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
          skipDebugSave: true
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

// GCloud status check (renderer queries this to show availability in settings)
ipcMain.handle('get-gcloud-status', async () => {
  return {
    visionReady: gcloudService.isInitialized || false,
    geminiReady: geminiService.isInitialized || false,
    storageReady: gcloudSyncService.isInitialized || false,
    storageStats: gcloudSyncService.getStats(),
  };
});

// GCloud test upload (verify credentials and bucket access from UI)
ipcMain.handle('test-gcloud-upload', async () => {
  return await gcloudSyncService.testUpload();
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
  // Dev safety net: mirror latest userData corpus into repo on app shutdown.
  if (!isDev || !AUTO_SYNC_CORPUS_TO_REPO) return;
  syncCorpusToRepo('before-quit').catch((e) => {
    console.warn('[OCR Corpus] before-quit sync failed:', e?.message || e);
  });
});

autoUpdater.on('update-available', (info) => { if (win) win.webContents.send('update_available'); });
autoUpdater.on('update-not-available', (info) => { if (win) win.webContents.send('update_not_available'); });
autoUpdater.on('update-downloaded', (info) => { if (win) win.webContents.send('update_downloaded'); });
autoUpdater.on('error', (err) => { if (win) win.webContents.send('update_error', err.message); });
ipcMain.on('restart_app', () => autoUpdater.quitAndInstall());

