# Decisions

## Decision Log
- Date: 2026-02-13
- Decision: **Release-Manager assigned as supervising authority for Step 19 audit (emergency retro).**
- Rationale: Intake/plan trace must be stabilized; PM gate must keep up with reality before any new feature work. Release-Manager (per PM direction) becomes the supervising authority for this audit: they stop any `npm run electron:dev` / QA runs, verify audit evidence, and attest that the foundation is secure before any lane resumes. PM adds explicit audit checkpoints before approving further commits.
- Impact: RM owns the gate until 19a/19b/19c entries exist and are approved; only then does PM drop the "Foundation hold" and unblock other tasks. No electron:dev or new builds for QA until Step 19 records exist.

- Date: 2026-02-13
- Decision: **PM acknowledgment of failure (RM-BLK-005).**
- Rationale: Step 19 (batch authentication) was not completed. Intake and plan were allowed to conflict with release scope and validation evidence (Steps 1–18 marked complete while Step 19 was left hanging). Forensic steps 19a–19c were skipped; PM did not keep intake/plan aligned with the UI overhaul batch. Release-manager audit correctly logged ACTIVE blocker RM-BLK-005.
- Impact: PM accepts the blocker. No release GO and no new work approved until: (1) intake and plan realigned with actual release scope (Step 19 IN_PROGRESS until 19a–19d complete), (2) formal audits 19a (design), 19b (implementation attestation), 19c (functional + role-alignment) completed and documented in 03_VALIDATION, (3) PM runs 19d gate after 19a–19c PASS. PM will not declare "done" or "GO" without evidence.

- Date: 2026-02-13
- Decision: PLAN_UI_OVERHAUL Phase 2 (Navigation review) — **No change** to Sidebar/in-view nav.
- Options considered:
  - Structural or visual change to Sidebar (e.g. width, layout, token alignment).
  - No change; optional minor token alignment deferred.
- Rationale:
  - Sidebar already meets UI_MASTERPLAN §4: stable location, consistent icon+label, design tokens (text-md-sys-on-surface/60, text-label-xs), accessible titles. Rail width 84px and pattern are clear. Only minor gap: rail uses `rounded-r-2xl` instead of a semantic token (e.g. rounded-card); low priority.
- Impact:
  - Phase 2 deliverable (decision) complete. No builder implementation required for nav. Optional follow-up: builder may align rail radius to `rounded-card` if desired; not blocking.
- Owner: ui-designer.

- Date: 2026-02-13
- Decision: Define Risk Tier (T0–T3) and Execution Path (FAST_PATH / FULL_PATH) for AOM_V2.
- Options considered:
  - No formal tiers; PM judgment only.
  - Four risk tiers + two execution paths with eligibility rules (AGENTS.md AOM_V2).
- Rationale:
  - AGENT_BOOTSTRAP requires classifying Risk Tier and Execution Path before work starts; definitions must be canonical.
- Impact:
  - **T0**: Docs/config only; single owner; no behavior or contract change. → FAST_PATH eligible.
  - **T1**: Single-owner, single-file or small set; low behavior impact; no security/release/API. → FAST_PATH if no FAST_PATH rejection rule hits.
  - **T2**: Multi-file or behavior change; no security/release-critical path. → FULL_PATH.
  - **T3**: Security, release gate, or public API/contract change. → FULL_PATH. Verifier required for FULL_PATH when PM designates.
  - **FAST_PATH**: Low-risk; single lane; no evidence beyond minimal (e.g. build/lint). PM may still require 03_VALIDATION entry.
  - **FULL_PATH**: Evidence in `docs/agents/03_VALIDATION.md` required before step DONE; release-manager/verifier involvement per plan.
  - Intake and plan updated to require Risk Tier + Execution Path per task; step DONE only with evidence in 03_VALIDATION unless PM explicitly waives for FAST_PATH.

- Date: 2026-02-13
- Decision: Assign Cursor AI the project-manager role by default in this workspace.
- Options considered:
  - No default role; user specifies role per request.
  - Assign AI a single fixed role (e.g. project-manager or builder).
- Rationale:
  - User requested "assign yourself the Project manager role"; provides clear default for scope, approvals, and handoff ownership.
- Impact:
  - `docs/agents/01_PLAN.md` includes "Agent Role Assignment (Cursor AI)" with assigned role `project-manager`. AI acts as PM unless user assigns a different role or task.

- Date: 2026-02-12
- Decision: Standardize agent names for coordination as `lead`, `agent-a`, `agent-b`, `agent-c`.
- Options considered:
  - Freeform owner names per agent session.
  - Numeric IDs only (`agent-1`, `agent-2`, ...).
  - Fixed role names with one lead and up to three contributors.
- Rationale:
  - Fixed names reduce ambiguity in lock ownership and handoff accountability.
  - Matches the multi-agent protocol and keeps markdown entries compact.
- Impact:
  - All coordination entries in locks, plan lanes, execution, validation, blockers, and handoff use this naming.

- Date: 2026-02-12
- Decision: Use markdown files as the sole coordination channel for multi-agent execution.
- Options considered:
  - Chat-only coordination.
  - Mixed chat + markdown.
  - Markdown-first single source of truth.
- Rationale:
  - Creates an auditable trail and avoids drift between agent tabs.
  - Supports asynchronous coordination without hidden context.
- Impact:
  - Required updates at each step boundary in `docs/WORKLOCKS.md` and `docs/agents/*` files.

- Date: 2026-02-12
- Decision: Tighten lock/log immutability after first cycle.
- Options considered:
  - Allow edits to historical lock/log rows for cleanup.
  - Keep history append-only with follow-up corrections.
- Rationale:
  - Historical rewrites can hide collisions and break auditability.
  - Append-only history preserves clear accountability across agent tabs.
- Impact:
  - `docs/WORKLOCKS.md` and `docs/agents/02_EXECUTION_LOG.md` now explicitly require append-only history.

- Date: 2026-02-12
- Decision: Adopt designated role model with project manager + UI and engineering specialists.
- Options considered:
  - Keep generic owners (`lead`, `agent-a`, `agent-b`, `agent-c`).
  - Use role-based owners for active coordination (`project-manager`, `ui-designer`, `builder`, `debugger`).
  - Role-based owners plus optional support roles (`verifier`, `reporter`).
- Rationale:
  - Role names make accountability explicit and reduce ambiguity across multiple agent tabs.
  - Aligns execution to user-requested staffing model while preserving up-to-three collaborator limit.
- Impact:
  - Active coordination docs now use role-based owners.
  - `project-manager` is arbiter for lock reassignment, scope decisions, and final integration signoff.
  - `verifier` and `reporter` are optional and can be dual-hatted by existing roles when only four agents are available.

- Date: 2026-02-12
- Decision: Enter OCR-only focus mode until baseline quality gate is reached.
- Options considered:
  - Continue mixed roadmap (OCR + unrelated feature work).
  - Enforce OCR-only scope with explicit parking lot for all non-OCR work.
- Rationale:
  - Mixed scope has caused repeated context switching and incomplete feature execution.
  - OCR is a core blocker and must be stabilized first to unlock reliable development pace.
- Impact:
  - Non-OCR requests are rejected or parked by default.
  - Plan and validation now include OCR baseline tracking and daily scoreboard.

- Date: 2026-02-12
- Decision: Enforce OCR-only lock compliance in `docs/WORKLOCKS.md`.
- Options considered:
  - Soft guidance only via plan notes.
  - Hard enforcement with lock rejection + blocker logging.
- Rationale:
  - Active out-of-scope locks were observed despite OCR-only policy.
  - Lock-level enforcement catches drift at the earliest control point.
- Impact:
  - Active locks must include OCR scope justification in purpose text.
  - Out-of-scope locks are removed/rejected and escalated through blockers.
  - Historical legacy owner labels remain valid for old entries only.

- Date: 2026-02-12
- Decision: Adopt report-driven execution safeguards from `C:\Users\Alec Gougebas\.claude\usage-data\report.html`.
- Options considered:
  - Keep current process unchanged.
  - Add targeted safeguards for known failure modes (wrong approach, superficial verification, rate-limit interruption).
- Rationale:
  - Rework is primarily caused by wrong initial approach, insufficient runtime proof, and long sessions getting interrupted.
  - Lightweight guardrails can reduce wasted cycles without adding heavy ceremony.
- Impact:
  - Preflight context checks are required before implementation.
  - Work is phase-gated in smaller chunks with verification between phases.
  - OCR success requires real output evidence, not test-pass claims only.
  - Session-boundary handoff updates are mandatory before stopping.

- Date: 2026-02-12
- Decision: Authorize builder lane to implement OCR batch prediction pipeline (`ocr:predict`).
- Options considered:
  - Keep blocker open and wait for alternate manual prediction method.
  - Implement automated pipeline now to unblock baseline measurement.
- Rationale:
  - Baseline measurement could not proceed without reproducible prediction generation.
  - User explicitly authorized builder to proceed.
- Impact:
  - Added `scripts/ocr_corpus_predict.cjs` and npm `ocr:predict`.
  - Resolved pipeline blocker; remaining baseline blocker is corpus sample volume.

- Date: 2026-02-12
- Decision: Re-authorize builder lane to continue OCR stabilization work in current cycle.
- Options considered:
  - Pause builder until all blockers are cleared.
  - Continue builder on in-scope OCR tasks while PM/UI blockers are handled in parallel.
- Rationale:
  - OCR-only mode requires ongoing incremental progress; builder can proceed on in-scope tasks without waiting for unrelated lane readiness.
  - User explicitly approved builder continuation.
- Impact:
  - Builder remains ACTIVE on lane C files in `docs/agents/01_PLAN.md`.
  - Builder may proceed with OCR corpus throughput and prediction/eval workflow improvements that pass OCR scope gate.

- Date: 2026-02-12
- Decision: For Bug 3 validation, use 15-sample corpus as authoritative comparison baseline; run 20-sample as secondary informational pass.
- Options considered:
  - Continue Bug 3 against 20-sample corpus only.
  - Restore/reuse 15-sample snapshot for strict comparison and keep 20-sample as secondary.
  - Park Bug 3 and switch scope.
- Rationale:
  - Mid-cycle corpus drift breaks apples-to-apples phase comparison and weakens decision quality.
  - 15-sample baseline preserves continuity with prior Bug 1/Bug 2 evidence.
  - Secondary 20-sample run still captures forward-looking signal without invalidating phase gate.
- Impact:
  - Builder/debugger unblock: proceed with Bug 3 using 15-sample primary metrics.
  - Validation must report two sections:
    - Primary (15-sample, gate decision)
    - Secondary (20-sample, informational only)
  - PM handoff must cite which dataset gated the decision.

- Date: 2026-02-13
- Decision: Add `release-manager` as a dedicated integration and release-gate role (5th role).
- Options considered:
  - Keep current 4-role model and let PM absorb integration/release checks.
  - Add `release-manager` role (with optional dual-hat by `verifier` when needed).
- Rationale:
  - Reduces merge/release chaos by separating implementation from final integration quality control.
  - Creates independent release evidence ownership and explicit rollback accountability.
- Impact:
  - Lane E added in `docs/agents/01_PLAN.md` for release-manager.
  - Final release validation/signoff sections added to validation and handoff docs.
  - Inter-agent handshake protocol and SLA added before PM escalation.

## Copy-Paste Decision Template

```md
- Date: 2026-02-12
- Decision:
- Options considered:
  - Option A
  - Option B
- Rationale:
- Impact:
```

## Decision Taxonomy v2 (AOM_V2)

For all new decisions, include:
- Type: `scope|architecture|risk|release`
- Decision:
- Date:
- Options considered:
- Rationale:
- Impacted files/artifacts:
- Revisit trigger/expiry:

Rule:
- A decision without revisit trigger is incomplete.

