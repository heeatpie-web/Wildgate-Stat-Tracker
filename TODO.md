# Project TODOs

## Recently Completed (v2.9.1)
- [x] **Fix: Smart Capture images** — Created `LocalImage` component that loads images via IPC (`read-file-base64`) as base64 data URLs, bypassing Chromium's `file://` restrictions.
- [x] **Fix: Damage Efficiency** — Added `Number()` coercion on all `damageTaken` arithmetic across `analytics.ts`, `AnalyticsDashboard.tsx`, and `ProView.tsx` to prevent string concatenation.
- [x] **Fix: Bundled telemetry "0 events"** — Fixed `bundle-artifacts` and `SmartCapturesPanel` to handle raw JSON array format (archives write `[...]` not `{telemetry: [...]}`).
- [x] **Feature: OCR Reprocess** — Re-run OCR on saved screenshots without cloud upload, with Apply to Session support.
- [x] **Docs: Full refresh** — Updated `GUIDE.md`, `TODO.md`; created `docs/IPC_HANDLERS.md`, `docs/TELEMETRY_PIPELINE.md`, `docs/ARTIFACT_PIPELINE.md`.

## Recently Completed (v2.10)
- [x] **OCR Accuracy** — Already implemented: `ocrCorrections` dictionary, `bestGuess` confidence thresholds, fuzzy matching, and OCR review modal.
- [x] **Telemetry Reliability** — Already implemented: dual-signal detection (`loadedMap`/`loadingMap` + `matchSessionId`) in `telemetryProcessor.ts`.
- [x] **Feature: Player Hub** — New sidebar view combining roster manager + social analytics with search, sort, notes, merge, rename, and per-player stats.
- [x] **Feature: HistoryTable advanced filters** — Collapsible filter panel with result (Win/Loss/Draw), ship, hazard modifier, and date range filters.
- [x] **Feature: Export analytics as PNG** — Download button in Analytics header captures the current dashboard/view via `html2canvas`.
- [x] **Per-pilot analytics** — Covered by Player Hub (per-player win rates, ships, social analytics).
- [x] **Tutorial flow** — Already implemented: `Tutorial.tsx` with `data-tour` attributes and completion tracking.
- [x] **Overlay mode** — Already implemented: `OverlayView.tsx` with compact layout and click-through handling.
- [x] **Fix: Apply to Session** — `onApplyToSession` now persists OCR-extracted teammates, opponents, and modifiers to the match record.
- [x] **Fix: Screenshot delete UX** — Moved delete button away from fullscreen area, added 2-click confirmation.
- [x] **UI: Analytics empty state** — Shows friendly message when no match data exists instead of all-zero dashboard.
- [x] **Tests: analytics edge cases** — Added string coercion, zero-damage, and undefined damage tests (66 tests passing).

## Recently Completed (v2.11)
- [x] **Smart Captures Layout Overhaul (PLAN Step 6)** — Redesigned match list items (border-l-4 selected state, two-line layout, compact status chips), consolidated sidebar toolbar, merged detail header + sticky bar into single glassmorphic header, colored result buttons, improved empty state with contextual messages.
- [x] **OCR State Machine (PLAN Step 7)** — Added explicit `OcrState` type (`queued → processing → reviewing → ready → saved | error`) to `Match` interface. `getQueueStatus` uses state machine with legacy fallback. State transitions wired across single/bulk OCR rerun, review apply, resolve, and apply-to-session flows. MatchListItem shows state-aware badges with pulse animation during processing.
- [x] **Persistence + Close Handling (PLAN Step 11)** — Audited existing lifecycle guards (WAL, beforeunload, pagehide, visibilitychange, 3s interval flush). Added stale `ocrState` recovery on hydration: matches stuck in `processing` reset to `queued` on app restart.
- [x] **Capture Quality Indicator Refresh (PLAN Step 12)** — Redesigned quality indicator with visual confidence bar, level icons (●/◐/○), and actionable tips for poor captures. Applied to both compact and full ActionPanel layouts.
- [x] **UI Audit Fixes** — Replaced hardcoded `bg-black/30` with `bg-md-sys-on-surface/10` (progress bars) and `bg-md-sys-on-surface/5` (raw OCR text). Replaced `ring-white/30` with `ring-md-sys-on-surface/20` (team color dots).
- [x] **16-Bug Audit** — Verified all 16 bugs from fix-multi-bugs plan are resolved: duplicate screenshots, bucket workflow, teammate cap, AI Legion, manual teammate entry, match visibility, loadout indicators, timer restart, match-end-on-quit, hostile grouping, eliminator team, review modal, session reset, cloud OCR quality, artifact bucket.

## Maintenance
- [ ] Keep `GUIDE.md` and `docs/` updated as architecture evolves.
- [ ] Clean up legacy `ocr-debug/` path usage — deferred, still actively used by scan pipeline (`lobbyScan`, `matchScan`, `tacticalScan`, `DevOCRPanel`).

## Priority Now (Friend Beta Readiness)
- [ ] **Ship-to-Friends 24h Gate** � Freeze new features and require all before sharing build: (1) 
pm test PASS, (2) 
pm run build PASS, (3) 30-minute no-crash smoke run, (4) OCR core flow PASS (capture -> review -> save), (5) update path validated once or explicitly disabled with user-facing note, (6) version + changelog visible in-app.
