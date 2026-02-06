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
      const [result] = await this.client.textDetection(imagePath);
      const annotations = result.textAnnotations || [];
      const fullText = annotations.length > 0 ? annotations[0].description || '' : '';

      return {
        fullText,
        annotations: annotations.map(a => ({
          text: a.description,
          confidence: a.confidence,
          bounds: a.boundingPoly?.vertices || [],
        })),
      };
    } catch (error) {
      console.error('[GCloudService] OCR Error:', error);
      return { fullText: '', annotations: [], error: error.message };
    }
  }
}

module.exports = new GCloudService();
