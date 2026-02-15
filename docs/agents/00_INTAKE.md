# Intake - 2026-02-14

## Request (Current)
- Add a three-way telemetry performance toggle:
  - `Low Power`
  - `Balanced`
  - `High Accuracy`
- The toggle must be user-facing in Settings and must change actual runtime telemetry monitoring behavior.

## Intent Confirmation
- Goal: reduce or increase telemetry monitoring load based on chosen profile.
- Constraints: keep scope narrow to telemetry monitoring path; persist preference; preserve existing behavior as default.
- Done condition: settings toggle exists, persists, and is consumed by Electron log monitoring loop.

## Request
- Evaluate how performance-heavy the app is, with emphasis on decode/telemetry work.
- Investigate and fix screenshot bundling not linking reliably to Smart Captures.
- Investigate and fix win/loss/draw and match-history-to-smart-capture sync drift.

## Scope
- In-scope:
  - Telemetry/decode execution path review for runtime overhead.
  - Artifact bundling/linking flow (`save-screenshot`, `bundle-artifacts`, submission sync).
  - Result/state synchronization path at submission boundary.
- Out-of-scope:
  - Broad UI redesign.
  - OCR model quality tuning.
  - New telemetry features unrelated to this defect.

## Constraints
- Keep fix minimal and targeted to the reported regressions.
- Preserve existing data model and IPC contracts.
- Provide validation evidence for each implemented change.

## Acceptance Criteria
- Smart-captured screenshots are attached to the same match without requiring manual Artifact Repair.
- Match history and Smart Captures maintain 1:1 artifact/result coherence after submission.
- Performance assessment includes concrete runtime hotspots and whether decode path is high-demand.
- Regression checks pass for touched logic.

## AOM_V2
- Risk Tier: `T2`
- Execution Path: `FULL_PATH`
- Reason: Runtime logic changes across Electron IPC + submission flow with user-visible data integrity impact.

---

## Intake - 2026-02-15 - TELEMETRY-BASTION-001
- Goal: fix telemetry ship/hero recognition behavior where detection appears stuck to a single ship (reported as bastion-only).
- Constraints: keep scope narrow to telemetry loadout parsing in monitor path; no UI changes; no contract changes.
- Out-of-scope: OCR extraction changes, analytics logic, new mappings dataset.
- Done condition:
  - Telemetry loadout can resolve ship/hero from raw fields even when GUIDs are missing.
  - Existing GUID-based behavior remains intact.
  - Validation evidence recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: runtime telemetry parsing behavior changes in active monitoring path.

---

## Intake - 2026-02-15 - BUG-BATCH-001
- Goal: address reported multi-bug list with first-pass fixes focused on data integrity and high-friction UX in Smart Captures/Settings/Recording.
- Constraints: keep changes targeted; avoid schema/IPC contract changes; preserve existing workflows.
- In scope (this pass):
  - OCR apply flow persisting match fields in Smart Captures.
  - OCR roster fuzzy matching + teammate cap enforcement in Smart Captures paths.
  - Smart Captures action to open Wizard for manual entry.
  - Telemetry ship indicator matching normalization.
  - Telemetry profile visibility and capture-mode copy clarity in Settings.
  - Performance-mode rendering simplification (reduce blur/shadow load).
- Out of scope (deferred):
  - Full settings IA redesign into tabbed hierarchy.
  - Overlay navigation parity for all tabs.
  - Deep analytics pro-view clickthrough behavior.
- Done condition:
  - Targeted fixes implemented and validated (`typecheck` + eslint for touched TS/TSX files).
  - Remaining items explicitly listed in handoff.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime behavior changes across multiple user-facing paths.

---

## Intake - 2026-02-15 - BUG-BATCH-002
- Goal: fix Recording view clipping where the bottom of Match Recording is cut off at normal window sizes.
- Constraints:
  - Keep scope narrow to `RecordingView` layout behavior.
  - Avoid changing existing recording panel business logic.
  - Preserve existing wide/narrow layout intent.
- Out-of-scope:
  - Full settings IA/tab redesign.
  - Analytics deep-dive navigation behavior.
  - Overlay navigation parity changes.
- Done condition:
  - Recording view mode selection uses actual available container space.
  - Constrained-height wide layout exposes fallback scroll instead of clipping content.
  - Targeted tests/lint/typecheck pass and evidence is logged.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: user-visible runtime layout behavior change in primary recording workflow.

---

## Intake - 2026-02-15 - BUG-BATCH-003
- Goal: clarify settings hierarchy by breaking the modal into clickable tabs.
- Constraints:
  - Keep scope to `src/components/SettingsModal.tsx`.
  - Preserve existing settings behavior and persistence.
  - No schema/IPC contract changes.
- Out-of-scope:
  - Full redesign of settings content cards/copy.
  - New settings values or back-end behavior.
- Done condition:
  - Settings modal has clear tab navigation for section hierarchy.
  - Existing settings controls remain functional under tab gating.
  - Validation evidence recorded (`eslint` + `typecheck`).
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: user-visible UI hierarchy/interaction change in a core modal.

---

## Intake - 2026-02-15 - BUG-BATCH-004
- Goal: implement remaining open UX items from the reported bug list:
  - add more sound indicators,
  - make Pro Analytics deep-dive entry reliably clickable,
  - restore overlay access parity for social/related destinations,
  - smooth transitions when switching main views.
- Constraints:
  - Keep scope to UI/interaction layer; avoid schema/API changes.
  - Preserve existing workflows and data semantics.
- Out-of-scope:
  - New analytics calculations or telemetry parsing changes.
  - Full overlay layout redesign.
- Done condition:
  - Sound cues trigger on key UI feedback/events when enabled.
  - Pro mode has explicit, reliable deep-dive open action per panel.
  - Overlay exposes mission/squadron/social parity and quick navigation out to relevant full views.
  - Main view switching has a consistent transition.
  - Validation evidence recorded (`eslint` + `typecheck`).
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file, user-visible runtime interaction updates across core app surfaces.
