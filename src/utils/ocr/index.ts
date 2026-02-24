/**
 * OCR Module Exports
 */

export * from './ocrTypes';
export * from './ocrMappings';
export * from './ocrParser';
export * from './rerunMatchArtifacts';
// mergeFullOCRData merges two fully-formed OCRExtractedData objects (used by ocrMerge pipeline).
// mergeOCRData (from ocrParser) merges partial captures incrementally.
export { isSameMatchSession, createEmptyOCRData, mergeFullOCRData } from './ocrMerge';
