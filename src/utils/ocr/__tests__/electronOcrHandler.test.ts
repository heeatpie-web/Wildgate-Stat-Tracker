import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fakeUserData = path.join(os.tmpdir(), 'wg-ocr-vitest');
fs.mkdirSync(fakeUserData, { recursive: true });

const mockId = '__wg_electron_mock_vitest__';
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
      getPath: () => fakeUserData,
      getAppPath: () => process.cwd(),
      on: () => {},
      isPackaged: false,
    },
  },
};

if (!Module.__wgElectronMockInstalled) {
  const originalResolve = Module._resolveFilename.bind(Module);
  Module._resolveFilename = (request: string, parent: unknown, isMain: boolean, options: unknown) => (
    request === 'electron' ? mockId : originalResolve(request, parent, isMain, options)
  );
  Module.__wgElectronMockInstalled = true;
}

const { __test__ } = require('../../../../electron/ocrHandler.cjs') as {
  __test__: {
    cleanupLegacyExtraction: (input: Record<string, any>) => Record<string, any>;
    convertCrewHubToLegacy: (crewHubData: Record<string, any>, rawText: string) => Record<string, any>;
    getMaxTeammatesForShipType: (shipType: string) => number;
  };
};

describe('electron/ocrHandler crew-hub teammate cleanup', () => {
  it('keeps up to four crew-hub teammates even when a ship type would imply fewer slots', () => {
    const result = __test__.convertCrewHubToLegacy(
      {
        yourTeam: {
          name: 'Friendly',
          shipType: 'Outlaw',
          players: ['AlixThus', 'Riv2I9', 'Capman', 'JrmJr'],
        },
        enemyTeams: [],
        hazards: [],
        confidence: 80,
      },
      ''
    );

    expect(result.screenshotType).toBe('crew_hub');
    expect((result.teammates || []).map((player: Record<string, any>) => player.name)).toEqual([
      'AlixThus',
      'Riv2I9',
      'Capman',
      'JrmJr',
    ]);
  });

  it('does not ship-cap crew-hub teammate cleanup when the screenshot type is crew_hub', () => {
    const result = __test__.cleanupLegacyExtraction({
      screenshotType: 'crew_hub',
      playerShip: { shipType: 'Outlaw' },
      teammates: [
        { name: 'Riv2I9', confidence: 80 },
        { name: 'Capman', confidence: 79 },
        { name: 'JrmJr', confidence: 78 },
      ],
      opponentTeams: [],
      enemyShips: [],
    });

    expect((result.teammates || []).map((player: Record<string, any>) => player.name)).toEqual([
      'Riv2I9',
      'Capman',
      'JrmJr',
    ]);
  });

  it('marks legacy string-only crew-hub names as inferred confidence', () => {
    const result = __test__.convertCrewHubToLegacy(
      {
        yourTeam: {
          name: 'Friendly',
          shipType: 'Hunter',
          players: ['PilotOne'],
        },
        enemyTeams: [
          {
            name: 'Red Team',
            color: 'red',
            players: ['EnemyOne'],
            confidence: 81,
          },
        ],
        hazards: [],
        confidence: 80,
      },
      ''
    );

    expect(result.teammates?.[0]).toMatchObject({
      name: 'PilotOne',
      confidenceSource: 'legacy_default',
    });
    expect(result.opponentTeams?.[0]?.players?.[0]).toMatchObject({
      name: 'EnemyOne',
      confidenceSource: 'legacy_default',
    });
  });

  it('still applies ship-capacity cleanup to tactical-map teammate lists', () => {
    expect(__test__.getMaxTeammatesForShipType('Outlaw')).toBe(1);

    const result = __test__.cleanupLegacyExtraction({
      screenshotType: 'tactical_map',
      playerShip: { shipType: 'Outlaw' },
      teammates: [
        { name: 'Riv2I9', confidence: 80 },
        { name: 'Capman', confidence: 79 },
        { name: 'JrmJr', confidence: 78 },
      ],
      opponentTeams: [],
      enemyShips: [],
    });

    expect((result.teammates || []).map((player: Record<string, any>) => player.name)).toEqual([
      'Riv2I9',
    ]);
  });
});
