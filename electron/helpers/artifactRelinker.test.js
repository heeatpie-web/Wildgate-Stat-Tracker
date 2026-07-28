import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('leaves already-owned auto-capture screenshots attached to their current matches', () => {
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

    expect(result.summary.appliedLinks).toBe(0);
    expect(result.summary.removedLinks).toBe(0);
    expect(updatedDb.matches[0].artifacts).toEqual([matchOneCapture]);
    expect(updatedDb.matches[1].artifacts).toEqual([matchTwoCapture]);
    expect(fs.existsSync(matchTwoCapture)).toBe(true);
  });

  it('ignores relinked auto-capture variants so one capture only links once', () => {
    const userData = makeTempDir();
    tempDirs.push(userData);
    const dbPath = path.join(userData, 'wildgate_db.json');
    const captureName = 'capture_2026-03-08T10-00-00-000Z.png';
    const relinkedCapture = 'capture_2026-03-08T10-00-00-000Z__relinked_1.png';
    const nestedRelinkedCapture = 'capture_2026-03-08T10-00-00-000Z__relinked_1__relinked_1.png';
    const sourceMatchDir = path.join(userData, 'match_artifacts', '202');

    writeFile(path.join(sourceMatchDir, captureName), 'same-image');
    writeFile(path.join(sourceMatchDir, relinkedCapture), 'same-image');
    writeFile(path.join(sourceMatchDir, nestedRelinkedCapture), 'same-image');

    const db = {
      matches: [
        {
          id: 201,
          timestamp: Date.parse('2026-03-08T10:00:00.000Z'),
          time: '10:00',
          artifacts: [],
        },
        {
          id: 202,
          timestamp: Date.parse('2026-03-08T10:20:00.000Z'),
          time: '10:00',
          artifacts: [],
        },
      ],
      storageMeta: { nextCanonicalMatchNumber: 203 },
    };
    fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

    const result = applyArtifactRepair({ dbPath, userData });
    const updatedDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    expect(result.summary.appliedLinks).toBe(1);
    expect(updatedDb.matches[0].artifacts).toHaveLength(1);
    expect(path.basename(updatedDb.matches[0].artifacts[0])).toBe(captureName);
    expect(updatedDb.matches[0].artifacts.some((artifactPath) => artifactPath.includes('__relinked_'))).toBe(false);
  });

  it('only walks the scoped match\'s own match_artifacts subfolder when a matchId scope is given', () => {
    const userData = makeTempDir();
    tempDirs.push(userData);
    const dbPath = path.join(userData, 'wildgate_db.json');

    const targetCapture = 'capture_2026-03-08T10-00-00-000Z.png';
    const otherCapture = 'capture_2026-03-08T11-00-00-000Z.png';
    const targetDir = path.join(userData, 'match_artifacts', '401');
    const otherDir = path.join(userData, 'match_artifacts', '402');

    writeFile(path.join(targetDir, targetCapture), 'target-image');
    writeFile(path.join(otherDir, otherCapture), 'other-image');

    const db = {
      matches: [
        { id: 401, timestamp: Date.parse('2026-03-08T10:00:00.000Z'), time: '10:00', artifacts: [] },
        { id: 402, timestamp: Date.parse('2026-03-08T11:00:00.000Z'), time: '10:00', artifacts: [] },
      ],
      storageMeta: { nextCanonicalMatchNumber: 403 },
    };
    fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

    const readdirSpy = vi.spyOn(fs, 'readdirSync');

    const result = applyArtifactRepair({
      dbPath,
      userData,
      scope: {
        matchId: 401,
        startTime: Date.parse('2026-03-08T09:55:00.000Z'),
        endTime: Date.parse('2026-03-08T10:05:00.000Z'),
      },
    });

    const scannedDirs = readdirSpy.mock.calls.map((call) => path.resolve(String(call[0])));
    readdirSpy.mockRestore();

    // The scoped fast-path should never touch match 402's subfolder, or the
    // match_artifacts root itself — only the scoped match's own subfolder.
    expect(scannedDirs).not.toContain(path.resolve(otherDir));
    expect(scannedDirs).not.toContain(path.resolve(path.join(userData, 'match_artifacts')));
    expect(scannedDirs).toContain(path.resolve(targetDir));

    const updatedDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    expect(result.summary.appliedLinks).toBe(1);
    expect(updatedDb.matches[0].artifacts).toHaveLength(1);
    expect(path.basename(updatedDb.matches[0].artifacts[0])).toBe(targetCapture);
    expect(updatedDb.matches[1].artifacts).toHaveLength(0);
  });

  it('preserves full unscoped walking so the manual repair-whole-library action still finds every match', () => {
    const userData = makeTempDir();
    tempDirs.push(userData);
    const dbPath = path.join(userData, 'wildgate_db.json');

    const firstCapture = 'capture_2026-03-08T10-00-00-000Z.png';
    const secondCapture = 'capture_2026-03-08T11-00-00-000Z.png';
    const firstDir = path.join(userData, 'match_artifacts', '501');
    const secondDir = path.join(userData, 'match_artifacts', '502');

    writeFile(path.join(firstDir, firstCapture), 'first-image');
    writeFile(path.join(secondDir, secondCapture), 'second-image');

    const db = {
      matches: [
        { id: 501, timestamp: Date.parse('2026-03-08T10:00:00.000Z'), time: '10:00', artifacts: [] },
        { id: 502, timestamp: Date.parse('2026-03-08T11:00:00.000Z'), time: '10:00', artifacts: [] },
      ],
      storageMeta: { nextCanonicalMatchNumber: 503 },
    };
    fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

    const result = applyArtifactRepair({ dbPath, userData });
    const updatedDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    expect(result.summary.appliedLinks).toBe(2);
    expect(updatedDb.matches[0].artifacts).toHaveLength(1);
    expect(updatedDb.matches[1].artifacts).toHaveLength(1);
    expect(path.basename(updatedDb.matches[0].artifacts[0])).toBe(firstCapture);
    expect(path.basename(updatedDb.matches[1].artifacts[0])).toBe(secondCapture);
  });
});
