/**
 * @module preload
 * Electron preload script — exposes a safe, typed IPC bridge via contextBridge.
 * Renderer code accesses these methods through window.electronAPI.
 */
const { contextBridge, ipcRenderer } = require('electron');

// Allowed channels — any channel NOT listed here is blocked.
const INVOKE_CHANNELS = [
  'db-read', 'db-write', 'db-backup', 'db-status',
  'read-uid-seed',
  'persist-logs', 'read-logs',
  'capture-screen', 'save-ocr-debug',
  'ocr-scan', 'ml-scan',
  'capture-game-window', 'ocr-process-capture',
  'save-screenshot',
  'start-auto-capture',
  'send-game-ui-action', 'wait-for-game-screen',
  'pick-roi-image',
  'bundle-artifacts', 'get-match-artifacts', 'remove-all-match-artifacts', 'rerun-ocr-on-artifact', 'rerun-ocr-multi',
  'list-match-artifacts',
  'artifact-repair-preview', 'artifact-repair-apply',
  'remove-match-artifact', 'add-match-artifact', 'reassign-match-artifact',
  'load-archived-telemetry', 'list-telemetry-archives', 'load-telemetry-archive-file',
  'telemetry-retention-status', 'telemetry-prune-preview', 'telemetry-prune-apply',
  'decode-telemetry-cache', 'clear-telemetry-archives',
  'clear-ocr-preprocessed', 'get-ocr-debug-dir', 'list-ocr-debug-files', 'get-ocr-cache-stats', 'benchmark-ocr-preprocessing', 'regenerate-ocr-dictionary',
  'scan-epic-ids',
  'read-file-base64', 'open-path',
  'result-flash-sample',
  'scan-result-screen',
  'capture-result-screen-region',
  'check-vigem-installed',
  'install-vigem-driver',
  'connect-virtual-gamepad',
  'disconnect-virtual-gamepad',
  'send-virtual-gamepad-state',
  'send-virtual-gamepad-state-sequence',
  'test-gamepad-input',
  'video-import-pick-file',
  'video-import-start',
  'video-import-cancel',
];



const SEND_CHANNELS = [
  'start-log-monitoring', 'stop-log-monitoring',
  'minimize-window', 'maximize-window', 'close-window',
  'check-for-updates', 'restart_app',
  'update-presence',
  'set-ignore-mouse-events',
  'toggle-overlay', 'set-overlay-style', 'set-window-bounds',
  'sync-auto-capture-hotkey-state',
  'sync-virtual-gamepad-hotkey-state',
  'result-monitor-start', 'result-monitor-stop',
  'result-flash-start', 'result-flash-stop',
  'result-text-start', 'result-text-stop',
  'tactical-map-monitor-start', 'tactical-map-monitor-stop',
  'set-hardware-acceleration-disabled',
  'relaunch-app',
];

const RECEIVE_CHANNELS = [
  'log-status', 'log-data',
  'window-maximized-changed',
  'window-restored',
  'update_available', 'update_downloaded', 'update_not_available', 'update_error',
  'hotkey-toggle-overlay',
  'auto-capture-status',
  'virtual-gamepad-hotkey-status',
  'telemetry-prune-needed',
  'result-flash-detected', 'result-flash-resolved', 'result-flash-debug',
  'result-text-detected', 'result-text-debug',
  'video-import-progress',
  'tactical-map-detected',
  'game-process-status',
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


