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
    this.uploadCount = 0;
    this.uploadErrors = 0;
    this.lastUploadTime = null;
    this.lastError = null;
  }

  /**
   * Initialize the Storage client.
   * @param {string} keyPath - Absolute path to the GCloud service account JSON key file.
   * @param {string} bucketName - Name of the target GCS bucket.
   */
  async initialize(keyPath, bucketName) {
    try {
      this.storage = new Storage({ keyFilename: keyPath });
      this.bucketName = bucketName;
      this.isInitialized = true;
      console.log(`[GCloudSync] Storage initialized for bucket: ${bucketName}`);

      // Validate bucket access
      try {
        const [exists] = await this.storage.bucket(this.bucketName).exists();
        if (!exists) {
          console.error(`[GCloudSync] Bucket "${this.bucketName}" not found or inaccessible`);
          this.lastError = `Bucket "${this.bucketName}" not found`;
        } else {
          console.log(`[GCloudSync] Bucket "${this.bucketName}" verified accessible`);
        }
      } catch (validationErr) {
        const message = validationErr && validationErr.message ? validationErr.message : String(validationErr);
        const isMetadataPermissionGap = /storage\.buckets\.get|Permission 'storage\.buckets\.get' denied|403/.test(message);
        if (isMetadataPermissionGap) {
          console.log(`[GCloudSync] Bucket metadata check skipped (non-fatal): ${message}`);
        } else {
          console.warn(`[GCloudSync] Bucket validation failed (may still work): ${message}`);
        }
        this.lastError = `Bucket validation: ${message}`;
      }
    } catch (error) {
      console.error('[GCloudSync] Storage Init Error:', error);
      this.isInitialized = false;
      this.lastError = error.message;
    }
  }

  /**
   * Upload a single file to the cloud bucket.
   * @param {string} localFilePath - Absolute path to the local file.
   * @param {string} destinationPath - Destination path within the bucket.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async uploadFile(localFilePath, destinationPath, retries = 1) {
    if (!this.isInitialized || !this.storage || !this.bucketName) {
      return { success: false, error: 'Not initialized' };
    }

    if (!fs.existsSync(localFilePath)) {
      return { success: false, error: `File not found: ${localFilePath}` };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.storage.bucket(this.bucketName).upload(localFilePath, {
          destination: destinationPath,
        });
        this.uploadCount++;
        this.lastUploadTime = Date.now();
        this.lastError = null;
        console.log(`[GCloudSync] Uploaded: ${destinationPath}${attempt > 0 ? ` (retry ${attempt})` : ''}`);
        return { success: true };
      } catch (error) {
        if (attempt < retries) {
          console.warn(`[GCloudSync] Upload attempt ${attempt + 1} failed, retrying in 2s: ${error.message}`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          this.uploadErrors++;
          this.lastError = error.message;
          console.error('[GCloudSync] Upload Error (all retries exhausted):', error.message);
          return { success: false, error: error.message };
        }
      }
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
  /**
   * Return runtime diagnostics.
   * @returns {{isInitialized: boolean, bucketName: string, uploadCount: number, uploadErrors: number, lastUploadTime: number|null, lastError: string|null}}
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      bucketName: this.bucketName,
      uploadCount: this.uploadCount,
      uploadErrors: this.uploadErrors,
      lastUploadTime: this.lastUploadTime,
      lastError: this.lastError,
    };
  }

  /**
   * One-time backfill: upload all local screenshots to GCS, skipping files already in the bucket.
   * Scans screenshots/, ocr-debug/, and match_artifacts/ under the given userData root.
   * @param {string} userDataPath - Absolute path to the app's userData directory.
   * @returns {Promise<{success: boolean, uploaded: number, skipped: number, errors: number, details: string[]}>}
   */
  async backfillScreenshots(userDataPath) {
    if (!this.isInitialized || !this.storage || !this.bucketName) {
      return { success: false, uploaded: 0, skipped: 0, errors: 0, details: ['Not initialized'] };
    }

    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);
    const details = [];
    let uploaded = 0;
    let skipped = 0;
    let errors = 0;

    // 1. List all existing files in the bucket under screenshots/ and match_artifacts/
    const remoteFiles = new Set();
    try {
      for (const prefix of ['screenshots/', 'match_artifacts/']) {
        const [files] = await this.storage.bucket(this.bucketName).getFiles({ prefix });
        for (const f of files) {
          remoteFiles.add(f.name);
        }
      }
      details.push(`Found ${remoteFiles.size} existing files in bucket`);
    } catch (err) {
      details.push(`Warning: Could not list bucket contents: ${err.message}`);
    }

    // 2. Collect local files to upload
    const filesToUpload = []; // { localPath, remotePath }

    const scanDir = async (dirPath, remotePrefix) => {
      if (!fs.existsSync(dirPath)) return;
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          // Recurse into subdirectories (e.g. match_artifacts/123/)
          await scanDir(fullPath, `${remotePrefix}${entry.name}/`);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!IMAGE_EXTS.has(ext)) continue;
          const remotePath = `${remotePrefix}${entry.name}`;
          if (remoteFiles.has(remotePath)) {
            skipped++;
          } else {
            filesToUpload.push({ localPath: fullPath, remotePath });
          }
        }
      }
    };

    await scanDir(path.join(userDataPath, 'screenshots'), 'screenshots/');
    await scanDir(path.join(userDataPath, 'ocr-debug'), 'screenshots/');
    await scanDir(path.join(userDataPath, 'match_artifacts'), 'match_artifacts/');

    details.push(`Local scan: ${filesToUpload.length} to upload, ${skipped} already in bucket`);

    // 3. Upload missing files (sequential to avoid hammering the API)
    for (const { localPath, remotePath } of filesToUpload) {
      const result = await this.uploadFile(localPath, remotePath, 2);
      if (result.success) {
        uploaded++;
      } else {
        errors++;
        details.push(`Failed: ${remotePath} — ${result.error}`);
      }
    }

    details.push(`Backfill complete: ${uploaded} uploaded, ${skipped} skipped, ${errors} errors`);
    console.log(`[GCloudSync] Backfill: ${uploaded} uploaded, ${skipped} skipped, ${errors} errors`);

    return { success: errors === 0, uploaded, skipped, errors, details };
  }

  /**
   * Test upload: write a tiny test file and upload it to verify credentials and bucket access.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testUpload() {
    if (!this.isInitialized || !this.storage || !this.bucketName) {
      return { success: false, error: 'Not initialized' };
    }
    const testContent = `test-upload-${Date.now()}`;
    const destPath = `_test/${testContent}.txt`;
    try {
      await this.storage.bucket(this.bucketName).file(destPath).save(testContent);
      console.log(`[GCloudSync] Test upload succeeded: ${destPath}`);
      // Clean up test file
      try { await this.storage.bucket(this.bucketName).file(destPath).delete(); } catch (_) { /* ignore */ }
      return { success: true };
    } catch (error) {
      this.lastError = error.message;
      console.error('[GCloudSync] Test upload failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new GCloudSyncService();
