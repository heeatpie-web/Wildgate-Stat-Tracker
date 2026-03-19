/**
 * @module resultScreenExtractor
 * Lightweight OCR pass on the top 35% of a screenshot to detect match result.
 * Returns { result, winType, placement } from VICTORY/DEFEAT text patterns.
 */

const { nativeImage } = require('electron');
const { paddleOcrBuffer } = require('./paddleOcrHandler.cjs');

/**
 * @typedef {{ result: 'Win'|'Loss'|null, winType?: 'combat'|'artifact', placement?: number }} ResultScreenData
 */

/**
 * Parse match result from the top portion of a screenshot.
 * @param {Buffer} imageBuffer - PNG buffer of the full screenshot
 * @returns {Promise<ResultScreenData>}
 */
async function extractResultScreen(imageBuffer) {
    // Crop to top 35% where VICTORY/DEFEAT banner appears
    const img = nativeImage.createFromBuffer(imageBuffer);
    const { width, height } = img.getSize();
    const cropH = Math.round(height * 0.35);
    const cropped = img.crop({ x: 0, y: 0, width, height: cropH });
    const croppedBuffer = cropped.toPNG();

    // Run OCR (PaddleOCR returns [{text, confidence, bbox}])
    const lines = await paddleOcrBuffer(croppedBuffer, { lang: 'en' });
    const text = lines.map(l => l.text || '').join('\n').toUpperCase();

    return parseResultText(text);
}

/**
 * Parse the OCR text to determine match result.
 * @param {string} text - Uppercased OCR output
 * @returns {ResultScreenData}
 */
function parseResultText(text) {
    const isVictory = /VICTORY/.test(text);
    const isDefeat = /DEFEAT/.test(text);
    const placementMatch = text.match(/(\d)(ST|ND|RD|TH)\s*(PLACE)?/);
    const isArtifact = /ARTIFACT/.test(text);
    const isRivals = /RIVALS\s*ELIMINATED/.test(text);

    if (isVictory) {
        return {
            result: 'Win',
            winType: isArtifact ? 'artifact' : isRivals ? 'combat' : undefined,
        };
    }

    if (isDefeat) {
        return { result: 'Loss', winType: isArtifact ? 'artifact' : undefined };
    }

    if (placementMatch) {
        return { result: 'Loss', placement: parseInt(placementMatch[1], 10) };
    }

    return { result: null };
}

module.exports = { extractResultScreen, parseResultText };
