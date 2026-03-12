import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanDirForImagesInWindow } from './artifactHelpers.cjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-helpers-'));
}

function writeImage(filePath, payload = 'image-data') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload);
}

describe('artifactHelpers.scanDirForImagesInWindow', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('copies staged screenshots and consumes the source file when requested', async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const screenshotsDir = path.join(root, 'screenshots');
    const matchDir = path.join(root, 'match_artifacts', '101');
    const fileName = 'capture_2026-03-08T10-00-00-000Z.png';
    const sourcePath = path.join(screenshotsDir, fileName);
    fs.mkdirSync(matchDir, { recursive: true });
    writeImage(sourcePath, 'capture-a');

    const copied = await scanDirForImagesInWindow(screenshotsDir, matchDir, 0, Date.now(), {
      bundledNames: new Set(),
      bundledSizes: new Set(),
      assignedCaptureNames: new Set(),
      consumeSource: true,
      onCopy: () => {},
    });

    expect(copied).toHaveLength(1);
    expect(fs.existsSync(path.join(matchDir, fileName))).toBe(true);
    expect(fs.existsSync(sourcePath)).toBe(false);
  });

  it('skips auto-captures already assigned to another match', async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const screenshotsDir = path.join(root, 'screenshots');
    const matchDir = path.join(root, 'match_artifacts', '102');
    const fileName = 'capture_2026-03-08T10-05-00-000Z.png';
    const sourcePath = path.join(screenshotsDir, fileName);
    writeImage(sourcePath, 'capture-b');

    const copied = await scanDirForImagesInWindow(screenshotsDir, matchDir, 0, Date.now(), {
      bundledNames: new Set(),
      bundledSizes: new Set(),
      assignedCaptureNames: new Set([fileName.toLowerCase()]),
      consumeSource: true,
      onCopy: () => {},
    });

    expect(copied).toEqual([]);
    expect(fs.existsSync(path.join(matchDir, fileName))).toBe(false);
    expect(fs.existsSync(sourcePath)).toBe(true);
  });

  it('bundles distinct same-size screenshots while skipping true duplicates', async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const screenshotsDir = path.join(root, 'screenshots');
    const matchDir = path.join(root, 'match_artifacts', '103');
    fs.mkdirSync(matchDir, { recursive: true });

    writeImage(path.join(screenshotsDir, 'capture_a.png'), 'same-size-A');
    writeImage(path.join(screenshotsDir, 'capture_b.png'), 'same-size-B');
    writeImage(path.join(screenshotsDir, 'capture_c.png'), 'same-size-A');

    const copied = await scanDirForImagesInWindow(screenshotsDir, matchDir, 0, Date.now(), {
      bundledNames: new Set(),
      bundledSizes: new Set(),
      assignedCaptureNames: new Set(),
      consumeSource: false,
      onCopy: () => {},
    });

    expect(copied).toHaveLength(2);

    const bundledPayloads = fs.readdirSync(matchDir)
      .map(fileName => fs.readFileSync(path.join(matchDir, fileName), 'utf8'))
      .sort();

    expect(bundledPayloads).toEqual(['same-size-A', 'same-size-B']);
  });
});
