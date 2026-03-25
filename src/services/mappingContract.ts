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
import { getPerkCatalog, getProspectorEquipmentCatalog, getProspectorWeaponCatalog } from '../components/patch/patchEntityCatalog';
import { EQUIPMENT_DB } from '../utils/equipmentDb';

export type SharedUidMappings = Required<UidMappingsContract>;

export const emptySharedUidMappings = (): SharedUidMappings =>
    createEmptyUidMappingsContract();

const normalizeEntityNameKey = (value: unknown): string =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');

const buildCanonicalNameMap = (values: Iterable<string>): Map<string, string> => {
    const map = new Map<string, string>();
    for (const value of values) {
        const cleaned = String(value || '').trim();
        const key = normalizeEntityNameKey(cleaned);
        if (!cleaned || !key || map.has(key)) continue;
        map.set(key, cleaned);
    }
    return map;
};

const RAW_CHARACTER_WEAPON_NAMES = EQUIPMENT_DB
    .filter((item) => item.type === 'CharacterWeapon')
    .map((item) => item.name)
    .filter(Boolean);

const RAW_CHARACTER_EQUIPMENT_NAMES = EQUIPMENT_DB
    .filter((item) => item.type === 'CharacterEquipment')
    .map((item) => item.name)
    .filter(Boolean);

const WEAPON_CANONICAL_NAME_MAP = buildCanonicalNameMap(
    getProspectorWeaponCatalog(RAW_CHARACTER_WEAPON_NAMES),
);

const EQUIPMENT_CANONICAL_NAME_MAP = buildCanonicalNameMap(
    getProspectorEquipmentCatalog(RAW_CHARACTER_EQUIPMENT_NAMES),
);

const PERK_CANONICAL_NAME_MAP = buildCanonicalNameMap(getPerkCatalog());

const UID_NAME_OVERRIDES: Partial<Record<'weapons' | 'equipment' | 'perks', Record<string, string>>> = {
    equipment: {
        adventuregeat: 'Adventure Gear',
    },
};

export const normalizeUidMappingName = (
    category: MappingCategory,
    value: unknown,
): string => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return '';
    const key = normalizeEntityNameKey(cleaned);
    if (!key) return cleaned;

    const override = UID_NAME_OVERRIDES[category as 'weapons' | 'equipment' | 'perks']?.[key];
    if (override) return override;

    const canonicalMap = category === 'weapons'
        ? WEAPON_CANONICAL_NAME_MAP
        : category === 'equipment'
            ? EQUIPMENT_CANONICAL_NAME_MAP
            : category === 'perks'
                ? PERK_CANONICAL_NAME_MAP
                : null;
    return canonicalMap?.get(key) || cleaned;
};

const normalizeUidDomainValues = (
    category: MappingCategory,
    values: Record<string, string>,
): Record<string, string> => (
    Object.fromEntries(
        Object.entries(values || {}).map(([key, value]) => [
            key,
            normalizeUidMappingName(category, value),
        ]),
    )
);

export const normalizeSharedUidMappings = (
    input?: Partial<UidMappingsContract> | Record<string, unknown> | null
): SharedUidMappings => {
    const normalized = normalizeUidMappingsContract((input || {}) as Partial<UidMappingsContract>);
    return {
        players: normalized.players,
        ships: normalized.ships,
        weapons: normalizeUidDomainValues('weapons', normalized.weapons),
        equipment: normalizeUidDomainValues('equipment', normalized.equipment),
        perks: normalizeUidDomainValues('perks', normalized.perks),
    };
};

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
