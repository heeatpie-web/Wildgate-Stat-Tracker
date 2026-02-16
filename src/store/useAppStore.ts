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
import { SmartCapturesUIState, createSmartCapturesSlice } from './slices/createSmartCapturesSlice';
import { StorageService } from '../utils/storage';
import { createEmptyOcrAliasModel, migrateLegacyOcrCorrections } from '../utils/ocrAliasEngine';

export type AppState = DataSlice & SettingsSlice & UISlice & SmartCapturesUIState & FormSlice & MappingSlice;

let _hydrated = false;

const customStorage: PersistStorage<AppState> = {
  getItem: async (name) => {
    try {
      const data = await StorageService.init();
      // IMPORTANT: flip hydration before returning so setItem() is allowed to persist.
      _hydrated = true;

      if (!data) return null;
      const settings = data.settings || {};
      const legacyOcrCorrections = data.ocrCorrections || {};
      const persistedAliasModel =
        data.ocrAliasModel && typeof data.ocrAliasModel === 'object' && data.ocrAliasModel.version === 1
          ? data.ocrAliasModel
          : migrateLegacyOcrCorrections(legacyOcrCorrections);
      const players = Array.isArray(data.players)
        ? data.players.filter((p: any): p is string => typeof p === 'string' && p.trim().length > 0)
        : [];
      const persistedActiveUser = typeof settings.activeUser === 'string' ? settings.activeUser.trim() : '';
      const matchedActiveUser = persistedActiveUser
        ? players.find(p => p.toLowerCase() === persistedActiveUser.toLowerCase())
        : undefined;
      // Safety: keep active profile aligned with known players to avoid stale/malformed values.
      const resolvedActiveUser = matchedActiveUser || (players.length > 0 ? players[0] : persistedActiveUser);

      // Recovery: reset stale 'processing' ocrState back to 'queued'
      // (OCR was interrupted by app close/crash)
      const recoveredMatches = (data.matches || []).map((m: any) => {
        const recovered = m.ocrState === 'processing' ? { ...m, ocrState: 'queued' } : m;
        if (recovered?.subType === 'Telemetry Draft' && (!recovered.result || recovered.result === 'Draw')) {
          return { ...recovered, result: 'Ongoing' };
        }
        return recovered;
      });

      return {
        state: {
          // Data
          matches: recoveredMatches,
          players,
          pilotRegistry: data.pilotRegistry || [],
          favorites: data.favorites || [],
          pilotNotes: data.pilotNotes || {},
          playerIdMap: data.playerIdMap || {},
          lastActivity: data.lastActivity || Date.now(),
          knownMappings: data.mappings || {},
          uidMappings: data.uidMappings || { players: {}, ships: {}, weapons: {}, equipment: {} },
          uidSeedVersionApplied: data.uidSeedState?.seedVersionApplied ?? null,
          playerProfiles: data.playerProfiles || {},
          ocrCorrections: legacyOcrCorrections,
          ocrAliasModel: persistedAliasModel || createEmptyOcrAliasModel(),
          ocrLearningEvents: Array.isArray(data.ocrLearningEvents) ? data.ocrLearningEvents : [],
          ocrLearningQueue: Array.isArray(data.ocrLearningQueue) ? data.ocrLearningQueue : [],

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
          telemetryPerformanceProfile: settings.telemetryPerformanceProfile || 'balanced',
          enableAutoBackup: settings.autoBackup ?? true,
          startupSmartPreloadEnabled: settings.startupSmartPreloadEnabled ?? true,
          isAlwaysOnTop: settings.alwaysOnTop ?? false,
          overlayStyle: settings.overlayStyle || 'compact',
          visualMode: settings.visualMode || 'dense',
          ocrMode: settings.ocrMode || 'both',
          captureMode: settings.captureMode || 'auto',
          lockOcrTeams: settings.lockOcrTeams || false,
          ocrLearningEnabled: settings.ocrLearningEnabled ?? true,
          ocrAutoApplyMinScore: Number.isFinite(settings.ocrAutoApplyMinScore) ? Number(settings.ocrAutoApplyMinScore) : 0.82,
          ocrAutoApplyMinCount: Number.isFinite(settings.ocrAutoApplyMinCount) ? Math.max(1, Math.round(Number(settings.ocrAutoApplyMinCount))) : 3,
          ocrLearningStrictMode: settings.ocrLearningStrictMode ?? true,
          ocrLearningReviewMode: settings.ocrLearningReviewMode || 'conservative',
          ocrLearningAutoPromoteCount: Number.isFinite(settings.ocrLearningAutoPromoteCount) ? Math.max(1, Math.round(Number(settings.ocrLearningAutoPromoteCount))) : 5,
          ocrLearningQueueEnabled: settings.ocrLearningQueueEnabled ?? true,
          adaptivePreloadEnabled: settings.adaptivePreloadEnabled ?? true,
          adaptivePreloadBudgetMs: Number.isFinite(settings.adaptivePreloadBudgetMs) ? Math.max(200, Math.round(Number(settings.adaptivePreloadBudgetMs))) : 900,
          dashboardPreloadStats: settings.dashboardPreloadStats || {
            analytics: { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
            history: { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
            'smart-captures': { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
            players: { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
            'dev-ocr': { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 },
          },
          ocrThresholdRecommendationMode: settings.ocrThresholdRecommendationMode || 'assisted',
          ocrThresholdHistory: Array.isArray(settings.ocrThresholdHistory) ? settings.ocrThresholdHistory : [],
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
          tutorialCompleted: settings.tutorialCompleted ?? false,
          activeSection: settings.smartCapturesActiveSection || 'capture',
          queueCollapsed: settings.smartCapturesQueueCollapsed ?? false,
          queueOnly: settings.smartCapturesQueueOnly ?? false,
          showResolved: settings.smartCapturesShowResolved ?? false,
          searchQuery: settings.smartCapturesSearchQuery || '',
          sortMode: settings.smartCapturesSortMode || 'newest',

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
          activeUser: resolvedActiveUser || '',
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
      ocrLearningEvents: state.ocrLearningEvents,
      ocrLearningQueue: state.ocrLearningQueue,
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
        telemetryPerformanceProfile: state.telemetryPerformanceProfile,
        autoBackup: state.enableAutoBackup,
        startupSmartPreloadEnabled: state.startupSmartPreloadEnabled,
        alwaysOnTop: state.isAlwaysOnTop,
        overlayStyle: state.overlayStyle,
        visualMode: state.visualMode,
        ocrMode: state.ocrMode,
                captureMode: state.captureMode,
                lockOcrTeams: state.lockOcrTeams,
                ocrLearningEnabled: state.ocrLearningEnabled,
                ocrAutoApplyMinScore: state.ocrAutoApplyMinScore,
                ocrAutoApplyMinCount: state.ocrAutoApplyMinCount,
                ocrLearningStrictMode: state.ocrLearningStrictMode,
                ocrLearningReviewMode: state.ocrLearningReviewMode,
                ocrLearningAutoPromoteCount: state.ocrLearningAutoPromoteCount,
                ocrLearningQueueEnabled: state.ocrLearningQueueEnabled,
                adaptivePreloadEnabled: state.adaptivePreloadEnabled,
                adaptivePreloadBudgetMs: state.adaptivePreloadBudgetMs,
                dashboardPreloadStats: state.dashboardPreloadStats,
                ocrThresholdRecommendationMode: state.ocrThresholdRecommendationMode,
                ocrThresholdHistory: state.ocrThresholdHistory,
                ocrBestGuessThresholds: state.ocrBestGuessThresholds,
                ocrCalibration: state.ocrCalibration,
                tutorialCompleted: state.tutorialCompleted,
                smartCapturesActiveSection: state.activeSection,
                smartCapturesQueueCollapsed: state.queueCollapsed,
                smartCapturesQueueOnly: state.queueOnly,
                smartCapturesShowResolved: state.showResolved,
                smartCapturesSearchQuery: state.searchQuery,
                smartCapturesSortMode: state.sortMode,
        activeUser: state.activeUser
      },
      layouts: state.layouts,
      timelineEvents: state.timelineEvents,
      ocrCorrections: state.ocrCorrections,
      ocrAliasModel: state.ocrAliasModel
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
      ...createSmartCapturesSlice(...a),
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
        telemetryPerformanceProfile: state.telemetryPerformanceProfile,
        enableAutoBackup: state.enableAutoBackup,
        startupSmartPreloadEnabled: state.startupSmartPreloadEnabled,
        isAlwaysOnTop: state.isAlwaysOnTop,
        overlayStyle: state.overlayStyle,
        visualMode: state.visualMode,
        ocrMode: state.ocrMode,
        captureMode: state.captureMode,
        lockOcrTeams: state.lockOcrTeams,
        ocrLearningEnabled: state.ocrLearningEnabled,
        ocrAutoApplyMinScore: state.ocrAutoApplyMinScore,
        ocrAutoApplyMinCount: state.ocrAutoApplyMinCount,
        ocrLearningStrictMode: state.ocrLearningStrictMode,
        ocrLearningReviewMode: state.ocrLearningReviewMode,
        ocrLearningAutoPromoteCount: state.ocrLearningAutoPromoteCount,
        ocrLearningQueueEnabled: state.ocrLearningQueueEnabled,
        adaptivePreloadEnabled: state.adaptivePreloadEnabled,
        adaptivePreloadBudgetMs: state.adaptivePreloadBudgetMs,
        dashboardPreloadStats: state.dashboardPreloadStats,
        ocrThresholdRecommendationMode: state.ocrThresholdRecommendationMode,
        ocrThresholdHistory: state.ocrThresholdHistory,
        ocrBestGuessThresholds: state.ocrBestGuessThresholds,
        ocrCalibration: state.ocrCalibration,
        tutorialCompleted: state.tutorialCompleted,
        activeSection: state.activeSection,
        queueCollapsed: state.queueCollapsed,
        queueOnly: state.queueOnly,
        showResolved: state.showResolved,
        searchQuery: state.searchQuery,
        sortMode: state.sortMode,
        activeUser: state.activeUser,
        layouts: state.layouts,
        timelineEvents: state.timelineEvents,
        ocrCorrections: state.ocrCorrections,
        ocrAliasModel: state.ocrAliasModel,
        ocrLearningEvents: state.ocrLearningEvents,
        ocrLearningQueue: state.ocrLearningQueue
        // sessionTeams removed from persistence to prevent color sticking
      } as any),
    }
  )
);
