/**
 * @module scanService
 * Backward-compatible barrel re-export. Actual implementations live in ./scan/.
 */
export type { ScanResult, TeamColor, LobbyScanResult, ScanOptions, SmartScanResult, OCRLine } from './scan';
export { captureScreen, cropImageDataUrl, preprocessImage } from './scan';
export { groupWordsIntoLines, runNativeOCR, runCloudOCR } from './scan';
export { processMatchScreenshot } from './scan';
export { processLobbyScreenshot } from './scan';
export { processSocialScreenshot } from './scan';
export { processTacticalScreenshot } from './scan';
export { processWithLocalOCR, resolveTagShipMetadata } from './scan';
export { smartAnalyzeScreen, terminateOCR } from './scan';
