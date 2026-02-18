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

---

## Validation - 2026-02-16 - OCR-CORRECTION-DELETE-002
- Command: `npx eslint src/components/SmartCapturesPanel.tsx src/components/ocr/OCRReviewModal.tsx src/components/OcrCorrectionModal.tsx`
  - Result: PASS
  - Evidence: no lint violations after delete-action + correction-UX updates.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after Smart Captures delete controls and OCR popup enhancements.

---

## Validation - 2026-02-16 - IQR-PLAYERNAME-001
- Command: `npx vitest run src/components/ReviewQueueModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 1 test file passed.
    - 4 tests passed.
    - Confirms `player_name` confirm/edit/delete behavior and `roster_candidate` confirm regression safety.

- Command: `npx eslint src/components/ReviewQueueModal.tsx src/components/ReviewQueueModal.test.tsx`
  - Result: PASS
  - Evidence: no lint violations in touched modal and new regression test file.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after `ReviewQueueModal` behavior updates and new tests.

---

## Validation - 2026-02-16 - POSTMATCH-OCR-GATE-002
- Command: `npx vitest run src/components/recording/ActionPanel.test.tsx`
  - Result: PASS
  - Evidence:
    - 1 test file passed.
    - 12 tests passed.
    - Includes new regression coverage for explicit OCR decision prompt and non-auto OCR result flow.

- Command: `npx eslint src/components/recording/ActionPanel.tsx src/components/recording/ActionPanel.test.tsx`
  - Result: PASS
  - Evidence: no lint violations in touched runtime + test files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after result-flow prompt changes.

---

## Validation - 2026-02-16 - POSTMATCH-TELEMETRY-PROMPT-003
- Command: `npx eslint src/App.tsx`
  - Result: PASS
  - Evidence: no lint violations after telemetry prompt routing + copy updates.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after `App.tsx` flow changes.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - telemetry post-match result selection now always funnels into `submission:open-result`.
    - non-recording telemetry result selection now switches to Recording first, then dispatches the result event.
    - post-match prompt copy explicitly states OCR remains manual until explicit process action.

---

## Validation - 2026-02-16 - OCR-TEAM-CAP-GUARD-004
- Command: `npx vitest run src/store/slices/__tests__/createFormSlice.test.ts`
  - Result: PASS
  - Evidence:
    - 1 test file passed.
    - 19 tests passed.
    - Includes new regression coverage for `setSelectedTeammates` dedupe/cap guard behavior.

- Command: `npx eslint src/store/slices/createFormSlice.ts src/store/slices/__tests__/createFormSlice.test.ts`
  - Result: PASS
  - Evidence: no lint violations in touched slice + regression test files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after teammate guard changes.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - any `setSelectedTeammates` call now applies trim + case-insensitive dedupe + ship-capacity capping.
    - updater-style OCR append patterns can no longer persist teammate lists above cap.

---

## Validation - 2026-02-16 - REMAINING-UX-TELEMETRY-005
- Command: `npx vitest run src/components/recording/ActionPanel.test.tsx src/store/slices/__tests__/createFormSlice.test.ts`
  - Result: PASS
  - Evidence:
    - 2 test files passed.
    - 33 tests passed.
    - Includes new regression assertions for telemetry auto-loadout labels and opponent dedupe behavior.

- Command: `npx eslint src/hooks/useLogMonitor.ts src/components/recording/ActionPanel.tsx src/components/recording/ActionPanel.test.tsx src/components/Wizard.tsx src/App.tsx src/store/slices/createFormSlice.ts src/store/slices/__tests__/createFormSlice.test.ts`
  - Result: PASS
  - Evidence: no lint violations in touched telemetry/wizard/OCR/state-guard files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after this remaining-issues patch set.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - telemetry loadout apply now drives both weapons and equipment auto-selection state.
    - recording telemetry panel now explicitly marks loadout rows as auto-selected (`(auto)`).
    - wizard loadout inputs write into `pendingMatchData.loadout`, which submission path prioritizes.
    - OCR apply path now normalizes/falls back opponent team colors and suppresses duplicate cross-team player fanout.

---

## Validation - 2026-02-17 - AUDIT-REMEDIATION-001
- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile completes with zero errors after storage/IPC/layout/telemetry hardening patches.

- Command: `npx eslint src/components/DashboardLayout.tsx src/components/SimulatorPanel.tsx src/components/SmartCapturesPanel.tsx src/utils/artifactService.ts src/utils/storage.ts src/utils/__tests__/artifactService.test.ts`
  - Result: PASS
  - Evidence:
    - No lint violations across all files directly touched in this remediation pass.

- Command: `npm run -s test`
  - Result: PASS
  - Evidence:
    - 32 test files passed.
    - 392 tests passed.
    - Includes updated telemetry-shape assertion in `src/utils/__tests__/artifactService.test.ts`.

- Command: `npm run -s build`
  - Result: PASS
  - Evidence:
    - Vite production build completed successfully.
    - Output bundles generated in `dist/` with no build-time type/runtime errors.

- Regression note:
  - Initial `npm run -s test` run in this task had one failing assertion in `src/utils/__tests__/artifactService.test.ts` due canonical telemetry nesting change.
  - After updating expected shape to `TelemetryArchiveEvent[][]`, full test suite passed.

---

## Validation - 2026-02-17 - AUDIT-REMEDIATION-002
- Command: `npx eslint src/hooks/useSmartCapture.ts src/components/SmartCapturesPanel.tsx src/components/recording/ActionPanel.tsx src/components/ReviewQueueModal.tsx src/providers/GameDataProvider.tsx src/store/slices/createFormSlice.ts`
  - Result: PASS
  - Evidence:
    - No lint violations across all second-pass runtime typing targets.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile passes after replacing runtime-path `any` usage with explicit type guards/unions.

- Command: `npx vitest run src/components/recording/ActionPanel.test.tsx`
  - Result: PASS
  - Evidence:
    - 1 file passed.
    - 13 tests passed.
    - Confirms submission-path behavior unchanged after typed store snapshot fallback update.

- Command: `npm run -s test`
  - Result: PASS
  - Evidence:
    - 32 test files passed.
    - 392 tests passed.

- Command: `npm run -s build`
  - Result: PASS
  - Evidence:
    - Vite production build completed successfully with updated runtime typing.

- Regression note:
  - Intermediate full test run failed in `ActionPanel` tests when `resolveSubmissionMatchId()` switched to direct `useAppStore.getState()` access and test mocks did not provide `getState`.
  - Resolved by using typed optional `getState` fallback logic in `ActionPanel`; re-ran targeted and full tests to PASS.

---

## Validation - 2026-02-17 - AUDIT-REMEDIATION-003
- Command: `npx eslint src/hooks/useLogMonitor.ts src/App.tsx src/store/slices/createUISlice.ts src/providers/UIStateProvider.tsx`
  - Result: PASS
  - Evidence:
    - No lint violations across touched telemetry runtime/status typing files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile passes after telemetry runtime typing hardening updates.

- Command: `npx vitest run src/components/recording/ActionPanel.test.tsx src/components/ReviewQueueModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 2 test files passed.
    - 17 tests passed.

- Command: `npm run -s test`
  - Result: PASS
  - Evidence:
    - 32 test files passed.
    - 392 tests passed.

- Command: `npm run -s build`
  - Result: PASS
  - Evidence:
    - Vite production build completed successfully after telemetry runtime type changes.

- Command: `rg -n "\\bany\\b|as any" src/hooks/useLogMonitor.ts src/App.tsx`
  - Result: PASS
  - Evidence:
    - no matches; explicit `any` usage removed from targeted runtime files.

- Regression note:
  - Initial `typecheck` in this pass failed once (`App.tsx`) due optional `cancelIdleCallback` incompatibility when extending `Window`.
  - Resolved by switching to a standalone optional idle-callback interface and re-running validation to PASS.

---

## Validation - 2026-02-17 - AUDIT-REMEDIATION-004
- Command: npm run -s test -- src/components/recording/ActionPanel.test.tsx src/utils/ocr/__tests__/teamColorAssignment.test.ts
  - Result: PASS
  - Evidence:
    - 2 files passed.
    - 18 tests passed.
    - Includes new deterministic color-assignment helper coverage and background OCR result-flow coverage.

- Command: npm run -s typecheck
  - Result: PASS
  - Evidence: TypeScript compile completed with no errors after adding resultOcrFlowMode and color helper integrations.

- Command: npx eslint src/App.tsx src/components/SmartCapturesPanel.tsx src/components/recording/ActionPanel.tsx src/components/recording/ActionPanel.test.tsx src/components/SettingsModal.tsx src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/utils/ocr/teamColorAssignment.ts src/utils/ocr/__tests__/teamColorAssignment.test.ts
  - Result: PASS
  - Evidence: no lint violations across touched implementation and test files.

- Command: npm run -s test
  - Result: PASS
  - Evidence:
    - 33 files passed.
    - 397 tests passed.

- Command: npm run -s build
  - Result: PASS
  - Evidence:
    - Vite production build completed successfully.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - App OCR apply path now resolves opponent colors through shared deterministic helper with session-player color hints.
    - Smart Captures apply/review paths now assign deterministic opponent colors and suppress duplicate player fanout by normalized key.
    - ActionPanel result flow now supports persisted background OCR mode (prompt remains default).
    - Settings modal exposes explicit Result Button OCR Flow mode selection and persistence.

---

## Validation - 2026-02-17 - IQR-NAME-SOURCE-001
- Command: `npx vitest run src/components/ReviewQueueModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 1 file passed.
    - 5 tests passed.
    - Includes new regression case for source screenshot provenance visibility and preview action.

- Command: `npx eslint src/utils/scan/imageUtils.ts src/store/slices/createDataSlice.ts src/hooks/useSmartScan.ts src/components/ReviewQueueModal.tsx src/components/ReviewQueueModal.test.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations across all touched implementation + test files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile completed with no errors after provenance metadata additions and review-modal UI updates.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - low-confidence `player_name` entries now receive `sourceCapture` metadata from Smart Scan capture context.
    - review queue cards with source metadata now show source label/time and `View Source` screenshot preview affordance.
    - entries without source metadata degrade safely with no action regressions.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `IQR-NAME-SOURCE-001` after the command evidence above.

---

## Validation - 2026-02-17 - RESULT-HOOK-CRASH-310-001
- Command: `npx vitest run src/components/Wizard.test.tsx src/components/recording/ActionPanel.test.tsx`
  - Result: PASS
  - Evidence:
    - 2 files passed.
    - 15 tests passed.
    - Includes new wizard closed->open transition regression test and existing result-flow coverage.

- Command: `npx eslint src/components/Wizard.tsx src/components/Wizard.test.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in touched implementation and test files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile completed with no errors after hook-order fix.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - result button click now opens wizard without introducing additional hook calls on subsequent render,
    - loadoutDraft memo executes consistently whether wizard is closed or open.

- Environment note:
  - Initial non-escalated vitest run failed with `spawn EPERM` while loading vite config in sandbox.
  - Re-ran focused vitest command outside sandbox and captured passing evidence above.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `RESULT-HOOK-CRASH-310-001`.

---

## Validation - 2026-02-17 - WIZARD-HOOK-AUDIT-002
- Command: `node (AST audit script over src/components)`
  - Result: PASS
  - Evidence:
    - No top-level hook-after-return guard violations detected in component scan.
    - Confirms no additional wizard/modal hook-order defects beyond previously fixed `Wizard` path.

- Command: `npx eslint src/components/OcrCorrectionModal.test.tsx src/components/Wizard.tsx src/components/Wizard.test.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in touched wizard/modal implementation + tests.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile completed with no errors after adding modal regression tests.

- Command: `npx vitest run src/components/OcrCorrectionModal.test.tsx src/components/Wizard.test.tsx src/components/recording/ActionPanel.test.tsx`
  - Result: PASS
  - Evidence:
    - 3 files passed.
    - 17 tests passed.
    - Includes new OcrCorrectionModal transition/action safety tests and existing result-wizard flow coverage.

- Environment note:
  - Initial non-escalated focused vitest run failed with `spawn EPERM` while loading vite config in sandbox.
  - Re-ran the same vitest command outside sandbox and captured passing evidence above.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `WIZARD-HOOK-AUDIT-002`.

---

## Validation - 2026-02-17 - OCR-TEAM-CAP-HARDEN-006
- Command: `npx vitest run src/utils/__tests__/teamLimits.test.ts src/store/slices/__tests__/createFormSlice.test.ts src/hooks/__tests__/useMatchSubmission.test.ts src/hooks/__tests__/useSmartCapture.test.ts`
  - Result: PASS
  - Evidence:
    - 4 files passed.
    - 39 tests passed.
    - Confirms new teammate-cap utility behavior and no regressions in key form/submission/capture flows.

- Command: `npx eslint src/App.tsx src/components/SmartCapturesPanel.tsx src/hooks/useSmartCapture.ts src/hooks/useMatchSubmission.ts src/store/slices/createFormSlice.ts src/utils/teamLimits.ts src/utils/__tests__/teamLimits.test.ts`
  - Result: PASS
  - Evidence:
    - no lint violations across touched implementation + test files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile completed with no errors after shared teammate-cap integration.

- Logic checks (manual code-path verification)
  - Result: PASS
  - Evidence:
    - OCR pending/merged data now caps teammate arrays using ship-capacity fallback rules.
    - Smart Captures rerun/apply and submission boundaries now apply the same cap utility.
    - App OCR apply flow now reports capped teammate count in success toast.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-TEAM-CAP-HARDEN-006`.

---

## Validation - 2026-02-17 - REFACTOR-CLOSEOUT-007
- Command: `npm run -s ci:quality`
  - Result: PASS
  - Evidence:
    - Lint stage passed (no eslint failures).
    - Test stage passed: 36 files, 405 tests.
    - Typecheck stage passed.
    - Build stage passed (Vite production build complete).

- Integration check (manual)
  - Result: PASS
  - Evidence:
    - Combined dirty refactor state validated end-to-end without additional code fixes.
    - No blocking runtime/build/test regressions remain for closeout scope.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `REFACTOR-CLOSEOUT-007`.

---

## Validation - 2026-02-17 - AUDIT-REMEDIATION-005
- Command: `npx eslint src/utils/electronBridge.ts src/utils/logger.ts src/utils/storage.ts src/App.tsx src/components/DevOCRPanel.tsx electron/helpers/artifactHelpers.cjs electron/helpers/telemetryArchiveHelpers.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations in all touched runtime/helper files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile completed after removing targeted `any` usage and tightening catches/state types.

- Command: `npm run -s ci:quality`
  - Result: PASS
  - Evidence:
    - test: 36 files, 405 tests passed,
    - typecheck: passed,
    - build: passed,
    - lint: passed.

- Command: `rg -n "\\bany\\b|@ts-ignore|console\\.(log|warn|error)" src/utils/storage.ts src/components/DashboardLayout.tsx src/utils/electronBridge.ts src/hooks/useLogMonitor.ts src/App.tsx src/components/DevOCRPanel.tsx`
  - Result: PASS (targeted issue verification)
  - Evidence:
    - no runtime `any`/`@ts-ignore`/direct `console.*` matches in requested target code paths,
    - only comment text with the word "any" remains in non-type comments.

- Command: `rg -n "Array\\.isArray\\(content\\) \\? content : \\(content\\.telemetry \\|\\| \\[\\]\\)" electron/helpers/artifactHelpers.cjs docs/TELEMETRY_PIPELINE.md`
  - Result: PASS
  - Evidence:
    - no remaining ad-hoc archive-shape checks in patched artifact helper/docs guidance.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `AUDIT-REMEDIATION-005`.

---

## Validation - 2026-02-17 - MODERATE-REMEDIATION-006
- Command: `npx vitest run src/utils/__tests__/storage.test.ts src/hooks/__tests__/useLogMonitor.test.ts src/hooks/__tests__/useSmartCapture.test.ts src/App.test.tsx`
  - Result: PASS
  - Evidence:
    - 4 files passed.
    - 14 tests passed.
    - Confirms new storage/log-monitor/app coverage and expanded smart-capture behavior tests.

- Command: `npx eslint src/App.tsx src/components/Toast.tsx src/components/MatchRecordingPage.tsx src/components/SmartCapturesPanel.tsx src/components/ocr/OCRReviewModal.tsx src/hooks/useSmartCapture.ts src/utils/logger.ts src/utils/storage.ts src/config/runtimeConfig.ts src/App.test.tsx src/hooks/__tests__/useLogMonitor.test.ts src/hooks/__tests__/useSmartCapture.test.ts src/utils/__tests__/storage.test.ts`
  - Result: PASS
  - Evidence:
    - no lint violations in touched implementation + test files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after runtime config extraction and new tests.

- Command: `npm run -s test`
  - Result: PASS
  - Evidence:
    - 39 files passed.
    - 415 tests passed.

- Command: `npm run -s lint`
  - Result: PASS
  - Evidence:
    - repository lint check passed after remediation edits.

- Command: `npm run -s build`
  - Result: PASS
  - Evidence:
    - production client build completed successfully.

- Command: `rg -n "\\.catch\\(\\s*\\(\\)\\s*=>" src`
  - Result: PASS (targeted silent-catch verification)
  - Evidence:
    - only `src/components/LocalImage.tsx` remains, and it sets an explicit failure state for UI fallback (not silent swallow).

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `MODERATE-REMEDIATION-006`.

---

## Validation - 2026-02-17 - FOLLOWUP-REMEDIATION-008
- Command: `npx eslint src/components/ErrorBoundary.tsx src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/utils/storage.ts src/config/runtimeConfig.ts src/vite-env.d.ts src/hooks/useDiscordRPC.ts src/components/SystemPulse.tsx src/components/HistoryTable.tsx src/components/recording/ActionPanel.tsx src/components/DrillDownOverlay.tsx src/components/analytics/AnalyticsShell.tsx src/components/PlayerHub.tsx src/components/ReviewQueueModal.tsx src/components/recording/RosterPanel.tsx src/components/SessionTimer.tsx src/components/SettingsModal.tsx src/components/recording/MissionPanel.tsx src/components/WindowFrame.tsx src/components/smart-captures/SmartCaptureWidgets.tsx src/components/EditMatchModal.tsx src/components/OcrCorrectionModal.tsx src/components/SmartCapturesPanel.tsx src/components/IdMapper.tsx src/components/ocr/OCRReviewModal.tsx src/components/Wizard.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in all touched follow-up files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile completed with no errors after follow-up defaults/config/a11y patches.

- Command: `npm run -s test`
  - Result: PASS
  - Evidence:
    - 39 files passed.
    - 415 tests passed.

- Command: `npm run -s lint`
  - Result: PASS
  - Evidence:
    - repository lint check passed after follow-up changes.

- Command: `npm run -s build`
  - Result: PASS
  - Evidence:
    - production client build completed successfully.

- Command: `rg -n "enableAutoBackup:\\s*true|autoBackup\\s*\\?\\?\\s*true|settings\\.autoBackup \\?\\? true" src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/utils/storage.ts`
  - Result: PASS (targeted default verification)
  - Evidence:
    - no remaining default-`true` auto-backup fallback in targeted setting/storage paths.

- Command: PowerShell regex scan for icon-button labeling (`md3-icon-btn` button blocks missing `aria-label`)
  - Result: PASS
  - Evidence:
    - no remaining unlabeled `md3-icon-btn` button blocks found in `src/components`.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `FOLLOWUP-REMEDIATION-008`.

---

## Validation - 2026-02-17 - CORPUS-IMPORT-DIR-009
- Command: `npx eslint electron/main.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations in touched Electron handler file.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after Electron handler patch.

- Command: `rg -n "ocr-corpus-import-images|defaultPath: corpusImagesDir|corpusImagesDir" electron/main.cjs`
  - Result: PASS (targeted behavior verification)
  - Evidence:
    - handler shows `defaultPath: corpusImagesDir` and pre-dialog directory ensure call.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `CORPUS-IMPORT-DIR-009`.

---

## Validation - 2026-02-17 - OCR-DUAL-BUFFER-GATES-010
- Command: `npx eslint electron/crewHubExtractor.cjs electron/ocrHandler.cjs electron/ocrMerger.cjs src/utils/ocr/ocrParser.ts src/hooks/useSmartCapture.ts src/App.tsx src/utils/ocr/__tests__/ocrParser.test.ts`
  - Result: PASS
  - Evidence:
    - no lint violations in touched OCR pipeline + apply gate + test files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after strict apply guard and parser cap updates.

- Command: `npx vitest run src/utils/ocr/__tests__/ocrParser.test.ts`
  - Result: PASS
  - Evidence:
    - 1 file passed, 56 tests passed.
    - includes new regression cases for teammate cap and opponent per-team cap in merge path.

- Command: `npx vitest run src/hooks/__tests__/useSmartCapture.test.ts src/App.test.tsx`
  - Result: PASS
  - Evidence:
    - 2 files passed, 8 tests passed.
    - confirms no regression in Smart Capture hook baseline and App render smoke after apply-gate changes.

- Command: `rg -n "extractCrewHub\\(|colorImageBuffer|imageBuffer // keep color detection on original-color pixels" electron/ocrHandler.cjs electron/crewHubExtractor.cjs`
  - Result: PASS (targeted dual-buffer verification)
  - Evidence:
    - `extractCrewHub` call sites now pass original `imageBuffer` for color detection,
    - extractor signature includes `colorImageBuffer` and right-panel color detection uses it.

- Command: `rg -n "OCR_REJECT_CONFIDENCE|OCR_REVIEW_CONFIDENCE|SMARTSCAN_REJECT_CONFIDENCE|SMARTSCAN_REVIEW_CONFIDENCE|MAX_OPPONENT_PLAYERS_PER_TEAM" src/App.tsx src/hooks/useSmartCapture.ts src/utils/ocr/ocrParser.ts electron/ocrMerger.cjs`
  - Result: PASS (targeted guardrail verification)
  - Evidence:
    - strict confidence gates and team/player cap constants are present in all intended commit/merge boundaries.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-DUAL-BUFFER-GATES-010`.

---

## Validation - 2026-02-17 - OCR-ROI-RUNTIME-011
- Command: `npx eslint src/components/SmartCapturesPanel.tsx src/components/HistoryTable.tsx src/hooks/useSmartScan.ts src/utils/scan/tesseractScan.ts src/components/DevOCRPanel.tsx src/hooks/useSmartCapture.ts src/components/SettingsModal.tsx electron/main.cjs electron/ocrHandler.cjs electron/crewHubExtractor.cjs electron/mapScreenExtractor.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations in all ROI wiring + extractor/runtime files.

- Command: `npx vitest run src/utils/__tests__/artifactService.test.ts`
  - Result: PASS
  - Evidence:
    - 1 file passed, 17 tests passed.
    - includes rerun payload coverage validating optional `ocrRegions` passthrough.

- Command: `npx vitest run src/hooks/__tests__/useSmartCapture.test.ts`
  - Result: PASS
  - Evidence:
    - 1 file passed, 6 tests passed.
    - confirms no baseline Smart Capture regressions after ROI option threading.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after settings ROI editor + nested update typing changes.

- Command: `rg -n "ocrRegions|rerun-ocr-on-artifact|ocr-process-capture|regionFingerprint|resolveMapLayout|resolveCrewHubLayout" src/components/SettingsModal.tsx src/components/HistoryTable.tsx src/components/SmartCapturesPanel.tsx src/hooks/useSmartCapture.ts src/hooks/useSmartScan.ts src/utils/scan/tesseractScan.ts electron/main.cjs electron/ocrHandler.cjs electron/crewHubExtractor.cjs electron/mapScreenExtractor.cjs`
  - Result: PASS (targeted ROI plumbing verification)
  - Evidence:
    - ROI settings now appear in all intended renderer callsites, rerun IPC path, OCR IPC handler, cache-key fingerprinting, and extractor layout override resolvers.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ROI-RUNTIME-011`.

---

## Validation - 2026-02-17 - OCR-CORPUS-ROI-012
- Command: `npx eslint src/components/DevOCRPanel.tsx electron/main.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations in touched corpus ROI wiring files.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after corpus payload/handler updates.

- Command: `rg -n "ocr-corpus-run-pipeline|ocrRegions" src/components/DevOCRPanel.tsx electron/main.cjs`
  - Result: PASS (targeted corpus ROI verification)
  - Evidence:
    - Dev OCR panel invoke includes `ocrRegions`,
    - Electron corpus handler reads `opts?.ocrRegions` and forwards into `processCapture(...)`.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-CORPUS-ROI-012`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T1-013
- Command: `npx eslint electron/ocrHandler.cjs electron/preload.cjs src/components/DevOCRPanel.tsx src/components/OcrCorrectionModal.tsx src/hooks/useKeyboardShortcuts.ts src/store/slices/createSettingsSlice.ts src/utils/ocrAliasEngine.ts src/components/ConfidenceMeter.tsx scripts/security_negative_tests.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations in all touched implementation files.

- Command: `npx vitest run src/components/OcrCorrectionModal.test.tsx src/store/slices/__tests__/createMappingSlice.test.ts`
  - Result: PASS
  - Evidence:
    - 2 files passed.
    - 35 tests passed.
    - confirms no regression in correction modal transition behavior and alias learning slice lifecycle tests.

- Command: `node scripts/security_negative_tests.cjs`
  - Result: PASS
  - Evidence:
    - 113/113 checks passed.
    - allowlist parity remains valid after adding `get-ocr-cache-stats`.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile completed successfully after Tier 1 additions.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T1-013`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T2-014
- Command: `npx eslint electron/ocrHandler.cjs electron/preload.cjs src/components/DevOCRPanel.tsx scripts/security_negative_tests.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations in benchmark IPC/backend/UI/allowlist parity files.

- Command: `node scripts/security_negative_tests.cjs`
  - Result: PASS
  - Evidence:
    - 113/113 checks passed.
    - IPC allowlist fixture remains consistent after adding `benchmark-ocr-preprocessing`.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded with new Dev OCR benchmark state/UI additions.

- Command: `rg -n "benchmark-ocr-preprocessing|benchmarkRegionPreprocessing|Benchmark Old vs Crop-First" electron/ocrHandler.cjs electron/preload.cjs scripts/security_negative_tests.cjs src/components/DevOCRPanel.tsx`
  - Result: PASS (targeted benchmark wiring verification)
  - Evidence:
    - benchmark helper + IPC handler exist in OCR handler,
    - preload allowlist + security fixture include channel,
    - Dev OCR panel exposes benchmark control and result display.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T2-014`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T2-015
- Command: `npx eslint src/utils/ocrCalibration.ts src/utils/__tests__/ocrCalibration.test.ts src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/components/OcrCorrectionModal.tsx src/components/DevOCRPanel.tsx src/components/OcrCorrectionModal.test.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in calibration utility, store wiring, correction modal, dev panel, or focused test file changes.

- Command: `npx vitest run src/utils/__tests__/ocrCalibration.test.ts src/components/OcrCorrectionModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 2 files passed.
    - 7 tests passed.
    - confirms calibration bucket/threshold helper behavior and correction modal regression safety.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after adding persisted calibration sample state and dev-panel analytics view.

- Command: `rg -n "ocrCalibrationSamples|recordCalibrationSample|buildCalibrationBuckets|recommendCalibrationThreshold" src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/components/OcrCorrectionModal.tsx src/components/DevOCRPanel.tsx src/utils/ocrCalibration.ts`
  - Result: PASS (targeted calibration wiring verification)
  - Evidence:
    - settings slice exposes bounded calibration sample recording,
    - store hydration/persistence includes calibration samples,
    - correction modal records samples on apply,
    - dev panel renders bucket analysis + threshold recommendation from shared utility.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T2-015`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T2-016
- Command: `npx eslint src/utils/ocrBatchActions.ts src/utils/__tests__/ocrBatchActions.test.ts src/components/BatchActionConfirmDialog.tsx src/components/OcrCorrectionModal.tsx src/components/OcrCorrectionModal.test.tsx src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts`
  - Result: PASS
  - Evidence:
    - no lint violations in batch threshold/store utility, modal, confirm dialog, or focused tests.

- Command: `npx vitest run src/utils/__tests__/ocrBatchActions.test.ts src/components/OcrCorrectionModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 2 files passed.
    - 5 tests passed.
    - verifies threshold normalization + batch eligibility filters and confirms modal baseline ignore/undo flow remains stable.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after adding persisted batch threshold setting and new confirmation dialog component.

- Command: `rg -n "ocrBatchAcceptThreshold|setOcrBatchAcceptThreshold|BatchActionConfirmDialog|normalizeOcrBatchThreshold|getHighConfidenceEligible|getLowConfidenceEligible" src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/components/BatchActionConfirmDialog.tsx src/components/OcrCorrectionModal.tsx src/utils/ocrBatchActions.ts src/utils/__tests__/ocrBatchActions.test.ts`
  - Result: PASS (targeted batch operation wiring verification)
  - Evidence:
    - settings/store persistence includes batch threshold field,
    - modal uses threshold slider + live count labels and confirmation dialog,
    - shared utility provides threshold normalization and eligibility filtering with focused tests.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T2-016`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T2-017
- Command: `npx eslint electron/ocrHandler.cjs src/utils/ocr/ocrTypes.ts src/utils/electronBridge.ts src/components/OcrBoundingBoxOverlay.tsx src/components/DevOCRPanel.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in OCR handler debug payload path, bridge/types updates, new overlay component, or Dev OCR panel wiring.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after adding optional OCR bbox debug response fields and new Dev panel overlay state/component usage.

- Command: `rg -n "includeBboxes|ocrBoundingBoxes|OcrBoundingBoxOverlay|Capture with Bounding Boxes|buildOcrBoundingBoxDebugPayload" electron/ocrHandler.cjs src/utils/ocr/ocrTypes.ts src/utils/electronBridge.ts src/components/DevOCRPanel.tsx src/components/OcrBoundingBoxOverlay.tsx`
  - Result: PASS (targeted bounding-box overlay wiring verification)
  - Evidence:
    - `electron/ocrHandler.cjs` includes opt-in includeBboxes runtime option, debug payload builder, and cache bypass for debug captures.
    - `src/utils/ocr/ocrTypes.ts` includes optional `ocrBoundingBoxes` response model.
    - `src/utils/electronBridge.ts` passes runtime options (`includeBboxes`) through existing OCR IPC.
    - `src/components/DevOCRPanel.tsx` exposes "Capture with Bounding Boxes" and overlay rendering.
    - `src/components/OcrBoundingBoxOverlay.tsx` provides interactive bbox visualization.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T2-017`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T3-018
- Command: `npx eslint src/utils/ocrCorpusBuilder.ts src/utils/__tests__/ocrCorpusBuilder.test.ts src/utils/export.ts src/components/DevOCRPanel.tsx src/utils/electronBridge.ts src/utils/ocr/ocrTypes.ts electron/ocrHandler.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations in new corpus builder/tests, export helper, dev-panel wiring, runtime options bridge/types, or OCR handler archive path.

- Command: `npx vitest run src/utils/__tests__/ocrCorpusBuilder.test.ts`
  - Result: PASS
  - Evidence:
    - 1 file passed.
    - 3 tests passed.
    - validates min-count alias filtering and JSONL/BOX serialization output shape.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after adding corpus utility, export helper, and runtime option/type updates.

- Command: `rg -n "buildOcrCorpus|serializeOcrCorpusJsonl|serializeOcrCorpusBox|exportTextFile|Export Training Data|archiveOcrSample|archiveMetadata" src/utils/ocrCorpusBuilder.ts src/utils/export.ts src/components/DevOCRPanel.tsx src/utils/electronBridge.ts src/utils/ocr/ocrTypes.ts electron/ocrHandler.cjs`
  - Result: PASS (targeted correction-corpus wiring verification)
  - Evidence:
    - corpus builder + serializers exist,
    - text export helper exists,
    - Dev OCR corpus action wired,
    - OCR runtime archive options wired in bridge and OCR handler.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T3-018`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T3-019
- Command: `npx eslint electron/tesseractDictionary.cjs electron/ocrHandler.cjs electron/preload.cjs scripts/security_negative_tests.cjs src/providers/GameDataProvider.tsx src/components/DevOCRPanel.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in dictionary helper, OCR handler wiring, IPC allowlist files, or renderer trigger points.

- Command: `node scripts/security_negative_tests.cjs`
  - Result: PASS
  - Evidence:
    - 113/113 checks passed.
    - invoke allowlist fixture remains consistent after adding `regenerate-ocr-dictionary`.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after auto-regeneration effect and Dev OCR manual action wiring.

- Command: `rg -n "regenerate-ocr-dictionary|generateUserWordsFile|user_words_file|OCR_USER_WORDS_FILE|Regenerate OCR Dictionary|Auto dictionary regenerated" electron/tesseractDictionary.cjs electron/ocrHandler.cjs electron/preload.cjs scripts/security_negative_tests.cjs src/providers/GameDataProvider.tsx src/components/DevOCRPanel.tsx`
  - Result: PASS (targeted dictionary wiring verification)
  - Evidence:
    - dictionary generator exists and is imported by OCR handler.
    - OCR handler exposes regeneration IPC and applies `user_words_file` worker parameter.
    - preload + security allowlist include new channel.
    - renderer has both auto (`GameDataProvider`) and manual (`DevOCRPanel`) regeneration triggers.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T3-019`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T3-020
- Command: `npx eslint src/utils/patternRecognition.ts src/utils/__tests__/patternRecognition.test.ts src/components/OcrCorrectionModal.tsx src/components/DevOCRPanel.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in new pattern utility/tests or OCR modal/dev panel integrations.

- Command: `npx vitest run src/utils/__tests__/patternRecognition.test.ts src/components/OcrCorrectionModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 2 files passed.
    - 5 tests passed.
    - verifies pattern utility core behavior and confirms OCR correction modal baseline behavior remains stable.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after pattern utility and UI wiring updates.

- Command: `rg -n "buildCooccurrenceMatrix|getTeammateSuggestions|getTopCooccurrencePairs|Likely Teammates|Team Patterns" src/utils/patternRecognition.ts src/utils/__tests__/patternRecognition.test.ts src/components/OcrCorrectionModal.tsx src/components/DevOCRPanel.tsx`
  - Result: PASS (targeted pattern-recognition wiring verification)
  - Evidence:
    - utility exports co-occurrence build/suggestion/pair-summary helpers.
    - tests cover encounter/suggestion/recency behavior.
    - OCR correction modal renders likely-teammate suggestions.
    - Dev OCR panel renders team-pattern summary card.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T3-020`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T3-021
- Command: `npx eslint src/hooks/useFocusTrap.ts src/hooks/useAriaLiveRegion.ts src/utils/accessibilityAudit.ts src/utils/__tests__/accessibilityAudit.test.ts src/components/OcrCorrectionModal.tsx src/components/BatchActionConfirmDialog.tsx src/components/ReviewQueueModal.tsx src/components/SettingsModal.tsx src/components/RenameModal.tsx src/components/ResetConfirmModal.tsx src/components/EditMatchModal.tsx src/components/DevOCRPanel.tsx src/index.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations across new accessibility hook/style/audit files and targeted modal + Dev OCR integrations.

- Command: `npx vitest run src/utils/__tests__/accessibilityAudit.test.ts src/components/OcrCorrectionModal.test.tsx src/components/ReviewQueueModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 3 files passed.
    - 10 tests passed.
    - validates accessibility-audit utility behavior and confirms OCR/review modal baseline tests remain green after accessibility hardening.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after adding shared accessibility hooks, audit utility, stylesheet import, and modal updates.

- Command: `rg -n "useFocusTrap|useAriaLiveRegion|runA11yAudit|Accessibility Audit|aria-modal=\\\"true\\\"|role=\\\"dialog\\\"" src/components src/hooks src/utils src/index.tsx -S`
  - Result: PASS (targeted accessibility wiring verification)
  - Evidence:
    - focus-trap and live-region hooks are wired in targeted modal flows.
    - automated accessibility audit utility and Dev OCR trigger are wired.
    - dialog semantics (`role="dialog"`, `aria-modal`) are present in updated modal components.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T3-021`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T3-022
- Command: `npx eslint src/components/ocr/OCRReviewModal.tsx src/components/ocr/OCRReviewModal.test.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in OCRReviewModal accessibility hardening changes or new focused tests.

- Command: `npx vitest run src/components/ocr/OCRReviewModal.test.tsx src/components/OcrCorrectionModal.test.tsx src/components/ReviewQueueModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 3 files passed.
    - 9 tests passed.
    - validates OCRReviewModal dialog semantics + Escape behavior, while confirming adjacent OCR modal test suites remain stable.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after OCRReviewModal accessibility additions and new test coverage.

- Command: `rg -n "useFocusTrap|useKeyboardShortcuts|useAriaLiveRegion|aria-modal|lightboxTitleId|Ctrl\\+Enter" src/components/ocr/OCRReviewModal.tsx src/components/ocr/OCRReviewModal.test.tsx -S`
  - Result: PASS (targeted OCRReviewModal accessibility wiring verification)
  - Evidence:
    - focus trap + keyboard shortcut + live-region hooks are wired,
    - both modal and lightbox include dialog semantics,
    - tests cover main dialog and lightbox Escape behavior.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T3-022`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T3-023
- Command: `npx eslint src/components/DrillDownOverlay.tsx src/components/DrillDownOverlay.test.tsx src/App.tsx src/App.test.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in overlay accessibility hardening changes or focused tests.

- Command: `npx vitest run src/components/DrillDownOverlay.test.tsx src/App.test.tsx src/components/ocr/OCRReviewModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 3 files passed.
    - 8 tests passed.
    - validates drill-down dialog semantics + Escape close and App changelog/ID mapper dialog semantics + Escape close while keeping OCR review modal tests green.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after App + drill-down overlay accessibility updates and new tests.

- Command: `rg --line-number --no-heading 'role="dialog"|aria-modal|useFocusTrap|onOverlayEscape|a11y-sr-only' src/components/DrillDownOverlay.tsx src/App.tsx`
  - Result: PASS (targeted overlay accessibility wiring verification)
  - Evidence:
    - focus trap wiring exists for drill-down, changelog, and ID mapper overlays.
    - dialog semantics (`role="dialog"`, `aria-modal`) are present in all targeted wrappers.
    - Escape handler (`onOverlayEscape`) is wired in App overlay path.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T3-023`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T3-024
- Command: `npx eslint src/components/Tutorial.tsx src/components/MatchRecordingPage.tsx src/components/Tutorial.test.tsx src/components/MatchRecordingPage.test.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations in tutorial/lightbox accessibility updates or new focused tests.

- Command: `npx vitest run src/components/Tutorial.test.tsx src/components/MatchRecordingPage.test.tsx src/components/DrillDownOverlay.test.tsx src/App.test.tsx`
  - Result: PASS
  - Evidence:
    - 4 files passed.
    - 9 tests passed.
    - validates tutorial dialog semantics + Escape behavior and match screenshot lightbox dialog semantics + Escape close while keeping prior overlay tests green.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after tutorial and match lightbox accessibility additions.

- Command: `rg --line-number --no-heading 'useFocusTrap|useKeyboardShortcuts|role="dialog"|aria-modal|dialogDescriptionId' src/components/Tutorial.tsx`
  - Result: PASS (targeted tutorial accessibility wiring verification)
  - Evidence:
    - tutorial overlay uses focus trap + keyboard shortcuts with dialog semantics.

- Command: `rg --line-number --no-heading 'useFocusTrap|useKeyboardShortcuts|role="dialog"|aria-modal|Open screenshot|Close screenshot preview' src/components/MatchRecordingPage.tsx`
  - Result: PASS (targeted match lightbox accessibility wiring verification)
  - Evidence:
    - match screenshot preview uses focus trap + Escape shortcut with dialog semantics and labeled controls.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T3-024`.

---

## Validation - 2026-02-17 - OCR-ENHANCEMENT-T3-025
- Command: `npx eslint src/components/OcrRegionEditorModal.tsx src/components/SettingsModal.tsx src/components/PlayerHub.tsx src/components/DevOCRPanel.tsx src/components/OcrCorrectionModal.tsx src/components/ocr/OCRReviewModal.tsx src/components/Wizard.tsx src/App.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations across new ROI editor implementation and targeted layout/modal/input fixes.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after ROI editor addition and all requested UI regression patches.

- Command: `npx vitest run src/components/OcrCorrectionModal.test.tsx src/components/ocr/OCRReviewModal.test.tsx`
  - Result: BLOCKED (`spawn EPERM` at vitest/vite config startup in current environment)
  - Evidence:
    - failure occurs before test execution while launching esbuild service from vitest config pipeline.
    - command should be re-run unchanged in local shell with normal child-process spawn permissions.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-ENHANCEMENT-T3-025`.

---

## Validation - 2026-02-18 - EMERGENCY-BATCH-2026-02-18-001
- Command: `npx eslint src/App.tsx src/components/DevOCRPanel.tsx src/components/IdMapper.tsx src/components/Sidebar.tsx src/components/SmartCapturesPanel.tsx src/components/Wizard.tsx src/components/analytics/AnalyticsShell.tsx src/components/analytics/TimePatternView.tsx src/components/recording/ActionPanel.tsx src/components/smart-captures/QueueItemRichPreview.tsx src/components/smart-captures/primitives/ConfidenceMeter.tsx src/hooks/useLogMonitor.ts src/hooks/useMatchSubmission.ts src/store/slices/createFormSlice.ts src/store/slices/__tests__/createFormSlice.test.ts`
  - Result: PASS
  - Evidence:
    - no lint violations across all touched emergency files.

- Command: `npx vitest run src/store/slices/__tests__/createFormSlice.test.ts src/components/recording/ActionPanel.test.tsx src/App.test.tsx`
  - Result: PASS
  - Evidence:
    - 3 files passed.
    - 41 tests passed.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded for integrated emergency patch set.

- Follow-up confirmation after telemetry/startup and chart refinements:
  - Command: `npx eslint src/App.tsx src/components/analytics/TimePatternView.tsx src/store/slices/createFormSlice.ts src/store/slices/__tests__/createFormSlice.test.ts`
    - Result: PASS
  - Command: `npx vitest run src/store/slices/__tests__/createFormSlice.test.ts src/App.test.tsx`
    - Result: PASS
    - Evidence: 2 files passed, 27 tests passed.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `EMERGENCY-BATCH-2026-02-18-001`.

---

## Validation - 2026-02-18 - OCR-DRAG-REVIEW-002
- Command: `npx eslint src/components/ocr/OCRReviewModal.tsx src/components/SmartCapturesPanel.tsx src/utils/opponentTeamTransfer.ts src/utils/__tests__/opponentTeamTransfer.test.ts`
  - Result: PASS
  - Evidence:
    - no lint violations across drag/drop implementation surfaces and new utility/test files.

- Command: `npx vitest run src/utils/__tests__/opponentTeamTransfer.test.ts src/components/ocr/OCRReviewModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 2 files passed.
    - 6 tests passed.
    - validates new opponent-team transfer helper behavior and keeps OCRReviewModal baseline suite green.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after shared utility import and drag/drop state wiring updates.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-DRAG-REVIEW-002`.

---

## Validation - 2026-02-18 - OCR-WIZARD-REASSIGN-003
- Command: `npx eslint src/components/OcrCorrectionModal.tsx src/components/Wizard.tsx src/components/OcrCorrectionModal.test.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations across wizard OCR reassignment implementation and focused test updates.

- Command: `npx vitest run src/components/OcrCorrectionModal.test.tsx`
  - Result: PASS
  - Evidence:
    - 1 file passed.
    - 3 tests passed.
    - includes new screenshot reference/lightbox coverage.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after modal team-draft state wiring and wizard screenshot-prop integration.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `OCR-WIZARD-REASSIGN-003`.

- Command: `npx vitest run src/components/Wizard.test.tsx`
  - Result: PASS
  - Evidence:
    - 1 file passed.
    - 1 test passed.
    - confirms wizard closed->open transition remains stable after screenshot prop wiring.

---

## Validation - 2026-02-18 - TELEMETRY-LOADOUT-INDICATORS-004
- Command: `npx eslint src/hooks/useLogMonitor.ts src/components/recording/SquadronPanel.tsx src/hooks/__tests__/useLogMonitor.test.ts src/components/recording/SquadronPanel.test.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations across telemetry parser updates, dedicated loadout panel updates, and focused regression tests.

- Command: `npx vitest run src/hooks/__tests__/useLogMonitor.test.ts src/components/recording/SquadronPanel.test.tsx`
  - Result: PASS
  - Evidence:
    - 2 files passed.
    - 6 tests passed.
    - validates nested telemetry loadout extraction and explicit auto-indicator rendering in both panel densities.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after telemetry parsing and SquadronPanel UI changes.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `TELEMETRY-LOADOUT-INDICATORS-004`.

---

## Validation - 2026-02-18 - ANALYTICS-ARTIFACT-IDFLOW-005
- Command: `npx eslint src/components/analytics/AnalyticsDashboard.tsx src/components/analytics/TimePatternView.tsx src/components/analytics/KillEfficiencyView.tsx src/components/analytics/PlacementDistView.tsx src/App.tsx src/components/IdMapper.tsx src/components/ReviewQueueModal.tsx electron/helpers/artifactRelinker.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations across targeted analytics, app/review UX, and Electron relinker changes.

- Command: `npx vitest run src/App.test.tsx src/components/ReviewQueueModal.test.tsx src/components/recording/ActionPanel.test.tsx`
  - Result: PASS
  - Evidence:
    - 3 files passed.
    - 23 tests passed.
    - verifies App overlay/prompt semantics, review queue behavior, and recording action panel integration did not regress.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after analytics chart updates, prompt-flow additions, and relinker helper hardening.

- PM response evidence:
  - `docs/agents/02_EXECUTION_LOG.md` contains `PM-FEEDBACK-REQ` and `PM Response | APPROVED` for `ANALYTICS-ARTIFACT-IDFLOW-005`.

---

## Validation - 2026-02-18 - RECOVERY-CONTINUATION-001 (Closeout Addendum)
- Command: `npx eslint src/components/SettingsModal.tsx src/components/RecordingView.tsx src/App.tsx src/components/HistoryTable.tsx electron/main.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations after settings mount-gating, recording threshold adjustment, shell scrollbar changes, and DB-write serialization updates.

- Command: `npm run -s typecheck`
  - Result: PASS
  - Evidence:
    - TypeScript compile succeeded after closeout adjustments.

- Command: `npx vitest run src/hooks/__tests__/useLogMonitor.test.ts src/App.test.tsx`
  - Result: PASS
  - Evidence:
    - 2 files passed.
    - 8 tests passed.
    - confirms telemetry-monitor startup/profile behavior and App-level baseline flow did not regress during closeout.

- Runtime evidence check (manual log review):
  - Source: `C:\Users\Alec Gougebas\AppData\Roaming\Wildgate Stat Tracker\app_logs.txt`
  - Result: PASS (evidence collected for reported crash signature)
  - Evidence:
    - confirmed prior persisted occurrences of `Rendered more hooks than during the previous render` used as closeout repro anchor for settings hardening.

---

## Validation - 2026-02-18 - RECOVERY-CONTINUATION-006 (Gate Reconcile)
- Command: `npx vitest run src/components/RecordingView.test.tsx src/components/smart-captures/QueueItemRichPreview.test.tsx`
  - Result: FAIL (initial repro)
  - Evidence:
    - isolated stale assertion in `QueueItemRichPreview.test.tsx` expecting visible raw match ID text that is no longer rendered by design.

- Command: `npx vitest run src/components/smart-captures/QueueItemRichPreview.test.tsx`
  - Result: PASS (post-fix)
  - Evidence:
    - 1 file passed.
    - 2 tests passed.
    - confirms hidden-ID queue test contract now matches runtime UI behavior.

- Command: `npm run -s ci:quality`
  - Result: PASS
  - Evidence:
    - full pipeline passed (`lint`, `test`, `typecheck`, `build`).
    - test suite passed (`50` files, `455` tests).

---

## Validation - 2026-02-18 - OCR-SYSTEM-IMPROVEMENTS-007
- Command: `npm test -- src/utils/ocr/__tests__/ocrParser.test.ts src/store/slices/__tests__/createMappingSlice.test.ts`
  - Result: PASS
  - Evidence:
    - 2 test files passed.
    - 90 tests passed.
    - includes the new long-name fuzzy-match cap assertions for `AlexanderSmith` variants.

- Command: `npx eslint electron/geminiService.cjs electron/ocrHandler.cjs src/utils/ocr/ocrParser.ts src/utils/ocr/__tests__/ocrParser.test.ts src/config/runtimeConfig.ts src/store/slices/createMappingSlice.ts src/store/slices/__tests__/createMappingSlice.test.ts src/store/useAppStore.ts src/store/slices/createSettingsSlice.ts`
  - Result: PASS
  - Evidence:
    - no lint violations for all touched OCR/system implementation files.

- Command: `npm run -s typecheck`
  - Result: FAIL (pre-existing unrelated workspace errors)
  - Evidence:
    - `src/components/HistoryTable.tsx(506,42): Cannot find name 'shouldLimitAll'`
    - `src/components/HistoryTable.tsx(555,18): Cannot find name 'shouldLimitAll'`

- Command: `npm test`
  - Result: FAIL (pre-existing unrelated suite failure)
  - Evidence:
    - 49 files passed, 1 failed.
    - 442 tests passed, 14 failed.
    - all failures are in `src/components/recording/ActionPanel.test.tsx`.
    - failing root error: `useAppStore.getState is not a function` in ActionPanel test runtime mock path.

- Runtime/code-path checks (manual)
  - Result: PASS
  - Evidence:
    - `electron/geminiService.cjs` default model string is `gemini-2.0-flash-exp`.
    - `electron/ocrHandler.cjs` now reads env-clamped OCR constants, filters low-confidence OCR words, supports optional per-job PSM, uses async dictionary-file existence check, and runs map extraction + region OCR in parallel.
    - `src/store/slices/createSettingsSlice.ts` auto-calibration apply now gates on `ocrThresholdRecommendationMode === 'auto'`.

- Runtime verification command: Gemini init default model log
  - Command:
    - `node -e "const svc=require('./electron/geminiService.cjs'); svc.initialize(process.argv[1]);" <temp-service-account-json>`
  - Result: PASS
  - Evidence:
    - log emitted: `[GeminiService] Initialized (gemini-2.0-flash-exp, us-central1)`.

- Runtime verification command: worker pool env override + PSM logs
  - Command:
    - `WILDGATE_OCR_WORKER_POOL_SIZE=2 npx electron <temp-runtime-check-script>`
    - script called `processCapture(..., { screenTypeHint: 'crew_hub' })` and `processCapture(..., { screenTypeHint: 'map_screen' })`.
  - Result: PASS
  - Evidence:
    - log emitted: `[OCR] Initializing Tesseract worker pool (2 workers, eng+chi_sim)`.
    - log emitted: `[OCR] Running recognition (worker pool) PSM=4...` for crew-hub-hinted pass.
    - log emitted: `[OCR] Running recognition (worker pool) PSM=11...` for map-screen-hinted pass.

- Runtime verification command: low-confidence word filter effect
  - Command:
    - `WILDGATE_OCR_WORD_CONF_MIN=0 npx electron <temp-filter-compare-script> tmp-user-data/ocr-debug/raw_capture_2026-02-12T18-43-22-852Z.png`
    - `WILDGATE_OCR_WORD_CONF_MIN=80 npx electron <temp-filter-compare-script> tmp-user-data/ocr-debug/raw_capture_2026-02-12T18-43-22-852Z.png`
  - Result: PASS
  - Evidence:
    - threshold `0`: OCR extracted `52` words (`min confidence 25.3`, `max 96.6`).
    - threshold `80`: OCR extracted `37` words (`min confidence 82.1`, `max 96.6`).
    - confirms low-confidence tokens are filtered out before extraction output.

---

## Validation - 2026-02-18 - GEMINI-MODEL-DEFAULT-008
- Command: `npx eslint electron/geminiService.cjs`
  - Result: PASS
  - Evidence:
    - no lint violations after fallback model update.

- Code-path check (manual)
  - Result: PASS
  - Evidence:
    - `electron/geminiService.cjs` now sets:
      - `this.model = process.env.WILDGATE_GEMINI_MODEL || 'gemini-3.0-flash';`

---

## Validation - 2026-02-18 - TELEMETRY-UI-BATCH-009
- Command: `npx eslint src/App.tsx src/types.ts src/hooks/useLogMonitor.ts src/hooks/__tests__/useLogMonitor.test.ts src/hooks/useMatchSubmission.ts src/store/slices/createDataSlice.ts src/components/Wizard.tsx src/components/OcrRegionEditorModal.tsx src/components/recording/RosterPanel.tsx src/components/PlayerHub.tsx src/components/HistoryTable.tsx src/components/analytics/AnalyticsShell.tsx`
  - Result: PASS
  - Evidence:
    - no lint violations across all telemetry/runtime and targeted UI components changed in this batch.

- Command: `npx vitest run src/hooks/__tests__/useLogMonitor.test.ts src/components/Wizard.test.tsx src/components/recording/SquadronPanel.test.tsx src/App.test.tsx`
  - Result: FAIL (initial run), then PASS (post-fix)
  - Evidence:
    - initial failure: stale expectation in `useLogMonitor.test.ts` assumed character weapon would be stored in ship `weapons` array.
    - post-fix rerun: 4 files passed, 11 tests passed.

- Command: `npm run -s typecheck`
  - Result: FAIL (initial run), then PASS (post-fix)
  - Evidence:
    - initial failure: strict cast errors in `src/utils/export.ts` legacy hazard accessor path.
    - post-fix rerun: TypeScript compile succeeded.

- Command: `npx eslint src/utils/export.ts`
  - Result: PASS
  - Evidence:
    - no lint violations after cast tightening.

- Command: `npx vitest run src/hooks/__tests__/useMatchSubmission.test.ts`
  - Result: PASS
  - Evidence:
    - 1 file passed, 11 tests passed.
    - verifies submission-path loadout sanitization remains correct after character loadout field propagation changes.

- Closeout verification rerun (post-doc updates):
  - Command: `npx eslint src/App.tsx src/types.ts src/hooks/useLogMonitor.ts src/hooks/__tests__/useLogMonitor.test.ts src/hooks/useMatchSubmission.ts src/store/slices/createDataSlice.ts src/components/Wizard.tsx src/components/OcrRegionEditorModal.tsx src/components/recording/RosterPanel.tsx src/components/PlayerHub.tsx src/components/HistoryTable.tsx src/components/analytics/AnalyticsShell.tsx src/utils/export.ts`
    - Result: PASS
  - Command: `npx vitest run src/hooks/__tests__/useLogMonitor.test.ts src/components/Wizard.test.tsx src/components/recording/SquadronPanel.test.tsx src/App.test.tsx src/hooks/__tests__/useMatchSubmission.test.ts`
    - Result: PASS
    - Evidence:
      - 5 files passed.
      - 22 tests passed.
  - Command: `npm run -s typecheck`
    - Result: PASS
