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
const { extractCrewHub } = require('./crewHubExtractor.cjs');
const { extractMapScreen, extractPlayerList, KNOWN_HAZARDS } = require('./mapScreenExtractor.cjs');
const { mergeCaptures, isSameMatch } = require('./ocrMerger.cjs');
const gcloudService = require('./gcloudService.cjs');
const gcloudSyncService = require('./gcloudSyncService.cjs');
const geminiService = require('./geminiService.cjs');
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
const LOW_WORD_CONFIDENCE_THRESHOLD = Math.min(80, Math.max(0, parseInt(process.env.WILDGATE_OCR_WORD_CONF_MIN || '25', 10) || 25));
const CPU_COUNT = Math.max(1, Number.isFinite(os.cpus()?.length) ? os.cpus().length : 1);
const OCR_MAX_CONCURRENT = Math.min(4, Math.max(1, parseInt(process.env.WILDGATE_OCR_MAX_CONCURRENT || '1', 10) || 1));
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
      teamHeader: { xMin: 0.0, xMax: 0.45, yMin: 0.05, yMax: 0.20 },
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
      enemyShips: { xMin: 0.60, xMax: 1.0, yMin: 0.00, yMax: 0.10 },
      enemyShips2: { xMin: 0.60, xMax: 1.0, yMin: 0.10, yMax: 0.20 },
      enemyShips3: { xMin: 0.60, xMax: 1.0, yMin: 0.20, yMax: 0.30 },
      enemyShips4: { xMin: 0.60, xMax: 1.0, yMin: 0.30, yMax: 0.40 },
      hazards: { xMin: 0.60, xMax: 1.0, yMin: 0.30, yMax: 0.70 },
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
      rightPanel: sanitizeRegionBounds(crewHub.rightPanel, defaults.crewHub.rightPanel),
      teamHeader: sanitizeRegionBounds(crewHub.teamHeader, defaults.crewHub.teamHeader),
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

function buildCacheKey(imageHash, activeUser = null, ocrMode = 'both', regionFingerprint = 'default') {
  const normalizedUser = String(activeUser || '').trim().toLowerCase();
  const normalizedMode = String(ocrMode || 'both').trim().toLowerCase();
  return `${imageHash}|u:${normalizedUser}|m:${normalizedMode}|r:${regionFingerprint}`;
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

// Save debug image + optional cloud upload
async function saveDebugImage(buffer, prefix = 'capture') {
  ensureDebugDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}_${timestamp}.png`;
  const filepath = path.join(DEBUG_DIR, filename);
  await fsPromises.writeFile(filepath, buffer);

  // Auto-upload to GCS (fire-and-forget)
  if (gcloudSyncService.isInitialized) {
    gcloudSyncService.uploadFile(filepath, `screenshots/${filename}`)
      .then(result => {
        if (result.success) {
          console.log(`[GCloud-Upload] Uploaded ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
        } else {
          console.warn(`[GCloud-Upload] Failed ${filename}: ${result.error}`);
        }
      })
      .catch(err => {
        console.warn(`[GCloud-Upload] Error uploading ${filename}:`, err.message);
      });
  } else {
    console.log(`[GCloud-Upload] Skipped ${filename} - GCloud sync not initialized`);
  }

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
  try {
    await fsPromises.access(OCR_USER_WORDS_FILE, fs.constants.F_OK);
    return OCR_USER_WORDS_FILE;
  } catch {
    return null;
  }
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
});

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

    // Scale up 2x for better OCR if small
    const scale = metadata.width < 2000 ? 2 : 1;

    const processed = await image
      .resize(metadata.width * scale, metadata.height * scale, {
        kernel: sharp.kernel.nearest,
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
      width: metadata.width * scale,
      height: metadata.height * scale,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
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

async function preprocessRegionCropFirst(imageBuffer, regionPixels, scale = REGION_OCR_SCALE) {
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
    .modulate({ brightness: 1.2 })
    .linear(1.5, -(0.5 * 128))
    .sharpen({ sigma: 1.5, m1: 1.5, m2: 0.7 })
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
async function cropRegionAndOCR(imageBuffer, region, fullWidth, fullHeight, psm = null) {
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

    const cropped = await preprocessRegionCropFirst(imageBuffer, regionPixels);

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
 */
function buildOcrBoundingBoxDebugPayload(ocrSource, ocrResult, localOCRForFallback, processed) {
  const imageWidth = Math.max(1, toFiniteNumber(processed?.originalWidth, processed?.width || 0));
  const imageHeight = Math.max(1, toFiniteNumber(processed?.originalHeight, processed?.height || 0));
  const scale = Number.isFinite(processed?.scale) && processed.scale > 0 ? processed.scale : 1;

  if (ocrSource === 'cloud') {
    const cloudWords = Array.isArray(ocrResult?.words) ? ocrResult.words : [];
    return {
      source: 'cloud',
      imageWidth,
      imageHeight,
      words: cloudWords.map(word => normalizeDebugWord(word, 1, imageWidth, imageHeight)),
    };
  }

  const localWords = Array.isArray(localOCRForFallback?.words) && localOCRForFallback.words.length > 0
    ? localOCRForFallback.words
    : (Array.isArray(ocrResult?.words) ? ocrResult.words : []);

  return {
    source: 'local',
    imageWidth,
    imageHeight,
    words: localWords.map(word => normalizeDebugWord(word, scale, imageWidth, imageHeight)),
  };
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
 * Convert Google Cloud Vision annotations to the same word/line shape as Tesseract.
 * Cloud Vision annotations[0] is the full text; annotations[1..n] are individual words.
 * Each annotation has boundingPoly.vertices [{x,y}, ...] — we convert to {x0,y0,x1,y1}.
 */
function cloudAnnotationsToWords(annotations) {
  if (!annotations || annotations.length === 0) return [];
  return annotations
    .filter(a => a && a.text)
    .filter(a => {
      // Backward compatibility: some providers include a full-text blob in index 0.
      // Keep only likely word-level tokens for spatial matching.
      const t = (a.text || '').trim();
      if (!t) return false;
      if (t.length > 80) return false;
      if (t.includes('\n') && t.length > 30) return false;
      return true;
    })
    .map(a => {
    const verts = a.bounds || [];
    const xs = verts.map(v => v.x || 0);
    const ys = verts.map(v => v.y || 0);
    return {
      text: a.text || '',
      confidence: typeof a.confidence === 'number' ? a.confidence : 85,
      bbox: {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      },
      source: 'cloud',
    };
    });
}

/**
 * Merge OCR results from local Tesseract and Google Cloud Vision.
 * Returns a unified result in the same shape as runOCR() output,
 * plus merge metadata for debugging.
 *
 * Merge strategy:
 * - Match words by bounding-box IoU (>0.3) OR Levenshtein similarity (>0.7)
 * - CJK words: prefer cloud result, boost confidence by 15%
 * - Agreement: boost confidence to max(local, cloud) + 10 (capped at 99)
 * - Disagreement: keep best candidate, flag mergeConflict
 * - Unmatched words: include from whichever engine found them
 */
function mergeOCRResults(localResult, cloudResult) {
  const mergeStart = Date.now();
  const mergeLog = [];
  const stats = { total: 0, agreed: 0, cloudPreferred: 0, cloudPreferredCJK: 0, localOnly: 0, cloudOnly: 0, conflicts: 0 };

  const localWords = (localResult?.words || []).map(w => ({ ...w, source: 'local' }));
  const cloudWords = cloudAnnotationsToWords(cloudResult?.annotations || []);

  const usedCloudIndices = new Set();
  const mergedWords = [];

  // Phase 1: Match local words to cloud words
  for (const lw of localWords) {
    let bestMatch = null;
    let bestScore = 0;
    let bestIdx = -1;

    for (let ci = 0; ci < cloudWords.length; ci++) {
      if (usedCloudIndices.has(ci)) continue;
      const cw = cloudWords[ci];

      // Try bbox IoU first
      const iou = bboxIoU(lw.bbox, cw.bbox);
      // Then text similarity
      const sim = levenshteinSimilarity(
        (lw.text || '').toLowerCase(),
        (cw.text || '').toLowerCase()
      );

      const score = Math.max(iou, sim);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cw;
        bestIdx = ci;
      }
    }

    if (bestMatch && bestScore > 0.3) {
      usedCloudIndices.add(bestIdx);
      const hasCJK = CJK_REGEX.test(bestMatch.text) || CJK_REGEX.test(lw.text);
      const textsMatch = levenshteinSimilarity(
        (lw.text || '').toLowerCase(),
        (bestMatch.text || '').toLowerCase()
      ) > 0.85;

      let mergedWord;
      let decision;

      if (textsMatch) {
        // Agreement — boost confidence
        const boostedConf = Math.min(99, Math.max(lw.confidence, bestMatch.confidence) + 10);
        mergedWord = {
          text: hasCJK ? bestMatch.text : lw.text, // Prefer cloud text for CJK
          confidence: hasCJK ? Math.min(99, boostedConf + 5) : boostedConf,
          bbox: lw.bbox,
          source: 'merged',
          cloudContributed: true,
        };
        decision = `AGREE conf=${boostedConf}${hasCJK ? ' +CJK' : ''}`;
        stats.agreed++;
      } else if (hasCJK) {
        // CJK disagreement — prefer cloud
        mergedWord = {
          text: bestMatch.text,
          confidence: Math.min(99, bestMatch.confidence + 15),
          bbox: bestMatch.bbox,
          source: 'cloud',
          cloudContributed: true,
          mergeConflict: true,
        };
        decision = `CJK-CLOUD conf=${mergedWord.confidence} (local="${lw.text}" cloud="${bestMatch.text}")`;
        stats.cloudPreferred++;
        stats.cloudPreferredCJK++;
        stats.conflicts++;
      } else if (bestMatch.confidence > lw.confidence) {
        // Cloud has higher confidence
        mergedWord = {
          text: bestMatch.text,
          confidence: bestMatch.confidence,
          bbox: bestMatch.bbox,
          source: 'cloud',
          cloudContributed: true,
          mergeConflict: true,
        };
        decision = `CLOUD-WINS conf=${bestMatch.confidence} vs local=${lw.confidence}`;
        stats.cloudPreferred++;
        stats.conflicts++;
      } else {
        // Local wins
        mergedWord = {
          text: lw.text,
          confidence: lw.confidence,
          bbox: lw.bbox,
          source: 'local',
          cloudContributed: false,
          mergeConflict: true,
        };
        decision = `LOCAL-WINS conf=${lw.confidence} vs cloud=${bestMatch.confidence}`;
        stats.conflicts++;
      }

      mergedWords.push(mergedWord);
      mergeLog.push({ word: mergedWord.text, localText: lw.text, cloudText: bestMatch.text, decision });
    } else {
      // No cloud match — keep local word
      mergedWords.push({
        ...lw,
        source: 'local',
        cloudContributed: false,
      });
      mergeLog.push({ word: lw.text, decision: 'LOCAL-ONLY' });
      stats.localOnly++;
    }
  }

  // Phase 2: Add unmatched cloud words
  for (let ci = 0; ci < cloudWords.length; ci++) {
    if (usedCloudIndices.has(ci)) continue;
    const cw = cloudWords[ci];
    const hasCJK = CJK_REGEX.test(cw.text);
    mergedWords.push({
      ...cw,
      confidence: hasCJK ? Math.min(99, cw.confidence + 15) : cw.confidence,
      source: 'cloud',
      cloudContributed: true,
    });
    mergeLog.push({ word: cw.text, decision: `CLOUD-ONLY${hasCJK ? ' +CJK' : ''}` });
    stats.cloudOnly++;
  }

  stats.total = mergedWords.length;

  // Rebuild lines from merged words (simple: group by Y proximity)
  const sortedWords = [...mergedWords].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const lines = [];
  let currentLine = { words: [], y0: -Infinity };
  const LINE_THRESHOLD = 15; // pixels

  for (const w of sortedWords) {
    if (Math.abs(w.bbox.y0 - currentLine.y0) > LINE_THRESHOLD) {
      if (currentLine.words.length > 0) lines.push(currentLine);
      currentLine = { words: [w], y0: w.bbox.y0 };
    } else {
      currentLine.words.push(w);
    }
  }
  if (currentLine.words.length > 0) lines.push(currentLine);

  const mergedLines = lines.map(l => ({
    text: l.words.map(w => w.text).join(' '),
    confidence: l.words.reduce((sum, w) => sum + w.confidence, 0) / l.words.length,
    bbox: {
      x0: Math.min(...l.words.map(w => w.bbox.x0)),
      y0: Math.min(...l.words.map(w => w.bbox.y0)),
      x1: Math.max(...l.words.map(w => w.bbox.x1)),
      y1: Math.max(...l.words.map(w => w.bbox.y1)),
    },
  }));

  const fullText = mergedLines.map(l => l.text).join('\n');
  const avgConfidence = mergedWords.length > 0
    ? mergedWords.reduce((sum, w) => sum + w.confidence, 0) / mergedWords.length
    : 0;

  const mergeDuration = Date.now() - mergeStart;

  return {
    text: fullText,
    confidence: avgConfidence,
    words: mergedWords,
    lines: mergedLines,
    cloudContributed: usedCloudIndices.size > 0 || stats.cloudOnly > 0,
    ocrSource: 'merged',
    mergeStats: stats,
    mergeLog,
    mergeDuration,
  };
}

/**
 * Run Cloud Vision OCR with timeout.
 * @param {string} imagePath - Path to the image file on disk.
 * @param {number} timeoutMs - Timeout in milliseconds (default 3000).
 * @returns {Promise<Object|null>} Cloud OCR result or null on failure/timeout.
 */
async function runCloudOCR(imagePath, timeoutMs = 3000) {
  if (!gcloudService.isInitialized) {
    console.log('[OCR-Cloud] GCloud Vision not initialized, skipping');
    return null;
  }

  const executeOnce = async () => {
    return await Promise.race([
      gcloudService.performOCR(imagePath),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Cloud OCR timeout')), timeoutMs)),
    ]);
  };

  // Errors that won't be resolved by retrying (auth, quota, billing, not found).
  const isNonRetriable = (msg = '') => {
    const lower = msg.toLowerCase();
    return lower.includes('auth') || lower.includes('permission') || lower.includes('credential')
      || lower.includes('quota') || lower.includes('billing') || lower.includes('not found')
      || lower.includes('invalid') || lower.includes('api key');
  };

  try {
    return await executeOnce();
  } catch (err) {
    const msg = err?.message || '';
    if (isNonRetriable(msg)) {
      console.warn(`[OCR-Cloud] Non-retriable error, skipping retry: ${msg}`);
      return null;
    }
    console.warn(`[OCR-Cloud] First attempt failed (${msg}), retrying once...`);
    try {
      return await executeOnce();
    } catch (retryErr) {
      console.warn(`[OCR-Cloud] Retry failed (${retryErr?.message})`);
      return null;
    }
  }
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

/**
 * Main processing function
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} activeUser - Current user's display name (for anchor)
 * @param {Object} existingData - Previous capture data to merge with
 * @param {string} ocrMode - OCR engine mode: 'local', 'cloud', 'both', or 'hybrid-plus'
 * @returns {Object} Processed OCR result
 */
async function processCapture(imageBase64, activeUser = null, existingData = null, ocrMode = 'both', options = {}) {
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
    } = options;
    const includeBboxes = rawIncludeBboxes === true;
    const shouldArchiveOcrSample = rawArchiveOcrSample === true;
    const archiveMetadata = (rawArchiveMetadata && typeof rawArchiveMetadata === 'object')
      ? rawArchiveMetadata
      : {};
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
    console.log('[OCR] Starting processCapture');
    console.log('[OCR] activeUser:', activeUser);
    console.log('[OCR] hasExistingData:', !!existingData);
    console.log('[OCR] ocrMode:', ocrMode);
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
    const cacheKey = buildCacheKey(imageHash, activeUser, ocrMode, ocrRegionFingerprint);
    const shouldBypassCache = !!sourceImagePath || forceUncached || ocrMode === 'cloud' || !!existingData || includeBboxes || shouldArchiveOcrSample;
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
    console.log('[OCR] Preprocessing done, dimensions:', processed.width, 'x', processed.height);

    // Save raw capture debug image (also triggers cloud upload)
    // When sourceImagePath is provided (re-analysis), skip saving a duplicate
    // and use the original file path for cloud OCR instead.
    // When skipDebugSave is true (normal smart capture where saveScreenshot already ran),
    // save a temporary file for cloud OCR but don't keep it in ocr-debug/ to avoid duplication.
    const useHybridMerge = ocrMode === 'both' || ocrMode === 'hybrid-plus';
    const useGeminiRefine = ocrMode === 'hybrid-plus';
    const needsFilePath = useHybridMerge || ocrMode === 'cloud' || useGeminiRefine;
    let rawDebugPath = null;
    if (sourceImagePath) {
      rawDebugPath = sourceImagePath;
      console.log('[OCR] Reusing source image for cloud OCR (skipping duplicate upload)');
    } else if (skipDebugSave && needsFilePath) {
      // Write a temp file for cloud OCR only — don't save to ocr-debug/ folder
      try {
        const tmpDir = os.tmpdir();
        const tmpPath = path.join(tmpDir, `wg_ocr_${Date.now()}.png`);
        await fsPromises.writeFile(tmpPath, imageBuffer);
        tempOcrPath = tmpPath;
        rawDebugPath = tmpPath;
        console.log('[OCR] Saved temp image for cloud OCR (skipping ocr-debug save)');
      } catch (e) {
        console.warn('[OCR] Failed to save temp image:', e.message);
      }
    } else if (skipDebugSave && !needsFilePath) {
      // Local-only runs do not need any on-disk image path.
      console.log('[OCR] skipDebugSave active in local-only mode (no temp/debug image written)');
    } else {
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
    let ocrResult = null;
    let cloudContributed = false;
    let ocrSource = 'local';
    let mergeStats = null;
    let mergeLog = null;
    let localOCRForFallback = null;
    let cloudFailureReason = '';
    let geminiFailureReason = '';

    if (useHybridMerge) {
      // Run both in parallel
      console.log('[OCR] Running LOCAL + CLOUD in parallel...');
      const localStart = Date.now();
      const [localResult, cloudResult] = await Promise.allSettled([
        runOCR(processed.buffer, ocrPsm),
        rawDebugPath ? runCloudOCR(rawDebugPath, Math.min(30000, Math.max(1000, parseInt(process.env.WILDGATE_OCR_CLOUD_TIMEOUT_MS || '7000', 10) || 7000))) : Promise.resolve(null),
      ]);
      const localDuration = Date.now() - localStart;

      const localOCR = localResult.status === 'fulfilled' ? localResult.value : null;
      const cloudOCR = cloudResult.status === 'fulfilled' ? cloudResult.value : null;
      if (localOCR) localOCRForFallback = localOCR;

      if (localResult.status === 'rejected') {
        console.error('[OCR] Local Tesseract failed:', localResult.reason?.message);
      }
      if (cloudResult.status === 'rejected') {
        cloudFailureReason = cloudResult.reason?.message || 'Cloud Vision request failed';
        console.warn('[OCR-Cloud] Cloud Vision failed:', cloudFailureReason);
      }

      console.log(`[OCR-Merge] Local: ${localOCR ? localOCR.words?.length + ' words' : 'FAILED'} | Cloud: ${cloudOCR ? (cloudOCR.annotations?.length || 0) + ' annotations' : 'FAILED/UNAVAILABLE'}`);

      if (localOCR && cloudOCR) {
        // Merge results
        ocrResult = mergeOCRResults(localOCR, cloudOCR);
        cloudContributed = ocrResult.cloudContributed;
        ocrSource = 'merged';
        mergeStats = ocrResult.mergeStats;
        mergeLog = ocrResult.mergeLog;

        // Phase 4: Comprehensive logging
        console.log(`[OCR-Merge] ${mergeStats.total} words total | ${mergeStats.agreed} agreed | ${mergeStats.cloudPreferred} cloud-preferred (${mergeStats.cloudPreferredCJK} CJK) | ${mergeStats.localOnly} local-only | ${mergeStats.cloudOnly} cloud-only | ${mergeStats.conflicts} conflicts`);
        console.log(`[OCR-Merge] Timing: Local=${localDuration}ms | Merge=${ocrResult.mergeDuration}ms | Total=${Date.now() - captureStart}ms`);

        // Save merge debug JSON (only in 'both' mode where merging actually occurs)
        try {
          const mergeDebugFilename = `merge_debug_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
          const mergeDebugPath = path.join(DEBUG_DIR, mergeDebugFilename);
          await fsPromises.writeFile(mergeDebugPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            ocrMode,
            timing: { localMs: localDuration, mergeMs: ocrResult.mergeDuration, totalMs: Date.now() - captureStart },
            stats: mergeStats,
            log: mergeLog,
            localWordCount: localOCR.words?.length || 0,
            cloudAnnotationCount: cloudOCR.annotations?.length || 0,
          }, null, 2));
          console.log(`[OCR-Merge] Debug saved: ${mergeDebugFilename}`);
        } catch (e) {
          console.warn('[OCR-Merge] Failed to save merge debug:', e.message);
        }
      } else if (localOCR) {
        console.log('[OCR-Merge] Cloud unavailable, using local-only result');
        if (cloudFailureReason) {
          console.warn(`[OCR-Merge] Local fallback reason: ${cloudFailureReason}`);
        }
        ocrResult = localOCR;
        ocrSource = 'local';
      } else if (cloudOCR) {
        console.log('[OCR-Merge] Local failed, using cloud-only result');
        // Convert cloud result to standard format
        const cloudWords = cloudAnnotationsToWords(cloudOCR.annotations || []);
        ocrResult = {
          text: cloudOCR.fullText || '',
          confidence: 80,
          words: cloudWords,
          lines: [{ text: cloudOCR.fullText || '', confidence: 80, bbox: { x0: 0, y0: 0, x1: processed.width, y1: processed.height } }],
        };
        cloudContributed = true;
        ocrSource = 'cloud';
      } else {
        throw new Error('Both local and cloud OCR failed');
      }
    } else if (ocrMode === 'cloud') {
      // Cloud only
      console.log('[OCR] Running CLOUD-ONLY mode...');
      if (!rawDebugPath) {
        rawDebugPath = await saveDebugImage(imageBuffer, 'raw_capture');
      }
      let cloudOCR = null;
      try {
        cloudOCR = await runCloudOCR(rawDebugPath, 10000); // longer timeout for cloud-only mode
      } catch (cloudError) {
        cloudFailureReason = cloudError?.message || 'Cloud OCR request failed';
      }

      if (cloudOCR) {
        const cloudWords = cloudAnnotationsToWords(cloudOCR.annotations || []);
        ocrResult = {
          text: cloudOCR.fullText || '',
          confidence: 80,
          words: cloudWords,
          lines: [{ text: cloudOCR.fullText || '', confidence: 80, bbox: { x0: 0, y0: 0, x1: processed.width, y1: processed.height } }],
        };
        cloudContributed = true;
        ocrSource = 'cloud';
        console.log(`[OCR] Cloud-only done, text length: ${ocrResult.text?.length || 0}`);
      } else {
        cloudFailureReason = cloudFailureReason || 'Cloud OCR unavailable';
        console.warn(`[OCR] Cloud-only unavailable, falling back to local OCR: ${cloudFailureReason}`);
        ocrResult = await runOCR(processed.buffer, ocrPsm);
        localOCRForFallback = ocrResult;
        ocrSource = 'local';
      }
    } else {
      // Local only (default / fallback)
      console.log('[OCR] Running LOCAL-ONLY mode...');
      ocrResult = await runOCR(processed.buffer, ocrPsm);
      localOCRForFallback = ocrResult;
      ocrSource = 'local';
      console.log(`[OCR] Local-only done, text length: ${ocrResult.text?.length || 0}`);
    }

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

    if (screenDetection.type === SCREEN_TYPES.CREW_HUB) {
      console.log('[OCR] Processing as CREW HUB');

      extractedData = await extractCrewHub(
        processed.buffer,
        activeUser,
        ocrResult,
        processed.width,
        processed.height,
        processed.scale, // OCR words are on preprocessed/scaled image coordinates
        imageBuffer, // keep color detection on original-color pixels
        ocrRegions.crewHub
      );

      // Convert to legacy format for backwards compatibility
      extractedData = convertCrewHubToLegacy(extractedData, ocrResult.text);

    } else if (screenDetection.type === SCREEN_TYPES.MAP_SCREEN) {
      console.log('[OCR] Processing as MAP SCREEN');

      const PLAYER_REGION = ocrRegions.mapScreen.players;
      if (imageBuffer) {
        console.log('[OCR-Region] Running region-specific OCR for map teammate list');
      }
      const [mapScreenData, regionResult] = await Promise.all([
        extractMapScreen(
          processed.buffer,
          ocrResult,
          processed.width,
          processed.height,
          ocrRegions.mapScreen
        ),
        imageBuffer
          ? cropRegionAndOCR(
            imageBuffer,
            PLAYER_REGION,
            processed.originalWidth,
            processed.originalHeight,
            11
          )
          : Promise.resolve(null),
      ]);

      // Convert to legacy format
      extractedData = convertMapScreenToLegacy(mapScreenData, ocrResult.text);

      // Bug 1 mitigation: when merged OCR is used, preserve high-confidence local modifier detections.
      // This avoids cloud noise degrading modifier recall while keeping merged name/roster benefits.
      if (ocrSource === 'merged' && localOCRForFallback?.text) {
        const localModifiers = extractModifiers(localOCRForFallback.text);
        const currentModifiers = extractedData.reachModifiers || [];
        const currentUniqueCount = new Set(currentModifiers.map(m => String(m?.name || '').trim().toLowerCase()).filter(Boolean)).size;
        const mergedModifiers = mergeModifierLists(currentModifiers, localModifiers);
        const mergedUniqueCount = new Set(mergedModifiers.map(m => String(m?.name || '').trim().toLowerCase()).filter(Boolean)).size;
        if (mergedUniqueCount > currentUniqueCount) {
          console.log(`[OCR-Merge] Modifier fallback restored ${mergedUniqueCount - currentUniqueCount} modifier(s) from local OCR`);
        }
        extractedData.reachModifiers = mergedModifiers;
      }

      // Bug 3 mitigation: map-screen player names are small and overlaid on game visuals.
      // Full-image OCR often extracts garbled names (0% recall). Crop the player-list region
      // (bottom-left), upscale 3x, and run a dedicated OCR pass for much better accuracy.
      if (regionResult && regionResult.words.length > 0) {
        // extractPlayerList expects words in full-image coordinates (already mapped by cropRegionAndOCR)
        const regionPlayers = extractPlayerList(
          regionResult.words,
          processed.originalWidth,
          processed.originalHeight,
          ocrRegions.mapScreen
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
      console.log('[OCR] Unknown screen type, attempting both extractors');

      // Try both and use whichever gets better results
      const crewHubData = await extractCrewHub(
        processed.buffer,
        activeUser,
        ocrResult,
        processed.width,
        processed.height,
        processed.scale, // OCR words are on preprocessed/scaled image coordinates
        imageBuffer, // keep color detection on original-color pixels
        ocrRegions.crewHub
      );

      const mapScreenData = await extractMapScreen(
        processed.buffer,
        ocrResult,
        processed.width,
        processed.height,
        ocrRegions.mapScreen
      );

      // Use whichever has more data
      if (crewHubData.yourTeam?.players?.length > 0 ||
          crewHubData.enemyTeams?.length > 0) {
        extractedData = convertCrewHubToLegacy(crewHubData, ocrResult.text);
      } else if (mapScreenData.yourShip || mapScreenData.enemyShips?.length > 0) {
        extractedData = convertMapScreenToLegacy(mapScreenData, ocrResult.text);
      } else {
        // Default to unknown
        extractedData = {
          screenshotType: 'unknown',
          rawText: ocrResult.text,
          reachModifiers: extractModifiers(ocrResult.text),
          confidence: 0,
          captureTimestamp: Date.now(),
        };
      }
    }

    // Optional Gemini refinement (runs after normal extraction/merge, preserves multi-screenshot workflow)
    if (useGeminiRefine && rawDebugPath && geminiService.isInitialized) {
      try {
        console.log('[OCR-AI] Running Gemini structured refinement...');
        const geminiData = await geminiService.extractStructured(rawDebugPath, activeUser, extractedData.rawText || '');
        const refined = mergeGeminiRefinement(extractedData, geminiData);
        extractedData = refined.data;
        extractedData.aiContributed = refined.contributed;
        extractedData.aiSource = refined.contributed ? 'gemini' : undefined;
        if (refined.contributed) {
          console.log('[OCR-AI] Gemini contributed structured refinements');
        }
      } catch (e) {
        geminiFailureReason = e?.message || 'Gemini refinement failed';
        console.warn('[OCR-AI] Gemini refinement failed:', geminiFailureReason);
      }
    }

    // Merge with existing data if provided
    if (existingData && isSameMatch(existingData, extractedData)) {
      console.log('[OCR] Merging with existing data');
      extractedData = mergeCaptures(existingData, extractedData);
    }

    console.log('[OCR] Extraction complete:', {
      type: extractedData.screenshotType,
      teammates: extractedData.teammates?.length || 0,
      opponentTeams: extractedData.opponentTeams?.length || 0,
      confidence: (extractedData.overallConfidence || 0).toFixed(1),
    });

    // Detect artifact type from raw text
    const artifactMatch = (extractedData.rawText || '').match(/\b(Healing|Weapon|Ice)\b/i);
    if (artifactMatch) extractedData.artifactType = artifactMatch[1].charAt(0).toUpperCase() + artifactMatch[1].slice(1).toLowerCase();

    // Attach cloud/merge metadata to extracted data
    extractedData.cloudContributed = cloudContributed;
    extractedData.ocrSource = ocrSource;
    if (cloudFailureReason) {
      extractedData.ocrFallbackReason = 'Cloud OCR unavailable, local OCR used';
      extractedData.ocrCloudError = cloudFailureReason;
    }
    if (geminiFailureReason) {
      extractedData.ocrGeminiError = geminiFailureReason;
    }
    if (mergeStats) extractedData.mergeStats = mergeStats;
    if (includeBboxes) {
      extractedData.ocrBoundingBoxes = buildOcrBoundingBoxDebugPayload(
        ocrSource,
        ocrResult,
        localOCRForFallback,
        processed
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
          ocrSource,
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
