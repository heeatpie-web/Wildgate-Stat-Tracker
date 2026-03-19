/**
 * @module resultScreenExtractor
 * Lightweight OCR pass on the top 35% of a screenshot to detect match result.
 * Returns { result, winType, placement } from VICTORY/DEFEAT text patterns.
 */

'use strict';

const sharp = require('sharp');
const { paddleOcrBuffer } = require('./paddleOcrHandler.cjs');

/**
 * @typedef {{ result: 'Win'|'Loss'|null, winType?: 'combat'|'artifact', placement?: number }} ResultScreenData
 */

/**
 * Parse match result from the top portion of a screenshot.
 * @param {Buffer} imageBuffer - PNG buffer of the full screenshot (from nativeImage.toPNG())
 * @returns {Promise<ResultScreenData>}
 */
async function extractResultScreen(imageBuffer) {
  // Crop to top 35% where VICTORY/DEFEAT banner appears
  const meta = await sharp(imageBuffer).metadata();
  const origH = meta.height || 0;
  const origW = meta.width || 0;
  const cropH = Math.max(1, Math.round(origH * 0.35));

  const croppedBuffer = await sharp(imageBuffer)
    .extract({ left: 0, top: 0, width: origW, height: cropH })
    .toBuffer();

  // Run OCR with allText:true so non-player-name tokens are included
  const lines = await paddleOcrBuffer(croppedBuffer, { allText: true });
  const text = lines.map((l) => l.text || '').join('\n').toUpperCase();

  const parsed = parseResultText(text);
  console.log(
    '[ResultScreenExtractor] text=%s result=%o',
    text.slice(0, 120).replace(/\n/g, ' | '),
    parsed
  );
  return parsed;
}

/**
 * Parse the OCR text to determine match result.
 * Priority: VICTORY → placement ordinals → DEFEAT+ARTIFACT → generic DEFEAT → null
 * @param {string} text - Uppercased OCR output
 * @returns {ResultScreenData}
 */
function parseResultText(text) {
  // 1. Check VICTORY first
  if (/VICTORY/.test(text)) {
    if (/RIVALS\s*ELIMINATED/.test(text)) {
      return { result: 'Win', winType: 'combat' };
    }
    if (/ARTIFACT/.test(text)) {
      return { result: 'Win', winType: 'artifact' };
    }
    return { result: 'Win' };
  }

  // 2. Check placement ordinals (2nd–5th placed = loss)
  const placementMatch = text.match(/\b(\d+)(ST|ND|RD|TH)\b/);
  if (placementMatch) {
    return { result: 'Loss', placement: parseInt(placementMatch[1], 10) };
  }

  // 3. Check DEFEAT
  if (/DEFEAT/.test(text)) {
    if (/ARTIFACT/.test(text)) {
      return { result: 'Loss', winType: 'artifact' };
    }
    return { result: 'Loss' };
  }

  return { result: null };
}

module.exports = { extractResultScreen, parseResultText };
