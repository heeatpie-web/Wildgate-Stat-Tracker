import type { UpdateDefinition } from '../types';

export interface GamePatch {
    version: string;       // e.g. "1.4.2" or "Patch 7"
    date: string;          // ISO date string e.g. "2026-02-28"
    updateKey?: string;    // which update this patch belongs to
    title: string;         // short name e.g. "Balance Patch: Hunter Nerf"
    description: string;   // 1-3 sentence summary of what changed
    highlights?: string[]; // optional bullet points
}

export const UPDATE_DEFINITIONS: UpdateDefinition[] = [
    {
        key: '1-5-update-2026-06-14',
        label: '1.5 - 6/14/2026',
        startDate: '2026-06-14',
        description: 'Matches played on or after June 14, 2026 until a newer update is added.',
    },
    {
        key: 'drill-charge-ram-bastion-2026-03-12',
        label: 'Drill Charge / Ram Bastion - 3/12/2026',
        startDate: '2026-03-12',
        description: 'Matches played on or after March 12, 2026 until a newer update is added.',
    },
    {
        key: 'baseline-launch',
        label: 'Baseline - Launch - 1/1/2026',
        startDate: '2026-01-01',
        description: 'Matches played on or after January 1, 2026 until a newer update is added.',
    },
];

const parseLocalStartOfDay = (value: string): number => {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return Number.NaN;
    return new Date(year, month - 1, day).getTime();
};

export const getUpdateLabel = (updateKey: string): string => (
    UPDATE_DEFINITIONS.find((definition) => definition.key === updateKey)?.label || updateKey
);

export const getUpdateForTimestamp = (timestamp: number): UpdateDefinition | null => {
    if (!Number.isFinite(timestamp)) return null;
    let selected: UpdateDefinition | null = null;
    let selectedStart = Number.NEGATIVE_INFINITY;
    UPDATE_DEFINITIONS.forEach((definition) => {
        const definitionStart = parseLocalStartOfDay(definition.startDate);
        if (!Number.isFinite(definitionStart) || definitionStart > timestamp || definitionStart < selectedStart) {
            return;
        }
        selected = definition;
        selectedStart = definitionStart;
    });
    return selected;
};

export const GAME_PATCHES: GamePatch[] = [
    {
        version: '1.5',
        date: '2026-06-14',
        updateKey: '1-5-update-2026-06-14',
        title: 'Update 1.5',
        description: 'Current live update bucket for matches recorded on or after June 14, 2026.',
    },
    {
        version: '2026-03-12',
        date: '2026-03-12',
        updateKey: 'drill-charge-ram-bastion-2026-03-12',
        title: 'Drill Charge / Ram Bastion',
        description: 'Current live update bucket for matches recorded on or after March 12, 2026.',
    },
    {
        version: '1.0',
        date: '2026-01-01',
        updateKey: 'baseline-launch',
        title: 'Baseline - Launch',
        description: 'Game launch. Baseline meta established.',
    },
];
