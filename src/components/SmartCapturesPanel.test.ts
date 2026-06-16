import { describe, expect, it } from 'vitest';
import type { Match, OpponentTeam } from '../types';
import type { OCRExtractedData } from '../utils/ocr/ocrTypes';
import { backfillOpponentTeamShipTypes } from '../utils/ocr/opponentTeamShipTypes';
import {
  commitPendingMatchDataForWizard,
  getBestRosterSuggestion,
  buildMatchReachModifierDisplayList,
  clearSmartCapturePlayerAssignments,
  getSmartCaptureFriendlyTeamName,
  getSmartCaptureWizardInitialTab,
  shouldCloseSmartCaptureWizardOnOcrApply,
  getRosterCandidateSuggestions,
  buildOcrReviewPendingMatch,
  resolveOpenWizardSeed,
  resolveSmartCaptureOpenFolderTarget,
  resolveFriendlyTeamLabel,
  shouldSyncOcrApplyToCurrentSession,
} from './SmartCapturesPanel';

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

  it('uses crew hub source row order instead of color-sorted order for unresolved yellow teams', () => {
    const teams = [
      makeTeam({ teamName: 'Red Team', color: 'red', players: ['R1'], sourceRowIndex: 0 }),
      makeTeam({ teamName: 'Orange Team', color: 'orange', players: ['O1'], sourceRowIndex: 1 }),
      makeTeam({ teamName: 'Yellow-Green Team', color: 'yellowgreen', players: ['YG1'], sourceRowIndex: 3 }),
      makeTeam({ teamName: 'Team 4', color: 'unknown', players: ['Y1'], sourceRowIndex: 2 }),
    ];
    const enemyShips: OCRExtractedData['enemyShips'] = [
      { teamName: '', shipType: 'Hunter', color: 'unknown', sourceSlotIndex: 0 },
      { teamName: '', shipType: 'Bastion', color: 'unknown', sourceSlotIndex: 1 },
      { teamName: '', shipType: 'Scout', color: 'unknown', sourceSlotIndex: 2 },
      { teamName: '', shipType: 'Privateer', color: 'unknown', sourceSlotIndex: 3 },
    ];

    const result = backfillOpponentTeamShipTypes(teams, {
      sessionShipTypes: {},
      enemyShips,
    });

    expect(result.map((team) => team.shipType)).toEqual([
      'Hunter',
      'Bastion',
      'Privateer',
      'Scout',
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
    expect((current as any)?.id).toBe(77);
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

describe('resolveSmartCaptureOpenFolderTarget', () => {
  it('prefers the resolved artifact file path when available', () => {
    expect(resolveSmartCaptureOpenFolderTarget({
      images: ['C:\\fallback\\match_artifacts\\12\\capture.png'],
      imageFiles: [{ artifactId: 'tok_1', filename: 'capture.png', path: 'C:\\canonical\\match_artifacts\\193\\capture.png' }],
    })).toBe('C:\\canonical\\match_artifacts\\193\\capture.png');
  });

  it('falls back to the first image path when no artifact file metadata exists', () => {
    expect(resolveSmartCaptureOpenFolderTarget({
      images: ['C:\\captures\\match-1.png'],
      imageFiles: [],
    })).toBe('C:\\captures\\match-1.png');
  });
});

describe('resolveOpenWizardSeed', () => {
  const baseMatch = {
    id: 99,
    timestamp: 1_700_000_000_000,
    date: '1/1/2024',
    mode: 'Artifact Brawl',
    player: 'Pilot',
    teammates: ['Wingman'],
    opponents: ['Enemy'],
    hero: 'Adrian',
    ship: 'Hunter',
    reachModifiers: [],
    kills: {},
    artifacts: ['capture.png'],
    result: 'Ongoing',
    subType: 'Telemetry Draft',
    ocrState: 'reviewing',
    loadout: {
      hero: 'Adrian',
      ship: 'Hunter',
      weapons: ['Hunter Cannon'],
      equipment: ['Repair Kit'],
      characterWeapons: ['Pulse Rifle'],
      characterEquipment: ['Shield'],
    },
  } as Match;

  it('prefers the pending draft loadout when reopening the same match draft', () => {
    const pendingDraft: Partial<Match> = {
      id: 99,
      hero: 'Ion',
      ship: 'Scout',
      loadout: {
        hero: 'Ion',
        ship: 'Scout',
        weapons: ['Scout Railgun'],
        equipment: ['Cloak'],
        characterWeapons: ['Voltaic Pistol'],
        characterEquipment: ['Pulse Scanner'],
      },
    };

    const resolved = resolveOpenWizardSeed({
      liveMatch: baseMatch,
      pendingDraft,
      currentLoadout: {
        hero: 'Kae',
        ship: 'Privateer',
        weapons: ['Privateer Cannon'],
        equipment: ['Med Bay'],
        characterWeapons: ['Needler'],
        characterEquipment: ['Stim Kit'],
      },
    });

    expect(resolved.shouldReusePendingDraft).toBe(true);
    expect(resolved.preferredLoadout).toMatchObject(pendingDraft.loadout as unknown as Record<string, unknown>);
    expect(resolved.latestMatch.hero).toBe('Ion');
    expect(resolved.latestMatch.ship).toBe('Scout');
    expect(resolved.latestMatch.loadout).toMatchObject(pendingDraft.loadout as unknown as Record<string, unknown>);
  });

  it('falls back to the cached telemetry loadout when reopening a telemetry draft without a pending loadout', () => {
    const telemetryLoadout = {
      hero: 'Kae',
      ship: 'Privateer',
      weapons: ['Privateer Cannon'],
      equipment: ['Med Bay'],
      characterWeapons: ['Needler'],
      characterEquipment: ['Stim Kit'],
    };

    const resolved = resolveOpenWizardSeed({
      liveMatch: baseMatch,
      pendingDraft: {
        id: 99,
        teammates: ['Wingman'],
      },
      currentLoadout: telemetryLoadout,
    });

    expect(resolved.isTelemetryDraftMatch).toBe(true);
    expect(resolved.preferredLoadout).toMatchObject(telemetryLoadout);
    expect(resolved.latestMatch.hero).toBe('Kae');
    expect(resolved.latestMatch.ship).toBe('Privateer');
    expect(resolved.latestMatch.loadout).toMatchObject(telemetryLoadout);
  });
});

describe('buildOcrReviewPendingMatch', () => {
  it('hydrates the pending draft from OCR review data so the wizard can seed its fields', () => {
    const baseMatch = {
      id: 99,
      timestamp: 1_700_000_000_000,
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: ['Old Teammate'],
      opponents: ['Old Opponent'],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: ['Old Mod'],
      artifacts: ['capture.png'],
      result: 'Ongoing',
      ocrState: 'reviewing',
      ocrDebug: {
        playerTeamName: 'Alpha',
      },
    } as Match;

    const reviewData: OCRExtractedData = {
      screenshotType: 'crew_hub',
      reachModifiers: [{ name: 'Ice Storm', confidence: 84, rawText: 'ICE STORM' }],
      enemyShips: [],
      teammates: [{ name: 'Wingman', confidence: 90, isTeammate: true }],
      opponentTeams: [{
        teamName: 'Red Team',
        shipType: 'Scout',
        color: 'red',
        players: [{ name: 'EnemyOne', confidence: 82, isTeammate: false }],
        confidence: 80,
      }],
      overallConfidence: 86,
      captureTimestamp: 1_700_000_001_000,
      rawText: 'sample',
      playerShip: {
        shipType: 'Bastion',
        teamName: 'Friendly Team',
        confidence: 88,
      },
      playerTeamName: 'Friendly Team',
      playerShipName: 'Bastion',
      hazards: ['Artifact: Ice'],
      artifactType: 'Ice',
      ocrSource: 'merged',
    };

    const hydrated = buildOcrReviewPendingMatch(baseMatch, reviewData, {
      activeUser: 'Pilot',
      existingPending: {
        id: 99,
        artifacts: ['capture.png'],
      },
      nameSources: {
        Wingman: [{ imagePath: 'capture.png', imageIndex: 0, sourceRole: 'teammate' }],
      } as any,
      normalizeModifierName: (value) => value,
    });

    expect(hydrated.ship).toBe('Bastion');
    expect(hydrated.teammates).toEqual(['Wingman']);
    expect(hydrated.opponents).toEqual(['EnemyOne']);
    expect(hydrated.opponentTeams).toEqual([
      expect.objectContaining({
        teamName: 'Red Team',
        shipType: 'Scout',
        color: 'red',
        players: ['EnemyOne'],
      }),
    ]);
    expect(hydrated.reachModifiers).toEqual(['Ice Storm']);
    expect(hydrated.ocrState).toBe('reviewing');
    expect(hydrated.ocrDebug).toMatchObject({
      playerTeamName: 'Friendly Team',
      playerShipName: 'Bastion',
      nameSources: {
        Wingman: [{ imagePath: 'capture.png', imageIndex: 0, sourceRole: 'teammate' }],
      },
    });
  });
});

describe('shouldSyncOcrApplyToCurrentSession', () => {
  it('returns true only when the pending match id matches the selected match id', () => {
    expect(shouldSyncOcrApplyToCurrentSession(44, 44)).toBe(true);
    expect(shouldSyncOcrApplyToCurrentSession('44', 44)).toBe(true);
  });

  it('returns false when there is no valid pending match context', () => {
    expect(shouldSyncOcrApplyToCurrentSession(null, 44)).toBe(false);
    expect(shouldSyncOcrApplyToCurrentSession(0, 44)).toBe(false);
    expect(shouldSyncOcrApplyToCurrentSession(undefined, 44)).toBe(false);
  });

  it('returns false for historical matches with a different pending match id', () => {
    expect(shouldSyncOcrApplyToCurrentSession(45, 44)).toBe(false);
  });
});

describe('getSmartCaptureWizardInitialTab', () => {
  it('returns result for the standard Open action', () => {
    expect(getSmartCaptureWizardInitialTab('open')).toBe('result');
  });

  it('returns ocr for re-analyze completion and explicit OCR review entry', () => {
    expect(getSmartCaptureWizardInitialTab('reanalyze-complete')).toBe('ocr');
    expect(getSmartCaptureWizardInitialTab('ocr-review')).toBe('ocr');
  });
});

describe('shouldCloseSmartCaptureWizardOnOcrApply', () => {
  it('keeps the standard Open action in the wizard result flow', () => {
    expect(shouldCloseSmartCaptureWizardOnOcrApply('open')).toBe(false);
  });

  it('enables close-on-apply for OCR-first smart-capture entry points', () => {
    expect(shouldCloseSmartCaptureWizardOnOcrApply('reanalyze-complete')).toBe(true);
    expect(shouldCloseSmartCaptureWizardOnOcrApply('ocr-review')).toBe(true);
  });
});

describe('clearSmartCapturePlayerAssignments', () => {
  it('clears players, team assignments, and reach hazards together', () => {
    const cleared = clearSmartCapturePlayerAssignments({
      id: 55,
      ship: 'Hunter',
      teammates: ['Wingman'],
      opponents: ['Hostile'],
      opponentTeams: [makeTeam({ teamName: 'Raiders', color: 'red', players: ['Hostile'] })],
      reachModifiers: ['Sandstorm', 'Artifact: Ice'],
      artifactSource: 'Ice',
      eliminatedByTeam: 'Raiders',
      ocrDebug: {
        rawText: 'ocr text',
        confidence: 88,
        hazards: ['Sandstorm'],
        playerTeamName: 'Crew Alpha',
        playerShipTeamName: 'Ship Crew',
        playerShipName: 'Stormchaser',
      },
    } as Match);

    expect(cleared.ship).toBe('');
    expect(cleared.teammates).toEqual([]);
    expect(cleared.opponents).toEqual([]);
    expect(cleared.opponentTeams).toEqual([]);
    expect(cleared.reachModifiers).toEqual([]);
    expect(cleared.artifactSource).toBe('');
    expect(cleared.eliminatedByTeam).toBeUndefined();
    expect(cleared.ocrDebug?.hazards).toEqual([]);
    expect(cleared.ocrDebug?.playerTeamName).toBe('');
    expect(cleared.ocrDebug?.playerShipTeamName).toBe('');
    expect(cleared.ocrDebug?.playerShipName).toBe('');
    expect(cleared.ocrDebug?.rawText).toBe('ocr text');
    expect(cleared.ocrDebug?.confidence).toBe(88);
  });
});

describe('buildMatchReachModifierDisplayList', () => {
  it('includes artifact source as a displayed reach modifier chip', () => {
    expect(buildMatchReachModifierDisplayList({
      reachModifiers: ['Sandstorm'],
      artifactSource: 'ice',
    } as Pick<Match, 'reachModifiers' | 'artifactSource'>)).toEqual([
      'Sandstorm',
      'Artifact: Ice',
    ]);
  });
});

describe('getSmartCaptureFriendlyTeamName', () => {
  it('uses an explicitly persisted friendly team name when present', () => {
    expect(getSmartCaptureFriendlyTeamName({
      id: 1,
      ocrDebug: {
        playerTeamName: 'Crew Delta',
        playerShipName: 'Ignored Ship Name',
      },
    } as Match)).toBe('Crew Delta');
  });

  it('keeps an explicitly cleared friendly team name blank', () => {
    expect(getSmartCaptureFriendlyTeamName({
      id: 2,
      ocrDebug: {
        playerTeamName: '',
        playerShipName: 'Should Not Return',
      },
    } as Match)).toBe('');
  });

  it('falls back to OCR ship/team labels without defaulting to the captain name', () => {
    expect(getSmartCaptureFriendlyTeamName({
      id: 3,
      ocrDebug: {
        playerShipTeamName: "Starlight's Crew",
      },
      player: 'AlexThus',
    } as Match)).toBe('Starlight');
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

  it('scores OCR digit/letter confusions for friendly roster names', () => {
    const suggestions = getRosterCandidateSuggestions('C0mbat Barbie', [
      'Combat Barbie',
      'Rapid Warrior',
      'RandomName',
    ]);

    expect(suggestions[0]?.name).toBe('Combat Barbie');
    expect(suggestions[0]?.score).toBeGreaterThanOrEqual(95);
  });
});

describe('getBestRosterSuggestion', () => {
  it('returns a visible roster suggestion when OCR normalization matches but raw text differs', () => {
    expect(getBestRosterSuggestion('C0mbat Barbie', ['Combat Barbie'])).toEqual({
      name: 'Combat Barbie',
      score: 100,
    });
  });
});

describe('resolveFriendlyTeamLabel', () => {
  it('uses detected ship/team label, preferring custom crew names over ship types', () => {
    expect(resolveFriendlyTeamLabel("Starlight's Crew", '', 'TestPilot')).toBe('Starlight');
    expect(resolveFriendlyTeamLabel('Hunter (4 Player)', '', 'TestPilot')).toBe('Hunter');
  });

  it('falls back to existing label and then captain name', () => {
    expect(resolveFriendlyTeamLabel('', 'Blue Crew', 'TestPilot')).toBe('Blue Crew');
    expect(resolveFriendlyTeamLabel('', '', 'TestPilot')).toBe('TestPilot');
  });
});

