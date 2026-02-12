/**
 * @module electron/handlers/artifactHandlers
 * IPC handlers for match artifact bundling, listing, add/remove.
 * Registered from main process via registerArtifactHandlers().
 */
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

/**
 * Register artifact-related IPC handlers.
 * @param {import('electron').IpcMain} ipcMain
 * @param {{ app: import('electron').App, getWin: () => import('electron').BrowserWindow | null, artifactHelpers: typeof import('../helpers/artifactHelpers.cjs'), gcloudSyncService: import('../gcloudSyncService.cjs') }} ctx
 */
function registerArtifactHandlers(ipcMain, ctx) {
  const { app, getWin, artifactHelpers, gcloudSyncService } = ctx;

  ipcMain.handle('bundle-artifacts', async (event, { matchId, startTime, endTime }) => {
    try {
      const paths = artifactHelpers.getArtifactPaths(app);
      const matchDir = path.join(paths.matchArtifactsRoot, matchId.toString());
      if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });

      const bundledNames = new Set();
      const bundledSizes = new Set();
      const state = {
        bundledNames,
        bundledSizes,
        onCopy: (srcPath, destPath, file) => {
          if (gcloudSyncService.isInitialized) {
            return gcloudSyncService.uploadFile(destPath, `match_artifacts/${matchId}/${file}`)
              .then(r => { if (!r.success) console.warn(`[GCloud] Artifact upload failed: ${r.error}`); })
              .catch(err => console.warn(`[GCloud] Artifact upload error: ${err.message}`));
          }
        },
      };

      const fromScreenshots = await artifactHelpers.scanDirForImagesInWindow(paths.screenshotsDir, matchDir, startTime, endTime, state);
      const fromOcrDebug = await artifactHelpers.scanDirForImagesInWindow(paths.ocrDebugDir, matchDir, startTime, endTime, state);
      const bundledImages = [...fromScreenshots, ...fromOcrDebug];

      const telemetryCount = await artifactHelpers.copyTelemetryInWindow(paths.telemetryArchiveDir, matchDir, startTime, endTime);

      console.log(`[Artifacts] Bundled ${bundledImages.length} images + ${telemetryCount} telemetry files for match ${matchId}`);
      return bundledImages;
    } catch (e) {
      console.error("Artifact Bundling Error", e);
      return [];
    }
  });

  ipcMain.handle('get-match-artifacts', async (event, matchId) => {
    try {
      const matchDir = path.join(artifactHelpers.getArtifactPaths(app).matchArtifactsRoot, matchId.toString());
      if (!fs.existsSync(matchDir)) return { images: [], imageFiles: [], telemetry: [] };

      const files = await fsPromises.readdir(matchDir);
      const images = [];
      const imageFiles = [];
      const telemetry = [];

      for (const f of files) {
        const fullPath = path.join(matchDir, f);
        const ext = path.extname(f).toLowerCase();
        if (ext === '.json') {
          try {
            const content = JSON.parse(await fsPromises.readFile(fullPath, 'utf-8'));
            telemetry.push(content);
          } catch (e) { /* skip unparseable */ }
        } else if (['.png', '.jpg', '.jpeg', '.bmp', '.webp'].includes(ext)) {
          images.push(fullPath);
          imageFiles.push({ filename: f, path: fullPath });
        }
      }
      return { images, imageFiles, telemetry };
    } catch (e) {
      return { images: [], imageFiles: [], telemetry: [] };
    }
  });

  ipcMain.handle('list-match-artifacts', async () => {
    try {
      const baseDir = artifactHelpers.getArtifactPaths(app).matchArtifactsRoot;
      if (!fs.existsSync(baseDir)) return [];

      const entries = await fsPromises.readdir(baseDir, { withFileTypes: true });
      const imageExts = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);
      const results = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirName = entry.name;
        if (!/^\d+$/.test(dirName)) continue;

        const dirPath = path.join(baseDir, dirName);
        let files = [];
        try {
          files = await fsPromises.readdir(dirPath);
        } catch {
          continue;
        }

        const images = files
          .filter(f => imageExts.has(path.extname(f).toLowerCase()))
          .map(f => path.join(dirPath, f));

        results.push({ id: Number(dirName), images });
      }

      return results;
    } catch (e) {
      console.error('[Artifacts] list-match-artifacts error:', e.message || e);
      return [];
    }
  });

  ipcMain.handle('remove-match-artifact', async (event, { matchId, filename }) => {
    try {
      const matchDir = path.join(artifactHelpers.getArtifactPaths(app).matchArtifactsRoot, matchId.toString());
      const filePath = path.join(matchDir, filename);
      if (fs.existsSync(filePath)) {
        await fsPromises.unlink(filePath);
        console.log(`[Artifacts] Removed ${filename} from match ${matchId}`);
        return { success: true };
      }
      return { success: false, error: 'File not found' };
    } catch (e) {
      console.error('[Artifacts] Remove error:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('add-match-artifact', async (event, { matchId }) => {
    try {
      const { dialog } = require('electron');
      const win = getWin();
      const result = await dialog.showOpenDialog(win || undefined, {
        title: 'Add Screenshot to Match',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
        properties: ['openFile', 'multiSelections'],
      });
      if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };

      const paths = artifactHelpers.getArtifactPaths(app);
      const matchDir = path.join(paths.matchArtifactsRoot, matchId.toString());
      if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });

      const added = [];
      for (const srcPath of result.filePaths) {
        const ext = path.extname(srcPath).toLowerCase();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const destName = `added_${timestamp}_${path.basename(srcPath)}`;
        const destPath = path.join(matchDir, destName);
        await fsPromises.copyFile(srcPath, destPath);
        added.push(destPath);
        console.log(`[Artifacts] Added ${destName} to match ${matchId}`);
      }
      return { success: true, added };
    } catch (e) {
      console.error('[Artifacts] Add error:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('save-screenshot', async (event, { imageBase64, matchId }) => {
    try {
      if (!imageBase64 || imageBase64.length < 100) {
        return { success: false, error: 'Invalid image data' };
      }
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `capture_${timestamp}.png`;

      const paths = artifactHelpers.getArtifactPaths(app);
      const destDir = matchId
        ? path.join(paths.matchArtifactsRoot, matchId.toString())
        : paths.screenshotsDir;
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const filePath = path.join(destDir, filename);
      await fsPromises.writeFile(filePath, imageBuffer);
      console.log(`[Screenshot] Saved ${filename} (${(imageBuffer.length / 1024).toFixed(1)}KB) to ${destDir}`);

      return { success: true, filePath, filename, size: imageBuffer.length };
    } catch (e) {
      console.error('[Screenshot] Save error:', e.message);
      return { success: false, error: e.message };
    }
  });
}

module.exports = { registerArtifactHandlers };
