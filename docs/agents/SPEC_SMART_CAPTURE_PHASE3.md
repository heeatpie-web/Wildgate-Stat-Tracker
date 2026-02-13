# Spec: Smart Capture Overhaul (Phase 3) — ui-designer

**Task ID:** UI-OVERHAUL-01 / Step 15  
**Goal:** One page, side nav; options restyled into existing space or behind nav; tokens and hierarchy per UI_MASTERPLAN.  
**Owner:** ui-designer (spec + hierarchy) → builder (implementation).  
**References:** [PLAN_UI_OVERHAUL.md](PLAN_UI_OVERHAUL.md), [UI_MASTERPLAN.md](UI_MASTERPLAN.md), [UI_AUDIT.md](../UI_AUDIT.md).

---

## 1. Classification

- **Change type:** Visual-impact (layout, navigation, hierarchy; copy unchanged except where labels are clarified).
- **Evidence required (AOM_V2):** Before/after at 1366x768 and 390x844; state coverage (empty, loading, queue vs all); keyboard focus; build + snapshot.

---

## 2. Current State (Summary)

- **SmartCapturesPanel.tsx:** Single tall view with (1) top bar: search, All/Queue segmented control, tools toggle; (2) collapsible “Tools” block (bulk actions, pending captures, OCR issues); (3) two-column: left = scrollable match list, right = selected match detail with many collapsible Sections (Result, Ship, Modifiers, Teammates, Opponents, POI, OCR Metadata, Telemetry, Kill Breakdown, Match Details, Re-run Analysis, Artifacts).
- **SmartCaptureWidgets.tsx:** Shared Section, StatCard, ModifierAdder, KillAdder, etc.
- **Patterns:** `mg-surface-high`, `md3-surface`, `md3-btn-*`, `sc-seg-btn`, `sc-bordered`; some ad hoc gradients. List + detail is one page but no persistent side nav.

---

## 3. Target Structure (One Page + Side Nav)

### 3.1 Layout

- **One page:** No new routes. All content remains in the same Smart Captures view.
- **Side nav:** A persistent **left rail** (narrow, e.g. 56–64px) with icon-only or icon+short label items. Content area to the right is the single “main” area that switches by nav selection.
- **Content area:** One primary content block at a time (list + detail, or tools, or a single “section” view). Restyle existing options into this space or behind nav so the main area is not multiple competing columns when nav is used.

### 3.2 Side Nav Items (Proposed)

| Id | Label (short) | Icon | Content |
|----|----------------|------|--------|
| `list` | All | LayoutList (or ListChecks) | Match list + selected match detail (current two-column list+detail). Default selection. |
| `queue` | Queue | ListChecks | Queue-only list + detail (same layout as list but filtered to work queue). |
| `tools` | Tools | Zap (or Wrench) | Bulk actions, Pending captures, OCR issues (current “Tools” content). |

- **All** and **Queue** can be merged into one nav item with a **segmented control in the content header** (All | Queue) to avoid two nearly identical nav entries; then nav has two items: **Capture** (list + detail + All/Queue in header) and **Tools**.
- **Recommended:** Two nav items: **Capture** (list + detail; header contains search + All/Queue + primary actions), **Tools** (bulk actions, pending captures, OCR issues). Keeps nav minimal and matches “options restyled into space or behind nav.”

### 3.3 Content Area Behavior

- **Capture:** Header strip: search, All/Queue segmented control, optional “Resolve”/“Next” when in queue mode. Below: same list (left) + detail (right) as today; no structural change to list/detail, only container and tokens.
- **Tools:** Single column: Bulk actions card, Pending captures (if any), OCR issues (if any). No match list/detail in this view.
- **Responsive:** At narrow width (e.g. &lt; 900px), side nav can collapse to a drawer (hamburger or icon strip that expands) so content area gets full width when nav is closed.

---

## 4. Hierarchy (Information + Visual)

### 4.1 Information Hierarchy

1. **Primary:** Current capture context — which match is selected, and whether we’re in “All” or “Queue.”
2. **Secondary:** Match list (scan/select), queue position (e.g. “3 of 12”), and primary actions (Resolve, Next, Apply to session).
3. **Tertiary:** Tools (bulk export, bulk OCR, bulk resolve), pending captures, OCR issues; and within detail, all Section blocks (Result, Ship, Modifiers, etc.).

### 4.2 Visual Hierarchy (Tokens)

- **Surfaces:** Use **mg-surface** for the panel shell (glass); use **md3-surface** / **md3-surface-high** for cards and form blocks inside the content area (per UI_MASTERPLAN: do not mix mg and md3 on the same element).
- **Radius:** `rounded-card` for cards/sections, `rounded-control` for buttons/inputs/chips.
- **Typography:** `text-title` or `text-label-lg font-bold` for content area title; `text-label-sm` / `text-body` for body; secondary labels `text-md-sys-on-surface/60` (opacity-secondary), muted `text-md-sys-on-surface/40` (opacity-muted).
- **Actions:** One primary action per context (e.g. “Resolve” in queue mode, “Apply to session” in detail). Others tonal/outlined/text per UI_MASTERPLAN action hierarchy.
- **Status:** Use semantic classes: `text-success`, `text-warning`, `text-danger`, `text-info`; avoid raw color drift.

---

## 5. Acceptance Criteria (Builder)

- [ ] One page: no new routes; all content in Smart Captures view.
- [ ] Persistent side nav (left rail) with at least two items: Capture, Tools. Capture shows list + detail + All/Queue in header; Tools shows bulk actions, pending captures, OCR issues.
- [ ] Content area shows one primary content block per nav selection (Capture or Tools).
- [ ] Tokens: md3-surface / md3-card / rounded-card / rounded-control; typography and opacity per UI_MASTERPLAN; semantic status colors.
- [ ] No new scroll traps; list and detail remain scrollable as today; at 1366x768 and 390x844 no clipping of primary actions.
- [ ] Keyboard: tab order and focus visible; side nav items focusable and activatable with Enter/Space.
- [ ] Build passes; visual evidence at 1366x768 and 390x844 (and state coverage) recorded in 03_VALIDATION.

---

## 6. Out of Scope (Phase 3)

- Changing behavior of OCR, match update, or artifact APIs.
- Adding new routes or splitting Smart Captures into multiple pages.
- Redesign of Analytics or other panels.
- Subjective “looks good” judgment; self-audit against this spec and UI_MASTERPLAN; subjective items to USER.

---

## 7. Phased UI Plan (ui-designer)

| Phase | Step | Owner | Done condition |
|-------|------|--------|-----------------|
| 1 | Intake/scope | ui-designer | This spec approved; scope locked to Smart Capture one page + side nav. |
| 2 | Plan | ui-designer | Spec + hierarchy documented (this doc). |
| 3 | Implement | builder | Side nav + content switching; tokens and hierarchy applied; build PASS. |
| 4 | Validate | builder / debugger | 03_VALIDATION evidence (viewport, states, keyboard); snapshot if needed. |
| 5 | Handoff | builder | 04_HANDOFF updated; any deferred item listed. |

---

**End of spec.** Builder: implement per §3–4; validate per §5; log evidence in 03_VALIDATION and handoff in 04_HANDOFF.
