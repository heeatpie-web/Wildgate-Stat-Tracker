/**
 * Electron Bridge
 * Provides a safe interface to Electron IPC from the renderer process
 */

import type { CaptureResult, OCRProcessResult } from './ocr/ocrTypes';
import { getElectronAPI, isElectron as _isElectron } from './electronAPI';

const getIpcRenderer = () => getElectronAPI();

/**
 * Check if running in Electron
 */
export const isElectron = _isElectron;

/**
 * Capture the game window
 */
export async function captureGameWindow(): Promise<CaptureResult> {
  const ipc = getIpcRenderer();
  if (!ipc) {
    return { success: false, error: 'Not running in Electron' };
  }

  try {
    const result = await ipc.invoke('capture-game-window');
    return result;
  } catch (error: any) {
    return { success: false, error: error.message || 'Capture failed' };
  }
}

/**
 * Process captured image with OCR
 * @param imageBase64 - Base64 encoded image
 * @param activeUser - Current user's display name (for anchor-based detection)
 * @param existingData - Previous capture data to merge with (for scrolled captures)
 * @param ocrMode - OCR engine mode: 'local', 'cloud', or 'both'
 */
export async function ocrProcessCapture(
  imageBase64: string,
  activeUser?: string | null,
  existingData?: any,
  ocrMode: 'local' | 'cloud' | 'both' = 'both'
): Promise<OCRProcessResult> {
  const ipc = getIpcRenderer();
  if (!ipc) {
    return { success: false, error: 'Not running in Electron' };
  }

  try {
    const result = await ipc.invoke('ocr-process-capture', imageBase64, activeUser || null, existingData || null, ocrMode);
    return result;
  } catch (error: any) {
    return { success: false, error: error.message || 'OCR processing failed' };
  }
}

/**
 * Save a screenshot to disk without running OCR.
 * Returns the file path for deferred OCR processing later.
 */
export async function saveScreenshot(
  imageBase64: string,
  matchId?: string | number | null
): Promise<{ success: boolean; filePath?: string; filename?: string; size?: number; error?: string }> {
  const ipc = getIpcRenderer();
  if (!ipc) {
    return { success: false, error: 'Not running in Electron' };
  }

  try {
    return await ipc.invoke('save-screenshot', { imageBase64, matchId: matchId ?? null });
  } catch (error: any) {
    return { success: false, error: error.message || 'Save failed' };
  }
}

/**
 * Check GCloud service availability.
 * @returns Status of Vision API and Storage services, or null outside Electron.
 */
export interface GCloudStorageStats {
  isInitialized: boolean;
  bucketName: string;
  uploadCount: number;
  uploadErrors: number;
  lastUploadTime: number | null;
  lastError: string | null;
}

export interface GCloudStatus {
  visionReady: boolean;
  storageReady: boolean;
  storageStats: GCloudStorageStats;
}

export async function getGCloudStatus(): Promise<GCloudStatus | null> {
  const ipc = getIpcRenderer();
  if (!ipc) return null;

  try {
    return await ipc.invoke('get-gcloud-status');
  } catch {
    return null;
  }
}

/**
 * Save debug image (existing functionality)
 */
export async function saveOcrDebug(dataUrl: string, filename: string): Promise<string | null> {
  const ipc = getIpcRenderer();
  if (!ipc) return null;

  try {
    return await ipc.invoke('save-ocr-debug', { dataUrl, filename });
  } catch {
    return null;
  }
}

/**
 * Perform OCR via Google Cloud Vision API (main process).
 * @param imagePath - Absolute path to the image file on disk.
 * @returns Detected text and annotation data, or null if unavailable.
 */
export async function gcloudOcrScan(imagePath: string): Promise<{ fullText: string; annotations: any[] } | null> {
  const ipc = getIpcRenderer();
  if (!ipc) return null;

  try {
    return await ipc.invoke('gcloud-ocr-scan', imagePath);
  } catch (error: any) {
    console.error('[ElectronBridge] GCloud OCR Error:', error);
    return null;
  }
}

/**
 * Sync a training sample (screenshot + label JSON) to Google Cloud Storage.
 * @param sampleId - Unique identifier for the training sample.
 * @returns Upload result with list of uploaded files and any errors.
 */
export async function syncTrainingSample(sampleId: string): Promise<{ success: boolean; uploaded: string[]; errors: string[] } | null> {
  const ipc = getIpcRenderer();
  if (!ipc) return null;

  try {
    return await ipc.invoke('sync-training-sample', sampleId);
  } catch (error: any) {
    console.error('[ElectronBridge] Training Sync Error:', error);
    return null;
  }
}

/**
 * Electron bridge object for compatibility
 */
export const electronBridge = {
  get isElectron() { return isElectron(); },
  captureGameWindow,
  ocrProcessCapture,
  saveScreenshot,
  saveOcrDebug,
  gcloudOcrScan,
  syncTrainingSample,
  getGCloudStatus,
};

export default electronBridge;
