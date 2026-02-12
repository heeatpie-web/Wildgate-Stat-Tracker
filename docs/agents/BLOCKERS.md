# Blockers

## Active Blockers

### Blocker (RESOLVED — Release Gate)
- Date (UTC): 2026-02-13T13:30:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): release-manager
- Blocker: RC `ocr-stabilization-cycle-01-rc` was blocked due to 2 missing release artifacts: (1) UI screenshot proof for Lane B changes, (2) Security negative-test evidence for rejection paths.
- Impact: Release was blocked; PM could not issue final approval without complete Gate A + Gate C evidence.
- Resolution (2026-02-13T13:35Z): All blockers resolved. Evidence was present but not initially recognized:
  - UI evidence: `npm run snap:views` — 0% mismatch (copy-only changes, no visual impact)
  - Security evidence: Comprehensive test suite — 109/109 PASS
  - Plan reconciliation: Steps 1-5 COMPLETE, Step 6 IN_PROGRESS
- Status: RESOLVED
- Final recommendation: **GO** — All release gates satisfied. Awaiting PM final approval for Step 6 handoff.

### Blocker (RESOLVED)
- Date (UTC): 2026-02-12T23:52:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): release-manager
- Blocker: RC checklist item missing — `npm test` pass evidence is not present in `docs/agents/03_VALIDATION.md` for `ocr-stabilization-cycle-01-rc`.
- Impact: Gate C (Ship Readiness) cannot pass; release recommendation remains NO-GO.
- Needed input: `builder` must run `npm test` on the RC snapshot and append command output summary + pass/fail evidence to `docs/agents/03_VALIDATION.md`.
- Status: RESOLVED
- Resolution (2026-02-13T13:24 local): `release-manager` executed `npm test` directly and recorded PASS evidence in `docs/agents/03_VALIDATION.md` (7 files, 66 tests, 0 failures).

### Blocker (RESOLVED)
- Date (UTC): 2026-02-12T23:52:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): release-manager
- Blocker: Gate C artifact missing — UI before/after screenshot checklist proof for Lane B is not present in release validation docs.
- Impact: Ship-readiness proof package is incomplete; PM cannot issue informed approval.
- Needed input: `ui-designer` must attach screenshot evidence and checklist links in `docs/agents/03_VALIDATION.md` and `docs/agents/04_HANDOFF.md`.
- Status: RESOLVED
- Resolution (2026-02-13T01:00:00Z): Ran `npm run snap:views` — all 5 views (recording, analytics, smart-captures, players, history) show 0% mismatch from baseline. Lane B was copy-only changes (error message text), no layout/style impact. Evidence appended to `docs/agents/03_VALIDATION.md`. Report: `.visual/report.md`.

### Blocker (RESOLVED)
- Date (UTC): 2026-02-12T23:52:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): release-manager
- Blocker: Gate A artifact missing — explicit security negative-test evidence is absent for rejection-path handling ("Path not allowed", "Unsupported external link", IPC blocked/unavailable).
- Impact: Security/data-integrity gate cannot be closed; release remains NO-GO.
- Needed input: `debugger` must execute and log rejection-path negative tests with outcome evidence in `docs/agents/03_VALIDATION.md`.
- Status: RESOLVED
- Resolution (2026-02-13T01:00:00Z): Release-manager executed `friendlyError()` against 12 known rejection patterns. 12/12 pass.
- Resolution (2026-02-13T01:15:00Z): Debugger executed comprehensive security negative test suite (`scripts/security_negative_tests.cjs`): **109/109 PASS** across 5 categories — path validation (21), IPC channel allowlist (45), corpus file validation (13), Epic request validation (14), friendlyError mapping (16). Advisory: `shell.openExternal` has no URL filtering (standard Electron behavior, low risk). Full evidence in `docs/agents/03_VALIDATION.md` and `dataset/ocr-corpus/reports/security-gate-a.json`.

### Blocker (RESOLVED)
- Date (UTC): 2026-02-12T23:52:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): release-manager
- Blocker: `docs/agents/01_PLAN.md` still marks step 5 and step 6 as pending despite validation/handoff evidence, creating release-state ambiguity.
- Impact: PM approval path is ambiguous and can cause contradictory release-state interpretation.
- Needed input: `project-manager` must reconcile step statuses in `docs/agents/01_PLAN.md` before final GO/NO-GO decision.
- Status: RESOLVED
- Resolution (2026-02-13T01:00:00Z): Steps 1-5 marked COMPLETE, Step 6 marked IN_PROGRESS in `docs/agents/01_PLAN.md`.

### Blocker (URGENT)
- Date (UTC): 2026-02-12T19:54:46Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): builder
- Blocker: Unexpected corpus drift during Bug 3 validation (`ground-truth.json` evaluation context changed from prior 15-sample runs to 20 samples mid-cycle).
- Impact: Phase-to-phase OCR metric comparisons are no longer apples-to-apples; Bug 3 decision quality is blocked until PM defines authoritative evaluation baseline for this phase.
- Needed input: PM priority decision required now: (a) continue Bug 3 against 20-sample corpus, (b) restore/reuse 15-sample snapshot for strict comparison, or (c) park Bug 3 and proceed with alternate scoped task.
- Status: RESOLVED
- Priority: URGENT
- Action taken: Builder paused implementation and entered standby pending PM instruction.
- Resolution (2026-02-12T23:30:00Z): PM selected option (b). Bug 3 gate decision must use 15-sample baseline for authoritative comparison; 20-sample run remains secondary informational output. Builder/debugger authorized to resume under this rule.

### Blocker (RESOLVED)
- Date (UTC): 2026-02-12T19:50:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): project-manager
- Blocker: `ui-designer` role is not properly assigned to an explicit active agent tab for current OCR cycle.
- Impact: OCR UI correction usability lane cannot proceed; risk of PM/debugger doing ad hoc UI work outside role boundaries.
- Needed input: Confirm which active agent tab is bound to `ui-designer` and seed it with `docs/agents/role-inputs/ui-designer.md`.
- Status: RESOLVED
- Resolution (2026-02-12T21:10:00Z): ui-designer role bound to active agent tab. Locks claimed for OCR lane B files. Lane B status set to ACTIVE.

### Blocker (RESOLVED)
- Date (UTC): 2026-02-12T20:00:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): debugger
- Blocker: Ground truth corpus is too small for a meaningful OCR baseline (currently 1 runnable sample).
- Impact: Metrics are now computable but not statistically representative; failure matrix and trend confidence are weak.
- Needed input: Provide/label at least 10-20 diverse real screenshots and add them to corpus.
- Status: RESOLVED
- Resolution (2026-02-12T18:55Z): Debugger populated corpus with 15 labeled samples (5 Crew Hub, 10 Map screens) from user-provided screenshot paths. Ran full pipeline: `ocr:truth:build` -> `ocr:predict` (15/15 OK) -> `ocr:eval` -> `ocr:baseline:promote`. Baseline established.

## Resolved Blockers
- Date (UTC): 2026-02-12T20:31:00Z
- Owner: project-manager
- Blocker: Missing screenshot images in `dataset/images/`.
- Resolution: Confirmed at least one valid image path and successful OCR run via `npm run ocr:predict`.

- Date (UTC): 2026-02-12T20:31:00Z
- Owner: project-manager
- Blocker: Missing batch prediction pipeline.
- Resolution: Implemented `scripts/ocr_corpus_predict.cjs` and wired `npm run ocr:predict`; predictions now generated to `dataset/ocr-corpus/predictions.latest.json`.

## Scope Creep Intercept Template

Use this when a new request does not pass OCR scope gate.

```md
### Blocker
- Date (UTC):
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): project-manager
- Blocker: Request is out-of-scope for OCR-only cycle.
- Impact: Diverts effort from OCR baseline objectives.
- Needed input: Confirm park/defer to parking lot or formally re-scope intake.
- Status: ACTIVE
```

## Lock Policy Violation Template

Use this when a lock conflicts with OCR-only scope.

```md
### Blocker
- Date (UTC):
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): project-manager
- Blocker: Active lock is out-of-scope for OCR-only mode.
- Impact: Scope drift and delivery delay for OCR baseline.
- Needed input: Release lock now or provide OCR scope gate justification.
- Status: ACTIVE
```

## Wrong-Approach Risk Template

Use this when implementation assumptions are uncertain and could cause rework.

```md
### Blocker
- Date (UTC):
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`):
- Blocker: Potential wrong-approach risk detected before implementation.
- Impact: High rework risk if assumptions are incorrect.
- Needed input: Confirm constraints/files/contracts before proceeding.
- Status: ACTIVE
```

## Copy-Paste Blocker Template

```md
### Blocker
- Date (UTC): 2026-02-12T17:15:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): debugger
- Blocker:
- Impact:
- Needed input:
- Status: ACTIVE
```

## Stale Lock Takeover Template

```md
### Blocker
- Date (UTC): 2026-02-12T17:20:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): builder
- Blocker: Lock appears stale in `docs/WORKLOCKS.md` for `path/to/file`.
- Impact: Cannot proceed with assigned lane.
- Needed input: Project manager decision to release/reassign lock.
- Status: ACTIVE
```
