import { describe, expect, it } from 'vitest';
import type { Match, OpponentTeam } from '../types';
import type { OCRExtractedData } from '../utils/ocr/ocrTypes';
import { backfillOpponentTeamShipTypes } from '../utils/ocr/opponentTeamShipTypes';
import { commitPendingMatchDataForWizard, getRosterCandidateSuggestions } from './SmartCapturesPanel';

const makeTeam = (overrides: Partial<OpponentTeam> = {}): OpponentTeam => ({
  teamName: 'Enemy Team',
  shipType: '',
  color: 'unknown',
  players: [],
  ...overrides,
});

describe('backfillOpponentTeamShipTypes', () => {
  it('preserves an existing team ship type', () => {
    const teams = [
      makeTeam({
        teamName: 'Alpha',
        shipType: 'Hunter',
        color: 'red',
        players: ['Astra'],
      }),
    ];
    const enemyShips: OCRExtractedData['enemyShips'] = [
      { teamName: 'Alpha', shipType: 'Scout', color: 'red' },
    ];

    const result = backfillOpponentTeamShipTypes(teams, {
      sessionShipTypes: { red: 'Bastion', Astra: 'Privateer' },
      enemyShips,
    });

    expect(result[0].shipType).toBe('Hunter');
  });

  it('fills from sessionShipTypes before OCR enemyShips', () => {
    const teams = [
      makeTeam({
        teamName: 'Alpha Squad',
        shipType: '',
        color: 'red',
        players: ['Astra'],
      }),
    ];
    const enemyShips: OCRExtractedData['enemyShips'] = [
      { teamName: 'Alpha Squad', shipType: 'Hunter', color: 'red' },
    ];

    const result = backfillOpponentTeamShipTypes(teams, {
      sessionShipTypes: {
        'red: Alpha Squad': 'Privateer',
        red: 'Scout',
        Astra: 'Bastion',
      },
      enemyShips,
    });

    expect(result[0].shipType).toBe('Privateer');
  });

  it('fills from OCR enemyShips by color when session mapping is missing', () => {
    const teams = [
      makeTeam({
        teamName: 'Beta',
        shipType: '',
        color: 'yellow',
        players: ['Bex'],
      }),
    ];
    const enemyShips: OCRExtractedData['enemyShips'] = [
      { teamName: 'Unknown Team', shipType: 'Scout', color: 'yellow' },
    ];

    const result = backfillOpponentTeamShipTypes(teams, {
      sessionShipTypes: {},
      enemyShips,
    });

    expect(result[0].shipType).toBe('Scout');
  });

  it('fills from OCR enemyShips by team name when color is unknown', () => {
    const teams = [
      makeTeam({
        teamName: 'Gamma Raiders',
        shipType: '',
        color: 'unknown',
        players: ['Gale'],
      }),
    ];
    const enemyShips: OCRExtractedData['enemyShips'] = [
      { teamName: 'Gamma Raiders', shipType: 'Bastion', color: 'green' },
    ];

    const result = backfillOpponentTeamShipTypes(teams, {
      sessionShipTypes: {},
      enemyShips,
    });

    expect(result[0].shipType).toBe('Bastion');
  });

  it('uses positional fallback when enemy ship colors are unavailable', () => {
    const teams = [
      makeTeam({ teamName: 'Team 1', color: 'red', players: ['R1'] }),
      makeTeam({ teamName: 'Team 2', color: 'orange', players: ['O1'] }),
      makeTeam({ teamName: 'Team 3', color: 'yellow', players: ['Y1'] }),
      makeTeam({ teamName: 'Team 4', color: 'green', players: ['G1'] }),
    ];
    const enemyShips: OCRExtractedData['enemyShips'] = [
      { teamName: '', shipType: 'Hunter', color: 'unknown' },
      { teamName: '', shipType: 'Bastion', color: 'unknown' },
      { teamName: '', shipType: 'Scout', color: 'unknown' },
      { teamName: '', shipType: 'Privateer', color: 'unknown' },
    ];

    const result = backfillOpponentTeamShipTypes(teams, {
      sessionShipTypes: {},
      enemyShips,
    });

    expect(result.map((team) => team.shipType)).toEqual([
      'Hunter',
      'Bastion',
      'Scout',
      'Privateer',
    ]);
  });

  it('uses final normalized enemy fallback for unresolved teams after positional assignment', () => {
    const teams = [
      makeTeam({ teamName: 'Team 1', color: 'unknown', players: ['A1'] }),
      makeTeam({ teamName: 'Team 2', color: 'unknown', players: ['A2'] }),
      makeTeam({ teamName: 'Team 3', color: 'unknown', players: ['A3'] }),
      makeTeam({ teamName: 'Team 4', color: 'unknown', players: ['A4'] }),
    ];
    const enemyShips: OCRExtractedData['enemyShips'] = [
      { teamName: '', shipType: 'Hunter', color: 'unknown' },
      { teamName: '', shipType: 'Bastion', color: 'unknown' },
      { teamName: '', shipType: 'Bastion', color: 'unknown' },
    ];

    const result = backfillOpponentTeamShipTypes(teams, {
      sessionShipTypes: {},
      enemyShips,
    });

    expect(result.map((team) => team.shipType)).toEqual([
      'Hunter',
      'Bastion',
      'Bastion',
      'Bastion',
    ]);
  });

  it('does not overwrite existing ship types when final enemy fallback is available', () => {
    const teams = [
      makeTeam({ teamName: 'Alpha', shipType: 'Privateer', color: 'unknown', players: ['A1'] }),
      makeTeam({ teamName: 'Team 2', shipType: '', color: 'unknown', players: ['B1'] }),
    ];
    const enemyShips: OCRExtractedData['enemyShips'] = [
      { teamName: '', shipType: 'Scout', color: 'unknown' },
    ];

    const result = backfillOpponentTeamShipTypes(teams, {
      sessionShipTypes: {},
      enemyShips,
    });

    expect(result[0].shipType).toBe('Privateer');
    expect(result[1].shipType).toBe('Scout');
  });
});

describe('commitPendingMatchDataForWizard', () => {
  it('returns true when pending data commits for the expected match id', () => {
    let current: Partial<Match> | null = null;
    const pendingData: Partial<Match> = { id: 77, player: 'Pilot' };

    const committed = commitPendingMatchDataForWizard(
      pendingData,
      (next) => { current = next; },
      () => current
    );

    expect(committed).toBe(true);
    expect(current?.id).toBe(77);
  });

  it('returns false when committed pending id does not match expected id', () => {
    let current: Partial<Match> | null = null;

    const committed = commitPendingMatchDataForWizard(
      { id: 12, player: 'Pilot' },
      () => { current = { id: 99 }; },
      () => current
    );

    expect(committed).toBe(false);
  });

  it('returns false for invalid match ids', () => {
    let current: Partial<Match> | null = null;

    const committed = commitPendingMatchDataForWizard(
      { id: 0, player: 'Pilot' },
      (next) => { current = next; },
      () => current
    );

    expect(committed).toBe(false);
  });
});

describe('getRosterCandidateSuggestions', () => {
  it('uses combined name similarity scoring for OCR-close names', () => {
    const suggestions = getRosterCandidateSuggestions('Ace', ['Axe', 'Ace Pilot', 'RandomName']);

    expect(suggestions[0]?.name).toBe('Ace Pilot');
    expect(suggestions[0]?.score).toBeGreaterThanOrEqual(70);
  });

  it('returns up to three positive-score suggestions in rank order', () => {
    const suggestions = getRosterCandidateSuggestions('Pilot One', [
      'PilotOne',
      'Pilot Two',
      'Different',
      'Pilot 1',
      'Pilot One Prime',
    ]);

    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions[0].score).toBeGreaterThanOrEqual(suggestions[suggestions.length - 1].score);
    expect(suggestions.every((entry) => entry.score > 0)).toBe(true);
  });
});
