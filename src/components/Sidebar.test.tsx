import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const uiState = {
  activeView: 'recording' as 'recording' | 'analytics' | 'smart-captures' | 'players' | 'id-mapper' | 'history' | 'dev-ocr',
  setActiveView: vi.fn(),
  setShowSettings: vi.fn(),
  setShowIdMapper: vi.fn(),
  activeUser: 'TestPilot',
  setActiveUser: vi.fn(),
  setRenameModal: vi.fn(),
  setRenameValue: vi.fn(),
  setToast: vi.fn(),
  setShowWelcome: vi.fn(),
  setShowTutorial: vi.fn(),
  setNotificationsSuspended: vi.fn(),
  sidebarCollapsed: false,
};

const gameData = {
  players: ['TestPilot', 'Nova'],
  deletePlayer: vi.fn(),
};

const appStoreState = {
  detectedUnknowns: {} as Record<string, { type: string; lastSeen: number }>,
  matches: [] as Array<Record<string, unknown>>,
};

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    uiState.activeView = 'recording';
    uiState.sidebarCollapsed = false;
    uiState.activeUser = 'TestPilot';
    appStoreState.detectedUnknowns = {};
    appStoreState.matches = [];
    vi.clearAllMocks();
  });

  it('renders main navigation items including ID Mapper', async () => {
    const { Sidebar } = await import('./Sidebar');

    render(<Sidebar />);

    expect(screen.getByRole('button', { name: /recording/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /smart captures/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /players/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /id mapper/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ocr debug/i })).toBeInTheDocument();
  });

  it('updates active view when a navigation item is clicked', async () => {
    const { Sidebar } = await import('./Sidebar');

    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /analytics/i }));

    expect(uiState.setActiveView).toHaveBeenCalledWith('analytics');
  });

  it('renders badges for pending Smart Capture work and unmapped IDs', async () => {
    const { Sidebar } = await import('./Sidebar');
    appStoreState.detectedUnknowns = {
      SHIP001: { type: 'Ship', lastSeen: Date.now() },
    };
    appStoreState.matches = [{
      id: 44,
      timestamp: Date.now(),
      date: '2026-03-07',
      mode: 'Fleet Battle',
      player: 'TestPilot',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      ocrState: 'processing',
    }];

    render(<Sidebar />);

    expect(screen.getByRole('button', { name: /smart captures \(1 pending\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /id mapper \(1 pending\)/i })).toBeInTheDocument();
  });

  it('applies the profile hub popup class used for the Twilight solid surface override', async () => {
    const { Sidebar } = await import('./Sidebar');

    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /^testpilot$/i }));

    expect(document.getElementById('sidebar-profile-menu')).toHaveClass('profile-hub-popup');
  });
});

