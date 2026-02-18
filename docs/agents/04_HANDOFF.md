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

---

## Handoff - 2026-02-15 - IDMAPPER-TELEMETRY-SHIP-001
## Status
- Completed.

## What Changed
- Updated telemetry ship parsing in `src/hooks/useLogMonitor.ts`:
  - added strict GUID qualification (`32` hex chars) before treating values as ship GUIDs.
  - limited primary ship GUID extraction to explicit GUID fields (`guidship`, `shipguid`, `guid_ship`).
  - improved raw ship-name fuzzy matching (normalized/contains matching).
  - prevented unmatched raw ship strings from being promoted to active ship selection.
- Updated mapper display in `src/components/IdMapper.tsx`:
  - suppress `Unknown` role badge for entries already present in Known mappings tab.

## What Was Verified
- `npx eslint src/hooks/useLogMonitor.ts src/components/IdMapper.tsx` passed.
- `npm run -s typecheck` passed.
- Manual logic verification confirms:
  - non-GUID ship IDs no longer create UNKNOWN ship entries in mapper.
  - ship selection can update from raw telemetry matches without sticky fallback to previous ship.
  - known ID mappings no longer show misleading `Unknown` role chip by default.

## Remaining / Risks
- Ship telemetry still depends on quality/shape of raw loadout payload names; if upstream names drift far from canonical ship strings, mapping may need additional aliases.

---

## Handoff - 2026-02-15 - IDMAPPER-TELEMETRY-LOADOUT-002
## Status
- Completed.

## What Changed
- `src/components/IdMapper.tsx`
  - unknown-ID save flow is now domain-aware by detected type:
    - Hero -> `uidMappings.players`
    - Ship -> `uidMappings.ships`
    - Weapon -> `uidMappings.weapons`
    - Equipment -> `uidMappings.equipment`
  - generic fallback remains available.
- `src/hooks/useLogMonitor.ts`
  - expanded telemetry extraction for weapon/equipment GUID and name candidates.
  - improved resolution pipeline combines GUID-map and raw-name fuzzy matching.
  - conservative unknown registration remains GUID-only for unresolved IDs.
  - updates `activeWeapons` when telemetry provides weapon set.
- `src/components/recording/ActionPanel.tsx`
  - telemetry status panel now shows detected weapons/equipment.
  - panel can appear when only loadout weapons/equipment are detected.

## What Was Verified
- `npx eslint src/components/IdMapper.tsx src/hooks/useLogMonitor.ts src/components/recording/ActionPanel.tsx` passed.
- `npm run -s typecheck` passed.
- Manual logic verification confirms mapper type-routing and telemetry loadout visibility are active.

## Remaining / Risks
- Weapon/equipment mapping coverage still depends on available GUID/name dictionaries; unknown but non-GUID free-text values are intentionally ignored to avoid noisy false positives.

---

## Handoff - 2026-02-15 - DISABLE-RUNTIME-DEVTOOLS-001
## Status
- Completed.

## What Changed
- `electron/main.cjs`
  - Added `ALLOW_RUNTIME_DEVTOOLS` gate (`WILDGATE_ALLOW_DEVTOOLS=1`).
  - Runtime IPC `open-devtools` now no-ops unless that gate is enabled.
  - Startup auto-open behavior remains disabled.

## What Was Verified
- `npx eslint electron/main.cjs` passed.
- `npm run -s typecheck` passed.

## Remaining / Risks
- If you need DevTools temporarily, launch with `WILDGATE_ALLOW_DEVTOOLS=1`.

---

## Handoff - 2026-02-16 - BUG-BATCH-005
## Status
- Completed.

## What Changed
- OCR review/apply UX and data controls:
  - `src/components/ocr/OCRReviewModal.tsx`
  - Added reliable screenshot lightbox layering, editable opponent team metadata, add/remove players and teams, teammate add action, roster-match badges, and queue-to-roster-candidate action for unmatched names.

- OCR correction edit regression:
  - `src/components/OcrCorrectionModal.tsx`
  - Fixed input value precedence causing backspace/edit lockups.

- Smart Captures reliability + merge tooling:
  - `src/components/SmartCapturesPanel.tsx`
  - Fixed unknown-ship teammate capacity fallback, suppressed repeated auto-repair toast spam, integrated roster-candidate queueing, and added selected-match merge bulk action.

- App-level OCR apply parity:
  - `src/App.tsx`
  - Added queue-to-roster callback wiring and unknown-ship teammate-cap fallback.

- Submission data bundling integrity:
  - `src/hooks/useMatchSubmission.ts`
  - Finalized match now uses live wizard/session values (kills/POIs/damage/notes/roster) merged with pending telemetry draft data.

- Corpus mode reliability and packaged eval support:
  - `electron/main.cjs`
  - `package.json`
  - `src/components/DevOCRPanel.tsx`
  - Added robust script resolution paths for packaged corpus scripts, recursive image listing, import parse fallback, immediate image refresh after import/load, MIME-aware image previews, clearer workflow copy, and 4-team plain-entry support.

- Telemetry loadout auto-select hardening:
  - `src/hooks/useLogMonitor.ts`
  - Added payload-level loadout fallback, normalized hero parsing, broader weapon/equipment extraction keys, and preservation of existing loadout slots when events are partial.

## What Was Verified
- Touched-file eslint passed.
- Typecheck passed.
- Targeted `useMatchSubmission` vitest suite passed.
- Manual behavior checks performed for core UX/runtime paths listed in validation.

## Remaining / Risks
- Match-merge heuristics are conservative and designed for split/duplicate match records; users can still produce semantically odd merges if intentionally combining unrelated matches.
- Corpus plain-entry now supports 4 opponent teams with up to 4 players each by UI guidance, but free-text input still allows malformed names until saved/validated.

---

## Handoff - 2026-02-16 - BUG-BATCH-006
## Status
- Completed.

## What Changed
- Smart Capture reliability channel:
  - `src/providers/UIStateProvider.tsx`
  - `src/components/Header.tsx`
  - `src/components/Wizard.tsx`
  - `src/components/recording/ActionPanel.tsx`
  - Added durable UI-state request/consume path for smart capture requests; kept event dispatch compatibility.

- Intelligence Review routing:
  - `src/App.tsx`
  - Mounted `ReviewQueueModal` so recording-panel "Intelligence Review Required" opens the actual review queue.

- Ongoing telemetry draft semantics:
  - `src/types.ts`
  - `src/hooks/useLogMonitor.ts`
  - `src/store/useAppStore.ts`
  - Telemetry draft matches now use `result: 'Ongoing'`; hydration upgrades old telemetry drafts from `Draw` to `Ongoing`.

- Win placement fallback:
  - `src/hooks/useMatchSubmission.ts`
  - `src/components/SmartCapturesPanel.tsx`
  - Win submissions now default to placement `1` when empty; Smart Captures detail now displays `#1` for wins missing explicit placement.

- Players-tab pending roster approvals:
  - `src/components/PlayerHub.tsx`
  - Added pending OCR roster-candidate approval/dismiss UI in Players tab.

- Teammate cap + telemetry ownership hardening:
  - `src/store/slices/createFormSlice.ts`
  - `src/components/SmartCapturesPanel.tsx`
  - `src/hooks/useLogMonitor.ts`
  - Unknown-ship teammate cap now safely falls back to 4-player behavior, and loadout auto-apply ignores non-local telemetry actor events.

- Analytics exclusion for ongoing matches:
  - `src/components/analytics/useAnalyticsData.ts`
  - `src/utils/analytics.ts`
  - `src/utils/analyticsSocial.ts`
  - Ongoing matches are excluded from completed-result KPIs and rollups.

## What Was Verified
- Typecheck passed.
- Touched-file eslint passed.
- Targeted regression suites passed:
  - 10 files / 105 tests.
  - Additional 3 files / 23 tests for adjacent smart-capture + telemetry + IPC paths.

## Remaining / Risks
- Loadout ownership gating depends on telemetry actor identifiers/names; if upstream payloads omit both actor ID and actor name, fallback may still accept ambiguous loadout payloads.
- Historical analytics now excludes ongoing matches, but old exported reports generated before this patch will still contain legacy calculations.

---

## Handoff - 2026-02-16 - SMOKE-PERF-CONSENSUS-001
## Status
- Completed.

## What Changed
- No runtime/product code changes in this task.
- Added diagnostic records in agent docs and validated smoke artifacts.

## What Was Verified
- Smoke run completed and generated `.visual/report.md`.
- Telemetry performance-profile path is wired end-to-end (`Settings` -> `useLogMonitor` -> `electron/main.cjs`).
- Overheating consensus is evidence-based:
  - Primary contributor is telemetry monitor decode cadence in `high-accuracy` mode.
  - `low-power` materially reduces poll/decode/write frequency.

## Remaining / Risks
- No direct thermal sensor telemetry is captured by the app, so consensus is based on runtime workload characteristics rather than hardware temperature logs.
- If users stay in `high-accuracy` with continuous live telemetry updates, elevated CPU/IO and heat risk remains expected.

---

## Handoff - 2026-02-16 - THERMAL-FIX-001
## Status
- Completed.

## What Changed
- `src/utils/storage.ts`
  - Added dirty-state version tracking and gated failsafe interval flush so writes happen only when unsaved data exists.
  - `flush()` now no-ops (and resolves pending save promises) when current state is already persisted.

- `electron/main.cjs`
  - Corrected telemetry source path preference in log monitor startup:
    - `Wildgate` path first,
    - `Nebula` fallback.

- `electron/helpers/telemetryArchiveHelpers.cjs`
  - Added per-archive in-memory state cache (event list + signature set).
  - Skips archive write when no new deduped events were added in that tick.
  - Cache invalidation wired into archive cleanup/clear paths.

## What Was Verified
- `npm run -s typecheck` passed.
- `npx eslint src/utils/storage.ts electron/main.cjs electron/helpers/telemetryArchiveHelpers.cjs` passed.
- Manual code-path verification confirms dirty-only persistence and reduced no-op archive write behavior.

## Remaining / Risks
- Archive state cache is process-local; if archive files are externally modified while app is running, cache may lag until next restart/clear path.
- This patch reduces write churn and parse overhead, but it does not add hardware thermal telemetry; OS/GPU drivers and other apps can still contribute to overheating.

---

## Handoff - 2026-02-16 - OCR-ALIAS-CLEANUP-001
## Status
- Completed.

## What Changed
- `src/store/slices/createMappingSlice.ts`
  - Added `removeOcrAliasCorrection(ocrText, correctedTo)` to explicitly remove a learned alias mapping.
  - Removal clears both alias-model entry and legacy `ocrCorrections` mirror keys for that pair.

- `src/components/SettingsModal.tsx`
  - Added `Remove` action per learned alias row in Identity -> Alias & authority.
  - Added suspicious-manual-alias guard: very low-similarity alias pairs require a second click to confirm add.

- `src/store/slices/__tests__/createMappingSlice.test.ts`
  - Added regression test ensuring alias removal clears model + legacy correction entries.

## What Was Verified
- `npx eslint src/store/slices/createMappingSlice.ts src/components/SettingsModal.tsx src/store/slices/__tests__/createMappingSlice.test.ts` passed.
- `npx vitest run src/store/slices/__tests__/createMappingSlice.test.ts` passed (`33/33` tests).
- `npm run -s typecheck` passed.

## Remaining / Risks
- Similarity-based warning threshold is intentionally conservative; some unusual but valid aliases may require the second confirmation click.
- This patch does not auto-clean existing bad aliases in bulk; cleanup is manual via per-row remove.

---

## Handoff - 2026-02-16 - OCR-CORRECTION-POPUP-CLARITY-001
## Status
- Completed.

## What Changed
- `src/components/ocr/OCRReviewModal.tsx`
  - Updated review modal wording to emphasize correction workflow purpose.
  - Added a dedicated helper banner that explains:
    - editing names improves future OCR,
    - what roster badges mean (`Roster`, `~ Name`, `+ Roster`).
  - Clarified action labels:
    - `Apply Best Guess` -> `Quick Apply (High Confidence)`,
    - `Apply Data` -> `Apply and Learn`.
  - Added clearer tooltips for apply actions.

- `src/components/SmartCapturesPanel.tsx`
  - Updated review-entry CTA labels to be correction-oriented:
    - `Finalize` -> `Correct`,
    - `Finalize Entry` -> `Review and Correct Names`.
  - Added tooltips to indicate this opens the OCR correction popup.

## What Was Verified
- `npx eslint src/components/ocr/OCRReviewModal.tsx src/components/SmartCapturesPanel.tsx` passed.
- `npm run -s typecheck` passed.

## Remaining / Risks
- This patch improves clarity/copy only; it does not alter OCR extraction quality or correction persistence logic.

---

## Handoff - 2026-02-16 - OCR-CORRECTION-DELETE-002
## Status
- Completed.

## What Changed
- `src/components/SmartCapturesPanel.tsx`
  - Added explicit Smart Captures delete controls:
    - `Delete` for selected matches in Bulk Actions.
    - `Delete` action in per-match detail bar.
  - Both delete paths are confirm-gated and clean up selection/focus state.

- `src/components/ocr/OCRReviewModal.tsx`
  - Added first-time tutorial helper (dismissable, persisted).
  - Added per-name match reasoning hints under editable name fields.
  - Added "Name changes in this review" panel with per-item `Undo` and `Undo All`.

- `src/components/OcrCorrectionModal.tsx`
  - Clarified correction helper language and learning intent.
  - Updated action labels to be more explicit (`Auto Fill Confident`, `Apply and Learn`, `Close for Now`).

## What Was Verified
- `npx eslint src/components/SmartCapturesPanel.tsx src/components/ocr/OCRReviewModal.tsx src/components/OcrCorrectionModal.tsx` passed.
- `npm run -s typecheck` passed.

## Remaining / Risks
- Delete flow is immediate after confirmation and does not include a trash bin/recovery feature.
- First-time tutorial visibility uses local storage; clearing app storage will show it again.

---

## Handoff - 2026-02-16 - IQR-PLAYERNAME-001
## Status
- Completed.

## What Changed
- `src/components/ReviewQueueModal.tsx`
  - Added normalized name helper flow for session updates/removals.
  - `player_name` confirm now adds the detected name to roster and clears the pending review.
  - `player_name`/`roster_candidate` edit-save now updates session references and selected teammate/opponent lists with dedupe, then adds edited value to roster.
  - `player_name`/`roster_candidate` delete now removes linked names across session teams + selected lists consistently.

- `src/components/ReviewQueueModal.test.tsx`
  - Added targeted regression tests for:
    - `player_name` confirm behavior,
    - `player_name` edit-save reference updates + roster add,
    - `player_name` delete reference cleanup,
    - `roster_candidate` confirm regression.

## What Was Verified
- `npx vitest run src/components/ReviewQueueModal.test.tsx` passed (`4/4` tests).
- `npx eslint src/components/ReviewQueueModal.tsx src/components/ReviewQueueModal.test.tsx` passed.
- `npm run -s typecheck` passed.

## Remaining / Risks
- This pass intentionally did not change post-match OCR auto-start flow, OCR dedupe limits, or team-color assignment heuristics; those remain for subsequent one-at-a-time tasks.

---

## Handoff - 2026-02-16 - POSTMATCH-OCR-GATE-002
## Status
- Completed.

## What Changed
- `src/components/recording/ActionPanel.tsx`
  - Removed automatic OCR processing from result-button submission path.
  - Added blocking OCR decision prompt when queued captures exist and no merged OCR data is ready.
  - Added explicit flows:
    - `Continue Without OCR` -> open wizard immediately.
    - `Process OCR and Review` -> run OCR only after click, then open OCR review gate.
    - `Cancel` -> stay on recording panel.
  - Added fallback behavior when OCR processing yields no review data (warning toast + wizard continue).

- `src/components/recording/ActionPanel.test.tsx`
  - Added regression tests verifying:
    - no auto `processAllStored(...)` on result click,
    - continue-without-OCR wizard path,
    - explicit OCR-process path dispatches `submission:ocr-gate`.

## What Was Verified
- `npx vitest run src/components/recording/ActionPanel.test.tsx` passed (`12/12` tests).
- `npx eslint src/components/recording/ActionPanel.tsx src/components/recording/ActionPanel.test.tsx` passed.
- `npm run -s typecheck` passed.

## Remaining / Risks
- This patch gates OCR start at result submission time; telemetry post-match prompt UX in `App.tsx` is unchanged and can be refined separately if you want the same explicit wording there.

---

## Handoff - 2026-02-16 - POSTMATCH-TELEMETRY-PROMPT-003
## Status
- Completed.

## What Changed
- `src/App.tsx`
  - Telemetry post-match result actions now always route through Recording's `submission:open-result` event flow.
  - Added view-switch handoff for non-recording tabs:
    - stores selected result,
    - switches to Recording,
    - dispatches result event once Recording is active.
  - Updated post-match telemetry prompt copy to explicitly state OCR is manual (no auto-start).
  - Updated success toast wording to reflect explicit result/OCR confirmation flow in Recording.

## What Was Verified
- `npx eslint src/App.tsx` passed.
- `npm run -s typecheck` passed.
- Manual code-path checks confirm non-recording telemetry result path no longer bypasses Recording OCR gate behavior.

## Remaining / Risks
- This is a routing/copy alignment pass, not a full telemetry prompt redesign.
- If desired, a future pass can add a larger guided match-end modal with richer state transitions.

---

## Handoff - 2026-02-16 - OCR-TEAM-CAP-GUARD-004
## Status
- Completed.

## What Changed
- `src/store/slices/createFormSlice.ts`
  - Added centralized `sanitizeTeammates(...)` normalization:
    - trims names,
    - dedupes case-insensitively,
    - caps to ship capacity (`crew - 1`, with unknown-ship safe fallback).
  - Routed `setSelectedTeammates` through sanitizer so OCR/session bulk updates cannot over-register teammates.
  - Updated `toggleTeammate` to use case-insensitive duplicate handling and shared sanitizer path.
  - Updated `setActiveShip` trim logic to reuse the same sanitizer for consistency.

- `src/store/slices/__tests__/createFormSlice.test.ts`
  - Added regression tests for:
    - case-insensitive dedupe + cap in `setSelectedTeammates`.
    - updater-style OCR append overflow prevention.

## What Was Verified
- `npx vitest run src/store/slices/__tests__/createFormSlice.test.ts` passed (`19/19` tests).
- `npx eslint src/store/slices/createFormSlice.ts src/store/slices/__tests__/createFormSlice.test.ts` passed.
- `npm run -s typecheck` passed.

## Remaining / Risks
- This fix guards teammate registration only; opponent-team color assignment quality remains a separate issue.

---

## Handoff - 2026-02-16 - REMAINING-UX-TELEMETRY-005
## Status
- Completed.

## What Changed
- `src/hooks/useLogMonitor.ts`
  - Telemetry loadout apply now covers both `weapons` and `equipment`.
  - Maintains safer transition behavior for previous telemetry loadout slots.

- `src/components/recording/ActionPanel.tsx`
  - Telemetry `Weapons` and `Equipment` rows now include explicit `(auto)` labels.

- `src/components/Wizard.tsx`
  - Added manual `Ship Loadout` inputs:
    - `Weapon 1`, `Weapon 2`
    - `Equipment 1`, `Equipment 2`
  - Inputs persist into `pendingMatchData.loadout` for final submission.

- `src/App.tsx`
  - OCR apply now normalizes opponent team colors and assigns fallback distinct colors when incoming color is unknown/duplicate.
  - Opponent player mapping now dedupes names and suppresses duplicate cross-team fanout before session/pending-match write.

- `src/store/slices/createFormSlice.ts`
  - Added case-insensitive dedupe normalization for opponents in `setSelectedOpponents` and `toggleOpponent`.

- `src/store/slices/__tests__/createFormSlice.test.ts`
  - Added opponent dedupe regression coverage.

- `src/components/recording/ActionPanel.test.tsx`
  - Added telemetry auto-label regression assertion.

## What Was Verified
- `npx vitest run src/components/recording/ActionPanel.test.tsx src/store/slices/__tests__/createFormSlice.test.ts` passed (`33/33` tests).
- `npx eslint` passed for all touched files in this task.
- `npm run -s typecheck` passed.

## Remaining / Risks
- Team-color fallback chooses first unused canonical color when OCR color is missing/duplicated; if OCR emits many ambiguous teams, color semantics may still require manual adjustment.
- Wizard manual loadout inputs are free-text by design in this pass (no strict dropdown validation).

---

## Handoff - 2026-02-17 - AUDIT-REMEDIATION-001
## Status
- Completed.

## What Changed
- `src/utils/artifactService.ts`
  - Hardened IPC unwrap path and introduced typed OCR rerun result contract (`RerunOcrResult`).
  - `rerunOCROnArtifact(...)` now returns stable `success/data/error` shape, including legacy payload normalization.
  - Maintains canonical telemetry archive output shape (`TelemetryArchiveEvent[][]`).

- `src/components/DashboardLayout.tsx`
  - Removed stale drag/resize prop assumptions and aligned with `react-grid-layout` v2 (`dragConfig` + `resizeConfig`).
  - Width-provider typing corrected so dashboard consumers do not require explicit `width`.

- `src/components/SimulatorPanel.tsx`
  - Replaced unsafe timestamp arithmetic with normalized numeric timestamp helper usage.

- `src/components/SmartCapturesPanel.tsx`
  - Added typed OCR rerun result envelope and safe successful-result narrowing before OCR merge path access.
  - Telemetry event timestamp rendering now guards undefined/invalid values.

- `src/utils/storage.ts`
  - Removed strict-cast compile blockers at persistence boundaries.
  - Tightened local migration typing so UID mapping structures are guaranteed during one-time migration/seed merge flow.
  - Fixed interval handle typing mismatch in renderer environment.

- `src/utils/__tests__/artifactService.test.ts`
  - Updated telemetry assertion to the canonical nested telemetry archive shape.

## What Was Verified
- `npm run -s typecheck` passed.
- `npx eslint src/components/DashboardLayout.tsx src/components/SimulatorPanel.tsx src/components/SmartCapturesPanel.tsx src/utils/artifactService.ts src/utils/storage.ts src/utils/__tests__/artifactService.test.ts` passed.
- `npm run -s test` passed (`32` files, `392` tests).
- `npm run -s build` passed.

## Remaining / Risks
- This pass intentionally hardens high-risk boundaries only; it does not remove all `any` usage repo-wide.
- Canonical telemetry normalization is now centralized, but any future new telemetry consumers must use `src/utils/telemetryArchive.ts` to preserve consistency.

---

## Handoff - 2026-02-17 - AUDIT-REMEDIATION-002
## Status
- Completed.

## What Changed
- `src/hooks/useSmartCapture.ts`
  - Replaced smart-scan and OCR rerun path `any` usage with `SmartScanResult`, `LobbyScanResult`, and typed OCR rerun result envelopes.
  - Removed cast-heavy player/team inference logic and added explicit data narrowing in batch OCR merge paths.

- `src/components/SmartCapturesPanel.tsx`
  - Removed explicit `any` usage in bulk/per-match OCR rerun merge logic.
  - Added typed mode guards for OCR/capture mode selectors.
  - Replaced `jsonExport.payload: any` with `unknown`.
  - Removed explicit `any` annotations in timeline sort and review display mappings.

- `src/components/recording/ActionPanel.tsx`
  - Tightened callback payload typing (`onSmartCaptureData: OCRExtractedData`).
  - Replaced cast-based store snapshot access with typed optional `getState` fallback compatible with tests/runtime.

- `src/components/ReviewQueueModal.tsx`
  - Introduced typed review-item union for pending/unknown/learning queue entries.
  - Replaced all `review: any` handlers and suggestion mappings with union guards and typed maps.

- `src/providers/GameDataProvider.tsx`
  - Replaced context `timelineEvents` and `pendingReviews` `any` signatures with `TimelineEvent[]` and `PendingReview[]`.

- `src/store/slices/createFormSlice.ts`
  - Replaced `pendingMatchData: any` with `Partial<Match> | null`.

## What Was Verified
- `npx eslint src/hooks/useSmartCapture.ts src/components/SmartCapturesPanel.tsx src/components/recording/ActionPanel.tsx src/components/ReviewQueueModal.tsx src/providers/GameDataProvider.tsx src/store/slices/createFormSlice.ts` passed.
- `npm run -s typecheck` passed.
- `npx vitest run src/components/recording/ActionPanel.test.tsx` passed (`13/13`).
- `npm run -s test` passed (`32` files, `392` tests).
- `npm run -s build` passed.

## Remaining / Risks
- This pass intentionally avoided analytics/dev-only typing refactors to keep scope tight.
- Additional repo-wide `any` reduction is still available as a future pass if desired.

---

## Handoff - 2026-02-17 - AUDIT-REMEDIATION-003
## Status
- Completed.

## What Changed
- `src/hooks/useLogMonitor.ts`
  - Removed explicit runtime `any` usage in telemetry status/event/loadout processing paths.
  - Added typed helpers for event payload/context extraction and safe record narrowing.
  - Preserved existing local-player loadout auto-apply behavior while hardening nested payload reads.

- `src/App.tsx`
  - Removed explicit runtime `any` usage in lazy module typing, idle callback access, telemetry retention status normalization, and prune error handling.
  - Added typed guards/coercion for telemetry retention and prune IPC payloads.

- `src/store/slices/createUISlice.ts`
  - Added exported `TelemetryStatusState` interface.
  - Replaced `setTelemetryStatus(status: any)` with `setTelemetryStatus(status: Partial<TelemetryStatusState>)`.

- `src/providers/UIStateProvider.tsx`
  - Updated context telemetry status and setter signatures to use `TelemetryStatusState`.

## What Was Verified
- `npx eslint src/hooks/useLogMonitor.ts src/App.tsx src/store/slices/createUISlice.ts src/providers/UIStateProvider.tsx` passed.
- `npm run -s typecheck` passed.
- `npx vitest run src/components/recording/ActionPanel.test.tsx src/components/ReviewQueueModal.test.tsx` passed (`17/17`).
- `npm run -s test` passed (`32` files, `392` tests).
- `npm run -s build` passed.
- `rg -n "\\bany\\b|as any" src/hooks/useLogMonitor.ts src/App.tsx` returned no matches.

## Remaining / Risks
- `createUISlice`/`UIStateProvider` still include layout-related `any` typing that was intentionally out of scope for this telemetry-focused pass.
- Additional runtime typing hardening remains possible in `useAppStore.ts` and other non-telemetry modules if a wider pass is approved.

---

## Handoff - 2026-02-17 - AUDIT-REMEDIATION-004
## Status
- Completed.

## What Changed
- Deterministic opponent team color assignment:
  - Added shared helper and tests:
    - src/utils/ocr/teamColorAssignment.ts
    - src/utils/ocr/__tests__/teamColorAssignment.test.ts
  - Integrated deterministic assignment into OCR apply flows:
    - src/App.tsx
    - src/components/SmartCapturesPanel.tsx
  - Result:
    - stable deterministic fallback colors,
    - player-color hint anchoring from prior team context,
    - reduced cross-team color drift between App and Smart Captures apply flows.

- Optional background OCR-after-result mode:
  - Added persisted setting:
    - src/store/slices/createSettingsSlice.ts
    - src/store/useAppStore.ts
  - Added settings UI control:
    - src/components/SettingsModal.tsx (Result Button OCR Flow).
  - Updated runtime result flow:
    - src/components/recording/ActionPanel.tsx
    - prompt: existing blocking OCR decision prompt.
    - background: open wizard immediately, process queued OCR in background, and surface review data when ready.
  - Added regression test:
    - src/components/recording/ActionPanel.test.tsx.

## What Was Verified
- Focused tests passed:
  - src/components/recording/ActionPanel.test.tsx
  - src/utils/ocr/__tests__/teamColorAssignment.test.ts
- Typecheck passed:
  - npm run -s typecheck
- Touched-file lint passed.
- Full gates passed:
  - npm run -s test (33 files, 397 tests)
  - npm run -s build

## Remaining / Risks
- Deterministic fallback assignment is stable and hint-aware, but still depends on OCR extraction quality when no prior hint context exists.
- Background OCR mode intentionally does not block wizard entry; users who prefer explicit gating should keep prompt mode (default).

---

## Handoff - 2026-02-17 - IQR-NAME-SOURCE-001
## Status
- Completed.

## What Changed
- `src/store/slices/createDataSlice.ts`
  - Added `PendingReviewSource` and optional `PendingReview.sourceCapture` for provenance metadata.

- `src/utils/scan/imageUtils.ts`
  - `captureScreen()` now returns optional `debugPath` (saved OCR debug screenshot absolute path) with capture payload.

- `src/hooks/useSmartScan.ts`
  - Low-confidence `player_name` queue items now include `sourceCapture` metadata (`screenshotPath`, `screenshotLabel`, `capturedAt`) and explicit OCR source tagging.

- `src/components/ReviewQueueModal.tsx`
  - Added source context display on review items when provenance exists.
  - Added `View Source` action to open the original capture screenshot in a modal preview.

- `src/components/ReviewQueueModal.test.tsx`
  - Added regression test for source context and source preview flow.

## What Was Verified
- `npx vitest run src/components/ReviewQueueModal.test.tsx` passed (`5/5` tests).
- Touched-file lint passed.
- `npm run -s typecheck` passed.

## Remaining / Risks
- Existing pre-change queue entries will not have source metadata; those continue to show normal review actions without source preview.
- Current provenance links to whole-capture screenshots, not per-name cropped regions.

---

## Handoff - 2026-02-17 - RESULT-HOOK-CRASH-310-001
## Status
- Completed.

## What Changed
- `src/components/Wizard.tsx`
  - Fixed hook-order crash by moving `loadoutDraft` `useMemo` above the `showWizard/pendingMatchData` early return.
  - Updated memo input to null-safe access (`pendingMatchData?.loadout`) so the hook can run consistently when the wizard is closed.

- `src/components/Wizard.test.tsx`
  - Added regression test confirming closed -> open wizard transition does not throw.
  - Test specifically covers the result-button activation path that previously produced React `#310`.

## What Was Verified
- `npx vitest run src/components/Wizard.test.tsx src/components/recording/ActionPanel.test.tsx` passed (`15/15` tests).
- `npx eslint src/components/Wizard.tsx src/components/Wizard.test.tsx` passed.
- `npm run -s typecheck` passed.

## Remaining / Risks
- Full `npm run -s test` / `npm run -s build` were not re-run in this narrow crash fix pass.
- Existing unrelated dirty worktree changes remain untouched.

---

## Handoff - 2026-02-17 - WIZARD-HOOK-AUDIT-002
## Status
- Completed.

## What Changed
- `src/components/OcrCorrectionModal.test.tsx`
  - Added focused regression coverage for wizard-style modal stability:
    - verifies closed -> open transition does not throw,
    - verifies ignore/undo-ignore action flow remains stable.

- Wizard/modal audit outcome
  - Performed component-level hook-order audit (AST-based) across `src/components`.
  - No additional hook-after-return guard violations found after the `Wizard` fix.

## What Was Verified
- `npx eslint src/components/OcrCorrectionModal.test.tsx src/components/Wizard.tsx src/components/Wizard.test.tsx` passed.
- `npm run -s typecheck` passed.
- `npx vitest run src/components/OcrCorrectionModal.test.tsx src/components/Wizard.test.tsx src/components/recording/ActionPanel.test.tsx` passed (`17/17` tests).

## Remaining / Risks
- Full `npm run -s test` / `npm run -s build` were not re-run for this focused hardening pass.
- Audit/test coverage is focused on wizard/modal hook-order and transition stability, not broad UI runtime behavior.

---

## Handoff - 2026-02-17 - OCR-TEAM-CAP-HARDEN-006
## Status
- Completed.

## What Changed
- Added shared teammate-cap utility:
  - `src/utils/teamLimits.ts`
  - `src/utils/__tests__/teamLimits.test.ts`
  - Provides ship-aware teammate cap (`fallback max teammates = 3`) with dedupe for names and OCR teammate objects.

- Unified cap enforcement in form + OCR/wizard/session/submission paths:
  - `src/store/slices/createFormSlice.ts`: central teammate sanitizer now uses shared utility.
  - `src/hooks/useSmartCapture.ts`: capped teammates during canonicalization, merged pending data, and merged OCR summaries.
  - `src/App.tsx`: OCR apply now caps teammates before session write and reports capped/applied count.
  - `src/components/SmartCapturesPanel.tsx`: capped rerun/apply teammate writes and replaced local teammate slicing with shared utility.
  - `src/hooks/useMatchSubmission.ts`: capped teammate lists both when creating pending match data and during final submission.

## What Was Verified
- `npx vitest run src/utils/__tests__/teamLimits.test.ts src/store/slices/__tests__/createFormSlice.test.ts src/hooks/__tests__/useMatchSubmission.test.ts src/hooks/__tests__/useSmartCapture.test.ts` passed (`39/39` tests).
- Touched-file lint passed.
- `npm run -s typecheck` passed.

## Remaining / Risks
- This pass intentionally targets teammate-cap integrity only; it does not retune teammate-vs-opponent OCR classification quality.
- Existing historical matches with oversized teammate arrays remain unchanged unless edited/reprocessed.

---

## Handoff - 2026-02-17 - REFACTOR-CLOSEOUT-007
## Status
- Completed.

## What Changed
- Performed integrated closeout of the unfinished giant refactor:
  - audited the combined dirty refactor state across OCR/wizard/review/data lanes,
  - executed full release-quality gates against the integrated state,
  - finalized closeout workflow artifacts and lock records.

- No additional code patches were required during this closeout pass because integrated gates were already green.

## What Was Verified
- `npm run -s ci:quality` passed end-to-end:
  - lint: PASS
  - test: PASS (36 files, 405 tests)
  - typecheck: PASS
  - build: PASS

## Remaining / Risks
- This closeout validates the current integrated working tree state; it does not include packaging/publishing.
- Existing unrelated in-progress/staged work outside this closure scope was intentionally not reverted.

---

## Handoff - 2026-02-17 - AUDIT-REMEDIATION-005
## Status
- Completed.

## What Changed
- `src/utils/electronBridge.ts`
  - Removed runtime `any` usage from catch handlers and bridge signatures.
  - Typed OCR merge payload input (`existingData`) and tightened GCloud OCR response handling.
  - Replaced direct `console.error` paths with structured logger reporting.

- `src/utils/logger.ts`
  - Replaced `any` with `unknown` in log payload signatures.
  - Added production-aware console suppression while preserving debug output in non-production/forced-debug mode.
  - Removed `window as any` access for app-version capture.

- `src/utils/storage.ts`
  - Replaced direct `console.*` with `Logger`.
  - Added one-time legacy migration-check marker (`wg_v13_migration_checked_v1`) to reduce repeated startup legacy checks.
  - Preserved existing migration/backup behavior.

- `src/App.tsx`
  - Replaced OCR resolution debug `console.log` statements with `Logger.debug`.

- `src/components/DevOCRPanel.tsx`
  - Removed remaining `any` from state/catch/parsing paths in this file.
  - Switched direct console logging to structured logger usage.

- `electron/helpers/artifactHelpers.cjs`
  - Replaced ad-hoc telemetry archive shape parsing with shared `normalizeEvents()` helper.

- `electron/helpers/telemetryArchiveHelpers.cjs`
  - Exported `normalizeEvents()` for helper reuse.
  - Gated info-level helper console output in production.

- `docs/TELEMETRY_PIPELINE.md`
  - Updated pipeline documentation to require canonical archive normalizers rather than ad-hoc defensive shape checks.

- `TODO.md`
  - Reclassified `ocr-debug/` maintenance note as an intentional compatibility path (no deferred cleanup marker).

## What Was Verified
- Touched-file lint passed.
- `npm run -s typecheck` passed.
- `npm run -s ci:quality` passed (36 files, 405 tests, typecheck, build, lint).
- Targeted grep checks confirmed:
  - no `@ts-ignore` in `src/components/DashboardLayout.tsx`,
  - no direct `console.*` in requested runtime files,
  - no ad-hoc telemetry archive shape check in patched helper/docs paths.

## Remaining / Risks
- This pass intentionally targets the listed audit issues only; broader repo-wide `any` removal remains available as future work.
- Electron helper error logs still emit on failure paths by design.

---

## Handoff - 2026-02-17 - MODERATE-REMEDIATION-006
## Status
- Completed.

## What Changed
- Added env-backed frontend runtime config:
  - `src/config/runtimeConfig.ts`
  - `src/vite-env.d.ts`
  - Wired values into:
    - `src/App.tsx` (preload idle/fallback/progress timing)
    - `src/utils/storage.ts` (save debounce + flush interval)
    - `src/hooks/useSmartCapture.ts` (auto OCR bundle delay + capture throttle)
    - `src/components/Toast.tsx` (default toast duration)

- Improved error handling (removed silent failures in targeted paths):
  - `src/App.tsx`: preload and telemetry retention invoke failures now log warnings.
  - `src/components/MatchRecordingPage.tsx`: artifact-load failures now log warnings.
  - `src/components/SmartCapturesPanel.tsx`: artifact-load failures now log warnings.
  - `src/components/ocr/OCRReviewModal.tsx`: corpus auto-ingest invoke failures now log warnings (non-blocking).
  - `src/utils/logger.ts`: logger persistence failures are no longer silently swallowed.

- Accessibility update:
  - `src/components/Toast.tsx`:
    - added `role` + `aria-live` + `aria-atomic` for screen-reader announcement.
    - added `aria-label` for icon-only dismiss button.

- Test coverage added/expanded:
  - `src/utils/__tests__/storage.test.ts`
  - `src/hooks/__tests__/useLogMonitor.test.ts`
  - `src/hooks/__tests__/useSmartCapture.test.ts` (expanded)
  - `src/App.test.tsx`

## What Was Verified
- Focused vitest targets passed (`14/14`).
- Full `npm run -s test` passed (`415/415`).
- `npm run -s typecheck` passed.
- `npm run -s lint` passed.
- `npm run -s build` passed.

## Remaining / Risks
- This pass addressed the reported moderate issues directly; it does not attempt a full repo-wide accessibility label sweep across all components.
- Low-priority architectural/performance items (hook splitting, preload algorithm optimization) remain intentionally out of scope.

---

## Handoff - 2026-02-17 - FOLLOWUP-REMEDIATION-008
## Status
- Completed.

## What Changed
- Safer default for auto-backup:
  - `src/store/slices/createSettingsSlice.ts`: `enableAutoBackup` default is now `false`.
  - `src/store/useAppStore.ts`: hydration fallback now uses `settings.autoBackup ?? false`.
  - `src/utils/storage.ts`: runtime backup fallback now uses `data.settings?.autoBackup ?? false`.

- Additional env-backed frontend configuration:
  - `src/config/runtimeConfig.ts`: added runtime keys for Discord presence poll, SystemPulse polling/receiving window, History search debounce/refresh timer, and ActionPanel pulse/ripple timers.
  - `src/vite-env.d.ts`: added typed env key declarations for all runtime-config keys.
  - Wired into:
    - `src/hooks/useDiscordRPC.ts`
    - `src/components/SystemPulse.tsx`
    - `src/components/HistoryTable.tsx`
    - `src/components/recording/ActionPanel.tsx`

- Accessibility labels for icon-only controls in primary flows:
  - Added `aria-label` coverage in:
    - `src/components/DrillDownOverlay.tsx`
    - `src/components/analytics/AnalyticsShell.tsx`
    - `src/components/PlayerHub.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `src/components/recording/RosterPanel.tsx`
    - `src/components/SessionTimer.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/components/recording/MissionPanel.tsx`
    - `src/components/WindowFrame.tsx`
    - `src/components/smart-captures/SmartCaptureWidgets.tsx`
    - `src/components/EditMatchModal.tsx`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/components/IdMapper.tsx`
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/components/Wizard.tsx`
    - `src/components/recording/ActionPanel.tsx`

- Emergency reset confirmation hardening:
  - `src/components/ErrorBoundary.tsx`: now uses explicit `window.confirm` flow with clearer warning copy before cache clear/reload.

## What Was Verified
- Touched-file eslint command passed.
- `npm run -s typecheck` passed.
- `npm run -s test` passed (`415/415`).
- `npm run -s lint` passed.
- `npm run -s build` passed.
- Targeted grep verification confirmed no remaining default-`true` auto-backup fallbacks in patched paths.
- Regex scan verified no unlabeled `md3-icon-btn` controls remain in `src/components`.

## Remaining / Risks
- This pass addresses core icon-only control labeling and key default/config gaps, not a full exhaustive accessibility audit of all non-icon interactive semantics.
- Existing persisted user settings are respected; only fresh/default fallback behavior changed for auto-backup.

---

## Handoff - 2026-02-17 - CORPUS-IMPORT-DIR-009
## Status
- Completed.

## What Changed
- `electron/main.cjs`
  - Updated `ocr-corpus-import-images` so the file picker opens in the corpus image storage directory:
    - ensures `ocr-corpus/images` exists before opening dialog,
    - sets `showOpenDialog(...).defaultPath` to that directory.
  - Preserved existing behavior for cancel/import, file filtering, and copy/dedupe flow.

## What Was Verified
- `npx eslint electron/main.cjs` passed.
- `npm run -s typecheck` passed.
- Targeted grep verification confirmed:
  - `defaultPath: corpusImagesDir` is set in `ocr-corpus-import-images`,
  - corpus images directory is ensured before dialog open.

## Remaining / Risks
- Behavior is specific to the import dialog entry point in corpus mode; no additional corpus UI actions were changed.

---

## Handoff - 2026-02-17 - OCR-DUAL-BUFFER-GATES-010
## Status
- Completed.

## What Changed
- Dual-buffer Crew Hub extraction (text vs color fidelity):
  - `electron/ocrHandler.cjs`
    - Crew Hub extraction calls now pass:
      - preprocessed/scaled OCR buffer for text recognition geometry,
      - original image buffer for color sampling.
  - `electron/crewHubExtractor.cjs`
    - `extractCrewHub` accepts optional `colorImageBuffer`,
    - right-panel badge color detection uses `colorImageBuffer` while text parsing stays on OCR words.

- Team/player caps at merge boundaries:
  - `electron/ocrMerger.cjs`
    - added cap helper and enforced max 4 players/team during merges.
  - `electron/ocrHandler.cjs`
    - `convertCrewHubToLegacy` now caps teammates and each opponent-team player list at 4 and limits opponent teams to 4.
  - `src/utils/ocr/ocrParser.ts`
    - frontend merge/validation now applies:
      - teammate cap via ship-aware utility,
      - max 4 players per opponent team,
      - max 4 opponent teams.

- Strict OCR auto-apply gates:
  - `src/App.tsx`
    - before roster writes:
      - rejects auto-apply for confidence < 55,
      - routes 55-74 confidence names to review queue (`player_name`),
      - routes low-similarity resolver rewrites (<70) to review queue,
      - enforces per-team opponent player cap at apply time.
    - roster-candidate queueing now derives from actually auto-applied names only.
  - `src/hooks/useSmartCapture.ts`
    - SmartScan auto-apply path now enforces the same low-confidence/ambiguous gating and queues review items.

- Regression tests:
  - `src/utils/ocr/__tests__/ocrParser.test.ts`
    - added tests for teammate cap and opponent per-team cap in merge flow.

## What Was Verified
- `eslint` on all touched OCR/apply files passed.
- `typecheck` passed.
- `vitest` targeted suites passed:
  - `src/utils/ocr/__tests__/ocrParser.test.ts` (56 tests),
  - `src/hooks/__tests__/useSmartCapture.test.ts` + `src/App.test.tsx` (8 tests).
- Targeted grep checks confirmed:
  - dual-buffer Crew Hub wiring is active,
  - strict gate/cap constants are present at intended boundaries.

## Remaining / Risks
- Thresholds (`55/75`, similarity `70`) are intentionally conservative defaults; they may need calibration using corpus-driven distributions.
- This pass preserves map/hazard extraction behavior; no dedicated hazard benchmark run was added beyond non-touch and compile/test safety checks.

---

## Handoff - 2026-02-17 - OCR-ROI-RUNTIME-011
## Status
- Completed.

## What Changed
- Persisted ROI model + store merge safety:
  - `src/store/slices/createSettingsSlice.ts`
    - added typed OCR region update model and retained reset/default support.
  - `src/store/useAppStore.ts`
    - hardened numeric ROI merge helper for shape-safe hydration.

- Settings ROI editor and persistence:
  - `src/components/SettingsModal.tsx`
    - added live-edit ROI controls (xMin/xMax/yMin/yMax %) for:
      - Crew Hub: left panel, right panel, team header,
      - Map Screen: your ship, enemy ships, hazards, players.
    - added `Reset ROI` action.
    - save payload now persists `ocrRegions` explicitly.

- Renderer callsite propagation (live OCR + reruns):
  - `src/components/SmartCapturesPanel.tsx`
    - detail rerun path now passes active `ocrRegions`,
    - detail component prop wiring now includes `ocrRegions`.
  - `src/components/HistoryTable.tsx`
    - bulk rerun uses active `ocrMode` + `ocrRegions`.
  - `src/hooks/useSmartCapture.ts`
    - smart analyze pre-pass now includes `ocrMode` + `ocrRegions`,
    - OCR and rerun calls continue using live `ocrRegions`.
  - `src/hooks/useSmartScan.ts`, `src/utils/scan/tesseractScan.ts`, `src/components/DevOCRPanel.tsx`
    - all now forward `ocrRegions` into OCR processing.

- Electron and extractor ROI runtime wiring:
  - `electron/main.cjs`
    - rerun IPC handler now accepts `ocrRegions` and forwards to `processCapture`.
  - `electron/ocrHandler.cjs`
    - accepts runtime ROI options,
    - sanitizes/clamps ROI values with safe defaults,
    - includes ROI fingerprint in OCR cache key so region changes invalidate cached results,
    - applies ROI overrides to Crew Hub and Map extractors and map-player region crop.
  - `electron/crewHubExtractor.cjs`
    - supports dynamic layout overrides for left/right panel parsing.
  - `electron/mapScreenExtractor.cjs`
    - supports dynamic layout overrides for ship/enemy/player regions,
    - hazards extraction now also scans configured hazards region text.

## What Was Verified
- `npx eslint` on all touched ROI files passed.
- `npx vitest run src/utils/__tests__/artifactService.test.ts` passed (`17/17`).
- `npx vitest run src/hooks/__tests__/useSmartCapture.test.ts` passed (`6/6`).
- `npm run -s typecheck` passed.
- Targeted `rg` verification confirmed ROI plumbing across settings, callsites, IPC handlers, cache keying, and extractor layout resolvers.

## Remaining / Risks
- ROI editor currently uses numeric percent fields (no drag-overlay visual editor); this is intentional per scope.
- Existing cached entries from prior app versions (without ROI fingerprint) are naturally bypassed on new runs because cache key format changed.

---

## Handoff - 2026-02-17 - OCR-CORPUS-ROI-012
## Status
- Completed.

## What Changed
- `src/components/DevOCRPanel.tsx`
  - Corpus pipeline invoke now sends live ROI settings:
    - `api.invoke('ocr-corpus-run-pipeline', { ocrMode, activeUser, ocrRegions })`.

- `electron/main.cjs`
  - `ocr-corpus-run-pipeline` now accepts optional ROI settings from `opts`:
    - reads `const ocrRegions = opts?.ocrRegions || null;`
    - forwards `ocrRegions` to `processCapture(...)` options for each sample run.

## What Was Verified
- `npx eslint src/components/DevOCRPanel.tsx electron/main.cjs` passed.
- `npm run -s typecheck` passed.
- Targeted grep verification confirms corpus invoke + Electron corpus handler both carry `ocrRegions`.

## Remaining / Risks
- Corpus pipeline uses ROI values provided by the current renderer session; headless/background corpus runs without renderer payload continue using defaults unless ROI is provided.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T1-013
## Status
- Completed.

## What Changed
- Tier 1 #1: OCR cache telemetry
  - `electron/ocrHandler.cjs`
    - Added cache stats counters (`hits`, `misses`, `evictions`, `totalRequests`) and running timing averages (`avgHitTimeMs`, `avgMissTimeMs`).
    - Cache lookups now record hits/misses; cache inserts record miss processing duration and eviction count.
    - Added IPC handler `get-ocr-cache-stats` returning hit-rate and size metrics.
  - `electron/preload.cjs`
    - Added `get-ocr-cache-stats` to renderer invoke allowlist.
  - `scripts/security_negative_tests.cjs`
    - Synced invoke allowlist fixture to include `get-ocr-cache-stats`.
  - `src/components/DevOCRPanel.tsx`
    - Added typed polling for cache telemetry every 5 seconds.
    - Added cache card showing hit rate (green above 40%), cache size, and avg hit/miss timings.

- Tier 1 #2: keyboard shortcuts for corrections
  - `src/hooks/useKeyboardShortcuts.ts`
    - Generalized hook to support reusable shortcut arrays while preserving existing legacy win/loss shortcut API used by `App.tsx`.
  - `src/components/OcrCorrectionModal.tsx`
    - Added modal shortcuts:
      - `Ctrl/Cmd+Enter` apply corrections,
      - `Esc` close modal,
      - `Ctrl/Cmd+A` auto-fill confident entries,
      - `Ctrl/Cmd+I` ignore next unresolved entry.
    - Added visible shortcut hint banner in modal footer area.

- Tier 1 #3: visual confidence bars
  - `src/components/ConfidenceMeter.tsx` (new)
    - Added accessible progress-style confidence meter with semantic color thresholds.
  - `src/components/OcrCorrectionModal.tsx`
    - Replaced per-player confidence percentage text badge with `ConfidenceMeter`.

- Tier 1 #4: learning feedback tooltips
  - `src/utils/ocrAliasEngine.ts`
    - Extended `OcrAliasEntry` with `learningMetadata` and kept correction-count metadata in sync on add/remove.
    - Added `getLearningMetadata(...)` helper.
  - `src/components/OcrCorrectionModal.tsx`
    - Replaced "Previously linked" badge with learned badge (`Learned (Nx)`) and metadata tooltip.

## What Was Verified
- `npx eslint ...` on touched files passed.
- `npx vitest run src/components/OcrCorrectionModal.test.tsx src/store/slices/__tests__/createMappingSlice.test.ts` passed (`35/35` tests).
- `node scripts/security_negative_tests.cjs` passed (`113/113`).
- `npm run -s typecheck` passed.

## Remaining / Risks
- Tier 2 and Tier 3 roadmap items are intentionally not part of this increment.
- `autoAppliedCount` is now modeled in alias metadata but current UI uses correction-count metadata only; auto-apply counter exposure can be layered in a follow-up increment when broader calibration/learning analytics work starts.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T2-014
## Status
- Completed.

## What Changed
- Tier 2 #5 benchmark instrumentation (additive only):
  - `electron/ocrHandler.cjs`
    - added reusable region-pixel resolver and crop-first preprocessing helper used by region OCR.
    - added benchmark helpers that simulate:
      - old path: preprocess full image then crop regions,
      - new path: crop each region first then preprocess each crop.
    - added `benchmarkRegionPreprocessing(...)` reporting:
      - `oldAvgMs`, `newAvgMs`,
      - `speedupPercent`, `speedupFactor`,
      - `regionCount`, `regions`, `iterations`, per-iteration timings.
    - added IPC handler `benchmark-ocr-preprocessing` (accepts `imageBase64` or `imagePath`, optional `iterations`, optional `ocrRegions`).

- IPC boundary + security parity:
  - `electron/preload.cjs`
    - added `benchmark-ocr-preprocessing` to invoke allowlist.
  - `scripts/security_negative_tests.cjs`
    - mirrored allowlist fixture update for security gate parity.

- Dev OCR tooling UI:
  - `src/components/DevOCRPanel.tsx`
    - added benchmark run action (`Benchmark Old vs Crop-First (10x)`) on OCR tab.
    - added benchmark summary panel with old/new avg timings, speedup %, factor, region count.
    - added benchmark response shape guard and state reset when loading a new image.

## What Was Verified
- `npx eslint electron/ocrHandler.cjs electron/preload.cjs src/components/DevOCRPanel.tsx scripts/security_negative_tests.cjs` passed.
- `node scripts/security_negative_tests.cjs` passed (`113/113`).
- `npm run -s typecheck` passed.
- Targeted grep confirmed benchmark handler/wiring in backend, preload allowlist, security fixture, and dev panel trigger/display.

## Remaining / Risks
- Benchmark currently measures preprocessing pipeline cost only (not OCR recognition time), which is intentional for isolating Tier 2 #5 preprocessing impact.
- Benchmark runs on-demand in Dev OCR tools and is not persisted as long-term telemetry yet.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T2-015
## Status
- Completed.

## What Changed
- Tier 2 #6 confidence calibration utility:
  - `src/utils/ocrCalibration.ts` (new)
    - defines `CalibrationSample` and `CalibrationBucket`.
    - normalizes OCR mode to `local | cloud | merged`.
    - provides sample sanitization and bounded append (max 1000).
    - computes bucket analysis for ranges: `0-20`, `20-40`, `40-60`, `60-80`, `80-100`.
    - recommends lowest threshold bucket meeting target accuracy (default 90%).

- Settings/store persistence wiring:
  - `src/store/slices/createSettingsSlice.ts`
    - adds `ocrCalibrationSamples` state.
    - adds `recordCalibrationSample(...)` and `clearOcrCalibrationSamples(...)`.
  - `src/store/useAppStore.ts`
    - hydrates calibration samples through sanitizer.
    - persists calibration samples in `settings`.
    - includes calibration samples in `partialize`.

- Correction workflow sample capture:
  - `src/components/OcrCorrectionModal.tsx`
    - records calibration sample entries for each applied/non-ignored correction with:
      - predicted confidence,
      - correctness outcome (`ocrName === correctedName` normalized),
      - normalized OCR mode,
      - field type (`player`),
      - timestamp.

- Dev OCR calibration visibility:
  - `src/components/DevOCRPanel.tsx`
    - reads `ocrCalibrationSamples` from store.
    - renders calibration card with bucket sample/accuracy table.
    - shows recommended threshold for 90% target.

- Focused tests:
  - `src/utils/__tests__/ocrCalibration.test.ts` (new)
    - verifies sample cap, bucket accuracy, threshold recommendation, and mode normalization.
  - `src/components/OcrCorrectionModal.test.tsx`
    - updated mock store shape to include new calibration fields.

## What Was Verified
- `npx eslint src/utils/ocrCalibration.ts src/utils/__tests__/ocrCalibration.test.ts src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/components/OcrCorrectionModal.tsx src/components/DevOCRPanel.tsx src/components/OcrCorrectionModal.test.tsx` passed.
- `npx vitest run src/utils/__tests__/ocrCalibration.test.ts src/components/OcrCorrectionModal.test.tsx` passed (`7/7` tests).
- `npm run -s typecheck` passed.
- Targeted grep verification confirms utility/store/modal/dev-panel calibration wiring.

## Remaining / Risks
- `OcrCorrectionModal` currently uses existing confidence values available in that UI path (including fallback/simulated values), so calibration quality is only as strong as upstream confidence fidelity in this workflow.
- No reset/export UI for calibration samples was added in this increment; data is persisted and visible only via Dev OCR panel analytics for now.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T2-016
## Status
- Completed.

## What Changed
- Tier 2 #7 batch threshold state + persistence:
  - `src/store/slices/createSettingsSlice.ts`
    - added `ocrBatchAcceptThreshold` (default `85`),
    - added `setOcrBatchAcceptThreshold(...)` bounded/stepped setter.
  - `src/store/useAppStore.ts`
    - hydrates `ocrBatchAcceptThreshold`,
    - persists it to settings payload,
    - includes it in `partialize`.

- Shared batch-action utility:
  - `src/utils/ocrBatchActions.ts` (new)
    - threshold normalization (`70-95`, step `5`),
    - high-confidence eligible filtering,
    - low-confidence eligible filtering,
    - candidate eligibility excludes already-corrected and ignored players.

- Confirmation dialog component:
  - `src/components/BatchActionConfirmDialog.tsx` (new)
    - reusable modal prompt with title/message/affected count and confirm/cancel controls.

- OCR correction modal batch workflow:
  - `src/components/OcrCorrectionModal.tsx`
    - added Batch Operations card:
      - threshold slider (`70-95`, step `5`),
      - live counts for high-confidence accept and low-confidence ignore actions.
    - added batch handlers:
      - accept all eligible players at or above threshold,
      - ignore all eligible players below threshold.
    - added confirmation step before applying both batch actions.
    - preserved existing shortcut behavior and correction flow.

- Focused tests:
  - `src/utils/__tests__/ocrBatchActions.test.ts` (new)
    - validates threshold normalization and high/low eligibility filtering.
  - `src/components/OcrCorrectionModal.test.tsx`
    - updated ignore button query to stay deterministic with new batch-ignore button text.

## What Was Verified
- `npx eslint src/utils/ocrBatchActions.ts src/utils/__tests__/ocrBatchActions.test.ts src/components/BatchActionConfirmDialog.tsx src/components/OcrCorrectionModal.tsx src/components/OcrCorrectionModal.test.tsx src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts` passed.
- `npx vitest run src/utils/__tests__/ocrBatchActions.test.ts src/components/OcrCorrectionModal.test.tsx` passed (`5/5` tests).
- `npm run -s typecheck` passed.
- Targeted grep confirmed threshold/store/modal/dialog/utility wiring across all intended files.

## Remaining / Risks
- Current modal confidence values are still partly simulated (`95` prior-corrected, `70` otherwise), so batch thresholds are operational but calibration quality depends on upstream confidence fidelity improvements.
- No dedicated Settings UI control for batch threshold was added in this increment; threshold is configured directly in the OCR correction modal as designed.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T2-017
## Status
- Completed.

## What Changed
- Tier 2 #8 bounding-box debug payload (backend):
  - `electron/ocrHandler.cjs`
    - added strict opt-in runtime option parsing for `includeBboxes` in `processCapture(...)`.
    - added cache bypass for debug runs so bbox captures are not served stale cached payloads.
    - added bbox debug helpers:
      - `toFiniteNumber(...)`
      - `normalizeDebugWord(...)`
      - `buildOcrBoundingBoxDebugPayload(...)`
    - when enabled, attaches `data.ocrBoundingBoxes` with:
      - `source` (`local` or `cloud`),
      - `imageWidth`/`imageHeight` (original image dimensions),
      - normalized word-level `bbox` coordinates.

- OCR renderer contract updates:
  - `src/utils/ocr/ocrTypes.ts`
    - extended `OCRExtractedData` with optional `ocrBoundingBoxes` debug payload.
  - `src/utils/electronBridge.ts`
    - added `OCRProcessRuntimeOptions` and optional runtime options parameter to `ocrProcessCapture(...)`.
    - forwards `includeBboxes` through existing `ocr-process-capture` IPC payload.

- New interactive overlay component:
  - `src/components/OcrBoundingBoxOverlay.tsx` (new)
    - renders OCR word rectangles over image via SVG,
    - confidence color coding:
      - green (`>=80`),
      - amber (`40-79`),
      - red (`<40`),
    - hover tooltip with text/confidence,
    - click/keyboard selection with details panel.

- Dev OCR panel integration:
  - `src/components/DevOCRPanel.tsx`
    - added "Capture with Bounding Boxes" action.
    - runs OCR with `includeBboxes: true` when requested.
    - renders `OcrBoundingBoxOverlay` in preview area when bbox debug data is present.
    - clears overlay state on image changes and normal OCR runs.
    - shows bbox summary metadata in scan results panel.

## What Was Verified
- `npx eslint electron/ocrHandler.cjs src/utils/ocr/ocrTypes.ts src/utils/electronBridge.ts src/components/OcrBoundingBoxOverlay.tsx src/components/DevOCRPanel.tsx` passed.
- `npm run -s typecheck` passed.
- Targeted grep verification confirmed includeBboxes/runtime/type/component wiring across backend and renderer files.

## Remaining / Risks
- In merged OCR mode, overlay intentionally uses local OCR words mapped to original image space for coordinate consistency; this debug view does not represent cloud-selected merge boxes when merge decisions choose cloud geometry.
- No persisted/debug export for bbox payloads was added in this increment (display-only in Dev OCR tools).

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T3-018
## Status
- Completed.

## What Changed
- Tier 3 #9 correction corpus builder:
  - `src/utils/ocrCorpusBuilder.ts` (new)
    - added corpus model + sample model:
      - `OcrCorpus`
      - `OcrCorpusSample`
    - added `buildOcrCorpus(aliasModel, minCount)` using learned alias entries.
    - added `serializeOcrCorpusJsonl(corpus)` for ML-friendly line-delimited JSON.
    - added `serializeOcrCorpusBox(corpus)` for placeholder Tesseract `.box` character rows.

- Export helper extension:
  - `src/utils/export.ts`
    - added `exportTextFile(content, prefix, extension)` for non-JSON downloads (`.jsonl`, `.box`).

- Dev OCR export UI integration:
  - `src/components/DevOCRPanel.tsx`
    - now reads `ocrAliasModel` from store.
    - added `exportCorrectionCorpus()` action.
    - added `Export Training Data` button in Corpus pipeline actions.
    - export action emits three files:
      - JSON corpus (`exportJSONFile`)
      - JSONL corpus (`exportTextFile`)
      - BOX corpus (`exportTextFile`)
    - empty corpus path handled with status messaging.

- OCR sample archiving plumbing:
  - `electron/ocrHandler.cjs`
    - added archive directory and helper:
      - `ensureCorpusArchiveDir()`
      - `archiveOcrSample(buffer, ocrText, metadata)`
    - extended `processCapture(...)` runtime options:
      - `archiveOcrSample`
      - `archiveMetadata`
    - archive runs are opt-in and bypass cache to ensure archive write execution.
    - successful archive writes attach optional `ocrCorpusSampleId` on response payload.
  - `src/utils/electronBridge.ts`
    - extended `OCRProcessRuntimeOptions` with archive fields.
  - `src/utils/ocr/ocrTypes.ts`
    - added optional `ocrCorpusSampleId` field.

- Focused tests:
  - `src/utils/__tests__/ocrCorpusBuilder.test.ts` (new)
    - coverage for min-count filtering,
    - JSONL serialization,
    - BOX serialization.

## What Was Verified
- `npx eslint src/utils/ocrCorpusBuilder.ts src/utils/__tests__/ocrCorpusBuilder.test.ts src/utils/export.ts src/components/DevOCRPanel.tsx src/utils/electronBridge.ts src/utils/ocr/ocrTypes.ts electron/ocrHandler.cjs` passed.
- `npx vitest run src/utils/__tests__/ocrCorpusBuilder.test.ts` passed (`3/3` tests).
- `npm run -s typecheck` passed.
- Targeted grep verification confirmed utility/export/UI/runtime archive wiring.

## Remaining / Risks
- `.box` output is a placeholder coordinate format derived from text-only corrections (no true glyph box coordinates); useful for corpus packaging, not direct high-fidelity Tesseract box training without later coordinate alignment.
- Archive writes are enabled via runtime options; non-Dev OCR flows remain unchanged unless callers opt in.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T3-019
## Status
- Completed.

## What Changed
- Tier 3 #10 dictionary helper:
  - `electron/tesseractDictionary.cjs` (new)
    - builds OCR dictionary source words from `pilotRegistry`,
    - ranks pilots by match-history co-occurrence/frequency weighting,
    - generates bounded OCR substitution variants (`0/O`, `1/I/l`),
    - writes `wildgate_userwords.txt` content and returns generation summary metadata.

- OCR handler integration:
  - `electron/ocrHandler.cjs`
    - imports dictionary helper and defines dictionary storage path (`userData/ocr-tesseract/wildgate_userwords.txt`),
    - loads existing dictionary file for new worker initialization when present,
    - applies `user_words_file` parameter to Tesseract workers,
    - adds IPC handler `regenerate-ocr-dictionary` to regenerate file from pilot registry + matches and apply to active workers.

- IPC/security parity:
  - `electron/preload.cjs`
    - allowlists `regenerate-ocr-dictionary`.
  - `scripts/security_negative_tests.cjs`
    - updates invoke-channel fixture to keep parity with preload allowlist.

- Renderer integration:
  - `src/providers/GameDataProvider.tsx`
    - adds debounced auto-regeneration effect (requires `pilotRegistry.length >= 5`) and logs outcome.
  - `src/components/DevOCRPanel.tsx`
    - adds manual `Regenerate OCR Dictionary` action in Corpus pipeline controls with status feedback.

## What Was Verified
- `npx eslint electron/tesseractDictionary.cjs electron/ocrHandler.cjs electron/preload.cjs scripts/security_negative_tests.cjs src/providers/GameDataProvider.tsx src/components/DevOCRPanel.tsx` passed.
- `node scripts/security_negative_tests.cjs` passed (`113/113`).
- `npm run -s typecheck` passed.
- Targeted grep verification confirms dictionary helper, OCR worker parameter wiring, IPC allowlist parity, and renderer auto/manual triggers.

## Remaining / Risks
- Dictionary quality depends on pilot naming hygiene and match history quality; OCR variations are intentionally bounded to avoid dictionary bloat.
- Auto-regeneration is signature-gated and debounced; if dictionary updates are needed without data changes, the manual Dev OCR action should be used.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T3-020
## Status
- Completed.

## What Changed
- Tier 3 #11 pattern utility:
  - `src/utils/patternRecognition.ts` (new)
    - `buildCooccurrenceMatrix(matches, options)`:
      - builds teammate pair co-occurrence matrix,
      - applies recency weighting and derives confidence/win-rate metrics.
    - `getTeammateSuggestions(detectedPlayers, matrix, options)`:
      - computes ranked likely-teammate suggestions with reason strings.
    - `getTopCooccurrencePairs(matrix, maxPairs)`:
      - provides deduped top pair summary for Dev OCR insights.

- OCR correction workflow integration:
  - `src/components/OcrCorrectionModal.tsx`
    - now reads `matches` from game-data context.
    - computes teammate suggestions from current detected roster and co-occurrence matrix.
    - adds "Likely Teammates" suggestion panel with likelihood, reason, encounter count, and win-rate details.
    - supports explicit click-to-apply suggestion to unresolved OCR names.

- Dev OCR pattern visibility:
  - `src/components/DevOCRPanel.tsx`
    - adds "Team Patterns" card showing top co-occurrence pairs and confidence summary.

- Focused tests:
  - `src/utils/__tests__/patternRecognition.test.ts` (new)
    - verifies repeated encounter accounting,
    - verifies ranked teammate suggestion output,
    - verifies recency weighting preference.

## What Was Verified
- `npx eslint src/utils/patternRecognition.ts src/utils/__tests__/patternRecognition.test.ts src/components/OcrCorrectionModal.tsx src/components/DevOCRPanel.tsx` passed.
- `npx vitest run src/utils/__tests__/patternRecognition.test.ts src/components/OcrCorrectionModal.test.tsx` passed (`5/5` tests).
- `npm run -s typecheck` passed.
- Targeted grep verification confirms utility exports and UI wiring in modal + Dev OCR panel.

## Remaining / Risks
- Suggestion application currently targets unresolved OCR names and remains manual (no silent auto-apply), so operator review is still required.
- Confidence/likelihood quality depends on available match-history volume and naming consistency in roster data.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T3-021
## Status
- Completed.

## What Changed
- Tier 3 #12 accessibility foundations:
  - `src/hooks/useFocusTrap.ts` (new)
    - reusable focus containment for modal dialogs (`Tab`/`Shift+Tab` loop + focus restore on close).
  - `src/hooks/useAriaLiveRegion.ts` (new)
    - reusable polite/assertive screen-reader announcements without visible UI noise.
  - `src/styles/accessibility.css` (new)
    - `a11y-sr-only` helper class,
    - high-contrast preference polish,
    - forced-colors support adjustments.
  - `src/utils/accessibilityAudit.ts` (new)
    - static DOM checks for alt text, control labels, button names, dialog ARIA semantics, and anchor href presence.
    - includes summary helper for error/warning totals.
  - `src/utils/__tests__/accessibilityAudit.test.ts` (new)
    - focused utility behavior coverage.
  - `src/index.tsx`
    - imports shared accessibility stylesheet.

- Modal accessibility hardening (targeted pass):
  - `src/components/OcrCorrectionModal.tsx`
    - added dialog ARIA semantics and focus trap.
    - added live-region announcements for ignore/batch/apply actions.
    - shortcuts now pause while nested batch-confirm dialog is open.
  - `src/components/BatchActionConfirmDialog.tsx`
    - added dialog ARIA semantics, focus trap, and Escape key close.
  - `src/components/ReviewQueueModal.tsx`
    - added dialog ARIA semantics for queue and source-preview dialogs.
    - added focus traps and Escape key behavior.
    - added live-region announcements for key review actions.
  - `src/components/SettingsModal.tsx`
    - added dialog ARIA semantics, focus trap, and Escape key close.
  - `src/components/RenameModal.tsx`
    - added dialog ARIA semantics, focus trap, and Escape key close.
  - `src/components/ResetConfirmModal.tsx`
    - added dialog ARIA semantics, focus trap, and Escape key close.
  - `src/components/EditMatchModal.tsx`
    - added dialog ARIA semantics, focus trap, and Escape key close.

- Dev OCR accessibility tooling:
  - `src/components/DevOCRPanel.tsx`
    - added "Accessibility Audit" card under Utilities.
    - audit runs against current document, surfaces error/warning counts, and shows issue details.

## What Was Verified
- `npx eslint src/hooks/useFocusTrap.ts src/hooks/useAriaLiveRegion.ts src/utils/accessibilityAudit.ts src/utils/__tests__/accessibilityAudit.test.ts src/components/OcrCorrectionModal.tsx src/components/BatchActionConfirmDialog.tsx src/components/ReviewQueueModal.tsx src/components/SettingsModal.tsx src/components/RenameModal.tsx src/components/ResetConfirmModal.tsx src/components/EditMatchModal.tsx src/components/DevOCRPanel.tsx src/index.tsx` passed.
- `npx vitest run src/utils/__tests__/accessibilityAudit.test.ts src/components/OcrCorrectionModal.test.tsx src/components/ReviewQueueModal.test.tsx` passed (`10/10` tests).
- `npm run -s typecheck` passed.
- Targeted grep verification confirms accessibility hook/audit wiring and modal dialog semantics.

## Remaining / Risks
- This increment is the first Tier 3 #12 slice; full WCAG 2.1 AA closure across every component remains pending.
- `src/components/ocr/OCRReviewModal.tsx` was intentionally deferred to keep this increment bounded and low-risk.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T3-022
## Status
- Completed.

## What Changed
- OCR review modal accessibility hardening:
  - `src/components/ocr/OCRReviewModal.tsx`
    - added primary dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`),
    - added focus trapping for:
      - the primary OCR review dialog,
      - the screenshot lightbox preview dialog,
    - added keyboard shortcuts:
      - `Escape` closes lightbox first, otherwise triggers modal cancel,
      - `Ctrl/Cmd+Enter` triggers `Apply and Learn` when lightbox is closed,
    - added live-region announcements for screenshot preview open/close,
    - added missing accessible labels and explicit button types for lightbox icon controls.

- Focused regression coverage:
  - `src/components/ocr/OCRReviewModal.test.tsx` (new)
    - verifies dialog semantics + Escape close on main modal,
    - verifies Escape closes lightbox before modal cancellation.

## What Was Verified
- `npx eslint src/components/ocr/OCRReviewModal.tsx src/components/ocr/OCRReviewModal.test.tsx` passed.
- `npx vitest run src/components/ocr/OCRReviewModal.test.tsx src/components/OcrCorrectionModal.test.tsx src/components/ReviewQueueModal.test.tsx` passed (`9/9` tests).
- `npm run -s typecheck` passed.
- Targeted grep verification confirmed hook wiring and dialog semantics.

## Remaining / Risks
- Tier 3 #12 still requires broader cross-app manual screen-reader + keyboard QA (NVDA/JAWS/VoiceOver) and color-contrast audits beyond modal-level hardening.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T3-023
## Status
- Completed.

## What Changed
- Overlay accessibility hardening:
  - `src/components/DrillDownOverlay.tsx`
    - added dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`),
    - added focus trapping while overlay is open (`useFocusTrap`),
    - added Escape keyboard close via `useKeyboardShortcuts`,
    - added explicit close-button `aria-label` and `type="button"`.
  - `src/App.tsx`
    - added focus trapping for:
      - changelog modal wrapper,
      - ID mapper wrapper,
    - added dialog semantics + label/description wiring for both wrappers,
    - added hidden accessible title/description for ID mapper wrapper,
    - added overlay Escape handler that prioritizes closing ID mapper when open, otherwise closes changelog,
    - added explicit `type="button"` on overlay close controls.

- Focused regression coverage:
  - `src/components/DrillDownOverlay.test.tsx` (new)
    - verifies drill-down dialog semantics and Escape close behavior.
  - `src/App.test.tsx`
    - adds coverage for changelog and ID mapper dialog semantics + Escape close behavior.

## What Was Verified
- `npx eslint src/components/DrillDownOverlay.tsx src/components/DrillDownOverlay.test.tsx src/App.tsx src/App.test.tsx` passed.
- `npx vitest run src/components/DrillDownOverlay.test.tsx src/App.test.tsx src/components/ocr/OCRReviewModal.test.tsx` passed (`8/8` tests).
- `npm run -s typecheck` passed.
- Targeted `rg` verification confirmed focus-trap wiring, dialog semantics, and overlay Escape handling in touched components.

## Remaining / Risks
- Tutorial overlay and remaining screenshot lightboxes (Smart Captures / Match Recording) are intentionally deferred to the next accessibility increment.
- Full app-wide manual screen-reader audit remains pending.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T3-024
## Status
- Completed.

## What Changed
- Tutorial overlay accessibility hardening:
  - `src/components/Tutorial.tsx`
    - added dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`),
    - added focus-trap wiring for tutorial overlay container,
    - migrated Escape/arrow keyboard handling to shared `useKeyboardShortcuts` hook,
    - added explicit `type="button"` for tutorial controls.

- Match detail screenshot lightbox accessibility hardening:
  - `src/components/MatchRecordingPage.tsx`
    - added dialog semantics and focus trap for screenshot lightbox,
    - added Escape keyboard close while lightbox is open,
    - added accessible open/close labels for screenshot preview controls,
    - added explicit `type="button"` for screenshot action controls.

- Focused regression coverage:
  - `src/components/Tutorial.test.tsx` (new)
    - verifies tutorial dialog semantics and Escape-close behavior.
  - `src/components/MatchRecordingPage.test.tsx` (new)
    - verifies screenshot lightbox dialog semantics and Escape-close behavior.

## What Was Verified
- `npx eslint src/components/Tutorial.tsx src/components/MatchRecordingPage.tsx src/components/Tutorial.test.tsx src/components/MatchRecordingPage.test.tsx` passed.
- `npx vitest run src/components/Tutorial.test.tsx src/components/MatchRecordingPage.test.tsx src/components/DrillDownOverlay.test.tsx src/App.test.tsx` passed (`9/9` tests).
- `npm run -s typecheck` passed.
- Targeted `rg` verification confirmed focus-trap/shortcut wiring and dialog semantics in both updated components.

## Remaining / Risks
- Smart Captures overlay dialogs (`jsonExport` and screenshot lightbox in `src/components/SmartCapturesPanel.tsx`) remain pending for the next accessibility increment.
- Full app-wide manual screen-reader and contrast audit remains pending.

---

## Handoff - 2026-02-17 - OCR-ENHANCEMENT-T3-025
## Status
- Completed with one environment validation blocker documented (targeted vitest startup `spawn EPERM`).

## What Changed
- Visual ROI editor (new):
  - `src/components/OcrRegionEditorModal.tsx`
    - added full-resolution ROI editor modal with native-pixel canvas interaction,
    - supports region selection per screen (Crew Hub / Tactical Map),
    - supports draw, drag move, and resize handles,
    - includes reset-selected/reset-screen and apply workflow.

- Settings ROI integration:
  - `src/components/SettingsModal.tsx`
    - added `Visual Editor` entrypoint in OCR ROI section,
    - wired apply callback to persist edited regions into `ocrRegions`,
    - ensured editor closes when settings closes.

- Players panel vertical fill fix:
  - `src/components/PlayerHub.tsx`
    - enforced `min-h-0`/`h-full` shell semantics to prevent bottom dead-zone.
  - `src/App.tsx`
    - players view wrapper now includes `min-h-0`.

- Dev Utilities clipping fix:
  - `src/components/DevOCRPanel.tsx`
    - switched from center-locked layout to full-height bounded container,
    - added internal scroll region for Utilities content.

- OCR wizard/modal cutoff + OCR entry typing fix:
  - `src/components/OcrCorrectionModal.tsx`
    - modal overlay now top-anchored with overlay scroll fallback,
    - correction input focus tracking added,
    - global shortcuts disabled while typing in name fields,
    - autocomplete dropdown tied to focused input for stable cursor behavior.
  - `src/components/ocr/OCRReviewModal.tsx`
    - top-anchored overlay with overflow scroll fallback.
  - `src/components/Wizard.tsx`
    - top-anchored overlay with overflow scroll fallback.

## What Was Verified
- `npx eslint src/components/OcrRegionEditorModal.tsx src/components/SettingsModal.tsx src/components/PlayerHub.tsx src/components/DevOCRPanel.tsx src/components/OcrCorrectionModal.tsx src/components/ocr/OCRReviewModal.tsx src/components/Wizard.tsx src/App.tsx` passed.
- `npm run -s typecheck` passed.
- `npx vitest run src/components/OcrCorrectionModal.test.tsx src/components/ocr/OCRReviewModal.test.tsx` blocked in this environment (`spawn EPERM` before test execution).

## Remaining / Risks
- Local/CI rerun needed for targeted vitest command because of environment process-spawn restriction.
- ROI editor currently requires manual image load each session and does not persist a preview image path (intentional for bounded scope).

---

## Handoff - 2026-02-18 - EMERGENCY-BATCH-2026-02-18-001
## Status
- Completed (integrated emergency patch set).

## What Changed
- Core runtime/data-integrity fixes already in working batch were kept and finalized:
  - `src/hooks/useLogMonitor.ts`: telemetry local-player/loadout parsing hardening and case-insensitive fallback matching.
  - `src/App.tsx`: telemetry draft Smart Capture prompt now supports up to 3 mid-match clicks before dismissal.
  - `src/hooks/useMatchSubmission.ts`: teammate selections are no longer reset on submission.
  - `src/components/SmartCapturesPanel.tsx`: manual teammate/opponent entries preserved and merged over OCR; manual edit paths avoid fuzzy auto-remap.
  - `src/components/Wizard.tsx`: weapon/equipment entry switched from free-text to controlled equipment DB selectors.

- Additional emergency fixes implemented this pass:
  - `src/components/recording/ActionPanel.tsx`: added Smart Capture button to default panel variant (overlay parity) with pending-count badge.
  - `src/components/Sidebar.tsx`: OCR Debug navigation is now available without requiring Dev Mode.
  - `src/components/analytics/AnalyticsShell.tsx`: fixed Pro drill tile click-through bug (`Open detail` now works reliably).
  - `src/components/analytics/TimePatternView.tsx`: fixed active-times tooltip isolation and day-bar color differentiation by win-rate band.
  - `src/App.tsx`: implemented restore-session persistence + startup prompt (`Restore session` / `Discard`) and automatic snapshot lifecycle handling.
  - `src/components/smart-captures/primitives/ConfidenceMeter.tsx`: improved confidence bar visibility.
  - `src/components/smart-captures/QueueItemRichPreview.tsx`: confidence/progress row now appears for OCR-state items even before final confidence is available.
  - `src/index.css`: strengthened Smart Captures queue status chip contrast.
  - `src/components/IdMapper.tsx`: improved default tab behavior so panel no longer appears blank when Unknowns is empty.
  - `src/components/DevOCRPanel.tsx`: added a concise “Fast OCR Improvement Loop” explanation.
  - `src/store/slices/createFormSlice.ts`: first telemetry ship/hero update can override stale manual startup selection, while preserving manual override behavior after telemetry baseline is established.
  - `src/store/slices/__tests__/createFormSlice.test.ts`: added/updated regression tests for the new telemetry startup override semantics.

- Version bump:
  - `package.json` -> `2.16.0`
  - `src/utils/constants.ts` -> `v2.16`
  - `src/utils/changelog.ts` -> new `v2.16` release notes entry.

## What Was Verified
- `npx eslint` on touched emergency files: PASS.
- `npx vitest run src/store/slices/__tests__/createFormSlice.test.ts src/components/recording/ActionPanel.test.tsx src/App.test.tsx`: PASS (`41/41`).
- `npm run -s typecheck`: PASS.
- Follow-up focused lint/tests after telemetry/startup/chart refinements: PASS.

## Remaining / Risks
- The emergency set did not include full drag-and-drop reassignment of OCR players between ships in Wizard/Smart Captures (new feature-level scope).
- The emergency set did not include a full analytics content expansion (new charts/narrative architecture); this pass fixed critical interaction/readability regressions.

---

## Handoff - 2026-02-18 - OCR-DRAG-REVIEW-002
## Status
- Completed.

## What Changed
- Added shared opponent-team move utility:
  - `src/utils/opponentTeamTransfer.ts`
    - new `moveOpponentPlayerBetweenTeams` helper for immutable cross-team move/reorder with no-op guardrails.
  - `src/utils/__tests__/opponentTeamTransfer.test.ts`
    - focused regression tests for cross-team move, in-team reorder, immutability, and invalid-index safety.

- OCR review drag + sticky screenshots:
  - `src/components/ocr/OCRReviewModal.tsx`
    - enabled dragging opponent rows between team cards (including in-team reorder),
    - added team drop-zone highlight and move announcements,
    - made screenshot reference section sticky during scroll while preserving click-to-enlarge lightbox behavior.

- Smart Captures drag between teams/ships:
  - `src/components/SmartCapturesPanel.tsx`
    - enabled dragging enemy player chips between team cards in Smart Match detail editor,
    - keeps `opponentTeams` and flattened `opponents` list synchronized after reassignment,
    - added inline helper copy to make drag behavior discoverable.

## What Was Verified
- `npx eslint src/components/ocr/OCRReviewModal.tsx src/components/SmartCapturesPanel.tsx src/utils/opponentTeamTransfer.ts src/utils/__tests__/opponentTeamTransfer.test.ts` passed.
- `npx vitest run src/utils/__tests__/opponentTeamTransfer.test.ts src/components/ocr/OCRReviewModal.test.tsx` passed (`6/6` tests).
- `npm run -s typecheck` passed.

## Remaining / Risks
- This increment is limited to opponent-team drag/reassign and sticky screenshot references; broader OCR workflow changes (for example custom fuzzy-match popup behavior or additional wizard screenshot panes) are still pending future scope.

---

## Handoff - 2026-02-18 - OCR-WIZARD-REASSIGN-003
## Status
- Completed.

## What Changed
- Wizard OCR reassignment in `src/components/OcrCorrectionModal.tsx`:
  - added drag/drop team-assignment board so OCR-detected players can be moved between team cards,
  - added per-team ship selector using built-in ship options,
  - added apply-time session sync:
    - writes reviewed team/player mapping to `sessionTeams`,
    - writes reviewed ship mapping to `sessionShipTypes` (manual source),
    - refreshes teammate/opponent picks from reviewed teams (active user match first, teammate-overlap fallback).
  - added sticky screenshot reference rail with one-click lightbox preview while scrolling OCR edits.

- Wizard wiring in `src/components/Wizard.tsx`:
  - extracts image artifacts from `pendingMatchData.artifacts`,
  - passes screenshot list into `OcrCorrectionModal`.

- Focused tests in `src/components/OcrCorrectionModal.test.tsx`:
  - expanded mocks for new provider dependencies,
  - added regression test for screenshot references + lightbox open/close.

## What Was Verified
- `npx eslint src/components/OcrCorrectionModal.tsx src/components/Wizard.tsx src/components/OcrCorrectionModal.test.tsx` passed.
- `npx vitest run src/components/OcrCorrectionModal.test.tsx` passed (`3/3` tests).
- `npm run -s typecheck` passed.

## Remaining / Risks
- This increment is intentionally bounded to the wizard OCR correction modal path; wider OCR flow changes (for example new ID-mapper fuzzy prompt UX or analytics expansions) remain outside this task scope.

---

## Handoff - 2026-02-18 - TELEMETRY-LOADOUT-INDICATORS-004
## Status
- Completed.

## What Changed
- Telemetry loadout parsing hardening in `src/hooks/useLogMonitor.ts`:
  - broadened loadout signal detection for more telemetry key variants,
  - added nested candidate extraction for array/object slot payload shapes,
  - expanded weapon/equipment key candidates,
  - extended fuzzy name matching with `EQUIPMENT_DB` names so non-guid payloads resolve more reliably.

- Dedicated loadout panel indicators in `src/components/recording/SquadronPanel.tsx`:
  - added explicit `Weapons`/`Equipment` rows with `(auto)` badges,
  - rendered in both standard and compact densities,
  - keeps indicators inside the separate ship/prospector box as requested.

- Focused regression coverage:
  - `src/hooks/__tests__/useLogMonitor.test.ts`: nested local telemetry loadout payload resolves weapon/equipment into `currentLoadout`.
  - `src/components/recording/SquadronPanel.test.tsx`: verifies `(auto)` indicators and item names in standard + compact panel variants.

## What Was Verified
- `npx eslint src/hooks/useLogMonitor.ts src/components/recording/SquadronPanel.tsx src/hooks/__tests__/useLogMonitor.test.ts src/components/recording/SquadronPanel.test.tsx` passed.
- `npx vitest run src/hooks/__tests__/useLogMonitor.test.ts src/components/recording/SquadronPanel.test.tsx` passed (`6/6` tests).
- `npm run -s typecheck` passed.

## Remaining / Risks
- This increment is limited to telemetry loadout parsing and dedicated panel indicator visibility; broader telemetry event coverage for entirely unknown GUID catalogs still depends on user mapping updates or future GUID list expansion.

---

## Handoff - 2026-02-18 - ANALYTICS-ARTIFACT-IDFLOW-005
## Status
- Completed.

## What Changed
- Analytics overview and chart readability:
  - `src/components/analytics/AnalyticsDashboard.tsx`
    - added `Operational Snapshot` and `Priority Insights` cards to increase narrative/actionable overview density.
    - improved mini placement distribution color readability by placement bands.
  - `src/components/analytics/TimePatternView.tsx`
    - added per-bar coloring/intensity for hourly activity chart.
    - changed tooltip behavior to per-bar (`shared={false}`) for clearer hover interaction.
  - `src/components/analytics/KillEfficiencyView.tsx`
    - replaced single-color bar charts with multi-color per-row bars.
  - `src/components/analytics/PlacementDistView.tsx`
    - replaced single-color placement histogram bars with semantic placement-band colors.

- Artifact repair reliability:
  - `electron/helpers/artifactRelinker.cjs`
    - normalizes seconds/milliseconds timestamp formats for historical match records.
    - adds timeline-window fallback matching when strict delta-based nearest match fails.
    - hardens apply flow so individual file failures do not abort all repair work.
    - includes `failedLinks` and detailed failure entries in apply results for operator visibility.

- Fuzzy/ID mapping surfacing flow:
  - `src/App.tsx`
    - adds automatic `Fuzzy Match Review Ready` prompt for high-confidence roster candidates.
    - adds automatic `ID Info Requested` prompt for unknown telemetry IDs.
    - prompt actions jump directly to review queue / ID mapper.
  - `src/components/ReviewQueueModal.tsx`
    - prioritizes roster-candidate items by score so fuzzy-match decisions are surfaced first.
  - `src/components/IdMapper.tsx`
    - auto-focuses `Unknowns` tab when unknown IDs first appear post-mount.

## What Was Verified
- `npx eslint src/components/analytics/AnalyticsDashboard.tsx src/components/analytics/TimePatternView.tsx src/components/analytics/KillEfficiencyView.tsx src/components/analytics/PlacementDistView.tsx src/App.tsx src/components/IdMapper.tsx src/components/ReviewQueueModal.tsx electron/helpers/artifactRelinker.cjs` passed.
- `npx vitest run src/App.test.tsx src/components/ReviewQueueModal.test.tsx src/components/recording/ActionPanel.test.tsx` passed (`23/23` tests).
- `npm run -s typecheck` passed.

## Remaining / Risks
- Artifact relinker reliability is improved for timestamp variance and partial failures, but cannot recover screenshots that were never persisted to local storage.
- Fuzzy/ID prompts are informational with manual confirmation; no auto-merge logic was introduced by design.

---

## Handoff - 2026-02-18 - RECOVERY-CONTINUATION-001 (Closeout Addendum)
## Status
- Completed.

## What Changed
- Settings crash hardening:
  - `src/components/SettingsModal.tsx`
    - refactored to mount-gated wrapper + inner modal component so settings hooks only mount while open.
    - removes modal close/open hook-order drift risk tied to the reported `Rendered more hooks than during the previous render` crash.

- DB write contention hardening:
  - `electron/main.cjs`
    - serialized `db-write` handler through a queue (`dbWriteQueue`) to prevent concurrent temp-file rename collisions.
    - cleanup path now best-effort unlinks DB/WAL temp files without secondary noisy cleanup errors.

- Shell/layout usability refinements:
  - `src/components/RecordingView.tsx`
    - lowered narrow breakpoint to `980px` so default-size app keeps combined vertical Loadout+Actions panel; compact tab mode now activates later on true shrink.
  - `src/App.tsx`
    - switched dashboard wrappers (Analytics/History/Smart Captures/Players/Dev OCR) to `overflow-y-scroll custom-scrollbar` for persistent scrollbar visibility.
  - `src/components/HistoryTable.tsx`
    - switched history root shell to `overflow-y-scroll custom-scrollbar` to keep scrollbars visible and reliable.

## What Was Verified
- `npx eslint src/components/SettingsModal.tsx src/components/RecordingView.tsx src/App.tsx src/components/HistoryTable.tsx electron/main.cjs` passed.
- `npm run -s typecheck` passed.
- `npx vitest run src/hooks/__tests__/useLogMonitor.test.ts src/App.test.tsx` passed (`8/8` tests).
- Reviewed persisted runtime logs confirming prior hook-order crash signature used as closeout repro anchor:
  - `C:\Users\Alec Gougebas\AppData\Roaming\Wildgate Stat Tracker\app_logs.txt`.

## Remaining / Risks
- The settings crash hardening removes the identified modal hook-order risk path; final runtime confirmation should be taken from a fresh packaged run on the target laptop session.
- Existing stale lock rows in `docs/WORKLOCKS.md` remain historically noisy; they do not affect runtime behavior but should be normalized in a dedicated documentation cleanup pass.

---

## Handoff - 2026-02-18 - RECOVERY-CONTINUATION-006 (Gate Reconcile)
## Status
- Completed.

## What Changed
- Reconciled final stale test expectation:
  - `src/components/smart-captures/QueueItemRichPreview.test.tsx`
    - updated queue assertion to enforce hidden raw-ID behavior (`queryByText(/ID 12345/)` is null).

## What Was Verified
- `npx vitest run src/components/smart-captures/QueueItemRichPreview.test.tsx` passed (`2/2` tests).
- `npm run -s ci:quality` passed end-to-end (`lint`, `test`, `typecheck`, `build`).

## Remaining / Risks
- No additional gate failures remain in this continuation increment.

---

## Handoff - 2026-02-18 - OCR-SYSTEM-IMPROVEMENTS-007
## Status
- Completed.

## What Changed
- Gemini model default fix:
  - `electron/geminiService.cjs`
    - default model changed to `gemini-2.0-flash-exp`.

- OCR parser tolerance tightening:
  - `src/utils/ocr/ocrParser.ts`
    - long-name fuzzy threshold now caps at 3 edits.
  - `src/utils/ocr/__tests__/ocrParser.test.ts`
    - added long-name regression cases for `AlexanderSmith` variants.

- Renderer runtime OCR config:
  - `src/config/runtimeConfig.ts`
    - added `ocr` config section with env-bounded values.

- Electron OCR pipeline/runtime updates:
  - `electron/ocrHandler.cjs`
    - env-backed clamps for cache size, worker pool size, region scale, cloud timeout, and low-word-confidence threshold.
    - low-confidence word filtering before extraction output.
    - optional per-job PSM support in worker parameters and OCR calls.
    - async dictionary file existence check via `fsPromises.access`.
    - map-screen extract path now parallelizes full map extraction and player-region OCR.

- Store/model migration changes:
  - `src/store/slices/createMappingSlice.ts`
    - removed legacy `ocrCorrections` write in `recordOcrAliasCorrection`.
  - `src/store/useAppStore.ts`
    - hydration migration from `ocrCorrections` to `ocrAliasModel` and hydration-time alias compaction.

- Calibration auto-apply wiring:
  - `src/store/slices/createSettingsSlice.ts`
    - added `applyCalibrationRecommendations` action and 50-sample trigger in `recordCalibrationSample`.
    - final alignment: auto-apply only runs when recommendation mode is `auto`.

- Test alignment for write-target change:
  - `src/store/slices/__tests__/createMappingSlice.test.ts`
    - updated expectations to reflect alias-model-only write path.

## What Was Verified
- `npm test -- src/utils/ocr/__tests__/ocrParser.test.ts src/store/slices/__tests__/createMappingSlice.test.ts` passed (`90/90`).
- `npx eslint ...` on all touched OCR/system files passed.
- `npm run -s typecheck` fails due to pre-existing unrelated `HistoryTable` errors (`shouldLimitAll` missing).
- `npm test` fails due to pre-existing unrelated `ActionPanel.test.tsx` mock/runtime issue (`useAppStore.getState is not a function`).

## Remaining / Risks
- Manual runtime checks for startup log lines (Gemini init model string, worker pool size env override, PSM-tagged OCR logs, noisy-image filtered-word count) still need interactive app run verification.
- Legacy `ocrCorrections` remains persisted for compatibility, but new alias corrections now write only to `ocrAliasModel`.
- Workspace contains an untracked `nul` entry that was not modified during this task.

---

## Handoff Addendum - 2026-02-18 - OCR-SYSTEM-IMPROVEMENTS-007 (Runtime Verification)
## Status
- Runtime verification completed.

## Additional Verification Completed
- Gemini startup/default-model log verified via direct service initialization:
  - `[GeminiService] Initialized (gemini-2.0-flash-exp, us-central1)`.
- OCR worker-pool env override verified:
  - with `WILDGATE_OCR_WORKER_POOL_SIZE=2`, OCR startup logged 2 workers.
- PSM routing verified from runtime logs:
  - crew-hub-hinted pass logged `PSM=4`.
  - map-screen-hinted pass logged `PSM=11`.
- Low-confidence filtering verified on noisy OCR sample:
  - threshold `0` produced `52` words (`min conf 25.3`).
  - threshold `80` produced `37` words (`min conf 82.1`).

## Remaining / Risks (Updated)
- Manual runtime verification items from the original plan are now complete.
- Pre-existing unrelated workspace failures remain:
  - `npm run -s typecheck` (`HistoryTable.tsx` missing `shouldLimitAll`).
  - `npm test` (`ActionPanel.test.tsx` mock/runtime path: `useAppStore.getState is not a function`).

---

## Handoff - 2026-02-18 - GEMINI-MODEL-DEFAULT-008
## Status
- Completed.

## What Changed
- `electron/geminiService.cjs`
  - default fallback model updated from `gemini-2.0-flash-exp` to `gemini-3.0-flash`.

## What Was Verified
- `npx eslint electron/geminiService.cjs` passed.

## Remaining / Risks
- If `gemini-3.0-flash` is unavailable in the active Vertex region/project, runtime API calls will fail until overridden with `WILDGATE_GEMINI_MODEL`.
