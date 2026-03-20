import { describe, expect, it } from 'vitest';
import { findActiveTelemetryDraftMatch, resolveSmartCaptureMatchId } from '../smartCaptureScope';

const now = Date.now();

describe('smartCaptureScope', () => {
  it('prefers a recent active telemetry draft over ready ongoing rows', () => {
    const match = findActiveTelemetryDraftMatch({
      activeUser: 'Pilot',
      sessionStartTime: now,
      now,
      matches: [
        {
          id: 11,
          player: 'Pilot',
          subType: 'Telemetry Draft',
          result: 'Ongoing',
          telemetryDraftState: 'ready',
          timestamp: now - 5_000,
        },
        {
          id: 12,
          player: 'Pilot',
          subType: 'Telemetry Draft',
          result: 'Ongoing',
          telemetryDraftState: 'active',
          timestamp: now - 4_000,
        },
      ] as any,
    });

    expect(match?.id).toBe(12);
  });

  it('falls back to the newest ongoing telemetry draft when no recent active draft exists', () => {
    const match = findActiveTelemetryDraftMatch({
      activeUser: 'Pilot',
      sessionStartTime: now,
      now,
      matches: [
        {
          id: 21,
          player: 'Pilot',
          subType: 'Telemetry Draft',
          result: 'Ongoing',
          telemetryDraftState: 'active',
          timestamp: now - (10 * 60 * 1000),
        },
        {
          id: 22,
          player: 'Pilot',
          subType: 'Telemetry Draft',
          result: 'Ongoing',
          telemetryDraftState: 'ready',
          timestamp: now - 20_000,
        },
      ] as any,
    });

    expect(match?.id).toBe(22);
  });

  it('ignores ongoing telemetry drafts for a different player when the active user is known', () => {
    const match = findActiveTelemetryDraftMatch({
      activeUser: 'Pilot',
      sessionStartTime: now,
      now,
      matches: [
        {
          id: 31,
          player: 'SomeoneElse',
          subType: 'Telemetry Draft',
          result: 'Ongoing',
          telemetryDraftState: 'ready',
          timestamp: now - 5_000,
        },
      ] as any,
    });

    expect(match).toBeNull();
  });

  it('accepts telemetry drafts with placeholder player names while the live user is known', () => {
    const match = findActiveTelemetryDraftMatch({
      activeUser: 'Pilot',
      sessionStartTime: now,
      now,
      matches: [
        {
          id: 35,
          player: 'Unknown Player',
          subType: 'Telemetry Draft',
          result: 'Ongoing',
          telemetryDraftState: 'active',
          timestamp: now - 5_000,
        },
      ] as any,
    });

    expect(match?.id).toBe(35);
  });

  it('lets smart capture resolve to an ongoing telemetry draft fallback', () => {
    const matchId = resolveSmartCaptureMatchId({
      activeUser: 'Pilot',
      sessionStartTime: now,
      now,
      matches: [
        {
          id: 41,
          player: 'Pilot',
          subType: 'Telemetry Draft',
          result: 'Ongoing',
          telemetryDraftState: 'ready',
          timestamp: now - 5_000,
        },
      ] as any,
      pendingMatchData: null,
    });

    expect(matchId).toBe(41);
  });
});
