import { describe, expect, it } from 'vitest';
import type { Match } from '../../types';
import type { OCRExtractedData } from '../ocr/ocrTypes';
import { buildTelemetryDraftPregamePreviewPatch } from '../pregameAdvice/previewSync';

const makeDraftMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 101,
  timestamp: 1_700_000_000_000,
  date: '2026-03-28',
  mode: 'Artifact Brawl',
  player: 'Pilot',
  teammates: [],
  opponents: [],
  hero: 'Adrian',
  ship: 'Hunter',
  reachModifiers: [],
  kills: {},
  result: 'Ongoing',
  subType: 'Telemetry Draft',
  telemetryDraftState: 'active',
  ...overrides,
});

const makeOcrData = (overrides: Partial<OCRExtractedData> = {}): OCRExtractedData => ({
  screenshotType: 'crew_hub',
  playerShip: { shipType: 'Bastion', confidence: 93 },
  playerTeamName: 'Friendly Team',
  playerShipName: "Friendly Team's Crew",
  reachModifiers: [
    { name: 'Ionized', confidence: 90, rawText: 'Ionized' },
    { name: 'Artifact: Ice', confidence: 88, rawText: 'Artifact: Ice' },
  ],
  enemyShips: [
    { teamName: 'Enemy Team', shipType: 'Scout', color: 'red' },
  ],
  hazards: ['Nebula'],
  teammates: [
    { name: 'Wing1', confidence: 92 },
    { name: 'Wing1', confidence: 84 },
    { name: 'Wing2', confidence: 90 },
  ],
  opponentTeams: [
    {
      teamName: 'Enemy Team',
      shipType: '',
      color: 'red',
      players: [
        { name: 'Enemy1', confidence: 88 },
        { name: 'Enemy1', confidence: 75 },
      ],
      confidence: 89,
    },
  ],
  artifactType: 'ice',
  overallConfidence: 89,
  captureTimestamp: 1_700_000_123_456,
  ...overrides,
});

describe('buildTelemetryDraftPregamePreviewPatch', () => {
  it('maps merged lobby OCR into a store-safe telemetry draft preview patch', () => {
    const patch = buildTelemetryDraftPregamePreviewPatch(makeDraftMatch(), makeOcrData());

    expect(patch).toEqual({
      ship: 'Bastion',
      teammates: ['Wing1', 'Wing2'],
      opponents: ['Enemy1'],
      reachModifiers: ['Ionized', 'Artifact: Ice', 'Nebula'],
      artifactSource: 'ice',
      opponentTeams: [
        {
          teamName: 'Enemy Team',
          shipType: 'Scout',
          color: 'red',
          players: ['Enemy1'],
          sourceRowIndex: undefined,
          sourceRowY: undefined,
        },
      ],
    });
  });

  it('does not patch non-telemetry matches', () => {
    const patch = buildTelemetryDraftPregamePreviewPatch(
      makeDraftMatch({ subType: 'Normal', telemetryDraftState: undefined, result: 'Win' }),
      makeOcrData()
    );

    expect(patch).toBeNull();
  });
});
