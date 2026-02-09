/**
 * @module scanService
 * Backward-compatible barrel re-export. Actual implementations live in ./scan/.
 */
export type { ScanResult, TeamColor, LobbyScanResult, ScanOptions, SmartScanResult, MLDetection, OCRLine } from './scan';
export { captureScreen, cropImageDataUrl, preprocessImage } from './scan';
export { groupWordsIntoLines, runMLDetection, runNativeOCR, runCloudOCR } from './scan';
export { processMatchScreenshot } from './scan';
export { processLobbyScreenshot } from './scan';
export { processSocialScreenshot } from './scan';
export { processTacticalScreenshot } from './scan';
export { processWithTesseractOCR } from './scan';
export { smartAnalyzeScreen, terminateOCR } from './scan';
