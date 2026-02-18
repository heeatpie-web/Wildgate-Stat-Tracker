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
| electron/main.cjs | builder | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 log-monitor idempotency, DB rename retry fallback, icon wiring, startup onboarding/session restore alignment |
| electron/ocrHandler.cjs | builder | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 cloud OCR failure fallback to local with surfaced metadata |
| src/components/SettingsModal.tsx | builder | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 fix settings hook-order crash and cloud-status UX clarity |
| src/components/RecordingView.tsx | builder | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 default-size recording panel behavior and shrink-threshold tab switch |
| src/components/recording/MissionPanel.tsx | builder | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 mission intel copy update for damage time-window clarity |
| src/components/MatchRecordingPage.tsx | builder | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 mission/detail damage label consistency |
| src/components/PlayerHub.tsx | builder | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 twilight-mode player-list clickability/contrast affordance update |
| src/utils/ocr/ocrTypes.ts | builder | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 extend OCR result metadata for cloud fallback reporting |
| public/favicon.png | release-manager | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 replace runtime/app icon asset with splash-style gradient W |
| public/favicon-32.png | release-manager | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 replace runtime/app icon asset with splash-style gradient W |
| public/favicon-64.png | release-manager | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 replace runtime/app icon asset with splash-style gradient W |
| public/favicon.ico | release-manager | 2026-02-18T03:05:00Z | RECOVERY-CONTINUATION-001 replace runtime/app icon asset with splash-style gradient W |
| src/hooks/useLogMonitor.ts | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 telemetry loadout detection and local-player apply reliability |
| src/hooks/useMatchSubmission.ts | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 teammate persistence and submission boundary authority rules |
| src/App.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 telemetry prompt retries, restore-session modal, and OCR/manual precedence wiring |
| src/components/Wizard.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 replace free-text loadout entry with controlled weapon/equipment selectors |
| src/components/SmartCapturesPanel.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 manual-name safety, drag/edit improvements, and OCR precedence handling |
| src/components/ocr/OCRReviewModal.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 OCR review drag/move and screenshot-assisted correction UX updates |
| src/components/recording/ActionPanel.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 telemetry auto-selected loadout indicator clarity and capture flow parity |
| src/components/Sidebar.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 Dev OCR discoverability without global dev-mode gate |
| src/components/DevOCRPanel.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 OCR debug guidance content and accessibility entry updates |
| src/components/analytics/TimePatternView.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 active-times tooltip and bar readability fixes |
| src/components/smart-captures/QueueItemRichPreview.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 queue confidence bar visibility/readability hardening |
| src/components/smart-captures/primitives/ConfidenceMeter.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 confidence meter rendering/readability hardening |
| src/components/IdMapper.tsx | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 ID mapper blank/default tab visibility remediation |
| src/index.css | builder | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 smart-capture queue/status color contrast improvements |
| package.json | release-manager | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 emergency version bump |
| docs/agents/02_EXECUTION_LOG.md | debugger | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 execution log and PM feedback lifecycle entries |
| docs/agents/03_VALIDATION.md | verifier | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 validation evidence log |
| docs/agents/04_HANDOFF.md | release-manager | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 final handoff summary |
| docs/agents/DECISIONS.md | project-manager | 2026-02-18T00:31:00Z | EMERGENCY-BATCH-2026-02-18-001 implementation decisions and exceptions |
| `src/utils/storage.ts` | builder | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001: harden storage typing and add one-time legacy migration marker handling |
| `src/store/useAppStore.ts` | builder | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001: tighten persisted state hydration typing and preserve storage metadata |
| `src/utils/artifactService.ts` | builder | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001: harden IPC result typing and canonicalize telemetry artifact payload shape |
| `src/utils/telemetryArchive.ts` | builder | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001: add shared telemetry archive normalization utility |
| `src/components/DashboardLayout.tsx` | builder | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001: remove @ts-ignore and replace layout any usage with explicit grid types |
| `src/components/SimulatorPanel.tsx` | builder | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001: normalize archive payload handling via shared utility |
| `src/components/SmartCapturesPanel.tsx` | builder | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001: consume canonical telemetry artifact arrays without per-call shape branching |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001 intake and scope normalization |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001 step tracking and status updates |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001 execution lifecycle and PM feedback entries |
| `docs/agents/03_VALIDATION.md` | verifier | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001 validation command/results evidence |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001 final handoff summary |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-17T01:15:29Z | AUDIT-REMEDIATION-001 technical scope and migration decisions |
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
| src/components/OcrCorrectionModal.tsx | builder | 2026-02-18T18:12:00Z | OCR-WIZARD-REASSIGN-003 team/ship drag reassignment and screenshot-assisted OCR wizard review |
| src/components/Wizard.tsx | builder | 2026-02-18T18:12:00Z | OCR-WIZARD-REASSIGN-003 pass wizard artifacts into OCR correction modal screenshot references |
| path/to/file | ui-designer | 2026-02-12T16:20:00Z | one-line reason |

## Lock Release

- Delete the active row from `Active Locks`.
- Add it to `Recent Lock History` with `Released (UTC)`.

## Recent Lock History

| File | Owner | Started (UTC) | Released (UTC) | Purpose |
|---|---|---|---|---|
| src/utils/ocr/ocrParser.ts | builder | 2026-02-18T16:40:00Z | 2026-02-18T16:58:00Z | OCR-SYSTEM-IMPROVEMENTS-007 lock released |
| src/utils/ocr/__tests__/ocrParser.test.ts | verifier | 2026-02-18T16:40:00Z | 2026-02-18T16:58:00Z | OCR-SYSTEM-IMPROVEMENTS-007 lock released |
| src/config/runtimeConfig.ts | builder | 2026-02-18T16:40:00Z | 2026-02-18T16:58:00Z | OCR-SYSTEM-IMPROVEMENTS-007 lock released |
| src/store/slices/createMappingSlice.ts | builder | 2026-02-18T16:40:00Z | 2026-02-18T16:58:00Z | OCR-SYSTEM-IMPROVEMENTS-007 lock released |
| src/store/slices/__tests__/createMappingSlice.test.ts | verifier | 2026-02-18T16:40:00Z | 2026-02-18T16:58:00Z | OCR-SYSTEM-IMPROVEMENTS-007 lock released |
| src/store/slices/createSettingsSlice.ts | builder | 2026-02-18T16:40:00Z | 2026-02-18T16:58:00Z | OCR-SYSTEM-IMPROVEMENTS-007 lock released |
| src/components/recording/SquadronPanel.tsx | builder | 2026-02-18T18:40:00Z | 2026-02-18T18:46:00Z | TELEMETRY-LOADOUT-INDICATORS-004 lock released |
| src/hooks/__tests__/useLogMonitor.test.ts | builder | 2026-02-18T18:40:00Z | 2026-02-18T18:46:00Z | TELEMETRY-LOADOUT-INDICATORS-004 lock released |
| src/components/recording/SquadronPanel.test.tsx | builder | 2026-02-18T18:40:00Z | 2026-02-18T18:46:00Z | TELEMETRY-LOADOUT-INDICATORS-004 lock released |
| src/components/OcrCorrectionModal.tsx | builder | 2026-02-18T18:12:00Z | 2026-02-18T18:35:00Z | OCR-WIZARD-REASSIGN-003 lock released |
| src/components/Wizard.tsx | builder | 2026-02-18T18:12:00Z | 2026-02-18T18:35:00Z | OCR-WIZARD-REASSIGN-003 lock released |
| `src/components/ocr/OCRReviewModal.test.tsx` | verifier | 2026-02-17T20:47:00Z | 2026-02-17T20:57:00Z | OCR-ENHANCEMENT-T3-022: focused modal accessibility regression coverage |
| `src/index.tsx` | builder | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: import shared accessibility stylesheet |
| `src/components/EditMatchModal.tsx` | ui-designer | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add modal dialog ARIA + focus trap wiring |
| `src/components/ResetConfirmModal.tsx` | ui-designer | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add modal dialog ARIA + focus trap wiring |
| `src/components/RenameModal.tsx` | ui-designer | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add modal dialog ARIA + focus trap wiring |
| `src/components/SettingsModal.tsx` | ui-designer | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add modal dialog ARIA + focus trap wiring |
| `src/components/BatchActionConfirmDialog.tsx` | ui-designer | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add dialog semantics and keyboard/focus accessibility |
| `src/components/ReviewQueueModal.tsx` | ui-designer | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add dialog semantics, focus management, and keyboard accessibility |
| `src/utils/__tests__/accessibilityAudit.test.ts` | verifier | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: focused regression tests for accessibility audit utility |
| `src/utils/accessibilityAudit.ts` | builder | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add DOM accessibility audit utility for Dev OCR tooling |
| `src/styles/accessibility.css` | ui-designer | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add shared accessibility helper styles and contrast/reduced-motion support |
| `src/hooks/useAriaLiveRegion.ts` | builder | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add reusable screen-reader live-region announcer hook |
| `src/hooks/useFocusTrap.ts` | builder | 2026-02-17T20:26:00Z | 2026-02-17T20:41:00Z | OCR-ENHANCEMENT-T3-021: add reusable focus trap hook for modal keyboard containment |
| `src/utils/__tests__/patternRecognition.test.ts` | verifier | 2026-02-17T20:06:36Z | 2026-02-17T20:13:24Z | OCR-ENHANCEMENT-T3-020: focused regression tests for teammate pattern scoring |
| `src/utils/patternRecognition.ts` | builder | 2026-02-17T20:06:36Z | 2026-02-17T20:13:24Z | OCR-ENHANCEMENT-T3-020: teammate co-occurrence utility and suggestion scoring |
| `scripts/security_negative_tests.cjs` | builder | 2026-02-17T19:58:00Z | 2026-02-17T20:03:13Z | OCR-ENHANCEMENT-T3-019: keep security fixture invoke-channel parity |
| `electron/preload.cjs` | builder | 2026-02-17T19:58:00Z | 2026-02-17T20:03:13Z | OCR-ENHANCEMENT-T3-019: allowlist new dictionary regeneration IPC channel |
| `src/providers/GameDataProvider.tsx` | builder | 2026-02-17T19:58:00Z | 2026-02-17T20:03:13Z | OCR-ENHANCEMENT-T3-019: auto-regenerate OCR dictionary from pilot registry/match updates |
| `electron/tesseractDictionary.cjs` | builder | 2026-02-17T19:58:00Z | 2026-02-17T20:03:13Z | OCR-ENHANCEMENT-T3-019: Tier 3 #10 dictionary generation helper for pilot-registry-based user words |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018 decisions for corpus export format and archiving scope |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018 handoff summary capture |
| `docs/agents/03_VALIDATION.md` | verifier | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018 validation evidence logging |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018 execution lifecycle and PM feedback cycle logging |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018 step tracking with single active IN_PROGRESS step |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018 intake normalization and scope declaration |
| `src/utils/__tests__/ocrCorpusBuilder.test.ts` | verifier | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018: focused regression tests for corpus builder formatting and filtering |
| `src/utils/export.ts` | builder | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018: add text-file export helper for JSONL and BOX outputs |
| `src/utils/ocrCorpusBuilder.ts` | builder | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018: build alias-model correction corpus and emit JSON/JSONL/BOX formats |
| `src/components/DevOCRPanel.tsx` | ui-designer | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018: add correction corpus export action in Dev OCR corpus lab |
| `electron/ocrHandler.cjs` | builder | 2026-02-17T12:46:42Z | 2026-02-17T12:50:42Z | OCR-ENHANCEMENT-T3-018: add opt-in OCR sample archiving helpers for correction corpus curation |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017 implementation decisions/rationale for debug overlay scope |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017 handoff summary capture |
| `docs/agents/03_VALIDATION.md` | verifier | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017 focused validation evidence logging |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017 execution lifecycle + PM feedback cycle logging |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017 step tracking with single active IN_PROGRESS item |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017 intake normalization and risk/execution-path declaration |
| `src/components/OcrBoundingBoxOverlay.tsx` | ui-designer | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017: new interactive bounding-box overlay component for OCR debug visualization |
| `src/utils/electronBridge.ts` | builder | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017: allow OCR runtime debug options passthrough (includeBboxes) |
| `src/utils/ocr/ocrTypes.ts` | builder | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017: extend OCR result type with optional bounding-box debug payload |
| `src/components/DevOCRPanel.tsx` | ui-designer | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017: add bounding-box debug capture action and overlay rendering in Dev OCR Lab |
| `electron/ocrHandler.cjs` | builder | 2026-02-17T12:34:23Z | 2026-02-17T12:41:32Z | OCR-ENHANCEMENT-T2-017: add optional includeBboxes debug payload generation for OCR dev overlays |
| `src/components/BatchActionConfirmDialog.tsx` | ui-designer | 2026-02-17T19:14:13Z | 2026-02-17T19:22:43Z | OCR-ENHANCEMENT-T2-016: add reusable batch-action confirmation dialog for OCR correction modal |
| `src/store/slices/createSettingsSlice.ts` | builder | 2026-02-17T19:14:13Z | 2026-02-17T19:22:43Z | OCR-ENHANCEMENT-T2-016: persist OCR batch threshold setting and bounded setter logic |
| `src/utils/__tests__/ocrBatchActions.test.ts` | verifier | 2026-02-17T19:14:13Z | 2026-02-17T19:22:43Z | OCR-ENHANCEMENT-T2-016: focused tests for batch eligibility/threshold helper behavior |
| `src/store/slices/createSettingsSlice.ts` | builder | 2026-02-17T19:06:36Z | 2026-02-17T19:11:10Z | OCR-ENHANCEMENT-T2-015: persist bounded OCR confidence calibration samples and append/reset actions |
| `src/utils/ocrCalibration.ts` | builder | 2026-02-17T19:06:36Z | 2026-02-17T19:11:10Z | OCR-ENHANCEMENT-T2-015: add confidence calibration bucketing/recommendation utility helpers |
| `src/utils/__tests__/ocrCalibration.test.ts` | verifier | 2026-02-17T19:06:36Z | 2026-02-17T19:11:10Z | OCR-ENHANCEMENT-T2-015: focused regression tests for calibration sample bucketing + threshold recommendation |
| `electron/preload.cjs` | builder | 2026-02-17T18:57:31Z | 2026-02-17T19:02:28Z | OCR-ENHANCEMENT-T2-014: expose benchmark IPC allowlist channel for Dev OCR tooling |
| `scripts/security_negative_tests.cjs` | builder | 2026-02-17T18:57:31Z | 2026-02-17T19:02:28Z | OCR-ENHANCEMENT-T2-014: keep IPC allowlist security fixture parity with preload changes |
| `electron/ocrHandler.cjs` | builder | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013: Tier 1 cache telemetry and OCR pipeline instrumentation |
| `electron/preload.cjs` | builder | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013: expose new OCR cache telemetry IPC channel to renderer |
| `src/store/slices/createSettingsSlice.ts` | builder | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013: add typed OCR cache telemetry shape for dev-panel polling state |
| `src/components/DevOCRPanel.tsx` | ui-designer | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013: surface cache metrics card with timed polling in OCR tools UI |
| `src/components/OcrCorrectionModal.tsx` | ui-designer | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013: add correction shortcuts, confidence meter, and learning feedback badge |
| `src/hooks/useKeyboardShortcuts.ts` | builder | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013: generalize shortcut hook for reusable modal shortcut mappings |
| `src/components/ConfidenceMeter.tsx` | ui-designer | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013: introduce accessible confidence progress component for OCR review |
| `src/utils/ocrAliasEngine.ts` | builder | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013: add learning metadata helpers for OCR correction UX transparency |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013 intake normalization and risk/execution path declaration |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013 plan steps and single-step in-progress tracking |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013 execution lifecycle, dependency status, and PM feedback cycle |
| `docs/agents/03_VALIDATION.md` | verifier | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013 targeted validation commands and evidence logging |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013 implementation handoff summary |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-17T18:37:28Z | 2026-02-17T18:51:03Z | OCR-ENHANCEMENT-T1-013 scope and sequencing decisions for incremental rollout |
| `src/components/DevOCRPanel.tsx` | builder | 2026-02-17T18:06:00Z | 2026-02-17T18:12:00Z | OCR-CORPUS-ROI-012: forward live ROI settings in corpus pipeline invoke payload |
| `electron/main.cjs` | builder | 2026-02-17T18:06:00Z | 2026-02-17T18:12:00Z | OCR-CORPUS-ROI-012: accept/forward optional ocrRegions in corpus pipeline processCapture runs |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-17T18:06:00Z | 2026-02-17T18:12:00Z | OCR-CORPUS-ROI-012 intake capture |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-17T18:06:00Z | 2026-02-17T18:12:00Z | OCR-CORPUS-ROI-012 step tracking |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-17T18:06:00Z | 2026-02-17T18:12:00Z | OCR-CORPUS-ROI-012 execution + PM feedback cycle |
| `docs/agents/03_VALIDATION.md` | verifier | 2026-02-17T18:06:00Z | 2026-02-17T18:12:00Z | OCR-CORPUS-ROI-012 validation evidence |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-17T18:06:00Z | 2026-02-17T18:12:00Z | OCR-CORPUS-ROI-012 final handoff summary |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-17T18:06:00Z | 2026-02-17T18:12:00Z | OCR-CORPUS-ROI-012 implementation rationale |
| `src/store/slices/createSettingsSlice.ts` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: add typed ROI update contract + persisted defaults/reset support |
| `src/store/useAppStore.ts` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: ROI hydration merge hardening and persisted settings round-trip |
| `src/components/SettingsModal.tsx` | ui-designer | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: add live ROI editor controls and reset action |
| `src/utils/electronBridge.ts` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: pass optional ROI payload through OCR IPC bridge |
| `src/utils/artifactService.ts` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: include optional ROI payload in rerun IPC request |
| `src/hooks/useSmartCapture.ts` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: ensure smart capture/rerun flows use live ROI settings |
| `src/components/SmartCapturesPanel.tsx` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: detail rerun path now threads live ROI settings |
| `src/components/HistoryTable.tsx` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: bulk rerun path now threads live ROI settings |
| `electron/ocrHandler.cjs` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: sanitize/apply ROI overrides and ROI-aware cache fingerprint |
| `electron/crewHubExtractor.cjs` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: consume dynamic Crew Hub layout overrides |
| `electron/mapScreenExtractor.cjs` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: consume dynamic Map Screen layout overrides |
| `electron/main.cjs` | builder | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: rerun IPC accepts/forwards optional ROI payload |
| `src/utils/__tests__/artifactService.test.ts` | verifier | 2026-02-17T17:28:30Z | 2026-02-17T17:52:30Z | OCR-ROI-RUNTIME-011: verify rerun payload includes optional ROI settings |
| `electron/main.cjs` | builder | 2026-02-17T17:01:41Z | 2026-02-17T17:03:40Z | CORPUS-IMPORT-DIR-009: set corpus import file-dialog defaultPath to corpus images directory |
| `electron/crewHubExtractor.cjs` | builder | 2026-02-17T17:15:40Z | 2026-02-17T17:23:42Z | OCR-DUAL-BUFFER-GATES-010: split text/color buffer flow for color-safe crew extraction |
| `electron/ocrMerger.cjs` | builder | 2026-02-17T17:15:40Z | 2026-02-17T17:23:42Z | OCR-DUAL-BUFFER-GATES-010: enforce per-team player cap at OCR merge boundary |
| `src/utils/ocr/ocrParser.ts` | builder | 2026-02-17T17:15:40Z | 2026-02-17T17:23:42Z | OCR-DUAL-BUFFER-GATES-010: enforce teammate/opponent guardrails in frontend OCR merges |
| `src/App.tsx` | builder | 2026-02-17T17:15:40Z | 2026-02-17T17:23:42Z | OCR-DUAL-BUFFER-GATES-010: strict OCR auto-apply gating and review queue routing |
| `src/utils/ocr/__tests__/ocrParser.test.ts` | verifier | 2026-02-17T17:15:40Z | 2026-02-17T17:23:42Z | OCR-DUAL-BUFFER-GATES-010: regression tests for OCR merge/player-cap guardrails |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-17T17:01:41Z | 2026-02-17T17:03:40Z | CORPUS-IMPORT-DIR-009 intake and scope normalization |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-17T17:01:41Z | 2026-02-17T17:03:40Z | CORPUS-IMPORT-DIR-009 plan and status tracking |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-17T17:01:41Z | 2026-02-17T17:03:40Z | CORPUS-IMPORT-DIR-009 execution log + PM feedback lifecycle |
| `docs/agents/03_VALIDATION.md` | verifier | 2026-02-17T17:01:41Z | 2026-02-17T17:03:40Z | CORPUS-IMPORT-DIR-009 validation evidence logging |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-17T17:01:41Z | 2026-02-17T17:03:40Z | CORPUS-IMPORT-DIR-009 handoff summary |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-17T17:01:41Z | 2026-02-17T17:03:40Z | CORPUS-IMPORT-DIR-009 implementation decision log |
| `src/components/ErrorBoundary.tsx` | builder | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: emergency-reset confirmation safety and accessibility copy hardening |
| `src/config/runtimeConfig.ts` | builder | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: extend env-backed runtime timing configuration coverage |
| `src/hooks/useDiscordRPC.ts` | builder | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: replace hardcoded presence refresh interval with runtime config |
| `src/components/SystemPulse.tsx` | builder | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: replace hardcoded status poll interval with runtime config |
| `src/components/HistoryTable.tsx` | builder | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: replace hardcoded debounce/refresh timers with runtime config |
| `src/components/DrillDownOverlay.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to icon-only close controls |
| `src/components/analytics/AnalyticsShell.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to icon-only analytics nav controls |
| `src/components/PlayerHub.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to icon-only player action controls |
| `src/components/ReviewQueueModal.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to icon-only review action controls |
| `src/components/recording/RosterPanel.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to icon-only roster controls |
| `src/components/SessionTimer.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to icon-only session timer controls |
| `src/components/SettingsModal.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to settings modal icon controls |
| `src/components/recording/MissionPanel.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to icon-only mission controls |
| `src/components/Tutorial.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to tutorial icon controls |
| `src/components/WindowFrame.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to window frame controls |
| `src/components/smart-captures/SmartCaptureWidgets.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to icon-only smart-capture widget controls |
| `src/components/EditMatchModal.tsx` | ui-designer | 2026-02-17T16:41:00Z | 2026-02-17T16:52:27Z | FOLLOWUP-REMEDIATION-008: add missing aria-label to icon-only modal controls |
| `src/App.tsx` | builder | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: eliminate silent catches and wire env-backed runtime preload timing constants |
| `src/components/Toast.tsx` | ui-designer | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: add screen-reader live-region semantics and icon-button labeling |
| `src/components/MatchRecordingPage.tsx` | builder | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: replace silent artifact-load failures with structured warning logs |
| `src/utils/logger.ts` | builder | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: remove silent persistence failure path and improve non-fatal error reporting |
| `src/config/runtimeConfig.ts` | builder | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: centralize env-backed frontend runtime constants |
| `src/vite-env.d.ts` | builder | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: enable typed Vite env access for runtime config |
| `src/utils/__tests__/storage.test.ts` | verifier | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: add storage persist/flush regression coverage |
| `src/hooks/__tests__/useLogMonitor.test.ts` | verifier | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: add telemetry monitor behavior coverage |
| `src/hooks/__tests__/useSmartCapture.test.ts` | verifier | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: expand smart capture OCR state-management coverage |
| `src/App.test.tsx` | verifier | 2026-02-17T16:19:51Z | 2026-02-17T16:32:43Z | MODERATE-REMEDIATION-006: add top-level app smoke/error-handling coverage |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-17T15:02:06Z | 2026-02-17T15:03:41Z | REFACTOR-CLOSEOUT-007 intake record for end-to-end closure of unfinished giant refactor |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-17T15:02:06Z | 2026-02-17T15:03:41Z | REFACTOR-CLOSEOUT-007 closeout step tracking |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-17T15:02:06Z | 2026-02-17T15:03:41Z | REFACTOR-CLOSEOUT-007 execution + PM feedback cycle entries |
| `docs/agents/03_VALIDATION.md` | verifier | 2026-02-17T15:02:06Z | 2026-02-17T15:03:41Z | REFACTOR-CLOSEOUT-007 full quality-gate evidence logging |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-17T15:02:06Z | 2026-02-17T15:03:41Z | REFACTOR-CLOSEOUT-007 final closure handoff |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-17T15:02:06Z | 2026-02-17T15:03:41Z | REFACTOR-CLOSEOUT-007 closure/scope decision log |
| `docs/WORKLOCKS.md` | debugger | 2026-02-17T15:02:06Z | 2026-02-17T15:03:41Z | REFACTOR-CLOSEOUT-007 lock table maintenance |
| `src/utils/electronBridge.ts` | builder | 2026-02-17T15:33:34Z | 2026-02-17T15:40:47Z | AUDIT-REMEDIATION-005 OCR/telemetry runtime hardening: remove remaining IPC `any` and unsafe catch typing |
| `src/utils/logger.ts` | builder | 2026-02-17T15:33:34Z | 2026-02-17T15:40:47Z | AUDIT-REMEDIATION-005 OCR/telemetry runtime hardening: suppress production console spam and remove logger `any` typing |
| `src/App.tsx` | builder | 2026-02-17T15:33:34Z | 2026-02-17T15:40:47Z | AUDIT-REMEDIATION-005 OCR/telemetry runtime hardening: replace direct OCR debug console logs with structured logger |
| `src/components/DevOCRPanel.tsx` | builder | 2026-02-17T15:33:34Z | 2026-02-17T15:40:47Z | AUDIT-REMEDIATION-005 OCR/telemetry runtime hardening: remove `any` catches/state and direct console usage |
| `electron/helpers/artifactHelpers.cjs` | builder | 2026-02-17T15:33:34Z | 2026-02-17T15:40:47Z | AUDIT-REMEDIATION-005 OCR/telemetry runtime hardening: canonical telemetry archive normalization in artifact bundling |
| `electron/helpers/telemetryArchiveHelpers.cjs` | builder | 2026-02-17T15:33:34Z | 2026-02-17T15:40:47Z | AUDIT-REMEDIATION-005 OCR/telemetry runtime hardening: reuse canonical archive normalization helpers |
| `docs/TELEMETRY_PIPELINE.md` | project-manager | 2026-02-17T15:33:34Z | 2026-02-17T15:40:47Z | AUDIT-REMEDIATION-005 telemetry archive normalization documentation alignment |
| `src/App.tsx` | builder | 2026-02-17T08:21:25Z | 2026-02-17T08:29:02Z | OCR-TEAM-CAP-HARDEN-006: enforce teammate cap in OCR apply flow before wizard/session propagation |
| `src/hooks/useMatchSubmission.ts` | builder | 2026-02-17T08:21:25Z | 2026-02-17T08:29:02Z | OCR-TEAM-CAP-HARDEN-006: enforce teammate cap at submission boundary for pending draft/final match writes |
| `src/components/SmartCapturesPanel.tsx` | builder | 2026-02-17T08:21:25Z | 2026-02-17T08:29:02Z | OCR-TEAM-CAP-HARDEN-006: cap rerun/apply teammate writes in Smart Captures wizard flows |
| `src/utils/teamLimits.ts` | builder | 2026-02-17T08:21:25Z | 2026-02-17T08:29:02Z | OCR-TEAM-CAP-HARDEN-006: shared ship-capacity teammate cap utility |
| `src/utils/__tests__/teamLimits.test.ts` | verifier | 2026-02-17T08:21:25Z | 2026-02-17T08:29:02Z | OCR-TEAM-CAP-HARDEN-006: focused regression tests for teammate cap utility |
| `src/utils/scan/imageUtils.ts` | builder | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001: capture and return OCR debug screenshot path for review provenance |
| `src/store/slices/createDataSlice.ts` | builder | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001: extend pending review schema with source screenshot metadata |
| `src/hooks/useSmartScan.ts` | builder | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001: attach source screenshot metadata to low-confidence player-name review entries |
| `src/components/ReviewQueueModal.tsx` | ui-designer | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001: surface per-entry source details and screenshot preview action in intelligence review modal |
| `src/components/ReviewQueueModal.test.tsx` | verifier | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001: add regression coverage for source screenshot affordance in review queue |
| `docs/agents/00_INTAKE.md` | project-manager | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001 intake normalization and acceptance criteria |
| `docs/agents/01_PLAN.md` | project-manager | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001 plan/status tracking |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001 execution log and PM feedback cycle entries |
| `docs/agents/03_VALIDATION.md` | verifier | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001 validation command/evidence logging |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001 handoff summary |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001 scope and UI-source provenance decisions |
| `docs/WORKLOCKS.md` | debugger | 2026-02-17T19:45:00Z | 2026-02-17T19:50:00Z | IQR-NAME-SOURCE-001 lock table maintenance |
| `src/hooks/useLogMonitor.ts` | builder | 2026-02-17T18:57:00Z | 2026-02-17T19:04:00Z | AUDIT-REMEDIATION-003: remove high-risk telemetry event/loadout `any` usage in runtime monitor path |
| `src/App.tsx` | builder | 2026-02-17T18:57:00Z | 2026-02-17T19:04:00Z | AUDIT-REMEDIATION-003: tighten telemetry prune/idle-callback typing and remove runtime `any` casts |
| `src/store/slices/createUISlice.ts` | builder | 2026-02-17T18:57:00Z | 2026-02-17T19:04:00Z | AUDIT-REMEDIATION-003: replace telemetry status setter `any` with explicit typed partial payload |
| `src/providers/UIStateProvider.tsx` | builder | 2026-02-17T18:57:00Z | 2026-02-17T19:04:00Z | AUDIT-REMEDIATION-003: align UI context telemetry status signatures with explicit status type |
| `docs/agents/02_EXECUTION_LOG.md` | debugger | 2026-02-17T18:57:00Z | 2026-02-17T19:04:00Z | AUDIT-REMEDIATION-003 execution log and PM feedback cycle entries |
| `docs/agents/03_VALIDATION.md` | verifier | 2026-02-17T18:57:00Z | 2026-02-17T19:04:00Z | AUDIT-REMEDIATION-003 validation evidence update |
| `docs/agents/04_HANDOFF.md` | release-manager | 2026-02-17T18:57:00Z | 2026-02-17T19:04:00Z | AUDIT-REMEDIATION-003 handoff summary update |
| `docs/agents/DECISIONS.md` | project-manager | 2026-02-17T18:57:00Z | 2026-02-17T19:04:00Z | AUDIT-REMEDIATION-003 scope and type-contract decisions |
| `src/store/slices/createFormSlice.ts` | builder | 2026-02-16T18:01:11Z | 2026-02-16T18:05:48Z | REMAINING-UX-TELEMETRY-005: add opponent dedupe normalization in central setter/toggle paths |
| `src/store/slices/__tests__/createFormSlice.test.ts` | builder | 2026-02-16T18:01:11Z | 2026-02-16T18:05:48Z | REMAINING-UX-TELEMETRY-005: add regression test for opponent dedupe behavior |
| `src/hooks/useLogMonitor.ts` | builder | 2026-02-16T18:01:11Z | 2026-02-16T18:05:48Z | REMAINING-UX-TELEMETRY-005: ensure telemetry auto-select applies both weapons and equipment |
| `src/components/Wizard.tsx` | builder | 2026-02-16T18:01:11Z | 2026-02-16T18:05:48Z | REMAINING-UX-TELEMETRY-005: add manual loadout slot inputs in wizard |
| `src/App.tsx` | builder | 2026-02-16T18:01:11Z | 2026-02-16T18:05:48Z | REMAINING-UX-TELEMETRY-005: normalize OCR opponent team color mapping and duplicate suppression |
| `src/components/recording/ActionPanel.test.tsx` | builder | 2026-02-16T18:01:11Z | 2026-02-16T18:05:48Z | REMAINING-UX-TELEMETRY-005: add regression assertion for telemetry loadout auto-indicator copy |
| `src/store/slices/createFormSlice.ts` | builder | 2026-02-16T17:53:44Z | 2026-02-16T17:55:43Z | OCR-TEAM-CAP-GUARD-004: centralize teammate dedupe + capacity guard for OCR/session apply paths |
| `src/store/slices/__tests__/createFormSlice.test.ts` | builder | 2026-02-16T17:53:44Z | 2026-02-16T17:55:43Z | OCR-TEAM-CAP-GUARD-004: add regression tests for capped/deduped teammate setter behavior |
| `src/App.tsx` | builder | 2026-02-16T17:48:10Z | 2026-02-16T17:49:58Z | POSTMATCH-TELEMETRY-PROMPT-003: align telemetry post-match prompt result routing with explicit recording OCR gate flow |
| `src/components/recording/ActionPanel.test.tsx` | builder | 2026-02-16T17:39:55Z | 2026-02-16T17:43:09Z | POSTMATCH-OCR-GATE-002: add regression coverage for non-auto OCR result flow |
| `src/components/ReviewQueueModal.tsx` | builder | 2026-02-16T17:33:39Z | 2026-02-16T17:37:44Z | IQR-PLAYERNAME-001: fix player_name confirm/edit/delete behavior in Intelligence Review flow |
| `src/components/ReviewQueueModal.test.tsx` | builder | 2026-02-16T17:33:39Z | 2026-02-16T17:37:44Z | IQR-PLAYERNAME-001: targeted regression tests for ReviewQueueModal player_name actions |
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
| src/components/OcrCorrectionModal.tsx | builder | 2026-02-18T18:12:00Z | OCR-WIZARD-REASSIGN-003 team/ship drag reassignment and screenshot-assisted OCR wizard review |
| src/components/Wizard.tsx | builder | 2026-02-18T18:12:00Z | OCR-WIZARD-REASSIGN-003 pass wizard artifacts into OCR correction modal screenshot references |

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
| src/components/SmartCapturesPanel.tsx | ui-designer | hot | 2026-02-16T22:10:00Z | 2026-02-16T23:10:00Z | OCR-CORRECTION-DELETE-002 add single/bulk delete controls + CTA clarity follow-ups |
| src/components/ocr/OCRReviewModal.tsx | ui-designer | hot | 2026-02-16T22:10:00Z | 2026-02-16T23:10:00Z | OCR-CORRECTION-DELETE-002 add first-time helper, reason hints, and undo review list |
| src/components/OcrCorrectionModal.tsx | ui-designer | hot | 2026-02-16T22:10:00Z | 2026-02-16T23:10:00Z | OCR-CORRECTION-DELETE-002 improve wizard correction copy/action clarity |
| docs/agents/00_INTAKE.md | project-manager | hot | 2026-02-16T22:10:00Z | 2026-02-16T23:10:00Z | OCR-CORRECTION-DELETE-002 intake update |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-16T22:10:00Z | 2026-02-16T23:10:00Z | OCR-CORRECTION-DELETE-002 plan update |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-16T22:10:00Z | 2026-02-16T23:10:00Z | OCR-CORRECTION-DELETE-002 execution log update |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-16T22:10:00Z | 2026-02-16T23:10:00Z | OCR-CORRECTION-DELETE-002 validation update |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-16T22:10:00Z | 2026-02-16T23:10:00Z | OCR-CORRECTION-DELETE-002 handoff update |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-16T22:10:00Z | 2026-02-16T23:10:00Z | OCR-CORRECTION-DELETE-002 decision updates |
| src/components/SmartCapturesPanel.tsx | ui-designer | hot | 2026-02-16T22:15:36Z | 2026-02-16T22:15:36Z | OCR-CORRECTION-DELETE-002 lock released |
| src/components/ocr/OCRReviewModal.tsx | ui-designer | hot | 2026-02-16T22:15:36Z | 2026-02-16T22:15:36Z | OCR-CORRECTION-DELETE-002 lock released |
| src/components/OcrCorrectionModal.tsx | ui-designer | hot | 2026-02-16T22:15:36Z | 2026-02-16T22:15:36Z | OCR-CORRECTION-DELETE-002 lock released |
| docs/agents/00_INTAKE.md | project-manager | hot | 2026-02-16T22:15:36Z | 2026-02-16T22:15:36Z | OCR-CORRECTION-DELETE-002 lock released |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-16T22:15:36Z | 2026-02-16T22:15:36Z | OCR-CORRECTION-DELETE-002 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-16T22:15:36Z | 2026-02-16T22:15:36Z | OCR-CORRECTION-DELETE-002 lock released |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-16T22:15:36Z | 2026-02-16T22:15:36Z | OCR-CORRECTION-DELETE-002 lock released |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-16T22:15:36Z | 2026-02-16T22:15:36Z | OCR-CORRECTION-DELETE-002 lock released |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-16T22:15:36Z | 2026-02-16T22:15:36Z | OCR-CORRECTION-DELETE-002 lock released |
| src/utils/artifactService.ts | builder | hot | 2026-02-17T18:20:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 typed OCR rerun contract + telemetry canonical boundary |
| src/utils/storage.ts | builder | hot | 2026-02-17T18:20:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 storage type hardening + migration marker guarantees |
| src/components/DashboardLayout.tsx | builder | hot | 2026-02-17T18:20:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 layout typing/API migration cleanup |
| src/components/SimulatorPanel.tsx | builder | hot | 2026-02-17T18:20:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 telemetry timestamp normalization adoption |
| src/components/SmartCapturesPanel.tsx | builder | hot | 2026-02-17T18:20:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 canonical telemetry + OCR rerun type narrowing |
| src/utils/__tests__/artifactService.test.ts | verifier | hot | 2026-02-17T18:20:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 update telemetry shape assertion |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-17T18:33:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 completion status update |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-17T18:33:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 execution log and PM feedback cycle update |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-17T18:33:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 validation evidence update |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-17T18:33:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 handoff summary update |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-17T18:33:00Z | 2026-02-17T19:00:00Z | AUDIT-REMEDIATION-001 decision log update |
| src/utils/artifactService.ts | builder | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| src/utils/storage.ts | builder | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| src/components/DashboardLayout.tsx | builder | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| src/components/SimulatorPanel.tsx | builder | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| src/components/SmartCapturesPanel.tsx | builder | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| src/utils/__tests__/artifactService.test.ts | verifier | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-17T18:36:00Z | 2026-02-17T18:36:00Z | AUDIT-REMEDIATION-001 lock released |
| src/hooks/useSmartCapture.ts | builder | hot | 2026-02-17T19:05:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 typed smart-scan and OCR rerun flow cleanup |
| src/components/SmartCapturesPanel.tsx | builder | hot | 2026-02-17T19:05:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 OCR rerun/result typing cleanup |
| src/components/recording/ActionPanel.tsx | builder | hot | 2026-02-17T19:05:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 submission path any-removal cleanup |
| src/components/ReviewQueueModal.tsx | builder | hot | 2026-02-17T19:05:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 pending-review type narrowing |
| src/providers/GameDataProvider.tsx | builder | hot | 2026-02-17T19:05:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 context interface type tightening |
| src/store/slices/createFormSlice.ts | builder | hot | 2026-02-17T19:05:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 pending match data typing cleanup |
| docs/agents/00_INTAKE.md | project-manager | hot | 2026-02-17T19:05:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 intake record |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-17T19:05:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 plan record |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-17T19:30:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 execution log update |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-17T19:30:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 validation update |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-17T19:30:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 handoff update |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-17T19:30:00Z | 2026-02-17T20:00:00Z | AUDIT-REMEDIATION-002 decision entries |
| src/hooks/useSmartCapture.ts | builder | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| src/components/SmartCapturesPanel.tsx | builder | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| src/components/recording/ActionPanel.tsx | builder | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| src/components/ReviewQueueModal.tsx | builder | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| src/providers/GameDataProvider.tsx | builder | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| src/store/slices/createFormSlice.ts | builder | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| docs/agents/00_INTAKE.md | project-manager | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-17T19:36:00Z | 2026-02-17T19:36:00Z | AUDIT-REMEDIATION-002 lock released |


| src/App.tsx | builder | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| src/components/SmartCapturesPanel.tsx | builder | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| src/utils/ocr/teamColorAssignment.ts | builder | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| src/utils/ocr/__tests__/teamColorAssignment.test.ts | verifier | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| src/store/slices/createSettingsSlice.ts | builder | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| src/store/useAppStore.ts | builder | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| src/components/SettingsModal.tsx | ui-designer | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| src/components/recording/ActionPanel.tsx | builder | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| src/components/recording/ActionPanel.test.tsx | verifier | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| docs/agents/03_VALIDATION.md | verifier | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| docs/agents/04_HANDOFF.md | release-manager | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| docs/agents/DECISIONS.md | project-manager | 2026-02-17T19:08:00Z | 2026-02-17T20:27:35Z | AUDIT-REMEDIATION-004 lock released |
| src/components/Wizard.tsx | builder | 2026-02-17T05:13:56Z | 2026-02-17T05:58:56Z | RESULT-HOOK-CRASH-310-001 fix hook-order crash when result buttons open wizard |
| src/components/Wizard.test.tsx | verifier | 2026-02-17T05:13:56Z | 2026-02-17T05:58:56Z | RESULT-HOOK-CRASH-310-001 add regression coverage for closed->open wizard render path |
| docs/agents/00_INTAKE.md | project-manager | 2026-02-17T05:13:56Z | 2026-02-17T05:58:56Z | RESULT-HOOK-CRASH-310-001 intake record |
| docs/agents/01_PLAN.md | project-manager | 2026-02-17T05:13:56Z | 2026-02-17T05:58:56Z | RESULT-HOOK-CRASH-310-001 plan record |
| docs/agents/02_EXECUTION_LOG.md | debugger | 2026-02-17T05:13:56Z | 2026-02-17T05:58:56Z | RESULT-HOOK-CRASH-310-001 execution log updates |
| docs/agents/03_VALIDATION.md | verifier | 2026-02-17T05:13:56Z | 2026-02-17T05:58:56Z | RESULT-HOOK-CRASH-310-001 validation evidence |
| docs/agents/04_HANDOFF.md | release-manager | 2026-02-17T05:13:56Z | 2026-02-17T05:58:56Z | RESULT-HOOK-CRASH-310-001 handoff summary |
| docs/agents/DECISIONS.md | project-manager | 2026-02-17T05:13:56Z | 2026-02-17T05:58:56Z | RESULT-HOOK-CRASH-310-001 scope/implementation decisions |
| docs/WORKLOCKS.md | debugger | 2026-02-17T05:13:56Z | 2026-02-17T05:58:56Z | RESULT-HOOK-CRASH-310-001 lock maintenance |
| src/components/Wizard.tsx | builder | 2026-02-17T05:17:15Z | 2026-02-17T05:17:15Z | RESULT-HOOK-CRASH-310-001 lock released |
| src/components/Wizard.test.tsx | verifier | 2026-02-17T05:17:15Z | 2026-02-17T05:17:15Z | RESULT-HOOK-CRASH-310-001 lock released |
| docs/agents/00_INTAKE.md | project-manager | 2026-02-17T05:17:15Z | 2026-02-17T05:17:15Z | RESULT-HOOK-CRASH-310-001 lock released |
| docs/agents/01_PLAN.md | project-manager | 2026-02-17T05:17:15Z | 2026-02-17T05:17:15Z | RESULT-HOOK-CRASH-310-001 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | 2026-02-17T05:17:15Z | 2026-02-17T05:17:15Z | RESULT-HOOK-CRASH-310-001 lock released |
| docs/agents/03_VALIDATION.md | verifier | 2026-02-17T05:17:15Z | 2026-02-17T05:17:15Z | RESULT-HOOK-CRASH-310-001 lock released |
| docs/agents/04_HANDOFF.md | release-manager | 2026-02-17T05:17:15Z | 2026-02-17T05:17:15Z | RESULT-HOOK-CRASH-310-001 lock released |
| docs/agents/DECISIONS.md | project-manager | 2026-02-17T05:17:15Z | 2026-02-17T05:17:15Z | RESULT-HOOK-CRASH-310-001 lock released |
| docs/WORKLOCKS.md | debugger | 2026-02-17T05:17:15Z | 2026-02-17T05:17:15Z | RESULT-HOOK-CRASH-310-001 lock released |
| src/components/OcrCorrectionModal.test.tsx | verifier | 2026-02-17T06:04:41Z | 2026-02-17T06:51:38Z | WIZARD-HOOK-AUDIT-002 add modal transition regression coverage for OCR correction wizard flow |
| docs/agents/00_INTAKE.md | project-manager | 2026-02-17T06:04:41Z | 2026-02-17T06:51:38Z | WIZARD-HOOK-AUDIT-002 intake record |
| docs/agents/01_PLAN.md | project-manager | 2026-02-17T06:04:41Z | 2026-02-17T06:51:38Z | WIZARD-HOOK-AUDIT-002 plan record |
| docs/agents/02_EXECUTION_LOG.md | debugger | 2026-02-17T06:04:41Z | 2026-02-17T06:51:38Z | WIZARD-HOOK-AUDIT-002 execution log updates |
| docs/agents/03_VALIDATION.md | verifier | 2026-02-17T06:04:41Z | 2026-02-17T06:51:38Z | WIZARD-HOOK-AUDIT-002 validation evidence |
| docs/agents/04_HANDOFF.md | release-manager | 2026-02-17T06:04:41Z | 2026-02-17T06:51:38Z | WIZARD-HOOK-AUDIT-002 handoff summary |
| docs/agents/DECISIONS.md | project-manager | 2026-02-17T06:04:41Z | 2026-02-17T06:51:38Z | WIZARD-HOOK-AUDIT-002 scope and safety decisions |
| docs/WORKLOCKS.md | debugger | 2026-02-17T06:04:41Z | 2026-02-17T06:51:38Z | WIZARD-HOOK-AUDIT-002 lock maintenance |
| src/components/OcrCorrectionModal.test.tsx | verifier | 2026-02-17T06:17:01Z | 2026-02-17T06:17:01Z | WIZARD-HOOK-AUDIT-002 lock released |
| docs/agents/00_INTAKE.md | project-manager | 2026-02-17T06:17:01Z | 2026-02-17T06:17:01Z | WIZARD-HOOK-AUDIT-002 lock released |
| docs/agents/01_PLAN.md | project-manager | 2026-02-17T06:17:01Z | 2026-02-17T06:17:01Z | WIZARD-HOOK-AUDIT-002 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | 2026-02-17T06:17:01Z | 2026-02-17T06:17:01Z | WIZARD-HOOK-AUDIT-002 lock released |
| docs/agents/03_VALIDATION.md | verifier | 2026-02-17T06:17:01Z | 2026-02-17T06:17:01Z | WIZARD-HOOK-AUDIT-002 lock released |
| docs/agents/04_HANDOFF.md | release-manager | 2026-02-17T06:17:01Z | 2026-02-17T06:17:01Z | WIZARD-HOOK-AUDIT-002 lock released |
| docs/agents/DECISIONS.md | project-manager | 2026-02-17T06:17:01Z | 2026-02-17T06:17:01Z | WIZARD-HOOK-AUDIT-002 lock released |
| docs/WORKLOCKS.md | debugger | 2026-02-17T06:17:01Z | 2026-02-17T06:17:01Z | WIZARD-HOOK-AUDIT-002 lock released |
| src/components/DrillDownOverlay.tsx | builder | 2026-02-17T20:48:00Z | 2026-02-17T21:45:00Z | OCR-ENHANCEMENT-T3-023 overlay dialog semantics + focus/escape behavior |
| src/components/DrillDownOverlay.test.tsx | verifier | 2026-02-17T20:48:00Z | 2026-02-17T21:45:00Z | OCR-ENHANCEMENT-T3-023 focused regression coverage for drill-down overlay accessibility |
| src/App.tsx | builder | 2026-02-17T20:48:00Z | 2026-02-17T21:45:00Z | OCR-ENHANCEMENT-T3-023 changelog/id-mapper wrapper accessibility hardening |
| src/App.test.tsx | verifier | 2026-02-17T20:48:00Z | 2026-02-17T21:45:00Z | OCR-ENHANCEMENT-T3-023 focused App overlay accessibility assertions |
| src/components/DrillDownOverlay.tsx | builder | 2026-02-17T20:52:26Z | 2026-02-17T20:52:26Z | OCR-ENHANCEMENT-T3-023 lock released |
| src/components/DrillDownOverlay.test.tsx | verifier | 2026-02-17T20:52:26Z | 2026-02-17T20:52:26Z | OCR-ENHANCEMENT-T3-023 lock released |
| src/App.tsx | builder | 2026-02-17T20:52:26Z | 2026-02-17T20:52:26Z | OCR-ENHANCEMENT-T3-023 lock released |
| src/App.test.tsx | verifier | 2026-02-17T20:52:26Z | 2026-02-17T20:52:26Z | OCR-ENHANCEMENT-T3-023 lock released |
| src/components/Tutorial.tsx | builder | 2026-02-17T21:25:44Z | 2026-02-17T22:20:00Z | OCR-ENHANCEMENT-T3-024 tutorial overlay accessibility hardening |
| src/components/MatchRecordingPage.tsx | builder | 2026-02-17T21:25:44Z | 2026-02-17T22:20:00Z | OCR-ENHANCEMENT-T3-024 match-detail lightbox accessibility hardening |
| src/components/Tutorial.test.tsx | verifier | 2026-02-17T21:25:44Z | 2026-02-17T22:20:00Z | OCR-ENHANCEMENT-T3-024 focused tutorial accessibility tests |
| src/components/MatchRecordingPage.test.tsx | verifier | 2026-02-17T21:25:44Z | 2026-02-17T22:20:00Z | OCR-ENHANCEMENT-T3-024 focused match lightbox accessibility tests |
| src/components/Tutorial.tsx | builder | 2026-02-17T21:30:52Z | 2026-02-17T21:30:52Z | OCR-ENHANCEMENT-T3-024 lock released |
| src/components/MatchRecordingPage.tsx | builder | 2026-02-17T21:30:52Z | 2026-02-17T21:30:52Z | OCR-ENHANCEMENT-T3-024 lock released |
| src/components/Tutorial.test.tsx | verifier | 2026-02-17T21:30:52Z | 2026-02-17T21:30:52Z | OCR-ENHANCEMENT-T3-024 lock released |
| src/components/MatchRecordingPage.test.tsx | verifier | 2026-02-17T21:30:52Z | 2026-02-17T21:30:52Z | OCR-ENHANCEMENT-T3-024 lock released |
| src/components/OcrRegionEditorModal.tsx | builder | 2026-02-17T22:09:00Z | 2026-02-17T23:30:00Z | OCR-ENHANCEMENT-T3-025 new visual ROI editor (full-resolution draw/drag/resize) |
| src/components/SettingsModal.tsx | builder | 2026-02-17T22:09:00Z | 2026-02-17T23:30:00Z | OCR-ENHANCEMENT-T3-025 wire ROI editor launch/apply into settings ROI section |
| src/components/PlayerHub.tsx | builder | 2026-02-17T22:09:00Z | 2026-02-17T23:30:00Z | OCR-ENHANCEMENT-T3-025 players panel vertical fill regression fix |
| src/components/DevOCRPanel.tsx | builder | 2026-02-17T22:09:00Z | 2026-02-17T23:30:00Z | OCR-ENHANCEMENT-T3-025 utilities overflow/cutoff layout fix |
| src/components/OcrCorrectionModal.tsx | builder | 2026-02-17T22:09:00Z | 2026-02-17T23:30:00Z | OCR-ENHANCEMENT-T3-025 OCR entry focus/cursor + modal top cutoff fixes |
| src/components/ocr/OCRReviewModal.tsx | builder | 2026-02-17T22:09:00Z | 2026-02-17T23:30:00Z | OCR-ENHANCEMENT-T3-025 OCR review modal top cutoff guard |
| src/components/OcrRegionEditorModal.tsx | builder | 2026-02-17T22:36:00Z | 2026-02-17T22:36:00Z | OCR-ENHANCEMENT-T3-025 lock released |
| src/components/SettingsModal.tsx | builder | 2026-02-17T22:36:00Z | 2026-02-17T22:36:00Z | OCR-ENHANCEMENT-T3-025 lock released |
| src/components/PlayerHub.tsx | builder | 2026-02-17T22:36:00Z | 2026-02-17T22:36:00Z | OCR-ENHANCEMENT-T3-025 lock released |
| src/components/DevOCRPanel.tsx | builder | 2026-02-17T22:36:00Z | 2026-02-17T22:36:00Z | OCR-ENHANCEMENT-T3-025 lock released |
| src/components/OcrCorrectionModal.tsx | builder | 2026-02-17T22:36:00Z | 2026-02-17T22:36:00Z | OCR-ENHANCEMENT-T3-025 lock released |
| src/components/ocr/OCRReviewModal.tsx | builder | 2026-02-17T22:36:00Z | 2026-02-17T22:36:00Z | OCR-ENHANCEMENT-T3-025 lock released |
| src/App.tsx | builder | 2026-02-17T22:36:00Z | 2026-02-17T22:36:00Z | OCR-ENHANCEMENT-T3-025 lock released |
| src/components/Wizard.tsx | builder | 2026-02-17T22:36:00Z | 2026-02-17T22:36:00Z | OCR-ENHANCEMENT-T3-025 lock released |
| src/App.tsx | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/components/recording/ActionPanel.tsx | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/components/Sidebar.tsx | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/components/analytics/AnalyticsShell.tsx | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/components/analytics/TimePatternView.tsx | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/components/IdMapper.tsx | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/components/DevOCRPanel.tsx | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/components/smart-captures/QueueItemRichPreview.tsx | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/components/smart-captures/primitives/ConfidenceMeter.tsx | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/store/slices/createFormSlice.ts | builder | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/store/slices/__tests__/createFormSlice.test.ts | verifier | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/index.css | ui-designer | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| package.json | release-manager | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/utils/constants.ts | release-manager | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/utils/changelog.ts | release-manager | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| docs/agents/01_PLAN.md | project-manager | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| docs/agents/02_EXECUTION_LOG.md | debugger | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| docs/agents/03_VALIDATION.md | verifier | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| docs/agents/04_HANDOFF.md | release-manager | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| docs/agents/DECISIONS.md | project-manager | hot | 2026-02-18T17:55:00Z | 2026-02-18T17:55:00Z | EMERGENCY-BATCH-2026-02-18-001 lock released |
| src/components/analytics/AnalyticsDashboard.tsx | builder | 2026-02-18T18:48:00Z | 2026-02-18T18:58:00Z | ANALYTICS-ARTIFACT-IDFLOW-005 overview narrative/insight expansion |
| src/components/analytics/KillEfficiencyView.tsx | builder | 2026-02-18T18:48:00Z | 2026-02-18T18:58:00Z | ANALYTICS-ARTIFACT-IDFLOW-005 bar-color differentiation |
| src/components/analytics/PlacementDistView.tsx | builder | 2026-02-18T18:48:00Z | 2026-02-18T18:58:00Z | ANALYTICS-ARTIFACT-IDFLOW-005 placement histogram readability updates |
| src/components/ReviewQueueModal.tsx | builder | 2026-02-18T18:48:00Z | 2026-02-18T18:58:00Z | ANALYTICS-ARTIFACT-IDFLOW-005 fuzzy review prioritization |
| electron/helpers/artifactRelinker.cjs | builder | 2026-02-18T18:48:00Z | 2026-02-18T18:58:00Z | ANALYTICS-ARTIFACT-IDFLOW-005 historical artifact relink reliability hardening |

