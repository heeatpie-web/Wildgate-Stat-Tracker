/**
 * @module scan
 * Barrel re-export for the scan pipeline modules.
 */

// Types
export type { ScanResult, TeamColor, LobbyScanResult, ScanOptions, SmartScanResult, OCRLine } from './types';

// Image utilities
export { captureScreen, cropImageDataUrl, preprocessImage } from './imageUtils';

// OCR utilities
export { groupWordsIntoLines, runNativeOCR, runCloudOCR, detectModifiers } from './ocrUtils';

// Color detection
export { getTeamColor, sampleRegion } from './colorDetection';

// Scan pipelines
export { processMatchScreenshot } from './matchScan';
export { processLobbyScreenshot } from './lobbyScan';
export { processSocialScreenshot } from './socialScan';
export { processTacticalScreenshot } from './tacticalScan';
export { processWithLocalOCR, resolveTagShipMetadata } from './localScan';

// Orchestrator
export { smartAnalyzeScreen, terminateOCR } from './smartAnalyze';
