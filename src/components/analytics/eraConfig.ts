import type { EraDefinition } from '../../types';

export const ERA_DEFINITIONS: EraDefinition[] = [
    {
        key: 'baseline',
        label: 'Baseline Era',
        description: 'Original Wildgate launch balance and catalog.',
        patches: [],
    },
    {
        key: 'expansion',
        label: 'Expansion Era',
        description: 'Patch-era roster including Battle Scout and expanded loadout options.',
        patches: [
            {
                version: 'v3.0.0',
                date: '2026-03-04',
                // TODO: Replace with final release-note copy from production patch notes.
                description: 'Major patch release: PaddleOCR runtime migration, analytics tracking improvements, and broad UI polish.',
            },
        ],
    },
];

