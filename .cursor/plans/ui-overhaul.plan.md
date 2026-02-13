---
todos:
  - id: phase-1-telemetry
    content: "Phase 1: Telemetry indicator — extend store/hook; add Telemetry chip (solid/blinking); all 5 chips"
    status: pending
  - id: phase-2-nav
    content: "Phase 2: Navigation review — ui-designer then builder; implement if needed"
    status: pending
  - id: phase-3-smart-capture
    content: "Phase 3: Smart Capture overhaul — one page, side nav; restyle into space or behind nav"
    status: pending
  - id: phase-4-analytics
    content: "Phase 4: Analytics overhaul — shell, dashboard, subpanels"
    status: pending
  - id: phase-5-tactical-overlays
    content: "Phase 5: Tactical Console + overlay HUDs (TelemetryPanel, OverlayView compact/transparent)"
    status: pending
  - id: phase-6-verifier
    content: "Phase 6: Validation / verifier — 03_VALIDATION; self-audit; subjective to USER"
    status: pending
---

# UI Overhaul Plan: Smart Capture, Analytics, Telemetry, Navigation, Tactical Console & Overlays

**Status:** Approved with clarifications. Canonical reference: [docs/agents/PLAN_UI_OVERHAUL.md](docs/agents/PLAN_UI_OVERHAUL.md). All UI work follows [UI_MASTERPLAN.md](docs/agents/UI_MASTERPLAN.md) and [UI_AUDIT.md](docs/UI_AUDIT.md).

## Clarifications Locked In

- **Telemetry:** One chip, two states — **solid** = connected, **blinking** = receiving (e.g. 30–60s window).
- **Smart Capture:** One page, side nav; options restyled into existing space or behind nav (no separate routes).
- **Tactical Console & overlay HUDs:** In scope — TelemetryPanel + OverlayView (compact + transparent).
- **Acceptance:** Agents self-audit against goals; subjective questions → USER.
- **Header:** All 5 chips (Data, Vision, Mission, Updates, Telemetry).

## Execution Order

| Phase | Owner(s) | Deliverable |
|-------|----------|-------------|
| 1 | builder | Telemetry chip in SystemPulse; store/hook for connected + receiving |
| 2 | ui-designer → builder | Navigation review; implement if needed |
| 3 | ui-designer → builder | Smart Capture: one page, side nav, tokens, hierarchy |
| 4 | ui-designer → builder | Analytics: shell, dashboard, subpanels |
| 5 | ui-designer → builder | TelemetryPanel + OverlayView (compact + transparent) |
| 6 | verifier (optional) | 03_VALIDATION; self-audit; subjective → USER |

## Key Files

- Header/indicator: [Header.tsx](src/components/Header.tsx), [SystemPulse.tsx](src/components/SystemPulse.tsx)
- Telemetry: [createUISlice.ts](src/store/slices/createUISlice.ts), [useLogMonitor.ts](src/hooks/useLogMonitor.ts)
- Smart Capture: [SmartCapturesPanel.tsx](src/components/SmartCapturesPanel.tsx), [SmartCaptureWidgets.tsx](src/components/smart-captures/SmartCaptureWidgets.tsx)
- Analytics: [AnalyticsShell.tsx](src/components/analytics/AnalyticsShell.tsx), [AnalyticsDashboard.tsx](src/components/analytics/AnalyticsDashboard.tsx), analytics `*View.tsx`
- Tactical Console: [TelemetryPanel.tsx](src/components/TelemetryPanel.tsx)
- Overlay HUDs: [OverlayView.tsx](src/components/OverlayView.tsx)
- Navigation: [Sidebar.tsx](src/components/Sidebar.tsx)

## Risk

- **Risk Tier:** T2. **Execution Path:** FULL_PATH. Evidence in 03_VALIDATION; escalate via BLOCKERS/DECISIONS.
