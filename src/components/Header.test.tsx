import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const uiState = {
  activeUser: 'Alec',
  setActiveUser: vi.fn(),
  activeView: 'analytics',
  setActiveView: vi.fn(),
  setRenameModal: vi.fn(),
  setRenameValue: vi.fn(),
  setIsOverlayMode: vi.fn(),
  setShowTutorial: vi.fn(),
  setShowSettings: vi.fn(),
  setToast: vi.fn(),
  setShowWelcome: vi.fn(),
  devMode: false,
  setDevMode: vi.fn(),
  visionStatus: 'idle',
};

const gameData = {
  players: ['Alec', 'Casey'],
  deletePlayer: vi.fn(),
};

const userPrefs = {
  appearanceMode: 'light',
  setAppearanceMode: vi.fn(),
};

const appStoreState = {
  showSmartCaptureInHeader: true,
  tutorialCompleted: false,
};

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../providers/UserPreferencesProvider', () => ({
  useUserPreferences: () => userPrefs,
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: any) => selector(appStoreState),
}));

vi.mock('./SystemPulse', () => ({
  default: () => <div data-testid="system-pulse">Pulse</div>,
}));

describe('Header', () => {
  beforeEach(() => {
    Object.assign(uiState, {
      activeUser: 'Alec',
      activeView: 'analytics',
      devMode: false,
      visionStatus: 'idle',
    });
    Object.assign(appStoreState, {
      showSmartCaptureInHeader: true,
      tutorialCompleted: false,
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

  it('opens compact profile hub from avatar entry and exposes profile actions', async () => {
    const { Header } = await import('./Header');
    render(<Header />);

    const profileButtons = screen.getAllByTitle(/profile: alec/i);
    fireEvent.click(profileButtons[0]);

    expect(screen.getByText(/profile hub/i)).toBeInTheDocument();
    expect(screen.getByTitle(/new profile/i)).toBeInTheDocument();
    expect(screen.getByTitle(/rename profile/i)).toBeInTheDocument();
    expect(screen.getByTitle(/delete profile/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^tutorial$/i }).length).toBeGreaterThanOrEqual(2);
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
    expect(event.detail).toEqual({ activeUser: 'Alec', source: 'header' });

    window.removeEventListener('smart-capture-request', eventSpy as EventListener);
  });

  it('disables smart capture CTA while vision capture/processing is active', async () => {
    const { Header } = await import('./Header');
    uiState.visionStatus = 'processing';

    render(<Header />);
    expect(screen.getByRole('button', { name: /smart capture/i })).toBeDisabled();
  });
});
