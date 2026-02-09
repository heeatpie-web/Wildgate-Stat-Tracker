/**
 * useSmartCapture Hook
 * Manages the Smart Capture workflow for OCR-based data extraction
 *
 * Features:
 * - activeUser anchor for improved player detection
 * - Auto-merge: each capture merges into running state
 * - Capture queue: sequential processing when user triggers rapidly
 * - Screenshot-first: capture saves to disk immediately, OCR deferred
 * - Reset session to clear merged state
 */

import { useState, useCallback, useRef } from 'react';
import { captureGameWindow, ocrProcessCapture, saveScreenshot, isElectron } from '../utils/electronBridge';
import { rerunOCROnArtifact } from '../utils/artifactService';
import type { OCRExtractedData, ScreenshotType } from '../utils/ocr/ocrTypes';
import { mergeOCRData, calculateOverallConfidence } from '../utils/ocr/ocrParser';
import { useAppStore } from '../store/useAppStore';
import { useSoundEffects } from './useSoundEffects';

/** A saved screenshot that may or may not have been OCR-processed yet. */
export interface SavedCapture {
  filePath: string;
  filename: string;
  timestamp: number;
  ocrData?: OCRExtractedData;
  ocrProcessed: boolean;
}

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
  queueDepth: number;
  /** Saved image paths (screenshot-first mode) */
  savedCaptures: SavedCapture[];
}

export interface SmartCaptureActions {
  capture: (activeUser?: string | null) => Promise<void>;
  captureMultiple: (count: number, activeUser?: string | null) => Promise<void>;
  /** Screenshot-first: save to disk without OCR */
  captureOnly: (matchId?: string | number | null) => Promise<SavedCapture | null>;
  /** Run OCR on a previously saved screenshot */
  processStoredImage: (filePath: string, activeUser?: string | null) => Promise<void>;
  /** Run OCR on all unprocessed saved captures */
  processAllStored: (activeUser?: string | null) => Promise<void>;
  clearCaptures: () => void;
  clearError: () => void;
  dismissPendingData: () => void;
  getMergedData: () => OCRExtractedData | null;
  reanalyzeCaptures: () => void;
  resetCaptureSession: () => void;
}

export function useSmartCapture(): [SmartCaptureState, SmartCaptureActions] {
  const ocrMode = useAppStore(s => s.ocrMode);
  const captureMode = useAppStore(s => s.captureMode);
  const { playSuccess, playError: playSoundError } = useSoundEffects();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<OCRExtractedData | null>(null);
  const [capturedScreenshots, setCapturedScreenshots] = useState<
    Array<{ type: ScreenshotType; data: OCRExtractedData; timestamp: number }>
  >([]);
  const [queueDepth, setQueueDepth] = useState(0);
  const [savedCaptures, setSavedCaptures] = useState<SavedCapture[]>([]);

  // Capture queue for sequential processing
  const captureQueueRef = useRef<Array<{ activeUser?: string | null }>>([]);
  const isProcessingQueueRef = useRef(false);

  /**
   * Build merged data from all captured screenshots
   */
  const buildMergedData = useCallback((screenshots: Array<{ type: ScreenshotType; data: OCRExtractedData; timestamp: number }>): OCRExtractedData | null => {
    if (screenshots.length === 0) return null;

    let merged: Partial<OCRExtractedData> = {
      playerShip: undefined,
      reachModifiers: [],
      teammates: [],
      opponentTeams: [],
    };

    for (const capture of screenshots) {
      merged = mergeOCRData(merged, {
        playerShip: capture.data.playerShip,
        reachModifiers: capture.data.reachModifiers,
        teammates: capture.data.teammates,
        opponentTeams: capture.data.opponentTeams,
      });
    }

    const hasCrewHub = screenshots.some(c => c.type === 'crew_hub');
    const hasTacticalMap = screenshots.some(c => c.type === 'tactical_map');

    let screenshotType: ScreenshotType = 'unknown';
    if (hasCrewHub) screenshotType = 'crew_hub';
    else if (hasTacticalMap) screenshotType = 'tactical_map';

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
      imagePreview: screenshots[screenshots.length - 1]?.data.imagePreview,
    };
  }, []);

  /**
   * Merge extracted data into running pendingData state
   */
  const mergeIntoPending = useCallback((extractedData: OCRExtractedData) => {
    setCapturedScreenshots(prev => [
      ...prev,
      { type: extractedData.screenshotType, data: extractedData, timestamp: Date.now() },
    ]);
    setPendingData(prev => {
      if (!prev) {
        return {
          screenshotType: extractedData.screenshotType,
          playerShip: extractedData.playerShip,
          playerTeamName: undefined,
          reachModifiers: extractedData.reachModifiers || [],
          enemyShips: [],
          teammates: extractedData.teammates || [],
          opponentTeams: extractedData.opponentTeams || [],
          overallConfidence: extractedData.overallConfidence || 0,
          captureTimestamp: Date.now(),
          imagePreview: extractedData.imagePreview,
        };
      }
      const merged = mergeOCRData(prev, {
        playerShip: extractedData.playerShip,
        reachModifiers: extractedData.reachModifiers,
        teammates: extractedData.teammates,
        opponentTeams: extractedData.opponentTeams,
      });
      const screenshotType = extractedData.screenshotType !== 'unknown'
        ? extractedData.screenshotType : prev.screenshotType;
      return {
        ...prev,
        screenshotType,
        playerShip: merged.playerShip || prev.playerShip,
        reachModifiers: merged.reachModifiers || prev.reachModifiers,
        teammates: merged.teammates || prev.teammates,
        opponentTeams: merged.opponentTeams || prev.opponentTeams,
        overallConfidence: calculateOverallConfidence(merged),
        captureTimestamp: Date.now(),
        imagePreview: extractedData.imagePreview || prev.imagePreview,
      };
    });
  }, []);

  /**
   * Process a single capture: capture → save → OCR → merge
   */
  const processSingleCapture = useCallback(async (activeUser?: string | null) => {
    // Step 1: Capture the game window
    const captureResult = await captureGameWindow();

    if (!captureResult.success || !captureResult.imageBase64) {
      throw new Error(captureResult.error || 'Failed to capture game window');
    }

    // Step 2: Save screenshot to disk immediately (screenshot-first)
    const saved = await saveScreenshot(captureResult.imageBase64);
    if (saved.success && saved.filePath) {
      setSavedCaptures(prev => [...prev, {
        filePath: saved.filePath!,
        filename: saved.filename || 'capture.png',
        timestamp: Date.now(),
        ocrProcessed: false,
      }]);
    }

    // Step 3: Process with OCR
    const ocrResult = await ocrProcessCapture(
      captureResult.imageBase64,
      activeUser,
      null,
      ocrMode
    );

    if (!ocrResult.success || !ocrResult.data) {
      throw new Error(ocrResult.error || 'Failed to process image');
    }

    // Step 4: Mark saved capture as processed
    if (saved.success && saved.filePath) {
      setSavedCaptures(prev => prev.map(c =>
        c.filePath === saved.filePath ? { ...c, ocrProcessed: true, ocrData: ocrResult.data } : c
      ));
    }

    return ocrResult.data;
  }, [ocrMode]);

  /**
   * Screenshot-first: capture and save to disk without running OCR
   */
  const captureOnly = useCallback(async (matchId?: string | number | null): Promise<SavedCapture | null> => {
    if (!isElectron()) {
      setError('Smart Capture is only available in the desktop app');
      return null;
    }

    setError(null);
    setIsCapturing(true);

    try {
      const captureResult = await captureGameWindow();
      if (!captureResult.success || !captureResult.imageBase64) {
        throw new Error(captureResult.error || 'Failed to capture game window');
      }

      const saved = await saveScreenshot(captureResult.imageBase64, matchId);
      if (!saved.success || !saved.filePath) {
        throw new Error(saved.error || 'Failed to save screenshot');
      }

      const entry: SavedCapture = {
        filePath: saved.filePath,
        filename: saved.filename || 'capture.png',
        timestamp: Date.now(),
        ocrProcessed: false,
      };

      setSavedCaptures(prev => [...prev, entry]);
      playSuccess();
      return entry;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Capture failed';
      setError(errorMessage);
      playSoundError();
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [playSuccess, playSoundError]);

  /**
   * Run OCR on a previously saved screenshot and merge into pending data
   */
  const processStoredImage = useCallback(async (filePath: string, activeUser?: string | null) => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await rerunOCROnArtifact(filePath, activeUser || '', ocrMode);
      if (!result?.success || !result?.data) {
        throw new Error(result?.error || 'OCR processing failed');
      }

      // Mark as processed
      setSavedCaptures(prev => prev.map(c =>
        c.filePath === filePath ? { ...c, ocrProcessed: true, ocrData: result.data } : c
      ));

      // Merge into pending data
      mergeIntoPending(result.data);
      playSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Processing failed';
      setError(errorMessage);
      playSoundError();
    } finally {
      setIsProcessing(false);
    }
  }, [ocrMode, mergeIntoPending, playSuccess, playSoundError]);

  /**
   * Run OCR on all unprocessed saved captures (batch)
   */
  const processAllStored = useCallback(async (activeUser?: string | null) => {
    const unprocessed = savedCaptures.filter(c => !c.ocrProcessed);
    if (unprocessed.length === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      let completed = 0;
      const settled = await Promise.allSettled(
        unprocessed.map(async (capture) => {
          const result = await rerunOCROnArtifact(capture.filePath, activeUser || '', ocrMode);
          completed++;
          return { filePath: capture.filePath, result };
        })
      );

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled' && outcome.value.result?.success && outcome.value.result.data) {
          const { filePath, result } = outcome.value;
          setSavedCaptures(prev => prev.map(c =>
            c.filePath === filePath ? { ...c, ocrProcessed: true, ocrData: result.data } : c
          ));
          mergeIntoPending(result.data);
        }
      }

      const successCount = settled.filter(s => s.status === 'fulfilled' && s.value.result?.success).length;
      if (successCount > 0) playSuccess();
      if (successCount < unprocessed.length) {
        setError(`${unprocessed.length - successCount} of ${unprocessed.length} images failed OCR`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Batch processing failed';
      setError(errorMessage);
      playSoundError();
    } finally {
      setIsProcessing(false);
    }
  }, [savedCaptures, ocrMode, mergeIntoPending, playSuccess, playSoundError]);

  /**
   * Process the capture queue sequentially
   */
  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    while (captureQueueRef.current.length > 0) {
      const item = captureQueueRef.current.shift()!;
      setQueueDepth(captureQueueRef.current.length);

      try {
        setIsCapturing(true);
        const extractedData = await processSingleCapture(item.activeUser);
        setIsCapturing(false);
        setIsProcessing(true);

        // Incremental merge
        mergeIntoPending(extractedData);
        playSuccess();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Capture failed';
        setError(errorMessage);
        playSoundError();
        console.error('Smart Capture queue error:', err);
      } finally {
        setIsCapturing(false);
        setIsProcessing(false);
      }
    }

    setQueueDepth(0);
    isProcessingQueueRef.current = false;
  }, [processSingleCapture, mergeIntoPending, playSuccess, playSoundError]);

  /**
   * Capture the game window and process with OCR
   * If a capture is already in progress, queues the request
   */
  const capture = useCallback(async (activeUser?: string | null) => {
    if (!isElectron()) {
      setError('Smart Capture is only available in the desktop app');
      return;
    }

    // Deferred mode: save screenshot only, skip OCR
    if (captureMode === 'deferred') {
      await captureOnly();
      return;
    }

    setError(null);

    // Queue the capture request
    captureQueueRef.current.push({ activeUser });
    setQueueDepth(captureQueueRef.current.length);

    // Process queue if not already processing
    await processQueue();
  }, [processQueue, captureMode, captureOnly]);

  /**
   * Capture multiple screenshots rapidly and process them sequentially
   */
  const captureMultiple = useCallback(async (count: number = 2, activeUser?: string | null) => {
    if (!isElectron()) {
      setError('Smart Capture is only available in the desktop app');
      return;
    }

    setError(null);

    // Queue N capture requests
    for (let i = 0; i < count; i++) {
      captureQueueRef.current.push({ activeUser });
    }
    setQueueDepth(captureQueueRef.current.length);

    // Process queue
    await processQueue();
  }, [processQueue]);

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
    return buildMergedData(capturedScreenshots);
  }, [capturedScreenshots, buildMergedData]);

  /**
   * Re-run merge/analysis on existing OCR data without re-capturing or re-calling OCR
   */
  const reanalyzeCaptures = useCallback(() => {
    const mergedResult = buildMergedData(capturedScreenshots);
    if (mergedResult) {
      setPendingData(mergedResult);
    }
  }, [capturedScreenshots, buildMergedData]);

  /**
   * Reset the capture session - clears all merged state for a new match
   */
  const resetCaptureSession = useCallback(() => {
    setCapturedScreenshots([]);
    setSavedCaptures([]);
    setPendingData(null);
    setError(null);
    captureQueueRef.current = [];
    setQueueDepth(0);
    isProcessingQueueRef.current = false;
  }, []);

  const state: SmartCaptureState = {
    isCapturing,
    isProcessing,
    error,
    pendingData,
    capturedScreenshots,
    queueDepth,
    savedCaptures,
  };

  const actions: SmartCaptureActions = {
    capture,
    captureMultiple,
    captureOnly,
    processStoredImage,
    processAllStored,
    clearCaptures,
    clearError,
    dismissPendingData,
    getMergedData,
    reanalyzeCaptures,
    resetCaptureSession,
  };

  return [state, actions];
}
