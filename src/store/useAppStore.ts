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

let _hydrated = false;

const customStorage: PersistStorage<AppState> = {
  getItem: async (name) => {
    try {
      const data = await StorageService.init();
      // IMPORTANT: flip hydration before returning so setItem() is allowed to persist.
      _hydrated = true;

      if (!data) return null;
      const settings = data.settings || {};

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
          uidMappings: data.uidMappings || { players: {}, ships: {}, weapons: {}, equipment: {} },
          uidSeedVersionApplied: data.uidSeedState?.seedVersionApplied ?? null,
          playerProfiles: data.playerProfiles || {},
          ocrCorrections: data.ocrCorrections || {},

          // Settings
          appearanceMode: settings.mode || 'twilight',
          colorTheme: settings.theme || 'ocean',
          customHue: settings.hue || '0',
          colorblindMode: settings.colorblind || 'none',
          disableAnimations: settings.disableAnimations || false,
          performanceMode: settings.performanceMode || false,
          showSmartCaptureInHeader: settings.showSmartCaptureInHeader ?? true,
          soundEnabled: settings.soundEnabled ?? true,
          language: settings.language || 'en',
          showSessionTimer: settings.showTimer ?? true,
          customBgUrl: settings.bgUrl || '',
          enableAutoLogRecording: settings.autoLog ?? true,
          enableAutoBackup: settings.autoBackup ?? true,
          isAlwaysOnTop: settings.alwaysOnTop ?? false,
          overlayStyle: settings.overlayStyle || 'compact',
          visualMode: settings.visualMode || 'dense',
          uiStyle: settings.uiStyle || 'md3',
          ocrMode: settings.ocrMode || 'both',
          captureMode: settings.captureMode || 'auto',
          lockOcrTeams: settings.lockOcrTeams || false,
          ocrBestGuessThresholds: settings.ocrBestGuessThresholds || {
            cloud: { player: 80, mod: 82, ship: 62 },
            merged: { player: 78, mod: 80, ship: 60 },
            local: { player: 84, mod: 87, ship: 68 },
            lowConfidenceBump: 4,
          },
          ocrCalibration: settings.ocrCalibration || {
            sampleOffsetX: 0,
            sampleOffsetY: 0,
            sampleWidthAdjust: 0,
            sampleHeightAdjust: 0,
            saturationMin: 35,
            luminanceMin: 30,
          },

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
              { i: 'history', x: 0, y: 43, w: 12, h: 23 },
            ],
          },
          isLoading: false,

          // Defaults for non-persisted
          activeMode: 'Artifact Brawl',
          activeUser: data.settings?.activeUser || (data.players && data.players.length > 0 ? data.players[0] : ''),
          detectedUnknowns: {}, // Do not persist unknowns

        } as any,
        version: 0,
      };
    } catch (e) {
      _hydrated = true;
      console.error('[store] Failed to hydrate persisted state:', e);
      return null;
    }
  },
  setItem: async (name, value) => {
    // Guard: never persist until hydration has completed.
    // Without this, Zustand can save the initial empty state before
    // getItem resolves, overwriting real data on disk.
    if (!_hydrated) return;
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
      uidMappings: state.uidMappings,
      uidSeedState: { seedVersionApplied: state.uidSeedVersionApplied },
      playerProfiles: state.playerProfiles,
      settings: {
        mode: state.appearanceMode,
        theme: state.colorTheme,
        hue: state.customHue,
        colorblind: state.colorblindMode,
                disableAnimations: state.disableAnimations,
                performanceMode: state.performanceMode,
                soundEnabled: state.soundEnabled,
                showSmartCaptureInHeader: state.showSmartCaptureInHeader,
        language: state.language,
        showTimer: state.showSessionTimer,
        bgUrl: state.customBgUrl,
        autoLog: state.enableAutoLogRecording,
        autoBackup: state.enableAutoBackup,
        alwaysOnTop: state.isAlwaysOnTop,
        overlayStyle: state.overlayStyle,
        visualMode: state.visualMode,
        uiStyle: state.uiStyle,
        ocrMode: state.ocrMode,
                captureMode: state.captureMode,
                lockOcrTeams: state.lockOcrTeams,
                ocrBestGuessThresholds: state.ocrBestGuessThresholds,
                ocrCalibration: state.ocrCalibration,
        activeUser: state.activeUser
      },
      layouts: state.layouts,
      timelineEvents: state.timelineEvents,
      ocrCorrections: state.ocrCorrections
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
        uidMappings: state.uidMappings,
        uidSeedVersionApplied: state.uidSeedVersionApplied,
        playerProfiles: state.playerProfiles,
        appearanceMode: state.appearanceMode,
        colorTheme: state.colorTheme,
        customHue: state.customHue,
        colorblindMode: state.colorblindMode,
        disableAnimations: state.disableAnimations,
        performanceMode: state.performanceMode,
        soundEnabled: state.soundEnabled,
        language: state.language,
        showSessionTimer: state.showSessionTimer,
        customBgUrl: state.customBgUrl,
        enableAutoLogRecording: state.enableAutoLogRecording,
        enableAutoBackup: state.enableAutoBackup,
        isAlwaysOnTop: state.isAlwaysOnTop,
        overlayStyle: state.overlayStyle,
        visualMode: state.visualMode,
        uiStyle: state.uiStyle,
        ocrMode: state.ocrMode,
        captureMode: state.captureMode,
        lockOcrTeams: state.lockOcrTeams,
        ocrBestGuessThresholds: state.ocrBestGuessThresholds,
        ocrCalibration: state.ocrCalibration,
        activeUser: state.activeUser,
        layouts: state.layouts,
        timelineEvents: state.timelineEvents,
        ocrCorrections: state.ocrCorrections
        // sessionTeams removed from persistence to prevent color sticking
      } as any),
    }
  )
);
