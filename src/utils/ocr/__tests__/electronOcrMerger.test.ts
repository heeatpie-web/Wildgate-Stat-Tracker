import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  mergeCaptures,
  mergeEnemyShips,
  mergeEnemyTeams,
} = require('../../../../electron/ocrMerger.cjs') as {
  mergeCaptures: (existing: Record<string, unknown>, incoming: Record<string, unknown>) => Record<string, any>;
  mergeEnemyShips: (existing: Array<Record<string, any>>, incoming: Array<Record<string, any>>) => Array<Record<string, any>>;
  mergeEnemyTeams: (existing: Array<Record<string, any>>, incoming: Array<Record<string, any>>) => Array<Record<string, any>>;
};

describe('electron/ocrMerger positional metadata', () => {
  it('preserves source row metadata when merging crew hub teams', () => {
    const result = mergeEnemyTeams(
      [
        {
          name: 'Yellow Team',
          color: 'yellow',
          shipType: '',
          players: ['Y1'],
          confidence: 60,
        },
      ],
      [
        {
          name: 'Yellow Team',
          color: 'yellow',
          shipType: '',
          players: ['Y2'],
          confidence: 80,
          sourceRowIndex: 2,
          sourceRowY: 320,
        },
      ]
    );

    expect(result[0].sourceRowIndex).toBe(2);
    expect(result[0].sourceRowY).toBe(320);
  });

  it('preserves source slot metadata when merging tactical-map ships', () => {
    const result = mergeEnemyShips(
      [
        {
          teamName: 'Yellow Team',
          shipType: 'Scout',
          color: 'unknown',
          confidence: 60,
        },
      ],
      [
        {
          teamName: 'Yellow Team',
          shipType: 'Scout',
          color: 'unknown',
          confidence: 80,
          sourceSlotIndex: 2,
          sourceSlotY: 140,
        },
      ]
    );

    expect(result[0].sourceSlotIndex).toBe(2);
    expect(result[0].sourceSlotY).toBe(140);
  });

  it('pairs legacy crew hub teams with tactical-map slots by source row before color fallback', () => {
    const merged = mergeCaptures(
      {
        screenshotType: 'crew_hub',
        playerTeamName: 'Friendly',
        playerShipName: 'Friendly',
        teammates: [],
        reachModifiers: [],
        overallConfidence: 82,
        captureTimestamp: 1,
        opponentTeams: [
          {
            teamName: 'Red Team',
            shipType: '',
            color: 'red',
            players: ['R1'],
            confidence: 80,
            sourceRowIndex: 0,
            sourceRowY: 100,
          },
          {
            teamName: 'Orange Team',
            shipType: '',
            color: 'orange',
            players: ['O1'],
            confidence: 80,
            sourceRowIndex: 1,
            sourceRowY: 200,
          },
          {
            teamName: 'Enemy Team 3',
            shipType: '',
            color: 'unknown',
            players: ['Y1'],
            confidence: 80,
            sourceRowIndex: 2,
            sourceRowY: 300,
          },
          {
            teamName: 'Enemy Team 4',
            shipType: '',
            color: 'yellowgreen',
            players: ['YG1'],
            confidence: 80,
            sourceRowIndex: 3,
            sourceRowY: 400,
          },
        ],
      },
      {
        screenshotType: 'tactical_map',
        playerShipName: 'Friendly',
        playerTeamName: 'Friendly',
        playerShip: {
          shipType: 'Hunter',
          teamName: 'Friendly',
          confidence: 80,
        },
        teammates: [],
        reachModifiers: [],
        overallConfidence: 84,
        captureTimestamp: 1,
        opponentTeams: [
          {
            teamName: 'Red Team',
            shipType: 'Hunter',
            color: 'red',
            confidence: 85,
            sourceSlotIndex: 0,
            sourceSlotY: 110,
          },
          {
            teamName: 'Orange Team',
            shipType: 'Bastion',
            color: 'orange',
            confidence: 85,
            sourceSlotIndex: 1,
            sourceSlotY: 210,
          },
          {
            teamName: 'Yellow Team',
            shipType: 'Scout',
            color: 'unknown',
            confidence: 85,
            sourceSlotIndex: 2,
            sourceSlotY: 310,
          },
          {
            teamName: 'Yellow-Green Team',
            shipType: 'Privateer',
            color: 'unknown',
            confidence: 85,
            sourceSlotIndex: 3,
            sourceSlotY: 410,
          },
        ],
      }
    );

    const yellowTeam = (merged.opponentTeams || []).find((team: Record<string, any>) => (team.players || []).includes('Y1'));
    const yellowGreenTeam = (merged.opponentTeams || []).find((team: Record<string, any>) => (team.players || []).includes('YG1'));

    expect(yellowTeam).toMatchObject({
      teamName: 'Yellow Team',
      shipType: 'Scout',
      sourceRowIndex: 2,
    });
    expect(yellowGreenTeam).toMatchObject({
      teamName: 'Yellow-Green Team',
      shipType: 'Privateer',
      sourceRowIndex: 3,
    });
  });
});
