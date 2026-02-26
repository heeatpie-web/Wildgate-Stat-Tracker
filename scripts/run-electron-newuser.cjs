#!/usr/bin/env node
/**
 * Launches Electron with a clean isolated userData dir for testing new-user flows.
 * Sets WILDGATE_USER_DATA_DIR so main.cjs redirects app.getPath('userData') before
 * any db paths are computed.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function resolveElectronBinary() {
  try {
    return require('electron');
  } catch (error) {
    console.error('[run-electron-newuser] Failed to resolve electron binary:', error.message);
    process.exit(1);
  }
}

delete process.env.ELECTRON_RUN_AS_NODE;
const tmpDir = path.resolve(__dirname, '..', 'tmp-newuser');
process.env.WILDGATE_USER_DATA_DIR = tmpDir;

// Wipe the tmp dir on every run so the new-user flow always starts clean.
if (fs.existsSync(tmpDir)) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('[run-electron-newuser] Wiped tmp-newuser for clean run.');
}
fs.mkdirSync(tmpDir, { recursive: true });

// Write a valid empty db so the IPC db-read succeeds and the app never
// falls back to localStorage (which would load the real user's data).
const emptyDb = {
  matches: [], players: [], pilotRegistry: [], favorites: [],
  pilotNotes: {}, settings: {}, layouts: {}, lastActivity: 0,
};
fs.writeFileSync(
  path.join(tmpDir, 'wildgate_db.json'),
  JSON.stringify(emptyDb),
);
console.log('[run-electron-newuser] Seeded empty db — localStorage fallback bypassed.');

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
