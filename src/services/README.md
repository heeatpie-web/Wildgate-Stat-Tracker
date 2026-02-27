# Services

This folder holds cross-stream service contracts that UI and OCR teams can share safely.

## OCR Adapter

- File: `ocrAdapter.ts`
- Purpose: stable renderer-side API for OCR-related operations.
- UI code should import OCR operations from this adapter, not from OCR internals.

Current default adapter delegates to `src/utils/artifactService.ts` so behavior is unchanged.
