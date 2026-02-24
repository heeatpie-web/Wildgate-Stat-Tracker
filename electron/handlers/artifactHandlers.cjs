/**
 * @module electron/handlers/artifactHandlers
 * IPC handlers for match artifact bundling, listing, add/remove.
 * Registered from main process via registerArtifactHandlers().
 */
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const artifactRelinker = require('../helpers/artifactRelinker.cjs');
const artifactPathResolver = require('../helpers/artifactPathResolver.cjs');
const {
  ok,
  fail,
  internal,
  IpcErrorCode,
  validatePathInRoots,
  validatePositiveInt,
  validateBase64PayloadSize,
  validateAllowedExtension,
  createScopedTokenRegistry,
} = require('../security/ipcValidation.cjs');

const MAX_SCREENSHOT_BYTES = Number(process.env.WILDGATE_MAX_SCREENSHOT_BYTES || (15 * 1024 * 1024));
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);
const artifactTokenRegistry = createScopedTokenRegistry({
  ttlMs: Number(process.env.WILDGATE_ARTIFACT_TOKEN_TTL_MS || (5 * 60 * 1000)),
  maxEntriesPerScope: Number(process.env.WILDGATE_ARTIFACT_TOKEN_MAX || 10000),
});
const blockedSecurityCounters = new Map();
const MATCH_ARTIFACT_REL_PATTERN = /match_artifacts[\\/](\d+)[\\/](.+)$/i;

function recordSecurityBlock(channel, code, message) {
  const key = `${channel}:${code}`;
  const count = (blockedSecurityCounters.get(key) || 0) + 1;
  blockedSecurityCounters.set(key, count);
  console.warn(`[Security][Blocked][${channel}] code=${code} count=${count} message="${message}"`);
}

const getArtifactScope = (webContentsId, matchId) => `artifact:${String(webContentsId)}:${String(matchId)}`;

const normalizeArtifactPath = (value) => String(value || '').trim().replace(/[\\/]+/g, '\\');

const toArtifactFilenameKey = (value) => {
  const normalized = normalizeArtifactPath(value);
  if (!normalized) return '';
  return (normalized.split('\\').pop() || '').toLowerCase();
};

const parseGetMatchArtifactsPayload = (payload) => {
  if (typeof payload === 'number') return { matchId: payload, fallbackImages: [] };
  if (!payload || typeof payload !== 'object') return { matchId: 0, fallbackImages: [] };
  const matchId = Number(payload.matchId || 0);
  const fallbackImages = Array.isArray(payload.fallbackImages)
    ? payload.fallbackImages.filter((entry) => typeof entry === 'string')
    : [];
  return { matchId, fallbackImages };
};

const buildFallbackArtifactCandidates = ({ fallbackImages, matchArtifactsRoot, matchId, canonicalMatchNumber }) => {
  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidatePath) => {
    const normalized = normalizeArtifactPath(candidatePath);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(normalized);
  };

  fallbackImages.forEach((rawPath) => {
    const normalizedFallback = normalizeArtifactPath(rawPath);
    if (!normalizedFallback) return;
    const filename = path.basename(normalizedFallback);
    const ext = path.extname(filename).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) return;

    const folderCandidates = new Set();
    const relMatch = normalizedFallback.match(MATCH_ARTIFACT_REL_PATTERN);
    if (relMatch?.[1]) folderCandidates.add(String(relMatch[1]));
    if (Number.isInteger(canonicalMatchNumber) && canonicalMatchNumber > 0) {
      folderCandidates.add(String(canonicalMatchNumber));
    }
    if (Number.isInteger(matchId) && matchId > 0) {
      folderCandidates.add(String(matchId));
    }

    let mapped = false;
    for (const folderName of folderCandidates) {
      const candidate = path.join(matchArtifactsRoot, folderName, filename);
      if (fs.existsSync(candidate)) {
        addCandidate(candidate);
        mapped = true;
        break;
      }
    }
    if (mapped) return;
  });

  return candidates;
};

function sanitizeRepairScope(scopePayload) {
  if (!scopePayload || typeof scopePayload !== 'object') return undefined;
  const normalized = {};
  const matchId = Number(scopePayload.matchId || 0);
  if (Number.isInteger(matchId) && matchId > 0) normalized.matchId = matchId;
  const startTime = Number(scopePayload.startTime || 0);
  if (Number.isFinite(startTime) && startTime > 0) normalized.startTime = startTime;
  const endTime = Number(scopePayload.endTime || 0);
  if (Number.isFinite(endTime) && endTime > 0) normalized.endTime = endTime;
  if (!normalized.matchId && !normalized.startTime && !normalized.endTime) return undefined;
  return normalized;
}

function getValidatedMatchDir(app, artifactHelpers, matchId, options = {}) {
  const idCheck = validatePositiveInt(matchId, 'matchId');
  if (!idCheck.success) return idCheck;

  const paths = artifactHelpers.getArtifactPaths(app);
  const resolved = artifactPathResolver.resolveMatchArtifactDir({
    userData: paths.userData,
    matchId: idCheck.data,
    mode: options.mode === 'write' ? 'write' : 'read',
  });
  const matchDir = resolved?.matchDir || path.join(paths.matchArtifactsRoot, idCheck.data.toString());
  const safePath = validatePathInRoots(matchDir, [paths.matchArtifactsRoot], { isDev: !app.isPackaged });
  if (!safePath.success) return safePath;
  return ok({
    matchId: idCheck.data,
    matchDir,
    folderName: resolved?.folderName || path.basename(matchDir),
    canonicalMatchNumber: resolved?.canonicalMatchNumber || null,
    paths,
  });
}

/**
 * Register artifact-related IPC handlers.
 * @param {import('electron').IpcMain} ipcMain
 * @param {{ app: import('electron').App, getWin: () => import('electron').BrowserWindow | null, artifactHelpers: typeof import('../helpers/artifactHelpers.cjs'), gcloudSyncService: import('../gcloudSyncService.cjs') }} ctx
 */
function registerArtifactHandlers(ipcMain, ctx) {
  const { app, getWin, artifactHelpers, gcloudSyncService } = ctx;

  ipcMain.handle('bundle-artifacts', async (event, { matchId, startTime, endTime }) => {
    try {
      const validated = getValidatedMatchDir(app, artifactHelpers, matchId, { mode: 'write' });
      if (!validated.success) return [];
      const { paths, matchDir, folderName } = validated.data;
      if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });

      const bundledNames = new Set();
      const bundledSizes = new Set();
      const state = {
        bundledNames,
        bundledSizes,
        onCopy: (srcPath, destPath, file) => {
          if (gcloudSyncService.isInitialized) {
            return gcloudSyncService.uploadFile(destPath, `match_artifacts/${folderName}/${file}`)
              .then(r => { if (!r.success) console.warn(`[GCloud] Artifact upload failed: ${r.error}`); })
              .catch(err => console.warn(`[GCloud] Artifact upload error: ${err.message}`));
          }
        },
      };

      const fromScreenshots = await artifactHelpers.scanDirForImagesInWindow(paths.screenshotsDir, matchDir, startTime, endTime, state);
      const fromOcrDebug = await artifactHelpers.scanDirForImagesInWindow(paths.ocrDebugDir, matchDir, startTime, endTime, state);
      const bundledImages = [...fromScreenshots, ...fromOcrDebug];

      const telemetryCount = await artifactHelpers.copyTelemetryInWindow(paths.telemetryArchiveDir, matchDir, startTime, endTime);

      console.log(`[Artifacts] Bundled ${bundledImages.length} images + ${telemetryCount} telemetry files for match ${validated.data.matchId}`);
      return bundledImages;
    } catch (e) {
      console.error("Artifact Bundling Error", e);
      return [];
    }
  });

  ipcMain.handle('get-match-artifacts', async (event, payload) => {
    try {
      const parsed = parseGetMatchArtifactsPayload(payload);
      const validated = getValidatedMatchDir(app, artifactHelpers, parsed.matchId, { mode: 'read' });
      if (!validated.success) {
        recordSecurityBlock('get-match-artifacts', validated.code, validated.message);
        return ok({ images: [], imageFiles: [], telemetry: [] });
      }
      const {
        matchDir,
        matchId: safeMatchId,
        canonicalMatchNumber,
        paths,
      } = validated.data;
      const fallbackCandidates = buildFallbackArtifactCandidates({
        fallbackImages: parsed.fallbackImages,
        matchArtifactsRoot: paths.matchArtifactsRoot,
        matchId: safeMatchId,
        canonicalMatchNumber,
      });
      if (!fs.existsSync(matchDir)) {
        return ok({ images: fallbackCandidates, imageFiles: [], telemetry: [] });
      }

      const files = await fsPromises.readdir(matchDir);
      const images = [];
      const imageFiles = [];
      const telemetry = [];
      const scope = getArtifactScope(event.sender.id, safeMatchId);
      const imageByFilename = new Map();

      for (const f of files) {
        const fullPath = path.join(matchDir, f);
        const ext = path.extname(f).toLowerCase();
        if (ext === '.json') {
          try {
            const content = JSON.parse(await fsPromises.readFile(fullPath, 'utf-8'));
            telemetry.push(content);
          } catch (e) { /* skip unparseable */ }
        } else if (IMAGE_EXTENSIONS.has(ext)) {
          images.push(fullPath);
          imageByFilename.set(toArtifactFilenameKey(fullPath), fullPath);
          const artifactId = artifactTokenRegistry.issue(scope, { filename: f, fullPath });
          imageFiles.push({ artifactId, filename: f, path: fullPath });
        }
      }
      for (const fallbackPath of fallbackCandidates) {
        const filenameKey = toArtifactFilenameKey(fallbackPath);
        if (!filenameKey) continue;
        if (imageByFilename.has(filenameKey)) continue;
        images.push(fallbackPath);
        imageByFilename.set(filenameKey, fallbackPath);
      }
      return ok({ images, imageFiles, telemetry });
    } catch (e) {
      return internal('Failed to load artifacts');
    }
  });

  ipcMain.handle('list-match-artifacts', async () => {
    try {
      const paths = artifactHelpers.getArtifactPaths(app);
      const baseDir = paths.matchArtifactsRoot;
      if (!fs.existsSync(baseDir)) return [];

      const entries = await fsPromises.readdir(baseDir, { withFileTypes: true });
      const imageExts = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);
      const byMatchId = new Map();

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

        const resolvedId = artifactPathResolver.resolveMatchIdForFolder(paths.userData, Number(dirName));
        const matchId = Number(resolvedId || dirName);
        if (!byMatchId.has(matchId)) byMatchId.set(matchId, []);
        byMatchId.get(matchId).push(...images);
      }

      return Array.from(byMatchId.entries()).map(([id, images]) => ({ id, images }));
    } catch (e) {
      console.error('[Artifacts] list-match-artifacts error:', e.message || e);
      return [];
    }
  });

  ipcMain.handle('artifact-repair-preview', async (event, scopePayload) => {
    try {
      const userData = app.getPath('userData');
      const dbPath = path.join(userData, 'wildgate_db.json');
      const scope = sanitizeRepairScope(scopePayload);
      return artifactRelinker.previewArtifactRepair({ dbPath, userData, scope });
    } catch (e) {
      return {
        summary: { mode: 'preview', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0 },
        candidates: [],
        error: e?.message || 'Artifact repair preview failed',
      };
    }
  });

  ipcMain.handle('artifact-repair-apply', async (event, scopePayload) => {
    try {
      const userData = app.getPath('userData');
      const dbPath = path.join(userData, 'wildgate_db.json');
      const scope = sanitizeRepairScope(scopePayload);
      return artifactRelinker.applyArtifactRepair({ dbPath, userData, scope });
    } catch (e) {
      return {
        summary: { mode: 'apply', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0, appliedLinks: 0, updatedMatches: 0 },
        candidates: [],
        applied: [],
        error: e?.message || 'Artifact repair apply failed',
      };
    }
  });

  ipcMain.handle('remove-match-artifact', async (event, { matchId, artifactId }) => {
    try {
      const validated = getValidatedMatchDir(app, artifactHelpers, matchId, { mode: 'read' });
      if (!validated.success) {
        recordSecurityBlock('remove-match-artifact', validated.code, validated.message);
        return validated;
      }
      const { matchDir, matchId: safeMatchId } = validated.data;
      if (typeof artifactId !== 'string' || !artifactId.trim()) {
        recordSecurityBlock('remove-match-artifact', IpcErrorCode.INVALID_INPUT, 'artifactId required');
        return fail(IpcErrorCode.INVALID_INPUT, 'artifactId required');
      }
      const scope = getArtifactScope(event.sender.id, safeMatchId);
      const resolved = artifactTokenRegistry.resolve(scope, artifactId);
      if (!resolved || typeof resolved.filename !== 'string') {
        recordSecurityBlock('remove-match-artifact', IpcErrorCode.INVALID_INPUT, 'Invalid or expired artifactId');
        return fail(IpcErrorCode.INVALID_INPUT, 'Invalid or expired artifactId');
      }
      const filePath = path.join(matchDir, resolved.filename);
      const pathCheck = validatePathInRoots(filePath, [matchDir], { isDev: !app.isPackaged });
      if (!pathCheck.success) {
        recordSecurityBlock('remove-match-artifact', pathCheck.code, pathCheck.message);
        return pathCheck;
      }
      if (fs.existsSync(filePath)) {
        await fsPromises.unlink(filePath);
        console.log(`[Artifacts] Removed ${resolved.filename} from match ${safeMatchId}`);
        return ok({ removed: resolved.filename });
      }
      return fail(IpcErrorCode.NOT_FOUND, 'File not found');
    } catch (e) {
      console.error('[Artifacts] Remove error:', e.message);
      return internal('Failed to remove artifact');
    }
  });

  ipcMain.handle('add-match-artifact', async (event, { matchId }) => {
    try {
      const validated = getValidatedMatchDir(app, artifactHelpers, matchId, { mode: 'write' });
      if (!validated.success) return validated;
      const { matchDir, matchId: safeMatchId } = validated.data;
      const { dialog } = require('electron');
      const win = getWin();
      const result = await dialog.showOpenDialog(win || undefined, {
        title: 'Add Screenshot to Match',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
        properties: ['openFile', 'multiSelections'],
      });
      if (result.canceled || result.filePaths.length === 0) return ok({ canceled: true, added: [] });
      if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });

      const added = [];
      for (const srcPath of result.filePaths) {
        const extCheck = validateAllowedExtension(srcPath, IMAGE_EXTENSIONS, 'artifact');
        if (!extCheck.success) continue;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const destName = `added_${timestamp}_${path.basename(srcPath)}`;
        const destPath = path.join(matchDir, destName);
        await fsPromises.copyFile(srcPath, destPath);
        added.push(destPath);
        console.log(`[Artifacts] Added ${destName} to match ${safeMatchId}`);
      }
      return ok({ added, canceled: false });
    } catch (e) {
      console.error('[Artifacts] Add error:', e.message);
      return internal('Failed to add artifact');
    }
  });

  ipcMain.handle('save-screenshot', async (event, { imageBase64, matchId }) => {
    try {
      if (!imageBase64 || imageBase64.length < 100) {
        recordSecurityBlock('save-screenshot', IpcErrorCode.INVALID_INPUT, 'Invalid image data');
        return fail(IpcErrorCode.INVALID_INPUT, 'Invalid image data');
      }
      const sizeCheck = validateBase64PayloadSize(imageBase64, MAX_SCREENSHOT_BYTES, 'image payload');
      if (!sizeCheck.success) {
        recordSecurityBlock('save-screenshot', sizeCheck.code, sizeCheck.message);
        return sizeCheck;
      }
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `capture_${timestamp}.png`;

      const paths = artifactHelpers.getArtifactPaths(app);
      let destDir = paths.screenshotsDir;
      if (matchId != null) {
        const validated = getValidatedMatchDir(app, artifactHelpers, matchId, { mode: 'write' });
        if (!validated.success) {
          recordSecurityBlock('save-screenshot', validated.code, validated.message);
          return validated;
        }
        destDir = validated.data.matchDir;
      }
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const filePath = path.join(destDir, filename);
      await fsPromises.writeFile(filePath, imageBuffer);
      console.log(`[Screenshot] Saved ${filename} (${(imageBuffer.length / 1024).toFixed(1)}KB) to ${destDir}`);

      return ok({ filePath, filename, size: imageBuffer.length });
    } catch (e) {
      console.error('[Screenshot] Save error:', e.message);
      return internal('Failed to save screenshot');
    }
  });
}

module.exports = { registerArtifactHandlers };
