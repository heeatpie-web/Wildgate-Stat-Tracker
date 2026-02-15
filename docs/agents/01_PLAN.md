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
