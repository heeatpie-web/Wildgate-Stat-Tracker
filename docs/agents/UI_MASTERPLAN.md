# UI Masterplan v3.0
**Comprehensive Design System & Implementation Guide for Wildgate Stat Tracker**

Last Updated: 2026-02-14
Status: Active / Single Source of Truth

---

## Document Purpose

This is the **single source of truth** for all UI/UX work on the Wildgate Stat Tracker. It combines:
- Design system contract (tokens, surfaces, patterns)
- View-by-view specifications (layouts, interactions, states)
- Component library (buttons, inputs, cards, badges)
- Animation & motion guidelines
- Implementation roadmap & QA criteria

All agents (AI and human) must consult this document before making UI changes.

---

# Part I: Foundation & Design System

## 1) North Star

**Build for clarity under pressure.** Gaming analytics are consulted between matches or during brief breaks. Every interface element must support:
- **Fast scanning** - Information hierarchy is obvious at a glance
- **Low ambiguity** - States, actions, and outcomes are explicit
- **Obvious next action** - Primary action is always visually dominant

**Visual Direction:**
- MD3-informed foundation (Material Design 3 tokens and patterns)
- Apple-like polish (attention to micro-interactions and detail)
- Controlled glassmorphism (strategic use of depth and translucency)

**Consistency over creativity.** Prefer established patterns over one-off styling. Users build mental models through repetition.

---

## 2) Core Product UX Priorities

1. **Recording flow is primary** and must remain friction-light
2. **Smart Capture/OCR status** must be explicit and trustworthy
3. **Top bar and navigation** must reduce clutter and improve orientation
4. **Analytics** must remain readable before decorative complexity
5. **Overlay interactions** must never trap or block input

---

## 3) Design System Contract

### 3.1) Tokens First

**CSS variables in `src/index.css` are the source of truth.**

Do not hardcode `white/*`, `black/*`, or random hex values in component classes unless explicitly justified and logged in `docs/agents/DECISIONS.md`.

#### Color Tokens
Use semantic color tokens:
- `--md-sys-color-primary` - Primary brand color, CTA buttons
- `--md-sys-color-secondary` - Secondary actions, accents
- `--md-sys-color-tertiary` - Tertiary elements
- `--md-sys-color-surface` - Base surface backgrounds
- `--md-sys-color-surface-variant` - Elevated surfaces
- `--md-sys-color-on-surface` - Text on surfaces
- `--md-sys-color-on-surface-variant` - Secondary text on surfaces
- `--md-sys-color-outline` - Borders, dividers
- `--md-sys-color-outline-variant` - Subtle borders

Semantic status colors (see section 3.4 for utility classes):
- `--md-sys-color-success` - Success states (#4CAF50)
- `--md-sys-color-danger` - Error/destructive states (#F44336)
- `--md-sys-color-warning` - Warning states (#FF9800)
- `--md-sys-color-info` - Informational states (#2196F3)
- `--md-sys-color-accent` - Special highlights (#9C27B0)

#### Shape Tokens
- `--md-sys-shape-corner-small` - 8px - Buttons, inputs, chips
- `--md-sys-shape-corner-medium` - 12px - Cards, sections, panels
- `--md-sys-shape-corner-large` - 16px - Modals, dialogs
- `--md-sys-shape-corner-full` - 9999px - Pills, badges

#### Motion Tokens
Duration:
- `--md-motion-duration-short1` - 50ms - Icon rotations, micro-feedback
- `--md-motion-duration-short2` - 100ms - Button press, checkbox
- `--md-motion-duration-short3` - 150ms - Hover states
- `--md-motion-duration-medium1` - 200ms - Card lifts, overlays
- `--md-motion-duration-medium2` - 250ms - Accordion expand
- `--md-motion-duration-long1` - 300ms - Panel slides, modals
- `--md-motion-duration-long2` - 400ms - Complex animations

Easing:
- `--md-motion-easing-standard` - cubic-bezier(0.4, 0.0, 0.2, 1) - Default
- `--md-motion-easing-decelerate` - cubic-bezier(0.0, 0.0, 0.2, 1) - Enter
- `--md-motion-easing-accelerate` - cubic-bezier(0.4, 0.0, 1, 1) - Exit
- `--md-motion-easing-emphasized` - cubic-bezier(0.2, 0.0, 0.0, 1) - High emphasis

#### Typography Tokens
- `--md-sys-typescale-display-large` - 57px/64px - Hero text
- `--md-sys-typescale-display-medium` - 45px/52px - Large metrics
- `--md-sys-typescale-display-small` - 36px/44px - Section headers
- `--md-sys-typescale-headline-large` - 32px/40px - Page titles
- `--md-sys-typescale-headline-medium` - 28px/36px - Subsection headers
- `--md-sys-typescale-headline-small` - 24px/32px - Card titles
- `--md-sys-typescale-title-large` - 22px/28px - Prominent labels
- `--md-sys-typescale-title-medium` - 16px/24px - Panel headings
- `--md-sys-typescale-title-small` - 14px/20px - List item titles
- `--md-sys-typescale-body-large` - 16px/24px - Primary body text
- `--md-sys-typescale-body-medium` - 14px/20px - Standard body text
- `--md-sys-typescale-body-small` - 12px/16px - Secondary body text
- `--md-sys-typescale-label-large` - 14px/20px - Button text, prominent labels
- `--md-sys-typescale-label-medium` - 12px/16px - Form labels, secondary buttons
- `--md-sys-typescale-label-small` - 11px/16px - Captions, helper text

---

### 3.2) Approved Surface Patterns

| Class | Purpose | When to use |
|---|---|---|
| `md3-surface` / `-high` / `-low` | Solid opaque containers | Forms, settings, modals, list views, standard panels |
| `mg-surface` / `-high` / `-low` | Glassmorphic translucent panels | Recording panels, overlays, wizard, cockpit shells - where layering depth is useful |
| `md3-card` | Discrete content cards with elevation | Analytics views, player cards, drill-downs, any standalone content block |
| `md3-card` + `mg-surface*` | Glass card (intentional combo) | Elevated content that needs depth cue; CSS already handles border override |

**Rules:**
- Do **not** mix `mg-surface*` and `md3-surface*` on the same element - pick one system
- Do **not** stack multiple competing backgrounds on the same element
- `md3-card` may be combined with `mg-surface*` when glass depth is intentional

**Surface Hierarchy:**

| Surface Type | Background | Blur | Border | Elevation | Use Case |
|---|---|---|---|---|---|
| `md3-surface` | `--md-sys-color-surface` | None | None | 0-2dp shadow | Standard panels |
| `md3-surface-high` | `--md-sys-color-surface-variant` | None | None | 4-8dp shadow | Modals, sticky headers |
| `mg-surface` | `surface` @ 80% opacity | 8px blur | 1px white/20% | 2dp shadow | Recording cockpit |
| `mg-surface-high` | `surface` @ 70% opacity | 12px blur | 1px white/30% | 4dp shadow | Floating wizards |
| `md3-card` | `--md-sys-color-surface` | None | 1px outline-variant/20% | 1-2dp shadow | Content cards |

---

### 3.3) Semantic Border Radius Scale

| Token (Tailwind) | CSS var | Pixels | Use for |
|---|---|---|---|
| `rounded-modal` | `--md-sys-shape-corner-large` | 16px | Modals, dialogs, full overlays |
| `rounded-card` | `--md-sys-shape-corner-medium` | 12px | Cards, sections, panels |
| `rounded-control` | `--md-sys-shape-corner-small` | 8px | Buttons, inputs, chips |
| `rounded-pill` | `--md-sys-shape-corner-full` | 9999px | Badges, pills, tags |

---

### 3.4) Semantic Opacity Hierarchy

| Utility class | Value | Use for |
|---|---|---|
| (default) | 1.0 | Primary text, active elements |
| `opacity-secondary` | 0.60 | Secondary text, supporting labels |
| `opacity-muted` | 0.40 | Muted text, decorative, placeholder |
| `opacity-disabled` | 0.38 | Disabled controls (MD3 standard) |

---

### 3.5) Semantic Status Colors

**Use CSS utility classes instead of hardcoded Tailwind colors:**

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

---

### 3.6) Spacing & Layout Grid

**8px Grid System** - All spacing must be multiples of 8px:
- **8px** - Tight spacing (icon margins, inline element gaps)
- **16px** - Standard spacing (panel padding, list item padding)
- **24px** - Medium spacing (section gaps, column gaps)
- **32px** - Large spacing (major section dividers)
- **48px** - Extra-large spacing (view padding, hero sections)

**Exceptions:** 4px may be used for micro-adjustments (visual alignment, icon positioning) but must be documented.

---

### 3.7) Component Priority

- **Reuse established utility classes/components** before creating new visual variants
- **New variant allowed only if:**
  - Used in 2+ places, OR
  - Required by a distinct state (loading, error, etc.)
- Document all new variants in this masterplan

---

## 4) Layout and Information Architecture

### 4.1) Global Structure

**Header:**
- Concise status indicators (session, recording state)
- Single primary contextual action (e.g., Smart Capture button)
- App branding on left
- Theme toggle and settings on right

**Navigation Rail/Sidebar:**
- Stable location (left side, always visible on desktop)
- Consistent icon + label behavior
- Active state clearly indicated
- Order: Recording → Analytics → Smart Captures → Players → History → ID Mapper → Settings

**Main Content:**
- One primary task area per view
- Optional secondary panel for supporting content (2-panel layouts)
- No more than 2 columns without explicit user need

---

### 4.2) Density Rules

- **Default to medium density** - comfortable spacing for most users
- **Small-height fallback** (`< 800px`): Switch to tabs/segmented sections instead of nested scroll regions
- **Never create dual vertical scroll traps** in the same pane unless explicitly required (e.g., Smart Captures queue + detail)

---

### 4.3) Responsive Targets

**Required QA sizes:**
- **1366x768** - Minimum desktop (common budget laptops)
- **1920x1080** - Standard desktop
- **2560x1440** - High-res desktop
- **390x844** - Mobile (iPhone 14 Pro size)

**Critical actions must remain visible without overlap at all targets.**

**Responsive breakpoints:**
- `< 640px` - Mobile: Single column, stack all panels vertically
- `640px - 1024px` - Tablet: 1-2 columns, condensed spacing
- `1024px - 1440px` - Small desktop: 2-3 columns
- `> 1440px` - Large desktop: Full layouts, optional wider content

---

## 5) Interaction Standards

### 5.1) Action Hierarchy

**One primary action per view context.**
- Primary: Filled button, largest, most prominent
- Secondary: Tonal button, grouped with primary if needed
- Tertiary: Text button, least visual weight

**Destructive actions need confirmation affordance:**
- Modal dialog with explicit "Cancel" and "Delete" (danger) buttons
- Or inline confirmation step ("Are you sure? Click again to confirm")

---

### 5.2) Status and Feedback

**Async workflows must show stage labels, not only spinners/percentages:**
- "Processing OCR..." (not just a spinner)
- "Saving match... 80%" (progress + context)
- "Ready to review" (completion state)

**Empty states must include:**
1. **What happened** - "No matches recorded yet"
2. **Why it matters** - "Record your first match to start tracking stats"
3. **Next action** - [Start Recording] button

**Feedback types:**
- **Loading** - Spinner + label, disabled state on triggering element
- **Success** - Toast notification (3s auto-dismiss) + checkmark animation + optional sound
- **Error** - Toast notification (5s or manual dismiss) + error icon + specific error message
- **Progress** - Progress bar or percentage + stage label

---

### 5.3) Motion

- **Use short, purposeful transitions** - 100-300ms typical
- **Avoid decorative animation** that competes with task feedback
- **Keep transitions consistent** with `--md-motion-duration-*` tokens
- **Respect `prefers-reduced-motion`** - instant fallback for accessibility

**Common animation patterns:**
- Button hover: 150ms ease-out, 8% overlay
- Panel slide: 300ms ease-in-out, translateX
- Modal open: 300ms ease-out, scale + fade
- Loading state: Continuous spin or pulse
- Success confirmation: Checkmark scale (0 → 1.2 → 1.0) in 400ms

---

## 6) Accessibility and Readability

**Non-negotiable requirements:**

### 6.1) Contrast
- **WCAG AA minimum:**
  - 4.5:1 for normal text (< 18pt)
  - 3:1 for large text (≥ 18pt) and UI controls
- Test with WebAIM Contrast Checker or browser DevTools

### 6.2) Keyboard Navigation
- All interactive elements reachable by keyboard (Tab, Shift+Tab)
- No keyboard traps (modals must allow Escape to close)
- Visible focus indicators on every focusable element
  - Default: 2px primary-colored outline, 4px offset
  - Never remove default focus without replacement

### 6.3) Semantic Meaning
- **Never use color alone** to communicate state
- Pair with icon, text label, or shape change
- Examples:
  - Win/Loss: Green/red + trophy/X icon + "Win"/"Loss" text
  - Required field: Red asterisk + "required" text + aria-required
  - Disabled button: Gray + 40% opacity + cursor: not-allowed

### 6.4) Labels & Alt Text
- Icon-only controls require accessible labels (aria-label or title)
- All images require alt text (describe content or purpose)
- Form inputs require visible labels (not just placeholders)

---

## 7) Content and Copy Rules

### 7.1) Voice & Tone
- **Plain language** - No jargon unless domain-specific (e.g., "OCR" is fine)
- **Operational wording** - Focus on what the user is doing
- **Conversational but professional** - Not overly casual

### 7.2) Label Guidelines
- **Keep labels short and specific:**
  - ✅ "Run Smart Capture"
  - ❌ "Capture"
  - ❌ "Use the Smart Capture feature to automatically extract data"
- **Action buttons use verb + object:**
  - ✅ "Add Player", "Export Matches", "Approve OCR"
  - ❌ "Submit", "OK", "Done"

### 7.3) Progress & State Text
- **Use verb + object pattern:**
  - ✅ "Processing OCR", "Saving match", "Loading analytics"
  - ❌ "Please wait...", "Loading..."
- **Completion states use adjective or confirmation:**
  - ✅ "Ready to review", "Match saved", "OCR complete"
  - ❌ "Done", "Finished"

---

# Part II: Component Library

## 8) Buttons

### 8.1) Button Variants

| Variant | Use Case | Background | Text Color | Height | Border Radius |
|---|---|---|---|---|---|
| **Primary (Filled)** | Main CTA, most important action per view | `--md-sys-color-primary` | `--md-sys-color-on-primary` (white) | 48px | `rounded-control` (8px) |
| **Secondary (Tonal)** | Secondary actions, less emphasis than primary | `--md-sys-color-secondary-container` | `--md-sys-color-on-secondary-container` | 40px | `rounded-control` (8px) |
| **Tertiary (Text)** | Low-priority actions, Cancel buttons | Transparent | `--md-sys-color-primary` | 36px | `rounded-control` (8px) |
| **Danger (Filled)** | Destructive actions (delete, clear, reset) | `--md-sys-color-danger` | `--md-sys-color-on-danger` (white) | 48px | `rounded-control` (8px) |
| **Icon Button** | Single icon, no text label (with tooltip) | Transparent | `--md-sys-color-on-surface` | 40px diameter | `rounded-full` (50%) |

### 8.2) Button States

| State | Visual Change | Cursor | Duration |
|---|---|---|---|
| **Default** | Base colors, no overlay | pointer | N/A |
| **Hover** | 8% white overlay on filled, 8% primary overlay on text | pointer | 150ms ease-out |
| **Active (pressed)** | 12% white overlay, scale(0.98) | pointer | 100ms |
| **Focus (keyboard)** | 12% overlay + 2px primary outline, 4px offset | pointer | 100ms |
| **Disabled** | 40% opacity, no hover effects | not-allowed | N/A |
| **Loading** | Spinner replaces text/icon, disabled state | wait | Immediate |

### 8.3) Button Code Example (React/TypeScript)

```tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'icon';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  disabled = false,
  loading = false,
  onClick, 
  children,
  type = 'button'
}) => {
  const baseClasses = 'transition-all font-semibold focus:outline focus:outline-2 focus:outline-primary focus:outline-offset-4';
  
  const variantClasses = {
    primary: 'bg-primary text-on-primary h-12 px-6 rounded-control hover:bg-primary/90 active:scale-98',
    secondary: 'bg-secondary-container text-on-secondary-container h-10 px-5 rounded-control hover:bg-secondary-container/90',
    tertiary: 'bg-transparent text-primary h-9 px-4 rounded-control hover:bg-primary/8',
    danger: 'bg-danger text-on-danger h-12 px-6 rounded-control hover:bg-danger/90',
    icon: 'bg-transparent text-on-surface w-10 h-10 rounded-full hover:bg-on-surface/8'
  };
  
  const disabledClass = disabled || loading ? 'opacity-disabled cursor-not-allowed' : '';
  
  return (
    <button
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClass}`}
      disabled={disabled || loading}
      onClick={onClick}
      style={{ 
        transition: 'all var(--md-motion-duration-short3) var(--md-motion-easing-standard)' 
      }}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
};
```

---

## 9) Inputs & Form Controls

### 9.1) Text Input States

| State | Border | Background | Label Color | Height |
|---|---|---|---|---|
| **Default** | 1px solid outline-variant (60% opacity) | surface | on-surface-variant (60%) | 48px |
| **Focus** | 2px solid primary | surface | primary | 48px |
| **Error** | 2px solid danger | surface | danger | 48px |
| **Disabled** | 1px solid outline-variant (38% opacity) | surface-variant | on-surface (38%) | 48px |
| **Filled (has value)** | 1px solid outline-variant | surface | primary | 48px |

### 9.2) Search Input

Same as text input with additions:
- Search icon on left (20px, 60% opacity)
- Clear button (X icon) appears on right when input has value
- Placeholder text: "Search..." in `--md-sys-typescale-body-large`, 40% opacity

### 9.3) Dropdown/Select

- Follows text input styling
- Dropdown chevron icon on right (rotates 180° when open)
- **Dropdown menu:**
  - Background: `md3-surface-high`
  - Border radius: 12px
  - Padding: 8px
  - Max height: 300px with scroll
  - **Menu items:**
    - Height: 40px
    - Hover: 8% white overlay
    - Active item: primary-colored left border (4px)

### 9.4) Checkbox & Radio

- Size: 20px × 20px
- Border: 2px solid outline-variant
- Checked: filled with primary color, white checkmark/dot
- Hover: 8% primary overlay on background
- Focus: 2px primary outline, 4px offset

### 9.5) Toggle Switch

- Track: 36px width × 20px height, rounded-pill
- Thumb: 16px diameter circle
- Off state: track = surface-variant, thumb = on-surface-variant
- On state: track = primary, thumb = on-primary (white)
- Transition: 200ms ease-in-out for thumb slide

---

## 10) Cards & Surfaces

### 10.1) Card Anatomy

**Standard Card (`md3-card`):**
- Padding: 16px (standard), 24px (large analytics cards)
- Border radius: `rounded-card` (12px)
- Border: 1px outline-variant @ 20% opacity
- Elevation: 1-2dp shadow
- **Hover state (if clickable):**
  - 8% white overlay
  - Lift: 4px box-shadow increase
  - Duration: 200ms ease-out
- **Active/Selected state:**
  - 2px primary-colored border OR
  - 12% primary background tint

**Glassmorphic Card (`mg-surface` + `md3-card`):**
- Intentional combination for depth cue
- Blur: 8px (standard) or 12px (elevated)
- Transparency: 80% (standard) or 70% (elevated)
- Border: 1px white @ 20-30% opacity

---

## 11) Status Indicators & Badges

### 11.1) Status Badges

| Status | Background | Text Color | Use Case | Border Radius |
|---|---|---|---|---|
| **Success / Complete** | `bg-success-soft` (#4CAF50/20%) | `text-success` (#4CAF50) | Match won, OCR approved, action successful | `rounded-pill` |
| **Danger / Error** | `bg-danger-soft` (#F44336/20%) | `text-danger` (#F44336) | Match lost, OCR failed, error state | `rounded-pill` |
| **Warning / Review** | `bg-warning-soft` (#FF9800/20%) | `text-warning` (#FF9800) | Needs review, low OCR confidence, incomplete data | `rounded-pill` |
| **Info / Neutral** | `bg-info-soft` (#2196F3/20%) | `text-info` (#2196F3) | Match draw, neutral status, general info | `rounded-pill` |
| **Accent / Highlight** | `bg-accent-soft` (#9C27B0/30%) | `text-accent` (#9C27B0) | New feature, insight, special designation | `rounded-pill` |

### 11.2) Badge Sizing

- **Small:** 20px height, `--md-sys-typescale-label-small` (10px), 8px horizontal padding
- **Medium (default):** 24px height, `--md-sys-typescale-label-medium` (12px), 12px horizontal padding
- **Large:** 32px height, `--md-sys-typescale-label-large` (14px), 16px horizontal padding

### 11.3) Telemetry Status Indicator

**Use in Recording view to show when a panel is receiving auto-populated data.**

- **Visual:** 12px diameter circle, filled with success color (#4CAF50)
- **Label:** "Telemetry Active" in `--md-sys-typescale-label-small`, success color
- **Animation:** Subtle pulse (scale 1.0 → 1.1 → 1.0) every 2 seconds when active
- **Transition:** Fade in/out when state changes (200ms)
- **Placement:** Next to panel heading, right side, 8px margin from heading text

---

# Part III: Animation & Motion Guidelines

## 12) Core Motion Principles

**Motion design is not decoration.** Every animation must serve a functional purpose:
- Communicating state changes
- Guiding attention
- Confirming actions
- Showing relationships between elements

### 12.1) Motion Principles

1. **Purposeful** - Every transition communicates meaning. Don't animate for decoration.
2. **Fast** - Transitions are brief (100-300ms). Users should never wait for animations.
3. **Consistent** - Same interaction type uses same easing curve and duration across the app.
4. **Accessible** - Respect `prefers-reduced-motion`. Provide instant fallback.

---

## 13) Animation Patterns

### 13.1) Hover Effects

All interactive elements respond to hover:

```css
.button {
  transition: all 150ms var(--md-motion-easing-standard);
}

.button:hover {
  background-color: rgba(255, 255, 255, 0.08); /* 8% white overlay */
  transform: translateY(-2px); /* subtle lift */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}
```

### 13.2) Panel Slides

Used for Smart Captures detail view, Settings panels, History → Smart Captures navigation:

```css
/* Slide in from right */
.panel-enter {
  transform: translateX(100%);
  opacity: 0;
}

.panel-enter-active {
  transform: translateX(0);
  opacity: 1;
  transition: all 300ms var(--md-motion-easing-decelerate);
}

/* Slide out to right */
.panel-exit {
  transform: translateX(0);
  opacity: 1;
}

.panel-exit-active {
  transform: translateX(100%);
  opacity: 0;
  transition: all 300ms var(--md-motion-easing-accelerate);
}
```

### 13.3) Ripple Effect (Material Design)

Apply to buttons and clickable cards for tactile feedback:
- Use CSS `::after` pseudo-element or React library like "react-ripples"
- Ripple starts from click point, expands to fill button, fades out in 300ms
- Color: white at 12% opacity for filled buttons, primary at 12% for text buttons

### 13.4) Loading Skeletons

Use for async data loading (analytics charts, match history table):
- Skeleton shape matches final content
- Shimmer animation: gradient moves left to right continuously (1.5s loop)
- Background: `--md-sys-color-surface-variant`, shimmer: lighter variant

### 13.5) Success Confirmation

After critical actions (match recorded, OCR approved, player added):
- Checkmark icon scales in (0 → 1.2 → 1.0) with bounce easing, 400ms
- Toast notification slides up from bottom (300ms decelerate), auto-dismisses after 3s (fade out 200ms)
- Button briefly pulses green (WIN) or red (LOSS), then returns to idle

---

## 14) Reduced Motion Accessibility

**Always include reduced motion fallback:**

```css
/* Instant transitions for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  /* Exception: preserve opacity transitions for visibility */
  .fade-enter, .fade-exit {
    transition: opacity 200ms !important;
  }
}
```

---

# Part IV: View-by-View Specifications

## 15) Recording View

**Purpose:** Capture match results and metadata with minimal friction. This is the app's primary workflow.

### 15.1) Primary Actions

1. **Match Result Entry** - WIN / LOSS / DRAW buttons (most important UI elements)
2. **Smart Capture** - Secondary action for screenshot-based data entry (always visible in top bar)

### 15.2) Visual Hierarchy

| Element | Size/Weight | Color | Placement |
|---|---|---|---|
| WIN/LOSS/DRAW buttons | 48px height, `--md-sys-typescale-label-large`, bold | Success/Danger/Info semantics | Bottom of Match Recording panel, full width, equal spacing |
| Smart Capture button | 40px height, `--md-sys-typescale-label-medium` | `--md-sys-color-primary` | Top bar, right side, before Overlay toggle |
| Panel headings | `--md-sys-typescale-title-medium` (16px), 600 weight | `--md-sys-color-on-surface` | Top of each panel, left-aligned, consistent 16px padding |
| Telemetry status indicators | 12px circle + label, `--md-sys-typescale-label-small` | Success (#4CAF50) when active | Next to panel heading when telemetry is auto-populating |
| Match Timer | 32px height, `--md-sys-typescale-headline-small`, monospace | `--md-sys-color-primary` | Top of Match Recording panel |

### 15.3) Layout Specifications

**Grid system:**
- Three-column layout: Ship & Loadout (left), Roster Manager (center), Mission Intel (right)
- Equal column widths, 24px gap between columns

**Panel structure:**
- Each panel uses `mg-surface` (glassmorphic) for Recording view
- 12px border radius (`rounded-card`)
- 16px internal padding
- 24px spacing between sections within panel

**Responsive behavior:**
- At `< 1200px` width: Stack columns vertically
- At `< 800px` height: Convert to tabbed interface (Ship & Loadout / Roster Manager / Mission Intel tabs)

### 15.4) Critical Fixes

**FIX 1: Ship & Loadout heading size**
- Current: Smaller than Roster Manager/Mission Intel headings
- Target: `--md-sys-typescale-title-medium` (16px), 600 weight, matching other panel headings exactly

**FIX 2: Add telemetry indicator to Ship & Loadout**
- Current: Roster Manager has green indicator when telemetry active, Ship & Loadout does not
- Target: 12px success-colored circle + "Telemetry Active" label appears next to Ship & Loadout heading when data is being auto-populated
- Behavior: Fade in/out with 200ms ease transition when telemetry state changes

**FIX 3: Visual alignment of panels**
- Current: Panel headings not consistently aligned, spacing varies
- Target: All panel tops align horizontally, heading text baselines align, internal padding uniform at 16px all sides

### 15.5) Interaction Specifications

| Interaction | Visual Feedback | Duration | Sound (Optional) |
|---|---|---|---|
| Hover WIN/LOSS/DRAW button | 8% white overlay, cursor pointer, slight lift (2px translateY) | 150ms ease-out | Soft click |
| Click WIN button | Ripple animation from click point, pressed state (12% overlay), scale 0.98 for 100ms | Ripple 300ms, scale 100ms | Success chime |
| Smart Capture button hover | 8% primary color overlay, cursor pointer | 150ms ease-out | None |
| Smart Capture button click | Loading spinner replaces icon, button disabled state | Immediate | Camera shutter |
| Ship/Loadout selection | Selected: primary border (2px), 8% background tint. Deselected: 60% opacity | 200ms ease-in-out | Soft pop |
| Match timer start | Timer text fades in 0% → 100%, color shifts muted → primary | 300ms ease-out | Beep (optional) |

### 15.6) State Handling

- **Idle:** All panels visible, WIN/LOSS/DRAW enabled, timer stopped, telemetry indicators show current status
- **Recording:** Timer running, telemetry indicators pulse subtly if active, WIN/LOSS/DRAW enabled
- **Smart Capture processing:** Smart Capture button shows spinner + disabled. Toast "Processing OCR..." appears. Other actions remain enabled.
- **Match complete:** Timer stops. Success toast "Match recorded: WIN" (or LOSS/DRAW). WIN/LOSS/DRAW buttons briefly pulse green/red/blue then return to idle. Panel data clears/resets based on settings.

---

## 16) Analytics View

**Purpose:** Surface actionable insights from match data. Users identify strengths, weaknesses, trends, and anomalies.

### 16.1) Primary Action

**Seek Insights** - Dedicated "Insights" panel or button that highlights interesting patterns the app has detected:
- "You always win with Player X"
- "You've never won a match with Hazard Y"
- "Your win rate with Ship Z is 15% above average"

### 16.2) Visual Hierarchy

| Element | Size/Weight | Color | Placement |
|---|---|---|---|
| Key metrics (Win Rate, Streak, etc.) | 48-64px numbers, `--md-sys-typescale-display-medium` | Semantic (success/danger/info) or primary | Top row, large cards, left-to-right reading order |
| Insights panel/button | CTA-sized (48px height), `--md-sys-typescale-label-large` | Accent color to draw attention | Prominent placement (top right or dedicated sidebar section) |
| Chart/graph titles | `--md-sys-typescale-title-small`, 600 weight | `--md-sys-color-on-surface` | Above each chart, left-aligned |
| Chart data labels | `--md-sys-typescale-body-small` | 60% opacity on-surface | Inside or adjacent to data points |
| Filter/time range controls | `--md-sys-typescale-label-medium` | Secondary color | Below main header, above content grid |

### 16.3) Insights Implementation

**Insight types:**
- **Teammate synergy:** "Win rate +25% when playing with [Player Name]"
- **Hazard impact:** "0% win rate across 12 matches with [Hazard Name]"
- **Ship performance:** "Your best ship: [Ship Name] with 72% win rate over 30 matches"
- **Time-based trends:** "Win rate declining: 68% this week vs. 75% last week"
- **Skill curve:** "Kill efficiency improving: 0.9 avg → 1.2 avg over last 20 matches"

**Presentation:**
- Use `md3-card` with subtle accent-colored left border (4px)
- Icon on left (lightbulb, trending up/down, etc.), insight text in `--md-sys-typescale-body-large`
- Expandable: click to see underlying data (table of matches, breakdown by map/mode, etc.)
- Limit to 3-5 most interesting insights to avoid overwhelming

### 16.4) Layout Specifications

- **Top row:** Key metric cards (Win Rate, Current Streak, Momentum). 4-column grid at desktop, 2-column at tablet, 1-column at mobile.
- **Insights section:** Below key metrics. Full-width container with stacked insight cards (vertical list) or 2-column grid if space permits.
- **Charts section:** Below insights. 2-column grid at desktop (Win Rate trend on left, Kill Efficiency on right). Stack vertically on smaller screens.
- **Surface treatment:** Use `md3-card` for metric cards and insight cards. Use `md3-surface` for chart containers (charts need opaque backgrounds for readability).

### 16.5) Interaction Specifications

| Interaction | Visual Feedback | Duration | Sound (Optional) |
|---|---|---|---|
| Hover metric card | Subtle lift (4px box-shadow), cursor pointer | 200ms ease-out | None |
| Click metric card | Expand to show breakdown (drill-down panel slides in from right or expands in-place) | 300ms ease-in-out | Soft pop |
| Hover insight card | 8% white overlay, cursor pointer | 150ms ease-out | None |
| Click insight card | Expand accordion to show underlying data table or chart | 250ms ease-in-out | None |
| Change time range filter | All charts/metrics fade out (200ms), update data, fade in (300ms) | 500ms total | None |
| Hover chart data point | Tooltip appears with exact values, data point enlarges slightly (scale 1.2) | 100ms ease-out | None |

---

## 17) Smart Captures View

**Purpose:** Deep-dive OCR data management. Users review, edit, and approve data extracted from screenshots.

### 17.1) Primary Action

**Manage OCR Data** - Review queue of captured matches. Click to open detail panel for editing/approving/reprocessing individual captures.

### 17.2) Visual Hierarchy

| Element | Size/Weight | Color | Placement |
|---|---|---|---|
| Queue list items | `--md-sys-typescale-body-medium` | On-surface with status-colored left border (4px) | Left panel, vertical list, most recent at top |
| Status badges (Missing Data, Review, Complete) | `--md-sys-typescale-label-small`, 600 weight | Warning/Info/Success semantic colors | Right side of each list item |
| Edit/Approve/Reprocess buttons in detail view | 40px height, `--md-sys-typescale-label-medium` | Primary/Success/Secondary | Bottom of detail panel, right-aligned, grouped |
| OCR confidence indicators | Progress bar or percentage, `--md-sys-typescale-label-small` | Success (>90%), Warning (70-90%), Danger (<70%) | Detail panel, next to each extracted field |
| Screenshot preview | Variable size, max 400px width | N/A | Top of detail panel or right sidebar |

### 17.3) Layout Specifications

**Two-panel layout:**
- Queue list on left (30% width), detail view on right (70% width)
- Resizable divider

**Queue list:**
- Vertical scroll
- Each item shows match ID, timestamp, ship/hero, and status badge
- Active item highlighted with primary-colored background (12% opacity)

**Detail panel:**
- Scrollable
- Screenshot at top, followed by extracted data fields (editable inputs), OCR confidence for each field, action buttons at bottom

**Empty state:**
- When queue is empty: center-aligned icon (camera with checkmark), heading "All captures reviewed," subtext "New captures will appear here," optional CTA "Run Smart Capture" button

### 17.4) Connection to History View

**From History to Smart Captures:**
- Each match row in History table has a "Details" button (icon: magnifying glass or arrow-right)
- Click "Details" → Smart Captures panel slides in from right OR navigate to Smart Captures view with that match pre-selected
- Transition: 300ms ease-in-out slide animation. Breadcrumb or back button to return to History.

**From Smart Captures to History:**
- After approving a capture, option to "View in History" (navigates to History with that match highlighted)

### 17.5) Interaction Specifications

| Interaction | Visual Feedback | Duration | Sound (Optional) |
|---|---|---|---|
| Hover queue item | 8% white overlay, cursor pointer | 150ms ease-out | None |
| Click queue item | Item background → primary 12%, detail panel content slides in from right | 250ms ease-in-out | Soft click |
| Edit OCR field | Input border → primary color, focus ring appears | 100ms | None |
| Click Reprocess OCR | Button shows spinner, detail panel dims 40%, "Reprocessing..." toast | Immediate | Processing beep |
| OCR complete | Detail panel un-dims, updated data fades in (300ms), success toast "OCR updated" | 300ms | Success chime |
| Approve capture | Checkmark animation on button, item status badge → "Complete" (green), item moves to bottom or fades out | 400ms | Success ding |

---

## 18) Players View

**Purpose:** Manage player roster and view player-specific statistics.

### 18.1) Primary Actions

1. **Search Players** - Prominent search bar at top, real-time filtering
2. **Add Player** - "+ Add Player" button opens modal for manual entry
3. **View Player Profile** - Click player in list to see detailed stats, notes, match history

### 18.2) Visual Hierarchy

| Element | Size/Weight | Color | Placement |
|---|---|---|---|
| Search bar | 48px height, `--md-sys-typescale-body-large` | `--md-sys-color-on-surface` | Top of view, full width or centered with max-width 600px |
| + Add Player button | 40px height, `--md-sys-typescale-label-medium` | Primary color, filled variant | Top right, next to search bar or below it |
| Player list items | `--md-sys-typescale-body-medium` | On-surface | Vertical list, sorted alphabetically or by recency |
| Player avatar/icon | 40px diameter circle | N/A | Left side of each list item |
| Encounter count ("16 encounters") | `--md-sys-typescale-label-small`, 60% opacity | On-surface-variant | Right side of list item, below player name |
| Player profile stat line | `--md-sys-typescale-body-small` | On-surface | Right panel when player selected, below player name/avatar |

### 18.3) Layout Specifications

**Two-panel layout:**
- Player list on left (40% width), player profile detail on right (60% width)
- If no player selected, right panel shows empty state: "Select a player to view details" with icon

**Player list:**
- Scrollable vertical list. Use `md3-surface`.
- Each item is a `md3-card` or similar with hover state
- Pinned players (star icon) appear at top, separated by subtle divider

**Player profile:**
- **Top section:** Player name (large), avatar, pin/unpin toggle, notes field (editable)
- **Middle section:** Stat summary (win rate with this player, total matches, last seen)
- **Bottom section:** Match history list (abbreviated, with "View All in History" link)

**Pagination:**
- Player list shows first 50 results
- "Load More" button at bottom or infinite scroll (user preference)

### 18.4) Critical Fixes

**FIX: Remove or implement "View Full Profile" button**
- Current: Button exists but does nothing
- Target: Either remove button entirely (profile already shows in right panel), OR implement it to navigate to dedicated full-screen player view
- **Recommendation:** Remove. Current two-panel layout already provides full profile visibility.

### 18.5) Interaction Specifications

| Interaction | Visual Feedback | Duration | Sound (Optional) |
|---|---|---|---|
| Type in search bar | Player list filters in real-time, no results state appears if zero matches | Instant | None |
| Click + Add Player | Modal slides up from bottom, background dims to 40% opacity, focus trapped in modal | 300ms ease-out | Modal open |
| Hover player list item | 8% white overlay, cursor pointer | 150ms ease-out | None |
| Click player list item | Item background → primary 12%, right panel content slides in from right with player details | 250ms ease-in-out | Soft click |
| Pin/unpin player (star icon) | Star fills/unfills with scale animation (1.0 → 1.3 → 1.0), player moves to pinned section (animated reorder) | 300ms | Star pop |
| Edit player notes | Notes field shows focus state, save button appears (or auto-saves with debounce) | 100ms | None |

---

## 19) History View

**Purpose:** Casual review of past matches. Users browse match history, filter by criteria, and export match data.

### 19.1) Primary Actions

1. **Browse Matches** - Scroll through match history table, click match row for basic details
2. **Multi-Select & Export** - Select multiple matches via checkboxes, click "Export" to generate visual graphics
3. **Deep Dive (Link to Smart Captures)** - "Details" button on each match row navigates to Smart Captures view

### 19.2) Visual Hierarchy

| Element | Size/Weight | Color | Placement |
|---|---|---|---|
| Table headers (Outcome, When, Ship/Hero, Duration, etc.) | `--md-sys-typescale-label-medium`, 600 weight, uppercase | 60% opacity on-surface | Top row of table, sticky header |
| Match outcome icons (Win/Loss/Draw) | 20px icon + label, `--md-sys-typescale-body-medium` | Success/Danger/Info semantic colors | First column |
| Match timestamp | `--md-sys-typescale-body-small`, 60% opacity | On-surface-variant | Second column |
| Ship/Hero cell | `--md-sys-typescale-body-medium` | On-surface | Third column, with small icon if available |
| Hazards column | `--md-sys-typescale-label-small` | Warning color if present, muted if none | NEW column, toggleable visibility |
| Details button | Icon button, 32px diameter | Secondary color | Last column |
| Multi-select checkboxes | 20px checkboxes | Primary color when checked | First column, before outcome |

### 19.3) Layout Specifications

**Table structure:**
- Full-width table
- Columns: [Checkbox] [Outcome] [When] [Ship/Hero] [Duration] [Hazards] [Teammates] [Opponents] [Details]
- Column visibility user-configurable (settings or column picker)

**Sticky header:**
- Table header remains visible on scroll
- Background: `md3-surface-high` to prevent transparency issues

**Grouping:**
- Matches grouped by date ("Today," "Yesterday," "Tuesday, Feb 10")
- Group headers use `--md-sys-typescale-title-small`, subtle background color

**Filters bar:**
- Above table
- Dropdowns or segmented controls for filtering by Outcome (All/Win/Loss/Draw), Ship, Date Range, etc.
- "Clear Filters" button when active

**Export toolbar:**
- Appears at bottom when matches selected
- Shows count ("3 matches selected"), "Export" button (primary), "Deselect All" (text button)

### 19.4) Critical Fixes

**FIX: Add Hazards column to table**
- Current: OCR captures hazards but they don't appear in History view
- Target: New "Hazards" column between Duration and Teammates. Shows hazard names as chips/tags (small, rounded, warning color). If multiple hazards, show first 2 + "+N more" with tooltip on hover.
- Column visibility: Toggleable via column picker (some users may not care about hazards)

### 19.5) Interaction Specifications

| Interaction | Visual Feedback | Duration | Sound (Optional) |
|---|---|---|---|
| Hover table row | 8% white overlay, cursor pointer | 150ms ease-out | None |
| Click Details button | Smart Captures panel slides in from right OR navigate to Smart Captures view with match pre-selected | 300ms ease-in-out | Soft click |
| Check/uncheck match | Checkbox fills with checkmark animation, row background → primary 8%, Export toolbar slides up if first selection | 200ms | Click |
| Click Export button | Modal opens with export preview (image of selected matches), download/share options | 300ms | Modal open |
| Filter change | Table rows fade out (200ms), filter applied, rows fade in (300ms) with stagger effect (50ms delay per row) | 600ms total | None |
| Expand match row (inline detail) | Row height expands smoothly, detail content fades in. Shows brief summary + "Full Details" button linking to Smart Captures | 250ms ease-in-out | None |

---

## 20) ID Mapper View

**Purpose:** Map cryptic telemetry IDs to human-readable labels. Technical/admin view for power users.

### 20.1) Primary Action

**Assign Labels to IDs** - View list of unmapped or recently detected IDs. Assign friendly names (e.g., telemetry ID "hero_03" → "Adrian").

### 20.2) Visual Hierarchy

| Element | Size/Weight | Color | Placement |
|---|---|---|---|
| Unmapped IDs list | `--md-sys-typescale-body-medium` | Warning color to draw attention | Top section, vertical list |
| ID input field | 40px height, `--md-sys-typescale-body-large`, monospace | On-surface | Left column in each list item |
| Label input field | 40px height, `--md-sys-typescale-body-large` | On-surface | Right column in each list item |
| Save/Apply button | 36px height, `--md-sys-typescale-label-medium` | Primary color | Right side of each row, or batch "Save All" at bottom |
| Already mapped IDs (reference) | `--md-sys-typescale-body-small`, 60% opacity | On-surface-variant | Bottom section, collapsible "Previously Mapped" list |

### 20.3) Layout Specifications

**Priority sorting:**
- Unmapped IDs appear at top in order of frequency (most-seen IDs first)
- This helps users focus on the most impactful mappings

**Two-column form:**
- Each row: [Telemetry ID (read-only or editable)] [Label Input (text field)] [Save button]
- Use `md3-surface` for container, `md3-card` for each row if needed

**Empty state:**
- When all IDs mapped: "All IDs assigned! New detections will appear here." with checkmark icon

**Bulk actions:**
- Optional "Import Mappings" (CSV upload) and "Export Mappings" buttons at top for advanced users

### 20.4) Interaction Specifications

| Interaction | Visual Feedback | Duration | Sound (Optional) |
|---|---|---|---|
| Type in label field | Field shows focus state, Save button enables (was disabled when empty) | 100ms | None |
| Click Save button | Button shows spinner briefly, row fades to 60% opacity during save, then fades back in with success checkmark icon appearing briefly on right | 400ms | Success chirp |
| Hover unmapped ID row | Subtle 8% overlay, cursor pointer if clickable | 150ms | None |
| Auto-suggest on label input | Dropdown appears below input with suggestions (if app has prior knowledge), arrow keys navigate, Enter selects | 200ms | None |

---

## 21) Settings View

**Purpose:** Configure app preferences, theme, OCR settings, data management, and view updates/changelog.

### 21.1) Primary Actions

1. **Theme Selection** - Most visible setting. Toggle between Light / Dark / Twilight themes.
2. **OCR Configuration** - Adjust OCR sensitivity, enable/disable auto-processing, set confidence thresholds.
3. **Data Management** - Export all data, import data, clear cache, reset app state.

### 21.2) Visual Hierarchy

| Element | Size/Weight | Color | Placement |
|---|---|---|---|
| Section headers (Appearance, OCR, Data, etc.) | `--md-sys-typescale-title-medium`, 600 weight | On-surface | Left-aligned, 32px spacing between sections |
| Theme toggle | Segmented button group, 40px height, `--md-sys-typescale-label-medium` | Primary color for active segment | Top of Appearance section |
| Setting labels | `--md-sys-typescale-body-medium` | On-surface | Left side of each setting row |
| Setting controls (toggles, sliders, dropdowns) | Standard control sizes per MD3 | Primary color for active state | Right side of each setting row |
| Destructive actions (Clear Cache, Reset) | `--md-sys-typescale-label-medium` | Danger color | Data section, with confirmation dialogs |

### 21.3) Layout Specifications

**Grouped sections:**
- Settings organized into collapsible sections (Appearance, OCR, Data & Updates, Advanced)
- Each section uses `md3-card` or `md3-surface`

**Two-column layout within sections:**
- Label on left, control on right
- For long descriptions, label + description stack vertically with control below or to the right

**Theme preview:**
- Optional: Show small preview of each theme (Light/Dark/Twilight) as visual tiles next to or within the segmented button

**Updates/Changelog:**
- Dedicated subsection or expandable card showing version number, release notes, and "Check for Updates" button

### 21.4) Interaction Specifications

| Interaction | Visual Feedback | Duration | Sound (Optional) |
|---|---|---|---|
| Click theme segment (Light/Dark/Twilight) | Active segment fills with primary color, entire UI transitions to new theme with 300ms fade | 300ms | Theme switch |
| Toggle switch (on/off setting) | Switch slides with easing, track color changes from off (gray) to on (primary) | 200ms ease-in-out | Toggle click |
| Adjust slider (OCR confidence threshold) | Thumb follows cursor smoothly, value label updates in real-time next to slider | Instant | None |
| Click "Clear Cache" | Confirmation dialog slides up, background dims. If confirmed, button shows spinner, then success toast "Cache cleared" | 300ms + action time | Confirmation, success |
| Expand/collapse section | Section content slides down/up, chevron icon rotates 180° | 250ms ease-in-out | Soft pop |

---

# Part V: Implementation & Quality Assurance

## 22) Implementation Roadmap

The UI overhaul is delivered in phases to manage complexity and allow iterative testing. Each phase is atomic and can be validated independently.

### Phase 1: Foundation (Week 1-2)
**Goal:** Establish design tokens, component primitives, and animation system.

**Deliverables:**
- Update `src/index.css` with all design tokens from this masterplan
- Audit all components for hardcoded values, replace with tokens
- Create Button component with all variants (Primary, Secondary, Tertiary, Danger, Icon)
- Create Input component with all states (Default, Focus, Error, Disabled)
- Implement motion tokens and reduced-motion fallback

**Validation:**
- Storybook or component showcase showing all button/input variants and states
- No hardcoded colors in any component file (grep audit)
- `prefers-reduced-motion` tested and working

### Phase 2: Recording View Overhaul (Week 3-4)
**Goal:** Implement all Recording view fixes and enhancements.

**Deliverables:**
- Fix: Ship & Loadout heading size matches other panels
- Fix: Add telemetry indicator to Ship & Loadout panel
- Fix: Align all panel tops horizontally, normalize internal padding
- Implement WIN/LOSS/DRAW button hover, active, loading, and success states
- Add ripple animation to WIN/LOSS/DRAW buttons
- Implement Smart Capture processing toast and button spinner

**Validation:**
- Screenshot comparison before/after at 1366x768 and 1920x1080
- Keyboard navigation test: Tab through all controls, verify focus states
- State coverage: Idle, Recording, Smart Capture Processing, Match Complete

### Phase 3: Analytics & Smart Captures (Week 5-6)
**Goal:** Implement Insights feature, refine Analytics layout, connect History to Smart Captures.

**Deliverables:**
- Analytics: Implement Insights panel with 3-5 auto-detected patterns
- Analytics: Refine key metric cards with hover/drill-down states
- Smart Captures: Two-panel layout (queue list + detail view)
- Smart Captures: OCR confidence indicators with color-coded status
- History: Add "Details" button that links to Smart Captures
- Implement 300ms slide transition for History → Smart Captures navigation

**Validation:**
- Analytics: Insights panel shows real data, expandable cards work
- Smart Captures: Queue list navigable, detail view updates correctly
- History → Smart Captures: Transition smooth, back navigation works

### Phase 4: Players, History, Settings (Week 7-8)
**Goal:** Complete remaining views and polish interactions.

**Deliverables:**
- Players: Fix/remove "View Full Profile" button
- Players: Implement pin/unpin with animated reorder
- History: Add Hazards column with chip/tag presentation
- History: Multi-select with Export toolbar
- Settings: Theme toggle with 300ms UI transition
- ID Mapper: Priority-sorted unmapped IDs with save feedback

**Validation:**
- All views tested at required breakpoints (1366x768, 1920x1080, 2560x1440, 390x844)
- Keyboard navigation works across all views
- Theme transitions are smooth and complete (no flashing unstyled content)

### Phase 5: Polish & QA (Week 9-10)
**Goal:** Final refinements, accessibility audit, performance optimization.

**Deliverables:**
- Full accessibility audit (keyboard nav, contrast, screen reader labels)
- Performance: Optimize animation performance (CSS transforms over left/top, will-change hints)
- Visual QA: Screenshot regression tests for all views
- User testing: 3-5 users test primary workflows, collect feedback
- Documentation: Update this masterplan with any learnings or adjustments

---

## 23) Quality Assurance Criteria

Every UI change must pass these checks before being considered complete. These are non-negotiable gates.

### 23.1) Functional Checks
- [ ] All interactive elements respond to click/tap
- [ ] Loading states display during async operations
- [ ] Success/error feedback appears for all critical actions
- [ ] Forms validate input and show error states appropriately
- [ ] Navigation works bidirectionally (forward and back)

### 23.2) Visual Checks
- [ ] No UI clipping or overflow at required breakpoints (1366x768, 1920x1080, 2560x1440, 390x844)
- [ ] Text remains readable (not too small, not obscured by backgrounds)
- [ ] Consistent spacing using 8px grid system
- [ ] All colors use CSS variables (no hardcoded hex/rgb values)
- [ ] Glassmorphic panels show appropriate blur and transparency

### 23.3) Accessibility Checks
- [ ] WCAG AA contrast ratios met (4.5:1 normal text, 3:1 large/UI controls)
- [ ] All interactive elements reachable by keyboard
- [ ] Visible focus indicators on all focusable elements
- [ ] No keyboard traps (modals/overlays allow escape)
- [ ] Icon-only controls have accessible labels/tooltips
- [ ] Status never communicated by color alone (use icon/text)

### 23.4) Performance Checks
- [ ] Animations run at 60fps (use Chrome DevTools Performance tab)
- [ ] Page load time under 2 seconds on typical hardware
- [ ] No layout thrashing (batch DOM reads/writes)
- [ ] Large lists virtualized (render only visible items)

### 23.5) Code Quality Checks
- [ ] No console errors or warnings
- [ ] Component props validated with TypeScript or PropTypes
- [ ] CSS class names follow BEM or semantic naming conventions
- [ ] No `!important` overrides (unless documented exception)
- [ ] Commented code removed, TODOs addressed or ticketed

---

## 24) Agent Workflow for UI Changes

This workflow applies to both AI agents and human developers.

### Step 1: Intake
- Define affected views, user problem, acceptance criteria
- Reference specific sections of this masterplan
- Identify which phase of the roadmap this work belongs to

### Step 2: Plan
- Break into atomic UI steps: structure, styling, behavior, validation
- List required design tokens and components
- Identify potential conflicts with existing patterns

### Step 3: Implement
- Update layout first, then visual polish, then interaction states
- Keep diffs scoped to targeted files
- Use design tokens exclusively (no hardcoded values)
- Follow component library specifications exactly

### Step 4: Validate
- Functional checks first (does it work?)
- Visual checks at required viewport sizes
- Regression check for shared components
- Run QA checklist (section 23)

### Step 5: Handoff
- Include before/after summary, touched components, and known tradeoffs
- Store visual evidence under `docs/agents/evidence/ui/<task-id>/`
- Update `docs/agents/03_VALIDATION.md` with artifact paths
- Log any exceptions in `docs/agents/DECISIONS.md`

---

## 25) PR/UI Change Gate (Must Pass)

Before merging any UI change, confirm:
- [ ] Uses design tokens (no ad hoc palette drift)
- [ ] Preserves single-primary-action rule per view
- [ ] No new scroll traps or clipped controls at required sizes
- [ ] States are explicit for loading/empty/error/success
- [ ] Keyboard/focus behavior remains usable

---

## 26) UI Acceptance Guardrails v2 (AOM_V2)

### 26.1) Classification
- **Copy-only:** Text and labels only, no layout/style/interaction changes
- **Visual-impact:** Any spacing, hierarchy, style, component, or interaction change

### 26.2) Required Evidence

**For copy-only:**
- Screenshot/snapshot proof at one desktop and one mobile breakpoint
- Confirm no clipping/regression in touched view

**For visual-impact:**
- Before/after evidence at 1366x768 and 390x844 minimum
- State coverage: loading, empty, error, disabled, success
- Keyboard focus traversal verified

### 26.3) Acceptance Thresholds
- No control clipping or overlap
- Primary action remains visually dominant
- Any unresolved UI defect must be listed in handoff as deferred risk

---

## 27) Clutter-Control Addendum (v2.1)

**Purpose:** Close quality gaps without expanding process overhead.

### 27.1) Accessibility Thresholds (Measurable)
- **Contrast target:** WCAG AA minimum (4.5:1 normal text, 3:1 large text and UI controls)
- **Keyboard rule:** All interactive controls reachable by keyboard; no keyboard trap in overlays/modals
- **Focus rule:** Visible focus indicator on every interactive control (do not remove default focus without replacement)

### 27.2) Component Baselines (Single Source)

Canonical primitives must be defined once in shared UI code and reused:
- **Button:** `primary`, `secondary`, `tertiary`, `danger`, `icon`, `disabled`, `loading`
- **Input:** `default`, `focus`, `error`, `disabled`
- **Card/Panel:** `md3-surface*` or `mg-surface*` per intent, not both

New variants are allowed only if used in 2+ places or required by a distinct state.

### 27.3) Evidence Format (Standardized, Minimal)

Store visual evidence under `docs/agents/evidence/ui/<task-id>/`

**Naming convention:**
- `before-1366x768.png`, `after-1366x768.png`
- `before-390x844.png`, `after-390x844.png`
- `states-loading-empty-error-disabled-success.png` (or separate per-state files)

`docs/agents/03_VALIDATION.md` must include exact artifact paths.

### 27.4) Exception Control

Any intentional deviation from this masterplan must be logged in `docs/agents/DECISIONS.md` before implementation.

**Exception entry must include:**
- Reason (why is deviation necessary?)
- Owner (who approved this?)
- Impacted view/component
- Expiry/revisit trigger (when should this be reviewed again?)

Expired exceptions must be either renewed with rationale or removed by aligning implementation.

### 27.5) Visual Regression Expectations

**Required snapshot targets for visual-impact changes:**
- Header/top bar (`src/components/Header.tsx`)
- Primary workflow view (`src/components/RecordingView.tsx`)
- Smart Capture queue/review (`src/components/SmartCapturesPanel.tsx`)
- Active analytics surface(s) touched by the change

**Minimum check:** One desktop and one mobile comparison per touched view.

---

## 28) Canonical References

These are the authoritative code files for each pattern:
- `src/index.css` - Tokens, surfaces, motion, typography
- `src/components/Header.tsx` - Top bar patterns
- `src/components/RecordingView.tsx` - Primary workflow layout
- `src/components/SmartCapturesPanel.tsx` - Queue/review patterns
- `docs/agents/AI_IMPLEMENTATION_GUIDE.md` - Agent implementation workflow guide

---

## 29) Design References & Resources

### Material Design 3
- **Official Guidelines:** https://m3.material.io
- **Motion System:** https://m3.material.io/styles/motion/overview
- **Color System:** https://m3.material.io/styles/color/overview
- **Components:** https://m3.material.io/components

### Apple Human Interface Guidelines
- **macOS Design Principles:** https://developer.apple.com/design/human-interface-guidelines/macos
- **Attention to Detail:** https://developer.apple.com/design/human-interface-guidelines/foundations/app-icons

### Accessibility Standards
- **WCAG 2.1 Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
- **Contrast Checker:** https://webaim.org/resources/contrastchecker/
- **Keyboard Navigation Patterns:** https://www.w3.org/WAI/ARIA/apg/patterns/

### Animation & Motion
- **Easing Functions:** https://easings.net
- **CSS Tricks Animation Guide:** https://css-tricks.com/almanac/properties/a/animation/
- **React Transition Group:** https://reactcommunity.org/react-transition-group/

### Inspiration & Case Studies
- **Gaming Analytics UI:** Riot Games (League of Legends stats), Tracker Network, Overwolf apps
- **Glassmorphism:** https://ui.glass, https://glassmorphism.com
- **Data Visualization:** Observable (https://observablehq.com), D3.js examples (https://observablehq.com/@d3/gallery)

---

## 30) Document History

**v3.0 (2026-02-14)**
- Merged UI_MASTERPLAN.md and WILDGATE_UI_OVERHAUL_v2.docx into single source of truth
- Added comprehensive view-by-view specifications
- Added detailed component library with code examples
- Added animation & motion guidelines with CSS examples
- Added implementation roadmap (5 phases)
- Added expanded QA criteria
- Preserved all existing design system contract details
- Preserved all agent workflow guidance
- Preserved all acceptance guardrails

**v2.1 (Previous)**
- Added Clutter-Control Addendum
- Added Evidence Format standards
- Added Exception Control requirements
- Added Visual Regression Expectations

**v2.0 (Previous)**
- Added UI Acceptance Guardrails (AOM_V2)

**v1.0 (Original)**
- Initial design system contract

---

## 31) How to Use This Document

### For AI Agents
1. **Always read relevant sections** before implementing UI changes
2. **Reference specific tables** for exact values (Visual Hierarchy, Interaction Specifications, etc.)
3. **Follow code examples** exactly as provided
4. **Use design tokens only** - no hardcoded values
5. **Run QA checklist** (section 23) before marking work complete
6. **Store evidence** in `docs/agents/evidence/ui/<task-id>/` with standard naming

### For Human Developers
1. **Consult this document** before starting any UI work
2. **Use the roadmap** (section 22) to understand project phases
3. **Follow the agent workflow** (section 24) for structured implementation
4. **Pass all QA gates** (section 25) before submitting PRs
5. **Update this document** when patterns evolve or new learnings emerge

### For Designers
1. **Design system contract** (sections 3-7) defines constraints
2. **View specifications** (sections 15-21) show detailed layouts
3. **Component library** (sections 8-11) provides reusable primitives
4. **Motion guidelines** (sections 12-14) define animation patterns
5. **Propose changes** via `docs/agents/DECISIONS.md` if deviation is needed

---

**End of UI Masterplan v3.0**
