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

/**
 * Origin of a data value. Priority: manual (3) > telemetry (2) > ocr (1).
 * Used by sourced setters (setTimeMin, setTimeSec, setDamageTaken, etc.).
 */
export type DataSource = 'manual' | 'telemetry' | 'ocr';

/** Returns numeric priority for a DataSource. Higher = more authoritative. */
export const getPriority = (source: DataSource = 'manual'): number => {
  switch (source) {
    case 'manual': return 3;
    case 'telemetry': return 2;
    case 'ocr': return 1;
    default: return 0;
  }
};

const sanitizeLoadoutSlots = (loadout: Loadout | null): Loadout | null => {
  if (!loadout) return null;
  return {
    ...loadout,
    weapons: (loadout.weapons || []).filter(Boolean).slice(0, 2),
    equipment: (loadout.equipment || []).filter(Boolean).slice(0, 2),
  };
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
    playerIdMap: Record<string, string>;
    pendingReviews: PendingReview[];
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
  /** @deprecated Legacy quick-add player list. Use pilotRegistry for the authoritative roster. */
  players: string[];
  /** Authoritative roster of known pilot display names. Source of truth for OCR matching and teammate/opponent assignment. */
  pilotRegistry: string[];
  favorites: string[];
  pilotNotes: Record<string, string>;
  playerIdMap: Record<string, string>;
  lastActivity: number;
  pendingKilledBy: string;
  setPendingKilledBy: (s: string) => void;
  pendingKilledByShip: string;
  setPendingKilledByShip: (s: string) => void;
  sessionTeams: Record<string, string[]>;
  setSessionTeams: (teams: Record<string, string[]>) => void;

  sessionShipTypes: Record<string, string>;
  shipTypesSource?: DataSource;
  setSessionShipTypes: (types: Record<string, string>, source?: DataSource) => void;

  currentLoadout: Loadout | null;
  setCurrentLoadout: (l: Loadout | null) => void;

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
  addToRegistry: (name: string) => void;
  removeFromRegistry: (name: string) => void;
  renamePilot: (oldName: string, newName: string) => void;

  setFavorites: (favorites: string[]) => void;
  toggleFavorite: (name: string) => void;

  setPilotNotes: (notes: Record<string, string>) => void;
  updatePilotNote: (name: string, note: string) => void;

  setPlayerIdMap: (map: Record<string, string>) => void;
  updatePlayerIdMapping: (id: string, name: string) => void;
  mergePilots: (sourceName: string, targetName: string) => void;
  mergeHistory: MergeHistoryEntry[];
  undoLastMerge: () => boolean;
  timelineEvents: TimelineEvent[];
  setTimelineEvents: (events: TimelineEvent[]) => void;
  addTimelineEvent: (event: TimelineEvent) => void;

  pendingReviews: PendingReview[];
  addPendingReview: (review: PendingReview) => void;
  removePendingReview: (id: string) => void;
  clearPendingReviews: () => void;

  setLastActivity: (timestamp: number) => void;
}

export const createDataSlice: StateCreator<DataSlice> = (set, get) => ({
  matches: [],
  players: [],
  pilotRegistry: [],
  favorites: [],
  pilotNotes: {},
  playerIdMap: {},
  lastActivity: Date.now(),
  pendingKilledBy: "",
  setPendingKilledBy: (s) => set({ pendingKilledBy: s }),
  pendingKilledByShip: "",
  setPendingKilledByShip: (s) => set({ pendingKilledByShip: s }),
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
  setCurrentLoadout: (l) => set({ currentLoadout: sanitizeLoadoutSlots(l) }),

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
  timelineEvents: [],
  setTimelineEvents: (events) => set({ timelineEvents: events }),
  addTimelineEvent: (event) => set((state) => ({ timelineEvents: [event, ...state.timelineEvents] })),

  pendingReviews: [],
  addPendingReview: (review) => set((state) => ({ pendingReviews: [...state.pendingReviews, review] })),
  removePendingReview: (id) => set((state) => ({ pendingReviews: state.pendingReviews.filter(r => r.id !== id) })),
  clearPendingReviews: () => set({ pendingReviews: [] }),

  mergeHistory: [],

  setMatches: (matches) => set({ matches, lastActivity: Date.now() }),
  addMatch: (match) => set((state) => ({ matches: [match, ...state.matches], lastActivity: Date.now() })),
  updateMatch: (updatedMatch) => set((state) => ({
    matches: state.matches.map(m => m.id === updatedMatch.id ? updatedMatch : m),
    lastActivity: Date.now()
  })),
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

  setPilotRegistry: (pilotRegistry) => set({ pilotRegistry }),
  addToRegistry: (name) => set((state) => ({
    pilotRegistry: state.pilotRegistry.includes(name) ? state.pilotRegistry : [...state.pilotRegistry, name]
  })),
  removeFromRegistry: (name) => set((state) => ({ pilotRegistry: state.pilotRegistry.filter(p => p !== name) })),

  renamePilot: (oldName, newName) => set((state) => {
    const newRegistry = state.pilotRegistry.map(p => p === oldName ? newName : p);
    const newPlayers = state.players.map(p => p === oldName ? newName : p);
    const newFavorites = state.favorites.map(f => f === oldName ? newName : f);
    const newNotes = { ...state.pilotNotes };
    if (newNotes[oldName]) {
      newNotes[newName] = newNotes[oldName];
      delete newNotes[oldName];
    }
    const newMatches = state.matches.map(m => ({
      ...m,
      player: m.player === oldName ? newName : m.player,
      teammates: (m.teammates || []).map(t => t === oldName ? newName : t),
      opponents: (m.opponents || []).map(o => o === oldName ? newName : o)
    }));

    return {
      pilotRegistry: newRegistry,
      players: newPlayers,
      favorites: newFavorites,
      pilotNotes: newNotes,
      matches: newMatches,
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
        playerIdMap: { ...state.playerIdMap },
        pendingReviews: [...(state.pendingReviews || [])],
      },
    };
    const mergeHistory = [snapshot, ...(state.mergeHistory || [])].slice(0, 10);

    const srcNorm = normalizeOcrName(sourceName).toLowerCase();

    // Helper: case-insensitive match against source name
    const isSource = (name: string) =>
      name === sourceName || normalizeOcrName(name).toLowerCase() === srcNorm;

    // 1. Update Matches (case-insensitive)
    const newMatches = state.matches.map(m => ({
      ...m,
      player: isSource(m.player) ? targetName : m.player,
      teammates: (m.teammates || []).map(t => isSource(t) ? targetName : t),
      opponents: (m.opponents || []).map(o => isSource(o) ? targetName : o)
    }));

    // 2. Update Registry
    const newRegistry = state.pilotRegistry.filter(p => !isSource(p));
    if (!newRegistry.includes(targetName)) newRegistry.push(targetName);

    // 3. Update Favorites & Notes
    const newFavorites = state.favorites.filter(f => !isSource(f));
    const newNotes = { ...state.pilotNotes };
    if (newNotes[sourceName]) {
      newNotes[targetName] = (newNotes[targetName] ? newNotes[targetName] + "\n" : "") + newNotes[sourceName];
      delete newNotes[sourceName];
    }

    // 4. Update ID Map (case-insensitive)
    const newIdMap = { ...state.playerIdMap };
    Object.entries(newIdMap).forEach(([id, name]) => {
      if (isSource(name)) newIdMap[id] = targetName;
    });

    // 5. Consolidate playerProfiles (from MappingSlice, accessible via combined store)
    const fullState = get() as any;
    const profiles = fullState.playerProfiles;
    if (profiles) {
      const srcProfile = profiles[sourceName];
      const tgtProfile = profiles[targetName];
      if (srcProfile && tgtProfile) {
        // Merge sighting counts and relationship data
        const merged = { ...tgtProfile };
        merged.sightings = (tgtProfile.sightings || 0) + (srcProfile.sightings || 0);
        merged.ocrSightings = (tgtProfile.ocrSightings || 0) + (srcProfile.ocrSightings || 0);
        merged.manualSightings = (tgtProfile.manualSightings || 0) + (srcProfile.manualSightings || 0);
        merged.firstSeen = Math.min(tgtProfile.firstSeen || Infinity, srcProfile.firstSeen || Infinity);
        merged.lastSeen = Math.max(tgtProfile.lastSeen || 0, srcProfile.lastSeen || 0);
        // Merge playedWith/playedAgainst
        for (const [pid, count] of Object.entries(srcProfile.playedWith || {})) {
          merged.playedWith = { ...merged.playedWith, [pid]: ((merged.playedWith || {})[pid] || 0) + (count as number) };
        }
        for (const [pid, count] of Object.entries(srcProfile.playedAgainst || {})) {
          merged.playedAgainst = { ...merged.playedAgainst, [pid]: ((merged.playedAgainst || {})[pid] || 0) + (count as number) };
        }
        // Merge observed teams/ships
        for (const [key, count] of Object.entries(srcProfile.teamsObserved || {})) {
          merged.teamsObserved = { ...merged.teamsObserved, [key]: ((merged.teamsObserved || {})[key] || 0) + (count as number) };
        }
        for (const [key, count] of Object.entries(srcProfile.shipsObserved || {})) {
          merged.shipsObserved = { ...merged.shipsObserved, [key]: ((merged.shipsObserved || {})[key] || 0) + (count as number) };
        }
        const newProfiles = { ...profiles, [targetName]: merged };
        delete newProfiles[sourceName];
        return {
          matches: newMatches, pilotRegistry: newRegistry, favorites: newFavorites,
          pilotNotes: newNotes, playerIdMap: newIdMap, playerProfiles: newProfiles, mergeHistory, lastActivity: Date.now()
        };
      } else if (srcProfile) {
        const newProfiles = { ...profiles, [targetName]: { ...srcProfile, id: targetName, name: targetName } };
        delete newProfiles[sourceName];
        return {
          matches: newMatches, pilotRegistry: newRegistry, favorites: newFavorites,
          pilotNotes: newNotes, playerIdMap: newIdMap, playerProfiles: newProfiles, mergeHistory, lastActivity: Date.now()
        };
      }
    }

    // 6. Clear pending reviews referencing source name
    const pendingReviews = state.pendingReviews || [];
    const newPending = pendingReviews.filter(r => !isSource(r.value));

    return {
      matches: newMatches, pilotRegistry: newRegistry, favorites: newFavorites,
      pilotNotes: newNotes, playerIdMap: newIdMap, pendingReviews: newPending, mergeHistory, lastActivity: Date.now()
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
      playerIdMap: latest.snapshot.playerIdMap,
      pendingReviews: latest.snapshot.pendingReviews,
      mergeHistory: rest,
      lastActivity: Date.now(),
    });
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

  setPlayerIdMap: (playerIdMap) => set({ playerIdMap }),
  updatePlayerIdMapping: (id, name) => set((state) => ({ playerIdMap: { ...state.playerIdMap, [id]: name } })),

  setLastActivity: (lastActivity) => set({ lastActivity }),
});
