/**
 * OCR Module Exports
 */

export * from './ocrTypes';
export * from './ocrMappings';
export * from './ocrParser';
// Explicitly export non-conflicting items from ocrMerge (mergeOCRData is in ocrParser)
export { isSameMatchSession, createEmptyOCRData } from './ocrMerge';
