## Wildgate Stat Tracker — design system conventions

This is the component library from the **Wildgate Stat Tracker** Electron
app (a game stat tracker for Artifact Brawl / Fleet Battle). It is a
Tailwind CSS v3 app, not a standalone component package — read `styles.css`
and its import closure (`_ds_bundle.css`) before styling anything; the
class vocabulary below is the real one shipped by this app, not a
convention invented for this sync.

### Wrapping and setup

No provider wrapper is required. Components either take plain props, or
read a Zustand store hook (`useAppStore`) that works standalone with no
`<Provider>` — Zustand is a plain hook backed by a module-level store, not
React context. Don't wrap examples in anything; compose components
directly as shown in each `.prompt.md`.

### The styling idiom: Tailwind utilities + Material-3-shaped tokens

All colors and shapes route through CSS custom properties via Tailwind's
`theme.extend`, never hardcoded hex/px in component markup:

- **Color** — `bg-md-sys-<role>` / `text-md-sys-<role>` map to
  `var(--md-sys-color-<role>)`. Common roles: `primary`,
  `primaryContainer`, `onPrimaryContainer`, `surface`, `surface-container`,
  `surface-container-high`, `surface-container-highest`, `onSurface` (used
  heavily as `text-md-sys-on-surface/70` — Tailwind opacity modifiers on
  the CSS-var color are idiomatic here), `outline`, `outlineVariant`,
  `error`. Status/semantic colors are separate: `bg-success`, `bg-warning`,
  `bg-danger` (→ `var(--color-success/warning/danger)`).
- **Radius** — never bare `rounded-lg`; use the shape-role scale:
  `rounded-modal` (dialogs), `rounded-card` (cards/panels),
  `rounded-control` (inputs/buttons), `rounded-pill` (fully round).
- **Type scale** — `text-label-xs` / `text-label-sm` (uppercase eyebrow
  labels, bold, wide tracking) / `text-body` / `text-title`. Labels are
  almost always paired with
  `uppercase tracking-wide-22 font-black text-md-sys-on-surface/65`.
- **Surfaces** — prebuilt classes for elevated containers:
  `md3-surface`, `md3-surface-high` (a card/panel body),
  `mg-surface-high` (glass-variant card, used by `AnalyticsCard`). Prefer
  these over ad-hoc `bg-*` + `border` combinations for panel-shaped UI.
- **Prebuilt Material-3 component classes** ship in `_ds_bundle.css`
  already — reach for them before inventing new markup:
  `md3-btn-filled` / `md3-btn-outlined` / `md3-btn-text` / `md3-btn-tonal`,
  `md3-card` / `md3-card--interactive`, `md3-chip` (+ `--outlined` /
  `--selected`), `md3-dialog` (+ `--fullscreen`), `md3-banner`
  (+ `--error` / `--warn` / `--info`).
- **Component-scoped prefixes** — some newer primitives ship their own
  BEM-ish classes rather than raw utilities: `wg-btn`/`wg-btn--<variant>`
  (`Button`), `wg-input`/`wg-input-wrap` (`Input`), `sc-*` (smart-captures
  widgets, e.g. `sc-stat-card`, `sc-stat-card--<accent>`). Follow the same
  prefix when composing with these components rather than overriding with
  generic utilities.
- **Dark mode**: class-based (`darkMode: ['class', ...]`), driven by the
  `--md-sys-color-*` custom properties flipping value — never conditional
  Tailwind `dark:` variants in this codebase.

### Where the truth lives

Read `styles.css` (imports `_ds_bundle.css`, the full compiled Tailwind
output) before styling — it has the complete, real class list and every
`--md-sys-*` / `--color-*` custom property definition. Per-component API
and usage is in each `<Name>.prompt.md`.

### Example — idiomatic composition

```tsx
import { Button } from 'wildgate-stat-tracker';

<div className="md3-surface-high rounded-card p-4 space-y-3">
  <span className="text-label-sm font-black uppercase tracking-wide-22 text-md-sys-on-surface/65">
    Match Summary
  </span>
  <p className="text-body text-md-sys-on-surface">7 kills · 1st place</p>
  <Button variant="primary">Save Match</Button>
</div>
```
