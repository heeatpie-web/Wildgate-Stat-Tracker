# PM To-Do — Features to Add

**Purpose:** Single backlog for project-manager. Steps 1–19 and Step 20 (20.1–20.9) are **100% complete** per 02_EXECUTION_LOG and 03_VALIDATION. This list is **optional follow-up** from QA (PARTIALs); PM may assign, defer, or close.

**Last updated:** 2026-02-13 (post–Step 20 PM gate)

---

## Features to add (optional)

| # | Feature | Source | Done when | Status / Owner |
|---|---------|--------|-----------|----------------|
| F1 | **Analytics: "Quick views" or "Jump to" label** | Step 20 QA re-run (20.2 PARTIAL). Spec: [SPEC_STEP20_VERIFIER_FEEDBACK.md](SPEC_STEP20_VERIFIER_FEEDBACK.md) — "Jump to or Quick views label on strip". | Analytics shell has a visible label (e.g. "Quick views" or "Jump to") on the strip above the quick-view buttons; Overview remains default; scroll and hierarchy unchanged. | **QA PASS (2026-02-13).** "Quick views" label present in AnalyticsShell.tsx line 175. PM may mark complete. |
| F2 | **Overlay: DevTools collapse in overlay** | Step 20 QA re-run (20.6 PARTIAL). Spec: overlay "compact: DevTools collapse/expand". | In overlay (compact) mode, DevTools panel is minimizable/expandable like Mission panel, OR out-of-scope is documented in DECISIONS.md and this item closed. | **QA PASS (2026-02-13).** DevTools collapse/expand in OverlayView.tsx (compact path, devMode). PM may mark complete. |

---

## Assigned (next cycle — Step 21)

- **F1:** **ui-designer** — Confirm label copy and placement (e.g. "Quick views" or "Jump to" on strip). **builder** — Add label in `AnalyticsShell.tsx` per spec; log in 02_EXECUTION_LOG; keep build + test PASS.
- **F2:** **ui-designer** — Confirm whether DevTools collapse in overlay is in scope. **builder** — Implement minimizable/expandable DevTools in overlay (compact), or document out-of-scope in DECISIONS.md and close F2; log in 02_EXECUTION_LOG.
- **Defer/close:** If PM defers or closes an item, move it to "Closed/Deferred" below and note reason.

---

## Closed / Deferred

- _(None. PM may move items here with a one-line reason.)_

---

## Completed (no action)

- **Steps 1–19:** OCR stabilization, post-cycle 7–12, UI Overhaul Phases 1–6 (13–18), Step 19 batch auth. Evidence: 02_EXECUTION_LOG, 03_VALIDATION. RM signoff recorded for Step 19.
- **Step 20 (20.1–20.9):** Verifier feedback implementation. Builder complete; QA re-run 7 PASS / 2 PARTIAL; PM gate PASS. Evidence: 02_EXECUTION_LOG (first batch + remainder), 03_VALIDATION (Completion log, QA re-run, PM gate).

---

## Handoff to PM

- **Current state:** Steps 1–20 complete. Build + 88 tests PASS. No ACTIVE blockers.
- **Done:** F1 and F2 **assigned** to ui-designer (spec/confirm) and builder (implement or document OOS). Step 21 added to 01_PLAN; 00_INTAKE updated for next cycle.
- **Next cycle:** Start with Step 21 — ui-designer confirms F1 copy and F2 scope; builder implements F1 (Analytics label) and F2 (DevTools collapse or OOS). See 01_PLAN Step 21 and 00_INTAKE.
- **References:** 00_INTAKE.md (current task PM_BACKLOG → Step 21 when starting), 01_PLAN.md (Step 21), 04_HANDOFF.md (status), BLOCKERS.md (none active).
