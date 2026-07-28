import { SHIPS, CHARACTERS, WEAPONS, CHARACTER_WEAPONS, CHARACTER_EQUIPMENT } from '../../types';
import { getPerkCatalogWithLegacyNames, getProspectorEquipmentCatalog, getProspectorWeaponCatalog, getShipCatalog } from '../patch/patchEntityCatalog';
import { buildEntityNameSet } from './playerHubUtils';

export const SHIP_NAME_SET = buildEntityNameSet(getShipCatalog([...(SHIPS || [])]));
export const PROSPECTOR_NAME_SET = buildEntityNameSet([...(CHARACTERS || [])]);
export const WEAPON_NAME_SET = buildEntityNameSet([
    ...(WEAPONS || []),
    ...getProspectorWeaponCatalog([...(CHARACTER_WEAPONS || [])]),
]);
export const EQUIPMENT_NAME_SET = buildEntityNameSet(getProspectorEquipmentCatalog([...(CHARACTER_EQUIPMENT || [])]));
// Includes pre-rename spellings so perks on older matches are still recognised
// as perks (and not mistaken for player names) after a catalog rename.
export const PERK_NAME_SET = buildEntityNameSet(getPerkCatalogWithLegacyNames());

export const NON_PLAYER_NAME_HINTS = [
    'drone', 'trap', 'shield', 'repair', 'teleport', 'reloader', 'grenade',
    'plasma', 'foam', 'can', 'dash', 'boom', 'launcher', 'rifle', 'cannon',
    'beam', 'privateer', 'bastion', 'scout', 'hunter', 'outlaw', 'boarder',
    'defender', 'inventor', 'salvager', 'factory', 'smash', 'explorer', 'bomber',
] as const;

export const GUID_HEX_PATTERN = /^[A-F0-9]{32}$/i;

export const IS_DEV_BUILD = import.meta.env.DEV || process.env.NODE_ENV !== 'production';

export const DEFAULT_ROSTER_VIEWPORT_HEIGHT = 640;
export const ROSTER_GRID_ROW_HEIGHT = 74;
export const ROSTER_GRID_OVERSCAN_ROWS = 3;
