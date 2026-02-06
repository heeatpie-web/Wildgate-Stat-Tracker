/**
 * @module useAppStore
 * Central Zustand store combining all slices. Persisted to disk via a custom
 * storage adapter that routes through Electron IPC (StorageService).
 *
 * Slice composition order matters — later slices overwrite earlier ones
 * when field names collide (see fix-codebase-issues plan for details).
 */
import { create } from 'zustand';
import { persist, PersistStorage } from 'zustand/middleware';
import { DataSlice, createDataSlice } from './slices/createDataSlice';
import { SettingsSlice, createSettingsSlice } from './slices/createSettingsSlice';
import { UISlice, createUISlice } from './slices/createUISlice';
import { FormSlice, createFormSlice } from './slices/createFormSlice';
import { MappingSlice, createMappingSlice } from './slices/createMappingSlice';
import { StorageService } from '../utils/storage';

export type AppState = DataSlice & SettingsSlice & UISlice & FormSlice & MappingSlice;

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
        playerIdMap: data.playerIdMap || {},
        lastActivity: data.lastActivity || Date.now(),
        knownMappings: data.mappings || {},
        playerProfiles: data.playerProfiles || {},

        // Settings
        appearanceMode: data.settings.mode || 'twilight',
        colorTheme: data.settings.theme || 'ocean',
        customHue: data.settings.hue || '0',
        colorblindMode: data.settings.colorblind || 'none',
        disableAnimations: data.settings.disableAnimations || false,
        soundEnabled: data.settings.soundEnabled ?? true,
        language: data.settings.language || 'en',
        showSessionTimer: data.settings.showTimer ?? true,
        customBgUrl: data.settings.bgUrl || '',
        enableAutoLogRecording: data.settings.autoLog ?? true,
        isAlwaysOnTop: data.settings.alwaysOnTop ?? false,
        overlayStyle: data.settings.overlayStyle || 'compact',

        // LIVE SESSION (Temporary persistence allowed for refresh safety)
        timelineEvents: data.timelineEvents || [],

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
        activeUser: data.players && data.players.length > 0 ? data.players[0] : '',
        detectedUnknowns: {}, // Do not persist unknowns

      } as any,
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
      playerIdMap: state.playerIdMap,
      lastActivity: state.lastActivity,
      mappings: state.knownMappings,
      playerProfiles: state.playerProfiles,
      settings: {
        mode: state.appearanceMode,
        theme: state.colorTheme,
        hue: state.customHue,
        colorblind: state.colorblindMode,
        disableAnimations: state.disableAnimations,
        soundEnabled: state.soundEnabled,
        language: state.language,
        showTimer: state.showSessionTimer,
        bgUrl: state.customBgUrl,
        autoLog: state.enableAutoLogRecording,
        alwaysOnTop: state.isAlwaysOnTop,
        overlayStyle: state.overlayStyle
      },
      layouts: state.layouts,
      timelineEvents: state.timelineEvents
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
      ...createMappingSlice(...a),
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
        playerIdMap: state.playerIdMap,
        lastActivity: state.lastActivity,
        knownMappings: state.knownMappings,
        playerProfiles: state.playerProfiles,
        appearanceMode: state.appearanceMode,
        colorTheme: state.colorTheme,
        customHue: state.customHue,
        colorblindMode: state.colorblindMode,
        disableAnimations: state.disableAnimations,
        soundEnabled: state.soundEnabled,
        language: state.language,
        showSessionTimer: state.showSessionTimer,
        customBgUrl: state.customBgUrl,
        enableAutoLogRecording: state.enableAutoLogRecording,
        isAlwaysOnTop: state.isAlwaysOnTop,
        overlayStyle: state.overlayStyle,
        layouts: state.layouts,
        timelineEvents: state.timelineEvents
        // sessionTeams removed from persistence to prevent color sticking
      } as any),
    }
  )
);