const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const DiscordRPC = require('discord-rpc');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;

let win;

// Database Path
const DB_PATH = path.join(app.getPath('userData'), 'wildgate_db.json');

// Database Handlers
ipcMain.handle('db-read', () => {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {
    console.error("DB Read Error", e);
    return null;
  }
});

ipcMain.handle('db-write', (event, data) => {
  const TEMP_PATH = DB_PATH + '.tmp';
  try {
    fs.writeFileSync(TEMP_PATH, JSON.stringify(data, null, 2));
    fs.renameSync(TEMP_PATH, DB_PATH);
    return true;
  } catch (e) {
    console.error("DB Write Error", e);
    if (fs.existsSync(TEMP_PATH)) {
      try { fs.unlinkSync(TEMP_PATH); } catch (unlinkErr) { console.error("Failed to cleanup temp file", unlinkErr); }
    }
    return false;
  }
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

// Discord RPC Setup
const clientId = '1331154341514117120'; // Replace with your Discord Client ID
DiscordRPC.register(clientId);
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

async function setActivity(stats) {
  if (!rpc || !win) return;
  
  const { sessionWins, sessionTotal, activeMode } = stats;
  const winRate = sessionTotal > 0 ? Math.round((sessionWins / sessionTotal) * 100) : 0;

  rpc.setActivity({
    details: `${activeMode}`,
    state: `Session: ${sessionWins}W - ${sessionTotal - sessionWins}L (${winRate}%)`,
    startTimestamp: stats.startTime || Date.now(),
    largeImageKey: 'logo',
    largeImageText: 'Wildgate Stat Tracker',
    instance: false,
  }).catch(err => console.error("Discord RPC Error:", err));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, '../public/favicon.ico'),
    autoHideMenuBar: true,
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  
  ipcMain.on('open-devtools', () => {
    win.webContents.openDevTools();
  });

  ipcMain.on('update-presence', (event, stats) => {
    setActivity(stats);
  });

  ipcMain.on('check-for-updates', () => {
    if (!isDev) {
      console.log('Checking for updates...');
      autoUpdater.checkForUpdates();
    } else {
      console.log('Dev mode: skipping update check');
      if(win) win.webContents.send('update_not_available');
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    autoUpdater.checkForUpdates();
  }

  rpc.login({ clientId }).catch(console.error);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Auto Updater Events
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info);
  if(win) win.webContents.send('update_available');
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available:', info);
  if(win) win.webContents.send('update_not_available');
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info);
  if(win) win.webContents.send('update_downloaded');
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
  if(win) win.webContents.send('update_error', err.message);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  console.log(log_message);
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});
