/**
 * Electron Bridge
 * Provides a safe interface to Electron IPC from the renderer process
 */

import type { CaptureResult, OCRExtractedData, OCRProcessResult } from './ocr/ocrTypes';
import type { OcrRegionSettings } from './scan/types';
import { getElectronAPI, isElectron as _isElectron } from './electronAPI';
import Logger from './logger';

const getIpcRenderer = () => getElectronAPI();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim().length > 0) return error;
  return fallback;
};

export interface OCRProcessRuntimeOptions {
  includeBboxes?: boolean;
  forceUncached?: boolean;
  sourceImagePath?: string | null;
  archiveOcrSample?: boolean;
  archiveMetadata?: Record<string, unknown>;
  screenTypeHint?: 'crew_hub' | 'tactical_map' | 'unknown';
  routingProfile?: 'default' | 'names-only';
  fontProfile?: 'default' | 'ealing-black-italic';
  nameRerouteThreshold?: number;
  maxReroutePasses?: number;
}

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
  } catch (error: unknown) {
    return { success: false, error: toErrorMessage(error, 'Capture failed') };
  }
}

/**
 * Process captured image with OCR
 * @param imageBase64 - Base64 encoded image
 * @param activeUser - Current user's display name (for anchor-based detection)
 * @param existingData - Previous capture data to merge with (for scrolled captures)
 */
export async function ocrProcessCapture(
  imageBase64: string,
  activeUser?: string | null,
  existingData?: OCRExtractedData | null,
  ocrMode: 'local' = 'local',
  ocrRegions?: OcrRegionSettings | null,
  runtimeOptions: OCRProcessRuntimeOptions = {}
): Promise<OCRProcessResult> {
  const ipc = getIpcRenderer();
  if (!ipc) {
    return { success: false, error: 'Not running in Electron' };
  }

  try {
    const safeRuntimeOptions = (runtimeOptions && typeof runtimeOptions === 'object') ? runtimeOptions : {};
    const result = await ipc.invoke(
      'ocr-process-capture',
      imageBase64,
      activeUser || null,
      existingData || null,
      ocrMode,
      { ...safeRuntimeOptions, ocrRegions: ocrRegions || null }
    );
    return result;
  } catch (error: unknown) {
    return { success: false, error: toErrorMessage(error, 'OCR processing failed') };
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
    const raw = await ipc.invoke('save-screenshot', { imageBase64, matchId: matchId ?? null });
    if (raw && typeof raw === 'object' && typeof raw.success === 'boolean') {
      if (raw.success) return { success: true, ...(raw.data || {}) };
      return { success: false, error: raw.message || raw.error || 'Save failed' };
    }
    return raw;
  } catch (error: unknown) {
    return { success: false, error: toErrorMessage(error, 'Save failed') };
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
 * Electron bridge object for compatibility
 */
export const electronBridge = {
  get isElectron() { return isElectron(); },
  captureGameWindow,
  ocrProcessCapture,
  saveScreenshot,
  saveOcrDebug,
};

export default electronBridge;
