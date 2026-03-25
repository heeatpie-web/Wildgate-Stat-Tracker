import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RosterPanel } from './RosterPanel';

const gameDataState = {
    pilotRegistry: ['Wingman'],
    favorites: [] as string[],
    pilotNotes: {} as Record<string, string>,
    selectedTeammates: [] as string[],
    toggleTeammate: vi.fn(),
    selectedOpponents: [] as string[],
    toggleOpponent: vi.fn(),
    activeShip: 'Hunter',
    addToRegistry: vi.fn(),
    toggleFavorite: vi.fn(),
    updatePilotNote: vi.fn(),
    removeFromRegistry: vi.fn(),
    renamePilot: vi.fn(),
    mergePilots: vi.fn(),
    pilotAliases: {} as Record<string, string[]>,
    addPilotAlias: vi.fn(),
    removePilotAlias: vi.fn(),
    undoLastMerge: vi.fn(),
    mergeHistory: [] as Array<{ timestamp: number }>,
    setSessionTeams: vi.fn(),
    setSessionShipTypes: vi.fn(),
    sessionTeams: {} as Record<string, string[]>,
    selectedReachModifiers: [] as string[],
    setSelectedReachModifiers: vi.fn(),
    sessionShipTypes: {} as Record<string, string>,
    addPendingReview: vi.fn(),
    pendingReviews: [] as unknown[],
};

const uiState = {
    activeUser: 'TestPilot',
    setToast: vi.fn(),
    setActiveView: vi.fn(),
    setPlayerHubFocusName: vi.fn(),
};

const appStoreState = {
    recordOcrAliasCorrection: vi.fn(),
    removeOcrAliasCorrection: vi.fn(),
    pendingMatchData: null as unknown,
    setPendingMatchData: vi.fn(),
};

vi.mock('../../providers/GameDataProvider', () => ({
    useGameData: () => gameDataState,
}));

vi.mock('../../providers/UIStateProvider', () => ({
    useUIState: () => uiState,
}));

vi.mock('../../store/useAppStore', () => ({
    useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

describe('RosterPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gameDataState.pilotRegistry = ['Wingman'];
        gameDataState.selectedTeammates = [];
        gameDataState.selectedOpponents = [];
        gameDataState.sessionTeams = {};
        gameDataState.selectedReachModifiers = [];
        appStoreState.pendingMatchData = null;
    });

    it('opens the selected roster player in the Players tab from the name and profile button', () => {
        render(<RosterPanel />);

        fireEvent.click(screen.getByRole('button', { name: /open wingman in players/i }));
        expect(uiState.setPlayerHubFocusName).toHaveBeenCalledWith('Wingman');
        expect(uiState.setActiveView).toHaveBeenCalledWith('players');

        fireEvent.click(screen.getByRole('button', { name: /open wingman profile in players/i }));
        expect(uiState.setPlayerHubFocusName).toHaveBeenCalledWith('Wingman');
        expect(uiState.setActiveView).toHaveBeenCalledWith('players');
    });
});
