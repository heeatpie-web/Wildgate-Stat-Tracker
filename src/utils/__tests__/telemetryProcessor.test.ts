import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processTelemetryEvent, TelemetryActions, TelemetryContext } from '../telemetryProcessor';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Helpers ──

const createActions = (): TelemetryActions => ({
  setTimeMin: vi.fn(),
  setTimeSec: vi.fn(),
  setIsMatchInProgress: vi.fn(),
  setMatchStartTime: vi.fn(),
  setOverlayPhase: vi.fn(),
  setToast: vi.fn(),
  updatePlayerIdMapping: vi.fn(),
  setShowWizard: vi.fn(),
  setLastMatchSessionId: vi.fn(),
});

const createContext = (overrides: Partial<TelemetryContext> = {}): TelemetryContext => ({
  matchStartTime: null,
  isMatchInProgress: false,
  playerIdMap: {},
  pilotRegistry: [],
  lastMatchSessionId: '',
  ...overrides,
});

describe('processTelemetryEvent', () => {
  let actions: TelemetryActions;
  let context: TelemetryContext;

  beforeEach(() => {
    actions = createActions();
    context = createContext();
  });

  // ── Match Start ──

  describe('match start detection', () => {
    it('detects NebLoadingScreen with non-Frontend map as match start', () => {
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Arctic_Reach_01' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.setIsMatchInProgress).toHaveBeenCalledWith(true);
      expect(actions.setMatchStartTime).toHaveBeenCalled();
      expect(actions.setOverlayPhase).toHaveBeenCalledWith('Setup');
    });

    it('does not trigger match start for Frontend maps', () => {
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Frontend_Lobby' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);
      expect(actions.setIsMatchInProgress).not.toHaveBeenCalledWith(true);
    });

    it('does not trigger match start if already in match', () => {
      context.isMatchInProgress = true;
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Arctic_Reach_01' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);
      expect(actions.setMatchStartTime).not.toHaveBeenCalled();
    });

    it('also detects loadingMap field', () => {
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadingMap: 'Canyon_Reach_02' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);
      expect(actions.setIsMatchInProgress).toHaveBeenCalledWith(true);
    });

    it('detects match start when loadingMap is only present on the payload envelope', () => {
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: {
          event: { traceId: 'payload-envelope-map' },
          loadingMap: 'Arctic_Reach_01',
        },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.setIsMatchInProgress).toHaveBeenCalledWith(true);
      expect(actions.setMatchStartTime).toHaveBeenCalled();
      expect(actions.setOverlayPhase).toHaveBeenCalledWith('Setup');
    });

    it('detects live matchmaker state with a session id as a fallback match start', () => {
      const event = {
        EventName: 'NebClientMatchmakerStateChange',
        Payload: {
          sessionId: 'training-session-id',
          state: 'InProgress',
        },
        ClientTimestamp: Date.now() / 1000,
      };

      processTelemetryEvent(event, actions, context);

      expect(actions.setIsMatchInProgress).toHaveBeenCalledWith(true);
      expect(actions.setMatchStartTime).toHaveBeenCalled();
      expect(actions.setOverlayPhase).toHaveBeenCalledWith('Setup');
    });
  });

  // ── Match End ──

  describe('match end detection', () => {
    it('detects Frontend map while in match as match end', () => {
      context.isMatchInProgress = true;
      context.matchStartTime = Date.now() - 300000; // 5 minutes ago
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Frontend_MainMenu' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.setIsMatchInProgress).toHaveBeenCalledWith(false);
      expect(actions.setMatchStartTime).toHaveBeenCalledWith(null);
      expect(actions.setOverlayPhase).toHaveBeenCalledWith('Result');
      expect(actions.setShowWizard).not.toHaveBeenCalled();
    });

    it('calculates match duration from matchStartTime', () => {
      const startMs = Date.now() - 180000; // 3 minutes ago
      context.isMatchInProgress = true;
      context.matchStartTime = startMs;
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Frontend_MainMenu' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.setTimeMin).toHaveBeenCalled();
      expect(actions.setTimeSec).toHaveBeenCalled();
      // Check it was called with telemetry source
      expect(actions.setTimeMin).toHaveBeenCalledWith(expect.any(String), 'telemetry');
    });

    it('uses payload.matchDuration when available', () => {
      context.isMatchInProgress = true;
      context.matchStartTime = Date.now();
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Frontend_MainMenu', matchDuration: 125 } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      // 125 seconds = 2 min 5 sec
      expect(actions.setTimeMin).toHaveBeenCalledWith('02', 'telemetry');
      expect(actions.setTimeSec).toHaveBeenCalledWith('05', 'telemetry');
    });

    it('keeps a 60-minute duration as valid telemetry time', () => {
      context.isMatchInProgress = true;
      context.matchStartTime = Date.now() - (60 * 60 * 1000);
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Frontend_MainMenu' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.setTimeMin).toHaveBeenCalledWith('60', 'telemetry');
      expect(actions.setTimeSec).toHaveBeenCalledWith('00', 'telemetry');
    });

    it('resets impossible frontend-map duration values above 60 minutes', () => {
      context.isMatchInProgress = true;
      context.matchStartTime = Date.now() - (74 * 60 * 1000);
      const event = {
        EventName: 'NebLoadingScreen',
        Payload: { event: { loadedMap: 'Frontend_MainMenu' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.setTimeMin).toHaveBeenCalledWith('00', 'telemetry');
      expect(actions.setTimeSec).toHaveBeenCalledWith('00', 'telemetry');
    });
  });

  // ── ID Discovery ──

  describe('ID discovery', () => {
    it('updates mapping when unnamed player gets a name', () => {
      context.playerIdMap = { 'abc-123': 'Member 1' };
      const event = {
        EventName: 'SomeEvent',
        Payload: { event: { accountId: 'abc-123', displayName: 'RealName' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.updatePlayerIdMapping).toHaveBeenCalledWith('abc-123', 'RealName');
      expect(actions.setToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      );
    });

    it('does not update already-named players', () => {
      context.playerIdMap = { 'abc-123': 'AlreadyNamed' };
      const event = {
        EventName: 'SomeEvent',
        Payload: { event: { accountId: 'abc-123', displayName: 'DifferentName' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);
      expect(actions.updatePlayerIdMapping).not.toHaveBeenCalled();
    });

    it('extracts platform ID from context', () => {
      context.playerIdMap = { 'platform-id': 'Member 2' };
      const event = {
        EventName: 'SomeEvent',
        Payload: { event: { displayName: 'DiscoveredPlayer' } },
        context: { client: { platformAccountId: 'platform-id' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);
      expect(actions.updatePlayerIdMapping).toHaveBeenCalledWith('platform-id', 'DiscoveredPlayer');
    });
  });

  // ── matchSessionId lifecycle ──

  describe('matchSessionId lifecycle', () => {
    it('detects match end when matchSessionId disappears while in match', () => {
      context.isMatchInProgress = true;
      context.matchStartTime = Date.now() - 60000;
      context.lastMatchSessionId = 'session-abc';

      const event = {
        EventName: 'SomeEvent',
        Payload: {},
        context: { matchSessionId: '' },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.setIsMatchInProgress).toHaveBeenCalledWith(false);
      expect(actions.setOverlayPhase).toHaveBeenCalledWith('Result');
    });

    it('ignores unrelated events that omit matchSessionId while in match', () => {
      context.isMatchInProgress = true;
      context.matchStartTime = Date.now() - 60000;
      context.lastMatchSessionId = 'session-abc';

      const event = {
        EventName: 'SomeEvent',
        Payload: { event: { loadedMap: 'DesolationReach' } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.setIsMatchInProgress).not.toHaveBeenCalledWith(false);
      expect(actions.setOverlayPhase).not.toHaveBeenCalledWith('Result');
      expect(actions.setLastMatchSessionId).not.toHaveBeenCalled();
    });

    it('updates lastMatchSessionId via action', () => {
      const event = {
        EventName: 'SomeEvent',
        Payload: {},
        context: { matchSessionId: 'new-session' },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);
      expect(actions.setLastMatchSessionId).toHaveBeenCalledWith('new-session');
    });

    it('resets impossible session-clear duration values above 60 minutes', () => {
      context.isMatchInProgress = true;
      context.matchStartTime = Date.now() - (74 * 60 * 1000);
      context.lastMatchSessionId = 'session-abc';
      const event = {
        EventName: 'SomeEvent',
        Payload: {},
        context: { matchSessionId: '' },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);

      expect(actions.setTimeMin).toHaveBeenCalledWith('00', 'telemetry');
      expect(actions.setTimeSec).toHaveBeenCalledWith('00', 'telemetry');
    });
  });

  // ── Ship Selection Signal ──

  describe('ship selection signal', () => {
    it('detects NebCloudSaveRecordSize with GameModeShipSelection', () => {
      const event = {
        EventName: 'NebCloudSaveRecordSize',
        Payload: { event: { recordKey: 'GameModeShipSelection_v2', recordSize: 128 } },
        ClientTimestamp: Date.now() / 1000,
      };
      processTelemetryEvent(event, actions, context);
      expect(actions.setToast).not.toHaveBeenCalled();
    });
  });
});
