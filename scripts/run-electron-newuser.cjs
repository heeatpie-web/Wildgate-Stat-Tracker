#!/usr/bin/env node
/**
 * Launches Electron with a clean isolated userData dir for testing new-user flows.
 * Sets WILDGATE_USER_DATA_DIR so main.cjs redirects app.getPath('userData') before
 * any db paths are computed.
 */
const { spawn } = require('child_process');
const path = require('path');

function resolveElectronBinary() {
  try {
    return require('electron');
  } catch (error) {
    console.error('[run-electron-newuser] Failed to resolve electron binary:', error.message);
    process.exit(1);
  }
}

delete process.env.ELECTRON_RUN_AS_NODE;
process.env.WILDGATE_USER_DATA_DIR = path.resolve(__dirname, '..', 'tmp-newuser');

const electronBinary = resolveElectronBinary();
const child = spawn(electronBinary, ['.'], {
  stdio: 'inherit',
  env: process.env,
});

const forwardSignal = (signal) => {
  if (child && !child.killed) child.kill(signal);
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('error', (error) => {
  console.error('[run-electron-newuser] Failed to spawn electron:', error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(typeof code === 'number' ? code : 0);
});
