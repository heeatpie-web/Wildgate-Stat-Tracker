import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { mergeCaptures, pickPreferredTeammateRoster } = require('./ocrMerger.cjs');

describe('ocrMerger positional fallback', () => {
  it('does not reuse a map ship already claimed by a different enemy team', () => {
    const crew = {
      screenType: 'crewHub',
      enemyTeams: [
        {
          name: 'MINIMUMVIABLEPOPCORN',
          nameSource: 'team_bar',
          color: 'red',
          shipType: '',
          players: ['frncrd', 'Xiphorix'],
          sourceRowIndex: 0,
          sourceRowY: 537,
        },
        {
          name: 'Team 1',
          nameSource: 'fallback',
          color: 'orange',
          shipType: '',
          players: ['MizzleMist'],
          sourceRowIndex: 1,
          sourceRowY: 993,
        },
      ],
    };

    const map = {
      screenType: 'mapScreen',
      enemyShips: [
        {
          teamName: 'MINIMUMVIABLEPOPCORN',
          shipType: 'Hunter',
          color: 'orange',
          sourceSlotIndex: 0,
          sourceSlotY: 313.2,
        },
        {
          teamName: 'LUCKY13',
          shipType: 'Solo Outlaw',
          color: 'unknown',
          sourceSlotIndex: 1,
          sourceSlotY: 410.5,
        },
      ],
    };

    const merged = mergeCaptures(crew, map);
    const redTeam = merged.enemyTeams.find((team) => team.color === 'red');
    const orangeTeam = merged.enemyTeams.find((team) => team.color === 'orange');

    expect(redTeam).toEqual(expect.objectContaining({ name: 'MINIMUMVIABLEPOPCORN', shipType: 'Hunter' }));
    expect(orangeTeam).toEqual(expect.objectContaining({ name: 'LUCKY13', shipType: 'Solo Outlaw' }));
  });
});


describe('ocrMerger legacy crew_hub + tactical_map merge', () => {
  it('backfills the remaining map ship instead of reusing the already matched team', () => {
    const crewHub = {
      screenshotType: 'crew_hub',
      teammates: ['Tone', 'fartingPuppy', 'Braiker'],
      opponentTeams: [
        {
          teamName: 'MINIMUMVIABLEPOPCORN',
          teamNameSource: 'team_bar',
          color: 'red',
          shipType: '',
          players: ['frncrd', 'Xiphorix', 'eet'],
          sourceRowIndex: 0,
          sourceRowY: 537,
          confidence: 100,
        },
        {
          teamName: 'Team 1',
          teamNameSource: 'fallback',
          color: 'orange',
          shipType: '',
          players: ['MizzleMist'],
          sourceRowIndex: 1,
          sourceRowY: 993,
          confidence: 96,
        },
      ],
      reachModifiers: [],
    };

    const tacticalMap = {
      screenshotType: 'tactical_map',
      opponentTeams: [
        {
          teamName: 'MINIMUMVIABLEPOPCORN',
          shipType: 'Hunter',
          color: 'orange',
          confidence: 82,
          sourceSlotIndex: 0,
          sourceSlotY: 313.2,
          players: [],
        },
        {
          teamName: 'LUCKY13',
          shipType: 'Solo Outlaw',
          color: 'unknown',
          confidence: 72,
          sourceSlotIndex: 1,
          sourceSlotY: 410.5,
          players: [],
        },
      ],
      teammates: ['Tone', 'fartingPuppy', 'Braiker'],
      reachModifiers: [],
    };

    const merged = mergeCaptures(crewHub, tacticalMap);
    const redTeam = merged.opponentTeams.find((team) => team.color === 'red');
    const orangeTeam = merged.opponentTeams.find((team) => team.color === 'orange');

    expect(redTeam).toEqual(expect.objectContaining({ teamName: 'MINIMUMVIABLEPOPCORN', shipType: 'Hunter' }));
    expect(orangeTeam).toEqual(expect.objectContaining({ teamName: 'LUCKY13', shipType: 'Solo Outlaw' }));
    expect(orangeTeam.players).toEqual(['MizzleMist']);
  });
});

describe('ocrMerger legacy crew_hub overflow preservation', () => {
  it('keeps additional enemy teams instead of dropping the fifth team during scroll merges', () => {
    const existing = {
      screenshotType: 'crew_hub',
      playerTeamName: 'Friendly',
      teammates: ['PilotOne'],
      opponentTeams: [
        { teamName: 'Team Red', color: 'red', players: ['EnemyA'], confidence: 81 },
        { teamName: 'Team Orange', color: 'orange', players: ['EnemyB'], confidence: 82 },
        { teamName: 'Team Black', color: 'black', players: ['EnemyC'], confidence: 83 },
        { teamName: 'Team Lime', color: 'limeGreen', players: ['EnemyD'], confidence: 84 },
      ],
      reachModifiers: [],
      overallConfidence: 80,
    };

    const incoming = {
      screenshotType: 'crew_hub',
      playerTeamName: 'Friendly',
      teammates: ['PilotOne'],
      opponentTeams: [
        { teamName: 'Team Gold', color: 'goldenrod', players: ['EnemyE'], confidence: 85 },
      ],
      reachModifiers: [],
      overallConfidence: 82,
    };

    const merged = mergeCaptures(existing, incoming);

    expect(merged.opponentTeams).toHaveLength(5);
    expect(merged.opponentTeams.map((team) => team.teamName)).toEqual(expect.arrayContaining([
      'Team Red',
      'Team Orange',
      'Team Black',
      'Team Lime',
      'Team Gold',
    ]));
  });
});

describe('pickPreferredTeammateRoster', () => {
  it('prefers the clean crew-hub roster over an equally sized polluted merge', () => {
    const mergedRoster = [
      { name: 'Blakah', confidence: 93 },
      { name: 'Braikeit', confidence: 94 },
      { name: 'Braiker', confidence: 94 },
      { name: 'AlixThus', confidence: 92 },
    ];
    const crewHubRoster = [
      { name: 'LankyBastard', confidence: 88 },
      { name: 'NobleGnocchi', confidence: 87 },
      { name: 'Braiker', confidence: 90 },
      { name: 'AlixThus', confidence: 89 },
    ];

    const preferred = pickPreferredTeammateRoster(mergedRoster, crewHubRoster);

    expect(preferred.map((player) => player.name)).toEqual([
      'LankyBastard',
      'NobleGnocchi',
      'Braiker',
      'AlixThus',
    ]);
  });

  it('keeps the fuller merged roster when the crew-hub fallback is partial', () => {
    const mergedRoster = [
      { name: 'Tone', confidence: 92 },
      { name: 'Braiker', confidence: 93 },
      { name: 'NobleGnocchi', confidence: 87 },
    ];
    const crewHubRoster = [
      { name: 'Tone', confidence: 95 },
      { name: 'Braiker', confidence: 95 },
    ];

    const preferred = pickPreferredTeammateRoster(mergedRoster, crewHubRoster);

    expect(preferred.map((player) => player.name)).toEqual([
      'Tone',
      'Braiker',
      'NobleGnocchi',
    ]);
  });
});
