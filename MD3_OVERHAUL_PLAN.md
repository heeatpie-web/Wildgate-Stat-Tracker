# MD3 Overhaul Plan (Phased)

Owner: Codex  
Scope: Full UI overhaul to Material Design 3 (MD3) with motion + component standards  
Status: In progress

## References
- Material 3 design system overview: https://developer.android.com/develop/ui/compose/designsystems/material3
- Motion scheme (standard/expressive, effects/spatial): https://developer.android.com/reference/kotlin/androidx/compose/material3/MotionScheme
- Typography tokens: https://developer.android.com/reference/kotlin/androidx/compose/material3/Typography

## Phase 0: Baseline + Token Layer
- Add MD3 color role tokens: primary/secondary/tertiary/error/surface/surfaceVariant + on-* roles.
- Add surface container tiers: surfaceContainerLow/Normal/High/Highest.
- Add motion tokens: durations, easing curves for standard + expressive.
- Add typography scale variables aligned to MD3 (title/body/label).

## Phase 1: MD3 Primitives
- Buttons: filled, filled tonal, outlined, text, icon.
- Cards: elevation tiers + tonal surfaces.
- Chips: filter/assist/suggestion + selected state.
- Text fields: filled/outlined variants with leading icons.
- Lists: one-line, two-line, with trailing actions.
- Navigation rail: selected/hover states, label alignment.
- Banners: info/warn/error using container roles.
- Dialogs: MD3 modal visuals + buttons.

## Phase 2: Recording View (HIG -> MD3)
- Replace all panel shells with MD3 cards.
- Convert primary actions to MD3 filled buttons / extended FAB.
- Replace selection grids with chips.
- Re-map status badges to container roles.
- Apply motion tokens to state transitions.

## Phase 3: Smart Captures
- Left rail: MD3 navigation rail + search field.
- Match list: MD3 list + proper selection surface.
- Detail area: cards with clear hierarchy + primary action emphasis.
- Remove extraneous dividers; rely on tonal surfaces.

## Phase 4: Match History
- Replace layout with MD3 card stacks and list rows.
- Standardize badges/chips and selection styles.

## Phase 5: Analytics
- Wrap charts/tables in cards.
- Use chips/tabs for filters.
- Ensure drill-down pages scroll correctly.

## Phase 6: Settings + Dialogs
- Convert settings to MD3 list sections.
- Standardize dialogs to MD3.

## Phase 7: Motion Pass + QA
- Apply standard motion to most interactions.
- Apply expressive motion to primary flows.
- Check contrast, spacing, and alignment across light/twilight/dark.

## Implementation Notes
- Prefer MD3 role tokens in CSS; avoid raw hex in components.
- Keep motion subtle; only one expressive animation per major panel.

