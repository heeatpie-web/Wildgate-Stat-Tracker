/**
 * @module types
 * Core type definitions and constants for the Wildgate Stat Tracker.
 * Re-exports constants from utils/constants.ts for convenience.
 */

import { SHIP_CAPACITY, SHIP_NAME_ALIASES } from './utils/constants';

/** The two competitive game modes available in Wildgate. */
export type GameMode = 'Artifact Brawl' | 'Fleet Battle';
/** Possible outcomes for a match. */
export type MatchResult = 'Win' | 'Loss' | 'Draw' | 'Ongoing';
/** Wizard result selection state (includes neutral, unselected step). */
export type WizardResult = 'Win' | 'Loss' | 'Draw' | 'Match Result';
/** Supported colorblind filter modes, applied via SVG filters in index.html. */
export type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export * from './utils/constants';

/** Supported UI languages. Translations live in utils/translations.ts. */
export type Language = 'en' | 'es' | 'mx' | 'pt' | 'br' | 'zh';

/**
 * Explicit OCR pipeline state for a match's artifacts.
 * - `queued`     — Has screenshots but OCR hasn't run yet.
 * - `processing` — OCR is currently running on the screenshots.
 * - `reviewing`  — OCR complete; awaiting human review/confirmation.
 * - `ready`      — Reviewed and ready to save/apply.
 * - `saved`      — Data applied and match resolved.
 * - `error`      — OCR processing failed.
 */
export type OcrState = 'queued' | 'processing' | 'reviewing' | 'ready' | 'saved' | 'error';

/** Maps ship type names to kill counts for a single match. */
export interface KillMap {
  [shipName: string]: number;
}

/** A player's equipped loadout detected from telemetry or OCR. */
export interface Loadout {
  hero: string | null;
  ship: string | null;
  weapons: string[];
  equipment: string[];
  characterWeapons?: string[];
  characterEquipment?: string[];
}

export type TelemetryConsistencyStatus = 'pass' | 'warn' | 'unknown';

export interface TelemetryConsistencyChecks {
  teammateCount: TelemetryConsistencyStatus;
  mode: TelemetryConsistencyStatus;
  duration: TelemetryConsistencyStatus;
}

export interface TelemetryLoadoutSaveSnapshot {
  timestamp: number;
  inGame: boolean;
  source: 'NebLoadoutSaved' | 'NebCloudSaveRecordSize';
}

export interface TelemetryConsistency {
  expectedTeammateCount?: number;
  expectedMode?: GameMode;
  expectedModeSource?: 'pool-map' | 'pool-heuristic';
  telemetryDurationSeconds?: number;
  durationToleranceSeconds?: number;
  durationDeltaSeconds?: number;
  checks?: TelemetryConsistencyChecks;
  loadoutSaves?: TelemetryLoadoutSaveSnapshot[];
  latestLoadoutSaveAt?: number;
}

/** Structured opponent team data preserving team name, ship type, color, and player names. */
export interface OpponentTeam {
  teamName: string;
  shipType: string;
  color: string;
  players: string[];
}

/** Primary data record for a completed match. Persisted to disk via StorageService. */
export interface Match {
  id: number;
  canonicalMatchNumber?: number;
  timestamp: number;
  date: string;
  mode: GameMode;
  player: string;
  teammates: string[];
  opponents: string[];
  hero: string;
  ship: string;
  loadout?: Loadout; // New field
  weapons?: Record<string, number>; // Legacy/Usage stats
  reachModifiers: string[];
  kills: KillMap;
  result: MatchResult;
  subType: string;
  placement?: number;
  damageTaken?: number;
  time?: string;
  poiEasy?: number;
  poiMedium?: number;
  poiEpic?: number;
  artifactSource?: string;
  killedBy?: string;
  killedByShip?: string;
  opponentTeams?: OpponentTeam[];
  eliminatedByTeam?: string;
  isPinned?: boolean;
  notes?: string;
  timelineEvents?: any[]; // New field for match chronology
  artifacts?: string[]; // New field for bundled screenshots
  ocrDebug?: {
    rawText?: string;
    confidence?: number;
    source?: 'local' | 'cloud' | 'merged';
    fallbackReason?: string;
    cloudError?: string;
    geminiError?: string;
    mergeStats?: { total: number; agreed: number; cloudPreferred: number; localOnly: number; cloudOnly: number; conflicts: number };
    fieldConfidence?: { teammateNames: number; opponentNames: number; ship: number; modifiers: number };
    routing?: {
      attempted: boolean;
      applied: boolean;
      route: 'none' | 'names-only';
      preNameConfidence: number;
      postNameConfidence: number;
      latencyMs: number;
      fontProfile: 'default' | 'ealing-black-italic';
    };
    timestamp?: number;
  };
  /** Explicit OCR pipeline state for this match's artifacts. */
  ocrState?: OcrState;
  /** Marks OCR review "work queue" completion for this match (Smart Captures). */
  ocrReviewedAt?: number;
  /** Optional telemetry-derived consistency metadata/checks. */
  telemetryConsistency?: TelemetryConsistency;
}

/** Returns crew capacity (1-4) based on the ship display name. */
export const getShipCapacity = (ship: string): number => {
  const normalized = normalizeShipName(ship);
  return SHIP_CAPACITY[normalized] ?? 4;
};

/** Returns a hex color associated with the ship class for chart rendering. */
export const getShipColor = (ship: string): string => {
  const normalized = normalizeShipName(ship);
  if (normalized === "Hunter") return "var(--ship-hunter)";
  if (normalized === "Bastion") return "var(--ship-bastion)";
  if (normalized === "Privateer") return "var(--ship-privateer)";
  if (normalized === "Scout") return "var(--ship-scout)";
  return "var(--ship-default)";
};

export const normalizeShipName = (ship: string | null | undefined): string => {
  const cleaned = String(ship || '').trim();
  if (!cleaned) return '';
  if (SHIP_CAPACITY[cleaned] != null) return cleaned;
  if (SHIP_NAME_ALIASES[cleaned]) return SHIP_NAME_ALIASES[cleaned];
  if (/solo\s*outlaw/i.test(cleaned)) return 'Solo Outlaw';
  if (/outlaw/i.test(cleaned)) return 'Outlaw';
  if (/hunter/i.test(cleaned)) return 'Hunter';
  if (/bastion/i.test(cleaned)) return 'Bastion';
  if (/privateer/i.test(cleaned)) return 'Privateer';
  if (/scout/i.test(cleaned)) return 'Scout';
  return cleaned;
};

/** Target for the analytics drill-down overlay — clicking a chart element sets this. */
export type DrillDownTarget = {
  type: 'Ship' | 'Hero' | 'Teammate' | 'Opponent' | 'Artifact' | 'Modifier' | 'Date' | 'Week' | 'Month' | 'KPI';
  name: string;
};

/** A computed analytics insight card shown on the dashboard. Generated by analytics.ts. */
export type InsightTone =
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'accent'
  | 'neutral'
  | 'primary'
  | 'secondary';

export interface Insight {
  title: string;
  subtitle: string;
  value: string;
  subValue: string;
  tone: InsightTone;
  iconType: 'Rocket' | 'Crown' | 'Flame' | 'Zap' | 'Clock' | 'Target' | 'ShieldCheck' | 'Ghost' | 'Crosshair' | 'Moon' | 'Sun' | 'Users' | 'User' | 'Mountain' | 'Skull' | 'AlertTriangle';
  priority: number;
}

/** Visual density mode for analytics views. */
export type VisualMode = 'dense' | 'editorial';

/** Analytics view routing — 'overview' is the dashboard, others are expanded views. */
export type AnalyticsView =
  | 'overview'
  | 'session'
  | 'momentum'
  | 'period'
  | 'timePatterns'
  | 'streaks'
  | 'killEfficiency'
  | 'placement'
  | 'insights'
  | 'social'
  | 'pro'
  | 'environment'
  | 'synergy'
  | 'essay'
  | 'reactor';

/** Time range filter options for analytics. */
export type AnalyticsTimeRange = 'all' | 'month' | 'week' | 'today' | 'lastN';

// --- Analytics V2 Data Types ---

export interface HourStat { hour: number; matches: number; wins: number; winRate: number; }
export interface DayOfWeekStat { day: number; dayName: string; matches: number; wins: number; winRate: number; }
export interface HeatmapCell { day: number; hour: number; matches: number; winRate: number; }
export interface TimePatternData {
  byHour: HourStat[];
  byDayOfWeek: DayOfWeekStat[];
  heatmap: HeatmapCell[];
  peakHour: number;
  peakDay: number;
}

export interface StreakPoint { index: number; streak: number; timestamp: number; }
export interface StreakData {
  timeline: StreakPoint[];
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: number;
  averageStreakLength: number;
}

export interface DaySummary {
  date: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  totalKills: number;
  avgDamage: number;
  bestStreak: number;
  heroes: Record<string, number>;
  ships: Record<string, number>;
}
export interface SessionSummaryData {
  today: DaySummary | null;
  yesterday: DaySummary | null;
  last7Days: DaySummary[];
  dailyAverage: { matches: number; wins: number; kills: number };
}

export interface PeriodStats {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  avgKills: number;
  avgDamage: number;
}
export interface PeriodDelta {
  winRate: number;
  matches: number;
  avgKills: number;
  avgDamage: number;
}
export interface PeriodComparisonData {
  thisWeek: PeriodStats;
  lastWeek: PeriodStats;
  thisMonth: PeriodStats;
  lastMonth: PeriodStats;
  weekDelta: PeriodDelta;
  monthDelta: PeriodDelta;
}

export interface KillEfficiencyPoint { index: number; avgKills: number; timestamp: number; }
export interface KillEfficiencyData {
  timeline: KillEfficiencyPoint[];
  overallAvgKills: number;
  killsByShipType: Record<string, { avgKills: number; total: number }>;
  killsByHero: Record<string, { avgKills: number; total: number }>;
  trendDirection: 'up' | 'down' | 'stable';
}

export interface PlacementBucket { placement: number; count: number; }
export interface PlacementData {
  distribution: PlacementBucket[];
  avgPlacement: number;
  medianPlacement: number;
  topQuartileRate: number;
}

export interface MomentumPoint { index: number; score: number; timestamp: number; }
export interface MomentumData {
  timeline: MomentumPoint[];
  currentMomentum: number;
  peakMomentum: number;
  trend: 'rising' | 'falling' | 'stable';
}
