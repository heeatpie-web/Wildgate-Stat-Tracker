import { StateCreator } from 'zustand';
import { Match } from '../../types';

export interface DataSlice {
  matches: Match[];
  players: string[];
  pilotRegistry: string[];
  favorites: string[];
  pilotNotes: Record<string, string>;
  lastActivity: number;
  
  setMatches: (matches: Match[]) => void;
  addMatch: (match: Match) => void;
  updateMatch: (updatedMatch: Match) => void;
  deleteMatch: (id: number) => void;
  
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
  
  setLastActivity: (timestamp: number) => void;
}

export const createDataSlice: StateCreator<DataSlice> = (set) => ({
  matches: [],
  players: [],
  pilotRegistry: [],
  favorites: [],
  pilotNotes: {},
  lastActivity: Date.now(),

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

  setPlayers: (players) => set({ players }),
  addPlayer: (name) => set((state) => ({ players: [...state.players, name] })),
  deletePlayer: (name) => set((state) => ({ players: state.players.filter(p => p !== name) })),

  setPilotRegistry: (pilotRegistry) => set({ pilotRegistry }),
  addToRegistry: (name) => set((state) => ({ pilotRegistry: [...state.pilotRegistry, name] })),
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
          teammates: m.teammates.map(t => t === oldName ? newName : t),
          opponents: m.opponents.map(o => o === oldName ? newName : o)
      }));
      
      return { 
          pilotRegistry: newRegistry,
          players: newPlayers,
          favorites: newFavorites,
          pilotNotes: newNotes,
          matches: newMatches
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

  setLastActivity: (lastActivity) => set({ lastActivity }),
});