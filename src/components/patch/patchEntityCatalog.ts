import type { Match } from '../../types';

export const PATCH_PROSPECTOR_WEAPONS = [
    'Foam Gun',
    'Rocket Launcher',
    'Hand Cannon',
] as const;

export const PATCH_PROSPECTOR_EQUIPMENT = [
    'Repulsor',
    'Plasma Grenade',
] as const;

export const PATCH_SHIPS = [
    'Battle Scout',
] as const;

export const PATCH_PERKS = [
    'Boarder',
    'Defender',
    'Efficient Resourcing',
    'Engineering',
    'Mophs Wings',
    'Sal Inventor',
    'Sammo Defender',
    'Adrian Jetpack',
    'Kae Teleport',
    'Charlie Teleport',
    'Ion Smash',
    'Venture Explorer',
    'Salvager',
    'Mad Bomber',
    'Turbine Factory',
] as const;

export const MAX_PERKS_PER_MATCH = 2;

export type EraKey = 'baseline' | 'expansion';

export interface PerkCatalogEntry {
    name: string;
    allowedProspectors?: string[];
}

export const PERK_CATALOG: PerkCatalogEntry[] = [
    { name: 'Boarder' },
    { name: 'Defender' },
    { name: 'Efficient Resourcing' },
    { name: 'Engineering' },
    { name: 'Mophs Wings', allowedProspectors: ['Mophs'] },
    { name: 'Sal Inventor', allowedProspectors: ['Sal'] },
    { name: 'Sammo Defender', allowedProspectors: ['Sammo'] },
    { name: 'Adrian Jetpack', allowedProspectors: ['Adrian'] },
    { name: 'Kae Teleport', allowedProspectors: ['Kae'] },
    { name: 'Charlie Teleport', allowedProspectors: ['Charlie'] },
    { name: 'Ion Smash', allowedProspectors: ['Ion'] },
    { name: 'Venture Explorer', allowedProspectors: ['Venture'] },
    { name: 'Salvager' },
    { name: 'Mad Bomber' },
    { name: 'Turbine Factory' },
];

const normalize = (value: unknown): string => String(value || '').trim().toLowerCase();
const LOADOUT_ENTRY_SPLIT_PATTERN = /\s+(?:and|&)\s+|,\s*/gi;

const dedupeByCaseInsensitive = (values: string[]): string[] => {
    const seen = new Set<string>();
    const next: string[] = [];
    values.forEach((value) => {
        const cleaned = String(value || '').trim();
        if (!cleaned) return;
        const key = normalize(cleaned);
        if (seen.has(key)) return;
        seen.add(key);
        next.push(cleaned);
    });
    return next;
};

const mergeCatalog = (baseValues: string[], patchValues: readonly string[]): string[] => (
    dedupeByCaseInsensitive([...baseValues, ...patchValues])
);

const splitShipLabel = (value: string): string => String(value || '').split('(')[0].trim();

export const getShipCatalog = (baseShips: string[]): string[] => mergeCatalog(baseShips || [], PATCH_SHIPS);
export const getProspectorWeaponCatalog = (baseWeapons: string[]): string[] => mergeCatalog(baseWeapons || [], PATCH_PROSPECTOR_WEAPONS);
export const getProspectorEquipmentCatalog = (baseEquipment: string[]): string[] => mergeCatalog(baseEquipment || [], PATCH_PROSPECTOR_EQUIPMENT);
export const getPerkCatalog = (): string[] => PERK_CATALOG.map((entry) => entry.name);

export const isPerkAllowedForProspector = (perkName: string, prospectorName: string | null | undefined): boolean => {
    const perk = PERK_CATALOG.find((entry) => normalize(entry.name) === normalize(perkName));
    if (!perk || !perk.allowedProspectors || perk.allowedProspectors.length === 0) return true;
    return perk.allowedProspectors.some((prospector) => normalize(prospector) === normalize(prospectorName));
};

const getLoadout = (match: Match): Record<string, unknown> => (
    (match?.loadout || {}) as Record<string, unknown>
);

const splitCompositeLoadoutEntry = (value: unknown): string[] => {
    const raw = String(value || '').trim();
    if (!raw) return [];
    const expanded = raw
        .split(LOADOUT_ENTRY_SPLIT_PATTERN)
        .map((entry) => entry.trim())
        .filter(Boolean);
    return expanded.length > 1 ? expanded : [raw];
};

const getStringArray = (value: unknown): string[] => (
    Array.isArray(value)
        ? value.flatMap((entry) => splitCompositeLoadoutEntry(entry))
        : []
);

export const getMatchShip = (match: Match): string => {
    const loadout = getLoadout(match);
    return String(match?.ship || loadout.ship || '').trim();
};

export const getMatchPerks = (match: Match): string[] => {
    const loadout = getLoadout(match);
    return dedupeByCaseInsensitive([
        ...getStringArray(loadout.characterPerks),
        ...getStringArray(loadout.perks),
        ...getStringArray(match?.perks),
    ]).slice(0, MAX_PERKS_PER_MATCH);
};

export const getMatchProspectorWeapons = (match: Match): string[] => {
    const loadout = getLoadout(match);
    return dedupeByCaseInsensitive(getStringArray(loadout.characterWeapons));
};

export const getMatchEquipment = (match: Match): string[] => {
    const loadout = getLoadout(match);
    const merged = [
        ...getStringArray(loadout.characterEquipment),
        ...getStringArray(loadout.equipment),
    ];
    return dedupeByCaseInsensitive(merged);
};

export const getMatchShipWeapons = (match: Match): string[] => {
    const loadout = getLoadout(match);
    const explicitEntries = Array.isArray(loadout.shipWeapons)
        ? (loadout.shipWeapons as Array<Record<string, unknown>>)
        : [];
    if (explicitEntries.length > 0) {
        const expanded = explicitEntries.flatMap((entry) => {
            const name = String(entry?.name || '').trim();
            const qty = Math.max(0, Math.floor(Number(entry?.quantity || 0)));
            if (!name || qty <= 0) return [];
            return Array.from({ length: qty }, () => name);
        });
        return dedupeByCaseInsensitive(expanded);
    }
    return dedupeByCaseInsensitive(getStringArray(loadout.weapons));
};

export const getMatchWeaponDimensions = (match: Match): string[] => (
    dedupeByCaseInsensitive([
        ...getMatchShipWeapons(match),
        ...getMatchProspectorWeapons(match),
    ])
);

export const matchesPatchExpansion = (match: Match): boolean => {
    const ship = splitShipLabel(getMatchShip(match));
    const weapons = getMatchWeaponDimensions(match);
    const equipment = getMatchEquipment(match);
    const perks = getMatchPerks(match);
    if (PATCH_SHIPS.some((value) => normalize(splitShipLabel(value)) === normalize(ship))) return true;
    if (weapons.some((weapon) => PATCH_PROSPECTOR_WEAPONS.some((value) => normalize(value) === normalize(weapon)))) return true;
    if (equipment.some((item) => PATCH_PROSPECTOR_EQUIPMENT.some((value) => normalize(value) === normalize(item)))) return true;
    if (perks.some((perk) => PATCH_PERKS.some((value) => normalize(value) === normalize(perk)))) return true;
    return false;
};

export const getMatchEra = (match: Match): EraKey => (matchesPatchExpansion(match) ? 'expansion' : 'baseline');
