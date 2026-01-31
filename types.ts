export type GameMode = 'Artifact Brawl' | 'Fleet Battle';
export type MatchResult = 'Win' | 'Loss' | 'Draw';
export type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export * from './utils/constants';

export type Language = 'en' | 'es' | 'mx' | 'pt' | 'br' | 'zh';

// Helper functions kept for compatibility (consider moving to utils)
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
  weapons?: Record<string, number>;
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
  notes?: string;
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

export type DrillDownTarget = { type: 'Ship' | 'Hero' | 'Teammate' | 'Opponent' | 'Artifact' | 'KPI', name: string };

export interface Insight {
  title: string;
  subtitle: string;
  value: string;
  subValue: string;
  color: string;
  iconType: 'Rocket' | 'Crown' | 'Flame' | 'Zap' | 'Clock' | 'Target' | 'ShieldCheck' | 'Ghost' | 'Crosshair' | 'Moon' | 'Sun';
  priority: number;
}