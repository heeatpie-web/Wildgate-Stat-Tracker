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
import { DataSlice, createDataSlice, normalizeRosterEntryMetaMap } from './slices/createDataSlice';
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
import { sanitizeUnknownLoadout } from '../utils/loadout';
import { normalizeOcrBatchThreshold } from '../utils/ocrBatchActions';
import { sanitizeCalibrationSamples } from '../utils/ocrCalibration';
import { runtimeConfig } from '../config/runtimeConfig';
import { CHARACTERS, SHIPS, normalizeShipName, type Match } from '../types';
import { normalizeSharedUidMappings } from '../services/mappingContract';

export type AppState = DataSlice & SettingsSlice & UISlice & SmartCapturesUIState & FormSlice & MappingSlice;

let _hydrated = false;

const sanitizePersistedCounterMap = (value: unknown): Record<string, number> => {
  if (typeof value !== 'object' || value === null) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, raw]) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return acc;
    acc[key] = Math.max(1, Math.floor(parsed));
    return acc;
  }, {});
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isMatchRecord = (value: unknown): value is Match => isRecord(value);

const resolvePersistedTacticalMapKeybind = (settings: Record<string, unknown>): string => {
  if (typeof settings.autoCaptureTacticalMapKey === 'string') {
    return settings.autoCaptureTacticalMapKey.trim();
  }
  if (typeof settings.tacticalMapKeybind === 'string') {
    return settings.tacticalMapKeybind.trim();
  }
  return '';
};

const resolvePersistedNumber = (
  value: unknown,
  fallback: number,
  {
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
    round = false,
  }: {
    min?: number;
    max?: number;
    round?: boolean;
  } = {},
): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const next = round ? Math.round(numeric) : numeric;
  return Math.max(min, Math.min(max, next));
};

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
  const mergedMapScreen = {
    yourShip: mergeNumberRecord(defaults.mapScreen.yourShip, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.yourShip : undefined),
    enemyShips: mergeNumberRecord(defaults.mapScreen.enemyShips, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.enemyShips : undefined),
    enemyShips2: mergeNumberRecord(defaults.mapScreen.enemyShips2, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.enemyShips2 : undefined),
    enemyShips3: mergeNumberRecord(defaults.mapScreen.enemyShips3, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.enemyShips3 : undefined),
    enemyShips4: mergeNumberRecord(defaults.mapScreen.enemyShips4, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.enemyShips4 : undefined),
    hazards: mergeNumberRecord(defaults.mapScreen.hazards, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.hazards : undefined),
    players: mergeNumberRecord(defaults.mapScreen.players, value.mapScreen && isRecord(value.mapScreen) ? value.mapScreen.players : undefined),
  };
  const looksLikeLegacyBroadEnemyLayout =
    [mergedMapScreen.enemyShips, mergedMapScreen.enemyShips2, mergedMapScreen.enemyShips3, mergedMapScreen.enemyShips4]
      .every((region) => Number(region.xMin) <= 0.61 && Number(region.xMax) >= 0.99)
    && Number(mergedMapScreen.hazards.xMin) <= 0.61
    && Number(mergedMapScreen.hazards.xMax) >= 0.99;
  const normalizedMapScreen = looksLikeLegacyBroadEnemyLayout
    ? {
      ...mergedMapScreen,
      enemyShips: { ...defaults.mapScreen.enemyShips },
      enemyShips2: { ...defaults.mapScreen.enemyShips2 },
      enemyShips3: { ...defaults.mapScreen.enemyShips3 },
      enemyShips4: { ...defaults.mapScreen.enemyShips4 },
      hazards: { ...defaults.mapScreen.hazards },
    }
    : mergedMapScreen;
  return {
    crewHub: {
      leftPanel: mergeNumberRecord(defaults.crewHub.leftPanel, value.crewHub && isRecord(value.crewHub) ? value.crewHub.leftPanel : undefined),
      enemyPanel: mergeNumberRecord(defaults.crewHub.enemyPanel, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyPanel : undefined),
      teamHeader: mergeNumberRecord(defaults.crewHub.teamHeader, value.crewHub && isRecord(value.crewHub) ? value.crewHub.teamHeader : undefined),
      enemyName: mergeNumberRecord(defaults.crewHub.enemyName, value.crewHub && isRecord(value.crewHub) ? value.crewHub.enemyName : undefined),
    },
    mapScreen: normalizedMapScreen,
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

type TelemetryBurstPersistState = Pick<
  AppState,
  'matches' | 'lastActivity' | 'activeHero' | 'activeShip' | 'activeWeapons' | 'characterLoadouts' | 'currentLoadout'
>;

const TELEMETRY_BURST_ALLOWED_KEYS = new Set<keyof TelemetryBurstPersistState>([
  'matches',
  'lastActivity',
  'activeHero',
  'activeShip',
  'activeWeapons',
  'characterLoadouts',
  'currentLoadout',
]);

let lastPersistHeuristicState: TelemetryBurstPersistState | null = null;

const captureTelemetryBurstPersistState = (state: AppState): TelemetryBurstPersistState => ({
  matches: state.matches,
  lastActivity: state.lastActivity,
  activeHero: state.activeHero,
  activeShip: state.activeShip,
  activeWeapons: state.activeWeapons,
  characterLoadouts: state.characterLoadouts,
  currentLoadout: state.currentLoadout,
});

const didOnlyTelemetryDraftMatchesChange = (prevMatches: Match[], nextMatches: Match[]): boolean => {
  if (prevMatches === nextMatches) return false;

  const prevById = new Map(prevMatches.map((match) => [match.id, match]));
  const nextById = new Map(nextMatches.map((match) => [match.id, match]));
  const candidateIds = new Set<number>([
    ...prevById.keys(),
    ...nextById.keys(),
  ]);

  let sawChange = false;
  for (const matchId of candidateIds) {
    const previous = prevById.get(matchId);
    const next = nextById.get(matchId);
    if (previous === next) continue;
    sawChange = true;
    const changedMatch = next || previous;
    if (!changedMatch || changedMatch.subType !== 'Telemetry Draft') {
      return false;
    }
  }

  return sawChange;
};

const shouldUseTelemetryBurstDebounce = (
  previous: TelemetryBurstPersistState | null,
  next: TelemetryBurstPersistState,
): boolean => {
  if (!previous) return false;

  const changedKeys = (Object.keys(next) as Array<keyof TelemetryBurstPersistState>)
    .filter((key) => !Object.is(previous[key], next[key]));

  if (changedKeys.length === 0) return false;
  if (!changedKeys.every((key) => TELEMETRY_BURST_ALLOWED_KEYS.has(key))) return false;

  const changedMatches = changedKeys.includes('matches');
  const changedLiveSessionOnly = changedKeys.every((key) => key !== 'matches');
  if (changedLiveSessionOnly) return true;
  if (!changedMatches) return false;

  return didOnlyTelemetryDraftMatchesChange(previous.matches, next.matches);
};

const buildStorageDataFromState = (state: AppState) => ({
  matches: state.matches,
  players: state.players,
  pilotRegistry: state.pilotRegistry,
  rosterEntryMeta: state.rosterEntryMeta,
  favorites: state.favorites,
  pilotNotes: state.pilotNotes,
  pilotAliases: state.pilotAliases,
  playerIdMap: state.playerIdMap,
  lastActivity: state.lastActivity,
  mappings: state.knownMappings,
  uidMappings: state.uidMappings,
  uidSeedState: { seedVersionApplied: state.uidSeedVersionApplied },
  playerProfiles: state.playerProfiles,
  teammateIdentityRecords: state.teammateIdentityRecords,
  ocrLearningEvents: state.ocrLearningEvents,
  ocrLearningQueue: state.ocrLearningQueue,
  pendingReviews: state.pendingReviews,
  dismissedRosterMergePairKeys: state.dismissedRosterMergePairKeys,
  dismissedRosterCandidateKeys: state.dismissedRosterCandidateKeys,
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
    tipLibraryIndex: state.tipLibraryIndex,
    language: state.language,
    showTimer: state.showSessionTimer,
    lifecycleTrackingPaused: state.lifecycleTrackingPaused,
    bgUrl: state.customBgUrl,
    autoLog: state.enableAutoLogRecording,
    telemetryPerformanceProfile: state.telemetryPerformanceProfile,
    adaptiveTelemetryPollingEnabled: state.adaptiveTelemetryPollingEnabled,
    telemetryDefaultsVersion: Number.isFinite(state.telemetryDefaultsVersion)
      ? Math.max(1, Math.floor(Number(state.telemetryDefaultsVersion)))
      : 1,
    autoBackup: state.enableAutoBackup,
    startupSmartPreloadEnabled: state.startupSmartPreloadEnabled,
    alwaysOnTop: state.isAlwaysOnTop,
    overlayStyle: state.overlayStyle,
    visualMode: state.visualMode,
    ocrMode: state.ocrMode,
    captureMode: state.captureMode,
    resultOcrFlowMode: state.resultOcrFlowMode,
    ocrAutoOpenAfterRerun: state.ocrAutoOpenAfterRerun,
    autoSequenceOnCapture: state.autoSequenceOnCapture,
    autoCaptureSendKeypresses: state.autoCaptureSendKeypresses,
    autoCaptureWaitMultiplier: state.autoCaptureWaitMultiplier,
    autoCaptureTacticalMapKey: state.tacticalMapKeybind,
    tacticalMapKeybind: state.tacticalMapKeybind,
    holdTacticalMapKey: state.holdTacticalMapKey,
    gamepadModeEnabled: state.gamepadModeEnabled,
    autoPopulateRosterOnSave: state.autoPopulateRosterOnSave,
    fullAutoEnabled: state.fullAutoEnabled,
    lockOcrTeams: state.lockOcrTeams,
    ocrEnhancedNameRecoveryEnabled: state.ocrEnhancedNameRecoveryEnabled,
    ocrNameRerouteThreshold: state.ocrNameRerouteThreshold,
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
    activeUser: state.activeUser,
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
  playerEncounterRoleCorrections: state.playerEncounterRoleCorrections,
  ocrAliasModel: state.ocrAliasModel,
  liveSession: {
    activeHero: state.activeHero,
    activeShip: state.activeShip,
    activeWeapons: state.activeWeapons,
    characterLoadouts: state.characterLoadouts,
    currentLoadout: state.currentLoadout,
  },
});

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
      const liveSession = typeof data.liveSession === 'object' && data.liveSession !== null
        ? data.liveSession as Record<string, unknown>
        : {};
      const persistedTelemetryDefaultsVersionRaw = Number(settings.telemetryDefaultsVersion ?? 0);
      const persistedTelemetryDefaultsVersion = Number.isFinite(persistedTelemetryDefaultsVersionRaw)
        ? Math.max(0, Math.floor(persistedTelemetryDefaultsVersionRaw))
        : 0;
      const shouldApplyTelemetryBaselineV1 = persistedTelemetryDefaultsVersion < 1;

      const hydratedState = {
        state: {
          // Data
          matches: recoveredMatches,
          nextCanonicalMatchNumber,
          players,
          pilotRegistry: data.pilotRegistry || [],
          rosterEntryMeta: normalizeRosterEntryMetaMap(data.pilotRegistry || [], data.rosterEntryMeta),
          favorites: data.favorites || [],
          pilotNotes: data.pilotNotes || {},
          pilotAliases: data.pilotAliases || {},
          playerIdMap: data.playerIdMap || {},
          lastActivity: data.lastActivity || Date.now(),
          knownMappings: data.mappings || {},
          uidMappings: normalizeSharedUidMappings(data.uidMappings),
          uidSeedVersionApplied: data.uidSeedState?.seedVersionApplied ?? null,
          playerProfiles: data.playerProfiles || {},
          teammateIdentityRecords: data.teammateIdentityRecords || {},
          ocrCorrections: legacyOcrCorrections,
          teamIdentityCorrections: data.teamIdentityCorrections || {},
          playerEncounterRoleCorrections: data.playerEncounterRoleCorrections || {},
          ocrAliasModel: persistedAliasModel || createEmptyOcrAliasModel(),
          ocrLearningEvents: Array.isArray(data.ocrLearningEvents) ? data.ocrLearningEvents : [],
          ocrLearningQueue: Array.isArray(data.ocrLearningQueue) ? data.ocrLearningQueue : [],
          pendingReviews: Array.isArray(data.pendingReviews) ? data.pendingReviews : [],
          dismissedRosterMergePairKeys: Array.isArray(data.dismissedRosterMergePairKeys) ? data.dismissedRosterMergePairKeys : [],
          dismissedRosterCandidateKeys: Array.isArray(data.dismissedRosterCandidateKeys) ? data.dismissedRosterCandidateKeys : [],

          // Settings
          appearanceMode: settings.mode || 'twilight',
          colorTheme: settings.theme || 'ocean',
          customHue: settings.hue || '0',
          colorblindMode: settings.colorblind || 'none',
          disableAnimations: settings.disableAnimations || false,
          performanceMode: settings.performanceMode || false,
          showSmartCaptureInHeader: settings.showSmartCaptureInHeader ?? true,
          tipsEnabled: settings.tipsEnabled ?? true,
          tipLibraryIndex: Number.isFinite(settings.tipLibraryIndex) ? Math.max(0, Math.floor(Number(settings.tipLibraryIndex))) : 0,
          soundEnabled: settings.soundEnabled ?? true,
          language: settings.language || 'en',
          showSessionTimer: settings.showTimer ?? true,
          lifecycleTrackingPaused: settings.lifecycleTrackingPaused ?? false,
          customBgUrl: settings.bgUrl || '',
          enableAutoLogRecording: settings.autoLog ?? true,
          telemetryPerformanceProfile: shouldApplyTelemetryBaselineV1
            ? 'balanced'
            : (settings.telemetryPerformanceProfile || 'balanced'),
          adaptiveTelemetryPollingEnabled: shouldApplyTelemetryBaselineV1
            ? false
            : (settings.adaptiveTelemetryPollingEnabled ?? false),
          telemetryDefaultsVersion: Math.max(1, persistedTelemetryDefaultsVersion),
          enableAutoBackup: settings.autoBackup ?? true,
          startupSmartPreloadEnabled: settings.startupSmartPreloadEnabled ?? true,
          isAlwaysOnTop: settings.alwaysOnTop ?? false,
          overlayStyle: settings.overlayStyle || 'compact',
          visualMode: settings.visualMode || 'dense',
          ocrMode: 'local',
          captureMode: settings.captureMode || 'deferred',
          resultOcrFlowMode: settings.resultOcrFlowMode === 'prompt' ? 'prompt' : 'background',
          ocrAutoOpenAfterRerun: settings.ocrAutoOpenAfterRerun ?? false,
          autoSequenceOnCapture: settings.autoSequenceOnCapture ?? true,
          autoCaptureSendKeypresses: settings.autoCaptureSendKeypresses ?? true,
          autoCaptureWaitMultiplier: Number.isFinite(settings.autoCaptureWaitMultiplier)
            ? Math.max(0.5, Math.min(3, Number(settings.autoCaptureWaitMultiplier)))
            : 0.5,
          tacticalMapKeybind: resolvePersistedTacticalMapKeybind(settings),
          holdTacticalMapKey: settings.holdTacticalMapKey === true,
          gamepadModeEnabled: settings.gamepadModeEnabled === true,
          autoPopulateRosterOnSave: settings.autoPopulateRosterOnSave ?? true,
          fullAutoEnabled: settings.fullAutoEnabled === false ? false : true,
          lockOcrTeams: settings.lockOcrTeams || false,
          ocrEnhancedNameRecoveryEnabled: settings.ocrEnhancedNameRecoveryEnabled ?? true,
          ocrNameRerouteThreshold: normalizeOcrNameRerouteThreshold(settings.ocrNameRerouteThreshold),
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
          activeHero: typeof liveSession.activeHero === 'string' ? liveSession.activeHero : CHARACTERS[0],
          activeShip: typeof liveSession.activeShip === 'string' ? liveSession.activeShip : SHIPS[0],
          activeWeapons: sanitizePersistedCounterMap(liveSession.activeWeapons),
          characterLoadouts: typeof liveSession.characterLoadouts === 'object' && liveSession.characterLoadouts !== null
            ? Object.entries(liveSession.characterLoadouts as Record<string, unknown>).reduce<Record<string, Record<string, number>>>((acc, [hero, loadout]) => {
              acc[hero] = sanitizePersistedCounterMap(loadout);
              return acc;
            }, {})
            : {},
          currentLoadout: sanitizeUnknownLoadout(liveSession.currentLoadout),

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
      lastPersistHeuristicState = captureTelemetryBurstPersistState(hydratedState.state as AppState);
      return hydratedState;
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
    const state = value.state as AppState;
    const nextHeuristicState = captureTelemetryBurstPersistState(state);
    const debounceMs = shouldUseTelemetryBurstDebounce(lastPersistHeuristicState, nextHeuristicState)
      ? runtimeConfig.storage.telemetryBurstSaveDebounceMs
      : runtimeConfig.storage.saveDebounceMs;
    lastPersistHeuristicState = nextHeuristicState;

    await StorageService.save(() => buildStorageDataFromState(state), { debounceMs });
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
        rosterEntryMeta: state.rosterEntryMeta,
        favorites: state.favorites,
        pilotNotes: state.pilotNotes,
        playerIdMap: state.playerIdMap,
        lastActivity: state.lastActivity,
        knownMappings: state.knownMappings,
        uidMappings: state.uidMappings,
        uidSeedVersionApplied: state.uidSeedVersionApplied,
        playerProfiles: state.playerProfiles,
        teammateIdentityRecords: state.teammateIdentityRecords,
        appearanceMode: state.appearanceMode,
        colorTheme: state.colorTheme,
        customHue: state.customHue,
        colorblindMode: state.colorblindMode,
        disableAnimations: state.disableAnimations,
        performanceMode: state.performanceMode,
        tipsEnabled: state.tipsEnabled,
        tipLibraryIndex: state.tipLibraryIndex,
        soundEnabled: state.soundEnabled,
        language: state.language,
        showSessionTimer: state.showSessionTimer,
        lifecycleTrackingPaused: state.lifecycleTrackingPaused,
        customBgUrl: state.customBgUrl,
        enableAutoLogRecording: state.enableAutoLogRecording,
        telemetryPerformanceProfile: state.telemetryPerformanceProfile,
        adaptiveTelemetryPollingEnabled: state.adaptiveTelemetryPollingEnabled,
        telemetryDefaultsVersion: state.telemetryDefaultsVersion,
        enableAutoBackup: state.enableAutoBackup,
        startupSmartPreloadEnabled: state.startupSmartPreloadEnabled,
        isAlwaysOnTop: state.isAlwaysOnTop,
        overlayStyle: state.overlayStyle,
        visualMode: state.visualMode,
        ocrMode: state.ocrMode,
        captureMode: state.captureMode,
        resultOcrFlowMode: state.resultOcrFlowMode,
        ocrAutoOpenAfterRerun: state.ocrAutoOpenAfterRerun,
        autoSequenceOnCapture: state.autoSequenceOnCapture,
        autoCaptureSendKeypresses: state.autoCaptureSendKeypresses,
        autoCaptureWaitMultiplier: state.autoCaptureWaitMultiplier,
        tacticalMapKeybind: state.tacticalMapKeybind,
        holdTacticalMapKey: state.holdTacticalMapKey,
        gamepadModeEnabled: state.gamepadModeEnabled,
        autoPopulateRosterOnSave: state.autoPopulateRosterOnSave,
        fullAutoEnabled: state.fullAutoEnabled,
        lockOcrTeams: state.lockOcrTeams,
        ocrEnhancedNameRecoveryEnabled: state.ocrEnhancedNameRecoveryEnabled,
        ocrNameRerouteThreshold: state.ocrNameRerouteThreshold,
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
        activeHero: state.activeHero,
        activeShip: state.activeShip,
        activeWeapons: state.activeWeapons,
        characterLoadouts: state.characterLoadouts,
        currentLoadout: state.currentLoadout,
        layouts: state.layouts,
        timelineEvents: state.timelineEvents,
        ocrCorrections: state.ocrCorrections,
        teamIdentityCorrections: state.teamIdentityCorrections,
        playerEncounterRoleCorrections: state.playerEncounterRoleCorrections,
        ocrAliasModel: state.ocrAliasModel,
        ocrLearningEvents: state.ocrLearningEvents,
        ocrLearningQueue: state.ocrLearningQueue,
        pendingReviews: state.pendingReviews,
        dismissedRosterMergePairKeys: state.dismissedRosterMergePairKeys,
        dismissedRosterCandidateKeys: state.dismissedRosterCandidateKeys
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

export const __test__ = {
  didOnlyTelemetryDraftMatchesChange,
  shouldUseTelemetryBurstDebounce,
};
