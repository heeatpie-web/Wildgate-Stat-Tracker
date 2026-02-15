# Handoff - 2026-02-14

## Status
- Completed (telemetry performance profiles implemented).

## Summary
- Fixed screenshot bundling regression by aligning handler state key with helper expectation:
  - `bundledKeys` -> `bundledSizes` in `electron/handlers/artifactHandlers.cjs`.
- Fixed match history to Smart Capture artifact drift by syncing on-disk match artifacts during final submission:
  - Added reconciliation path in `src/hooks/useMatchSubmission.ts` using `getMatchArtifactsStructured`.
  - Artifacts now dedupe-merge from existing match data + bundler output + match artifact directory.
- Added regression test coverage in `src/hooks/__tests__/useMatchSubmission.test.ts`.

## Verification
- Targeted tests passed.
- Typecheck passed.
- Lint passed for touched files.

## Remaining
- No active blockers.
- Optional next iteration: profile telemetry decode/archive workload during live match to reduce idle CPU/IO baseline.

## Performance Notes
- `decode_script.cjs` style cache decoding is not a constant background task by itself; it is manual/dev-triggered.
- The higher steady-state runtime demand is from live telemetry monitoring in `electron/main.cjs`:
  - 2s polling loop
  - full cache decode on log mtime change
  - archive/history writes after decode

## Current Task Summary (Telemetry Profiles)
- Added persisted telemetry performance profile:
  - `Low Power`
  - `Balanced` (default)
  - `High Accuracy`
- Settings control added in `src/components/SettingsModal.tsx`.
- Profile is passed from renderer to main process via `start-log-monitoring`.
- Main process now applies profile-specific telemetry monitor behavior:
  - polling interval
  - decode throttle
  - snapshot write throttle
  - skip archive/history writes when no usable telemetry events.

---

## Handoff - 2026-02-15 - TELEMETRY-BASTION-001
## Status
- Completed.

## What Changed
- Updated telemetry loadout parsing in `src/hooks/useLogMonitor.ts`:
  - Added case-insensitive loadout field resolution helper.
  - Expanded hero/ship GUID key discovery.
  - Added raw-field fallback so hero/ship can be recognized without GUIDs.

## What Was Verified
- `npm run -s typecheck` passed.
- `npx eslint src/hooks/useLogMonitor.ts` passed.

## Remaining / Risks
- GUID ship coverage in `src/utils/guids.ts` remains sparse; this fix mitigates missing GUID cases via raw-field fallback but does not add new canonical GUID mappings.

---

## Handoff - 2026-02-15 - BUG-BATCH-001
## Status
- Completed (first-pass subset).

## What Changed
- Smart Captures:
  - Fixed OCR-apply stale overwrite path and improved roster name resolution/fuzzy matching.
  - Enforced teammate cap based on ship capacity.
  - Added per-match `Wizard` launch action for manual entry.
  - Added automatic artifact relink attempt on panel load.
  - Included queued (non-saved `ocrState`) items in queue classification.
- Recording:
  - Telemetry ship indicator now matches normalized ship names (e.g., `Hunter` vs `Hunter (4 Player)`).
  - Reduced selected teammate chip font size in roster manager.
- Settings:
  - Telemetry performance profile always visible/selectable.
  - Capture mode copy clarified ("capture now + auto OCR" vs "capture now, OCR later").
- Performance mode:
  - Expanded `perf-lite` CSS to strip additional blur/shadow render cost.

## What Was Verified
- `npm run -s typecheck` passed.
- `npx eslint` passed for touched TS/TSX files.

## Remaining / Deferred
- Full settings hierarchy redesign into tabbed IA.
- Overlay mode parity for all navigation destinations.
- Analytics Pro view deep-dive click-through behavior.
- Additional motion polish between view switches.

---

## Handoff - 2026-02-15 - BUG-BATCH-002
## Status
- Completed (targeted continuation item).

## What Changed
- Recording layout clipping remediation in `src/components/RecordingView.tsx`:
  - Replaced raw window-size mode switching with container-size measurement (`ResizeObserver` + resize fallback).
  - Compact density now keys off constrained available height, not global window height.
  - Wide constrained-height mode now enables fallback vertical scrolling instead of clipping lower panel content.
  - Left recording shell gets conditional scroll only in constrained wide mode.
- Added/updated coverage in `src/components/RecordingView.test.tsx`:
  - Compact wide constrained-height mode now asserts root fallback scroll behavior.

## What Was Verified
- `npx vitest run src/components/RecordingView.test.tsx` passed.
- `npx eslint src/components/RecordingView.tsx src/components/RecordingView.test.tsx` passed.
- `npm run -s typecheck` passed.

## Remaining / Deferred
- Settings hierarchy tabbed IA redesign.
- Overlay mode navigation parity.
- Analytics Pro panel drill-down click behavior.
- Expanded event sound cues and global transition polish.

---

## Handoff - 2026-02-15 - BUG-BATCH-003
## Status
- Completed.

## What Changed
- Implemented tabbed settings hierarchy in `src/components/SettingsModal.tsx`:
  - Added clickable tab rail: `Identity`, `Interface`, `OCR/Capture`, `Data`.
  - Gated existing settings sections by active tab for clearer hierarchy.
  - Added overlay-mode-safe fallback to prevent selecting unavailable `Data` tab.
- Preserved existing handlers and persistence behavior for all controls.

## What Was Verified
- `npx eslint src/components/SettingsModal.tsx` passed.
- `npm run -s typecheck` passed.

## Remaining / Deferred
- Overlay mode navigation parity outside settings.
- Analytics Pro deep-dive click-through behavior.
- Additional sound indicators.
- Global view transition smoothing.

---

## Handoff - 2026-02-15 - BUG-BATCH-004
## Status
- Completed.

## What Changed
- Added shared sound cue utility in `src/utils/soundCues.ts`.
- Added toast-driven audio indicators in `src/components/Toast.tsx`.
- Added view-switch sound cue + transition wrapper in `src/App.tsx`.
- Added `app-view-transition` animation styles in `src/index.css`.
- Improved Pro Analytics deep-dive reliability in `src/components/analytics/AnalyticsShell.tsx`:
  - explicit clickable `Open detail` control on each Pro tile,
  - external navigation event handler for targeted analytics subview opens.
- Restored overlay parity in `src/components/OverlayView.tsx`:
  - mission/squadron/social tabs,
  - social summary panel in overlay,
  - quick jump buttons to relevant full views.

## What Was Verified
- `npx eslint src/components/OverlayView.tsx src/components/analytics/AnalyticsShell.tsx src/components/Toast.tsx src/utils/soundCues.ts src/App.tsx` passed.
- `npm run -s typecheck` passed.

## Remaining / Deferred
- No remaining items from the explicitly open list in this bug batch.
