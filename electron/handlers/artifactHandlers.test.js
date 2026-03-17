import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { registerArtifactHandlers } = require('./artifactHandlers.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-handlers-'));
}

function writeImage(filePath, payload = 'image-data') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload);
}

function createIpcMainHarness() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
}

function createArtifactContext(rootDir) {
  return {
    app: {
      isPackaged: false,
    },
    getWin: () => null,
    artifactHelpers: {
      getArtifactPaths: () => ({
        userData: rootDir,
        matchArtifactsRoot: path.join(rootDir, 'match_artifacts'),
        screenshotsDir: path.join(rootDir, 'screenshots'),
        ocrDebugDir: path.join(rootDir, 'ocr-debug'),
        telemetryArchiveDir: path.join(rootDir, 'telemetry'),
      }),
    },
  };
}

describe('artifactHandlers token-backed fallback artifacts', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removes fallback artifacts using the token fullPath instead of the active match folder', async () => {
    const rootDir = makeTempDir();
    tempDirs.push(rootDir);
    const activeMatchDir = path.join(rootDir, 'match_artifacts', '12');
    const fallbackPath = path.join(rootDir, 'match_artifacts', '77', 'shot_2.png');
    fs.mkdirSync(activeMatchDir, { recursive: true });
    writeImage(fallbackPath, 'fallback-image');

    const ipcMain = createIpcMainHarness();
    registerArtifactHandlers(ipcMain, createArtifactContext(rootDir));
    const getArtifacts = ipcMain.handlers.get('get-match-artifacts');
    const removeArtifact = ipcMain.handlers.get('remove-match-artifact');
    const event = { sender: { id: 501 } };

    const listed = await getArtifacts(event, { matchId: 12, fallbackImages: [fallbackPath] });
    expect(listed.success).toBe(true);
    expect(listed.data.imageFiles).toHaveLength(1);

    const artifactId = listed.data.imageFiles[0].artifactId;
    const result = await removeArtifact(event, { matchId: 12, artifactId });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: { removed: 'shot_2.png' },
    }));
    expect(fs.existsSync(fallbackPath)).toBe(false);
  });

  it('reassigns fallback artifacts using the token fullPath instead of the active match folder', async () => {
    const rootDir = makeTempDir();
    tempDirs.push(rootDir);
    const activeMatchDir = path.join(rootDir, 'match_artifacts', '12');
    const targetMatchDir = path.join(rootDir, 'match_artifacts', '88');
    const fallbackPath = path.join(rootDir, 'match_artifacts', '77', 'shot_2.png');
    fs.mkdirSync(activeMatchDir, { recursive: true });
    writeImage(fallbackPath, 'fallback-image');

    const ipcMain = createIpcMainHarness();
    registerArtifactHandlers(ipcMain, createArtifactContext(rootDir));
    const getArtifacts = ipcMain.handlers.get('get-match-artifacts');
    const reassignArtifact = ipcMain.handlers.get('reassign-match-artifact');
    const event = { sender: { id: 502 } };

    const listed = await getArtifacts(event, { matchId: 12, fallbackImages: [fallbackPath] });
    expect(listed.success).toBe(true);
    expect(listed.data.imageFiles).toHaveLength(1);

    const artifactId = listed.data.imageFiles[0].artifactId;
    const result = await reassignArtifact(event, {
      sourceMatchId: 12,
      targetMatchId: 88,
      artifactId,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      sourceMatchId: 12,
      targetMatchId: 88,
      sourcePath: fallbackPath,
      targetPath: path.join(targetMatchDir, 'shot_2.png'),
      filename: 'shot_2.png',
    }));
    expect(fs.existsSync(fallbackPath)).toBe(false);
    expect(fs.existsSync(path.join(targetMatchDir, 'shot_2.png'))).toBe(true);
  });

  it('removes canonical-folder artifacts in one bulk operation', async () => {
    const rootDir = makeTempDir();
    tempDirs.push(rootDir);
    const matchId = 1773289658010;
    const canonicalNumber = 193;
    const canonicalDir = path.join(rootDir, 'match_artifacts', String(canonicalNumber));
    const artifactPath = path.join(canonicalDir, 'shot.png');
    fs.writeFileSync(path.join(rootDir, 'wildgate_db.json'), JSON.stringify({
      matches: [{ id: matchId, canonicalMatchNumber: canonicalNumber }],
      storageMeta: { nextCanonicalMatchNumber: canonicalNumber + 1 },
    }));
    writeImage(artifactPath, 'canonical-image');

    const ipcMain = createIpcMainHarness();
    registerArtifactHandlers(ipcMain, createArtifactContext(rootDir));
    const removeAllArtifacts = ipcMain.handlers.get('remove-all-match-artifacts');

    const result = await removeAllArtifacts({ sender: { id: 503 } }, { matchId });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: {
        removedPaths: [artifactPath],
        failedPaths: [],
      },
    }));
    expect(fs.existsSync(artifactPath)).toBe(false);
    expect(fs.existsSync(canonicalDir)).toBe(false);
  });

  it('removes artifacts by validated file path when the token is unavailable', async () => {
    const rootDir = makeTempDir();
    tempDirs.push(rootDir);
    const fallbackPath = path.join(rootDir, 'match_artifacts', '77', 'shot_3.png');
    writeImage(fallbackPath, 'fallback-image');

    const ipcMain = createIpcMainHarness();
    registerArtifactHandlers(ipcMain, createArtifactContext(rootDir));
    const removeArtifact = ipcMain.handlers.get('remove-match-artifact');

    const result = await removeArtifact({ sender: { id: 504 } }, {
      matchId: 12,
      artifactPath: fallbackPath,
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: { removed: 'shot_3.png' },
    }));
    expect(fs.existsSync(fallbackPath)).toBe(false);
  });
});
