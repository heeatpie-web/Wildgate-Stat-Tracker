import { getElectronAPI } from './electronAPI';
export interface StorageData {
  matches: any[];
  players: string[];
  pilotRegistry: string[];
  favorites: string[];
  pilotNotes: Record<string, string>;
  playerIdMap?: Record<string, string>;
  ocrCorrections?: Record<string, any>;
  settings: Record<string, any>;
  layouts: any;
  lastActivity: number;
  mappings?: Record<string, string>;
  playerProfiles?: Record<string, any>;
  timelineEvents?: any[];
  uidMappings?: {
    players: Record<string, string>;
    ships: Record<string, string>;
    weapons: Record<string, string>;
    equipment: Record<string, string>;
  };
  uidSeedState?: {
    seedVersionApplied: number | null;
  };
}
const LEGACY_KEYS = [
  'wg_v13_matches', 'wg_v13_players', 'wg_v13_pilot_registry',
  'wg_v13_favorites', 'wg_v13_pilot_notes', 'wg_mode', 'wg_theme_accent',
  'wg_custom_hue', 'wg_colorblind', 'wg_disable_animations',
  'wg_language', 'wg_show_session_timer', 'wg_custom_bg_url',
  'wg_layouts_v11', 'wg_last_activity'
];

let saveTimeout: any = null;
let pendingResolvers: Array<(ok: boolean) => void> = [];
let lastData: StorageData | null = null;
let lastAutoBackupCount: number | null = null;
let lifecycleGuardsBound = false;
let intervalFlushHandle: any = null;

const emptyUidMappings = () => ({
  players: {} as Record<string, string>,
  ships: {} as Record<string, string>,
  weapons: {} as Record<string, string>,
  equipment: {} as Record<string, string>,
});

const normalizeUidMappings = (input?: Partial<StorageData['uidMappings']>) => ({
  players: { ...(input?.players || {}) },
  ships: { ...(input?.ships || {}) },
  weapons: { ...(input?.weapons || {}) },
  equipment: { ...(input?.equipment || {}) },
});

const applyUidSeed = async (data: StorageData): Promise<StorageData> => {
  const ipc = getElectronAPI();
  const merged: StorageData = {
    ...data,
    uidMappings: normalizeUidMappings(data.uidMappings || emptyUidMappings()),
    uidSeedState: data.uidSeedState || { seedVersionApplied: null }
  };

  // Legacy migration: old mappings -> player UID domain
  if (merged.mappings && Object.keys(merged.mappings).length > 0) {
    merged.uidMappings!.players = {
      ...merged.mappings,
      ...merged.uidMappings!.players
    };
  }

  if (!ipc) return merged;

  try {
    const seed = await ipc.invoke('read-uid-seed');
    if (!seed || typeof seed !== 'object') return merged;
    const seedVersion = Number(seed.version ?? 0) || 0;
    const applied = merged.uidSeedState?.seedVersionApplied ?? null;
    if (applied !== null && seedVersion <= applied) return merged;

    const seedMappings = normalizeUidMappings(seed);
    merged.uidMappings = {
      players: { ...seedMappings.players, ...merged.uidMappings!.players },
      ships: { ...seedMappings.ships, ...merged.uidMappings!.ships },
      weapons: { ...seedMappings.weapons, ...merged.uidMappings!.weapons },
      equipment: { ...seedMappings.equipment, ...merged.uidMappings!.equipment },
    };
    merged.uidSeedState = { seedVersionApplied: seedVersion };
    return merged;
  } catch (e) {
    console.warn('[UIDSeed] Failed to load seed mappings', e);
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
  } catch (e) {
    console.warn('[AutoBackup] Failed to create backup:', e);
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
      } catch (e) {
        console.warn('LocalStorage write failed', e);
      }
    }
    return true;
  } catch (e) {
    console.error("Failed to write DB", e);
    return false;
  }
};

export const StorageService = {
  ensureLifecycleGuards() {
    if (lifecycleGuardsBound) return;
    if (typeof window === 'undefined') return;

    lifecycleGuardsBound = true;
    const flushSoon = () => { void this.flush(); };

    window.addEventListener('beforeunload', flushSoon);
    window.addEventListener('pagehide', flushSoon as any);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSoon();
    });
    // Best-effort: if the renderer is about to die due to an exception,
    // attempt to flush whatever is currently staged.
    window.addEventListener('error', flushSoon as any);
    window.addEventListener('unhandledrejection', flushSoon as any);

    // Failsafe in case lifecycle hooks are skipped/crash occurs.
    intervalFlushHandle = window.setInterval(() => {
      if (lastData) void this.flush();
    }, 3000);
  },

  async init(): Promise<StorageData | null> {
    this.ensureLifecycleGuards();
    const ipc = getElectronAPI();
    if (!ipc) {
      console.log("Running in Web Mode (localStorage fallback)");
      if (typeof localStorage !== 'undefined') {
        const webDB = localStorage.getItem('wg_db');
        if (webDB) {
          return JSON.parse(webDB);
        }
      }
    } else {
      try {
        const dbData = await ipc.invoke('db-read');
        if (dbData) {
          console.log("Database loaded from disk.");
          return await applyUidSeed(dbData);
        }
      } catch (e) {
        console.error("Failed to read DB", e);
      }
      if (typeof localStorage !== 'undefined') {
        const webDB = localStorage.getItem('wg_db');
        if (webDB) {
          const parsed = JSON.parse(webDB);
          const seeded = await applyUidSeed(parsed);
          await this.save(seeded);
          return seeded;
        }
      }
    }
    const hasLegacyData = typeof localStorage !== 'undefined' && localStorage.getItem('wg_v13_matches');
    if (hasLegacyData) {
      console.log("Migrating from Legacy LocalStorage...");
      const migrationData: StorageData = {
        matches: JSON.parse(localStorage.getItem('wg_v13_matches') || '[]'),
        players: JSON.parse(localStorage.getItem('wg_v13_players') || '[]'),
        pilotRegistry: JSON.parse(localStorage.getItem('wg_v13_pilot_registry') || '[]'),
        favorites: JSON.parse(localStorage.getItem('wg_v13_favorites') || '[]'),
        pilotNotes: JSON.parse(localStorage.getItem('wg_v13_pilot_notes') || '{}'),
        settings: {
          mode: JSON.parse(localStorage.getItem('wg_mode') || '"twilight"'),
          theme: JSON.parse(localStorage.getItem('wg_theme_accent') || '"ocean"'),
          hue: JSON.parse(localStorage.getItem('wg_custom_hue') || '"0"'),
          colorblind: JSON.parse(localStorage.getItem('wg_colorblind') || '"none"'),
          disableAnimations: JSON.parse(localStorage.getItem('wg_disable_animations') || 'false'),
          language: JSON.parse(localStorage.getItem('wg_language') || '"en"'),
          showTimer: JSON.parse(localStorage.getItem('wg_show_session_timer') || 'true'),
          bgUrl: JSON.parse(localStorage.getItem('wg_custom_bg_url') || '""')
        },
        layouts: JSON.parse(localStorage.getItem('wg_layouts_v11') || '{}'),
        lastActivity: parseInt(localStorage.getItem('wg_last_activity') || '0')
      };
      await this.save(migrationData);
      if (ipc) {
        LEGACY_KEYS.forEach(key => {
          const val = localStorage.getItem(key);
          if (val) {
            localStorage.setItem(`backup_${key}`, val);
            localStorage.removeItem(key);
          }
        });
      }

      return await applyUidSeed(migrationData);
    }
    return await applyUidSeed({
      matches: [],
      players: [],
      pilotRegistry: [],
      favorites: [],
      pilotNotes: {},
      settings: {},
      layouts: {},
      lastActivity: Date.now()
    });
  },

  async save(data: StorageData) {
    this.ensureLifecycleGuards();
    lastData = data;
    if (saveTimeout) clearTimeout(saveTimeout);

    return new Promise<boolean>((resolve) => {
      pendingResolvers.push(resolve);
      saveTimeout = setTimeout(async () => {
        const ok = await writeNow(lastData as StorageData);
        saveTimeout = null;
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        resolvers.forEach(r => r(ok));
      }, 300); // tighter debounce to reduce loss window
    });
  },

  async flush() {
    if (!lastData) return false;
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    const ok = await writeNow(lastData);
    const resolvers = pendingResolvers;
    pendingResolvers = [];
    resolvers.forEach(r => r(ok));
    return ok;
  },

  async backup() {
    const ipc = getElectronAPI();
    if (ipc) {
      return await ipc.invoke('db-backup');
    }
    return { success: false, error: 'Not in Electron' };
  }
};


