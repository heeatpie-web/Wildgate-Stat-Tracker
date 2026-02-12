# UI Consistency Audit

Audit of 48 component files across the app. Findings organized by severity.

---

## 1. CRITICAL: Border Radius Chaos (6+ different scales)

The single biggest visual inconsistency. The same semantic element (e.g. "modal") uses different radii across components:

### Modals
| Component | Radius | Pixels |
|-----------|--------|--------|
| SettingsModal | `rounded-3xl` | 24px |
| EditMatchModal | `rounded-[32px]` | 32px |
| OCRReviewModal | `rounded-3xl` | 24px |
| Wizard (overlay) | `rounded-2xl` | 16px |
| Wizard (full) | `rounded-[32px]` | 32px |

### Cards / Sections
| Component | Radius |
|-----------|--------|
| AnalyticsCard | `rounded-2xl` |
| AnalyticsShell header | `rounded-2xl` |
| SmartCapturesPanel sections | `rounded-xl` |
| HistoryTable wrapper | `rounded-xl` |
| SettingsModal sections | `rounded-2xl` |
| `.md-card` CSS class | `12px` (≈ rounded-xl) |

### Buttons
| Context | Radius |
|---------|--------|
| Sidebar nav | `rounded-lg` |
| Header mode toggle | `rounded-md` inside `rounded-lg` |
| Win/Loss/Draw | `rounded-lg` |
| Smart Capture big btn | `rounded-2xl` |
| Filter pills | `rounded-full` |
| Analytics time range | `rounded-lg` inside `rounded-xl` |
| Close buttons | `rounded-full` / `rounded-xl` / `rounded-lg` (varies) |

### Recommended Scale
- **Modals/dialogs**: `rounded-2xl` (16px)
- **Cards/sections**: `rounded-xl` (12px)
- **Buttons/inputs**: `rounded-lg` (8px)
- **Pills/badges/tags**: `rounded-full`
- **Thumbnails/media**: `rounded-lg` (8px)

---

## 2. CRITICAL: Hardcoded Colors Break Light Mode

Dozens of `text-white/*` and `bg-white/*` values assume dark backgrounds. These will be invisible or ugly in light mode.

### Offenders (most common)
- `text-white/40`, `text-white/50`, `text-white/60`, `text-white/70` — used as muted text across SmartCapturesPanel, ActionPanel, HistoryTable, analytics views
- `bg-white/5`, `bg-white/10` — used for hover states and subtle backgrounds
- `border-white/5`, `border-white/10` — used for dividers
- `bg-black/80`, `bg-black/90` — used for overlay backdrops (acceptable)

### Fix
Replace with design tokens:
- `text-white/40` → `text-md-sys-on-surface/40` or `opacity-40`
- `bg-white/5` → `bg-md-sys-surface3` or `bg-md-sys-on-surface/5`
- `border-white/5` → `border-md-sys-outline/10`

---

## 3. HIGH: Font Size Anarchy

406 instances of `text-[Npx]` arbitrary values across 42 files. The app uses 7+ different "small label" sizes:

| Used as | Actual values seen |
|---------|-------------------|
| Micro labels | `text-[8px]`, `text-[9px]` |
| Small labels | `text-[10px]`, `text-[11px]` |
| Body text | `text-xs` (12px), `text-sm` (14px) |
| Titles | `text-lg` (18px), `text-xl` (20px) |

### The problem
`text-[9px]` and `text-[10px]` are used interchangeably for the same semantic purpose (sub-labels, timestamps, badges). `text-[11px]` appears in Header mode toggle but nowhere else.

### CSS utilities exist but are unused
`index.css` defines `.text-title` (16px), `.text-body` (13px), `.text-label` (11px), `.text-caption` (10px) — but they're almost never referenced in components.

### Recommended Scale
- **Micro** (badges, decorative): `text-[9px]` → consolidate to one size
- **Caption** (labels, metadata): `text-[10px]` or `text-xs` — pick one
- **Body**: `text-sm` (14px)
- **Subheading**: `text-base` (16px)
- **Heading**: `text-lg` (18px)

---

## 4. HIGH: Font Weight Inconsistency

Section headers and labels randomly alternate between `font-bold` (700), `font-black` (900), and `font-semibold` (600):

| Semantic role | Weights used |
|--------------|-------------|
| Modal titles | `font-bold` (Settings), `font-black` (EditMatch) |
| Section headers | `font-bold` (Settings, OCRReview), `font-black` (HistoryTable) |
| Sub-labels | `font-bold`, `font-semibold`, `font-black` — all three |
| Button text | `font-bold`, `font-black`, `font-medium` |

### Recommended
- **Headings**: `font-bold`
- **Labels/badges**: `font-bold`
- **Body text**: `font-medium`
- **Reserve `font-black`** for: large display numbers, result badges (Win/Loss), hero elements only

---

## 5. MEDIUM: Inconsistent Spacing & Padding

### Modal padding
- SettingsModal: `p-6`
- EditMatchModal: `p-8`
- OCRReviewModal: `p-4`

### Section internal padding
- SettingsModal sections: `p-4`
- SmartCapturesPanel sections: `p-3`
- AnalyticsCard: `p-6` (editorial) / `p-3` (dense)

### Recommended
- **Modal outer padding**: `p-5` consistently
- **Section padding**: `p-4` consistently
- **Compact sections**: `p-3`

---

## 6. MEDIUM: Opacity Levels for Text Hierarchy

Muted text uses at least 6 different opacity levels: `opacity-30`, `opacity-40`, `opacity-50`, `opacity-60`, `opacity-70`, `opacity-80`. No clear hierarchy.

### Recommended (3-tier)
- **Primary text**: `opacity-100` (default)
- **Secondary text**: `opacity-60`
- **Muted/decorative**: `opacity-40`

---

## 7. LOW: Button Hover/Active States

Three different hover patterns used inconsistently:
1. `hover:brightness-110` — used on colored buttons
2. `hover:bg-X/Y` — used on surface buttons
3. `hover:scale-[1.01]` — used on analytics cards

### Recommended
- **Colored buttons**: `hover:brightness-110 active:scale-[0.98]`
- **Surface buttons**: `hover:bg-md-sys-surface3`
- **Cards**: `hover:border-md-sys-primary/20` (no scale — feels janky)

---

## 8. LOW: Close Button Inconsistency

| Component | Close button style |
|-----------|-------------------|
| SettingsModal | `w-10 h-10 rounded-xl` |
| EditMatchModal | `p-2 rounded-full` |
| OCRReviewModal | `p-2 rounded-xl` |
| Toast | `p-1 rounded-full` |

### Recommended
All modals: `p-2 hover:bg-md-sys-surface2 rounded-lg transition-colors` with `<X size={18} />`

---

## 9. CRITICAL: Surface System Confusion (`mg-*` vs `md3-*`)

Two surface systems are used interchangeably within the same components without clear rules:

- `mg-surface*` (glassmorphic, 57 occurrences across 13 files)
- `md3-surface*` (solid MD3, 108 occurrences across 24 files)
- `md3-card` (99 occurrences across 30 files)

### Rule (now codified in UI_MASTERPLAN.md)
- `mg-surface*` = glassmorphic panels (recording, overlays, wizard, cockpit)
- `md3-surface*` = solid containers (forms, settings, modals, lists)
- `md3-card` = discrete content cards (analytics, players, drill-downs)
- `md3-card` + `mg-surface*` = intentional glass card (allowed combo)
- Never mix `mg-surface*` and `md3-surface*` on the same element.

---

## Action Plan (Prioritized)

### Phase 1: Define design tokens (tailwind config) -- DONE
Added to `tailwind.config.js`:
```js
borderRadius: {
  modal: 'var(--md-sys-shape-corner-large)',    // 16px
  card: 'var(--md-sys-shape-corner-medium)',     // 12px
  control: 'var(--md-sys-shape-corner-small)',   // 8px
  pill: 'var(--md-sys-shape-corner-full)',       // 9999px
}
```
Also added: semantic status colors, opacity hierarchy utilities, border-status utilities.

### Phase 2: Surface system clarification -- DONE
Rules codified in `docs/agents/UI_MASTERPLAN.md` section 3.

### Phase 3: Normalize border radii across modals + cards
Single pass through all modal/card containers using `rounded-modal`, `rounded-card`, `rounded-control`.

### Phase 4: Fix light-mode-breaking colors
Replace `text-white/*` with `text-md-sys-on-surface/*` or opacity utilities.
Replace hardcoded Tailwind colors with semantic utilities (`text-danger`, `bg-success-soft`, etc.).

### Phase 5: Consolidate font sizes
Eliminate `text-[8px]`, `text-[11px]`; standardize on `text-[9px]`, `text-[10px]`, `text-xs`, `text-sm`.

### Phase 6: Normalize font weights + opacity hierarchy
Establish 3-tier weight and opacity scales.
