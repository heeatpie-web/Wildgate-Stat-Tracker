/**
 * @module preload
 * Electron preload script — exposes a safe, typed IPC bridge via contextBridge.
 * Renderer code accesses these methods through window.electronAPI.
 */
const { contextBridge, ipcRenderer } = require('electron');

// Allowed channels — any channel NOT listed here is blocked.
const INVOKE_CHANNELS = [
  'db-read', 'db-write', 'db-backup',
  'persist-logs',
  'capture-screen', 'save-ocr-debug',
  'ocr-scan', 'ml-scan',
  'capture-game-window', 'ocr-process-capture',
  'gcloud-ocr-scan', 'sync-training-sample',
  'bundle-artifacts', 'get-match-artifacts', 'rerun-ocr-on-artifact',
  'load-archived-telemetry', 'list-telemetry-archives', 'load-telemetry-archive-file',
  'decode-telemetry-cache', 'clear-telemetry-archives',
  'clear-ocr-preprocessed', 'get-ocr-debug-dir', 'list-ocr-debug-files',
  'scan-epic-ids',
  'read-file-base64', 'open-path',
  'get-gcloud-status',
  'test-gcloud-upload',
];

const SEND_CHANNELS = [
  'start-log-monitoring', 'stop-log-monitoring',
  'minimize-window', 'maximize-window', 'close-window',
  'check-for-updates', 'restart_app',
  'update-presence',
  'set-ignore-mouse-events',
  'toggle-overlay', 'set-overlay-style', 'set-window-bounds',
];

const RECEIVE_CHANNELS = [
  'log-status', 'log-data',
  'window-maximized-changed',
  'update_available', 'update_downloaded',
  'hotkey-toggle-overlay',
];

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Two-way IPC (renderer → main → renderer).
   * @param {string} channel
   * @param {...any} args
   * @returns {Promise<any>}
   */
  invoke: (channel, ...args) => {
    if (!INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`IPC invoke blocked: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * One-way fire-and-forget (renderer → main).
   * @param {string} channel
   * @param {...any} args
   */
  send: (channel, ...args) => {
    if (!SEND_CHANNELS.includes(channel)) {
      console.warn(`IPC send blocked: ${channel}`);
      return;
    }
    ipcRenderer.send(channel, ...args);
  },

  /**
   * Subscribe to events from main process.
   * Returns an unsubscribe function.
   * @param {string} channel
   * @param {Function} callback
   * @returns {() => void} unsubscribe
   */
  on: (channel, callback) => {
    if (!RECEIVE_CHANNELS.includes(channel)) {
      console.warn(`IPC on blocked: ${channel}`);
      return () => {};
    }
    const wrapped = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  /**
   * Remove all listeners for a channel.
   * @param {string} channel
   */
  removeAllListeners: (channel) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
});
