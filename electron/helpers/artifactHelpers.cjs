/**
 * @module electron/helpers/artifactHelpers
 * Artifact and telemetry path/scan helpers extracted from main process.
 * Used by bundle-artifacts and related IPC handlers.
 */
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');
const { normalizeEvents } = require('./telemetryArchiveHelpers.cjs');

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];
const TIME_MARGIN_MS = { before: 5000, after: 30000 };
const AUTO_CAPTURE_FILENAME_PATTERN = /^capture_/i;

function isAutoCaptureImage(fileName) {
  return AUTO_CAPTURE_FILENAME_PATTERN.test(String(fileName || '').trim());
}

/**
 * Get artifact-related paths under userData.
 * @param {import('electron').App} app - Electron app
 * @returns {{ userData: string, matchArtifactsRoot: string, screenshotsDir: string, ocrDebugDir: string, telemetryArchiveDir: string }}
 */
function getArtifactPaths(app) {
  const userData = app.getPath('userData');
  return {
    userData,
    matchArtifactsRoot: path.join(userData, 'match_artifacts'),
    screenshotsDir: path.join(userData, 'screenshots'),
    ocrDebugDir: path.join(userData, 'ocr-debug'),
    telemetryArchiveDir: path.join(userData, 'telemetry_archive'),
  };
}

/**
 * Scan a directory for image files within a time window and copy into matchDir.
 * Deduplicates by filename and, for size collisions, by content hash.
 * @param {string} dir - Directory to scan
 * @param {string} matchDir - Destination directory for copied files
 * @param {number} startTime - Window start (ms)
 * @param {number} endTime - Window end (ms)
 * @param {{ bundledNames: Set<string>, bundledSizes: Set<string>, bundledContentHashesBySize?: Map<string, Set<string>>, assignedCaptureNames?: Set<string>, consumeSource?: boolean, onCopy?: (srcPath: string, destPath: string) => Promise<void> }} state
 * @returns {Promise<string[]>} - Paths of copied files (destPath)
 */
function getBundledContentHashesBySize(state) {
  if (state.bundledContentHashesBySize instanceof Map) {
    return state.bundledContentHashesBySize;
  }

  const bundledContentHashesBySize = new Map();
  state.bundledContentHashesBySize = bundledContentHashesBySize;
  return bundledContentHashesBySize;
}

async function hashFileContents(filePath) {
  const buffer = await fsPromises.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function scanDirForImagesInWindow(dir, matchDir, startTime, endTime, state) {
  const {
    bundledNames,
    bundledSizes,
    assignedCaptureNames,
    consumeSource = false,
    onCopy,
  } = state;
  const bundledContentHashesBySize = getBundledContentHashesBySize(state);
  const copied = [];
  if (!fs.existsSync(dir)) return copied;

  const files = await fsPromises.readdir(dir);
  for (const file of files) {
    if (bundledNames.has(file)) continue;
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) continue;

    const fileKey = file.toLowerCase();
    if (assignedCaptureNames && isAutoCaptureImage(file) && assignedCaptureNames.has(fileKey)) continue;

    const srcPath = path.join(dir, file);
    const stat = await fsPromises.stat(srcPath);
    const birthtime = stat.birthtimeMs || stat.mtimeMs;
    if (birthtime < startTime - TIME_MARGIN_MS.before || birthtime > endTime + TIME_MARGIN_MS.after) continue;

    const sizeKey = `${stat.size}`;
    let contentHash = null;
    if (bundledSizes.has(sizeKey)) {
      contentHash = await hashFileContents(srcPath);
      const hashesForSize = bundledContentHashesBySize.get(sizeKey);
      if (hashesForSize?.has(contentHash)) continue;
    }

    const destPath = path.join(matchDir, file);
    await fsPromises.copyFile(srcPath, destPath);
    copied.push(destPath);
    bundledNames.add(file);
    bundledSizes.add(sizeKey);
    const hashesForSize = bundledContentHashesBySize.get(sizeKey) || new Set();
    if (!bundledContentHashesBySize.has(sizeKey)) {
      bundledContentHashesBySize.set(sizeKey, hashesForSize);
    }
    hashesForSize.add(contentHash || await hashFileContents(srcPath));
    if (assignedCaptureNames && isAutoCaptureImage(file)) {
      assignedCaptureNames.add(fileKey);
    }

    if (typeof onCopy === 'function') {
      await Promise.resolve(onCopy(srcPath, destPath, file)).catch(() => {});
    }

    if (consumeSource) {
      await fsPromises.unlink(srcPath).catch(() => {});
    }
  }
  return copied;
}

/**
 * Copy telemetry JSON files that overlap the time window into matchDir.
 * @param {string} telemetryDir - Directory containing telemetry JSON files
 * @param {string} matchDir - Destination directory
 * @param {number} startTime - Window start (ms)
 * @param {number} endTime - Window end (ms)
 * @returns {Promise<number>} - Number of files copied
 */
async function copyTelemetryInWindow(telemetryDir, matchDir, startTime, endTime) {
  let count = 0;
  if (!fs.existsSync(telemetryDir)) return count;

  const files = (await fsPromises.readdir(telemetryDir)).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const srcPath = path.join(telemetryDir, file);
      const content = JSON.parse(await fsPromises.readFile(srcPath, 'utf-8'));
      const events = normalizeEvents(content);
      const hasOverlap = events.some(e => {
        const t = e.ClientTimestamp || e.timestamp || e.EventTimestamp;
        return t && t >= startTime - TIME_MARGIN_MS.before && t <= endTime + TIME_MARGIN_MS.after;
      });
      if (hasOverlap) {
        const destPath = path.join(matchDir, file);
        await fsPromises.copyFile(srcPath, destPath);
        count++;
      }
    } catch (_) { /* skip unparseable */ }
  }
  return count;
}

module.exports = {
  getArtifactPaths,
  scanDirForImagesInWindow,
  copyTelemetryInWindow,
  isAutoCaptureImage,
  IMAGE_EXTS,
  TIME_MARGIN_MS,
};
