# Decisions

## Decision Log
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