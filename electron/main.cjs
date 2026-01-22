const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const DiscordRPC = require('discord-rpc');
const path = require('path');
const isDev = !app.isPackaged;

let win;

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
      autoUpdater.checkForUpdatesAndNotify();
    } else {
      if(win) win.webContents.send('update_not_available');
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
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
autoUpdater.on('update-available', () => {
  if(win) win.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
  if(win) win.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});
