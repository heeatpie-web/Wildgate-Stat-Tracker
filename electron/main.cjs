const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const isDev = !app.isPackaged;

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple projects; consider turning true + preload script for security
    },
    icon: path.join(__dirname, '../public/favicon.ico'),
    autoHideMenuBar: true,
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // win.webContents.openDevTools(); // Optional: Open DevTools by default
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  
  // IPC listener for opening DevTools
  ipcMain.on('open-devtools', () => {
    win.webContents.openDevTools();
  });
}

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

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