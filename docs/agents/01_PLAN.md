# 01 Plan

Status: ACTIVE

## Steps
1. [IN_PROGRESS] Bind `ui-designer` role to an explicit active agent tab and unblock lane B.
2. [PENDING] Builder fixes Bug 1: cloud-local merge modifier regression in OCR pipeline.
3. [PENDING] Builder fixes Bug 2: Crew Hub enemy/teammate misclassification (panel boundary issue).
4. [PENDING] Builder prototypes Bug 3 mitigation: map-screen teammate extraction via region-specific preprocessing.
5. [PENDING] Debugger validates each fix with abuse/negative checks and full predict+eval deltas.
6. [PENDING] PM publishes cycle handoff with baseline comparison and next-safe increment.

## Active Step
- IN_PROGRESS: Step 1
- Current role model version: v2 (role-based ownership)

## PM Approval
- Date (UTC): 2026-02-12T22:25:00Z
- Approved by: `project-manager`
- Approval: `ui-designer` is approved for the next phase.
- Scope for next phase:
  - OCR lane B only (UX clarity for OCR/security rejection messages and correction flow usability).
  - No expansion outside assigned lane files without explicit PM scope update.

## Notes
- Single-step mode is default.
- Multi-lane mode is allowed only when project-manager explicitly declares owner lanes and file boundaries.
- Lock compliance gate: any non-OCR lock is invalid during OCR-only mode unless project-manager approves a documented exception in `docs/agents/DECISIONS.md`.
- Phase gate rule: execute exactly one phase per cycle, verify, then stop for review.
- Anti-marathon rule: avoid large unbounded batches; prefer smallest testable increment.

## Role Roster (Default)
- `project-manager`: scope guardrails, lane assignment, conflict arbitration, final integration.
- `ui-designer`: OCR UX clarity for rejection/error states and correction flow usability.
- `builder`: code changes, refactors, and implementation tasks.
- `debugger`: bug reproduction, diagnosis, fix validation, and regression checks.
- `verifier` (optional): independent test pass before handoff.
- `reporter` (optional): concise external-facing handoff summary.

## Multi-Lane Declaration (OCR-Only Cycle)

- Enabled by: `project-manager`
- Reason: Resolve validated OCR bugs from debugger handoff in bounded increments.

### Lane A - project-manager (governance and arbitration)
- Files:
  - `docs/agents/00_INTAKE.md`
  - `docs/agents/01_PLAN.md`
  - `docs/agents/04_HANDOFF.md`
  - `docs/agents/DECISIONS.md`

### Lane B - ui-designer (OCR UX clarity only)
- Files:
  - `src/components/ocr/OCRReviewModal.tsx`
  - `src/components/OcrCorrectionModal.tsx`
  - `src/components/DevOCRPanel.tsx`
- Task:
  - Standardize user-safe error copy for security/validation rejects:
    - "Path not allowed"
    - "Unsupported external link"
- Status: COMPLETE
- Completion: 2026-02-13T00:15:00Z
- Evidence: `npm run build` passes, execution log entry added.

### Lane C - builder (OCR implementation)
- Files:
  - `electron/ocrHandler.cjs`
  - `electron/crewHubExtractor.cjs`
  - `electron/mapScreenExtractor.cjs`
  - `src/hooks/useSmartCapture.ts`
  - `src/components/recording/ActionPanel.tsx`
- Tasks:
  - Bug 1: region-aware merge strategy so cloud does not degrade modifier recall.
  - Bug 2: Crew Hub panel boundary correction for teammate/opponent classification.
  - Bug 3: map teammate region preprocessing experiment.
- Status: ACTIVE

### Lane D - debugger (OCR repro + validation)
- Files:
  - `docs/WORKLOCKS.md`
  - `docs/agents/02_EXECUTION_LOG.md`
  - `docs/agents/03_VALIDATION.md`
  - `docs/agents/BLOCKERS.md`
  - `dataset/ocr-corpus/`
- Tasks:
  - Reproduce baseline before each builder change.
  - Run `ocr:predict` + `ocr:eval` after each fix; record deltas.
  - Confirm no regression in best-known metrics.
- Status: ACTIVE

## WIP Limits
- Max active implementation lanes: 2 (`builder`, `debugger`).
- `ui-designer` lane is support-only and only when tied to OCR correction usability/security rejection UX.
- If rate-limit risk or long cycle is detected, force early checkpoint and handoff update.

## Phase Completion Gate
- A phase is complete only if all are true:
  - Build/test checks for this phase have run.
  - OCR runtime output evidence is captured in `docs/agents/03_VALIDATION.md`.
  - `npm run ocr:predict` and `npm run ocr:eval` deltas are recorded.
  - New blockers/risks are logged (or explicitly none).
  - `docs/agents/04_HANDOFF.md` is updated with next safe step.

## Parking Lot (Non-OCR Requests)
- Keep out-of-scope requests here and do not execute until OCR baseline is reached.
- _none_

## Queued Agent Task (PM Approved Queue Item)

### Task
- Name: One-Time Screenshot Integration + GCloud Upload
- Status: QUEUED (not started)
- Priority: Next migration batch after current active step gate
- Owner for queue activation: `project-manager`

### Goal
- Run a one-time migration that ingests screenshots from missing sources into the OCR corpus and uploads them to GCloud without duplicates.

### In Scope
1. Source A: `dataset/images/` (workspace dataset images).
2. Source B: `userData/training_data/` (local app-generated training pairs).
3. Integrate into corpus ground truth dataset.
4. Upload newly integrated images (and labels where available) to GCloud bucket.
5. Produce audit report + rollback artifacts.

### Out of Scope
1. Ongoing sync daemon.
2. OCR model retraining.
3. UI redesign.

### Implementation Design
1. Add script `scripts/ocr_corpus_ingest_legacy.cjs`.
2. Add npm command `ocr:ingest:legacy`.
3. Script supports flags:
   - `--dry-run`
   - `--apply`
   - `--upload`
   - `--strict`
   - `--sources dataset-images,training-data`
4. Deduplication keys:
   - SHA-256 image hash (primary)
   - normalized filename (secondary)
   - existing sampleId check in ground truth (tertiary)
5. Data mapping:
   - `dataset/images/*` -> new corpus samples with empty labels if none exist.
   - `userData/training_data/sample_<id>.png` + `sample_<id>.json` -> corpus sample with labels imported from JSON.
6. Output artifacts:
   - `dataset/ocr-corpus/reports/legacy-ingest-report.json`
   - `dataset/ocr-corpus/reports/legacy-ingest-report.md`
   - backup copy of truth before write.

### Agent Delegation
1. `project-manager`
   - Lock scope to this migration only.
   - Approve source paths and naming policy.
   - Gate completion on validation evidence.
2. `builder`
   - Implement `scripts/ocr_corpus_ingest_legacy.cjs`.
   - Update `package.json` scripts.
   - Reuse existing upload path via `gcloudSyncService` where possible.
   - Write ingest report + backup behavior.
3. `debugger`
   - Run abuse/edge cases:
     - duplicate files across both sources
     - corrupt JSON labels
     - missing label file
     - unsupported image extensions
     - bucket upload partial failure and retry behavior
   - Verify idempotency (second run should import 0 new files).
4. `verifier` (or `debugger` if unassigned)
   - Run full command sequence and record outputs in `docs/agents/03_VALIDATION.md`.
   - Confirm corpus counts and bucket deltas.

### Execution Steps
1. Preflight
   - Confirm cloud status/test upload works.
   - Snapshot current `ground-truth.json` and current bucket object count.
2. Dry-run ingest
   - Discover candidates, dedupe, produce report only.
3. Apply ingest
   - Write merged corpus + backups.
4. Upload phase
   - Upload only newly integrated files/labels.
5. Re-run baseline
   - `ocr:predict` then `ocr:eval`.
   - Record metric deltas.

### Required Commands
1. `npm run ocr:truth:validate`
2. `npm run ocr:ingest:legacy -- --dry-run`
3. `npm run ocr:ingest:legacy -- --apply --upload`
4. `npm run ocr:truth:validate`
5. `npm run ocr:predict`
6. `npm run ocr:eval`

### Acceptance Criteria
1. Legacy ingest report exists with counts by source.
2. Ground truth updated with new samples and no duplicate hashes/sampleIds.
3. Upload report shows uploaded/skipped/failed counts.
4. Second `--apply --upload` run is idempotent (0 new imports, mostly skips).
5. OCR eval runs successfully after migration.
6. Validation evidence logged in `docs/agents/03_VALIDATION.md`.

### Guardrails
1. Always run `--dry-run` before `--apply`.
2. Never overwrite truth without backup.
3. Fail closed on invalid label JSON when `--strict` is set.
4. Upload retries capped; failures recorded, not silently ignored.

### Rollback
1. Restore truth from backup file created during apply.
2. Use ingest report to delete uploaded `_ingest/<batch-id>/...` objects if rollback required.

## Queued Agent Task (PM Approved Queue Item)

### Task
- Name: Structure Hardening Sprint (3 Phases)
- Status: QUEUED (not started)
- Priority: After active OCR fix/validation gate
- Owner for queue activation: `project-manager`

### Goal
- Reduce structural risk by modularizing the Electron main process, standardizing state ownership, and adding coverage for high-risk flows.

### In Scope
1. Split `electron/main.cjs` into handler modules with clear ownership boundaries.
2. Standardize state access patterns across store/providers/hooks.
3. Remove legacy data duplication (`players` vs `pilotRegistry`) via staged migration.
4. Add targeted tests for critical hooks and IPC-backed flows.
5. Produce architecture notes + validation evidence.

### Out of Scope
1. Large UI redesign or visual refactor.
2. OCR model-quality changes unrelated to structure.
3. Full platform migration (framework swap, router rewrite, etc.).

### Phase Plan
1. Phase 1 (Quick Wins)
   - Extract telemetry/artifact/db helper logic from `electron/main.cjs` into focused modules.
   - Align preload/channel docs with actual IPC channels.
   - Fix obvious state reset/ownership inconsistencies in submission path.
2. Phase 2 (Core Refactor)
   - Introduce `electron/handlers/*` registration pattern for IPC handlers.
   - Define canonical state ownership (Zustand-first) and reduce provider duplication.
   - Begin legacy field migration path (`players` -> `pilotRegistry`) with compatibility shim.
3. Phase 3 (Safety Net)
   - Add tests for `useMatchSubmission`, `useSmartCapture`, and selected IPC handler behavior.
   - Run regression commands and record baseline vs post-refactor results.

### Agent Delegation
1. `project-manager`
   - Freeze scope to structure hardening only.
   - Approve module boundaries and migration sequencing.
   - Gate phase transitions on validation evidence.
2. `builder`
   - Implement file moves/extractions and compatibility-preserving refactors.
   - Add/adjust tests and supporting docs.
3. `debugger`
   - Run regression scenarios and failure-path checks after each phase.
   - Verify no behavioral drift in capture/submission/artifact flows.
4. `verifier` (or `debugger` if unassigned)
   - Independent command run and evidence logging in `docs/agents/03_VALIDATION.md`.

### Required Checks
1. `npm run build`
2. `npm run test` (or targeted vitest suites if full suite is too slow)
3. `npm run ocr:truth:validate`
4. `npm run ocr:predict`
5. `npm run ocr:eval`

### Acceptance Criteria
1. `electron/main.cjs` no longer hosts monolithic mixed responsibilities.
2. Handler modules exist with explicit registration and ownership.
3. State ownership is documented and direct-store/provider boundaries are enforced.
4. Legacy player field migration is staged and backward compatible.
5. Targeted tests added for critical flows; no major regression from baseline.
6. Validation evidence logged in `docs/agents/03_VALIDATION.md`.

### Guardrails
1. No behavior changes without a corresponding validation entry.
2. One phase at a time; do not start next phase without PM gate.
3. Keep compatibility adapters until migration completion criteria are met.
4. Avoid broad “rewrite” changes; use incremental extraction with parity checks.

### Rollback
1. Revert phase branch/patch set to previous checkpoint tag.
2. Restore compatibility adapters and previous handler wiring from checkpoint.

### Queued Role Prompts (Do Not Start Until PM Activates)

#### `project-manager` prompt (queued)
```md
Role: project-manager
Task: Structure Hardening Sprint, Phase 1 (queued only — do not execute yet)

Objective
- Prepare Phase 1 execution boundaries and activation checklist without starting implementation.

Required outputs (planning only)
1. Confirm phase scope lock:
   - Extract helper logic from `electron/main.cjs` into focused modules.
   - IPC channel alignment check between preload and main.
   - Submission-path state reset/ownership consistency checks.
2. Define file ownership lanes for builder/debugger/verifier.
3. Define activation gate and stop conditions for Phase 1.
4. Publish phase-ready checklist in `docs/agents/04_HANDOFF.md` (queued status).

Constraints
- Do not authorize code edits yet.
- Keep this queued until PM flips plan status to IN_PROGRESS.
```

#### `builder` prompt (queued)
```md
Role: builder
Task: Structure Hardening Sprint, Phase 1 implementation pack (queued only — do not execute yet)

Objective
- Prepare the implementation plan for Phase 1, no code changes until activation.

When activated, execute:
1. Extract helper logic from `electron/main.cjs` into focused modules:
   - telemetry/archive helpers
   - artifact filesystem helpers
   - db utility helpers (where safe)
2. Keep IPC behavior parity; no channel contract breaks.
3. Update imports/wiring in main with minimal diff.
4. Add/refresh lightweight module docs if needed.

Validation expectations
- `npm run build` passes
- No regressions in capture/submission/artifact flow

Constraints
- Queued only now; do not start coding until PM activation.
```

#### `debugger` prompt (queued)
```md
Role: debugger
Task: Structure Hardening Sprint, Phase 1 validation plan (queued only — do not execute yet)

Objective
- Prepare Phase 1 regression checks and evidence template; no execution yet.

When activated, validate:
1. Smart capture -> save screenshot -> submit match -> artifacts attached correctly.
2. Back-to-back match artifact isolation.
3. Telemetry archive load/list/clear behavior unchanged.
4. No IPC regressions for channels touched by extraction.

Required evidence
- Append pass/fail matrix and command outputs to `docs/agents/03_VALIDATION.md`.
- If failure: open blocker in `docs/agents/BLOCKERS.md` with repro + likely fault module.

Constraints
- Queued only now; do not run validation until PM activation.
```

#### `verifier` prompt (queued; optional)
```md
Role: verifier (or debugger if verifier unassigned)
Task: Independent verification for Structure Hardening Phase 1 (queued only — do not execute yet)

Objective
- Prepare independent verification checklist and acceptance gate for Phase 1.

When activated, independently run:
1. `npm run build`
2. Targeted tests for touched areas (or `npm run test` if stable window available)
3. Runtime sanity checks for capture/submission/artifact retrieval

Deliverables
- Independent signoff entry in `docs/agents/03_VALIDATION.md`
- Go/No-Go recommendation to project-manager

Constraints
- Queued only now; do not begin until PM activation.
```

## Queued Agent Task (PM Approved Queue Item)

### Task
- Name: Dev Splash Retry Noise Reduction
- Status: QUEUED (not started)
- Priority: After active OCR/security gates and queued structure phase activation window
- Owner for queue activation: `project-manager`

### Goal
- Reduce startup splash churn in dev mode where repeated "checking/retrying dev connection" updates flood up to many attempts and create noisy UX.

### In Scope
1. Improve `startDevRendererWithRetry` status update behavior in `electron/main.cjs`.
2. Throttle/dedupe splash status text updates so unchanged messages are not resent every attempt.
3. Cap visible retry messaging frequency (keep retries internal, reduce user-facing spam).
4. Keep retry robustness while making splash messaging calmer and more informative.

### Out of Scope
1. Production startup flow changes.
2. Full startup architecture rewrite.
3. Any OCR pipeline changes.

### Implementation Notes
1. Review `setSplashProgress` call sites in retry loop.
2. Introduce simple state memo for last rendered splash status/detail/pct.
3. Emit user-facing status only on meaningful transitions (e.g., first wait, periodic heartbeat, successful connect, failure threshold reached).
4. Keep retry/backoff logic functional; change messaging behavior first.

### Acceptance Criteria
1. Dev splash no longer prints near-duplicate "checking/retrying" updates every attempt.
2. Retry still works and renderer still connects automatically when dev server becomes ready.
3. Startup logs remain actionable without UI spam.
4. Validation evidence recorded in `docs/agents/03_VALIDATION.md`.
