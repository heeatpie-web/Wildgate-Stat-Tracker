# `electron/` Map

Main process runtime: window lifecycle, IPC, telemetry, OCR integration.

## Core Files

- `main.cjs`: app bootstrap, BrowserWindow, IPC handlers, telemetry archive logic
- `preload.cjs`: contextBridge allowlists for renderer IPC
- `ocrHandler.cjs`: capture + OCR pipeline entrypoint
- `screenDetector.cjs`: screenshot type detection
- `crewHubExtractor.cjs`: crew-hub parsing
- `mapScreenExtractor.cjs`: tactical map parsing
- `ocrMerger.cjs`: multi-capture merge logic
- `gcloudService.cjs`: Vision OCR client
- `gcloudSyncService.cjs`: Storage sync/upload client

## Security-Critical Areas

- BrowserWindow `webPreferences` in `main.cjs`
- IPC handlers that touch filesystem/network
- Host/path validation utilities in `main.cjs`

## Change Checklist

1. Update handler allowlists in `preload.cjs` when adding IPC channels.
2. Validate all handler inputs before file/network actions.
3. Keep renderer-facing handlers minimal and deterministic.

