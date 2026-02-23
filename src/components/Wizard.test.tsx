import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    showWizard: null as 'Win' | 'Loss' | 'Draw' | 'Match Result' | null,
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
        gameData.pendingPlacement = null;
        gameData.currentLoadout = null;
        gameData.sessionTeams = {};
        uiState.showWizard = null;
        vi.clearAllMocks();
        uiState.setShowWizard.mockImplementation((next: 'Win' | 'Loss' | 'Draw' | 'Match Result' | null) => {
            uiState.showWizard = next;
        });
        gameData.setPendingPlacement.mockImplementation((next: number | null) => {
            gameData.pendingPlacement = next;
        });
    });

    it('opens in neutral state and requires win type selection before finalizing', async () => {
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
        uiState.showWizard = 'Match Result';

        expect(() => rerender(<Wizard />)).not.toThrow();
        expect(screen.getByRole('button', { name: /select match result/i })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /^win$/i }));
        rerender(<Wizard />);
        expect(screen.getByRole('button', { name: /choose win type/i })).toBeDisabled();
        expect(screen.queryByText('Placement')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /artifact win/i }));
        expect(screen.getByRole('button', { name: /finalize artifact win/i })).toBeEnabled();
    });

    it('renders neutral match-result state without implicit finalize readiness', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 202,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Match Result';

        render(<Wizard />);

        expect(screen.getByText('Match Result')).toBeInTheDocument();
        expect(screen.getAllByText('Ship Eliminations').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /select match result/i })).toBeDisabled();
    });

    it('requires selecting combat or artifact for loss and only shows placement for combat loss', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 702,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Match Result';

        const { rerender } = render(<Wizard />);

        fireEvent.click(screen.getByRole('button', { name: /^loss$/i }));
        rerender(<Wizard />);

        expect(screen.getByRole('button', { name: /choose loss type/i })).toBeDisabled();
        expect(screen.queryByText('Placement')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /combat defeat/i }));
        rerender(<Wizard />);
        expect(screen.getByText('Placement')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /finalize combat loss/i })).toBeEnabled();
        expect(gameData.setPendingPlacement).toHaveBeenCalledWith(2);

        fireEvent.click(screen.getByRole('button', { name: /artifact defeat/i }));
        rerender(<Wizard />);
        expect(screen.queryByText('Placement')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /finalize artifact loss/i })).toBeEnabled();
    });

    it('keeps draw immediate and finalizes draw without outcome type selection', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 703,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Match Result';

        const { rerender } = render(<Wizard />);

        fireEvent.click(screen.getByRole('button', { name: /^draw$/i }));
        rerender(<Wizard />);
        const finalizeButton = screen.getByRole('button', { name: /finalize draw/i });
        expect(finalizeButton).toBeEnabled();

        fireEvent.click(finalizeButton);
        expect(processFinalSubmission).toHaveBeenCalledWith('Combat');
    });

    it('stores eliminator selection by normalized team color in loss flow', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 303,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
            opponentTeams: [{
                teamName: 'Red Raptors',
                shipType: 'Hunter',
                color: 'Red Team',
                players: ['Enemy One'],
            }],
        };
        uiState.showWizard = 'Loss';

        render(<Wizard />);

        fireEvent.click(screen.getByRole('button', { name: /red team/i }));

        expect(setPendingMatchDataFromStore).toHaveBeenCalledWith(expect.objectContaining({
            eliminatedByTeam: 'red',
        }));
        expect(gameData.setPendingKilledBy).toHaveBeenCalledWith('Red Team');
        expect(gameData.setPendingKilledByShip).toHaveBeenCalledWith('Hunter');
    });

    it('falls back to team name when eliminator color is unknown', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 404,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
            opponentTeams: [{
                teamName: 'Mystery Squad',
                shipType: 'Scout',
                color: 'unknown',
                players: ['Enemy Two'],
            }],
        };
        uiState.showWizard = 'Loss';

        render(<Wizard />);

        fireEvent.click(screen.getByRole('button', { name: /mystery squad/i }));

        expect(setPendingMatchDataFromStore).toHaveBeenCalledWith(expect.objectContaining({
            eliminatedByTeam: 'Mystery Squad',
        }));
        expect(gameData.setPendingKilledBy).toHaveBeenCalledWith('Mystery Squad');
        expect(gameData.setPendingKilledByShip).toHaveBeenCalledWith('Scout');
    });

    it('hydrates time fields from pending match time when inputs are empty', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 505,
            time: '07:34',
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        gameData.timeMin = '';
        gameData.timeSec = '';
        uiState.showWizard = 'Win';

        render(<Wizard />);

        expect(gameData.setTimeMin).toHaveBeenCalledWith('07');
        expect(gameData.setTimeSec).toHaveBeenCalledWith('34');
    });

    it('shows telemetry source badges beside loadout detail sections', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 606,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: ['Bolt Rifle'],
                equipment: [],
                characterWeapons: ['Scattergun'],
                characterEquipment: ['Shield Matrix'],
            },
            telemetryConsistency: {
                loadoutSaves: [
                    { timestamp: 1700000000000, inGame: true, source: 'NebLoadoutSaved' },
                ],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Win';

        render(<Wizard />);

        fireEvent.click(screen.getByRole('button', { name: /prospector loadout/i }));

        expect(screen.getByTestId('wizard-telemetry-ship-weapons')).toHaveTextContent('Source: NebLoadoutSaved');
        expect(screen.getByTestId('wizard-telemetry-prospector-weapons')).toHaveTextContent('Source: NebLoadoutSaved');
        expect(screen.getByTestId('wizard-telemetry-prospector-equipment')).toHaveTextContent('Source: NebLoadoutSaved');
    });

    it('uses non-clipping time input classes and AI Legion highlight treatment', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 707,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 3 },
        };
        gameData.timeMin = '01';
        gameData.timeSec = '09';
        uiState.showWizard = 'Win';

        render(<Wizard />);

        const timeRow = screen.getByTestId('wizard-time-row');
        expect(timeRow).toBeInTheDocument();
        const timeInputs = screen.getAllByPlaceholderText('00');
        expect(timeInputs).toHaveLength(2);
        timeInputs.forEach((input) => {
            expect(input).toHaveClass('wizard-time-input');
            expect(input).toHaveClass('wizard-input-control');
        });

        const aiLegionCard = screen.getByTestId('wizard-ai-legion-kill-card');
        expect(aiLegionCard).toHaveClass('wizard-kill-card--ai-legion');
        expect(aiLegionCard).toHaveClass('ai-legion-chip');
        expect(screen.getByText('AI Legion')).toBeInTheDocument();
    });

    it('exposes modal dialog semantics for accessibility', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 808,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Match Result';

        render(<Wizard />);

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby');
        expect(dialog).toHaveAttribute('aria-describedby');
    });

    it('closes the wizard on Escape key', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 909,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Match Result';

        render(<Wizard />);

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(uiState.setShowWizard).toHaveBeenCalledWith(null);
    });
});
