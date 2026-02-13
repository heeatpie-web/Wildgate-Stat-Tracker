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

