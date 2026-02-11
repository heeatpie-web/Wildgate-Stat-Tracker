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

// Import new extraction modules
const { detectScreenType, detectScreenTypeFromLines, SCREEN_TYPES } = require('./screenDetector.cjs');
const { extractCrewHub } = require('./crewHubExtractor.cjs');
const { extractMapScreen, KNOWN_HAZARDS } = require('./mapScreenExtractor.cjs');
const { mergeCaptures, isSameMatch } = require('./ocrMerger.cjs');
const gcloudService = require('./gcloudService.cjs');
const gcloudSyncService = require('./gcloudSyncService.cjs');
const geminiService = require('./geminiService.cjs');

// Dynamic imports (loaded when needed)
let Tesseract = null;
let screenshot = null;
let sharp = null;

// Debug directory for saving OCR images
const DEBUG_DIR = path.join(app.getPath('userData'), 'ocr-debug');

// Ensure debug directory exists
function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }
}

// ─── OCR Result Cache (LRU, max 50 entries) ───
const OCR_CACHE_MAX = 50;
const ocrResultCache = new Map(); // hash → { result, timestamp }

function getImageHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function getCachedResult(hash) {
  const entry = ocrResultCache.get(hash);
  if (entry) {
    console.log(`[OCR Cache] HIT for ${hash.slice(0, 8)}...`);
    return entry.result;
  }
  return null;
}

function setCachedResult(hash, result) {
  // Evict oldest if at capacity
  if (ocrResultCache.size >= OCR_CACHE_MAX) {
    const oldestKey = ocrResultCache.keys().next().value;
    ocrResultCache.delete(oldestKey);
  }
  ocrResultCache.set(hash, { result, timestamp: Date.now() });
  console.log(`[OCR Cache] STORE ${hash.slice(0, 8)}... (${ocrResultCache.size}/${OCR_CACHE_MAX})`);
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

// Tesseract worker pool (scheduler + multiple workers)
const WORKER_POOL_SIZE = 3;
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

  console.log(`[OCR] Initializing Tesseract worker pool (${WORKER_POOL_SIZE} workers, eng+chi_sim)...`);
  tesseractScheduler = Tesseract.createScheduler();

  const workerPromises = [];
  for (let i = 0; i < WORKER_POOL_SIZE; i++) {
    workerPromises.push((async () => {
      const worker = await Tesseract.createWorker('eng+chi_sim', 1, {
        logger: m => {
          if (m.status && m.progress === 1) {
            console.log(`[OCR] Worker ${i}: ${m.status}`);
          }
        },
        cacheMethod: 'readOnly',
      });
      await worker.setParameters({ preserve_interword_spaces: '1' });
      tesseractScheduler.addWorker(worker);
      tesseractWorkers.push(worker);
      console.log(`[OCR] Worker ${i} ready`);
    })());
  }
  await Promise.all(workerPromises);

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

/**
 * Run OCR on image buffer
 * Returns structured data with words, lines, and text
 */
async function runOCR(imageBuffer) {
  const scheduler = await getTesseractScheduler();

  console.log('[OCR] Running recognition (worker pool)...');
  const startTime = Date.now();

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

  console.log(`[OCR] Extracted: ${text.length} chars, ${words.length} words, ${lines.length} lines`);

  return {
    text,
    confidence,
    words: words.map(w => ({
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

  try {
    return await executeOnce();
  } catch (err) {
    console.warn(`[OCR-Cloud] First attempt failed (${err.message}), retrying once...`);
    try {
      return await executeOnce();
    } catch (retryErr) {
      console.warn(`[OCR-Cloud] Retry failed (${retryErr.message})`);
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
  const captureStart = Date.now();
  try {
    const { sourceImagePath = null, skipDebugSave = false } = options;
    console.log('[OCR] Starting processCapture');
    console.log('[OCR] activeUser:', activeUser);
    console.log('[OCR] hasExistingData:', !!existingData);
    console.log('[OCR] ocrMode:', ocrMode);
    if (sourceImagePath) console.log('[OCR] Re-analysis from:', sourceImagePath);
    if (skipDebugSave) console.log('[OCR] Skipping debug save (screenshot already saved by caller)');

    if (!imageBase64 || imageBase64.length < 100) {
      throw new Error('Invalid or empty image data');
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log('[OCR] Buffer created, size:', imageBuffer.length);

    // ─── Check OCR cache (skip for re-analysis which needs fresh extraction) ───
    const imageHash = getImageHash(imageBuffer);
    if (!options.sourceImagePath) {
      const cached = getCachedResult(imageHash);
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
    let rawDebugPath = null;
    if (sourceImagePath) {
      rawDebugPath = sourceImagePath;
      console.log('[OCR] Reusing source image for cloud OCR (skipping duplicate upload)');
    } else if (skipDebugSave) {
      // Write a temp file for cloud OCR only — don't save to ocr-debug/ folder
      try {
        const tmpDir = require('os').tmpdir();
        const tmpPath = path.join(tmpDir, `wg_ocr_${Date.now()}.png`);
        await fsPromises.writeFile(tmpPath, imageBuffer);
        rawDebugPath = tmpPath;
        console.log('[OCR] Saved temp image for cloud OCR (skipping ocr-debug save)');
      } catch (e) {
        console.warn('[OCR] Failed to save temp image:', e.message);
      }
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

    const useHybridMerge = ocrMode === 'both' || ocrMode === 'hybrid-plus';
    const useGeminiRefine = ocrMode === 'hybrid-plus';

    if (useHybridMerge) {
      // Run both in parallel
      console.log('[OCR] Running LOCAL + CLOUD in parallel...');
      const localStart = Date.now();
      const [localResult, cloudResult] = await Promise.allSettled([
        runOCR(processed.buffer),
        rawDebugPath ? runCloudOCR(rawDebugPath, 7000) : Promise.resolve(null),
      ]);
      const localDuration = Date.now() - localStart;

      const localOCR = localResult.status === 'fulfilled' ? localResult.value : null;
      const cloudOCR = cloudResult.status === 'fulfilled' ? cloudResult.value : null;

      if (localResult.status === 'rejected') {
        console.error('[OCR] Local Tesseract failed:', localResult.reason?.message);
      }
      if (cloudResult.status === 'rejected') {
        console.warn('[OCR-Cloud] Cloud Vision failed:', cloudResult.reason?.message);
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
      const cloudOCR = await runCloudOCR(rawDebugPath, 10000); // longer timeout for cloud-only mode
      if (!cloudOCR) {
        throw new Error('Cloud OCR failed or unavailable (GCloud Vision not initialized?)');
      }
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
      // Local only (default / fallback)
      console.log('[OCR] Running LOCAL-ONLY mode...');
      ocrResult = await runOCR(processed.buffer);
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
        processed.scale // Pass scale for accurate color detection
      );

      // Convert to legacy format for backwards compatibility
      extractedData = convertCrewHubToLegacy(extractedData, ocrResult.text);

    } else if (screenDetection.type === SCREEN_TYPES.MAP_SCREEN) {
      console.log('[OCR] Processing as MAP SCREEN');

      extractedData = await extractMapScreen(
        processed.buffer,
        ocrResult,
        processed.width,
        processed.height
      );

      // Convert to legacy format
      extractedData = convertMapScreenToLegacy(extractedData, ocrResult.text);

    } else {
      console.log('[OCR] Unknown screen type, attempting both extractors');

      // Try both and use whichever gets better results
      const crewHubData = await extractCrewHub(
        processed.buffer,
        activeUser,
        ocrResult,
        processed.width,
        processed.height,
        processed.scale // Pass scale for accurate color detection
      );

      const mapScreenData = await extractMapScreen(
        processed.buffer,
        ocrResult,
        processed.width,
        processed.height
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
        console.warn('[OCR-AI] Gemini refinement failed:', e.message);
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
    if (mergeStats) extractedData.mergeStats = mergeStats;

    const finalResult = {
      success: true,
      data: extractedData,
    };

    // ─── Store in cache (skip re-analysis results to avoid stale cache) ───
    if (!options.sourceImagePath) {
      setCachedResult(imageHash, finalResult);
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
  }
}

/**
 * Convert new Crew Hub format to legacy format for backwards compatibility
 */
function convertCrewHubToLegacy(crewHubData, rawText) {
  const teammates = (crewHubData.yourTeam?.players || []).map(name => ({
    name: typeof name === 'string' ? name : name.name,
    confidence: typeof name === 'string' ? 80 : (name.confidence || 80),
    isTeammate: true,
  }));

  const opponentTeams = (crewHubData.enemyTeams || []).map(team => ({
    teamName: team.name || 'Unknown Team',
    shipType: team.shipType || '',
    color: team.color || 'unknown',
    players: (team.players || []).map(p => ({
      name: typeof p === 'string' ? p : p.name,
      confidence: typeof p === 'string' ? 75 : (p.confidence || 75),
      isTeammate: false,
    })),
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
  ipcMain.handle('ocr-process-capture', async (event, imageBase64, activeUser = null, existingData = null, ocrMode = 'both') => {
    return await processCapture(imageBase64, activeUser, existingData, ocrMode, { skipDebugSave: true });
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
