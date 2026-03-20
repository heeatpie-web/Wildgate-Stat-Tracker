import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { requirePackagedModule } = require('./packagedModuleLoader.cjs');

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('packagedModuleLoader', () => {
  it('loads a module from app.asar.unpacked when the direct require is unavailable', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-packaged-loader-'));
    tempDirs.push(tempRoot);
    const originalResourcesPath = process.resourcesPath;

    const moduleDir = path.join(tempRoot, 'app.asar.unpacked', 'node_modules', 'fake-capture-runtime');
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'package.json'), JSON.stringify({
      name: 'fake-capture-runtime',
      main: 'index.js',
    }));
    fs.writeFileSync(path.join(moduleDir, 'index.js'), 'module.exports = { loadedFrom: "app.asar.unpacked" };');

    process.resourcesPath = tempRoot;
    try {
      expect(requirePackagedModule('fake-capture-runtime')).toEqual({
        loadedFrom: 'app.asar.unpacked',
      });
    } finally {
      process.resourcesPath = originalResourcesPath;
    }
  });
});
