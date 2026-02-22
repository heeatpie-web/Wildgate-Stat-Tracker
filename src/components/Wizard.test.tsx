import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const gameData = {
    pendingMatchData: null as any,
    setPendingMatchData: vi.fn(),
    pendingPlacement: null as number | null,
    setPendingPlacement: vi.fn(),
    pendingArtifactType: '',
    setPendingArtifactType: vi.fn(),
    pendingKilledBy: '',
    setPendingKilledBy: vi.fn(),
    pendingKilledByShip: '',
    setPendingKilledByShip: vi.fn(),
    selectedOpponents: [] as string[],
    setSelectedOpponents: vi.fn(),
    sessionTeams: {} as Record<string, string[]>,
    sessionShipTypes: {} as Record<string, string>,
    currentLoadout: null as any,
    timeMin: '',
    setTimeMin: vi.fn(),
    timeSec: '',
    setTimeSec: vi.fn(),
    damageTaken: '',
    setDamageTaken: vi.fn(),
    kills: { 'AI Legion': 0 } as Record<string, number>,
    setKills: vi.fn(),
    poiEasy: 0,
    setPoiEasy: vi.fn(),
    poiMedium: 0,
    setPoiMedium: vi.fn(),
    poiEpic: 0,
    setPoiEpic: vi.fn(),
};

const uiState = {
    showWizard: null as 'Win' | 'Loss' | 'Draw' | null,
    setShowWizard: vi.fn(),
    isOverlayMode: false,
    activeMode: 'Artifact Brawl',
    activeUser: 'Alec',
    setToast: vi.fn(),
    pushNotification: vi.fn(),
    requestSmartCapture: vi.fn(() => 'wizard-test-request'),
};

const processFinalSubmission = vi.fn();
const setPendingMatchDataFromStore = vi.fn();

vi.mock('../providers/GameDataProvider', () => ({
    useGameData: () => gameData,
}));

vi.mock('../providers/UIStateProvider', () => ({
    useUIState: () => uiState,
}));

vi.mock('../hooks/useMatchSubmission', () => ({
    useMatchSubmission: () => ({
        processFinalSubmission,
        submitting: false,
    }),
}));

vi.mock('../store/useAppStore', () => {
    const hook = (() => ({})) as unknown as {
        (): Record<string, never>;
        getState: () => { setPendingMatchData: typeof setPendingMatchDataFromStore };
    };
    hook.getState = () => ({ setPendingMatchData: setPendingMatchDataFromStore });
    return { useAppStore: hook };
});

vi.mock('./OcrCorrectionModal', () => ({
    OcrCorrectionModal: () => null,
}));

describe('Wizard', () => {
    beforeEach(() => {
        gameData.pendingMatchData = null;
        gameData.currentLoadout = null;
        gameData.sessionTeams = {};
        uiState.showWizard = null;
        vi.clearAllMocks();
    });

    it('does not crash when transitioning from closed to open wizard state', async () => {
        const { Wizard } = await import('./Wizard');
        const { rerender } = render(<Wizard />);

        expect(screen.queryByText(/finalize/i)).not.toBeInTheDocument();

        gameData.pendingMatchData = {
            id: 101,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: ['Bolt Rifle'],
                equipment: ['Shield Matrix'],
            },
        };
        uiState.showWizard = 'Win';

        expect(() => rerender(<Wizard />)).not.toThrow();
        expect(screen.getByRole('button', { name: /finalize combat/i })).toBeInTheDocument();
    });
});
