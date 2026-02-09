/**
 * @module scan
 * Barrel re-export for the scan pipeline modules.
 */

// Types
export type { ScanResult, TeamColor, LobbyScanResult, ScanOptions, SmartScanResult, MLDetection, OCRLine } from './types';

// Image utilities
export { captureScreen, cropImageDataUrl, preprocessImage } from './imageUtils';

// OCR utilities
export { groupWordsIntoLines, runMLDetection, runNativeOCR, runCloudOCR, detectModifiers } from './ocrUtils';

// Color detection
export { getTeamColor, sampleRegion } from './colorDetection';

// Scan pipelines
export { processMatchScreenshot } from './matchScan';
export { processLobbyScreenshot } from './lobbyScan';
export { processSocialScreenshot } from './socialScan';
export { processTacticalScreenshot } from './tacticalScan';
export { processWithTesseractOCR } from './tesseractScan';

// Orchestrator
export { smartAnalyzeScreen, terminateOCR } from './smartAnalyze';
