import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processTelemetryEvent, TelemetryActions, TelemetryContext } from '../telemetryProcessor';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const createActions = (): TelemetryActions => ({
  setToast: vi.fn(),
  updatePlayerIdMapping: vi.fn(),
  setDeviceDisplayInfo: vi.fn(),
  setGameResolution: vi.fn(),
});

const createContext = (overrides: Partial<TelemetryContext> = {}): TelemetryContext => ({
  playerIdMap: {},
  pilotRegistry: [],
  ...overrides,
});

describe('processTelemetryEvent', () => {
  let actions: TelemetryActions;
  let context: TelemetryContext;

  beforeEach(() => {
    actions = createActions();
    context = createContext();
  });

  it('updates mapping when an unnamed player gains a discovered name', () => {
    context.playerIdMap = { 'abc-123': 'Member 1' };

    processTelemetryEvent({
      EventName: 'SomeEvent',
      Payload: { event: { accountId: 'abc-123', displayName: 'RealName' } },
    }, actions, context);

    expect(actions.updatePlayerIdMapping).toHaveBeenCalledWith('abc-123', 'RealName');
    expect(actions.setToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      message: 'Identity Discovered: RealName',
    }));
  });

  it('does not update already-named players', () => {
    context.playerIdMap = { 'abc-123': 'AlreadyNamed' };

    processTelemetryEvent({
      EventName: 'SomeEvent',
      Payload: { event: { accountId: 'abc-123', displayName: 'DifferentName' } },
    }, actions, context);

    expect(actions.updatePlayerIdMapping).not.toHaveBeenCalled();
    expect(actions.setToast).not.toHaveBeenCalled();
  });

  it('extracts platform ID from telemetry context for discovery', () => {
    context.playerIdMap = { 'platform-id': 'Member 2' };

    processTelemetryEvent({
      EventName: 'SomeEvent',
      Payload: { event: { displayName: 'DiscoveredPlayer' } },
      context: { client: { platformAccountId: 'platform-id' } },
    }, actions, context);

    expect(actions.updatePlayerIdMapping).toHaveBeenCalledWith('platform-id', 'DiscoveredPlayer');
  });

  it('captures device display info from NebDeviceInfo', () => {
    processTelemetryEvent({
      EventName: 'NebDeviceInfo',
      Payload: {
        event: {
          primaryDisplayWidth: 3440,
          primaryDisplayHeight: 1440,
          virtualDisplayWidth: 3440,
          virtualDisplayHeight: 1440,
        },
      },
    }, actions, context);

    expect(actions.setDeviceDisplayInfo).toHaveBeenCalledWith(expect.objectContaining({
      displayWidth: 3440,
      displayHeight: 1440,
      virtualWidth: 3440,
      virtualHeight: 1440,
      aspectProfile: 'ultrawide',
    }));
  });

  it('captures game resolution from NebUserSettings', () => {
    processTelemetryEvent({
      EventName: 'NebUserSettings',
      Payload: {
        event: {
          resolutionSizeX: 2560,
          resolutionSizeY: 1440,
        },
      },
    }, actions, context);

    expect(actions.setGameResolution).toHaveBeenCalledWith({ resX: 2560, resY: 1440 });
  });

  it('does not mutate lifecycle state for map or session telemetry events', () => {
    const lifecycleActions = actions as TelemetryActions & {
      setIsMatchInProgress?: ReturnType<typeof vi.fn>;
      setMatchStartTime?: ReturnType<typeof vi.fn>;
      setOverlayPhase?: ReturnType<typeof vi.fn>;
      setTimeMin?: ReturnType<typeof vi.fn>;
      setTimeSec?: ReturnType<typeof vi.fn>;
    };
    lifecycleActions.setIsMatchInProgress = vi.fn();
    lifecycleActions.setMatchStartTime = vi.fn();
    lifecycleActions.setOverlayPhase = vi.fn();
    lifecycleActions.setTimeMin = vi.fn();
    lifecycleActions.setTimeSec = vi.fn();

    processTelemetryEvent({
      EventName: 'NebLoadingScreen',
      Payload: { event: { loadedMap: 'Frontend_MainMenu', matchDuration: 125 } },
      context: { matchSessionId: '' },
    }, lifecycleActions, context);

    expect(lifecycleActions.setIsMatchInProgress).not.toHaveBeenCalled();
    expect(lifecycleActions.setMatchStartTime).not.toHaveBeenCalled();
    expect(lifecycleActions.setOverlayPhase).not.toHaveBeenCalled();
    expect(lifecycleActions.setTimeMin).not.toHaveBeenCalled();
    expect(lifecycleActions.setTimeSec).not.toHaveBeenCalled();
  });
});
