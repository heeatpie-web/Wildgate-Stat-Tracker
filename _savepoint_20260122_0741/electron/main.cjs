const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
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
