# PM Delegation To-Do (QA + Repository Management)

Use this as the master delegation board for the next execution cycle.

**Status legend:** `TODO` | `IN_PROGRESS` | `DONE` | `DEFERRED`

**Last updated:** 2026-02-13

---

## Operating Constraints (mandatory for every delegated task)

1. Every task must update `docs/agents/00_INTAKE.md`, `docs/agents/01_PLAN.md`, `docs/agents/02_EXECUTION_LOG.md`, `docs/agents/03_VALIDATION.md`, and `docs/agents/04_HANDOFF.md`.
2. Any UI-impacting task must check `docs/agents/UI_MASTERPLAN.md` first.
3. No task can be marked `DONE` without explicit validation evidence in `docs/agents/03_VALIDATION.md`.
4. Shared-file edits require lock claim/release in `docs/WORKLOCKS.md`.
5. All behavior changes default to `FULL_PATH` unless PM explicitly justifies `FAST_PATH`.

## Priority Codes

- `P0`: release-blocking
- `P1`: high-value quality/risk
- `P2`: important but non-blocking
- `P3`: cleanup/optimization

---

## Delegation Backlog

### PM Control Plane

| ID | Priority | Owner Role | Risk Tier | Path | Task | Deliverable | Done Evidence | Status | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| PM-001 | P0 | project-manager | T2 | FULL_PATH | Create single source backlog with IDs/status/dependencies | `docs/agents/PM_TODO.md` normalized | Backlog committed with all IDs below | DONE | none |
| PM-002 | P0 | project-manager | T2 | FULL_PATH | Define release gates for OCR corpus quality | `docs/agents/RELEASE_READINESS.md` thresholds | Gate table + pass/fail formula present | TODO | PM-001 |
| PM-003 | P0 | project-manager | T1 | FULL_PATH | Resolve scope mismatch: 26 truth samples vs 20 predicted/evaluated | Decision in `docs/agents/DECISIONS.md` | Decision references sample IDs and strategy | TODO | PM-001 |
| PM-004 | P1 | project-manager | T1 | FULL_PATH | Define owner SLA for blockers and cross-role handoffs | `docs/agents/DECISIONS.md` policy entry | SLA timings and escalation path documented | TODO | PM-001 |
| PM-005 | P1 | project-manager | T1 | FULL_PATH | Freeze branch/release naming policy for eval milestones | Repo policy section in `README.md` or `docs/agents/RELEASE_READINESS.md` | Example branch/tag names included | TODO | PM-002 |
| PM-006 | P1 | release-manager | T1 | FULL_PATH | Standardize artifact retention policy for corpus reports/backups | Retention policy doc update | Max history size + deletion cadence defined | TODO | PM-002 |

### Data Integrity

| ID | Priority | Owner Role | Risk Tier | Path | Task | Deliverable | Done Evidence | Status | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| DATA-001 | P0 | builder | T2 | FULL_PATH | Generate missing predictions for 6 truth samples | Updated `dataset/ocr-corpus/predictions.latest.json` | `pred_samples == truth_samples` log | TODO | PM-003 |
| DATA-002 | P0 | verifier | T2 | FULL_PATH | Validate one-to-one ID parity truth vs predictions | Validation report | No missing/extra IDs | TODO | DATA-001 |
| DATA-003 | P1 | builder | T2 | FULL_PATH | Add deterministic script/check for ID parity in CI/local | Script under `scripts/` + npm command | Fails when mismatch introduced | TODO | DATA-002 |
| DATA-004 | P1 | verifier | T1 | FULL_PATH | Validate schema integrity for truth/pred/baseline/reports | Schema validation output | All corpus files pass validation | TODO | DATA-002 |
| DATA-005 | P1 | builder | T1 | FULL_PATH | Add guard to prevent stale reports/latest.json alias | Eval script patch | `latest.json.generatedAt == index.runs[0].generatedAt` | TODO | EVAL-001 |
| DATA-006 | P2 | builder | T1 | FAST_PATH | Normalize naming conventions (`capture_`, `crew_`, `map_`, `legacy_`) | Naming standards in corpus README | Lint/check script or documented exception | TODO | DATA-002 |
| DATA-007 | P2 | verifier | T1 | FULL_PATH | Confirm all `imagePath` targets exist and are readable | Validation entry | Zero missing image references | TODO | DATA-002 |
| DATA-008 | P2 | release-manager | T1 | FAST_PATH | Consolidate redundant backup files policy | Backup policy update | Approved retention rule and archive path | TODO | PM-006 |

### Evaluation

| ID | Priority | Owner Role | Risk Tier | Path | Task | Deliverable | Done Evidence | Status | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| EVAL-001 | P0 | verifier | T2 | FULL_PATH | Re-run corpus eval on full sample set after parity fix | New `reports/latest.json` and history snapshot | `totalSamples` equals truth sample count | TODO | DATA-002 |
| EVAL-002 | P0 | verifier | T2 | FULL_PATH | Produce mode-split metrics (crew/map/capture/legacy) | Mode-segment report | Per-mode recall/precision/F1 included | TODO | EVAL-001 |
| EVAL-003 | P0 | project-manager | T2 | FULL_PATH | Approve minimum release threshold per metric | Threshold decision entry | Signed threshold values in readiness doc | TODO | EVAL-002 |
| EVAL-004 | P1 | verifier | T2 | FULL_PATH | Create regression matrix for bug1/bug2/bug3 variants vs baseline | Comparison report | Delta table with pass/fail classification | TODO | EVAL-001 |
| EVAL-005 | P1 | builder | T1 | FULL_PATH | Add automatic session-usable pass-rate trend check | Script command + report flag | Run fails below configured floor | TODO | EVAL-003 |
| EVAL-006 | P1 | verifier | T1 | FULL_PATH | Validate team-color metric handling (null vs computed) | Clarified metric semantics | No ambiguous `teamColorAccuracy` states | TODO | EVAL-001 |
| EVAL-007 | P2 | builder | T1 | FULL_PATH | Add per-sample failure reason codes in evaluator output | Extended report schema | Each failed sample has reason codes | TODO | EVAL-004 |
| EVAL-008 | P2 | verifier | T1 | FULL_PATH | Add confidence bands for small sample slices | Statistical annotation in report | Confidence/confidence-warning included | TODO | EVAL-002 |

### OCR Quality

| ID | Priority | Owner Role | Risk Tier | Path | Task | Deliverable | Done Evidence | Status | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| OCR-001 | P0 | debugger | T3 | FULL_PATH | Root-cause zero usability in crew class | Debug report with ranked hypotheses | Cause ranking + reproduction notes | TODO | EVAL-002 |
| OCR-002 | P0 | builder | T3 | FULL_PATH | Implement highest-impact crew extraction fix #1 | Code patch + tests | Crew opponent recall improves vs previous run | TODO | OCR-001 |
| OCR-003 | P0 | builder | T3 | FULL_PATH | Implement highest-impact crew extraction fix #2 | Code patch + tests | Crew grouping accuracy improves | TODO | OCR-002 |
| OCR-004 | P1 | verifier | T2 | FULL_PATH | Add dedicated crew regression suite | New tests under `src/utils/scan/...` | New tests fail pre-fix and pass post-fix | TODO | OCR-003 |
| OCR-005 | P1 | builder | T2 | FULL_PATH | Improve OCR post-processing for player-name normalization | Parser/normalizer patch | Fewer false positives on teammate precision | TODO | OCR-003 |
| OCR-006 | P1 | debugger | T2 | FULL_PATH | Validate color/team association on crew overlays | Debug artifact report | Reduced team-misgrouping cases | TODO | OCR-003 |
| OCR-007 | P2 | builder | T1 | FULL_PATH | Add feature flag for experimental crew parser | Configurable toggle | Can A/B old/new parser in eval | TODO | OCR-002 |
| OCR-008 | P2 | verifier | T1 | FULL_PATH | Track prefill-edit effort proxy metric | Metric output in report | Added expected-manual-edits estimate | TODO | OCR-004 |

### Testing and QA

| ID | Priority | Owner Role | Risk Tier | Path | Task | Deliverable | Done Evidence | Status | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| TEST-001 | P0 | verifier | T2 | FULL_PATH | Build command matrix (unit, OCR eval, security negatives, smoke) | `docs/agents/03_VALIDATION.md` command block | All required commands listed with status | TODO | PM-002 |
| TEST-002 | P0 | verifier | T2 | FULL_PATH | Enforce targeted-first then broad test sequence | Validation protocol entry | Command order documented and followed | TODO | TEST-001 |
| TEST-003 | P1 | builder | T1 | FULL_PATH | Add npm scripts for all required QA gates | `package.json` scripts | One-command pre-release gate available | TODO | TEST-001 |
| TEST-004 | P1 | verifier | T1 | FULL_PATH | Add flaky-test detector notes and rerun policy | Validation policy update | Retry policy and fail criteria present | TODO | TEST-002 |
| TEST-005 | P1 | debugger | T2 | FULL_PATH | Investigate any nondeterministic corpus outputs | Determinism investigation note | Seed/source of nondeterminism documented | TODO | TEST-002 |
| TEST-006 | P2 | verifier | T1 | FAST_PATH | Add concise quality dashboard markdown snapshot | `docs/agents/STEP*_VERIFIER_*.md` or consolidated doc | Latest metrics and trend arrows present | TODO | EVAL-004 |

### Security

| ID | Priority | Owner Role | Risk Tier | Path | Task | Deliverable | Done Evidence | Status | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| SEC-001 | P0 | verifier | T2 | FULL_PATH | Re-run security negative tests and compare to prior 109/109 | Updated security report | Pass count unchanged or improved | TODO | TEST-001 |
| SEC-002 | P1 | release-manager | T1 | FULL_PATH | Fix text encoding artifact in security report title | Corrected UTF-8 content | No mojibake in report render | TODO | SEC-001 |
| SEC-003 | P1 | project-manager | T1 | FULL_PATH | Decide whether advisory on `shell.openExternal` becomes blocking | `DECISIONS.md` entry | Risk acceptance or mitigation deadline | TODO | SEC-001 |
| SEC-004 | P1 | builder | T2 | FULL_PATH | If blocking, add URL allowlist/validation path | Code patch + tests | Advisory resolved and verified | TODO | SEC-003 |
| SEC-005 | P2 | verifier | T1 | FULL_PATH | Add recurring security gate schedule | Process entry in readiness doc | Security gate cadence set per release | TODO | PM-002 |

### Repository Management

| ID | Priority | Owner Role | Risk Tier | Path | Task | Deliverable | Done Evidence | Status | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| REPO-001 | P0 | release-manager | T1 | FULL_PATH | Clean working-tree policy for generated artifacts | Policy entry + `.gitignore` review | No stray generated edits at release cut | TODO | PM-005 |
| REPO-002 | P0 | release-manager | T1 | FULL_PATH | Resolve stray `nul` file handling | Remove or intentionally track with rationale | `git status` clean except intended changes | TODO | REPO-001 |
| REPO-003 | P1 | builder | T1 | FULL_PATH | Add/adjust ignore rules for transient logs/debug outputs | `.gitignore` update | Temp files no longer pollute status | TODO | REPO-001 |
| REPO-004 | P1 | release-manager | T1 | FULL_PATH | Define commit granularity standards for corpus updates | CONTRIBUTING/release policy note | Sample commit templates included | TODO | PM-005 |
| REPO-005 | P1 | project-manager | T1 | FULL_PATH | Establish PR checklist specific to corpus/eval tasks | PR template/checklist | Checklist used on next PR | TODO | PM-005 |
| REPO-006 | P2 | release-manager | T1 | FAST_PATH | Archive historical one-off docs into structured location | Docs reorg PR | Index of moved docs included | TODO | REPO-004 |

### Documentation and Reporting

| ID | Priority | Owner Role | Risk Tier | Path | Task | Deliverable | Done Evidence | Status | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| DOC-001 | P0 | reporter | T1 | FAST_PATH | Publish corpus status brief for stakeholders | Updated `docs/agents/04_HANDOFF.md` | Includes metrics, risks, next actions | TODO | EVAL-002 |
| DOC-002 | P1 | reporter | T1 | FAST_PATH | Create how-to-read OCR reports quick guide | New/updated markdown in `docs/` | Includes metric definitions and caveats | TODO | EVAL-002 |
| DOC-003 | P1 | project-manager | T1 | FULL_PATH | Ensure all decisions are logged with date/rationale | `docs/agents/DECISIONS.md` completeness pass | No unresolved decisions without owner | TODO | PM-004 |
| DOC-004 | P1 | project-manager | T1 | FULL_PATH | Ensure `BLOCKERS.md` has only active blockers with explicit ask | `docs/agents/BLOCKERS.md` cleaned | No stale blockers remain | TODO | PM-004 |
| DOC-005 | P2 | reporter | T0 | FAST_PATH | Add onboarding mini-runbook for new verifier | Short runbook doc | Verifier can execute full gate from scratch | TODO | TEST-001 |

---

## Execution Sequence (PM Scheduling)

1. Wave 1 (`P0` control plane): PM-001/002/003, DATA-001/002, EVAL-001/002, TEST-001, REPO-001/002.
2. Wave 2 (stability + security): DATA-005, EVAL-003/004/005, OCR-001, SEC-001/003, TEST-002/003.
3. Wave 3 (crew quality remediation): OCR-002/003/004/005/006, EVAL-007, TEST-005.
4. Wave 4 (release hardening + hygiene): REPO-003/004/005, SEC-002/004/005, DOC-001/002/003/004/005.
5. Wave 5 (debt cleanup): DATA-006/008, EVAL-008, OCR-007/008, REPO-006.

---

## Explicit Acceptance Targets for PM Sign-off

1. Truth/prediction parity is 100% (same sample IDs, same count).
2. `reports/latest.json` always matches newest `reports/index.json` run.
3. Crew mode shows measurable improvement from current baseline.
4. Release gates are automated and reproducible from a clean checkout.
5. Working tree is clean at release cut with no accidental generated artifacts.
6. All task closures include validation evidence, not narrative-only claims.
