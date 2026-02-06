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

// Import new extraction modules
const { detectScreenType, detectScreenTypeFromLines, SCREEN_TYPES } = require('./screenDetector.cjs');
const { extractCrewHub } = require('./crewHubExtractor.cjs');
const { extractMapScreen, KNOWN_HAZARDS } = require('./mapScreenExtractor.cjs');
const { mergeCaptures, isSameMatch } = require('./ocrMerger.cjs');

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

// Save debug image
async function saveDebugImage(buffer, prefix = 'capture') {
  ensureDebugDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}_${timestamp}.png`;
  const filepath = path.join(DEBUG_DIR, filename);
  await fsPromises.writeFile(filepath, buffer);
  return filepath;
}

// Tesseract worker instance
let tesseractWorker = null;

/**
 * Get or create Tesseract worker
 * Configured with:
 * - English + Chinese Simplified languages
 * - No restrictive character whitelist (supports Unicode)
 * - Preserve interword spaces
 */
async function getTesseractWorker() {
  if (tesseractWorker) return tesseractWorker;

  if (!Tesseract) {
    console.log('[OCR] Loading Tesseract.js module...');
    Tesseract = require('tesseract.js');
    console.log('[OCR] Tesseract.js module loaded');
  }

  console.log('[OCR] Initializing Tesseract worker with eng+chi_sim...');

  // Initialize with English + Chinese Simplified
  // Note: chi_sim requires the language data to be downloaded
  tesseractWorker = await Tesseract.createWorker('eng+chi_sim', 1, {
    logger: m => {
      if (m.status) {
        console.log(`[OCR] Tesseract: ${m.status} ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`);
      }
    },
    cacheMethod: 'readOnly',
  });

  console.log('[OCR] Tesseract worker created, configuring parameters...');

  // Configure for game UI text - NO restrictive whitelist for Unicode support
  await tesseractWorker.setParameters({
    preserve_interword_spaces: '1',
    // Removed tessedit_char_whitelist to allow Chinese and other Unicode characters
  });

  console.log('[OCR] Tesseract worker ready (eng+chi_sim)');
  return tesseractWorker;
}

// Cleanup worker on app quit
app.on('before-quit', async () => {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
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

    // Save debug copy
    const debugPath = await saveDebugImage(imgBuffer, 'raw_capture');
    console.log('[OCR] Saved debug capture:', debugPath);

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
  const worker = await getTesseractWorker();

  console.log('[OCR] Running recognition...');
  const startTime = Date.now();

  const result = await worker.recognize(imageBuffer);

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

/**
 * Main processing function
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} activeUser - Current user's display name (for anchor)
 * @param {Object} existingData - Previous capture data to merge with
 * @returns {Object} Processed OCR result
 */
async function processCapture(imageBase64, activeUser = null, existingData = null) {
  try {
    console.log('[OCR] Starting processCapture');
    console.log('[OCR] activeUser:', activeUser);
    console.log('[OCR] hasExistingData:', !!existingData);

    if (!imageBase64 || imageBase64.length < 100) {
      throw new Error('Invalid or empty image data');
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log('[OCR] Buffer created, size:', imageBuffer.length);

    // Preprocess image
    console.log('[OCR] Preprocessing image...');
    const processed = await preprocessImage(imageBuffer);
    console.log('[OCR] Preprocessing done, dimensions:', processed.width, 'x', processed.height);

    // Save preprocessed debug image
    try {
      await saveDebugImage(processed.buffer, 'preprocessed');
    } catch (e) {
      console.warn('[OCR] Failed to save debug image:', e.message);
    }

    // Run OCR
    console.log('[OCR] Starting Tesseract recognition...');
    const ocrResult = await runOCR(processed.buffer);
    console.log('[OCR] Tesseract done, text length:', ocrResult.text?.length || 0);

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

    return {
      success: true,
      data: extractedData,
    };

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
    reachModifiers: extractModifiers(rawText),
    hazards: mapScreenData.hazards || [],
    overallConfidence,
    captureTimestamp: Date.now(),
    rawText: rawText || '',
  };
}

/**
 * Register IPC handlers for OCR operations
 */
function registerOCRHandlers() {
  // Capture game window
  ipcMain.handle('capture-game-window', async () => {
    return await captureGameWindow();
  });

  // Process capture with OCR (updated to accept activeUser and existingData)
  ipcMain.handle('ocr-process-capture', async (event, imageBase64, activeUser = null, existingData = null) => {
    return await processCapture(imageBase64, activeUser, existingData);
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

  // Clear all preprocessed debug images (keep raw captures for ML training)
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

  // Move raw capture to ML dataset directory for training
  ipcMain.handle('move-to-ml-dataset', async (event, { sourcePath, targetDir = 'train' }) => {
    try {
      const projectRoot = path.resolve(__dirname, '..');
      const datasetDir = path.join(projectRoot, 'dataset', 'images', targetDir);

      // Ensure dataset directory exists
      if (!fs.existsSync(datasetDir)) {
        fs.mkdirSync(datasetDir, { recursive: true });
      }

      const filename = path.basename(sourcePath);
      const targetPath = path.join(datasetDir, filename);

      // Copy instead of move to keep original for OCR debug
      await fsPromises.copyFile(sourcePath, targetPath);

      console.log(`[OCR] Copied to ML dataset: ${targetPath}`);
      return { success: true, targetPath };
    } catch (error) {
      console.error('[OCR] Failed to move to ML dataset:', error);
      return { success: false, error: error.message };
    }
  });

  // Get OCR debug directory path (for ML labeling tool integration)
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
