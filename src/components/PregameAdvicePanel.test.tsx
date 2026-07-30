import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Match } from '../types';
import { buildAnalyticsIdentityResolver } from '../utils/analyticsIdentity';
import {
  buildPregameAdviceContextFromMatch,
  computePregameAdviceForMatch,
} from '../utils/pregameAdvice/matchAdvice';

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
    expect(screen.getAllByText(/Enemy1/).length).toBeGreaterThan(0);
  });
});

// ── Identity canonicalisation boundary regressions ──────────────────────────
// RecordingView.tsx canonicalises `activeDraftMatch` and `allMatches` through
// buildAnalyticsIdentityResolver before handing them to this panel. These tests replicate that
// boundary directly (rather than through RecordingView) to prove: (a) alias-drifted teammate
// names across sessions resolve to shared history, and (b) duplicate alias variants of one
// opponent collapse into a single INTEL entry — and that both regress to the old broken
// behaviour when canonicalisation is skipped, confirming the assertions actually exercise the
// fix rather than passing trivially.
describe('PregameAdvicePanel — identity canonicalisation boundary', () => {
  it('resolves shared squad history across alias-drifted teammate names once canonicalised', () => {
    const resolver = buildAnalyticsIdentityResolver({
      pilotAliases: { 'Wing One': ['Wing1', 'WingOne'] },
    });

    // This session's lobby OCR read the teammate as "WingOne"; history was recorded as "Wing1".
    const activeDraftMatchRaw = makeMatch({
      id: 900,
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      teammates: ['WingOne'],
    });
    const historyRaw = [
      makeMatch({ teammates: ['Wing1'], result: 'Win' }),
      makeMatch({ teammates: ['Wing1'], result: 'Win' }),
      makeMatch({ teammates: ['Wing1'], result: 'Loss' }),
    ];

    const canonicalDraft = resolver.canonicalizeMatch(activeDraftMatchRaw);
    const canonicalHistory = resolver.canonicalizeMatches(historyRaw);

    const advice = computePregameAdviceForMatch(canonicalDraft, canonicalHistory);
    const synergyFactor = advice?.factors.find((f) => f.kind === 'teammate-synergy');
    expect(synergyFactor).toBeDefined();
    expect(synergyFactor?.sampleSize).toBe(3);

    // Without the canonicalisation boundary the alias variants never line up — this is the
    // "no history with my squad" bug the fix closes.
    const uncanonicalAdvice = computePregameAdviceForMatch(activeDraftMatchRaw, historyRaw);
    expect(uncanonicalAdvice?.factors.find((f) => f.kind === 'teammate-synergy')).toBeUndefined();
  });

  it('collapses duplicate alias variants of one opponent into a single INTEL entry once canonicalised', () => {
    const resolver = buildAnalyticsIdentityResolver({
      pilotAliases: { Nemesis: ['NemesisX', 'Nemesys'] },
    });

    // Two OCR reads of the same opponent inside one lobby capture, drifted into separate strings.
    const activeDraftMatchRaw = makeMatch({
      id: 901,
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
      opponentTeams: [{ teamName: 'Raiders', shipType: 'Scout', color: 'red', players: ['Nemesis', 'NemesisX'] }],
      opponents: ['Nemesis', 'NemesisX'],
    });

    const canonicalContext = buildPregameAdviceContextFromMatch(resolver.canonicalizeMatch(activeDraftMatchRaw));
    expect(canonicalContext?.opponentTeams[0].players).toEqual(['Nemesis']);

    // Without canonicalisation the two alias variants are treated as two different opponents —
    // this is the "aliases split into separate INTEL entries" bug the fix closes.
    const uncanonicalContext = buildPregameAdviceContextFromMatch(activeDraftMatchRaw);
    expect(uncanonicalContext?.opponentTeams[0].players).toEqual(['Nemesis', 'NemesisX']);
  });
});
