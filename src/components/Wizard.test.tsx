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
    setSelectedTeammates: vi.fn(),
    selectedOpponents: [] as string[],
    setSelectedOpponents: vi.fn(),
    setSelectedReachModifiers: vi.fn(),
    sessionTeams: {} as Record<string, string[]>,
    setSessionTeams: vi.fn(),
    sessionShipTypes: {} as Record<string, string>,
    setSessionShipTypes: vi.fn(),
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
    updateMatch: vi.fn(),
};

const uiState = {
    showWizard: null as 'Win' | 'Loss' | 'Draw' | 'Match Result' | null,
    setShowWizard: vi.fn(),
    isOverlayMode: false,
    activeMode: 'Artifact Brawl',
    activeUser: 'TestPilot',
    setToast: vi.fn(),
    pushNotification: vi.fn(),
    requestSmartCapture: vi.fn(() => 'wizard-test-request'),
};

const processFinalSubmission = vi.fn();
const saveResultDraft = vi.fn();
const discardTelemetryDraft = vi.fn();
const setPendingMatchDataFromStore = vi.fn();
const rerunOCRMulti = vi.fn();
const bundleMatchArtifacts = vi.fn();
const appStoreState = {
    ocrMode: 'local',
    ocrRegions: undefined,
    wizardCloseOnOcrApply: false,
    pendingMatchData: null as any,
    matches: [] as any[],
    setPendingMatchData: setPendingMatchDataFromStore,
};

vi.mock('../providers/GameDataProvider', () => ({
    useGameData: () => gameData,
}));

vi.mock('../providers/UIStateProvider', () => ({
    useUIState: () => uiState,
}));

vi.mock('../hooks/useMatchSubmission', () => ({
    useMatchSubmission: () => ({
        processFinalSubmission,
        saveResultDraft,
        discardTelemetryDraft,
        submitting: false,
    }),
}));

vi.mock('../utils/artifactService', () => ({
    bundleMatchArtifacts,
    rerunOCRMulti,
}));

vi.mock('../store/useAppStore', () => {
    const hook = ((selector?: (value: typeof appStoreState) => unknown) => (
        typeof selector === 'function' ? selector(appStoreState) : appStoreState
    )) as unknown as {
        (selector?: (value: typeof appStoreState) => unknown): unknown;
        getState: () => typeof appStoreState;
    };
    hook.getState = () => appStoreState;
    return { useAppStore: hook };
});

vi.mock('./OcrCorrectionModal', () => ({
    OcrCorrectionModal: ({ onAcceptAll, onClose, onRequestRerunOcr, rerunOcrDisabled, isRerunningOcr, onEmbeddedFooterActionsChange }: any) => {
        const acceptRef = React.useRef(onAcceptAll);
        const closeRef = React.useRef(onClose);
        acceptRef.current = onAcceptAll;
        closeRef.current = onClose;
        React.useEffect(() => {
            onEmbeddedFooterActionsChange?.({
                discard: () => closeRef.current?.(),
                saveAndClose: () => acceptRef.current?.(),
            });
            return () => onEmbeddedFooterActionsChange?.(null);
        }, [onEmbeddedFooterActionsChange]);

        return (
            <div data-testid="ocr-correction-embedded-shell" className="ocr-correction-dialog--embedded">
                {onRequestRerunOcr && (
                    <button
                        type="button"
                        onClick={onRequestRerunOcr}
                        disabled={rerunOcrDisabled}
                    >
                        {isRerunningOcr ? 'Re-running...' : 'Re-run OCR'}
                    </button>
                )}
                <div data-testid="ocr-correction-scroll-body" className="ocr-correction-body" />
            </div>
        );
    },
}));

const getSubmitResultsButton = () => screen.getByTestId('wizard-submit-results-button');
const getSubmitFooterHint = () => screen.getByTestId('wizard-submit-footer-hint');

describe('Wizard', () => {
    beforeEach(() => {
        gameData.pendingMatchData = null;
        gameData.pendingPlacement = null;
        gameData.currentLoadout = null;
        gameData.sessionTeams = {};
        gameData.sessionShipTypes = {};
        uiState.showWizard = null;
        appStoreState.wizardCloseOnOcrApply = false;
        appStoreState.pendingMatchData = null;
        appStoreState.matches = [];
        vi.clearAllMocks();
        bundleMatchArtifacts.mockResolvedValue([]);
        rerunOCRMulti.mockResolvedValue({
            success: false,
            perFile: [],
        });
        uiState.setShowWizard.mockImplementation((next: 'Win' | 'Loss' | 'Draw' | 'Match Result' | null) => {
            uiState.showWizard = next;
        });
        gameData.setPendingPlacement.mockImplementation((next: number | null) => {
            gameData.pendingPlacement = next;
        });
    });

    it('opens in neutral state with a sticky submit footer and requires win type selection before enabling submission', async () => {
        const { Wizard } = await import('./Wizard');
        const { rerender } = render(<Wizard />);

        expect(screen.queryByRole('button', { name: /submit results/i })).not.toBeInTheDocument();

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
        expect(screen.getByRole('button', { name: /save results only/i })).toBeDisabled();
        expect(getSubmitResultsButton()).toBeDisabled();
        expect(getSubmitFooterHint()).toHaveTextContent('Select Win, Loss, or Draw to submit.');

        fireEvent.click(screen.getByRole('button', { name: /^win$/i }));
        rerender(<Wizard />);
        expect(screen.getByRole('button', { name: /save results only/i })).toBeDisabled();
        expect(getSubmitResultsButton()).toBeDisabled();
        expect(getSubmitFooterHint()).toHaveTextContent('Choose Combat Win or Artifact Win to submit.');
        expect(screen.queryByText('Placement')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /artifact win/i }));
        expect(screen.queryByTestId('wizard-submit-footer-hint')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save results only/i })).toBeEnabled();
        expect(getSubmitResultsButton()).toBeEnabled();
    });

    it('renders neutral match-result state with disabled submit actions and a reminder', async () => {
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
        expect(screen.getByRole('button', { name: /save results only/i })).toBeDisabled();
        expect(getSubmitResultsButton()).toBeDisabled();
        expect(getSubmitFooterHint()).toHaveTextContent('Select Win, Loss, or Draw to submit.');
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

        expect(screen.queryByText('Placement')).not.toBeInTheDocument();
        expect(getSubmitResultsButton()).toBeDisabled();
        expect(getSubmitFooterHint()).toHaveTextContent('Choose Combat Defeat or Artifact Defeat to submit.');

        fireEvent.click(screen.getByRole('button', { name: /combat defeat/i }));
        rerender(<Wizard />);
        expect(screen.getByText('Placement')).toBeInTheDocument();
        expect(getSubmitResultsButton()).toBeDisabled();
        expect(getSubmitFooterHint()).toHaveTextContent('Select your placement for a combat defeat to submit.');
        fireEvent.click(screen.getByRole('button', { name: /3rd/i }));
        expect(gameData.setPendingPlacement).toHaveBeenCalledWith(3);
        rerender(<Wizard />);
        expect(screen.getByRole('button', { name: /save results only/i })).toBeEnabled();
        expect(getSubmitResultsButton()).toBeEnabled();
        expect(screen.queryByTestId('wizard-submit-footer-hint')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /artifact defeat/i }));
        rerender(<Wizard />);
        expect(screen.queryByText('Placement')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save results only/i })).toBeEnabled();
        expect(getSubmitResultsButton()).toBeEnabled();
        expect(screen.queryByTestId('wizard-submit-footer-hint')).not.toBeInTheDocument();
    });

    it('keeps draw immediate and submits draw without outcome type selection', async () => {
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
        const submitResultsButton = getSubmitResultsButton();
        expect(screen.getByRole('button', { name: /save results only/i })).toBeEnabled();
        expect(submitResultsButton).toBeEnabled();
        expect(screen.queryByTestId('wizard-submit-footer-hint')).not.toBeInTheDocument();

        fireEvent.click(submitResultsButton);
        expect(processFinalSubmission).toHaveBeenCalledWith('Combat');
    });

    it('mirrors result choices into the pending draft and supports save-results-only', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 1201,
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

        fireEvent.click(screen.getByRole('button', { name: /^win$/i }));
        rerender(<Wizard />);
        expect(setPendingMatchDataFromStore).toHaveBeenCalledWith(expect.objectContaining({
            result: 'Win',
        }));

        fireEvent.click(screen.getByRole('button', { name: /artifact win/i }));
        expect(setPendingMatchDataFromStore).toHaveBeenCalledWith(expect.objectContaining({
            result: 'Win',
            subType: 'Artifact',
        }));

        expect(screen.getByRole('button', { name: /abort submission/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save results only/i })).toBeInTheDocument();
        expect(getSubmitResultsButton()).toBeInTheDocument();
        expect(getSubmitResultsButton()).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: /save results only/i }));
        expect(saveResultDraft).toHaveBeenCalledWith('Artifact');
    });

    it('discards the underlying telemetry draft from the wizard footer instead of only closing the modal', async () => {
        const { Wizard } = await import('./Wizard');
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        gameData.pendingMatchData = {
            id: 4242,
            result: 'Win',
            subType: 'Artifact',
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        appStoreState.pendingMatchData = { ...gameData.pendingMatchData };
        appStoreState.matches = [{
            id: 4242,
            timestamp: 1_700_000_444_000,
            date: '1/1/2024',
            mode: 'Artifact Brawl',
            player: 'TestPilot',
            teammates: [],
            opponents: [],
            hero: 'Adrian',
            ship: 'Hunter',
            reachModifiers: [],
            kills: { 'AI Legion': 0 },
            result: 'Ongoing',
            subType: 'Telemetry Draft',
        }];
        uiState.showWizard = 'Win';

        render(<Wizard />);

        fireEvent.click(screen.getByRole('button', { name: /discard match draft/i }));

        expect(confirmSpy).toHaveBeenCalled();
        expect(discardTelemetryDraft).toHaveBeenCalledWith(4242);
        expect(uiState.setShowWizard).not.toHaveBeenCalledWith(null);
        confirmSpy.mockRestore();
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
        fireEvent.click(screen.getByRole('button', { name: /artifact defeat/i }));

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
        fireEvent.click(screen.getByRole('button', { name: /artifact defeat/i }));

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

    it('rehydrates reviewed combat-loss drafts into later guided steps immediately', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 550,
            result: 'Loss',
            subType: 'Combat',
            placement: 3,
            ocrReviewedAt: 1700000000000,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        gameData.pendingPlacement = null;
        uiState.showWizard = 'Loss';

        const { rerender } = render(<Wizard />);

        await waitFor(() => {
            expect(gameData.setPendingPlacement).toHaveBeenCalledWith(3);
        });
        rerender(<Wizard />);
        expect(getSubmitResultsButton()).toBeEnabled();
        expect(screen.queryByTestId('wizard-submit-footer-hint')).not.toBeInTheDocument();
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
        fireEvent.click(screen.getByRole('button', { name: /artifact win/i }));
        fireEvent.click(screen.getByRole('button', { name: /ocr review/i }));

        expect(screen.getByText('Prospector Loadout')).toBeInTheDocument();
        expect(screen.getByText('Telemetry')).toBeInTheDocument();
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
        fireEvent.click(screen.getByRole('button', { name: /artifact win/i }));

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

  it('renders the widened wizard shell', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 908,
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
        const shell = container.querySelector('.wizard-shell');

        expect(shell).not.toBeNull();
        expect(shell).toHaveClass('max-w-7xl');
    });

  it('lets the OCR review tab own scrolling instead of a fixed inner shell', async () => {
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
        const reviewShell = screen.getByTestId('wizard-ocr-review-shell');
        const innerWrapper = container.querySelector('[data-testid=\"wizard-ocr-tab-panel\"] > .flex-1') as HTMLDivElement | null;

        expect(ocrPanel).toHaveClass('flex-1');
        expect(ocrPanel).toHaveClass('min-h-0');
        expect(ocrPanel).toHaveClass('overflow-y-auto');
        expect(ocrPanel).toHaveClass('flex');
        expect(ocrPanel).toHaveClass('flex-col');
        expect(screen.queryByText(/review panel/i)).toBeNull();
        expect(reviewShell).toHaveClass('relative');
        expect(reviewShell).not.toHaveClass('overflow-hidden');
        expect(innerWrapper).toBeNull();
        expect(embeddedShell).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /re-run ocr/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /back to result/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save and apply/i })).toBeInTheDocument();
    });

    it('dims the OCR review content while background processing is still running', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 913,
            ocrState: 'processing',
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Win';

        const { rerender } = render(<Wizard />);
        fireEvent.click(screen.getByRole('button', { name: /ocr review/i }));

        expect(screen.getByTestId('wizard-ocr-processing-overlay')).toBeInTheDocument();
        expect(screen.getByText(/processing ocr/i)).toBeInTheDocument();

        gameData.pendingMatchData = {
            ...gameData.pendingMatchData,
            ocrState: 'reviewing',
        };
        rerender(<Wizard />);

        expect(screen.queryByTestId('wizard-ocr-processing-overlay')).toBeNull();
    });

    it('returns to the result tab after embedded OCR save-and-apply when close-on-apply is disabled', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 915,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
            ocrState: 'reviewing',
        };
        appStoreState.pendingMatchData = {
            ...gameData.pendingMatchData,
            result: 'Win',
        };
        appStoreState.matches = [{
            id: 915,
            timestamp: 1_700_000_000_000,
            date: '1/1/2024',
            mode: 'Artifact Brawl',
            player: 'TestPilot',
            teammates: [],
            opponents: [],
            hero: 'Adrian',
            ship: 'Hunter',
            reachModifiers: [],
            kills: { 'AI Legion': 0 },
            result: 'Win',
            subType: 'Combat',
        }];
        uiState.showWizard = 'Win';

        render(<Wizard />);
        fireEvent.click(screen.getByRole('button', { name: /ocr review/i }));
        fireEvent.click(screen.getByRole('button', { name: /save and apply/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /abort submission/i })).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: /save and apply/i })).not.toBeInTheDocument();
        expect(uiState.setShowWizard).not.toHaveBeenCalledWith(null);
        expect(gameData.updateMatch).toHaveBeenCalledWith(expect.objectContaining({
            id: 915,
            ocrState: 'saved',
        }));
    });

    it('closes the wizard after embedded OCR save-and-apply when smart-captures close-on-apply is enabled', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 916,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
            },
            kills: { 'AI Legion': 0 },
            ocrState: 'reviewing',
        };
        appStoreState.pendingMatchData = {
            ...gameData.pendingMatchData,
            result: 'Win',
        };
        appStoreState.matches = [{
            id: 916,
            timestamp: 1_700_000_000_000,
            date: '1/1/2024',
            mode: 'Artifact Brawl',
            player: 'TestPilot',
            teammates: [],
            opponents: [],
            hero: 'Adrian',
            ship: 'Hunter',
            reachModifiers: [],
            kills: { 'AI Legion': 0 },
            result: 'Win',
            subType: 'Combat',
        }];
        appStoreState.wizardCloseOnOcrApply = true;
        uiState.showWizard = 'Win';

        const { rerender } = render(<Wizard />);
        fireEvent.click(screen.getByRole('button', { name: /ocr review/i }));
        fireEvent.click(screen.getByRole('button', { name: /save and apply/i }));

        await waitFor(() => {
            expect(uiState.setShowWizard).toHaveBeenCalledWith(null);
        });
        rerender(<Wizard />);

        expect(screen.queryByRole('button', { name: /save and apply/i })).not.toBeInTheDocument();
        expect(gameData.updateMatch).toHaveBeenCalledWith(expect.objectContaining({
            id: 916,
            ocrState: 'saved',
        }));
    });

    it('keeps prospector loadout collapsed by default in the OCR tab', async () => {
        const { Wizard } = await import('./Wizard');
        gameData.pendingMatchData = {
            id: 912,
            loadout: {
                hero: 'Adrian',
                ship: 'Hunter',
                weapons: [],
                equipment: [],
                characterWeapons: ['Scattergun'],
                characterEquipment: ['Shield Matrix'],
                characterPerks: ['Quickstep'],
            },
            kills: { 'AI Legion': 0 },
        };
        uiState.showWizard = 'Win';

        render(<Wizard />);
        fireEvent.click(screen.getByRole('button', { name: /artifact win/i }));
        fireEvent.click(screen.getByRole('button', { name: /ocr review/i }));

        expect(screen.getByRole('button', {
            name: /weapons: 1 · equipment: 1 · perk: 1/i,
        })).toBeInTheDocument();
        expect(screen.queryByText('Edit Weapons')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('wizard-prospector-summary-toggle'));

        expect(screen.getByText('Edit Weapons')).toBeInTheDocument();
        expect(screen.getByText('Edit Equipment')).toBeInTheDocument();
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
        rerunOCRMulti.mockResolvedValue({
            success: true,
            data: {
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
            perFile: [{
                imagePath: 'C:\\captures\\wizard-1.png',
                success: true,
                data: undefined,
            }],
        });

        render(<Wizard />);
        fireEvent.click(screen.getByRole('button', { name: /ocr review/i }));
        fireEvent.click(screen.getByRole('button', { name: /re-run ocr/i }));

        await waitFor(() => {
            expect(rerunOCRMulti).toHaveBeenCalledWith(
                ['C:\\captures\\wizard-1.png'],
                'TestPilot',
                'local',
                undefined,
                expect.objectContaining({ forceUncached: true }),
            );
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

