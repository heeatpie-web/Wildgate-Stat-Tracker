'use strict';

const { extractFrames, probeVideoDuration } = require('./videoFrameExtractor.cjs');
const { extractResultScreen } = require('./resultScreenExtractor.cjs');
const { processCapture } = require('./ocrHandler.cjs');
const { mergeCaptures } = require('./ocrMerger.cjs');

// Cooldown between result screen hits to avoid double-counting adjacent frames
const RESULT_SCREEN_COOLDOWN_MS = 5000;
// How many seconds from match start to densely scan for lobby/tactical frames
const DENSE_SCAN_WINDOW_SECS = 90;
// FPS for coarse (boundary detection) scan
const COARSE_FPS = 0.5;
// FPS for dense (content extraction) scan
const DENSE_FPS = 2;

/**
 * Run dense OCR pass on a match window and return merged OCRExtractedData.
 */
async function runDenseScan(videoPath, startSecs, endSecs, { activeUser, ocrMode, ocrRegions, signal }) {
  const perFrameResults = [];
  const gen = extractFrames(videoPath, { fps: DENSE_FPS, startSecs, endSecs, signal });

  for await (const { pngBuffer, frameIndex } of gen) {
    if (signal && signal.cancelled) break;
    try {
      const base64 = pngBuffer.toString('base64');
      const result = await processCapture(base64, activeUser || null, null, ocrMode || 'local', {
        ocrRegions: ocrRegions || null,
        skipDebugSave: true,
        sourceImagePath: null,
      });
      if (result && result.success && result.data) {
        perFrameResults.push(result.data);
      }
    } catch (e) {
      // skip failed frame
    }
  }

  if (perFrameResults.length === 0) return null;

  // Merge all per-frame results sequentially
  let accumulated = perFrameResults[0];
  for (let i = 1; i < perFrameResults.length; i++) {
    accumulated = mergeCaptures(accumulated, perFrameResults[i]);
  }
  return accumulated;
}

/**
 * Process a video file, extracting match data via OCR.
 *
 * @param {string} videoPath - Absolute path to video file
 * @param {{
 *   activeUser?: string|null,
 *   ocrMode?: string,
 *   ocrRegions?: object|null,
 *   webContents: Electron.WebContents,
 *   signal: { cancelled: boolean }
 * }} opts
 * @returns {Promise<Array>} Array of VideoImportMatch objects
 */
async function processVideoFile(videoPath, { activeUser, ocrMode, ocrRegions, webContents, signal }) {
  const emit = (payload) => {
    try {
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('video-import-progress', payload);
      }
    } catch (_) {}
  };

  const matches = [];
  let matchStartMs = 0;
  let lastResultTimestampMs = -RESULT_SCREEN_COOLDOWN_MS;
  let frameCount = 0;

  // Estimate total frames for progress display
  const durationSecs = await probeVideoDuration(videoPath);
  const totalFramesEstimated = durationSecs ? Math.ceil(durationSecs * COARSE_FPS) : 0;

  emit({ type: 'frame-extraction', framesProcessed: 0, totalFramesEstimated, phase: 'scanning' });

  // Pass 1: coarse scan to detect result screen boundaries
  const gen = extractFrames(videoPath, { fps: COARSE_FPS, signal });
  for await (const { frameIndex, timestampMs, pngBuffer } of gen) {
    if (signal && signal.cancelled) {
      emit({ type: 'cancelled' });
      return matches;
    }

    frameCount++;
    emit({
      type: 'frame-extraction',
      framesProcessed: frameCount,
      totalFramesEstimated,
      phase: 'scanning',
      currentMatchIndex: matches.length,
    });

    let resultData = null;
    try {
      resultData = await extractResultScreen(pngBuffer, { detectionMethod: 'text' });
    } catch (_) {}

    const isResultScreen = resultData && resultData.result !== null;
    const cooldownElapsed = (timestampMs - lastResultTimestampMs) > RESULT_SCREEN_COOLDOWN_MS;

    if (isResultScreen && cooldownElapsed) {
      lastResultTimestampMs = timestampMs;
      const matchEndMs = timestampMs;
      const matchStartSecs = matchStartMs / 1000;
      const matchEndSecs = matchEndMs / 1000;
      const denseEndSecs = Math.min(matchStartSecs + DENSE_SCAN_WINDOW_SECS, matchEndSecs);

      emit({
        type: 'ocr-progress',
        matchIndex: matches.length,
        phase: 'extracting',
        currentMatchIndex: matches.length,
        framesProcessed: frameCount,
        totalFramesEstimated,
      });

      // Pass 2: dense scan for lobby/tactical content within this match window
      let ocrData = null;
      try {
        ocrData = await runDenseScan(videoPath, matchStartSecs, denseEndSecs, {
          activeUser, ocrMode, ocrRegions, signal,
        });
      } catch (e) {
        console.error('[videoMatchProcessor] Dense scan error:', e.message);
      }

      if (signal && signal.cancelled) {
        emit({ type: 'cancelled' });
        return matches;
      }

      const confidence = ocrData ? (ocrData.overallConfidence || 0) : 0;
      const match = {
        matchIndex: matches.length,
        startTimestampMs: matchStartMs,
        endTimestampMs: matchEndMs,
        resultData: {
          result: resultData.result,
          winType: resultData.winType,
          placement: resultData.placement,
          damageTaken: resultData.damageTaken,
        },
        ocrData,
        frameCount: Math.ceil((matchEndMs - matchStartMs) / 1000 * COARSE_FPS),
        confidence,
      };

      matches.push(match);
      emit({ type: 'match-boundary', matchIndex: matches.length - 1, resultData, timestampMs });
      matchStartMs = matchEndMs + RESULT_SCREEN_COOLDOWN_MS;
    }
  }

  if (signal && signal.cancelled) {
    emit({ type: 'cancelled' });
    return matches;
  }

  // If video ended with no result screen after the last match boundary, treat as partial match
  const lastEndMs = matches.length > 0 ? matches[matches.length - 1].endTimestampMs + RESULT_SCREEN_COOLDOWN_MS : 0;
  const videoDurationMs = durationSecs ? durationSecs * 1000 : null;
  const hasUnclaimedFootage = videoDurationMs && (videoDurationMs - lastEndMs) > 10000;
  if (hasUnclaimedFootage && matches.length === 0) {
    // No matches found at all — try a dense scan on the full video's first 90s
    emit({
      type: 'ocr-progress',
      matchIndex: 0,
      phase: 'extracting',
      currentMatchIndex: 0,
      framesProcessed: frameCount,
      totalFramesEstimated,
    });
    try {
      const ocrData = await runDenseScan(videoPath, 0, Math.min(DENSE_SCAN_WINDOW_SECS, durationSecs), {
        activeUser, ocrMode, ocrRegions, signal,
      });
      if (ocrData) {
        matches.push({
          matchIndex: 0,
          startTimestampMs: 0,
          endTimestampMs: videoDurationMs,
          resultData: null,
          ocrData,
          frameCount,
          confidence: ocrData.overallConfidence || 0,
        });
      }
    } catch (_) {}
  }

  emit({ type: 'complete', matches });
  return matches;
}

module.exports = { processVideoFile };
