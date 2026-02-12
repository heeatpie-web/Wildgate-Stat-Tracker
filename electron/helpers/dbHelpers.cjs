/**
 * @module electron/helpers/dbHelpers
 * Database path and backup helpers extracted from main process.
 * Used by backup listing, pruning, and creation; DB load/save remain in main.
 */
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const DB_FILENAME = 'wildgate_db.json';

/**
 * @param {import('electron').App} app
 * @returns {{ dbPath: string, backupDir: string }}
 */
function getDbPaths(app) {
  const userData = app.getPath('userData');
  const documents = app.getPath('documents');
  return {
    dbPath: path.join(userData, DB_FILENAME),
    backupDir: path.join(documents, 'Wildgate Stat Tracker', 'Backups'),
  };
}

/**
 * @param {string} backupDir
 * @param {number} [limit=12]
 * @returns {Promise<string[]>} Full paths to backup files, newest first
 */
async function listRecentBackups(backupDir, limit = 12) {
  try {
    if (!fs.existsSync(backupDir)) return [];
    const entries = await fsPromises.readdir(backupDir);
    const files = entries
      .filter(f => f.toLowerCase().endsWith('.json') && f.toLowerCase().startsWith('backup_'))
      .map(f => path.join(backupDir, f));
    const stats = await Promise.all(files.map(async (p) => {
      try {
        const st = await fsPromises.stat(p);
        return { p, m: st.mtimeMs || 0 };
      } catch {
        return null;
      }
    }));
    return stats
      .filter(Boolean)
      .sort((a, b) => (b.m - a.m))
      .slice(0, limit)
      .map(x => x.p);
  } catch {
    return [];
  }
}

/**
 * @param {string} backupDir
 * @param {number} [maxKeep=40]
 */
async function pruneBackups(backupDir, maxKeep = 40) {
  try {
    const recent = await listRecentBackups(backupDir, 9999);
    const extra = recent.slice(maxKeep);
    if (extra.length === 0) return;
    await Promise.all(extra.map(async (p) => {
      try { await fsPromises.unlink(p); } catch { /* ignore */ }
    }));
  } catch {
    // ignore
  }
}

/**
 * @param {string} dbPath
 * @param {string} backupDir
 * @param {string} [reason='auto']
 * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
 */
async function createDbBackup(dbPath, backupDir, reason = 'auto') {
  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup_${timestamp}_${reason}.json`);
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'No database file found to backup.' };
    }
    fs.copyFileSync(dbPath, backupPath);
    void pruneBackups(backupDir);
    return { success: true, path: backupPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  getDbPaths,
  listRecentBackups,
  pruneBackups,
  createDbBackup,
  DB_FILENAME,
};
