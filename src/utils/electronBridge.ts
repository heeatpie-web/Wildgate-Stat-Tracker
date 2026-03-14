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

export type GameUiAction = 'open-tactical-map' | 'open-crew-hub' | 'close-current-ui';
export type GameScreenType = 'tactical_map' | 'crew_hub';

export interface SendGameUiActionResult {
  success: boolean;
  action: GameUiAction;
  key?: string;
  processName?: string;
  processId?: number;
  windowTitle?: string;
  activated?: boolean;
  targetWindowHandle?: number;
  foregroundWindowHandle?: number;
  foregroundWindowTitle?: string;
  focusConfirmed?: boolean;
  electronFocusedWindowTitle?: string;
  error?: string;
}

export interface WaitForGameScreenOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  activeUser?: string | null;
  ocrMode?: 'local' | 'cloud' | 'both' | 'hybrid-plus';
  ocrRegions?: OcrRegionSettings | null;
}

export interface WaitForGameScreenResult {
  success: boolean;
  expectedType: GameScreenType;
  detectedType?: GameScreenType | 'unknown' | string;
  attempts?: number;
  elapsedMs?: number;
  error?: string;
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

export async function sendGameUiAction(action: GameUiAction): Promise<SendGameUiActionResult> {
  const ipc = getIpcRenderer();
  if (!ipc) {
    return { success: false, action, error: 'Not running in Electron' };
  }

  try {
    const result = await ipc.invoke('send-game-ui-action', action);
    if (isRecord(result) && typeof result.success === 'boolean') {
      return {
        success: result.success,
        action,
        key: typeof result.key === 'string' ? result.key : undefined,
        processName: typeof result.processName === 'string' ? result.processName : undefined,
        processId: typeof result.processId === 'number' ? result.processId : undefined,
        windowTitle: typeof result.windowTitle === 'string' ? result.windowTitle : undefined,
        activated: typeof result.activated === 'boolean' ? result.activated : undefined,
        targetWindowHandle: typeof result.targetWindowHandle === 'number' ? result.targetWindowHandle : undefined,
        foregroundWindowHandle: typeof result.foregroundWindowHandle === 'number' ? result.foregroundWindowHandle : undefined,
        foregroundWindowTitle: typeof result.foregroundWindowTitle === 'string' ? result.foregroundWindowTitle : undefined,
        focusConfirmed: typeof result.focusConfirmed === 'boolean' ? result.focusConfirmed : undefined,
        electronFocusedWindowTitle: typeof result.electronFocusedWindowTitle === 'string' ? result.electronFocusedWindowTitle : undefined,
        error: typeof result.error === 'string' ? result.error : undefined,
      };
    }

    Logger.warn('ElectronBridge', 'send-game-ui-action returned an unexpected payload', result);
    return { success: false, action, error: 'Unexpected response from main process' };
  } catch (error: unknown) {
    Logger.error('ElectronBridge', 'send-game-ui-action failed', error);
    return { success: false, action, error: toErrorMessage(error, 'Game UI action failed') };
  }
}

export async function waitForGameScreen(
  expectedType: GameScreenType,
  options?: WaitForGameScreenOptions
): Promise<WaitForGameScreenResult> {
  const ipc = getIpcRenderer();
  if (!ipc) {
    return { success: false, expectedType, error: 'Not running in Electron' };
  }

  try {
    const result = await ipc.invoke('wait-for-game-screen', expectedType, options || {});
    if (isRecord(result) && typeof result.success === 'boolean') {
      return {
        success: result.success,
        expectedType,
        detectedType: typeof result.detectedType === 'string' ? result.detectedType : undefined,
        attempts: typeof result.attempts === 'number' ? result.attempts : undefined,
        elapsedMs: typeof result.elapsedMs === 'number' ? result.elapsedMs : undefined,
        error: typeof result.error === 'string' ? result.error : undefined,
      };
    }

    Logger.warn('ElectronBridge', 'wait-for-game-screen returned an unexpected payload', result);
    return { success: false, expectedType, error: 'Unexpected response from main process' };
  } catch (error: unknown) {
    Logger.error('ElectronBridge', 'wait-for-game-screen failed', error);
    return { success: false, expectedType, error: toErrorMessage(error, 'Wait for game screen failed') };
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
  sendGameUiAction,
  waitForGameScreen,
};

export default electronBridge;
