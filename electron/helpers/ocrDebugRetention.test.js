import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pruneOcrDebugFiles } from './ocrDebugRetention.cjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-debug-retention-'));
}

function writeFileWithMtime(root, name, ageMs, nowMs) {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, Buffer.alloc(256, 9));
  const targetTime = new Date(nowMs - ageMs);
  fs.utimesSync(filePath, targetTime, targetTime);
  return filePath;
}

describe('ocrDebugRetention.pruneOcrDebugFiles', () => {
  const tempDirs = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deletes OCR debug files older than the retention window and keeps recent ones', async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const nowMs = Date.UTC(2026, 2, 29, 12, 0, 0);
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000;

    const oldFile = writeFileWithMtime(root, 'old-debug.png', maxAgeMs + 1_000, nowMs);
    const recentFile = writeFileWithMtime(root, 'recent-debug.png', maxAgeMs - 1_000, nowMs);

    const report = await pruneOcrDebugFiles(root, { nowMs, maxAgeMs });

    expect(report.success).toBe(true);
    expect(report.deletedFiles).toBe(1);
    expect(report.deletedBytes).toBeGreaterThan(0);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(recentFile)).toBe(true);
  });

  it('reports unlink failures without throwing', async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const nowMs = Date.UTC(2026, 2, 29, 12, 0, 0);
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000;

    const oldFile = writeFileWithMtime(root, 'stale-debug.png', maxAgeMs + 5_000, nowMs);
    const realUnlink = fs.promises.unlink.bind(fs.promises);

    vi.spyOn(fs.promises, 'unlink').mockImplementation(async (filePath) => {
      if (path.resolve(String(filePath)) === path.resolve(oldFile)) {
        throw new Error('access denied');
      }
      return realUnlink(filePath);
    });

    const report = await pruneOcrDebugFiles(root, { nowMs, maxAgeMs });

    expect(report.success).toBe(false);
    expect(report.deletedFiles).toBe(0);
    expect(report.failures).toHaveLength(1);
    expect(fs.existsSync(oldFile)).toBe(true);
  });
});
