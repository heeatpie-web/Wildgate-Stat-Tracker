import type { Loadout, ShipWeaponEntry } from '../types';

const MAX_SHIP_WEAPON_SLOTS = 10;
const MAX_PROSPECTOR_LOADOUT_SLOTS = 3;
const MAX_PERK_SLOTS = 2;

const sanitizeSlotList = (entries: unknown, maxSlots: number): string[] => (
  Array.isArray(entries)
    ? entries
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .filter((entry) => !/tertiary\s+(weapon|equipment)/i.test(entry))
      .slice(0, Math.max(1, maxSlots))
    : []
);

const sanitizePerkList = (entries: unknown): string[] => (
  Array.isArray(entries)
    ? entries
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .slice(0, MAX_PERK_SLOTS)
    : []
);

const sanitizeShipWeaponEntries = (entries: unknown): ShipWeaponEntry[] => (
  Array.isArray(entries)
    ? entries
      .map((entry) => ({
        name: String((entry as { name?: unknown })?.name || '').trim(),
        quantity: Math.max(
          0,
          Math.min(
            MAX_SHIP_WEAPON_SLOTS,
            Math.floor(Number((entry as { quantity?: unknown })?.quantity || 0))
          )
        ),
      }))
      .filter((entry) => entry.name && entry.quantity > 0)
      .slice(0, MAX_SHIP_WEAPON_SLOTS)
    : []
);

export const sanitizeLoadout = (loadout: Loadout | null | undefined): Loadout | null => {
  if (!loadout) return null;
  return {
    hero: typeof loadout.hero === 'string' ? loadout.hero.trim() || null : null,
    ship: typeof loadout.ship === 'string' ? loadout.ship.trim() || null : null,
    perks: sanitizePerkList(loadout.perks),
    shipPerks: sanitizePerkList(loadout.shipPerks),
    characterPerks: sanitizePerkList(loadout.characterPerks),
    shipWeapons: sanitizeShipWeaponEntries(loadout.shipWeapons),
    weapons: sanitizeSlotList(loadout.weapons, MAX_SHIP_WEAPON_SLOTS),
    equipment: sanitizeSlotList(loadout.equipment, MAX_PROSPECTOR_LOADOUT_SLOTS),
    characterWeapons: sanitizeSlotList(loadout.characterWeapons, MAX_PROSPECTOR_LOADOUT_SLOTS),
    characterEquipment: sanitizeSlotList(loadout.characterEquipment, MAX_PROSPECTOR_LOADOUT_SLOTS),
  };
};

export const cloneLoadout = (loadout: Loadout | null | undefined): Loadout | null => (
  sanitizeLoadout(loadout)
);

export const buildLoadoutSignature = (loadout: Loadout | null | undefined): string => {
  const sanitized = sanitizeLoadout(loadout);
  if (!sanitized) return '';
  return JSON.stringify({
    hero: sanitized.hero || '',
    ship: sanitized.ship || '',
    perks: sanitized.perks || [],
    shipPerks: sanitized.shipPerks || [],
    characterPerks: sanitized.characterPerks || [],
    shipWeapons: sanitized.shipWeapons || [],
    weapons: sanitized.weapons || [],
    equipment: sanitized.equipment || [],
    characterWeapons: sanitized.characterWeapons || [],
    characterEquipment: sanitized.characterEquipment || [],
  });
};

export const sanitizeUnknownLoadout = (value: unknown): Loadout | null => {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return sanitizeLoadout({
    hero: typeof record.hero === 'string' ? record.hero : null,
    ship: typeof record.ship === 'string' ? record.ship : null,
    perks: sanitizePerkList(record.perks),
    shipPerks: sanitizePerkList(record.shipPerks),
    characterPerks: sanitizePerkList(record.characterPerks),
    shipWeapons: sanitizeShipWeaponEntries(record.shipWeapons),
    weapons: sanitizeSlotList(record.weapons, MAX_SHIP_WEAPON_SLOTS),
    equipment: sanitizeSlotList(record.equipment, MAX_PROSPECTOR_LOADOUT_SLOTS),
    characterWeapons: sanitizeSlotList(record.characterWeapons, MAX_PROSPECTOR_LOADOUT_SLOTS),
    characterEquipment: sanitizeSlotList(record.characterEquipment, MAX_PROSPECTOR_LOADOUT_SLOTS),
  });
};
