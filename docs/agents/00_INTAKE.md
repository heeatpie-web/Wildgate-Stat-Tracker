# Intake: Opacity Normalization (3-Tier System)

## Current Task (UI_OVERHAUL_01)
- **Task ID:** UI-OVERHAUL-01
- **Goal:** UI Overhaul per PLAN_UI_OVERHAUL. **Phases 1–6 COMPLETE.** Steps 13–18 done; build + test PASS; evidence in 02_EXECUTION_LOG, 03_VALIDATION, 04_HANDOFF.
- **Risk Tier:** `T2` (multi-file / behavior; not security/release-critical)
- **Execution Path:** `FULL_PATH`
- **Evidence required:** 03_VALIDATION entry for each phase; build + test pass; self-audit against goals. Escalation via BLOCKERS/DECISIONS.

## Risk Tier and Execution Path (AOM_V2)
- **T0:** Docs/config only; single owner; no behavior or contract change. FAST_PATH eligible.
- **T1:** Single-owner, small file set; low behavior impact; no security/release/API. FAST_PATH if no rejection rule.
- **T2:** Multi-file or behavior change; not security/release-critical. FULL_PATH.
- **T3:** Security, release gate, or public API/contract change. FULL_PATH; verifier required when PM designates.
- **FAST_PATH:** Low-risk; single lane; minimal evidence. Step DONE may still require 03_VALIDATION entry unless PM waives.
- **FULL_PATH:** Evidence in `docs/agents/03_VALIDATION.md` required before step DONE. Escalate only via `docs/agents/BLOCKERS.md` or `docs/agents/DECISIONS.md`. Use role labels only (`project-manager`, `builder`, etc.) for new entries.

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

- **Step 13 (active):** UI Overhaul Phase 1 — Telemetry indicator (see Current Task above). Not Structure Hardening.
- **Queued (separate):** Structure Hardening Next Phase. Scope: Electron main-process modularization, state ownership cleanup, legacy field migration path, targeted test coverage. Out: UI redesign, OCR-model work, framework rewrites. Activation: PM to add a future step to `01_PLAN.md` when ready.

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

