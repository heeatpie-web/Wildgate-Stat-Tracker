# Work Locks

Use this file to temporarily claim high-conflict files while an agent is actively editing them.

Rules:
- Add a lock before editing hot/shared files.
- Keep scope narrow (single file or small related set).
- Remove lock as soon as step is complete (or commit is complete).
- If lock is stale, create an entry in `docs/agents/BLOCKERS.md` and wait for project-manager reassignment.
- Owner names for active locks are role-based: `project-manager`, `ui-designer`, `builder`, `debugger`, `release-manager`.
- Optional support roles when staffing allows: `verifier`, `reporter` (or `verifier` dual-hats `release-manager` if staffing constrained).
- Only edit `Active Locks` and append to `Recent Lock History`; do not rewrite historical rows.
- One lock row per file path (no grouped wildcard locks).
- OCR-only mode enforcement: each lock purpose must state OCR scope justification.
- Out-of-scope lock attempts must be rejected and logged in `docs/agents/BLOCKERS.md`.
- Integration/release artifacts (`docs/agents/03_VALIDATION.md`, `docs/agents/04_HANDOFF.md`, release notes/checklists) require `release-manager` lock ownership during RC assembly unless PM explicitly delegates.

## Active Locks

| File | Owner | Started (UTC) | Purpose |
|---|---|---|---|
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-13T16:00:00Z | Lane A PM ownership; scope and intake control per 01_PLAN |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-13T16:00:00Z | Lane A PM ownership; plan, steps, approvals, role assignment |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-13T16:00:00Z | Lane A PM ownership; governance and arbitration |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-13T21:00:00Z | Lane D debugger role bound; execution log and validation handoff per 01_PLAN |
| `docs/agents/03_VALIDATION.md` | debugger | 2026-02-13T21:00:00Z | Lane D debugger role bound; validation evidence and regression checks per 01_PLAN |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-13T20:35:00Z | Release-manager ownership; handoff assembly and RC summary |
| `docs/agents/BLOCKERS.md` | debugger | 2026-02-13T21:00:00Z | Lane D debugger role bound; blocker logging and repro per 01_PLAN |
| `docs/WORKLOCKS.md` | debugger | 2026-02-13T21:00:00Z | Lane D debugger role bound; lock table maintenance per 01_PLAN |
| `dataset/ocr-corpus/` | debugger | 2026-02-13T21:00:00Z | Lane D debugger role bound; OCR corpus, baseline, reports per 01_PLAN |
| src/components/ocr/OCRReviewModal.tsx | ui-designer | 2026-02-13T15:30:00Z | ui-designer role bound: OCR UX and correction flow ownership (Lane B) |
| src/components/OcrCorrectionModal.tsx | ui-designer | 2026-02-13T15:30:00Z | ui-designer role bound: OCR UX and correction flow ownership (Lane B) |
| src/components/DevOCRPanel.tsx | ui-designer | 2026-02-13T15:30:00Z | ui-designer role bound: OCR UX and dev panel/corpus ownership (Lane B) |
| `electron/ocrHandler.cjs` | builder | 2026-02-13T15:35:00Z | builder role bound: OCR pipeline and capture ownership (Lane C) |
| `electron/geminiService.cjs` | builder | 2026-02-13T15:35:00Z | builder role bound: OCR/structured refinement ownership (Lane C) |
| `src/hooks/useSmartCapture.ts` | builder | 2026-02-13T15:35:00Z | builder role bound: smart capture flow ownership (Lane C) |
| `src/components/recording/ActionPanel.tsx` | builder | 2026-02-13T15:35:00Z | builder role bound: recording/action panel ownership (Lane C) |

## Copy-Paste Lock Entry

Use this row format when claiming:

| File | Owner | Started (UTC) | Purpose |
|---|---|---|---|
| path/to/file | ui-designer | 2026-02-12T16:20:00Z | one-line reason |

## Lock Release

- Delete the active row from `Active Locks`.
- Add it to `Recent Lock History` with `Released (UTC)`.

## Recent Lock History

| File | Owner | Started (UTC) | Released (UTC) | Purpose |
|---|---|---|---|---|
| `src/hooks/useLogMonitor.ts` | debugger | 2026-02-15T17:00:00Z | 2026-02-15T17:16:00Z | Telemetry scope: add loadout weapon/equipment extraction + safer unknown registration |
| `src/components/IdMapper.tsx` | debugger | 2026-02-15T17:00:00Z | 2026-02-15T17:16:00Z | Mapper scope: type-aware unknown-ID save routing to UID domain mappings |
| `src/components/recording/ActionPanel.tsx` | debugger | 2026-02-15T17:00:00Z | 2026-02-15T17:16:00Z | Recording scope: show telemetry-detected weapons/equipment in status summary |
| `src/hooks/useLogMonitor.ts` | debugger | 2026-02-15T16:49:48Z | 2026-02-15T16:54:07Z | Telemetry scope: fix ship GUID/name resolution causing UNKNOWN ID spam and sticky ship detection |
| `src/components/IdMapper.tsx` | debugger | 2026-02-15T16:49:48Z | 2026-02-15T16:54:07Z | Mapper scope: remove misleading UNKNOWN role badge for mapped IDs without relationship data |
| `src/utils/stringUtils.ts` | builder | 2026-02-15T19:10:00Z | 2026-02-15T19:45:00Z | OCR scope: add variant similarity functions for adaptive name resolution |
| `src/utils/ocrNameResolver.ts` | builder | 2026-02-15T19:10:00Z | 2026-02-15T19:45:00Z | OCR scope: shared resolver utility (variant/context/dedupe support) |
| `src/hooks/useSmartScan.ts` | builder | 2026-02-15T19:10:00Z | 2026-02-15T19:45:00Z | OCR scope: integrate shared resolver in smart scan path |
| `src/App.tsx` | builder | 2026-02-15T19:10:00Z | 2026-02-15T19:45:00Z | OCR scope: integrate shared resolver in OCR apply flow |
| `electron/main.cjs` | builder | 2026-02-15T19:10:00Z | 2026-02-15T19:45:00Z | OCR scope: guarded corpus auto-ingest IPC handler for OCR review corrections |
| `electron/preload.cjs` | builder | 2026-02-15T19:10:00Z | 2026-02-15T19:45:00Z | OCR scope: allowlist new corpus auto-ingest invoke channel |
| `scripts/security_negative_tests.cjs` | builder | 2026-02-15T19:10:00Z | 2026-02-15T19:45:00Z | OCR scope: keep IPC/security allowlist tests aligned for new channel |
| `src/utils/__tests__/stringUtils.test.ts` | builder | 2026-02-15T19:10:00Z | 2026-02-15T19:45:00Z | OCR scope: add regression tests for variant matching functions |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-15T12:20:10Z | 2026-02-15T12:22:40Z | RECORDING-ROLLBACK-ALIGN-001: document selective rollback + shell normalization decision |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-15T12:20:10Z | 2026-02-15T12:22:40Z | RECORDING-ROLLBACK-ALIGN-001: add handoff summary for rollback/alignment patch |
| `docs/agents/03_VALIDATION.md` | debugger | 2026-02-15T12:20:10Z | 2026-02-15T12:22:40Z | RECORDING-ROLLBACK-ALIGN-001: record vitest/eslint/typecheck evidence |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-15T12:20:10Z | 2026-02-15T12:22:40Z | RECORDING-ROLLBACK-ALIGN-001: execution lifecycle + PM feedback cycle |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-15T12:20:10Z | 2026-02-15T12:22:40Z | RECORDING-ROLLBACK-ALIGN-001: add task plan steps |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-15T12:20:10Z | 2026-02-15T12:22:40Z | RECORDING-ROLLBACK-ALIGN-001: add intake/scope/done condition |
| `src/components/smart-captures/SmartCapturesShell.tsx` | debugger | 2026-02-15T12:17:20Z | 2026-02-15T12:19:20Z | RECORDING-ROLLBACK-ALIGN-001: remove duplicate top-level shell padding |
| `src/components/PlayerHub.tsx` | debugger | 2026-02-15T12:17:20Z | 2026-02-15T12:19:20Z | RECORDING-ROLLBACK-ALIGN-001: remove duplicate top-level shell padding |
| `src/components/HistoryTable.tsx` | debugger | 2026-02-15T12:17:20Z | 2026-02-15T12:19:20Z | RECORDING-ROLLBACK-ALIGN-001: normalize root h/overflow contract for shell alignment |
| `src/components/analytics/AnalyticsShell.tsx` | debugger | 2026-02-15T12:17:20Z | 2026-02-15T12:19:20Z | RECORDING-ROLLBACK-ALIGN-001: remove duplicate top-level shell padding |
| `src/components/RecordingView.test.tsx` | debugger | 2026-02-15T12:15:40Z | 2026-02-15T12:19:20Z | RECORDING-ROLLBACK-ALIGN-001: restore tests for prior recording panel placement behavior |
| `src/components/RecordingView.tsx` | debugger | 2026-02-15T12:15:40Z | 2026-02-15T12:19:20Z | RECORDING-ROLLBACK-ALIGN-001: move Match Recording panel back to left shell with compact tab toggle |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-15T12:10:30Z | 2026-02-15T12:13:20Z | OVERLAY-NAV-RECORDING-LAYOUT-001: record architecture decision for explicit full-view actions |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-15T12:10:30Z | 2026-02-15T12:13:20Z | OVERLAY-NAV-RECORDING-LAYOUT-001: add handoff closure and risks |
| `docs/agents/03_VALIDATION.md` | debugger | 2026-02-15T12:10:30Z | 2026-02-15T12:13:20Z | OVERLAY-NAV-RECORDING-LAYOUT-001: log test/lint/typecheck evidence |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-15T12:10:30Z | 2026-02-15T12:13:20Z | OVERLAY-NAV-RECORDING-LAYOUT-001: execution lifecycle + PM feedback record |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-15T12:10:30Z | 2026-02-15T12:13:20Z | OVERLAY-NAV-RECORDING-LAYOUT-001: plan steps and completion state |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-15T12:10:30Z | 2026-02-15T12:13:20Z | OVERLAY-NAV-RECORDING-LAYOUT-001: intake constraints/done condition |
| `src/components/RecordingView.test.tsx` | debugger | 2026-02-15T12:03:50Z | 2026-02-15T12:10:00Z | OVERLAY-NAV-RECORDING-LAYOUT-001: update layout tests for action/mission ordering |
| `src/components/RecordingView.tsx` | debugger | 2026-02-15T12:02:40Z | 2026-02-15T12:10:00Z | OVERLAY-NAV-RECORDING-LAYOUT-001: move match recording panel above mission intel |
| `src/components/OverlayView.tsx` | debugger | 2026-02-15T12:01:20Z | 2026-02-15T12:10:00Z | OVERLAY-NAV-RECORDING-LAYOUT-001: keep overlay tab switches in-overlay and add explicit open-full actions |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-15T11:56:00Z | 2026-02-15T11:58:20Z | PROFILE-BUTTON-WIDTH-001: record minimal scope decision for wrapper-width fix |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-15T11:56:00Z | 2026-02-15T11:58:20Z | PROFILE-BUTTON-WIDTH-001: add handoff summary for sidebar width parity |
| `docs/agents/03_VALIDATION.md` | debugger | 2026-02-15T11:56:00Z | 2026-02-15T11:58:20Z | PROFILE-BUTTON-WIDTH-001: add eslint/typecheck/manual evidence |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-15T11:56:00Z | 2026-02-15T11:58:20Z | PROFILE-BUTTON-WIDTH-001: log execution + PM feedback cycle |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-15T11:56:00Z | 2026-02-15T11:58:20Z | PROFILE-BUTTON-WIDTH-001: add task plan steps |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-15T11:56:00Z | 2026-02-15T11:58:20Z | PROFILE-BUTTON-WIDTH-001: add intake/constraints/done condition |
| `src/components/Sidebar.tsx` | debugger | 2026-02-15T11:54:40Z | 2026-02-15T11:55:20Z | PROFILE-BUTTON-WIDTH-001: set profile wrapper to `w-full` for nav-width parity |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-15T11:52:30Z | 2026-02-15T11:53:50Z | PROFILE-SETTINGS-MERGE-001: add handoff closure summary |
| `docs/agents/03_VALIDATION.md` | debugger | 2026-02-15T11:52:30Z | 2026-02-15T11:53:50Z | PROFILE-SETTINGS-MERGE-001: record typecheck/eslint/manual verification evidence |
| `src/components/Tutorial.tsx` | debugger | 2026-02-15T11:48:00Z | 2026-02-15T11:50:10Z | PROFILE-SETTINGS-MERGE-001: retarget settings tutorial step to profile selector |
| `src/components/Sidebar.tsx` | debugger | 2026-02-15T11:48:00Z | 2026-02-15T11:50:10Z | PROFILE-SETTINGS-MERGE-001: remove standalone settings button and keep profile-menu settings action |
| `src/components/SettingsModal.tsx` | debugger | 2026-02-15T18:40:00Z | 2026-02-15T18:45:39Z | DEV-STARTUP-HOOKS-001: fix hook-order crash by moving effect above early return |
| `package.json` | debugger | 2026-02-15T18:40:00Z | 2026-02-15T18:45:39Z | DEV-STARTUP-HOOKS-001: remove wait-on from dev scripts for earlier splash visibility |
| `electron/main.cjs` | debugger | 2026-02-15T18:40:00Z | 2026-02-15T18:45:39Z | DEV-STARTUP-HOOKS-001: defer non-critical init and tighten dev retry timing |
| `src/utils/ocrAliasEngine.ts` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: learning governance event/queue model and resolver explainability |
| `src/store/slices/createMappingSlice.ts` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: queue/history/rollback actions for OCR learning decisions |
| `src/store/slices/createSettingsSlice.ts` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: advanced learning/preload/recommendation settings |
| `src/store/useAppStore.ts` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: hydrate/persist advanced OCR learning and preload state |
| `src/utils/storage.ts` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: storage typing for advanced OCR learning state |
| `src/hooks/useSmartScan.ts` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: queue/log OCR learning decisions during scan flow |
| `src/App.tsx` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: adaptive preload ordering + OCR review decision routing |
| `src/components/SettingsModal.tsx` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: advanced learning controls and threshold recommendation UI |
| `src/components/ReviewQueueModal.tsx` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: OCR learning review queue approval/rejection/edit actions |
| `scripts/ocr_threshold_recommend.cjs` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: corpus metric-based threshold recommendation script |
| `electron/main.cjs` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: main-process IPC handler for recommendation execution |
| `electron/preload.cjs` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: allowlist recommendation channel for renderer invoke |
| `package.json` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: add recommendation npm script |
| `src/utils/__tests__/ocrAliasEngine.test.ts` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: alias engine regression coverage for queue policy/rollback |
| `src/store/slices/__tests__/createMappingSlice.test.ts` | debugger | 2026-02-15T18:14:23Z | 2026-02-15T18:35:11Z | ADV-AUTOLEARN-V2-001: mapping slice queue lifecycle regression coverage |
| `src/store/slices/createMappingSlice.ts` | debugger | 2026-02-15T17:42:00Z | 2026-02-15T18:04:16Z | OCR-HYDRATION-COMBINED-001: add deterministic OCR alias model/actions and compatibility wrapper |
| `src/store/useAppStore.ts` | debugger | 2026-02-15T17:42:00Z | 2026-02-15T18:04:16Z | OCR-HYDRATION-COMBINED-001: persist/migrate alias model + new settings flags |
| `src/store/slices/createSettingsSlice.ts` | debugger | 2026-02-15T17:42:00Z | 2026-02-15T18:04:16Z | OCR-HYDRATION-COMBINED-001: add OCR learning/preload controls |
| `src/hooks/useSmartScan.ts` | debugger | 2026-02-15T17:42:00Z | 2026-02-15T18:04:16Z | OCR-HYDRATION-COMBINED-001: wire shared alias resolver into scan path |
| `src/App.tsx` | debugger | 2026-02-15T17:42:00Z | 2026-02-15T18:04:16Z | OCR-HYDRATION-COMBINED-001: add staged preload scheduler and fallback behavior gating |
| `src/components/SettingsModal.tsx` | debugger | 2026-02-15T17:42:00Z | 2026-02-15T18:04:16Z | OCR-HYDRATION-COMBINED-001: expose OCR learning + startup preload controls |
| `src/utils/ocrAliasEngine.ts` | debugger | 2026-02-15T17:42:00Z | 2026-02-15T18:04:16Z | OCR-HYDRATION-COMBINED-001: new deterministic OCR alias scoring engine |
| `src/utils/__tests__/ocrAliasEngine.test.ts` | debugger | 2026-02-15T17:42:00Z | 2026-02-15T18:04:16Z | OCR-HYDRATION-COMBINED-001: unit coverage for scoring/ambiguity guardrails |
| `src/store/slices/__tests__/createMappingSlice.test.ts` | debugger | 2026-02-15T17:42:00Z | 2026-02-15T18:04:16Z | OCR-HYDRATION-COMBINED-001: regression coverage for alias model and migration paths |
| `src/App.tsx` | debugger | 2026-02-15T17:36:00Z | 2026-02-15T17:37:28Z | TAB-LOADING-STARTUP-001: preload lazy dashboard views to avoid first-switch loading fallback |
| `electron/main.cjs` | debugger | 2026-02-15T17:31:00Z | 2026-02-15T17:33:17Z | DEV-SPLASH-RETRY-001: prevent dev splash progress rollback while dev-server retries are active |
| `src/components/OverlayView.tsx` | debugger | 2026-02-15T03:46:16Z | 2026-02-15T04:13:43Z | BUG-BATCH-004: overlay tab parity (mission/squadron/social) and quick access |
| `src/components/analytics/AnalyticsShell.tsx` | debugger | 2026-02-15T03:46:16Z | 2026-02-15T04:13:43Z | BUG-BATCH-004: pro-mode drill click reliability and external subview navigation hook |
| `src/components/Toast.tsx` | debugger | 2026-02-15T03:46:16Z | 2026-02-15T04:13:43Z | BUG-BATCH-004: add audio cues tied to toast lifecycle |
| `src/utils/soundCues.ts` | debugger | 2026-02-15T03:46:16Z | 2026-02-15T04:13:43Z | BUG-BATCH-004: centralized UI sound cue synthesis utility |
| `src/App.tsx` | debugger | 2026-02-15T03:46:16Z | 2026-02-15T04:13:43Z | BUG-BATCH-004: add view-switch cue + transition wrapper |
| `src/index.css` | debugger | 2026-02-15T03:46:16Z | 2026-02-15T04:13:43Z | BUG-BATCH-004: view transition animation styles |
| `src/components/SettingsModal.tsx` | debugger | 2026-02-15T03:36:26Z | 2026-02-15T03:37:08Z | BUG-BATCH-003: tabbed settings hierarchy clarity pass |
| `src/components/RecordingView.tsx` | debugger | 2026-02-15T03:29:14Z | 2026-02-15T03:32:39Z | BUG-BATCH-002: recording layout clipping fix for constrained heights |
| `src/components/RecordingView.test.tsx` | debugger | 2026-02-15T03:29:14Z | 2026-02-15T03:32:39Z | BUG-BATCH-002: regression test coverage for constrained-height fallback layout |
| `src/components/SmartCapturesPanel.tsx` | debugger | 2026-02-15T03:06:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001: OCR apply persistence/fuzzy/cap fixes, wizard entry, queue classification, auto-repair attempt |
| `src/components/recording/SquadronPanel.tsx` | debugger | 2026-02-15T03:06:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001: normalize telemetry ship indicator matching |
| `src/components/recording/RosterPanel.tsx` | debugger | 2026-02-15T03:06:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001: reduce selected teammate chip font size |
| `src/components/SettingsModal.tsx` | debugger | 2026-02-15T03:06:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001: telemetry profile visibility + capture mode copy clarity |
| `src/index.css` | debugger | 2026-02-15T03:06:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001: expanded perf-lite blur/shadow reduction |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-15T03:10:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001 intake record |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-15T03:10:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001 plan record |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-15T03:10:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001 execution record |
| `docs/agents/03_VALIDATION.md` | debugger | 2026-02-15T03:10:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001 validation evidence |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-15T03:10:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001 handoff summary |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-15T03:10:00Z | 2026-02-15T03:15:43Z | BUG-BATCH-001 prioritization decision entry |
| `src/store/slices/createSettingsSlice.ts` | debugger | 2026-02-14T22:22:00Z | 2026-02-14T22:31:36Z | Add telemetry performance profile setting and setter |
| `src/hooks/useLogMonitor.ts` | debugger | 2026-02-15T02:58:27Z | 2026-02-15T03:02:00Z | TELEMETRY-BASTION-001: allow ship/hero telemetry resolution from raw fields without GUID |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-15T03:02:01Z | 2026-02-15T03:03:00Z | TELEMETRY-BASTION-001 intake record |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-15T03:02:01Z | 2026-02-15T03:03:00Z | TELEMETRY-BASTION-001 plan record |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-15T03:02:01Z | 2026-02-15T03:03:00Z | TELEMETRY-BASTION-001 execution + PM feedback record |
| `docs/agents/03_VALIDATION.md` | debugger | 2026-02-15T03:02:01Z | 2026-02-15T03:03:00Z | TELEMETRY-BASTION-001 validation evidence |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-15T03:02:01Z | 2026-02-15T03:03:00Z | TELEMETRY-BASTION-001 handoff summary |
| `src/store/useAppStore.ts` | debugger | 2026-02-14T22:22:00Z | 2026-02-14T22:31:36Z | Persist telemetry performance profile across launches |
| `src/components/SettingsModal.tsx` | debugger | 2026-02-14T22:22:00Z | 2026-02-14T22:31:36Z | Add Low Power / Balanced / High Accuracy control |
| `src/hooks/useLogMonitor.ts` | debugger | 2026-02-14T22:22:00Z | 2026-02-14T22:31:36Z | Send selected telemetry performance profile to main process |
| `electron/main.cjs` | debugger | 2026-02-14T22:22:00Z | 2026-02-14T22:31:36Z | Apply telemetry monitoring profile to polling/write behavior |
| `electron/handlers/artifactHandlers.cjs` | debugger | 2026-02-14T22:16:52Z | 2026-02-14T22:21:21Z | Diagnose and fix screenshot bundling regression causing missing smart-capture links |
| `src/hooks/useMatchSubmission.ts` | debugger | 2026-02-14T22:16:52Z | 2026-02-14T22:21:21Z | Enforce artifact path synchronization between stored files and match history rows |
| `src/hooks/__tests__/useMatchSubmission.test.ts` | debugger | 2026-02-14T22:16:52Z | 2026-02-14T22:21:21Z | Add regression test coverage for artifact sync behavior |
| `docs/agents/PM_TODO.md` | project-manager | 2026-02-13T22:40:00Z | 2026-02-13T22:55:00Z | Canonical PM delegation board update with IDs, statuses, dependencies, and wave sequencing |
| `docs/agents/04_HANDOFF.md` | project-manager | 2026-02-13T22:40:00Z | 2026-02-13T22:55:00Z | Temporary PM handoff ownership for delegation-board documentation cycle |
| `docs/agents/03_VALIDATION.md` | project-manager | 2026-02-13T22:40:00Z | 2026-02-13T22:55:00Z | Temporary PM validation ownership for delegation-board evidence cycle |
| `docs/agents/02_EXECUTION_LOG.md` | project-manager | 2026-02-13T22:40:00Z | 2026-02-13T22:55:00Z | Temporary PM execution-log ownership for delegation-board cycle |
| `docs/WORKLOCKS.md` | project-manager | 2026-02-13T22:40:00Z | 2026-02-13T22:55:00Z | Temporary lock arbitration to claim/release shared docs for PM delegation-board update |
| `docs/agents/02_EXECUTION_LOG.md` | release-manager | 2026-02-13T20:35:00Z | 2026-02-13T21:00:00Z | Released to debugger; Lane D role bound per user request |
| `docs/agents/03_VALIDATION.md` | release-manager | 2026-02-13T20:35:00Z | 2026-02-13T21:00:00Z | Released to debugger; Lane D role bound per user request |
| `docs/WORKLOCKS.md` | release-manager | 2026-02-13T20:35:00Z | 2026-02-13T21:00:00Z | Released to debugger; Lane D role bound per user request |
| _legacy rows may use prior owner labels (`lead`, `agent-a`, ...)_ |  |  |  |  |
| `docs/agents/DECISIONS.md` | lead | 2026-02-12T17:30:00Z | 2026-02-12T17:33:00Z | confirm owner model and channel policy |
| `docs/WORKLOCKS.md` | agent-a | 2026-02-12T17:34:00Z | 2026-02-12T17:38:00Z | add lock/release protocol and templates |
| `docs/agents/02_EXECUTION_LOG.md` | agent-b | 2026-02-12T17:39:00Z | 2026-02-12T17:42:00Z | add structured execution template |
| `docs/agents/03_VALIDATION.md` | agent-b | 2026-02-12T17:42:00Z | 2026-02-12T17:46:00Z | add validation evidence template |
| `docs/agents/00_INTAKE.md` | lead | 2026-02-12T17:47:00Z | 2026-02-12T17:51:00Z | instantiate analytics-first intake |
| `docs/agents/01_PLAN.md` | lead | 2026-02-12T17:51:00Z | 2026-02-12T17:56:00Z | instantiate multi-lane ownership and steps |
| `src/components/analytics/AnalyticsShell.tsx` | debugger | 2026-02-12T18:10:00Z | 2026-02-12T18:45:00Z | analytics UI defect instrumentation and fix |
| `src/components/analytics/AnalyticsDashboard.tsx` | debugger | 2026-02-12T18:10:00Z | 2026-02-12T18:45:00Z | analytics UI defect instrumentation and fix |
| `src/components/analytics/useAnalyticsData.ts` | debugger | 2026-02-12T18:10:00Z | 2026-02-12T18:45:00Z | analytics UI defect instrumentation and fix |
| `docs/agents/03_VALIDATION.md` | debugger | 2026-02-12T18:10:00Z | 2026-02-12T18:45:00Z | record validation evidence |
| `index.html` | debugger | 2026-02-12T18:20:00Z | 2026-02-12T18:45:00Z | temporary CSP unblock for debug logging (reverted) |
| `electron/ocrHandler.cjs` | builder | 2026-02-12T18:23:40Z | 2026-02-12T20:00:00Z | OCR cache-key stabilization (stale lock released by PM) |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-12T18:23:40Z | 2026-02-12T20:00:00Z | log builder step boundaries (stale lock released by PM) |
| `docs/agents/03_VALIDATION.md` | builder | 2026-02-12T18:23:40Z | 2026-02-12T20:00:00Z | capture validation evidence (stale lock released by PM) |
| `docs/WORKLOCKS.md` | builder | 2026-02-12T18:23:40Z | 2026-02-12T20:00:00Z | claim/release lock lifecycle (stale lock released by PM) |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-12T20:00:00Z | 2026-02-12T20:05:00Z | OCR baseline assessment and blocker filing |
| `docs/agents/03_VALIDATION.md` | debugger | 2026-02-12T20:00:00Z | 2026-02-12T20:05:00Z | OCR baseline assessment and blocker filing |
| `docs/agents/BLOCKERS.md` | debugger | 2026-02-12T20:00:00Z | 2026-02-12T20:05:00Z | OCR baseline blocker filing |
| `electron/ocrHandler.cjs` | builder | 2026-02-12T18:42:45Z | 2026-02-12T18:52:55Z | avoid unnecessary temp file writes for local-only OCR captures |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-12T18:42:45Z | 2026-02-12T18:52:55Z | record builder phase boundary and implementation notes |
| `docs/agents/03_VALIDATION.md` | builder | 2026-02-12T18:42:45Z | 2026-02-12T18:52:55Z | capture runtime validation evidence for OCR phase |
| `docs/WORKLOCKS.md` | builder | 2026-02-12T18:42:45Z | 2026-02-12T18:52:55Z | claim and release lock lifecycle for active OCR phase |
| `electron/ocrHandler.cjs` | builder | 2026-02-12T18:35:35Z | 2026-02-12T18:40:30Z | OCR temp-file lifecycle stabilization for skipDebugSave path |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-12T18:35:35Z | 2026-02-12T18:40:30Z | record builder phase boundary and implementation notes |
| `docs/agents/03_VALIDATION.md` | builder | 2026-02-12T18:35:35Z | 2026-02-12T18:40:30Z | capture runtime validation evidence for OCR phase |
| `docs/WORKLOCKS.md` | builder | 2026-02-12T18:35:35Z | 2026-02-12T18:40:30Z | claim and release lock lifecycle for active OCR phase |
| `electron/ocrHandler.cjs` | builder | 2026-02-12T19:08:45Z | 2026-02-12T19:15:53Z | Bug 1 fix: protect modifier recall from cloud merge degradation |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-12T19:08:45Z | 2026-02-12T19:15:53Z | record builder step boundary and OCR bug-fix notes |
| `docs/agents/03_VALIDATION.md` | builder | 2026-02-12T19:08:45Z | 2026-02-12T19:15:53Z | capture runtime predict/eval evidence for Bug 1 phase |
| `docs/WORKLOCKS.md` | builder | 2026-02-12T19:08:45Z | 2026-02-12T19:15:53Z | claim/release lock lifecycle for this OCR phase |
| `src/components/ocr/OCRReviewModal.tsx` | ui-designer | 2026-02-12T21:10:00Z | 2026-02-13T00:15:00Z | OCR lane B: standardize rejection/error copy and correction flow UX |
| `src/components/OcrCorrectionModal.tsx` | ui-designer | 2026-02-12T21:10:00Z | 2026-02-13T00:15:00Z | OCR lane B: correction flow usability and error state clarity |
| `src/components/DevOCRPanel.tsx` | ui-designer | 2026-02-12T21:10:00Z | 2026-02-13T00:15:00Z | OCR lane B: dev panel UX for OCR debug/corpus workflows |
| `electron/crewHubExtractor.cjs` | builder | 2026-02-12T19:27:57Z | 2026-02-12T19:41:36Z | Bug 2 fix: Crew Hub panel boundary teammate/opponent classification |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-12T19:27:57Z | 2026-02-12T19:41:36Z | log builder step boundary and Bug 2 implementation notes |
| `docs/agents/03_VALIDATION.md` | builder | 2026-02-12T19:27:57Z | 2026-02-12T19:41:36Z | capture predict/eval runtime evidence for Bug 2 phase |
| `docs/WORKLOCKS.md` | builder | 2026-02-12T19:27:57Z | 2026-02-12T19:41:36Z | claim/release lifecycle for Bug 2 phase |
| `electron/ocrHandler.cjs` | builder | 2026-02-13T00:30:00Z | 2026-02-13T00:45:00Z | Bug 3: add cropAndOCR for map teammate region |
| `electron/mapScreenExtractor.cjs` | builder | 2026-02-13T00:30:00Z | 2026-02-13T00:45:00Z | Bug 3: region-specific player extraction (no edits needed) |
| `dataset/ocr-corpus/ground-truth.phase15.json` | builder | 2026-02-12T20:02:48Z | 2026-02-12T20:09:47Z | Bug 3 primary gate: stable 15-sample truth snapshot |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-12T20:02:48Z | 2026-02-12T20:09:47Z | log resumed Bug 3 execution per PM decision |
| `docs/agents/03_VALIDATION.md` | builder | 2026-02-12T20:02:48Z | 2026-02-12T20:09:47Z | record Bug 3 primary/secondary validation outputs |
| `docs/WORKLOCKS.md` | builder | 2026-02-12T20:02:48Z | 2026-02-12T20:09:47Z | claim/release lifecycle for resumed Bug 3 phase |
| `docs/agents/03_VALIDATION.md` | release-manager | 2026-02-12T23:40:00Z | 2026-02-12T23:55:00Z | RC gate audit and final release validation evidence block |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-12T23:40:00Z | 2026-02-12T23:55:00Z | RC summary, risks, rollback package, GO/NO-GO recommendation |
| `docs/agents/02_EXECUTION_LOG.md` | release-manager | 2026-02-12T23:40:00Z | 2026-02-12T23:55:00Z | log release-gate checklist enforcement and integration outcome |
| `docs/agents/BLOCKERS.md` | release-manager | 2026-02-12T23:40:00Z | 2026-02-12T23:55:00Z | escalate missing release evidence artifacts with owners |
| `docs/WORKLOCKS.md` | release-manager | 2026-02-12T23:40:00Z | 2026-02-12T23:55:00Z | claim/release lock lifecycle for release integration artifacts |
| `docs/agents/03_VALIDATION.md` | release-manager | 2026-02-13T01:50:00Z | 2026-02-13T13:28:00 local | update RC checklist with fresh `npm test` evidence |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-13T01:50:00Z | 2026-02-13T13:28:00 local | refresh RC recommendation context after test evidence update |
| `docs/agents/02_EXECUTION_LOG.md` | release-manager | 2026-02-13T01:50:00Z | 2026-02-13T13:28:00 local | log follow-up release gate check and dependency status |
| `docs/agents/BLOCKERS.md` | release-manager | 2026-02-13T01:50:00Z | 2026-02-13T13:28:00 local | update blocker status after fresh gate check |
| `docs/WORKLOCKS.md` | release-manager | 2026-02-13T01:50:00Z | 2026-02-13T13:28:00 local | claim/release lock lifecycle for follow-up release audit |
| `docs/agents/03_VALIDATION.md` | builder | 2026-02-12T20:38:18Z | 2026-02-12T20:38:39Z | RM-REQ-001: append npm test RC evidence |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-12T20:38:18Z | 2026-02-12T20:38:39Z | log RM-REQ-001 builder completion |
| `docs/WORKLOCKS.md` | builder | 2026-02-12T20:38:18Z | 2026-02-12T20:38:39Z | claim/release lifecycle for RM-REQ-001 |
| `scripts/ocr_corpus_ingest_legacy.cjs` | builder | 2026-02-12T20:58:26Z | 2026-02-12T21:00:25Z | Step 7: fix legacy ingest script GCloud initialization |
| `package.json` | builder | 2026-02-12T20:58:26Z | 2026-02-12T21:00:25Z | Step 7: verify npm script exists for legacy ingest |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-12T20:58:26Z | 2026-02-12T21:00:25Z | Step 7: log legacy ingest implementation |
| `docs/WORKLOCKS.md` | builder | 2026-02-12T20:58:26Z | 2026-02-12T21:00:25Z | Step 7: claim/release lock lifecycle |

## v2 Lock Protocol (AOM_V2)

### Active Lock Schema (required)
| File | Owner | Lock Class | Started (UTC) | Expected Release (UTC) | Purpose |
|---|---|---|---|---|---|

Lock Class:
- `exclusive`: one editor only, high conflict risk.
- `shared`: controlled multi-role coordination.
- `hot`: frequently touched integration artifact.

### Enforcement
- A lock without `Expected Release (UTC)` is invalid.
- If current time exceeds expected release by 30 minutes, log stale lock blocker in `docs/agents/BLOCKERS.md`.
- PM resolves lock conflict by decision entry in `docs/agents/DECISIONS.md`.

### Legacy Label Policy
- New lock rows must use role names only.
- Legacy owner labels remain in history but cannot be used in new active rows.

| `docs/agents/00_INTAKE.md` | project-manager | `hot` | 2026-02-16T13:33:45Z | 2026-02-16T13:36:20Z | SMOKE-PERF-CONSENSUS-001 intake record |
| `docs/agents/01_PLAN.md` | project-manager | `hot` | 2026-02-16T13:33:45Z | 2026-02-16T13:36:20Z | SMOKE-PERF-CONSENSUS-001 plan record |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | `hot` | 2026-02-16T13:33:45Z | 2026-02-16T13:36:20Z | SMOKE-PERF-CONSENSUS-001 execution record |
| `docs/agents/03_VALIDATION.md` | verifier | `hot` | 2026-02-16T13:33:45Z | 2026-02-16T13:36:20Z | SMOKE-PERF-CONSENSUS-001 validation evidence |
| `docs/agents/04_HANDOFF.md` | release-manager | `hot` | 2026-02-16T13:33:45Z | 2026-02-16T13:36:20Z | SMOKE-PERF-CONSENSUS-001 handoff summary |
| `docs/agents/DECISIONS.md` | project-manager | `hot` | 2026-02-16T13:33:45Z | 2026-02-16T13:36:20Z | SMOKE-PERF-CONSENSUS-001 diagnostics decision entry |
| src/utils/storage.ts | debugger | exclusive | 2026-02-16T13:43:18Z | 2026-02-16T14:43:18Z | THERMAL-FIX-001 dirty-only persistence flush |
| electron/main.cjs | debugger | hot | 2026-02-16T13:43:18Z | 2026-02-16T14:43:18Z | THERMAL-FIX-001 telemetry path preference correction |
| electron/helpers/telemetryArchiveHelpers.cjs | debugger | hot | 2026-02-16T13:43:18Z | 2026-02-16T14:43:18Z | THERMAL-FIX-001 archive write dedupe/cache optimization |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-16T13:45:02Z | 2026-02-16T14:05:02Z | THERMAL-FIX-001 status update |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-16T13:45:02Z | 2026-02-16T14:05:02Z | THERMAL-FIX-001 execution log update |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-16T13:45:02Z | 2026-02-16T14:05:02Z | THERMAL-FIX-001 validation evidence update |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-16T13:45:02Z | 2026-02-16T14:05:02Z | THERMAL-FIX-001 handoff update |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-16T13:45:02Z | 2026-02-16T14:05:02Z | THERMAL-FIX-001 decisions update |
| src/utils/storage.ts | debugger | exclusive | 2026-02-16T13:46:00Z | 2026-02-16T13:46:00Z | THERMAL-FIX-001 lock released |
| electron/main.cjs | debugger | hot | 2026-02-16T13:46:00Z | 2026-02-16T13:46:00Z | THERMAL-FIX-001 lock released |
| electron/helpers/telemetryArchiveHelpers.cjs | debugger | hot | 2026-02-16T13:46:00Z | 2026-02-16T13:46:00Z | THERMAL-FIX-001 lock released |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-16T13:46:00Z | 2026-02-16T13:46:00Z | THERMAL-FIX-001 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-16T13:46:00Z | 2026-02-16T13:46:00Z | THERMAL-FIX-001 lock released |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-16T13:46:00Z | 2026-02-16T13:46:00Z | THERMAL-FIX-001 lock released |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-16T13:46:00Z | 2026-02-16T13:46:00Z | THERMAL-FIX-001 lock released |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-16T13:46:00Z | 2026-02-16T13:46:00Z | THERMAL-FIX-001 lock released |
| docs/agents/PM_TODO.md | project-manager | hot | 2026-02-16T14:54:07Z | 2026-02-16T15:04:07Z | USER-REQ clear outdated PM backlog |
| docs/agents/PM_TODO.md | project-manager | hot | 2026-02-16T14:54:26Z | 2026-02-16T14:54:26Z | USER-REQ clear outdated PM backlog lock released |
| src/store/slices/createMappingSlice.ts | debugger | hot | 2026-02-16T21:58:53Z | 2026-02-16T22:58:53Z | OCR-ALIAS-CLEANUP-001 add direct alias removal action for bad manual mappings |
| src/components/SettingsModal.tsx | debugger | hot | 2026-02-16T21:58:53Z | 2026-02-16T22:58:53Z | OCR-ALIAS-CLEANUP-001 expose remove control and suspicious-manual-add confirmation |
| src/store/slices/__tests__/createMappingSlice.test.ts | verifier | hot | 2026-02-16T21:58:53Z | 2026-02-16T22:58:53Z | OCR-ALIAS-CLEANUP-001 add regression coverage for alias removal action |
| docs/agents/00_INTAKE.md | project-manager | hot | 2026-02-16T21:58:53Z | 2026-02-16T22:58:53Z | OCR-ALIAS-CLEANUP-001 intake record |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-16T21:58:53Z | 2026-02-16T22:58:53Z | OCR-ALIAS-CLEANUP-001 plan record |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-16T21:58:53Z | 2026-02-16T22:58:53Z | OCR-ALIAS-CLEANUP-001 execution log updates |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-16T21:58:53Z | 2026-02-16T22:58:53Z | OCR-ALIAS-CLEANUP-001 validation evidence |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-16T21:58:53Z | 2026-02-16T22:58:53Z | OCR-ALIAS-CLEANUP-001 handoff summary |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-16T21:58:53Z | 2026-02-16T22:58:53Z | OCR-ALIAS-CLEANUP-001 scope/safety decisions |
| src/store/slices/createMappingSlice.ts | debugger | hot | 2026-02-16T22:02:22Z | 2026-02-16T22:02:22Z | OCR-ALIAS-CLEANUP-001 lock released |
| src/components/SettingsModal.tsx | debugger | hot | 2026-02-16T22:02:22Z | 2026-02-16T22:02:22Z | OCR-ALIAS-CLEANUP-001 lock released |
| src/store/slices/__tests__/createMappingSlice.test.ts | verifier | hot | 2026-02-16T22:02:22Z | 2026-02-16T22:02:22Z | OCR-ALIAS-CLEANUP-001 lock released |
| docs/agents/00_INTAKE.md | project-manager | hot | 2026-02-16T22:02:22Z | 2026-02-16T22:02:22Z | OCR-ALIAS-CLEANUP-001 lock released |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-16T22:02:22Z | 2026-02-16T22:02:22Z | OCR-ALIAS-CLEANUP-001 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-16T22:02:22Z | 2026-02-16T22:02:22Z | OCR-ALIAS-CLEANUP-001 lock released |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-16T22:02:22Z | 2026-02-16T22:02:22Z | OCR-ALIAS-CLEANUP-001 lock released |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-16T22:02:22Z | 2026-02-16T22:02:22Z | OCR-ALIAS-CLEANUP-001 lock released |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-16T22:02:22Z | 2026-02-16T22:02:22Z | OCR-ALIAS-CLEANUP-001 lock released |
| src/components/ocr/OCRReviewModal.tsx | ui-designer | hot | 2026-02-16T22:06:38Z | 2026-02-16T23:06:38Z | OCR-CORRECTION-POPUP-CLARITY-001 improve correction popup instructions and action labels |
| src/components/SmartCapturesPanel.tsx | ui-designer | hot | 2026-02-16T22:06:38Z | 2026-02-16T23:06:38Z | OCR-CORRECTION-POPUP-CLARITY-001 clarify Smart Captures entry CTA for correction popup |
| docs/agents/00_INTAKE.md | project-manager | hot | 2026-02-16T22:06:38Z | 2026-02-16T23:06:38Z | OCR-CORRECTION-POPUP-CLARITY-001 intake record |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-16T22:06:38Z | 2026-02-16T23:06:38Z | OCR-CORRECTION-POPUP-CLARITY-001 plan record |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-16T22:06:38Z | 2026-02-16T23:06:38Z | OCR-CORRECTION-POPUP-CLARITY-001 execution log updates |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-16T22:06:38Z | 2026-02-16T23:06:38Z | OCR-CORRECTION-POPUP-CLARITY-001 validation evidence |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-16T22:06:38Z | 2026-02-16T23:06:38Z | OCR-CORRECTION-POPUP-CLARITY-001 handoff summary |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-16T22:06:38Z | 2026-02-16T23:06:38Z | OCR-CORRECTION-POPUP-CLARITY-001 UI decision log |
| src/components/ocr/OCRReviewModal.tsx | ui-designer | hot | 2026-02-16T22:09:03Z | 2026-02-16T22:09:03Z | OCR-CORRECTION-POPUP-CLARITY-001 lock released |
| src/components/SmartCapturesPanel.tsx | ui-designer | hot | 2026-02-16T22:09:03Z | 2026-02-16T22:09:03Z | OCR-CORRECTION-POPUP-CLARITY-001 lock released |
| docs/agents/00_INTAKE.md | project-manager | hot | 2026-02-16T22:09:03Z | 2026-02-16T22:09:03Z | OCR-CORRECTION-POPUP-CLARITY-001 lock released |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-16T22:09:03Z | 2026-02-16T22:09:03Z | OCR-CORRECTION-POPUP-CLARITY-001 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-16T22:09:03Z | 2026-02-16T22:09:03Z | OCR-CORRECTION-POPUP-CLARITY-001 lock released |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-16T22:09:03Z | 2026-02-16T22:09:03Z | OCR-CORRECTION-POPUP-CLARITY-001 lock released |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-16T22:09:03Z | 2026-02-16T22:09:03Z | OCR-CORRECTION-POPUP-CLARITY-001 lock released |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-16T22:09:03Z | 2026-02-16T22:09:03Z | OCR-CORRECTION-POPUP-CLARITY-001 lock released |
