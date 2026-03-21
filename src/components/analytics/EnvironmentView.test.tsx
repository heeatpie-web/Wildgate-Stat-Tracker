import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Match } from '../../types';
import { EnvironmentView } from './EnvironmentView';

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

const matches: Match[] = [
    {
        id: 1,
        timestamp: 1_700_000_000_000,
        date: '2026-02-17',
        mode: 'Artifact Brawl',
        player: 'Pilot',
        teammates: [],
        opponents: ['EnemyOne'],
        hero: 'Hero',
        ship: 'Hunter',
        reachModifiers: ['Cosmic Storm'],
        kills: {},
        result: 'Win',
        subType: 'Combat',
    },
    {
        id: 2,
        timestamp: 1_700_100_000_000,
        date: '2026-02-18',
        mode: 'Artifact Brawl',
        player: 'Pilot',
        teammates: [],
        opponents: ['EnemyTwo'],
        hero: 'Hero',
        ship: 'Hunter',
        reachModifiers: ['Cosmic Storm'],
        kills: {},
        result: 'Loss',
        subType: 'Combat',
    },
];

describe('EnvironmentView', () => {
    it('opens modifier drill-down from hazard explorer rows', () => {
        const onDrillDown = vi.fn();
        render(<EnvironmentView matches={matches} visualMode="editorial" onDrillDown={onDrillDown} />);

        const buttons = screen.getAllByRole('button', { name: /cosmic storm/i });
        fireEvent.click(buttons[0]);

        expect(onDrillDown).toHaveBeenCalledWith('Cosmic Storm', 'Modifier');
    });
});
