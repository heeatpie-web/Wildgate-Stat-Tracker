const { app, BrowserWindow, shell, ipcMain, globalShortcut, Menu, Tray } = require('electron');
const { autoUpdater } = require('electron-updater');
const DiscordRPC = require('discord-rpc');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const fsPromises = require('fs').promises;
const { registerOCRHandlers, processCapture, runOCR } = require('./ocrHandler.cjs');
const gcloudService = require('./gcloudService.cjs');
const gcloudSyncService = require('./gcloudSyncService.cjs');
const geminiService = require('./geminiService.cjs');
const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.WILDGATE_DEV_SERVER_URL || 'http://localhost:5173';
const USER_DATA_ROOT = path.resolve(app.getPath('userData'));
const ALLOWED_FILE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif']);
const ALLOWED_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_EPIC_REQUEST_HOSTS = [
  'api.accelbyte.io',
  'services.accelbyte.io',
  'epicgames.com',
  'www.epicgames.com',
];
const EPIC_REQUEST_ALLOWED_HOSTS = new Set(
  (process.env.WILDGATE_ALLOWED_API_HOSTS || DEFAULT_EPIC_REQUEST_HOSTS.join(','))
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
);

function isPathWithinRoot(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isAllowedRendererPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return false;
  const resolved = path.resolve(inputPath);
  const roots = [
    USER_DATA_ROOT,
    path.resolve(path.join(app.getPath('documents'), 'Wildgate Stat Tracker')),
    path.resolve(path.join(app.getPath('home'), 'AppData', 'Local', 'Nebula', 'Saved', 'Logs')),
    path.resolve(path.join(app.getPath('home'), 'AppData', 'Local', 'Wildgate', 'Saved', 'Logs')),
  ];
  return roots.some(root => resolved === root || isPathWithinRoot(resolved, root));
}

function isAllowedEpicHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return Array.from(EPIC_REQUEST_ALLOWED_HOSTS).some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

function sanitizeForwardHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    const cleanKey = key.trim();
    if (!cleanKey) continue;
    if (/[\r\n]/.test(cleanKey) || /[\r\n]/.test(value)) continue;
    if (cleanKey.toLowerCase() === 'host') continue;
    safe[cleanKey] = value;
  }
  return safe;
}

// Force app name to match productName so app.getPath('userData') resolves
// to the same directory in both dev and production (e.g. "Wildgate Stat Tracker").
// Without this, dev mode uses the package "name" field which differs from productName.
if (isDev) {
  app.setName('Wildgate Stat Tracker');
}

const DEV_T0_MS = isDev ? Date.now() : 0;
function devMark(label) {
  if (!isDev) return;
  const dt = Date.now() - DEV_T0_MS;
  console.log(`[dev-timing] +${dt}ms ${label}`);
}

let win;
let tray = null;
let previousBounds = { width: 1200, height: 850 };
const DEFAULT_MIN_WINDOW_BOUNDS = { width: 1200, height: 768 };

function buildDevSplashDataUrl(targetUrl) {
  const safeUrl = String(targetUrl || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Wildgate Stat Tracker (Dev)</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        background: radial-gradient(circle at 30% 20%, rgba(56,189,248,0.20), transparent 45%),
                    radial-gradient(circle at 70% 10%, rgba(251,146,60,0.16), transparent 55%),
                    linear-gradient(180deg, rgba(8,12,18,1) 0%, rgba(5,8,12,1) 100%);
        color: rgba(255,255,255,0.86);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .card {
        width: min(560px, calc(100vw - 48px));
        padding: 18px 18px 16px;
        border-radius: 18px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.10);
        backdrop-filter: blur(14px);
        box-shadow: 0 20px 60px rgba(0,0,0,0.55);
      }
      .row { display: flex; align-items: center; gap: 12px; }
      .logo {
        width: 34px; height: 34px; border-radius: 12px;
        background: linear-gradient(135deg, rgba(56,189,248,1) 0%, rgba(251,146,60,1) 100%);
        display: grid; place-items: center;
        color: rgba(0,0,0,0.85);
        font-weight: 900;
      }
      h1 { margin: 0; font-size: 14px; letter-spacing: 0.14em; text-transform: uppercase; }
      .sub { margin-top: 10px; font-size: 12px; opacity: 0.75; line-height: 1.35; }
      .url {
        margin-top: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 11px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(0,0,0,0.32);
        border: 1px solid rgba(255,255,255,0.08);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .spinner {
        width: 14px; height: 14px;
        border-radius: 999px;
        border: 2px solid rgba(255,255,255,0.18);
        border-top-color: rgba(255,255,255,0.72);
        animation: spin 0.9s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .hint { margin-top: 10px; font-size: 11px; opacity: 0.55; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="row">
        <div class="logo">W</div>
        <div style="min-width:0;">
          <h1>Starting Dev Renderer</h1>
          <div class="sub row" style="margin-top:6px;">
            <div class="spinner"></div>
            <div>Waiting for Vite to be ready...</div>
          </div>
        </div>
      </div>
      <div class="url">${safeUrl}</div>
      <div class="hint">If this takes too long, check the Vite terminal output.</div>
    </div>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function probeUrlReady(urlString, timeoutMs = 450) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlString);
      const transport = u.protocol === 'https:' ? https : http;
      const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
      const req = transport.request(
        {
          method: 'GET',
          hostname: u.hostname,
          port,
          path: u.pathname && u.pathname !== '/' ? u.pathname : '/',
          timeout: timeoutMs,
          headers: {
            'Accept': 'text/html,*/*',
            'User-Agent': 'WildgateStatTrackerDevProbe',
            'Connection': 'close',
          },
        },
        (res) => {
          // Any response means the server is listening; no need to read the body.
          res.resume();
          resolve(true);
        }
      );

      req.on('timeout', () => {
        try { req.destroy(); } catch { }
        resolve(false);
      });
      req.on('error', () => resolve(false));
      req.end();
    } catch {
      resolve(false);
    }
  });
}

function startDevRendererWithRetry(win, targetUrl) {
  const url = targetUrl || DEV_SERVER_URL;
  const splashUrl = buildDevSplashDataUrl(url);

  let stopped = false;
  let inFlight = false;
  let attempt = 0;
  let retryTimer = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    try { win.webContents.removeListener('did-finish-load', onFinishLoad); } catch { }
  };

  const onFinishLoad = () => {
    try {
      const current = win.webContents.getURL() || '';
      if (current.startsWith(url)) {
        devMark(`dev URL loaded (attempt ${attempt})`);
        stop();
      }
    } catch { }
  };

  const tryLoad = async () => {
    if (stopped || inFlight || !win || win.isDestroyed()) return;
    inFlight = true;
    attempt += 1;

    try {
      const ready = await probeUrlReady(url);
      if (!ready) {
        const delay = Math.min(2000, 150 + (attempt * 125));
        inFlight = false;
        retryTimer = setTimeout(tryLoad, delay);
        return;
      }

      await win.loadURL(url);
      // stop() happens on did-finish-load once the dev URL successfully loads.
      inFlight = false;
    } catch {
      const delay = Math.min(2000, 150 + (attempt * 125));
      inFlight = false;
      retryTimer = setTimeout(tryLoad, delay);
    }
  };

  win.webContents.on('did-finish-load', onFinishLoad);
  win.on('closed', stop);
  // Show a friendly splash instead of the Chromium "failed to load" page.
  devMark('splash shown');
  win.loadURL(splashUrl).catch(() => { });
  retryTimer = setTimeout(tryLoad, 150);
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../public/favicon.png');
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show Dashboard', click: () => {
            if (win) {
              win.show();
              win.setSkipTaskbar(false);
              win.webContents.send('hotkey-toggle-overlay', false); // Ensure overlay is off
            }
          }
        },
        {
          label: 'Toggle Overlay (F9)', click: () => {
            if (win) {
              if (win.isVisible()) win.hide();
              else win.show();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit', click: () => {
            app.quit();
          }
        }
      ]);

      tray.setToolTip('Wildgate Stat Tracker');
      tray.setContextMenu(contextMenu);

      tray.on('double-click', () => {
        if (win) {
          if (win.isVisible()) win.hide();
          else win.show();
        }
      });
    } else {
      console.warn('Tray icon not found at:', iconPath);
    }
  } catch (e) {
    console.error('Failed to create tray:', e);
  }
}

// Database Path
const DB_FILENAME = 'wildgate_db.json';
const DB_PATH = path.join(app.getPath('userData'), DB_FILENAME);
const DB_TEMP_PATH = `${DB_PATH}.tmp`;
const DB_PREV_PATH = DB_PATH.replace('.json', '.prev.json');
const DB_WAL_PATH = DB_PATH.replace('.json', '.wal.json');
const DB_BACKUP_DIR = path.join(app.getPath('documents'), 'Wildgate Stat Tracker', 'Backups');
let lastAutoBackupAtMs = 0;

const LEGACY_APP_NAMES = ['Wildgate Stat Tracker', 'wildgate-stat-tracker', 'Wildgate Tracker'];
const LEGACY_APPDATA_ROOTS = [app.getPath('appData')];
if (process.platform === 'win32') {
  LEGACY_APPDATA_ROOTS.push(path.join(app.getPath('home'), 'AppData', 'Local'));
}
const LEGACY_DB_PATHS = LEGACY_APPDATA_ROOTS.flatMap(root =>
  LEGACY_APP_NAMES.map(name => path.join(root, name, DB_FILENAME))
);
const getDbCandidates = () => {
  const set = new Set([DB_PATH, DB_PREV_PATH, DB_TEMP_PATH, DB_WAL_PATH, ...LEGACY_DB_PATHS]);
  return Array.from(set);
};
const LOG_FILE_PATH = path.join(app.getPath('userData'), 'app_logs.txt');

async function listRecentBackups(limit = 12) {
  try {
    const entries = await fsPromises.readdir(DB_BACKUP_DIR);
    const files = entries
      .filter(f => f.toLowerCase().endsWith('.json') && f.toLowerCase().startsWith('backup_'))
      .map(f => path.join(DB_BACKUP_DIR, f));
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

async function pruneBackups(maxKeep = 40) {
  try {
    const recent = await listRecentBackups(9999);
    const extra = recent.slice(maxKeep);
    if (extra.length === 0) return;
    await Promise.all(extra.map(async p => {
      try { await fsPromises.unlink(p); } catch { /* ignore */ }
    }));
  } catch {
    // ignore
  }
}

async function createDbBackup(reason = 'auto') {
  try {
    if (!fs.existsSync(DB_BACKUP_DIR)) fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(DB_BACKUP_DIR, `backup_${timestamp}_${reason}.json`);
    if (!fs.existsSync(DB_PATH)) {
      return { success: false, error: 'No database file found to backup.' };
    }
    fs.copyFileSync(DB_PATH, backupPath);
    void pruneBackups();
    return { success: true, path: backupPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Artifact Bundling
ipcMain.handle('bundle-artifacts', async (event, { matchId, startTime, endTime }) => {
  try {
    const matchDir = path.join(app.getPath('userData'), 'match_artifacts', matchId.toString());
    if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });

    const bundledImages = [];
    const bundledNames = new Set(); // Deduplicate by filename
    const bundledSizes = new Set(); // Deduplicate by file size (catches same image with different names)

    // Helper: scan a directory for images matching the time window
    const scanDir = async (dir) => {
      if (!fs.existsSync(dir)) return;
      const files = await fsPromises.readdir(dir);
      const imageExts = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];
      for (const file of files) {
        if (bundledNames.has(file)) continue;
        const ext = path.extname(file).toLowerCase();
        if (!imageExts.includes(ext)) continue;
        const srcPath = path.join(dir, file);
        const stat = await fsPromises.stat(srcPath);
        const birthtime = stat.birthtimeMs || stat.mtimeMs;
        if (birthtime >= startTime - 5000 && birthtime <= endTime + 30000) {
          // Deduplicate by size — same screenshot saved to screenshots/ and ocr-debug/ will have identical size
          const sizeKey = `${stat.size}`;
          if (bundledSizes.has(sizeKey)) continue;
          const destPath = path.join(matchDir, file);
          await fsPromises.copyFile(srcPath, destPath);
          bundledImages.push(destPath);
          bundledNames.add(file);
          bundledSizes.add(sizeKey);

          // Upload to GCloud (fire-and-forget)
          if (gcloudSyncService.isInitialized) {
            gcloudSyncService.uploadFile(destPath, `match_artifacts/${matchId}/${file}`)
              .then(r => { if (!r.success) console.warn(`[GCloud] Artifact upload failed: ${r.error}`); })
              .catch(err => console.warn(`[GCloud] Artifact upload error: ${err.message}`));
          }
        }
      }
    };

    // Primary: screenshots saved by saveScreenshot (smart capture flow)
    await scanDir(path.join(app.getPath('userData'), 'screenshots'));
    // Fallback: legacy ocr-debug images (old capture flow)
    await scanDir(path.join(app.getPath('userData'), 'ocr-debug'));

    // Also bundle matching telemetry JSON files (not included in returned array — accessible via get-match-artifacts)
    let telemetryCount = 0;
    const telemetryDir = path.join(app.getPath('userData'), 'telemetry_archive');
    if (fs.existsSync(telemetryDir)) {
      const telemetryFiles = (await fsPromises.readdir(telemetryDir)).filter(f => f.endsWith('.json'));
      for (const file of telemetryFiles) {
        try {
          const srcPath = path.join(telemetryDir, file);
          const content = JSON.parse(await fsPromises.readFile(srcPath, 'utf-8'));
          const events = Array.isArray(content) ? content : (content.telemetry || []);
          const hasOverlap = events.some(e => {
            const t = e.ClientTimestamp || e.timestamp || e.EventTimestamp;
            return t && t >= startTime - 5000 && t <= endTime + 30000;
          });
          if (hasOverlap) {
            const destPath = path.join(matchDir, file);
            await fsPromises.copyFile(srcPath, destPath);
            telemetryCount++;
          }
        } catch (e) { /* skip unparseable files */ }
      }
    }

    console.log(`[Artifacts] Bundled ${bundledImages.length} images + ${telemetryCount} telemetry files for match ${matchId}`);
    return bundledImages;
  } catch (e) {
    console.error("Artifact Bundling Error", e);
    return [];
  }
});

ipcMain.handle('get-match-artifacts', async (event, matchId) => {
  try {
    const matchDir = path.join(app.getPath('userData'), 'match_artifacts', matchId.toString());
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
    const baseDir = path.join(app.getPath('userData'), 'match_artifacts');
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
    const matchDir = path.join(app.getPath('userData'), 'match_artifacts', matchId.toString());
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
    const result = await dialog.showOpenDialog(win, {
      title: 'Add Screenshot to Match',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };

    const matchDir = path.join(app.getPath('userData'), 'match_artifacts', matchId.toString());
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

// ─── Screenshot-first: save capture to disk without OCR ───
ipcMain.handle('save-screenshot', async (event, { imageBase64, matchId }) => {
  try {
    if (!imageBase64 || imageBase64.length < 100) {
      return { success: false, error: 'Invalid image data' };
    }
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `capture_${timestamp}.png`;

    let destDir;
    if (matchId) {
      destDir = path.join(app.getPath('userData'), 'match_artifacts', matchId.toString());
    } else {
      destDir = path.join(app.getPath('userData'), 'screenshots');
    }
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

ipcMain.handle('rerun-ocr-on-artifact', async (event, { imagePath, activeUser, ocrMode }) => {
  try {
    const fullPath = path.resolve(imagePath);
    if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' };
    const ext = path.extname(fullPath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.bmp', '.webp'].includes(ext)) {
      return { success: false, error: `Not an image file: ${ext}` };
    }
    const imageBuffer = await fsPromises.readFile(fullPath);
    const base64 = imageBuffer.toString('base64');
    // Pass sourceImagePath to skip duplicate debug save and cloud upload
    const result = await processCapture(base64, activeUser, null, ocrMode || 'both', { sourceImagePath: fullPath });
    return result;
  } catch (e) {
    console.error('[rerun-ocr] Error:', e.message);
    return { success: false, error: e.message || 'Unknown error' };
  }
});

// Log Persistence Handler
ipcMain.handle('persist-logs', async (event, logContent) => {
  try {
    const MAX_LOG_SIZE = 100 * 1024;
    let existing = '';
    try {
      existing = await fsPromises.readFile(LOG_FILE_PATH, 'utf-8');
    } catch (e) { /* File doesn't exist yet */ }

    const combined = existing + '\n--- SESSION ---\n' + logContent;
    const trimmed = combined.length > MAX_LOG_SIZE
      ? combined.slice(combined.length - MAX_LOG_SIZE)
      : combined;
    await fsPromises.writeFile(LOG_FILE_PATH, trimmed);
    return { success: true };
  } catch (e) {
    console.error('Failed to persist logs:', e);
    return { success: false, error: e.message };
  }
});
// Legacy Windows OCR - replaced by Tesseract.js in ocrHandler.cjs
// const { recognizeBatchFromPath } = require('node-windows-ocr');
// ipcMain.handle('ocr-scan', async (event, imagePath) => {
//   try {
//     if (!fs.existsSync(imagePath)) throw new Error(`File not found: ${imagePath}`);
//     const results = await recognizeBatchFromPath([imagePath]);
//     return results[0]?.Result;
//   } catch (e) {
//     console.error('[OCR] Native Scan Error:', e);
//     throw e;
//   }
// });

// OCR Scan (compatibility for scan pipeline)
ipcMain.handle('ocr-scan', async (event, imagePath) => {
  try {
    if (!fs.existsSync(imagePath)) throw new Error(`File not found: ${imagePath}`);
    const buffer = await fsPromises.readFile(imagePath);
    return await runOCR(buffer);
  } catch (e) {
    console.error('[OCR] Scan Error:', e);
    throw e;
  }
});

// Database Handlers
async function fsyncDirBestEffort(dirPath) {
  try {
    const dirHandle = await fsPromises.open(dirPath, 'r');
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  } catch {
    // Not supported on all platforms/filesystems.
  }
}

async function writeFileDurableAtomic(filePath, payload) {
  const tempPath = `${filePath}.tmp`;
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });

  const fileHandle = await fsPromises.open(tempPath, 'w');
  try {
    await fileHandle.writeFile(payload, 'utf-8');
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }

  await fsPromises.rename(tempPath, filePath);
  await fsyncDirBestEffort(path.dirname(filePath));
}

async function writeWalDurable(data) {
  const walPayload = JSON.stringify({
    version: 1,
    createdAt: Date.now(),
    data
  }, null, 2);
  await writeFileDurableAtomic(DB_WAL_PATH, walPayload);
}

async function clearWalBestEffort() {
  try {
    await fsPromises.unlink(DB_WAL_PATH);
    await fsyncDirBestEffort(path.dirname(DB_WAL_PATH));
  } catch {
    // Already gone or unavailable.
  }
}

async function replayWalIfPresent() {
  try {
    await fsPromises.access(DB_WAL_PATH);
  } catch {
    return null;
  }

  try {
    const walRaw = await fsPromises.readFile(DB_WAL_PATH, 'utf-8');
    const wal = JSON.parse(walRaw);
    if (!wal || typeof wal !== 'object' || !wal.data) throw new Error('Invalid WAL payload');
    const payload = JSON.stringify(wal.data, null, 2);
    await writeFileDurableAtomic(DB_PATH, payload);
    await clearWalBestEffort();
    console.log('[DB] WAL replay successful');
    return wal.data;
  } catch (e) {
    console.error('[DB] WAL replay failed:', e);
    return null;
  }
}

ipcMain.handle('db-read', async () => {
  try {
    const replayed = await replayWalIfPresent();
    if (replayed) return replayed;

    const candidates = getDbCandidates();
    // Extra safety: if the main DB is corrupt/missing, try the newest backups too.
    try {
      const backups = await listRecentBackups(12);
      for (const b of backups) candidates.push(b);
    } catch { /* ignore */ }

    for (const candidate of candidates) {
      try {
        await fsPromises.access(candidate);
      } catch {
        continue;
      }
      try {
        const content = await fsPromises.readFile(candidate, 'utf-8');
        const parsed = JSON.parse(content);
        if (candidate !== DB_PATH && candidate !== DB_WAL_PATH) {
          await fsPromises.mkdir(path.dirname(DB_PATH), { recursive: true });
          await fsPromises.copyFile(candidate, DB_PATH);
          console.log(`[DB] Recovered/migrated DB from ${candidate} -> ${DB_PATH}`);
        }
        return parsed;
      } catch (e) {
        console.error(`[DB] Read/parse error for ${candidate}:`, e);
      }
    }
    if (isDev) {
      console.warn(`[DB] No database found. Searched: ${candidates.join(', ')}`);
    }
    return null;
  } catch (e) {
    console.error("DB Read Error", e);
    return null;
  }
});

ipcMain.handle('db-write', async (event, data) => {
  try {
    // 1) Persist WAL first so a crash before DB write can still recover.
    await writeWalDurable(data);

    // 2) Safety: keep previous DB version for manual recovery.
    try {
      await fsPromises.access(DB_PATH);
      await fsPromises.copyFile(DB_PATH, DB_PREV_PATH);
    } catch { /* No existing DB to back up - first write */ }

    // 3) Durable atomic DB commit.
    const payload = JSON.stringify(data, null, 2);
    await writeFileDurableAtomic(DB_PATH, payload);

    // 4) WAL no longer needed after successful DB commit.
    await clearWalBestEffort();

    // 5) Throttled rolling backups (protect against userData corruption / accidental edits).
    const now = Date.now();
    if (now - lastAutoBackupAtMs > 5 * 60 * 1000) { // 5 minutes
      lastAutoBackupAtMs = now;
      void createDbBackup('rolling');
    }
    return true;
  } catch (e) {
    console.error("DB Write Error", e);
    try {
      await fsPromises.unlink(DB_TEMP_PATH);
    } catch (unlinkErr) {
      console.error("Failed to cleanup temp file", unlinkErr);
    }
    // Intentionally keep WAL for next startup replay.
    return false;
  }
});

// Window Control Handlers
ipcMain.on('window-minimize', () => {
  if (win) win.minimize();
});

ipcMain.on('window-maximize', () => {
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (win) win.close();
});

ipcMain.handle('db-backup', () => {
  return createDbBackup('manual');
});

ipcMain.handle('epic-request', async (event, payload = {}) => {
  try {
    const {
      url,
      method = 'GET',
      headers = {},
      body = undefined,
    } = payload || {};

    if (typeof url !== 'string' || !url.trim()) {
      return { ok: false, status: 400, statusText: 'Bad Request', error: 'Invalid URL' };
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, status: 400, statusText: 'Bad Request', error: 'Malformed URL' };
    }

    if (parsed.protocol !== 'https:') {
      return { ok: false, status: 400, statusText: 'Bad Request', error: 'HTTPS required' };
    }

    if (!isAllowedEpicHost(parsed.hostname)) {
      return { ok: false, status: 403, statusText: 'Forbidden', error: `Host not allowed: ${parsed.hostname}` };
    }

    const normalizedMethod = String(method || 'GET').toUpperCase();
    if (!ALLOWED_HTTP_METHODS.has(normalizedMethod)) {
      return { ok: false, status: 400, statusText: 'Bad Request', error: `Method not allowed: ${normalizedMethod}` };
    }

    let requestBody = undefined;
    if (body !== undefined && body !== null) {
      if (typeof body === 'string') requestBody = body;
      else if (typeof body === 'object') requestBody = JSON.stringify(body);
      else return { ok: false, status: 400, statusText: 'Bad Request', error: 'Invalid request body type' };
    }

    const safeHeaders = sanitizeForwardHeaders(headers);
    const fetchOptions = {
      method: normalizedMethod,
      headers: {
        'User-Agent': 'AccelByte-SDK',
        ...safeHeaders
      },
      body: requestBody
    };

    const response = await fetch(parsed.toString(), fetchOptions);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      statusText: response.statusText
    };
  } catch (error) {
    console.error("IPC Request Error:", error);
    return { ok: false, status: 0, statusText: 'Network Error', error: error.message };
  }
});

// Log Monitoring Logic
let LOG_PATH = '';
let logMonitorInterval = null;
let lastLogContent = null;

// Telemetry Archive Setup
const TELEMETRY_ARCHIVE_DIR = path.join(app.getPath('userData'), 'telemetry_archive');
const ARCHIVE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function ensureArchiveDir() {
  if (!fs.existsSync(TELEMETRY_ARCHIVE_DIR)) {
    fs.mkdirSync(TELEMETRY_ARCHIVE_DIR, { recursive: true });
  }
}

function cleanupOldArchives() {
  try {
    ensureArchiveDir();
    const files = fs.readdirSync(TELEMETRY_ARCHIVE_DIR);
    const now = Date.now();
    let cleaned = 0;

    files.forEach(file => {
      const filePath = path.join(TELEMETRY_ARCHIVE_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > ARCHIVE_MAX_AGE_MS) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    });

    if (cleaned > 0) console.log(`Cleaned up ${cleaned} old telemetry archives.`);
  } catch (e) {
    console.error('Archive cleanup error:', e);
  }
}

async function archiveTelemetry(data) {
  try {
    ensureArchiveDir();

    // 1. Extract a grouping ID (MatchId or sessionId)
    let matchId = 'session_global';
    const scanForId = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.matchId || obj.MatchId) { matchId = obj.matchId || obj.MatchId; return; }
      if (obj.sessionId || obj.SessionId) { matchId = obj.sessionId || obj.SessionId; return; }
      if (Array.isArray(obj)) { for (const item of obj) { scanForId(item); if (matchId !== 'session_global') break; } }
      else { for (const key in obj) { scanForId(obj[key]); if (matchId !== 'session_global') break; } }
    };
    scanForId(data);

    // 2. Sanitize match ID for filename
    const safeMatchId = matchId.toString().replace(/[^a-z0-9_-]/gi, '_');

    // 3. Append to a combined file for this match/session
    const archivePath = path.join(TELEMETRY_ARCHIVE_DIR, `match_${safeMatchId}.json`);

    let combinedData = [];
    if (fs.existsSync(archivePath)) {
      try {
        const content = fs.readFileSync(archivePath, 'utf8');
        combinedData = JSON.parse(content);
        if (!Array.isArray(combinedData)) combinedData = [combinedData];
      } catch (e) { combinedData = []; }
    }

    // Wrap single event in array if needed
    let newEvents = [];
    if (data.telemetry && Array.isArray(data.telemetry)) newEvents = data.telemetry;
    else if (Array.isArray(data)) newEvents = data;
    else newEvents = [data];

    // Deduplicate by signature within this combined file
    const existingSignatures = new Set(combinedData.map(e => `${e.ClientTimestamp}_${e.EventName}`));
    newEvents.forEach(e => {
      const sig = `${e.ClientTimestamp}_${e.EventName}`;
      if (!existingSignatures.has(sig)) {
        combinedData.push(e);
      }
    });

    // Sort and Write
    combinedData.sort((a, b) => (a.ClientTimestamp || 0) - (b.ClientTimestamp || 0));
    await fsPromises.writeFile(archivePath, JSON.stringify(combinedData, null, 2));

    // console.log(`[Archive] Combined telemetry for match ${matchId} (${combinedData.length} events total)`);
  } catch (e) {
    console.error('Failed to archive telemetry:', e);
  }
}

async function loadArchivedTelemetry() {
  try {
    ensureArchiveDir();
    const files = await fsPromises.readdir(TELEMETRY_ARCHIVE_DIR);
    const allEvents = [];

    await Promise.all(files.map(async (file) => {
      try {
        const filePath = path.join(TELEMETRY_ARCHIVE_DIR, file);
        const content = JSON.parse(await fsPromises.readFile(filePath, 'utf-8'));
        if (content.telemetry && Array.isArray(content.telemetry)) {
          allEvents.push(...content.telemetry);
        } else if (Array.isArray(content)) {
          allEvents.push(...content);
        } else if (content.EventName) {
          allEvents.push(content);
        }
      } catch (e) { /* Skip corrupted files */ }
    }));

    console.log(`Loaded ${allEvents.length} events from ${files.length} archived files.`);
    return allEvents;
  } catch (e) {
    console.error('Failed to load archived telemetry:', e);
    return [];
  }
}

// Optimization: Use Buffer for fast byte shifting + Async Chunking if needed
async function decodeLog() {
  try {
    if (!LOG_PATH) return { error: "Path not found" };

    try {
      await fsPromises.access(LOG_PATH);
    } catch {
      return { error: "Path not found" };
    }

    const stats = await fsPromises.stat(LOG_PATH);
    const MAX_READ_SIZE = 5 * 1024 * 1024; // Increased to 5MB
    if (stats.size > MAX_READ_SIZE) {
      return { error: "File too large to monitor safely" };
    }

    const buffer = await fsPromises.readFile(LOG_PATH);
    if (buffer.length === 0) return { error: "File empty" };

    // 1. Try direct JSON parse first
    try {
      const rawStr = buffer.toString('utf8');
      if (rawStr.trim().startsWith('[') || rawStr.trim().startsWith('{')) {
        return JSON.parse(rawStr);
      }
    } catch (e) { }

    // 2. Optimized Decoding (Buffer Manipulation)
    // Shift all bytes by +1
    const layer1Buf = Buffer.allocUnsafe(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      layer1Buf[i] = buffer[i] + 1;
    }

    let layer1Obj = null;
    try {
      layer1Obj = JSON.parse(layer1Buf.toString('utf8'));
    } catch (e) { }

    if (layer1Obj) {
      const abArray = layer1Obj.ArrayByte || layer1Obj.arrayByte;
      if (abArray && Array.isArray(abArray)) {
        // Double Decode Layer 2
        // abArray is bytes, we need to shift them +1 too?
        // Original code: layer2 += String.fromCharCode(b + 1);
        const layer2Buf = Buffer.allocUnsafe(abArray.length);
        for (let i = 0; i < abArray.length; i++) {
          layer2Buf[i] = abArray[i] + 1;
        }

        try {
          return JSON.parse(layer2Buf.toString('utf8'));
        } catch (e) {
          return { error: "Layer 2 JSON Parse Failed", rawHead: layer2Buf.toString('utf8', 0, 500) };
        }
      }
      return layer1Obj; // It was just 1 layer of encoding
    }

    return {
      error: "Format mismatch (Unknown Encoding)",
      rawHead: layer1Buf.toString('utf8', 0, 200)
    };
  } catch (e) {
    return { error: e.message };
  }
}

ipcMain.on('start-log-monitoring', () => {
  if (logMonitorInterval) clearInterval(logMonitorInterval);

  const localAppData = path.join(app.getPath('home'), 'AppData', 'Local');
  const pathNebula = path.join(localAppData, 'Nebula', 'Saved', 'Logs', 'AccelByteTelemetryCache');
  const pathWildgate = path.join(localAppData, 'Wildgate', 'Saved', 'Logs', 'AccelByteTelemetryCache');

  // Logic: Prefer Wildgate (Local) if exists, else Nebula (Game)
  if (fs.existsSync(pathNebula)) {
    LOG_PATH = pathNebula;
  } else if (fs.existsSync(pathWildgate)) {
    LOG_PATH = pathWildgate;
  } else {
    // If neither exists, check if we have a saved DECODED log to fallback on?
    // For now default to Nebula path to keep watching
    LOG_PATH = pathNebula;
  }

  console.log("Starting log monitoring...", LOG_PATH);

  // Initial status
  if (win) {
    win.webContents.send('log-status', {
      exists: fs.existsSync(LOG_PATH),
      path: LOG_PATH,
      lastCheck: Date.now()
    });
  }

  let lastMtime = 0;

  logMonitorInterval = setInterval(async () => {
    let stats = null;
    try {
      if (LOG_PATH) stats = await fsPromises.stat(LOG_PATH);
    } catch { }

    const exists = !!stats;

    // Only read if modified
    if (stats && stats.mtimeMs !== lastMtime) {
      lastMtime = stats.mtimeMs;

      const data = await decodeLog();
      const hasError = data && data.error;

      if (win) {
        win.webContents.send('log-status', {
          exists,
          path: LOG_PATH,
          size: stats.size,
          lastCheck: Date.now(),
          dataFound: !!(data && !hasError),
          error: hasError ? data.error : null,
          rawHead: data?.rawHead || null
        });


        if (data && !hasError) {
          const currentStr = JSON.stringify(data);
          // Also Send Data
          win.webContents.send('log-data', data);
          archiveTelemetry(data);

          // --- PERSISTENCE: Append-Only History ---
          (async () => {
            try {
              const permanentPath = path.join(app.getPath('userData'), 'telemetry_permanent_history.json');
              let history = [];
              try {
                history = JSON.parse(await fsPromises.readFile(permanentPath, 'utf-8'));
              } catch (e) {
                // File doesn't exist or is corrupt, start fresh
              }

              // Extract new events from the current batch
              let newEventsBatch = [];
              if (data.telemetry && Array.isArray(data.telemetry)) newEventsBatch = data.telemetry;
              else if (Array.isArray(data)) newEventsBatch = data;
              else if (data.EventName) newEventsBatch = [data];

              // Deduplicate: Only add events we haven't seen before
              // We use a composite key of (Timestamp + EventName) to identify uniqueness
              // This is efficient enough for moderate log sizes.
              const existingSignatures = new Set(history.map(e => `${e.ClientTimestamp}_${e.EventName}`));
              let addedCount = 0;

              newEventsBatch.forEach(e => {
                const sig = `${e.ClientTimestamp}_${e.EventName}`;
                if (!existingSignatures.has(sig)) {
                  history.push(e);
                  existingSignatures.add(sig); // Prevent duplicates within the same batch too
                  addedCount++;
                }
              });

              if (addedCount > 0) {
                // Sort by time just in case
                history.sort((a, b) => (a.ClientTimestamp || 0) - (b.ClientTimestamp || 0));

                // Save back
                await fsPromises.writeFile(permanentPath, JSON.stringify(history, null, 2));
                console.log(`[Persistence] Saved ${addedCount} new unique events.`);
              }
            } catch (err) {
              console.error("[Persistence] Failed to save history:", err);
            }
          })();
          // ----------------------------------------

          // Save Decoded Copy Automatically (Snapshot)
          // This satisfies the "Save Decoded" requirement
          try {
            const decodedSavePath = path.join(app.getPath('userData'), 'telemetry_latest_decoded.json');
            await fsPromises.writeFile(decodedSavePath, currentStr); // Save decoded JSON
          } catch (e) { console.error("Failed to save decoded logs", e); }
        }

      }
    } else if (!exists && win) {
      // Notify if lost file
      win.webContents.send('log-status', { exists: false, path: LOG_PATH, lastCheck: Date.now() });
    }
  }, 2000);
});

ipcMain.handle('load-archived-telemetry', async () => {
  return loadArchivedTelemetry();
});

ipcMain.on('stop-log-monitoring', () => {
  if (logMonitorInterval) {
    clearInterval(logMonitorInterval);
    logMonitorInterval = null;
  }
  console.log("Stopped log monitoring.");
});

ipcMain.handle('scan-epic-ids', async () => {
  if (!LOG_PATH) {
    const localAppData = path.join(app.getPath('home'), 'AppData', 'Local');
    const pathNebula = path.join(localAppData, 'Nebula', 'Saved', 'Logs', 'AccelByteTelemetryCache');
    const pathWildgate = path.join(localAppData, 'Wildgate', 'Saved', 'Logs', 'AccelByteTelemetryCache');
    LOG_PATH = fs.existsSync(pathWildgate) ? pathWildgate : pathNebula;
  }

  const ids = new Set();
  const mappings = {}; // accountId -> platformAccountId
  const names = {}; // ID -> Name harvested from logs
  let error = null;

  const data = await decodeLog();
  if (data && data.error) error = data.error;

  const findIds = (obj) => {
    if (!obj) return;
    if (typeof obj === 'string') {
      const idRegex = /"(?:accountId|platformAccountId|userId|id|platform_account_id)":"([a-f0-9-]{32,36})"/gi;
      let m;
      while ((m = idRegex.exec(obj)) !== null) ids.add(m[1].toLowerCase().replace(/-/g, ''));
    } else if (Array.isArray(obj)) {
      obj.forEach(findIds);
    } else if (typeof obj === 'object') {
      const ctx = obj.context?.client || obj.Payload?.context?.client || obj.client || obj;
      if (ctx && ctx.accountId && ctx.platformAccountId && ctx.accountId !== ctx.platformAccountId) {
        mappings[ctx.accountId.toLowerCase()] = ctx.platformAccountId.toLowerCase();
      }

      const possibleId = obj.accountId || obj.userId || obj.platformAccountId || obj.id || obj.u;
      const possibleName = obj.displayName || obj.userName || obj.nickName || obj.player_name || obj.playerName || obj.n || obj.nick;

      if (possibleId && typeof possibleId === 'string' && possibleName && typeof possibleName === 'string') {
        const cleanId = possibleId.toLowerCase().split('|').pop().replace(/-/g, '');
        if (cleanId.length >= 32) names[cleanId] = possibleName;
      }

      Object.keys(obj).forEach(k => findIds(obj[k]));
    }
  };

  // 1. Global Scan on ALL log files in the directory
  try {
    const logDir = path.dirname(LOG_PATH);
    if (fs.existsSync(logDir)) {
      // Async readdir
      const logFiles = (await fsPromises.readdir(logDir)).filter(f => f.endsWith('.log') || f.includes('Cache'));

      // Parallelize file reading (limit concurrency if needed, but 10-50 files is usually fine)
      await Promise.all(logFiles.map(async (file) => {
        try {
          const fullPath = path.join(logDir, file);
          const buffer = await fsPromises.readFile(fullPath);
          let iStr = '';

          if (file.includes('Telemetry') || file.includes('General')) {
            // Basic manual decoding for telemetry files
            for (let i = 0; i < Math.min(buffer.length, 1000000); i++) iStr += String.fromCharCode(buffer[i] + 1);
          } else {
            iStr = buffer.toString('utf8');
          }

          // Pattern: "id":"...", "name":"..." 
          const nameMapRegex = /"(?:accountId|userId|id|u)":"([a-f0-9-|]{32,70})".*?"(?:displayName|userName|playerName|n|nick)":"(.*?)"/gi;
          let m;
          while ((m = nameMapRegex.exec(iStr)) !== null) {
            const rawId = m[1].toLowerCase();
            const idParts = rawId.split('|').map(p => p.replace(/-/g, ''));
            const name = m[2];

            idParts.forEach(id => {
              if (id.length >= 32) {
                ids.add(id);
                if (name && name.length > 2) names[id] = name;
              }
            });
            // Also store the full piped ID if it matches
            if (rawId.includes('|')) ids.add(rawId);
          }

          // Flat pattern (UE4 log style)
          const flatRegex = /([a-f0-9]{32,36})[ \t:="]+([^ \n\r\t,"]{3,20})/gi;
          while ((m = flatRegex.exec(iStr)) !== null) {
            const id = m[1].toLowerCase().replace(/-/g, '');
            const name = m[2];
            if (id.length >= 32 && !names[id] && !id.startsWith('0000')) {
              names[id] = name;
            }
          }

          const idRegex = /"(?:accountId|platformAccountId|puid|platform_account_id)":"([a-f0-9-|]{32,70})"/gi;
          while ((m = idRegex.exec(iStr)) !== null) {
            const rawId = m[1].toLowerCase();
            rawId.split('|').forEach(p => ids.add(p.replace(/-/g, '')));
            if (rawId.includes('|')) ids.add(rawId);
          }
        } catch (fErr) { }
      }));
    }
  } catch (e) { console.error("Global Log Scan Error", e); }

  if (data && !error) findIds(data);

  try {
    const archivedEvents = await loadArchivedTelemetry();
    archivedEvents.forEach(e => {
      const clientCtx = e.context?.client || e.Payload?.context?.client;
      if (clientCtx?.accountId && clientCtx?.platformAccountId && clientCtx.accountId !== clientCtx.platformAccountId) {
        mappings[clientCtx.accountId.toLowerCase()] = clientCtx.platformAccountId.toLowerCase();
      }
      if (clientCtx?.platformAccountId) ids.add(clientCtx.platformAccountId.toLowerCase().replace(/-/g, ''));
      if (clientCtx?.accountId) ids.add(clientCtx.accountId.toLowerCase().replace(/-/g, ''));
      findIds(e);
    });
  } catch (e) { console.error("Archive Scan Error", e); }

  // 3. Crash Log Scavenging (High Reliability for User Name)
  try {
    const nebulaPath = path.join(app.getPath('home'), 'AppData', 'Local', 'Nebula');
    const crashesDir = path.join(nebulaPath, 'Saved', 'Crashes');
    if (fs.existsSync(crashesDir)) {
      const crashFolders = await fsPromises.readdir(crashesDir);

      await Promise.all(crashFolders.map(async (folder) => {
        const xmlPath = path.join(crashesDir, folder, 'CrashContext.runtime-xml');
        try {
          // Access check then read
          await fsPromises.access(xmlPath);
          const xmlContent = await fsPromises.readFile(xmlPath, 'utf8');

          // Patterns for name and ID extraction
          const userRegex = /-epicusername=(.*?)[ \t\r\n"-]/i;
          const idRegex = /<EpicAccountId>(.*?)<\/EpicAccountId>/i;
          const idAltRegex = /-epicuserid=([a-f0-9]{32,36})/i;

          const userMatch = userRegex.exec(xmlContent);
          const idMatch = idRegex.exec(xmlContent) || idAltRegex.exec(xmlContent);

          if (idMatch && idMatch[1]) {
            const cleanId = idMatch[1].toLowerCase().replace(/-/g, '');
            ids.add(cleanId);
            if (userMatch && userMatch[1] && userMatch[1].length > 2) {
              names[cleanId] = userMatch[1];
              console.log(`[IDScan] Harvested Name from Crash Log: ${userMatch[1]} (${cleanId})`);
            }
          }
        } catch { }
      }));
    }
  } catch (e) { console.error("Crash Scavenge Error", e); }

  // Debug Logging & Report... (Kept same)
  console.log(`\n========== [IDScan] COMPREHENSIVE REPORT ==========`);
  console.log(`Total IDs Found: ${ids.size}`);
  console.log(`Total Names Harvested: ${Object.keys(names).length}`);
  console.log(`Total AB->Epic Mappings: ${Object.keys(mappings).length}`);
  // ... (Abbreviated debug logs if needed, but keeping full for now is safe)

  // Debug Snippet - Async read
  const urls = new Set();
  let rawSnip = '';
  try {
    const dbgBuffer = await fsPromises.readFile(LOG_PATH);
    for (let i = 0; i < Math.min(dbgBuffer.length, 500000); i++) rawSnip += String.fromCharCode(dbgBuffer[i] + 1);
    const urlRegex = /https?:\/\/[^\s"']+/g;
    let u;
    while ((u = urlRegex.exec(rawSnip)) !== null) urls.add(u[0]);
  } catch (e) { }

  let fileSize = 0;
  try {
    const st = await fsPromises.stat(LOG_PATH);
    fileSize = st.size;
  } catch { }

  return {
    success: true,
    ids: Array.from(ids),
    mappings,
    names,
    urls: Array.from(urls),
    debugSnippet: rawSnip.slice(0, 5000),
    path: LOG_PATH,
    error: error,
    fileSize: fileSize
  };
});

// Discord RPC Setup
const clientId = '1331154341514117120';
DiscordRPC.register(clientId);
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

rpc.on('error', (err) => {
  if (isDev) console.error("Discord RPC Error:", err.message);
});

async function setActivity(stats) {
  if (!rpc || !win) return;
  try {
    const { sessionWins, sessionTotal, activeMode } = stats;
    const winRate = sessionTotal > 0 ? Math.round((sessionWins / sessionTotal) * 100) : 0;
    rpc.setActivity({
      details: `${activeMode}`,
      state: `Session: ${sessionWins}W - ${sessionTotal - sessionWins}L (${winRate}%)`,
      startTimestamp: stats.startTime || Date.now(),
      largeImageKey: 'logo',
      largeImageText: 'Wildgate Stat Tracker',
      instance: false,
    }).catch(() => { });
  } catch (e) { }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: DEFAULT_MIN_WINDOW_BOUNDS.width,
    minHeight: DEFAULT_MIN_WINDOW_BOUNDS.height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: path.join(__dirname, '../public/favicon.png'),
    autoHideMenuBar: true,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
  });

  devMark('window created');

  win.on('show', () => win.webContents.send('window-visibility-change', true));
  win.on('hide', () => win.webContents.send('window-visibility-change', false));

  if (isDev) startDevRendererWithRetry(win, DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  ipcMain.on('open-devtools', () => win.webContents.openDevTools());
  ipcMain.on('minimize-window', () => { if (win) win.minimize(); });
  ipcMain.on('skip-taskbar', (event, skip) => { if (win) win.setSkipTaskbar(skip); });
  ipcMain.on('restore-window', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  ipcMain.on('set-always-on-top', (event, always) => { if (win) win.setAlwaysOnTop(always, 'screen-saver'); });

  ipcMain.on('toggle-overlay', (event, isOverlay) => {
    if (!win) return;
    if (isOverlay) {
      previousBounds = win.getBounds();
      win.setMinimumSize(0, 0);
      if (win.isMaximized()) win.unmaximize();
      setTimeout(() => {
        win.setSize(360, 700); // Larger to fit MissionPanel content
        win.setAlwaysOnTop(true, 'screen-saver');
        // win.setSkipTaskbar(true); // DISABLED: Causing window to disappear for user
      }, 50);
    } else {
      win.setSkipTaskbar(false);
      win.setSize(previousBounds.width, previousBounds.height);
      win.center();
      // Reset click-through when exiting overlay
      win.setIgnoreMouseEvents(false);
      win.setMinimumSize(DEFAULT_MIN_WINDOW_BOUNDS.width, DEFAULT_MIN_WINDOW_BOUNDS.height);
    }
  });

  // Dynamic mouse event handling for partially transparent overlay
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (win) {
      const winOptions = options || { forward: true };
      win.setIgnoreMouseEvents(ignore, winOptions);
    }
  });

  // Overlay style handler - controls initial state
  ipcMain.on('set-overlay-style', (event, style) => {
    if (!win) return;
    const isTransparent = style === 'transparent';
    // For transparent mode, start with ignore=true (click-through default)
    // Renderer will toggle to ignore=false when hovering interactive elements
    if (isTransparent) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
  });

  // Overlay style handler - controls initial state
  ipcMain.on('set-overlay-mode', (event, enabled) => {
    if (win) {
      if (enabled) {
        // OVERLAY MODE
        win.setAlwaysOnTop(true, 'screen-saver'); // High priority
        win.setVisibleOnAllWorkspaces(true);
        win.setFullScreenable(false);

        // Ensure it can receive focus for clicks
        win.setFocusable(true);
        // Do not skip taskbar so user can find it if lost, or skip if preferred. 
        // Usually skipping taskbar is cleaner for overlays:
        win.setSkipTaskbar(true);

        // We don't set ignore mouse events here immediately; 
        // The frontend component (OverlayView) manages that fine-grained
      } else {
        // STANDARD MODE
        win.setAlwaysOnTop(false);
        win.setVisibleOnAllWorkspaces(false);
        win.setFullScreenable(true);
        win.setFocusable(true);
        win.setSkipTaskbar(false);

        // Reset mouse ignoring just in case
        win.setIgnoreMouseEvents(false);
      }
    }
  });

  ipcMain.on('resize-window', (event, { width, height }) => { if (win && !win.isMaximized()) win.setSize(Math.round(width), Math.round(height)); });
  ipcMain.on('set-window-bounds', (event, bounds) => { if (win && !win.isMaximized()) win.setBounds(bounds); });
  ipcMain.on('maximize-window', () => { if (win) { if (win.isMaximized()) win.unmaximize(); else win.maximize(); } });
  ipcMain.on('close-window', () => { if (win) win.close(); });
  ipcMain.on('update-presence', (event, stats) => setActivity(stats));
  ipcMain.on('check-for-updates', () => { if (!isDev) autoUpdater.checkForUpdates(); else if (win) win.webContents.send('update_not_available'); });
}

// GCloud OCR IPC Handler
ipcMain.handle('gcloud-ocr-scan', async (event, imagePath) => {
  return await gcloudService.performOCR(imagePath);
});

// GCloud Training Sync IPC Handler
ipcMain.handle('sync-training-sample', async (event, sampleId) => {
  const trainingDir = path.join(app.getPath('userData'), 'training_data');
  return await gcloudSyncService.syncSample(trainingDir, sampleId);
});

app.whenReady().then(async () => {
  devMark('app whenReady');
  createTray();
  createWindow();
  cleanupOldArchives();
  registerOCRHandlers(win);  // Register new OCR IPC handlers (pass win for hide-during-capture)

  // Initialize GCloud services (only if key file exists on this machine)
  const GCLOUD_KEY =
    process.env.WILDGATE_GCLOUD_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(app.getPath('documents'), 'GCloudInfo', 'service-account.json');
  const GCLOUD_BUCKET = process.env.WILDGATE_GCLOUD_BUCKET || 'wildgate-training';
  if (fs.existsSync(GCLOUD_KEY)) {
    gcloudService.initialize(GCLOUD_KEY);
    await gcloudSyncService.initialize(GCLOUD_KEY, GCLOUD_BUCKET);
    geminiService.initialize(GCLOUD_KEY);
  } else {
    console.warn('[GCloud] Key file not found, GCloud services disabled');
  }
  if (!isDev) autoUpdater.checkForUpdates();
  rpc.login({ clientId }).catch(console.error);

  globalShortcut.register('F9', () => {
    if (win) {
      if (win.isVisible() && !win.isMinimized()) {
        // If visible and focused (or just visible), Hide it (Dismiss)
        // We used to minimize, but hide() is cleaner for "toggling away"
        win.hide();
      } else {
        // If hidden or minimized, Bring it up
        if (win.isMinimized()) win.restore();
        win.show();
        win.setAlwaysOnTop(true, 'screen-saver'); // Ensure it pops over game
        win.focus();
      }
      // Note: We NO LONGER send 'hotkey-toggle-overlay'. 
      // State (Overlay vs Dashboard) is preserved.
    }
  });
});

// Telemetry Decoding - PORTED FROM decode_script.cjs
ipcMain.handle('decode-telemetry-cache', async () => {
  try {
    const localAppData = process.env.LOCALAPPDATA;
    const logsDir = path.join(localAppData, 'Nebula', 'Saved', 'Logs');

    if (!fs.existsSync(logsDir)) {
      return { success: false, message: 'Logs directory not found' };
    }

    const files = await fsPromises.readdir(logsDir);
    let decodedCount = 0;

    for (const file of files) {
      if (!file.includes('AccelByteTelemetryCache')) continue;
      if (file.startsWith('decoded_') || file.endsWith('.json')) continue;

      const srcPath = path.join(logsDir, file);

      try {
        if (!(await fsPromises.stat(srcPath)).isFile()) continue;
        const buffer = await fsPromises.readFile(srcPath);
        if (buffer.length === 0) continue;

        // Layer 1 (+1 shift)
        const layer1Buf = Buffer.allocUnsafe(buffer.length);
        for (let i = 0; i < buffer.length; i++) layer1Buf[i] = buffer[i] + 1;

        let layer1Obj;
        try {
          layer1Obj = JSON.parse(layer1Buf.toString('utf8'));
        } catch (e) { continue; }

        let finalJson = layer1Obj;
        const abArray = layer1Obj.ArrayByte || layer1Obj.arrayByte;
        if (abArray && Array.isArray(abArray)) {
          const layer2Buf = Buffer.allocUnsafe(abArray.length);
          for (let i = 0; i < abArray.length; i++) layer2Buf[i] = abArray[i] + 1;
          try {
            finalJson = JSON.parse(layer2Buf.toString('utf8'));
          } catch (e) { }
        }

        const outPath = path.join(logsDir, `decoded_${file}.json`);
        await fsPromises.writeFile(outPath, JSON.stringify(finalJson, null, 2));
        decodedCount++;
      } catch (e) {
        console.error(`Failed to decode ${file}:`, e);
      }
    }

    return { success: true, message: `Successfully decoded ${decodedCount} file(s).` };
  } catch (e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('list-telemetry-archives', async () => {
  try {
    const archiveDir = path.join(app.getPath('userData'), 'telemetry_archive');
    console.log('[Simulator] Listing archives in:', archiveDir);
    if (!fs.existsSync(archiveDir)) {
      console.log('[Simulator] Archive directory does not exist:', archiveDir);
      return [];
    }

    const files = (await fsPromises.readdir(archiveDir))
      .filter(f => f.endsWith('.json'));

    const fileStats = await Promise.all(files.map(async (file) => {
      const fullPath = path.join(archiveDir, file);
      const stats = await fsPromises.stat(fullPath);
      return {
        filename: file,
        date: stats.mtimeMs,
        size: stats.size
      };
    }));

    return fileStats.sort((a, b) => b.date - a.date); // Newest first
  } catch (e) {
    console.error('Failed to list telemetry archives:', e);
    return [];
  }
});

ipcMain.handle('load-telemetry-archive-file', async (event, filename) => {
  try {
    const archiveDir = path.join(app.getPath('userData'), 'telemetry_archive');
    const fullPath = path.join(archiveDir, filename);

    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }

    const content = await fsPromises.readFile(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to load telemetry archive file:', e);
    throw e;
  }
});

ipcMain.handle('clear-telemetry-archives', async () => {
  try {
    const archiveDir = path.join(app.getPath('userData'), 'telemetry_archive');
    if (!fs.existsSync(archiveDir)) return { success: true, count: 0 };

    const files = (await fsPromises.readdir(archiveDir)).filter(f => f.endsWith('.json'));
    await Promise.all(files.map(file => fsPromises.unlink(path.join(archiveDir, file))));

    return { success: true, count: files.length };
  } catch (e) {
    console.error('Failed to clear telemetry archives:', e);
    return { success: false, message: e.message };
  }
});

// Utility IPC handlers for contextIsolation (replaces direct fs/shell access in renderer)
ipcMain.handle('read-file-base64', async (event, filePath) => {
  try {
    if (!isAllowedRendererPath(filePath)) return null;
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.has(ext)) return null;
    const data = await fsPromises.readFile(resolved);
    return data.toString('base64');
  } catch (e) {
    return null;
  }
});

ipcMain.handle('db-status', async () => {
  try {
    const toMtime = async (p) => {
      try {
        const s = await fsPromises.stat(p);
        return s.mtimeMs || s.birthtimeMs || null;
      } catch {
        return null;
      }
    };

    const backupDir = path.join(app.getPath('documents'), 'Wildgate Stat Tracker/Backups');
    let lastBackupMtime = null;
    try {
      const files = await fsPromises.readdir(backupDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      for (const f of jsonFiles) {
        const m = await toMtime(path.join(backupDir, f));
        if (m && (!lastBackupMtime || m > lastBackupMtime)) lastBackupMtime = m;
      }
    } catch {
      // No backup directory yet.
    }

    const walExists = !!(await toMtime(DB_WAL_PATH));
    return {
      ok: true,
      walExists,
      dbMtime: await toMtime(DB_PATH),
      prevMtime: await toMtime(DB_PREV_PATH),
      walMtime: await toMtime(DB_WAL_PATH),
      lastBackupMtime,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      walExists: false,
      dbMtime: null,
      prevMtime: null,
      walMtime: null,
      lastBackupMtime: null
    };
  }
});

ipcMain.handle('open-path', async (event, targetPath) => {
  try {
    if (!isAllowedRendererPath(targetPath)) {
      return { success: false, error: 'Path not allowed' };
    }
    await shell.openPath(path.resolve(targetPath));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// GCloud status check (renderer queries this to show availability in settings)
ipcMain.handle('get-gcloud-status', async () => {
  return {
    visionReady: gcloudService.isInitialized || false,
    geminiReady: geminiService.isInitialized || false,
    storageReady: gcloudSyncService.isInitialized || false,
    storageStats: gcloudSyncService.getStats(),
  };
});

// GCloud test upload (verify credentials and bucket access from UI)
ipcMain.handle('test-gcloud-upload', async () => {
  return await gcloudSyncService.testUpload();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

autoUpdater.on('update-available', (info) => { if (win) win.webContents.send('update_available'); });
autoUpdater.on('update-not-available', (info) => { if (win) win.webContents.send('update_not_available'); });
autoUpdater.on('update-downloaded', (info) => { if (win) win.webContents.send('update_downloaded'); });
autoUpdater.on('error', (err) => { if (win) win.webContents.send('update_error', err.message); });
ipcMain.on('restart_app', () => autoUpdater.quitAndInstall());

