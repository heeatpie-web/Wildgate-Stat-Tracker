import { describe, expect, it } from 'vitest';
import type { TelemetryArchiveEvent } from '../telemetryArchive';
import {
  DEFAULT_DURATION_TOLERANCE_SECONDS,
  deriveTelemetryConsistency,
  deriveTelemetryConsistencyFromCollections,
  evaluateTelemetryConsistencyChecks,
  formatDurationOffset,
  getExpectedTeammateCountFromMode,
  inferModeFromMatchPool,
  mergeTelemetryConsistency,
  parseClockDurationSeconds,
} from '../telemetryConsistency';

const event = (value: TelemetryArchiveEvent): TelemetryArchiveEvent => value;

describe('telemetryConsistency', () => {
  it('infers mode from known match-pool mappings and heuristics', () => {
    expect(inferModeFromMatchPool('ArtifactBrawl')).toEqual({
      mode: 'Artifact Brawl',
      source: 'pool-map',
    });
    expect(inferModeFromMatchPool('fleet-ranked-queue')).toEqual({
      mode: 'Fleet Battle',
      source: 'pool-heuristic',
    });
    expect(inferModeFromMatchPool('')).toBeNull();
    expect(inferModeFromMatchPool(null)).toBeNull();
  });

  it('provides expected teammate fallback by inferred mode', () => {
    expect(getExpectedTeammateCountFromMode('Artifact Brawl')).toBe(3);
    expect(getExpectedTeammateCountFromMode('Fleet Battle')).toBeUndefined();
  });

  it('parses and formats duration values safely', () => {
    expect(parseClockDurationSeconds('12:34')).toBe(754);
    expect(parseClockDurationSeconds('00:09')).toBe(9);
    expect(parseClockDurationSeconds('n/a')).toBeUndefined();
    expect(formatDurationOffset(125)).toBe('2m05s');
    expect(formatDurationOffset(8.9)).toBe('8s');
  });

  it('derives teammate/mode/duration/loadout snapshots from telemetry events', () => {
    const consistency = deriveTelemetryConsistency([
      event({
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Frontend_MainMenu' } },
        ClientTimestamp: 1_700_000_300,
      }),
      event({
        EventName: 'NebLoadoutSaved',
        Payload: { event: { bWasSavedInGame: true, loadout: { hero: 'Adrian' } } },
        ClientTimestamp: 1_700_000_200,
      }),
      event({
        EventName: 'NebClientMatchmakerStateChange',
        Payload: { event: { playerIds: ['p1', 'p2', 'p3', 'p4'], ticketMatchPool: 'ArtifactBrawl' } },
        ClientTimestamp: 1_700_000_001,
      }),
      event({
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'DesolationReach' } },
        ClientTimestamp: 1_700_000_100,
      }),
      event({
        EventName: 'NebCloudSaveRecordSize',
        Payload: { event: { recordKey: 'CharacterLoadout_v2' } },
        ClientTimestamp: 1_700_000_210,
      }),
      event({
        EventName: 'NebCloudSaveRecordSize',
        Payload: { event: { recordKey: 'CharacterLoadout_v2' } },
        ClientTimestamp: 1_700_000_210,
      }),
    ]);

    expect(consistency.expectedTeammateCount).toBe(3);
    expect(consistency.expectedMode).toBe('Artifact Brawl');
    expect(consistency.expectedModeSource).toBe('pool-map');
    expect(consistency.telemetryDurationSeconds).toBe(200);
    expect(consistency.durationToleranceSeconds).toBe(DEFAULT_DURATION_TOLERANCE_SECONDS);
    expect(consistency.loadoutSaves).toEqual([
      {
        timestamp: 1_700_000_200_000,
        inGame: true,
        source: 'NebLoadoutSaved',
      },
      {
        timestamp: 1_700_000_210_000,
        inGame: false,
        source: 'NebCloudSaveRecordSize',
      },
    ]);
    expect(consistency.latestLoadoutSaveAt).toBe(1_700_000_210_000);
  });

  it('falls back to mode-derived teammate count when player ids are unavailable', () => {
    const consistency = deriveTelemetryConsistency([
      event({
        EventName: 'NebClientMatchmakerStateChange',
        Payload: { event: { ticketMatchPool: 'artifact-ranked' } },
        ClientTimestamp: 1_700_100_001,
      }),
    ]);

    expect(consistency.expectedMode).toBe('Artifact Brawl');
    expect(consistency.expectedModeSource).toBe('pool-heuristic');
    expect(consistency.expectedTeammateCount).toBe(3);
  });

  it('derives consistency from mixed archive collections', () => {
    const consistency = deriveTelemetryConsistencyFromCollections([
      {
        telemetry: [
          {
            EventName: 'NebClientMatchmakerStateChange',
            Payload: { event: { playerIds: ['self', 'wing1'], ticketMatchPool: 'FleetBattle' } },
            ClientTimestamp: 1_700_200_010,
          },
        ],
      },
      {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'MapOne' } },
        ClientTimestamp: 1_700_200_020,
      },
      {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Frontend_Hub' } },
        ClientTimestamp: 1_700_200_050,
      },
    ]);

    expect(consistency.expectedTeammateCount).toBe(1);
    expect(consistency.expectedMode).toBe('Fleet Battle');
    expect(consistency.telemetryDurationSeconds).toBe(30);
  });

  it('evaluates consistency checks and duration tolerance overrides', () => {
    const consistency = {
      expectedTeammateCount: 3,
      expectedMode: 'Artifact Brawl' as const,
      telemetryDurationSeconds: 600,
      durationToleranceSeconds: 45,
    };

    const mismatched = evaluateTelemetryConsistencyChecks(consistency, {
      teammateCount: 2,
      mode: 'Fleet Battle',
      durationSeconds: 480,
    });
    expect(mismatched.checks).toEqual({
      teammateCount: 'warn',
      mode: 'warn',
      duration: 'warn',
    });
    expect(mismatched.durationDeltaSeconds).toBe(120);
    expect(mismatched.durationToleranceSeconds).toBe(45);

    const tolerant = evaluateTelemetryConsistencyChecks(consistency, {
      durationSeconds: 560,
      durationToleranceSeconds: 50,
    });
    expect(tolerant.checks.duration).toBe('pass');
    expect(tolerant.checks.teammateCount).toBe('unknown');
    expect(tolerant.checks.mode).toBe('unknown');
    expect(tolerant.durationDeltaSeconds).toBe(40);
    expect(tolerant.durationToleranceSeconds).toBe(50);
  });

  it('merges consistency snapshots with stable loadout save ordering and defaults', () => {
    const merged = mergeTelemetryConsistency(
      {
        expectedTeammateCount: 3,
        loadoutSaves: [
          { timestamp: 3000, inGame: false, source: 'NebCloudSaveRecordSize' },
        ],
      },
      {
        expectedMode: 'Fleet Battle',
        loadoutSaves: [
          { timestamp: 2000, inGame: true, source: 'NebLoadoutSaved' },
          { timestamp: 3000, inGame: false, source: 'NebCloudSaveRecordSize' },
        ],
      },
    );

    expect(merged).toEqual({
      expectedTeammateCount: 3,
      expectedMode: 'Fleet Battle',
      loadoutSaves: [
        { timestamp: 2000, inGame: true, source: 'NebLoadoutSaved' },
        { timestamp: 3000, inGame: false, source: 'NebCloudSaveRecordSize' },
      ],
      latestLoadoutSaveAt: 3000,
      durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
    });

    expect(mergeTelemetryConsistency()).toEqual({
      durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
    });
  });
});
