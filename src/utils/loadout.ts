import type { Loadout } from '../types';

const DEFAULT_SHIP_WEAPON_SLOTS = 10;
const DEFAULT_PROSPECTOR_SLOTS = 2;
const DEFAULT_PERK_SLOTS = 2;

const sanitizeSlotList = (entries: string[] | undefined, maxSlots: number) => (
    (entries || [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .filter((entry) => !/tertiary\s+(weapon|equipment)/i.test(entry))
        .slice(0, Math.max(1, maxSlots))
);

const sanitizeShipWeaponEntries = (entries: Loadout['shipWeapons'] | undefined, maxSlots: number) => (
    (entries || [])
        .map((entry) => ({
            name: String(entry?.name || '').trim(),
            quantity: Math.max(0, Math.min(maxSlots, Math.floor(Number(entry?.quantity || 0)))),
        }))
        .filter((entry) => entry.name && entry.quantity > 0)
        .slice(0, maxSlots)
);

const dedupeCaseInsensitive = (values: string[]): string[] => {
    const seen = new Set<string>();
    const next: string[] = [];
    values.forEach((value) => {
        const cleaned = String(value || '').trim();
        if (!cleaned) return;
        const key = cleaned.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        next.push(cleaned);
    });
    return next;
};

export const normalizeLoadoutPerks = (
    loadout: Loadout | null | undefined,
    maxPerkSlots: number = DEFAULT_PERK_SLOTS
): Loadout | null => {
    if (!loadout) return null;
    const normalizedCharacterPerks = dedupeCaseInsensitive([
        ...(Array.isArray(loadout.characterPerks) ? loadout.characterPerks : []),
        ...(Array.isArray(loadout.perks) ? loadout.perks : []),
    ]).slice(0, Math.max(1, maxPerkSlots));
    const normalizedShipPerks = dedupeCaseInsensitive(
        Array.isArray(loadout.shipPerks) ? loadout.shipPerks : []
    ).slice(0, Math.max(1, maxPerkSlots));
    return {
        ...loadout,
        characterPerks: normalizedCharacterPerks,
        perks: normalizedCharacterPerks,
        shipPerks: normalizedShipPerks,
    };
};

export const sanitizeLoadout = (
    loadout: Loadout | null | undefined,
    options?: {
        shipWeaponSlots?: number;
        prospectorSlots?: number;
        perkSlots?: number;
    }
): Loadout | null => {
    if (!loadout) return null;
    const shipWeaponSlots = options?.shipWeaponSlots ?? DEFAULT_SHIP_WEAPON_SLOTS;
    const prospectorSlots = options?.prospectorSlots ?? DEFAULT_PROSPECTOR_SLOTS;
    const perkSlots = options?.perkSlots ?? DEFAULT_PERK_SLOTS;
    const perkNormalized = normalizeLoadoutPerks(loadout, perkSlots);
    if (!perkNormalized) return null;
    return {
        ...perkNormalized,
        shipWeapons: sanitizeShipWeaponEntries(perkNormalized.shipWeapons, shipWeaponSlots),
        weapons: sanitizeSlotList(perkNormalized.weapons, shipWeaponSlots),
        equipment: sanitizeSlotList(perkNormalized.equipment, prospectorSlots),
        characterWeapons: sanitizeSlotList(perkNormalized.characterWeapons, prospectorSlots),
        characterEquipment: sanitizeSlotList(perkNormalized.characterEquipment, prospectorSlots),
        characterPerks: sanitizeSlotList(perkNormalized.characterPerks, perkSlots),
        perks: sanitizeSlotList(perkNormalized.perks, perkSlots),
        shipPerks: sanitizeSlotList(perkNormalized.shipPerks, perkSlots),
    };
};
