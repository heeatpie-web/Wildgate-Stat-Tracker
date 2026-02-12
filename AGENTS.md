# AGENTS.md

Purpose: prevent task drift, reduce misunderstandings, and complete small tasks reliably.

## Operating Principles
- Keep scope narrow. Execute only the requested task unless the user explicitly expands scope.
- Confirm intent before coding. Restate goal, constraints, and done condition in one short block.
- One active task at a time. Do not parallelize unrelated work.
- Evidence over assumptions. If behavior is uncertain, inspect code/tests first.
- Ship small, verified increments.

## Default Workflow (Strict)
1. Intake
- Parse the user request into: goal, constraints, out-of-scope, done condition.
- Write to `docs/agents/00_INTAKE.md`.

2. Plan
- Create 3-7 concrete steps.
- Mark exactly one step `IN_PROGRESS` in `docs/agents/01_PLAN.md`.

3. Execute
- Implement only the current step.
- Log edits and rationale in `docs/agents/02_EXECUTION_LOG.md`.

4. Validate
- Run targeted checks first, then broader checks if needed.
- Record results in `docs/agents/03_VALIDATION.md`.

5. Handoff
- Summarize what changed, what was verified, and what remains.
- Write to `docs/agents/04_HANDOFF.md`.

## Sub-Agent Model
Use focused sub-agents with single responsibility.

### 1) Dispatcher
- Owns intake quality and scope boundaries.
- Inputs: user request.
- Outputs: `docs/agents/00_INTAKE.md`, initial `docs/agents/01_PLAN.md`.

### 2) Builder
- Owns code changes only for in-scope files.
- Inputs: `00_INTAKE`, `01_PLAN`.
- Outputs: `02_EXECUTION_LOG`, code edits.

### 3) Verifier
- Owns testing, regressions, acceptance checks.
- Inputs: code diff, `00_INTAKE`, `01_PLAN`.
- Outputs: `03_VALIDATION`.

### 4) Reporter
- Owns final user-facing summary.
- Inputs: `02_EXECUTION_LOG`, `03_VALIDATION`.
- Outputs: `04_HANDOFF`.

## Communication Files (Required)
- `docs/agents/00_INTAKE.md`: normalized request and constraints.
- `docs/agents/01_PLAN.md`: ordered steps + status.
- `docs/agents/02_EXECUTION_LOG.md`: file-level edit log.
- `docs/agents/03_VALIDATION.md`: commands, results, pass/fail.
- `docs/agents/04_HANDOFF.md`: concise final status.
- `docs/agents/DECISIONS.md`: decisions + rationale.
- `docs/agents/BLOCKERS.md`: blocked items and required input.
- `docs/agents/UI_MASTERPLAN.md`: canonical UI/UX system for all interface work.

## UI Rule
- Any task touching UI, layout, styles, interaction, or copy hierarchy must follow `docs/agents/UI_MASTERPLAN.md`.
- If a request conflicts with the masterplan, log the exception in `docs/agents/DECISIONS.md` before implementation.

## Anti-Drift Rules
- Never change scope silently.
- Never skip validation when code changed.
- Never claim completion without evidence in `03_VALIDATION`.
- If request is ambiguous, add a decision entry and choose the safest minimal interpretation.
- If blocked, stop execution and log blocker with a single explicit question.

## File Ownership Rules
- One file, one owner at a time.
- Claim shared/hot files in `docs/WORKLOCKS.md` before editing.
- Release lock immediately after commit or handoff.

## Definition of Done
A task is done only when all are true:
- Acceptance criteria in `00_INTAKE` are met.
- Plan steps in `01_PLAN` are complete or explicitly deferred.
- Validation evidence exists in `03_VALIDATION`.
- Handoff summary is complete in `04_HANDOFF`.
