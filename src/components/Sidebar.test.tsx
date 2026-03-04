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
  sidebarCollapsed: false,
};

const gameData = {
  players: ['TestPilot', 'Nova'],
  deletePlayer: vi.fn(),
};

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

describe('Sidebar', () => {
  beforeEach(() => {
    uiState.activeView = 'recording';
    uiState.sidebarCollapsed = false;
    uiState.activeUser = 'TestPilot';
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
});

