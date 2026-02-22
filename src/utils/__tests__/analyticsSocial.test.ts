import { describe, it, expect } from 'vitest';
import { calculateSocialData, calculateSynergyMatrix, calculateRelationshipAnalytics } from '../analyticsSocial';
import type { Match } from '../../types';

// ── Helpers ──

const createMatch = (overrides: Partial<Match> = {}): Match => ({
  id: Date.now() + Math.random(),
  timestamp: Date.now(),
  date: new Date().toISOString(),
  mode: 'Artifact Brawl',
  player: 'TestPlayer',
  teammates: [],
  opponents: [],
  hero: 'Adrian',
  ship: 'Hunter (4 Player)',
  reachModifiers: [],
  kills: {},
  result: 'Win',
  subType: '',
  ...overrides,
});

// ── calculateSocialData ──

describe('calculateSocialData', () => {
  it('returns empty arrays for no matches', () => {
    const result = calculateSocialData([]);
    expect(result.teammates).toEqual([]);
    expect(result.opponents).toEqual([]);
  });

  it('counts teammate win rates correctly', () => {
    const matches = [
      createMatch({ teammates: ['Ally1'], result: 'Win' }),
      createMatch({ teammates: ['Ally1'], result: 'Win' }),
      createMatch({ teammates: ['Ally1'], result: 'Loss' }),
    ];
    const result = calculateSocialData(matches);
    const ally1 = result.teammates.find(([name]) => name === 'Ally1');
    expect(ally1).toBeDefined();
    expect(ally1![1].wins).toBe(2);
    expect(ally1![1].total).toBe(3);
  });

  it('counts opponent encounter rates', () => {
    const matches = [
      createMatch({ opponents: ['Enemy1'], result: 'Win' }),
      createMatch({ opponents: ['Enemy1'], result: 'Loss' }),
    ];
    const result = calculateSocialData(matches);
    const enemy = result.opponents.find(([name]) => name === 'Enemy1');
    expect(enemy).toBeDefined();
    expect(enemy![1].total).toBe(2);
    expect(enemy![1].wins).toBe(1);
  });

  it('sorts by win rate descending, then by total encounters', () => {
    const matches = [
      createMatch({ teammates: ['A'], result: 'Win' }),
      createMatch({ teammates: ['A'], result: 'Win' }),
      createMatch({ teammates: ['B'], result: 'Win' }),
      createMatch({ teammates: ['B'], result: 'Loss' }),
      createMatch({ teammates: ['B'], result: 'Loss' }),
    ];
    const result = calculateSocialData(matches);
    // A: 100% WR (2/2), B: 33% WR (1/3)
    expect(result.teammates[0][0]).toBe('A');
    expect(result.teammates[1][0]).toBe('B');
  });
});

// ── calculateSynergyMatrix ──

describe('calculateSynergyMatrix', () => {
  it('returns matrix with all ship-hero combinations', () => {
    const matrix = calculateSynergyMatrix([]);
    // Should have entries for each ship
    expect(Object.keys(matrix).length).toBeGreaterThan(0);
    // Each ship should have entries for each hero
    const firstShip = Object.values(matrix)[0];
    expect(Object.keys(firstShip).length).toBeGreaterThan(0);
  });

  it('populates win/total from matches', () => {
    const matches = [
      createMatch({ ship: 'Hunter (4 Player)', hero: 'Adrian', result: 'Win' }),
      createMatch({ ship: 'Hunter (4 Player)', hero: 'Adrian', result: 'Loss' }),
      createMatch({ ship: 'Hunter (4 Player)', hero: 'Adrian', result: 'Win' }),
    ];
    const matrix = calculateSynergyMatrix(matches);
    expect(matrix.Hunter.Adrian.wins).toBe(2);
    expect(matrix.Hunter.Adrian.total).toBe(3);
  });

  it('handles unknown ships gracefully', () => {
    const matches = [
      createMatch({ ship: 'UnknownShip', hero: 'Adrian', result: 'Win' }),
    ];
    // Should not throw
    const matrix = calculateSynergyMatrix(matches);
    expect(matrix).toBeDefined();
  });
});

// ── calculateRelationshipAnalytics ──

describe('calculateRelationshipAnalytics', () => {
  it('returns empty for undefined profiles', () => {
    expect(calculateRelationshipAnalytics(undefined, undefined)).toEqual([]);
  });

  it('returns empty for fewer than 3 profiles', () => {
    const profiles = {
      'p1': {
        id: 'p1', sightings: 1, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: {}, playedAgainst: {}, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
    };
    expect(calculateRelationshipAnalytics(profiles, {})).toEqual([]);
  });

  it('identifies a nemesis (frequent opponent)', () => {
    const profiles = {
      'p1': {
        id: 'p1', name: 'NemesisPlayer', sightings: 10, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: {}, playedAgainst: { 'me': 5 }, shipsObserved: { 'Hunter': 3 },
        ocrSightings: 0, manualSightings: 0,
      },
      'p2': {
        id: 'p2', name: 'AllyPlayer', sightings: 8, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: { 'me': 5 }, playedAgainst: {}, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
      'p3': {
        id: 'p3', name: 'SomeoneElse', sightings: 2, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: { 'me': 1 }, playedAgainst: {}, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
    };
    const insights = calculateRelationshipAnalytics(profiles, {});
    const nemesis = insights.find(i => i.type === 'nemesis');
    expect(nemesis).toBeDefined();
    expect(nemesis!.playerName).toBe('NemesisPlayer');
  });

  it('identifies a loyal ally (frequent teammate)', () => {
    const profiles = {
      'p1': {
        id: 'p1', name: 'BestFriend', sightings: 10, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: { 'me': 8 }, playedAgainst: { 'me': 1 }, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
      'p2': {
        id: 'p2', name: 'Enemy', sightings: 5, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: {}, playedAgainst: { 'me': 5 }, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
      'p3': {
        id: 'p3', name: 'Filler', sightings: 1, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: {}, playedAgainst: {}, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
    };
    const insights = calculateRelationshipAnalytics(profiles, {});
    const ally = insights.find(i => i.type === 'ally');
    expect(ally).toBeDefined();
    expect(ally!.playerName).toBe('BestFriend');
  });

  it('identifies a stalker (high sightings, mixed role)', () => {
    const profiles = {
      'p1': {
        id: 'p1', name: 'Stalker', sightings: 10, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: { 'me': 4 }, playedAgainst: { 'me': 4 }, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
      'p2': {
        id: 'p2', sightings: 2, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: {}, playedAgainst: {}, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
      'p3': {
        id: 'p3', sightings: 1, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: {}, playedAgainst: {}, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
    };
    const insights = calculateRelationshipAnalytics(profiles, {});
    const stalker = insights.find(i => i.type === 'stalker');
    expect(stalker).toBeDefined();
    expect(stalker!.playerName).toBe('Stalker');
  });

  it('identifies a rival (mixed with significant both-side encounters)', () => {
    const profiles = {
      'p1': {
        id: 'p1', name: 'RivalPlayer', sightings: 8, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: { 'me': 3 }, playedAgainst: { 'me': 3 }, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
      'p2': {
        id: 'p2', sightings: 2, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: {}, playedAgainst: {}, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
      'p3': {
        id: 'p3', sightings: 1, firstSeen: 0, lastSeen: 0,
        teamsObserved: {}, playedWith: {}, playedAgainst: {}, shipsObserved: {},
        ocrSightings: 0, manualSightings: 0,
      },
    };
    const insights = calculateRelationshipAnalytics(profiles, {});
    const rival = insights.find(i => i.type === 'rival');
    expect(rival).toBeDefined();
    expect(rival!.playerName).toBe('RivalPlayer');
  });
});
