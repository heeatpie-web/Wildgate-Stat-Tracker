import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fakeUserData = path.join(os.tmpdir(), 'wg-ocr-vitest');
fs.mkdirSync(fakeUserData, { recursive: true });

const mockId = '__wg_electron_mock_vitest__';
(require.cache as any)[mockId] = {
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

const ocrHandlerModule = require('../../../../electron/ocrHandler.cjs');
const { createOcrProgressReporter } = ocrHandlerModule as {
  createOcrProgressReporter: (
    sender: unknown,
    opts?: { imageIndex?: number; imageCount?: number; requestId?: string | null },
  ) => ((stage: string, fraction: number) => void) | null;
};
const { __test__ } = ocrHandlerModule as {
  __test__: {
    cleanupLegacyExtraction: (input: Record<string, any>) => Record<string, any>;
    convertCrewHubToLegacy: (crewHubData: Record<string, any>, rawText: string) => Record<string, any>;
    deriveRuntimeAnchors: (
      screenType: string,
      ocrResult: Record<string, any>,
      processed: Record<string, any>,
      ocrRegions?: Record<string, any> | null,
    ) => Record<string, any> | null;
    findHeaderAnchorY: (
      words: Array<Record<string, any>>,
      regexes: RegExp[],
      xMin?: number,
      xMax?: number,
      yMin?: number,
      yMax?: number,
    ) => number | null;
    getMaxTeammatesForShipType: (shipType: string) => number;
    restoreHiddenCaptureWindow: (mainWindow: Record<string, any> | null | undefined, options?: { wasVisible?: boolean }) => void;
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

  it('marks crew-hub string-only names as direct OCR confidence', () => {
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
      confidenceSource: 'direct_ocr',
    });
    expect(result.opponentTeams?.[0]?.players?.[0]).toMatchObject({
      name: 'EnemyOne',
      confidenceSource: 'direct_ocr',
    });
  });

  it('preserves every detected enemy team when crew-hub OCR finds more than four', () => {
    const result = __test__.convertCrewHubToLegacy(
      {
        yourTeam: {
          name: 'Friendly',
          shipType: 'Hunter',
          players: ['PilotOne'],
        },
        enemyTeams: [
          { name: 'Team Red', color: 'red', players: ['EnemyA'], confidence: 81 },
          { name: 'Team Orange', color: 'orange', players: ['EnemyB'], confidence: 82 },
          { name: 'Team Black', color: 'black', players: ['EnemyC'], confidence: 83 },
          { name: 'Team Lime', color: 'limeGreen', players: ['EnemyD'], confidence: 84 },
          { name: 'Team Gold', color: 'goldenrod', players: ['EnemyE'], confidence: 85 },
        ],
        hazards: [],
        confidence: 80,
      },
      ''
    );

    expect(result.opponentTeams).toHaveLength(5);
    expect(result.opponentTeams?.map((team: Record<string, any>) => team.teamName)).toEqual([
      'Team Red',
      'Team Orange',
      'Team Black',
      'Team Lime',
      'Team Gold',
    ]);
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

  it('restores a hidden capture window without focusing it', () => {
    const showInactive = vi.fn();
    const focus = vi.fn();
    __test__.restoreHiddenCaptureWindow({
      isDestroyed: () => false,
      showInactive,
      focus,
    }, { wasVisible: true });

    expect(showInactive).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it('detects merged tactical-map header tokens when deriving runtime anchors', () => {
    const anchors = __test__.deriveRuntimeAnchors(
      'mapScreen',
      {
        words: [
          {
            text: 'ENEMYSHIPS',
            confidence: 88,
            bbox: { x0: 1700, x1: 1880, y0: 60, y1: 96 },
          },
          {
            text: 'KNOWNHAZARDSFEATURES',
            confidence: 84,
            bbox: { x0: 1540, x1: 1888, y0: 322, y1: 360 },
          },
        ],
      },
      {
        width: 1920,
        height: 1080,
      },
      {
        mapScreen: {
          enemyShips: { xMin: 0.83 },
        },
      }
    );

    expect(anchors?.mapScreen?.enemyShipsHeaderY).toBeCloseTo(78 / 1080, 4);
    expect(anchors?.mapScreen?.hazardsHeaderY).toBeCloseTo(341 / 1080, 4);
  });
});

describe('electron/ocrHandler createOcrProgressReporter', () => {
  const makeSender = () => {
    const sent: Array<{ channel: string; payload: Record<string, any> }> = [];
    return {
      sent,
      isDestroyed: () => false,
      send: (channel: string, payload: Record<string, any>) => { sent.push({ channel, payload }); },
    };
  };

  it('sends stage progress on the ocr-progress channel', () => {
    const sender = makeSender();
    const report = createOcrProgressReporter(sender);

    report?.('recognize', 0.5);

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].channel).toBe('ocr-progress');
    expect(sender.sent[0].payload).toMatchObject({
      stage: 'recognize',
      imageFraction: 0.5,
      fraction: 0.5,
      imageIndex: 0,
      imageCount: 1,
    });
  });

  it('folds per-image progress into an overall fraction across a multi-image run', () => {
    const sender = makeSender();

    // Halfway through the second of four images is 37.5% overall, not 50%.
    createOcrProgressReporter(sender, { imageIndex: 1, imageCount: 4 })?.('recognize', 0.5);

    expect(sender.sent[0].payload.fraction).toBeCloseTo(0.375, 5);
    expect(sender.sent[0].payload.imageFraction).toBeCloseTo(0.5, 5);
  });

  it('clamps fractions into 0-1', () => {
    const sender = makeSender();
    const report = createOcrProgressReporter(sender);

    report?.('extract', 5);
    report?.('decode', -3);

    expect(sender.sent[0].payload.fraction).toBe(1);
    expect(sender.sent[1].payload.fraction).toBe(0);
  });

  it('returns null without a sender and never throws on a destroyed one', () => {
    expect(createOcrProgressReporter(null)).toBeNull();

    const destroyed = {
      isDestroyed: () => true,
      send: () => { throw new Error('window is gone'); },
    };
    expect(() => createOcrProgressReporter(destroyed)?.('recognize', 0.5)).not.toThrow();
  });
});
