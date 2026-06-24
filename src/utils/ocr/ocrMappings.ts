/**
 * OCR Mappings
 * Maps OCR-extracted text to game constants
 */

import { REACH_MODIFIER_ALIAS_MAP, UI_REACH_MODIFIERS, SHIPS, CHARACTERS } from '../constants';

/**
 * Maps OCR text (uppercase) to UI_REACH_MODIFIERS constants
 * Handles variations in how modifiers appear in-game
 */
export const REACH_MODIFIER_MAP: Record<string, string> = REACH_MODIFIER_ALIAS_MAP;

/**
 * Maps OCR ship text to SHIPS constants
 */
export const SHIP_MAP: Record<string, string> = {
  "HUNTER": "Hunter",
  "BASTION": "Bastion",
  "PRIVATEER": "Privateer",
  "BATTLE SCOUT": "Battle Scout",
  "SCOUT": "Scout",
  "OUTLAW": "Outlaw",
  "SOLO OUTLAW": "Solo Outlaw",
  // Common OCR misreads
  "BUNTER": "Hunter",
  "BAST1ON": "Bastion",
};

/**
 * Ship type detection keywords
 */
export const SHIP_KEYWORDS = [
  'HUNTER', 'BASTION', 'PRIVATEER', 'BATTLE', 'SCOUT', 'OUTLAW',
  'SOLO', 'PLAYER', '4P', '3P', '2P'
];

/**
 * Team color RGB ranges for pixel sampling
 * Each color has a hue range, min saturation, and min luminance
 */
export const TEAM_COLOR_RANGES = {
  red: { hueMin: 340, hueMax: 20, minSat: 50, minLum: 30 },
  orange: { hueMin: 15, hueMax: 40, minSat: 50, minLum: 30 },
  // Keep yellow narrower and brighter so the darker in-game olive badge does
  // not leak into yellow during browser-side fallbacks.
  yellow: { hueMin: 40, hueMax: 65, minSat: 50, minLum: 40 },
  green: { hueMin: 66, hueMax: 150, minSat: 40, minLum: 25 },
  cyan: { hueMin: 150, hueMax: 210, minSat: 40, minLum: 30 },
  blue: { hueMin: 210, hueMax: 270, minSat: 40, minLum: 25 },
  purple: { hueMin: 270, hueMax: 340, minSat: 40, minLum: 25 },
};

/**
 * Words to filter out from player name detection
 */
export const NOISE_WORDS = [
  // UI Elements
  'READY', 'TEAM', 'LOBBY', 'CREW', 'MATCH', 'VS', 'PING', 'LEVEL',
  'XP', 'SC', 'MC', 'VOICE', 'MUTE', 'OPTIONS', 'BACK', 'HUB',
  'TACTICAL', 'MAP', 'SEARCHING', 'CUSTOM', 'GAME', 'SQUAD',
  'WAITING', 'PLAYER', 'SEARCH', 'VOTE', 'REGION', 'SHIP',

  // Common HUD text
  'CHANNEL', 'TALK', 'OPEN', 'MIC', 'HOLD', 'PUSH', 'DISABLE',
  'ENABLE', 'SWITCH', 'YOUR', 'VOICE:', 'ON', 'OFF',

  // Game text
  'HAZARDS', 'FEATURES', 'KNOWN', 'ENEMY', 'CREWS', 'MODIFIERS',
  'ARTIFACT', 'HEALING', 'ICE', 'WEAPON', 'SPECIAL', 'LOOT',

  // Lobby / pre-match countdown + spectator chrome (e.g. "Departure in 0:30")
  'DEPARTURE', 'DEPARTING', 'DEPARTS', 'COUNTDOWN', 'STARTING', 'STARTS',
  'SPECTATING', 'SPECTATOR', 'SPECTATORS', 'OBSERVER', 'OBSERVING',

  // Numbers that might appear alone
  '1', '2', '3', '4', '100', 'F1', 'F2', 'F3', 'F4', 'TAB',
];

/**
 * Patterns that indicate HUD/UI text rather than player names
 */
export const HUD_PATTERNS = [
  /^CREW\s*HUB$/i,
  /^TACTICAL$/i,
  /VOICE\s*CHANNEL/i,
  /PUSH\s*TO\s*TALK/i,
  /HOLD\s*TO\s*TALK/i,
  /OPEN\s*MIC/i,
  /YOUR\s*VOICE/i,
  /HEALTH\s*\/\s*\d+/i,
  /^\d+\s*MS$/i,  // Ping
  /^LEVEL\s*\d+$/i,
  /^[A-Z]\d+$/i,  // Function keys
  /DEPARTURE\s*IN/i,   // Lobby countdown banner
  /DEPARTING\s*IN/i,
  /MATCH\s*STARTING/i,
  /SPECTATOR\s*MODE/i,
];

/**
 * Characters list for validation (from constants)
 */
export const VALID_CHARACTERS = CHARACTERS;

/**
 * Valid ships list (from constants)
 */
export const VALID_SHIPS = SHIPS;

/**
 * Valid reach modifiers (from constants)
 */
export const VALID_MODIFIERS = UI_REACH_MODIFIERS;

/**
 * Screen region definitions for different screenshot types
 * Values are percentages of screen dimensions
 */
export const SCREEN_REGIONS = {
  tactical_map: {
    playerShip: { x: 0.01, y: 0.02, width: 0.25, height: 0.15 },
    enemyShips: { x: 0.70, y: 0.02, width: 0.29, height: 0.25 },
    hazards: { x: 0.70, y: 0.25, width: 0.29, height: 0.40 },
    centerMap: { x: 0.25, y: 0.15, width: 0.50, height: 0.70 },  // Exclude from OCR
  },
  crew_hub: {
    myTeam: { x: 0.05, y: 0.15, width: 0.35, height: 0.70 },
    enemyTeams: { x: 0.55, y: 0.15, width: 0.40, height: 0.70 },
    header: { x: 0.30, y: 0.02, width: 0.40, height: 0.12 },
  },
};

/**
 * Screenshot type detection keywords
 */
export const SCREENSHOT_TYPE_INDICATORS = {
  crew_hub: [
    'CREW HUB', 'CREWS', 'ENEMY CREW', 'MY CREW',
    'SEARCHING', 'READY', 'LOBBY'
  ],
  tactical_map: [
    'TACTICAL', 'HAZARDS', 'FEATURES', 'KNOWN HAZARDS',
    'MAP', 'ZONE', 'REACH'
  ],
};
