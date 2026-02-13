# UI Designer — Phased Plan & Acceptance Checks

**Role:** ui-designer  
**Lane:** B (OCR UX clarity only)  
**Owned files:** `OCRReviewModal.tsx`, `OcrCorrectionModal.tsx`, `DevOCRPanel.tsx`  
**References:** AGENTS.md, UI_MASTERPLAN.md, 00_INTAKE.md, 01_PLAN.md, WORKLOCKS.md

---

## Rules (from bootstrap)

- Classify each change as **copy-only** or **visual-impact**.
- Provide required UI evidence per **UI_MASTERPLAN v2** (AOM_V2).
- Claim locks in WORKLOCKS.md before edits (Lane B files already claimed by ui-designer).
- No broad redesign unless PM explicitly approves.

---

## Phased UI Plan (generic template)

Use when a concrete goal is assigned (e.g. from PM or 00_INTAKE). Replace &lt;GOAL&gt; with the task.

### Phase 1 — Intake & scope

| Step | Action | Done condition |
|------|--------|----------------|
| 1.1 | Parse goal into: affected views, user problem, acceptance criteria | 00_INTAKE updated or confirmed |
| 1.2 | Confirm only Lane B files (or get PM approval for other files) | Scope locked to OCR UX / correction flow |
| 1.3 | Classify planned changes: copy-only vs visual-impact | Classification written in plan |

### Phase 2 — Plan

| Step | Action | Done condition |
|------|--------|----------------|
| 2.1 | Break work into 3–7 atomic UI steps (e.g. copy pass, then style, then interaction) | Steps in 01_PLAN or this doc |
| 2.2 | Mark one step IN_PROGRESS | Single active step |
| 2.3 | Confirm no conflict with UI_MASTERPLAN; if conflict, log in DECISIONS.md | No unlogged exceptions |

### Phase 3 — Implement

| Step | Action | Done condition |
|------|--------|----------------|
| 3.1 | Ensure locks claimed for files to edit (WORKLOCKS.md) | Locks active |
| 3.2 | Implement only the current step; layout first, then polish, then states | Diffs scoped to Lane B |
| 3.3 | Log each edit in 02_EXECUTION_LOG.md (file, what changed, why) | Execution log updated |

### Phase 4 — Validate (per UI_MASTERPLAN v2)

| Step | Action | Done condition |
|------|--------|----------------|
| 4.1 | **Copy-only:** Screenshot/snapshot at one desktop + one mobile breakpoint; confirm no clipping in touched view | Evidence in 03_VALIDATION.md |
| 4.2 | **Visual-impact:** Before/after at 1366x768 and 390x844; state coverage (loading, empty, error, disabled, success); keyboard focus traversal | Evidence in 03_VALIDATION.md |
| 4.3 | Run `npm run build`; fix any regressions | Build PASS |
| 4.4 | Run `npm run snap:views` if views touched (or equivalent snapshot); record mismatch % | Snapshot result in 03_VALIDATION.md |

### Phase 5 — Handoff

| Step | Action | Done condition |
|------|--------|----------------|
| 5.1 | Summarize what changed, what was verified, what remains in 04_HANDOFF.md | Handoff updated |
| 5.2 | Release file locks when step/commit complete (move to Recent Lock History) | WORKLOCKS.md updated |
| 5.3 | List any deferred UI defect or tradeoff in handoff | No silent deferrals |

---

## Acceptance checks (every UI task)

- [ ] **Design tokens:** No ad hoc palette; use `--md-sys-*` / semantic utilities (text-danger, opacity-60, etc.).
- [ ] **Single primary action** per view preserved.
- [ ] **No new scroll traps** or clipped controls at 1366x768, 1920x1080, 390x844.
- [ ] **States explicit:** Loading / empty / error / success where applicable.
- [ ] **Keyboard/focus** behavior remains usable.
- [ ] **Classification:** All edits tagged copy-only or visual-impact; evidence matches (copy-only vs visual-impact rules above).
- [ ] **Lane B only** unless PM expanded scope.

---

## Current status

- **Task ID:** Phase 2 (PLAN_UI_OVERHAUL)
- **Goal:** Navigation review — decision (change vs no change); if change, spec for builder.
- **Lane B:** COMPLETE per 01_PLAN. Phase 2 scope: Navigation (Sidebar, in-view nav) per canonical plan; read-only review + decision; implementation by builder if change.
- **Next:** Execute Phase 2 review → document decision → handoff to PM/builder.

---

## Phase 2 — Navigation review (active task)

| Step | Action | Status |
|------|--------|--------|
| 2.1 | Intake: affected views = Sidebar, in-view nav; goal = improve if needed (PLAN_UI_OVERHAUL) | Done |
| 2.2 | Review Sidebar + nav patterns vs UI_MASTERPLAN §4 (global structure, density, responsive) | Done |
| 2.3 | Document decision: change vs no change + rationale | Done |
| 2.4 | If change: write short spec for builder; else close with evidence | Done (no change) |

**Phase 2 outcome:** Decision = **No change**. Evidence in 03_VALIDATION.md; decision in DECISIONS.md; execution log updated. Optional follow-up: rail radius token alignment (rounded-card) may be done by builder if desired.
