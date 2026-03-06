import { getElectronAPI } from './electronAPI';
import type { Match, UidMappingsContract } from '../types';
import type { TimelineEvent } from '../store/slices/createDataSlice';
import type { OcrCorrection, PlayerProfile, TeamIdentityCorrection } from '../store/slices/createMappingSlice';
import type { OcrAliasModel, OcrLearningEvent, OcrLearningQueueItem } from './ocrAliasEngine';
import { normalizeSharedUidMappings } from '../services/mappingContract';
import Logger from './logger';
import { runtimeConfig } from '../config/runtimeConfig';

type StringMap = Record<string, string>;

interface StorageSettings extends Record<string, unknown> {
  autoBackup?: boolean;
}

type StorageLayoutItem = Record<string, unknown>;
type StorageLayouts = Record<string, StorageLayoutItem[]>;

interface StorageMeta {
  mappingsToUidMigratedAt?: number;
  legacyV13MigratedAt?: number;
  nextCanonicalMatchNumber?: number;
  artifactCanonicalMigrationV1At?: number;
}

type UidMappings = ReturnType<typeof normalizeSharedUidMappings>;

interface UidSeedState {
  seedVersionApplied: number | null;
}

interface StorageLiveSession {
  activeHero?: string;
  activeShip?: string;
  activeWeapons?: Record<string, number>;
  characterLoadouts?: Record<string, Record<string, number>>;
  currentLoadout?: unknown;
}

export interface StorageData {
  matches: Match[];
  players: string[];
  pilotRegistry: string[];
  favorites: string[];
  pilotNotes: Record<string, string>;
  pilotAliases?: Record<string, string[]>;
  playerIdMap?: StringMap;
  ocrCorrections?: Record<string, OcrCorrection>;
  teamIdentityCorrections?: Record<string, TeamIdentityCorrection>;
  ocrAliasModel?: OcrAliasModel;
  ocrLearningEvents?: OcrLearningEvent[];
  ocrLearningQueue?: OcrLearningQueueItem[];
  settings: StorageSettings;
  layouts: StorageLayouts;
  lastActivity: number;
  mappings?: StringMap;
  playerProfiles?: Record<string, PlayerProfile>;
  timelineEvents?: TimelineEvent[];
  uidMappings?: UidMappingsContract;
  uidSeedState?: UidSeedState;
  storageMeta?: StorageMeta;
  liveSession?: StorageLiveSession;
}

const LEGACY_KEYS = [
  'wg_v13_matches', 'wg_v13_players', 'wg_v13_pilot_registry',
  'wg_v13_favorites', 'wg_v13_pilot_notes', 'wg_mode', 'wg_theme_accent',
  'wg_custom_hue', 'wg_colorblind', 'wg_disable_animations',
  'wg_language', 'wg_show_session_timer', 'wg_custom_bg_url',
  'wg_layouts_v11', 'wg_last_activity'
];
const LEGACY_V13_CHECK_KEY = 'wg_v13_migration_checked_v1';

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingResolvers: Array<(ok: boolean) => void> = [];
let lastData: StorageData | null = null;
let lastPersistedVersion = 0;
let pendingVersion = 0;
let lastAutoBackupCount: number | null = null;
let lifecycleGuardsBound = false;
let intervalFlushHandle: ReturnType<typeof setInterval> | number | null = null;

const hasUnsavedChanges = () => pendingVersion > lastPersistedVersion;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseJsonSafely = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const hasLocalStorage = (): boolean =>
  typeof localStorage !== 'undefined';

const shouldCheckLegacyV13 = (): boolean =>
  hasLocalStorage() && localStorage.getItem(LEGACY_V13_CHECK_KEY) !== '1';

const markLegacyV13Checked = () => {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(LEGACY_V13_CHECK_KEY, '1');
  } catch {
    // Non-fatal: migration checks are an optimization.
  }
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const toStringMap = (value: unknown): StringMap => {
  if (!isRecord(value)) return {};
  const map: StringMap = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (typeof raw === 'string') map[key] = raw;
  });
  return map;
};

const toLayouts = (value: unknown): StorageLayouts => {
  if (!isRecord(value)) return {};
  const layouts: StorageLayouts = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!Array.isArray(raw)) return;
    layouts[key] = raw.filter((item): item is StorageLayoutItem => isRecord(item));
  });
  return layouts;
};

const toTimelineEvents = (value: unknown): TimelineEvent[] =>
  Array.isArray(value) ? value.filter((item): item is TimelineEvent => isRecord(item)) : [];

const toPlayerProfiles = (value: unknown): Record<string, PlayerProfile> => {
  if (!isRecord(value)) return {};
  const profiles: Record<string, PlayerProfile> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!isRecord(raw)) return;
    profiles[key] = raw as unknown as PlayerProfile;
  });
  return profiles;
};

const toOcrCorrections = (value: unknown): Record<string, OcrCorrection> => {
  if (!isRecord(value)) return {};
  const corrections: Record<string, OcrCorrection> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!isRecord(raw)) return;
    corrections[key] = raw as unknown as OcrCorrection;
  });
  return corrections;
};

const toTeamIdentityCorrections = (value: unknown): Record<string, TeamIdentityCorrection> => {
  if (!isRecord(value)) return {};
  const corrections: Record<string, TeamIdentityCorrection> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!isRecord(raw)) return;
    corrections[key] = raw as unknown as TeamIdentityCorrection;
  });
  return corrections;
};

const toNumberOr = (value: unknown, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const emptyUidMappings = (): UidMappings => normalizeSharedUidMappings();

const toUidMappings = (value: unknown): UidMappings => {
  if (!isRecord(value)) return emptyUidMappings();
  return normalizeSharedUidMappings({
    players: toStringMap(value.players),
    ships: toStringMap(value.ships),
    weapons: toStringMap(value.weapons),
    equipment: toStringMap(value.equipment),
    perks: toStringMap(value.perks),
  });
};

const toUidSeedState = (value: unknown): UidSeedState => {
  if (!isRecord(value)) return { seedVersionApplied: null };
  const seedVersionApplied = value.seedVersionApplied;
  if (seedVersionApplied == null) return { seedVersionApplied: null };
  const parsed = Number(seedVersionApplied);
  return {
    seedVersionApplied: Number.isFinite(parsed) ? parsed : null,
  };
};

const toStorageMeta = (value: unknown): StorageMeta => {
  if (!isRecord(value)) return {};
  const mappingsToUidMigratedAt = toNumberOr(value.mappingsToUidMigratedAt, 0);
  const legacyV13MigratedAt = toNumberOr(value.legacyV13MigratedAt, 0);
  const nextCanonicalMatchNumber = toNumberOr(value.nextCanonicalMatchNumber, 0);
  const artifactCanonicalMigrationV1At = toNumberOr(value.artifactCanonicalMigrationV1At, 0);
  return {
    ...(mappingsToUidMigratedAt > 0 ? { mappingsToUidMigratedAt } : {}),
    ...(legacyV13MigratedAt > 0 ? { legacyV13MigratedAt } : {}),
    ...(nextCanonicalMatchNumber > 0 ? { nextCanonicalMatchNumber } : {}),
    ...(artifactCanonicalMigrationV1At > 0 ? { artifactCanonicalMigrationV1At } : {}),
  };
};

const createDefaultStorageData = (): StorageData => ({
  matches: [],
  players: [],
  pilotRegistry: [],
  favorites: [],
  pilotNotes: {},
  settings: {},
  layouts: {},
  lastActivity: Date.now(),
  uidMappings: emptyUidMappings(),
  uidSeedState: { seedVersionApplied: null },
  storageMeta: {},
});

const coerceStorageData = (value: unknown): StorageData | null => {
  if (!isRecord(value)) return null;
  const defaults = createDefaultStorageData();
  const TELEMETRY_NOTE_PATTERNS = [
    'Telemetry draft created automatically. Awaiting result and optional Smart Capture/OCR review.',
    /Telemetry detected mission end\. .+/,
  ];
  const stripTelemetryNotes = (notes: unknown): string => {
    if (typeof notes !== 'string') return '';
    let cleaned = notes;
    for (const pattern of TELEMETRY_NOTE_PATTERNS) {
      if (typeof pattern === 'string') {
        cleaned = cleaned.split(pattern).join('');
      } else {
        cleaned = cleaned.replace(pattern, '');
      }
    }
    return cleaned.replace(/\n{2,}/g, '\n').trim();
  };
  const rawMatches = Array.isArray(value.matches)
    ? value.matches.filter((item): item is Match => isRecord(item))
    : defaults.matches;
  const matches = rawMatches.map((m) => {
    const cleaned = stripTelemetryNotes(m.notes);
    return cleaned !== (m.notes || '') ? { ...m, notes: cleaned } : m;
  });
  return {
    ...defaults,
    matches,
    players: toStringArray(value.players),
    pilotRegistry: toStringArray(value.pilotRegistry),
    favorites: toStringArray(value.favorites),
    pilotNotes: toStringMap(value.pilotNotes),
    playerIdMap: toStringMap(value.playerIdMap),
    ocrCorrections: toOcrCorrections(value.ocrCorrections),
    teamIdentityCorrections: toTeamIdentityCorrections(value.teamIdentityCorrections),
    ocrAliasModel: isRecord(value.ocrAliasModel) ? value.ocrAliasModel as unknown as OcrAliasModel : undefined,
    ocrLearningEvents: Array.isArray(value.ocrLearningEvents)
      ? value.ocrLearningEvents.filter((item): item is OcrLearningEvent => isRecord(item))
      : [],
    ocrLearningQueue: Array.isArray(value.ocrLearningQueue)
      ? value.ocrLearningQueue.filter((item): item is OcrLearningQueueItem => isRecord(item))
      : [],
    settings: isRecord(value.settings) ? { ...value.settings } : {},
    layouts: toLayouts(value.layouts),
    lastActivity: toNumberOr(value.lastActivity, Date.now()),
    mappings: toStringMap(value.mappings),
    playerProfiles: toPlayerProfiles(value.playerProfiles),
    timelineEvents: toTimelineEvents(value.timelineEvents),
    uidMappings: toUidMappings(value.uidMappings),
    uidSeedState: toUidSeedState(value.uidSeedState),
    storageMeta: toStorageMeta(value.storageMeta),
  };
};

const rememberLoadedData = (data: StorageData): StorageData => {
  lastData = data;
  lastPersistedVersion = pendingVersion;
  return data;
};

const applyUidSeed = async (data: StorageData): Promise<StorageData> => {
  const ipc = getElectronAPI();
  const merged: StorageData & {
    uidMappings: UidMappings;
    uidSeedState: UidSeedState;
    storageMeta: StorageMeta;
  } = {
    ...data,
    uidMappings: normalizeSharedUidMappings(data.uidMappings || emptyUidMappings()),
    uidSeedState: data.uidSeedState || { seedVersionApplied: null },
    storageMeta: data.storageMeta || {},
  };

  const hasLegacyMappings = !!(merged.mappings && Object.keys(merged.mappings).length > 0);
  const mappingsMigrated = !!merged.storageMeta?.mappingsToUidMigratedAt;

  // One-time migration: old knownMappings -> player UID domain.
  if (hasLegacyMappings && !mappingsMigrated) {
    merged.uidMappings.players = {
      ...merged.mappings,
      ...merged.uidMappings.players,
    };
    merged.storageMeta = {
      ...merged.storageMeta,
      mappingsToUidMigratedAt: Date.now(),
    };
  }

  if (!ipc) return merged;

  try {
    const seed = await ipc.invoke('read-uid-seed');
    if (!isRecord(seed)) return merged;
    const seedVersion = toNumberOr(seed.version, 0);
    const applied = merged.uidSeedState?.seedVersionApplied ?? null;
    if (applied !== null && seedVersion <= applied) return merged;

    const seedMappings = normalizeSharedUidMappings({
      players: toStringMap(seed.players),
      ships: toStringMap(seed.ships),
      weapons: toStringMap(seed.weapons),
      equipment: toStringMap(seed.equipment),
      perks: toStringMap(seed.perks),
    });
    merged.uidMappings = {
      players: { ...seedMappings.players, ...merged.uidMappings.players },
      ships: { ...seedMappings.ships, ...merged.uidMappings.ships },
      weapons: { ...seedMappings.weapons, ...merged.uidMappings.weapons },
      equipment: { ...seedMappings.equipment, ...merged.uidMappings.equipment },
      perks: { ...seedMappings.perks, ...merged.uidMappings.perks },
    };
    merged.uidSeedState = { seedVersionApplied: seedVersion };
    return merged;
  } catch (error) {
    Logger.warn('UIDSeed', 'Failed to load seed mappings', error);
    return merged;
  }
};

const maybeAutoBackup = async (data: StorageData) => {
  const ipc = getElectronAPI();
  if (!ipc) return;
  const autoBackupEnabled = data.settings?.autoBackup ?? true;
  if (!autoBackupEnabled) return;

  const matchCount = data.matches?.length || 0;
  if (matchCount === 0 || matchCount % 5 !== 0) return;
  if (lastAutoBackupCount === matchCount) return;

  lastAutoBackupCount = matchCount;
  try {
    await ipc.invoke('db-backup');
  } catch (error) {
    Logger.warn('AutoBackup', 'Failed to create backup', error);
  }
};

const writeNow = async (data: StorageData): Promise<boolean> => {
  try {
    const ipc = getElectronAPI();
    if (ipc) {
      await ipc.invoke('db-write', data);
      await maybeAutoBackup(data);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('wg_db', JSON.stringify(data));
      } catch (error) {
        Logger.warn('Storage', 'LocalStorage write failed', error);
      }
    }
    return true;
  } catch (error) {
    Logger.error('Storage', 'Failed to write DB', error);
    return false;
  }
};

const withPreservedMeta = (data: StorageData): StorageData => ({
  ...data,
  storageMeta: {
    ...(lastData?.storageMeta || {}),
    ...(data.storageMeta || {}),
  },
});

export const StorageService = {
  ensureLifecycleGuards() {
    if (lifecycleGuardsBound) return;
    if (typeof window === 'undefined') return;

    lifecycleGuardsBound = true;
    const flushSoon = () => { void this.flush(); };
    const flushSoonEvent: EventListener = () => { void this.flush(); };

    window.addEventListener('beforeunload', flushSoon);
    window.addEventListener('pagehide', flushSoonEvent);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSoon();
    });
    // Best-effort: if the renderer is about to die due to an exception,
    // attempt to flush whatever is currently staged.
    window.addEventListener('error', flushSoonEvent);
    window.addEventListener('unhandledrejection', flushSoonEvent);

    // Failsafe in case lifecycle hooks are skipped/crash occurs.
    intervalFlushHandle = window.setInterval(() => {
      if (lastData && hasUnsavedChanges()) void this.flush();
    }, runtimeConfig.storage.flushIntervalMs);
  },

  async init(): Promise<StorageData | null> {
    this.ensureLifecycleGuards();
    const ipc = getElectronAPI();
    const checkLegacyV13 = shouldCheckLegacyV13();
    if (!ipc) {
      Logger.info('Storage', 'Running in Web Mode (localStorage fallback)');
      if (typeof localStorage !== 'undefined') {
        const webDB = localStorage.getItem('wg_db');
        if (webDB) {
          const parsed = coerceStorageData(parseJsonSafely(webDB));
          if (parsed) return rememberLoadedData(parsed);
        }
      }
    } else {
      try {
        const dbData = await ipc.invoke('db-read');
        const normalized = coerceStorageData(dbData);
        if (normalized) {
          Logger.info('Storage', 'Database loaded from disk');
          if (normalized.storageMeta?.legacyV13MigratedAt) {
            markLegacyV13Checked();
          }
          const seeded = await applyUidSeed(normalized);
          return rememberLoadedData(seeded);
        }
      } catch (error) {
        Logger.error('Storage', 'Failed to read DB', error);
      }
      if (typeof localStorage !== 'undefined') {
        const webDB = localStorage.getItem('wg_db');
        if (webDB) {
          const parsed = coerceStorageData(parseJsonSafely(webDB));
          if (parsed) {
            const seeded = await applyUidSeed(parsed);
            await this.save(seeded);
            return rememberLoadedData(seeded);
          }
        }
      }
    }
    const hasLegacyData = checkLegacyV13 && hasLocalStorage() && localStorage.getItem('wg_v13_matches');
    if (hasLegacyData) {
      Logger.info('Storage', 'Migrating from legacy localStorage');
      const migrationData: StorageData = {
        ...createDefaultStorageData(),
        matches: coerceStorageData({ matches: parseJsonSafely(localStorage.getItem('wg_v13_matches') || '[]') })?.matches || [],
        players: toStringArray(parseJsonSafely(localStorage.getItem('wg_v13_players') || '[]')),
        pilotRegistry: toStringArray(parseJsonSafely(localStorage.getItem('wg_v13_pilot_registry') || '[]')),
        favorites: toStringArray(parseJsonSafely(localStorage.getItem('wg_v13_favorites') || '[]')),
        pilotNotes: toStringMap(parseJsonSafely(localStorage.getItem('wg_v13_pilot_notes') || '{}')),
        settings: {
          mode: parseJsonSafely(localStorage.getItem('wg_mode') || '"twilight"'),
          theme: parseJsonSafely(localStorage.getItem('wg_theme_accent') || '"ocean"'),
          hue: parseJsonSafely(localStorage.getItem('wg_custom_hue') || '"0"'),
          colorblind: parseJsonSafely(localStorage.getItem('wg_colorblind') || '"none"'),
          disableAnimations: parseJsonSafely(localStorage.getItem('wg_disable_animations') || 'false'),
          language: parseJsonSafely(localStorage.getItem('wg_language') || '"en"'),
          showTimer: parseJsonSafely(localStorage.getItem('wg_show_session_timer') || 'true'),
          bgUrl: parseJsonSafely(localStorage.getItem('wg_custom_bg_url') || '""'),
        },
        layouts: toLayouts(parseJsonSafely(localStorage.getItem('wg_layouts_v11') || '{}')),
        lastActivity: toNumberOr(localStorage.getItem('wg_last_activity'), Date.now()),
        storageMeta: {
          legacyV13MigratedAt: Date.now(),
        },
      };
      await this.save(migrationData);
      markLegacyV13Checked();
      if (ipc) {
        LEGACY_KEYS.forEach((key) => {
          const val = localStorage.getItem(key);
          if (val) {
            localStorage.setItem(`backup_${key}`, val);
            localStorage.removeItem(key);
          }
        });
      }

      const seeded = await applyUidSeed(migrationData);
      return rememberLoadedData(seeded);
    }
    if (checkLegacyV13) {
      markLegacyV13Checked();
    }
    const seeded = await applyUidSeed(createDefaultStorageData());
    return rememberLoadedData(seeded);
  },

  async save(data: StorageData) {
    this.ensureLifecycleGuards();
    lastData = withPreservedMeta(data);
    pendingVersion += 1;
    if (saveTimeout) clearTimeout(saveTimeout);

    return new Promise<boolean>((resolve) => {
      pendingResolvers.push(resolve);
      saveTimeout = setTimeout(async () => {
        const snapshot = lastData;
        const snapshotVersion = pendingVersion;
        saveTimeout = null;
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        let ok = false;
        try {
          ok = snapshot ? await writeNow(snapshot) : true;
          if (ok) {
            lastPersistedVersion = Math.max(lastPersistedVersion, snapshotVersion);
          }
        } finally {
          resolvers.forEach((resolver) => resolver(ok));
        }
      }, runtimeConfig.storage.saveDebounceMs); // tighter debounce to reduce loss window
    });
  },

  async flush() {
    if (!lastData) return false;
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    if (!hasUnsavedChanges()) {
      const resolvers = pendingResolvers;
      pendingResolvers = [];
      resolvers.forEach((resolver) => resolver(true));
      return true;
    }

    const snapshot = lastData;
    const snapshotVersion = pendingVersion;
    const ok = await writeNow(snapshot);
    if (ok) {
      lastPersistedVersion = Math.max(lastPersistedVersion, snapshotVersion);
    }
    const resolvers = pendingResolvers;
    pendingResolvers = [];
    resolvers.forEach((resolver) => resolver(ok));
    return ok;
  },

  async backup() {
    const ipc = getElectronAPI();
    if (ipc) {
      return await ipc.invoke('db-backup');
    }
    return { success: false, error: 'Not in Electron' };
  },

  async restoreFromData(rawData: unknown): Promise<{ success: boolean; error?: string }> {
    try {
      const normalized = coerceStorageData(rawData);
      if (!normalized) {
        return { success: false, error: 'Invalid backup data format - could not parse the file.' };
      }
      const seeded = await applyUidSeed(normalized);
      const ok = await writeNow(seeded);
      if (!ok) {
        return { success: false, error: 'Failed to write restored data to storage.' };
      }
      rememberLoadedData(seeded);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
};
