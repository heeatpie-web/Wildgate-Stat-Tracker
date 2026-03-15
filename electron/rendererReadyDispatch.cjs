'use strict';

function canSend(win, webContents) {
  if (!win || typeof win.isDestroyed !== 'function' || win.isDestroyed()) return false;
  if (!webContents) return false;
  if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) return false;
  return typeof webContents.send === 'function';
}

function sendWhenRendererReady(win, channel) {
  const webContents = win?.webContents;
  if (!canSend(win, webContents)) return false;

  const sendNow = () => {
    if (!canSend(win, webContents)) return false;
    webContents.send(channel);
    return true;
  };

  if (typeof webContents.isLoading === 'function' && webContents.isLoading()) {
    webContents.once('did-finish-load', () => {
      sendNow();
    });
    return false;
  }

  return sendNow();
}

module.exports = {
  sendWhenRendererReady,
};
