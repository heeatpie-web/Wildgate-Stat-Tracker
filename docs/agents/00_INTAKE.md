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
