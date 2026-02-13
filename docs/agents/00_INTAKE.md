# Intake: UI Overhaul — Smart Capture & Analytics (Phase 3–4) + Batch Authentication

## Current Task (BATCH_AUTH_19)
- **Task ID:** BATCH-AUTH-19
- **Goal:** Thorough analysis of UI Overhaul batch (Steps 13–18) to authenticate: **clean design**, **functional code**, **role alignment**. Delegated to team per 01_PLAN Step 19 (19a ui-designer, 19b builder, 19c verifier); PM gates in 19d.
- **Risk Tier:** `T2` (multi-file, visual/behavior; not security/release-critical)
- **Execution Path:** `FULL_PATH`
- **Evidence required:** Each role writes its own 03_VALIDATION entry (19a, 19b, 19c); failures → BLOCKERS.md. PM marks Step 19 COMPLETE only when all PASS and no ACTIVE blockers. No release GO until intake/plan state and Step 19 outcomes are confirmed.

## Active Plan Context (01_PLAN)
- **UI Overhaul Phases 3–4:** Smart Capture (Phase 3) — one page, side nav Capture | Tools; Analytics (Phase 4) — shell/dashboard/subpanel token alignment per SPEC_ANALYTICS_PHASE4.md and UI_MASTERPLAN. Steps 13–18 implemented; Step 19 batch authentication IN_PROGRESS.
- **Done condition (aligned with plan):** Step 19 complete when 19a (design audit), 19b (implementation attestation), 19c (functional + role-alignment audit) are PASS and documented in 03_VALIDATION; no ACTIVE blockers; PM gate (19d) run and 04_HANDOFF updated.

## Risk Tier and Execution Path (AOM_V2)
- **T0:** Docs/config only; single owner; no behavior or contract change. FAST_PATH eligible.
- **T1:** Single-owner, small file set; low behavior impact; no security/release/API. FAST_PATH if no rejection rule.
- **T2:** Multi-file or behavior change; not security/release-critical. FULL_PATH.
- **T3:** Security, release gate, or public API/contract change. FULL_PATH; verifier required when PM designates.
- **FAST_PATH:** Low-risk; single lane; minimal evidence. Step DONE may still require 03_VALIDATION entry unless PM waives.
- **FULL_PATH:** Evidence in `docs/agents/03_VALIDATION.md` required before step DONE. Escalate only via `docs/agents/BLOCKERS.md` or `docs/agents/DECISIONS.md`. Use role labels only (`project-manager`, `builder`, etc.) for new entries.

## Goal (current phase)
- Complete **Step 19 — Batch authentication** for UI Overhaul batch (Steps 13–18): design audit, implementation attestation, functional and role-alignment audit.
- Ensure **00_INTAKE**, **01_PLAN**, **03_VALIDATION**, **04_HANDOFF**, and **BLOCKERS** are consistent and credible before any PM release sign-off (GO).

## Constraints
- Step 19 executed by designated roles only (ui-designer 19a, builder 19b, verifier 19c); PM does not implement.
- Release GO is conditional on corrected intake/plan state and Step 19 outcomes; do not declare GO until 03_VALIDATION and 04_HANDOFF cite corrected state.

## Out of Scope (this intake)
- New feature work; OCR-only cycle scope; Structure Hardening next phase (queued separately).

## Done Condition
- Step 19 (19a–19d) complete per 01_PLAN; all 19a/19b/19c entries in 03_VALIDATION; no ACTIVE blockers; 04_HANDOFF and 03_VALIDATION cite corrected intake/plan; PM has run gate and (if all PASS) may declare release GO.

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

