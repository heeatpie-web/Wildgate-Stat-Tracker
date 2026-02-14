#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

const runner = path.join(__dirname, 'run-electron.cjs');
const child = spawn(process.execPath, [runner, '.'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  console.error('[electron-hot-dev] Failed to launch electron:', error.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(typeof code === 'number' ? code : 0);
});
