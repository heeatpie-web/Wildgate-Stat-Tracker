# Validation - 2026-02-14

## Planned Checks
- Targeted unit tests for `useMatchSubmission` artifact synchronization behavior.
- Focused sanity check of artifact bundling helper/handler integration.

## Results
- `npm test -- src/hooks/__tests__/useMatchSubmission.test.ts`
  - Result: PASS
  - Evidence:
    - 1 test file passed
    - 10 tests passed
    - Includes new regression test: on-disk artifact sync when bundler returns none

- `npm run typecheck`
  - Result: PASS
  - Evidence: `tsc --noEmit -p tsconfig.typecheck.json` completed with no errors.

- `npx eslint src/hooks/useMatchSubmission.ts src/hooks/__tests__/useMatchSubmission.test.ts electron/handlers/artifactHandlers.cjs`
  - Result: PASS
  - Evidence: no lint violations reported for touched files.

---

## Planned Checks (Current Task)
- `npm run typecheck`
- `npx eslint src/components/SettingsModal.tsx src/hooks/useLogMonitor.ts src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts electron/main.cjs`
- Targeted runtime sanity by verifying `start-log-monitoring` receives selected profile and applies expected polling/write cadence.

## Results (Current Task)
- `npm run typecheck`
  - Result: PASS
  - Evidence: `tsc --noEmit -p tsconfig.typecheck.json` completed with no errors.

- `npx eslint src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/components/SettingsModal.tsx src/hooks/useLogMonitor.ts electron/main.cjs`
  - Result: PASS
  - Evidence: no lint violations on touched telemetry-profile files.

- Runtime sanity (code-path verification)
  - Result: PASS
  - Evidence:
    - Renderer sends selected profile in `start-log-monitoring` payload: `src/hooks/useLogMonitor.ts`.
    - Main process resolves profile and applies profile config (`pollMs`, `minDecodeIntervalMs`, `snapshotWriteIntervalMs`): `electron/main.cjs`.
    - Status events now include active profile to aid diagnostics: `electron/main.cjs`.

---

## Validation - 2026-02-15 - TELEMETRY-BASTION-001
- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors.

- Command: `npx eslint src/hooks/useLogMonitor.ts`
  - Result: PASS
  - Evidence: no lint violations for touched file.

- Logic check (manual code-path verification)
  - Result: PASS
  - Evidence:
    - `src/hooks/useLogMonitor.ts` now resolves hero/ship from raw loadout fields even if GUID fields are absent.
    - Existing GUID resolution and unknown registration paths are still present.

---

## Validation - 2026-02-15 - BUG-BATCH-001
- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after first-pass bug-batch edits.

- Command: `npx eslint src/components/SmartCapturesPanel.tsx src/components/recording/SquadronPanel.tsx src/components/recording/RosterPanel.tsx src/components/SettingsModal.tsx`
  - Result: PASS
  - Evidence: no lint violations for touched TS/TSX files.

- Command: `npx eslint src/index.css`
  - Result: WARN (non-blocking)
  - Evidence: file ignored by eslint config; no style-lint gate configured for CSS in current setup.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Smart Captures `onResolve` now uses latest store row before applying resolved state (prevents stale overwrite).
    - Smart Captures OCR apply paths now resolve player names against roster and fuzzy matching.
    - Teammate add/apply paths respect ship capacity (`getShipCapacity(ship) - 1`).
    - Smart match detail action bar exposes `Wizard` button for manual data entry flow.
    - Telemetry ship indicator uses normalized ship comparison (base-name match).

---

## Validation - 2026-02-15 - BUG-BATCH-002
- Command: `npx vitest run src/components/RecordingView.test.tsx`
  - Result: PASS
  - Evidence:
    - 1 test file passed
    - 3 tests passed
    - Includes constrained-height wide-layout assertion (`overflow-y-auto` fallback).

- Command: `npx eslint src/components/RecordingView.tsx src/components/RecordingView.test.tsx`
  - Result: PASS
  - Evidence: no lint violations for touched files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after layout change.

---

## Validation - 2026-02-15 - BUG-BATCH-003
- Command: `npx eslint src/components/SettingsModal.tsx`
  - Result: PASS
  - Evidence: no lint violations for touched file.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after tab hierarchy changes.

---

## Validation - 2026-02-15 - BUG-BATCH-004
- Command: `npx eslint src/components/OverlayView.tsx src/components/analytics/AnalyticsShell.tsx src/components/Toast.tsx src/utils/soundCues.ts src/App.tsx`
  - Result: PASS
  - Evidence: no lint violations for touched files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after BUG-BATCH-004 changes.

---

## Validation - 2026-02-15 - DEV-SPLASH-RETRY-001
- Command: `npx eslint electron/main.cjs`
  - Result: PASS
  - Evidence: no lint violations for patched splash-progress logic.

- Logic check (manual code-path verification)
  - Result: PASS
  - Evidence:
    - `setSplashProgress` now persists per-window payload and clamps `pct` with `Math.max(previous, requested)`.
    - Retry-path updates in `startDevRendererWithRetry` continue to update status/detail text via same writer without lowering rendered percent.
    - `lastSplashByWin` is still cleared in `stop()`, so a new startup cycle begins with a fresh progress state.

---

## Validation - 2026-02-15 - TAB-LOADING-STARTUP-001
- Command: `npx eslint src/App.tsx`
  - Result: PASS
  - Evidence: no lint violations for lazy-loader preload changes.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after preload implementation.

- Logic check (manual code-path verification)
  - Result: PASS
  - Evidence:
    - `src/App.tsx` now defines loader functions for lazy dashboard views and calls them in `warmLazyDashboardViews()`.
    - Startup effect triggers warm preload in dashboard mode (`!isOverlayMode`), so chunks are requested before first tab click.
    - Existing Suspense fallback remains for safety if preload is delayed or fails.

---

## Validation - 2026-02-15 - OCR-HYDRATION-COMBINED-001
- Command: `npm run test -- src/utils/__tests__/ocrAliasEngine.test.ts src/store/slices/__tests__/createMappingSlice.test.ts`
  - Result: PASS
  - Evidence:
    - 2 test files passed
    - 32 tests passed
    - Includes new alias-engine ambiguity/blocklist/compaction coverage and mapping-slice alias-resolution regressions.

- Command: `npm run typecheck` (initial pass before final fix)
  - Result: FAIL (expected during implementation)
  - Evidence:
    - `src/store/slices/createMappingSlice.ts(156,9)` strict typing mismatch for legacy `contexts` map (`Record<OcrAliasContext, number>`).
  - Remediation:
    - Added full-key normalization for legacy context map before increment in `toLegacyCorrection`.

- Command: `npm run typecheck` (post-remediation)
  - Result: PASS
  - Evidence: `tsc --noEmit -p tsconfig.typecheck.json` completed with no errors.

- Command: `npx eslint src/App.tsx src/components/SettingsModal.tsx src/hooks/useSmartScan.ts src/store/slices/createMappingSlice.ts src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/utils/ocrAliasEngine.ts src/utils/storage.ts src/store/slices/__tests__/createMappingSlice.test.ts src/utils/__tests__/ocrAliasEngine.test.ts`
  - Result: PASS
  - Evidence: no lint violations on touched OCR learning/preload implementation files.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Alias model hydrates from persisted `ocrAliasModel` or migrates from legacy `ocrCorrections`.
    - Shared alias resolver is consumed in both smart-scan and OCR review apply flows.
    - Startup preload now runs in staged background mode and is gated by overlay mode, store hydration, performance mode, and explicit setting toggle.
    - Settings modal exposes OCR learning gates and startup preload toggle with persistence.

---

## Validation - 2026-02-15 - ADV-AUTOLEARN-V2-001
- Command: `npm run typecheck`
  - Result: PASS
  - Evidence: `tsc --noEmit -p tsconfig.typecheck.json` completed with no errors after final integration changes.

- Command: `npx vitest run src/utils/__tests__/ocrAliasEngine.test.ts src/store/slices/__tests__/createMappingSlice.test.ts` (initial pass)
  - Result: FAIL (expected during implementation)
  - Evidence:
    - 1 failing assertion in `createMappingSlice` cleanup test (`clears resolved learning events while retaining queued items`) due timestamp cutoff edge at `olderThanMs=0`.
  - Remediation:
    - Updated test cutoff to deterministic aggressive value (`clearResolvedOcrLearningEvents(-1)`).

- Command: `npx vitest run src/utils/__tests__/ocrAliasEngine.test.ts src/store/slices/__tests__/createMappingSlice.test.ts` (post-remediation)
  - Result: PASS
  - Evidence:
    - 2 test files passed.
    - 38 tests passed.

- Command: `npx eslint src/components/SettingsModal.tsx src/App.tsx src/hooks/useSmartScan.ts src/store/slices/createMappingSlice.ts src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/utils/ocrAliasEngine.ts src/utils/storage.ts src/components/ReviewQueueModal.tsx src/store/slices/__tests__/createMappingSlice.test.ts src/utils/__tests__/ocrAliasEngine.test.ts`
  - Result: PASS
  - Evidence: no lint violations on touched renderer/store/test files.

- Command: `npx eslint electron/main.cjs electron/preload.cjs scripts/ocr_threshold_recommend.cjs scripts/security_negative_tests.cjs`
  - Result: PASS
  - Evidence: no lint violations on touched Electron/script files.

- Command: `npm run ocr:threshold:recommend`
  - Result: PASS
  - Evidence: command produced structured JSON recommendation payload with `recommendedThresholds`, `summary`, and `reasons`.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Settings now exposes advanced controls for OCR learning review mode, queue enablement, auto-promote threshold, adaptive preload budget, and recommendation apply/revert.
    - `ocr-corpus-threshold-recommend` channel is available from renderer (`preload`) and returns parsed recommendation payload from main-process script execution.
    - OCR learning queue lifecycle is wired end-to-end: queue -> approve/reject -> rollback.

---

## Validation - 2026-02-15 - DEV-STARTUP-HOOKS-001
- Command: `npm run typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after settings hook-order and startup-flow changes.

- Command: `npx eslint src/components/SettingsModal.tsx electron/main.cjs package.json`
  - Result: PASS (non-blocking note for package.json)
  - Evidence:
    - no lint violations for `src/components/SettingsModal.tsx` and `electron/main.cjs`.
    - `package.json` reported expected "file ignored" warning due eslint config, no errors.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Hook-order fix confirmed in `SettingsModal`: all hooks now execute before early-return branch.
    - `electron:dev` no longer waits on Vite TCP before launching Electron, so splash can render immediately.
    - `app.whenReady` critical path no longer awaits telemetry migration/cloud init, reducing dev startup blocking.

---

## Validation - 2026-02-15 - PROFILE-SETTINGS-MERGE-001
- Command: `npm run typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after sidebar/profile tutorial updates.

- Command: `npx eslint src/components/Sidebar.tsx src/components/Tutorial.tsx`
  - Result: PASS
  - Evidence: no lint violations for touched UI/tutorial files.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Standalone sidebar settings button was removed from `src/components/Sidebar.tsx`.
    - Profile hub menu in `src/components/Sidebar.tsx` still exposes a working Settings action (`setShowSettings(true)`).
    - Tutorial settings step now targets `profile-selector` in `src/components/Tutorial.tsx` instead of removed selector.

---

## Validation - 2026-02-15 - PROFILE-BUTTON-WIDTH-001
- Command: `npx eslint src/components/Sidebar.tsx`
  - Result: PASS
  - Evidence: no lint violations for touched sidebar file.

- Command: `npm run typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after width-lane class fix.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Profile wrapper in `src/components/Sidebar.tsx` now uses `className=\"relative w-full\"`.
    - Existing profile button `w-full` now resolves to full sidebar lane width like nav buttons.
    - No menu action/event logic changed.

---

## Validation - 2026-02-15 - OVERLAY-NAV-RECORDING-LAYOUT-001
- Command: `npx vitest run src/components/RecordingView.test.tsx`
  - Result: PASS
  - Evidence:
    - 1 test file passed.
    - 4 tests passed.
    - Includes ordering check asserting `ActionPanel` renders before `MissionPanel`.

- Command: `npx eslint src/components/OverlayView.tsx src/components/RecordingView.tsx src/components/RecordingView.test.tsx`
  - Result: PASS
  - Evidence: no lint violations for touched overlay/recording files.

- Command: `npm run typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after overlay/layout changes.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Overlay tab rail now acts as in-overlay navigation (`Recording`, `Loadout`, `Social`) and no longer exits overlay.
    - Explicit full-view actions remain available via `Open Full`, `History`, and `Captures`.
    - `RecordingView` now renders `ActionPanel` above `MissionPanel` in both wide and narrow modes.

---

## Validation - 2026-02-15 - RECORDING-ROLLBACK-ALIGN-001
- Command: `npx vitest run src/components/RecordingView.test.tsx`
  - Result: PASS
  - Evidence:
    - 1 test file passed.
    - 3 tests passed.
    - Includes compact `Actions/Loadout` tab-switch behavior and standard left-shell composition assertions.

- Command: `npx eslint src/components/RecordingView.tsx src/components/RecordingView.test.tsx src/components/analytics/AnalyticsShell.tsx src/components/HistoryTable.tsx src/components/PlayerHub.tsx src/components/smart-captures/SmartCapturesShell.tsx`
  - Result: PASS
  - Evidence: no lint violations for touched layout/shell files.

- Command: `npm run typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after rollback/alignment updates.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Recording view restored to prior behavior: `ActionPanel` lives in left shell (standard) and compact `Actions/Loadout` toggle is active.
    - Analytics/Players/Smart Captures no longer apply duplicate top-level `p-3` inside App shell wrapper.
    - History root now fills/scrolls the shell consistently (`h-full min-h-0 overflow-y-auto`), reducing tab-to-tab frame drift.

---

## Validation - 2026-02-15 - OCR-ADAPTIVE-RESOLUTION-001
- Command: `npx eslint src/utils/stringUtils.ts src/utils/__tests__/stringUtils.test.ts src/utils/ocrNameResolver.ts src/utils/__tests__/ocrNameResolver.test.ts src/hooks/useSmartCapture.ts src/hooks/useSmartScan.ts src/App.tsx src/components/ocr/OCRReviewModal.tsx electron/main.cjs electron/preload.cjs scripts/security_negative_tests.cjs`
  - Result: PASS
  - Evidence: no lint violations for touched OCR resolver/corpus IPC/security files.

- Command: `npx vitest run src/utils/__tests__/stringUtils.test.ts src/utils/__tests__/ocrNameResolver.test.ts src/store/slices/__tests__/createMappingSlice.test.ts`
  - Result: PASS
  - Evidence:
    - 3 test files passed.
    - 62 tests passed.
    - Includes new variant similarity and shared resolver regression coverage.

- Command: `node scripts/security_negative_tests.cjs`
  - Result: PASS
  - Evidence:
    - 113 pass / 0 fail.
    - New `ocr-corpus-add-corrected-sample` invoke channel present in allowlist fixture checks.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after shared resolver + corpus ingest changes.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Shared resolver is now used in Smart Capture (`useSmartCapture`), Smart Scan (`useSmartScan`), and App OCR apply (`App.tsx`).
    - Smart Capture canonicalization now performs canonical dedupe and contextual second-pass resolution using social graph constraints (2+ anchors, unique candidate).
    - OCR review apply path now fires guarded non-blocking corpus auto-ingest via new IPC channel.
    - Main-process ingest handler enforces payload quality checks and dedupes by image hash + normalized roster/modifier signature before append.

- Command: `npx eslint src/hooks/useSmartCapture.ts`
  - Result: PASS
  - Evidence: no lint violations after opponent contextual-anchor refinement.

- Command: `npx vitest run src/utils/__tests__/stringUtils.test.ts src/utils/__tests__/ocrNameResolver.test.ts src/store/slices/__tests__/createMappingSlice.test.ts`
  - Result: PASS
  - Evidence:
    - 3 test files passed.
    - 62 tests passed.

- Command: `npm run -s ocr:eval`
  - Result: FAIL (environment/data missing)
  - Evidence:
    - Script aborted with `Missing file: dataset/ocr-corpus/ground-truth.json`.

- Command: `npm run -s ocr:eval:sample`
  - Result: FAIL (environment/data missing)
  - Evidence:
    - Script aborted with `Missing file: dataset/ocr-corpus/ground-truth.sample.json`.

---

## Validation - 2026-02-15 - VERSION-CHANGELOG-001
- Command: `npx eslint src/utils/constants.ts src/utils/changelog.ts`
  - Result: PASS
  - Evidence: no lint violations in touched version/changelog source files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after metadata updates.

- Command: `Select-String -Path package.json -Pattern '"version"\\s*:\\s*"2.15.0"'`
  - Result: PASS
  - Evidence: matched `package.json:5`.

- Command: `Select-String -Path package-lock.json -Pattern '"version"\\s*:\\s*"2.15.0"'`
  - Result: PASS
  - Evidence: matched `package-lock.json:3` and `package-lock.json:9`.

- Command: `Select-String -Path src/utils/constants.ts -Pattern 'APP_VERSION\\s*=\\s*"v2.15"'`
  - Result: PASS
  - Evidence: matched `src/utils/constants.ts:9`.

- Command: `Select-String -Path src/utils/changelog.ts -Pattern '"v2.15"'`
  - Result: PASS
  - Evidence: matched `src/utils/changelog.ts:2`.

---

## Validation - 2026-02-15 - IDMAPPER-TELEMETRY-SHIP-001
- Command: `npx eslint src/hooks/useLogMonitor.ts src/components/IdMapper.tsx`
  - Result: PASS
  - Evidence: no lint violations on touched telemetry/mapper files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after telemetry/mapper fixes.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - `src/hooks/useLogMonitor.ts` now qualifies ship GUIDs only when values match stable 32-hex GUID format.
    - Non-GUID `shipid/ship_id` values no longer trigger unknown-ship registration.
    - Raw ship fallback uses fuzzy matching to known ship names and does not set arbitrary unmatched raw strings as active ship.
    - `src/components/IdMapper.tsx` no longer renders `Unknown` role badge on known mappings with unresolved relationship role.

---

## Validation - 2026-02-15 - IDMAPPER-TELEMETRY-LOADOUT-002
- Command: `npx eslint src/components/IdMapper.tsx src/hooks/useLogMonitor.ts src/components/recording/ActionPanel.tsx`
  - Result: PASS
  - Evidence: no lint violations on touched mapper/telemetry/action-panel files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no reported errors after follow-up mapper/loadout telemetry changes.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - Unknown-ID save in mapper is now type-aware and writes to the correct UID domain (`players/ships/weapons/equipment`).
    - Telemetry loadout parsing resolves weapons/equipment from broader GUID and raw-name candidate fields.
    - Telemetry summary in ActionPanel now includes weapons/equipment rows and can render when only those are present.

---

## Validation - 2026-02-15 - DISABLE-RUNTIME-DEVTOOLS-001
- Command: `npx eslint electron/main.cjs`
  - Result: PASS
  - Evidence: no lint violations after runtime-devtools gating patch.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after Electron main change.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - `open-devtools` IPC handler now returns without opening DevTools unless `WILDGATE_ALLOW_DEVTOOLS=1`.
    - Startup auto-open remains disabled (commented `openDevTools` call unchanged).

---

## Validation - 2026-02-16 - BUG-BATCH-005
- Command: `npx eslint src/App.tsx src/components/DevOCRPanel.tsx src/components/OcrCorrectionModal.tsx src/components/SmartCapturesPanel.tsx src/components/ocr/OCRReviewModal.tsx src/hooks/useLogMonitor.ts src/hooks/useMatchSubmission.ts electron/main.cjs`
  - Result: PASS
  - Evidence: no lint violations on touched implementation files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed without errors after all BUG-BATCH-005 changes.

- Command: `npx vitest run src/hooks/__tests__/useMatchSubmission.test.ts`
  - Result: PASS
  - Evidence: `10/10` tests passed; submission flow regressions remained green after bundling logic updates.

- Manual logic checks
  - Result: PASS
  - Evidence:
    - OCR review modal supports editing/adding opponent teams and players; unmatched names can be queued to roster review.
    - Smart Captures no longer drops teammate OCR apply to zero when ship capacity is unknown.
    - Smart Captures auto artifact repair no longer produces repeated stacked success toasts on each panel open.
    - Smart Captures bulk tools now include selected-match merge action.
    - Corpus UI refreshes imported images immediately and packaged eval script resolution no longer hardcodes a single app path.
    - Telemetry loadout parsing now handles payload-level fallback and broader weapon/equipment key coverage.

---

## Validation - 2026-02-16 - BUG-BATCH-005-EVAL-EXT-001
- Command: packaged-script smoke batch (PowerShell):
  - `node tmp-user-data/packaged-extract/scripts/ocr_corpus_eval.cjs --truth ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/ground-truth.json" --pred ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/predictions.latest.json" --baseline ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/baseline.json" --out "tmp-user-data/packaged-smoke/reports/latest.from-packaged.json"`
  - `node tmp-user-data/packaged-extract/scripts/ocr_threshold_recommend.cjs --report "tmp-user-data/packaged-smoke/reports/latest.from-packaged.json" --baseline ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/baseline.json"`
  - `node tmp-user-data/packaged-extract/scripts/ocr_promote_baseline.cjs --report "tmp-user-data/packaged-smoke/reports/latest.from-packaged.json" --baseline "tmp-user-data/packaged-smoke/baseline.promoted.from-packaged.json"`
  - `node tmp-user-data/packaged-extract/scripts/ocr_corpus_eval.cjs --truth ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/ground-truth.sample.json" --pred ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/predictions.sample.json" --baseline ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/baseline.sample.json" --out "tmp-user-data/packaged-smoke/reports/sample.from-packaged.json"`
  - `node tmp-user-data/packaged-extract/scripts/ocr_threshold_recommend.cjs --report "tmp-user-data/packaged-smoke/reports/sample.from-packaged.json" --baseline ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/baseline.sample.json"`
  - `node tmp-user-data/packaged-extract/scripts/ocr_promote_baseline.cjs --report "tmp-user-data/packaged-smoke/reports/sample.from-packaged.json" --baseline "tmp-user-data/packaged-smoke/baseline.promoted.sample.from-packaged.json"`
  - Result: PASS
  - Evidence:
    - All 6 packaged-script invocations completed successfully.
    - Full-set report generated at `tmp-user-data/packaged-smoke/reports/latest.from-packaged.json` (26 samples).
    - Sample report generated at `tmp-user-data/packaged-smoke/reports/sample.from-packaged.json` (2 samples).
    - Recommendation outputs generated for both runs and baseline promotion wrote expected files.

- Command: `npx vitest run src/hooks/__tests__/useMatchSubmission.test.ts src/hooks/__tests__/useSmartCapture.test.ts src/utils/__tests__/telemetryProcessor.test.ts src/utils/__tests__/ocrAliasEngine.test.ts src/utils/__tests__/ocrNameResolver.test.ts electron/security/ipcValidation.test.ts`
  - Result: PASS
  - Evidence:
    - 6 test files passed.
    - 42 tests passed.
    - Includes telemetry submission bundling path, smart capture hook, OCR alias/name resolver, and IPC allowlist validation.

- Command: repo-script parity batch (PowerShell):
  - `node scripts/ocr_corpus_eval.cjs --truth ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/ground-truth.json" --pred ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/predictions.latest.json" --baseline ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/baseline.json" --out "tmp-user-data/repo-smoke/reports/latest.from-repo.json"`
  - `node scripts/ocr_threshold_recommend.cjs --report "tmp-user-data/repo-smoke/reports/latest.from-repo.json" --baseline ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/baseline.json"`
  - `node scripts/ocr_promote_baseline.cjs --report "tmp-user-data/repo-smoke/reports/latest.from-repo.json" --baseline "tmp-user-data/repo-smoke/baseline.promoted.from-repo.json"`
  - `node scripts/ocr_corpus_eval.cjs --truth ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/ground-truth.sample.json" --pred ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/predictions.sample.json" --baseline ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/baseline.sample.json" --out "tmp-user-data/repo-smoke/reports/sample.from-repo.json"`
  - `node scripts/ocr_threshold_recommend.cjs --report "tmp-user-data/repo-smoke/reports/sample.from-repo.json" --baseline ".claude/worktrees/quizzical-bhabha/dataset/ocr-corpus/baseline.sample.json"`
  - `node scripts/ocr_promote_baseline.cjs --report "tmp-user-data/repo-smoke/reports/sample.from-repo.json" --baseline "tmp-user-data/repo-smoke/baseline.promoted.sample.from-repo.json"`
  - Result: PASS
  - Evidence:
    - Full-run parity checks: `teammateRecallEqual`, `opponentRecallEqual`, `modifierRecallEqual`, `teamGroupingAccuracyEqual`, `sessionUsablePassRateEqual`, `recommendationThresholdsEqual` all `True`.
    - Sample-run parity checks: above fields plus `teamColorAccuracyEqual` all `True`.

- Command: Electron corpus image workflow smoke (Playwright Electron + mocked file picker)
  - Result: PASS
  - Evidence:
    - Fixture prep created two import files:
      - `tmp-user-data/corpus-e2e-fixtures/smoke-import-a.png`
      - `tmp-user-data/corpus-e2e-fixtures/smoke-import-b.jpg`
    - Runtime output:
      - `importResult.success: true`
      - `importResult.imported: 2`
      - `importResult.skipped: 0`
      - `listSuccess: true`
      - `listedIncludesFixture: true`
      - `readTarget: images/smoke-import-a.png`
      - `readBase64Length: 92` (non-empty image payload)
    - `truthHasImportedSample: true`
    - Confirms end-to-end corpus image import, list, and read/open data path from renderer invoke through main-process handlers.

---

## Validation - 2026-02-16 - BUG-BATCH-006
- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after smart-capture channel, ongoing-result, players-tab, and analytics updates.

- Command: `npx eslint src/App.tsx src/providers/UIStateProvider.tsx src/components/Header.tsx src/components/Wizard.tsx src/components/recording/ActionPanel.tsx src/store/slices/createFormSlice.ts src/hooks/useLogMonitor.ts src/store/useAppStore.ts src/hooks/useMatchSubmission.ts src/components/SmartCapturesPanel.tsx src/components/HistoryTable.tsx src/components/MatchRecordingPage.tsx src/components/PlayerHub.tsx src/components/history/historyUtils.ts src/components/smart-captures/smartCaptureUtils.ts src/components/smart-captures/primitives/OutcomePill.tsx src/utils/analytics.ts src/utils/analyticsSocial.ts src/components/analytics/useAnalyticsData.ts src/components/Header.test.tsx src/components/recording/ActionPanel.test.tsx src/store/slices/__tests__/createFormSlice.test.ts src/hooks/__tests__/useMatchSubmission.test.ts src/components/smart-captures/smartCaptureUtils.test.ts src/components/smart-captures/primitives/OutcomePill.test.tsx src/components/history/historyUtils.test.ts`
  - Result: PASS
  - Evidence: no lint violations for touched runtime and regression test files.

- Command: `npx vitest run src/components/Header.test.tsx src/components/recording/ActionPanel.test.tsx src/store/slices/__tests__/createFormSlice.test.ts src/hooks/__tests__/useMatchSubmission.test.ts src/components/smart-captures/smartCaptureUtils.test.ts src/components/smart-captures/primitives/OutcomePill.test.tsx src/components/history/historyUtils.test.ts src/utils/__tests__/analytics.test.ts src/utils/__tests__/analyticsSocial.test.ts src/utils/__tests__/analyticsV2.test.ts`
  - Result: PASS
  - Evidence:
    - 10 files passed.
    - 105 tests passed.
    - Includes new regressions for placement fallback, smart-capture request channel consumption, ongoing-aware history styling, and teammate cap fallback.

- Command: `npx vitest run src/hooks/__tests__/useSmartCapture.test.ts src/utils/__tests__/telemetryProcessor.test.ts electron/security/ipcValidation.test.ts`
  - Result: PASS
  - Evidence:
    - 3 files passed.
    - 23 tests passed.
    - Confirms adjacent smart-capture/telemetry/security paths remain green after BUG-BATCH-006.

---

## Validation - 2026-02-16 - SMOKE-PERF-CONSENSUS-001
- Command: `npm run -s snap:views`
  - Result: PASS
  - Evidence:
    - Visual report generated at `.visual/report.md`.
    - Processed views: `recording`, `analytics`, `smart-captures`, `players`, `history`.
    - Compare output includes mismatch stats and color diff artifacts.

- Command: code-path inspection (`electron/main.cjs`, `src/hooks/useLogMonitor.ts`, `src/components/SettingsModal.tsx`, `src/components/SystemPulse.tsx`)
  - Result: PASS (diagnostic)
  - Evidence:
    - `start-log-monitoring` receives selected telemetry performance profile from renderer.
    - Main-process profile config confirms high-accuracy mode has 1s polling + aggressive decode/write cadence.
    - Lower-impact periodic timers (20s UI heartbeat, 10m retention check) are not primary thermal drivers relative to telemetry decode loop.

- Command: `npm run -s snap:views` (rerun in current turn)
  - Result: PASS
  - Evidence:
    - `recording` mismatch `10.43%`
    - `analytics` mismatch `7.2%`
    - `smart-captures` mismatch `12.93%`
    - `players` mismatch `5.18%`
    - `history` mismatch `9.11%`

---

## Validation - 2026-02-16 - THERMAL-FIX-001
- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after thermal-fix runtime edits.

- Command: `npx eslint src/utils/storage.ts electron/main.cjs electron/helpers/telemetryArchiveHelpers.cjs`
  - Result: PASS
  - Evidence: no lint violations on touched persistence/telemetry files.

- Manual logic checks
  - Result: PASS
  - Evidence:
    - `StorageService` interval flush now gates on unsaved state and avoids periodic durable writes when data is unchanged.
    - Telemetry monitoring source selection in `start-log-monitoring` now evaluates Wildgate path before Nebula fallback.
    - Archive helper no longer rewrites archive file when dedupe adds zero events and no longer reparses existing archive file on every call for same path.

---

## Validation - 2026-02-16 - OCR-ALIAS-CLEANUP-001
- Command: `npx eslint src/store/slices/createMappingSlice.ts src/components/SettingsModal.tsx src/store/slices/__tests__/createMappingSlice.test.ts`
  - Result: PASS
  - Evidence: no lint violations in touched implementation and regression-test files.

- Command: `npx vitest run src/store/slices/__tests__/createMappingSlice.test.ts`
  - Result: PASS
  - Evidence:
    - 1 file passed.
    - 33 tests passed.
    - Includes new coverage that `removeOcrAliasCorrection(...)` clears alias-model + legacy correction mirrors.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after mapping/action + settings UI changes.

---

## Validation - 2026-02-16 - OCR-CORRECTION-POPUP-CLARITY-001
- Command: `npx eslint src/components/ocr/OCRReviewModal.tsx src/components/SmartCapturesPanel.tsx`
  - Result: PASS
  - Evidence: no lint violations in touched popup/CTA UI files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed successfully after OCR popup clarity copy/label updates.
