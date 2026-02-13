# Spec: Step 20 — Verifier feedback implementation (ui-designer)

**Task ID:** VERIFIER-FEEDBACK-20  
**Source:** [STEP19_VERIFIER_UI_FEEDBACK.md](STEP19_VERIFIER_UI_FEEDBACK.md)  
**Owner:** ui-designer (specs/decisions) → builder (implementation)  
**References:** [UI_MASTERPLAN.md](UI_MASTERPLAN.md), [UI_AUDIT.md](../UI_AUDIT.md), [01_PLAN.md](01_PLAN.md) Step 20 table.

---

## 20.1 — Header / match indicator

**Verifier feedback:** Merge Telemetry indicator with match indicator; keep dual state (solid = log present, flashing = receiving).

**Spec:**
- **Single chip:** Replace the separate "Telemetry" chip with one combined chip that represents both match/session and telemetry state. Label: **"Session"** or **"Match"** (prefer "Session" to avoid overloading "Match" with game match).
- **Dual state:** Same behavior as current Telemetry chip: **solid** when log file is present (connected); **flashing** (e.g. `animate-pulse` on the status dot) when telemetry is being received within the defined window (e.g. 45s).
- **Placement:** Keep in the same chip row (Data, Vision, Mission, Updates, Session). Remove the standalone Telemetry chip; this single chip is the fifth.
- **Accessibility:** `title` or `aria-label` describes state, e.g. "Session: connected" / "Session: receiving telemetry".
- **Tokens:** Use existing chip tokens (rounded-control, text-label-sm, semantic colors); no new visual system.

---

## 20.2 — Analytics page

**Verifier feedback:** Scroll bar broken; time/sort poor; no visual hierarchy; no clear connection between top graphs and dashboard.

**Spec:**
- **Scroll bar (bug):** Builder fix — ensure the analytics content container uses a scrollable region with visible, functional scrollbar (e.g. `overflow-y-auto` + `custom-scrollbar` or platform scrollbar; verify in shell and dashboard).
- **Hierarchy:** Treat **Overview** (dashboard) as **primary** — it is the default and the "home" of analytics. Detail views (Session Summary, Momentum, Insights, etc.) are **secondary** — reached via dashboard cards or the quick-view strip. In the shell: (1) Title/context line: "Analytics Cockpit" when on Overview, or view name when on a detail view. (2) Quick-view strip: label as "Jump to" or "Quick views" (text-label-sm, text-md-sys-on-surface/60) so the connection to the dashboard is explicit. (3) Optional: group quick-view buttons under a single "Overview" + "Detail views" mental model (e.g. keep Overview as first, then group the rest as "Detail" or list by category if space allows).
- **Time/sort:** Improve time-range control affordance (current buttons are fine; ensure selected state is obvious and focus order is logical). Any sort control in the dashboard or detail views: use rounded-control, one primary sort dimension visible; avoid multiple competing sort dropdowns without hierarchy.
- **Connection to dashboard:** The dashboard (Overview) is the entry point; each card that navigates to a detail view should have a clear affordance (e.g. "View details" link or chevron). No spec change to data flow — only make the "this card opens this view" relationship visually clear (e.g. consistent icon or label on cards that are clickable).

---

## 20.3 — Smart Capture

**Verifier feedback:** Right side clustered; Re-run at bottom inconsistent with top; Tools panel feels like a "black box".

**Spec:**
- **Clutter / layout:** In the Capture view (list + detail), group the right-side content into clear **sections** with consistent spacing: (1) Screenshot/preview at top. (2) **Reach modifiers, Loadout, Points of interest** in one visual block (e.g. one card or one bordered section with sub-headings). (3) **Re-run analysis:** Single placement as **primary action** at the **top** of the detail area (e.g. below screenshot or in a sticky toolbar). Remove or de-emphasize the duplicate at the bottom; if keeping a secondary Re-run at bottom, use the **same** button style (rounded-control, same label) so it is visually consistent.
- **Tools panel:** Add a **short purpose line** at the top of the Tools view: e.g. "Bulk actions, pending captures, and OCR issues" (text-body or text-label-sm, text-md-sys-on-surface/60). Below it, keep the three blocks (Bulk Actions, Capture Queue, Priority/OCR issues) with clear headings. Optionally add one-sentence sub-copy per block (e.g. "Export or resolve multiple matches at once") so the panel is not a black box. Use existing tokens (rounded-card, text-label-lg for headings).

---

## 20.4 — Players tab

**Verifier feedback:** Should be paginated (not single long scroll); consider third column.

**Spec:**
- **Pagination:** Replace single scroll list with **paginated list**. Page size: **10** or **20** (builder choice; recommend 10 for density). Controls: **Previous** / **Next** buttons and optional page indicator (e.g. "Page 1 of N"). Place pagination at bottom of the list (and optionally top). Use rounded-control for buttons; text-label-sm for page indicator.
- **Third column:** Add a **third column** when viewport allows (e.g. lg breakpoint): (1) Column 1: list of players (paginated). (2) Column 2: existing detail (if any). (3) Column 3: **Selected player summary** — when a player is selected from the list, show a compact summary (name, key stat or two, optional "View full profile" link). If no selection, third column can show placeholder text ("Select a player") or a short hint. Layout: grid or flex; avoid horizontal scroll on typical desktop width.

---

## 20.5 — History tab

**Verifier feedback:** Win/loss row shading across width is gone; restore or clarify.

**Spec:**
- **Decision:** **Restore** win/loss row shading across the full row width.
- **Implementation:** **Win rows:** subtle background tint (e.g. `bg-success-soft/30` or `bg-success/10`) across the full table row. **Loss rows:** subtle background tint (e.g. `bg-danger-soft/30` or `bg-danger/10`). Ensure text remains readable (contrast). Do not rely on a narrow left border only; the full row should read as win or loss at a glance. Use existing semantic tokens (success/danger soft).

---

## 20.6 — Overlay

**Verifier feedback:** Transparent overlay broken; compact: DevTools minimizable, bottom cut-off, default size ~15–20%.

**Spec:**
- **Transparent overlay (broken):** Builder fix — behavior and layout so transparent overlay mode works (data entry, visibility, no crash or blank state). No new visual spec; fix existing implementation.
- **Compact overlay — DevTools:** Make DevTools **minimizable**: add a **collapse/expand** control (e.g. chevron or "Minimize" button) so the user can hide the DevTools section without exiting overlay. When minimized, show a small affordance (e.g. "Show DevTools") to expand again. Use rounded-control for the toggle.
- **Compact overlay — bottom cut-off:** Ensure **bottom buttons** (e.g. data entry, Submit, Close) are **always visible** — no cut-off. Options: (1) Make the overlay content area scrollable so the bottom actions are in the scroll range, or (2) Sticky/fixed bottom bar for primary actions so they stay visible. Prefer sticky bottom bar for primary actions (one row of buttons) and scrollable content above.
- **Default size:** When the app opens in overlay mode (compact or transparent), **default size** should be approximately **15–20% of viewport** (height or width as appropriate to the overlay layout). Builder may interpret as: initial height 20% of window height, or initial width 20% of window width, so the overlay does not dominate the screen on open. User can resize from there.

---

## 20.7 — Settings tab

**Verifier feedback:** Cluttered (esp. OCR engine); white outlines/negative space; Alias/authority feels small and lacking authority.

**Spec:**
- **Grouping / clutter:** Group **OCR engine** settings into **one card or section** with a clear heading (e.g. "OCR engine"). Reduce visual noise: use **md3-surface** or **md3-card** for the section; avoid multiple heavy borders (prefer one card with internal spacing). Reduce **white outlines** and **negative space** by tightening padding and using a single container background instead of many bordered boxes.
- **Alias / authority:** Make **Alias & manager** (or equivalent) a **primary section**: clear heading (text-title or text-label-lg font-bold), more vertical prominence (e.g. move higher or give full-width block). Copy: use "Display name & manager" or "Alias & authority" so "authority" is explicit; one short sentence under the heading explaining that this is the identity used for session and analytics. Increase prominence of the input(s) (e.g. slightly larger touch target, or place in first card of the tab).

---

## 20.8 — ID Mapper

**Verifier feedback:** Not visible on recording panel; unclear where it lives.

**Spec:**
- **Recording panel visibility:** Add a **discoverable entry point** to the ID Mapper from the **recording flow**. Options: (1) A link or button in the **ActionPanel** or **MatchRecordingPage** (e.g. "ID Mapper" with icon) that opens the ID Mapper view or a slide-out. (2) Ensure ID Mapper is listed in **Sidebar** (if it isn’t already) with a clear label. (3) If ID Mapper is a modal or separate route, ensure the recording view has a persistent link (e.g. in header or actions) so users can open it without leaving the recording context.
- **Recommendation:** Prefer **Sidebar + one in-recording link**. Sidebar: "ID Mapper" nav item. Recording: one "ID Mapper" or "Manage IDs" link/button near other secondary actions (e.g. near Settings or in the match detail area). Use text-label-sm or text-body; icon optional (e.g. UserPlus or List).

---

## 20.9 — Dev OCR lab (corpus)

**Verifier feedback:** No plain-text ground truth input; can’t see images; no flat/base images for corpus.

**Spec:**
- **Plain-text ground truth:** Provide a **simple form** for "who was on my team" (and optionally opponents, modifiers) that does **not** require JSON. Fields: (1) **Teammates** — text area or comma/newline-separated input. (2) **Opponents** — same. (3) **Modifiers** — optional, comma-separated or multi-line. Form submits into the same ground-truth pipeline (builder maps to existing JSON structure). Label clearly: "Ground truth (plain text)" and "One name per line or comma-separated". Use md3-surface, rounded-control inputs, one primary "Save" or "Update ground truth" button.
- **Show images present:** In the corpus/dev OCR view, add an **image list** that shows **thumbnails** of images currently in the corpus (or in the selected folder). List or grid of thumbnails with optional filename; click to select or view full size. So "images that are present" are visible without opening files manually.
- **Base/reference images:** Allow user to designate **base** or **reference** images for corpus runs — e.g. a small set of "golden" images that eval runs against. UX: either (1) a "Base images" subsection with checkboxes or multi-select on the image list, or (2) a separate "Reference set" that lists designated base images. Builder implements the minimal path: at least show the images; designation of "base" can be a follow-up if time-constrained (document in execution log).

---

## Per-item acceptance checklist (ui-designer)

Builder/verifier can use these to confirm each item is done.

| # | Item | Done when |
|---|------|-----------|
| 20.1 | Header / match indicator | One "Session" chip in header (no separate Telemetry chip); solid when log present, flashing when receiving; aria-label/title; chip row still has 5 chips. |
| 20.2 | Analytics page | Scroll bar works in shell and dashboard; "Jump to" or "Quick views" label on strip; Overview is default; clickable cards have clear affordance. |
| 20.3 | Smart Capture | Right side: screenshot → one block (modifiers/loadout/POI) → Re-run at top (primary); Tools view has purpose line + clear headings. |
| 20.4 | Players tab | List is paginated (Prev/Next + page indicator); third column shows selected player summary (or placeholder) at lg breakpoint. |
| 20.5 | History tab | Win rows have full-width success tint; loss rows have full-width danger tint; text readable. |
| 20.6 | Overlay | Transparent mode works; compact: DevTools collapse/expand; bottom actions visible (sticky or scroll); default size ~15–20% viewport. |
| 20.7 | Settings tab | OCR engine in one card/section; less outline/space; Alias/authority is primary section with clear heading and copy. |
| 20.8 | ID Mapper | Entry point from recording (link/button) + in Sidebar; discoverable. |
| 20.9 | Dev OCR lab | Plain-text ground truth form (teammates, opponents, modifiers); image list with thumbnails; base images (min: show images). |

---

## Suggested implementation order (ui-designer)

Optional sequence for builder; PM may override. **Tier 1 (bugs / blocking):** 20.2 (Analytics scroll), 20.6 (Overlay transparent fix) — unblock usage. **Tier 2 (high visibility):** 20.1 (Header/Session chip), 20.5 (History win/loss shading), 20.3 (Smart Capture clutter + Tools copy) — quick wins. **Tier 3 (layout / discoverability):** 20.4 (Players pagination + third column), 20.6 (Overlay compact: DevTools, bottom, default size), 20.7 (Settings), 20.8 (ID Mapper). **Tier 4 (Dev OCR):** 20.9 (plain-text form, image list, base images). Items within a tier can be parallelized where lanes do not conflict.

---

## Follow-up (optional) — ui-designer spec for builder

Post–Step 20 QA flagged two items as PARTIAL. Spec below so builder can close them.

### FU-20.2 — Analytics: "Quick views" label on strip

**Context:** Original 20.2 spec asked for the quick-view strip to be labeled "Jump to" or "Quick views" so the connection to the dashboard is explicit. QA reported the label was not present.

**Spec:**
- In **AnalyticsShell**, in the horizontal strip that contains the quick-view buttons (Momentum, Insights, Social, Pro, Environment, Streaks, etc.), add a **visible label** immediately before or above the buttons.
- **Label text:** **"Quick views"** (prefer) or "Jump to". One short phrase only.
- **Placement:** Left of the first quick-view button, or on a line above the button row if the strip wraps. Ensure the label is in the same visual block as the buttons (same container/padding).
- **Tokens:** `text-label-sm` and `text-md-sys-on-surface/60` so it reads as secondary to the title. No new components; a `<span>` or `<label>` is sufficient.
- **Done when:** A user on the Analytics Overview sees the phrase "Quick views" (or "Jump to") associated with the row of view shortcuts; the strip is no longer unlabeled.

---

### FU-20.6 — Overlay: DevTools collapse in OverlayView

**Context:** Original 20.6 spec asked for DevTools to be minimizable in the compact overlay so the user can hide it without exiting. QA reported DevTools collapse is not in OverlayView (e.g. implemented elsewhere or missing in overlay context).

**Spec:**
- In **OverlayView** (compact overlay mode), the **DevTools** section (or equivalent dev/debug block that shows in the overlay) must have a **collapse/expand** control.
- **Behavior:** One click/tap collapses the DevTools content so it is hidden; only a small affordance remains (e.g. a bar or button saying "Show DevTools" or a chevron). Another click expands it again. State can be local (e.g. React state); no persistence required unless builder prefers it.
- **Placement:** The toggle (chevron or "Minimize" / "Show DevTools") must be on or immediately beside the DevTools section header (or top edge of the DevTools block) so it is discoverable when the overlay is open.
- **Tokens:** Use `rounded-control` for the toggle button; `text-label-sm` for "Show DevTools" / "Minimize". No new visual system.
- **Done when:** In compact overlay mode, the user can collapse the DevTools area so it no longer takes space, and expand it again without leaving the overlay.

---

## Acceptance (builder)

- Implement 20.1–20.9 per the specs above; follow UI_MASTERPLAN and UI_AUDIT.
- Build and test remain PASS; no new ACTIVE blockers.
- Log implementation in 02_EXECUTION_LOG; debugger validates regressions per 01_PLAN.
- **Follow-up:** Implement FU-20.2 and FU-20.6 per the "Follow-up (optional)" section when closing Step 20 PARTIALs.
