import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Match } from '../../types';
import { AnalyticsCockpit } from './AnalyticsCockpit';

const matches: Match[] = [
    {
        id: 1,
        timestamp: 1_700_000_000_000,
        date: '2026-02-17',
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
            characterWeapons: ['Foam Gun'],
            characterEquipment: ['Repulsor'],
            perks: ['Boarder'],
        },
        reachModifiers: ['Ion Storm'],
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
        opponents: ['EnemyTwo'],
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
        reachModifiers: ['Sandstorm'],
        kills: { Hunter: 1 },
        result: 'Loss',
        subType: 'Combat',
        damageTaken: 320,
        placement: 5,
    },
];

describe('AnalyticsCockpit', () => {
    it('renders context tags and opens drill-down from focus cards', () => {
        const onDrillDown = vi.fn();
        const onNavigate = vi.fn();

        render(
            <AnalyticsCockpit
                visualMode="editorial"
                onNavigate={onNavigate}
                onDrillDown={onDrillDown}
                winRate={50}
                totalMatches={2}
                momentum={{ currentMomentum: 11 }}
                placementData={{ avgPlacement: 3.5 }}
                filteredMatches={matches}
                contextTags={['Range: All Time', 'Ship: Hunter']}
            />
        );

        expect(screen.getByText('Range: All Time')).toBeInTheDocument();
        expect(screen.getByText('Ship: Hunter')).toBeInTheDocument();
        const suggested = screen.getByText(/suggested next drill-down/i);
        const topShipCard = screen.getByText('Top Ship').closest('button');
        expect(topShipCard).not.toBeNull();
        expect(suggested.compareDocumentPosition(topShipCard as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect((topShipCard as Node).compareDocumentPosition(screen.getByText('Next moves')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        const hunterButtons = screen.getAllByRole('button', { name: /hunter/i });
        fireEvent.click(hunterButtons[0]);

        expect(onDrillDown).toHaveBeenCalledWith('Hunter', 'Ship');
    });

    it('dense mode drops narrative chrome and shows compact cockpit header', () => {
        render(
            <AnalyticsCockpit
                visualMode="dense"
                onNavigate={vi.fn()}
                onDrillDown={vi.fn()}
                winRate={50}
                totalMatches={2}
                momentum={{ currentMomentum: 11 }}
                placementData={{ avgPlacement: 3.5 }}
                filteredMatches={matches}
                contextTags={['Range: All Time']}
            />
        );

        expect(screen.getByText(/data-dense/i)).toBeInTheDocument();
        expect(screen.queryByText(/See what is actually moving the needle/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Suggested next drill-down/i)).not.toBeInTheDocument();
        expect(screen.queryByText('Next moves')).not.toBeInTheDocument();
        expect(screen.queryByText('Top Ship')).not.toBeInTheDocument();
    });
});
