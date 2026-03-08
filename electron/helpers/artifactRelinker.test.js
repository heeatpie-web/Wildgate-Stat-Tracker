import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyArtifactRepair } from './artifactRelinker.cjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-relinker-'));
}

function writeFile(filePath, payload = 'image-data') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload);
}

describe('artifactRelinker.applyArtifactRepair', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removes duplicate auto-capture links from the wrong match', () => {
    const userData = makeTempDir();
    tempDirs.push(userData);
    const dbPath = path.join(userData, 'wildgate_db.json');
    const captureName = 'capture_2026-03-08T10-00-00-000Z.png';
    const matchOneDir = path.join(userData, 'match_artifacts', '101');
    const matchTwoDir = path.join(userData, 'match_artifacts', '102');
    const matchOneCapture = path.join(matchOneDir, captureName);
    const matchTwoCapture = path.join(matchTwoDir, captureName);

    writeFile(matchOneCapture, 'same-image');
    writeFile(matchTwoCapture, 'same-image');

    const db = {
      matches: [
        {
          id: 101,
          timestamp: Date.parse('2026-03-08T10:00:00.000Z'),
          time: '10:00',
          artifacts: [matchOneCapture],
        },
        {
          id: 102,
          timestamp: Date.parse('2026-03-08T10:20:00.000Z'),
          time: '10:00',
          artifacts: [matchTwoCapture],
        },
      ],
      storageMeta: { nextCanonicalMatchNumber: 103 },
    };
    fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

    const result = applyArtifactRepair({ dbPath, userData });
    const updatedDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    expect(result.summary.removedLinks).toBe(1);
    expect(updatedDb.matches[0].artifacts).toEqual([matchOneCapture]);
    expect(updatedDb.matches[1].artifacts).toEqual([]);
    expect(fs.existsSync(matchTwoCapture)).toBe(false);
  });
});
