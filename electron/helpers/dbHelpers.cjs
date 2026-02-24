/**
 * @module electron/helpers/dbHelpers
 * Database path and backup helpers extracted from main process.
 * Used by backup listing, pruning, and creation; DB load/save remain in main.
 */
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const DB_FILENAME = 'wildgate_db.json';
const ARTIFACT_BACKUP_FOLDERS = ['match_artifacts', 'screenshots', 'ocr-debug', 'telemetry_archive'];

function safeCopyDirSync(sourceDir, targetDir) {
  if (!sourceDir || !targetDir) return false;
  if (!fs.existsSync(sourceDir)) return false;
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  return true;
}

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
 * @param {{ includeArtifacts?: boolean, userDataDir?: string }} [options]
 * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
 */
async function createDbBackup(dbPath, backupDir, reason = 'auto', options = {}) {
  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup_${timestamp}_${reason}.json`);
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'No database file found to backup.' };
    }
    fs.copyFileSync(dbPath, backupPath);
    let bundlePath = undefined;
    if (options?.includeArtifacts && options?.userDataDir) {
      const folderBase = path.basename(backupPath, '.json');
      const artifactBundleRoot = path.join(backupDir, `${folderBase}_artifacts`);
      const copied = [];
      ARTIFACT_BACKUP_FOLDERS.forEach((folderName) => {
        const sourceDir = path.join(options.userDataDir, folderName);
        const targetDir = path.join(artifactBundleRoot, folderName);
        if (safeCopyDirSync(sourceDir, targetDir)) {
          copied.push(folderName);
        }
      });
      if (copied.length > 0) {
        fs.mkdirSync(artifactBundleRoot, { recursive: true });
        fs.writeFileSync(path.join(artifactBundleRoot, 'manifest.json'), JSON.stringify({
          createdAt: Date.now(),
          sourceBackup: backupPath,
          copiedFolders: copied,
        }, null, 2));
        bundlePath = artifactBundleRoot;
      }
    }
    void pruneBackups(backupDir);
    return { success: true, path: backupPath, bundlePath };
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
