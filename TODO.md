# Project TODOs

## Recently Completed (v2.9.1)
- [x] **Fix: Smart Capture images** — Created `LocalImage` component that loads images via IPC (`read-file-base64`) as base64 data URLs, bypassing Chromium's `file://` restrictions.
- [x] **Fix: Damage Efficiency** — Added `Number()` coercion on all `damageTaken` arithmetic across `analytics.ts`, `AnalyticsDashboard.tsx`, and `ProView.tsx` to prevent string concatenation.
- [x] **Fix: Bundled telemetry "0 events"** — Fixed `bundle-artifacts` and `SmartCapturesPanel` to handle raw JSON array format (archives write `[...]` not `{telemetry: [...]}`).
- [x] **Feature: OCR Reprocess** — Re-run OCR on saved screenshots without cloud upload, with Apply to Session support.
- [x] **Docs: Full refresh** — Updated `GUIDE.md`, `TODO.md`; created `docs/IPC_HANDLERS.md`, `docs/TELEMETRY_PIPELINE.md`, `docs/ARTIFACT_PIPELINE.md`.

## Immediate Focus
- [ ] **OCR Accuracy** — Improve extraction accuracy for Crew Hub and Map Screen (confidence thresholds, fuzzy matching, ocrCorrections dictionary).
- [ ] **Telemetry Reliability** — Improve match start/end detection from telemetry events (dual-signal: `loadedMap`/`loadingMap` + `matchSessionId`).

## Feature Backlog
- [ ] Refine HistoryTable filtering (by ship, modifier, date range, teammate).
- [ ] Per-pilot analytics breakdowns in AnalyticsPanel.
- [ ] Improve Tutorial flow for first-time users.
- [ ] Overlay mode improvements (more compact layout, better click-through handling).
- [ ] Export analytics reports (PDF/image).

## Maintenance
- [ ] Keep `GUIDE.md` and `docs/` updated as architecture evolves.
- [ ] Add unit tests for `analytics.ts` edge cases (zero-damage, string coercion).
- [ ] Clean up legacy `ocr-debug/` path usage once all users have migrated to `screenshots/`.
