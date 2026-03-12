/**
 * @module electron/helpers/telemetryArchiveHelpers
 * Telemetry archive directory and file helpers extracted from main process.
 * Used by archive/load/list/clear telemetry IPC handlers.
 */
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const ARCHIVE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const archiveStateByPath = new Map();
const archiveQueueByPath = new Map();
const shouldInfoLog = process.env.NODE_ENV !== 'production';

function infoLog(...args) {
  if (shouldInfoLog) {
    console.log(...args);
  }
}

function normalizeEvents(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.telemetry)) return data.telemetry;
  return [data];
}

function telemetryEventSignature(event) {
  if (!event || typeof event !== 'object') return '';
  const ts = event.ClientTimestamp ?? event.timestamp ?? event.ts ?? '';
  const name = event.EventName ?? event.eventName ?? event.type ?? '';
  const matchId = event.matchId ?? event.MatchId ?? event.sessionId ?? event.SessionId ?? '';
  return `${String(ts)}_${String(name)}_${String(matchId)}`;
}

async function readArchiveEventsFromDisk(archivePath) {
  if (!fs.existsSync(archivePath)) return [];
  try {
    const content = JSON.parse(await fsPromises.readFile(archivePath, 'utf8'));
    return normalizeEvents(content);
  } catch {
    return [];
  }
}

async function getArchiveState(archivePath) {
  const existing = archiveStateByPath.get(archivePath);
  if (existing) return existing;

  const events = await readArchiveEventsFromDisk(archivePath);
  const signatures = new Set();
  for (const evt of events) {
    const signature = telemetryEventSignature(evt);
    if (signature) signatures.add(signature);
  }

  const state = { events, signatures };
  archiveStateByPath.set(archivePath, state);
  return state;
}

function clearArchiveState(archivePath) {
  archiveStateByPath.delete(archivePath);
}

function queueArchiveOperation(archivePath, operation) {
  const previous = archiveQueueByPath.get(archivePath) || Promise.resolve();
  const queuedOperation = previous.catch(() => {}).then(operation);
  const queueTail = queuedOperation.catch(() => {});
  archiveQueueByPath.set(archivePath, queueTail);
  return queuedOperation.finally(() => {
    if (archiveQueueByPath.get(archivePath) === queueTail) {
      archiveQueueByPath.delete(archivePath);
    }
  });
}

/**
 * @param {import('electron').App} app
 * @returns {string}
 */
function getArchiveDir(app) {
  return path.join(app.getPath('userData'), 'telemetry_archive');
}

/**
 * @param {string} archiveDir
 */
function ensureArchiveDir(archiveDir) {
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
}

/**
 * @param {string} archiveDir
 * @param {number} [maxAgeMs=ARCHIVE_MAX_AGE_MS]
 */
function cleanupOldArchives(archiveDir, maxAgeMs = ARCHIVE_MAX_AGE_MS) {
  try {
    ensureArchiveDir(archiveDir);
    const files = fs.readdirSync(archiveDir);
    const now = Date.now();
    let cleaned = 0;
    files.forEach(file => {
      const filePath = path.join(archiveDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        clearArchiveState(filePath);
        cleaned++;
      }
    });
    if (cleaned > 0) infoLog(`Cleaned up ${cleaned} old telemetry archives.`);
  } catch (e) {
    console.error('Archive cleanup error:', e);
  }
}

/**
 * @param {string} archiveDir
 * @param {object} data - Payload with optional .telemetry array or array/event object
 */
async function archiveTelemetry(archiveDir, data) {
  try {
    ensureArchiveDir(archiveDir);

    let matchId = 'session_global';
    const scanForId = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.matchId || obj.MatchId) { matchId = obj.matchId || obj.MatchId; return; }
      if (obj.sessionId || obj.SessionId) { matchId = obj.sessionId || obj.SessionId; return; }
      if (Array.isArray(obj)) { for (const item of obj) { scanForId(item); if (matchId !== 'session_global') break; } }
      else { for (const key in obj) { scanForId(obj[key]); if (matchId !== 'session_global') break; } }
    };
    scanForId(data);

    const safeMatchId = matchId.toString().replace(/[^a-z0-9_-]/gi, '_');
    const archivePath = path.join(archiveDir, `match_${safeMatchId}.json`);
    const newEvents = normalizeEvents(data);
    await queueArchiveOperation(archivePath, async () => {
      const state = await getArchiveState(archivePath);
      let addedCount = 0;

      for (const event of newEvents) {
        const signature = telemetryEventSignature(event);
        if (signature && state.signatures.has(signature)) continue;
        if (signature) state.signatures.add(signature);
        state.events.push(event);
        addedCount += 1;
      }

      // Skip expensive rewrites when this tick introduced no new archive events.
      if (addedCount === 0) return;
      await fsPromises.writeFile(archivePath, JSON.stringify(state.events), 'utf8');
    });
  } catch (e) {
    console.error('Failed to archive telemetry:', e);
  }
}

/**
 * @param {string} archiveDir
 * @returns {Promise<object[]>}
 */
async function loadArchivedTelemetry(archiveDir) {
  try {
    ensureArchiveDir(archiveDir);
    const files = await fsPromises.readdir(archiveDir);
    const allEvents = [];

    await Promise.all(files.map(async (file) => {
      try {
        const filePath = path.join(archiveDir, file);
        const content = JSON.parse(await fsPromises.readFile(filePath, 'utf-8'));
        if (content.telemetry && Array.isArray(content.telemetry)) {
          allEvents.push(...content.telemetry);
        } else if (Array.isArray(content)) {
          allEvents.push(...content);
        } else if (content.EventName) {
          allEvents.push(content);
        }
      } catch (e) { /* Skip corrupted files */ }
    }));

    infoLog(`Loaded ${allEvents.length} events from ${files.length} archived files.`);
    return allEvents;
  } catch (e) {
    console.error('Failed to load archived telemetry:', e);
    return [];
  }
}

/**
 * @param {string} archiveDir
 * @returns {Promise<Array<{ filename: string, date: number, size: number }>>}
 */
async function listArchiveFiles(archiveDir) {
  if (!fs.existsSync(archiveDir)) return [];
  const files = (await fsPromises.readdir(archiveDir)).filter(f => f.endsWith('.json'));
  const fileStats = await Promise.all(files.map(async (file) => {
    const fullPath = path.join(archiveDir, file);
    const stats = await fsPromises.stat(fullPath);
    return { filename: file, date: stats.mtimeMs, size: stats.size };
  }));
  return fileStats.sort((a, b) => b.date - a.date);
}

/**
 * @param {string} archiveDir
 * @param {string} filename
 * @returns {Promise<object>}
 */
async function loadArchiveFile(archiveDir, filename) {
  const fullPath = path.join(archiveDir, filename);
  if (!fs.existsSync(fullPath)) throw new Error('File not found');
  const content = await fsPromises.readFile(fullPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * @param {string} archiveDir
 * @returns {Promise<{ success: boolean, count: number, message?: string }>}
 */
async function clearArchiveFiles(archiveDir) {
  if (!fs.existsSync(archiveDir)) return { success: true, count: 0 };
  const files = (await fsPromises.readdir(archiveDir)).filter(f => f.endsWith('.json'));
  await Promise.all(files.map((file) => {
    const fullPath = path.join(archiveDir, file);
    return queueArchiveOperation(fullPath, async () => {
      clearArchiveState(fullPath);
      await fsPromises.unlink(fullPath);
    });
  }));
  return { success: true, count: files.length };
}

module.exports = {
  normalizeEvents,
  getArchiveDir,
  ensureArchiveDir,
  cleanupOldArchives,
  archiveTelemetry,
  loadArchivedTelemetry,
  listArchiveFiles,
  loadArchiveFile,
  clearArchiveFiles,
  ARCHIVE_MAX_AGE_MS,
};
