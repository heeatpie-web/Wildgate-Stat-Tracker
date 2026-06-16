import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyOcrAliasModel, recordAliasCorrection } from '../../utils/ocrAliasEngine';

const gameDataState = {
  matches: [] as Array<Record<string, unknown>>,
  pilotRegistry: [] as string[],
  pilotAliases: {} as Record<string, string[]>,
  playerProfiles: {},
  knownMappings: {} as Record<string, string>,
  ocrAliasModel: createEmptyOcrAliasModel(),
  isMatchInProgress: false,
  matchStartTime: null as number | null,
};

const uiState = {
  activeMode: 'Fleet Battle',
};

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => gameDataState,
}));

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

describe('useAnalyticsData', () => {
  beforeEach(() => {
    gameDataState.pilotRegistry = [];
    gameDataState.pilotAliases = {};
    gameDataState.playerProfiles = {};
    gameDataState.knownMappings = {};
    gameDataState.ocrAliasModel = createEmptyOcrAliasModel();
    gameDataState.isMatchInProgress = false;
    gameDataState.matchStartTime = null;
    gameDataState.matches = [];
  });

  it('holds back completed matches written during an active match until the active flag drops', async () => {
    const now = Date.now();
    gameDataState.matches = [
      {
        id: 1,
        timestamp: now - 60_000,
        date: '2026-03-07',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['Wing'],
        opponents: ['Enemy'],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Win',
        subType: 'Combat',
      },
      {
        id: 2,
        timestamp: now + 1_000,
        date: '2026-03-07',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['Wing'],
        opponents: ['Enemy'],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Loss',
        subType: 'Combat',
      },
    ];
    gameDataState.isMatchInProgress = true;
    gameDataState.matchStartTime = now;

    const { useAnalyticsData } = await import('./useAnalyticsData');
    const { result, rerender } = renderHook(() => useAnalyticsData('all'));

    expect(result.current.filteredMatches.map((match) => match.id)).toEqual([1]);

    gameDataState.isMatchInProgress = false;
    rerender();

    expect(result.current.filteredMatches.map((match) => match.id)).toEqual([1, 2]);
  });

  it('applies ship, weapon, and equipment entity filters to analytics matches while preserving the base option set', async () => {
    const now = Date.now();
    gameDataState.matches = [
      {
        id: 1,
        timestamp: now - 90_000,
        date: '2026-03-16',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['Wing'],
        opponents: ['Enemy'],
        hero: 'Adrian',
        ship: 'Hunter',
        loadout: {
          hero: 'Adrian',
          ship: 'Hunter',
          weapons: [],
          equipment: [],
          characterWeapons: ['Foam Gun'],
          characterEquipment: ['Repulsor'],
          perks: [],
        },
        reachModifiers: [],
        kills: {},
        result: 'Win',
        subType: 'Combat',
      },
      {
        id: 2,
        timestamp: now - 60_000,
        date: '2026-03-16',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['Wing'],
        opponents: ['Enemy'],
        hero: 'Adrian',
        ship: 'Bastion',
        loadout: {
          hero: 'Adrian',
          ship: 'Bastion',
          weapons: [],
          equipment: [],
          characterWeapons: ['Rocket Launcher'],
          characterEquipment: ['Plasma Grenade'],
          perks: [],
        },
        reachModifiers: [],
        kills: {},
        result: 'Loss',
        subType: 'Combat',
      },
    ];

    const { useAnalyticsData } = await import('./useAnalyticsData');
    const { result, rerender } = renderHook(
      ({ filters }) => useAnalyticsData('all', 20, undefined, filters),
      {
        initialProps: {
          filters: {
            ship: ['Hunter'] as string[],
            prospectorWeapon: [] as string[],
            equipment: [] as string[],
            perk: [] as string[],
            update: [] as string[],
          },
        },
      }
    );

    expect(result.current.rangeFilteredMatches.map((match) => match.id)).toEqual([1, 2]);
    expect(result.current.filteredMatches.map((match) => match.id)).toEqual([1]);

    rerender({
      filters: {
        ship: [],
        prospectorWeapon: ['Rocket Launcher'],
        equipment: [],
        perk: [],
        update: [],
      },
    });

    expect(result.current.rangeFilteredMatches.map((match) => match.id)).toEqual([1, 2]);
    expect(result.current.filteredMatches.map((match) => match.id)).toEqual([2]);

    rerender({
      filters: {
        ship: [],
        prospectorWeapon: [],
        equipment: ['Repulsor'],
        perk: [],
        update: [],
      },
    });

    expect(result.current.rangeFilteredMatches.map((match) => match.id)).toEqual([1, 2]);
    expect(result.current.filteredMatches.map((match) => match.id)).toEqual([1]);
  });

  it('aggregates manual aliases across teammates and opponents, including opponent teams', async () => {
    const now = Date.now();
    gameDataState.pilotRegistry = ['WingPrime', 'RivalPrime'];
    gameDataState.pilotAliases = {
      WingPrime: ['OldWing'],
      RivalPrime: ['OldRival'],
    };
    gameDataState.matches = [
      {
        id: 1,
        timestamp: now - 90_000,
        date: '2026-03-16',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['WingPrime'],
        opponents: ['RivalPrime'],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Win',
        subType: 'Combat',
      },
      {
        id: 2,
        timestamp: now - 60_000,
        date: '2026-03-16',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['OldWing'],
        opponents: [],
        opponentTeams: [{ teamName: 'Red', shipType: 'Hunter', color: 'red', players: ['OldRival'] }],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Loss',
        subType: 'Combat',
      },
    ];

    const { useAnalyticsData } = await import('./useAnalyticsData');
    const { result } = renderHook(() => useAnalyticsData('all'));

    expect(result.current.socialData.teammates).toEqual([
      ['WingPrime', { wins: 1, total: 2 }],
    ]);
    expect(result.current.socialData.opponents).toEqual([
      ['RivalPrime', { wins: 1, total: 2 }],
    ]);
    expect(result.current.filteredMatches[1].opponents).toEqual(['RivalPrime']);
    expect(result.current.filteredMatches[1].opponentTeams?.[0]?.players).toEqual(['RivalPrime']);
  });

  it('aggregates learned OCR aliases across analytics outputs', async () => {
    const now = Date.now();
    gameDataState.pilotRegistry = ['AcePilot', 'EnemyPrime'];
    gameDataState.ocrAliasModel = recordAliasCorrection(createEmptyOcrAliasModel(), {
      ocrText: 'AcoPilot',
      correctedTo: 'AcePilot',
    });
    gameDataState.ocrAliasModel = recordAliasCorrection(gameDataState.ocrAliasModel, {
      ocrText: 'EnemyPr1me',
      correctedTo: 'EnemyPrime',
    });
    gameDataState.matches = [
      {
        id: 1,
        timestamp: now - 90_000,
        date: '2026-03-16',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['AcePilot'],
        opponents: ['EnemyPrime'],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Win',
        subType: 'Combat',
      },
      {
        id: 2,
        timestamp: now - 60_000,
        date: '2026-03-16',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['AcoPilot'],
        opponents: ['EnemyPr1me'],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Loss',
        subType: 'Combat',
      },
    ];

    const { useAnalyticsData } = await import('./useAnalyticsData');
    const { result } = renderHook(() => useAnalyticsData('all'));

    expect(result.current.socialData.teammates).toEqual([
      ['AcePilot', { wins: 1, total: 2 }],
    ]);
    expect(result.current.socialData.opponents).toEqual([
      ['EnemyPrime', { wins: 1, total: 2 }],
    ]);
  });

  it('dedupes old and canonical names within a single match after canonicalization', async () => {
    const now = Date.now();
    gameDataState.pilotRegistry = ['WingPrime', 'RivalPrime'];
    gameDataState.pilotAliases = {
      WingPrime: ['OldWing'],
      RivalPrime: ['OldRival'],
    };
    gameDataState.matches = [
      {
        id: 1,
        timestamp: now - 60_000,
        date: '2026-03-16',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['WingPrime', 'OldWing'],
        opponents: ['RivalPrime'],
        opponentTeams: [{ teamName: 'Red', shipType: 'Hunter', color: 'red', players: ['OldRival', 'RivalPrime'] }],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Win',
        subType: 'Combat',
      },
    ];

    const { useAnalyticsData } = await import('./useAnalyticsData');
    const { result } = renderHook(() => useAnalyticsData('all'));

    expect(result.current.socialData.teammates).toEqual([
      ['WingPrime', { wins: 1, total: 1 }],
    ]);
    expect(result.current.socialData.opponents).toEqual([
      ['RivalPrime', { wins: 1, total: 1 }],
    ]);
    expect(result.current.filteredMatches[0].teammates).toEqual(['WingPrime']);
    expect(result.current.filteredMatches[0].opponents).toEqual(['RivalPrime']);
    expect(result.current.filteredMatches[0].opponentTeams?.[0]?.players).toEqual(['RivalPrime']);
  });

  it('uses canonical pilot names for relationship insights and canonicalized profile output', async () => {
    gameDataState.pilotRegistry = ['WingPrime', 'RivalPrime', 'Anchor'];
    gameDataState.pilotAliases = {
      WingPrime: ['OldWing'],
      RivalPrime: ['OldRival'],
    };
    gameDataState.playerProfiles = {
      WingPrime: {
        id: 'WingPrime',
        name: 'WingPrime',
        sightings: 2,
        firstSeen: 10,
        lastSeen: 20,
        teamsObserved: {},
        playedWith: { me: 2 },
        playedAgainst: {},
        shipsObserved: { Hunter: 1 },
        ocrSightings: 0,
        manualSightings: 2,
      },
      OldWing: {
        id: 'OldWing',
        name: 'OldWing',
        sightings: 3,
        firstSeen: 5,
        lastSeen: 25,
        teamsObserved: {},
        playedWith: { me: 3 },
        playedAgainst: {},
        shipsObserved: { Bastion: 2 },
        ocrSightings: 1,
        manualSightings: 0,
      },
      RivalPrime: {
        id: 'RivalPrime',
        name: 'RivalPrime',
        sightings: 2,
        firstSeen: 15,
        lastSeen: 30,
        teamsObserved: {},
        playedWith: {},
        playedAgainst: { me: 2 },
        shipsObserved: { Hunter: 1 },
        ocrSightings: 0,
        manualSightings: 2,
      },
      OldRival: {
        id: 'OldRival',
        name: 'OldRival',
        sightings: 3,
        firstSeen: 8,
        lastSeen: 32,
        teamsObserved: {},
        playedWith: {},
        playedAgainst: { me: 3 },
        shipsObserved: { Scout: 2 },
        ocrSightings: 1,
        manualSightings: 0,
      },
      Anchor: {
        id: 'Anchor',
        name: 'Anchor',
        sightings: 1,
        firstSeen: 1,
        lastSeen: 2,
        teamsObserved: {},
        playedWith: { me: 1 },
        playedAgainst: {},
        shipsObserved: {},
        ocrSightings: 0,
        manualSightings: 1,
      },
    };

    const { useAnalyticsData } = await import('./useAnalyticsData');
    const { result } = renderHook(() => useAnalyticsData('all'));

    expect(result.current.playerProfiles['WingPrime']).toMatchObject({
      sightings: 5,
      playedWith: { me: 5 },
      shipsObserved: { Hunter: 1, Bastion: 2 },
    });
    expect(result.current.playerProfiles['OldWing']).toBeUndefined();

    const ally = result.current.relationshipInsights.find((insight) => insight.type === 'ally');
    const nemesis = result.current.relationshipInsights.find((insight) => insight.type === 'nemesis');
    expect(ally?.playerName).toBe('WingPrime');
    expect(ally?.encounters).toBe(5);
    expect(nemesis?.playerName).toBe('RivalPrime');
    expect(nemesis?.encounters).toBe(5);
  });
});
