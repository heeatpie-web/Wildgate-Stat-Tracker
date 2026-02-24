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
import {
  SettingsSlice,
  createDefaultOcrRegions,
  createSettingsSlice,
  normalizeOcrNameRerouteThreshold,
} from './slices/createSettingsSlice';
import { UISlice, createUISlice } from './slices/createUISlice';
import { FormSlice, createFormSlice } from './slices/createFormSlice';
import { MappingSlice, createMappingSlice } from './slices/createMappingSlice';
import { SmartCapturesUIState, createSmartCapturesSlice } from './slices/createSmartCapturesSlice';
import { StorageService } from '../utils/storage';
import {
  compactAliasModel,
  createEmptyOcrAliasModel,
  migrateLegacyOcrCorrections,
  recordAliasCorrection,
} from '../utils/ocrAliasEngine';
import { normalizeOcrBatchThreshold } from '../utils/ocrBatchActions';
import { sanitizeCalibrationSamples } from '../utils/ocrCalibration';
import { normalizeShipName, type Match } from '../types';

export type AppState = DataSlice & SettingsSlice & UISlice & SmartCapturesUIState & FormSlice & MappingSlice;

let _hydrated = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isMatchRecord = (value: unknown): value is Match => isRecord(value);

const mergeNumberRecord = <T extends object>(base: T, incoming: unknown): T => {
  const next = { ...base } as T;
  if (!isRecord(incoming)) return next;
  (Object.keys(base) as Array<keyof T>).forEach((key) => {
    const value = incoming[String(key)];
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    (next as Record<string, unknown>)[String(key)] = numeric;
  });
  return next;
};

const mergeOcrRegions = (value: unknown) => {
  const defaults = createDefaultOcrRegions();
  if (!isRecord(value)) return defaults;
  return {
    crewHub: {
      leftPanel: mergeNumberRecord(defaults.crewHub.leftPanel, value.crewHub && isRecord(value.crewHub) ? value.crewHub.leftPanel : undefined),
      rightPanel: mergeNumberRecord(defaults.crewHub.rightPanel, value.crewHub && isRecord(value.crewHub) ? value.crewHub.rightPanel : undefined),
      teamHeader: mergeNumberRecord(defaults.crewHub.teamHeader, value.crewHub && isRecord(value.crewHub) ? value.crewHub.teamHeader : undefined),
      enemyRow1TeamName: mergeNumberRecord(defaults.crewHub.enemyRow1TeamName, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyRow1TeamName : undefined),
      enemyRow1Players: mergeNumberRecord(defaults.crewHub.enemyRow1Players, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyRow1Players : undefined),
      enemyRow2TeamName: mergeNumberRecord(defaults.crewHub.enemyRow2TeamName, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyRow2TeamName : undefined),
      enemyRow2Players: mergeNumberRecord(defaults.crewHub.enemyRow2Players, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyRow2Players : undefined),
      enemyRow3TeamName: mergeNumberRecord(defaults.crewHub.enemyRow3TeamName, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyRow3TeamName : undefined),
      enemyRow3Players: mergeNumberRecord(defaults.crewHub.enemyRow3Players, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyRow3Players : undefined),
      enemyRow4TeamName: mergeNumberRecord(defaults.crewHub.enemyRow4TeamName, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyRow4TeamName : undefined),
      enemyRow4Players: mergeNumberRecord(defaults.crewHub.enemyRow4Players, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyRow4Players : undefined),
    },
    mapScreen: {
      yourShip: mergeNumberRecord(defaults.mapScreen.yourShip, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.yourShip : undefined),
      enemyShips: mergeNumberRecord(defaults.mapScreen.enemyShips, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.enemyShips : undefined),
      enemyShips2: mergeNumberRecord(defaults.mapScreen.enemyShips2, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.enemyShips2 : undefined),
      enemyShips3: mergeNumberRecord(defaults.mapScreen.enemyShips3, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.enemyShips3 : undefined),
      enemyShips4: mergeNumberRecord(defaults.mapScreen.enemyShips4, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.enemyShips4 : undefined),
      hazards: mergeNumberRecord(defaults.mapScreen.hazards, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.hazards : undefined),
      players: mergeNumberRecord(defaults.mapScreen.players, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.players : undefined),
    },
  };
};

const normalizeShipKillMap = (kills: unknown): Record<string, number> => {
  if (!isRecord(kills)) return {};
  const normalized: Record<string, number> = {};
  Object.entries(kills).forEach(([shipName, value]) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const normalizedShip = normalizeShipName(shipName);
    if (!normalizedShip) return;
    normalized[normalizedShip] = (normalized[normalizedShip] || 0) + numeric;
  });
  return normalized;
};

const normalizeMatchShips = (match: Match): Match => {
  const normalizedShip = normalizeShipName(match.ship);
  const normalizedLoadoutShip = normalizeShipName(match.loadout?.ship || '');
  const normalizedOpponentTeams = Array.isArray(match.opponentTeams)
    ? match.opponentTeams.map((team) => ({
      ...team,
      shipType: normalizeShipName(team.shipType || '') || team.shipType,
    }))
    : match.opponentTeams;

  return {
    ...match,
    ship: normalizedShip || match.ship,
    loadout: match.loadout ? {
      ...match.loadout,
      ship: normalizedLoadoutShip || match.loadout.ship,
    } : match.loadout,
    kills: normalizeShipKillMap(match.kills),
    opponentTeams: normalizedOpponentTeams,
  };
};

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
        ? data.players.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        : [];
      const persistedActiveUser = typeof settings.activeUser === 'string' ? settings.activeUser.trim() : '';
      const matchedActiveUser = persistedActiveUser
        ? players.find(p => p.toLowerCase() === persistedActiveUser.toLowerCase())
        : undefined;
      // Safety: keep active profile aligned with known players to avoid stale/malformed values.
      const resolvedActiveUser = matchedActiveUser || (players.length > 0 ? players[0] : persistedActiveUser);

      // Recovery: reset stale 'processing' ocrState back to 'queued'
      // (OCR was interrupted by app close/crash)
      const recoveredMatches = (Array.isArray(data.matches) ? data.matches : [])
        .filter(isMatchRecord)
        .map((match) => {
        const recovered = match.ocrState === 'processing' ? { ...match, ocrState: 'queued' as const } : match;
        const withNormalizedShips = normalizeMatchShips(recovered);
        if (recovered.subType === 'Telemetry Draft' && !recovered.result) {
          return { ...withNormalizedShips, result: 'Ongoing' };
        }
        return withNormalizedShips;
      });
      const maxCanonical = recoveredMatches.reduce((acc, match) => {
        const parsed = Number((match as Match).canonicalMatchNumber || 0);
        if (!Number.isInteger(parsed) || parsed <= 0) return acc;
        return Math.max(acc, parsed);
      }, 0);
      const storedNextCanonical = Number(data.storageMeta?.nextCanonicalMatchNumber || 0);
      const nextCanonicalMatchNumber = Number.isInteger(storedNextCanonical) && storedNextCanonical > 0
        ? Math.max(storedNextCanonical, maxCanonical + 1)
        : Math.max(1, maxCanonical + 1);

      return {
        state: {
          // Data
          matches: recoveredMatches,
          nextCanonicalMatchNumber,
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
          teamIdentityCorrections: data.teamIdentityCorrections || {},
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
          tipsEnabled: settings.tipsEnabled ?? true,
          soundEnabled: settings.soundEnabled ?? true,
          language: settings.language || 'en',
          showSessionTimer: settings.showTimer ?? true,
          customBgUrl: settings.bgUrl || '',
          enableAutoLogRecording: settings.autoLog ?? true,
          telemetryPerformanceProfile: settings.telemetryPerformanceProfile || 'balanced',
          enableAutoBackup: settings.autoBackup ?? false,
          startupSmartPreloadEnabled: settings.startupSmartPreloadEnabled ?? true,
          isAlwaysOnTop: settings.alwaysOnTop ?? false,
          overlayStyle: settings.overlayStyle || 'compact',
          visualMode: settings.visualMode || 'dense',
          ocrMode: settings.ocrMode || 'both',
          captureMode: settings.captureMode || 'auto',
          resultOcrFlowMode: settings.resultOcrFlowMode === 'background' ? 'background' : 'prompt',
          lockOcrTeams: settings.lockOcrTeams || false,
          ocrEnhancedNameRecoveryEnabled: settings.ocrEnhancedNameRecoveryEnabled ?? true,
          ocrNameRerouteThreshold: normalizeOcrNameRerouteThreshold(settings.ocrNameRerouteThreshold),
          externalFallbackEnabled: settings.externalFallbackEnabled ?? true,
          externalFallbackThreshold: (() => {
            const rawThreshold = Number(settings.externalFallbackThreshold);
            const normalized = Number.isFinite(rawThreshold)
              ? Math.max(0, Math.min(1, rawThreshold))
              : 0.66;
            // Migrate the previous default (0.72) to the new lower barrier.
            return Math.abs(normalized - 0.72) < 0.000001 ? 0.66 : normalized;
          })(),
          externalOnDetectorDisagreement: settings.externalOnDetectorDisagreement ?? true,
          forceMaxAnalysis: settings.forceMaxAnalysis ?? false,
          ocrLearningEnabled: settings.ocrLearningEnabled ?? true,
          ocrAutoApplyMinScore: Number.isFinite(settings.ocrAutoApplyMinScore) ? Number(settings.ocrAutoApplyMinScore) : 0.83,
          ocrAutoApplyMinCount: Number.isFinite(settings.ocrAutoApplyMinCount) ? Math.max(1, Math.round(Number(settings.ocrAutoApplyMinCount))) : 3,
          ocrLearningStrictMode: settings.ocrLearningStrictMode ?? true,
          ocrLearningReviewMode: settings.ocrLearningReviewMode || 'conservative',
          ocrLearningAutoPromoteCount: Number.isFinite(settings.ocrLearningAutoPromoteCount) ? Math.max(1, Math.round(Number(settings.ocrLearningAutoPromoteCount))) : 3,
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
          ocrCalibrationSamples: sanitizeCalibrationSamples(settings.ocrCalibrationSamples),
          ocrBatchAcceptThreshold: normalizeOcrBatchThreshold(settings.ocrBatchAcceptThreshold),
          ocrRegions: mergeOcrRegions(settings.ocrRegions),
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
                tipsEnabled: state.tipsEnabled,
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
                resultOcrFlowMode: state.resultOcrFlowMode,
                lockOcrTeams: state.lockOcrTeams,
                ocrEnhancedNameRecoveryEnabled: state.ocrEnhancedNameRecoveryEnabled,
                ocrNameRerouteThreshold: state.ocrNameRerouteThreshold,
                externalFallbackEnabled: state.externalFallbackEnabled,
                externalFallbackThreshold: state.externalFallbackThreshold,
                externalOnDetectorDisagreement: state.externalOnDetectorDisagreement,
                forceMaxAnalysis: state.forceMaxAnalysis,
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
                ocrCalibrationSamples: state.ocrCalibrationSamples,
                ocrBatchAcceptThreshold: state.ocrBatchAcceptThreshold,
                ocrRegions: state.ocrRegions,
                tutorialCompleted: state.tutorialCompleted,
                smartCapturesActiveSection: state.activeSection,
                smartCapturesQueueCollapsed: state.queueCollapsed,
                smartCapturesQueueOnly: state.queueOnly,
                smartCapturesShowResolved: state.showResolved,
                smartCapturesSearchQuery: state.searchQuery,
                smartCapturesSortMode: state.sortMode,
        activeUser: state.activeUser
      },
      storageMeta: {
        nextCanonicalMatchNumber: Number.isInteger(Number(state.nextCanonicalMatchNumber))
          ? Math.max(1, Number(state.nextCanonicalMatchNumber))
          : 1,
      },
      layouts: state.layouts,
      timelineEvents: state.timelineEvents,
      ocrCorrections: state.ocrCorrections,
      teamIdentityCorrections: state.teamIdentityCorrections,
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
        nextCanonicalMatchNumber: state.nextCanonicalMatchNumber,
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
        tipsEnabled: state.tipsEnabled,
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
        resultOcrFlowMode: state.resultOcrFlowMode,
        lockOcrTeams: state.lockOcrTeams,
        ocrEnhancedNameRecoveryEnabled: state.ocrEnhancedNameRecoveryEnabled,
        ocrNameRerouteThreshold: state.ocrNameRerouteThreshold,
        externalFallbackEnabled: state.externalFallbackEnabled,
        externalFallbackThreshold: state.externalFallbackThreshold,
        externalOnDetectorDisagreement: state.externalOnDetectorDisagreement,
        forceMaxAnalysis: state.forceMaxAnalysis,
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
        ocrCalibrationSamples: state.ocrCalibrationSamples,
        ocrBatchAcceptThreshold: state.ocrBatchAcceptThreshold,
        ocrRegions: state.ocrRegions,
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
        teamIdentityCorrections: state.teamIdentityCorrections,
        ocrAliasModel: state.ocrAliasModel,
        ocrLearningEvents: state.ocrLearningEvents,
        ocrLearningQueue: state.ocrLearningQueue
        // sessionTeams removed from persistence to prevent color sticking
      } as any),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Migrate ocrCorrections entries → ocrAliasModel (one-time, safe to re-run)
        if (state.ocrCorrections && Object.keys(state.ocrCorrections).length > 0) {
          for (const [rawText, correction] of Object.entries(state.ocrCorrections)) {
            if (correction?.correctedTo && !state.ocrAliasModel?.entries?.[rawText]) {
              state.ocrAliasModel = recordAliasCorrection(
                state.ocrAliasModel || createEmptyOcrAliasModel(),
                {
                  ocrText: rawText,
                  correctedTo: correction.correctedTo,
                  source: correction.source || 'manual_correction',
                  confidenceWeight: correction.confidenceWeight ?? 0.8,
                }
              );
            }
          }
        }

        // Auto-compact alias model: prune single-count entries older than 90 days
        if (state.ocrAliasModel) {
          state.ocrAliasModel = compactAliasModel(state.ocrAliasModel);
        }
      },
    }
  )
);
