import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const uiState = {
  renameModal: { type: 'new' as const, blocking: true },
  setRenameModal: vi.fn((value) => {
    uiState.renameModal = value as typeof uiState.renameModal;
  }),
  renameValue: '',
  setRenameValue: vi.fn((value: string) => {
    uiState.renameValue = value;
  }),
  setToast: vi.fn(),
  activeUser: '',
  setActiveUser: vi.fn(),
};

const gameData = {
  addPlayer: vi.fn(),
  renamePilot: vi.fn(),
  addMatch: vi.fn(),
  addToRegistry: vi.fn(),
};

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

describe('RenameModal', () => {
  beforeEach(() => {
    uiState.renameModal = { type: 'new', blocking: true };
    uiState.renameValue = '';
    uiState.activeUser = '';
    vi.clearAllMocks();
  });

  it('sets the newly created profile as active on first-run profile creation', async () => {
    const { RenameModal } = await import('./RenameModal');
    uiState.renameValue = '  TestPilot  ';

    render(<RenameModal />);
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(gameData.addPlayer).toHaveBeenCalledWith('TestPilot');
    expect(uiState.setActiveUser).toHaveBeenCalledWith('TestPilot');
    expect(uiState.setRenameModal).toHaveBeenCalledWith(null);
  });
});

