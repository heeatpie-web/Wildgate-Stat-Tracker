/**
 * @module storage
 * Persistence layer that bridges Zustand with Electron's main process.
 * StorageService.init() loads data on startup (with localStorage migration),
 * and StorageService.save() writes the full state to disk via IPC.
 */
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

/** Shape of the persisted data payload exchanged with the main process. */
export interface StorageData {
  matches: any[];
  players: string[];
  pilotRegistry: string[];
  favorites: string[];
  pilotNotes: Record<string, string>;
  playerIdMap?: Record<string, string>;
  settings: Record<string, any>;
  layouts: any;
  lastActivity: number;
  mappings?: Record<string, string>;
  playerProfiles?: Record<string, any>;
  timelineEvents?: any[];
}

// Keys used in localStorage (legacy)
const LEGACY_KEYS = [
  'wg_v13_matches', 'wg_v13_players', 'wg_v13_pilot_registry',
  'wg_v13_favorites', 'wg_v13_pilot_notes', 'wg_mode', 'wg_theme_accent',
  'wg_custom_hue', 'wg_colorblind', 'wg_disable_animations',
  'wg_language', 'wg_show_session_timer', 'wg_custom_bg_url',
  'wg_layouts_v11', 'wg_last_activity'
];

let saveTimeout: any = null;

export const StorageService = {
  async init(): Promise<StorageData | null> {
    // WEB / DEV MODE
    if (!ipcRenderer) {
      console.log("Running in Web Mode (localStorage fallback)");
      const webDB = localStorage.getItem('wg_db');
      if (webDB) {
        return JSON.parse(webDB);
      }
      // If no DB, fall through to legacy migration
    } else {
      // ELECTRON MODE
      try {
        const dbData = await ipcRenderer.invoke('db-read');
        if (dbData) {
          console.log("Database loaded from disk.");
          return dbData;
        }
      } catch (e) {
        console.error("Failed to read DB", e);
      }
    }

    // MIGRATION (Shared Logic)
    const hasLegacyData = localStorage.getItem('wg_v13_matches');
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

      // Save to new DB system
      await this.save(migrationData);

      // Backup & Clear Legacy (Only in Electron to prevent Dev Server chaos, or just backup)
      if (ipcRenderer) {
        LEGACY_KEYS.forEach(key => {
          const val = localStorage.getItem(key);
          if (val) {
            localStorage.setItem(`backup_${key}`, val);
            localStorage.removeItem(key);
          }
        });
      }

      return migrationData;
    }

    // FRESH START
    return {
      matches: [],
      players: [],
      pilotRegistry: [],
      favorites: [],
      pilotNotes: {},
      settings: {},
      layouts: {},
      lastActivity: Date.now()
    };
  },

  async save(data: StorageData) {
    if (saveTimeout) clearTimeout(saveTimeout);

    return new Promise((resolve) => {
      saveTimeout = setTimeout(async () => {
        if (ipcRenderer) {
          await ipcRenderer.invoke('db-write', data);
        } else {
          localStorage.setItem('wg_db', JSON.stringify(data));
        }
        saveTimeout = null;
        resolve(true);
      }, 1000); // 1 second debounce
    });
  },

  async backup() {
    if (ipcRenderer) {
      return await ipcRenderer.invoke('db-backup');
    }
    // Web backup could download the JSON
    return { success: false, error: 'Not in Electron' };
  }
};