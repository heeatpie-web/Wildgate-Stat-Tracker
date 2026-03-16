import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildAutoCaptureRequestFromStateSnapshot,
  resolveSmartCaptureMatchId,
} = require('./autoCaptureHotkeyState.cjs');

describe('autoCaptureHotkeyState', () => {
  it('prefers the most recent telemetry draft for the active user', () => {
    const matchId = resolveSmartCaptureMatchId({
      activeUser: 'Pilot',
      sessionStartTime: 50_000,
      matches: [
        { id: 11, subType: 'Telemetry Draft', telemetryDraftState: 'active', timestamp: 80_000, player: 'Other' },
        { id: 17, subType: 'Telemetry Draft', telemetryDraftState: 'active', timestamp: 90_000, player: 'Pilot' },
        { id: 19, subType: 'Telemetry Draft', telemetryDraftState: 'active', timestamp: 95_000, player: 'Pilot' },
      ],
      pendingMatchData: { id: 999 },
      now: 100_000,
    });

    expect(matchId).toBe(19);
  });

  it('falls back to pending match data when no matching telemetry draft exists', () => {
    const request = buildAutoCaptureRequestFromStateSnapshot({
      activeUser: 'Pilot',
      matches: [
        { id: 11, subType: 'Telemetry Draft', telemetryDraftState: 'active', timestamp: 10_000, player: 'Pilot' },
      ],
      pendingMatchData: { id: 222 },
      isMatchInProgress: true,
      tacticalMapKeybind: 'Tab',
    }, { now: 10 * 60 * 60 * 1000 });

    expect(request).toEqual(expect.objectContaining({
      matchId: 222,
      lifecycleActive: true,
      autoCaptureTacticalMapKey: 'Tab',
    }));
  });

  it('builds the main-process request payload from synced renderer state', () => {
    const request = buildAutoCaptureRequestFromStateSnapshot({
      activeUser: 'Pilot',
      sessionStartTime: 50_000,
      matches: [
        { id: 44, subType: 'Telemetry Draft', telemetryDraftState: 'active', timestamp: 95_000, player: 'Pilot' },
      ],
      pendingMatchData: null,
      isMatchInProgress: true,
      autoCaptureSendKeypresses: true,
      autoCaptureWaitMultiplier: 0.8,
      tacticalMapKeybind: 'KeyM',
      holdTacticalMapKey: true,
      ocrRegions: { mapScreen: { yourShip: { xMin: 0.1, xMax: 0.2 } } },
      ocrEnhancedNameRecoveryEnabled: true,
      ocrNameRerouteThreshold: 0.77,
      deviceDisplayInfo: { aspectProfile: '21:9', width: 3440 },
      gameResolution: { width: 3440, height: 1440 },
    }, { now: 100_000 });

    expect(request).toEqual({
      activeUser: 'Pilot',
      matchId: 44,
      lifecycleActive: true,
      autoCaptureSendKeypresses: true,
      autoCaptureWaitMultiplier: 0.8,
      autoCaptureTacticalMapKey: 'KeyM',
      holdTacticalMapKey: true,
      ocrMode: 'local',
      ocrRegions: { mapScreen: { yourShip: { xMin: 0.1, xMax: 0.2 } } },
      runtimeOptions: {
        routingProfile: 'names-only',
        fontProfile: 'ealing-black-italic',
        nameRerouteThreshold: 0.77,
        maxReroutePasses: 1,
        aspectProfile: '21:9',
        gameResolution: { width: 3440, height: 1440 },
        deviceDisplayInfo: { aspectProfile: '21:9', width: 3440 },
      },
    });
  });

  it('prefers an explicit matchId and accepts legacy request fields', () => {
    const request = buildAutoCaptureRequestFromStateSnapshot({
      activeUser: 'Pilot',
      matchId: 555,
      lifecycleActive: true,
      autoCaptureSendKeypresses: false,
      autoCaptureWaitMultiplier: 1.6,
      autoCaptureTacticalMapKey: 'KeyM',
      holdTacticalMapKey: true,
      ocrMode: 'both',
      ocrRegions: { crewHub: { roster: { xMin: 0.2, xMax: 0.8 } } },
      runtimeOptions: { customFlag: true },
      matches: [
        { id: 44, subType: 'Telemetry Draft', telemetryDraftState: 'active', timestamp: 95_000, player: 'Pilot' },
      ],
      pendingMatchData: { id: 222 },
    }, { now: 100_000 });

    expect(request).toEqual(expect.objectContaining({
      activeUser: 'Pilot',
      matchId: 555,
      lifecycleActive: true,
      autoCaptureSendKeypresses: false,
      autoCaptureWaitMultiplier: 1.6,
      autoCaptureTacticalMapKey: 'KeyM',
      holdTacticalMapKey: true,
      ocrMode: 'both',
      ocrRegions: { crewHub: { roster: { xMin: 0.2, xMax: 0.8 } } },
      runtimeOptions: expect.objectContaining({
        routingProfile: 'default',
        fontProfile: 'default',
        customFlag: true,
      }),
    }));
  });
});
