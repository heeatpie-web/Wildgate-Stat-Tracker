/**
 * Runtime configuration sourced from Vite env vars with safe defaults.
 * Values are clamped to avoid invalid/unsafe timings in production.
 */

const readEnvNumber = (
  key: string,
  fallback: number,
  min: number,
  max: number
): number => {
  const raw = import.meta.env[key];
  if (raw == null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const readEnvBoolean = (key: string, fallback: boolean): boolean => {
  const raw = import.meta.env[key];
  if (raw == null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
};

export const runtimeConfig = {
  storage: {
    saveDebounceMs: readEnvNumber('VITE_STORAGE_SAVE_DEBOUNCE_MS', 300, 50, 5_000),
    telemetryBurstSaveDebounceMs: readEnvNumber('VITE_STORAGE_TELEMETRY_BURST_SAVE_DEBOUNCE_MS', 1_500, 300, 10_000),
    flushIntervalMs: readEnvNumber('VITE_STORAGE_FLUSH_INTERVAL_MS', 3_000, 500, 60_000),
  },
  smartCapture: {
    autoOcrBundleDelayMs: readEnvNumber('VITE_SMART_CAPTURE_AUTO_BUNDLE_DELAY_MS', 3_750, 500, 30_000),
    captureThrottleMs: readEnvNumber('VITE_SMART_CAPTURE_THROTTLE_MS', 650, 100, 10_000),
  },
  ocr: {
    cacheMaxEntries:      readEnvNumber('VITE_OCR_CACHE_MAX',           50,   10,  500),
    workerPoolSize:       readEnvNumber('VITE_OCR_WORKER_POOL_SIZE',     3,    1,    8),
    regionOcrScale:       readEnvNumber('VITE_OCR_REGION_SCALE',         3,    1,    6),
    lowWordConfidence:    readEnvNumber('VITE_OCR_WORD_CONF_MIN',        25,    0,   80),
    learningQueueMax:     readEnvNumber('VITE_OCR_LEARNING_QUEUE_MAX',  200,   50, 1000),
    learningEventMax:     readEnvNumber('VITE_OCR_LEARNING_EVENT_MAX',  500,  100, 5000),
  },
  app: {
    preloadIdleTimeoutMinMs: readEnvNumber('VITE_PRELOAD_IDLE_TIMEOUT_MIN_MS', 350, 100, 5_000),
    preloadIdleTimeoutMaxMs: readEnvNumber('VITE_PRELOAD_IDLE_TIMEOUT_MAX_MS', 1_600, 200, 10_000),
    preloadFallbackDelayMinMs: readEnvNumber('VITE_PRELOAD_FALLBACK_DELAY_MIN_MS', 40, 0, 2_000),
    preloadProgressPollMs: readEnvNumber('VITE_PRELOAD_PROGRESS_POLL_MS', 160, 50, 5_000),
  },
  systemPulse: {
    statusPollIntervalMs: readEnvNumber('VITE_SYSTEM_PULSE_STATUS_POLL_MS', 20_000, 5_000, 120_000),
    telemetryReceivingWindowMs: readEnvNumber('VITE_SYSTEM_PULSE_RECEIVING_WINDOW_MS', 45_000, 5_000, 300_000),
  },
  history: {
    searchDebounceMs: readEnvNumber('VITE_HISTORY_SEARCH_DEBOUNCE_MS', 200, 50, 2_000),
    relativeTimeRefreshMs: readEnvNumber('VITE_HISTORY_TIME_REFRESH_MS', 60_000, 10_000, 300_000),
  },
  actionPanel: {
    resultPulseDurationMs: readEnvNumber('VITE_ACTION_PANEL_RESULT_PULSE_MS', 700, 100, 5_000),
    resultRippleDurationMs: readEnvNumber('VITE_ACTION_PANEL_RESULT_RIPPLE_MS', 320, 100, 2_000),
  },
  ui: {
    toastDurationMs: readEnvNumber('VITE_TOAST_DURATION_MS', 4_800, 1_000, 60_000),
  },
} as const;
