import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

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
    ocrCorrections: {} as Record<string, { correctedTo: string }>,
    ocrAliasModel: { version: 1, entries: {}, recentlyUsed: [], lastUpdated: Date.now() },
    recordCalibrationSample: vi.fn(),
    ocrMode: 'both',
    ocrBatchAcceptThreshold: 85,
    setOcrBatchAcceptThreshold: vi.fn(),
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
        expect(screen.getByText(/review and correct detected players/i)).toBeInTheDocument();
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
});
