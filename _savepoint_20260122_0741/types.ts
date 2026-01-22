export type GameMode = 'Artifact Brawl' | 'Fleet Battle';
export type MatchResult = 'Win' | 'Loss' | 'Draw';
export type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export const APP_VERSION = "v1.7.1";

export type Language = 'en' | 'es' | 'mx' | 'pt' | 'br' | 'zh';

// FINAL PROSPECTOR LIST - DO NOT MODIFY WITHOUT USER CONSENT
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

export const UI_REACH_MODIFIERS = [
  "Ancient Vault",
  "Cryon Reach",
  "Dead Sensors",
  "Deadworlds",
  "Easy Loot",
  "Epic Loot",
  "Fast Gate",
  "Few asteroids",
  "Ice Storm",
  "Lava Epics",
  "Leech Swarms",
  "Legion Patrols",
  "Many asteroids",
  "No ships",
  "Rogue Turrets",
  "Artifact: Healing",
  "Artifact: Ice",
  "Artifact: Weapon"
];

export const KILLED_BY_OPTIONS = [
  "Enemy Player", "AI Legion", "World Hazard", "Friendly Fire", "Unknown"
];

export interface KillMap {
  [shipName: string]: number;
}

export interface Match {
  id: number;
  timestamp: number;
  date: string;
  mode: GameMode;
  player: string;
  teammates: string[];
  opponents: string[];
  hero: string;
  ship: string;
  reachModifiers: string[];
  kills: KillMap;
  result: 'Win' | 'Loss' | 'Draw';
  subType: string;
  placement?: number;
  damageTaken?: number;
  time?: string;
  poiEasy?: number;
  poiMedium?: number;
  poiEpic?: number;
  artifactSource?: string;
  isPinned?: boolean;
}

export const getShipCapacity = (ship: string): number => {
  if (ship.includes("4 Player")) return 4;
  if (ship.includes("3 Player")) return 3;
  if (ship.includes("2 Player")) return 2;
  return 1;
};

export const getShipColor = (ship: string): string => {
  if (ship.includes("Hunter")) return "#ef4444"; 
  if (ship.includes("Bastion")) return "#3b82f6"; 
  if (ship.includes("Privateer")) return "#eab308"; 
  if (ship.includes("Scout")) return "#22c55e"; 
  return "#a855f7"; 
};

export const PIE_COLORS = [
  "#a8c7fa", // Pastel Blue
  "#81c995", // Pastel Green
  "#fdc69c", // Pastel Orange
  "#f28b82", // Pastel Red
  "#c58af9", // Pastel Purple
  "#8ab4f8"  // Pastel Cyan
];