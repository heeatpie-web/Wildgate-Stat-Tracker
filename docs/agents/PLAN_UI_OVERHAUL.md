# UI Overhaul Plan: Smart Capture, Analytics, Telemetry, Navigation, Tactical Console & Overlays

**Status:** Approved with clarifications (telemetry chip, Smart Capture structure, Tactical Console + overlay HUDs, self-audit + user routing, all 5 chips).

---

## Clarifications Locked In

| Topic | Decision |
|-------|----------|
| **Telemetry indicator** | One chip with two states: **solid** = connected (log exists), **blinking** = receiving (recent events). Receiving window: e.g. 30–60s (implementation detail). |
| **Smart Capture panel** | Remain **one page**, navigatable via side navigation options. Other options can be hidden behind navigation but should **ideally be dynamically restyled into the existing space** (no separate routes; same view, sections/nav). |
| **Tactical Console & overlay HUDs** | **In scope.** Overhaul: (1) **TelemetryPanel** (Tactical Console), (2) **OverlayView** in both variants — **compact** and **transparent** (the two overlay HUDs). Same tokens, status copy, and patterns as header where applicable. |
| **Visually finalized / acceptance** | Agents **self-audit against implementation of the goals**. Subjective questions (e.g. “does this look good?”) are **routed to the USER** for confirmation. |
| **Header chips** | **All 5 chips:** Data, Vision, Mission, Updates, **Telemetry** (add telemetry; do not remove existing chips). |

---

## Goals

- **Smart Capture Panel:** Total overhaul for MD3 + Apple HIG (per UI_MASTERPLAN), internal guidelines, usability with easy access to functions, clear task hierarchy. **Single page with side nav; options restyled into existing space or behind nav.**
- **Analytics Panel:** Same alignment; address improvement areas in shell, dashboard, and subpanels.
- **Top indicator:** Telemetry-focused. **One chip, two states:** solid = connected, blinking = receiving. **All 5 chips** shown (Data, Vision, Mission, Updates, Telemetry).
- **Navigation:** Improve if needed (Sidebar, in-view nav).
- **Tactical Console & overlay HUDs:** Overhaul **TelemetryPanel** (Tactical Console) and **OverlayView** (compact + transparent) for tokens, status copy, and consistency with header.
- **Acceptance:** Agents self-audit against goals; subjective judgments go to USER.

---

## Execution Order and Delegation

| Phase | Owner(s) | Deliverable |
|-------|----------|-------------|
| 1 – Telemetry indicator | builder | Store/hook extended; SystemPulse: one Telemetry chip (solid = connected, blinking = receiving); all 5 chips present. |
| 2 – Navigation review | ui-designer then builder | Decision (change vs no change); if change, implementation + validation. |
| 3 – Smart Capture overhaul | ui-designer (spec + hierarchy) → builder | **One page,** side nav; options restyled into space or behind nav; tokens, hierarchy. |
| 4 – Analytics overhaul | ui-designer (spec + subpanel list) → builder | Shell/dashboard + subpanel fixes. |
| 5 – Tactical Console & overlay HUDs | ui-designer → builder | TelemetryPanel + OverlayView (compact + transparent) overhaul; tokens and consistency. |
| 6 – Validation / verifier | verifier (optional) | 03_VALIDATION entries; self-audit against goals; subjective items routed to USER. |

---

## Key Files

- **Header / indicator:** [Header.tsx](src/components/Header.tsx), [SystemPulse.tsx](src/components/SystemPulse.tsx)
- **Telemetry state:** [createUISlice.ts](src/store/slices/createUISlice.ts), [useLogMonitor.ts](src/hooks/useLogMonitor.ts)
- **Smart Capture:** [SmartCapturesPanel.tsx](src/components/SmartCapturesPanel.tsx), [SmartCaptureWidgets.tsx](src/components/smart-captures/SmartCaptureWidgets.tsx)
- **Analytics:** [AnalyticsShell.tsx](src/components/analytics/AnalyticsShell.tsx), [AnalyticsDashboard.tsx](src/components/analytics/AnalyticsDashboard.tsx), analytics `*View.tsx`
- **Tactical Console:** [TelemetryPanel.tsx](src/components/TelemetryPanel.tsx)
- **Overlay HUDs:** [OverlayView.tsx](src/components/OverlayView.tsx) (compact + transparent per [createSettingsSlice.ts](src/store/slices/createSettingsSlice.ts) `OverlayStyle`)
- **Navigation:** [Sidebar.tsx](src/components/Sidebar.tsx)
- **Guidelines:** [UI_MASTERPLAN.md](docs/agents/UI_MASTERPLAN.md), [UI_AUDIT.md](docs/UI_AUDIT.md)

---

## Self-Audit and User Routing

- Each area (telemetry, Smart Capture, Analytics, Tactical Console, overlays) must be **self-audited by the implementing agent** against the stated goals and UI_MASTERPLAN.
- **Subjective questions** (e.g. “does this look good?”, “is this hierarchy clear?”) must be **routed to the USER** for confirmation; do not close as done on subjective judgment alone.
- Verifier (when used) performs independent check and logs in 03_VALIDATION; any subjective pass/fail is deferred to USER.

---

## Risk and Execution Path

- **Risk Tier:** T2. **Execution Path:** FULL_PATH. Evidence in 03_VALIDATION for each step; escalation via BLOCKERS/DECISIONS.
