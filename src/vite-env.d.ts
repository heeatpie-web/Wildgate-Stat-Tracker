/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE_SAVE_DEBOUNCE_MS?: string;
  readonly VITE_STORAGE_FLUSH_INTERVAL_MS?: string;
  readonly VITE_SMART_CAPTURE_AUTO_BUNDLE_DELAY_MS?: string;
  readonly VITE_SMART_CAPTURE_THROTTLE_MS?: string;
  readonly VITE_PRELOAD_IDLE_TIMEOUT_MIN_MS?: string;
  readonly VITE_PRELOAD_IDLE_TIMEOUT_MAX_MS?: string;
  readonly VITE_PRELOAD_FALLBACK_DELAY_MIN_MS?: string;
  readonly VITE_PRELOAD_PROGRESS_POLL_MS?: string;
  readonly VITE_DISCORD_PRESENCE_INTERVAL_MS?: string;
  readonly VITE_SYSTEM_PULSE_STATUS_POLL_MS?: string;
  readonly VITE_SYSTEM_PULSE_RECEIVING_WINDOW_MS?: string;
  readonly VITE_HISTORY_SEARCH_DEBOUNCE_MS?: string;
  readonly VITE_HISTORY_TIME_REFRESH_MS?: string;
  readonly VITE_ACTION_PANEL_RESULT_PULSE_MS?: string;
  readonly VITE_ACTION_PANEL_RESULT_RIPPLE_MS?: string;
  readonly VITE_TOAST_DURATION_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
