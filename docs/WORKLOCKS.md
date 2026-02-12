# Work Locks

Use this file to temporarily claim high-conflict files while an agent is actively editing them.

Rules:
- Add a lock before editing hot/shared files.
- Keep scope narrow (single file or small related set).
- Remove lock as soon as step is complete (or commit is complete).
- If lock is stale, create an entry in `docs/agents/BLOCKERS.md` and wait for project-manager reassignment.
- Owner names for active locks are role-based: `project-manager`, `ui-designer`, `builder`, `debugger`.
- Optional support roles when staffing allows: `verifier`, `reporter`.
- Only edit `Active Locks` and append to `Recent Lock History`; do not rewrite historical rows.
- One lock row per file path (no grouped wildcard locks).
- OCR-only mode enforcement: each lock purpose must state OCR scope justification.
- Out-of-scope lock attempts must be rejected and logged in `docs/agents/BLOCKERS.md`.

## Active Locks

| File | Owner | Started (UTC) | Purpose |
|---|---|---|---|
| `electron/crewHubExtractor.cjs` | builder | 2026-02-12T19:27:57Z | Bug 2 fix: Crew Hub panel boundary teammate/opponent classification |
| `docs/agents/02_EXECUTION_LOG.md` | builder | 2026-02-12T19:27:57Z | log builder step boundary and Bug 2 implementation notes |
| `docs/agents/03_VALIDATION.md` | builder | 2026-02-12T19:27:57Z | capture predict/eval runtime evidence for Bug 2 phase |
| `docs/WORKLOCKS.md` | builder | 2026-02-12T19:27:57Z | claim/release lifecycle for Bug 2 phase |

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
