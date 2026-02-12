/**
 * @module electron/handlers
 * Central registration for IPC handler modules.
 * Call registerAll(ipcMain, context) from main process after app is ready and deps are available.
 */
const artifactHandlers = require('./artifactHandlers.cjs');

/**
 * Register all IPC handler modules.
 * @param {import('electron').IpcMain} ipcMain
 * @param {{
 *   app: import('electron').App;
 *   getWin: () => import('electron').BrowserWindow | null | undefined;
 *   artifactHelpers: typeof import('../helpers/artifactHelpers.cjs');
 *   gcloudSyncService: import('../gcloudSyncService.cjs');
 * }} context
 */
function registerAll(ipcMain, context) {
  artifactHandlers.registerArtifactHandlers(ipcMain, context);
}

module.exports = { registerAll, registerArtifactHandlers: artifactHandlers.registerArtifactHandlers };
