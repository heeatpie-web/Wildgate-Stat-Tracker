# Specifications

## Goal
Address current UX/performance issues in Wildgate Stat Tracker (Electron + Vite + React) using the `vibe-dev-redux` workflow:
Project Manager -> UI Designer -> Backend Dev -> Code Builder -> Testing Agent -> Documentation Agent.

## Scope (Current Issues)
- `electron:dev` perceived launch is too slow: show a window immediately and transition to the app once Vite is ready.
- Match Recording panel can be clipped on smaller window heights.
- Smart Capture action is buried; it should be more prominent (ideally in the header) and the in-panel control should be de-emphasized.
- Analytics "Detailed Analysis" feels incomplete: narrative mode should match cockpit narrative (stats + numbers), detailed views should keep the glass style, and graphs should remain visible.
- Smart Captures panel is cramped/unclear: improve spacing/hierarchy; cluster OCR actions; reduce selection UI noise; avoid arbitrary IDs as primary labels.
- Telemetry assignment/provenance should be clear across the app (assigned via telemetry/OCR/manual; show overrides).

## Acceptance Criteria
- `npm run electron:dev` shows an Electron window quickly (splash OK) even if Vite is still booting; app loads once Vite is available.
- Recording view never clips key controls; left column scrolls when needed.
- Smart Capture is discoverable from the header; capture UX remains functional.
- Detailed analytics narrative contains structured sections + metrics (not a short blurb) and graphs remain visible.
- Smart Captures list selection affordance is not always visible; rows are readable and status is clear.
- Automated checks remain green: `npm test` and `npm run build`.
