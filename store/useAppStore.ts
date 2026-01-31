import { create } from 'zustand';
import { persist, PersistStorage } from 'zustand/middleware';
import { DataSlice, createDataSlice } from './slices/createDataSlice';
import { SettingsSlice, createSettingsSlice } from './slices/createSettingsSlice';
import { UISlice, createUISlice } from './slices/createUISlice';
import { FormSlice, createFormSlice } from './slices/createFormSlice';
import { StorageService } from '../utils/storage';

export type AppState = DataSlice & SettingsSlice & UISlice & FormSlice;

const customStorage: PersistStorage<AppState> = {
  getItem: async (name) => {
    const data = await StorageService.init();
    if (!data) return null;
    
    return {
      state: {
        // Data
        matches: data.matches || [],
        players: data.players || [],
        pilotRegistry: data.pilotRegistry || [],
        favorites: data.favorites || [],
        pilotNotes: data.pilotNotes || {},
        lastActivity: data.lastActivity || Date.now(),
        
        // Settings
        appearanceMode: data.settings.mode || 'twilight',
        colorTheme: data.settings.theme || 'ocean',
        customHue: data.settings.hue || '0',
        colorblindMode: data.settings.colorblind || 'none',
        disableAnimations: data.settings.disableAnimations || false,
        language: data.settings.language || 'en',
        showSessionTimer: data.settings.showTimer ?? true,
        customBgUrl: data.settings.bgUrl || '',
        
        // UI
        layouts: (data.layouts && Object.keys(data.layouts).length > 0) ? data.layouts : {
          lg: [
              { i: 'squadron', x: 0, y: 0, w: 6, h: 9 },
              { i: 'roster', x: 6, y: 0, w: 6, h: 9 },
              { i: 'actions', x: 0, y: 9, w: 12, h: 6 },
              { i: 'mission', x: 0, y: 15, w: 12, h: 12 },
              { i: 'analytics', x: 0, y: 27, w: 12, h: 16 },
              { i: 'history', x: 0, y: 43, w: 12, h: 23 }
          ]
        },
        isLoading: false,
        
        // Defaults for non-persisted
        activeMode: 'Artifact Brawl',
        activeUser: data.players && data.players.length > 0 ? data.players[0] : '', // Restore active user if possible
        
        // ... form defaults will be handled by the initial state in slices if undefined here
      } as any, // Cast to any to avoid partial type mismatch during restore
      version: 0
    };
  },
  setItem: async (name, value) => {
    const state = value.state;
    const dbData = {
      matches: state.matches,
      players: state.players,
      pilotRegistry: state.pilotRegistry,
      favorites: state.favorites,
      pilotNotes: state.pilotNotes,
      lastActivity: state.lastActivity,
      settings: {
        mode: state.appearanceMode,
        theme: state.colorTheme,
        hue: state.customHue,
        colorblind: state.colorblindMode,
        disableAnimations: state.disableAnimations,
        language: state.language,
        showTimer: state.showSessionTimer,
        bgUrl: state.customBgUrl
      },
      layouts: state.layouts
    };
    await StorageService.save(dbData);
  },
  removeItem: async (name) => {
    console.warn("Storage removeItem not implemented");
  },
};

export const useAppStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createDataSlice(...a),
      ...createSettingsSlice(...a),
      ...createUISlice(...a),
      ...createFormSlice(...a),
    }),
    {
      name: 'wg_db',
      storage: customStorage,
      partialize: (state) => ({
        matches: state.matches,
        players: state.players,
        pilotRegistry: state.pilotRegistry,
        favorites: state.favorites,
        pilotNotes: state.pilotNotes,
        lastActivity: state.lastActivity,
        appearanceMode: state.appearanceMode,
        colorTheme: state.colorTheme,
        customHue: state.customHue,
        colorblindMode: state.colorblindMode,
        disableAnimations: state.disableAnimations,
        language: state.language,
        showSessionTimer: state.showSessionTimer,
        customBgUrl: state.customBgUrl,
        layouts: state.layouts
      } as any),
    }
  )
);