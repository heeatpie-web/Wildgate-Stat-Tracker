import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { sendWhenRendererReady } = require('./rendererReadyDispatch.cjs');

function createWindowDouble({ isLoading = false, destroyed = false } = {}) {
  const webContents = new EventEmitter();
  webContents.send = vi.fn();
  webContents.once = webContents.once.bind(webContents);
  webContents.isLoading = vi.fn(() => isLoading);
  webContents.isDestroyed = vi.fn(() => false);

  let windowDestroyed = destroyed;
  const win = {
    webContents,
    isDestroyed: vi.fn(() => windowDestroyed),
    destroy() {
      windowDestroyed = true;
    },
  };

  return { win, webContents };
}

describe('sendWhenRendererReady', () => {
  it('sends immediately when the renderer is already loaded', () => {
    const { win, webContents } = createWindowDouble({ isLoading: false });

    const sent = sendWhenRendererReady(win, 'hotkey-smart-capture');

    expect(sent).toBe(true);
    expect(webContents.send).toHaveBeenCalledWith('hotkey-smart-capture');
  });

  it('defers the send until did-finish-load when the renderer is loading', () => {
    const { win, webContents } = createWindowDouble({ isLoading: true });

    const sent = sendWhenRendererReady(win, 'hotkey-smart-capture');

    expect(sent).toBe(false);
    expect(webContents.send).not.toHaveBeenCalled();

    webContents.emit('did-finish-load');

    expect(webContents.send).toHaveBeenCalledWith('hotkey-smart-capture');
  });

  it('does not send if the window is destroyed before loading completes', () => {
    const { win, webContents } = createWindowDouble({ isLoading: true });

    sendWhenRendererReady(win, 'hotkey-smart-capture');
    win.destroy();
    webContents.emit('did-finish-load');

    expect(webContents.send).not.toHaveBeenCalled();
  });
});
