import type { Match } from '../../types';
import { getUpdateForTimestamp } from '../../data/gamePatches';

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
    'Pilot',
] as const;

export const MAX_PERKS_PER_MATCH = 2;

export type UpdateKey = string;

export interface PerkCatalogEntry {
    name: string;
    allowedProspectors?: string[];
    /**
     * Names this perk shipped under previously. Matches recorded before a rename
     * store the name that was current when they were played, and those records
     * are never rewritten — a match played under "Pilot" keeps saying "Pilot".
     * Legacy names exist so historical values are still recognised as perks by
     * classification and validation; only newly recorded matches use `name`.
     */
    legacyNames?: string[];
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
    { name: 'Protected Pilot', legacyNames: ['Pilot'] },
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

/**
 * Current perk names plus every name they previously shipped under.
 *
 * Use this for recognising perk names on already-recorded matches. Pickers and
 * capture-time resolution should keep using getPerkCatalog() so new matches
 * only ever record the current name.
 */
export const getPerkCatalogWithLegacyNames = (): string[] => dedupeByCaseInsensitive(
    PERK_CATALOG.flatMap((entry) => [entry.name, ...(entry.legacyNames || [])])
);

/**
 * Every accepted spelling of a perk paired with the name to record today.
 *
 * Capture-time resolution uses this so a newly played match is stored under the
 * current name even if the source still reports an old one. It is deliberately
 * NOT applied when reading saved matches — historical records keep the name
 * they were saved with.
 */
export const getPerkNameAliasPairs = (): Array<{ alias: string; current: string }> => (
    PERK_CATALOG.flatMap((entry) => [
        { alias: entry.name, current: entry.name },
        ...(entry.legacyNames || []).map((legacy) => ({ alias: legacy, current: entry.name })),
    ])
);

const findPerkEntry = (perkName: string): PerkCatalogEntry | undefined => {
    const key = normalize(perkName);
    if (!key) return undefined;
    return PERK_CATALOG.find((entry) => (
        normalize(entry.name) === key
        || (entry.legacyNames || []).some((legacy) => normalize(legacy) === key)
    ));
};

export const isPerkAllowedForProspector = (perkName: string, prospectorName: string | null | undefined): boolean => {
    const perk = findPerkEntry(perkName);
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

export const getMatchUpdateKey = (match: Match): UpdateKey => {
    const timestamp = Number(match?.timestamp || 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
    return getUpdateForTimestamp(timestamp)?.key || '';
};
