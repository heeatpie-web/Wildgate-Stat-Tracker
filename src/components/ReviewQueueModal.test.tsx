import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const gameData = {
  pendingReviews: [] as any[],
  removePendingReview: vi.fn(),
  sessionTeams: {} as Record<string, string[]>,
  setSessionTeams: vi.fn(),
  detectedUnknowns: {} as Record<string, any>,
  addMapping: vi.fn(),
  addToRegistry: vi.fn(),
  selectedTeammates: [] as string[],
  setSelectedTeammates: vi.fn(),
  selectedOpponents: [] as string[],
  setSelectedOpponents: vi.fn(),
};

const uiState = {
  setToast: vi.fn(),
};

const appStoreState = {
  ocrLearningQueue: [] as any[],
  approveOcrLearningEvent: vi.fn(),
  rejectOcrLearningEvent: vi.fn(),
  recordOcrAliasCorrection: vi.fn(),
};

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: any) => selector(appStoreState),
}));

describe('ReviewQueueModal', () => {
  beforeEach(() => {
    Object.assign(gameData, {
      pendingReviews: [],
      sessionTeams: {},
      selectedTeammates: [],
      selectedOpponents: [],
      detectedUnknowns: {},
    });

    vi.clearAllMocks();
  });

  it('confirming a player_name adds it to roster and clears the review item', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'p1',
      type: 'player_name',
      value: 'PilotOne',
      originalConfidence: 72,
      context: 'OCR Lobby',
    }];

    render(<ReviewQueueModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Confirm/Identify'));

    expect(gameData.addToRegistry).toHaveBeenCalledWith('PilotOne');
    expect(gameData.removePendingReview).toHaveBeenCalledWith('p1');
  });

  it('editing a player_name updates team references, selected lists, and roster', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'p2',
      type: 'player_name',
      value: 'PilotOne',
      originalConfidence: 68,
      context: 'OCR Tactical',
    }];
    gameData.sessionTeams = {
      red: ['PilotOne', 'Wingman'],
      blue: ['pilotone', 'Corrected'],
    };
    gameData.selectedTeammates = ['PilotOne', 'Ally'];
    gameData.selectedOpponents = ['pilotone', 'Corrected'];

    render(<ReviewQueueModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.change(screen.getByDisplayValue('PilotOne'), { target: { value: 'Corrected' } });
    fireEvent.click(screen.getByTitle('Save'));

    expect(gameData.setSessionTeams).toHaveBeenCalledWith({
      red: ['Corrected', 'Wingman'],
      blue: ['Corrected'],
    });
    expect(gameData.setSelectedTeammates).toHaveBeenCalledWith(['Corrected', 'Ally']);
    expect(gameData.setSelectedOpponents).toHaveBeenCalledWith(['Corrected']);
    expect(gameData.addToRegistry).toHaveBeenCalledWith('Corrected');
    expect(gameData.removePendingReview).toHaveBeenCalledWith('p2');
  });

  it('deleting a player_name removes linked team and selection references', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'p3',
      type: 'player_name',
      value: 'PilotOne',
      originalConfidence: 61,
      context: 'OCR Social',
    }];
    gameData.sessionTeams = {
      red: ['PilotOne', 'Wingman'],
      blue: ['pilotone', 'Enemy'],
    };
    gameData.selectedTeammates = ['PilotOne', 'Ally'];
    gameData.selectedOpponents = ['pilotone', 'Enemy'];

    render(<ReviewQueueModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Delete (Junk)'));

    expect(gameData.setSessionTeams).toHaveBeenCalledWith({
      red: ['Wingman'],
      blue: ['Enemy'],
    });
    expect(gameData.setSelectedTeammates).toHaveBeenCalledWith(['Ally']);
    expect(gameData.setSelectedOpponents).toHaveBeenCalledWith(['Enemy']);
    expect(gameData.removePendingReview).toHaveBeenCalledWith('p3');
  });

  it('confirming a roster_candidate still adds to roster and clears review', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'r1',
      type: 'roster_candidate',
      value: 'NewPilot',
      originalConfidence: 100,
      context: 'OCR Review',
    }];

    render(<ReviewQueueModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Confirm/Identify'));

    expect(gameData.addToRegistry).toHaveBeenCalledWith('NewPilot');
    expect(gameData.removePendingReview).toHaveBeenCalledWith('r1');
  });
});
