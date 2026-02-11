# Backend Handoff

This file is written by the `backend-dev` agent.

## Data Model / Contracts
Persist per-field provenance on stored match records so any UI can reliably display "assigned via telemetry/OCR/manual" and whether the user overrode it.

Proposed shape (example)
- `Match.provenance`
  - `ship`: `telemetry` | `ocr` | `manual` | `unknown`
  - `prospector`: `telemetry` | `ocr` | `manual` | `unknown`
  - `teams`: `telemetry` | `ocr` | `manual` | `unknown`
  - `loadout`: `telemetry` | `ocr` | `manual` | `unknown`
  - Optional: `modifiers` / `hazards` sources if those are auto-derived.

Contract rules
- Precedence: telemetry > OCR, unless user explicitly overrides (then source becomes `manual` and UI should show "telemetry detected but overridden").
- Backcompat: existing matches default to `unknown` (or infer where safe, but do not guess incorrectly).

## Implementation Notes
- Update types (`src/types.ts`) and storage shape (`src/utils/storage.ts`) with a migration that backfills defaults.
- Ensure provenance is written whenever a match is saved/updated, not only during capture.
- Prefer additive changes that do not break existing saved DB data.

## Risks / Edge Cases
- Migration safety: user DB files can be large; keep migration O(n) and avoid rewriting excessively.
- Consistency: multiple sources updating the same match in quick succession (telemetry monitor + OCR pipeline) can race; ensure last-write-wins does not corrupt provenance (write provenance alongside the field update).
- UI expectation: "unknown" must render cleanly (no scary red states).

## Open Questions (for PM)
- Should provenance be tracked per-field only, or also per-subfield (e.g., per crew slot)?
- Do we want to persist "confidence" for OCR-derived fields?
