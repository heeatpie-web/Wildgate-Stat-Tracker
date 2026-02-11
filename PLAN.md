# PLAN

This file is produced by the workflow Planner.

Status: READY

## Project Name & Goal
Wildgate Stat Tracker UX/Perf Pass

Goal: fix the listed UX/performance issues while keeping automated checks green (`npm test`, `npm run build`).

Hard requirements (confirmed by Alec):
1. Dev launch: splash is acceptable and must be visible within `<= 2s` of `npm run electron:dev` starting, then transition to the Vite renderer when ready.
2. Smart Capture: header CTA is controlled by a Settings toggle (show/hide globally), but Smart Capture must always remain accessible inside the Recording tab even when the header CTA is hidden.
3. Responsive: support phone-sized widths inside the Electron window (not a phone browser/PWA).
4. Recording: no scrolling in the Recording panel (the left-side Recording controls area) at minimum 16:9 height `768px`. Prioritize 16:9 `1080p` through `4k`. Other areas of the Recording view may scroll if needed, but the Recording panel itself must not.

Definition of Done (acceptance):
1. `npm run electron:dev` reliably shows a window quickly (splash OK) and transitions to the app once Vite is ready.
2. Recording view never clips key controls; the Recording panel does not introduce scrollbars at `1366x768` and `1920x1080`.
3. Smart Capture is discoverable from the header when enabled, and always usable from Recording even when disabled.
4. Detailed analytics narrative is structured and metric-rich while graphs remain visible.
5. Smart Captures panel is clearer: better spacing/hierarchy, clustered OCR actions, reduced selection noise, and readable primary labels.
6. Provenance is clear (telemetry/OCR/manual) including overrides.
7. `npm test` and `npm run build` pass.

## Tech Stack
- Electron (`electron/main.cjs`, `electron/preload.cjs`)
- Vite + React 18 + TypeScript (`src/`)
- Tailwind CSS + app-specific classes (`src/index.css`)
- Zustand store (`src/store/`)
- Charts: Recharts
- Tests: Vitest + Testing Library

## File Structure
Relevant areas (non-exhaustive):
```text
electron/
  main.cjs
  preload.cjs
src/
  App.tsx
  index.css
  components/
    Header.tsx
    RecordingView.tsx
    SettingsModal.tsx
    SmartCapturesPanel.tsx
    MatchRecordingPage.tsx
    analytics/
      AnalyticsShell.tsx
      AnalyticsCockpit.tsx
      ProView.tsx
      VisualEssayView.tsx
    recording/
      ActionPanel.tsx
  hooks/
    useSmartCapture.ts
  store/
    useAppStore.ts
    slices/
      createSettingsSlice.ts
      createDataSlice.ts
  utils/
    analyticsEditorial.ts
    telemetryProcessor.ts
```

## Implementation Steps
Each step should be doable in one Builder turn and end with a quick verification run.

Standard QA viewports (use throughout):
- Desktop priority: `1920x1080`, `2560x1440`, `3840x2160`
- Desktop minimum: `1366x768`
- Narrow/responsive: `390x844`

### Step 1: Baseline Measurements (Builder)
Deliverable:
- Add a short note (in PR description or `PLAN.md` comments) capturing current behavior for:
  - Dev splash timing
  - Recording scrollbars/clipping at `1366x768` and `1920x1080`
  - Narrow `390x844` behavior
Verification:
- Run once and document what fails today.

<!--
Baseline notes (captured 2026-02-11):
- Dev splash timing: `electron/main.cjs` shows a dev splash `data:` URL first and only loads the Vite URL once it is reachable (probed). Local dev run (`npm run electron:dev`, 2026-02-11) logged:
  - `app whenReady`: +64ms
  - `window created`: +302ms
  - `splash shown`: +302ms
  - `dev URL loaded`: +5007ms (attempt 1)
- Recording scrollbars/clipping: `src/components/RecordingView.tsx` sets the left Recording panel column to `overflow-y-auto` (scrolls) which violates the "no scrolling in Recording panel" requirement; at 1366x768 this is expected to show scrollbars once the panel content exceeds height.
- Narrow 390x844: Recording uses a 3-column flex layout with min widths ~220 + 280 + 300 (plus gaps/padding), so it will overflow/clamp horizontally at phone-sized widths and is not usable without a compact/stacked layout.
-->

### Step 2: Dev Splash Reliability (Builder)
Files:
- `electron/main.cjs`
Deliverable:
- Ensure splash loads first and dev URL retries until Vite is ready (no "failed to load" flicker).
- Add dev-only timing logs: app ready, window created, splash shown, dev URL loaded.
Verification:
- `npm run electron:dev` shows splash within `<= 2s` and transitions when Vite is ready.

### Step 3: Recording "No Scroll" Layout Architecture (Designer -> Builder)
Files:
- `src/components/RecordingView.tsx`
- `src/components/recording/*` (as needed)
Deliverable:
- Ensure the Recording panel never needs scrolling at `1366x768` and up.
- Implement two recording layouts with that constraint:
  - Standard (1080p+): 3 columns, all primary controls visible; Recording panel does not scroll.
  - Compact (768 height and/or narrow widths): compact density and/or collapsible sections in the Recording panel, but still no Recording panel scroll; content swaps instead of scrolling.
- If anything must scroll in the Recording view, it must be outside the Recording panel.
Verification:
- `1920x1080` and `1366x768`: Recording panel has no scrollbars and no clipped primary controls.
- `390x844`: Compact layout usable.

### Step 4: Smart Capture Header Toggle (Builder)
Files:
- `src/store/slices/createSettingsSlice.ts`
- `src/components/SettingsModal.tsx`
- `src/components/Header.tsx`
Deliverable:
- Add persisted setting `showSmartCaptureInHeader` (default on).
- Add Settings toggle with copy: off hides from header; Recording still has access.
- Wire header CTA visibility to the setting.
Verification:
- Toggle works after "Save & Apply".
- Recording still has a Smart Capture entry point with header toggle off.

### Step 5: De-emphasize In-Recording Smart Capture (Designer -> Builder)
Files:
- `src/components/recording/ActionPanel.tsx`
Deliverable:
- Make in-panel Smart Capture secondary styling or tucked under "More", without removing functionality.
Verification:
- Smart Capture remains usable entirely from Recording.

### Step 6: Analytics Detailed Narrative + Graph Co-Visibility (Designer -> Builder)
Files:
- `src/utils/analyticsEditorial.ts`
- `src/components/analytics/*`
Deliverable:
- Expand narrative into structured, metric-rich sections.
- Keep graphs visible alongside narrative (desktop) and still present when stacked (narrow).
Verification:
- "Detailed Analysis" is not a short blurb; contains multiple sections with numbers; graphs remain visible.

### Step 7: Smart Captures Panel Hierarchy + OCR Action Clustering (Designer -> Builder)
Files:
- `src/components/SmartCapturesPanel.tsx`
- `src/index.css`
Deliverable:
- Cluster OCR actions (single + bulk) into one clear toolbar zone.
- Reduce selection UI noise (show affordance on hover/focus or when selection mode is active).
- Improve primary labeling (avoid arbitrary IDs when possible).
Verification:
- Panel feels less cramped; rows are readable; actions are easy to find.

### Step 8: Provenance + Overrides (Designer -> Builder)
Files:
- `src/components/recording/*`
- `src/components/MatchRecordingPage.tsx`
- `src/components/SmartCapturesPanel.tsx`
Deliverable:
- Standardize a "source badge" and apply to key values so telemetry/OCR/manual and overrides are obvious.
Verification:
- Users can quickly see provenance and when a manual override is in effect.

### Step 9: Regression Pass (Testing Agent/Builder)
Deliverable:
- Run `npm test` and fix failures.
- Run `npm run build` and fix failures.
- Manual smoke at standard QA viewports, focusing on Recording panel no-scroll policy and dev splash.

### Step 10: Documentation Notes (Docs Agent)
Deliverable:
- Update `README.md` or `docs/` with:
  - Smart Capture header toggle behavior
  - Recording Standard vs Compact behavior and the "no scroll in Recording panel" rule
  - Analytics Detailed Analysis behavior
  - Provenance badge meaning
