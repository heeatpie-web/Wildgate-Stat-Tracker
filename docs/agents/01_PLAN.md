# Plan - 2026-02-14

1. `COMPLETED` - Reproduce/trace current flow for telemetry decode, artifact bundling, and submission syncing.
2. `COMPLETED` - Implement targeted fixes for artifact bundling and submission artifact synchronization.
3. `COMPLETED` - Add/adjust regression tests for submission artifact sync behavior.
4. `COMPLETED` - Run focused test suite and sanity checks.
5. `COMPLETED` - Summarize performance findings and final handoff with evidence.

## Current Task Plan (Telemetry Performance Profiles)
1. `COMPLETED` - Identify settings, persistence, UI, and main-process monitoring integration points.
2. `COMPLETED` - Add persisted telemetry performance profile setting and Settings UI 3-way toggle.
3. `COMPLETED` - Wire selected profile into `start-log-monitoring` and apply profile-specific monitoring behavior in Electron main.
4. `COMPLETED` - Run targeted validation (tests/typecheck/lint) and document final behavior.

## Current Task Plan (TELEMETRY-BASTION-001)
1. `COMPLETED` - Trace telemetry loadout resolution path and confirm where ship/hero updates are gated.
2. `COMPLETED` - Implement minimal parser fix in `src/hooks/useLogMonitor.ts` for raw-field fallback without GUID.
3. `COMPLETED` - Run targeted validation (`typecheck`, eslint on touched file) and log evidence.
4. `COMPLETED` - Record handoff summary and residual risk.

## Current Task Plan (BUG-BATCH-001)
1. `COMPLETED` - Map reported bug list to concrete code paths and choose first-pass high-impact subset.
2. `COMPLETED` - Fix Smart Captures OCR-apply persistence + fuzzy roster matching + teammate capacity handling.
3. `COMPLETED` - Add Smart Captures manual Wizard entry action and normalize telemetry ship indicator matching.
4. `COMPLETED` - Improve Settings telemetry/capture clarity and strengthen performance-mode render reduction.
5. `COMPLETED` - Run targeted validation and record outcomes.

## Current Task Plan (BUG-BATCH-002)
1. `COMPLETED` - Trace Recording view clipping path and confirm layout threshold/overflow root cause.
2. `COMPLETED` - Update `RecordingView` to use measured container dimensions for density/narrow decisions.
3. `COMPLETED` - Add constrained-height fallback scrolling in wide layout to prevent bottom clipping.
4. `COMPLETED` - Extend `RecordingView` test coverage for constrained-height wide behavior.
5. `COMPLETED` - Run targeted validation and document outcomes.

## Current Task Plan (BUG-BATCH-003)
1. `COMPLETED` - Review current settings section structure and map grouping for tab hierarchy.
2. `COMPLETED` - Add top-level settings tab navigation with overlay-safe tab availability.
3. `COMPLETED` - Gate existing sections by tab (`Identity`, `Interface`, `OCR/Capture`, `Data`) without changing setting behavior.
4. `COMPLETED` - Run targeted validation and record outcomes.

## Current Task Plan (BUG-BATCH-004)
1. `COMPLETED` - Map each remaining open item to concrete implementation files.
2. `COMPLETED` - Implement additional sound indicators via shared cue utility + toast/view hooks.
3. `COMPLETED` - Improve Pro Analytics deep-dive entry reliability with explicit actionable controls.
4. `COMPLETED` - Restore overlay parity by adding mission/squadron/social tab access and quick jumps to relevant full views.
5. `COMPLETED` - Add cross-view transition animation for smoother main view switching.
6. `COMPLETED` - Run targeted validation and record outcomes.

## Current Task Plan (DEV-SPLASH-RETRY-001)
1. `COMPLETED` - Trace all dev startup splash progress writers and confirm root cause of percentage rollback.
2. `COMPLETED` - Implement monotonic splash progress handling so retries never decrease shown percentage.
3. `COMPLETED` - Run targeted validation (`npx eslint electron/main.cjs`) and code-path sanity check.
4. `COMPLETED` - Record execution, validation, and handoff evidence; then release locks.

## Current Task Plan (TAB-LOADING-STARTUP-001)
1. `COMPLETED` - Trace tab-switch render path and confirm source of first-startup "Loading view..." flashes.
2. `COMPLETED` - Add scoped background preloading for lazy dashboard view chunks in `src/App.tsx`.
3. `COMPLETED` - Run targeted validation (`npx eslint src/App.tsx` + `npm run -s typecheck`).
4. `COMPLETED` - Record execution/validation/handoff entries and release lock.

## Current Task Plan (OCR-HYDRATION-COMBINED-001)
1. `COMPLETED` - Implement deterministic OCR alias engine + mapping slice model/actions with compatibility wrapper.
2. `COMPLETED` - Wire persistence/hydration for alias model + new settings flags in `useAppStore`.
3. `COMPLETED` - Integrate resolver/preload controls into `useSmartScan`, `App`, and `SettingsModal`.
4. `COMPLETED` - Add/adjust targeted unit tests for alias engine and mapping slice behavior.
5. `COMPLETED` - Run validation (`eslint` touched files, targeted tests, `typecheck`) and record evidence/handoff.

## Current Task Plan (ADV-AUTOLEARN-V2-001)
1. `COMPLETED` - Extend OCR alias engine + mapping slice with learning event queue/history/rollback lifecycle and resolver explainability metadata.
2. `COMPLETED` - Add advanced settings/state persistence for learning governance, recommendation mode/history, and adaptive preload controls.
3. `COMPLETED` - Integrate learning queue actions into smart-scan/app review flows and extend Review Queue/Settings UI controls.
4. `COMPLETED` - Implement corpus threshold recommendation script + Electron IPC exposure and wire settings apply/revert flow.
5. `COMPLETED` - Upgrade startup preload scheduler to adaptive ordering with local usage telemetry and budget gating.
6. `COMPLETED` - Expand tests (engine + mapping slice) and run validation (`typecheck`, targeted tests, touched-file eslint).

## Current Task Plan (DEV-STARTUP-HOOKS-001)
1. `COMPLETED` - Trace settings crash path and identify hook-order mismatch root cause.
2. `COMPLETED` - Fix hook ordering in `SettingsModal` so hooks execute in stable order across closed/open states.
3. `COMPLETED` - Update dev startup command so Electron launches immediately and splash can render before Vite is ready.
4. `COMPLETED` - Reduce startup blocking by deferring/backgrounding non-critical init in `electron/main.cjs`.
5. `COMPLETED` - Run validation (`typecheck`, targeted eslint) and record evidence.

## Current Task Plan (PROFILE-SETTINGS-MERGE-001)
1. `COMPLETED` - Locate sidebar profile hub and standalone settings entry points.
2. `COMPLETED` - Remove standalone settings navigation button from sidebar.
3. `COMPLETED` - Retarget tutorial settings step to profile hub selector.
4. `COMPLETED` - Run validation (`typecheck`, targeted eslint) and record evidence.

## Current Task Plan (PROFILE-BUTTON-WIDTH-001)
1. `COMPLETED` - Inspect sidebar profile button and nav button container width classes to identify mismatch source.
2. `COMPLETED` - Apply minimal class fix so profile wrapper uses full-width lane.
3. `COMPLETED` - Run targeted validation (`npx eslint src/components/Sidebar.tsx`, `npm run typecheck`).
4. `COMPLETED` - Record execution, validation, and handoff evidence.

## Current Task Plan (OVERLAY-NAV-RECORDING-LAYOUT-001)
1. `COMPLETED` - Trace overlay navigation button handlers and identify forced full-view exits.
2. `COMPLETED` - Update overlay nav controls to in-overlay tab switching and add explicit full-view actions.
3. `COMPLETED` - Rework recording layout ordering so Match Recording renders above Mission Intel.
4. `COMPLETED` - Update/extend targeted RecordingView layout tests for new structure.
5. `COMPLETED` - Run validation (`vitest`, touched-file eslint, `typecheck`) and record evidence.

## Current Task Plan (RECORDING-ROLLBACK-ALIGN-001)
1. `COMPLETED` - Restore Recording view panel placement to prior left-column behavior (with compact Actions/Loadout toggle).
2. `COMPLETED` - Normalize dashboard shell spacing across Analytics/History/Players/Smart Captures to remove top-offset mismatch.
3. `COMPLETED` - Update RecordingView tests to match restored behavior.
4. `COMPLETED` - Run validation (`npx vitest`, touched-file `eslint`, `npm run typecheck`) and record evidence.

## Current Task Plan (OCR-ADAPTIVE-RESOLUTION-001)
1. `COMPLETED` - Implement shared OCR variant/context resolver foundation (`stringUtils` extensions + new shared resolver utility).
2. `COMPLETED` - Integrate shared resolver + canonical dedupe into `useSmartCapture`, `useSmartScan`, and `App` OCR apply flow.
3. `COMPLETED` - Add guarded corpus auto-growth pipeline from OCR review (`preload` allowlist + `main` IPC handler + `OCRReviewModal` fire-and-forget hook).
4. `COMPLETED` - Update security allowlist negative tests and add/expand targeted unit tests for new similarity behavior.
5. `COMPLETED` - Run validation (`typecheck`, touched-file eslint, targeted tests, security-negative tests), record evidence, and finalize handoff.

## Current Task Plan (VERSION-CHANGELOG-001)
1. `COMPLETED` - Locate authoritative app version sources and changelog file.
2. `COMPLETED` - Bump package/app version values to the next release.
3. `COMPLETED` - Add release notes entry for the bumped app version in `src/utils/changelog.ts`.
4. `COMPLETED` - Run targeted validation on touched metadata files and record evidence.

## Current Task Plan (IDMAPPER-TELEMETRY-SHIP-001)
1. `COMPLETED` - Trace ID Mapper badge rendering and telemetry ship GUID/name extraction to identify precise failure points.
2. `COMPLETED` - Patch telemetry ship parsing in `src/hooks/useLogMonitor.ts` to reject non-GUID IDs and improve raw ship-name extraction.
3. `COMPLETED` - Patch `src/components/IdMapper.tsx` to avoid misleading `Unknown` role badge for already mapped IDs.
4. `COMPLETED` - Run targeted validation (`eslint` touched files + `typecheck`) and log evidence.
5. `COMPLETED` - Record execution decisions and handoff summary.

## Current Task Plan (IDMAPPER-TELEMETRY-LOADOUT-002)
1. `COMPLETED` - Update ID mapper unknown-save flow to write type-aware mappings (`players/ships/weapons/equipment`).
2. `COMPLETED` - Expand telemetry loadout extraction to capture weapon/equipment candidates from additional GUID/name fields.
3. `COMPLETED` - Surface telemetry-detected weapons/equipment in `ActionPanel` status summary.
4. `COMPLETED` - Run targeted validation (`eslint` touched files + `typecheck`) and log evidence.
5. `COMPLETED` - Record execution addendum and handoff notes.

## Current Task Plan (DISABLE-RUNTIME-DEVTOOLS-001)
1. `COMPLETED` - Trace all DevTools open paths in Electron main process.
2. `COMPLETED` - Gate runtime `open-devtools` IPC behind explicit env opt-in flag.
3. `COMPLETED` - Run targeted validation (`eslint electron/main.cjs` + `typecheck`).
4. `COMPLETED` - Record execution/validation/handoff.

## Current Task Plan (BUG-BATCH-005)
1. `COMPLETED` - Patch OCR review + Smart Captures flow gaps (overlay layering, opponent/team editing, roster candidate queueing, teammate-capacity fallback, artifact toast spam control, correction-input edit fix).
2. `COMPLETED` - Patch telemetry-to-submission data bundling so wizard edits persist into finalized matches.
3. `COMPLETED` - Patch corpus mode reliability (script resolution for packaged runs, import/list/load refresh robustness, workflow clarity updates, multi-team plain-entry input).
4. `COMPLETED` - Add selected-match merge action in Smart Captures tools.
5. `COMPLETED` - Harden telemetry loadout parsing fallback/coverage for hero/ship/weapon/equipment auto-selection.
6. `COMPLETED` - Run validation (`eslint` touched files, `typecheck`, targeted vitest) and record handoff.

## Current Task Plan (BUG-BATCH-006)
1. `COMPLETED` - Implement durable Smart Capture request channel and wire Header/Wizard/telemetry prompt emitters to it.
2. `COMPLETED` - Mount `ReviewQueueModal` in `App` so recording-panel Intelligence Review opens actionable review UI.
3. `COMPLETED` - Convert telemetry draft result semantics to `Ongoing` and add hydration compatibility migration for old draft rows.
4. `COMPLETED` - Implement Win placement fallback (`#1`) in Smart Captures display and final submission persistence.
5. `COMPLETED` - Add Players-tab pending OCR roster candidate approval/dismiss controls.
6. `COMPLETED` - Enforce teammate-cap consistency for unknown ships and guard telemetry loadout auto-apply to local player context.
7. `COMPLETED` - Exclude ongoing matches from completed-result analytics aggregations and run targeted validation suites.

## Current Task Plan (SMOKE-PERF-CONSENSUS-001)
1. `COMPLETED` - Execute smoke test and capture report evidence.
2. `COMPLETED` - Inspect telemetry/polling/runtime timer code paths for likely thermal load contributors.
3. `COMPLETED` - Record validation evidence and summarize consensus with actionable operator guidance.

## Current Task Plan (THERMAL-FIX-001)
1. `COMPLETED` - Implement dirty-only flush guard in `src/utils/storage.ts` so periodic failsafe writes only run for unsaved state.
2. `COMPLETED` - Fix telemetry log source preference order in `electron/main.cjs` (`Wildgate` first, `Nebula` fallback).
3. `COMPLETED` - Optimize telemetry archive helper to skip no-op writes and reduce repeated full-file parse overhead.
4. `COMPLETED` - Run targeted validation (`npm run -s typecheck`, touched-file `eslint`) and log evidence.
5. `COMPLETED` - Record execution decisions/handoff and release locks.

## Current Task Plan (OCR-ALIAS-CLEANUP-001)
1. `COMPLETED` - Add explicit alias-removal action in mapping slice and keep legacy correction map in sync.
2. `COMPLETED` - Wire Settings alias manager UI with remove action and suspicious manual-add confirmation guard.
3. `COMPLETED` - Add targeted regression test coverage for alias-removal behavior.
4. `COMPLETED` - Run targeted validation (`eslint`, `typecheck`, focused vitest) and record evidence/handoff.

## Current Task Plan (OCR-CORRECTION-POPUP-CLARITY-001)
1. `COMPLETED` - Identify Smart Captures OCR correction popup entry points and define minimal clarity changes.
2. `COMPLETED` - Update OCR review popup content/labels to make correction purpose and usage explicit.
3. `COMPLETED` - Update Smart Captures review CTA wording to emphasize correction/training behavior.
4. `COMPLETED` - Run targeted validation (`eslint` touched files + `typecheck`) and record evidence/handoff.

## Current Task Plan (OCR-CORRECTION-DELETE-002)
1. `COMPLETED` - Extend Smart Captures OCR review popup with first-time guidance, per-name match reason hints, and visible undo controls for edits.
2. `COMPLETED` - Improve legacy wizard correction modal copy/action labels to clarify learning behavior.
3. `COMPLETED` - Add explicit match-delete actions in Smart Captures (single-item and selected bulk) with confirmation prompts.
4. `COMPLETED` - Run targeted validation (`eslint` touched files + `typecheck`) and record execution/handoff evidence.

## Current Task Plan (IQR-PLAYERNAME-001)
1. `COMPLETED` - Patch `ReviewQueueModal` `player_name` confirm/edit/delete behaviors to maintain roster + session reference consistency.
2. `COMPLETED` - Add targeted component regression tests for player-name confirm/edit/delete and roster-candidate safety.
3. `COMPLETED` - Run focused validation (`vitest` target, touched-file `eslint`, `typecheck`) and record evidence.
4. `COMPLETED` - Complete PM feedback cycle entries and handoff docs, then release locks.

## Current Task Plan (POSTMATCH-OCR-GATE-002)
1. `COMPLETED` - Patch `ActionPanel` result-submit flow to replace auto OCR processing with an explicit blocking OCR decision prompt.
2. `COMPLETED` - Add targeted `ActionPanel` regression tests for non-auto OCR and explicit process/continue choices.
3. `COMPLETED` - Run focused validation (`vitest` target, touched-file `eslint`, `typecheck`) and record evidence.
4. `COMPLETED` - Complete PM feedback cycle entries, update handoff docs, and release temporary lock.

## Current Task Plan (POSTMATCH-TELEMETRY-PROMPT-003)
1. `COMPLETED` - Patch telemetry draft post-match result handling in `src/App.tsx` so it always routes through recording submission event flow.
2. `COMPLETED` - Update telemetry post-match prompt copy to explicitly state OCR requires manual action.
3. `COMPLETED` - Run focused validation (`npx eslint src/App.tsx`, `npm run -s typecheck`) and record evidence.
4. `COMPLETED` - Complete execution/validation/handoff entries and release temporary lock.

## Current Task Plan (OCR-TEAM-CAP-GUARD-004)
1. `COMPLETED` - Add centralized teammate sanitization in `createFormSlice` so `setSelectedTeammates` enforces dedupe + capacity limits.
2. `COMPLETED` - Extend `createFormSlice` tests with regression coverage for OCR-like over-registration inputs.
3. `COMPLETED` - Run focused validation (`npx vitest run src/store/slices/__tests__/createFormSlice.test.ts`, touched-file `eslint`, `npm run -s typecheck`).
4. `COMPLETED` - Record execution/validation/handoff and release temporary locks.

## Current Task Plan (REMAINING-UX-TELEMETRY-005)
1. `COMPLETED` - Patch telemetry loadout auto-apply path to set both weapons and equipment in active selection state.
2. `COMPLETED` - Add/adjust recording telemetry indicator copy so auto-selected weapons/equipment are explicitly labeled.
3. `COMPLETED` - Add manual wizard inputs for loadout weapons/equipment persisted via pending match data.
4. `COMPLETED` - Harden OCR opponent-team apply mapping (color normalization/fallback + duplicate suppression).
5. `COMPLETED` - Run focused validation (`vitest` targeted, touched-file `eslint`, `npm run -s typecheck`) and record evidence/handoff.

## Current Task Plan (AUDIT-REMEDIATION-001)
1. `COMPLETED` - Update agent intake/plan/locks for audited remediation scope and confirm file boundaries in dirty worktree.
2. `COMPLETED` - Harden storage and IPC boundary typing (`src/utils/storage.ts`, `src/store/useAppStore.ts`, `src/utils/artifactService.ts`).
3. `COMPLETED` - Remove `@ts-ignore` and replace layout `any` usage in `src/components/DashboardLayout.tsx`.
4. `COMPLETED` - Add shared telemetry archive payload normalizer and migrate renderer consumers (`SimulatorPanel`, `SmartCapturesPanel`) to canonical arrays.
5. `COMPLETED` - Add one-time migration markers for legacy compatibility debt reduction and ensure marker persistence.
6. `COMPLETED` - Run release gate commands (`test`, `build`, `typecheck`) and record validation + handoff + decision entries.

## Current Task Plan (AUDIT-REMEDIATION-002)
1. `COMPLETED` - Record second-pass intake/plan scope focused on runtime OCR/session `any` reduction only.
2. `COMPLETED` - Replace high-risk `any` usage in `useSmartCapture` and `SmartCapturesPanel` OCR processing paths.
3. `COMPLETED` - Replace remaining runtime `any` in `ActionPanel`, `ReviewQueueModal`, `GameDataProvider`, and `createFormSlice` interfaces.
4. `COMPLETED` - Run focused lint + `typecheck`; fix any regressions introduced by tighter typing.
5. `COMPLETED` - Run full release gates (`test`, `build`, `typecheck`) and document execution/validation/handoff/decisions.

## Current Task Plan (AUDIT-REMEDIATION-003)
1. `COMPLETED` - Record follow-up intake scope and claim locks for telemetry runtime typing hardening pass.
2. `COMPLETED` - Remove high-risk `any` usage in `src/hooks/useLogMonitor.ts` telemetry event/status/loadout handling paths.
3. `COMPLETED` - Remove high-risk `any` usage in `src/App.tsx` telemetry retention/prune and idle-callback handling paths.
4. `COMPLETED` - Tighten telemetry status typing in `src/store/slices/createUISlice.ts` and `src/providers/UIStateProvider.tsx`.
5. `COMPLETED` - Run focused validation (`eslint` touched files, `typecheck`, targeted `vitest`) and full gates (`test`, `build`); update execution/validation/handoff/decision logs and release locks.

## Current Task Plan (AUDIT-REMEDIATION-004)
1. COMPLETED - Add intake/locks and implement deterministic opponent color-assignment helper and integrate it in App and Smart Captures OCR apply paths.
2. COMPLETED - Add persisted setting for optional background OCR-after-result mode and wire it into ActionPanel submission flow.
3. COMPLETED - Add and update targeted tests for color assignment and background OCR mode behavior.
4. COMPLETED - Run focused validation (eslint, typecheck, targeted vitest) and full gates (test, build).
5. COMPLETED - Update execution/validation/handoff/decision docs and release locks.

## Current Task Plan (IQR-NAME-SOURCE-001)
1. `COMPLETED` - Add intake/plan/lock entries and confirm narrow scope + acceptance criteria for review-entry provenance.
2. `COMPLETED` - Extend pending review data model and capture pipeline to carry optional source screenshot metadata.
3. `COMPLETED` - Update `ReviewQueueModal` UI to display per-entry source provenance and open source screenshot preview.
4. `COMPLETED` - Add focused regression coverage for source screenshot affordance and preserve existing review actions.
5. `COMPLETED` - Run focused validation (`vitest` target, touched-file `eslint`, `typecheck`) and record execution/validation/handoff/decision entries.

## Current Task Plan (RESULT-HOOK-CRASH-310-001)
1. `COMPLETED` - Record intake/plan/locks for the result-button crash fix and confirm scope boundaries.
2. `COMPLETED` - Patch `src/components/Wizard.tsx` to enforce stable hook ordering across closed/open states.
3. `COMPLETED` - Add focused regression test for result-triggered wizard open transition.
4. `COMPLETED` - Run focused validation (`vitest`, touched-file `eslint`, `typecheck`) and capture evidence.
5. `COMPLETED` - Update execution/validation/handoff/decisions logs and release locks.

## Current Task Plan (WIZARD-HOOK-AUDIT-002)
1. `COMPLETED` - Record intake/plan/locks and audit wizard/modal components for hook-order guard regressions.
2. `COMPLETED` - Add focused transition regression tests for remaining wizard-style modal flows.
3. `COMPLETED` - Run focused validation (`vitest`, touched-file `eslint`, `typecheck`) and capture evidence.
4. `COMPLETED` - Update execution/validation/handoff/decision logs and release locks.

## Current Task Plan (OCR-TEAM-CAP-HARDEN-006)
1. `COMPLETED` - Add a shared ship-capacity teammate-cap utility and wire it into OCR/wizard/session paths that can still carry uncapped teammate arrays.
2. `COMPLETED` - Apply cap utility to submission boundary (`useMatchSubmission`) and Smart Captures rerun/update paths to prevent oversized teammate writes.
3. `COMPLETED` - Add focused regression tests for cap utility behavior (dedupe + ship/fallback limits).
4. `COMPLETED` - Run targeted validation (`vitest` focused, touched-file `eslint`, `typecheck`) and record evidence in `03_VALIDATION`.
5. `COMPLETED` - Complete execution log + PM feedback cycle + handoff updates and release locks.

## Current Task Plan (REFACTOR-CLOSEOUT-007)
1. `COMPLETED` - Audit the combined dirty refactor state and determine whether unresolved runtime/build/test issues remain.
2. `COMPLETED` - Run full quality gates (`npm run -s ci:quality`) against the integrated refactor state.
3. `COMPLETED` - Apply only gate-driven fixes if failures occur, then re-run failing gates to green.
4. `COMPLETED` - Record execution, validation evidence, and PM feedback cycle entries for closeout.
5. `COMPLETED` - Publish final handoff summary and release temporary closeout locks.

## Current Task Plan (AUDIT-REMEDIATION-005)
1. `COMPLETED` - Record intake/lock claims and patch remaining `any` + console/runtime hardening issues in target files.
2. `COMPLETED` - Replace ad-hoc telemetry archive shape parsing in Electron artifact helper flow with shared normalizer usage.
3. `COMPLETED` - Add one-time legacy localStorage migration-check marker and preserve startup compatibility behavior.
4. `COMPLETED` - Run focused validation (`eslint` touched files, targeted `vitest`, `typecheck`) and then `npm run -s ci:quality`.
5. `COMPLETED` - Update execution/validation/handoff/decision logs and release temporary locks.

## Current Task Plan (MODERATE-REMEDIATION-006)
1. `COMPLETED` - Record intake/locks and patch runtime issues: silent catches, logger persistence handling, toast accessibility, and env-backed config constants.
2. `COMPLETED` - Add/expand tests for `StorageService`, `useLogMonitor`, `useSmartCapture`, and `App.tsx`.
3. `COMPLETED` - Run focused validation (`vitest` targets + touched-file `eslint`) and full compile/test checks (`typecheck`, `test` as needed).
4. `COMPLETED` - Update execution/validation/handoff/decisions entries and release temporary locks.

## Current Task Plan (FOLLOWUP-REMEDIATION-008)
1. `COMPLETED` - Record intake/locks and patch remaining defaults/config issues (auto-backup default + additional env-backed runtime timers).
2. `COMPLETED` - Add accessibility labels to remaining icon-only controls in primary interaction components.
3. `COMPLETED` - Run focused validation (`eslint` touched files + targeted tests) and then full quality checks (`typecheck`, `test`, `build`).
4. `COMPLETED` - Update execution/validation/handoff/decisions artifacts and release temporary locks.

## Current Task Plan (CORPUS-IMPORT-DIR-009)
1. `COMPLETED` - Record intake/locks and patch corpus import dialog default path to corpus images directory.
2. `COMPLETED` - Run focused validation (`eslint` touched file + `typecheck`) and confirm import flow semantics are unchanged.
3. `COMPLETED` - Update execution/validation/handoff/decision artifacts and release temporary locks.

## Current Task Plan (OCR-DUAL-BUFFER-GATES-010)
1. `COMPLETED` - Wire dual-buffer Crew Hub extraction so OCR text uses preprocessed buffer while team-color detection uses color-fidelity source.
2. `COMPLETED` - Enforce strict OCR merge/apply guardrails (confidence gating, dedupe, teammate/per-team caps) in app-side commit boundaries.
3. `COMPLETED` - Add targeted regression tests for OCR merge/player cap behavior and keep hazard flow untouched.
4. `COMPLETED` - Run focused validation (`vitest` target, touched-file `eslint`, `typecheck`) and record evidence.
5. `COMPLETED` - Update execution, decisions, handoff, and release temporary locks.

## Current Task Plan (OCR-ROI-RUNTIME-011)
1. `COMPLETED` - Add persisted OCR ROI settings model (defaults + setters + reset) and hydrate/persist in store.
2. `COMPLETED` - Add OCR ROI adjustment controls in Settings modal with immediate state updates.
3. `COMPLETED` - Thread ROI overrides through OCR IPC (`ocr-process-capture`, rerun handler) and apply in extractors.
4. `COMPLETED` - Update OCR call sites/rerun call sites to pass live ROI settings.
5. `COMPLETED` - Add focused regression tests for rerun payload and run validation (`eslint`, `typecheck`, targeted `vitest`), then update docs and release locks.

## Current Task Plan (OCR-CORPUS-ROI-012)

## Current Task Plan (RECOVERY-CONTINUATION-001)
1. `COMPLETED` - Fix immediate runtime stability blockers (Settings hook-order crash hardening, DB rename retry/fallback, log-monitor idempotent start behavior).
2. `COMPLETED` - Resolve shell/layout usability regressions (History/other scroll containers, recording default-size vertical panel + shrink-mode tab switching, mission damage label copy updates).
3. `COMPLETED` - Complete Smart Captures UX fixes (queue ID removal, selected-row emphasis, confidence meter clipping, tools-pane OCR debug access).
4. `COMPLETED` - Implement cloud OCR degradation behavior (cloud/hybrid failure auto-fallback to local, surfaced fallback metadata/status).
5. `COMPLETED` - Ship identity/onboarding polish (sidebar profile username visibility, startup intro gating until tutorial completion).
6. `COMPLETED` - Replace app/tray/build icons with splash-style gradient W assets and bump release version/changelog.
7. `COMPLETED` - Run focused + full validation gates, then update execution/validation/handoff/decision evidence and release locks.
1. `COMPLETED` - Wire Dev OCR corpus pipeline invoke payload to include live `ocrRegions`.
2. `COMPLETED` - Thread optional `ocrRegions` in Electron `ocr-corpus-run-pipeline` and pass to `processCapture(...)`.
3. `COMPLETED` - Run focused validation (`eslint` touched files, `typecheck`) and update execution/validation/handoff docs.

## Current Task Plan (OCR-ENHANCEMENT-T1-013)
1. `COMPLETED` - Implement Tier 1 #1 cache telemetry in `electron/ocrHandler.cjs`, expose IPC handler, and wire polling display in `src/components/DevOCRPanel.tsx`.
2. `COMPLETED` - Implement Tier 1 #2 keyboard shortcuts in `src/hooks/useKeyboardShortcuts.ts` and `src/components/OcrCorrectionModal.tsx`.
3. `COMPLETED` - Implement Tier 1 #3 confidence meter component and replace modal confidence text badge usage.
4. `COMPLETED` - Implement Tier 1 #4 alias learning metadata helper and modal learning badge tooltip.
5. `COMPLETED` - Run focused validation (`eslint` touched files, targeted `vitest`, `typecheck`) and capture evidence.
6. `COMPLETED` - Update execution/validation/handoff docs, complete PM feedback cycle, and release locks.

## Current Task Plan (OCR-ENHANCEMENT-T2-014)
1. `COMPLETED` - Record intake/plan and lock updates for Tier 2 #5 benchmark increment, then confirm benchmark design points in existing OCR pipeline.
2. `COMPLETED` - Implement benchmark helpers + `benchmark-ocr-preprocessing` IPC handler in `electron/ocrHandler.cjs` without changing production extraction flow.
3. `COMPLETED` - Expose new benchmark IPC in `electron/preload.cjs` and sync allowlist fixture in `scripts/security_negative_tests.cjs`.
4. `COMPLETED` - Add Dev OCR panel benchmark action + result display for loaded image runs.
5. `COMPLETED` - Run focused validation (`eslint` touched files, `node scripts/security_negative_tests.cjs`, `npm run -s typecheck`) and record evidence.
6. `COMPLETED` - Complete execution log/PM feedback/handoff/decision updates and release temporary lock entries.

## Current Task Plan (OCR-ENHANCEMENT-T2-015)
1. `COMPLETED` - Record intake/plan and claim any additional non-lane locks; confirm current OCR correction/store wiring points for calibration sample insertion.
2. `COMPLETED` - Add calibration utility module (`src/utils/ocrCalibration.ts`) with sample normalization, bucketing, recommendation, and bounded append helpers.
3. `COMPLETED` - Extend settings/store persistence (`createSettingsSlice.ts`, `useAppStore.ts`) for `ocrCalibrationSamples` and sample-record action.
4. `COMPLETED` - Record calibration samples in `OcrCorrectionModal.tsx` when corrections are applied.
5. `COMPLETED` - Add Dev OCR panel calibration visualization (bucket accuracy + recommended threshold).
6. `COMPLETED` - Add focused tests for calibration utility behavior and run validation (`eslint` touched files, targeted `vitest`, `typecheck`).
7. `COMPLETED` - Complete execution/validation/handoff/decision updates, PM feedback cycle, and release temporary lock entries.

## Current Task Plan (OCR-ENHANCEMENT-T2-016)
1. `COMPLETED` - Record intake/plan and claim non-lane locks; confirm batch-action insertion points in settings persistence and correction modal flow.
2. `COMPLETED` - Add persisted setting `ocrBatchAcceptThreshold` and setter in `createSettingsSlice.ts` + `useAppStore.ts`.
3. `COMPLETED` - Create `src/components/BatchActionConfirmDialog.tsx` using existing modal/dialog visual patterns.
4. `COMPLETED` - Implement threshold slider, eligible counts, batch accept/ignore handlers, and confirmation wiring in `src/components/OcrCorrectionModal.tsx`.
5. `COMPLETED` - Add/adjust focused tests for batch action behavior and run validation (`eslint` touched files, targeted `vitest`, `typecheck`).
6. `COMPLETED` - Complete execution/validation/handoff/decision updates, PM feedback cycle, and release temporary lock entries.


## Current Task Plan (OCR-ENHANCEMENT-T2-017)
1. `COMPLETED` - Record intake/plan updates and claim temporary locks for Tier 2 #8 bounding-box overlay increment.
2. `COMPLETED` - Add optional `includeBboxes` handling in `electron/ocrHandler.cjs` and emit typed bbox debug payload only for debug runs.
3. `COMPLETED` - Extend OCR bridge/types for optional runtime debug options and bbox debug response shape.
4. `COMPLETED` - Create `src/components/OcrBoundingBoxOverlay.tsx` interactive overlay with confidence color coding + selection details.
5. `COMPLETED` - Wire `src/components/DevOCRPanel.tsx` with "Capture with Bounding Boxes" action and overlay rendering.
6. `COMPLETED` - Run focused validation (`eslint`, `typecheck`, targeted checks/tests), then update AGENTS execution/validation/handoff/decision artifacts and release locks.

## Current Task Plan (OCR-ENHANCEMENT-T3-018)
1. `COMPLETED` - Record intake/plan updates and claim temporary locks for Tier 3 #9 corpus export increment.
2. `COMPLETED` - Add `src/utils/ocrCorpusBuilder.ts` with alias-model corpus builder and JSONL/BOX serialization helpers.
3. `COMPLETED` - Extend `src/utils/export.ts` with text export helper for `.jsonl`/`.box` artifacts.
4. `COMPLETED` - Wire `src/components/DevOCRPanel.tsx` corpus action to export correction corpus files from `ocrAliasModel`.
5. `COMPLETED` - Add opt-in OCR sample archive helper/path in `electron/ocrHandler.cjs` runtime options flow.
6. `COMPLETED` - Add focused corpus builder tests and run validation (`eslint`, targeted `vitest`, `typecheck`), then update AGENTS docs and release locks.

## Current Task Plan (OCR-ENHANCEMENT-T3-019)
1. `COMPLETED` - Record intake/plan/log updates and claim temporary locks for Tier 3 #10 dictionary generation increment.
2. `COMPLETED` - Add `electron/tesseractDictionary.cjs` helper to build user-words file from pilot registry and match-history frequency weighting.
3. `COMPLETED` - Integrate dictionary generation/application IPC in `electron/ocrHandler.cjs` and apply dictionary parameters to existing/new Tesseract workers.
4. `COMPLETED` - Add preload/security allowlist parity for `regenerate-ocr-dictionary`.
5. `COMPLETED` - Wire renderer usage: auto-regeneration effect in `src/providers/GameDataProvider.tsx` and manual action button in `src/components/DevOCRPanel.tsx`.
6. `COMPLETED` - Run focused validation (`eslint` touched files, security negative tests, `typecheck`) and update AGENTS execution/validation/handoff/decision artifacts, then release locks.

## Current Task Plan (OCR-ENHANCEMENT-T3-020)
1. `COMPLETED` - Record intake/plan/log updates and claim temporary locks for Tier 3 #11 pattern-recognition increment.
2. `COMPLETED` - Add `src/utils/patternRecognition.ts` co-occurrence/suggestion utility and focused tests.
3. `COMPLETED` - Wire teammate suggestion panel and click-to-apply behavior in `src/components/OcrCorrectionModal.tsx`.
4. `COMPLETED` - Add Dev OCR pattern insight summary in `src/components/DevOCRPanel.tsx`.
5. `COMPLETED` - Run focused validation (`eslint` touched files, targeted `vitest`, `typecheck`) and update AGENTS execution/validation/handoff/decision artifacts, then release temporary locks.

## Current Task Plan (OCR-ENHANCEMENT-T3-021)
1. `COMPLETED` - Record intake/plan/execution updates and claim temporary locks for Tier 3 #12 accessibility foundation increment.
2. `COMPLETED` - Add shared accessibility foundations (`useFocusTrap`, `useAriaLiveRegion`, `accessibility.css`, `accessibilityAudit` utility + focused tests).
3. `COMPLETED` - Apply dialog semantics, focus trapping, and keyboard close behavior to targeted modal components.
4. `COMPLETED` - Add Dev OCR panel accessibility-audit action with issue summary/detail rendering.
5. `COMPLETED` - Run focused validation (`eslint` touched files, targeted `vitest`, `typecheck`) and capture evidence.
6. `COMPLETED` - Complete AGENTS execution/validation/handoff/decision updates, PM feedback cycle, and release temporary lock entries.

## Current Task Plan (OCR-ENHANCEMENT-T3-022)
1. `COMPLETED` - Record intake/plan/execution updates and claim temporary lock for OCRReviewModal accessibility hardening increment.
2. `COMPLETED` - Add focus trap + keyboard Escape handling and dialog ARIA semantics to `src/components/ocr/OCRReviewModal.tsx` (including screenshot lightbox dialog state).
3. `COMPLETED` - Add/adjust focused tests in `src/components/ocr/OCRReviewModal.test.tsx` for dialog semantics and Escape behavior.
4. `COMPLETED` - Run focused validation (`eslint` touched files, targeted `vitest`, `typecheck`) and capture evidence.
5. `COMPLETED` - Complete AGENTS execution/validation/handoff/decision updates, PM feedback cycle, and release temporary lock entries.

## Current Task Plan (OCR-ENHANCEMENT-T3-023)
1. `COMPLETED` - Record intake/plan updates and claim temporary locks for targeted overlay accessibility hardening increment.
2. `COMPLETED` - Add dialog semantics, focus-trap wiring, and Escape-close behavior in `src/components/DrillDownOverlay.tsx` and App-level changelog/ID mapper wrappers in `src/App.tsx`.
3. `COMPLETED` - Add focused regression tests in `src/components/DrillDownOverlay.test.tsx` and `src/App.test.tsx`.
4. `COMPLETED` - Run focused validation (`eslint` touched files, targeted `vitest`, `typecheck`) and capture evidence.
5. `COMPLETED` - Complete AGENTS execution/validation/handoff/decision updates, PM feedback cycle, and release temporary lock entries.

## Current Task Plan (OCR-ENHANCEMENT-T3-024)
1. `COMPLETED` - Record intake/plan updates and claim temporary locks for tutorial + match-lightbox accessibility increment.
2. `COMPLETED` - Add dialog semantics, focus-trap wiring, and Escape behavior in `src/components/Tutorial.tsx` and `src/components/MatchRecordingPage.tsx`.
3. `COMPLETED` - Add focused regression tests in `src/components/Tutorial.test.tsx` and `src/components/MatchRecordingPage.test.tsx`.
4. `COMPLETED` - Run focused validation (`eslint` touched files, targeted `vitest`, `typecheck`) and capture evidence.
5. `COMPLETED` - Complete AGENTS execution/validation/handoff/decision updates, PM feedback cycle, and release temporary lock entries.

## Current Task Plan (OCR-ENHANCEMENT-T3-025)
1. `COMPLETED` - Add intake/plan/execution records and claim temporary locks for ROI editor + targeted UI regression files.
2. `COMPLETED` - Implement full-resolution visual ROI editor (draw/drag/resize) and wire it into `SettingsModal` ROI controls.
3. `COMPLETED` - Fix players view vertical fill behavior in `PlayerHub` (and wrapping layout classes if required).
4. `COMPLETED` - Fix Dev OCR Utilities overflow/cutoff behavior in `DevOCRPanel`.
5. `COMPLETED` - Fix OCR modal top cutoff and OCR correction input focus/typing regression in correction/review modal flows.
6. `COMPLETED` - Run focused validation (`eslint` touched files, targeted `vitest`, `typecheck`) and collect evidence.
7. `COMPLETED` - Complete AGENTS execution/validation/handoff/decision updates, PM feedback cycle, and release temporary locks.

## Current Task Plan (EMERGENCY-BATCH-2026-02-18-001)
1. COMPLETED - Apply core runtime stabilizers: settings-open crash guard, telemetry loadout parsing/selection reliability, and smart-capture prompt retry behavior.
2. COMPLETED - Implement data-integrity and precedence fixes: teammate persistence across matches, manual-over-OCR authority, and fuzzy-edit safety for manual names.
3. COMPLETED - Implement UX/flow fixes: wizard controlled loadout selectors, OCR debug availability without dev-mode gate, overlay/header capture affordance parity, and confidence/queue readability.
4. COMPLETED - Implement restore-session startup flow with full draft restore/discard options.
5. COMPLETED - Patch analytics + ID mapper regressions and bump app version.
6. COMPLETED - Run focused validation (eslint/typecheck/targeted vitest) and document evidence.
7. COMPLETED - Complete execution/validation/handoff/decisions updates and release locks.

## Current Task Plan (OCR-DRAG-REVIEW-002)
1. `COMPLETED` - Add shared immutable opponent-team player transfer utility and focused tests.
2. `COMPLETED` - Wire drag/drop player reassignment between opponent teams in `src/components/ocr/OCRReviewModal.tsx`.
3. `COMPLETED` - Wire drag/drop player reassignment between enemy teams in `src/components/SmartCapturesPanel.tsx`.
4. `COMPLETED` - Make OCR review screenshot reference section sticky while editing and preserve lightbox behavior.
5. `COMPLETED` - Run focused validation (`eslint` touched files, targeted `vitest`, `typecheck`) and record evidence.
6. `COMPLETED` - Update execution/validation/handoff/decision docs and release temporary locks.

## Current Task Plan (OCR-WIZARD-REASSIGN-003)
1. COMPLETED - Add team-assignment state and drag/drop opponent/player reassignment UI in src/components/OcrCorrectionModal.tsx.
2. COMPLETED - Add team ship selectors and apply updated team/ship assignments back into session state on submit.
3. COMPLETED - Add sticky screenshot reference strip + lightbox in src/components/OcrCorrectionModal.tsx.
4. COMPLETED - Wire src/components/Wizard.tsx to pass available screenshot artifacts to OcrCorrectionModal.
5. COMPLETED - Add/adjust focused tests for OcrCorrectionModal interactions and run validation (eslint, targeted vitest, typecheck).
6. COMPLETED - Update execution/validation/handoff/decisions docs and release temporary locks.

## Current Task Plan (TELEMETRY-LOADOUT-INDICATORS-004)
1. COMPLETED - Harden telemetry loadout extraction in src/hooks/useLogMonitor.ts for nested weapon/equipment payload shapes and broader name matching.
2. COMPLETED - Add explicit auto-selected weapon/equipment indicators to src/components/recording/SquadronPanel.tsx (standard + compact).
3. COMPLETED - Add focused regression tests for nested telemetry loadout extraction and SquadronPanel indicator rendering.
4. COMPLETED - Run focused validation (eslint, targeted vitest, typecheck) and record evidence in docs/agents/03_VALIDATION.md.
5. COMPLETED - Update execution/handoff/decisions logs and release temporary locks.

## Current Task Plan (ANALYTICS-ARTIFACT-IDFLOW-005)
1. COMPLETED - Expand analytics overview narrative/actionability and improve bar-chart color differentiation/readability across targeted analytics views.
2. COMPLETED - Patch active-times interaction behavior in TimePattern charts so tooltip feedback is isolated to hovered bars.
3. COMPLETED - Harden historical artifact repair helper with timestamp normalization/window fallback and per-item failure tolerance.
4. COMPLETED - Implement fuzzy-match and ID-info auto-prompt flow plus review prioritization polish (`App`, `ReviewQueueModal`, `IdMapper`).
5. COMPLETED - Run focused validation (`eslint`, targeted `vitest`, `typecheck`) and capture evidence.
6. COMPLETED - Update execution/validation/handoff/decisions artifacts and PM feedback cycle entries.

## Current Task Plan (RECOVERY-CONTINUATION-006)
1. `COMPLETED` - Reproduce remaining gate failure and isolate stale expectation(s) without changing runtime behavior.
2. `COMPLETED` - Patch stale queue test expectation to match hidden raw-ID queue contract.
3. `COMPLETED` - Run focused test and full `npm run -s ci:quality` release gates.
4. `COMPLETED` - Update execution/validation/handoff/decision artifacts for continuation closeout.

## Current Task Plan (OCR-SYSTEM-IMPROVEMENTS-007)
1. `COMPLETED` - Apply baseline OCR config fixes: Gemini default model, fuzzy-match cap + tests, and renderer `runtimeConfig.ocr` section.
2. `COMPLETED` - Update `electron/ocrHandler.cjs` with env-driven OCR constants, low-confidence word filtering, PSM-aware OCR calls, and async dictionary-file resolution.
3. `COMPLETED` - Parallelize map-screen extraction region OCR path while preserving existing extraction mutation order.
4. `COMPLETED` - Stop alias legacy dual-write in mapping slice and add hydration-time migration + compaction in `useAppStore.ts`.
5. `COMPLETED` - Add calibration recommendation auto-apply action/trigger wiring in `createSettingsSlice.ts`.
6. `COMPLETED` - Run targeted validation commands, document evidence in AGENTS logs, and release temporary locks.

## Current Task Plan (GEMINI-MODEL-DEFAULT-008)
1. `COMPLETED` - Locate current Gemini default-model assignment.
2. `COMPLETED` - Update fallback model string to `gemini-3.0-flash` in `electron/geminiService.cjs`.
3. `COMPLETED` - Run focused lint check and record evidence.
