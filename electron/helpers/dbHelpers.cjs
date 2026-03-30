/**
 * @module electron/helpers/dbHelpers
 * Database path and backup helpers extracted from main process.
 * Used by backup listing, pruning, and creation; DB load/save remain in main.
 */
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const DB_FILENAME = 'wildgate_db.json';
const ARTIFACT_BACKUP_FOLDERS = ['match_artifacts', 'screenshots', 'telemetry_archive'];
const BACKUP_FILE_PREFIX = 'backup_';
const BACKUP_FILE_EXTENSION = '.json';
const ARTIFACT_BUNDLE_SUFFIX = '_artifacts';
const DEFAULT_JSON_BACKUP_KEEP_COUNT = 40;
const DEFAULT_ARTIFACT_BUNDLE_KEEP_COUNT = 1;

function safeCopyDirSync(sourceDir, targetDir) {
  if (!sourceDir || !targetDir) return false;
  if (!fs.existsSync(sourceDir)) return false;
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  return true;
}

function normalizeBackupPath(filePath) {
  return path.resolve(String(filePath || ''));
}

function isBackupJsonName(name) {
  const normalized = String(name || '').toLowerCase();
  return normalized.startsWith(BACKUP_FILE_PREFIX) && normalized.endsWith(BACKUP_FILE_EXTENSION);
}

function isArtifactBundleName(name) {
  const normalized = String(name || '').toLowerCase();
  return normalized.startsWith(BACKUP_FILE_PREFIX) && normalized.endsWith(ARTIFACT_BUNDLE_SUFFIX);
}

function getBackupBaseName(filePath) {
  return path.basename(String(filePath || ''), BACKUP_FILE_EXTENSION);
}

function getArtifactBundlePathForBackup(filePath) {
  const resolved = normalizeBackupPath(filePath);
  return path.join(path.dirname(resolved), `${getBackupBaseName(resolved)}${ARTIFACT_BUNDLE_SUFFIX}`);
}

async function getDirectorySizeBytes(dirPath) {
  let total = 0;
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fsPromises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stats = await fsPromises.stat(fullPath);
        total += stats.size || 0;
      } catch {
        // ignore
      }
    }
  }
  return total;
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
      .filter(isBackupJsonName)
      .map(fileName => path.join(backupDir, fileName));
    const stats = await Promise.all(files.map(async (filePath) => {
      try {
        const st = await fsPromises.stat(filePath);
        return { path: filePath, mtimeMs: st.mtimeMs || 0 };
      } catch {
        return null;
      }
    }));
    return stats
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, limit)
      .map(entry => entry.path);
  } catch {
    return [];
  }
}

/**
 * @param {string} backupDir
 * @returns {Promise<Array<{ path: string; pairedBackupPath: string; sortKey: number }>>}
 */
async function listArtifactBundles(backupDir) {
  try {
    if (!fs.existsSync(backupDir)) return [];
    const entries = await fsPromises.readdir(backupDir, { withFileTypes: true });
    const bundles = await Promise.all(entries
      .filter(entry => entry.isDirectory() && isArtifactBundleName(entry.name))
      .map(async (entry) => {
        const bundlePath = path.join(backupDir, entry.name);
        const bundleBaseName = entry.name.slice(0, -ARTIFACT_BUNDLE_SUFFIX.length);
        const pairedBackupPath = path.join(backupDir, `${bundleBaseName}${BACKUP_FILE_EXTENSION}`);
        let sortKey = 0;
        try {
          const manifestPath = path.join(bundlePath, 'manifest.json');
          const rawManifest = await fsPromises.readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(rawManifest);
          const sourceBackup = normalizeBackupPath(manifest?.sourceBackup || pairedBackupPath);
          if (getBackupBaseName(sourceBackup) === bundleBaseName) {
            const sourceStats = await fsPromises.stat(sourceBackup).catch(() => null);
            sortKey = sourceStats?.mtimeMs || Number(manifest?.createdAt) || 0;
          }
        } catch {
          // ignore and fall back to backup/dir mtimes below
        }
        if (!sortKey) {
          const backupStats = await fsPromises.stat(pairedBackupPath).catch(() => null);
          if (backupStats?.mtimeMs) {
            sortKey = backupStats.mtimeMs;
          } else {
            const dirStats = await fsPromises.stat(bundlePath).catch(() => null);
            sortKey = dirStats?.mtimeMs || 0;
          }
        }
        return {
          path: bundlePath,
          pairedBackupPath,
          sortKey,
        };
      }));
    return bundles.sort((a, b) => b.sortKey - a.sortKey);
  } catch {
    return [];
  }
}

/**
 * @param {string} backupDir
 * @param {number} [maxKeepBundles=1]
 */
async function cleanupArtifactBackupBundles(backupDir, maxKeepBundles = DEFAULT_ARTIFACT_BUNDLE_KEEP_COUNT) {
  const report = {
    removedArtifactBundles: 0,
    removedArtifactBundlePaths: [],
    retainedArtifactBundlePaths: [],
    freedBytes: 0,
    failures: [],
  };
  try {
    const bundles = await listArtifactBundles(backupDir);
    report.retainedArtifactBundlePaths = bundles.slice(0, maxKeepBundles).map(entry => entry.path);
    const extraBundles = bundles.slice(maxKeepBundles);
    for (const bundle of extraBundles) {
      const sizeBytes = await getDirectorySizeBytes(bundle.path);
      try {
        await fsPromises.rm(bundle.path, { recursive: true, force: true });
        report.removedArtifactBundles += 1;
        report.removedArtifactBundlePaths.push(bundle.path);
        report.freedBytes += sizeBytes;
      } catch (error) {
        report.failures.push({
          path: bundle.path,
          error: error?.message || String(error),
        });
      }
    }
  } catch (error) {
    report.failures.push({
      path: backupDir,
      error: error?.message || String(error),
    });
  }
  return report;
}

/**
 * @param {string} backupDir
 * @param {number} [maxKeepJson=40]
 * @param {number} [maxKeepBundles=1]
 */
async function pruneBackups(
  backupDir,
  maxKeepJson = DEFAULT_JSON_BACKUP_KEEP_COUNT,
  maxKeepBundles = DEFAULT_ARTIFACT_BUNDLE_KEEP_COUNT
) {
  const report = {
    removedJsonBackups: 0,
    removedJsonBackupPaths: [],
    retainedJsonBackupPaths: [],
    jsonFailures: [],
    artifactCleanup: {
      removedArtifactBundles: 0,
      removedArtifactBundlePaths: [],
      retainedArtifactBundlePaths: [],
      freedBytes: 0,
      failures: [],
    },
  };
  try {
    const recent = await listRecentBackups(backupDir, 9999);
    report.retainedJsonBackupPaths = recent.slice(0, maxKeepJson);
    const extra = recent.slice(maxKeepJson);
    for (const backupPath of extra) {
      try {
        await fsPromises.unlink(backupPath);
        report.removedJsonBackups += 1;
        report.removedJsonBackupPaths.push(backupPath);
      } catch (error) {
        report.jsonFailures.push({
          path: backupPath,
          error: error?.message || String(error),
        });
      }
    }
  } catch {
    // ignore
  }
  report.artifactCleanup = await cleanupArtifactBackupBundles(backupDir, maxKeepBundles);
  return report;
}

/**
 * @param {string} dbPath
 * @param {string} backupDir
 * @param {string} [reason='manual']
 * @param {{ includeArtifacts?: boolean, userDataDir?: string }} [options]
 * @returns {Promise<{ success: boolean, path?: string, bundlePath?: string, error?: string }>}
 */
async function createDbBackup(dbPath, backupDir, reason = 'manual', options = {}) {
  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${BACKUP_FILE_PREFIX}${timestamp}_${reason}${BACKUP_FILE_EXTENSION}`);
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'No database file found to backup.' };
    }
    fs.copyFileSync(dbPath, backupPath);
    let bundlePath;
    if (options?.includeArtifacts && options?.userDataDir) {
      const artifactBundleRoot = getArtifactBundlePathForBackup(backupPath);
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
  } catch (error) {
    return { success: false, error: error?.message || String(error) };
  }
}

module.exports = {
  getDbPaths,
  listRecentBackups,
  listArtifactBundles,
  cleanupArtifactBackupBundles,
  getArtifactBundlePathForBackup,
  pruneBackups,
  createDbBackup,
  DB_FILENAME,
  ARTIFACT_BACKUP_FOLDERS,
};
