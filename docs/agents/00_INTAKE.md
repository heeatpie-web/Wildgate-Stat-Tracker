## Intake: CODEBASE_AUDIT_2026-02-13

- Task ID: CODEBASE_AUDIT_2026-02-13
- Date (UTC): 2026-02-13T05:30:37Z
- Goal: Complete deep audit of the current project directory with priority on stability, performance, security, plus UI and OCR optimization opportunities.
- Audience: project-manager, builder, debugger, verifier, release-manager.
- In Scope:
  - Whole repository code and build/test/lint state.
  - Electron security surface (IPC, file access, external URL handling).
  - Runtime performance hotspots in telemetry/log/OCR paths.
  - UI quality opportunities and OCR pipeline optimization ideas.
- Out of Scope:
  - Feature implementation not required to prove findings.
  - Broad refactors beyond minimal validation artifacts.
- Acceptance Criteria:
  1. At least 3 critical findings are identified with file-level evidence.
  2. Validation evidence includes command outcomes for lint/test/build and security scan.
  3. UI and OCR improvement opportunities are documented with prioritized next actions.
- Risk Tier: T3
- Execution Path: FULL_PATH
- Evidence Required:
  1. docs/agents/03_VALIDATION.md contains command outputs and pass/fail status.
  2. docs/agents/02_EXECUTION_LOG.md contains execution chronology and touched files.
  3. docs/agents/04_HANDOFF.md contains final severity-ranked findings and next actions.
- Dependencies (role -> artifact):
  1. debugger -> docs/agents/03_VALIDATION.md command evidence.
  2. project-manager -> docs/agents/01_PLAN.md active step ownership.
  3. reporter/release-manager -> docs/agents/04_HANDOFF.md summary and action gates.
- Constraints:
  - Keep scope to audit only.
  - Do not claim completion without explicit validation evidence.
  - Keep role labels AOM_V2-compliant.
- Done Condition:
  - Intake acceptance criteria met.
  - Plan steps completed or explicitly deferred.
  - Findings delivered to user with evidence-backed severity.
# Intake: PM backlog (post–Step 20)

## Current Task (PM_BACKLOG)
- **Task ID:** PM-BACKLOG
- **Goal:** PM assigns optional features from backlog or closes them. Steps 1–20 are 100% complete; remaining work is in [docs/agents/PM_TODO.md](docs/agents/PM_TODO.md).
- **Risk Tier:** T1 (small, optional polish)
- **Execution Path:** FAST_PATH (per-item)
- **Evidence required:** If PM assigns F1/F2: builder or ui-designer log in 02_EXECUTION_LOG; build + test remain PASS.

## Features to add (see PM_TODO.md)
- **F1:** Analytics — add "Quick views" or "Jump to" label on strip (20.2 PARTIAL follow-up).
- **F2:** Overlay — DevTools collapse in overlay mode, or document out-of-scope (20.6 PARTIAL follow-up).
- PM may assign to ui-designer (spec/copy) and builder (implementation), or defer/close.

## Next action (next cycle — Step 21)
- **project-manager:** When starting next cycle, set 01_PLAN Active Step = 21 and point this intake to STEP21_PM_BACKLOG (or keep PM_BACKLOG with Step 21 in plan).
- **ui-designer:** F1 — confirm label copy/placement ("Quick views" or "Jump to"). F2 — confirm DevTools collapse in overlay in scope (or OOS).
- **builder:** F1 — add label in AnalyticsShell.tsx per spec; log in 02_EXECUTION_LOG. F2 — implement DevTools collapse in overlay (compact) or document OOS in DECISIONS.md; log in 02_EXECUTION_LOG. Keep build + test PASS.

## Alignment with 01_PLAN
- **Plan state:** 01_PLAN Step 21 added (PM backlog F1/F2). When starting next cycle, Active Step = 21. Steps 1–20 complete (archived).
- **This intake** = current task PM backlog; next cycle executes Step 21 per PM_TODO and 01_PLAN.

## Done condition
- F1 and F2 assigned (done). Next: Step 21 executed — ui-designer confirms F1/F2; builder implements F1 and F2 (or documents OOS); build + test PASS; 02_EXECUTION_LOG entries. PM gates or closes deferred items.

## Risk Tier and Execution Path (AOM_V2)
- **T0:** Docs/config only; single owner; no behavior or contract change. FAST_PATH eligible.
- **T1:** Single-owner, small file set; low behavior impact; no security/release/API. FAST_PATH if no rejection rule.
- **T2:** Multi-file or behavior change; not security/release-critical. FULL_PATH.
- **T3:** Security, release gate, or public API/contract change. FULL_PATH; verifier required when PM designates.
- **FAST_PATH:** Low-risk; single lane; minimal evidence. Step DONE may still require 03_VALIDATION entry unless PM waives.
- **FULL_PATH:** Evidence in `docs/agents/03_VALIDATION.md` required before step DONE. Escalate only via `docs/agents/BLOCKERS.md` or `docs/agents/DECISIONS.md`. Use role labels only (`project-manager`, `builder`, etc.) for new entries.

## Goal (current phase)
- PM processes backlog in PM_TODO.md (assign F1/F2 or close). Steps 1–20 complete.

## Constraints
- UI work follows UI_MASTERPLAN.md and docs/UI_AUDIT.md. Escalation via BLOCKERS.md or DECISIONS.md.

## Out of Scope (this intake)
- New steps beyond F1/F2 until PM defines next cycle.

## Canonical UI Overhaul Plan (Reference)
- **Plan:** [docs/agents/PLAN_UI_OVERHAUL.md](docs/agents/PLAN_UI_OVERHAUL.md) — Smart Capture, Analytics, telemetry indicator, navigation, Tactical Console, overlay HUDs; phases, delegation, and locked-in clarifications.
- **UI style guidelines (unchanged):** All UI work for the overhaul must follow existing canonical references:
  - [docs/agents/UI_MASTERPLAN.md](docs/agents/UI_MASTERPLAN.md) — design system contract, tokens, surfaces, opacity, status colors, layout, action hierarchy, PR/UI change gate.
  - [docs/UI_AUDIT.md](docs/UI_AUDIT.md) — known anti-patterns, radius/color/typography recommendations.
- These style guidelines remain the source of truth; the overhaul plan references them and does not replace them.

## Role Matrix (Current Model)

### Required Core Roles
- `project-manager` (PM): scope control, lane arbitration, blocker escalation, final business signoff.
- `ui-designer`: OCR-facing UX/usability only with proof package.
- `builder`: implementation/migrations/runtime code.
- `debugger`: reproduction, root-cause validation, negative/regression checks.

### Release Role
- `release-manager`: required at release integration stage (may be dual-hatted by `verifier` if staffing is limited).

### Optional Roles
- `verifier`: independent validation pass.
- `reporter`: external-ready summary packaging.

## Release Acceptance Criteria (PM + Release-Manager)

Release is accepted only when all are true:
1. Gate A (Security/Data Integrity) evidence is present and cross-checked by `release-manager`.
2. Gate B (OCR Baseline Quality) evidence includes builder run + debugger verification + UI usability confirmation.
3. Gate C (Ship Readiness) package includes:
   - UI screenshot proof/checklist
   - stability run notes
   - final go/no-go recommendation
4. `npm run build` and `npm test` are green for the release candidate.
5. `docs/agents/03_VALIDATION.md` includes a final release block owned by `release-manager`.
6. `docs/agents/04_HANDOFF.md` includes release candidate summary, known risks, rollback path, and PM approval outcome.


## Intake Template v2 (AOM_V2)

Use this template for each new cycle.

- Task ID:
- Goal:
- Audience:
- In Scope:
- Out of Scope:
- Acceptance Criteria:
1.
2.
3.
- Risk Tier: `T0|T1|T2|T3`
- Execution Path: `FAST_PATH|FULL_PATH`
- Evidence Required:
1.
2.
3.
- Dependencies (role -> artifact):
1.
- Constraints:
- Done Condition:

## Intake Addendum - AGENT_COMM_FEEDBACK_LOOP (2026-02-13)

- Task ID: AGENT-COMM-FEEDBACK-LOOP
- Goal: Add explicit inter-agent communication and a required PM feedback cycle to existing agent governance docs.
- In Scope:
  1. Update AGENTS.md communication protocol.
  2. Record execution and evidence in 02_EXECUTION_LOG and 03_VALIDATION.
  3. Publish handoff note in 04_HANDOFF.
- Out of Scope:
  1. Runtime app logic changes.
  2. UI behavior changes.
- Acceptance Criteria:
  1. AGENTS.md defines a request lifecycle and PM feedback checkpoint.
  2. Plan notes that PM review is mandatory before DONE.
  3. Execution/validation/handoff entries exist for this task.
- Risk Tier: T0
- Execution Path: FAST_PATH
- Evidence Required:
  1. AGENTS.md contains "Inter-Agent Communication Loop".
  2. AGENTS.md contains "PM Feedback Cycle (Required)".
  3. 03_VALIDATION entry records checks and PASS result.
- Dependencies (role -> artifact):
  1. project-manager -> AGENTS.md
  2. project-manager -> docs/agents/02_EXECUTION_LOG.md
  3. project-manager -> docs/agents/03_VALIDATION.md
  4. project-manager -> docs/agents/04_HANDOFF.md
- Constraints: Keep scope to governance docs only.
- Done Condition: Protocol and PM feedback loop are documented and evidenced in agent docs.

## Intake Addendum - PM_DELEGATION_BOARD_2026-02-13

- Task ID: PM-DELEGATION-BOARD-2026-02-13
- Goal: Implement the provided PM Delegation To-Do board as the canonical master backlog.
- In Scope:
  1. Replace `docs/agents/PM_TODO.md` with normalized backlog IDs, priorities, status, and dependencies.
  2. Record this task in `00_INTAKE`, `01_PLAN`, `02_EXECUTION_LOG`, `03_VALIDATION`, and `04_HANDOFF`.
  3. Preserve operating constraints and acceptance targets in the backlog doc.
- Out of Scope:
  1. Executing backlog items.
  2. Runtime code or UI behavior changes.
- Acceptance Criteria:
  1. `docs/agents/PM_TODO.md` contains all provided task IDs (`PM-*`, `DATA-*`, `EVAL-*`, `OCR-*`, `TEST-*`, `SEC-*`, `REPO-*`, `DOC-*`).
  2. Execution sequence waves and PM sign-off targets are present.
  3. Required 00-04 documentation updates exist for this task.
- Risk Tier: T1
- Execution Path: FULL_PATH
- Evidence Required:
  1. `03_VALIDATION.md` includes ID coverage checks and PASS.
  2. `02_EXECUTION_LOG.md` includes file-change summary and rationale.
  3. `04_HANDOFF.md` summarizes completion and next action.
- Dependencies (role -> artifact):
  1. project-manager -> `docs/agents/PM_TODO.md`
  2. project-manager -> `docs/agents/00_INTAKE.md`
  3. project-manager -> `docs/agents/01_PLAN.md`
  4. project-manager -> `docs/agents/02_EXECUTION_LOG.md`
  5. project-manager -> `docs/agents/03_VALIDATION.md`
  6. project-manager -> `docs/agents/04_HANDOFF.md`
- Constraints:
  - Keep board wording aligned with user-provided priorities and wave order.
  - No backlog item marked DONE without validation evidence policy in the board.
- Done Condition: Board is canonicalized in `PM_TODO.md` and this update is evidenced in 00-04 docs.


