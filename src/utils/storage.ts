import { getElectronAPI } from './electronAPI';
import type { Match, UidMappingsContract } from '../types';
import type { PendingReview, RosterEntryMeta, TimelineEvent } from '../store/slices/createDataSlice';
import type {
  OcrCorrection,
  PlayerEncounterRoleCorrection,
  PlayerProfile,
  TeamIdentityCorrection,
} from '../store/slices/createMappingSlice';
import type { OcrAliasModel, OcrLearningEvent, OcrLearningQueueItem } from './ocrAliasEngine';
import type { TeammateIdentityRecord } from './teammateIdentity';
import { normalizeSharedUidMappings, normalizeUidMappingName } from '../services/mappingContract';
import { isBogusTertiaryLoadoutEntry, sanitizeUnknownLoadout } from './loadout';
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
  rosterEntryMeta?: Record<string, RosterEntryMeta>;
  favorites: string[];
  pilotNotes: Record<string, string>;
  pilotAliases?: Record<string, string[]>;
  playerIdMap?: StringMap;
  ocrCorrections?: Record<string, OcrCorrection>;
  teamIdentityCorrections?: Record<string, TeamIdentityCorrection>;
  playerEncounterRoleCorrections?: Record<string, PlayerEncounterRoleCorrection>;
  ocrAliasModel?: OcrAliasModel;
  ocrLearningEvents?: OcrLearningEvent[];
  ocrLearningQueue?: OcrLearningQueueItem[];
  pendingReviews?: PendingReview[];
  dismissedRosterMergePairKeys?: string[];
  dismissedRosterCandidateKeys?: string[];
  settings: StorageSettings;
  layouts: StorageLayouts;
  lastActivity: number;
  mappings?: StringMap;
  playerProfiles?: Record<string, PlayerProfile>;
  teammateIdentityRecords?: Record<string, TeammateIdentityRecord>;
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
let pendingSnapshotProducer: (() => StorageData) | null = null;
let lastPersistedVersion = 0;
let pendingVersion = 0;
let lastAutoBackupCount: number | null = null;
let lifecycleGuardsBound = false;
let intervalFlushHandle: ReturnType<typeof setInterval> | number | null = null;
const IS_STORAGE_DEBUG = import.meta.env.DEV || process.env.NODE_ENV === 'test';

const hasUnsavedChanges = () => pendingVersion > lastPersistedVersion;
const hasPendingSnapshot = () => Boolean(lastData || pendingSnapshotProducer);

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

const stripBogusTertiaryUidEntries = (value: unknown): StringMap => (
  Object.fromEntries(
    Object.entries(toStringMap(value)).filter(([, rawName]) => !isBogusTertiaryLoadoutEntry(rawName))
  )
);

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

const toPendingReviews = (value: unknown): PendingReview[] =>
  Array.isArray(value) ? value.filter((item): item is PendingReview => isRecord(item)) : [];

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

const toPlayerEncounterRoleCorrections = (value: unknown): Record<string, PlayerEncounterRoleCorrection> => {
  if (!isRecord(value)) return {};
  const corrections: Record<string, PlayerEncounterRoleCorrection> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!isRecord(raw)) return;
    corrections[key] = raw as unknown as PlayerEncounterRoleCorrection;
  });
  return corrections;
};

const toNumberOr = (value: unknown, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const emptyUidMappings = (): UidMappings => normalizeSharedUidMappings();

const GUID_HEX_PATTERN = /^[A-F0-9]{32}$/i;

const normalizeGuidKey = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = raw.replace(/[{}-]/g, '');
  if (GUID_HEX_PATTERN.test(direct)) return direct.toUpperCase();
  return raw;
};

const toUidMappings = (value: unknown): UidMappings => {
  if (!isRecord(value)) return emptyUidMappings();
  return normalizeSharedUidMappings({
    players: toStringMap(value.players),
    ships: toStringMap(value.ships),
    weapons: stripBogusTertiaryUidEntries(value.weapons),
    equipment: stripBogusTertiaryUidEntries(value.equipment),
    perks: toStringMap(value.perks),
  });
};

const toTeammateIdentityRecords = (value: unknown): Record<string, TeammateIdentityRecord> => {
  if (!isRecord(value)) return {};
  const records: Record<string, TeammateIdentityRecord> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!isRecord(raw)) return;
    records[key] = raw as unknown as TeammateIdentityRecord;
  });
  return records;
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
  rosterEntryMeta: {},
  favorites: [],
  pilotNotes: {},
  playerEncounterRoleCorrections: {},
  teammateIdentityRecords: {},
  pendingReviews: [],
  dismissedRosterMergePairKeys: [],
  dismissedRosterCandidateKeys: [],
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
    const sanitizedLoadout = sanitizeUnknownLoadout(m.loadout);
    return {
      ...m,
      ...(cleaned !== (m.notes || '') ? { notes: cleaned } : {}),
      ...(m.loadout !== undefined ? { loadout: sanitizedLoadout || undefined } : {}),
    };
  });
  return {
    ...defaults,
    matches,
    players: toStringArray(value.players),
    pilotRegistry: toStringArray(value.pilotRegistry),
    rosterEntryMeta: isRecord(value.rosterEntryMeta)
      ? value.rosterEntryMeta as Record<string, RosterEntryMeta>
      : {},
    favorites: toStringArray(value.favorites),
    pilotNotes: toStringMap(value.pilotNotes),
    playerIdMap: toStringMap(value.playerIdMap),
    ocrCorrections: toOcrCorrections(value.ocrCorrections),
    teamIdentityCorrections: toTeamIdentityCorrections(value.teamIdentityCorrections),
    playerEncounterRoleCorrections: toPlayerEncounterRoleCorrections(value.playerEncounterRoleCorrections),
    ocrAliasModel: isRecord(value.ocrAliasModel) ? value.ocrAliasModel as unknown as OcrAliasModel : undefined,
    ocrLearningEvents: Array.isArray(value.ocrLearningEvents)
      ? value.ocrLearningEvents.filter((item): item is OcrLearningEvent => isRecord(item))
      : [],
    ocrLearningQueue: Array.isArray(value.ocrLearningQueue)
      ? value.ocrLearningQueue.filter((item): item is OcrLearningQueueItem => isRecord(item))
      : [],
    pendingReviews: toPendingReviews(value.pendingReviews),
    dismissedRosterMergePairKeys: toStringArray(value.dismissedRosterMergePairKeys),
    dismissedRosterCandidateKeys: toStringArray(value.dismissedRosterCandidateKeys),
    settings: isRecord(value.settings) ? { ...value.settings } : {},
    layouts: toLayouts(value.layouts),
    lastActivity: toNumberOr(value.lastActivity, Date.now()),
    mappings: toStringMap(value.mappings),
    playerProfiles: toPlayerProfiles(value.playerProfiles),
    teammateIdentityRecords: toTeammateIdentityRecords(value.teammateIdentityRecords),
    timelineEvents: toTimelineEvents(value.timelineEvents),
    uidMappings: toUidMappings(value.uidMappings),
    uidSeedState: toUidSeedState(value.uidSeedState),
    storageMeta: toStorageMeta(value.storageMeta),
  };
};

const rememberLoadedData = (data: StorageData): StorageData => {
  lastData = data;
  pendingSnapshotProducer = null;
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

  const stripSeedNonPlayerResidue = (
    seedMappings: UidMappings,
    relocations: unknown[],
  ) => {
    const nonPlayerIds = new Set<string>();
    const registerGuid = (guid: unknown) => {
      const normalized = normalizeGuidKey(guid);
      if (normalized) nonPlayerIds.add(normalized);
    };
    const stripStringMap = (value: StringMap | undefined): StringMap => (
      Object.fromEntries(
        Object.entries(value || {}).filter(([key]) => !nonPlayerIds.has(normalizeGuidKey(key)))
      )
    );

    Object.keys(seedMappings.ships || {}).forEach(registerGuid);
    Object.keys(seedMappings.weapons || {}).forEach(registerGuid);
    Object.keys(seedMappings.equipment || {}).forEach(registerGuid);
    Object.keys(seedMappings.perks || {}).forEach(registerGuid);
    relocations.forEach((relocation) => {
      if (!isRecord(relocation)) return;
      const targetDomain = String(relocation.to || '').trim().toLowerCase();
      if (targetDomain && targetDomain !== 'players') {
        registerGuid(relocation.guid);
      }
    });
    if (nonPlayerIds.size === 0) return;

    merged.uidMappings.players = stripStringMap(merged.uidMappings.players);
    merged.mappings = stripStringMap(merged.mappings);
    merged.playerIdMap = stripStringMap(merged.playerIdMap);
    merged.playerProfiles = Object.fromEntries(
      Object.entries(merged.playerProfiles || {}).filter(([key]) => !nonPlayerIds.has(normalizeGuidKey(key)))
    );
    merged.teammateIdentityRecords = Object.fromEntries(
      Object.entries(merged.teammateIdentityRecords || {}).filter(([key]) => !nonPlayerIds.has(normalizeGuidKey(key)))
    );
  };

  const applyDeprecatedEquipmentCorrections = (seedMappings: UidMappings) => {
    const correctionSeedName = normalizeUidMappingName(
      'equipment',
      seedMappings.equipment['20C5C5A04C5A86EFAF1F9FAF2C0DD60C'] || 'Drill Charge',
    );
    const deprecatedEquipmentCorrections: Record<string, { staleNames: string[]; correctedName: string }> = {
      '20C5C5A04C5A86EFAF1F9FAF2C0DD60C': {
        staleNames: ['Thunder Dash'],
        correctedName: correctionSeedName,
      },
    };
    const nextEquipment = { ...(merged.uidMappings.equipment || {}) };
    Object.entries(deprecatedEquipmentCorrections).forEach(([guid, correction]) => {
      const existingKey = Object.keys(nextEquipment).find((key) => normalizeGuidKey(key) === guid);
      if (!existingKey) return;
      const normalizedValue = normalizeUidMappingName('equipment', nextEquipment[existingKey]).toLowerCase();
      const isStale = correction.staleNames.some((name) => normalizeUidMappingName('equipment', name).toLowerCase() === normalizedValue);
      if (!isStale) return;
      nextEquipment[existingKey] = correction.correctedName;
    });
    merged.uidMappings.equipment = nextEquipment;
  };

  try {
    const seed = await ipc.invoke('read-uid-seed');
    if (!isRecord(seed)) return merged;
    const seedMappings = normalizeSharedUidMappings({
      players: toStringMap(seed.players),
      ships: toStringMap(seed.ships),
      weapons: toStringMap(seed.weapons),
      equipment: toStringMap(seed.equipment),
      perks: toStringMap(seed.perks),
    });
    const relocations = Array.isArray(seed.relocations) ? seed.relocations : [];
    const seedVersion = toNumberOr(seed.version, 0);
    const applied = merged.uidSeedState?.seedVersionApplied ?? null;
    if (applied !== null && seedVersion <= applied) {
      stripSeedNonPlayerResidue(seedMappings, relocations);
      applyDeprecatedEquipmentCorrections(seedMappings);
      return merged;
    }
    merged.uidMappings = {
      players: { ...seedMappings.players, ...merged.uidMappings.players },
      ships: { ...seedMappings.ships, ...merged.uidMappings.ships },
      weapons: { ...seedMappings.weapons, ...merged.uidMappings.weapons },
      equipment: { ...seedMappings.equipment, ...merged.uidMappings.equipment },
      perks: { ...seedMappings.perks, ...merged.uidMappings.perks },
    };

    // Apply relocations: remove GUIDs from the domain they were incorrectly placed in.
    for (const relocation of relocations) {
      if (!isRecord(relocation)) continue;
      const { guid, from } = relocation as { guid?: unknown; from?: unknown };
      if (typeof guid !== 'string' || typeof from !== 'string') continue;
      const domain = from as keyof typeof merged.uidMappings;
      if (merged.uidMappings[domain]) {
        const { [guid]: _removed, ...rest } = merged.uidMappings[domain];
        merged.uidMappings[domain] = rest;
      }
    }

    merged.uidSeedState = { seedVersionApplied: seedVersion };
    stripSeedNonPlayerResidue(seedMappings, relocations);
    applyDeprecatedEquipmentCorrections(seedMappings);
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
  const startedAt = performance.now();
  const payloadBytes = (() => {
    if (!IS_STORAGE_DEBUG) return 0;
    try {
      return new TextEncoder().encode(JSON.stringify(data)).length;
    } catch {
      return 0;
    }
  })();
  try {
    const ipc = getElectronAPI();
    if (ipc) {
      await ipc.invoke('db-write', data);
      await maybeAutoBackup(data);
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('wg_db', JSON.stringify(data));
      } catch (error) {
        Logger.warn('Storage', 'LocalStorage write failed', error);
      }
    }
    if (IS_STORAGE_DEBUG) {
      Logger.debug('Storage', 'Persisted snapshot', {
        bytes: payloadBytes,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        transport: ipc ? 'ipc' : 'localStorage',
      });
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

const resolvePendingSnapshot = (): StorageData | null => {
  if (pendingSnapshotProducer) {
    try {
      lastData = withPreservedMeta(pendingSnapshotProducer());
    } catch (error) {
      pendingSnapshotProducer = null;
      Logger.error('Storage', 'Failed to materialize pending snapshot', error);
      return lastData;
    }
    pendingSnapshotProducer = null;
  }
  return lastData;
};

/** Drop any in-flight debounced save so it cannot overwrite a wipe/restore. */
const cancelPendingDebouncedSave = () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  pendingSnapshotProducer = null;
  const resolvers = pendingResolvers;
  pendingResolvers = [];
  resolvers.forEach((resolver) => resolver(true));
};

interface StorageSaveOptions {
  debounceMs?: number;
}

export const StorageService = {
  ensureLifecycleGuards() {
    if (lifecycleGuardsBound) return;
    if (typeof window === 'undefined') return;

    lifecycleGuardsBound = true;
    const isElectronRuntime = Boolean(getElectronAPI());
    const flushSoon = () => { void this.flush(); };
    const flushSoonEvent: EventListener = () => { void this.flush(); };

    window.addEventListener('beforeunload', flushSoon);
    if (!isElectronRuntime) {
      window.addEventListener('pagehide', flushSoonEvent);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushSoon();
      });
    }
    // Best-effort: if the renderer is about to die due to an exception,
    // attempt to flush whatever is currently staged.
    window.addEventListener('error', flushSoonEvent);
    window.addEventListener('unhandledrejection', flushSoonEvent);

    // Failsafe in case lifecycle hooks are skipped/crash occurs.
    intervalFlushHandle = window.setInterval(() => {
      if (hasPendingSnapshot() && hasUnsavedChanges()) void this.flush();
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

  async save(data: StorageData | (() => StorageData), options: StorageSaveOptions = {}) {
    this.ensureLifecycleGuards();
    pendingSnapshotProducer = typeof data === 'function' ? data : () => data;
    pendingVersion += 1;
    if (saveTimeout) clearTimeout(saveTimeout);
    const debounceMs = Number.isFinite(options.debounceMs)
      ? Math.max(50, Math.round(Number(options.debounceMs)))
      : runtimeConfig.storage.saveDebounceMs;

    return new Promise<boolean>((resolve) => {
      pendingResolvers.push(resolve);
      saveTimeout = setTimeout(async () => {
        const snapshot = resolvePendingSnapshot();
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
      }, debounceMs);
    });
  },

  async flush() {
    if (!hasPendingSnapshot()) return false;
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

    const snapshot = resolvePendingSnapshot();
    const snapshotVersion = pendingVersion;
    const ok = snapshot ? await writeNow(snapshot) : true;
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
    cancelPendingDebouncedSave();
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
  },

  /**
   * Replace persisted state with factory defaults (matches, roster, mappings, etc.).
   * Required for Reset Data in Electron: the DB lives on disk, not only in localStorage.
   */
  async wipeAllPersistedData(): Promise<boolean> {
    this.ensureLifecycleGuards();
    cancelPendingDebouncedSave();
    try {
      const fresh = await applyUidSeed(createDefaultStorageData());
      const ok = await writeNow(fresh);
      if (!ok) return false;
      rememberLoadedData(fresh);
      return true;
    } catch (error) {
      Logger.error('Storage', 'Failed to wipe persisted data', error);
      return false;
    }
  },
};
