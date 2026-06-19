/**
 * OCR Handler for Electron Main Process
 *
 * Redesigned OCR system with:
 * - English OCR support (eng)
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
const { requirePackagedModule } = require('./helpers/packagedModuleLoader.cjs');
const { pruneOcrDebugFiles } = require('./helpers/ocrDebugRetention.cjs');
const HAZARD_CATALOG = require('./hazardCatalog.json');

// Import new extraction modules
const { detectScreenTypeFromLines, SCREEN_TYPES } = require('./screenDetector.cjs');
const {
  extractCrewHub,
  groupWordsIntoLines: groupCrewHubWordsIntoLines,
  extractPlayerNameFromLine: extractCrewHubPlayerNameFromLine,
  cleanupPlayerName: cleanupCrewHubPlayerName,
  isValidPlayerName: isValidCrewHubPlayerName,
} = require('./crewHubExtractor.cjs');
const {
  extractMapScreen,
  extractPlayerList,
  extractHazards,
  KNOWN_HAZARDS,
  SHIP_TYPES: MAP_SHIP_TYPES,
  looksLikeTeamName: looksLikeMapTeamName,
} = require('./mapScreenExtractor.cjs');
const { mergeCaptures, isSameMatch } = require('./ocrMerger.cjs');
const { paddleOcrBuffer, initPaddleOCR } = require('./paddleOcrHandler.cjs');

// Dynamic imports (loaded when needed)
let screenshot = null;
let sharp = null;

// Debug directory for saving OCR images
const DEBUG_DIR = path.join(app.getPath('userData'), 'ocr-debug');
const OCR_CORPUS_ARCHIVE_DIR = path.join(app.getPath('userData'), 'ocr-corpus-archive');

// Ensure debug directory exists
function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }
}

function scheduleOcrDebugPrune(reason = 'background') {
  ensureDebugDir();
  void pruneOcrDebugFiles(DEBUG_DIR)
    .then((report) => {
      if (report.deletedFiles > 0) {
        console.log(
          `[OCR] Pruned debug files reason=${reason} deletedFiles=${report.deletedFiles} deletedBytes=${report.deletedBytes}`
        );
      }
      if (report.failures.length > 0) {
        console.warn(`[OCR] Debug prune completed with ${report.failures.length} failure(s)`);
      }
    })
    .catch((error) => {
      console.warn('[OCR] Failed to prune debug files:', error?.message || error);
    });
}

function ensureCorpusArchiveDir() {
  if (!fs.existsSync(OCR_CORPUS_ARCHIVE_DIR)) {
    fs.mkdirSync(OCR_CORPUS_ARCHIVE_DIR, { recursive: true });
  }
}

function restoreHiddenCaptureWindow(mainWindow, options = {}) {
  const wasVisible = options?.wasVisible === true;
  if (!wasVisible || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (typeof mainWindow.showInactive === 'function') {
    mainWindow.showInactive();
    return;
  }

  mainWindow.show();
}

// ─── OCR Result Cache (LRU, max 50 entries) ───
const OCR_CACHE_MAX = Math.min(500, Math.max(10, parseInt(process.env.WILDGATE_OCR_CACHE_MAX || '50', 10) || 50));
const LOW_WORD_CONFIDENCE_THRESHOLD = Math.min(80, Math.max(0, parseInt(process.env.WILDGATE_OCR_WORD_CONF_MIN || '15', 10) || 15));
const CPU_COUNT = Math.max(1, Number.isFinite(os.cpus()?.length) ? os.cpus().length : 1);
const OCR_MAX_CONCURRENT = Math.min(8, Math.max(1, parseInt(process.env.WILDGATE_OCR_MAX_CONCURRENT || '2', 10) || 2));
const OCR_PREPROCESS_DOWNSCALE_WIDTH = Math.min(4096, Math.max(1200, parseInt(process.env.WILDGATE_OCR_PREPROCESS_MAX_WIDTH || '1920', 10) || 1920));
const DEFAULT_SHARP_CONCURRENCY = CPU_COUNT <= 4 ? 1 : 2;
const OCR_SHARP_CONCURRENCY = Math.min(4, Math.max(1, parseInt(process.env.WILDGATE_OCR_SHARP_CONCURRENCY || String(DEFAULT_SHARP_CONCURRENCY), 10) || DEFAULT_SHARP_CONCURRENCY));
const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;
const REFERENCE_ASPECT = REFERENCE_WIDTH / REFERENCE_HEIGHT;
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
      hazards: { xMin: 0.60, xMax: 1.0, yMin: 0.28, yMax: 0.63 },
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

function detectAspectProfile(width, height) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
    return 'unknown';
  }
  const ratio = safeWidth / safeHeight;
  if (ratio <= 1.8) return 'standard';
  if (ratio <= 2.5) return 'ultrawide';
  if (ratio <= 4.0) return 'superultrawide';
  return 'unknown';
}

function normalizeAspectProfile(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'standard' || text === 'ultrawide' || text === 'superultrawide' || text === 'unknown') {
    return text;
  }
  return '';
}

function toPositiveInt(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric);
}

function buildOcrGeometry(processed, hints = {}) {
  const hintedDisplayWidth = toPositiveInt(hints?.displayWidth);
  const hintedDisplayHeight = toPositiveInt(hints?.displayHeight);
  const originalWidth = Math.max(1, hintedDisplayWidth || Number(processed?.originalWidth) || REFERENCE_WIDTH);
  const originalHeight = Math.max(1, hintedDisplayHeight || Number(processed?.originalHeight) || REFERENCE_HEIGHT);
  const ocrWidth = Math.max(1, Number(processed?.width) || Math.round(originalWidth));
  const ocrHeight = Math.max(1, Number(processed?.height) || Math.round(originalHeight));
  const preprocessScale = Number.isFinite(Number(processed?.scale)) && Number(processed?.scale) > 0
    ? Number(processed.scale)
    : (ocrWidth / originalWidth);
  const aspectRatio = originalWidth / originalHeight;
  const sourceScaleX = originalWidth / REFERENCE_WIDTH;
  const sourceScaleY = originalHeight / REFERENCE_HEIGHT;
  const ocrScaleX = sourceScaleX * preprocessScale;
  const ocrScaleY = sourceScaleY * preprocessScale;

  const hintedAspectProfile = normalizeAspectProfile(hints?.aspectProfile);
  const detectedAspectProfile = detectAspectProfile(originalWidth, originalHeight);
  return {
    referenceWidth: REFERENCE_WIDTH,
    referenceHeight: REFERENCE_HEIGHT,
    referenceAspect: REFERENCE_ASPECT,
    originalWidth,
    originalHeight,
    ocrWidth,
    ocrHeight,
    preprocessScale,
    aspectRatio,
    aspectProfile: hintedAspectProfile || detectedAspectProfile,
    sourceScaleX,
    sourceScaleY,
    ocrScaleX,
    ocrScaleY,
  };
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

const MAP_ENEMY_HEADER_PATTERNS = Object.freeze([
  /^ENEMY$/,
  /^SHIPS?$/,
  /^ENEMYSHIPS?$/,
]);

const MAP_HAZARD_HEADER_PATTERNS = Object.freeze([
  /^KNOWN$/,
  /^HAZARDS?$/,
  /^KNOWNHAZARDS?$/,
  /^KNOWNHAZARDSFEATURES?$/,
  /^HAZARDS?FEATURES?$/,
]);

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
      MAP_ENEMY_HEADER_PATTERNS,
      rightXMin,
      rightXMax,
      0,
      height * 0.25
    );
    const hazardsHeaderY = findHeaderAnchorY(
      words,
      MAP_HAZARD_HEADER_PATTERNS,
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
    // LAYOUT-DEPENDENT: these normalized slot windows assume the current tactical-map
    // enemy ship list stacks evenly below the ENEMY SHIPS header.
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
    next.mapScreen.hazards.yMax = Math.min(1, headerY + 0.55);
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

/**
 * Capture the game window (primary display)
 */
async function captureGameWindowBuffer() {
  if (!screenshot) {
    screenshot = requirePackagedModule('screenshot-desktop');
  }

  console.log('[OCR] Capturing screen...');
  const imgBuffer = await screenshot({ format: 'png' });
  console.log('[OCR] Screen captured, size:', imgBuffer.length);
  return imgBuffer;
}

async function captureGameWindow() {
  try {
    const imgBuffer = await captureGameWindowBuffer();
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
  fontProfile = 'default',
  ocrOptions = null
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

    // Run dedicated OCR pass on the cropped region
    const regionOCR = await runOCR(cropped, psm, ocrOptions || undefined);
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
async function runOCR(imageBuffer, psm = null, options = {}) {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    return {
      text: '',
      confidence: 0,
      words: [],
      allWords: [],
      lines: [],
    };
  }

  await initPaddleOCR();
  console.log('[OCR] Running PaddleOCR recognition...');
  const startTime = Date.now();

  const detectionThreshold = Number.isFinite(Number(options?.threshold))
    ? Number(options.threshold)
    : 0.2;
  const paddleWords = await paddleOcrBuffer(imageBuffer, { threshold: detectionThreshold, performanceMode: options?.performanceMode === true, allText: true });
  console.log(`[OCR] PaddleOCR complete in ${Date.now() - startTime}ms, rawWords=${paddleWords.length}`);

  const words = paddleWords
    .map((word) => {
      const text = String(word?.text || '').trim();
      if (!text) return null;
      const bbox = word?.bbox || {};
      const x0 = Number.isFinite(Number(bbox.x0)) ? Number(bbox.x0) : 0;
      const y0 = Number.isFinite(Number(bbox.y0)) ? Number(bbox.y0) : 0;
      const x1 = Number.isFinite(Number(bbox.x1)) ? Number(bbox.x1) : x0;
      const y1 = Number.isFinite(Number(bbox.y1)) ? Number(bbox.y1) : y0;
      const confidence = Number.isFinite(Number(word?.confidence)) ? Number(word.confidence) : 0;
      return {
        text,
        confidence: Math.max(0, Math.min(100, confidence)),
        bbox: {
          x0: Math.min(x0, x1),
          y0: Math.min(y0, y1),
          x1: Math.max(x0, x1),
          y1: Math.max(y0, y1),
        },
      };
    })
    .filter(Boolean)
    .filter((word) => (word.confidence || 0) >= LOW_WORD_CONFIDENCE_THRESHOLD);

  words.sort((a, b) => {
    const ay = (a.bbox.y0 + a.bbox.y1) / 2;
    const by = (b.bbox.y0 + b.bbox.y1) / 2;
    if (ay !== by) return ay - by;
    return a.bbox.x0 - b.bbox.x0;
  });

  let imageHeight = 1080;
  let imageWidth = 1920;
  if (sharp) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      if (Number.isFinite(metadata?.height) && metadata.height > 0) imageHeight = metadata.height;
      if (Number.isFinite(metadata?.width) && metadata.width > 0) imageWidth = metadata.width;
    } catch (error) {
      console.warn('[OCR] Failed to read OCR image metadata:', error?.message || error);
    }
  }

  const groupedLines = groupCrewHubWordsIntoLines(words, imageHeight, imageWidth);
  const lines = groupedLines.map((line) => {
    const lineWords = Array.isArray(line?.words) ? [...line.words].sort((a, b) => a.bbox.x0 - b.bbox.x0) : [];
    const lineText = lineWords.map((word) => word.text).join(' ').trim();
    const xs0 = lineWords.map((word) => word.bbox.x0);
    const ys0 = lineWords.map((word) => word.bbox.y0);
    const xs1 = lineWords.map((word) => word.bbox.x1);
    const ys1 = lineWords.map((word) => word.bbox.y1);
    const avgConfidence = lineWords.length > 0
      ? (lineWords.reduce((sum, word) => sum + Number(word.confidence || 0), 0) / lineWords.length)
      : 0;
    return {
      y: Number(line?.y || 0),
      text: lineText,
      confidence: avgConfidence,
      bbox: lineWords.length > 0
        ? {
          x0: Math.min(...xs0),
          y0: Math.min(...ys0),
          x1: Math.max(...xs1),
          y1: Math.max(...ys1),
        }
        : { x0: 0, y0: 0, x1: 0, y1: 0 },
      words: lineWords,
    };
  });

  const text = lines
    .map((line) => line.text)
    .filter(Boolean)
    .join('\n');
  const confidence = words.length > 0
    ? (words.reduce((sum, word) => sum + Number(word.confidence || 0), 0) / words.length)
    : 0;

  return {
    text,
    confidence,
    words,
    allWords: words,
    lines,
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

function normalizeHazardTokenSequence(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function isSingleEditOrTranspositionAway(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || !b) return false;
  if (a === b) return true;

  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > 1) return false;

  if (a.length === b.length) {
    const mismatches = [];
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) mismatches.push(i);
      if (mismatches.length > 2) return false;
    }
    if (mismatches.length === 1) return true; // substitution
    if (mismatches.length === 2) {
      const [i, j] = mismatches;
      return j === i + 1 && a[i] === b[j] && a[j] === b[i]; // transposition
    }
    return false;
  }

  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let si = 0;
  let li = 0;
  let edits = 0;

  while (si < shorter.length && li < longer.length) {
    if (shorter[si] === longer[li]) {
      si += 1;
      li += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    li += 1; // one insertion/deletion
  }

  return true;
}

function fuzzyHazardPatternMatch(textWords, patternWords) {
  if (!Array.isArray(textWords) || !Array.isArray(patternWords)) return false;
  if (patternWords.length === 0 || textWords.length === 0) return false;

  if (patternWords.length === 1) {
    return textWords.some((word) => isSingleEditOrTranspositionAway(patternWords[0], word));
  }

  if (patternWords.length > textWords.length) return false;
  for (let start = 0; start <= (textWords.length - patternWords.length); start += 1) {
    let matchedWords = 0;
    let windowMatch = true;
    for (let i = 0; i < patternWords.length; i += 1) {
      if (!isSingleEditOrTranspositionAway(patternWords[i], textWords[start + i])) {
        windowMatch = false;
        break;
      }
      matchedWords += 1;
    }
    if (windowMatch && matchedWords >= 2) return true;
  }

  return false;
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
  const modifiersByName = new Map();
  const exactMatchedPatterns = new Set();
  const upperText = (text || '').toUpperCase();
  const compactText = upperText.replace(/[^A-Z0-9]/g, '');

  for (const [pattern, displayName] of Object.entries(KNOWN_HAZARDS)) {
    if (upperText.includes(pattern)) {
      exactMatchedPatterns.add(pattern);
      modifiersByName.set(displayName.toLowerCase(), {
        name: displayName,
        confidence: 95,
        rawText: pattern,
      });
      continue;
    }
    const compactPattern = pattern.replace(/[^A-Z0-9]/g, '');
    if (compactPattern && compactText.includes(compactPattern)) {
      exactMatchedPatterns.add(pattern);
      modifiersByName.set(displayName.toLowerCase(), {
        name: displayName,
        confidence: 95,
        rawText: pattern,
      });
    }
  }

  const normalizedWords = normalizeHazardTokenSequence(text);
  if (normalizedWords.length > 0) {
    for (const [pattern, displayName] of Object.entries(KNOWN_HAZARDS)) {
      if (exactMatchedPatterns.has(pattern)) continue;
      const patternWords = normalizeHazardTokenSequence(pattern);
      if (!fuzzyHazardPatternMatch(normalizedWords, patternWords)) continue;
      const key = displayName.toLowerCase();
      if (modifiersByName.has(key)) continue;
      modifiersByName.set(key, {
        name: displayName,
        confidence: 70,
        rawText: pattern,
      });
    }
  }

  return Array.from(modifiersByName.values());
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
        merged.push({ name, confidence: 86, confidenceSource: 'cloud_inferred', isTeammate: true });
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
        confidenceSource: 'cloud_inferred',
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
  if (/^\|+\s+\|+$/.test(String(value || '').replace(/\s+/g, ' ').trim())) {
    return 'pipe-spacer-player';
  }
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g, '');
}

const ARTIFACT_TYPE_BY_KEY = (() => {
  const next = new Map();
  (HAZARD_CATALOG.artifacts || []).forEach((entry) => {
    const artifactType = String(entry?.artifactType || '').trim();
    if (!artifactType) return;
    [artifactType, entry.displayName, ...(entry.aliases || [])].forEach((value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized) return;
      next.set(normalized, artifactType);
    });
  });
  return next;
})();

function resolveArtifactTypeCandidate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const prefixed = raw.match(/^\s*artifact\s*[:=\-]\s*(.+)\s*$/i);
  if (prefixed?.[1]) {
    const normalizedPrefixed = String(prefixed[1] || '').trim().toLowerCase();
    if (ARTIFACT_TYPE_BY_KEY.has(normalizedPrefixed)) {
      return ARTIFACT_TYPE_BY_KEY.get(normalizedPrefixed);
    }
  }
  const normalized = raw.toLowerCase();
  if (ARTIFACT_TYPE_BY_KEY.has(normalized)) {
    return ARTIFACT_TYPE_BY_KEY.get(normalized);
  }
  return '';
}

function deriveArtifactTypeFromEntries(entries = []) {
  for (const entry of entries) {
    const texts = typeof entry === 'string'
      ? [entry]
      : [entry?.name, entry?.rawText];
    for (const text of texts) {
      const resolved = resolveArtifactTypeCandidate(text);
      if (resolved) return resolved;
    }
  }
  return '';
}

function deriveArtifactTypeFromExtraction(extractedData) {
  if (!extractedData || typeof extractedData !== 'object') return '';
  return (
    deriveArtifactTypeFromEntries(extractedData.reachModifiers || [])
    || deriveArtifactTypeFromEntries(extractedData.hazards || [])
    || resolveArtifactTypeCandidate(extractedData.artifactType)
  );
}

function getPlayerNameVariantScore(name) {
  const value = String(name || '').trim();
  if (!value) return 0;
  let score = 0;
  if (/\s/.test(value)) score += 20;
  if (/[._-]/.test(value)) score += 8;
  if (/[a-z][A-Z]/.test(value) || /[A-Z]{2}[a-z]/.test(value)) score += 6;
  if (/'/.test(value)) score += 2;
  return score;
}

function dedupeExtractedPlayers(players, maxCount = 4) {
  if (!Array.isArray(players)) return [];
  const byName = new Map();
  players.forEach((player) => {
    const rawName = typeof player === 'string' ? player : player?.name;
    const cleanedName = cleanupCrewHubPlayerName(String(rawName || ''));
    const key = normalizeNameKey(cleanedName);
    if (!key || !cleanedName) return;
    const confidence = Number(player?.confidence);
    const existing = byName.get(key);
    const candidateEntry = {
      name: cleanedName,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(99, confidence)) : 0,
      confidenceSource: player?.confidenceSource,
      isTeammate: player?.isTeammate,
    };
    const shouldReplace = !existing
      || getPlayerNameVariantScore(candidateEntry.name) > getPlayerNameVariantScore(existing.name)
      || (
        getPlayerNameVariantScore(candidateEntry.name) === getPlayerNameVariantScore(existing.name)
        && candidateEntry.confidence > existing.confidence
      );
    if (shouldReplace) {
      byName.set(key, candidateEntry);
    }
  });
  return [...byName.values()]
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    .slice(0, Math.max(1, Number(maxCount || 4)));
}

function fuzzyMatchesPlayerName(candidateName, targetName, maxDistance = 1) {
  const candidateKey = normalizeNameKey(candidateName);
  const targetKey = normalizeNameKey(targetName);
  if (!candidateKey || !targetKey) return false;
  if (candidateKey === targetKey) return true;
  const adaptiveDistance = Math.max(
    maxDistance,
    Math.min(2, Math.floor(Math.min(candidateKey.length, targetKey.length) / 6))
  );
  if (Math.abs(candidateKey.length - targetKey.length) > adaptiveDistance) return false;
  return levenshtein(candidateKey, targetKey) <= adaptiveDistance;
}

function isActiveUserNameMatch(candidateName, activeUserName) {
  const candidateClean = cleanupCrewHubPlayerName(String(candidateName || ''));
  const activeClean = cleanupCrewHubPlayerName(String(activeUserName || ''));
  if (!candidateClean || !activeClean) return false;
  if (fuzzyMatchesPlayerName(candidateClean, activeClean, 1)) return true;

  const candidateKey = normalizeNameKey(candidateClean);
  const activeKey = normalizeNameKey(activeClean);
  if (!candidateKey || !activeKey) return false;

  const similarity = levenshteinSimilarity(candidateKey, activeKey);
  if (similarity >= 0.9) return true;

  const shorter = candidateKey.length <= activeKey.length ? candidateKey : activeKey;
  const longer = candidateKey.length <= activeKey.length ? activeKey : candidateKey;
  if (shorter.length >= 6 && longer.includes(shorter)) return true;
  return false;
}

function isPrefixVariantName(leftName, rightName) {
  const leftKey = normalizeNameKey(leftName);
  const rightKey = normalizeNameKey(rightName);
  if (!leftKey || !rightKey || leftKey === rightKey) return false;
  if (Math.min(leftKey.length, rightKey.length) >= 5 && levenshtein(leftKey, rightKey) <= 1) {
    return true;
  }
  const shorter = leftKey.length <= rightKey.length ? leftKey : rightKey;
  const longer = leftKey.length <= rightKey.length ? rightKey : leftKey;
  if (shorter.length < 4) return false;
  if (!longer.startsWith(shorter)) return false;
  return levenshtein(shorter, longer) <= 2;
}

function filterImplicitActiveUserFromTeammates(teammates, activeUser) {
  if (!Array.isArray(teammates) || teammates.length === 0) {
    return { teammates: [], removedCount: 0 };
  }
  const trimmedActiveUser = String(activeUser || '').trim();
  if (!trimmedActiveUser) {
    return { teammates: [...teammates], removedCount: 0 };
  }
  const filtered = [];
  let removedCount = 0;
  teammates.forEach((player) => {
    const name = String(player?.name || '').trim();
    if (isActiveUserNameMatch(name, trimmedActiveUser)) {
      removedCount += 1;
      return;
    }
    filtered.push(player);
  });
  return { teammates: filtered, removedCount };
}

function collapsePrefixTeammateVariants(teammates, maxCount = 4) {
  if (!Array.isArray(teammates) || teammates.length === 0) return { teammates: [], collapsedCount: 0 };
  const ranked = teammates
    .map((player) => ({
      ...player,
      name: String(player?.name || '').trim(),
      confidence: Number.isFinite(Number(player?.confidence)) ? Number(player.confidence) : 74,
    }))
    .filter((player) => player.name)
    .sort((a, b) => {
      const confDiff = Number(b.confidence || 0) - Number(a.confidence || 0);
      if (confDiff !== 0) return confDiff;
      return normalizeNameKey(b.name).length - normalizeNameKey(a.name).length;
    });

  const kept = [];
  let collapsedCount = 0;
  ranked.forEach((candidate) => {
    let merged = false;
    for (let idx = 0; idx < kept.length; idx += 1) {
      const existing = kept[idx];
      if (!isPrefixVariantName(existing.name, candidate.name)) continue;
      merged = true;
      collapsedCount += 1;
      const existingKeyLen = normalizeNameKey(existing.name).length;
      const candidateKeyLen = normalizeNameKey(candidate.name).length;
      const shouldReplace = candidateKeyLen > existingKeyLen
        || (candidateKeyLen === existingKeyLen && Number(candidate.confidence || 0) > Number(existing.confidence || 0));
      if (shouldReplace) {
        kept[idx] = {
          ...candidate,
          confidence: Math.max(Number(candidate.confidence || 0), Number(existing.confidence || 0)),
        };
      } else {
        kept[idx] = {
          ...existing,
          confidence: Math.max(Number(existing.confidence || 0), Number(candidate.confidence || 0)),
        };
      }
      break;
    }
    if (!merged) kept.push(candidate);
  });

  return {
    teammates: kept
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
      .slice(0, Math.max(1, Number(maxCount || 4))),
    collapsedCount,
  };
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
      : 0;
    names.push({
      name: cleaned,
      confidence: Number.isFinite(avgConfidence) ? Math.max(0, Math.min(99, avgConfidence)) : 0,
      confidenceSource: 'direct_ocr',
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
      debugLayout: rawDebugLayout = false,
      gameResolution: rawGameResolution = null,
      deviceDisplayInfo: rawDeviceDisplayInfo = null,
      aspectProfile: rawAspectProfile = null,
      performanceMode: rawPerformanceMode = false,
    } = options;
    const performanceMode = rawPerformanceMode === true;
    const includeBboxes = rawIncludeBboxes === true;
    const shouldArchiveOcrSample = rawArchiveOcrSample === true;
    const archiveMetadata = (rawArchiveMetadata && typeof rawArchiveMetadata === 'object')
      ? rawArchiveMetadata
      : {};
    const routingProfile = rawRoutingProfile === 'names-only' ? 'names-only' : 'default';
    const fontProfile = rawFontProfile === 'ealing-black-italic' ? 'ealing-black-italic' : 'default';
    const nameRerouteThreshold = Math.max(50, Math.min(95, Number(rawNameRerouteThreshold) || 78));
    const maxReroutePasses = Math.max(0, Math.min(2, Math.round(Number(rawMaxReroutePasses) || 1)));
    const debugLayout = rawDebugLayout === true || String(process.env.WILDGATE_OCR_DEBUG_LAYOUT || '').trim() === '1';
    const gameResolution = (rawGameResolution && typeof rawGameResolution === 'object') ? rawGameResolution : {};
    const deviceDisplayInfo = (rawDeviceDisplayInfo && typeof rawDeviceDisplayInfo === 'object') ? rawDeviceDisplayInfo : {};
    const geometryHints = {
      displayWidth: toPositiveInt(deviceDisplayInfo.displayWidth) || toPositiveInt(gameResolution.resX),
      displayHeight: toPositiveInt(deviceDisplayInfo.displayHeight) || toPositiveInt(gameResolution.resY),
      aspectProfile: rawAspectProfile || deviceDisplayInfo.aspectProfile || null,
    };
    const ocrRegions = sanitizeOcrRegions(rawOcrRegions);
    const inferredScreenType =
      (typeof rawScreenTypeHint === 'string' ? rawScreenTypeHint : '');
    const normalizedScreenTypeHint = String(inferredScreenType || '').trim().toLowerCase();
    const hintedScreenType = (
      normalizedScreenTypeHint === 'crewhub' ||
      normalizedScreenTypeHint === 'crew_hub'
    ) ? SCREEN_TYPES.CREW_HUB : (
      normalizedScreenTypeHint === 'mapscreen' ||
      normalizedScreenTypeHint === 'map_screen' ||
      normalizedScreenTypeHint === 'tactical_map'
    ) ? SCREEN_TYPES.MAP_SCREEN : null;
    const ocrRegionFingerprint = getOcrRegionsCacheFingerprint(ocrRegions);
    const routingFingerprint = `${routingProfile}:${fontProfile}:${nameRerouteThreshold}:${maxReroutePasses}`;
    console.log('[OCR] Starting processCapture');
    console.log('[OCR] activeUser:', activeUser);
    console.log('[OCR] hasExistingData:', !!existingData);
    console.log('[OCR] ocrMode:', ocrMode);
    console.log('[OCR] routingProfile:', routingProfile);
    console.log('[OCR] fontProfile:', fontProfile);
    if (geometryHints.displayWidth > 0 && geometryHints.displayHeight > 0) {
      console.log(`[OCR] Geometry hint display=${geometryHints.displayWidth}x${geometryHints.displayHeight}`);
    }
    if (geometryHints.aspectProfile) {
      console.log(`[OCR] Geometry hint aspectProfile=${String(geometryHints.aspectProfile)}`);
    }
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
    const geometry = buildOcrGeometry(processed, geometryHints);
    console.log(
      `[OCR] Preprocessing done: original=${processed.originalWidth}x${processed.originalHeight}, ` +
      `ocrInput=${processed.width}x${processed.height}, scale=${Number(processed.scale || 1).toFixed(4)}, ` +
      `mode=${preMeta.mode || 'unknown'}, downscaleCapWidth=${preMeta.downscaleCapWidth || OCR_PREPROCESS_DOWNSCALE_WIDTH}`
    );
    console.log(
      `[OCR] Geometry: original=${geometry.originalWidth}x${geometry.originalHeight}, ` +
      `ocrInput=${geometry.ocrWidth}x${geometry.ocrHeight}, aspectProfile=${geometry.aspectProfile}, ` +
      `ocrScaleX=${geometry.ocrScaleX.toFixed(4)}, ocrScaleY=${geometry.ocrScaleY.toFixed(4)}`
    );
    if (debugLayout) console.log('[OCR] Layout debug enabled');

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
    const ocrResult = await runOCR(processed.buffer, null, { performanceMode });
    console.log(`[OCR] Local OCR done, text length: ${ocrResult.text?.length || 0}`);
    console.log('[OCR] OCR complete, text length:', ocrResult.text?.length || 0);

    // Detect screen type
    const screenDetection = detectScreenTypeFromLines(
      ocrResult.lines,
      processed.width,
      processed.height
    );
    console.log('[OCR] Screen detection:', screenDetection);
    const resolvedScreenType = hintedScreenType
      && (screenDetection.type === SCREEN_TYPES.UNKNOWN || Number(screenDetection.confidence || 0) < 70)
      ? hintedScreenType
      : screenDetection.type;
    if (hintedScreenType && resolvedScreenType !== screenDetection.type) {
      console.log(`[OCR] Screen type override from hint: ${screenDetection.type} -> ${resolvedScreenType}`);
    }

    // Extract based on screen type
    let extractedData = null;
    const runtimeAnchors = deriveRuntimeAnchors(resolvedScreenType, ocrResult, processed, ocrRegions);
    const activeRegions = applyRuntimeAnchors(ocrRegions, runtimeAnchors);
    if (debugLayout) {
      console.log('[OCR] Runtime anchors:', JSON.stringify(runtimeAnchors || null));
      console.log('[OCR] Active regions:', JSON.stringify(activeRegions || null));
    }
    const targetedRetries = [];

    if (resolvedScreenType === SCREEN_TYPES.CREW_HUB) {
      console.log('[OCR] Processing as CREW HUB');

      extractedData = await extractCrewHub(
        processed.buffer,
        activeUser,
        ocrResult,
        processed.width,
        processed.height,
        processed.scale,
        imageBuffer,
        activeRegions.crewHub,
        { geometry, debugLayout }
      );

      extractedData = convertCrewHubToLegacy(extractedData, ocrResult.text);

    } else if (resolvedScreenType === SCREEN_TYPES.MAP_SCREEN) {
      console.log('[OCR] Processing as MAP SCREEN');

      const PLAYER_REGION = activeRegions.mapScreen.players;
      const YOUR_SHIP_REGION = activeRegions.mapScreen.yourShip;
      if (imageBuffer) {
        console.log('[OCR-Region] Running region-specific OCR for map teammate list');
      }
      const [regionResult, yourShipRegionResult] = await Promise.all([
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
        imageBuffer
          ? cropRegionAndOCR(
            imageBuffer,
            YOUR_SHIP_REGION,
            processed.originalWidth,
            processed.originalHeight,
            6,
            fontProfile,
            { threshold: 0.15 }
          )
          : Promise.resolve(null),
      ]);

      const yourShipRegionWordsRaw = Array.isArray(yourShipRegionResult?.words)
        ? yourShipRegionResult.words
        : [];
      if (imageBuffer) {
        if (yourShipRegionWordsRaw.length > 0) {
          const previewTokens = yourShipRegionWordsRaw
            .map((word) => String(word?.text || '').trim())
            .filter(Boolean)
            .slice(0, 18);
          console.log(
            `[OCR-Region] YOUR_SHIP region words (${yourShipRegionWordsRaw.length}, threshold=0.15): ${previewTokens.join(' | ')}`
          );
        } else {
          console.log('[OCR-Region] YOUR_SHIP region OCR returned no words (threshold=0.15)');
        }
      }

      const yourShipScaleX = processed.originalWidth > 0
        ? (processed.width / processed.originalWidth)
        : 1;
      const yourShipScaleY = processed.originalHeight > 0
        ? (processed.height / processed.originalHeight)
        : 1;
      const yourShipRegionWordsForMap = yourShipRegionWordsRaw.map((word) => ({
        ...word,
        bbox: {
          x0: Number(word?.bbox?.x0 || 0) * yourShipScaleX,
          y0: Number(word?.bbox?.y0 || 0) * yourShipScaleY,
          x1: Number(word?.bbox?.x1 || 0) * yourShipScaleX,
          y1: Number(word?.bbox?.y1 || 0) * yourShipScaleY,
        },
      }));

      const mapScreenData = await extractMapScreen(
        processed.buffer,
        ocrResult,
        processed.width,
        processed.height,
        activeRegions.mapScreen,
        { yourShipRegionWords: yourShipRegionWordsForMap, geometry, debugLayout }
      );

      if (imageBuffer && (Array.isArray(mapScreenData?.hazards) ? mapScreenData.hazards.length : 0) < 2) {
        const fallbackHazardRegion = { xMin: 0.60, xMax: 1.0, yMin: 0.28, yMax: 0.90 };
        const hazardRegion = activeRegions?.mapScreen?.hazards || fallbackHazardRegion;
        const hazardRetry = await cropRegionAndOCR(
          imageBuffer,
          hazardRegion,
          processed.originalWidth,
          processed.originalHeight,
          6,
          fontProfile
        );
        const retryWords = Array.isArray(hazardRetry?.words) ? hazardRetry.words : [];
        const retryLineText = groupCrewHubWordsIntoLines(retryWords, processed.originalHeight)
          .map(line => line.words.map(w => String(w.text || '').trim()).join(' ').trim())
          .filter(Boolean)
          .join('\n');
        const retryText = String(hazardRetry?.text || retryLineText || '').trim();
        const retryHazards = retryText
          ? extractHazards(
            retryText,
            retryWords,
            processed.originalWidth,
            processed.originalHeight,
            { HAZARDS: hazardRegion }
          )
          : [];
        if (retryHazards.length > 0) {
          const mergedHazards = new Map();
          [...(mapScreenData.hazards || []), ...retryHazards].forEach((hazard) => {
            const name = String(hazard || '').trim();
            const key = name.toLowerCase();
            if (!key || mergedHazards.has(key)) return;
            mergedHazards.set(key, name);
          });
          mapScreenData.hazards = Array.from(mergedHazards.values());
        }
      }

      if (imageBuffer && Array.isArray(mapScreenData?.enemyShips) && mapScreenData.enemyShips.length > 0) {
        const enemyRegionKeys = ['enemyShips', 'enemyShips2', 'enemyShips3', 'enemyShips4'];
        for (const ship of mapScreenData.enemyShips) {
          const currentShipType = String(ship?.shipType || '').trim();
          const slotIndex = Number(ship?._slotIndex);
          if (currentShipType && currentShipType.toLowerCase() !== 'unknown') continue;
          if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= enemyRegionKeys.length) continue;
          const regionKey = enemyRegionKeys[slotIndex];
          const region = activeRegions?.mapScreen?.[regionKey];
          if (!region) continue;
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
          if (!shipTypeRaw) continue;
          ship.shipType = shipTypeRaw.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
          ship.confidence = Math.max(72, Number(ship?.confidence || 0));
        }
      }

      const missingYourShip = !mapScreenData?.yourShip?.shipType;
      if (imageBuffer && missingYourShip) {
        const retryRegions = ['yourShip'];
        console.log('[OCR-Region] MAP_SCREEN: skipping enemy-panel retry strip passes');

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
        const existingTeammates = Array.isArray(extractedData.teammates) ? extractedData.teammates : [];
        const existingCount = existingTeammates.length;
        if (regionPlayers.length > 0) {
          const mergedTeammates = dedupeExtractedPlayers(
            [
              ...existingTeammates.map((player) => ({
                name: typeof player === 'string' ? player : player?.name,
                confidence: Number.isFinite(Number(player?.confidence)) ? Number(player.confidence) : 0,
                confidenceSource: player?.confidenceSource,
                isTeammate: true,
              })),
              ...regionPlayers.map((player) => ({
                name: typeof player === 'string' ? player : player?.name,
                confidence: Number.isFinite(Number(player?.confidence)) ? Number(player.confidence) : 0,
                confidenceSource: 'region_ocr',
                isTeammate: true,
              })),
            ],
            4
          ).map((player) => ({ ...player, isTeammate: true }));

          const added = Math.max(0, mergedTeammates.length - existingCount);
          console.log(
            `[OCR-Region] Region OCR extracted ${regionPlayers.length} teammate(s) (full-image had ${existingCount}); merged=${mergedTeammates.length} (+${added}): ${mergedTeammates.map((p) => p.name).join(', ')}`
          );
          extractedData.teammates = mergedTeammates;
        } else {
          console.log(`[OCR-Region] Region OCR found ${regionResult.words.length} words but no valid player names; keeping ${existingCount} from full-image`);
        }
      } else if (imageBuffer) {
        console.log('[OCR-Region] Region OCR returned no results; keeping full-image extraction');
      }

    } else {
      console.log('[OCR] Unknown screen type, returning empty extraction');
      extractedData = {
        screenshotType: 'unknown',
        playerTeamName: undefined,
        teammates: [],
        opponentTeams: [],
        reachModifiers: [],
        hazards: [],
        enemyShips: [],
        overallConfidence: 0,
        captureTimestamp: Date.now(),
        rawText: ocrResult.text || '',
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
          const candidatePlayers = routedPlayers.map((player) => ({
            name: typeof player === 'string' ? player : player?.name,
            confidence: Number.isFinite(Number(player?.confidence)) ? Number(player.confidence) : 0,
            confidenceSource: 'region_ocr',
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

    if (Array.isArray(extractedData?.teammates) && extractedData.teammates.length > 0) {
      const normalizedTeammates = extractedData.teammates
        .map((player) => {
          const source = (player && typeof player === 'object') ? player : {};
          const rawName = typeof player === 'string' ? player : source?.name;
          const cleanedName = cleanupCrewHubPlayerName(String(rawName || ''));
          if (!cleanedName) return null;
          return {
            ...source,
            name: cleanedName,
            confidence: Number.isFinite(Number(source?.confidence))
              ? Number(source.confidence)
              : 74,
            isTeammate: true,
          };
        })
        .filter(Boolean);

      const { teammates: withoutActiveUser, removedCount } = filterImplicitActiveUserFromTeammates(
        normalizedTeammates,
        activeUser
      );
      const { teammates: collapsedTeammates, collapsedCount } = collapsePrefixTeammateVariants(
        withoutActiveUser,
        4
      );
      extractedData.teammates = collapsedTeammates.map((player) => ({ ...player, isTeammate: true }));

      if (removedCount > 0) {
        console.log(`[OCR] Removed ${removedCount} implicit active-user teammate entr${removedCount === 1 ? 'y' : 'ies'} from OCR output`);
      }
      if (collapsedCount > 0) {
        console.log(`[OCR] Collapsed ${collapsedCount} near-duplicate teammate name entr${collapsedCount === 1 ? 'y' : 'ies'} (prefix/edit-distance merge)`);
      }
    }

    extractedData = cleanupLegacyExtraction(extractedData);

    console.log('[OCR] Extraction complete:', {
      type: extractedData.screenshotType,
      teammates: extractedData.teammates?.length || 0,
      opponentTeams: extractedData.opponentTeams?.length || 0,
      confidence: (extractedData.overallConfidence || 0).toFixed(1),
      routed: routingDebug.applied,
    });

    const derivedArtifactType = deriveArtifactTypeFromExtraction(extractedData);
    if (derivedArtifactType) extractedData.artifactType = derivedArtifactType;

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
        resolvedScreenType,
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
function normalizePlayerShipName(rawName, shipType = '') {
  const base = String(rawName || '')
    .replace(/\s*['’]s\s+crew\s*$/i, '')
    .trim();
  if (!base) return '';
  if (isUnderCrewShipBonusText(base)) return '';
  const lowered = base.toLowerCase();
  if (lowered === 'your team' || lowered === 'friendly team' || lowered === 'my crew') return '';
  const normalizedShipType = String(shipType || '')
    .replace(/\s*\(\s*\d+\s*player[s]?\s*\)\s*$/i, '')
    .trim()
    .toLowerCase();
  if (normalizedShipType && lowered === normalizedShipType) return '';
  return base;
}

const UNDERCREW_SHIP_BONUS_PHRASES = new Set([
  'SMALL CREW BONUS',
  'SMALLCREWBONUS',
  'SMALL CREWBONUS',
  'SMALLCREW BONUS',
  'REDUCED FIRES',
  'REDUCEDFIRES',
  'REDUCED FIRED',
  'REDUCEDFIRED',
]);
const SHIP_CAPACITY_BY_TYPE = {
  hunter: 4,
  bastion: 4,
  privateer: 4,
  scout: 3,
  'battle scout': 3,
  outlaw: 2,
  'solo outlaw': 1,
};

function isUnderCrewShipBonusText(input) {
  const normalized = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  return UNDERCREW_SHIP_BONUS_PHRASES.has(normalized);
}

function normalizeShipCapacityKey(shipType) {
  return String(shipType || '')
    .replace(/\s*\(\s*\d+\s*player[s]?\s*\)\s*$/i, '')
    .trim()
    .toLowerCase();
}

function getMaxTeammatesForShipType(shipType) {
  const capacity = SHIP_CAPACITY_BY_TYPE[normalizeShipCapacityKey(shipType)] || 4;
  return Math.max(0, capacity - 1);
}

const LEGACY_MAX_TEAMMATES = 4;

function cleanupLegacyTeammates(teammates, shipType, options = {}) {
  if (!Array.isArray(teammates)) return [];
  const enforceShipCapacity = options.enforceShipCapacity !== false;
  const maxTeammates = enforceShipCapacity
    ? getMaxTeammatesForShipType(shipType)
    : LEGACY_MAX_TEAMMATES;
  const unique = [];
  const seen = new Set();
  for (const teammate of teammates) {
    const rawName = typeof teammate === 'string' ? teammate : teammate?.name;
    const cleanedName = cleanupCrewHubPlayerName(String(rawName || ''));
    if (!cleanedName || isUnderCrewShipBonusText(cleanedName)) continue;
    const key = normalizeNameKey(cleanedName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...(teammate && typeof teammate === 'object' ? teammate : {}),
      name: cleanedName,
      confidence: Number.isFinite(Number(teammate?.confidence)) ? Number(teammate.confidence) : 74,
      isTeammate: true,
    });
    if (unique.length >= maxTeammates) break;
  }
  return unique;
}

function cleanupLegacyOpponentTeams(opponentTeams) {
  if (!Array.isArray(opponentTeams)) return [];
  return opponentTeams
    .map((team, index) => {
      const nextPlayers = [];
      const seenPlayers = new Set();
      for (const player of (team?.players || [])) {
        const rawName = typeof player === 'string' ? player : player?.name;
        const cleanedName = cleanupCrewHubPlayerName(String(rawName || ''));
        if (!cleanedName || isUnderCrewShipBonusText(cleanedName)) continue;
        const key = normalizeNameKey(cleanedName);
        if (!key || seenPlayers.has(key)) continue;
        seenPlayers.add(key);
        nextPlayers.push({
          ...(player && typeof player === 'object' ? player : {}),
          name: cleanedName,
          confidence: Number.isFinite(Number(player?.confidence)) ? Number(player.confidence) : 72,
          isTeammate: false,
        });
        if (nextPlayers.length >= 4) break;
      }
      const teamName = String(team?.teamName || '').trim();
      const sanitizedTeamName = isUnderCrewShipBonusText(teamName) ? '' : teamName;
      return {
        ...team,
        teamName: sanitizedTeamName || `Enemy Team ${index + 1}`,
        shipType: String(team?.shipType || '').trim(),
        color: String(team?.color || team?.teamColor || 'unknown').trim() || 'unknown',
        players: nextPlayers,
        confidence: Number(team?.confidence || 0) || 0,
      };
    })
    .filter((team) => team.players.length > 0 || (!!team.shipType && team.color !== 'unknown') || !/^enemy team \d+$/i.test(team.teamName));
}

function cleanupLegacyEnemyShips(enemyShips) {
  if (!Array.isArray(enemyShips)) return [];
  const deduped = [];
  const seen = new Set();
  for (const ship of enemyShips) {
    const teamName = String(ship?.teamName || '').trim();
    if (isUnderCrewShipBonusText(teamName)) continue;
    const color = String(ship?.color || ship?.teamColor || 'unknown').trim() || 'unknown';
    const shipType = String(ship?.shipType || '').trim();
    const confidence = Number(ship?.confidence || 0) || 0;
    const key = [
      teamName ? normalizeNameKey(teamName) : '',
      color.toLowerCase(),
      normalizeShipCapacityKey(shipType),
    ].join('|');
    if (seen.has(key)) continue;
    const hasNamedTeam = teamName && !/^enemy team \d+$/i.test(teamName);
    const evidenceScore = Number(Boolean(shipType)) + Number(color !== 'unknown') + Number(Boolean(hasNamedTeam));
    if (!hasNamedTeam && evidenceScore < 2 && confidence < 80) continue;
    seen.add(key);
    deduped.push({
      ...ship,
      teamName: teamName || `Enemy Team ${deduped.length + 1}`,
      color,
      teamColor: color,
      shipType,
      confidence,
    });
  }
  return deduped;
}

function cleanupLegacyExtraction(extractedData) {
  if (!extractedData || typeof extractedData !== 'object') return extractedData;
  const screenshotType = String(extractedData.screenshotType || '').trim().toLowerCase();
  const enforceCrewCapacity = screenshotType !== 'crew_hub';
  const shipTypeHint = extractedData.playerShip?.shipType || '';
  const playerTeamName = String(extractedData.playerTeamName || '').trim();
  const cleanedPlayerTeamName = playerTeamName && !isUnderCrewShipBonusText(playerTeamName)
    ? playerTeamName
    : undefined;
  const cleanedPlayerShipName = normalizePlayerShipName(extractedData.playerShipName || '', shipTypeHint) || undefined;
  const cleanedPlayerShip = extractedData.playerShip
    ? {
      ...extractedData.playerShip,
      teamName: cleanedPlayerTeamName || undefined,
    }
    : extractedData.playerShip;

  return {
    ...extractedData,
    playerTeamName: cleanedPlayerTeamName,
    playerShipName: cleanedPlayerShipName,
    playerShip: cleanedPlayerShip,
    teammates: cleanupLegacyTeammates(extractedData.teammates, shipTypeHint, {
      enforceShipCapacity: enforceCrewCapacity,
    }),
    opponentTeams: cleanupLegacyOpponentTeams(extractedData.opponentTeams),
    enemyShips: cleanupLegacyEnemyShips(extractedData.enemyShips),
  };
}

function convertCrewHubToLegacy(crewHubData, rawText) {
  const capPlayers = (players, maxCount = 4) => {
    if (!Array.isArray(players)) return [];
    const ranked = [...players].sort((a, b) => (Number(b?.confidence || 0) - Number(a?.confidence || 0)));
    return ranked.slice(0, maxCount);
  };
  const hazardNames = Array.isArray(crewHubData?.hazards)
    ? Array.from(new Set(crewHubData.hazards.map((hazard) => String(hazard || '').trim()).filter(Boolean)))
    : [];

  const teammates = capPlayers((crewHubData.yourTeam?.players || []).map(name => ({
    name: typeof name === 'string' ? name : name.name,
    confidence: typeof name === 'string' ? 80 : (Number.isFinite(Number(name.confidence)) ? Number(name.confidence) : 0),
    confidenceSource: typeof name === 'string' ? 'direct_ocr' : (name.confidenceSource || 'direct_ocr'),
    isTeammate: true,
  })), LEGACY_MAX_TEAMMATES);

  const opponentTeams = (crewHubData.enemyTeams || []).map(team => ({
    teamName: team.name || 'Unknown Team',
    teamNameSource: team.nameSource || 'fallback',
    shipType: team.shipType || '',
    color: team.color || 'unknown',
    sourceRowIndex: Number.isInteger(team.sourceRowIndex) ? team.sourceRowIndex : undefined,
    sourceRowY: Number.isFinite(team.sourceRowY) ? team.sourceRowY : undefined,
    players: capPlayers((team.players || []).map(p => ({
      name: typeof p === 'string' ? p : p.name,
      confidence: typeof p === 'string' ? 75 : (Number.isFinite(Number(p.confidence)) ? Number(p.confidence) : 0),
      confidenceSource: typeof p === 'string' ? 'direct_ocr' : (p.confidenceSource || 'direct_ocr'),
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

  const playerTeamName = String(crewHubData.yourTeam?.name || '').trim() || undefined;
  const playerShipName = normalizePlayerShipName(
    crewHubData.yourTeam?.name || '',
    crewHubData.yourTeam?.shipType || ''
  ) || undefined;
  const hazardModifiers = hazardNames.map((name) => ({
    name,
    confidence: 70,
    rawText: name,
  }));

  return cleanupLegacyExtraction({
    screenshotType: 'crew_hub',
    playerTeamName,
    playerShipName,
    teammates,
    opponentTeams,
    reachModifiers: mergeModifierLists(extractModifiers(rawText), hazardModifiers),
    hazards: hazardNames,
    overallConfidence,
    isPartialCapture: crewHubData.isPartialCapture || false,
    captureTimestamp: Date.now(),
    rawText: rawText || '',
  });
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
  const mapPlayerTeamName = String(mapScreenData.yourShip?.teamName || '').trim() || undefined;
  const mapPlayerShipName = normalizePlayerShipName(
    mapScreenData.yourShip?.shipName || '',
    mapScreenData.yourShip?.shipType || ''
  ) || undefined;

  const enemyShips = (mapScreenData.enemyShips || []).map((ship, index) => ({
    teamName: String(ship.teamName || '').trim() || `Enemy Team ${index + 1}`,
    shipType: ship.shipType || 'Unknown',
    teamColor: ship.teamColor || ship.color || 'unknown',
    color: ship.teamColor || ship.color || 'unknown',
    confidence: ship.confidence || 70,
    sourceSlotIndex: Number.isInteger(ship._slotIndex) ? ship._slotIndex : undefined,
    sourceSlotY: Number.isFinite(ship._slotCenterY) ? ship._slotCenterY : undefined,
  }));

  // Convert players to teammates format
  const maxTeammates = getMaxTeammatesForShipType(mapScreenData.yourShip?.shipType || '');
  const teammates = (mapScreenData.players || []).map(name => ({
    name: typeof name === 'string' ? name : name.name,
    confidence: typeof name === 'string' ? 70 : (Number.isFinite(Number(name.confidence)) ? Number(name.confidence) : 0),
    confidenceSource: typeof name === 'string' ? 'legacy_default' : (name.confidenceSource || 'direct_ocr'),
    isTeammate: true,
  })).slice(0, maxTeammates);

  // Create opponent teams from enemy ships (without player info)
  const opponentTeams = enemyShips.map(ship => ({
    teamName: ship.teamName,
    shipType: ship.shipType,
    teamColor: ship.teamColor || ship.color || 'unknown',
    color: ship.color,
    players: [],
    confidence: ship.confidence,
    sourceSlotIndex: Number.isInteger(ship.sourceSlotIndex) ? ship.sourceSlotIndex : undefined,
    sourceSlotY: Number.isFinite(ship.sourceSlotY) ? ship.sourceSlotY : undefined,
  }));

  // Calculate confidence
  const allConfidences = [
    mapScreenData.confidence || 0,
    ...enemyShips.map(s => s.confidence),
  ];
  const overallConfidence = allConfidences.length > 0
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0;

  return cleanupLegacyExtraction({
    screenshotType: 'tactical_map',
    playerShip,
    playerTeamName: mapPlayerTeamName,
    playerShipName: mapPlayerShipName,
    enemyShips,
    teammates,
    opponentTeams,
    reachModifiers: [...extractModifiers(rawText), ...hazardMods],
    hazards: mapScreenData.hazards || [],
    mapRoutingMeta: mapScreenData.routingMeta || null,
    overallConfidence,
    captureTimestamp: Date.now(),
    rawText: rawText || '',
  });
}

/**
 * Register IPC handlers for OCR operations
 * @param {import('electron').BrowserWindow} [mainWindow] - Main app window to hide during capture
 */
function registerOCRHandlers(mainWindow) {
  scheduleOcrDebugPrune('startup');

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
      restoreHiddenCaptureWindow(mainWindow, { wasVisible });
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
      scheduleOcrDebugPrune('save');
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
    return {
      success: false,
      error: 'Dictionary regeneration is not supported with PaddleOCR runtime',
    };
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
  captureGameWindowBuffer,
  processCapture,
  preprocessImage,
  runOCR,
  initPaddleOCR,
  extractModifiers,
  __test__: {
    buildOcrGeometry,
    cleanupLegacyExtraction,
    convertCrewHubToLegacy,
    detectAspectProfile,
    deriveRuntimeAnchors,
    findHeaderAnchorY,
    getMaxTeammatesForShipType,
    restoreHiddenCaptureWindow,
  },
};
