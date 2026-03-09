import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const OCR_REVIEW_HELP_DISMISSED_STORAGE_KEY = 'wg_ocr_review_help_dismissed_v1';

const gameData = {
    sessionTeams: {} as Record<string, string[]>,
    sessionShipTypes: {} as Record<string, string>,
    pilotRegistry: [] as string[],
    addToRegistry: vi.fn(),
    matches: [],
    selectedReachModifiers: [] as string[],
    selectedTeammates: [] as string[],
    setSelectedReachModifiers: vi.fn(),
    setSelectedTeammates: vi.fn(),
    setSelectedOpponents: vi.fn(),
    setSessionTeams: vi.fn(),
    setSessionShipTypes: vi.fn(),
    pendingReviews: [] as any[],
    removePendingReviews: vi.fn(),
};

const appStoreState = {
    setPlayerName: vi.fn(),
    recordOcrCorrection: vi.fn(),
    recordOcrAliasCorrection: vi.fn(),
    recordTeamIdentityCorrection: vi.fn(),
    resolveTeamIdentity: vi.fn((teamName: string, color?: string) => ({
        teamName,
        color: color || 'unknown',
        matched: false,
    })),
    ocrCorrections: {} as Record<string, { correctedTo: string }>,
    ocrAliasModel: { version: 1, entries: {}, recentlyUsed: [], lastUpdated: Date.now() },
    recordCalibrationSample: vi.fn(),
    ocrMode: 'both',
    ocrBatchAcceptThreshold: 85,
    setOcrBatchAcceptThreshold: vi.fn(),
    pendingMatchData: null as any,
    setPendingMatchData: vi.fn(),
};

vi.mock('../providers/GameDataProvider', () => ({
    useGameData: () => gameData,
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector?: ((state: typeof appStoreState) => unknown)) => (
        typeof selector === 'function' ? selector(appStoreState) : appStoreState
    ),
}));

vi.mock('../providers/UIStateProvider', () => ({
    useUIState: () => ({
        activeUser: 'ActivePilot',
        setToast: vi.fn(),
    }),
}));

describe('OcrCorrectionModal', () => {
    beforeEach(() => {
        gameData.sessionTeams = {};
        gameData.sessionShipTypes = {};
        gameData.pilotRegistry = [];
        gameData.matches = [];
        gameData.selectedReachModifiers = [];
        gameData.selectedTeammates = [];
        gameData.pendingReviews = [];
        appStoreState.ocrCorrections = {};
        appStoreState.ocrBatchAcceptThreshold = 85;
        appStoreState.pendingMatchData = null;
        appStoreState.resolveTeamIdentity.mockImplementation((teamName: string, color?: string) => ({
            teamName,
            color: color || 'unknown',
            matched: false,
        }));
        window.localStorage.removeItem(OCR_REVIEW_HELP_DISMISSED_STORAGE_KEY);
        vi.clearAllMocks();
    });

    it('does not crash when transitioning from closed to open state', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();
        const { rerender } = render(
            <OcrCorrectionModal isOpen={false} onClose={onClose} onAcceptAll={onAcceptAll} />
        );

        expect(screen.queryByText(/review and correct detected players/i)).not.toBeInTheDocument();

        gameData.sessionTeams = { 'red': ['PilotOne'] };
        gameData.sessionShipTypes = { PilotOne: 'Hunter' };
        gameData.pilotRegistry = ['PilotOne'];

        expect(() => rerender(
            <OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />
        )).not.toThrow();
        expect(screen.getByText(/ocr review/i)).toBeInTheDocument();
    });

    it('uses the widened standalone OCR review dialog shell', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        const dialog = document.querySelector('.ocr-correction-dialog');
        expect(dialog).not.toBeNull();
        expect(dialog).toHaveClass('max-w-7xl');
    });

    it('supports ignore and undo-ignore actions for detected players', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { 'red': ['PilotOne'] };
        gameData.sessionShipTypes = { PilotOne: 'Hunter' };
        gameData.pilotRegistry = ['PilotOne'];

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        const ignoreButtons = screen.getAllByRole('button', { name: /^ignore$/i });
        fireEvent.click(ignoreButtons[0]);
        expect(screen.getAllByRole('button', { name: /undo ignore/i }).length).toBeGreaterThan(0);

        fireEvent.click(screen.getAllByRole('button', { name: /undo ignore/i })[0]);
        expect(screen.getAllByRole('button', { name: /^ignore$/i }).length).toBeGreaterThan(0);
    });

    it('uses stored OCR name confidence for detected player rows', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        appStoreState.pendingMatchData = {
            player: 'ActivePilot',
            ship: 'Hunter (2 Player)',
            teammates: ['PilotOne'],
            opponents: [],
            opponentTeams: [],
            ocrDebug: {
                nameConfidence: {
                    pilotone: 96,
                },
            },
        };

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        expect(screen.getByRole('progressbar', { name: /ocr confidence 96%/i })).toBeInTheDocument();
        expect(screen.getByText('96%')).toBeInTheDocument();
    });

    it('scales fractional stored OCR name confidence values to percentages', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        appStoreState.pendingMatchData = {
            player: 'ActivePilot',
            ship: 'Hunter (2 Player)',
            teammates: ['PilotOne'],
            opponents: [],
            opponentTeams: [],
            ocrDebug: {
                nameConfidence: {
                    pilotone: 0.96,
                },
            },
        };

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        expect(screen.getByRole('progressbar', { name: /ocr confidence 96%/i })).toBeInTheDocument();
        expect(screen.getByText('96%')).toBeInTheDocument();
    });

    it('does not invent a player confidence when no per-name confidence was captured', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        appStoreState.pendingMatchData = {
            player: 'ActivePilot',
            ship: 'Hunter (2 Player)',
            teammates: ['PilotOne'],
            opponents: [],
            opponentTeams: [],
            ocrDebug: {
                confidence: 88,
                fieldConfidence: {
                    teammateNames: 83,
                    opponentNames: 67,
                    ship: 91,
                    modifiers: 74,
                },
            },
        };

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        expect(screen.queryByText('83%')).not.toBeInTheDocument();
        expect(screen.getByText(/no direct ocr confidence/i)).toBeInTheDocument();
    });

    it('surfaces fuzzy roster suggestions for OCR-like name variants', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['chrismar10'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['chrismario'];

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        const searchInput = screen.getByPlaceholderText(/search roster or type name/i);
        fireEvent.focus(searchInput);
        fireEvent.change(searchInput, { target: { value: 'chrismar10' } });

        expect(screen.getByRole('button', { name: 'chrismario' })).toBeInTheDocument();
    });

    it('writes drag payload data on drag start for deterministic reassignment', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne', 'PilotTwo'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne', 'PilotTwo'];

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        const teamInput = screen.getByLabelText(/red player 1 name/i);
        const dragHandle = screen.getByRole('button', { name: /drag pilotone in red/i });
        const setData = vi.fn();
        const dataTransfer = {
            effectAllowed: 'none',
            setData,
            getData: vi.fn().mockReturnValue(''),
            dropEffect: 'none',
        } as unknown as DataTransfer;

        expect(dragHandle).toHaveAttribute('draggable', 'true');
        fireEvent.dragStart(dragHandle, { dataTransfer });
        expect(setData).toHaveBeenCalled();
        expect(teamInput).toBeInTheDocument();
    });

    it('allows editing and removing players in team assignment rows before apply', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne', 'PilotTwo'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne', 'PilotTwo'];

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        const teamInput = screen.getByLabelText(/red player 1 name/i);
        fireEvent.change(teamInput, { target: { value: 'PilotOneEdited' } });
        expect(teamInput).toHaveValue('PilotOneEdited');

        fireEvent.click(screen.getByRole('button', { name: /remove pilottwo from red/i }));

        fireEvent.click(screen.getByRole('button', { name: /save and close/i }));

        expect(gameData.setSessionTeams).toHaveBeenCalledWith({ red: ['PilotOneEdited'] });
    });

    it('clears matching OCR roster reviews when adding a player to the roster from team assignment', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['Bigtower'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pendingReviews = [{
            id: 'review-1',
            type: 'roster_candidate',
            value: 'Bigtower',
            originalConfidence: 92,
            canonicalTargetKey: 'bigtower',
        }];

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        fireEvent.click(screen.getByRole('button', { name: /add bigtower to roster/i }));

        expect(gameData.addToRegistry).toHaveBeenCalledWith('Bigtower');
        expect(gameData.removePendingReviews).toHaveBeenCalledWith(['review-1']);
    });

    it('allows editing reach modifiers before apply and persists reviewed hazards', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne'];
        appStoreState.pendingMatchData = {
            player: 'ActivePilot',
            ship: 'Hunter (2 Player)',
            teammates: ['PilotOne'],
            opponents: [],
            opponentTeams: [],
            reachModifiers: ['Artifact: Ice'],
            ocrDebug: {
                hazards: ['Sandstorm'],
            },
        };

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        expect(screen.getByText('Sandstorm')).toBeInTheDocument();
        expect(screen.getByText('Artifact: Ice')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /remove modifier sandstorm/i }));
        fireEvent.change(screen.getByLabelText(/add reach modifier/i), { target: { value: 'Ancient Vault' } });
        fireEvent.click(screen.getByRole('button', { name: /add modifier/i }));
        fireEvent.click(screen.getByRole('button', { name: /save and close/i }));

        expect(gameData.setSelectedReachModifiers).toHaveBeenCalledWith(
            ['Artifact: Ice', 'Ancient Vault'],
            'manual'
        );
        expect(appStoreState.setPendingMatchData).toHaveBeenCalledWith(expect.objectContaining({
            reachModifiers: ['Artifact: Ice', 'Ancient Vault'],
            artifactSource: 'ice',
            ocrDebug: expect.objectContaining({
                hazards: ['Ancient Vault'],
            }),
        }));
    });

    it('shows OCR-resolved game artifact types in the reach hazards and modifiers list', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne'];
        appStoreState.pendingMatchData = {
            player: 'ActivePilot',
            ship: 'Hunter (2 Player)',
            teammates: ['PilotOne'],
            opponents: [],
            opponentTeams: [],
            reachModifiers: [],
            artifactSource: 'ice',
            ocrDebug: {
                hazards: ['Sandstorm'],
            },
        };

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        expect(screen.getByText('Sandstorm')).toBeInTheDocument();
        expect(screen.getByText('Artifact: Ice')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /save and close/i }));

        expect(gameData.setSelectedReachModifiers).toHaveBeenCalledWith(
            ['Sandstorm', 'Artifact: Ice'],
            'manual'
        );
        expect(appStoreState.setPendingMatchData).toHaveBeenCalledWith(expect.objectContaining({
            reachModifiers: ['Sandstorm', 'Artifact: Ice'],
            artifactSource: 'ice',
            ocrDebug: expect.objectContaining({
                hazards: ['Sandstorm'],
            }),
        }));
    });

    it('applies reviewed results without dismissing embedded OCR review', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne', 'PilotTwo'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne', 'PilotTwo'];

        render(
            <OcrCorrectionModal
                isOpen
                embedded
                onClose={onClose}
                onAcceptAll={onAcceptAll}
            />
        );

        fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

        expect(gameData.setSessionTeams).toHaveBeenCalled();
        expect(onAcceptAll).not.toHaveBeenCalled();
    });

    it('shows friendly team chip in assignment board and teammate markers in review rows', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'], blue: ['EnemyOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)', blue: 'Scout' };
        gameData.pilotRegistry = ['PilotOne', 'EnemyOne'];

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        const friendlyChip = screen.getByText(/^friendly$/i);
        expect(friendlyChip).toHaveClass('ocr-teammate-chip');
        expect(screen.getAllByText(/teammate/i).length).toBeGreaterThan(0);
    });

    it('renders inline team color control with adjacent team name and ship selector', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'], blue: ['EnemyOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)', blue: 'Scout' };
        gameData.pilotRegistry = ['PilotOne', 'EnemyOne'];

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        expect(screen.getByRole('button', { name: /team 2 color/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/team 1 name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/team 1 ship/i)).toBeInTheDocument();
    });

    it('records team identity learning when team name changes on apply', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne'];

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        const teamNameInput = screen.getByLabelText(/team 1 name/i);
        fireEvent.change(teamNameInput, { target: { value: 'Renamed Team' } });
        fireEvent.click(screen.getByRole('button', { name: /save and close/i }));

        expect(appStoreState.recordTeamIdentityCorrection).toHaveBeenCalled();
    });

    it('derives friendly team label from ship before captain name fallback', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = {};
        gameData.sessionShipTypes = {};
        gameData.pilotRegistry = ['ActivePilot', 'Wingman'];
        appStoreState.pendingMatchData = {
            player: 'ActivePilot',
            ship: 'Hunter (4 Player)',
            teammates: ['Wingman'],
            opponentTeams: [],
        };

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        expect(screen.getByLabelText(/hunter player 1 name/i)).toBeInTheDocument();
    });

    it('commits typed roster input and persists corrected teams to pending match data', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['chrismar10'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['chrismario'];

        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        const searchInput = screen.getByPlaceholderText(/search roster or type name/i);
        fireEvent.focus(searchInput);
        fireEvent.change(searchInput, { target: { value: 'chrismario' } });
        fireEvent.keyDown(searchInput, { key: 'Enter' });

        fireEvent.click(screen.getByRole('button', { name: /save and close/i }));

        expect(appStoreState.setPendingMatchData).toHaveBeenCalledWith(expect.objectContaining({
            teammates: ['chrismario'],
            opponentTeams: [],
        }));
    });

    it('renders screenshot evidence in the inline workspace viewer', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne'];

        render(
            <OcrCorrectionModal
                isOpen
                onClose={onClose}
                onAcceptAll={onAcceptAll}
                screenshots={['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB']}
            />
        );

        expect(screen.getByText(/screenshot evidence/i)).toBeInTheDocument();
        expect(screen.getByAltText(/reference screenshot 1/i)).toBeInTheDocument();
    });

    it('removes the embedded OCR review header row and header navigation buttons', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne'];

        render(
            <OcrCorrectionModal
                isOpen
                embedded
                onClose={onClose}
                onAcceptAll={onAcceptAll}
            />
        );

        expect(screen.queryByText(/review player names, team grouping, and ship assignment/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /back to result tab/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /close ocr correction dialog/i })).not.toBeInTheDocument();
    });

    it('surfaces the wizard rerun action inside the batch operations header and uses a 50-100 slider range', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();
        const onRequestRerunOcr = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne'];

        render(
            <OcrCorrectionModal
                isOpen
                embedded
                onClose={onClose}
                onAcceptAll={onAcceptAll}
                onRequestRerunOcr={onRequestRerunOcr}
            />
        );

        const rerunButton = screen.getByRole('button', { name: /re-run ocr/i });
        const thresholdSlider = screen.getByRole('slider', { name: /batch confidence threshold/i });

        expect(rerunButton).toBeInTheDocument();
        expect(thresholdSlider).toHaveAttribute('min', '50');
        expect(thresholdSlider).toHaveAttribute('max', '100');

        fireEvent.click(rerunButton);
        expect(onRequestRerunOcr).toHaveBeenCalledTimes(1);
    });

    it('lets embedded mode grow with the page instead of forcing an inner scroll body', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne'];

        const { container } = render(
            <OcrCorrectionModal
                isOpen
                embedded
                onClose={onClose}
                onAcceptAll={onAcceptAll}
            />
        );

        const embeddedRoot = container.firstElementChild as HTMLDivElement | null;
        const embeddedDialog = screen.getByRole('dialog');
        const body = container.querySelector('.ocr-correction-body');

        expect(embeddedRoot).not.toBeNull();
        expect(embeddedRoot).toHaveClass('w-full');
        expect(embeddedRoot).toHaveClass('flex');
        expect(embeddedRoot).toHaveClass('flex-col');
        expect(embeddedRoot).not.toHaveClass('h-full');
        expect(embeddedRoot).not.toHaveClass('overflow-hidden');
        expect(embeddedDialog).toHaveClass('ocr-correction-dialog--embedded');
        expect(embeddedDialog).toHaveClass('w-full');
        expect(embeddedDialog).toHaveClass('flex');
        expect(embeddedDialog).toHaveClass('flex-col');
        expect(embeddedDialog).not.toHaveClass('h-full');
        expect(embeddedDialog).not.toHaveClass('overflow-hidden');
        expect(body).not.toBeNull();
        expect(body).toHaveClass('md3-dialog-content');
        expect(body).not.toHaveClass('flex-1');
        expect(body).not.toHaveClass('min-h-0');
        expect(body).not.toHaveClass('overflow-y-auto');
    });

    it('dismisses the help banner and persists dismissal in localStorage', async () => {
        const { OcrCorrectionModal } = await import('./OcrCorrectionModal');
        const onClose = vi.fn();
        const onAcceptAll = vi.fn();

        gameData.sessionTeams = { red: ['PilotOne'] };
        gameData.sessionShipTypes = { red: 'Hunter (2 Player)' };
        gameData.pilotRegistry = ['PilotOne'];

        const { unmount } = render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);

        expect(screen.getByText(/how this helps/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /dismiss help banner/i }));

        expect(screen.queryByText(/how this helps/i)).not.toBeInTheDocument();
        expect(window.localStorage.getItem(OCR_REVIEW_HELP_DISMISSED_STORAGE_KEY)).toBe('1');

        unmount();
        render(<OcrCorrectionModal isOpen onClose={onClose} onAcceptAll={onAcceptAll} />);
        expect(screen.queryByText(/how this helps/i)).not.toBeInTheDocument();
    });
});
