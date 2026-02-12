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
| _none_ |  |  |  |

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
