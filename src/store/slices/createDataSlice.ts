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

/**
 * Origin of a data value. Priority: manual (3) > telemetry (2) > ocr (1).
 * Used by sourced setters (setTimeMin, setTimeSec, setDamageTaken, etc.).
 */
export type DataSource = 'manual' | 'telemetry' | 'ocr';

/** Returns numeric priority for a DataSource. Higher = more authoritative. */
const getPriority = (source: DataSource = 'manual'): number => {
  switch (source) {
    case 'manual': return 3;
    case 'telemetry': return 2;
    case 'ocr': return 1;
    default: return 0;
  }
};

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
  setDamageTaken: (v: string) => void; // Keeping simple for now or update if needed

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
  timelineEvents: any[];
  setTimelineEvents: (events: any[]) => void;
  addTimelineEvent: (event: any) => void;

  pendingReviews: any[];
  addPendingReview: (review: any) => void;
  removePendingReview: (id: string) => void;
  clearPendingReviews: () => void;

  setLastActivity: (timestamp: number) => void;
}

export const createDataSlice: StateCreator<DataSlice> = (set) => ({
  matches: [],
  players: [],
  pilotRegistry: [],
  favorites: [],
  pilotNotes: {},
  playerIdMap: {},
  lastActivity: Date.now(),
  pendingKilledBy: "",
  setPendingKilledBy: (s) => set({ pendingKilledBy: s }),
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
  setCurrentLoadout: (l) => set({ currentLoadout: l }),

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
  setDamageTaken: (v) => set({ damageTaken: v }),
  timelineEvents: [],
  setTimelineEvents: (events) => set({ timelineEvents: events }),
  addTimelineEvent: (event) => set((state) => ({ timelineEvents: [event, ...state.timelineEvents] })),

  pendingReviews: [],
  addPendingReview: (review) => set((state) => ({ pendingReviews: [...state.pendingReviews, review] })),
  removePendingReview: (id) => set((state) => ({ pendingReviews: state.pendingReviews.filter(r => r.id !== id) })),
  clearPendingReviews: () => set({ pendingReviews: [] }),

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
    // 1. Update Matches
    const newMatches = state.matches.map(m => ({
      ...m,
      player: m.player === sourceName ? targetName : m.player,
      teammates: (m.teammates || []).map(t => t === sourceName ? targetName : t),
      opponents: (m.opponents || []).map(o => o === sourceName ? targetName : o)
    }));

    // 2. Update Registry
    const newRegistry = state.pilotRegistry.filter(p => p !== sourceName);
    if (!newRegistry.includes(targetName)) newRegistry.push(targetName);

    // 3. Update Favorites & Notes
    const newFavorites = state.favorites.filter(f => f !== sourceName);
    const newNotes = { ...state.pilotNotes };
    if (newNotes[sourceName]) {
      newNotes[targetName] = (newNotes[targetName] ? newNotes[targetName] + "\n" : "") + newNotes[sourceName];
      delete newNotes[sourceName];
    }

    // 4. Update ID Map (Critical for future auto-detection)
    const newIdMap = { ...state.playerIdMap };
    Object.entries(newIdMap).forEach(([id, name]) => {
      if (name === sourceName) newIdMap[id] = targetName;
    });

    return {
      matches: newMatches,
      pilotRegistry: newRegistry,
      favorites: newFavorites,
      pilotNotes: newNotes,
      playerIdMap: newIdMap,
      lastActivity: Date.now()
    };
  }),

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