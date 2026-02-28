/**
 * OCR Handler for Electron Main Process
 *
 * Redesigned OCR system with:
 * - Chinese language support (eng+chi_sim)
 * - Dynamic user anchor (activeUser from store)
 * - Color-based team detection
 * - Region-based extraction
 * - Support for scrolled captures (merge)
 */

const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');
const os = require('os');

// Import new extraction modules
const { detectScreenType, detectScreenTypeFromLines, SCREEN_TYPES } = require('./screenDetector.cjs');
const {
  extractCrewHub,
  groupWordsIntoLines: groupCrewHubWordsIntoLines,
  extractPlayerNameFromLine: extractCrewHubPlayerNameFromLine,
  cleanupPlayerName: cleanupCrewHubPlayerName,
  isValidPlayerName: isValidCrewHubPlayerName,
} = require('./crewHubExtractor.cjs');
const { extractMapScreen, extractPlayerList, KNOWN_HAZARDS, SHIP_TYPES: MAP_SHIP_TYPES, looksLikeTeamName: looksLikeMapTeamName } = require('./mapScreenExtractor.cjs');
const { mergeCaptures, isSameMatch } = require('./ocrMerger.cjs');
const { generateUserWordsFile } = require('./tesseractDictionary.cjs');

// Dynamic imports (loaded when needed)
let Tesseract = null;
let screenshot = null;
let sharp = null;

// Debug directory for saving OCR images
const DEBUG_DIR = path.join(app.getPath('userData'), 'ocr-debug');
const OCR_CORPUS_ARCHIVE_DIR = path.join(app.getPath('userData'), 'ocr-corpus-archive');
const OCR_TESSERACT_DIR = path.join(app.getPath('userData'), 'ocr-tesseract');
const OCR_USER_WORDS_FILE = path.join(OCR_TESSERACT_DIR, 'wildgate_userwords.txt');
const OCR_USER_WORDS_FILE_FALLBACKS = [
  path.join(app.getPath('appData'), 'Wildgate Stat Tracker', 'ocr-tesseract', 'wildgate_userwords.txt'),
  path.join(app.getPath('appData'), 'wildgate-stat-tracker', 'ocr-tesseract', 'wildgate_userwords.txt'),
];

// Ensure debug directory exists
function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }
}

function ensureCorpusArchiveDir() {
  if (!fs.existsSync(OCR_CORPUS_ARCHIVE_DIR)) {
    fs.mkdirSync(OCR_CORPUS_ARCHIVE_DIR, { recursive: true });
  }
}

// ─── OCR Result Cache (LRU, max 50 entries) ───
const OCR_CACHE_MAX = Math.min(500, Math.max(10, parseInt(process.env.WILDGATE_OCR_CACHE_MAX || '50', 10) || 50));
const LOW_WORD_CONFIDENCE_THRESHOLD = Math.min(80, Math.max(0, parseInt(process.env.WILDGATE_OCR_WORD_CONF_MIN || '15', 10) || 15));
const CPU_COUNT = Math.max(1, Number.isFinite(os.cpus()?.length) ? os.cpus().length : 1);
const OCR_MAX_CONCURRENT = Math.min(4, Math.max(1, parseInt(process.env.WILDGATE_OCR_MAX_CONCURRENT || '1', 10) || 1));
const OCR_PREPROCESS_DOWNSCALE_WIDTH = Math.min(4096, Math.max(1200, parseInt(process.env.WILDGATE_OCR_PREPROCESS_MAX_WIDTH || '1920', 10) || 1920));
const DEFAULT_SHARP_CONCURRENCY = CPU_COUNT <= 4 ? 1 : 2;
const OCR_SHARP_CONCURRENCY = Math.min(4, Math.max(1, parseInt(process.env.WILDGATE_OCR_SHARP_CONCURRENCY || String(DEFAULT_SHARP_CONCURRENCY), 10) || DEFAULT_SHARP_CONCURRENCY));
const ocrResultCache = new Map(); // hash → { result, timestamp }
const ocrConcurrencyQueue = [];
let activeOcrJobs = 0;
const cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  totalRequests: 0,
  avgHitTimeMs: 0,
  avgMissTimeMs: 0,
  hitTimingSamples: 0,
  missTimingSamples: 0,
};

function updateRunningAverage(current, sampleCount, value) {
  if (!Number.isFinite(value) || value < 0) return current;
  return ((current * sampleCount) + value) / (sampleCount + 1);
}

function recordCacheHit(durationMs) {
  cacheStats.hits += 1;
  cacheStats.totalRequests += 1;
  if (Number.isFinite(durationMs) && durationMs >= 0) {
    cacheStats.avgHitTimeMs = updateRunningAverage(
      cacheStats.avgHitTimeMs,
      cacheStats.hitTimingSamples,
      durationMs
    );
    cacheStats.hitTimingSamples += 1;
  }
}

function recordCacheMiss() {
  cacheStats.misses += 1;
  cacheStats.totalRequests += 1;
}

function recordCacheMissDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  cacheStats.avgMissTimeMs = updateRunningAverage(
    cacheStats.avgMissTimeMs,
    cacheStats.missTimingSamples,
    durationMs
  );
  cacheStats.missTimingSamples += 1;
}

function releaseOcrSlot() {
  activeOcrJobs = Math.max(0, activeOcrJobs - 1);
  const next = ocrConcurrencyQueue.shift();
  if (typeof next === 'function') {
    next();
  }
}

async function acquireOcrSlot(tag = 'unspecified') {
  const waitStart = Date.now();
  while (activeOcrJobs >= OCR_MAX_CONCURRENT) {
    await new Promise((resolve) => {
      ocrConcurrencyQueue.push(resolve);
    });
  }
  activeOcrJobs += 1;
  const waitMs = Date.now() - waitStart;
  if (waitMs > 0) {
    console.log(`[OCR] Queue delay ${waitMs}ms for ${tag} (maxConcurrent=${OCR_MAX_CONCURRENT})`);
  }
}

function createDefaultOcrRegions() {
  return {
    crewHub: {
      leftPanel: { xMin: 0.0, xMax: 0.36, yMin: 0.10, yMax: 0.80 },
      rightPanel: { xMin: 0.45, xMax: 1.0, yMin: 0.10, yMax: 0.90 },
      enemyPanel: { xMin: 0.55, xMax: 1.0, yMin: 0.08, yMax: 0.95 },
      teamHeader: { xMin: 0.10, xMax: 0.45, yMin: 0.17, yMax: 0.23 },
      enemyName: { xMin: 0.63, xMax: 0.92, yMin: 0.08, yMax: 0.95 },
      enemyRow1TeamName: { xMin: 0.52, xMax: 0.74, yMin: 0.16, yMax: 0.23 },
      enemyRow1Players: { xMin: 0.74, xMax: 0.98, yMin: 0.16, yMax: 0.23 },
      enemyRow2TeamName: { xMin: 0.52, xMax: 0.74, yMin: 0.27, yMax: 0.34 },
      enemyRow2Players: { xMin: 0.74, xMax: 0.98, yMin: 0.27, yMax: 0.34 },
      enemyRow3TeamName: { xMin: 0.52, xMax: 0.74, yMin: 0.38, yMax: 0.45 },
      enemyRow3Players: { xMin: 0.74, xMax: 0.98, yMin: 0.38, yMax: 0.45 },
      enemyRow4TeamName: { xMin: 0.52, xMax: 0.74, yMin: 0.49, yMax: 0.56 },
      enemyRow4Players: { xMin: 0.74, xMax: 0.98, yMin: 0.49, yMax: 0.56 },
    },
    mapScreen: {
      yourShip: { xMin: 0.0, xMax: 0.30, yMin: 0.0, yMax: 0.25 },
      enemyShips: { xMin: 0.79, xMax: 0.98, yMin: 0.07, yMax: 0.22 },
      enemyShips2: { xMin: 0.79, xMax: 0.98, yMin: 0.22, yMax: 0.37 },
      enemyShips3: { xMin: 0.79, xMax: 0.98, yMin: 0.37, yMax: 0.52 },
      enemyShips4: { xMin: 0.79, xMax: 0.98, yMin: 0.52, yMax: 0.67 },
      hazards: { xMin: 0.79, xMax: 0.98, yMin: 0.07, yMax: 0.76 },
      players: { xMin: 0.0, xMax: 0.40, yMin: 0.70, yMax: 1.0 },
    },
  };
}

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function sanitizeRegionBounds(input, fallback) {
  const source = (input && typeof input === 'object') ? input : {};
  const base = fallback || { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  let xMin = clamp01(source.xMin, base.xMin);
  let xMax = clamp01(source.xMax, base.xMax);
  let yMin = clamp01(source.yMin, base.yMin);
  let yMax = clamp01(source.yMax, base.yMax);

  if (xMin >= xMax) {
    if (xMin >= 1) xMin = Math.max(0, xMax - 0.01);
    else xMax = Math.min(1, xMin + 0.01);
  }
  if (yMin >= yMax) {
    if (yMin >= 1) yMin = Math.max(0, yMax - 0.01);
    else yMax = Math.min(1, yMin + 0.01);
  }

  return { xMin, xMax, yMin, yMax };
}

function sanitizeOcrRegions(input) {
  const defaults = createDefaultOcrRegions();
  const source = (input && typeof input === 'object') ? input : {};
  const crewHub = (source.crewHub && typeof source.crewHub === 'object') ? source.crewHub : {};
  const mapScreen = (source.mapScreen && typeof source.mapScreen === 'object') ? source.mapScreen : {};

  return {
    crewHub: {
      leftPanel: sanitizeRegionBounds(crewHub.leftPanel, defaults.crewHub.leftPanel),
      rightPanel: sanitizeRegionBounds(crewHub.rightPanel || crewHub.enemyPanel, defaults.crewHub.rightPanel),
      enemyPanel: sanitizeRegionBounds(crewHub.enemyPanel || crewHub.rightPanel, defaults.crewHub.enemyPanel),
      teamHeader: sanitizeRegionBounds(crewHub.teamHeader, defaults.crewHub.teamHeader),
      enemyName: sanitizeRegionBounds(crewHub.enemyName, defaults.crewHub.enemyName),
      enemyRow1TeamName: sanitizeRegionBounds(crewHub.enemyRow1TeamName, defaults.crewHub.enemyRow1TeamName),
      enemyRow1Players: sanitizeRegionBounds(crewHub.enemyRow1Players, defaults.crewHub.enemyRow1Players),
      enemyRow2TeamName: sanitizeRegionBounds(crewHub.enemyRow2TeamName, defaults.crewHub.enemyRow2TeamName),
      enemyRow2Players: sanitizeRegionBounds(crewHub.enemyRow2Players, defaults.crewHub.enemyRow2Players),
      enemyRow3TeamName: sanitizeRegionBounds(crewHub.enemyRow3TeamName, defaults.crewHub.enemyRow3TeamName),
      enemyRow3Players: sanitizeRegionBounds(crewHub.enemyRow3Players, defaults.crewHub.enemyRow3Players),
      enemyRow4TeamName: sanitizeRegionBounds(crewHub.enemyRow4TeamName, defaults.crewHub.enemyRow4TeamName),
      enemyRow4Players: sanitizeRegionBounds(crewHub.enemyRow4Players, defaults.crewHub.enemyRow4Players),
    },
    mapScreen: {
      yourShip: sanitizeRegionBounds(mapScreen.yourShip, defaults.mapScreen.yourShip),
      enemyShips: sanitizeRegionBounds(mapScreen.enemyShips, defaults.mapScreen.enemyShips),
      enemyShips2: sanitizeRegionBounds(mapScreen.enemyShips2, defaults.mapScreen.enemyShips2),
      enemyShips3: sanitizeRegionBounds(mapScreen.enemyShips3, defaults.mapScreen.enemyShips3),
      enemyShips4: sanitizeRegionBounds(mapScreen.enemyShips4, defaults.mapScreen.enemyShips4),
      hazards: sanitizeRegionBounds(mapScreen.hazards, defaults.mapScreen.hazards),
      players: sanitizeRegionBounds(mapScreen.players, defaults.mapScreen.players),
    },
  };
}

function cloneRegions(regions) {
  return JSON.parse(JSON.stringify(regions || createDefaultOcrRegions()));
}

function clampNormalizedWindow(center, size, min = 0, max = 1) {
  const half = Math.max(0.005, size / 2);
  let start = Math.max(min, center - half);
  let end = Math.min(max, center + half);
  if (end <= start) {
    end = Math.min(max, start + 0.01);
  }
  return { start, end };
}

function findHeaderAnchorY(words, regexes = [], xMin = 0, xMax = 1, yMin = 0, yMax = 1) {
  if (!Array.isArray(words) || words.length === 0 || !Array.isArray(regexes) || regexes.length === 0) {
    return null;
  }
  const candidates = words.filter(w => {
    if (!w?.bbox || !w?.text) return false;
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    if (cx < xMin || cx > xMax || cy < yMin || cy > yMax) return false;
    const t = String(w.text || '').toUpperCase().replace(/[^A-Z]/g, '');
    return regexes.some(rx => rx.test(t));
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((best, w) => {
    const conf = Number(w.confidence || 0);
    if (!best || conf > best.conf) {
      return { conf, y: (w.bbox.y0 + w.bbox.y1) / 2 };
    }
    return best;
  }, null)?.y || null;
}

function deriveRuntimeAnchors(screenType, ocrResult, processed, ocrRegions) {
  const words = ocrResult?.allWords || ocrResult?.words || [];
  if (!Array.isArray(words) || words.length === 0 || !processed?.width || !processed?.height) {
    return null;
  }
  const width = processed.width;
  const height = processed.height;
  const anchors = { screenType, crewHub: {}, mapScreen: {} };

  if (screenType === SCREEN_TYPES.MAP_SCREEN) {
    const rightXMin = width * (ocrRegions?.mapScreen?.enemyShips?.xMin || 0.79);
    const rightXMax = width * 1.0;
    const enemyHeaderY = findHeaderAnchorY(
      words,
      [/^ENEMY$/, /^SHIPS?$/],
      rightXMin,
      rightXMax,
      0,
      height * 0.25
    );
    const hazardsHeaderY = findHeaderAnchorY(
      words,
      [/^KNOWN$/, /^HAZARDS?$/],
      rightXMin,
      width,
      height * 0.18,
      height * 0.75
    );
    if (enemyHeaderY != null) anchors.mapScreen.enemyShipsHeaderY = enemyHeaderY / height;
    if (hazardsHeaderY != null) anchors.mapScreen.hazardsHeaderY = hazardsHeaderY / height;
  } else if (screenType === SCREEN_TYPES.CREW_HUB) {
    const rightPanel = ocrRegions?.crewHub?.enemyPanel || ocrRegions?.crewHub?.rightPanel || { xMin: 0.55, xMax: 1.0, yMin: 0.08, yMax: 0.95 };
    const enemyCrewsY = findHeaderAnchorY(
      words,
      [/^ENEMY$/, /^CREWS?$/],
      width * rightPanel.xMin,
      width * rightPanel.xMax,
      height * 0.05,
      height * 0.35
    );
    if (enemyCrewsY != null) anchors.crewHub.enemyPanelTopY = enemyCrewsY / height;
  }

  if (Object.keys(anchors.mapScreen).length === 0 && Object.keys(anchors.crewHub).length === 0) {
    return null;
  }
  return anchors;
}

function applyRuntimeAnchors(ocrRegions, anchors) {
  if (!anchors) return cloneRegions(ocrRegions);
  const next = cloneRegions(ocrRegions);

  if (anchors.mapScreen?.enemyShipsHeaderY != null) {
    const headerY = anchors.mapScreen.enemyShipsHeaderY;
    const slotHeight = 0.105;
    const slotGap = 0.006;
    const firstStart = Math.max(0, headerY + 0.02);
    const keys = ['enemyShips', 'enemyShips2', 'enemyShips3', 'enemyShips4'];
    keys.forEach((key, idx) => {
      const start = firstStart + idx * (slotHeight + slotGap);
      const { start: yMin, end: yMax } = clampNormalizedWindow(start + (slotHeight / 2), slotHeight, 0, 0.98);
      next.mapScreen[key].yMin = yMin;
      next.mapScreen[key].yMax = yMax;
    });
  }

  if (anchors.mapScreen?.hazardsHeaderY != null) {
    const headerY = anchors.mapScreen.hazardsHeaderY;
    next.mapScreen.hazards.yMin = Math.max(0, headerY - 0.01);
    next.mapScreen.hazards.yMax = Math.min(1, headerY + 0.42);
  }

  if (anchors.crewHub?.enemyPanelTopY != null) {
    const top = Math.max(0.05, anchors.crewHub.enemyPanelTopY + 0.02);
    next.crewHub.enemyPanel.yMin = top;
    next.crewHub.rightPanel.yMin = top;
    next.crewHub.enemyName.yMin = top;
  }

  return next;
}

function getOcrRegionsCacheFingerprint(ocrRegions) {
  try {
    const payload = JSON.stringify(ocrRegions || createDefaultOcrRegions());
    return crypto.createHash('md5').update(payload).digest('hex').slice(0, 12);
  } catch {
    return 'default';
  }
}

function getImageHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function buildCacheKey(
  imageHash,
  activeUser = null,
  ocrMode = 'both',
  regionFingerprint = 'default',
  routingFingerprint = 'routing:default'
) {
  const normalizedUser = String(activeUser || '').trim().toLowerCase();
  const normalizedMode = String(ocrMode || 'both').trim().toLowerCase();
  return `${imageHash}|u:${normalizedUser}|m:${normalizedMode}|r:${regionFingerprint}|x:${String(routingFingerprint || 'routing:default')}`;
}

function getCachedResult(cacheKey) {
  const lookupStartedAt = Date.now();
  const entry = ocrResultCache.get(cacheKey);
  const lookupDurationMs = Date.now() - lookupStartedAt;
  if (entry) {
    recordCacheHit(lookupDurationMs);
    console.log(`[OCR Cache] HIT for ${cacheKey.split('|')[0].slice(0, 8)}...`);
    return entry.result;
  }
  recordCacheMiss();
  return null;
}

function setCachedResult(cacheKey, result, missDurationMs = null) {
  // Evict oldest if at capacity
  if (ocrResultCache.size >= OCR_CACHE_MAX) {
    const oldestKey = ocrResultCache.keys().next().value;
    ocrResultCache.delete(oldestKey);
    cacheStats.evictions += 1;
  }
  ocrResultCache.set(cacheKey, { result, timestamp: Date.now() });
  recordCacheMissDuration(missDurationMs);
  console.log(`[OCR Cache] STORE ${cacheKey.split('|')[0].slice(0, 8)}... (${ocrResultCache.size}/${OCR_CACHE_MAX})`);
}

// Save debug image
async function saveDebugImage(buffer, prefix = 'capture') {
  ensureDebugDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}_${timestamp}.png`;
  const filepath = path.join(DEBUG_DIR, filename);
  await fsPromises.writeFile(filepath, buffer);
  return filepath;
}

/**
 * Archive OCR input samples for offline corpus curation and retraining workflows.
 * Writes a PNG + JSON sidecar into userData/ocr-corpus-archive.
 */
async function archiveOcrSample(buffer, ocrText, metadata = {}) {
  try {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 64) return null;
    ensureCorpusArchiveDir();

    const sampleId = crypto.randomBytes(8).toString('hex');
    const imagePath = path.join(OCR_CORPUS_ARCHIVE_DIR, `${sampleId}.png`);
    const metadataPath = path.join(OCR_CORPUS_ARCHIVE_DIR, `${sampleId}.json`);

    if (sharp) {
      await sharp(buffer).png().toFile(imagePath);
    } else {
      await fsPromises.writeFile(imagePath, buffer);
    }

    const safeMetadata = (metadata && typeof metadata === 'object') ? metadata : {};
    await fsPromises.writeFile(metadataPath, JSON.stringify({
      sampleId,
      timestamp: Date.now(),
      ocrText: String(ocrText || '').slice(0, 100000),
      ...safeMetadata,
    }, null, 2), 'utf8');

    return { sampleId, imagePath, metadataPath };
  } catch (error) {
    console.warn('[OCR-Corpus] Failed to archive OCR sample:', error?.message || error);
    return null;
  }
}

const DICTIONARY_MATCH_LIMIT = 1000;
let activeUserWordsFile = null;
let latestDictionaryStats = null;

async function resolveExistingDictionaryFile() {
  const candidates = [OCR_USER_WORDS_FILE, ...OCR_USER_WORDS_FILE_FALLBACKS];
  const seen = new Set();
  for (const filePath of candidates) {
    const normalized = String(filePath || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    try {
      await fsPromises.access(normalized, fs.constants.F_OK);
      return normalized;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function buildTesseractWorkerParameters(userWordsFile = null, psm = null) {
  const params = { preserve_interword_spaces: '1' };
  if (userWordsFile && typeof userWordsFile === 'string' && userWordsFile.trim()) {
    params.user_words_file = userWordsFile;
  }
  if (psm !== null && Number.isInteger(psm) && psm >= 0 && psm <= 13) {
    params.tessedit_pageseg_mode = String(psm);
  }
  return params;
}

function sanitizePilotRegistryForDictionary(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function sanitizeDictionaryMatchHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-DICTIONARY_MATCH_LIMIT)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const teammates = Array.isArray(entry.teammates) ? entry.teammates.filter(v => typeof v === 'string') : [];
      const opponents = Array.isArray(entry.opponents) ? entry.opponents.filter(v => typeof v === 'string') : [];
      const opponentTeams = Array.isArray(entry.opponentTeams)
        ? entry.opponentTeams.map((team) => {
          const players = Array.isArray(team?.players) ? team.players.filter(v => typeof v === 'string') : [];
          return players.length > 0 ? { players } : null;
        }).filter(Boolean)
        : [];
      return {
        player: typeof entry.player === 'string' ? entry.player : '',
        teammates,
        opponents,
        opponentTeams,
      };
    })
    .filter(Boolean);
}

async function applyDictionaryToWorkers(userWordsFile) {
  activeUserWordsFile = userWordsFile || null;
  if (!Array.isArray(tesseractWorkers) || tesseractWorkers.length === 0) {
    return { appliedWorkers: 0 };
  }

  const params = buildTesseractWorkerParameters(activeUserWordsFile);
  let appliedWorkers = 0;

  await Promise.all(tesseractWorkers.map(async (worker, index) => {
    try {
      await worker.setParameters(params);
      appliedWorkers += 1;
    } catch (error) {
      console.warn(`[OCR-Dict] Failed applying dictionary to worker ${index}:`, error?.message || error);
    }
  }));

  return { appliedWorkers };
}

// Dedicated eng-only worker for crew hub player name extraction.
// Rationale: eng+chi_sim OCR (used by the main pool) reliably reads the
// coloured ship-name bars, but it *mangles* player name text (e.g., "Scipion"
// becomes "ai"+"hr" garbage).  eng-only reads those same player names correctly
// (c≥90) while producing c=0 garble for the coloured bars — which is fine
// because garbled words get filtered out by isValidOpponentName anyway.
let engOnlyWorker = null;

// Tesseract worker pool (scheduler + multiple workers)
const DEFAULT_WORKER_POOL_SIZE = CPU_COUNT >= 8 ? 2 : 1;
const WORKER_POOL_SIZE = Math.min(4, Math.max(1, parseInt(process.env.WILDGATE_OCR_WORKER_POOL_SIZE || String(DEFAULT_WORKER_POOL_SIZE), 10) || DEFAULT_WORKER_POOL_SIZE));
let tesseractScheduler = null;
let tesseractWorkers = [];
let schedulerReady = null; // Promise that resolves when pool is initialized

/**
 * Get or create Tesseract worker pool via scheduler.
 * Uses 3 parallel workers for concurrent OCR processing.
 */
async function getTesseractScheduler() {
  if (tesseractScheduler && tesseractWorkers.length > 0) return tesseractScheduler;

  if (!Tesseract) {
    console.log('[OCR] Loading Tesseract.js module...');
    Tesseract = require('tesseract.js');
    console.log('[OCR] Tesseract.js module loaded');
  }

  if (!activeUserWordsFile) {
    activeUserWordsFile = await resolveExistingDictionaryFile();
  }

  console.log(`[OCR] Initializing Tesseract worker pool (${WORKER_POOL_SIZE} workers, eng+chi_sim)...`);
  if (activeUserWordsFile) {
    console.log(`[OCR-Dict] Applying user words file: ${activeUserWordsFile}`);
  }
  tesseractScheduler = Tesseract.createScheduler();

  for (let i = 0; i < WORKER_POOL_SIZE; i++) {
    const worker = await Tesseract.createWorker('eng+chi_sim', 1, {
      logger: m => {
        if (m.status && m.progress === 1) {
          console.log(`[OCR] Worker ${i}: ${m.status}`);
        }
      },
      cacheMethod: 'readOnly',
    });
    await worker.setParameters(buildTesseractWorkerParameters(activeUserWordsFile));
    tesseractScheduler.addWorker(worker);
    tesseractWorkers.push(worker);
    console.log(`[OCR] Worker ${i + 1}/${WORKER_POOL_SIZE} ready`);
  }

  console.log(`[OCR] Worker pool ready (${WORKER_POOL_SIZE} workers)`);
  return tesseractScheduler;
}

// Backward-compatible: getTesseractWorker returns the first worker (for setParameters calls etc.)
async function getTesseractWorker() {
  await getTesseractScheduler();
  return tesseractWorkers[0];
}

// Cleanup workers on app quit
app.on('before-quit', async () => {
  if (tesseractScheduler) {
    await tesseractScheduler.terminate();
    tesseractScheduler = null;
    tesseractWorkers = [];
  }
  if (engOnlyWorker) {
    try { await engOnlyWorker.terminate(); } catch {}
    engOnlyWorker = null;
  }
});

/**
 * Lazy-init a single eng-only Tesseract worker used exclusively for the
 * crew hub enemy-name band.  eng-only reads player names far better than
 * eng+chi_sim in this context (see comment on engOnlyWorker declaration).
 */
async function getEngOnlyWorker() {
  if (engOnlyWorker) return engOnlyWorker;
  if (!Tesseract) {
    Tesseract = require('tesseract.js');
  }
  console.log('[OCR-EngOnly] Initializing eng-only worker for crew hub player names...');
  engOnlyWorker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status && m.progress === 1) {
        console.log('[OCR-EngOnly]', m.status);
      }
    },
    cacheMethod: 'readOnly',
  });
  await engOnlyWorker.setParameters({ preserve_interword_spaces: '1' });
  console.log('[OCR-EngOnly] eng-only worker ready');
  return engOnlyWorker;
}

/**
 * Run an OCR pass using the eng-only worker.
 * Returns { words, allWords, text } in the same shape as runOCR().
 */
async function runOCREngOnly(imageBuffer, psm = null) {
  const worker = await getEngOnlyWorker();
  if (psm !== null) {
    try {
      await worker.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: '1' });
    } catch {}
  }
  const result = await worker.recognize(imageBuffer);
  const text = result?.data?.text || '';
  const words = [];
  try {
    const blocks = result?.data?.blocks || [];
    for (const block of blocks) {
      for (const para of block?.paragraphs || []) {
        for (const line of para?.lines || []) {
          for (const w of line?.words || []) {
            words.push(w);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[OCR-EngOnly] Failed to extract word hierarchy:', e.message);
  }
  return { words, allWords: words, text };
}

/**
 * Capture the game window (primary display)
 */
async function captureGameWindow() {
  try {
    if (!screenshot) {
      screenshot = require('screenshot-desktop');
    }

    console.log('[OCR] Capturing screen...');

    const imgBuffer = await screenshot({ format: 'png' });

    // Debug save is handled by processCapture to avoid duplicates
    console.log('[OCR] Screen captured, size:', imgBuffer.length);

    return {
      success: true,
      imageBase64: imgBuffer.toString('base64'),
      width: 0,
      height: 0,
    };
  } catch (error) {
    console.error('[OCR] Capture failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Preprocess image for better OCR results
 * - Scale up small images
 * - Enhance contrast
 * - Sharpen text
 */
async function preprocessImage(imageBuffer) {
  try {
    if (!sharp) {
      console.log('[OCR] Loading sharp module...');
      try {
        sharp = require('sharp');
        if (typeof sharp.concurrency === 'function') {
          sharp.concurrency(OCR_SHARP_CONCURRENCY);
          console.log(`[OCR] sharp concurrency set to ${OCR_SHARP_CONCURRENCY}`);
        }
        console.log('[OCR] Sharp module loaded successfully');
      } catch (sharpError) {
        console.warn('[OCR] Sharp module not available, skipping preprocessing:', sharpError.message);
        return {
          buffer: imageBuffer,
          scale: 1,
          width: 1920,
          height: 1080,
          originalWidth: 1920,
          originalHeight: 1080,
        };
      }
    }

    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    const sourceWidth = Number(metadata.width) || 1920;
    const sourceHeight = Number(metadata.height) || 1080;
    // Three-way scaling policy:
    // <2000px => 2x upsample, 2000-maxWidth => keep, >maxWidth => downscale to maxWidth.
    const preprocessMode = sourceWidth < 2000 ? 'upsample_2x'
      : (sourceWidth > OCR_PREPROCESS_DOWNSCALE_WIDTH ? 'downscale_cap' : 'keep_native');
    const scale = sourceWidth < 2000
      ? 2
      : (sourceWidth > OCR_PREPROCESS_DOWNSCALE_WIDTH ? (OCR_PREPROCESS_DOWNSCALE_WIDTH / sourceWidth) : 1);
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const processed = await image
      .resize(targetWidth, targetHeight, {
        kernel: sharp.kernel.lanczos3,
      })
      .modulate({
        brightness: 1.1,
        saturation: 1.0, // FIXED: Keep colors intact for team color detection (was 0.8)
      })
      .linear(1.2, -(0.2 * 128)) // Add contrast enhancement
      .sharpen({
        sigma: 1,
        m1: 1,
        m2: 0.5,
      })
      .png()
      .toBuffer();

    return {
      buffer: processed,
      scale,
      width: targetWidth,
      height: targetHeight,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
      preprocessMeta: {
        mode: preprocessMode,
        downscaleCapWidth: OCR_PREPROCESS_DOWNSCALE_WIDTH,
      },
    };
  } catch (error) {
    console.error('[OCR] Preprocessing failed:', error);
    return {
      buffer: imageBuffer,
      scale: 1,
      width: 1920,
      height: 1080,
      originalWidth: 1920,
      originalHeight: 1080,
    };
  }
}

const REGION_OCR_SCALE = Math.min(6, Math.max(1, parseInt(process.env.WILDGATE_OCR_REGION_SCALE || '3', 10) || 3));
const REGION_MIN_DIMENSION = 20;

function resolveRegionPixels(region, fullWidth, fullHeight, minDimension = REGION_MIN_DIMENSION) {
  if (!region || !Number.isFinite(fullWidth) || !Number.isFinite(fullHeight) || fullWidth <= 0 || fullHeight <= 0) {
    return null;
  }

  const left = Math.max(0, Math.min(fullWidth - 1, Math.round(fullWidth * region.xMin)));
  const top = Math.max(0, Math.min(fullHeight - 1, Math.round(fullHeight * region.yMin)));
  const rawWidth = Math.round(fullWidth * (region.xMax - region.xMin));
  const rawHeight = Math.round(fullHeight * (region.yMax - region.yMin));
  const cropWidth = Math.max(1, Math.min(fullWidth - left, rawWidth));
  const cropHeight = Math.max(1, Math.min(fullHeight - top, rawHeight));

  if (cropWidth < minDimension || cropHeight < minDimension) {
    return null;
  }

  return { left, top, cropWidth, cropHeight };
}

async function preprocessRegionCropFirst(
  imageBuffer,
  regionPixels,
  scale = REGION_OCR_SCALE,
  fontProfile = 'default'
) {
  const isEalingProfile = String(fontProfile || '').toLowerCase() === 'ealing-black-italic';
  const brightness = isEalingProfile ? 1.28 : 1.2;
  const contrastAlpha = isEalingProfile ? 1.8 : 1.5;
  const contrastBeta = isEalingProfile ? -(0.55 * 128) : -(0.5 * 128);
  const sharpen = isEalingProfile
    ? { sigma: 1.9, m1: 1.8, m2: 0.8 }
    : { sigma: 1.5, m1: 1.5, m2: 0.7 };

  return await sharp(imageBuffer)
    .extract({
      left: regionPixels.left,
      top: regionPixels.top,
      width: regionPixels.cropWidth,
      height: regionPixels.cropHeight,
    })
    .resize(regionPixels.cropWidth * scale, regionPixels.cropHeight * scale, {
      kernel: sharp.kernel.lanczos3,
    })
    .grayscale()
    .modulate({ brightness })
    .linear(contrastAlpha, contrastBeta)
    .sharpen(sharpen)
    .png()
    .toBuffer();
}

async function preprocessFullImageForRegionBenchmark(imageBuffer, fullWidth, fullHeight, scale = REGION_OCR_SCALE) {
  return await sharp(imageBuffer)
    .resize(fullWidth * scale, fullHeight * scale, {
      kernel: sharp.kernel.lanczos3,
    })
    .grayscale()
    .modulate({ brightness: 1.2 })
    .linear(1.5, -(0.5 * 128))
    .sharpen({ sigma: 1.5, m1: 1.5, m2: 0.7 })
    .png()
    .toBuffer();
}

async function preprocessRegionFromPreprocessedFull(preprocessedFullBuffer, regionPixels, scale = REGION_OCR_SCALE) {
  return await sharp(preprocessedFullBuffer)
    .extract({
      left: regionPixels.left * scale,
      top: regionPixels.top * scale,
      width: regionPixels.cropWidth * scale,
      height: regionPixels.cropHeight * scale,
    })
    .png()
    .toBuffer();
}

function resolveBenchmarkRegions(ocrRegions, fullWidth, fullHeight) {
  const candidates = [
    { key: 'mapScreen.players', region: ocrRegions.mapScreen.players },
    { key: 'mapScreen.yourShip', region: ocrRegions.mapScreen.yourShip },
    { key: 'mapScreen.enemyShips', region: ocrRegions.mapScreen.enemyShips },
    { key: 'mapScreen.enemyShips2', region: ocrRegions.mapScreen.enemyShips2 },
    { key: 'mapScreen.enemyShips3', region: ocrRegions.mapScreen.enemyShips3 },
    { key: 'mapScreen.enemyShips4', region: ocrRegions.mapScreen.enemyShips4 },
    { key: 'mapScreen.hazards', region: ocrRegions.mapScreen.hazards },
  ];

  return candidates
    .map((candidate) => {
      const pixels = resolveRegionPixels(candidate.region, fullWidth, fullHeight);
      if (!pixels) return null;
      return { key: candidate.key, pixels };
    })
    .filter(Boolean);
}

function sanitizeBenchmarkIterations(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(20, Math.round(parsed)));
}

function speedupPercent(oldMs, newMs) {
  if (!Number.isFinite(oldMs) || oldMs <= 0 || !Number.isFinite(newMs)) return 0;
  return ((oldMs - newMs) / oldMs) * 100;
}

async function benchmarkRegionPreprocessing(imageBuffer, ocrRegions, iterations = 10) {
  if (!sharp) {
    throw new Error('sharp not available');
  }

  const metadata = await sharp(imageBuffer).metadata();
  const fullWidth = Number(metadata.width || 0);
  const fullHeight = Number(metadata.height || 0);

  if (fullWidth < 1 || fullHeight < 1) {
    throw new Error('Unable to read benchmark image dimensions');
  }

  const benchmarkRegions = resolveBenchmarkRegions(ocrRegions, fullWidth, fullHeight);
  if (benchmarkRegions.length === 0) {
    throw new Error('No benchmark regions available after sanitization');
  }

  const normalizedIterations = sanitizeBenchmarkIterations(iterations);
  const perIteration = [];
  let oldTotalMs = 0;
  let newTotalMs = 0;

  for (let index = 0; index < normalizedIterations; index += 1) {
    const oldStart = Date.now();
    const preprocessedFull = await preprocessFullImageForRegionBenchmark(
      imageBuffer,
      fullWidth,
      fullHeight
    );
    for (const region of benchmarkRegions) {
      await preprocessRegionFromPreprocessedFull(preprocessedFull, region.pixels);
    }
    const oldMs = Date.now() - oldStart;

    const newStart = Date.now();
    for (const region of benchmarkRegions) {
      await preprocessRegionCropFirst(imageBuffer, region.pixels);
    }
    const newMs = Date.now() - newStart;

    oldTotalMs += oldMs;
    newTotalMs += newMs;
    perIteration.push({
      iteration: index + 1,
      oldMs,
      newMs,
      speedupPercent: Number(speedupPercent(oldMs, newMs).toFixed(2)),
    });
  }

  const oldAvgMs = oldTotalMs / normalizedIterations;
  const newAvgMs = newTotalMs / normalizedIterations;
  const speedup = speedupPercent(oldAvgMs, newAvgMs);
  const speedupFactor = newAvgMs > 0 ? oldAvgMs / newAvgMs : 0;

  return {
    iterations: normalizedIterations,
    regionCount: benchmarkRegions.length,
    regions: benchmarkRegions.map(region => region.key),
    image: { width: fullWidth, height: fullHeight },
    oldAvgMs: Number(oldAvgMs.toFixed(2)),
    newAvgMs: Number(newAvgMs.toFixed(2)),
    speedupPercent: Number(speedup.toFixed(2)),
    speedupFactor: Number(speedupFactor.toFixed(2)),
    perIteration,
  };
}

/**
 * Crop a region from an image, upscale aggressively, and run a dedicated OCR pass.
 * Returns OCR words with bounding boxes mapped back to the full-image coordinate space.
 *
 * @param {Buffer} imageBuffer - Original (un-preprocessed) image buffer
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} region - Percentage-based region
 * @param {number} fullWidth - Full image width (pixels)
 * @param {number} fullHeight - Full image height (pixels)
 * @returns {Promise<{ words: Array, text: string } | null>}
 */
async function cropRegionAndOCR(
  imageBuffer,
  region,
  fullWidth,
  fullHeight,
  psm = null,
  fontProfile = 'default'
) {
  if (!sharp) {
    console.warn('[OCR-Region] sharp not available, skipping region OCR');
    return null;
  }

  try {
    const regionPixels = resolveRegionPixels(region, fullWidth, fullHeight);
    if (!regionPixels) {
      console.warn('[OCR-Region] Crop region too small, skipping');
      return null;
    }

    const { left, top, cropWidth, cropHeight } = regionPixels;

    console.log(`[OCR-Region] Cropping region: ${left},${top} ${cropWidth}x${cropHeight} from ${fullWidth}x${fullHeight}`);

    const cropped = await preprocessRegionCropFirst(imageBuffer, regionPixels, REGION_OCR_SCALE, fontProfile);

    console.log(`[OCR-Region] Cropped+upscaled buffer: ${cropped.length} bytes`);

    // Run dedicated Tesseract pass on the cropped region
    const regionOCR = await runOCR(cropped, psm);
    if (!regionOCR || !regionOCR.words || regionOCR.words.length === 0) {
      console.log('[OCR-Region] No words detected in cropped region');
      return null;
    }

    console.log(`[OCR-Region] Detected ${regionOCR.words.length} words in cropped region`);

    // Map bounding boxes back to full-image coordinate space
    const scaledCropWidth = cropWidth * REGION_OCR_SCALE;
    const scaledCropHeight = cropHeight * REGION_OCR_SCALE;

    const mappedWords = regionOCR.words.map(w => ({
      ...w,
      bbox: {
        x0: left + (w.bbox.x0 / scaledCropWidth) * cropWidth,
        y0: top + (w.bbox.y0 / scaledCropHeight) * cropHeight,
        x1: left + (w.bbox.x1 / scaledCropWidth) * cropWidth,
        y1: top + (w.bbox.y1 / scaledCropHeight) * cropHeight,
      },
    }));

    return {
      words: mappedWords,
      text: regionOCR.text || '',
    };
  } catch (error) {
    console.error('[OCR-Region] Crop+OCR failed:', error.message);
    return null;
  }
}

/**
 * Run OCR on image buffer
 * Returns structured data with words, lines, and text
 */
async function runOCR(imageBuffer, psm = null) {
  const scheduler = await getTesseractScheduler();

  console.log(`[OCR] Running recognition (worker pool)${psm !== null ? ` PSM=${psm}` : ''}...`);
  const startTime = Date.now();

  // Apply per-recognition PSM when explicitly requested.
  if (psm !== null) {
    try {
      await scheduler.addJob('setParameters', buildTesseractWorkerParameters(activeUserWordsFile, psm));
    } catch {
      // Non-critical: recognition can proceed with existing params.
    }
  }

  const result = await scheduler.addJob('recognize', imageBuffer);

  console.log(`[OCR] Recognition complete in ${Date.now() - startTime}ms`);

  // Extract from hierarchical structure
  const text = result?.data?.text || '';
  const confidence = result?.data?.confidence || 0;

  let words = [];
  let lines = [];

  try {
    const blocks = result?.data?.blocks || [];
    for (const block of blocks) {
      const paragraphs = block?.paragraphs || [];
      for (const para of paragraphs) {
        const paraLines = para?.lines || [];
        for (const line of paraLines) {
          lines.push(line);
          const lineWords = line?.words || [];
          words.push(...lineWords);
        }
      }
    }
    console.log('[OCR] Extracted:', { blocks: blocks.length, lines: lines.length, words: words.length });
  } catch (e) {
    console.warn('[OCR] Failed to extract from hierarchy:', e.message);
  }

  const filteredWords = words.filter(w => (w?.confidence || 0) >= LOW_WORD_CONFIDENCE_THRESHOLD);
  console.log(`[OCR] Extracted: ${text.length} chars, ${filteredWords.length} words, ${lines.length} lines`);

  return {
    text,
    confidence,
    words: filteredWords
      .map(w => ({
        text: w?.text || '',
        confidence: w?.confidence || 0,
        bbox: w?.bbox ? {
          x0: w.bbox.x0 || 0,
          y0: w.bbox.y0 || 0,
          x1: w.bbox.x1 || 0,
          y1: w.bbox.y1 || 0,
        } : { x0: 0, y0: 0, x1: 0, y1: 0 },
      })),
    lines: lines.map(l => ({
      text: l?.text || '',
      confidence: l?.confidence || 0,
      bbox: l?.bbox ? {
        x0: l.bbox.x0 || 0,
        y0: l.bbox.y0 || 0,
        x1: l.bbox.x1 || 0,
        y1: l.bbox.y1 || 0,
      } : { x0: 0, y0: 0, x1: 0, y1: 0 },
    })),
  };
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDebugWord(word, scaleDivisor = 1, maxWidth = Infinity, maxHeight = Infinity) {
  const safeScale = Number.isFinite(scaleDivisor) && scaleDivisor > 0 ? scaleDivisor : 1;
  const text = typeof word?.text === 'string' ? word.text : '';
  const confidence = Math.max(0, Math.min(100, toFiniteNumber(word?.confidence, 0)));

  const rawX0 = toFiniteNumber(word?.bbox?.x0, 0) / safeScale;
  const rawY0 = toFiniteNumber(word?.bbox?.y0, 0) / safeScale;
  const rawX1 = toFiniteNumber(word?.bbox?.x1, 0) / safeScale;
  const rawY1 = toFiniteNumber(word?.bbox?.y1, 0) / safeScale;

  const boundedX0 = Math.max(0, Math.min(maxWidth, rawX0));
  const boundedY0 = Math.max(0, Math.min(maxHeight, rawY0));
  const boundedX1 = Math.max(0, Math.min(maxWidth, rawX1));
  const boundedY1 = Math.max(0, Math.min(maxHeight, rawY1));

  const x0 = Math.min(boundedX0, boundedX1);
  const y0 = Math.min(boundedY0, boundedY1);
  const x1 = Math.max(boundedX0, boundedX1);
  const y1 = Math.max(boundedY0, boundedY1);

  return {
    text,
    confidence,
    bbox: { x0, y0, x1, y1 },
  };
}

/**
 * Build optional OCR debug payload with word-level bounding boxes.
 * Local/merged mode uses local OCR words mapped back to original image coordinates.
 * Cloud mode uses cloud coordinates as-is (already in original image space).
 * Words are filtered to only include those inside the active ROI regions for the detected screen type.
 */
function buildOcrBoundingBoxDebugPayload(ocrSource, ocrResult, localOCRForFallback, processed, screenType, ocrRegions) {
  const imageWidth = Math.max(1, toFiniteNumber(processed?.originalWidth, processed?.width || 0));
  const imageHeight = Math.max(1, toFiniteNumber(processed?.originalHeight, processed?.height || 0));
  const scale = Number.isFinite(processed?.scale) && processed.scale > 0 ? processed.scale : 1;

  // Collect all ROI bounds for the detected screen type (normalized 0-1)
  const roiBounds = collectRoiBounds(screenType, ocrRegions);

  function filterByRoi(normalizedWords) {
    if (roiBounds.length === 0) return normalizedWords;
    return normalizedWords.filter(w => {
      if (!w.bbox) return false;
      const cx = ((w.bbox.x0 + w.bbox.x1) / 2) / imageWidth;
      const cy = ((w.bbox.y0 + w.bbox.y1) / 2) / imageHeight;
      return roiBounds.some(b => cx >= b.xMin && cx <= b.xMax && cy >= b.yMin && cy <= b.yMax);
    });
  }

  if (ocrSource === 'cloud') {
    const cloudWords = Array.isArray(ocrResult?.words) ? ocrResult.words : [];
    const normalized = cloudWords.map(word => normalizeDebugWord(word, 1, imageWidth, imageHeight));
    return {
      source: 'cloud',
      imageWidth,
      imageHeight,
      words: filterByRoi(normalized),
    };
  }

  const localWords = Array.isArray(localOCRForFallback?.words) && localOCRForFallback.words.length > 0
    ? localOCRForFallback.words
    : (Array.isArray(ocrResult?.words) ? ocrResult.words : []);
  const normalized = localWords.map(word => normalizeDebugWord(word, scale, imageWidth, imageHeight));

  return {
    source: 'local',
    imageWidth,
    imageHeight,
    words: filterByRoi(normalized),
  };
}

/**
 * Collect all ROI region bounds for the given screen type.
 * Returns an array of normalized {xMin, xMax, yMin, yMax} (0-1) bounds.
 * If no valid regions, returns empty array (no filtering).
 */
function collectRoiBounds(screenType, ocrRegions) {
  if (!ocrRegions) return [];
  const bounds = [];
  const addBound = (region) => {
    if (region && typeof region === 'object' &&
        Number.isFinite(region.xMin) && Number.isFinite(region.xMax) &&
        Number.isFinite(region.yMin) && Number.isFinite(region.yMax)) {
      bounds.push(region);
    }
  };

  if (screenType === SCREEN_TYPES.CREW_HUB && ocrRegions.crewHub) {
    for (const region of Object.values(ocrRegions.crewHub)) {
      addBound(region);
    }
  } else if (screenType === SCREEN_TYPES.MAP_SCREEN && ocrRegions.mapScreen) {
    for (const region of Object.values(ocrRegions.mapScreen)) {
      addBound(region);
    }
  } else {
    // Unknown screen type — collect all regions from both screen types
    if (ocrRegions.crewHub) {
      for (const region of Object.values(ocrRegions.crewHub)) addBound(region);
    }
    if (ocrRegions.mapScreen) {
      for (const region of Object.values(ocrRegions.mapScreen)) addBound(region);
    }
  }
  return bounds;
}

// ─── CJK Detection ───
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/;

/**
 * Compute Levenshtein distance between two strings
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Compute Levenshtein similarity (0..1) between two strings
 */
function levenshteinSimilarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Compute bounding-box Intersection over Union (IoU)
 */
function bboxIoU(a, b) {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (inter === 0) return 0;
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  return inter / (areaA + areaB - inter);

}

/**
 * Extract modifiers/hazards from text
 * Used for both screen types
 */
function extractModifiers(text) {
  const modifiers = [];
  const upperText = (text || '').toUpperCase();

  for (const [pattern, displayName] of Object.entries(KNOWN_HAZARDS)) {
    if (upperText.includes(pattern)) {
      modifiers.push({
        name: displayName,
        confidence: 95,
        rawText: pattern,
      });
    }
  }

  return modifiers;
}

function mergeModifierLists(primary = [], fallback = []) {
  const merged = [];
  const byName = new Map();

  [...primary, ...fallback].forEach(mod => {
    const name = String(mod?.name || mod || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const confidence = typeof mod?.confidence === 'number' ? mod.confidence : 80;
    const rawText = String(mod?.rawText || name);

    if (!byName.has(key)) {
      const entry = { name, confidence, rawText };
      byName.set(key, entry);
      merged.push(entry);
      return;
    }

    const existing = byName.get(key);
    if (confidence > existing.confidence) {
      existing.confidence = confidence;
      existing.rawText = rawText;
    }
  });

  return merged;
}

function normalizeNameList(input) {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input
    .map(v => String(v || '').trim())
    .filter(Boolean)));
}

function mergeGeminiRefinement(extractedData, geminiData) {
  if (!geminiData || typeof geminiData !== 'object') {
    return { data: extractedData, contributed: false };
  }

  const out = { ...extractedData };
  let contributed = false;

  // Ship refinement
  const gemShip = geminiData.playerShip?.shipType || null;
  if (gemShip && (!out.playerShip?.shipType || out.playerShip.shipType === 'Unknown')) {
    out.playerShip = {
      ...(out.playerShip || {}),
      shipType: gemShip,
      confidence: Math.max(75, out.playerShip?.confidence || 0),
    };
    contributed = true;
  }

  // Teammate refinement (append unique)
  const gemTeammates = normalizeNameList(geminiData.teammates);
  if (gemTeammates.length > 0) {
    const existing = new Set((out.teammates || []).map(t => String(t.name || '').toLowerCase()));
    const merged = [...(out.teammates || [])];
    gemTeammates.forEach(name => {
      if (!existing.has(name.toLowerCase())) {
        merged.push({ name, confidence: 86, isTeammate: true });
        existing.add(name.toLowerCase());
        contributed = true;
      }
    });
    out.teammates = merged;
  }

  // Opponent team refinement (append by teamName/color)
  if (Array.isArray(geminiData.opponentTeams) && geminiData.opponentTeams.length > 0) {
    const existingTeams = [...(out.opponentTeams || [])];
    geminiData.opponentTeams.forEach(team => {
      const teamName = String(team?.teamName || 'Unknown Team');
      const color = String(team?.color || 'unknown');
      const idx = existingTeams.findIndex(t =>
        String(t.teamName || '').toLowerCase() === teamName.toLowerCase() ||
        (color !== 'unknown' && String(t.color || '').toLowerCase() === color.toLowerCase())
      );

      const newPlayers = normalizeNameList(team?.players).map(name => ({
        name,
        confidence: 84,
        isTeammate: false,
      }));

      if (idx === -1) {
        existingTeams.push({
          teamName,
          shipType: team?.shipType || '',
          color,
          players: newPlayers,
          confidence: 82,
        });
        if (newPlayers.length > 0 || team?.shipType) contributed = true;
      } else {
        const existingNames = new Set((existingTeams[idx].players || []).map(p => String(p.name || '').toLowerCase()));
        newPlayers.forEach(p => {
          if (!existingNames.has(p.name.toLowerCase())) {
            (existingTeams[idx].players ||= []).push(p);
            existingNames.add(p.name.toLowerCase());
            contributed = true;
          }
        });
        if (!existingTeams[idx].shipType && team?.shipType) {
          existingTeams[idx].shipType = team.shipType;
          contributed = true;
        }
      }
    });
    out.opponentTeams = existingTeams;
  }

  // Modifier refinement (append unique by name)
  const gemMods = normalizeNameList(geminiData.reachModifiers);
  if (gemMods.length > 0) {
    const existingMods = new Set((out.reachModifiers || []).map(m => String(m.name || m || '').toLowerCase()));
    const mergedMods = [...(out.reachModifiers || [])];
    gemMods.forEach(name => {
      if (!existingMods.has(name.toLowerCase())) {
        mergedMods.push({ name, confidence: 82, rawText: name });
        existingMods.add(name.toLowerCase());
        contributed = true;
      }
    });
    out.reachModifiers = mergedMods;
  }

  if (!out.artifactType && geminiData.artifactType) {
    out.artifactType = geminiData.artifactType;
    contributed = true;
  }

  if (contributed) {
    out.overallConfidence = Math.min(99, Math.max(out.overallConfidence || 0, 82));
  }

  return { data: out, contributed };
}

function normalizeNameKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g, '');
}

function dedupeExtractedPlayers(players, maxCount = 4) {
  if (!Array.isArray(players)) return [];
  const byName = new Map();
  players.forEach((player) => {
    const rawName = typeof player === 'string' ? player : player?.name;
    const cleanedName = cleanupCrewHubPlayerName(String(rawName || ''));
    const key = normalizeNameKey(cleanedName);
    if (!key || !cleanedName) return;
    const confidence = Number(player?.confidence || 0);
    const existing = byName.get(key);
    if (!existing || confidence > existing.confidence) {
      byName.set(key, {
        name: cleanedName,
        confidence: Math.max(60, Math.min(99, confidence || 74)),
        isTeammate: player?.isTeammate,
      });
    }
  });
  return [...byName.values()]
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    .slice(0, Math.max(1, Number(maxCount || 4)));
}

function extractCrewHubNamesFromWords(words, imageWidth, imageHeight) {
  if (!Array.isArray(words) || words.length === 0) return [];
  const lines = groupCrewHubWordsIntoLines(words, imageHeight, imageWidth);
  const names = [];
  for (const line of lines) {
    const parsed = extractCrewHubPlayerNameFromLine(line?.words || []);
    const cleaned = cleanupCrewHubPlayerName(String(parsed || ''));
    if (!cleaned) continue;
    if (!isValidCrewHubPlayerName(cleaned)) continue;
    const avgConfidence = Array.isArray(line?.words) && line.words.length > 0
      ? (line.words.reduce((sum, word) => sum + Number(word?.confidence || 0), 0) / line.words.length)
      : 74;
    names.push({
      name: cleaned,
      confidence: Math.max(60, Math.min(99, Number.isFinite(avgConfidence) ? avgConfidence : 74)),
    });
  }
  return dedupeExtractedPlayers(names, 4);
}

function computeFieldConfidence(extractedData) {
  const teammateConfidences = Array.isArray(extractedData?.teammates)
    ? extractedData.teammates.map((player) => Number(player?.confidence || 0)).filter((value) => value > 0)
    : [];
  const opponentConfidences = Array.isArray(extractedData?.opponentTeams)
    ? extractedData.opponentTeams.flatMap((team) => (
      Array.isArray(team?.players)
        ? team.players.map((player) => Number(player?.confidence || 0)).filter((value) => value > 0)
        : []
    ))
    : [];
  const modifierConfidences = Array.isArray(extractedData?.reachModifiers)
    ? extractedData.reachModifiers.map((mod) => Number(mod?.confidence || 0)).filter((value) => value > 0)
    : [];
  const average = (arr) => arr.length > 0
    ? (arr.reduce((sum, value) => sum + value, 0) / arr.length)
    : 0;

  return {
    teammateNames: average(teammateConfidences),
    opponentNames: average(opponentConfidences),
    ship: Number(extractedData?.playerShip?.confidence || 0),
    modifiers: average(modifierConfidences),
  };
}

function countUniqueExtractedNames(extractedData) {
  const keys = new Set();
  (extractedData?.teammates || []).forEach((player) => {
    const key = normalizeNameKey(player?.name);
    if (key) keys.add(key);
  });
  (extractedData?.opponentTeams || []).forEach((team) => {
    (team?.players || []).forEach((player) => {
      const key = normalizeNameKey(player?.name);
      if (key) keys.add(key);
    });
  });
  return keys.size;
}

function getNameConfidenceFloor(fieldConfidence) {
  const values = [Number(fieldConfidence?.teammateNames || 0), Number(fieldConfidence?.opponentNames || 0)]
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return 0;
  return Math.min(...values);
}

function normalizeConfidence01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (numeric <= 1) return numeric;
  return Math.max(0, Math.min(1, numeric / 100));
}

/**
 * Main processing function
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} activeUser - Current user's display name (for anchor)
 * @param {Object} existingData - Previous capture data to merge with
 * @param {string} ocrMode - OCR engine mode: 'local', 'cloud', 'both', or 'hybrid-plus'
 * @returns {Object} Processed OCR result
 */
async function processCapture(imageBase64, activeUser = null, existingData = null, ocrMode = 'local', options = {}) {
  await acquireOcrSlot(`processCapture:${ocrMode}`);
  const captureStart = Date.now();
  let tempOcrPath = null;
  try {
    const {
      sourceImagePath = null,
      skipDebugSave = false,
      forceUncached = false,
      ocrRegions: rawOcrRegions = null,
      screenTypeHint: rawScreenTypeHint = null,
      includeBboxes: rawIncludeBboxes = false,
      archiveOcrSample: rawArchiveOcrSample = false,
      archiveMetadata: rawArchiveMetadata = null,
      routingProfile: rawRoutingProfile = 'default',
      fontProfile: rawFontProfile = 'default',
      nameRerouteThreshold: rawNameRerouteThreshold = 78,
      maxReroutePasses: rawMaxReroutePasses = 1,
    } = options;
    const includeBboxes = rawIncludeBboxes === true;
    const shouldArchiveOcrSample = rawArchiveOcrSample === true;
    const archiveMetadata = (rawArchiveMetadata && typeof rawArchiveMetadata === 'object')
      ? rawArchiveMetadata
      : {};
    const routingProfile = rawRoutingProfile === 'names-only' ? 'names-only' : 'default';
    const fontProfile = rawFontProfile === 'ealing-black-italic' ? 'ealing-black-italic' : 'default';
    const nameRerouteThreshold = Math.max(50, Math.min(95, Number(rawNameRerouteThreshold) || 78));
    const maxReroutePasses = Math.max(0, Math.min(2, Math.round(Number(rawMaxReroutePasses) || 1)));
    const ocrRegions = sanitizeOcrRegions(rawOcrRegions);
    const inferredScreenType =
      (typeof rawScreenTypeHint === 'string' ? rawScreenTypeHint : '')
      || (typeof existingData?.screenshotType === 'string' ? existingData.screenshotType : '');
    const normalizedScreenTypeHint = String(inferredScreenType || '').trim().toLowerCase();
    const hintedScreenType = (
      normalizedScreenTypeHint === 'crewhub' ||
      normalizedScreenTypeHint === 'crew_hub'
    ) ? SCREEN_TYPES.CREW_HUB : (
      normalizedScreenTypeHint === 'mapscreen' ||
      normalizedScreenTypeHint === 'map_screen' ||
      normalizedScreenTypeHint === 'tactical_map'
    ) ? SCREEN_TYPES.MAP_SCREEN : null;
    const ocrPsm = hintedScreenType === SCREEN_TYPES.CREW_HUB ? 4
      : hintedScreenType === SCREEN_TYPES.MAP_SCREEN ? 11
      : null;
    const ocrRegionFingerprint = getOcrRegionsCacheFingerprint(ocrRegions);
    const routingFingerprint = `${routingProfile}:${fontProfile}:${nameRerouteThreshold}:${maxReroutePasses}`;
    console.log('[OCR] Starting processCapture');
    console.log('[OCR] activeUser:', activeUser);
    console.log('[OCR] hasExistingData:', !!existingData);
    console.log('[OCR] ocrMode:', ocrMode);
    console.log('[OCR] routingProfile:', routingProfile);
    console.log('[OCR] fontProfile:', fontProfile);
    console.log('[OCR] regionFingerprint:', ocrRegionFingerprint);
    if (sourceImagePath) console.log('[OCR] Re-analysis from:', sourceImagePath);
    if (skipDebugSave) console.log('[OCR] Skipping debug save (screenshot already saved by caller)');
    if (includeBboxes) console.log('[OCR] includeBboxes enabled for debug payload');
    if (shouldArchiveOcrSample) console.log('[OCR] archiveOcrSample enabled');

    if (!imageBase64 || imageBase64.length < 100) {
      throw new Error('Invalid or empty image data');
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log('[OCR] Buffer created, size:', imageBuffer.length);

    // Check OCR cache only for non-cloud, non-reanalysis, non-forced runs.
    const imageHash = getImageHash(imageBuffer);
    const cacheKey = buildCacheKey(imageHash, activeUser, ocrMode, ocrRegionFingerprint, routingFingerprint);
    const shouldBypassCache = !!sourceImagePath || forceUncached || !!existingData || includeBboxes || shouldArchiveOcrSample;
    let cacheLookupStartedAt = null;
    if (!shouldBypassCache) {
      cacheLookupStartedAt = Date.now();
      const cached = getCachedResult(cacheKey);
      if (cached) {
        console.log(`[OCR] Cache hit — returning in ${Date.now() - captureStart}ms`);
        return cached;
      }
    }

    // Preprocess image
    console.log('[OCR] Preprocessing image...');
    const processed = await preprocessImage(imageBuffer);
    const preMeta = (processed && typeof processed.preprocessMeta === 'object') ? processed.preprocessMeta : {};
    console.log(
      `[OCR] Preprocessing done: original=${processed.originalWidth}x${processed.originalHeight}, ` +
      `ocrInput=${processed.width}x${processed.height}, scale=${Number(processed.scale || 1).toFixed(4)}, ` +
      `mode=${preMeta.mode || 'unknown'}, downscaleCapWidth=${preMeta.downscaleCapWidth || OCR_PREPROCESS_DOWNSCALE_WIDTH}`
    );

    // Save raw capture debug image (also triggers cloud upload)
    // When sourceImagePath is provided (re-analysis), skip saving a duplicate
    let rawDebugPath = null;
    if (sourceImagePath) {
      rawDebugPath = sourceImagePath;
    } else if (!skipDebugSave) {
      try {
        rawDebugPath = await saveDebugImage(imageBuffer, 'raw_capture');
      } catch (e) {
        console.warn('[OCR] Failed to save raw debug image:', e.message);
      }
    }

    // Only save preprocessed images in dev/debug scenarios (they're 2-3x larger)
    // Preprocessed images are only useful for OCR debugging
    // Skipped by default to reduce disk usage

    // ─── Run OCR based on ocrMode ───
    const analysisPathsUsed = new Set(['local']);
    let routingDebug = {
      attempted: false,
      applied: false,
      route: routingProfile === 'names-only' ? 'names-only' : 'none',
      preNameConfidence: 0,
      postNameConfidence: 0,
      latencyMs: 0,
      fontProfile,
    };

    // Run local OCR
    console.log('[OCR] Running LOCAL-ONLY mode...');
    const ocrResult = await runOCR(processed.buffer, ocrPsm);
    console.log(`[OCR] Local OCR done, text length: ${ocrResult.text?.length || 0}`);
    console.log('[OCR] OCR complete, text length:', ocrResult.text?.length || 0);

    // Detect screen type
    const screenDetection = detectScreenTypeFromLines(
      ocrResult.lines,
      processed.width,
      processed.height
    );
    console.log('[OCR] Screen detection:', screenDetection);

    // Extract based on screen type
    let extractedData = null;
    const runtimeAnchors = deriveRuntimeAnchors(screenDetection.type, ocrResult, processed, ocrRegions);
    const activeRegions = applyRuntimeAnchors(ocrRegions, runtimeAnchors);
    const targetedRetries = [];

    if (screenDetection.type === SCREEN_TYPES.CREW_HUB) {
      console.log('[OCR] Processing as CREW HUB');

      // Run eng-only OCR on the full preprocessed image to detect player names.
      // eng+chi_sim (used by the main pool) reads coloured ship-name bars well but
      // mangles player name text; eng-only does the opposite.
      // We replace the name-band words wholesale with the eng-only results.
      let engOnlyFullResult = null;
      try {
        engOnlyFullResult = await runOCREngOnly(processed.buffer);
        console.log(`[OCR-CrewHub] Eng-only full-image pass: ${(engOnlyFullResult?.allWords || []).length} words`);
      } catch (e) {
        console.warn('[OCR-CrewHub] Eng-only full-image pass failed:', e.message);
      }

      const nameBandXMin = (activeRegions.crewHub?.enemyName?.xMin || 0.62) * processed.width;
      const nameBandXMax = (activeRegions.crewHub?.enemyName?.xMax || 0.93) * processed.width;
      const engOnlyWords = engOnlyFullResult?.allWords || [];
      // runOCR() and mergeOCRResults() return { words } not { allWords };
      // only runOCREngOnly() returns allWords. Fall back to .words to avoid crash.
      const baseAllWords = ocrResult.allWords || ocrResult.words || [];
      let allWordsWithEngOnly = engOnlyWords.length > 0
        ? [
            ...baseAllWords.filter(lw => {
              const lxm = (lw.bbox.x0 + lw.bbox.x1) / 2;
              return lxm < nameBandXMin || lxm > nameBandXMax;
            }),
            ...engOnlyWords.filter(ew => {
              const exm = (ew.bbox.x0 + ew.bbox.x1) / 2;
              // Exclude c=0 words: Tesseract produces confidence=0 for garbled
              // bar-text (e.g. WITCH/PLEASE read as "wircHpieasE"), including them
              // corrupts the name extraction despite looking like valid mixed-case names.
              return exm >= nameBandXMin && exm <= nameBandXMax && ew.confidence > 0;
            }),
          ]
        : baseAllWords;

      // SUPPLEMENTARY: Narrow-strip PSM 11 pass for enemy names that are missed by
      // the full-image eng-only pass (PSM 4).
      //
      // A 4× raw PSM 11 scan on a narrow horizontal strip (x=68-82% of the original
      // image, y=190-870) reliably finds all ship-name bars AND all player names in
      // one shot — including the low-contrast zones that the full-image PSM 4 misses.
      // We append its words to the pool in 2× processed-image coordinates, letting
      // the existing crewHubExtractor logic pick the best match per slot.
      if (imageBuffer) {
        try {
          const origW = Math.round(processed.width / processed.scale);
          const origH = Math.round(processed.height / processed.scale);
          const stripXFrac1 = 0.55;
          const stripXFrac2 = 0.88;
          const stripX1  = Math.round(origW * stripXFrac1);
          const stripX2  = Math.round(origW * stripXFrac2);
          const stripW   = stripX2 - stripX1;
          const stripY   = 120;
          const stripH   = Math.max(0, Math.round(origH * 0.92) - stripY);
          const STRIP_SCALE = 4;

          const stripBuf = await sharp(imageBuffer)
            .extract({ left: stripX1, top: stripY, width: stripW, height: stripH })
            .resize(stripW * STRIP_SCALE, stripH * STRIP_SCALE, { kernel: sharp.kernel.lanczos3 })
            .grayscale()
            .modulate({ brightness: 1.0 })
            .linear(1.4, -(0.3 * 128))
            .sharpen({ sigma: 2, m1: 1, m2: 0.5 })
            .png().toBuffer();
          const stripResult = await runOCREngOnly(stripBuf, 11);
          const stripResultPsm6 = await runOCREngOnly(stripBuf, 6);
          let stripWordCount = 0;
          for (const sw of [...(stripResult?.allWords || []), ...(stripResultPsm6?.allWords || [])]) {
            // Map: strip-crop 4× coords → 1× full-image → 2× processed coords
            const mapped2x = {
              x0: Math.round((sw.bbox.x0 / STRIP_SCALE + stripX1) * processed.scale),
              y0: Math.round((sw.bbox.y0 / STRIP_SCALE + stripY)  * processed.scale),
              x1: Math.round((sw.bbox.x1 / STRIP_SCALE + stripX1) * processed.scale),
              y1: Math.round((sw.bbox.y1 / STRIP_SCALE + stripY)  * processed.scale),
            };
            // Always check for duplicate first (before confidence gate) so that a
            // low-confidence strip word can still REPLACE a shorter existing word
            // (e.g. "PerfectSinil" c=0 from strip replaces "Perfectail" c=34).
            const swCy = (mapped2x.y0 + mapped2x.y1) / 2;
            const swTextNorm = sw.text.trim().toLowerCase();
            const existingIdx = allWordsWithEngOnly.findIndex(ex => {
              const exCy = (ex.bbox.y0 + ex.bbox.y1) / 2;
              if (Math.abs(exCy - swCy) > 30) return false;
              const exNorm = ex.text.trim().toLowerCase();
              if (exNorm === swTextNorm) return true;
              if (exNorm.length >= 4 && swTextNorm.includes(exNorm)) return true;
              if (swTextNorm.length >= 4 && exNorm.includes(swTextNorm)) return true;
              // Common prefix ≥5 chars (was 6, lowered to catch "Ledurricane"/"Ledvurricane")
              const minLen = Math.min(exNorm.length, swTextNorm.length);
              if (minLen >= 5) {
                let cp = 0;
                while (cp < minLen && exNorm[cp] === swTextNorm[cp]) cp++;
                if (cp >= 5) return true;
              }
              // Edit distance ≤1 for long words (same player name read slightly differently)
              if (minLen >= 7 && Math.abs(exNorm.length - swTextNorm.length) <= 2) {
                // Quick row-by-row DP for edit distance
                const a = exNorm, b = swTextNorm;
                let prev = Array.from({length: b.length + 1}, (_, i) => i);
                for (let i = 1; i <= a.length; i++) {
                  const curr = [i];
                  for (let j = 1; j <= b.length; j++) {
                    curr[j] = a[i-1] === b[j-1] ? prev[j-1]
                      : 1 + Math.min(prev[j-1], prev[j], curr[j-1]);
                  }
                  prev = curr;
                }
                if (prev[b.length] <= 1) return true;
              }
              return false;
            });
            if (existingIdx >= 0) {
              const existing = allWordsWithEngOnly[existingIdx];
              // Replace if strip word is longer — strip PSM11 often captures more
              // of the name than the main pass (e.g. "eneva_echo" > "a_echo",
              // "PerfectSinil" > "Perfectail")
              if (sw.text.trim().length > existing.text.trim().length) {
                allWordsWithEngOnly[existingIdx] = { ...sw, bbox: mapped2x };
                stripWordCount++;
              }
              continue; // either replaced or skipped — don't add again
            }
            // Only add NEW words if confidence is sufficient.
            // Long words (≥7 chars) get a lower floor (15) — they're unlikely to be
            // random noise, and this recovers names like GoblinaTTyV(c16).
            const textLen = sw.text.trim().length;
            const confFloor = textLen >= 7 ? 10 : textLen >= 4 ? 12 : 15;
            if (sw.confidence < confFloor) continue;
            allWordsWithEngOnly.push({ ...sw, bbox: mapped2x });
            stripWordCount++;
          }
          console.log(`[OCR-CrewHub] Strip PSM11/PSM6 pass: appended ${stripWordCount} words`);
        } catch (e) {
          console.warn('[OCR-CrewHub] Strip PSM11 pass failed:', e.message);
        }
      }

      // PSM11 row-slice scan — catches player names skipped by full-height strip
      // (Tesseract PSM11 on the full strip ignores player card text near large team
      // name bars like ESCAPE VELOCITY; scanning each ~55px row in isolation fixes it)
      if (imageBuffer) {
        try {
          const origW2 = Math.round(processed.width / processed.scale);
          const origH2 = Math.round(processed.height / processed.scale);
          const rX1    = Math.round(origW2 * 0.55);
          const rW     = Math.round(origW2 * 0.88) - rX1;
          const RSC    = 4;
          const SLICE_H = 40;
          const STEP    = 40;
          const rowSliceYStart = Math.max(
            120,
            Math.round(origH2 * (activeRegions.crewHub?.enemyName?.yMin || 0.08)) + 10
          );
          const rowSliceYEnd   = Math.round(origH2 * 0.92);
          let rowWordCount = 0;
          for (let sy = rowSliceYStart; sy < rowSliceYEnd; sy += STEP) {
            const h = Math.min(SLICE_H, rowSliceYEnd - sy);
            if (h < 20) continue;
            const sliceBuf = await sharp(imageBuffer)
              .extract({ left: rX1, top: sy, width: rW, height: h })
              .resize(rW * RSC, h * RSC, { kernel: sharp.kernel.lanczos3 })
              .grayscale()
              .modulate({ brightness: 1.15 })
              .linear(1.4, -(0.3 * 128))
              .sharpen({ sigma: 1.5, m1: 1, m2: 0.5 })
              .png().toBuffer();
            const sliceResult = await runOCREngOnly(sliceBuf, 11);
            for (const sw of (sliceResult?.allWords || [])) {
              const mapped2x = {
                x0: Math.round((sw.bbox.x0 / RSC + rX1) * processed.scale),
                y0: Math.round((sw.bbox.y0 / RSC + sy)  * processed.scale),
                x1: Math.round((sw.bbox.x1 / RSC + rX1) * processed.scale),
                y1: Math.round((sw.bbox.y1 / RSC + sy)  * processed.scale),
              };
              const swCy       = (mapped2x.y0 + mapped2x.y1) / 2;
              const swTextNorm = sw.text.trim().toLowerCase();
              const existingIdx = allWordsWithEngOnly.findIndex(ex => {
                const exCy = (ex.bbox.y0 + ex.bbox.y1) / 2;
                if (Math.abs(exCy - swCy) > 30) return false;
                const exNorm = ex.text.trim().toLowerCase();
                if (exNorm === swTextNorm) return true;
                if (exNorm.length >= 4 && swTextNorm.includes(exNorm)) return true;
                if (swTextNorm.length >= 4 && exNorm.includes(swTextNorm)) return true;
                const minLen = Math.min(exNorm.length, swTextNorm.length);
                if (minLen >= 5) {
                  let cp = 0;
                  while (cp < minLen && exNorm[cp] === swTextNorm[cp]) cp++;
                  if (cp >= 5) return true;
                }
                if (minLen >= 7 && Math.abs(exNorm.length - swTextNorm.length) <= 2) {
                  const a = exNorm, b = swTextNorm;
                  let prev = Array.from({length: b.length + 1}, (_, i) => i);
                  for (let i = 1; i <= a.length; i++) {
                    const curr = [i];
                    for (let j = 1; j <= b.length; j++) {
                      curr[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j-1], prev[j], curr[j-1]);
                    }
                    prev = curr;
                  }
                  if (prev[b.length] <= 1) return true;
                }
                return false;
              });
              if (existingIdx >= 0) {
                if (sw.text.trim().length > allWordsWithEngOnly[existingIdx].text.trim().length)
                  allWordsWithEngOnly[existingIdx] = { ...sw, bbox: mapped2x };
                continue;
              }
              const swLen = sw.text.trim().length;
              const rowConfFloor = swLen >= 7 ? 10 : swLen >= 4 ? 12 : 15;
              if (sw.confidence < rowConfFloor) continue;
              allWordsWithEngOnly.push({ ...sw, bbox: mapped2x });
              rowWordCount++;
            }
          }
          console.log(`[OCR-CrewHub] Row-slice PSM11 pass: appended ${rowWordCount} words`);
        } catch (e) {
          console.warn('[OCR-CrewHub] Row-slice scan failed:', e.message);
        }
      }

      // DEDICATED: Left-panel team-name banner box (separate from the player-name strip).
      // Reads just the top of the left panel where "SPEED RUN!"-style banners appear.
      // Stored as leftPanelTeamName and used by extractCrewHub as a fallback team name.
      let leftPanelTeamName = null;
      if (imageBuffer) {
        try {
          const origW = Math.round(processed.width / processed.scale);
          const origH = Math.round(processed.height / processed.scale);
          const th = activeRegions.crewHub?.teamHeader || { xMin: 0.10, xMax: 0.45, yMin: 0.17, yMax: 0.23 };
          const bannerX1 = Math.round(origW * th.xMin);
          const bannerX2 = Math.round(origW * th.xMax);
          const bannerY1 = Math.round(origH * th.yMin);
          const bannerY2 = Math.round(origH * th.yMax);
          const bannerW  = bannerX2 - bannerX1;
          const bannerH  = bannerY2 - bannerY1;
          if (bannerW > 0 && bannerH > 0) {
            const BANNER_SCALE = 4;
            const bannerBuf = await sharp(imageBuffer)
              .extract({ left: bannerX1, top: bannerY1, width: bannerW, height: bannerH })
              .resize(bannerW * BANNER_SCALE, bannerH * BANNER_SCALE, { kernel: sharp.kernel.lanczos3 })
              .grayscale()
              .modulate({ brightness: 1.05 })
              .linear(1.4, -(0.4 * 128))
              .sharpen({ sigma: 1.5, m1: 1, m2: 0.5 })
              .png().toBuffer();
            const bannerOcr = await runOCREngOnly(bannerBuf, 7); // PSM7 = single text line (preserves spaces)
            const bannerText = (bannerOcr?.allWords || [])
              .filter(w => w.confidence >= 30)
              .map(w => w.text.trim())
              .filter(Boolean)
              .join(' ');
            if (bannerText.length >= 3) {
              // Strip trailing "'s Crew" if OCR caught it
              leftPanelTeamName = bannerText.replace(/[\u2019\u2018\u0027\u0060]?s\s*Crew\s*$/i, '').trim();
              console.log(`[OCR-CrewHub] Left-panel banner box: "${leftPanelTeamName}"`);
            }
          }
        } catch (e) {
          console.warn('[OCR-CrewHub] Left-panel banner box failed:', e.message);
        }
      }

      // SUPPLEMENTARY: Left-panel PSM11 strip for your-team player names.
      // The PSM4 full-image pass often misses names that sit at lower-contrast
      // positions in the left panel (e.g. 3rd/4th teammate cards). The left
      // panel does NOT scroll, so a single strip suffices for both crew screenshots.
      if (imageBuffer) {
        try {
          const origW = Math.round(processed.width / processed.scale);
          const origH = Math.round(processed.height / processed.scale);
          const lStripXFrac1 = 0.08; // expanded left-panel name scan window start
          const lStripXFrac2 = 0.46; // expanded left-panel name scan window end
          const lStripX1  = Math.round(origW * lStripXFrac1);
          const lStripX2  = Math.round(origW * lStripXFrac2);
          const lStripW   = lStripX2 - lStripX1;
          const lStripY   = Math.round(origH * 0.31); // measured: player cards start at ~31% height
          const lStripH   = Math.max(0, Math.round(origH * 0.725) - lStripY); // measured: bottom at ~72.5%
          const L_STRIP_SCALE = 3;

          const lStripBuf = await sharp(imageBuffer)
            .extract({ left: lStripX1, top: lStripY, width: lStripW, height: lStripH })
            .resize(lStripW * L_STRIP_SCALE, lStripH * L_STRIP_SCALE, { kernel: sharp.kernel.lanczos3 })
            .grayscale()
            .modulate({ brightness: 1.0 })
            .linear(1.3, -(0.3 * 128))
            .sharpen({ sigma: 2, m1: 1, m2: 0.5 })
            .png().toBuffer();
          const lStripResult = await runOCREngOnly(lStripBuf, 11);
          let lStripWordCount = 0;
          for (const sw of (lStripResult?.allWords || [])) {
            const mapped2x = {
              x0: Math.round((sw.bbox.x0 / L_STRIP_SCALE + lStripX1) * processed.scale),
              y0: Math.round((sw.bbox.y0 / L_STRIP_SCALE + lStripY)  * processed.scale),
              x1: Math.round((sw.bbox.x1 / L_STRIP_SCALE + lStripX1) * processed.scale),
              y1: Math.round((sw.bbox.y1 / L_STRIP_SCALE + lStripY)  * processed.scale),
            };
            const swCy = (mapped2x.y0 + mapped2x.y1) / 2;
            const swTextNorm = sw.text.trim().toLowerCase();
            const existingIdx = allWordsWithEngOnly.findIndex(ex => {
              const exCy = (ex.bbox.y0 + ex.bbox.y1) / 2;
              if (Math.abs(exCy - swCy) > 30) return false;
              const exNorm = ex.text.trim().toLowerCase();
              if (exNorm === swTextNorm) return true;
              if (exNorm.length >= 4 && swTextNorm.includes(exNorm)) return true;
              if (swTextNorm.length >= 4 && exNorm.includes(swTextNorm)) return true;
              const minLen = Math.min(exNorm.length, swTextNorm.length);
              if (minLen >= 5) {
                let cp = 0;
                while (cp < minLen && exNorm[cp] === swTextNorm[cp]) cp++;
                if (cp >= 5) return true;
              }
              return false;
            });
            if (existingIdx >= 0) {
              const existing = allWordsWithEngOnly[existingIdx];
              if (sw.text.trim().length > existing.text.trim().length) {
                allWordsWithEngOnly[existingIdx] = { ...sw, bbox: mapped2x };
                lStripWordCount++;
              }
              continue;
            }
            const lConfFloor = sw.text.trim().length >= 7 ? 15 : 20;
            if (sw.confidence < lConfFloor) continue;
            allWordsWithEngOnly.push({ ...sw, bbox: mapped2x });
            lStripWordCount++;
          }
          console.log(`[OCR-CrewHub] Left-strip PSM11 pass: appended ${lStripWordCount} words`);
        } catch (e) {
          console.warn('[OCR-CrewHub] Left-strip PSM11 pass failed:', e.message);
        }
      }

      const mergedOcrResult = { ...ocrResult, allWords: allWordsWithEngOnly, leftPanelTeamName };

      extractedData = await extractCrewHub(
        processed.buffer,
        activeUser,
        mergedOcrResult,
        processed.width,
        processed.height,
        processed.scale, // OCR words are on preprocessed/scaled image coordinates
        imageBuffer, // keep color detection on original-color pixels
        activeRegions.crewHub
      );

      // Convert to legacy format for backwards compatibility
      extractedData = convertCrewHubToLegacy(extractedData, ocrResult.text);

    } else if (screenDetection.type === SCREEN_TYPES.MAP_SCREEN) {
      console.log('[OCR] Processing as MAP SCREEN');

      const PLAYER_REGION = activeRegions.mapScreen.players;
      if (imageBuffer) {
        console.log('[OCR-Region] Running region-specific OCR for map teammate list');
      }
      const [mapScreenData, regionResult] = await Promise.all([
        extractMapScreen(
          processed.buffer,
          ocrResult,
          processed.width,
          processed.height,
          activeRegions.mapScreen
        ),
        imageBuffer
          ? cropRegionAndOCR(
            imageBuffer,
            PLAYER_REGION,
            processed.originalWidth,
            processed.originalHeight,
            11,
            fontProfile
          )
          : Promise.resolve(null),
      ]);

      const missingYourShip = !mapScreenData?.yourShip?.shipType;
      const missingEnemySlots = (mapScreenData?.enemyShips || [])
        .map((ship, idx) => ({ ship, idx }))
        .filter(({ ship }) => !ship?.shipType || String(ship.shipType).toLowerCase() === 'unknown');
      if (imageBuffer && (missingYourShip || missingEnemySlots.length > 0)) {
        const retryRegions = missingYourShip
          ? ['yourShip']
          : [];
        for (const m of missingEnemySlots) {
          const key = ['enemyShips', 'enemyShips2', 'enemyShips3', 'enemyShips4'][m.idx];
          if (key) retryRegions.push(key);
        }

        for (const key of retryRegions) {
          const region = activeRegions.mapScreen[key];
          if (!region) continue;
          const retryEntry = { slot: key, accepted: false, reason: 'no_improvement' };
          const retryResult = await cropRegionAndOCR(
            imageBuffer,
            region,
            processed.originalWidth,
            processed.originalHeight,
            6,
            fontProfile
          );
          const retryWords = retryResult?.words || [];
          const retryText = groupCrewHubWordsIntoLines(retryWords, processed.originalHeight)
            .map(line => line.words.map(w => String(w.text || '').trim()).join(' ').trim())
            .filter(Boolean)
            .join(' ')
            .toUpperCase();
          const shipTypeRaw = MAP_SHIP_TYPES.find(type => retryText.includes(type))
            || MAP_SHIP_TYPES.find(type => retryText.split(/\s+/).some(tok => {
              const stripped = tok.replace(/^[^A-Z]/, '');
              return stripped.length >= 4 && type.endsWith(stripped) && stripped.length >= type.length - 1;
            }));
          const shipType = shipTypeRaw
            ? shipTypeRaw.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
            : '';
          const teamText = retryText
            .replace(new RegExp(`\\b(${MAP_SHIP_TYPES.join('|')})\\b`, 'g'), ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const teamName = teamText && looksLikeMapTeamName(teamText)
            ? teamText.split(' ').map(s => s.charAt(0) + s.slice(1).toLowerCase()).join(' ')
            : '';

          if (key === 'yourShip') {
            if (shipType && !mapScreenData?.yourShip?.shipType) {
              mapScreenData.yourShip = {
                ...(mapScreenData.yourShip || { teamName: teamName || 'Your Team' }),
                teamName: mapScreenData?.yourShip?.teamName || teamName || 'Your Team',
                shipType,
                confidence: Math.max(74, Number(mapScreenData?.yourShip?.confidence || 0)),
              };
              retryEntry.accepted = true;
              retryEntry.reason = 'ship_type_recovered';
            }
          } else {
            const idx = ['enemyShips', 'enemyShips2', 'enemyShips3', 'enemyShips4'].indexOf(key);
            if (idx >= 0 && mapScreenData.enemyShips?.[idx]) {
              const existingShip = mapScreenData.enemyShips[idx];
              if (shipType && (!existingShip.shipType || String(existingShip.shipType).toLowerCase() === 'unknown')) {
                mapScreenData.enemyShips[idx] = {
                  ...existingShip,
                  shipType,
                  teamName: existingShip.teamName || teamName || existingShip.teamName,
                  confidence: Math.max(72, Number(existingShip.confidence || 0)),
                };
                retryEntry.accepted = true;
                retryEntry.reason = 'ship_type_recovered';
              }
            }
          }
          targetedRetries.push(retryEntry);
        }
      }

      // Convert to legacy format
      extractedData = convertMapScreenToLegacy(mapScreenData, ocrResult.text);


      // Bug 3 mitigation: map-screen player names are small and overlaid on game visuals.
      // Full-image OCR often extracts garbled names (0% recall). Crop the player-list region
      // (bottom-left), upscale 3x, and run a dedicated OCR pass for much better accuracy.
      if (regionResult && regionResult.words.length > 0) {
        // extractPlayerList expects words in full-image coordinates (already mapped by cropRegionAndOCR)
        const regionPlayers = extractPlayerList(
          regionResult.words,
          processed.originalWidth,
          processed.originalHeight,
          activeRegions.mapScreen
        );
        const existingCount = (extractedData.teammates || []).length;
        if (regionPlayers.length > 0) {
          console.log(`[OCR-Region] Region OCR extracted ${regionPlayers.length} teammate(s) (full-image had ${existingCount}): ${regionPlayers.join(', ')}`);
          // Prefer region results — they come from a higher-resolution, higher-contrast crop
          extractedData.teammates = regionPlayers.map(name => ({
            name,
            confidence: 70,
            isTeammate: true,
          }));
        } else {
          console.log(`[OCR-Region] Region OCR found ${regionResult.words.length} words but no valid player names; keeping ${existingCount} from full-image`);
        }
      } else if (imageBuffer) {
        console.log('[OCR-Region] Region OCR returned no results; keeping full-image extraction');
      }

    } else {
      console.log('[OCR] Unknown screen type, returning minimal extraction');
      extractedData = {
        screenshotType: 'unknown',
        rawText: ocrResult.text || '',
        playerTeamName: undefined,
        teammates: [],
        opponentTeams: [],
        reachModifiers: [],
        overallConfidence: 0,
        isPartialCapture: true,
        captureTimestamp: Date.now(),
      };
    }

    // Merge with existing data if provided
    if (existingData && isSameMatch(existingData, extractedData)) {
      console.log('[OCR] Merging with existing data');
      extractedData = mergeCaptures(existingData, extractedData);
    }

    const mergeReroutedNames = async () => {
      if (routingProfile !== 'names-only' || maxReroutePasses <= 0 || !imageBuffer) {
        return;
      }
      const preFieldConfidence = computeFieldConfidence(extractedData);
      const preUniqueNames = countUniqueExtractedNames(extractedData);
      const preNameConfidence = getNameConfidenceFloor(preFieldConfidence);
      const shouldReroute = preNameConfidence < nameRerouteThreshold || preUniqueNames < 3;
      routingDebug.preNameConfidence = Number.isFinite(preNameConfidence) ? preNameConfidence : 0;
      if (!shouldReroute) {
        routingDebug.postNameConfidence = routingDebug.preNameConfidence;
        return;
      }

      routingDebug.attempted = true;
      const rerouteStart = Date.now();

      if (extractedData.screenshotType === 'tactical_map') {
        const rerouteResult = await cropRegionAndOCR(
          imageBuffer,
          activeRegions.mapScreen.players,
          processed.originalWidth,
          processed.originalHeight,
          11,
          fontProfile
        );
        const routedPlayers = rerouteResult?.words?.length
          ? extractPlayerList(
            rerouteResult.words,
            processed.originalWidth,
            processed.originalHeight,
            activeRegions.mapScreen
          )
          : [];
        if (Array.isArray(routedPlayers) && routedPlayers.length > 0) {
          const candidatePlayers = routedPlayers.map((name) => ({
            name,
            confidence: 76,
            isTeammate: true,
          }));
          const mergedPlayers = dedupeExtractedPlayers(
            [...(extractedData.teammates || []), ...candidatePlayers],
            4
          ).map((player) => ({ ...player, isTeammate: true }));
          if (mergedPlayers.length > (extractedData.teammates || []).length) {
            routingDebug.applied = true;
          }
          extractedData.teammates = mergedPlayers;
        }
      } else if (extractedData.screenshotType === 'crew_hub') {
        const teammateRegionResult = await cropRegionAndOCR(
          imageBuffer,
          activeRegions.crewHub.leftPanel,
          processed.originalWidth,
          processed.originalHeight,
          7,
          fontProfile
        );
        const teammateCandidates = teammateRegionResult?.words?.length
          ? extractCrewHubNamesFromWords(
            teammateRegionResult.words,
            processed.originalWidth,
            processed.originalHeight
          )
          : [];

        const enemyRegions = [
          activeRegions.crewHub.enemyRow1Players,
          activeRegions.crewHub.enemyRow2Players,
          activeRegions.crewHub.enemyRow3Players,
          activeRegions.crewHub.enemyRow4Players,
        ];
        const routedOpponentByIndex = [];
        for (let idx = 0; idx < enemyRegions.length; idx += 1) {
          const region = enemyRegions[idx];
          const enemyResult = await cropRegionAndOCR(
            imageBuffer,
            region,
            processed.originalWidth,
            processed.originalHeight,
            7,
            fontProfile
          );
          const enemyCandidates = enemyResult?.words?.length
            ? extractCrewHubNamesFromWords(
              enemyResult.words,
              processed.originalWidth,
              processed.originalHeight
            )
            : [];
          routedOpponentByIndex[idx] = enemyCandidates;
        }

        if (teammateCandidates.length > 0) {
          const mergedTeammates = dedupeExtractedPlayers(
            [...(extractedData.teammates || []), ...teammateCandidates.map((item) => ({ ...item, isTeammate: true }))],
            4
          ).map((player) => ({ ...player, isTeammate: true }));
          if (mergedTeammates.length > (extractedData.teammates || []).length) {
            routingDebug.applied = true;
          }
          extractedData.teammates = mergedTeammates;
        }

        const nextOpponentTeams = Array.isArray(extractedData.opponentTeams)
          ? [...extractedData.opponentTeams]
          : [];
        for (let idx = 0; idx < routedOpponentByIndex.length; idx += 1) {
          const candidates = routedOpponentByIndex[idx] || [];
          if (!Array.isArray(candidates) || candidates.length === 0) continue;
          while (nextOpponentTeams.length <= idx) {
            nextOpponentTeams.push({
              teamName: `Enemy Team ${nextOpponentTeams.length + 1}`,
              shipType: '',
              color: 'unknown',
              players: [],
              confidence: 64,
            });
          }
          const existingTeam = nextOpponentTeams[idx] || {
            teamName: `Enemy Team ${idx + 1}`,
            shipType: '',
            color: 'unknown',
            players: [],
            confidence: 64,
          };
          const mergedPlayers = dedupeExtractedPlayers(
            [
              ...(existingTeam.players || []),
              ...candidates.map((player) => ({ ...player, isTeammate: false })),
            ],
            4
          ).map((player) => ({ ...player, isTeammate: false }));
          if (mergedPlayers.length > (existingTeam.players || []).length) {
            routingDebug.applied = true;
          }
          nextOpponentTeams[idx] = {
            ...existingTeam,
            players: mergedPlayers,
            confidence: Math.max(Number(existingTeam.confidence || 0), 70),
          };
        }
        extractedData.opponentTeams = nextOpponentTeams;
      }

      routingDebug.latencyMs = Date.now() - rerouteStart;
      const postFieldConfidence = computeFieldConfidence(extractedData);
      const postNameConfidence = getNameConfidenceFloor(postFieldConfidence);
      routingDebug.postNameConfidence = Number.isFinite(postNameConfidence)
        ? postNameConfidence
        : routingDebug.preNameConfidence;
    };

    await mergeReroutedNames();

    console.log('[OCR] Extraction complete:', {
      type: extractedData.screenshotType,
      teammates: extractedData.teammates?.length || 0,
      opponentTeams: extractedData.opponentTeams?.length || 0,
      confidence: (extractedData.overallConfidence || 0).toFixed(1),
      routed: routingDebug.applied,
    });

    // Detect artifact type from raw text
    const artifactMatch = (extractedData.rawText || '').match(/\b(Healing|Weapon|Ice)\b/i);
    if (artifactMatch) extractedData.artifactType = artifactMatch[1].charAt(0).toUpperCase() + artifactMatch[1].slice(1).toLowerCase();

    extractedData.ocrSource = 'local';
    const fieldConfidence = computeFieldConfidence(extractedData);
    extractedData.fieldConfidence = fieldConfidence;
    const nameConfidenceFloor = getNameConfidenceFloor(fieldConfidence);
    const floorConsensus = normalizeConfidence01(nameConfidenceFloor);
    const confidenceConsensus = floorConsensus > 0
      ? floorConsensus
      : normalizeConfidence01(extractedData.overallConfidence || 0);
    extractedData.consensusScore = Number(confidenceConsensus.toFixed(4));
    if (!routingDebug.attempted && routingDebug.postNameConfidence <= 0) {
      routingDebug.postNameConfidence = getNameConfidenceFloor(fieldConfidence);
    }
    extractedData.ocrRouting = {
      attempted: Boolean(routingDebug.attempted),
      applied: Boolean(routingDebug.applied),
      route: routingDebug.route === 'names-only' ? 'names-only' : 'none',
      preNameConfidence: Number.isFinite(routingDebug.preNameConfidence) ? routingDebug.preNameConfidence : 0,
      postNameConfidence: Number.isFinite(routingDebug.postNameConfidence) ? routingDebug.postNameConfidence : 0,
      latencyMs: Number.isFinite(routingDebug.latencyMs) ? routingDebug.latencyMs : 0,
      fontProfile: routingDebug.fontProfile === 'ealing-black-italic' ? 'ealing-black-italic' : 'default',
      anchorsUsed: runtimeAnchors || null,
      targetedRetries,
    };
    if (includeBboxes) {
      extractedData.ocrBoundingBoxes = buildOcrBoundingBoxDebugPayload(
        'local',
        ocrResult,
        null,
        processed,
        screenDetection.type,
        ocrRegions
      );
    }
    if (shouldArchiveOcrSample) {
      const archivedSample = await archiveOcrSample(
        imageBuffer,
        ocrResult?.text || extractedData.rawText || '',
        {
          trigger: 'ocr-process-capture',
          activeUser: activeUser || null,
          ocrMode,
          ocrSource: 'local',
          screenshotType: extractedData.screenshotType || 'unknown',
          overallConfidence: Number(extractedData.overallConfidence || 0),
          regionFingerprint: ocrRegionFingerprint,
          ...archiveMetadata,
        }
      );
      if (archivedSample?.sampleId) {
        extractedData.ocrCorpusSampleId = archivedSample.sampleId;
      }
    }

    const finalResult = {
      success: true,
      data: extractedData,
    };

    // Store only cache-safe runs.
    if (!shouldBypassCache) {
      const missDurationMs = cacheLookupStartedAt == null ? null : (Date.now() - cacheLookupStartedAt);
      setCachedResult(cacheKey, finalResult, missDurationMs);
    }

    console.log(`[OCR] Total processCapture time: ${Date.now() - captureStart}ms`);
    return finalResult;

  } catch (error) {
    console.error('[OCR] Processing failed:', error);
    console.error('[OCR] Stack:', error.stack);
    try {
      const failLogPath = path.join(os.tmpdir(), 'wildgate-ocr.log');
      fs.appendFileSync(
        failLogPath,
        `${new Date().toISOString()} [OCR] Processing failed: ${error?.message || 'Unknown error'}\n${error?.stack || ''}\n`
      );
    } catch (_logErr) { /* ignore log-write failures */ }
    return {
      success: false,
      error: error.message || 'Unknown OCR error',
    };
  } finally {
    if (tempOcrPath) {
      try {
        await fsPromises.unlink(tempOcrPath);
        console.log('[OCR] Cleaned up temp OCR image');
      } catch (cleanupErr) {
        console.warn('[OCR] Temp OCR image cleanup failed:', cleanupErr.message);
      }
    }
    releaseOcrSlot();
  }
}

/**
 * Convert new Crew Hub format to legacy format for backwards compatibility
 */
function convertCrewHubToLegacy(crewHubData, rawText) {
  const capPlayers = (players, maxCount = 4) => {
    if (!Array.isArray(players)) return [];
    const ranked = [...players].sort((a, b) => (Number(b?.confidence || 0) - Number(a?.confidence || 0)));
    return ranked.slice(0, maxCount);
  };

  const teammates = capPlayers((crewHubData.yourTeam?.players || []).map(name => ({
    name: typeof name === 'string' ? name : name.name,
    confidence: typeof name === 'string' ? 80 : (name.confidence || 80),
    isTeammate: true,
  })), 4);

  const opponentTeams = (crewHubData.enemyTeams || []).slice(0, 4).map(team => ({
    teamName: team.name || 'Unknown Team',
    teamNameSource: team.nameSource || 'fallback',
    shipType: team.shipType || '',
    color: team.color || 'unknown',
    players: capPlayers((team.players || []).map(p => ({
      name: typeof p === 'string' ? p : p.name,
      confidence: typeof p === 'string' ? 75 : (p.confidence || 75),
      isTeammate: false,
    })), 4),
    confidence: team.confidence || 70,
  }));

  // Calculate overall confidence
  const allConfidences = [
    crewHubData.confidence || 0,
    ...teammates.map(t => t.confidence),
    ...opponentTeams.flatMap(t => t.players.map(p => p.confidence)),
  ];
  const overallConfidence = allConfidences.length > 0
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0;

  return {
    screenshotType: 'crew_hub',
    playerTeamName: crewHubData.yourTeam?.name || undefined,
    teammates,
    opponentTeams,
    reachModifiers: extractModifiers(rawText),
    overallConfidence,
    isPartialCapture: crewHubData.isPartialCapture || false,
    captureTimestamp: Date.now(),
    rawText: rawText || '',
  };
}

/**
 * Convert new Map Screen format to legacy format
 */
function convertMapScreenToLegacy(mapScreenData, rawText) {
  const hazardMods = (mapScreenData.hazards || []).map(h => ({
    name: h,
    confidence: 85,
    rawText: h,
  }));
  const playerShip = mapScreenData.yourShip ? {
    shipType: mapScreenData.yourShip.shipType,
    teamName: mapScreenData.yourShip.teamName,
    confidence: mapScreenData.yourShip.confidence || 80,
  } : undefined;

  const enemyShips = (mapScreenData.enemyShips || []).map(ship => ({
    teamName: ship.teamName || 'Unknown Team',
    shipType: ship.shipType || 'Unknown',
    color: ship.color || 'unknown',
    confidence: ship.confidence || 70,
  }));

  // Convert players to teammates format
  const teammates = (mapScreenData.players || []).map(name => ({
    name: typeof name === 'string' ? name : name.name,
    confidence: 70,
    isTeammate: true,
  }));

  // Create opponent teams from enemy ships (without player info)
  const opponentTeams = enemyShips.map(ship => ({
    teamName: ship.teamName,
    shipType: ship.shipType,
    color: ship.color,
    players: [],
    confidence: ship.confidence,
  }));

  // Calculate confidence
  const allConfidences = [
    mapScreenData.confidence || 0,
    ...enemyShips.map(s => s.confidence),
  ];
  const overallConfidence = allConfidences.length > 0
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0;

  return {
    screenshotType: 'tactical_map',
    playerShip,
    playerTeamName: mapScreenData.yourShip?.teamName || undefined,
    enemyShips,
    teammates,
    opponentTeams,
    reachModifiers: [...extractModifiers(rawText), ...hazardMods],
    hazards: mapScreenData.hazards || [],
    mapRoutingMeta: mapScreenData.routingMeta || null,
    overallConfidence,
    captureTimestamp: Date.now(),
    rawText: rawText || '',
  };
}

/**
 * Register IPC handlers for OCR operations
 * @param {import('electron').BrowserWindow} [mainWindow] - Main app window to hide during capture
 */
function registerOCRHandlers(mainWindow) {
  // Helper: hide window before capture, restore after
  async function captureWithHiddenWindow() {
    const wasVisible = mainWindow && mainWindow.isVisible();
    try {
      if (wasVisible) {
        mainWindow.hide();
        await new Promise(r => setTimeout(r, 300)); // Wait for OS to finish hiding
      }
      return await captureGameWindow();
    } finally {
      if (wasVisible && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  }

  // Capture game window
  ipcMain.handle('capture-game-window', async () => {
    return await captureWithHiddenWindow();
  });

  // Capture screen and return as data URL (used by renderer's imageUtils.ts)
  ipcMain.handle('capture-screen', async () => {
    try {
      const result = await captureWithHiddenWindow();
      if (result.success && result.imageBase64) {
        return `data:image/png;base64,${result.imageBase64}`;
      }
      throw new Error(result.error || 'Capture returned no data');
    } catch (error) {
      console.error('[OCR] capture-screen failed:', error);
      return null;
    }
  });

  // Process capture with OCR (accepts activeUser, existingData, and ocrMode)
  // skipDebugSave: true because the caller (useSmartCapture) already saved via save-screenshot
  ipcMain.handle('ocr-process-capture', async (event, imageBase64, activeUser = null, existingData = null, ocrMode = 'both', runtimeOptions = {}) => {
    const safeOptions = (runtimeOptions && typeof runtimeOptions === 'object') ? runtimeOptions : {};
    return await processCapture(imageBase64, activeUser, existingData, ocrMode, { ...safeOptions, skipDebugSave: true });
  });

  // Save OCR debug image
  ipcMain.handle('save-ocr-debug', async (event, { dataUrl, filename }) => {
    try {
      ensureDebugDir();
      const filepath = path.join(DEBUG_DIR, filename);

      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      await fsPromises.writeFile(filepath, buffer);
      return filepath;
    } catch (error) {
      console.error('[OCR] Failed to save debug image:', error);
      return null;
    }
  });

  // List OCR debug files
  ipcMain.handle('list-ocr-debug-files', async () => {
    try {
      ensureDebugDir();
      const files = await fsPromises.readdir(DEBUG_DIR);

      const fileStats = await Promise.all(
        files
          .filter(f => (f.endsWith('.png') || f.endsWith('.jpg')) && !f.startsWith('preprocessed_'))
          .map(async (f) => {
            const fullPath = path.join(DEBUG_DIR, f);
            const stats = await fsPromises.stat(fullPath);
            return {
              name: f,
              path: fullPath,
              time: stats.mtimeMs,
              isLabeled: false
            };
          })
      );

      return fileStats.sort((a, b) => b.time - a.time);
    } catch (error) {
      console.error('[OCR] Failed to list debug files:', error);
      return [];
    }
  });

  // Clear all preprocessed debug images
  ipcMain.handle('clear-ocr-preprocessed', async () => {
    try {
      ensureDebugDir();
      const files = await fsPromises.readdir(DEBUG_DIR);

      let deletedCount = 0;
      for (const f of files) {
        // Only delete preprocessed images, not raw captures
        if (f.startsWith('preprocessed_')) {
          const fullPath = path.join(DEBUG_DIR, f);
          await fsPromises.unlink(fullPath);
          deletedCount++;
        }
      }

      console.log(`[OCR] Cleared ${deletedCount} preprocessed images`);
      return { success: true, deletedCount };
    } catch (error) {
      console.error('[OCR] Failed to clear preprocessed images:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('benchmark-ocr-preprocessing', async (event, payload = {}) => {
    try {
      const safePayload = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? payload
        : { imagePath: payload };
      const imagePath = typeof safePayload.imagePath === 'string' ? safePayload.imagePath : null;
      const imageBase64 = typeof safePayload.imageBase64 === 'string' ? safePayload.imageBase64 : null;

      let imageBuffer = null;
      if (imageBase64 && imageBase64.length > 100) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else if (imagePath) {
        imageBuffer = await fsPromises.readFile(path.resolve(imagePath));
      } else {
        throw new Error('No benchmark image provided');
      }

      const ocrRegions = sanitizeOcrRegions(safePayload.ocrRegions);
      const iterations = sanitizeBenchmarkIterations(safePayload.iterations);
      const results = await benchmarkRegionPreprocessing(imageBuffer, ocrRegions, iterations);

      return {
        success: true,
        ...results,
      };
    } catch (error) {
      console.error('[OCR] benchmark-ocr-preprocessing failed:', error);
      return {
        success: false,
        error: error?.message || 'Benchmark failed',
      };
    }
  });

  ipcMain.handle('regenerate-ocr-dictionary', async (event, payload = {}) => {
    try {
      const safePayload = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? payload
        : {};
      const pilotRegistry = sanitizePilotRegistryForDictionary(safePayload.pilotRegistry);
      if (pilotRegistry.length === 0) {
        return {
          success: false,
          error: 'No pilot names available to build OCR dictionary',
        };
      }

      const matchHistory = sanitizeDictionaryMatchHistory(safePayload.matches);
      const generated = await generateUserWordsFile({
        pilotRegistry,
        matchHistory,
        outputPath: OCR_USER_WORDS_FILE,
      });

      const applyResult = await applyDictionaryToWorkers(generated.filePath);
      const { content, ...summary } = generated;

      latestDictionaryStats = {
        ...summary,
        appliedWorkers: applyResult.appliedWorkers,
      };

      console.log(`[OCR-Dict] Regenerated dictionary (${summary.totalWords} words, ${summary.pilotCount} pilots, workers=${applyResult.appliedWorkers})`);
      return {
        success: true,
        ...latestDictionaryStats,
      };
    } catch (error) {
      console.error('[OCR-Dict] regenerate-ocr-dictionary failed:', error);
      return {
        success: false,
        error: error?.message || 'Dictionary regeneration failed',
      };
    }
  });

  // Get OCR debug directory path
  ipcMain.handle('get-ocr-cache-stats', () => ({
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    evictions: cacheStats.evictions,
    totalRequests: cacheStats.totalRequests,
    avgHitTimeMs: Number(cacheStats.avgHitTimeMs.toFixed(2)),
    avgMissTimeMs: Number(cacheStats.avgMissTimeMs.toFixed(2)),
    hitRate: cacheStats.totalRequests > 0 ? (cacheStats.hits / cacheStats.totalRequests) : 0,
    currentSize: ocrResultCache.size,
    maxSize: OCR_CACHE_MAX,
  }));

  // Get OCR debug directory path
  ipcMain.handle('get-ocr-debug-dir', async () => {
    ensureDebugDir();
    return DEBUG_DIR;
  });

  console.log('[OCR] IPC handlers registered (new OCR system)');
}

module.exports = {
  registerOCRHandlers,
  captureGameWindow,
  processCapture,
  getTesseractWorker,
  preprocessImage,
  runOCR,
  extractModifiers,
};
