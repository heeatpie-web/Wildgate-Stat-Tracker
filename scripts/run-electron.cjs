#!/usr/bin/env node
const { spawn } = require('child_process');

function resolveElectronBinary() {
  try {
    return require('electron');
  } catch (error) {
    console.error('[run-electron] Failed to resolve electron binary:', error.message);
    process.exit(1);
  }
}

delete process.env.ELECTRON_RUN_AS_NODE;
const electronBinary = resolveElectronBinary();
const args = process.argv.slice(2);
const launchArgs = args.length > 0 ? args : ['.'];

const child = spawn(electronBinary, launchArgs, {
  stdio: 'inherit',
  env: process.env,
});

const forwardSignal = (signal) => {
  if (child && !child.killed) child.kill(signal);
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('error', (error) => {
  console.error('[run-electron] Failed to spawn electron:', error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(typeof code === 'number' ? code : 0);
});
