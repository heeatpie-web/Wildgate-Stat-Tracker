# Step 19 — Verifier UI analysis (input for 19a, 19b, 19c)

**Purpose:** Future reference for ui-designer (19a design audit), builder (19b implementation attestation), and verifier (19c functional + role-alignment audit). Raw feedback from verifier walkthrough of current app state; transcribed for structured use.

**Date:** 2026-02-13  
**Role:** verifier  
**Status:** Pre–19c formal entry; use this as input when executing 19a, 19b, 19c.

---

## 1. Header / match indicator (top bar)

- **Telemetry vs Match:** Consider merging the Telemetry indicator with the match indicator — they essentially mean the same thing. Keep the dual-state behavior: solid when log file is present, flashing when telemetry is being received.
- **Current:** Separate Telemetry chip was added in Phase 1; verifier suggests combining with match indicator instead of a separate chip.

---

## 2. Analytics page

- **Overhaul not evident:** Things look pretty much the same; no clear sense of an overhaul.
- **Scroll bar:** Scroll bar doesn’t work (bug).
- **Layout:** Graphs and layout look the same; feels cluttered and not very cohesive.
- **Time sorting:** Time/sorting control feels poor (“pretty kind of shit”).
- **Visual hierarchy:** No clear hierarchy — e.g. Insights, Social, Detailed analysis, Hazard analysis, Streak timeline, Performance momentum all sit at the same level; no indication of which is more important.
- **Connection to dashboard:** No clear connection between the top graphs and the analytics dashboard.

---

## 3. Smart Capture

- **Capture vs Tools:** Capture and Tools toggle on the left is good (“great”).
- **Capture interface (right side):** Really clustered; negative space under the screenshot; Reach modifiers, Loadout, Points of interest; Re-run analysis button is all the way at the bottom and looks way different than at the top — inconsistent.
- **Tools panel:** Better, but feels like a “black box” — unclear what the user is looking at or what it’s for.

---

## 4. Players tab

- **List pattern:** Should not be a single scroll list for all players; should be a paginated list (page-by-page).
- **Layout:** Suggests a third column as well.
- **General:** Could use more work.

---

## 5. History tab

- **Overall:** Looks pretty good.
- **Win/Loss shading:** Previously had win/loss color shading across the row width; verifier liked that; now it’s gone (“doesn’t have that anymore”) — consider restoring or clarifying.

---

## 6. Overlay

- **Transparent overlay:** “Ridiculous” — transparent overlay does not work right. May have been on to-do; currently broken.
- **Compact (opaque) overlay:** Looks pretty good. Issues:
  - **DevTools:** DevTools shows up in the dashboard; only way to minimize is to exit; wish it could be minimized instead.
  - **Bottom cut-off:** Buttons to enter data at the bottom are cut off — size/layout issue.
  - **Default size:** When app opens in overlay mode, default size should be smaller (e.g. 15–20% of screen or similar).

---

## 7. Settings tab

- **Clutter:** Super cluttered, especially around OCR engine toward the bottom.
- **Visual:** White outlines around everything; a lot of weird negative space.
- **Alias / authority:** Feels a little small and lacking in authority; “manager feels kind of weird.”

---

## 8. ID Mapper

- **Visibility:** Verifier doesn’t see ID mapper on the recording panel; not sure where it is in general.

---

## 9. Dev OCR lab (corpus)

- **Look:** Looks nicer.
- **Ground truth input:** No plain-text way to enter “this is who was on my team” — ground truth is only enterable as JSON; verifier doesn’t know JSON; no simple form.
- **Images:** Can’t see the images that are present; no flat/base images to keep running corpus against; verifier thinks that’s how it should work.

---

## 10. Other

- “Everything else actually looks pretty good.”

---

## How 19a, 19b, 19c should use this

- **19a (ui-designer):** Use for design audit — which items are hierarchy/token/UX issues vs. scope; recommend priorities and what belongs in this batch vs. follow-up.
- **19b (builder):** Use when attesting what was built — call out which of these areas were in scope for Steps 13–18 (e.g. overlay transparent/compact was Phase 5; Analytics shell Phase 4; Smart Capture Phase 3) and what was not touched.
- **19c (verifier):** Use when writing the formal Step 19c entry — reference this feedback in functional PASS/FAIL (e.g. “transparent overlay broken”, “analytics scroll bar broken”, “Smart Capture tools panel unclear”) and in role-alignment notes as needed.
