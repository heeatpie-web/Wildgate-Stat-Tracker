# Spec: Analytics Overhaul (Phase 4) — ui-designer

**Task ID:** UI-OVERHAUL-01 / Step 16  
**Goal:** Shell/dashboard + subpanel fixes; alignment with MD3 + Apple HIG per UI_MASTERPLAN.  
**Owner:** ui-designer (spec + subpanel list) → builder (implementation).  
**References:** [PLAN_UI_OVERHAUL.md](PLAN_UI_OVERHAUL.md), [UI_MASTERPLAN.md](UI_MASTERPLAN.md), [UI_AUDIT.md](../UI_AUDIT.md).

---

## 1. Classification

- **Change type:** Visual-impact (tokens, hierarchy, density; no new routes or data contracts).
- **Evidence required (AOM_V2):** Build + test pass; optional: before/after at 1366×768 and 390×844 for shell and 2–3 representative subpanels; 03_VALIDATION entry.

---

## 2. Current State (Summary)

- **AnalyticsShell.tsx:** Top bar with time range, view switcher (Overview + 14 detail views), back navigation, export; optional InlineNarrativeToggle (DenseEditorialToggle). Main content: either AnalyticsDashboard (overview) or one of the *View components. No persistent side nav; view is a flat switcher.
- **AnalyticsDashboard.tsx:** Overview grid of cards (win rate, streak, session summary, momentum, period, time patterns, streaks, kill efficiency, placement, insights, social, pro, environment, synergy) with onNavigate to detail views.
- **Subpanels:** Each detail view is a full-width subpanel (SessionSummaryView, MomentumView, PeriodComparisonView, TimePatternView, StreakTimelineView, KillEfficiencyView, PlacementDistView, InsightsView, SocialView, ProView, EnvironmentView, SynergyView, VisualEssayView). DenseEditorialToggle affects editorial/narrative density in some views.

---

## 3. Subpanel List (Canonical)

| View id | Component | Description |
|--------|-----------|-------------|
| overview | AnalyticsDashboard | Overview grid; cards link to detail views. |
| session | SessionSummaryView | Session summary. |
| momentum | MomentumView | Performance momentum. |
| period | PeriodComparisonView | Period comparison. |
| timePatterns | TimePatternView | Time patterns. |
| streaks | StreakTimelineView | Streak timeline. |
| killEfficiency | KillEfficiencyView | Kill efficiency. |
| placement | PlacementDistView | Placement distribution. |
| insights | InsightsView | Insights. |
| social | SocialView | Social. |
| pro | ProView | Detailed analysis. |
| environment | EnvironmentView | Hazard analysis. |
| synergy | SynergyView | Synergy matrix. |
| essay | VisualEssayView | Visual essay. |

**Supporting components:** AnalyticsCard, AnalyticsCockpit, SparklineWidget, DenseEditorialToggle (InlineNarrativeToggle), analyticsExport, useAnalyticsData.

---

## 4. Target (Shell + Dashboard + Subpanel Fixes)

- **Shell:** Apply UI_MASTERPLAN tokens to the top bar and view switcher: surfaces (mg-surface / md3-surface), typography (text-title, text-label-*, text-body, opacity-secondary/muted), controls (rounded-control, md3-btn-*). Keep current behavior (time range, view switch, back, export); no new navigation structure unless UX requires it. Optional: group view switcher into categories (Overview | Performance | Social & Insights | Pro & Environment) for clarity.
- **Dashboard:** Cards and grid use md3-surface / md3-surface-high, rounded-card, text hierarchy and semantic status colors; primary/secondary actions per UI_MASTERPLAN. No layout change required unless it improves hierarchy.
- **Subpanels:** Each *View.tsx — normalize surfaces, radius, typography, and status colors to UI_MASTERPLAN; ensure one primary action per context where applicable; no scroll traps; focus order and focus visible.
- **DenseEditorialToggle:** Keep behavior; restyle to match control tokens (rounded-control, label hierarchy).

---

## 5. Acceptance Criteria (Builder)

- [ ] Shell: time range, view switcher, back, export use tokens (surfaces, typography, controls) per UI_MASTERPLAN; build passes.
- [ ] Dashboard: overview grid and cards use md3-surface/rounded-card and text hierarchy; onNavigate and onDrillDown unchanged; build passes.
- [ ] Subpanels: at least Overview + 2–3 representative detail views (e.g. Session Summary, Momentum, Pro) normalized to tokens and hierarchy; remaining views touched only if in scope per PM/builder agreement.
- [ ] No new routes or data contracts; no regression in analytics behavior or export.
- [ ] Optional: 03_VALIDATION entry with build + test pass; optional viewport evidence at 1366×768 (and 390×844 if feasible).

---

## 6. Out of Scope (Phase 4)

- New analytics features or new views.
- Tactical Console / OverlayView (Phase 5).
- Structural nav change (e.g. side nav for analytics) unless explicitly added by PM.
