# UI Handoff

This file is written by the `ui-designer` agent.

## UI Priorities
- **Smart Captures Panel:** Reduce density, clarify hierarchy, and make selection + statuses obvious without persistent visual noise.
- **Analytics Detailed Views:** Match cockpit's glass morphism and narrative density (text + metrics), while keeping graphs visible.
- **Recording View:** Avoid clipped controls at small heights (1366x768); make scrolling behavior intentional (no scroll on left panel).
- **Smart Capture CTA:** Present as a top-level action (header) when enabled; keep in-panel version secondary.

## Design Directives (Builder)

### 1. Smart Captures Panel (Step 7)
*Ref: `src/components/SmartCapturesPanel.tsx`*

**Layout:**
- **Container:** `grid grid-cols-[350px_1fr] h-full overflow-hidden bg-[var(--md-sys-color-surface)]`
- **Left Column (List):** `flex flex-col border-r border-[var(--md-sys-color-outline-variant)] overflow-y-auto`
- **Right Column (Detail):** `flex flex-col overflow-y-auto p-6 gap-6`

**Components:**
- **Toolbar (Left Col):** `sticky top-0 z-10 bg-[var(--md-sys-color-surface)]/95 backdrop-blur border-b border-[var(--md-sys-color-outline-variant)] p-2 flex justify-between items-center`
- **List Item:**
  - Base: `md3-list-item relative cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)]`
  - Selected: `md3-list-item--selected border-l-4 border-[var(--md-sys-color-primary)]`
  - **Content:**
    - Primary: `text-body font-semibold truncate` (Map/Mode)
    - Secondary: `text-label truncate` (Date/Time)
    - Status: Right-aligned `md3-icon-btn md3-icon-btn--small` (Green check or Yellow alert)
- **Detail Header:**
  - Title: `md3-headline-small text-[var(--md-sys-color-on-surface)]`
  - Actions: Grouped `flex gap-2` using `md3-btn-tonal` for major actions (Process OCR) and `md3-icon-btn` for utilities.

### 2. Analytics Detailed Views (Step 6)
*Ref: `src/components/analytics/*`*

**Structure ("DetailShell"):**
- **Wrapper:** `w-full h-full flex flex-col gap-6 p-6 overflow-y-auto`
- **Header:** `md3-card flex justify-between items-center p-4 backdrop-blur-md`
- **Content Grid:** `grid grid-cols-1 lg:grid-cols-12 gap-6`
  - **Narrative (Left):** `lg:col-span-4 space-y-4`
    - Sections: `md3-card p-4 space-y-2`
    - Metric Highlights: `inline-flex items-center gap-2 px-2 py-1 rounded bg-[var(--md-sys-color-surface-variant)] font-mono text-primary font-bold`
  - **Graphs (Right):** `lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4`
    - Graph Card: `md3-card min-h-[300px] flex flex-col`

### 3. Recording View Layout (Step 3)
*Ref: `src/components/RecordingView.tsx`*

**Layout Strategy:**
- **Root:** `flex h-full w-full overflow-hidden`
- **Left Panel (Controls):**
  - Width: `w-[280px] lg:w-[320px] flex-none`
  - Style: `md3-surface border-r border-[var(--md-sys-color-outline-variant)] flex flex-col overflow-hidden` (CRITICAL: No scroll on container)
  - **Standard Mode (>= 800px height):** Stack controls vertically.
  - **Compact Mode (< 800px height):** Use a Tab/Toggle switcher between "Actions" and "Loadout" sections to prevent scrolling.
- **Main View (Center):** `flex-1 relative overflow-hidden bg-black/20` (Viewport)
- **Right Panel (History/Stats):** `w-[300px] hidden xl:flex flex-col border-l border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]`

### 4. Smart Capture Buttons (Step 4 & 5)
*Ref: `src/components/Header.tsx`, `src/components/recording/ActionPanel.tsx`*

- **Header CTA:**
  - Style: `md3-btn-filled gap-2 shadow-lg shadow-primary/20`
  - Visibility: Controlled by Settings store.
- **In-Panel (Secondary):**
  - Style: `md3-btn-text text-sm w-full justify-start text-[var(--md-sys-color-on-surface-variant)] hover:text-primary`
  - Location: Bottom of the action list or inside a "More" menu.

### 5. Provenance Badges (Step 8)
*Ref: `src/components/common/ProvenanceBadge.tsx`*

**Styles (using index.css vars):**
- **Telemetry:** `bg-info-soft text-info border border-info-soft-strong px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider`
- **OCR:** `bg-accent-soft text-accent border border-accent-soft-strong px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider`
- **Manual:** `bg-warning-soft text-warning border border-warning-soft-strong px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider`

## Open Questions (Decided)
- **Bulk Actions:** Yes, implement "Inbox" style. Group OCR actions in the toolbar when multiple items selected.
- **Mapping Lock:** Make it "Per Session" by default, with a UI toggle to make "Persistent".
