# PM Handoff

This file is written by the `project-manager` agent.

## Decisions
- Workflow mode: parallel workstreams, but integrate via a single integration window (single-writer per file/area).
- Gate merges on: `npm test` and `npm run build`.
- UX focus: fix perceived Electron dev launch latency first (show a window immediately), then address UI clipping and discoverability.
- Data contract to add next: persisted per-field provenance on `Match` so UI can reliably show "assigned via telemetry/OCR/manual" across screens.

## Plan
Wave 01 (stabilize key UX pain points)
- Electron dev perceived launch: start Electron immediately; show splash; retry load until Vite is ready.
- Recording view: prevent clipping; allow scrolling.
- Smart Capture: promote to header; de-emphasize in-panel control.
- Analytics: make Detailed Analysis narrative match cockpit narrative style; keep graphs visible.
- Smart Captures list: reduce selection noise (checkbox only on hover/selected); remove arbitrary IDs as primary header text.

Wave 02 (finish the remaining gaps)
- Smart Captures panel redesign: spacing/hierarchy; OCR actions placement; "lock team mapping" UX; clearer status.
- Persisted provenance: store per-field sources on match records; surface consistently in Smart Captures/History/detail views.

## Agent Assignments
- ui-designer
  - Smart Captures panel redesign spec (layout, hierarchy, empty/error states).
  - Analytics detailed views spec aligned with cockpit glass style (narrative + graphs).
- backend-dev
  - Implement persisted match provenance (types + store + storage migration).
  - Optional: dev-only startup timing logs in `electron/main.cjs` to locate true bottlenecks.
- code-builder
  - Integrate UI changes from Wave 01/02 into working code.
  - Wire provenance indicators once backend lands the data model.
- testing-agent
  - Smoke coverage: Recording view scroll/clipping; Smart Captures selection affordance; Detailed Analysis narrative rendering.
- documentation-agent
  - Document `electron:dev` behavior (splash while Vite boots), and any env var overrides used for dev.

## Open Questions (for user)
- For provenance precedence: if telemetry and OCR disagree, should telemetry always win, unless manually overridden?
- Any max acceptable file size for local artifacts (to keep base64/image handling safe)?
