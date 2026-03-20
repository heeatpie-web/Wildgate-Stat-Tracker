import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const uiState = {
  devMode: true,
  setDevMode: vi.fn(),
  setShowResetConfirm: vi.fn(),
  activeUser: 'Pilot',
  showIdMapper: false,
  setShowIdMapper: vi.fn(),
  activeView: 'recording',
  setActiveView: vi.fn(),
  telemetryLifecycleStage: 'live',
  telemetryLifecycleIsPracticeRange: false,
};

const gameDataState = {
  setMatches: vi.fn(),
  setPilotRegistry: vi.fn(),
  matches: [{
    id: 321,
    timestamp: Date.now(),
    player: 'Pilot',
    subType: 'Telemetry Draft',
    telemetryDraftState: 'active',
  }],
  pilotRegistry: [],
  sessionStartTime: Date.now(),
};

const appStoreState = {
  fullAutoEnabled: true,
  deviceDisplayInfo: {
    displayWidth: 1920,
    displayHeight: 1080,
    virtualWidth: 1920,
    virtualHeight: 1080,
  },
  gameResolution: null as { resX: number; resY: number } | null,
};

const getElectronAPIMock = vi.fn(() => null);
const WINDOW_REGION_META = {
  source: 'window-region',
  absoluteRegion: { x: 364, y: 1193, width: 107, height: 21 },
  clientRect: { left: 300, top: 180, width: 1920, height: 1080 },
  geometryAgeMs: 144,
  processName: 'Wildgate-Win64-Shipping.exe',
  processId: 1234,
  windowHandle: 5678,
  windowTitle: 'Wildgate',
};

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameDataState,
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

vi.mock('../utils/electronAPI', () => ({
  getElectronAPI: () => getElectronAPIMock(),
}));

vi.mock('./TelemetryPanel', () => ({
  TelemetryPanel: () => <div data-testid="telemetry-panel" />,
}));

describe('DevTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getElectronAPIMock.mockReturnValue(null);
  });

  afterEach(() => {
    uiState.showIdMapper = false;
    uiState.activeView = 'recording';
    uiState.telemetryLifecycleStage = 'live';
    uiState.telemetryLifecycleIsPracticeRange = false;
    appStoreState.fullAutoEnabled = true;
    gameDataState.matches = [{
      id: 321,
      timestamp: Date.now(),
      player: 'Pilot',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'active',
    }];
    gameDataState.sessionStartTime = Date.now();
  });

  it('shows result flash debug details and manually samples the ROI', async () => {
    const invokeMock = vi.fn().mockResolvedValue({
      success: true,
      data: { avgR: 252, avgG: 251, avgB: 250 },
      meta: WINDOW_REGION_META,
    });
    getElectronAPIMock.mockReturnValue({ invoke: invokeMock });

    const { DevTools } = await import('./DevTools');
    render(
      <DevTools
        resultFlashDebug={{
          status: 'sampling',
          enabled: true,
          triggerLatched: false,
          liveStartedAt: Date.now() - 50_000,
          liveElapsedMs: 50_000,
          armDelayMs: 45_000,
          armRemainingMs: 0,
          isArmed: true,
          regions: [{ x: 64, y: 1013, width: 107, height: 21 }],
          sampleIntervalMs: 100,
          brightHoldMs: 200,
          whiteThreshold: 250,
          brightSinceMs: null,
          waitingForFlashEnd: false,
          flashNotified: false,
          pollInFlight: false,
          lastSampleResult: {
            success: true,
            data: { avgR: 250, avgG: 250, avgB: 250 },
            meta: WINDOW_REGION_META,
          },
          lastSampleMeta: WINDOW_REGION_META,
          lastIsWhiteFrame: true,
          lastUpdatedAt: Date.now(),
        }}
        resultFlashDebugEvents={[{
          type: 'detected',
          at: Date.now(),
          detail: 'Flash threshold held; waiting for brightness to drop',
        }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /result flash debug/i }));

    expect(screen.getByText(/watches the live full-auto roi/i)).toBeInTheDocument();
    expect(screen.getByText(/sampling/i)).toBeInTheDocument();
    expect(screen.getByText(/all watcher gates are open/i)).toBeInTheDocument();
    expect(screen.getByText(/active draft: #321/i)).toBeInTheDocument();
    expect(screen.getByText(/actual roi: x:364 y:1193 w:107 h:21/i)).toBeInTheDocument();
    expect(screen.getByText(/predicted roi: x:64 y:1013 w:107 h:21/i)).toBeInTheDocument();
    expect(screen.getByText(/source: window-region/i)).toBeInTheDocument();
    expect(screen.getByText(/client rect: left:300 top:180 w:1920 h:1080/i)).toBeInTheDocument();
    expect(screen.getByText(/geometry age: 0.14s/i)).toBeInTheDocument();
    expect(screen.getByText(/avg rgb: \(250, 250, 250\)/i)).toBeInTheDocument();
    expect(screen.getByText(/detected: flash threshold held; waiting for brightness to drop/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sample roi now/i }));

    await waitFor(() => {
      expect(screen.getByText(/manual sample/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/avg rgb: \(252, 251, 250\)/i)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith('result-flash-sample', {
      normalizedRegion: {
        x: 64 / 1920,
        y: 1013 / 1080,
        width: 107 / 1920,
        height: 21 / 1080,
      },
    });
  });

  it('shows the exact watcher gate failures when the hook is disabled', async () => {
    uiState.telemetryLifecycleStage = 'pregame';
    appStoreState.fullAutoEnabled = false;
    gameDataState.sessionStartTime = Date.now();
    gameDataState.matches = [
      {
        id: 97,
        timestamp: Date.now() - (5 * 60 * 1000),
        player: 'Pilot',
        subType: 'Telemetry Draft',
        result: 'Ongoing',
        telemetryDraftState: 'active',
      },
      {
        id: 98,
        timestamp: Date.now() - 5_000,
        player: 'Pilot',
        subType: 'Telemetry Draft',
        result: 'Ongoing',
        telemetryDraftState: 'ready',
      },
    ];

    const { DevTools } = await import('./DevTools');
    render(
      <DevTools
        resultFlashDebug={{
          status: 'disabled',
          enabled: false,
          triggerLatched: false,
          liveStartedAt: null,
          liveElapsedMs: null,
          armDelayMs: 45_000,
          armRemainingMs: 45_000,
          isArmed: false,
          regions: [{ x: 64, y: 1013, width: 107, height: 21 }],
          sampleIntervalMs: 100,
          brightHoldMs: 200,
          whiteThreshold: 250,
          brightSinceMs: null,
          waitingForFlashEnd: false,
          flashNotified: false,
          pollInFlight: false,
          lastSampleResult: null,
          lastIsWhiteFrame: null,
          lastUpdatedAt: Date.now(),
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /result flash debug/i }));

    expect(screen.getByText(/watcher enabled: no/i)).toBeInTheDocument();
    expect(screen.getByText(/full auto toggle is off/i)).toBeInTheDocument();
    expect(screen.getByText(/lifecycle is pregame, not live/i)).toBeInTheDocument();
    expect(screen.getByText(/active draft: #98/i)).toBeInTheDocument();
    expect(screen.getByText(/store drafts: 0 recent active, 1 stale active, 1 ready ongoing/i)).toBeInTheDocument();
  });

  it('shows actionable geometry errors when the sampler cannot resolve the game window', async () => {
    const invokeMock = vi.fn().mockResolvedValue({
      success: false,
      error: 'Game window geometry unavailable',
    });
    getElectronAPIMock.mockReturnValue({ invoke: invokeMock });

    const { DevTools } = await import('./DevTools');
    render(
      <DevTools
        resultFlashDebug={{
          status: 'sampling',
          enabled: true,
          triggerLatched: false,
          liveStartedAt: Date.now() - 50_000,
          liveElapsedMs: 50_000,
          armDelayMs: 45_000,
          armRemainingMs: 0,
          isArmed: true,
          regions: [{ x: 64, y: 1013, width: 107, height: 21 }],
          sampleIntervalMs: 100,
          brightHoldMs: 200,
          whiteThreshold: 250,
          brightSinceMs: null,
          waitingForFlashEnd: false,
          flashNotified: false,
          pollInFlight: false,
          lastSampleResult: {
            success: false,
            error: 'Game window geometry unavailable',
          },
          lastSampleMeta: null,
          lastIsWhiteFrame: null,
          lastUpdatedAt: Date.now(),
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /result flash debug/i }));

    expect(screen.getByText(/last sampler error: game window geometry unavailable/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sample roi now/i }));

    await waitFor(() => {
      expect(screen.getByText(/manual sample failed: game window geometry unavailable/i)).toBeInTheDocument();
    });
  });
});
