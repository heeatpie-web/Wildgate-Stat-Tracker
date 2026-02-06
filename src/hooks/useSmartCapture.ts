/**
 * useSmartCapture Hook
 * Manages the Smart Capture workflow for OCR-based data extraction
 *
 * Updated to support:
 * - activeUser anchor for improved player detection
 * - existingData merge for scrolled captures
 */

import { useState, useCallback } from 'react';
import { captureGameWindow, ocrProcessCapture, isElectron } from '../utils/electronBridge';
import type { OCRExtractedData, ScreenshotType } from '../utils/ocr/ocrTypes';
import { mergeOCRData, calculateOverallConfidence } from '../utils/ocr/ocrParser';

export interface SmartCaptureState {
  isCapturing: boolean;
  isProcessing: boolean;
  error: string | null;
  pendingData: OCRExtractedData | null;
  capturedScreenshots: Array<{
    type: ScreenshotType;
    data: OCRExtractedData;
    timestamp: number;
  }>;
}

export interface SmartCaptureActions {
  capture: (activeUser?: string | null) => Promise<void>;
  clearCaptures: () => void;
  clearError: () => void;
  dismissPendingData: () => void;
  getMergedData: () => OCRExtractedData | null;
}

export function useSmartCapture(): [SmartCaptureState, SmartCaptureActions] {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<OCRExtractedData | null>(null);
  const [capturedScreenshots, setCapturedScreenshots] = useState<
    Array<{ type: ScreenshotType; data: OCRExtractedData; timestamp: number }>
  >([]);

  /**
   * Capture the game window and process with OCR
   * @param activeUser - Current user's display name (for anchor-based detection)
   */
  const capture = useCallback(async (activeUser?: string | null) => {
    if (!isElectron()) {
      setError('Smart Capture is only available in the desktop app');
      return;
    }

    setIsCapturing(true);
    setError(null);

    try {
      // Step 1: Capture the game window
      const captureResult = await captureGameWindow();

      if (!captureResult.success || !captureResult.imageBase64) {
        throw new Error(captureResult.error || 'Failed to capture game window');
      }

      setIsCapturing(false);
      setIsProcessing(true);

      // Get existing data for potential merge (if capturing scrolled content)
      const lastCapture = capturedScreenshots.length > 0
        ? capturedScreenshots[capturedScreenshots.length - 1]
        : null;

      // Only pass existingData if last capture was recent (within 2 minutes) and same type
      const existingData = lastCapture &&
        (Date.now() - lastCapture.timestamp) < 120000 // 2 minutes
        ? lastCapture.data
        : null;

      // Step 2: Process the captured image with OCR (with activeUser and existingData)
      const ocrResult = await ocrProcessCapture(
        captureResult.imageBase64,
        activeUser,
        existingData
      );

      if (!ocrResult.success || !ocrResult.data) {
        throw new Error(ocrResult.error || 'Failed to process image');
      }

      const extractedData = ocrResult.data;

      // Step 3: Add to captured screenshots list
      setCapturedScreenshots(prev => [
        ...prev,
        {
          type: extractedData.screenshotType,
          data: extractedData,
          timestamp: Date.now(),
        },
      ]);

      // Step 4: Set as pending data for review
      setPendingData(extractedData);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      console.error('Smart Capture error:', err);
    } finally {
      setIsCapturing(false);
      setIsProcessing(false);
    }
  }, [capturedScreenshots]);

  /**
   * Clear all captured screenshots
   */
  const clearCaptures = useCallback(() => {
    setCapturedScreenshots([]);
    setPendingData(null);
    setError(null);
  }, []);

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Dismiss pending data without applying
   */
  const dismissPendingData = useCallback(() => {
    setPendingData(null);
  }, []);

  /**
   * Get merged data from all captured screenshots
   */
  const getMergedData = useCallback((): OCRExtractedData | null => {
    if (capturedScreenshots.length === 0) return null;

    // Start with empty structure
    let merged: Partial<OCRExtractedData> = {
      playerShip: undefined,
      reachModifiers: [],
      teammates: [],
      opponentTeams: [],
    };

    // Merge all captures
    for (const capture of capturedScreenshots) {
      merged = mergeOCRData(merged, {
        playerShip: capture.data.playerShip,
        reachModifiers: capture.data.reachModifiers,
        teammates: capture.data.teammates,
        opponentTeams: capture.data.opponentTeams,
      });
    }

    // Determine overall screenshot type
    const hasCrewHub = capturedScreenshots.some(c => c.type === 'crew_hub');
    const hasTacticalMap = capturedScreenshots.some(c => c.type === 'tactical_map');

    let screenshotType: ScreenshotType = 'unknown';
    if (hasCrewHub && hasTacticalMap) {
      screenshotType = 'crew_hub'; // Combined, prioritize crew hub for display
    } else if (hasCrewHub) {
      screenshotType = 'crew_hub';
    } else if (hasTacticalMap) {
      screenshotType = 'tactical_map';
    }

    // Calculate overall confidence
    const overallConfidence = calculateOverallConfidence(merged);

    return {
      screenshotType,
      playerShip: merged.playerShip,
      playerTeamName: undefined,
      reachModifiers: merged.reachModifiers || [],
      enemyShips: [],
      teammates: merged.teammates || [],
      opponentTeams: merged.opponentTeams || [],
      overallConfidence,
      captureTimestamp: Date.now(),
      imagePreview: capturedScreenshots[capturedScreenshots.length - 1]?.data.imagePreview,
    };
  }, [capturedScreenshots]);

  const state: SmartCaptureState = {
    isCapturing,
    isProcessing,
    error,
    pendingData,
    capturedScreenshots,
  };

  const actions: SmartCaptureActions = {
    capture,
    clearCaptures,
    clearError,
    dismissPendingData,
    getMergedData,
  };

  return [state, actions];
}
