import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const uiState = {
  activeUser: 'TestPilot',
  setActiveUser: vi.fn(),
  activeView: 'analytics',
  setActiveView: vi.fn(),
  setRenameModal: vi.fn(),
  setRenameValue: vi.fn(),
  setIsOverlayMode: vi.fn(),
  showTutorial: false,
  setShowTutorial: vi.fn(),
  setNotificationsSuspended: vi.fn(),
  setShowSettings: vi.fn(),
  setToast: vi.fn(),
  pushNotification: vi.fn(),
  setShowWelcome: vi.fn(),
  requestSmartCapture: vi.fn().mockReturnValue('sc_req_1'),
  devMode: false,
  setDevMode: vi.fn(),
  visionStatus: 'idle',
};

const appStoreState = {
  showSmartCaptureInHeader: true,
  tutorialCompleted: false,
  pendingMatchData: null as any,
  matches: [] as any[],
  sessionStartTime: Date.now() - 1000,
};

const userPrefs = {
  appearanceMode: 'light',
  setAppearanceMode: vi.fn(),
};

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: any) => selector(appStoreState),
}));

vi.mock('../providers/UserPreferencesProvider', () => ({
  useUserPreferences: () => userPrefs,
}));

vi.mock('./SystemPulse', () => ({
  default: () => <div data-testid="system-pulse">Pulse</div>,
}));

vi.mock('./NotificationCenter', () => ({
  default: () => <div data-testid="notification-center" />,
}));

describe('Header', () => {
  beforeEach(() => {
    Object.assign(uiState, {
      activeUser: 'TestPilot',
      activeView: 'analytics',
      showTutorial: false,
      devMode: false,
      visionStatus: 'idle',
    });
    Object.assign(appStoreState, {
      showSmartCaptureInHeader: true,
      tutorialCompleted: false,
      pendingMatchData: null,
      matches: [],
      sessionStartTime: Date.now() - 1000,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows tutorial button until tutorial has been completed', async () => {
    const { Header } = await import('./Header');

    const { rerender } = render(<Header />);
    expect(screen.getByRole('button', { name: /tutorial/i })).toBeInTheDocument();

    appStoreState.tutorialCompleted = true;
    rerender(<Header />);
    expect(screen.queryByRole('button', { name: /tutorial/i })).toBeNull();
  }, 10000);

  it('renders hamburger navigation control and calls the toggle handler', async () => {
    const { Header } = await import('./Header');
    const onToggleNavigation = vi.fn();
    render(<Header onToggleNavigation={onToggleNavigation} navigationAriaLabel="Open navigation" />);

    const navButton = screen.getByRole('button', { name: /open navigation/i });
    fireEvent.click(navButton);
    expect(onToggleNavigation).toHaveBeenCalledTimes(1);
  });

  it('dispatches smart capture request and routes to recording view from header CTA', async () => {
    const { Header } = await import('./Header');
    const eventSpy = vi.fn();
    window.addEventListener('smart-capture-request', eventSpy as EventListener);

    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: /smart capture/i }));

    expect(uiState.setActiveView).toHaveBeenCalledWith('recording');
    expect(eventSpy).toHaveBeenCalledTimes(1);

    const event = eventSpy.mock.calls[0][0] as CustomEvent;
    expect(uiState.requestSmartCapture).toHaveBeenCalledWith({
      activeUser: 'TestPilot',
      source: 'header',
      matchId: null,
    });
    expect(event.detail).toEqual({ activeUser: 'TestPilot', source: 'header', matchId: null, requestId: 'sc_req_1' });

    window.removeEventListener('smart-capture-request', eventSpy as EventListener);
  });

  it('auto-binds header smart capture to latest telemetry draft match', async () => {
    const { Header } = await import('./Header');
    const now = Date.now();
    const eventSpy = vi.fn();
    appStoreState.sessionStartTime = now - 120_000;
    appStoreState.matches = [{
      id: 9001,
      timestamp: now - 10_000,
      player: 'TestPilot',
      subType: 'Telemetry Draft',
    }];
    window.addEventListener('smart-capture-request', eventSpy as EventListener);

    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: /smart capture/i }));

    expect(eventSpy).toHaveBeenCalledTimes(1);
    const event = eventSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ activeUser: 'TestPilot', source: 'header', matchId: 9001, requestId: 'sc_req_1' });

    window.removeEventListener('smart-capture-request', eventSpy as EventListener);
  });

  it('prefers the active telemetry draft over stale pending submission state', async () => {
    const { Header } = await import('./Header');
    const now = Date.now();
    const eventSpy = vi.fn();
    appStoreState.sessionStartTime = now - 120_000;
    appStoreState.pendingMatchData = {
      id: 77,
      timestamp: now - 300_000,
      player: 'TestPilot',
      subType: 'Combat',
    };
    appStoreState.matches = [
      {
        id: 77,
        timestamp: now - 300_000,
        player: 'TestPilot',
        subType: 'Combat',
      },
      {
        id: 9001,
        timestamp: now - 10_000,
        player: 'TestPilot',
        subType: 'Telemetry Draft',
      },
    ];
    window.addEventListener('smart-capture-request', eventSpy as EventListener);

    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: /smart capture/i }));

    expect(eventSpy).toHaveBeenCalledTimes(1);
    const event = eventSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ activeUser: 'TestPilot', source: 'header', matchId: 9001, requestId: 'sc_req_1' });

    window.removeEventListener('smart-capture-request', eventSpy as EventListener);
  });

  it('disables smart capture CTA while vision capture/processing is active', async () => {
    const { Header } = await import('./Header');
    uiState.visionStatus = 'processing';

    render(<Header />);
    expect(screen.getByRole('button', { name: /smart capture/i })).toBeDisabled();
  });
});

