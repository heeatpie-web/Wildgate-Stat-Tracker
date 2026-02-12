# 02 Execution Log

## Changes
- Date (UTC):
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`):
- Files changed:
  - `path/to/file`
- Why changed:
- What changed:
- Risk/regression notes:

## Change Entry
- Date (UTC): 2026-02-12T17:33:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): lead
- Files changed:
  - `docs/agents/DECISIONS.md`
  - `docs/agents/00_INTAKE.md`
  - `docs/agents/01_PLAN.md`
- Why changed:
  - Establish governance boundaries and instantiate task lanes.
- What changed:
  - Added owner model decisions.
  - Filled intake with explicit in-scope/out-of-scope and acceptance criteria.
  - Added multi-lane declaration with disjoint file ownership.
- Risk/regression notes:
  - Low risk; documentation-only changes.

## Change Entry
- Date (UTC): 2026-02-12T17:38:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): agent-a
- Files changed:
  - `docs/WORKLOCKS.md`
  - `docs/agents/BLOCKERS.md`
- Why changed:
  - Standardize lock lifecycle and escalation for stale/conflicting locks.
- What changed:
  - Added lock claim/release instructions.
  - Added copy-paste lock and blocker templates.
  - Added recent lock history table for auditability.
- Risk/regression notes:
  - Low risk; no product behavior change.

## Change Entry
- Date (UTC): 2026-02-12T17:46:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): agent-b
- Files changed:
  - `docs/agents/02_EXECUTION_LOG.md`
  - `docs/agents/03_VALIDATION.md`
- Why changed:
  - Ensure every workstream has consistent evidence format.
- What changed:
  - Added structured entry templates for execution and validation.
  - Added integration validation responsibility section for lead.
- Risk/regression notes:
  - Low risk; documentation-only.

## Change Entry — UI Consistency Remediation (8 Phases)
- Date (UTC): 2026-02-12T18:06:00Z
- Owner: ui-designer
- Task: UI Consistency Remediation across 8 phases
- Baseline: Git tag `ui-audit-baseline`, visual baselines for all 5 views

### Phase 1: Design Token Infrastructure
- Files changed: `tailwind.config.js`, `src/index.css`
- What changed: Added `borderRadius` tokens (modal/card/control/pill), `status` color aliases, opacity hierarchy utilities (primary/secondary/muted/disabled), border-status utilities.
- Risk: None — additive only.

### Phase 2: Surface System Documentation
- Files changed: `docs/agents/UI_MASTERPLAN.md`, `docs/UI_AUDIT.md`
- What changed: Codified mg-surface vs md3-surface usage rules, added border radius scale table, opacity hierarchy table, status color mapping table.
- Risk: None — documentation only.

### Phase 3: Border Radius Normalization
- Files changed (~15): `SettingsModal.tsx`, `EditMatchModal.tsx`, `RenameModal.tsx`, `OcrCorrectionModal.tsx`, `ReviewQueueModal.tsx`, `OCRReviewModal.tsx`, `AnalyticsCard.tsx`, `HistoryTable.tsx`, `SmartCapturesPanel.tsx`, `WindowFrame.tsx`, `ActionPanel.tsx`, `RosterPanel.tsx`, `MissionPanel.tsx`
- What changed: Collapsed 6+ radius scales to 4 semantic tokens (rounded-modal/card/control/pill). ~100 replacements.
- Visual diff: 0.01%-0.06% across affected views.
- Risk: Medium — visual change but sub-pixel level.

### Phase 4: Hardcoded Color Replacement
- Files changed (~15): `HistoryTable.tsx`, `MatchRecordingPage.tsx`, `RosterPanel.tsx`, `OCRReviewModal.tsx`, `PlayerHub.tsx`, `DevOCRPanel.tsx`, `SettingsModal.tsx`, `SmartCapturesPanel.tsx`, `OverlayView.tsx`, `Toast.tsx`, `WindowFrame.tsx`, `OcrCorrectionModal.tsx`, `EditMatchModal.tsx`, `SessionTimer.tsx`, plus analytics and remaining files.
- What changed: ~200+ replacements of `text-white/*`, `bg-white/*`, `border-white/*`, Tailwind named colors (`text-red-400`, `bg-green-500/20`, etc.) with design tokens (`text-danger`, `bg-success-soft`, `text-md-sys-on-surface`, etc.).
- CSS output reduced by ~5KB (eliminated unused Tailwind color classes).
- Visual diff: 0.02%-0.19% across views.
- Risk: High blast radius but token values match original colors in dark mode.

### Phase 5: Font Weight Normalization
- Files changed (~16): `AnalyticsDashboard.tsx`, `PlayerHub.tsx`, `AnalyticsShell.tsx`, `SmartCapturesPanel.tsx`, `HistoryTable.tsx`, `ActionPanel.tsx`, `WindowFrame.tsx`, `ErrorBoundary.tsx`, `Header.tsx`, `EditMatchModal.tsx`, `RenameModal.tsx`, `SessionTimer.tsx`, `TiltMeter.tsx`, `AnalyticsCockpit.tsx`, `SessionSummaryView.tsx`, `MomentumView.tsx`, `Wizard.tsx`
- What changed: ~170 replacements. `font-black` → `font-bold` for headings/buttons. `font-extrabold` eliminated (13 instances → `font-bold`). `font-bold` → `font-semibold` for metadata/sub-labels. `font-black` preserved only on text-2xl+ display numbers.
- Visual diff: 0.08%-0.30% across views.
- Risk: Medium — visually noticeable but consistent reduction.

### Phase 6: Opacity Hierarchy Collapse
- Files changed (~20): All major component files.
- What changed: Collapsed 20+ opacity levels to 3-tier system (primary/secondary/muted). `opacity-70/75/80` → `opacity-60`. `opacity-30` → `opacity-40`. `opacity-85/90/92/95` → removed. `disabled:opacity-40/50` → `disabled:opacity-disabled`. Slash syntax normalized similarly.
- Visual diff: 0.14%-0.33% across views.
- Risk: Low — subtle contrast adjustments.

### Phase 7: Modal Structure Standardization
- Files changed (6): `SettingsModal.tsx`, `EditMatchModal.tsx`, `RenameModal.tsx`, `OcrCorrectionModal.tsx`, `ReviewQueueModal.tsx`, `OCRReviewModal.tsx`
- What changed: Normalized container radius to `rounded-modal`, content padding to `p-5`, titles to `text-title font-bold`, close buttons to `md3-icon-btn` with `X size={18}`. Added close button to ReviewQueueModal.
- Risk: Medium — modal layout shifts but consistent pattern.

### Phase 8: Hover/Active State Unification
- Files changed (6): `ActionPanel.tsx`, `Header.tsx`, `InsightsView.tsx`, `RosterPanel.tsx`, `AnalyticsCard.tsx`, `HistoryTable.tsx`
- What changed: Standardized to 3 patterns — filled buttons get `hover:brightness-110 active:scale-[0.98]`, surface buttons get `hover:bg-md-sys-on-surface/5`, cards get `hover:border-md-sys-primary/20` (removed scale transforms). Normalized disabled states with `disabled:pointer-events-none`.
- Risk: Low — interaction states only, no layout impact.

### Final Validation
- Build: `tsc && vite build` passes (0 errors, 0 warnings)
- CSS output: 86.85KB (down from 93.35KB baseline — 7% reduction)
- Visual snapshots: All 5 views < 0.35% mismatch from baseline
- No new scroll traps, clipped controls, or accessibility regressions introduced

## Change Entry — Role Bind
- Date (UTC): 2026-02-12T21:10:00Z
- Owner: ui-designer
- Statement: "Role bind confirmed for OCR lane B."
- Files changed:
  - `docs/agents/02_EXECUTION_LOG.md` (this entry)
  - `docs/WORKLOCKS.md` (lock claims)
  - `docs/agents/01_PLAN.md` (lane B status update)
  - `docs/agents/BLOCKERS.md` (blocker resolution)
- Why changed: Bind ui-designer role to OCR stabilization cycle, unblock lane B.
- Risk/regression notes: None — coordination-only.

## Implementation Notes
- Keep entries chronological and append-only.
- If it is edited, it is logged.
- Do not modify or delete previous entries; add corrective follow-up entries instead.
- Legacy entries may contain earlier owner labels; new entries must use role-based owners.

## Open Follow-ups
- None.

## Change Entry
- Date (UTC): 2026-02-12T22:25:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): project-manager
- Files changed:
  - `docs/agents/01_PLAN.md`
- Why changed:
  - User requested PM approval of `ui-designer` for the next phase.
- What changed:
  - Added explicit PM approval block with next-phase scope boundaries for lane B.
- Risk/regression notes:
  - Documentation-only; no product behavior changes.

## Change Entry
- Date (UTC): 2026-02-12T22:40:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): project-manager
- Files changed:
  - `docs/agents/01_PLAN.md`
  - `docs/agents/00_INTAKE.md`
- Why changed:
  - User requested a concrete structure-hardening sprint plan and queue entry.
- What changed:
  - Added queued task "Structure Hardening Sprint (3 Phases)" with scope, delegation, gates, commands, acceptance criteria, and rollback.
  - Added intake addendum to keep activation explicit and prevent accidental scope shifts.
- Risk/regression notes:
  - Documentation-only; no runtime behavior changes.

## Change Entry
- Date (UTC): 2026-02-12T22:50:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): project-manager
- Files changed:
  - `docs/agents/01_PLAN.md`
- Why changed:
  - User requested role prompts be prepared and queued, not started immediately.
- What changed:
  - Added copy-paste queued prompts for `project-manager`, `builder`, `debugger`, and optional `verifier` under the Structure Hardening queued task.
  - Marked all prompts as queued-only with explicit "do not execute yet" constraints.
- Risk/regression notes:
  - Documentation-only.

## Change Entry
- Date (UTC): 2026-02-12T23:00:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): project-manager
- Files changed:
  - `docs/agents/01_PLAN.md`
- Why changed:
  - User requested adding dev startup splash retry/status noise fix to queued work.
- What changed:
  - Added queued task "Dev Splash Retry Noise Reduction" with scope, implementation notes, and acceptance criteria.
  - Marked as queued-only (no immediate start).
- Risk/regression notes:
  - Documentation-only.

## Copy-Paste Entry Template

```md
## Change Entry — Lane B: OCR UX Error Copy Standardization
- Date (UTC): 2026-02-13T00:15:00Z
- Owner: ui-designer
- Task: `ocr-stabilization-cycle-01` / Lane B
- Files changed:
  - `src/components/DevOCRPanel.tsx`
  - `src/components/ocr/OCRReviewModal.tsx`
  - `src/components/OcrCorrectionModal.tsx`
- Why changed:
  - Raw backend error strings ("Path not allowed", "IPC invoke blocked", "IPC not available", etc.) were surfaced verbatim to users. Security/validation rejection copy was inconsistent and leaked implementation details.
- What changed:
  - **DevOCRPanel.tsx**: Added `friendlyError()` helper that translates 8 known security/validation error patterns into user-safe copy with actionable guidance. Applied to all 15 error surfaces (OCR Lab, Utils tab, Corpus tab). Fallback strips raw file paths and channel names.
  - **OCRReviewModal.tsx**: Added "No Data Extracted" banner when all data sections (teammates, opponents, modifiers, ship) are empty. Improved low-confidence banner copy with actionable advice ("retake capture with better lighting or zoom").
  - **OcrCorrectionModal.tsx**: Improved empty-state copy with actionable guidance ("Capture a Crew Hub or Tactical Map screenshot first"). Improved autocomplete empty-state ("No matching pilots found. Use '+ New' to add this name."). Added all-reviewed hint so users know when they can safely apply.
- Risk/regression notes:
  - UI copy only — no logic, state, or layout changes.
  - `npm run build` passes cleanly.
  - No new dependencies.

```

## Change Entry
- Date (UTC): 2026-02-12T19:41:36Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): builder
- Files changed:
  - `electron/crewHubExtractor.cjs`
- Why changed:
  - Execute Bug 2 (Crew Hub panel boundary correction) and validate with corpus runtime outputs.
- What changed:
  - Tightened left panel bound (`xMax: 0.36`) and expanded right panel bound (`xMin: 0.45`) to reduce seam leakage between teammate/enemy columns.
  - Added teammate-line X-center guard in left-panel player parsing to reject cross-panel lines.
  - Relaxed right-panel opponent-name validation for extraction (`isValidOpponentName`) while preserving UI-noise filtering.
  - Changed overflow handling when more than 4 enemy teams are detected: preserve overflow player names by merging into top-4 buckets instead of dropping them.
- Risk/regression notes:
  - Medium-low risk; Crew Hub extraction-only changes, no OCR engine changes.
  - Corpus eval indicates no metric regression, but recall improvement for Bug 2 was not observed in this phase.
