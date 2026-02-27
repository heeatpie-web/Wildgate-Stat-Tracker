import type {
    DetectedUnknownMapping,
    MappingCategory,
    MappingEntityType,
    UidMappingsContract,
} from '../types';
import {
    createEmptyUidMappingsContract,
    normalizeUidMappingsContract,
} from '../types';

export type SharedUidMappings = Required<UidMappingsContract>;

export const emptySharedUidMappings = (): SharedUidMappings =>
    createEmptyUidMappingsContract();

export const normalizeSharedUidMappings = (
    input?: Partial<UidMappingsContract> | Record<string, unknown> | null
): SharedUidMappings =>
    normalizeUidMappingsContract((input || {}) as Partial<UidMappingsContract>);

export const MAPPING_ENTITY_TYPE_BY_CATEGORY: Record<MappingCategory, MappingEntityType> = {
    players: 'Hero',
    ships: 'Ship',
    weapons: 'Weapon',
    equipment: 'Equipment',
    perks: 'Perk',
};

export const toMappingEntityType = (category: MappingCategory): MappingEntityType =>
    MAPPING_ENTITY_TYPE_BY_CATEGORY[category];

const normalizeMappingEntityType = (value: unknown): MappingEntityType => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'hero' || normalized === 'player' || normalized === 'prospector') return 'Hero';
    if (normalized === 'ship') return 'Ship';
    if (normalized === 'weapon') return 'Weapon';
    if (normalized === 'equipment' || normalized === 'gear' || normalized === 'utility') return 'Equipment';
    if (normalized === 'perk' || normalized === 'perks') return 'Perk';
    return 'Unknown';
};

const normalizeLastSeen = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const normalizeDetectedUnknownMappings = (
    input?: Record<string, Partial<DetectedUnknownMapping> | null | undefined> | null
): Record<string, DetectedUnknownMapping> => {
    if (!input) return {};
    const normalized: Record<string, DetectedUnknownMapping> = {};
    Object.entries(input).forEach(([id, raw]) => {
        const key = String(id || '').trim();
        if (!key) return;
        normalized[key] = {
            type: normalizeMappingEntityType(raw?.type),
            lastSeen: normalizeLastSeen(raw?.lastSeen),
        };
    });
    return normalized;
};
