# Plan - 2026-02-14

1. `COMPLETED` - Reproduce/trace current flow for telemetry decode, artifact bundling, and submission syncing.
2. `COMPLETED` - Implement targeted fixes for artifact bundling and submission artifact synchronization.
3. `COMPLETED` - Add/adjust regression tests for submission artifact sync behavior.
4. `COMPLETED` - Run focused test suite and sanity checks.
5. `COMPLETED` - Summarize performance findings and final handoff with evidence.

## Current Task Plan (Telemetry Performance Profiles)
1. `COMPLETED` - Identify settings, persistence, UI, and main-process monitoring integration points.
2. `COMPLETED` - Add persisted telemetry performance profile setting and Settings UI 3-way toggle.
3. `COMPLETED` - Wire selected profile into `start-log-monitoring` and apply profile-specific monitoring behavior in Electron main.
4. `COMPLETED` - Run targeted validation (tests/typecheck/lint) and document final behavior.

## Current Task Plan (TELEMETRY-BASTION-001)
1. `COMPLETED` - Trace telemetry loadout resolution path and confirm where ship/hero updates are gated.
2. `COMPLETED` - Implement minimal parser fix in `src/hooks/useLogMonitor.ts` for raw-field fallback without GUID.
3. `COMPLETED` - Run targeted validation (`typecheck`, eslint on touched file) and log evidence.
4. `COMPLETED` - Record handoff summary and residual risk.

## Current Task Plan (BUG-BATCH-001)
1. `COMPLETED` - Map reported bug list to concrete code paths and choose first-pass high-impact subset.
2. `COMPLETED` - Fix Smart Captures OCR-apply persistence + fuzzy roster matching + teammate capacity handling.
3. `COMPLETED` - Add Smart Captures manual Wizard entry action and normalize telemetry ship indicator matching.
4. `COMPLETED` - Improve Settings telemetry/capture clarity and strengthen performance-mode render reduction.
5. `COMPLETED` - Run targeted validation and record outcomes.

## Current Task Plan (BUG-BATCH-002)
1. `COMPLETED` - Trace Recording view clipping path and confirm layout threshold/overflow root cause.
2. `COMPLETED` - Update `RecordingView` to use measured container dimensions for density/narrow decisions.
3. `COMPLETED` - Add constrained-height fallback scrolling in wide layout to prevent bottom clipping.
4. `COMPLETED` - Extend `RecordingView` test coverage for constrained-height wide behavior.
5. `COMPLETED` - Run targeted validation and document outcomes.

## Current Task Plan (BUG-BATCH-003)
1. `COMPLETED` - Review current settings section structure and map grouping for tab hierarchy.
2. `COMPLETED` - Add top-level settings tab navigation with overlay-safe tab availability.
3. `COMPLETED` - Gate existing sections by tab (`Identity`, `Interface`, `OCR/Capture`, `Data`) without changing setting behavior.
4. `COMPLETED` - Run targeted validation and record outcomes.

## Current Task Plan (BUG-BATCH-004)
1. `COMPLETED` - Map each remaining open item to concrete implementation files.
2. `COMPLETED` - Implement additional sound indicators via shared cue utility + toast/view hooks.
3. `COMPLETED` - Improve Pro Analytics deep-dive entry reliability with explicit actionable controls.
4. `COMPLETED` - Restore overlay parity by adding mission/squadron/social tab access and quick jumps to relevant full views.
5. `COMPLETED` - Add cross-view transition animation for smoother main view switching.
6. `COMPLETED` - Run targeted validation and record outcomes.

## Current Task Plan (DEV-SPLASH-RETRY-001)
1. `COMPLETED` - Trace all dev startup splash progress writers and confirm root cause of percentage rollback.
2. `COMPLETED` - Implement monotonic splash progress handling so retries never decrease shown percentage.
3. `COMPLETED` - Run targeted validation (`npx eslint electron/main.cjs`) and code-path sanity check.
4. `COMPLETED` - Record execution, validation, and handoff evidence; then release locks.

## Current Task Plan (TAB-LOADING-STARTUP-001)
1. `COMPLETED` - Trace tab-switch render path and confirm source of first-startup "Loading view..." flashes.
2. `COMPLETED` - Add scoped background preloading for lazy dashboard view chunks in `src/App.tsx`.
3. `COMPLETED` - Run targeted validation (`npx eslint src/App.tsx` + `npm run -s typecheck`).
4. `COMPLETED` - Record execution/validation/handoff entries and release lock.

## Current Task Plan (OCR-HYDRATION-COMBINED-001)
1. `COMPLETED` - Implement deterministic OCR alias engine + mapping slice model/actions with compatibility wrapper.
2. `COMPLETED` - Wire persistence/hydration for alias model + new settings flags in `useAppStore`.
3. `COMPLETED` - Integrate resolver/preload controls into `useSmartScan`, `App`, and `SettingsModal`.
4. `COMPLETED` - Add/adjust targeted unit tests for alias engine and mapping slice behavior.
5. `COMPLETED` - Run validation (`eslint` touched files, targeted tests, `typecheck`) and record evidence/handoff.

## Current Task Plan (ADV-AUTOLEARN-V2-001)
1. `COMPLETED` - Extend OCR alias engine + mapping slice with learning event queue/history/rollback lifecycle and resolver explainability metadata.
2. `COMPLETED` - Add advanced settings/state persistence for learning governance, recommendation mode/history, and adaptive preload controls.
3. `COMPLETED` - Integrate learning queue actions into smart-scan/app review flows and extend Review Queue/Settings UI controls.
4. `COMPLETED` - Implement corpus threshold recommendation script + Electron IPC exposure and wire settings apply/revert flow.
5. `COMPLETED` - Upgrade startup preload scheduler to adaptive ordering with local usage telemetry and budget gating.
6. `COMPLETED` - Expand tests (engine + mapping slice) and run validation (`typecheck`, targeted tests, touched-file eslint).

## Current Task Plan (DEV-STARTUP-HOOKS-001)
1. `COMPLETED` - Trace settings crash path and identify hook-order mismatch root cause.
2. `COMPLETED` - Fix hook ordering in `SettingsModal` so hooks execute in stable order across closed/open states.
3. `COMPLETED` - Update dev startup command so Electron launches immediately and splash can render before Vite is ready.
4. `COMPLETED` - Reduce startup blocking by deferring/backgrounding non-critical init in `electron/main.cjs`.
5. `COMPLETED` - Run validation (`typecheck`, targeted eslint) and record evidence.

## Current Task Plan (PROFILE-SETTINGS-MERGE-001)
1. `COMPLETED` - Locate sidebar profile hub and standalone settings entry points.
2. `COMPLETED` - Remove standalone settings navigation button from sidebar.
3. `COMPLETED` - Retarget tutorial settings step to profile hub selector.
4. `COMPLETED` - Run validation (`typecheck`, targeted eslint) and record evidence.

## Current Task Plan (PROFILE-BUTTON-WIDTH-001)
1. `COMPLETED` - Inspect sidebar profile button and nav button container width classes to identify mismatch source.
2. `COMPLETED` - Apply minimal class fix so profile wrapper uses full-width lane.
3. `COMPLETED` - Run targeted validation (`npx eslint src/components/Sidebar.tsx`, `npm run typecheck`).
4. `COMPLETED` - Record execution, validation, and handoff evidence.

## Current Task Plan (OVERLAY-NAV-RECORDING-LAYOUT-001)
1. `COMPLETED` - Trace overlay navigation button handlers and identify forced full-view exits.
2. `COMPLETED` - Update overlay nav controls to in-overlay tab switching and add explicit full-view actions.
3. `COMPLETED` - Rework recording layout ordering so Match Recording renders above Mission Intel.
4. `COMPLETED` - Update/extend targeted RecordingView layout tests for new structure.
5. `COMPLETED` - Run validation (`vitest`, touched-file eslint, `typecheck`) and record evidence.

## Current Task Plan (RECORDING-ROLLBACK-ALIGN-001)
1. `COMPLETED` - Restore Recording view panel placement to prior left-column behavior (with compact Actions/Loadout toggle).
2. `COMPLETED` - Normalize dashboard shell spacing across Analytics/History/Players/Smart Captures to remove top-offset mismatch.
3. `COMPLETED` - Update RecordingView tests to match restored behavior.
4. `COMPLETED` - Run validation (`npx vitest`, touched-file `eslint`, `npm run typecheck`) and record evidence.

## Current Task Plan (OCR-ADAPTIVE-RESOLUTION-001)
1. `COMPLETED` - Implement shared OCR variant/context resolver foundation (`stringUtils` extensions + new shared resolver utility).
2. `COMPLETED` - Integrate shared resolver + canonical dedupe into `useSmartCapture`, `useSmartScan`, and `App` OCR apply flow.
3. `COMPLETED` - Add guarded corpus auto-growth pipeline from OCR review (`preload` allowlist + `main` IPC handler + `OCRReviewModal` fire-and-forget hook).
4. `COMPLETED` - Update security allowlist negative tests and add/expand targeted unit tests for new similarity behavior.
5. `COMPLETED` - Run validation (`typecheck`, touched-file eslint, targeted tests, security-negative tests), record evidence, and finalize handoff.

## Current Task Plan (VERSION-CHANGELOG-001)
1. `COMPLETED` - Locate authoritative app version sources and changelog file.
2. `COMPLETED` - Bump package/app version values to the next release.
3. `COMPLETED` - Add release notes entry for the bumped app version in `src/utils/changelog.ts`.
4. `COMPLETED` - Run targeted validation on touched metadata files and record evidence.

## Current Task Plan (IDMAPPER-TELEMETRY-SHIP-001)
1. `COMPLETED` - Trace ID Mapper badge rendering and telemetry ship GUID/name extraction to identify precise failure points.
2. `COMPLETED` - Patch telemetry ship parsing in `src/hooks/useLogMonitor.ts` to reject non-GUID IDs and improve raw ship-name extraction.
3. `COMPLETED` - Patch `src/components/IdMapper.tsx` to avoid misleading `Unknown` role badge for already mapped IDs.
4. `COMPLETED` - Run targeted validation (`eslint` touched files + `typecheck`) and log evidence.
5. `COMPLETED` - Record execution decisions and handoff summary.

## Current Task Plan (IDMAPPER-TELEMETRY-LOADOUT-002)
1. `COMPLETED` - Update ID mapper unknown-save flow to write type-aware mappings (`players/ships/weapons/equipment`).
2. `COMPLETED` - Expand telemetry loadout extraction to capture weapon/equipment candidates from additional GUID/name fields.
3. `COMPLETED` - Surface telemetry-detected weapons/equipment in `ActionPanel` status summary.
4. `COMPLETED` - Run targeted validation (`eslint` touched files + `typecheck`) and log evidence.
5. `COMPLETED` - Record execution addendum and handoff notes.
