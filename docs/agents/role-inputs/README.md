# Role Inputs for AI Integration

Purpose: provide copy-paste startup inputs for each agent role in this repo.

## Usage

1. Open a new agent tab.
2. Copy the `AGENT_INPUT` block from the role file.
3. Replace placeholder values like `<TASK_GOAL>`.
4. Paste into that agent tab as the first message.
5. Repeat for each role you want active.

## Required Coordination Files

- `docs/WORKLOCKS.md`
- `docs/agents/00_INTAKE.md`
- `docs/agents/01_PLAN.md`
- `docs/agents/02_EXECUTION_LOG.md`
- `docs/agents/03_VALIDATION.md`
- `docs/agents/04_HANDOFF.md`
- `docs/agents/DECISIONS.md`
- `docs/agents/BLOCKERS.md`

## Roles

- `project-manager.md` (required)
- `ui-designer.md` (required for UI work)
- `builder.md` (required)
- `debugger.md` (required)
- `release-manager.md` (required at release integration stage; may be dual-hatted by `verifier`)
- `verifier.md` (optional)
- `reporter.md` (optional)

## Placeholder Keys

- `<TASK_ID>`: short unique id (example: `analytics-ui-pass-01`)
- `<TASK_GOAL>`: one-sentence goal
- `<IN_SCOPE>`: bullet list
- `<OUT_OF_SCOPE>`: bullet list
- `<ACCEPTANCE_CRITERIA>`: numbered list
- `<FILES_OWNED>`: newline list of file paths
- `<PM_NAME>`: project manager identifier
- `<CHECK_INTERVAL_MIN>`: suggested status cadence

## Notes

- Use role names exactly: `project-manager`, `ui-designer`, `builder`, `debugger`, `release-manager`, `verifier`, `reporter`.
- Legacy owner names in old logs are allowed, but all new entries should use role names.
- Role inputs include report-driven safeguards: mandatory preflight, one-phase-per-cycle execution, and proof-first OCR verification.


## v2 Startup Model (AOM_V2)

### Core roster for FULL_PATH
- `project-manager`
- `ui-designer`
- `builder`
- `debugger`
- `release-manager`
- `verifier`

### FAST_PATH minimum roster
- `project-manager`
- single implementing role (`builder` or `ui-designer`)
- `verifier` optional unless PM upgrades risk to FULL_PATH

### New role-label rule
- New entries must use role names only.
- Legacy labels are historical-only and must not appear in new records.

