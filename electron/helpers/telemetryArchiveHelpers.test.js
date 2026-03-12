import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { archiveTelemetry } from './telemetryArchiveHelpers.cjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-archive-helpers-'));
}

async function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for condition.');
}

describe('telemetryArchiveHelpers.archiveTelemetry', () => {
  const tempDirs = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('serializes overlapping writes for the same archive file', async () => {
    const root = makeTempDir();
    tempDirs.push(root);

    const archiveDir = path.join(root, 'telemetry_archive');
    fs.mkdirSync(archiveDir, { recursive: true });

    const archivePath = path.join(archiveDir, 'match_shared-match.json');
    fs.writeFileSync(archivePath, '[]', 'utf8');

    const realReadFile = fs.promises.readFile.bind(fs.promises);
    const realWriteFile = fs.promises.writeFile.bind(fs.promises);
    let releaseReads;
    const readGate = new Promise(resolve => {
      releaseReads = resolve;
    });
    let readCount = 0;
    let resolveFirstWriteStarted;
    const firstWriteStarted = new Promise(resolve => {
      resolveFirstWriteStarted = resolve;
    });
    let releaseFirstWrite;
    const firstWriteGate = new Promise(resolve => {
      releaseFirstWrite = resolve;
    });
    let archiveWriteCount = 0;

    vi.spyOn(fs.promises, 'readFile').mockImplementation(async (filePath, ...args) => {
      if (path.resolve(String(filePath)) === archivePath) {
        readCount += 1;
        await readGate;
      }
      return realReadFile(filePath, ...args);
    });

    vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (filePath, data, ...args) => {
      if (path.resolve(String(filePath)) === archivePath) {
        archiveWriteCount += 1;
        if (archiveWriteCount === 1) {
          resolveFirstWriteStarted();
          await firstWriteGate;
        }
      }
      return realWriteFile(filePath, data, ...args);
    });

    const firstArchive = archiveTelemetry(archiveDir, {
      matchId: 'shared-match',
      ClientTimestamp: 1,
      EventName: 'Alpha',
    });
    const secondArchive = archiveTelemetry(archiveDir, {
      matchId: 'shared-match',
      ClientTimestamp: 2,
      EventName: 'Bravo',
    });

    await waitFor(() => readCount >= 1);
    await new Promise(resolve => setTimeout(resolve, 20));
    releaseReads();
    await firstWriteStarted;
    await new Promise(resolve => setTimeout(resolve, 20));
    releaseFirstWrite();

    await Promise.all([firstArchive, secondArchive]);

    const archivedEvents = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
    expect(archiveWriteCount).toBe(2);
    expect(archivedEvents).toHaveLength(2);
    expect(archivedEvents.map(event => event.EventName)).toEqual(['Alpha', 'Bravo']);
  });
});
