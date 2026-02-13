# UI Masterplan

Purpose: give all agents one stable design contract for UI and interface work.

## 1) North Star
- Build for clarity under pressure: fast scan, low ambiguity, obvious next action.
- Keep current visual direction: MD3-informed + Apple-like polish + controlled glassmorphism.
- Prefer consistent patterns over one-off styling.

## 2) Core Product UX Priorities
1. Recording flow is primary and must remain friction-light.
2. Smart Capture/OCR status must be explicit and trustworthy.
3. Top bar and navigation must reduce clutter and improve orientation.
4. Analytics must remain readable before decorative complexity.
5. Overlay interactions must never trap or block input.

## 3) Design System Contract

### Tokens First
- Use existing CSS variables in `src/index.css` as source of truth.
- Do not hardcode `white/*`, `black/*`, or random hex values in component classes unless justified.
- Prefer:
  - `--md-sys-color-*` for color
  - `--md-sys-shape-*` for radius
  - `--md-motion-*` for transitions
  - `--md-sys-typescale-*` for typography

### Approved Surface Patterns

| Class | Purpose | When to use |
|---|---|---|
| `md3-surface` / `-high` / `-low` | Solid opaque containers | Forms, settings, modals, list views, standard panels |
| `mg-surface` / `-high` / `-low` | Glassmorphic translucent panels | Recording panels, overlays, wizard, cockpit shells -- where layering depth is useful |
| `md3-card` | Discrete content cards with elevation | Analytics views, player cards, drill-downs, any standalone content block |
| `md3-card` + `mg-surface*` | Glass card (intentional combo) | Elevated content that needs depth cue; CSS already handles border override |

- Do **not** mix `mg-surface*` and `md3-surface*` on the same element -- pick one system.
- Do **not** stack multiple competing backgrounds on the same element.
- `md3-card` may be combined with `mg-surface*` when glass depth is intentional.

### Semantic Border Radius Scale

| Token (Tailwind) | CSS var | Pixels | Use for |
|---|---|---|---|
| `rounded-modal` | `--md-sys-shape-corner-large` | 16px | Modals, dialogs, full overlays |
| `rounded-card` | `--md-sys-shape-corner-medium` | 12px | Cards, sections, panels |
| `rounded-control` | `--md-sys-shape-corner-small` | 8px | Buttons, inputs, chips |
| `rounded-pill` | `--md-sys-shape-corner-full` | 9999px | Badges, pills, tags |

### Semantic Opacity Hierarchy

| Utility class | Value | Use for |
|---|---|---|
| (default) | 1.0 | Primary text, active elements |
| `opacity-secondary` | 0.60 | Secondary text, supporting labels |
| `opacity-muted` | 0.40 | Muted text, decorative, placeholder |
| `opacity-disabled` | 0.38 | Disabled controls (MD3 standard) |

### Semantic Status Colors

Use CSS utility classes instead of hardcoded Tailwind colors:

| Instead of | Use |
|---|---|
| `text-red-400/500` | `text-danger` |
| `text-green-400/500`, `text-emerald-400` | `text-success` |
| `text-amber-400/500`, `text-yellow-*` | `text-warning` |
| `text-blue-300/400`, `text-sky-400` | `text-info` |
| `text-purple-*` | `text-accent` |
| `bg-red-500/20` | `bg-danger-soft` |
| `bg-green-500/20` | `bg-success-soft` |
| `bg-blue-500/20` | `bg-info-soft` |
| `bg-amber-500/20` | `bg-warning-soft` |
| `bg-purple-500/30` | `bg-accent-soft` |

### Component Priority
- Reuse established utility classes/components before creating new visual variants.
- New variant allowed only if used in 2+ places or required by a distinct state.

## 4) Layout and Information Architecture

### Global Structure
- Header: concise status + single primary contextual action.
- Navigation rail/sidebar: stable location, consistent icon+label behavior.
- Main content: one primary task area, optional secondary panel.

### Density Rules
- Default to medium density.
- Small-height fallback (`< 800px`): switch to tabs/segmented sections instead of nested scroll regions.
- Never create dual vertical scroll traps in the same pane unless explicitly required.

### Responsive Targets
- Required QA sizes:
  - `1366x768`
  - `1920x1080`
  - `2560x1440`
  - `390x844`
- Critical actions must remain visible without overlap at all targets.

## 5) Interaction Standards

### Action Hierarchy
- One primary action per view context.
- Secondary actions grouped visually (tonal/text/icon).
- Destructive actions need confirm affordance.

### Status and Feedback
- Async workflows must show stage labels, not only spinners/percentages.
- Empty states must include:
  - what happened
  - why it matters
  - next action

### Motion
- Use short, purposeful transitions.
- Avoid decorative animation that competes with task feedback.
- Keep transitions consistent with `--md-motion-duration-*`.

## 6) Accessibility and Readability
- Maintain strong text/background contrast across modes.
- Focus states must be visible on keyboard navigation.
- Icon-only controls require accessible labels/tooltips.
- Avoid color-only meaning; pair with text/icon when state matters.

## 7) Content and Copy Rules
- Use plain language and operational wording.
- Keep labels short and specific (`Run Smart Capture`, `Apply to Queue`).
- Progress/state text should use verb + object (`Processing OCR`, `Ready to Save`).

## 8) Agent Workflow for UI Changes
1. Intake
- Define affected views, user problem, acceptance criteria.

2. Plan
- Break into atomic UI steps: structure, styling, behavior, validation.

3. Implement
- Update layout first, then visual polish, then interaction states.
- Keep diffs scoped to targeted files.

4. Validate
- Functional checks first.
- Visual checks at required viewport sizes.
- Regression check for shared components.

5. Handoff
- Include before/after summary, touched components, and known tradeoffs.

## 9) PR/UI Change Gate (Must Pass)
- Uses design tokens (no ad hoc palette drift).
- Preserves single-primary-action rule per view.
- No new scroll traps or clipped controls at required sizes.
- States are explicit for loading/empty/error/success.
- Keyboard/focus behavior remains usable.

## 10) Canonical References
- `src/index.css` (tokens, surfaces, motion, typography)
- `src/components/Header.tsx` (top bar patterns)
- `src/components/RecordingView.tsx` (primary workflow layout)
- `src/components/SmartCapturesPanel.tsx` (queue/review patterns)
- `docs/UI_AUDIT.md` (known anti-patterns and cleanup direction)


## UI Acceptance Guardrails v2 (AOM_V2)

### Classification
- `Copy-only`: text and labels only, no layout/style/interaction changes.
- `Visual-impact`: any spacing, hierarchy, style, component, or interaction change.

### Required Evidence
For copy-only:
- Screenshot/snapshot proof at one desktop and one mobile breakpoint.
- Confirm no clipping/regression in touched view.

For visual-impact:
- Before/after evidence at 1366x768 and 390x844 minimum.
- State coverage: loading, empty, error, disabled, success.
- Keyboard focus traversal verified.

### Acceptance Thresholds
- No control clipping or overlap.
- Primary action remains visually dominant.
- Any unresolved UI defect must be listed in handoff as deferred risk.

