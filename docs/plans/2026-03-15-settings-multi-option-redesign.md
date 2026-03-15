# Settings Multi-Option Controls Redesign

**Date:** 2026-03-15
**Scope:** Replace multi-option settings buttons with segmented controls and arrow cyclers

## Problem

Multi-option settings (those with 2–4 named choices) are currently rendered as grids of large `Button` components or whole-card toggles. This is inconsistent and doesn't clearly communicate that the user is selecting one value from a set of options.

## Goal

Replace all multi-option (non-boolean) settings with two purpose-built controls:
- **Segmented control** for settings with short option labels (2–4 options, ≤3 words each)
- **Arrow cycler** for settings with longer option labels (phrase-length labels)

Boolean toggle switches are untouched.

## Components

### `SegmentedControl`
**File:** `src/components/settings/SettingControls.tsx`

```
props:
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
```

Renders a row of pill-shaped buttons. Active pill: `bg-md-sys-primary text-md-sys-on-primary`. Inactive: `md3-surface-high opacity-60 hover:opacity-100`.

### `OptionCycler`
**File:** `src/components/settings/SettingControls.tsx`

```
props:
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
```

Renders `‹ [Current Label] ›`. Arrows are small icon buttons. Wraps around (last → first).

### `SettingRow`
**File:** `src/components/settings/SettingControls.tsx`

```
props:
  label: string
  descriptions: Record<string, string>   // keyed by option id
  value: string
  children: React.ReactNode              // SegmentedControl or OptionCycler
```

Layout: label top-left, control top-right, description below (updates to `descriptions[value]`).

---

## Settings Affected

### Segmented control replacements

| Section | Setting | Options |
|---|---|---|
| Appearance | Appearance Mode | Light / Dark / Twilight / System |
| Overlay | Overlay Style | Compact / Full Panel |
| Telemetry & Monitoring | Telemetry Profile | Low-power / Balanced / High-accuracy |
| Advanced OCR Tuning | OCR Review Mode | Conservative / Balanced / Aggressive |

These replace the existing 2×2 or 2×1 `Button` grids.

### Arrow cycler replacements (Capture section)

The capture section's auto-fit grid of large whole-card buttons becomes a vertical list of `SettingRow` entries:

| Setting | Options |
|---|---|
| Capture Mode | Capture Now, OCR Later / Capture Now + Auto OCR |
| Result Button | Prompt Before OCR / Background OCR |
| OCR Rerun | Notify Only / Auto-open Review |
| Smart Capture Button | Single Capture / Auto-sequence |
| Auto-capture Input | Manual Navigation Only / Send Game Keypresses |
| OCR Learning | Disabled / Enabled |

Each row shows: setting label (left), `OptionCycler` (right), description for active option (below).

---

## What Stays the Same

- Boolean toggle switches (Performance Mode, Sound, Session Timer, Tips, etc.)
- Color theme swatches
- All non-appearance, non-capture sections (OCR alias learning, data actions, keybind input, numeric sliders, etc.)

---

## Implementation Order

1. Create `src/components/settings/SettingControls.tsx` with `SegmentedControl`, `OptionCycler`, `SettingRow`
2. Replace Appearance Mode (segmented)
3. Replace Overlay Style (segmented)
4. Replace Capture section cards (cycler)
5. Replace Telemetry Profile (segmented)
6. Replace OCR Review Mode (segmented)
