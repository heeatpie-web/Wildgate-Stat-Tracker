import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  pushNotification: vi.fn(),
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
    Object.assign(appStoreState, {
      ocrLearningQueue: [],
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

  it('shows source screenshot context for player_name entries when available', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'p_source',
      type: 'player_name',
      value: 'Pil0tOne',
      originalConfidence: 63,
      context: 'Lobby',
      sourceCapture: {
        screenshotPath: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP8z8DwHwAFgwJ/l4s46QAAAABJRU5ErkJggg==',
        screenshotLabel: 'capture_test.png',
        capturedAt: 1739731200000,
      },
    }];

    render(<ReviewQueueModal onClose={vi.fn()} />);
    expect(screen.getByText('Source: capture_test.png')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view source/i }));
    expect(screen.getByAltText('capture_test.png')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'PilotOne' }));
    fireEvent.change(screen.getByDisplayValue('PilotOne'), { target: { value: 'Corrected' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save edited name for PilotOne' }));

    expect(gameData.setSessionTeams).toHaveBeenCalledWith({
      red: ['Corrected', 'Wingman'],
      blue: ['Corrected'],
    });
    expect(gameData.setSelectedTeammates).toHaveBeenCalledWith(['Corrected', 'Ally']);
    expect(gameData.setSelectedOpponents).toHaveBeenCalledWith(['Corrected']);
    expect(gameData.addToRegistry).toHaveBeenCalledWith('Corrected');
    expect(gameData.removePendingReview).toHaveBeenCalledWith('p2');
  });

  it('keeps team assignment controls visible while editing player_name entries', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'p2a',
      type: 'player_name',
      value: 'PilotOne',
      originalConfidence: 68,
      context: 'OCR Tactical',
    }];
    gameData.sessionTeams = {
      red: ['PilotOne', 'Wingman'],
      blue: ['Enemy'],
    };

    render(<ReviewQueueModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'PilotOne' }));

    expect(screen.getByLabelText('Edit name for PilotOne')).toBeInTheDocument();
    expect(screen.getByText('Assign Team')).toBeInTheDocument();
    expect(screen.getByLabelText('Assign PilotOne to a team')).toBeInTheDocument();
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

  it('auto-approves roster candidates at the 83% boundary to the best match on render', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'r2',
      type: 'roster_candidate',
      value: 'chrismar10',
      bestMatch: 'chrismario',
      bestScore: 83,
      originalConfidence: 100,
      context: 'OCR Review',
    }];
    gameData.sessionTeams = { red: ['chrismar10', 'Wingman'] };
    gameData.selectedTeammates = ['chrismar10'];
    gameData.selectedOpponents = ['Enemy', 'chrismar10'];

    render(<ReviewQueueModal onClose={vi.fn()} />);

    await waitFor(() => {
      expect(gameData.removePendingReview).toHaveBeenCalledWith('r2');
    });

    expect(gameData.setSessionTeams).toHaveBeenCalledWith({ red: ['chrismario', 'Wingman'] });
    expect(gameData.setSelectedTeammates).toHaveBeenCalledWith(['chrismario']);
    expect(gameData.setSelectedOpponents).toHaveBeenCalledWith(['Enemy', 'chrismario']);
    expect(gameData.addToRegistry).toHaveBeenCalledWith('chrismario');
  });

  it('shows a fuzzy-ready indicator and CTA for roster candidates scored up to the 82% boundary', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'r3',
      type: 'roster_candidate',
      value: 'chrismar10',
      bestMatch: 'chrismario',
      bestScore: 82,
      originalConfidence: 100,
      context: 'OCR Review',
    }];

    render(<ReviewQueueModal onClose={vi.fn()} />);

    expect(screen.getByText('Fuzzy-ready (70-82%)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /approve fuzzy match/i }));

    expect(gameData.addToRegistry).toHaveBeenCalledWith('chrismario');
    expect(gameData.removePendingReview).toHaveBeenCalledWith('r3');
  });

  it('keeps fuzzy-ready CTA at the 70% lower boundary', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'r3b',
      type: 'roster_candidate',
      value: 'chrismar10',
      bestMatch: 'chrismario',
      bestScore: 70,
      originalConfidence: 100,
      context: 'OCR Review',
    }];

    render(<ReviewQueueModal onClose={vi.fn()} />);

    expect(screen.getByText('Fuzzy-ready (70-82%)')).toBeInTheDocument();
    expect(gameData.removePendingReview).not.toHaveBeenCalledWith('r3b');
    fireEvent.click(screen.getByRole('button', { name: /approve fuzzy match/i }));

    expect(gameData.addToRegistry).toHaveBeenCalledWith('chrismario');
    expect(gameData.removePendingReview).toHaveBeenCalledWith('r3b');
  });

  it('keeps lower-score roster candidates manual with a standard approve CTA', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.pendingReviews = [{
      id: 'r4',
      type: 'roster_candidate',
      value: 'chrismar10',
      bestMatch: 'chrismario',
      bestScore: 62,
      originalConfidence: 100,
      context: 'OCR Review',
    }];

    render(<ReviewQueueModal onClose={vi.fn()} />);

    expect(screen.queryByText('Fuzzy-ready (70-82%)')).not.toBeInTheDocument();
    expect(gameData.removePendingReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /approve chrismario/i }));

    expect(gameData.addToRegistry).toHaveBeenCalledWith('chrismario');
    expect(gameData.removePendingReview).toHaveBeenCalledWith('r4');
  });

  it('unknown_id items still require naming before confirmation', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    gameData.detectedUnknowns = {
      abcdef1234: {
        type: 'id',
      },
    };

    render(<ReviewQueueModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Confirm/Identify'));

    expect(screen.getByPlaceholderText('Enter Name...')).toBeInTheDocument();
    expect(gameData.addMapping).not.toHaveBeenCalled();
    expect(gameData.removePendingReview).not.toHaveBeenCalled();
  });

  it('learning review items still approve through confirm action', async () => {
    const { ReviewQueueModal } = await import('./ReviewQueueModal');
    appStoreState.ocrLearningQueue = [{
      id: 'learn_1',
      eventId: 'evt_1',
      rawText: 'PliotOne',
      suggestedName: 'PilotOne',
      context: 'roster',
      score: 0.92,
      explanation: [],
    }];

    render(<ReviewQueueModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Confirm/Identify'));

    expect(appStoreState.approveOcrLearningEvent).toHaveBeenCalledWith('evt_1');
    expect(gameData.removePendingReview).not.toHaveBeenCalled();
  });
});
