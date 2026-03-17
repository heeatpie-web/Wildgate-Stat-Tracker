/**
 * @module createDataSlice
 * Core game data state: matches, players, pilotRegistry, favorites, notes,
 * player ID mappings, and session-scoped fields (time, damage, loadout).
 *
 * Uses a DataSource priority system (manual > telemetry > ocr) so that
 * higher-fidelity sources never get silently overwritten by lower ones.
 */
import { StateCreator } from 'zustand';
import { Match, Loadout } from '../../types';
import { normalizeOcrName } from '../../utils/stringUtils';
import {
  extractArtifactSourceFromReachModifiers,
  stripArtifactSourceModifiers,
} from '../../utils/artifactSource';
import { sanitizeLoadout } from '../../utils/loadout';

/**
 * Origin of a data value. Priority: manual (3) > telemetry (2) > ocr (1).
 * Used by sourced setters (setTimeMin, setTimeSec, setDamageTaken, etc.).
 */
export type DataSource = 'manual' | 'telemetry' | 'ocr';
export type AspectProfile = 'standard' | 'ultrawide' | 'superultrawide' | 'unknown';

export interface DeviceDisplayInfo {
  displayWidth: number;
  displayHeight: number;
  virtualWidth: number;
  virtualHeight: number;
  aspectProfile: AspectProfile;
}

export interface GameResolution {
  resX: number;
  resY: number;
}

/** Returns numeric priority for a DataSource. Higher = more authoritative. */
export const getPriority = (source: DataSource = 'manual'): number => {
  switch (source) {
    case 'manual': return 3;
    case 'telemetry': return 2;
    case 'ocr': return 1;
    default: return 0;
  }
};

const sanitizeMatchArtifactFields = (match: Match): Match => {
  const currentModifiers = Array.isArray(match.reachModifiers)
    ? match.reachModifiers.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  const normalizedModifiers = stripArtifactSourceModifiers(currentModifiers);
  const extractedArtifactSource = extractArtifactSourceFromReachModifiers(currentModifiers);
  const existingArtifactSource = String(match.artifactSource || '').trim();
  const reachChanged = normalizedModifiers.length !== currentModifiers.length
    || normalizedModifiers.some((entry, index) => entry !== currentModifiers[index]);
  if (!reachChanged && (!extractedArtifactSource || existingArtifactSource)) return match;
  return {
    ...match,
    reachModifiers: normalizedModifiers,
    artifactSource: existingArtifactSource || extractedArtifactSource || undefined,
  };
};

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value || 0);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const sortMatchesForCanonical = (matches: Match[]): Match[] => (
  [...matches].sort((a, b) => {
    const tsA = Number(a?.timestamp || 0);
    const tsB = Number(b?.timestamp || 0);
    if (tsA !== tsB) return tsA - tsB;
    const idA = Number(a?.id || 0);
    const idB = Number(b?.id || 0);
    return idA - idB;
  })
);

const assignCanonicalMatchNumbers = (matches: Match[], nextHint: number): {
  matches: Match[];
  nextCanonicalMatchNumber: number;
} => {
  const taken = new Set<number>();
  let maxCanonical = 0;
  const nextMatches = matches.map((match) => ({ ...match }));

  nextMatches.forEach((match) => {
    const canonical = toPositiveInt(match.canonicalMatchNumber);
    if (!canonical || taken.has(canonical)) {
      delete (match as Partial<Match>).canonicalMatchNumber;
      return;
    }
    match.canonicalMatchNumber = canonical;
    taken.add(canonical);
    if (canonical > maxCanonical) maxCanonical = canonical;
  });

  let nextCanonical = Math.max(1, toPositiveInt(nextHint) || 1, maxCanonical + 1);
  sortMatchesForCanonical(nextMatches).forEach((match) => {
    if (toPositiveInt(match.canonicalMatchNumber)) return;
    while (taken.has(nextCanonical)) nextCanonical += 1;
    match.canonicalMatchNumber = nextCanonical;
    taken.add(nextCanonical);
    maxCanonical = Math.max(maxCanonical, nextCanonical);
    nextCanonical += 1;
  });

  return {
    matches: nextMatches,
    nextCanonicalMatchNumber: Math.max(nextCanonical, maxCanonical + 1, 1),
  };
};

type ProfileSnapshotMap = Record<string, Record<string, unknown>>;

const normalizeNameKey = (value: string): string => normalizeOcrName(value || '').toLowerCase();
export const normalizeRosterEntryKey = (value: string): string => normalizeNameKey(value);

const rewriteMatchPlayerNames = (
  match: Match,
  predicate: (name: string) => boolean,
  replacement: string
): Match => ({
  ...match,
  player: predicate(match.player) ? replacement : match.player,
  teammates: (match.teammates || []).map((name) => predicate(name) ? replacement : name),
  opponents: (match.opponents || []).map((name) => predicate(name) ? replacement : name),
  opponentTeams: Array.isArray(match.opponentTeams)
    ? match.opponentTeams.map((team) => ({
      ...team,
      players: (team.players || []).map((name) => predicate(name) ? replacement : name),
    }))
    : match.opponentTeams,
});

const dedupeAliasList = (values: string[], canonicalName?: string): string[] => {
  const seen = new Set<string>();
  const canonicalKey = normalizeNameKey(String(canonicalName || ''));
  const next: string[] = [];
  values.forEach((value) => {
    const cleaned = String(value || '').trim();
    const key = normalizeNameKey(cleaned);
    if (!cleaned || !key) return;
    if (canonicalKey && key === canonicalKey) return;
    if (seen.has(key)) return;
    seen.add(key);
    next.push(cleaned);
  });
  return next;
};

const clonePilotAliases = (aliases: Record<string, string[]>): Record<string, string[]> => (
  Object.fromEntries(
    Object.entries(aliases || {}).map(([key, values]) => [key, [...(values || [])]])
  )
);

const cloneProfileSnapshots = (profiles?: ProfileSnapshotMap): ProfileSnapshotMap | undefined => {
  if (!profiles || typeof profiles !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(profiles).map(([key, profile]) => [key, { ...(profile || {}) }])
  );
};

export type RosterEntryOrigin = 'manual' | 'ocr';
export type RosterEntryStatus = 'confirmed' | 'detected';

export interface RosterEntryMeta {
  origin: RosterEntryOrigin;
  status: RosterEntryStatus;
  firstSeenAt: number;
  lastSeenAt: number;
  lastConfidence: number;
  firstSeenMatchId: string;
}

const isPositiveTimestamp = (value: unknown): value is number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
};

const clampRosterConfidence = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const normalized = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

const coerceRosterOrigin = (value: unknown, fallback: RosterEntryOrigin): RosterEntryOrigin => (
  value === 'ocr' ? 'ocr' : fallback
);

const coerceRosterStatus = (
  value: unknown,
  origin: RosterEntryOrigin,
  fallback: RosterEntryStatus
): RosterEntryStatus => {
  if (origin === 'manual') return 'confirmed';
  if (value === 'detected' || value === 'confirmed') return value;
  return fallback;
};

const createDefaultRosterEntryMeta = (
  partial?: Partial<RosterEntryMeta>,
  now = Date.now()
): RosterEntryMeta => {
  const origin = coerceRosterOrigin(partial?.origin, 'manual');
  const status = coerceRosterStatus(partial?.status, origin, origin === 'manual' ? 'confirmed' : 'detected');
  const firstSeenAt = isPositiveTimestamp(partial?.firstSeenAt)
    ? Number(partial?.firstSeenAt)
    : now;
  const lastSeenAt = isPositiveTimestamp(partial?.lastSeenAt)
    ? Number(partial?.lastSeenAt)
    : firstSeenAt;
  const defaultConfidence = origin === 'manual' ? 100 : 0;
  return {
    origin,
    status,
    firstSeenAt,
    lastSeenAt: Math.max(firstSeenAt, lastSeenAt),
    lastConfidence: clampRosterConfidence(partial?.lastConfidence, defaultConfidence),
    firstSeenMatchId: typeof partial?.firstSeenMatchId === 'string'
      ? partial.firstSeenMatchId
      : '',
  };
};

const mergeRosterEntryMeta = (
  existing?: Partial<RosterEntryMeta> | null,
  incoming?: Partial<RosterEntryMeta> | null,
  now = Date.now()
): RosterEntryMeta => {
  const base = createDefaultRosterEntryMeta(existing || undefined, now);
  if (!incoming) return base;

  const incomingOrigin = coerceRosterOrigin(incoming.origin, base.origin);
  const origin: RosterEntryOrigin = (
    base.origin === 'manual' || incomingOrigin === 'manual'
      ? 'manual'
      : 'ocr'
  );
  const status = coerceRosterStatus(
    incoming.status ?? base.status,
    origin,
    base.status === 'confirmed' ? 'confirmed' : 'detected'
  );

  const firstSeenCandidates = [
    isPositiveTimestamp(base.firstSeenAt) ? Number(base.firstSeenAt) : Number.POSITIVE_INFINITY,
    isPositiveTimestamp(incoming.firstSeenAt) ? Number(incoming.firstSeenAt) : Number.POSITIVE_INFINITY,
  ];
  const firstSeenAt = Math.min(...firstSeenCandidates);
  const safeFirstSeenAt = Number.isFinite(firstSeenAt) ? firstSeenAt : now;
  const lastSeenAt = Math.max(
    isPositiveTimestamp(base.lastSeenAt) ? Number(base.lastSeenAt) : 0,
    isPositiveTimestamp(incoming.lastSeenAt) ? Number(incoming.lastSeenAt) : 0,
    safeFirstSeenAt
  );
  const lastConfidence = incoming.lastConfidence != null
    ? clampRosterConfidence(incoming.lastConfidence, base.lastConfidence)
    : base.lastConfidence;

  const incomingFirstSeenAt = isPositiveTimestamp(incoming.firstSeenAt)
    ? Number(incoming.firstSeenAt)
    : Number.POSITIVE_INFINITY;
  const baseFirstSeenAt = isPositiveTimestamp(base.firstSeenAt)
    ? Number(base.firstSeenAt)
    : Number.POSITIVE_INFINITY;
  const firstSeenMatchId = incoming.firstSeenMatchId && incomingFirstSeenAt <= baseFirstSeenAt
    ? String(incoming.firstSeenMatchId)
    : (base.firstSeenMatchId || String(incoming.firstSeenMatchId || ''));

  return {
    origin,
    status,
    firstSeenAt: safeFirstSeenAt,
    lastSeenAt,
    lastConfidence,
    firstSeenMatchId,
  };
};

const cloneRosterEntryMetaMap = (
  meta?: Record<string, RosterEntryMeta>
): Record<string, RosterEntryMeta> | undefined => {
  if (!meta || typeof meta !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, { ...value }])
  );
};

export const normalizeRosterEntryMetaMap = (
  pilotRegistry: string[] = [],
  meta?: Record<string, unknown>,
  now = Date.now()
): Record<string, RosterEntryMeta> => {
  const sourceMeta = meta && typeof meta === 'object'
    ? meta as Record<string, unknown>
    : {};
  const nextMeta: Record<string, RosterEntryMeta> = {};

  (pilotRegistry || []).forEach((name) => {
    const cleaned = String(name || '').trim();
    const key = normalizeRosterEntryKey(cleaned);
    if (!cleaned || !key || nextMeta[key]) return;
    const rawValue = sourceMeta[key] ?? sourceMeta[cleaned];
    nextMeta[key] = mergeRosterEntryMeta(
      undefined,
      rawValue && typeof rawValue === 'object'
        ? rawValue as Partial<RosterEntryMeta>
        : undefined,
      now
    );
  });

  return nextMeta;
};

const mergeProfileCountMaps = (
  targetRaw: Record<string, unknown> | undefined,
  sourceRaw: Record<string, unknown> | undefined
): Record<string, number> => {
  const merged: Record<string, number> = {};
  [targetRaw, sourceRaw].forEach((record) => {
    Object.entries(record || {}).forEach(([key, value]) => {
      merged[key] = (merged[key] || 0) + (Number(value) || 0);
    });
  });
  return merged;
};

const mergePlayerProfileRecords = (
  targetProfile: Record<string, unknown> | undefined,
  sourceProfile: Record<string, unknown> | undefined,
  canonicalName: string
): Record<string, unknown> | undefined => {
  if (!targetProfile && !sourceProfile) return undefined;
  const merged: Record<string, unknown> = {
    ...(sourceProfile || {}),
    ...(targetProfile || {}),
    id: canonicalName,
    name: canonicalName,
  };

  ['sightings', 'ocrSightings', 'manualSightings'].forEach((key) => {
    const total = (Number(targetProfile?.[key]) || 0) + (Number(sourceProfile?.[key]) || 0);
    if (total > 0) merged[key] = total;
  });

  const firstSeen = Math.min(
    Number(targetProfile?.firstSeen) || Number.POSITIVE_INFINITY,
    Number(sourceProfile?.firstSeen) || Number.POSITIVE_INFINITY
  );
  if (Number.isFinite(firstSeen)) merged.firstSeen = firstSeen;

  const lastSeen = Math.max(
    Number(targetProfile?.lastSeen) || 0,
    Number(sourceProfile?.lastSeen) || 0
  );
  if (lastSeen > 0) merged.lastSeen = lastSeen;

  const lastOcrConfidence = Math.max(
    Number(targetProfile?.lastOcrConfidence) || 0,
    Number(sourceProfile?.lastOcrConfidence) || 0
  );
  if (lastOcrConfidence > 0) merged.lastOcrConfidence = lastOcrConfidence;

  merged.playedWith = mergeProfileCountMaps(
    targetProfile?.playedWith as Record<string, unknown> | undefined,
    sourceProfile?.playedWith as Record<string, unknown> | undefined
  );
  merged.playedAgainst = mergeProfileCountMaps(
    targetProfile?.playedAgainst as Record<string, unknown> | undefined,
    sourceProfile?.playedAgainst as Record<string, unknown> | undefined
  );
  merged.teamsObserved = mergeProfileCountMaps(
    targetProfile?.teamsObserved as Record<string, unknown> | undefined,
    sourceProfile?.teamsObserved as Record<string, unknown> | undefined
  );
  merged.shipsObserved = mergeProfileCountMaps(
    targetProfile?.shipsObserved as Record<string, unknown> | undefined,
    sourceProfile?.shipsObserved as Record<string, unknown> | undefined
  );

  return merged;
};

/** Snapshot of state before a merge, enabling undo. */
export interface MergeHistoryEntry {
  id: string;
  timestamp: number;
  sourceName: string;
  targetName: string;
  snapshot: {
    matches: Match[];
    pilotRegistry: string[];
    favorites: string[];
    pilotNotes: Record<string, string>;
    pilotAliases: Record<string, string[]>;
    playerIdMap: Record<string, string>;
    pendingReviews: PendingReview[];
    playerProfiles?: ProfileSnapshotMap;
    rosterEntryMeta?: Record<string, RosterEntryMeta>;
  };
}

/** An OCR result flagged for manual review before acceptance. */
export interface PendingReviewSource {
  screenshotPath?: string;
  screenshotLabel?: string;
  capturedAt?: number;
}

/** An OCR result flagged for manual review before acceptance. */
export interface PendingReview {
  id: string;
  type: 'player_name' | 'modifier' | 'ship_type' | 'roster_candidate';
  value: string;
  originalConfidence: number;
  context?: string;
  bestMatch?: string;
  bestScore?: number;
  suggestions?: Array<{ name: string; score: number }>;
  canonicalTargetKey?: string;
  source?: 'ocr' | 'telemetry' | 'manual';
  sourceCapture?: PendingReviewSource;
}

/** A timestamped event entry for the session timeline. */
export interface TimelineEvent {
  timestamp: number;
  type: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface DataSlice {
  matches: Match[];
  nextCanonicalMatchNumber: number;
  /** @deprecated Legacy quick-add player list. Use pilotRegistry for the authoritative roster. */
  players: string[];
  /** Authoritative roster of known pilot display names. Source of truth for OCR matching and teammate/opponent assignment. */
  pilotRegistry: string[];
  rosterEntryMeta: Record<string, RosterEntryMeta>;
  favorites: string[];
  pilotNotes: Record<string, string>;
  playerIdMap: Record<string, string>;
  lastActivity: number;
  pendingKilledBy: string;
  setPendingKilledBy: (s: string) => void;
  pendingKilledByShip: string;
  setPendingKilledByShip: (s: string) => void;
  /** Cross-slice draft match mirror used by kill/eliminator setters. Owned by FormSlice. */
  pendingMatchData?: Partial<Match> | null;
  sessionTeams: Record<string, string[]>;
  setSessionTeams: (teams: Record<string, string[]>) => void;

  sessionShipTypes: Record<string, string>;
  shipTypesSource?: DataSource;
  setSessionShipTypes: (types: Record<string, string>, source?: DataSource) => void;

  currentLoadout: Loadout | null;
  setCurrentLoadout: (l: Loadout | null) => void;

  deviceDisplayInfo: DeviceDisplayInfo | null;
  setDeviceDisplayInfo: (info: DeviceDisplayInfo | null) => void;
  gameResolution: GameResolution | null;
  setGameResolution: (resolution: GameResolution | null) => void;

  isSimulation: boolean;
  setIsSimulation: (isSim: boolean) => void;

  // Match Data State
  timeMin: string;
  timeSec: string;
  timeSource?: DataSource;
  setTimeMin: (v: string, source?: DataSource) => void;
  setTimeSec: (v: string, source?: DataSource) => void;
  damageTaken: string;
  damageSource?: DataSource;
  setDamageTaken: (v: string, source?: DataSource) => void;
  resetMatchMetricsForNewMatch: () => void;

  // ... rest of interface


  setMatches: (matches: Match[]) => void;
  addMatch: (match: Match) => void;
  updateMatch: (updatedMatch: Match) => void;
  deleteMatch: (id: number) => void;
  toggleMatchPin: (id: number) => void;

  setPlayers: (players: string[]) => void;
  addPlayer: (name: string) => void;
  deletePlayer: (name: string) => void;

  setPilotRegistry: (registry: string[]) => void;
  addToRegistry: (name: string, meta?: Partial<RosterEntryMeta>) => void;
  removeFromRegistry: (name: string) => void;
  updateRosterEntryMeta: (name: string, meta: Partial<RosterEntryMeta>) => void;
  confirmRosterEntry: (name: string, origin?: RosterEntryOrigin) => void;
  renamePilot: (oldName: string, newName: string) => void;

  setFavorites: (favorites: string[]) => void;
  toggleFavorite: (name: string) => void;

  setPilotNotes: (notes: Record<string, string>) => void;
  updatePilotNote: (name: string, note: string) => void;

  pilotAliases: Record<string, string[]>;
  addPilotAlias: (pilotName: string, alias: string) => void;
  removePilotAlias: (pilotName: string, alias: string) => void;

  setPlayerIdMap: (map: Record<string, string>) => void;
  updatePlayerIdMapping: (id: string, name: string) => void;
  mergePilots: (sourceName: string, targetName: string) => void;
  mergeHistory: MergeHistoryEntry[];
  activeMergeNotificationId: string | null;
  dismissActiveMergeNotification: () => void;
  undoLastMerge: () => boolean;
  timelineEvents: TimelineEvent[];
  setTimelineEvents: (events: TimelineEvent[]) => void;
  addTimelineEvent: (event: TimelineEvent) => void;

  pendingReviews: PendingReview[];
  addPendingReview: (review: PendingReview) => void;
  removePendingReview: (id: string) => void;
  removePendingReviews: (ids: string[]) => void;
  clearPendingReviews: () => void;
  dismissedRosterMergePairKeys: string[];
  dismissRosterMergeSuggestionPairs: (pairKeys: string[]) => void;
  dismissedRosterCandidateKeys: string[];
  dismissRosterCandidateKeys: (keys: string[]) => void;

  setLastActivity: (timestamp: number) => void;
}

export const createDataSlice: StateCreator<DataSlice> = (set, get) => ({
  matches: [],
  nextCanonicalMatchNumber: 1,
  players: [],
  pilotRegistry: [],
  rosterEntryMeta: {},
  favorites: [],
  pilotNotes: {},
  pilotAliases: {},
  playerIdMap: {},
  lastActivity: Date.now(),
  pendingKilledBy: "",
  setPendingKilledBy: (s) => set((state) => ({
    pendingKilledBy: s,
    pendingMatchData: state.pendingMatchData
      ? { ...state.pendingMatchData, killedBy: s || undefined }
      : state.pendingMatchData,
  })),
  pendingKilledByShip: "",
  setPendingKilledByShip: (s) => set((state) => ({
    pendingKilledByShip: s,
    pendingMatchData: state.pendingMatchData
      ? { ...state.pendingMatchData, killedByShip: s || undefined }
      : state.pendingMatchData,
  })),
  sessionTeams: {},
  setSessionTeams: (teams) => set({ sessionTeams: teams }),
  sessionShipTypes: {},
  shipTypesSource: undefined,
  setSessionShipTypes: (types, source = 'manual') => set((state) => {
    const currentP = getPriority(state.shipTypesSource);
    const newP = getPriority(source);
    if (newP >= currentP || !state.shipTypesSource) {
      return { sessionShipTypes: types, shipTypesSource: source };
    }
    return {};
  }),
  currentLoadout: null,
  setCurrentLoadout: (l) => set({ currentLoadout: sanitizeLoadout(l) }),
  deviceDisplayInfo: null,
  setDeviceDisplayInfo: (info) => set({ deviceDisplayInfo: info }),
  gameResolution: null,
  setGameResolution: (resolution) => set({ gameResolution: resolution }),

  isSimulation: false,
  setIsSimulation: (isSim) => set({ isSimulation: isSim }),

  // Match Data - Sourced
  timeMin: "",
  timeSec: "",
  timeSource: undefined,

  setTimeMin: (v, source = 'manual') => set((state) => {
    const currentP = getPriority(state.timeSource);
    const newP = getPriority(source);
    // If priority is higher or equal, accept the change
    // Also accept if current is undefined
    if (newP >= currentP || !state.timeSource) {
      return { timeMin: v, timeSource: source };
    }
    return {}; // Ignore
  }),

  setTimeSec: (v, source = 'manual') => set((state) => {
    const currentP = getPriority(state.timeSource);
    const newP = getPriority(source);
    if (newP >= currentP || !state.timeSource) {
      return { timeSec: v, timeSource: source };
    }
    return {};
  }),

  damageTaken: "",
  damageSource: undefined,
  setDamageTaken: (v, source = 'manual') => set((state) => {
    const currentP = getPriority(state.damageSource);
    const newP = getPriority(source);
    if (newP >= currentP || !state.damageSource) {
      return { damageTaken: v, damageSource: source };
    }
    return {};
  }),
  resetMatchMetricsForNewMatch: () => set({
    timeMin: "",
    timeSec: "",
    timeSource: undefined,
    damageTaken: "",
    damageSource: undefined,
  }),
  timelineEvents: [],
  setTimelineEvents: (events) => set({ timelineEvents: events }),
  addTimelineEvent: (event) => set((state) => ({ timelineEvents: [event, ...state.timelineEvents] })),

  pendingReviews: [],
  addPendingReview: (review) => set((state) => ({ pendingReviews: [...state.pendingReviews, review] })),
  removePendingReview: (id) => set((state) => ({ pendingReviews: state.pendingReviews.filter(r => r.id !== id) })),
  removePendingReviews: (ids) => set((state) => {
    const idSet = new Set((ids || []).filter(Boolean));
    if (idSet.size === 0) return {};
    return { pendingReviews: state.pendingReviews.filter((review) => !idSet.has(review.id)) };
  }),
  clearPendingReviews: () => set({ pendingReviews: [] }),
  dismissedRosterMergePairKeys: [],
  dismissRosterMergeSuggestionPairs: (pairKeys) => set((state) => {
    const nextKeys = Array.from(new Set(
      [...(state.dismissedRosterMergePairKeys || []), ...(pairKeys || [])]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    ));
    return { dismissedRosterMergePairKeys: nextKeys };
  }),
  dismissedRosterCandidateKeys: [],
  dismissRosterCandidateKeys: (keys) => set((state) => {
    const nextKeys = Array.from(new Set(
      [...(state.dismissedRosterCandidateKeys || []), ...(keys || [])]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    ));
    return { dismissedRosterCandidateKeys: nextKeys };
  }),

  mergeHistory: [],
  activeMergeNotificationId: null,
  dismissActiveMergeNotification: () => set({ activeMergeNotificationId: null }),

  setMatches: (matches) => set((state) => {
    const sanitized = (matches || []).map((entry) => sanitizeMatchArtifactFields({ ...entry }));
    const assigned = assignCanonicalMatchNumbers(sanitized, state.nextCanonicalMatchNumber);
    return {
      matches: assigned.matches,
      nextCanonicalMatchNumber: assigned.nextCanonicalMatchNumber,
      lastActivity: Date.now(),
    };
  }),
  addMatch: (match) => set((state) => {
    const sanitizedMatch = sanitizeMatchArtifactFields({ ...match });
    const taken = new Set(
      state.matches
        .map((entry) => toPositiveInt(entry.canonicalMatchNumber))
        .filter((value): value is number => Number.isInteger(value))
    );
    let canonical = toPositiveInt(sanitizedMatch.canonicalMatchNumber);
    let nextCanonical = Math.max(1, toPositiveInt(state.nextCanonicalMatchNumber) || 1);
    if (!canonical || taken.has(canonical)) {
      canonical = nextCanonical;
      while (taken.has(canonical)) canonical += 1;
    }
    nextCanonical = Math.max(nextCanonical, canonical + 1);
    return {
      matches: [{ ...sanitizedMatch, canonicalMatchNumber: canonical }, ...state.matches],
      nextCanonicalMatchNumber: nextCanonical,
      lastActivity: Date.now(),
    };
  }),
  updateMatch: (updatedMatch) => set((state) => {
    const sanitizedUpdatedMatch = sanitizeMatchArtifactFields({ ...updatedMatch });
    const existing = state.matches.find((entry) => entry.id === updatedMatch.id);
    if (!existing) {
      return { lastActivity: Date.now() };
    }
    const taken = new Set(
      state.matches
        .filter((entry) => entry.id !== updatedMatch.id)
        .map((entry) => toPositiveInt(entry.canonicalMatchNumber))
        .filter((value): value is number => Number.isInteger(value))
    );
    let canonical = toPositiveInt(sanitizedUpdatedMatch.canonicalMatchNumber)
      || toPositiveInt(existing?.canonicalMatchNumber);
    let nextCanonical = Math.max(1, toPositiveInt(state.nextCanonicalMatchNumber) || 1);
    if (!canonical || taken.has(canonical)) {
      canonical = nextCanonical;
      while (taken.has(canonical)) canonical += 1;
    }
    nextCanonical = Math.max(nextCanonical, canonical + 1);
    const nextMatch: Match = { ...sanitizedUpdatedMatch, canonicalMatchNumber: canonical };
    return {
      matches: state.matches.map(m => m.id === updatedMatch.id ? nextMatch : m),
      nextCanonicalMatchNumber: nextCanonical,
      lastActivity: Date.now(),
    };
  }),
  deleteMatch: (id) => set((state) => ({
    matches: state.matches.filter(m => m.id !== id),
    lastActivity: Date.now()
  })),
  toggleMatchPin: (id) => set((state) => ({
    matches: state.matches.map(m => m.id === id ? { ...m, isPinned: !m.isPinned } : m),
    lastActivity: Date.now()
  })),

  setPlayers: (players) => set({ players }),
  addPlayer: (name) => set((state) => ({
    players: state.players.includes(name) ? state.players : [...state.players, name]
  })),
  deletePlayer: (name) => set((state) => ({ players: state.players.filter(p => p !== name) })),

  setPilotRegistry: (pilotRegistry) => set((state) => {
    const seen = new Set<string>();
    const normalized = (pilotRegistry || [])
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .filter((name) => {
        const key = normalizeOcrName(name).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return {
      pilotRegistry: normalized,
      rosterEntryMeta: normalizeRosterEntryMetaMap(normalized, state.rosterEntryMeta),
    };
  }),
  addToRegistry: (name, meta) => set((state) => {
    const cleaned = String(name || '').trim();
    if (!cleaned) return {};
    const nextKey = normalizeRosterEntryKey(cleaned);
    if (!nextKey) return {};
    const existingEntry = state.pilotRegistry.find((entry) => normalizeRosterEntryKey(entry) === nextKey);
    const now = Date.now();
    if (existingEntry) {
      const existingMeta = state.rosterEntryMeta[nextKey];
      if (!meta && existingMeta) return {};
      return {
        rosterEntryMeta: {
          ...state.rosterEntryMeta,
          [nextKey]: mergeRosterEntryMeta(existingMeta, meta, now),
        },
      };
    }
    return {
      pilotRegistry: [...state.pilotRegistry, cleaned],
      rosterEntryMeta: {
        ...state.rosterEntryMeta,
        [nextKey]: mergeRosterEntryMeta(undefined, meta, now),
      },
    };
  }),
  removeFromRegistry: (name) => set((state) => {
    const targetKey = normalizeRosterEntryKey(name);
    if (!targetKey) return {};
    const nextRegistry = state.pilotRegistry.filter((entry) => normalizeRosterEntryKey(entry) !== targetKey);
    return {
      pilotRegistry: nextRegistry,
      rosterEntryMeta: normalizeRosterEntryMetaMap(nextRegistry, state.rosterEntryMeta),
    };
  }),
  updateRosterEntryMeta: (name, meta) => set((state) => {
    const targetKey = normalizeRosterEntryKey(name);
    if (!targetKey) return {};
    const exists = state.pilotRegistry.some((entry) => normalizeRosterEntryKey(entry) === targetKey);
    if (!exists && !state.rosterEntryMeta[targetKey]) return {};
    return {
      rosterEntryMeta: {
        ...state.rosterEntryMeta,
        [targetKey]: mergeRosterEntryMeta(state.rosterEntryMeta[targetKey], meta, Date.now()),
      },
    };
  }),
  confirmRosterEntry: (name, origin) => set((state) => {
    const targetKey = normalizeRosterEntryKey(name);
    if (!targetKey) return {};
    const exists = state.pilotRegistry.some((entry) => normalizeRosterEntryKey(entry) === targetKey);
    if (!exists && !state.rosterEntryMeta[targetKey]) return {};
    return {
      rosterEntryMeta: {
        ...state.rosterEntryMeta,
        [targetKey]: mergeRosterEntryMeta(state.rosterEntryMeta[targetKey], {
          ...(origin ? { origin } : {}),
          status: 'confirmed',
        }, Date.now()),
      },
    };
  }),

  renamePilot: (oldName, newName) => set((state) => {
    const oldKey = normalizeNameKey(oldName);
    const newKey = normalizeNameKey(newName);
    if (!newKey) return {};
    const collision = state.pilotRegistry.some((entry) => (
      entry !== oldName && normalizeNameKey(entry) === newKey
    ));
    if (collision) return {};
    const newRegistry = state.pilotRegistry.map(p => p === oldName ? newName : p);
    const newPlayers = state.players.map(p => p === oldName ? newName : p);
    const newFavorites = state.favorites.map(f => f === oldName ? newName : f);
    const newNotes = { ...state.pilotNotes };
    if (newNotes[oldName]) {
      newNotes[newName] = newNotes[oldName];
      delete newNotes[oldName];
    }
    const newMatches = state.matches.map((match) => rewriteMatchPlayerNames(
      match,
      (name) => name === oldName,
      newName
    ));

    const newAliases = clonePilotAliases(state.pilotAliases);
    const mergedAliases = dedupeAliasList([
      ...(newAliases[newName] || []),
      ...(newAliases[oldName] || []),
      oldKey !== newKey ? oldName : '',
    ], newName);
    if (mergedAliases.length > 0) newAliases[newName] = mergedAliases;
    else delete newAliases[newName];
    if (oldName !== newName) delete newAliases[oldName];

    const newIdMap = { ...state.playerIdMap };
    Object.entries(newIdMap).forEach(([id, name]) => {
      if (normalizeNameKey(name) === oldKey) newIdMap[id] = newName;
    });
    const nextRosterEntryMeta = normalizeRosterEntryMetaMap(
      newRegistry,
      (() => {
        const draftMeta: Record<string, unknown> = { ...(state.rosterEntryMeta || {}) };
        draftMeta[newKey] = mergeRosterEntryMeta(
          state.rosterEntryMeta?.[newKey],
          state.rosterEntryMeta?.[oldKey],
          Date.now()
        );
        if (oldKey !== newKey) delete draftMeta[oldKey];
        return draftMeta;
      })()
    );

    const profiles = (get() as unknown as { playerProfiles?: ProfileSnapshotMap }).playerProfiles;
    if (profiles && typeof profiles === 'object') {
      const mergedProfile = mergePlayerProfileRecords(profiles[newName], profiles[oldName], newName);
      const newProfiles = { ...profiles };
      if (mergedProfile) newProfiles[newName] = mergedProfile;
      if (oldName !== newName) delete newProfiles[oldName];

      return {
        pilotRegistry: newRegistry,
        players: newPlayers,
        favorites: newFavorites,
        pilotNotes: newNotes,
        pilotAliases: newAliases,
        playerIdMap: newIdMap,
        matches: newMatches,
        rosterEntryMeta: nextRosterEntryMeta,
        playerProfiles: newProfiles,
        lastActivity: Date.now()
      };
    }

    return {
      pilotRegistry: newRegistry,
      players: newPlayers,
      favorites: newFavorites,
      pilotNotes: newNotes,
      pilotAliases: newAliases,
      playerIdMap: newIdMap,
      matches: newMatches,
      rosterEntryMeta: nextRosterEntryMeta,
      lastActivity: Date.now()
    };
  }),

  mergePilots: (sourceName, targetName) => set((state) => {
    // ─── Snapshot for undo (keep last 10 merges) ───
    const snapshot: MergeHistoryEntry = {
      id: `merge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      sourceName,
      targetName,
      snapshot: {
        matches: state.matches,
        pilotRegistry: [...state.pilotRegistry],
        favorites: [...state.favorites],
        pilotNotes: { ...state.pilotNotes },
        pilotAliases: clonePilotAliases(state.pilotAliases),
        playerIdMap: { ...state.playerIdMap },
        pendingReviews: [...(state.pendingReviews || [])],
        playerProfiles: cloneProfileSnapshots(
          (get() as unknown as { playerProfiles?: ProfileSnapshotMap }).playerProfiles
        ),
        rosterEntryMeta: cloneRosterEntryMetaMap(state.rosterEntryMeta),
      },
    };
    const mergeHistory = [snapshot, ...(state.mergeHistory || [])].slice(0, 10);

    const srcNorm = normalizeOcrName(sourceName).toLowerCase();

    // Helper: case-insensitive match against source name
    const isSource = (name: string) =>
      name === sourceName || normalizeOcrName(name).toLowerCase() === srcNorm;

    // 1. Update Matches (case-insensitive)
    const newMatches = state.matches.map((match) => rewriteMatchPlayerNames(
      match,
      isSource,
      targetName
    ));

    // 2. Update Registry
    const newRegistry = state.pilotRegistry.filter(p => !isSource(p));
    if (!newRegistry.includes(targetName)) newRegistry.push(targetName);
    const targetKey = normalizeRosterEntryKey(targetName);
    const newRosterEntryMeta = normalizeRosterEntryMetaMap(
      newRegistry,
      {
        ...(state.rosterEntryMeta || {}),
        [targetKey]: mergeRosterEntryMeta(
          state.rosterEntryMeta?.[targetKey],
          state.rosterEntryMeta?.[srcNorm],
          Date.now()
        ),
      }
    );

    // 3. Update Favorites, Notes & Aliases
    const newFavorites = state.favorites.filter(f => !isSource(f));
    const newNotes = { ...state.pilotNotes };
    if (newNotes[sourceName]) {
      newNotes[targetName] = (newNotes[targetName] ? newNotes[targetName] + "\n" : "") + newNotes[sourceName];
      delete newNotes[sourceName];
    }
    const newAliases = clonePilotAliases(state.pilotAliases);
    const mergedAliases = dedupeAliasList([
      ...(newAliases[targetName] || []),
      ...(newAliases[sourceName] || []),
      sourceName,
    ], targetName);
    if (mergedAliases.length > 0) newAliases[targetName] = mergedAliases;
    else delete newAliases[targetName];
    delete newAliases[sourceName];

    // 4. Update ID Map (case-insensitive)
    const newIdMap = { ...state.playerIdMap };
    Object.entries(newIdMap).forEach(([id, name]) => {
      if (isSource(name)) newIdMap[id] = targetName;
    });

    // 5. Consolidate playerProfiles (from MappingSlice, accessible via combined store)
    // get() returns DataSlice, but the combined store also includes MappingSlice fields at runtime.
    const profiles = (get() as unknown as { playerProfiles?: Record<string, Record<string, unknown>> }).playerProfiles;
    if (profiles && typeof profiles === 'object') {
      const srcProfile = profiles[sourceName];
      const tgtProfile = profiles[targetName];
      const merged = mergePlayerProfileRecords(tgtProfile, srcProfile, targetName);
      if (merged) {
        const newProfiles = { ...profiles, [targetName]: merged };
        delete newProfiles[sourceName];
        return {
          matches: newMatches, pilotRegistry: newRegistry, favorites: newFavorites,
          pilotNotes: newNotes, pilotAliases: newAliases, playerIdMap: newIdMap, rosterEntryMeta: newRosterEntryMeta, playerProfiles: newProfiles, mergeHistory, activeMergeNotificationId: snapshot.id, lastActivity: Date.now()
        };
      }
    }

    // 6. Clear pending reviews referencing source name
    const pendingReviews = state.pendingReviews || [];
    const newPending = pendingReviews.filter(r => !isSource(r.value));

    return {
      matches: newMatches, pilotRegistry: newRegistry, favorites: newFavorites,
      pilotNotes: newNotes, pilotAliases: newAliases, playerIdMap: newIdMap, rosterEntryMeta: newRosterEntryMeta, pendingReviews: newPending, mergeHistory, activeMergeNotificationId: snapshot.id, lastActivity: Date.now()
    };
  }),

  undoLastMerge: () => {
    const state = get() as DataSlice;
    const history = state.mergeHistory || [];
    if (history.length === 0) return false;
    const [latest, ...rest] = history;
    set({
      matches: latest.snapshot.matches,
      pilotRegistry: latest.snapshot.pilotRegistry,
      favorites: latest.snapshot.favorites,
      pilotNotes: latest.snapshot.pilotNotes,
      pilotAliases: latest.snapshot.pilotAliases,
      playerIdMap: latest.snapshot.playerIdMap,
      pendingReviews: latest.snapshot.pendingReviews,
      rosterEntryMeta: normalizeRosterEntryMetaMap(
        latest.snapshot.pilotRegistry,
        latest.snapshot.rosterEntryMeta
      ),
      playerProfiles: latest.snapshot.playerProfiles,
      mergeHistory: rest,
      activeMergeNotificationId: null,
      lastActivity: Date.now(),
    } as Partial<DataSlice> & { playerProfiles?: ProfileSnapshotMap });
    return true;
  },

  setFavorites: (favorites) => set({ favorites }),
  toggleFavorite: (name) => set((state) => ({
    favorites: state.favorites.includes(name)
      ? state.favorites.filter(f => f !== name)
      : [...state.favorites, name]
  })),

  setPilotNotes: (pilotNotes) => set({ pilotNotes }),
  updatePilotNote: (name, note) => set((state) => ({ pilotNotes: { ...state.pilotNotes, [name]: note } })),
  addPilotAlias: (pilotName, alias) => set((state) => {
    const trimmed = alias.trim();
    if (!trimmed) return {};
    const existing = state.pilotAliases[pilotName] || [];
    if (existing.includes(trimmed)) return {};
    return { pilotAliases: { ...state.pilotAliases, [pilotName]: [...existing, trimmed] } };
  }),
  removePilotAlias: (pilotName, alias) => set((state) => {
    const existing = state.pilotAliases[pilotName] || [];
    const next = existing.filter(a => a !== alias);
    if (next.length === 0) {
      const { [pilotName]: _, ...rest } = state.pilotAliases;
      return { pilotAliases: rest };
    }
    return { pilotAliases: { ...state.pilotAliases, [pilotName]: next } };
  }),

  setPlayerIdMap: (playerIdMap) => set({ playerIdMap }),
  updatePlayerIdMapping: (id, name) => set((state) => ({ playerIdMap: { ...state.playerIdMap, [id]: name } })),

  setLastActivity: (lastActivity) => set({ lastActivity }),
});
