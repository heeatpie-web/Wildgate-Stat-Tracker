/**
 * @module constants
 * Static game data constants: character roster, ship list, weapon/equipment
 * lists (derived from equipmentDb), reach modifiers, and app version.
 * Re-exported from types.ts for convenience.
 */
import { EQUIPMENT_DB } from './equipmentDb';
import HAZARD_CATALOG from '../../electron/hazardCatalog.json';

export const APP_NAME = 'Wildgate Stat Tracker';
export const APP_VERSION = 'v3.7.11';

/** Prefix used for unnamed players discovered via telemetry (e.g. "Member 1"). */
export const UNNAMED_PLAYER_PREFIX = 'Member ';

/** Player name labels that represent a missing or placeholder entry (case-insensitive). */
export const UNKNOWN_PLAYER_LABELS = new Set(['unknown', 'unknown player', 'n/a', 'na', '?']);

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
  "Hunter",
  "Bastion",
  "Privateer",
  "Scout",
  "Battle Scout",
  "Outlaw",
  "Solo Outlaw"
];

export const SHIP_CAPACITY: Record<string, number> = {
  Hunter: 4,
  Bastion: 4,
  Privateer: 4,
  Scout: 3,
  "Battle Scout": 4,
  Outlaw: 2,
  "Solo Outlaw": 1,
};

// Legacy aliases kept for migration/compat with older persisted values and OCR variants.
export const SHIP_NAME_ALIASES: Record<string, string> = {
  "Hunter (4 Player)": "Hunter",
  "Hunter (2 Player)": "Hunter",
  "Bastion (4 Player)": "Bastion",
  "Privateer (4 Player)": "Privateer",
  "Scout (3 Player)": "Scout",
  "Battle Scout (4 Player)": "Battle Scout",
  "Battle Scout (3 Player)": "Battle Scout",
  "Outlaw (2 Player)": "Outlaw",
  "Scout (Solo Outlaw)": "Solo Outlaw",
  "Solo Outlaw": "Solo Outlaw",
};

export const WEAPONS = EQUIPMENT_DB.filter(i => i.type === 'Weapon').map(i => i.name);
export const CHARACTER_WEAPONS = EQUIPMENT_DB.filter(i => i.type === 'CharacterWeapon').map(i => i.name);
export const CHARACTER_EQUIPMENT = EQUIPMENT_DB.filter(i => i.type === 'CharacterEquipment').map(i => i.name);
export const SYSTEMS = EQUIPMENT_DB.filter(i => i.type === 'System').map(i => i.name);

type ReachModifierCatalogEntry = {
  artifactType?: string;
  displayName: string;
  aliases: string[];
};

const HAZARD_ENTRIES = (HAZARD_CATALOG.hazards || []) as ReachModifierCatalogEntry[];
const ARTIFACT_ENTRIES = (HAZARD_CATALOG.artifacts || []) as ReachModifierCatalogEntry[];

/** Lowercase set of every known hazard display name from hazardCatalog.json. Used to filter legacy/removed hazard names from analytics. */
export const KNOWN_HAZARD_NAMES: ReadonlySet<string> = new Set(
  HAZARD_ENTRIES.map((entry) => entry.displayName.toLowerCase())
);

const buildReachModifierAliasMap = (entries: ReachModifierCatalogEntry[]): Record<string, string> => {
  const aliasMap: Record<string, string> = {};
  entries.forEach((entry) => {
    [entry.displayName, ...(entry.aliases || [])].forEach((alias) => {
      const normalizedAlias = String(alias || '').trim().toUpperCase();
      if (!normalizedAlias) return;
      aliasMap[normalizedAlias] = entry.displayName;
    });
  });
  return aliasMap;
};

const buildArtifactDisplayToTypeMap = (entries: ReachModifierCatalogEntry[]): Record<string, string> => {
  const artifactMap: Record<string, string> = {};
  entries.forEach((entry) => {
    const artifactType = String(entry.artifactType || '').trim();
    if (!artifactType) return;
    [artifactType, entry.displayName, ...(entry.aliases || [])].forEach((value) => {
      const normalizedValue = String(value || '').trim().toLowerCase();
      if (!normalizedValue) return;
      artifactMap[normalizedValue] = artifactType;
    });
  });
  return artifactMap;
};

export const REACH_MODIFIER_ALIAS_MAP = buildReachModifierAliasMap([
  ...HAZARD_ENTRIES,
  ...ARTIFACT_ENTRIES,
]);

export const ARTIFACT_DISPLAY_TO_TYPE = buildArtifactDisplayToTypeMap(ARTIFACT_ENTRIES);

export const ARTIFACT_TYPE_TO_DISPLAY = ARTIFACT_ENTRIES.reduce<Record<string, string>>((acc, entry) => {
  const artifactType = String(entry.artifactType || '').trim();
  if (!artifactType) return acc;
  acc[artifactType] = entry.displayName;
  return acc;
}, {});

export const UI_REACH_MODIFIERS = [
  ...HAZARD_ENTRIES.map((entry) => entry.displayName),
  ...ARTIFACT_ENTRIES.map((entry) => entry.displayName),
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
