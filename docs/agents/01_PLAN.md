## Task Plan: CODEBASE_AUDIT_2026-02-13

Status: ACTIVE

1. [COMPLETE] Intake normalization for audit scope, constraints, and done condition in 00_INTAKE.
2. [COMPLETE] Establish audit baseline: repository inventory and high-risk subsystem map.
3. [COMPLETE] Run validation commands (lint, test, build, security negative tests) and collect outcomes.
4. [COMPLETE] Perform deep file-level review for stability, performance, and security findings with severity ranking.
5. [COMPLETE] Publish final handoff with UI/OCR optimization opportunities and remediation order.
# 01 Plan

Status: ACTIVE

## PM Bootstrap Rules (AOM_V2)
- **Before work starts:** `project-manager` sets **Risk Tier** (T0–T3) and **Execution Path** (FAST_PATH | FULL_PATH) in `docs/agents/00_INTAKE.md` for the current task.
- **Disjoint ownership:** Assign disjoint lanes per Multi-Lane Declaration; one owner per file/lane; conflicts escalated via BLOCKERS/DECISIONS.
- **Evidence before DONE:** No step may be marked DONE without evidence in `docs/agents/03_VALIDATION.md` unless `project-manager` explicitly waives (e.g. FAST_PATH docs-only). Missing evidence keeps status IN_PROGRESS.
- **Escalation:** Only via `docs/agents/BLOCKERS.md` or `docs/agents/DECISIONS.md`. No ad hoc scope or lane changes without PM update.
- **Role labels only:** All new entries in execution log, validation, handoff, blockers, and locks use role names only: `project-manager`, `ui-designer`, `builder`, `debugger`, `release-manager`, `verifier`, `reporter`. Legacy labels (lead, agent-a, etc.) are historical-only.

## Current Task
- **PM backlog** — Next work is in [docs/agents/PM_TODO.md](docs/agents/PM_TODO.md). Steps 1–20 complete; optional features F1, F2 for PM to assign. See 00_INTAKE and 04_HANDOFF.

## Step: PM Bootstrap (AOM_V2 alignment)
- [COMPLETE] `project-manager`: Update intake + plan for AGENT_BOOTSTRAP; set Risk Tier and Execution Path framework; require evidence before DONE; escalation via BLOCKERS/DECISIONS; role labels only. Evidence: `00_INTAKE.md`, `01_PLAN.md`, `DECISIONS.md` updated; `03_VALIDATION.md` bootstrap entry added.

## Steps (OCR Stabilization Cycle 01)
1. [COMPLETE] Bind `ui-designer` role to an explicit active agent tab and unblock lane B.
2. [COMPLETE] Builder fixes Bug 1: cloud-local merge modifier regression in OCR pipeline.
3. [COMPLETE] Builder fixes Bug 2: Crew Hub enemy/teammate misclassification (panel boundary issue).
4. [COMPLETE] Builder prototypes Bug 3 mitigation: map-screen teammate extraction via region-specific preprocessing.
5. [COMPLETE] Debugger validates each fix with abuse/negative checks and full predict+eval deltas.
6. [COMPLETE] PM publishes cycle handoff with baseline comparison and next-safe increment.

## Steps (Post-Cycle Activation)
7. [COMPLETE] One-Time Screenshot Integration + GCloud Upload — builder implemented ingest script + GCloud init fix; debugger validated.
8. [COMPLETE] Structure Hardening Sprint Phase 1 — builder extracted artifactHelpers.cjs; build + tests pass.
9. [COMPLETE] Structure Hardening Sprint Phase 2 — builder refactors handlers (artifactHandlers.cjs), debugger validates.
10. [COMPLETE] Structure Hardening Sprint Phase 3 — builder adds tests (artifactService, useMatchSubmission, useSmartCapture); build + 88 tests pass.
11. [COMPLETE] Dev Splash Retry Noise Reduction — builder implemented throttling + dedupe; build + tests pass.
12. [COMPLETE] Opacity Normalization (3-Tier System) — builder normalized text-related opacity across 25+ component files (full/60/40; disabled→opacity-disabled); build + tests pass.

## Steps (UI Overhaul — PLAN_UI_OVERHAUL.md)
13. [COMPLETE] Phase 1 — Telemetry indicator. Builder: store/hook extended; SystemPulse — one Telemetry chip (solid = connected, blinking = receiving); all 5 chips in header. Evidence: 03_VALIDATION "UI Overhaul Phase 1 — Telemetry indicator"; 02_EXECUTION_LOG builder entry.
14. [COMPLETE] Phase 2 — Navigation review. ui-designer: decision (no change); Sidebar vs UI_MASTERPLAN reviewed. Evidence: 03_VALIDATION Phase 2; DECISIONS.md; 02_EXECUTION_LOG.
15. [COMPLETE] Phase 3 — Smart Capture overhaul. ui-designer spec COMPLETE; builder confirmed implementation present (side nav, Capture | Tools, scView); build PASS. Evidence: 03_VALIDATION "Step 15 — UI Overhaul Phase 3". Spec §5 viewport/keyboard optional follow-up.
16. [COMPLETE] Phase 4 — Analytics overhaul. Builder: shell token alignment (rounded-modal, rounded-card, rounded-control, text-title); 02_EXECUTION_LOG, 03_VALIDATION. Build PASS.
17. [COMPLETE] Phase 5 — Tactical Console & overlay HUDs. Builder: TelemetryPanel + OverlayView (compact + transparent) token overhaul; 02_EXECUTION_LOG, 03_VALIDATION. tsc PASS.
18. [COMPLETE] Phase 6 — Validation / self-audit. Builder: self-audit in 03_VALIDATION; subjective → USER. All phases 1–6 complete.

## Step 19 — Batch authentication (UI Overhaul batch: Steps 13–18)
**Owner:** `project-manager` (assigns; does not implement).  
**Goal:** Thorough analysis of all work done this batch to authenticate: **clean design**, **functional code**, **role alignment**.  
**Real scope:** Audit only — no new feature work. Three roles each produce one 03_VALIDATION entry so Release-Manager has fresh evidence; PM runs 19d gate after.  
**Delegation:** Each role executes only their lane; evidence in `03_VALIDATION.md`; failures or role violations in `BLOCKERS.md`.  
**Reference (19a, 19b, 19c):** [docs/agents/STEP19_VERIFIER_UI_FEEDBACK.md](docs/agents/STEP19_VERIFIER_UI_FEEDBACK.md) — verifier walkthrough of current app state; use as input for design audit (19a), implementation attestation (19b), and functional/role-alignment audit (19c).

### Explicit assignment (PM) — execute 19a, 19b, 19c now
- **ui-designer** → **19a.** Deliverable: one 03_VALIDATION entry "Step 19a — ui-designer design audit". Inputs: PLAN_UI_OVERHAUL, UI_MASTERPLAN, UI_AUDIT, STEP19_VERIFIER_UI_FEEDBACK, changed files. If NO-GO → BLOCKERS for builder.
- **builder** → **19b.** Deliverable: one 03_VALIDATION entry "Step 19b — builder implementation attestation". Inputs: 01_PLAN Steps 13–18, 02_EXECUTION_LOG, codebase. If build/test FAIL → BLOCKERS.
- **verifier** → **19c.** Deliverable: one 03_VALIDATION entry "Step 19c — verifier functional and role-alignment audit". Inputs: diff, intake, plan, execution log, validation, STEP19_VERIFIER_UI_FEEDBACK. If FAIL → BLOCKERS with owner/action.
- **project-manager** → **19d** (after 19a–19c): Gate on 03_VALIDATION + BLOCKERS; if all PASS and no ACTIVE blockers, mark Step 19 COMPLETE and update 04_HANDOFF.

### 19a — ui-designer (design audit)
- **Inputs:** PLAN_UI_OVERHAUL.md, UI_MASTERPLAN.md, UI_AUDIT.md, changed files (SystemPulse, SmartCapturesPanel, AnalyticsShell, TelemetryPanel, OverlayView, ProView).
- **Task:** Audit for clean design: tokens (rounded-*, text-*, semantic colors), hierarchy (one primary action per context), no hardcoded colors/radii, empty/loading states where relevant. Compare 02_EXECUTION_LOG claims to actual UI.
- **Output:** One entry in `03_VALIDATION.md` under "Step 19a — ui-designer design audit" with: PASS/FAIL per area, list of violations (if any), recommendation (GO / NO-GO). If NO-GO or violations, add blocker in BLOCKERS.md for builder with concrete fixes.

### 19b — builder (implementation attestation)
- **Inputs:** 01_PLAN Steps 13–18, 02_EXECUTION_LOG, codebase.
- **Task:** Attest what was actually built: run `npm run build` and `npm test -- --run`. List files touched this batch and one-sentence summary per file. Confirm no out-of-scope files (if ProView was in scope, document; if not, flag scope drift).
- **Output:** One entry in `03_VALIDATION.md` under "Step 19b — builder implementation attestation" with: build exit code, test count and result, file list, scope-drift note if any. If build/test FAIL, add blocker in BLOCKERS.md.

### 19c — verifier (functional + role-alignment audit)
- **Inputs:** Code diff (Steps 13–18), 00_INTAKE, 01_PLAN, 02_EXECUTION_LOG, 03_VALIDATION.
- **Task:** (1) **Functional:** Spot-check behavior: telemetry chip states, Smart Capture nav (Capture vs Tools), Analytics shell chrome, Tactical Console / OverlayView tokens. Optional: viewport 1366x768 and 390x844 if feasible. (2) **Role alignment:** Compare 02_EXECUTION_LOG and 03_VALIDATION to role model: was design work done by ui-designer or by builder? Was verification done by verifier or by builder? List any role-boundary violations.
- **Output:** One entry in `03_VALIDATION.md` under "Step 19c — verifier functional and role-alignment audit" with: functional PASS/FAIL with notes, role-alignment PASS/FAIL with list of violations. If FAIL, add blocker in BLOCKERS.md with owner and required action.

### 19d — project-manager (gate)
- **Task:** After 19a–19c complete, read 03_VALIDATION and BLOCKERS. If all PASS and no ACTIVE blockers for Step 19, mark Step 19 COMPLETE and update 04_HANDOFF. If any NO-GO or ACTIVE blocker, keep Step 19 IN_PROGRESS and direct remediating role per BLOCKERS.

### Audit supervising authority (Release-Manager)
- **Directive (per DECISIONS.md):** Release-Manager is the supervising authority for the Step 19 retro audit. RM stops any `npm run electron:dev` / QA runs, verifies audit evidence, and attests that the foundation is secure before any lane resumes. PM may not approve further commits until RM has verified the audit evidence and (once 19a–19c are PASS) dropped the Foundation hold.

## Steps (Verifier feedback implementation — STEP19_VERIFIER_UI_FEEDBACK)
**Source:** [docs/agents/STEP19_VERIFIER_UI_FEEDBACK.md](docs/agents/STEP19_VERIFIER_UI_FEEDBACK.md). All items below are delegated for implementation; ui-designer produces specs/decisions where design or hierarchy is in question, builder implements, debugger validates regressions, verifier spot-checks when designated.

20. [COMPLETE] **Verifier feedback implementation.** Work items and delegation:

| # | Area | Summary | ui-designer | builder | debugger | verifier |
|---|------|---------|-------------|---------|----------|----------|
| 20.1 | Header / match indicator | Merge Telemetry indicator with match indicator; keep dual state (solid = log present, flashing = receiving). | Spec: how to merge, keep one chip with dual state. | Implement merge; remove separate Telemetry chip or combine per spec. | Regression: header chips still reflect state. | Spot-check when designated. |
| 20.2 | Analytics page | Fix scroll bar (bug); improve time/sort; add visual hierarchy; clarify connection top graphs ↔ dashboard. | Spec: hierarchy (which panels primary), connection to dashboard. | Fix scroll bar; improve time/sort UX; apply hierarchy/layout per spec. | Regression: analytics scroll, sort, layout. | Spot-check when designated. |
| 20.3 | Smart Capture | Reduce clutter on right; align Re-run analysis placement (top vs bottom); clarify Tools panel purpose (not “black box”). | Spec: layout, primary action placement, Tools panel copy/hierarchy. | Layout/clutter; move or duplicate Re-run; add copy/affordance for Tools. | Regression: capture flow, tools view. | Spot-check when designated. |
| 20.4 | Players tab | Paginated list (not single scroll); consider third column. | Spec: pagination UX, third column content/layout. | Implement pagination; add third column per spec. | Regression: players list, navigation. | Spot-check when designated. |
| 20.5 | History tab | Restore or clarify win/loss row shading across width. | Optional spec if design decision needed. | Restore win/loss shading or document why removed; clarify. | Regression: history table display. | Spot-check when designated. |
| 20.6 | Overlay | Fix transparent overlay (broken); compact: DevTools minimizable, fix bottom cut-off, default size ~15–20%. | Spec: overlay default size, minimizable DevTools, bottom button visibility. | Fix transparent overlay; compact: minimize DevTools, layout/size, default size. | Regression: overlay modes, data entry. | Spot-check when designated. |
| 20.7 | Settings tab | Reduce clutter (esp. OCR engine area); reduce white outlines/negative space; strengthen Alias/authority presence. | Spec: grouping, hierarchy, “authority” for alias/manager. | Layout, outlines, spacing; alias/manager prominence per spec. | Regression: settings flows. | Spot-check when designated. |
| 20.8 | ID Mapper | Visibility on recording panel; clarify where ID mapper lives. | Spec: where ID mapper appears (recording panel + elsewhere). | Surface ID mapper on recording panel per spec; ensure discoverable. | Regression: ID mapper access. | Spot-check when designated. |
| 20.9 | Dev OCR lab (corpus) | Plain-text ground truth input (“who was on my team”); show images present; flat/base images for corpus runs. | Spec: simple form for ground truth, image list/base images UX. | Plain-text form; image list view; base images for corpus per spec. | Regression: corpus eval, ground truth. | Spot-check when designated. |

- **Evidence:** Each work item (20.1–20.9) requires implementation and, where applicable, 03_VALIDATION or 02_EXECUTION_LOG entry. Build and test must remain PASS. PM may gate by sub-step or at end of Step 20.
- **Order:** Items may be implemented in parallel by different owners where lanes do not conflict; otherwise PM defines sequence (e.g. ui-designer spec before builder for that area).
- **Completion log (builder):** All 20.1–20.9 implemented. 02_EXECUTION_LOG: "Step 20 first batch (20.2, 20.5, 20.6) complete"; "Step 20 remainder (20.1, 20.3, 20.4, 20.7, 20.8, 20.9) complete". 03_VALIDATION: "Step 20 — Completion log (all tasks 20.1–20.9)" with per-item status table. Build + 88 tests PASS.

## Steps (PM backlog — optional follow-up)

21. [NOT STARTED] **PM backlog F1 + F2.** Source: [docs/agents/PM_TODO.md](docs/agents/PM_TODO.md). When starting next cycle, set Active Step = 21.
- **F1 (Analytics strip label):** ui-designer confirm copy/placement ("Quick views" or "Jump to"); builder add label in AnalyticsShell.tsx. Done when label visible; build + test PASS.
- **F2 (Overlay DevTools collapse):** ui-designer confirm in-scope; builder implement collapse/expand in overlay (compact) or document OOS in DECISIONS.md. Done when implemented or OOS documented; build + test PASS.
- **Evidence:** 02_EXECUTION_LOG entry per item; build + test PASS. PM may gate after F1/F2 or close deferred items.

## Active Step
- **None.** Steps 1–20 complete (archived). **Next cycle:** Set Active Step = 21 (PM backlog F1/F2). See [PM_TODO.md](docs/agents/PM_TODO.md) and Step 21 above.
- **Last gate:** build + 88 tests PASS. No ACTIVE blockers.

## Completed steps (1–20) — reference
- **1–6:** OCR Stabilization. **7–12:** Post-cycle (Screenshot/GCloud, Structure Hardening, Dev Splash, Opacity). **13–18:** UI Overhaul Phases 1–6. **19:** Batch auth (19a–19d, RM signoff). **20:** Verifier feedback (20.1–20.9); PM gate PASS. Optional follow-up → PM_TODO.

## Canonical UI Overhaul Plan (Reference)
- **Plan:** [docs/agents/PLAN_UI_OVERHAUL.md](docs/agents/PLAN_UI_OVERHAUL.md) — canonical plan for Smart Capture, Analytics, telemetry indicator, navigation, Tactical Console, and overlay HUD overhauls (phases 1–6, delegation, self-audit + user routing).
- **Existing UI style guidelines remain in force:** All work under the UI overhaul must follow:
  - [docs/agents/UI_MASTERPLAN.md](docs/agents/UI_MASTERPLAN.md) — design system, tokens, surfaces, opacity, status colors, layout, action hierarchy, PR/UI gate.
  - [docs/UI_AUDIT.md](docs/UI_AUDIT.md) — anti-patterns and consistency recommendations.
- The overhaul plan references these docs; it does not replace or override them.

## PM Approval
- Date (UTC): 2026-02-12T22:25:00Z
- Approved by: `project-manager`
- Approval: `ui-designer` is approved for the next phase.
- Scope for next phase:
  - OCR lane B only (UX clarity for OCR/security rejection messages and correction flow usability).
  - No expansion outside assigned lane files without explicit PM scope update.

## PM Approval — Step 12 Opacity Normalization (continue)
- Date (UTC): 2026-02-13
- Approved by: `project-manager`
- Approval: Step 12 batch 2 (8/18 files) **APPROVED**. Builder may continue with remaining 10 files per intake (3-tier text opacity; text only; disabled → opacity-disabled).
- Release-manager gate: **GO** (build + tests PASS; visual-only).

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
- `release-manager`: release-candidate integration, gate enforcement, rollback package ownership.
- `verifier` (optional): independent test pass before handoff.
- `reporter` (optional): concise external-facing handoff summary.

## Agent Role Assignment (Cursor AI)
- **Assigned role:** `project-manager`
- **Agent:** Cursor AI (this session / primary assistant).
- **Scope:** When operating in this workspace, the AI acts as project-manager unless the user explicitly assigns a different role or task to another agent. PM responsibilities: scope control, lane arbitration, approvals, handoff updates, and next-scope decisions per AGENTS.md and this plan.
- **File locks:** Lane A files are locked to `project-manager` in `docs/WORKLOCKS.md` (Active Locks). Other agents must not edit those files without PM reassignment or lock release.

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

### Lane E - release-manager (integration + release gates)
- Files:
  - `docs/agents/03_VALIDATION.md`
  - `docs/agents/04_HANDOFF.md`
  - `docs/agents/02_EXECUTION_LOG.md`
  - `docs/WORKLOCKS.md`
- Tasks:
  - Aggregate approved lane outputs into release-candidate package.
  - Enforce final release checklist and evidence completeness.
  - Publish go/no-go recommendation with rollback notes.
- Status: ACTIVE
- Activation: PM Directive (2026-02-13)
- Constraints:
  - No feature implementation except emergency hotfix merge blockers.
  - Consolidate only approved changes with evidence present.

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

## Role Gate Responsibilities

- Gate A (Security/Data Integrity)
  - Implementer: `builder`
  - Validator: `debugger`
  - Evidence gatekeeper: `release-manager`
- Gate B (OCR Baseline Quality)
  - Runtime execution: `builder`
  - Metric verification/repro: `debugger`
  - UX usability proof: `ui-designer`
  - Gate signoff: `release-manager`
- Gate C (Ship Readiness)
  - UI checklist/screenshots: `ui-designer`
  - Stability run: `debugger`
  - RC package + go/no-go: `release-manager`
  - Final release approval: `project-manager`

## Release-Manager Active Enforcement Checklist

Before any RC handoff, `release-manager` must verify all:
1. `npm test` PASS
2. `npm run build` PASS
3. OCR runtime evidence logged in `docs/agents/03_VALIDATION.md`
4. UI before/after screenshots for touched OCR surfaces
5. Security negative tests for path traversal and external URL handling

Merge rule:
- Block merge if any required artifact is missing.

Escalation rule:
- Escalate only unresolved peer dependencies older than 45 minutes.

Lateral communication enforcement:
- Builder -> Debugger (regression/security validation request)
- UI -> Builder (implementation handoff confirmation)
- Debugger -> UI (user-facing failure-state requirements)
- All roles -> Release-manager (merge readiness acknowledgment)

Delegation acceptance condition:
- One full cycle completes with release-manager signoff and clear GO/NO-GO in `docs/agents/04_HANDOFF.md`.

## Parking Lot (Non-OCR Requests)
- Keep out-of-scope requests here and do not execute until OCR baseline is reached.
- _none_

## Queued Agent Task (PM Approved Queue Item)

### Task
- Name: One-Time Screenshot Integration + GCloud Upload
- Status: ACTIVE (PM activated 2026-02-13T02:10Z)
- Priority: Next migration batch after current active step gate
- Owner for queue activation: `project-manager`
- Assigned roles: `builder` (implementation), `debugger` (validation), `project-manager` (gate)

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

### Active Role Prompts (PM Activated 2026-02-13T02:10Z)

#### `project-manager` prompt (ACTIVE)
```md
Role: project-manager
Task: One-Time Screenshot Integration + GCloud Upload (ACTIVE — execute now)

Objective
- Execute activation and scope controls for one-time ingest+upload migration.

Required outputs
1. Confirm source paths and naming policy:
   - `dataset/images/`
   - `userData/training_data/`
2. Confirm strict-mode policy and rollback checkpoint expectations.
3. Define activation gate:
   - dry-run evidence approved before apply/upload.
4. Define completion gate:
   - idempotent second run + eval evidence logged.

Constraints
- Execute immediately — this is the current active task (Step 7).
- Gate builder completion before authorizing next task.
```

#### `builder` prompt (ACTIVE)
```md
Role: builder
Task: Implement one-time legacy ingest + optional upload (ACTIVE — execute now)

Objective
- Build migration script and wiring with dedupe safety and reporting.

When activated, implement:
1. `scripts/ocr_corpus_ingest_legacy.cjs`
2. `package.json` script: `ocr:ingest:legacy`
3. Flags:
   - `--dry-run`
   - `--apply`
   - `--upload`
   - `--strict`
   - `--sources dataset-images,training-data`
4. Deduplication:
   - SHA-256 hash (primary)
   - normalized filename (secondary)
   - existing sampleId check (tertiary)
5. Outputs:
   - backup of `ground-truth.json` before write
   - `dataset/ocr-corpus/reports/legacy-ingest-report.json`
   - `dataset/ocr-corpus/reports/legacy-ingest-report.md`
6. Reuse existing GCloud upload path where possible.

Constraints
- Execute after Step 7 (Screenshot Integration) completes.
- Follow phase gate rules: complete Phase 1 before starting Phase 2.
```

#### `debugger` prompt (ACTIVE)
```md
Role: debugger
Task: Abuse/edge validation for legacy ingest (ACTIVE — execute after builder completes)

Objective
- Validate robustness, idempotency, and failure behavior for migration.

When activated, validate:
1. Duplicate files across both sources.
2. Corrupt JSON labels (strict vs non-strict behavior).
3. Missing label file handling.
4. Unsupported image extensions.
5. Partial upload failure and retry behavior.
6. Idempotency: second `--apply --upload` imports 0 new samples.

Evidence required
- Append matrix + command outputs to `docs/agents/03_VALIDATION.md`.
- If broken, open blocker in `docs/agents/BLOCKERS.md` with repro + likely fault module.

Constraints
- Execute after builder completes implementation and reports completion.
- Run abuse/edge cases and verify idempotency before signing off.
```

#### `verifier` prompt (queued; optional)
```md
Role: verifier (or debugger if verifier unassigned)
Task: Independent migration verification (queued only — do not execute yet)

Objective
- Independently confirm ingest correctness and upload deltas.

When activated, run:
1. `npm run ocr:truth:validate`
2. `npm run ocr:ingest:legacy -- --dry-run`
3. `npm run ocr:ingest:legacy -- --apply --upload`
4. `npm run ocr:truth:validate`
5. `npm run ocr:predict`
6. `npm run ocr:eval`

Deliverables
- Independent signoff in `docs/agents/03_VALIDATION.md`
- Go/No-Go recommendation to project-manager

Constraints
- Execute after builder and debugger complete their work.
- Provide independent signoff before PM closes the task.
```

## Queued Agent Task (PM Approved Queue Item)

### Task
- Name: Structure Hardening Sprint (3 Phases)
- Status: ACTIVE (PM activated 2026-02-13T02:10Z)
- Priority: After active OCR fix/validation gate
- Owner for queue activation: `project-manager`
- Assigned roles: `builder` (implementation), `debugger` (validation), `project-manager` (phase gates)
- Current phase: Phase 1 (pending Step 7 completion)

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

### Active Role Prompts (PM Activated 2026-02-13T02:10Z)

#### `project-manager` prompt (ACTIVE — execute after Step 7)
```md
Role: project-manager
Task: Structure Hardening Sprint, Phase 1 (ACTIVE — execute after Step 7 completes)

Objective
- Execute Phase 1 execution boundaries and activation checklist.

Required outputs
1. Confirm phase scope lock:
   - Extract helper logic from `electron/main.cjs` into focused modules.
   - IPC channel alignment check between preload and main.
   - Submission-path state reset/ownership consistency checks.
2. Define file ownership lanes for builder/debugger/verifier.
3. Define activation gate and stop conditions for Phase 1.
4. Publish phase-ready checklist in `docs/agents/04_HANDOFF.md`.

Constraints
- Execute after Step 7 (Screenshot Integration) completes.
- Gate Phase 1 completion before authorizing Phase 2.
```

#### `builder` prompt (ACTIVE — execute after Step 7)
```md
Role: builder
Task: Structure Hardening Sprint, Phase 1 implementation pack (ACTIVE — execute after Step 7 completes)

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
- Execute after Step 7 (Screenshot Integration) completes.
- Follow phase gate rules: complete Phase 1 before starting Phase 2.
```

#### `debugger` prompt (ACTIVE — execute after Step 7)
```md
Role: debugger
Task: Structure Hardening Sprint, Phase 1 validation plan (ACTIVE — execute after Step 7 completes)

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
- Execute after builder completes Phase 1 implementation.
- Run regression checks and verify no behavioral drift.
```

#### `verifier` prompt (ACTIVE — execute after Step 7; optional)
```md
Role: verifier (or debugger if verifier unassigned)
Task: Independent verification for Structure Hardening Phase 1 (ACTIVE — execute after Step 7 completes)

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
- Status: ACTIVE (PM activated 2026-02-13T02:10Z)
- Priority: After active OCR/security gates and queued structure phase activation window
- Owner for queue activation: `project-manager`
- Assigned roles: `builder` (implementation), `debugger` (validation), `project-manager` (gate)
- Execution order: After Step 7 completion

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

### Active Role Prompts (PM Activated 2026-02-13T02:10Z)

#### `project-manager` prompt (ACTIVE — execute after Step 7)
```md
Role: project-manager
Task: Dev Splash Retry Noise Reduction (ACTIVE — execute after Step 7 completes)

Objective
- Prepare activation checklist and boundaries for a low-risk messaging-only improvement.

Required outputs (planning only)
1. Confirm scope lock:
   - Dev startup splash messaging and retry-status behavior only.
2. Define non-goals:
   - no production flow changes
   - no OCR-related edits
3. Define phase gate:
   - builder patch + debugger validation + verifier signoff.
4. Add Go/No-Go entry point in `docs/agents/04_HANDOFF.md` when ready.

Constraints
- Execute after Step 7 (Screenshot Integration) completes.
- Gate completion before authorizing next queued task.
```

#### `builder` prompt (ACTIVE — execute after Step 7)
```md
Role: builder
Task: Dev Splash Retry Noise Reduction implementation (ACTIVE — execute after Step 7 completes)

Objective
- Reduce duplicate retry/checking splash updates while preserving retry robustness.

When activated, implement:
1. In `electron/main.cjs` retry flow, dedupe/throttle `setSplashProgress` updates.
2. Track last rendered splash payload (`pct/status/detail`) and skip no-op updates.
3. Emit user-facing updates on meaningful transitions only:
   - first waiting state
   - occasional heartbeat (e.g., every N attempts)
   - connect success
   - terminal failure threshold notice (if applicable)
4. Keep retry and backoff logic unchanged unless required for correctness.

Validation expectations
- Dev boot still auto-connects when server becomes ready.
- Splash updates become significantly less noisy.

Constraints
- Execute after Step 7 (Screenshot Integration) completes.
- Follow phase gate rules: complete Phase 1 before starting Phase 2.
```

#### `debugger` prompt (ACTIVE — execute after Step 7)
```md
Role: debugger
Task: Dev Splash Retry Noise Reduction validation (ACTIVE — execute after Step 7 completes)

Objective
- Validate behavior and non-regression for dev startup.

When activated, test:
1. Dev server not ready initially:
   - verify reduced splash spam during retries.
2. Dev server comes up after delay:
   - verify auto-connect still succeeds.
3. Dev server already up:
   - verify no delay/regression.
4. Confirm startup logs remain useful for debugging.

Evidence required
- Record attempt counts, visible splash updates, and pass/fail in `docs/agents/03_VALIDATION.md`.
- If broken, log blocker in `docs/agents/BLOCKERS.md` with repro and likely fault area.

Constraints
- Execute after builder completes implementation.
- Verify reduced splash spam and preserved retry robustness.
```

#### `verifier` prompt (ACTIVE — execute after Step 7; optional)
```md
Role: verifier (or debugger if verifier unassigned)
Task: Independent check for Dev Splash Retry Noise Reduction (ACTIVE — execute after Step 7 completes)

Objective
- Independently verify behavior parity and reduced message churn.

When activated, verify:
1. Startup path still reaches loaded renderer in dev mode.
2. Splash status cadence is calmer and not repetitive.
3. No side effects in non-dev startup behavior.

Deliverables
- Independent signoff note in `docs/agents/03_VALIDATION.md`.
- Go/No-Go recommendation to project-manager.

Constraints
- Queued only now; do not start until PM activation.
```

## PM Batch Commit + Push Gate (Queued Closure Checklist)

Use this only after all active/approved queued tasks complete and evidence is posted.

1. Confirm each active lane reports COMPLETE in `docs/agents/01_PLAN.md`.
2. Confirm validation evidence is present for each completed task in `docs/agents/03_VALIDATION.md`.
3. Confirm blockers are resolved or explicitly carried forward in `docs/agents/BLOCKERS.md`.
4. Confirm `docs/agents/04_HANDOFF.md` includes shipped changes, validations, and next queued item.
5. Run final PM pre-commit checks:
   - `git status`
   - `git diff`
   - quick scan for accidental secrets or transient artifacts.
6. Perform single batch commit (no per-agent micro-commits).
7. Run one final `git status` to confirm clean state.
8. Push once to remote after PM approval.

## Active Task Delegation (Post-Cycle Activation)

### Step 7: One-Time Screenshot Integration + GCloud Upload
**Status**: COMPLETE (builder + debugger; awaiting PM gate)  
**Assigned to**: `builder` (primary), `debugger` (validation), `project-manager` (gate)  
**Priority**: High — corpus expansion and GCloud sync  
**Builder completion**: Script implemented; GCloud init fix (keyPath + bucketName) applied and dry-run verified (2026-02-12T21:19Z).  
**Debugger completion (2026-02-13T02:20Z)**: Abuse/edge validation PASS — dry-run, apply+upload, idempotency (second run 0 new), unsupported extensions and corrupt JSON handling verified. Evidence in `docs/agents/03_VALIDATION.md`.  
**Next action**: PM gates Step 7 completion; then Steps 8–11 may proceed.

### Step 8-10: Structure Hardening Sprint (3 Phases)
**Status**: ACTIVE (pending Step 7 completion)  
**Assigned to**: `builder` (implementation), `debugger` (validation), `project-manager` (phase gates)  
**Current phase**: Phase 1 (Quick Wins)  
**Next action**: After Step 7 completes, `builder` begins Phase 1 extraction

### Step 11: Dev Splash Retry Noise Reduction
**Status**: ACTIVE (pending Step 7 completion)  
**Assigned to**: `builder` (implementation), `debugger` (validation), `project-manager` (gate)  
**Next action**: After Step 7 completes, `builder` implements throttling logic

## PM Active Communications (Current Cycle)

### Broadcast (All Roles)
- OCR Stabilization Cycle 01 is COMPLETE and released.
- All queued tasks are now ACTIVE and delegated.
- Execute Step 7 first, then proceed with Steps 8-11 in sequence.
- Escalate unresolved peer dependencies after 45 minutes via `docs/agents/BLOCKERS.md`.

### Directed Requests
- `RM-REQ-001` -> `builder`
  - Provide RC-level `npm test` evidence in `docs/agents/03_VALIDATION.md`.
  - If failing, include failing suites and remediation plan.
- `RM-REQ-002` -> `ui-designer`
  - Provide before/after OCR UI screenshots + checklist evidence in `docs/agents/03_VALIDATION.md`.
- `RM-REQ-003` -> `debugger`
  - Provide security negative-test evidence (path traversal, external URL handling, IPC blocked/unavailable) in `docs/agents/03_VALIDATION.md`.
- `RM-REQ-004` -> `project-manager`
  - Reconcile `docs/agents/01_PLAN.md` steps with current evidence once RM-REQ-001/002/003 close.

### Release-Manager Control
- Keep RC at NO-GO until required artifacts are present.
- Re-run final gate check after dependencies close and update:
  - `docs/agents/03_VALIDATION.md` (final release block)
  - `docs/agents/04_HANDOFF.md` (RC go/no-go section)


## Plan Schema v2 (AOM_V2)

Use deterministic step rows for all new work.

| Step ID | Owner | Path | Status | Dependency | Exit Evidence |
|---|---|---|---|---|---|
| STEP-01 | project-manager | FULL_PATH | READY | none | Intake approved + lane assignment |

Status values:
- `READY`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`
- `DEFERRED`

Rules:
- Exactly one `IN_PROGRESS` step per owner.
- A `DONE` step must include concrete evidence pointer in `docs/agents/03_VALIDATION.md`.
- PM arbitration required for conflicting lanes before execution starts.

## Task Plan - AGENT-COMM-FEEDBACK-LOOP (2026-02-13)

1. [DONE] project-manager: Capture intake addendum with scope, constraints, and done condition in `docs/agents/00_INTAKE.md`.
2. [DONE] project-manager: Add communication lifecycle and PM feedback cycle requirements to `AGENTS.md`.
3. [DONE] project-manager: Log implementation details and rationale in `docs/agents/02_EXECUTION_LOG.md`.
4. [DONE] project-manager: Validate presence of new governance rules and record PASS in `docs/agents/03_VALIDATION.md`.
5. [DONE] project-manager: Publish completion summary in `docs/agents/04_HANDOFF.md`.

## Task Plan - PM-DELEGATION-BOARD-2026-02-13

1. [DONE] project-manager: Normalize `docs/agents/PM_TODO.md` with the provided master delegation board.
2. [DONE] project-manager: Preserve operating constraints, priority codes, and wave sequence verbatim in backlog structure.
3. [DONE] project-manager: Add status and dependency columns to every backlog table.
4. [DONE] project-manager: Log execution details in `docs/agents/02_EXECUTION_LOG.md`.
5. [DONE] project-manager: Validate ID coverage and required sections in `docs/agents/03_VALIDATION.md`.
6. [DONE] project-manager: Publish handoff summary in `docs/agents/04_HANDOFF.md`.

## Step 22 - UI Navigation Overhaul Pack (Delegation Ready)

Task ID: UI-NAV-OVERHAUL-22  
Risk Tier: T2  
Execution Path: FULL_PATH  
Status: READY (pending PM activation)

### Scope
- Implement Claude-style collapsible side panel with hamburger trigger.
- Relocate profile icon and settings/adjustments entrypoints into side panel.
- Preserve existing F1/F2 closeout flow and validate regressions.

### Work Breakdown

1. **PM-OVR-01 - Confirm scope and sequence**
- Owner: `project-manager`
- Status: READY
- Done when: F1/F2/F3 are prioritized (must-do vs optional), owners assigned, and sequence locked for this cycle.

2. **UI-OVR-02 - Navigation IA and interaction spec**
- Owner: `ui-designer`
- Status: READY
- Dependency: PM-OVR-01
- Done when: Spec defines expanded/collapsed states, hamburger placement, icon+label behavior, profile/settings placement, and mobile behavior.

3. **UI-OVR-03 - Collapsible sidebar implementation**
- Owner: `builder`
- Status: READY
- Dependency: UI-OVR-02
- Done when: Sidebar collapse/expand works via hamburger and state remains stable across view changes.

4. **UI-OVR-04 - Profile/settings relocation**
- Owner: `builder`
- Status: READY
- Dependency: UI-OVR-02
- Done when: Profile and settings entrypoints are relocated to the side panel with unchanged functionality.

5. **UI-OVR-05 - Mobile/tablet adaptation**
- Owner: `builder`
- Status: READY
- Dependency: UI-OVR-03
- Done when: 390x844 and intermediate widths retain usable navigation with no overlap/clipping.

6. **UI-OVR-06 - Keyboard and focus accessibility**
- Owner: `builder`
- Status: READY
- Dependency: UI-OVR-03
- Done when: Sidebar toggle and navigation/profile/settings controls are keyboard reachable with visible focus and no traps.

7. **UI-OVR-07 - F1 closeout (analytics strip label)**
- Owner: `ui-designer` + `builder`
- Status: READY
- Dependency: PM-OVR-01
- Done when: Label copy/location finalized and implemented per spec with no hierarchy regression.

8. **UI-OVR-08 - F2 closeout (overlay DevTools collapse)**
- Owner: `ui-designer` + `builder`
- Status: READY
- Dependency: PM-OVR-01
- Done when: Overlay compact mode supports collapse/expand or explicit out-of-scope decision is logged in `docs/agents/DECISIONS.md`.

9. **UI-OVR-09 - Visual regression evidence package**
- Owner: `verifier`
- Status: READY
- Dependency: UI-OVR-03, UI-OVR-04, UI-OVR-05, UI-OVR-06
- Done when: Before/after captures at 1366x768 and 390x844 exist for touched views with loading/empty/error/disabled/success state coverage.

10. **UI-OVR-10 - Final validation and handoff**
- Owner: `verifier` + `release-manager`
- Status: READY
- Dependency: UI-OVR-09
- Done when: `npm run build` and `npm test` pass; evidence is recorded in `docs/agents/03_VALIDATION.md`; release recommendation is recorded in `docs/agents/04_HANDOFF.md`.

### PM Activation Checklist
- Mark exactly one Step 22 subtask `IN_PROGRESS` in cycle plan tracking.
- Confirm file ownership locks before implementation edits.
- Route blocker questions to `docs/agents/BLOCKERS.md` with one explicit ask.



