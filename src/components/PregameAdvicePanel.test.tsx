import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Match } from '../types';

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

describe('PregameAdvicePanel', () => {
  it('waits for fresh lobby intel before showing a new estimate for the next match', async () => {
    const { PregameAdvicePanel } = await import('./PregameAdvicePanel');
    const activeDraftMatch = makeMatch({
      id: 500,
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
    });
    const history = [
      makeMatch({ result: 'Win' }),
      makeMatch({ result: 'Loss' }),
      makeMatch({ result: 'Win' }),
      makeMatch({ result: 'Loss' }),
      makeMatch({ result: 'Win' }),
    ];

    render(<PregameAdvicePanel activeDraftMatch={activeDraftMatch} allMatches={[activeDraftMatch, ...history]} />);

    expect(screen.getByText(/waiting for fresh lobby intel for this match/i)).toBeInTheDocument();
    expect(screen.getAllByText(/mode baseline/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/capture the lobby to populate specific enemy teams/i)).toBeInTheDocument();
  });

  it('shows current lobby team and player matchup detail once lobby OCR exists', async () => {
    const { PregameAdvicePanel } = await import('./PregameAdvicePanel');
    const activeDraftMatch = makeMatch({
      id: 700,
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      teammates: ['Wing1'],
      opponentTeams: [{ teamName: 'Raiders', shipType: 'Scout', color: 'red', players: ['Enemy1', 'Enemy2'] }],
      opponents: ['Enemy1', 'Enemy2'],
    });
    const history = [
      makeMatch({ teammates: ['Wing1'], result: 'Win' }),
      makeMatch({ teammates: ['Wing1'], result: 'Win' }),
      makeMatch({ teammates: ['Wing1'], result: 'Loss' }),
      makeMatch({ opponents: ['Enemy1'], result: 'Loss', opponentTeams: [{ teamName: 'Raiders', shipType: 'Scout', color: 'red', players: ['Enemy1'] }] }),
      makeMatch({ opponents: ['Enemy1'], result: 'Loss', opponentTeams: [{ teamName: 'Raiders', shipType: 'Scout', color: 'red', players: ['Enemy1'] }] }),
      makeMatch({ opponents: ['Enemy1'], result: 'Win', opponentTeams: [{ teamName: 'Raiders', shipType: 'Scout', color: 'red', players: ['Enemy1'] }] }),
      makeMatch({ opponents: ['Enemy2'], result: 'Loss', opponentTeams: [{ teamName: 'Raiders', shipType: 'Scout', color: 'red', players: ['Enemy2'] }] }),
      makeMatch({ ship: 'Hunter', result: 'Win' }),
      makeMatch({ ship: 'Hunter', result: 'Loss' }),
      makeMatch({ ship: 'Hunter', result: 'Win' }),
    ];

    render(<PregameAdvicePanel activeDraftMatch={activeDraftMatch} allMatches={[activeDraftMatch, ...history]} />);

    expect(screen.getByText(/this lobby/i)).toBeInTheDocument();
    expect(screen.getByText(/squad history/i)).toBeInTheDocument();
    expect(screen.getByText(/enemy teams/i)).toBeInTheDocument();
    expect(screen.getByText('Wing1')).toBeInTheDocument();
    expect(screen.getByText('Raiders')).toBeInTheDocument();
    expect(screen.getByText(/Enemy1/)).toBeInTheDocument();
  });
});
