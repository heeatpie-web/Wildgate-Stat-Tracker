/**
 * @module electron/helpers/telemetryArchiveHelpers
 * Telemetry archive directory and file helpers extracted from main process.
 * Used by archive/load/list/clear telemetry IPC handlers.
 */
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const ARCHIVE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

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
        cleaned++;
      }
    });
    if (cleaned > 0) console.log(`Cleaned up ${cleaned} old telemetry archives.`);
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

    let combinedData = [];
    if (fs.existsSync(archivePath)) {
      try {
        const content = fs.readFileSync(archivePath, 'utf8');
        combinedData = JSON.parse(content);
        if (!Array.isArray(combinedData)) combinedData = [combinedData];
      } catch (e) { combinedData = []; }
    }

    let newEvents = [];
    if (data.telemetry && Array.isArray(data.telemetry)) newEvents = data.telemetry;
    else if (Array.isArray(data)) newEvents = data;
    else newEvents = [data];

    const existingSignatures = new Set(combinedData.map(e => `${e.ClientTimestamp}_${e.EventName}`));
    newEvents.forEach(e => {
      const sig = `${e.ClientTimestamp}_${e.EventName}`;
      if (!existingSignatures.has(sig)) combinedData.push(e);
    });

    combinedData.sort((a, b) => (a.ClientTimestamp || 0) - (b.ClientTimestamp || 0));
    await fsPromises.writeFile(archivePath, JSON.stringify(combinedData, null, 2));
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

    console.log(`Loaded ${allEvents.length} events from ${files.length} archived files.`);
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
  await Promise.all(files.map(file => fsPromises.unlink(path.join(archiveDir, file))));
  return { success: true, count: files.length };
}

module.exports = {
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
