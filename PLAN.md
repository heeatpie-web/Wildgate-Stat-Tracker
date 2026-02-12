# PLAN

This file is produced by the workflow Planner.

Status: READY

## Project Name & Goal
Wildgate Full UI Overhaul + OCR/Overlay Workflow Reliability

Goal: modernize the UI while preserving the current theme direction, fix broken/high-friction workflows, and make OCR processing/review behavior clear and reliable.

## Locked Requirements (Confirmed)
1. Keep the current style/theme direction.
2. Visual language should be loosely MD3 + Apple with a glassmorphism emphasis.
3. Tutorial control remains visible until tutorial is completed once.
4. Top-bar user editing should be compacted; prefer profile picture entry point that opens profile editing/settings.
5. Combine top status indicators with the data indicator pattern and preserve/improve the light-up behavior.
6. Remove artifact brawl/fleet battle toggle (fleet battle support deferred).
7. Recording page should expose one primary Smart Capture entry point (remove duplicates).
8. Overlay must be interactive (no lock/trap behavior).
9. OCR apply flow routes to Smart Captures review queue.
10. Match outcome is strongly encouraged but not required.
11. OCR state flow target:
    - `Queued` (automatic)
    - `Processing` (automatic)
    - `Reviewing` (manual entry with optional automatic transitions where safe)
    - `Ready to Save` (manual)
    - If app window closes while ready/pending finalization, auto-apply/persist safely.
12. Cloud processing settings currently disabled/greyed out must be fixed.
13. Capture quality indicator should be improved for clarity and usefulness.

## Definition of Done (Acceptance)
1. Header is fully refreshed and visually modern while staying within current theme.
2. Top bar has clearer hierarchy, less clutter, compact profile access, and improved status indicator behavior.
3. Tutorial visibility logic is correct (visible until completed once, then suppressed per preference/state).
4. Fleet battle toggle is removed from UI and dependent logic is stable.
5. Recording page uses one Smart Capture entry point with clear placement and no redundant CTA confusion.
6. Overlay is fully interactive, usable, and no longer blocks app interaction.
7. OCR pipeline shows staged, meaningful progress and explicit state/status messaging.
8. `Apply Data` reliably sends records to Smart Captures review queue.
9. Match outcome encouragement UX is prominent but skippable.
10. Cloud processing settings are enabled/functional when prerequisites are met and clearly explain disabled reasons when not.
11. Capture quality indicator communicates quality/state in a readable way.
12. Smart capture processing/review state survives close/reopen without silent loss.
13. `npm test` and `npm run build` pass.

## Tech Stack Decisions
- Keep: Electron + React 18 + TypeScript + Tailwind + Zustand.
- Use CSS variable token pass in `src/index.css` to enforce consistent styling primitives.
- Keep architecture stable; no framework replacement in this cycle.
- Introduce explicit OCR processing state model in store/UI to avoid ambiguous progress behavior.

## Target Areas
- `src/components/Header.tsx`
- `src/components/WindowFrame.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/RecordingView.tsx`
- `src/components/recording/ActionPanel.tsx`
- `src/components/SmartCapturesPanel.tsx`
- `src/components/ocr/OCRReviewModal.tsx`
- `src/components/OverlayView.tsx`
- `src/components/AnalyticsPanel.tsx`
- `src/components/analytics/*`
- `src/store/slices/createDataSlice.ts`
- `src/store/slices/createUISlice.ts`
- `src/store/slices/createSettingsSlice.ts`
- `src/hooks/useSmartCapture.ts`
- `src/index.css`

## Implementation Steps

## Master Plan (Phased Rollout)
Phase A: Foundation + Global UX Shell
- Step 1 (Baseline), Step 2 (Design tokens), Step 3 (Header rebuild).
- Outcome: visual system and top-level navigation language are stable before deep feature work.

Phase B: Core Workflows
- Step 4 (Recording IA), Step 6 (Smart Captures layout), Step 7 (OCR state machine), Step 8 (Apply-to-queue flow).
- Outcome: primary daily workflows become clear and reliable.

Phase C: Reliability + Interaction Integrity
- Step 9 (Cloud settings fix), Step 10 (Overlay trap fix), Step 11 (Persistence/close handling), Step 12 (Capture quality indicator).
- Outcome: broken/ambiguous behaviors are removed and edge-case safety is improved.

Phase D: Analytics UX Completion
- Step 5 (Analytics simplification), integrated after design tokens and primary workflow cleanup to avoid UI drift.
- Outcome: analytics navigation and graph discovery align with the new UX model.

Phase E: Ship Gate
- Step 13 (Regression/build/test), Step 14 (Documentation/release notes).
- Outcome: release-ready quality gate with updated docs.

Standard QA viewports:
- `1366x768`
- `1920x1080`
- `2560x1440`
- `390x844`

### Step 1: Baseline Capture (Builder)
Deliverable:
- Capture before-state notes/screens for header, recording, analytics, smart captures, overlay, OCR flow, settings cloud options, and capture quality indicator.
Verification:
- Baseline artifact notes saved in PR/worklog.

### Step 2: Design Token + Style Pass (Designer -> Builder)
Deliverable:
- Add/adjust shared styling tokens for glassmorphism, spacing, surface hierarchy, borders, and emphasis while preserving current theme.
Verification:
- Header and one panel visibly reflect token system.

### Step 3: Header Rebuild + Indicator Consolidation (Designer -> Builder)
Deliverable:
- Rework top bar layout, move version number to cleaner location, compact user/profile editing behind avatar entry, remove outdated ring styles.
- Consolidate status indicator logic with data indicator style and preserve light-up behavior.
- Keep tutorial affordance visible until first completion.
- Remove fleet battle toggle from top bar.
Verification:
- Header is balanced and readable at desktop + narrow widths; no clipped controls.

### Step 4: Recording IA Cleanup (Designer -> Builder)
Deliverable:
- Keep only one Smart Capture CTA in Recording flow.
- Improve control sizing and hierarchy for session timer/start mission areas.
- Preserve requested column emphasis behavior from prior plan pass.
Verification:
- Recording flow is clearer; no duplicate Smart Capture confusion.

### Step 5: Analytics UX Simplification (Designer -> Builder)
Deliverable:
- Reduce navigation friction, clarify labels, improve graph discoverability/toggle behavior.
Verification:
- Fewer click steps to reach key graph views.

### Step 6: Smart Captures Layout Overhaul (Designer -> Builder)
Deliverable:
- Rework spacing, hierarchy, action grouping, match label readability, and review queue clarity.
Verification:
- Primary actions and queue states are immediately scannable.

### Step 7: OCR State Machine + Progress Transparency (Builder)
Deliverable:
- Implement explicit staged OCR states (`Queued`, `Processing`, `Reviewing`, `Ready to Save`, `Saved/Error`).
- Update progress UI to reflect real stage transitions and explain current activity.
Verification:
- Pipeline state is understandable and no jumpy ambiguous 75% behavior remains.

### Step 8: Apply-to-Queue + Outcome Nudge (Builder)
Deliverable:
- Route `Apply Data` to Smart Captures review queue.
- Add strong non-blocking outcome prompt before final save.
Verification:
- Applied entries appear in queue every time; outcome prompt is present but skippable.

### Step 9: Cloud Processing Settings Fix (Builder)
Deliverable:
- Resolve disabled/greyed-out cloud options issue.
- Add clear reason messaging when prerequisites are missing.
Verification:
- Cloud options are actionable when configured and informative when unavailable.

### Step 10: Overlay Interaction Fix + Redesign (Builder)
Deliverable:
- Eliminate interaction trap; keep overlay fully interactive.
- Improve overlay control density/sizing and transparency-mode UX.
Verification:
- Overlay can be opened/used/closed repeatedly with no lock-ups.

### Step 11: Persistence + Auto-Apply on Close Rule (Builder)
Deliverable:
- Persist review/processing states safely across app close/reopen.
- Honor approved behavior for close handling around ready-to-save states.
Verification:
- No silent data loss during mid-process close/reopen scenarios.

### Step 12: Capture Quality Indicator Refresh (Builder)
Deliverable:
- Redesign capture quality indicator for clearer confidence/health messaging and actionable feedback.
Verification:
- Users can quickly understand capture quality and needed next action.

### Step 13: Regression + Build/Test Gate (Builder)
Deliverable:
- Run `npm test`.
- Run `npm run build`.
- Fix regressions across touched areas.
Verification:
- Tests and build pass.

### Step 14: Documentation/Release Notes (Docs Agent)
Deliverable:
- Update docs for header changes, tutorial behavior, overlay interaction, OCR stage meanings, apply/review flow, cloud settings behavior, and removed fleet toggle.

## Risks & Mitigations
1. Risk: Wide UI touch surface introduces regressions.
   Mitigation: Stepwise delivery + viewport checks each step + dedicated regression gate.
2. Risk: OCR stage UI diverges from true backend state.
   Mitigation: Single canonical store state machine used by all OCR UI.
3. Risk: Close-time auto behavior causes unintended saves.
   Mitigation: constrain auto-apply to approved states and log transition outcomes.

## Handoff
Plan is ready for approval and handoff to `@builder`.
