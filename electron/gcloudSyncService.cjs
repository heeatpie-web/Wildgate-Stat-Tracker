/**
 * @module gcloudSyncService
 * Google Cloud Storage sync service for continuous training data upload.
 * Uploads screenshot + label JSON pairs to a GCS bucket for model training.
 * Initialized with a service account JSON key file and bucket name.
 */
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

class GCloudSyncService {
  constructor() {
    /** @type {import('@google-cloud/storage').Storage | null} */
    this.storage = null;
    this.bucketName = '';
    this.isInitialized = false;
  }

  /**
   * Initialize the Storage client.
   * @param {string} keyPath - Absolute path to the GCloud service account JSON key file.
   * @param {string} bucketName - Name of the target GCS bucket.
   */
  initialize(keyPath, bucketName) {
    try {
      this.storage = new Storage({ keyFilename: keyPath });
      this.bucketName = bucketName;
      this.isInitialized = true;
      console.log(`[GCloudSync] Storage initialized for bucket: ${bucketName}`);
    } catch (error) {
      console.error('[GCloudSync] Storage Init Error:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Upload a single file to the cloud bucket.
   * @param {string} localFilePath - Absolute path to the local file.
   * @param {string} destinationPath - Destination path within the bucket.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async uploadFile(localFilePath, destinationPath) {
    if (!this.isInitialized || !this.storage || !this.bucketName) {
      return { success: false, error: 'Not initialized' };
    }

    if (!fs.existsSync(localFilePath)) {
      return { success: false, error: `File not found: ${localFilePath}` };
    }

    try {
      await this.storage.bucket(this.bucketName).upload(localFilePath, {
        destination: destinationPath,
      });
      console.log(`[GCloudSync] Uploaded: ${destinationPath}`);
      return { success: true };
    } catch (error) {
      console.error('[GCloudSync] Upload Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync a training sample (PNG screenshot + JSON label file) to the bucket.
   * @param {string} trainingDataDir - Local directory containing the sample files.
   * @param {string} sampleId - Unique sample identifier.
   * @returns {Promise<{success: boolean, uploaded: string[], errors: string[]}>}
   */
  async syncSample(trainingDataDir, sampleId) {
    const imageFile = `sample_${sampleId}.png`;
    const jsonFile = `sample_${sampleId}.json`;
    const uploaded = [];
    const errors = [];

    const imageResult = await this.uploadFile(
      path.join(trainingDataDir, imageFile),
      `dataset/${imageFile}`
    );
    if (imageResult.success) uploaded.push(imageFile);
    else errors.push(`${imageFile}: ${imageResult.error}`);

    const jsonResult = await this.uploadFile(
      path.join(trainingDataDir, jsonFile),
      `dataset/${jsonFile}`
    );
    if (jsonResult.success) uploaded.push(jsonFile);
    else errors.push(`${jsonFile}: ${jsonResult.error}`);

    return {
      success: errors.length === 0,
      uploaded,
      errors,
    };
  }
}

module.exports = new GCloudSyncService();
