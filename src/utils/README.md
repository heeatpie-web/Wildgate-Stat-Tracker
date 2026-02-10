# `src/utils/` Map

Core renderer logic and integration helpers.

## Key Modules

- `electronAPI.ts`: safe access to `window.electronAPI`
- `electronBridge.ts`: typed IPC wrappers
- `storage.ts`: persistent storage adapter
- `scanService.ts`: scan pipeline entry for UI layers
- `telemetryProcessor.ts`: telemetry event reduction
- `analytics.ts`: derived metrics/insights engine
- `artifactService.ts`: match artifact IPC wrappers

## Submodules

- `ocr/`: OCR parse/merge/mapping utilities
- `scan/`: screenshot classification + OCR scan helpers
- `__tests__/`: utility-level tests

## Conventions

- Prefer pure functions for derived data.
- IPC calls should flow through `electronBridge.ts` or `electronAPI.ts`.

