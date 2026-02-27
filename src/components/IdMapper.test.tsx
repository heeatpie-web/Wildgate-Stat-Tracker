import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const setUidMapping = vi.fn();
const setActiveShip = vi.fn();
const setCurrentLoadout = vi.fn();
const setPendingMatchData = vi.fn();
const setSessionShipTypes = vi.fn();

const storeState: any = {
    detectedUnknowns: {},
    knownMappings: {},
    uidMappings: { players: {}, ships: {}, weapons: {}, equipment: {}, perks: {} },
    playerProfiles: {},
    addMapping: vi.fn(),
    setUidMapping,
    removeMapping: vi.fn(),
    removeUidMapping: vi.fn(),
    importMappings: vi.fn(),
    getPlayerRole: vi.fn(() => 'unknown'),
    getMostFrequentOpponents: vi.fn(() => []),
    getMostFrequentTeammates: vi.fn(() => []),
    activeShip: '',
    shipSource: undefined,
    telemetryDetectedShip: undefined,
    setActiveShip,
    currentLoadout: null,
    setCurrentLoadout,
    pendingMatchData: null,
    setPendingMatchData,
    sessionShipTypes: {},
    setSessionShipTypes,
};

const uiState = {
    pushNotification: vi.fn(),
};

vi.mock('../store/useAppStore', () => ({
    useAppStore: () => storeState,
}));

vi.mock('../providers/UIStateProvider', () => ({
    useUIState: () => uiState,
}));

describe('IdMapper ship mapping behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storeState.detectedUnknowns = {
            'ABCD-0000-0000-0000': { type: 'Ship', lastSeen: Date.now() },
        };
        storeState.knownMappings = {};
        storeState.uidMappings = { players: {}, ships: {}, weapons: {}, equipment: {}, perks: {} };
        storeState.playerProfiles = {};
        storeState.activeShip = 'Unknown (ABCD)';
        storeState.shipSource = 'manual';
        storeState.telemetryDetectedShip = 'Unknown (ABCD)';
        storeState.currentLoadout = { ship: 'Unknown (ABCD)' };
        storeState.pendingMatchData = {
            id: 73,
            ship: 'Unknown (ABCD)',
            loadout: { ship: 'Unknown (ABCD)' },
        };
        storeState.sessionShipTypes = {
            friendly: 'Unknown (ABCD)',
            enemy: 'Scout (3 Player)',
        };
    });

    it('updates telemetry defaults and pending ship fields when ship GUID mapping is saved', async () => {
        const { IdMapper } = await import('./IdMapper');
        render(<IdMapper />);

        fireEvent.change(screen.getByPlaceholderText('Name...'), { target: { value: 'Hunter (4 Player)' } });
        fireEvent.click(screen.getByRole('button', { name: /save mapping for abcd-0000-0000-0000/i }));

        expect(setUidMapping).toHaveBeenCalledWith('ships', 'ABCD-0000-0000-0000', 'Hunter (4 Player)');
        expect(setActiveShip).toHaveBeenCalledWith('Hunter (4 Player)', 'telemetry');
        expect(setCurrentLoadout).toHaveBeenCalledWith(expect.objectContaining({ ship: 'Hunter (4 Player)' }));
        expect(setPendingMatchData).toHaveBeenCalledWith(expect.objectContaining({
            ship: 'Hunter (4 Player)',
            loadout: expect.objectContaining({ ship: 'Hunter (4 Player)' }),
        }));
        expect(setSessionShipTypes).toHaveBeenCalledWith(expect.objectContaining({
            friendly: 'Hunter (4 Player)',
            enemy: 'Scout (3 Player)',
        }), 'manual');
    });
});
