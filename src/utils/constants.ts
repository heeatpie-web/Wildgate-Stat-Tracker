/**
 * @module constants
 * Static game data constants: character roster, ship list, weapon/equipment
 * lists (derived from equipmentDb), reach modifiers, and app version.
 * Re-exported from types.ts for convenience.
 */
import { EQUIPMENT_DB } from './equipmentDb';

export const APP_VERSION = "v2.17";

/** Prefix used for unnamed players discovered via telemetry (e.g. "Member 1"). */
export const UNNAMED_PLAYER_PREFIX = 'Member ';

export const CHARACTERS = [
  "Adrian",
  "Venture",
  "Kae",
  "Sammo",
  "Ion",
  "Mophs",
  "Sal",
  "Charlie"
];

export const SHIPS = [
  "Hunter (4 Player)",
  "Bastion (4 Player)",
  "Privateer (4 Player)",
  "Scout (3 Player)",
  "Outlaw (2 Player)",
  "Solo Outlaw"
];

export const WEAPONS = EQUIPMENT_DB.filter(i => i.type === 'Weapon').map(i => i.name);
export const CHARACTER_WEAPONS = EQUIPMENT_DB.filter(i => i.type === 'CharacterWeapon').map(i => i.name);
export const CHARACTER_EQUIPMENT = EQUIPMENT_DB.filter(i => i.type === 'CharacterEquipment').map(i => i.name);
export const SYSTEMS = EQUIPMENT_DB.filter(i => i.type === 'System').map(i => i.name);

export const UI_REACH_MODIFIERS = [
  "Ancient Vault",
  "Cryon Reach",
  "Dead Sensors",
  "Deadworlds",
  "Easy Loot",
  "Epic Loot",
  "Fast Gate",
  "Few asteroids",
  "Few Ships",
  "Gloaming Expanse",
  "Haunted Storm",
  "Ice Storm",
  "Lava Epics",
  "Leech Swarms",
  "Legion Patrols",
  "Low altitude fog",
  "Many asteroids",
  "Rogue Turrets",
  "Sandstorm",
  "Artifact: Healing",
  "Artifact: Ice",
  "Artifact: Weapon"
];

export const KILLED_BY_OPTIONS = [
  "Enemy Player", "AI Legion", "World Hazard", "Friendly Fire", "Unknown"
];

export const PIE_COLORS = [
  "var(--md-sys-color-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
  "var(--color-accent)",
  "var(--color-info)"
];
