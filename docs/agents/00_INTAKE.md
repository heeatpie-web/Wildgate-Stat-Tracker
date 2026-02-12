# Intake: Opacity Normalization (3-Tier System)

## Goal
Normalize text-related opacity values across 18 component files to a consistent 3-tier system:
- **Full opacity**: remove class / remove slash
- **Secondary (60)**: `opacity-60` / `/60`
- **Muted (40)**: `opacity-40` / `/40`

## Constraints
- Only change TEXT-related opacity (not bg/border)
- Do not touch hover/focus/group-hover interaction states
- Do not touch opacity-disabled, /4–/15 values
- Normalize `disabled:opacity-50` / `disabled:opacity-40` → `disabled:opacity-disabled`

## Out of Scope
- Background opacity (bg-*/border-*)
- Files not in the 18-file list
- Structural/layout changes

## Done Condition
All 18 files processed with text opacity normalized to the 3-tier system.

## PM Queue Addendum (Queued, Not Active)

- Requested by user: queue a concrete app-wide structure hardening sprint.
- Scope lock for queued task:
  - In: Electron main-process modularization, state ownership cleanup, legacy field migration path, targeted test coverage.
  - Out: UI redesign, OCR-model quality work, framework-level rewrites.
- Activation rule: this remains queued until `project-manager` explicitly starts "Structure Hardening Sprint (3 Phases)" in `docs/agents/01_PLAN.md`.

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
