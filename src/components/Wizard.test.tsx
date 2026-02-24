import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const rerunMatchArtifacts = vi.fn();

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

vi.mock('../utils/ocr/rerunMatchArtifacts', () => ({
    rerunMatchArtifacts,
}));

vi.mock('../store/useAppStore', () => {
    const state = {
        ocrMode: 'both',
        ocrRegions: undefined,
        externalFallbackEnabled: true,
        externalFallbackThreshold: 0.66,
        externalOnDetectorDisagreement: true,
        forceMaxAnalysis: false,
        setPendingMatchData: setPendingMatchDataFromStore,
    };
    const hook = ((selector?: (value: typeof state) => unknown) => (
        typeof selector === 'function' ? selector(state) : state
    )) as unknown as {
        (selector?: (value: typeof state) => unknown): unknown;
        getState: () => { setPendingMatchData: typeof setPendingMatchDataFromStore };
    };
    hook.getState = () => ({ setPendingMatchData: setPendingMatchDataFromStore });
    return { useAppStore: hook };
});

vi.mock('./OcrCorrectionModal', () => ({
    OcrCorrectionModal: () => (
        <div data-testid="ocr-correction-embedded-shell" className="ocr-correction-dialog--embedded">
            <div data-testid="ocr-correction-scroll-body" className="ocr-correction-body" />
        </div>
    ),
}));

describe('Wizard', () => {
    beforeEach(() => {
        gameData.pendingMatchData = null;
        gameData.pendingPlacement = null;
        gameData.currentLoadout = null;
        gameData.sessionTeams = {};
        uiState.showWizard = null;
        vi.clearAllMocks();
        rerunMatchArtifacts.mockResolvedValue({
            total: 0,
            successfulCount: 0,
            failedCount: 0,
            perFile: [],
            mergedData: null,
            cloudUsed: false,
            cloudStatusMessage: '',
        });
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

    it('shows friendly telemetry badges and hides raw event source names', async () => {
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

        expect(screen.getByTestId('wizard-telemetry-ship-weapons')).toHaveTextContent('Telemetry');
        expect(screen.getByTestId('wizard-telemetry-prospector-weapons')).toHaveTextContent('Telemetry');
        expect(screen.getByTestId('wizard-telemetry-prospector-equipment')).toHaveTextContent('Telemetry');
        expect(screen.queryByText(/NebLoadoutSaved/i)).not.toBeInTheDocument();
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

    it('keeps OCR review tab in a non-clipping flex layout chain', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 910,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Match Result';

        const { container } = render(<Wizard />);
        fireEvent.click(screen.getByRole('button', { name: /ocr review/i }));

        const ocrPanel = screen.getByTestId('wizard-ocr-tab-panel');
        const embeddedShell = screen.getByTestId('ocr-correction-embedded-shell');
        const innerWrapper = container.querySelector('[data-testid=\"wizard-ocr-tab-panel\"] > .flex-1') as HTMLDivElement | null;

        expect(ocrPanel).toHaveClass('flex-1');
        expect(ocrPanel).toHaveClass('min-h-0');
        expect(ocrPanel).toHaveClass('flex');
        expect(ocrPanel).toHaveClass('flex-col');
        expect(innerWrapper).not.toBeNull();
        expect(innerWrapper).toHaveClass('flex-1');
        expect(innerWrapper).toHaveClass('min-h-0');
        expect(innerWrapper).toHaveClass('flex');
        expect(innerWrapper).toHaveClass('flex-col');
        expect(innerWrapper).toHaveClass('overflow-hidden');
        expect(embeddedShell).toBeInTheDocument();
    });

    it('reruns OCR from the OCR tab and updates pending data with rerun output', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 911,
            ship: 'Hunter',
            teammates: ['Wingman'],
            opponents: ['Enemy'],
            opponentTeams: [],
            reachModifiers: [],
            artifacts: ['C:\\captures\\wizard-1.png'],
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Match Result';
        rerunMatchArtifacts.mockResolvedValue({
            total: 1,
            successfulCount: 1,
            failedCount: 0,
            perFile: [{
                imagePath: 'C:\\captures\\wizard-1.png',
                filename: 'wizard-1.png',
                success: true,
                data: undefined,
            }],
            mergedData: {
                screenshotType: 'crew_hub',
                playerShip: { shipType: 'Bastion', confidence: 88, rawText: 'Bastion' },
                reachModifiers: [{ name: 'Ice Storm', confidence: 84, rawText: 'ICE STORM' }],
                enemyShips: [],
                teammates: [{ name: 'Wingman', confidence: 86, isTeammate: true }],
                opponentTeams: [{
                    teamName: 'Red Team',
                    shipType: 'Scout',
                    color: 'red',
                    players: [{ name: 'EnemyOne', confidence: 82, isTeammate: false }],
                    confidence: 80,
                }],
                overallConfidence: 86,
                captureTimestamp: Date.now(),
                rawText: 'sample',
                ocrSource: 'merged',
            },
            cloudUsed: true,
            cloudStatusMessage: 'Cloud OCR contributed',
        });

        render(<Wizard />);
        fireEvent.click(screen.getByRole('button', { name: /ocr review/i }));
        fireEvent.click(screen.getByRole('button', { name: /re-run ocr/i }));

        await waitFor(() => {
            expect(rerunMatchArtifacts).toHaveBeenCalledWith(expect.objectContaining({
                imagePaths: ['C:\\captures\\wizard-1.png'],
            }));
        });
        expect(setPendingMatchDataFromStore).toHaveBeenCalledWith(expect.objectContaining({
            ship: 'Bastion',
            teammates: ['Wingman'],
            opponents: ['EnemyOne'],
            opponentTeams: expect.arrayContaining([
                expect.objectContaining({ teamName: 'Red Team', shipType: 'Scout' }),
            ]),
            reachModifiers: ['Ice Storm'],
            ocrState: 'reviewing',
        }));
        expect(uiState.pushNotification).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringMatching(/OCR rerun complete/i),
        }));
        expect(uiState.pushNotification).not.toHaveBeenCalledWith(expect.objectContaining({
            message: 'Smart Capture requested from wizard.',
        }));
    });
});
