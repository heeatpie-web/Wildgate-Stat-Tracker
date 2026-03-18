import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Match } from '../types';
import { DrillDownOverlay } from './DrillDownOverlay';
import { createEmptyOcrAliasModel } from '../utils/ocrAliasEngine';

vi.mock('recharts', async () => {
    const actual = await vi.importActual<typeof import('recharts')>('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
            <div style={{ width: 800, height: 400 }}>{children}</div>
        ),
    };
});

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const setDrillDownTarget = vi.fn();

const baseMatches: Match[] = [
    {
        id: 1,
        timestamp: 1_700_000_000_000,
        date: '2026-02-17',
        mode: 'Artifact Brawl',
        player: 'Pilot',
        teammates: ['Wingman'],
        opponents: ['EnemyOne', 'EnemyTwo'],
        hero: 'Hero',
        ship: 'Hunter',
        loadout: {
            hero: 'Hero',
            ship: 'Hunter',
            weapons: [],
            equipment: ['Repulsor'],
            characterWeapons: ['Foam Gun'],
            characterEquipment: ['Repulsor'],
            perks: ['Boarder'],
        },
        reachModifiers: ['Ion Storm', 'Artifact: Ice'],
        kills: { Hunter: 2 },
        result: 'Win',
        subType: 'Combat',
        damageTaken: 180,
        placement: 2,
    },
    {
        id: 2,
        timestamp: 1_700_100_000_000,
        date: '2026-02-18',
        mode: 'Artifact Brawl',
        player: 'Pilot',
        teammates: ['Wingman'],
        opponents: ['EnemyOne'],
        hero: 'Hero',
        ship: 'Hunter',
        loadout: {
            hero: 'Hero',
            ship: 'Hunter',
            weapons: [],
            equipment: ['Repulsor'],
            characterWeapons: ['Rocket Launcher'],
            characterEquipment: ['Repulsor'],
            perks: ['Boarder'],
        },
        reachModifiers: ['Sandstorm'],
        kills: { Hunter: 1 },
        result: 'Loss',
        subType: 'Combat',
        damageTaken: 320,
        placement: 5,
    },
    {
        id: 3,
        timestamp: 1_700_200_000_000,
        date: '2026-02-19',
        mode: 'Artifact Brawl',
        player: 'Pilot',
        teammates: ['OtherMate'],
        opponents: ['EnemyThree'],
        hero: 'OtherHero',
        ship: 'Bastion',
        loadout: {
            hero: 'OtherHero',
            ship: 'Bastion',
            weapons: [],
            equipment: ['Repulsor'],
            characterWeapons: ['Foam Gun'],
            characterEquipment: ['Repulsor'],
            perks: ['Defender'],
        },
        reachModifiers: ['Ion Storm'],
        kills: { Bastion: 3 },
        result: 'Win',
        subType: 'Combat',
        damageTaken: 140,
        placement: 1,
    },
];

const gameDataState = {
    matches: baseMatches,
    drillDownTarget: { type: 'Teammate', name: 'Wingman' } as { type: 'Teammate'; name: string; matchIds?: number[] } | null,
    setDrillDownTarget,
    pilotRegistry: [] as string[],
    pilotAliases: {} as Record<string, string[]>,
    playerProfiles: {},
    knownMappings: {} as Record<string, string>,
    ocrAliasModel: createEmptyOcrAliasModel(),
    playerEncounterRoleCorrections: {} as Record<string, unknown>,
    getPlayerEncounterRoleCorrection: vi.fn(() => null),
};

const uiState = {
    activeMode: 'Artifact Brawl' as const,
};

vi.mock('../providers/GameDataProvider', () => ({
    useGameData: () => gameDataState,
}));

vi.mock('../providers/UIStateProvider', () => ({
    useUIState: () => uiState,
}));

describe('DrillDownOverlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gameDataState.matches = baseMatches.map((match) => ({
            ...match,
            teammates: [...match.teammates],
            opponents: [...match.opponents],
            opponentTeams: match.opponentTeams?.map((team) => ({
                ...team,
                players: [...team.players],
            })),
        }));
        gameDataState.drillDownTarget = { type: 'Teammate', name: 'Wingman' };
        gameDataState.pilotRegistry = [];
        gameDataState.pilotAliases = {};
        gameDataState.playerProfiles = {};
        gameDataState.knownMappings = {};
        gameDataState.ocrAliasModel = createEmptyOcrAliasModel();
        gameDataState.playerEncounterRoleCorrections = {};
        gameDataState.getPlayerEncounterRoleCorrection = vi.fn(() => null);
    });

    it('renders dialog semantics and tabbed explorer content', () => {
        render(<DrillDownOverlay />);

        expect(screen.getByRole('dialog', { name: /wingman/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Loadouts$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Matches$/i })).toBeInTheDocument();
    });

    it('supports chained drill-down inside the overlay', () => {
        render(<DrillDownOverlay />);

        const hunterButtons = screen.getAllByRole('button', { name: /hunter/i });
        fireEvent.click(hunterButtons[0]);

        expect(screen.getByRole('heading', { name: /hunter/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /go back one drill-down level/i })).toBeInTheDocument();
    });

    it('respects scoped match ids for weapon drill-downs', () => {
        gameDataState.drillDownTarget = { type: 'Weapon', name: 'Foam Gun', matchIds: [1] };
        render(<DrillDownOverlay />);

        fireEvent.click(screen.getByRole('button', { name: /^Matches$/i }));

        expect(screen.getByText(/match #1/i)).toBeInTheDocument();
        expect(screen.queryByText(/match #3/i)).not.toBeInTheDocument();
    });

    it('matches canonical teammate targets across alias-backed historical names', () => {
        gameDataState.pilotRegistry = ['Wingman'];
        gameDataState.pilotAliases = { Wingman: ['WingmanAlias'] };
        gameDataState.matches = baseMatches.map((match, index) => ({
            ...match,
            teammates: index === 1 ? ['WingmanAlias'] : [...match.teammates],
            opponents: [...match.opponents],
            opponentTeams: match.opponentTeams?.map((team) => ({
                ...team,
                players: [...team.players],
            })),
        }));
        gameDataState.drillDownTarget = { type: 'Teammate', name: 'Wingman' };

        render(<DrillDownOverlay />);
        fireEvent.click(screen.getByRole('button', { name: /^Matches$/i }));

        expect(screen.getByText(/match #1/i)).toBeInTheDocument();
        expect(screen.getByText(/match #2/i)).toBeInTheDocument();
        expect(screen.queryByText(/match #3/i)).not.toBeInTheDocument();
    });

    it('matches teammate targets when the pilot is the recorded player for part of the history', () => {
        gameDataState.pilotRegistry = ['Wingman'];
        gameDataState.pilotAliases = { Wingman: ['WingmanAlias'] };
        gameDataState.matches = baseMatches.map((match, index) => {
            if (index === 0) {
                return {
                    ...match,
                    player: 'WingmanAlias',
                    teammates: ['Pilot'],
                    opponents: [...match.opponents],
                };
            }
            return {
                ...match,
                teammates: [...match.teammates],
                opponents: [...match.opponents],
            };
        });
        gameDataState.drillDownTarget = { type: 'Teammate', name: 'Wingman' };

        render(<DrillDownOverlay />);
        fireEvent.click(screen.getByRole('button', { name: /^Matches$/i }));

        expect(screen.getByText(/match #1/i)).toBeInTheDocument();
        expect(screen.getByText(/match #2/i)).toBeInTheDocument();
        expect(screen.queryByText(/match #3/i)).not.toBeInTheDocument();
    });

    it('keeps full encounter scope while teammate profiles use teammate-only outcome math', () => {
        gameDataState.pilotRegistry = ['Wingman'];
        gameDataState.pilotAliases = { Wingman: ['WingmanAlias'] };
        gameDataState.matches = baseMatches.map((match, index) => {
            if (index !== 2) {
                return {
                    ...match,
                    teammates: [...match.teammates],
                    opponents: [...match.opponents],
                    opponentTeams: match.opponentTeams?.map((team) => ({
                        ...team,
                        players: [...team.players],
                    })),
                };
            }
            return {
                ...match,
                teammates: ['OtherMate'],
                opponents: ['WingmanAlias'],
            };
        });
        gameDataState.drillDownTarget = {
            type: 'Teammate',
            name: 'Wingman',
            matchIds: [1, 2, 3],
            encounterScope: 'all',
        };

        render(<DrillDownOverlay />);
        fireEvent.click(screen.getByRole('button', { name: /^Matches$/i }));

        expect(screen.getByText(/match #1/i)).toBeInTheDocument();
        expect(screen.getByText(/match #2/i)).toBeInTheDocument();
        expect(screen.getByText(/match #3/i)).toBeInTheDocument();
        expect(screen.getByText('1 / 1')).toBeInTheDocument();
    });

    it('keeps full encounter scope while opponent profiles use opponent-only outcome math', () => {
        gameDataState.pilotRegistry = ['Wingman'];
        gameDataState.pilotAliases = { Wingman: ['WingmanAlias'] };
        gameDataState.matches = baseMatches.map((match, index) => {
            if (index !== 2) {
                return {
                    ...match,
                    teammates: [...match.teammates],
                    opponents: [...match.opponents],
                    opponentTeams: match.opponentTeams?.map((team) => ({
                        ...team,
                        players: [...team.players],
                    })),
                };
            }
            return {
                ...match,
                teammates: ['OtherMate'],
                opponents: ['WingmanAlias'],
            };
        });
        gameDataState.drillDownTarget = {
            type: 'Opponent',
            name: 'Wingman',
            matchIds: [1, 2, 3],
            encounterScope: 'all',
        };

        render(<DrillDownOverlay />);
        fireEvent.click(screen.getByRole('button', { name: /^Matches$/i }));

        expect(screen.getByText(/match #1/i)).toBeInTheDocument();
        expect(screen.getByText(/match #2/i)).toBeInTheDocument();
        expect(screen.getByText(/match #3/i)).toBeInTheDocument();
        expect(screen.getByText('1 / 0')).toBeInTheDocument();
    });

    it('closes on escape key', () => {
        render(<DrillDownOverlay />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(setDrillDownTarget).toHaveBeenCalledWith(null);
    });
});
