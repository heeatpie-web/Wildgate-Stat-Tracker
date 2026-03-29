import { describe, expect, it } from 'vitest';
import type { Match } from '../../types';
import {
  buildPregameAdviceContextFromMatch,
  buildPregameAdviceSnapshotForMatch,
  hasPregameLobbyContext,
  isPregameAdviceSnapshotEqual,
} from '../pregameAdvice/matchAdvice';

let nextId = 1;

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: nextId++,
  timestamp: 1_700_000_000_000 + nextId,
  date: '2026-03-28',
  mode: 'Artifact Brawl',
  player: 'Pilot',
  teammates: [],
  opponents: [],
  hero: 'Adrian',
  ship: 'Hunter',
  reachModifiers: [],
  kills: {},
  result: 'Win',
  subType: 'Combat',
  ...overrides,
});

describe('pregame advice match helpers', () => {
  it('builds context from a match and falls back to flat opponents when no team structure exists', () => {
    const context = buildPregameAdviceContextFromMatch(makeMatch({
      opponents: ['Enemy1', 'Enemy2'],
      artifactSource: 'ice',
      reachModifiers: ['Ionized'],
    }));

    expect(context).toEqual({
      mode: 'Artifact Brawl',
      ship: 'Hunter',
      teammates: [],
      opponentTeams: [{
        teamName: 'Unknown Team',
        shipType: '',
        players: ['Enemy1', 'Enemy2'],
      }],
      reachModifiers: ['Ionized'],
      artifactSource: 'ice',
      draftMatchId: expect.any(Number),
    });
  });

  it('builds a persisted snapshot for a match using historical results', () => {
    const target = makeMatch({
      id: 400,
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      teammates: ['Wing1'],
      opponentTeams: [{ teamName: 'Raiders', shipType: 'Scout', color: 'red', players: ['Enemy1'] }],
    });
    const history = [
      makeMatch({ teammates: ['Wing1'], result: 'Win' }),
      makeMatch({ teammates: ['Wing1'], result: 'Win' }),
      makeMatch({ teammates: ['Wing1'], result: 'Loss' }),
      makeMatch({ teammates: ['Someone Else'], result: 'Loss' }),
    ];

    const snapshot = buildPregameAdviceSnapshotForMatch(target, [target, ...history], 1_700_000_999_000);

    expect(snapshot).toBeDefined();
    expect(snapshot?.updatedAt).toBe(1_700_000_999_000);
    expect(snapshot?.headline).toContain('estimated win rate');
    expect(snapshot?.sampleSize).toBeGreaterThanOrEqual(3);
  });

  it('treats snapshots with identical advice content as equal even when timestamps differ', () => {
    const left = {
      overallWinRate: 0.61,
      confidence: 'medium',
      sampleSize: 12,
      filteredPoolSize: 4,
      headline: '~61% estimated win rate',
      factors: [],
      topActions: ['Best early target: Raiders'],
      hasUsableData: true,
      updatedAt: 100,
    } as const;
    const right = {
      ...left,
      updatedAt: 200,
    };

    expect(isPregameAdviceSnapshotEqual(left, right)).toBe(true);
  });

  it('detects when a match has fresh lobby intel to score against', () => {
    expect(hasPregameLobbyContext(makeMatch({ teammates: ['Wing1'] }))).toBe(true);
    expect(hasPregameLobbyContext(makeMatch({ opponentTeams: [{ teamName: 'Raiders', shipType: 'Scout', color: 'red', players: ['Enemy1'] }] }))).toBe(true);
    expect(hasPregameLobbyContext(makeMatch({ reachModifiers: ['Ion Storm'] }))).toBe(true);
    expect(hasPregameLobbyContext(makeMatch())).toBe(false);
  });
});
