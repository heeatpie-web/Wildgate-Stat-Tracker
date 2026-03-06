import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { EntityAnalyticsData } from '../../types';
import { EntityAnalyticsView } from './EntityAnalyticsView';

const data: EntityAnalyticsData = {
    filters: {
        ship: [],
        prospectorWeapon: [],
        equipment: [],
        perk: [],
        era: [],
    },
    filteredCount: 12,
    thresholds: {
        showMetricsAt: 5,
        showDeltasAt: 10,
        lowSampleBelow: 10,
    },
    dimensions: {
        ship: [{
            key: 'hunter',
            label: 'Hunter',
            sampleCount: 8,
            usageRate: 66.7,
            winRate: 62.5,
            placementDistribution: {},
            lowSample: false,
        }],
        prospectorWeapon: [{
            key: 'foam-gun',
            label: 'Foam Gun',
            sampleCount: 6,
            usageRate: 50,
            winRate: 66.7,
            placementDistribution: {},
            lowSample: false,
        }],
        equipment: [{
            key: 'repulsor',
            label: 'Repulsor',
            sampleCount: 5,
            usageRate: 41.7,
            winRate: 60,
            placementDistribution: {},
            lowSample: false,
        }],
        perk: [{
            key: 'boarder',
            label: 'Boarder',
            sampleCount: 5,
            usageRate: 41.7,
            winRate: 60,
            placementDistribution: {},
            lowSample: false,
        }],
        era: [],
    },
    comparisons: {
        periodVsPrevious: {
            label: 'Current Period vs Previous Period',
            baselineSample: 12,
            selectedSample: 12,
            baselineWinRate: 55,
            selectedWinRate: 62,
            absoluteDelta: 7,
            relativeDelta: 12.7,
            gated: false,
        },
        selectedPerkSetVsAll: {
            label: 'Selected Perk Set vs All Matches',
            baselineSample: 12,
            selectedSample: 5,
            baselineWinRate: 55,
            selectedWinRate: 60,
            absoluteDelta: 5,
            relativeDelta: 9.1,
            gated: false,
        },
        selectedLoadoutVsGlobal: {
            label: 'Selected Ship/Loadout vs Global Baseline',
            baselineSample: 12,
            selectedSample: 8,
            baselineWinRate: 55,
            selectedWinRate: 62.5,
            absoluteDelta: 7.5,
            relativeDelta: 13.6,
            gated: false,
        },
    },
};

describe('EntityAnalyticsView', () => {
    it('opens drill-downs for entity rows', () => {
        const onDrillDown = vi.fn();
        render(<EntityAnalyticsView data={data} onDrillDown={onDrillDown} />);

        fireEvent.click(screen.getByRole('button', { name: /hunter/i }));
        fireEvent.click(screen.getByRole('button', { name: /foam gun/i }));

        expect(onDrillDown).toHaveBeenNthCalledWith(1, 'Hunter', 'Ship');
        expect(onDrillDown).toHaveBeenNthCalledWith(2, 'Foam Gun', 'Weapon');
    });
});
