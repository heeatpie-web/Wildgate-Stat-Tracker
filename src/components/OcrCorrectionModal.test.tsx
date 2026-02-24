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
    selectedTeammates: [] as string[],
    setSelectedTeammates: vi.fn(),
    setSelectedOpponents: vi.fn(),
    setSessionTeams: vi.fn(),
    setSessionShipTypes: vi.fn(),
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
    }),
}));

describe('OcrCorrectionModal', () => {
    beforeEach(() => {
        gameData.sessionTeams = {};
        gameData.sessionShipTypes = {};
        gameData.pilotRegistry = [];
        gameData.matches = [];
        gameData.selectedTeammates = [];
        appStoreState.ocrCorrections = {};
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

        fireEvent.click(screen.getByRole('button', { name: /apply and learn/i }));

        expect(gameData.setSessionTeams).toHaveBeenCalledWith({ red: ['PilotOneEdited'] });
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
        fireEvent.click(screen.getByRole('button', { name: /apply and learn/i }));

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

        fireEvent.click(screen.getByRole('button', { name: /apply and learn/i }));

        expect(appStoreState.setPendingMatchData).toHaveBeenCalledWith(expect.objectContaining({
            teammates: ['chrismario'],
            opponentTeams: expect.any(Array),
        }));
    });

    it('renders screenshot references and opens image lightbox', async () => {
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

        expect(screen.getByText(/screenshot references/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /open screenshot 1/i }));
        expect(screen.getByText(/screenshot 1 of 1/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /close screenshot preview/i }));
        expect(screen.queryByText(/screenshot 1 of 1/i)).not.toBeInTheDocument();
    });

    it('uses a back control in embedded mode instead of a close X action', async () => {
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

        const backButton = screen.getByRole('button', { name: /back to result tab/i });
        expect(backButton).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /close ocr correction dialog/i })).not.toBeInTheDocument();

        fireEvent.click(backButton);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps embedded modal sizing pinned to full-height and body-owned scrolling', async () => {
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

        const embeddedRoot = container.querySelector('.w-full.h-full.min-h-0.flex.flex-col.overflow-hidden');
        const embeddedDialog = container.querySelector('.ocr-correction-dialog--embedded');
        const body = container.querySelector('.ocr-correction-body');

        expect(embeddedRoot).not.toBeNull();
        expect(embeddedDialog).not.toBeNull();
        expect(embeddedDialog).toHaveClass('h-full');
        expect(embeddedDialog).toHaveClass('min-h-0');
        expect(embeddedDialog).toHaveClass('flex');
        expect(embeddedDialog).toHaveClass('flex-col');
        expect(body).not.toBeNull();
        expect(body).toHaveClass('flex-1');
        expect(body).toHaveClass('min-h-0');
        expect(body).toHaveClass('overflow-y-auto');
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
