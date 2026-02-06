const { app, BrowserWindow, shell, ipcMain, globalShortcut, Menu, Tray } = require('electron');
const { autoUpdater } = require('electron-updater');
const DiscordRPC = require('discord-rpc');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { registerOCRHandlers } = require('./ocrHandler.cjs');
const gcloudService = require('./gcloudService.cjs');
const gcloudSyncService = require('./gcloudSyncService.cjs');
const isDev = !app.isPackaged;

let win;
let tray = null;
let previousBounds = { width: 1200, height: 850 };

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
              win.webContents.send('hotkey-toggle-overlay', true); // Ensure UI state matches
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
const DB_PATH = path.join(app.getPath('userData'), 'wildgate_db.json');
const LOG_FILE_PATH = path.join(app.getPath('userData'), 'app_logs.txt');

// Log Persistence Handler
ipcMain.handle('persist-logs', async (event, logContent) => {
  try {
    // Append to log file, keeping last 100KB
    const MAX_LOG_SIZE = 100 * 1024;
    // Artifact Bundling
    ipcMain.handle('bundle-artifacts', async (event, { matchId, startTime, endTime }) => {
      try {
        const debugDir = path.join(app.getPath('userData'), 'ocr-debug');
        const matchDir = path.join(app.getPath('userData'), 'match_artifacts', matchId.toString());

        if (!fs.existsSync(debugDir)) return [];
        if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });

        const files = fs.readdirSync(debugDir);
        const bundledFiles = [];

        for (const file of files) {
          const srcPath = path.join(debugDir, file);
          const stat = fs.statSync(srcPath);
          const birthtime = stat.birthtimeMs || stat.mtimeMs;

          // Check if file was created during the match (with slight buffer)
          if (birthtime >= startTime - 5000 && birthtime <= endTime + 30000) {
            const destPath = path.join(matchDir, file);
            // Copy to preserve debug logic, or move? Copy is safer.
            fs.copyFileSync(srcPath, destPath);
            bundledFiles.push(file);
          }
        }

        console.log(`[Artifacts] Bundled ${bundledFiles.length} images for match ${matchId}`);
        return bundledFiles;
      } catch (e) {
        console.error("Artifact Bundling Error", e);
        return [];
      }
    });

    ipcMain.handle('get-match-artifacts', async (event, matchId) => {
      try {
        const matchDir = path.join(app.getPath('userData'), 'match_artifacts', matchId.toString());
        if (!fs.existsSync(matchDir)) return [];

        const files = fs.readdirSync(matchDir);
        return files.map(f => {
          const fullPath = path.join(matchDir, f);
          const data = fs.readFileSync(fullPath).toString('base64');
          return `data:image/png;base64,${data}`; // Assuming PNG/JPG. If unknown, check extension.
        });
      } catch (e) {
        return [];
      }
    });

    // Telemetry Decoding
    ipcMain.handle('decode-telemetry-cache', async () => {
      try {
        const rawPath = path.join(app.getPath('localData'), 'Nebula', 'Saved', 'Logs', 'AccelByteTelemetryCache', 'AccelByteTelemetryCache');
        // Note: app.getPath('localData') might not map to LocalAppData correctly in all electron versions. 
        // Usually 'userData' is AppData/Roaming. LocalAppData is 'appData'/../Local or via process.env.
        // Safer to use process.env.LOCALAPPDATA on Windows.
        const localAppData = process.env.LOCALAPPDATA;
        const cachePath = path.join(localAppData, 'Nebula', 'Saved', 'Logs', 'AccelByteTelemetryCache', 'AccelByteTelemetryCache');

        if (!fs.existsSync(cachePath)) {
          return { success: false, message: 'Cache file not found' };
        }

        const buffer = fs.readFileSync(cachePath);

        // Layer 1 Decode (+1 shift)
        const layer1Buf = Buffer.allocUnsafe(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
          layer1Buf[i] = buffer[i] + 1;
        }

        let layer1Obj;
        try {
          layer1Obj = JSON.parse(layer1Buf.toString('utf8'));
        } catch (e) {
          return { success: false, message: 'Layer 1 Decode Failed' };
        }

        let finalJson = layer1Obj;

        // Layer 2 Decode (if ArrayByte exists)
        const abArray = layer1Obj.ArrayByte || layer1Obj.arrayByte;
        if (abArray && Array.isArray(abArray)) {
          const layer2Buf = Buffer.allocUnsafe(abArray.length);
          for (let i = 0; i < abArray.length; i++) {
            layer2Buf[i] = abArray[i] + 1;
          }
          try {
            finalJson = JSON.parse(layer2Buf.toString('utf8'));
          } catch (e) {
            // Keep Layer 1 if Layer 2 fails? 
            // Usually if L2 exists we want that.
            return { success: false, message: 'Layer 2 Decode Failed' };
          }
        }

        const outputPath = path.join(localAppData, 'Nebula', 'Saved', 'Logs', 'AccelByteTelemetryCache', `decoded_${Date.now()}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(finalJson, null, 2));

        return { success: true, path: outputPath };

      } catch (e) {
        console.error("Decode Error:", e);
        return { success: false, message: e.message };
      }
    });
    '';
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

// Database Handlers
ipcMain.handle('db-read', async () => {
  try {
    try {
      await fsPromises.access(DB_PATH);
    } catch {
      return null;
    }
    const content = await fsPromises.readFile(DB_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error("DB Read Error", e);
    return null;
  }
});

ipcMain.handle('db-write', async (event, data) => {
  const TEMP_PATH = DB_PATH + '.tmp';
  try {
    await fsPromises.writeFile(TEMP_PATH, JSON.stringify(data, null, 2));
    await fsPromises.rename(TEMP_PATH, DB_PATH);
    return true;
  } catch (e) {
    console.error("DB Write Error", e);
    try {
      await fsPromises.unlink(TEMP_PATH);
    } catch (unlinkErr) {
      console.error("Failed to cleanup temp file", unlinkErr);
    }
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
  try {
    const docPath = path.join(app.getPath('documents'), 'Wildgate Stat Tracker/Backups');
    if (!fs.existsSync(docPath)) fs.mkdirSync(docPath, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(docPath, `backup_${timestamp}.json`);

    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupPath);
      return { success: true, path: backupPath };
    }
    return { success: false, error: 'No database file found to backup.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('epic-request', async (event, { url, method, headers, body }) => {
  try {
    const fetchOptions = {
      method,
      headers: {
        'User-Agent': 'AccelByte-SDK',
        ...headers
      },
      body: body ? body : undefined
    };

    const response = await fetch(url, fetchOptions);
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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, '../public/favicon.png'),
    autoHideMenuBar: true,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
  });

  win.on('show', () => win.webContents.send('window-visibility-change', true));
  win.on('hide', () => win.webContents.send('window-visibility-change', false));

  if (isDev) win.loadURL('http://localhost:5173');
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

app.whenReady().then(() => {
  createTray();
  createWindow();
  cleanupOldArchives();
  registerOCRHandlers();  // Register new OCR IPC handlers

  // Initialize GCloud services
  const GCLOUD_KEY = "C:/Users/Alec Gougebas/Desktop/GCloudInfo/project-144d1cf3-4cee-4171-859-4b7c070c807e.json";
  gcloudService.initialize(GCLOUD_KEY);
  gcloudSyncService.initialize(GCLOUD_KEY, "wildgate-training-heeatpie");
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

    const files = fs.readdirSync(logsDir);
    let decodedCount = 0;

    for (const file of files) {
      if (!file.includes('AccelByteTelemetryCache')) continue;
      if (file.startsWith('decoded_') || file.endsWith('.json')) continue;

      const srcPath = path.join(logsDir, file);

      try {
        if (!fs.statSync(srcPath).isFile()) continue;
        const buffer = fs.readFileSync(srcPath);
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
        fs.writeFileSync(outPath, JSON.stringify(finalJson, null, 2));
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

    const files = fs.readdirSync(archiveDir)
      .filter(f => f.endsWith('.json'))
      .map(file => {
        const fullPath = path.join(archiveDir, file);
        const stats = fs.statSync(fullPath);
        return {
          filename: file,
          date: stats.mtimeMs,
          size: stats.size
        };
      })
      .sort((a, b) => b.date - a.date); // Newest first

    return files;
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

    const content = fs.readFileSync(fullPath, 'utf-8');
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

    const files = fs.readdirSync(archiveDir).filter(f => f.endsWith('.json'));
    files.forEach(file => fs.unlinkSync(path.join(archiveDir, file)));

    return { success: true, count: files.length };
  } catch (e) {
    console.error('Failed to clear telemetry archives:', e);
    return { success: false, message: e.message };
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

autoUpdater.on('update-available', (info) => { if (win) win.webContents.send('update_available'); });
autoUpdater.on('update-not-available', (info) => { if (win) win.webContents.send('update_not_available'); });
autoUpdater.on('update-downloaded', (info) => { if (win) win.webContents.send('update_downloaded'); });
autoUpdater.on('error', (err) => { if (win) win.webContents.send('update_error', err.message); });
ipcMain.on('restart_app', () => autoUpdater.quitAndInstall());
