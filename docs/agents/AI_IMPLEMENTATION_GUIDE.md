# AI Agent Implementation Guide
## How to Use the UI Masterplan v3

This guide shows you how to instruct AI agents (Claude, ChatGPT, etc.) to implement the UI_MASTERPLAN.md specification.

---

## Quick Start Template

Copy-paste this template when starting a new UI implementation task:

```
Context: I'm working on the Wildgate Stat Tracker app. I have a comprehensive UI overhaul specification document.

Files attached:
- UI_MASTERPLAN.md (comprehensive UI spec & design system contract)
- [any relevant component files]

Task: [Describe specific task, e.g., "Implement Phase 2: Recording View fixes"]

Requirements:
1. Read the UI overhaul document, specifically the [relevant section]
2. Follow the exact specifications for [component/view]
3. Use design tokens from UI_MASTERPLAN.md (no hardcoded values)
4. Implement all interaction states (hover, active, focus, loading, disabled)
5. Ensure WCAG AA accessibility standards
6. Test at breakpoints: 1366x768, 1920x1080, 2560x1440, 390x844

Deliverables:
- Updated component files
- Before/after screenshots at required breakpoints
- Checklist confirming all QA criteria met

Please start by reading the specification document and confirming your understanding of the requirements.
```

---

## Phase-by-Phase Implementation

### Phase 1: Foundation (Tokens & Components)

**Agent Prompt:**
```
I'm implementing Phase 1 of the Wildgate UI overhaul: Foundation.

Attached:
- UI_MASTERPLAN.md
- src/index.css

Tasks from the overhaul spec (Phase 1 section):
1. Update src/index.css with all design tokens
2. Audit all components for hardcoded colors/sizes
3. Create Button component with variants (Primary, Secondary, Tertiary, Danger, Icon)
4. Create Input component with states (Default, Focus, Error, Disabled)
5. Implement motion tokens and reduced-motion fallback

Please:
1. Read the "Component Library > Buttons" section of the overhaul document
2. Review the code example provided
3. Create/update the Button component following the exact specifications
4. Include all states: default, hover, active, focus, disabled, loading
5. Use only CSS variables from UI_MASTERPLAN.md
6. Add TypeScript types for props

After implementation, provide:
- Component code
- Usage examples
- Confirmation that all 6 variants work correctly
```

### Phase 2: Recording View Overhaul

**Agent Prompt:**
```
I'm implementing Phase 2: Recording View Overhaul.

Attached:
- UI_MASTERPLAN.md
- src/components/RecordingView.tsx
- src/components/Header.tsx

Critical fixes from spec (View-by-View Specifications > Recording View):
1. FIX: Ship & Loadout heading size (must match other panels)
2. FIX: Add telemetry indicator to Ship & Loadout panel
3. FIX: Visual alignment of all panels
4. Implement WIN/LOSS/DRAW button states and animations
5. Add Smart Capture processing feedback

Please:
1. Read the "Recording View" section completely
2. Review the "Visual Hierarchy" table for exact sizing
3. Review the "Interaction Specifications" table for animation details
4. Implement all fixes in order
5. Test all states: Idle, Recording, Smart Capture Processing, Match Complete

Validation required:
- Screenshots before/after at 1366x768 and 1920x1080
- Confirm all 3 telemetry indicators work (Ship & Loadout, Roster Manager, Prospector)
- Confirm keyboard navigation works through all panels
```

---

## Specific Component Implementation

### Example: Button Component

**Agent Prompt:**
```
Create a Button component following the exact specifications in UI_MASTERPLAN.md.

Specifications location: "Component Library > Buttons"

Requirements from spec:
- 5 variants: Primary (Filled), Secondary (Tonal), Tertiary (Text), Danger (Filled), Icon Button
- 6 states: Default, Hover, Active, Focus, Disabled, Loading
- Sizes from spec table (Primary: 48px height, Secondary: 40px, etc.)
- Use design tokens only (--md-sys-color-*, --md-sys-shape-*, --md-motion-*)
- Material Design ripple effect on click
- Keyboard focus visible (2px primary outline, 4px offset)

The spec includes a code example starting with:
```const Button = ({ variant = 'primary', disabled, loading, onClick, children }) => {...}```

Please:
1. Implement the component with TypeScript
2. Add all variants and states exactly as specified
3. Include ripple animation (300ms duration)
4. Add hover transitions (150ms ease-out)
5. Support reduced-motion preference
6. Export proper TypeScript types

Test cases:
- All 5 variants render correctly
- Hover changes appear smoothly
- Click triggers ripple from click point
- Disabled state prevents interaction
- Loading shows spinner and disables button
- Keyboard focus shows visible outline
```

### Example: Specific View Fix

**Agent Prompt:**
```
Fix the Ship & Loadout heading size issue in RecordingView.

Issue from overhaul spec (Recording View > Critical Fixes):
- Current: Ship & Loadout heading is smaller than Roster Manager/Mission Intel headings
- Target: --md-sys-typescale-title-medium (16px), 600 weight, matching other panel headings exactly

Files attached:
- UI_MASTERPLAN.md
- src/components/RecordingView.tsx

Steps:
1. Locate the Ship & Loadout panel heading
2. Update size to --md-sys-typescale-title-medium
3. Update weight to 600
4. Ensure it matches Roster Manager and Mission Intel headings exactly
5. Verify visual alignment (all heading baselines should align horizontally)

Before making changes:
- Show me the current heading code
- Show me the Roster Manager heading code for comparison

After making changes:
- Provide updated code
- Explain what changed
- Confirm the fix addresses the spec requirement
```

---

## Common Patterns

### Pattern 1: "Read spec first, then implement"

```
Task: Implement Analytics Insights panel

Before writing any code:
1. Read the "Analytics View > Insights Implementation" section of UI_MASTERPLAN.md
2. List the 5 insight types specified
3. Note the presentation requirements (md3-card, accent border, etc.)
4. Confirm you understand the expandable behavior

Then proceed with implementation following the exact specifications.
```

### Pattern 2: "Use the spec tables for exact values"

```
Task: Style the player profile stat line

Reference: "Players View > Visual Hierarchy" table in the overhaul spec

The table specifies:
- Element: "Player profile stat line"
- Size/Weight: --md-sys-typescale-body-small
- Color: On-surface
- Placement: Right panel when player selected, below player name/avatar

Implement exactly as specified in the table. Do not improvise sizing or placement.
```

### Pattern 3: "Follow interaction specs for animations"

```
Task: Add hover effect to History table rows

Reference: "History View > Interaction Specifications" table

The spec says:
- Interaction: "Hover table row"
- Visual Feedback: "8% white overlay, cursor pointer"
- Duration: "150ms ease-out"
- Sound: "None"

Implement this exact behavior. Use:
- CSS transition: all 150ms var(--md-motion-easing-standard)
- Hover overlay: rgba(255, 255, 255, 0.08)
- Cursor: pointer
```

---

## Quality Checklist for AI Agents

After every implementation, ask the AI to confirm:

```
Before marking this task complete, confirm you have:

Functional:
[ ] All interactive elements respond to click/tap
[ ] Loading states display during async operations
[ ] Success/error feedback appears for critical actions
[ ] Forms validate and show error states
[ ] Navigation works bidirectionally

Visual:
[ ] No UI clipping at 1366x768, 1920x1080, 2560x1440, 390x844
[ ] Text remains readable at all sizes
[ ] Spacing uses 8px grid system (8, 16, 24, 32px only)
[ ] All colors use CSS variables (no hardcoded hex)
[ ] Glassmorphic panels show blur and transparency correctly

Accessibility:
[ ] WCAG AA contrast ratios met (4.5:1 normal, 3:1 large/UI)
[ ] All interactive elements keyboard-reachable
[ ] Visible focus indicators on all focusable elements
[ ] No keyboard traps in modals/overlays
[ ] Icon-only controls have accessible labels
[ ] Status not communicated by color alone

Performance:
[ ] Animations run at 60fps
[ ] No layout thrashing
[ ] Reduced-motion preference respected

Code Quality:
[ ] No console errors or warnings
[ ] Props validated with TypeScript
[ ] No hardcoded values (use design tokens)
[ ] No !important overrides (unless documented)
```

---

## Troubleshooting Common Issues

### Issue: AI not following exact specifications

**Solution:** Be more directive:
```
You must follow the specification EXACTLY as written. Do not improvise or "improve" the design.

Specifically:
- Button height MUST be 48px for Primary variant (not 44px, not 50px)
- Hover transition MUST be 150ms ease-out (not 200ms, not ease-in-out)
- Color MUST be --md-sys-color-primary (not a hardcoded hex value)

Please re-read the "Component Library > Buttons > Button Variants" table and implement exactly as specified.
```

### Issue: AI making the code too complex

**Solution:**
```
Keep the implementation simple and maintainable. 

The spec shows a clear example:
```const Button = ({ variant = 'primary', disabled, loading, onClick, children }) => {...}```

Use this pattern. Don't add:
- Unnecessary abstractions
- Complex state management
- Extra props not in the spec
- Over-engineered animation systems

Simple, spec-compliant implementation is better than clever code.
```

### Issue: AI not checking all states

**Solution:**
```
You must implement ALL states specified in the "Button States" table:
1. Default - base colors, no overlay
2. Hover - 8% white overlay, 150ms transition
3. Active - 12% white overlay, scale(0.98), 100ms
4. Focus - 12% overlay + 2px primary outline
5. Disabled - 40% opacity, no hover effects
6. Loading - spinner replaces content, disabled

After implementation, show me screenshots or code examples of ALL 6 states working.
```

---

## Integration with Existing Workflow

### Step 1: Add document to project

Both documents live in `docs/agents/`:
- `docs/agents/UI_MASTERPLAN.md` - Comprehensive UI spec (single source of truth)
- `docs/agents/AI_IMPLEMENTATION_GUIDE.md` - This guide

### Step 2: Reference in prompts

When working with AI agents:
```
Context files:
- docs/agents/UI_MASTERPLAN.md (comprehensive UI spec & design system contract)
- docs/agents/AI_IMPLEMENTATION_GUIDE.md (agent workflow guide)
```

---

## Example: Full Implementation Session

Here's a complete example of working with an AI agent on a specific task:

**Prompt:**
```
I'm implementing the Analytics Insights feature for Wildgate Stat Tracker.

Attached files:
- UI_MASTERPLAN.md
- src/components/AnalyticsView.tsx
- src/components/InsightCard.tsx (if exists, otherwise create)

Task: Implement the Insights panel as specified in the overhaul document.

Step 1: Read the specification
Please read the following sections of UI_MASTERPLAN.md:
- "Analytics View > Insights Implementation"
- "Component Library > Cards & Surfaces"
- "Animation & Motion Guidelines > Common Animation Patterns"

Step 2: Confirm understanding
After reading, please summarize:
- What are the 5 insight types that should be detected?
- How should insights be presented visually?
- What happens when a user clicks an insight card?
- What animation should be used for expand/collapse?

Step 3: Implementation plan
Propose:
- Component structure (InsightCard, InsightPanel, etc.)
- Data structure for insights
- Animation approach for expandable behavior

Step 4: Implementation
Once I approve the plan:
- Create/update components following the exact specifications
- Use design tokens only (no hardcoded values)
- Implement expand/collapse animation (250ms ease-in-out)
- Add accent-colored left border (4px)
- Limit to 3-5 most interesting insights

Step 5: Validation
Provide:
- Component code
- Screenshots showing insights panel with sample data
- Demonstration of expand/collapse animation
- Confirmation of QA checklist items

Please start with Step 1 and proceed through each step.
```

---

## Tips for Success

### 1. **Always provide the spec document**
Don't assume the AI remembers it. Attach it to every relevant conversation.

### 2. **Reference specific sections**
"Read the Recording View section" is better than "implement the recording view"

### 3. **Use the tables**
The spec has detailed tables with exact values. Reference them: "Use the Visual Hierarchy table for sizing"

### 4. **Demand exact compliance**
The spec exists to prevent drift. Don't let AI "improve" things.

### 5. **Check all states**
Default, hover, active, focus, disabled, loading - all must work

### 6. **Request evidence**
Ask for screenshots, code examples, or demonstrations of functionality

### 7. **Work in phases**
Don't try to implement everything at once. Follow the roadmap phases

### 8. **Update the spec as you learn**
If you discover issues, update the overhaul doc and UI_MASTERPLAN.md

---

## Advanced: Multi-Agent Workflow

For complex features, you can split work across multiple AI agents:

**Agent 1 (Design Token Auditor):**
```
Task: Audit RecordingView.tsx for hardcoded values
Reference: UI_MASTERPLAN.md section 3 (Design System Contract)

Find and list:
- All hardcoded colors (hex, rgb, hsl)
- All hardcoded sizes (px values that should be tokens)
- All hardcoded border-radius values
- All hardcoded animation durations

For each finding, suggest the correct token from UI_MASTERPLAN.md
```

**Agent 2 (Component Implementer):**
```
Task: Fix the hardcoded values found by Agent 1
Reference: Audit results + UI_MASTERPLAN.md

Replace each hardcoded value with the appropriate design token.
Verify the component still looks correct after changes.
```

**Agent 3 (QA Validator):**
```
Task: Validate the updated component against QA criteria
Reference: "Quality Assurance Criteria" section of overhaul doc

Check:
- All functional requirements met
- All visual requirements met
- All accessibility requirements met
- All performance requirements met

Provide checklist with pass/fail for each item.
```

---

## Monitoring Progress

Create a tracking document:

```markdown
# UI Overhaul Implementation Tracker

## Phase 1: Foundation ✅ COMPLETE
- [x] Update design tokens in src/index.css
- [x] Audit components for hardcoded values
- [x] Create Button component (all variants)
- [x] Create Input component (all states)
- [x] Implement motion tokens

## Phase 2: Recording View 🔄 IN PROGRESS
- [x] Fix Ship & Loadout heading size
- [x] Add telemetry indicator
- [ ] Align panels visually
- [ ] WIN/LOSS/DRAW button states
- [ ] Smart Capture feedback

## Phase 3: Analytics & Smart Captures ⏳ PENDING
...

## Issues & Decisions
- 2025-02-13: Decided to use React Transition Group for panel slides instead of custom CSS
  - Reason: Better TypeScript support and more reliable
  - Documented in docs/agents/DECISIONS.md
```

This keeps you organized and provides context for future AI agent sessions.

---

## Final Checklist: "Is this ready to hand to an AI agent?"

Before starting an implementation session, confirm:

- [ ] I have UI_MASTERPLAN.md attached
- [ ] I have UI_MASTERPLAN.md attached
- [ ] I have the relevant component files attached
- [ ] I've identified the specific section of the spec to implement
- [ ] I've defined clear deliverables
- [ ] I've specified the QA criteria the agent must meet
- [ ] I'm ready to review the agent's work against the spec

If all boxes are checked, you're ready to go!
