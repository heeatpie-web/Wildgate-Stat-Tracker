import Module from 'node:module';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

// ocrHandler reads electron's app paths at module load. Redirect the bare
// 'electron' specifier to a stub the same way scripts/ocr_corpus_run_pipeline
// does, so the pure helpers can be exercised without an Electron runtime.
const mockId = '__wg_electron_mock_ocrhandler_test__';
require.cache[mockId] = {
  id: mockId,
  filename: mockId,
  loaded: true,
  parent: null,
  children: [],
  paths: [],
  exports: {
    ipcMain: { handle: () => {}, on: () => {} },
    app: {
      getPath: () => process.cwd(),
      getAppPath: () => process.cwd(),
      on: () => {},
      isPackaged: false,
    },
  },
};
const originalResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = (request, parent, isMain, options) => (
  request === 'electron' ? mockId : originalResolve(request, parent, isMain, options)
);

const { __test__ } = require('./ocrHandler.cjs');
const { cleanupLegacyTeammates } = __test__;

const names = (list) => list.map((entry) => entry.name);

describe('cleanupLegacyTeammates capacity handling', () => {
  it('keeps the highest-confidence names when over ship capacity', () => {
    // Scout seats 3, so 2 teammates. The low-confidence false positive appears
    // first; truncating in list order used to evict a real crew member.
    const result = cleanupLegacyTeammates(
      [
        { name: 'Bogus', confidence: 20 },
        { name: 'RealOne', confidence: 96 },
        { name: 'RealTwo', confidence: 94 },
      ],
      'scout'
    );
    expect(names(result)).toEqual(['RealOne', 'RealTwo']);
  });

  it('preserves roster order among survivors rather than confidence order', () => {
    const result = cleanupLegacyTeammates(
      [
        { name: 'Alpha', confidence: 80 },
        { name: 'Bravo', confidence: 20 },
        { name: 'Charlie', confidence: 99 },
      ],
      'scout'
    );
    expect(names(result)).toEqual(['Alpha', 'Charlie']);
  });

  it('falls back to extraction order when confidences tie', () => {
    const result = cleanupLegacyTeammates(
      [
        { name: 'FirstSeen', confidence: 99 },
        { name: 'SecondSeen', confidence: 99 },
        { name: 'ThirdSeen', confidence: 99 },
      ],
      'scout'
    );
    expect(names(result)).toEqual(['FirstSeen', 'SecondSeen']);
  });

  it('does not truncate when the crew fits', () => {
    const result = cleanupLegacyTeammates(
      [
        { name: 'AlphaOne', confidence: 90 },
        { name: 'BravoTwo', confidence: 40 },
      ],
      'hunter'
    );
    expect(names(result)).toEqual(['AlphaOne', 'BravoTwo']);
  });
});
