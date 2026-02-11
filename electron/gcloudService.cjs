/**
 * @module gcloudService
 * Google Cloud Vision OCR service for the Electron main process.
 * Provides text detection on screenshot images via the Vision API.
 * Initialized with a service account JSON key file.
 */
const { ImageAnnotatorClient } = require('@google-cloud/vision');

class GCloudService {
  constructor() {
    /** @type {import('@google-cloud/vision').ImageAnnotatorClient | null} */
    this.client = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the Vision API client.
   * @param {string} keyPath - Absolute path to the GCloud service account JSON key file.
   */
  initialize(keyPath) {
    try {
      this.client = new ImageAnnotatorClient({ keyFilename: keyPath });
      this.isInitialized = true;
      console.log('[GCloudService] Vision API initialized successfully.');
    } catch (error) {
      console.error('[GCloudService] Vision Init Error:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Perform OCR text detection on an image file.
   * @param {string} imagePath - Absolute path to the image file.
   * @returns {Promise<{fullText: string, annotations: Array} | null>}
   */
  async performOCR(imagePath) {
    if (!this.isInitialized || !this.client) {
      console.warn('[GCloudService] Not initialized, skipping OCR.');
      return null;
    }

    try {
      const [result] = await this.client.documentTextDetection(imagePath);
      const textAnnotations = result.textAnnotations || [];
      const fullText = textAnnotations.length > 0 ? textAnnotations[0].description || '' : '';

      const wordAnnotations = [];
      const pages = result.fullTextAnnotation?.pages || [];
      for (const page of pages) {
        for (const block of page.blocks || []) {
          for (const paragraph of block.paragraphs || []) {
            for (const word of paragraph.words || []) {
              const symbols = word.symbols || [];
              const text = symbols.map(s => s.text || '').join('');
              if (!text) continue;

              let symbolConfSum = 0;
              for (const sym of symbols) {
                symbolConfSum += typeof sym.confidence === 'number' ? sym.confidence : 0.85;
              }
              const avgSymbolConfidence = symbols.length > 0
                ? symbolConfSum / symbols.length
                : (typeof word.confidence === 'number' ? word.confidence : 0.85);

              wordAnnotations.push({
                text,
                confidence: Math.round(Math.min(99, Math.max(1, avgSymbolConfidence * 100))),
                bounds: word.boundingBox?.vertices || [],
              });
            }
          }
        }
      }

      const annotations = wordAnnotations.length > 0
        ? wordAnnotations
        : textAnnotations.slice(1).map(a => ({
            text: a.description,
            confidence: 85,
            bounds: a.boundingPoly?.vertices || [],
          }));

      return {
        fullText,
        annotations,
      };
    } catch (error) {
      console.error('[GCloudService] OCR Error:', error);
      return { fullText: '', annotations: [], error: error.message };
    }
  }
}

module.exports = new GCloudService();
