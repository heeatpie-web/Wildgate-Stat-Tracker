# Perk Telemetry Implementation Plan

## Goal
Detect in-game perk selections from telemetry and propagate them through match storage and analytics.

## Current State (Verified)
- `Match`/`Loadout` types already support perk fields (`perks`, `shipPerks`, `characterPerks`).
- `uidMappings.perks` exists for ID-to-name mapping.
- Analytics already has perk filters/dimensions (`getMatchPerks`, `EntityAnalyticsFilters.perk`).
- Telemetry ingestion currently parses hero/ship/weapons/equipment, but not perks.

## Go/No-Go Gate
Before parser work, confirm raw telemetry payloads actually carry perk identifiers/names.

Pass criteria:
- At least one reliable field/key path for perk data in `NebLoadoutSaved` (or another event).

Fail criteria:
- No perk data in any event payload currently captured.
- If failed, implementation must block and request upstream telemetry schema/event changes.

## Phased Plan

### Phase 0: Payload Discovery (No Behavioral Change)
1. Capture representative live telemetry payloads for:
   - `NebLoadoutSaved`
   - Any adjacent loadout-related events observed in the same window
2. Record concrete perk field candidates (keys, nesting, value type).
3. Define canonical extraction precedence (ID fields first, then display-name fallback).

Primary files:
- `src/hooks/useLogMonitor.ts`
- `electron/main.cjs` (only if additional useful-field extraction is needed)

### Phase 1: Perk Extraction + Match Wiring
1. Extend telemetry loadout extraction to parse perk candidates.
2. Resolve perk IDs via `uidMappings.perks`; register unknown IDs for mapper workflow.
3. Populate:
   - `loadout.perks`
   - `loadout.shipPerks` (if telemetry exposes ship-specific slots)
   - `loadout.characterPerks` (if telemetry exposes hero/prospector slots)
4. Optionally mirror to `match.perks` for legacy consumers.

Primary files:
- `src/hooks/useLogMonitor.ts`
- `src/components/patch/patchEntityCatalog.ts` (only if normalization tweaks are needed)
- `src/types.ts` (optional only, if provenance/raw-id fields are added)

### Phase 2: Analytics Validation + UX Consistency
1. Validate filters and dimensions pick up perks from real telemetry-backed matches.
2. Verify era/perk comparisons and selected-perk-set deltas remain sample-gated.
3. Ensure Smart Capture/Wizard surfaces show telemetry perk values consistently.

Primary files:
- `src/components/analytics/useAnalyticsData.ts`
- `src/components/analytics/AnalyticsShell.tsx`
- `src/components/Wizard.tsx`
- `src/components/SmartCapturesPanel.tsx`

### Phase 3: Tests and Safeguards
1. Add unit tests for perk extraction (including nested/variant payload shapes).
2. Add regression tests for filter behavior when `filters.perk` is set.
3. Add fallback behavior tests when perks are absent/unknown.

Primary files:
- `src/utils/__tests__/telemetryArchive.test.ts` (or new telemetry parsing tests)
- `src/components/analytics/*` tests where applicable

## Acceptance Criteria
- Telemetry-backed matches persist perk selections with stable names.
- Perk filters return expected subsets.
- Perk usage/win-rate rows appear in analytics when sample size is sufficient.
- No regression in existing hero/ship/weapon/equipment telemetry extraction.

## Risk and Complexity
- Risk: Medium (payload variability and mapping quality are the main risks).
- Complexity: Medium.
- Estimated touch points: 6-10 files (depending on payload shape and test depth).

## Suggested Execution Order
1. Phase 0 gate confirmation.
2. Phase 1 extraction in one focused PR.
3. Phase 2 analytics validation in a follow-up PR.
4. Phase 3 test hardening and cleanup.
