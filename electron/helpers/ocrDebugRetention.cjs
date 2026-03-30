const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const DEFAULT_OCR_DEBUG_RETENTION_DAYS = 30;
const DEFAULT_OCR_DEBUG_RETENTION_MS = DEFAULT_OCR_DEBUG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * @param {string} debugDir
 * @param {{ maxAgeMs?: number, nowMs?: number }} [options]
 */
async function pruneOcrDebugFiles(debugDir, options = {}) {
  const maxAgeMs = Number.isFinite(options?.maxAgeMs)
    ? Math.max(0, Number(options.maxAgeMs))
    : DEFAULT_OCR_DEBUG_RETENTION_MS;
  const nowMs = Number.isFinite(options?.nowMs) ? Number(options.nowMs) : Date.now();
  const cutoffMs = nowMs - maxAgeMs;
  const report = {
    success: true,
    cutoffMs,
    deletedFiles: 0,
    deletedBytes: 0,
    retainedFiles: 0,
    failures: [],
  };

  try {
    if (!fs.existsSync(debugDir)) return report;
    const entries = await fsPromises.readdir(debugDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(debugDir, entry.name);
      let stats = null;
      try {
        stats = await fsPromises.stat(fullPath);
      } catch {
        continue;
      }
      const mtimeMs = stats?.mtimeMs || 0;
      if (mtimeMs >= cutoffMs) {
        report.retainedFiles += 1;
        continue;
      }
      try {
        await fsPromises.unlink(fullPath);
        report.deletedFiles += 1;
        report.deletedBytes += stats?.size || 0;
      } catch (error) {
        report.success = false;
        report.failures.push({
          path: fullPath,
          error: error?.message || String(error),
        });
      }
    }
  } catch (error) {
    report.success = false;
    report.failures.push({
      path: debugDir,
      error: error?.message || String(error),
    });
  }

  return report;
}

module.exports = {
  pruneOcrDebugFiles,
  DEFAULT_OCR_DEBUG_RETENTION_DAYS,
  DEFAULT_OCR_DEBUG_RETENTION_MS,
};
