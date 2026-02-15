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

---

## Handoff - 2026-02-15 - DEV-SPLASH-RETRY-001
## Status
- Completed.

## What Changed
- Updated dev splash progress update path in `electron/main.cjs`:
  - `setSplashProgress` now stores per-window splash payloads and enforces monotonic percentage writes.
  - Lower-percent retry updates no longer roll back a higher already-shown value.
  - `setSplashProgressDedupe` remains as a compatibility wrapper, but dedupe/clamp behavior is centralized.

## What Was Verified
- `npx eslint electron/main.cjs` passed.
- Manual code-path validation confirms retry status text continues updating while percent remains non-decreasing.

## Remaining / Risks
- If the dev server is actually down, status will still continue to show retry attempts (expected behavior); this fix only removes misleading backward progress jumps.

---

## Handoff - 2026-02-15 - TAB-LOADING-STARTUP-001
## Status
- Completed.

## What Changed
- Updated lazy dashboard view loading in `src/App.tsx`:
  - Added named loader functions for lazy tabs (`analytics`, `history`, `smart-captures`, `players`, `dev-ocr`).
  - Added `warmLazyDashboardViews()` helper to preload these chunks.
  - Added startup effect (dashboard mode only) to warm-load chunks after mount.

## What Was Verified
- `npx eslint src/App.tsx` passed.
- `npm run -s typecheck` passed.
- Manual code-path check confirms Suspense fallback remains but first-switch chunk fetch is now initiated proactively.

## Remaining / Risks
- If the user switches tabs immediately before preload requests complete, fallback may still appear briefly.
- No routing/navigation behavior changes were made beyond preload timing.

---

## Handoff - 2026-02-15 - OCR-HYDRATION-COMBINED-001
## Status
- Completed.

## What Changed
- Added deterministic OCR alias learning engine in `src/utils/ocrAliasEngine.ts`:
  - confidence/context/recency/frequency-based scoring,
  - strict/relaxed ambiguity gates,
  - blocklist + compaction support,
  - legacy correction migration helper.
- Updated mapping slice in `src/store/slices/createMappingSlice.ts`:
  - introduced persisted `ocrAliasModel`,
  - added alias actions (`record/resolve/compact/block/unblock`),
  - preserved legacy `recordOcrCorrection` compatibility wrapper.
- Updated hydration/persistence in `src/store/useAppStore.ts` and `src/utils/storage.ts`:
  - migrate legacy corrections when alias model is absent,
  - persist new OCR learning and startup preload settings,
  - persist `ocrAliasModel`.
- Added new settings controls in `src/store/slices/createSettingsSlice.ts` and `src/components/SettingsModal.tsx`:
  - startup smart preload toggle,
  - OCR learning enable/strict/min-score/min-count controls,
  - learned alias list with block/unblock action.
- Integrated shared alias resolver into runtime flows:
  - `src/hooks/useSmartScan.ts`
  - `src/App.tsx` OCR-apply path.
- Upgraded startup lazy preload behavior in `src/App.tsx`:
  - staged background chunk warmup,
  - gated by hydration/overlay/performance/settings,
  - dynamic fallback copy (`Opening view...` when warm).
- Added/updated tests:
  - `src/utils/__tests__/ocrAliasEngine.test.ts`
  - `src/store/slices/__tests__/createMappingSlice.test.ts`

## What Was Verified
- `npm run test -- src/utils/__tests__/ocrAliasEngine.test.ts src/store/slices/__tests__/createMappingSlice.test.ts` passed (32 tests).
- `npm run typecheck` passed after one targeted remediation.
- `npx eslint` passed for all touched OCR/preload files.
- Manual code-path verification confirms:
  - compatibility hydration from legacy correction data,
  - resolver usage in scan + review apply paths,
  - startup preload gate behavior and settings persistence.

## Remaining / Risks
- Legacy `ocrCorrections` remains persisted for compatibility; a future cleanup migration can remove dual-write once all consumers are migrated.
- Startup warm preload reduces first-switch loading flashes, but immediate tab-switching at launch can still briefly hit Suspense if chunks are not yet ready.

---

## Handoff - 2026-02-15 - ADV-AUTOLEARN-V2-001
## Status
- Completed.

## What Changed
- Implemented advanced OCR learning governance:
  - `src/utils/ocrAliasEngine.ts` now includes learning decision events, queue items, rollback helper, explainability metadata, and queue policy helper.
  - `src/store/slices/createMappingSlice.ts` now supports full learning lifecycle actions:
    - `logOcrLearningDecision`
    - `enqueueOcrLearningReview`
    - `approveOcrLearningEvent`
    - `rejectOcrLearningEvent`
    - `rollbackOcrLearningEvent`
    - `clearResolvedOcrLearningEvents`
- Persisted advanced state:
  - `src/store/slices/createSettingsSlice.ts`, `src/store/useAppStore.ts`, `src/utils/storage.ts` updated for review-mode, queue, adaptive preload, recommendation mode/history, and learning event persistence.
- Wired runtime behavior:
  - `src/hooks/useSmartScan.ts` + `src/App.tsx` now queue/log learning decisions and honor advanced review policy.
  - `src/components/ReviewQueueModal.tsx` now handles OCR learning queue approval/rejection/edit flows.
  - `src/components/SettingsModal.tsx` now exposes advanced controls, history/rollback UI, and recommendation run/apply/revert.
- Added recommendation pipeline:
  - `scripts/ocr_threshold_recommend.cjs` (new) generates recommendation JSON from corpus metrics.
  - `electron/main.cjs` adds `ocr-corpus-threshold-recommend` IPC handler.
  - `electron/preload.cjs` allowlists new invoke channel.
  - `package.json` adds `ocr:threshold:recommend`.

## What Was Verified
- `npm run typecheck` passed.
- `npx vitest run src/utils/__tests__/ocrAliasEngine.test.ts src/store/slices/__tests__/createMappingSlice.test.ts` passed (38 tests).
- `npx eslint` passed for all touched renderer/store/test files.
- `npx eslint` passed for touched Electron/script files.
- `npm run ocr:threshold:recommend` passed and emitted a valid recommendation payload.

## Remaining / Risks
- Recommendation quality depends on corpus report availability/quality; with sparse corpus history the script intentionally outputs conservative confidence.
- Adaptive preload remains hardware and runtime gated; low-power devices may still see occasional on-demand lazy fallback during very early startup switches.

---

## Handoff - 2026-02-15 - DEV-STARTUP-HOOKS-001
## Status
- Completed.

## What Changed
- Fixed Settings runtime hook-order crash in `src/components/SettingsModal.tsx`:
  - moved the overlay-tab `useEffect` above the `if (!showSettings) return null` guard.
- Improved dev startup responsiveness in `package.json`:
  - removed `wait-on tcp:5173` from `electron:dev` and `dev:hot` so Electron launches immediately.
- Reduced startup critical-path blocking in `electron/main.cjs`:
  - prioritize window creation before tray creation,
  - run telemetry migration in background (non-blocking),
  - defer telemetry archive cleanup off critical path,
  - move cloud initialization to background task (no startup `await`),
  - tighten first retry delay/backoff in dev renderer retry loop.

## What Was Verified
- `npm run typecheck` passed.
- `npx eslint src/components/SettingsModal.tsx electron/main.cjs package.json` passed (with expected ignored-file warning for package.json only).
- Manual code-path checks confirm:
  - stable hook execution order in settings modal,
  - earlier splash visibility in `electron:dev`,
  - background/non-blocking init for selected startup tasks.

## Remaining / Risks
- Dev startup speed will still vary with cold Vite compile/transforms and machine load.
- Cloud services now initialize asynchronously; `get-gcloud-status` may briefly show not-ready during early startup until background init completes.

---

## Handoff - 2026-02-15 - PROFILE-SETTINGS-MERGE-001
## Status
- Completed.

## What Changed
- Updated `src/components/Sidebar.tsx`:
  - removed the standalone sidebar Settings button.
  - retained Settings access in the profile hub menu under the profile icon.
- Updated `src/components/Tutorial.tsx`:
  - retargeted the Settings tutorial step from the removed `nav-settings` anchor to `profile-selector`.
  - updated step copy to instruct opening Profile Hub then choosing Settings.

## What Was Verified
- `npm run typecheck` passed.
- `npx eslint src/components/Sidebar.tsx src/components/Tutorial.tsx` passed.
- Manual code-path checks confirm settings is reachable from profile icon menu and tutorial target exists.

## Remaining / Risks
- No functional settings behavior changes were made; only access path consolidation and tutorial alignment.

---

## Handoff - 2026-02-15 - PROFILE-BUTTON-WIDTH-001
## Status
- Completed.

## What Changed
- Updated `src/components/Sidebar.tsx`:
  - changed profile wrapper class from `relative` to `relative w-full`.
  - this makes the profile button share the same full-width lane behavior as nav buttons.

## What Was Verified
- `npx eslint src/components/Sidebar.tsx` passed.
- `npm run typecheck` passed.
- Manual code-path check confirms width mismatch root cause (non-full-width wrapper) is removed.

## Remaining / Risks
- No behavior/state changes were made; this is a class-only layout correction.

---

## Handoff - 2026-02-15 - OVERLAY-NAV-RECORDING-LAYOUT-001
## Status
- Completed.

## What Changed
- Updated `src/components/OverlayView.tsx`:
  - overlay tab rail labels now read `Recording`, `Loadout`, `Social`.
  - overlay tab controls remain in overlay (no forced full-view exit).
  - added explicit full-view actions:
    - `Open Full` (contextual: recording/social),
    - `History`,
    - `Captures`.
  - in compact overlay style, moved `ActionPanel` above mission panel content.
- Updated `src/components/RecordingView.tsx`:
  - moved `ActionPanel` out of left shell and into main content area.
  - recording layout now renders Match Recording above Mission Intel in wide and narrow layouts.
  - left shell now focuses on loadout (`SquadronPanel`).
- Updated `src/components/RecordingView.test.tsx`:
  - adjusted tests for new layout model and ordering expectations.

## What Was Verified
- `npx vitest run src/components/RecordingView.test.tsx` passed (4 tests).
- `npx eslint src/components/OverlayView.tsx src/components/RecordingView.tsx src/components/RecordingView.test.tsx` passed.
- `npm run typecheck` passed.

## Remaining / Risks
- Overlay now has explicit full-view actions instead of implicit tab-based exits; this is intentional behavior change and may require minor user habituation.

---

## Handoff - 2026-02-15 - RECORDING-ROLLBACK-ALIGN-001
## Status
- Completed.

## What Changed
- Restored previous Recording panel placement in `src/components/RecordingView.tsx`:
  - Match Recording (`ActionPanel`) moved back into left shell.
  - compact `Actions/Loadout` toggle behavior restored.
  - mission column no longer contains moved-up Match Recording panel.
- Updated tests in `src/components/RecordingView.test.tsx`:
  - reverted expectations to prior layout behavior and compact tab-switch behavior.
- Normalized cross-view shell alignment:
  - `src/components/analytics/AnalyticsShell.tsx`: removed duplicate top-level `p-3`.
  - `src/components/PlayerHub.tsx`: removed duplicate top-level `p-3`.
  - `src/components/smart-captures/SmartCapturesShell.tsx`: removed duplicate top-level `p-3`.
  - `src/components/HistoryTable.tsx`: root now uses `h-full min-h-0 overflow-y-auto` for consistent shell fill.

## What Was Verified
- `npx vitest run src/components/RecordingView.test.tsx` passed (3 tests).
- `npx eslint` passed for touched recording/alignment files.
- `npm run typecheck` passed.
- Manual code-path verification confirms:
  - Recording rollback is restored.
  - Analytics/History top-offset mismatch source (duplicate shell padding) was removed.

## Remaining / Risks
- Recording remains slightly denser than some other views by design because it uses internal `p-4` panel spacing; this patch targets cross-tab shell alignment, not full visual unification of all internal card systems.

---

## Handoff - 2026-02-15 - OCR-ADAPTIVE-RESOLUTION-001
## Status
- Completed.

## What Changed
- Added adaptive variant-matching utilities in `src/utils/stringUtils.ts`:
  - `lcsLength`, `lcsRatio`, `charFrequencyOverlap`, `variantSimilarityScore`, `findBestVariantMatch`.
- Added shared resolver module `src/utils/ocrNameResolver.ts`:
  - alias-model-derived variant map builder,
  - conservative contextual resolver using social graph (`playedWith`),
  - canonical dedupe helper for named OCR entities,
  - shared `resolveOcrName` ladder.
- Integrated shared resolver across OCR name pipelines:
  - `src/hooks/useSmartCapture.ts`
  - `src/hooks/useSmartScan.ts`
  - `src/App.tsx` OCR apply path.
- Improved session-level OCR dedupe/canonicalization in Smart Capture:
  - teammate/opponent canonical dedupe after resolution,
  - contextual second-pass disambiguation only when safe (2+ anchors, unique candidate).
  - opponent-team contextual second pass now anchors on resolved players from the same opponent team (not teammate anchors).
- Added guarded corpus auto-growth from reviewed corrections:
  - preload allowlist channel in `electron/preload.cjs` (`ocr-corpus-add-corrected-sample`),
  - main-process IPC handler in `electron/main.cjs` with quality checks + dedupe by hash/signature + sync,
  - fire-and-forget invoke in `src/components/ocr/OCRReviewModal.tsx`.
- Updated security gate fixture in `scripts/security_negative_tests.cjs` for new IPC channel.
- Added new tests:
  - `src/utils/__tests__/ocrNameResolver.test.ts`
  - extended `src/utils/__tests__/stringUtils.test.ts`.

## What Was Verified
- `npx eslint` passed on all touched resolver/IPC/security files.
- `npx vitest run src/utils/__tests__/stringUtils.test.ts src/utils/__tests__/ocrNameResolver.test.ts src/store/slices/__tests__/createMappingSlice.test.ts` passed (62 tests).
- `node scripts/security_negative_tests.cjs` passed (113 pass / 0 fail).
- `npm run -s typecheck` passed.
- Post-refinement regressions:
  - `npx eslint src/hooks/useSmartCapture.ts` passed.
  - `npx vitest run src/utils/__tests__/stringUtils.test.ts src/utils/__tests__/ocrNameResolver.test.ts src/store/slices/__tests__/createMappingSlice.test.ts` passed (62 tests).

## Remaining / Risks
- Variant threshold (`55`) is conservative but still tunable; if false positives appear, increase threshold or tighten context gate.
- Corpus auto-ingest currently dedupes exact image+signature pairs; same image with materially different corrected labels is intentionally retained as a distinct sample.
- `node scripts/security_negative_tests.cjs` generated/updated `dataset/ocr-corpus/reports/security-gate-a.json` as part of validation evidence.
- Corpus eval scripts could not run in this workspace because expected corpus truth files are absent:
  - `dataset/ocr-corpus/ground-truth.json`
  - `dataset/ocr-corpus/ground-truth.sample.json`.

---

## Handoff - 2026-02-15 - VERSION-CHANGELOG-001
## Status
- Completed.

## What Changed
- Updated release version metadata:
  - `package.json`: `version` -> `2.15.0`
  - `package-lock.json`: root/package `version` -> `2.15.0`
  - `src/utils/constants.ts`: `APP_VERSION` -> `v2.15`
- Added new release notes entry:
  - `src/utils/changelog.ts`: new `v2.15` section describing OCR adaptive resolver + guarded corpus auto-growth updates.

## What Was Verified
- `npx eslint src/utils/constants.ts src/utils/changelog.ts` passed.
- `npm run -s typecheck` passed.
- Version coherence checks confirmed:
  - `package.json` includes `2.15.0`
  - `package-lock.json` root/package versions include `2.15.0`
  - `APP_VERSION` is `v2.15`
  - changelog includes `v2.15` entry.

## Remaining / Risks
- None for runtime behavior; this was metadata-only and does not alter feature logic.
