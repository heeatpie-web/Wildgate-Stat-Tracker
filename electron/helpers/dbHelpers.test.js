import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupArtifactBackupBundles,
  createDbBackup,
  getArtifactBundlePathForBackup,
  pruneBackups,
} from './dbHelpers.cjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'db-helpers-'));
}

function setMtime(targetPath, mtimeMs) {
  const date = new Date(mtimeMs);
  fs.utimesSync(targetPath, date, date);
}

function writeBackupJson(root, index, reason = 'manual') {
  const baseName = `backup_2026-03-01T00-00-${String(index).padStart(2, '0')}-000Z_${reason}`;
  const backupPath = path.join(root, `${baseName}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ index }), 'utf8');
  setMtime(backupPath, Date.UTC(2026, 2, 1, 0, 0, index));
  return backupPath;
}

function writeArtifactBundleForBackup(backupPath, label = 'capture.png') {
  const bundlePath = getArtifactBundlePathForBackup(backupPath);
  fs.mkdirSync(path.join(bundlePath, 'match_artifacts'), { recursive: true });
  fs.writeFileSync(path.join(bundlePath, 'match_artifacts', label), Buffer.alloc(512, 7));
  fs.writeFileSync(path.join(bundlePath, 'manifest.json'), JSON.stringify({
    createdAt: fs.statSync(backupPath).mtimeMs,
    sourceBackup: backupPath,
    copiedFolders: ['match_artifacts'],
  }), 'utf8');
  return bundlePath;
}

describe('dbHelpers', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prunes json backups down to 40 and keeps only the newest artifact bundle', async () => {
    const root = makeTempDir();
    tempDirs.push(root);

    const backupPaths = Array.from({ length: 45 }, (_, index) => writeBackupJson(root, index));
    writeArtifactBundleForBackup(backupPaths[42], 'older.png');
    writeArtifactBundleForBackup(backupPaths[43], 'middle.png');
    const newestBundlePath = writeArtifactBundleForBackup(backupPaths[44], 'newest.png');

    const report = await pruneBackups(root, 40, 1);

    const remainingJson = fs.readdirSync(root).filter(name => name.endsWith('.json'));
    const remainingBundles = fs.readdirSync(root).filter(name => name.endsWith('_artifacts'));

    expect(remainingJson).toHaveLength(40);
    expect(remainingBundles).toEqual([path.basename(newestBundlePath)]);
    expect(report.removedJsonBackups).toBe(5);
    expect(report.artifactCleanup.removedArtifactBundles).toBe(2);
    expect(report.artifactCleanup.freedBytes).toBeGreaterThan(0);
    expect(report.artifactCleanup.retainedArtifactBundlePaths).toEqual([newestBundlePath]);
  });

  it('cleans legacy artifact bundles without deleting json backups', async () => {
    const root = makeTempDir();
    tempDirs.push(root);

    const firstBackup = writeBackupJson(root, 1);
    const secondBackup = writeBackupJson(root, 2);
    const thirdBackup = writeBackupJson(root, 3);
    writeArtifactBundleForBackup(firstBackup, 'first.png');
    writeArtifactBundleForBackup(secondBackup, 'second.png');
    const retainedBundlePath = writeArtifactBundleForBackup(thirdBackup, 'third.png');

    const report = await cleanupArtifactBackupBundles(root, 1);

    const remainingJson = fs.readdirSync(root).filter(name => name.endsWith('.json'));
    const remainingBundles = fs.readdirSync(root).filter(name => name.endsWith('_artifacts'));

    expect(remainingJson).toHaveLength(3);
    expect(remainingBundles).toEqual([path.basename(retainedBundlePath)]);
    expect(report.removedArtifactBundles).toBe(2);
    expect(report.freedBytes).toBeGreaterThan(0);
    expect(report.retainedArtifactBundlePaths).toEqual([retainedBundlePath]);
  });

  it('creates artifact bundles only when explicitly requested and excludes ocr-debug', async () => {
    const root = makeTempDir();
    tempDirs.push(root);

    const dbPath = path.join(root, 'wildgate_db.json');
    const backupDir = path.join(root, 'Backups');
    const userDataDir = path.join(root, 'userData');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify({ ok: true }), 'utf8');
    fs.mkdirSync(path.join(userDataDir, 'match_artifacts'), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, 'screenshots'), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, 'ocr-debug'), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, 'telemetry_archive'), { recursive: true });
    fs.writeFileSync(path.join(userDataDir, 'match_artifacts', 'capture.png'), 'match', 'utf8');
    fs.writeFileSync(path.join(userDataDir, 'screenshots', 'screen.png'), 'screen', 'utf8');
    fs.writeFileSync(path.join(userDataDir, 'ocr-debug', 'debug.png'), 'debug', 'utf8');
    fs.writeFileSync(path.join(userDataDir, 'telemetry_archive', 'event.json'), '{}', 'utf8');

    const jsonOnly = await createDbBackup(dbPath, backupDir, 'manual');
    expect(jsonOnly.success).toBe(true);
    expect(jsonOnly.bundlePath).toBeUndefined();

    await new Promise(resolve => setTimeout(resolve, 5));

    const fullBackup = await createDbBackup(dbPath, backupDir, 'manual', {
      includeArtifacts: true,
      userDataDir,
    });
    expect(fullBackup.success).toBe(true);
    expect(fullBackup.bundlePath).toBeTruthy();
    expect(fs.existsSync(path.join(fullBackup.bundlePath, 'match_artifacts'))).toBe(true);
    expect(fs.existsSync(path.join(fullBackup.bundlePath, 'screenshots'))).toBe(true);
    expect(fs.existsSync(path.join(fullBackup.bundlePath, 'telemetry_archive'))).toBe(true);
    expect(fs.existsSync(path.join(fullBackup.bundlePath, 'ocr-debug'))).toBe(false);

    const manifest = JSON.parse(fs.readFileSync(path.join(fullBackup.bundlePath, 'manifest.json'), 'utf8'));
    expect(manifest.copiedFolders).toEqual(expect.arrayContaining(['match_artifacts', 'screenshots', 'telemetry_archive']));
    expect(manifest.copiedFolders).not.toContain('ocr-debug');
  });
});
