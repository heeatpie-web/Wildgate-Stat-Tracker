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

---

## Intake - 2026-02-15 - DEV-SPLASH-RETRY-001
- Goal: fix dev-mode startup splash where progress can jump backward (for example 90% to ~30%) while retrying dev server connection.
- Constraints:
  - Keep scope narrow to dev startup splash/probe logic in `electron/main.cjs`.
  - Do not change packaged/production startup behavior.
  - Preserve retry behavior and status visibility when dev server is actually unavailable.
- Out-of-scope:
  - Vite config or dev server process management changes.
  - Splash visual redesign.
  - Broad startup refactors outside splash progress handling.
- Done condition:
  - Splash progress percentage is monotonic in dev startup (no backward jumps).
  - Retry status text/detail still updates while waiting for dev server.
  - Validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: runtime behavior change in Electron dev startup path.

---

## Intake - 2026-02-15 - TAB-LOADING-STARTUP-001
- Goal: remove first-startup tab-switch "Loading view..." flashes when moving between dashboard views.
- Constraints:
  - Keep scope narrow to dashboard view-loading behavior in `src/App.tsx`.
  - Preserve existing lazy-loading architecture and fallback for true slow/failure cases.
  - Avoid broad navigation/layout refactors.
- Out-of-scope:
  - Sidebar redesign or routing-system changes.
  - Replacing React lazy/suspense across the app.
  - Unrelated startup/performance tuning.
- Done condition:
  - Main dashboard tab chunks are preloaded in background after startup.
  - First switches between common tabs no longer depend on on-demand lazy fetch at click time.
  - Validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: runtime UX behavior change in startup/tab navigation path.

---

## Intake - 2026-02-15 - OCR-HYDRATION-COMBINED-001
- Goal: implement combined MVP-plus feature set:
  - deterministic local OCR active-learning model with guardrails,
  - startup/view hydration preload overhaul to reduce first-switch loading flashes.
- Constraints:
  - Keep implementation local-only (no cloud/model backend dependencies).
  - Preserve current OCR/manual correction UX while improving resolution quality.
  - Preserve lazy-loading architecture and Suspense safety fallback.
  - Keep data persistence backward-compatible with existing `ocrCorrections`.
- Out-of-scope:
  - Cloud sync of learning model.
  - LLM-assisted correction disambiguation.
  - Full navigation/router rewrite.
  - Breaking persistence schema changes without compatibility layer.
- Done condition:
  - OCR alias model/actions exist with deterministic scoring, ambiguity guardrails, and compatibility wrapper.
  - OCR resolution call-sites use shared resolver in scan/app flows.
  - Startup preload is staged/gated (hydration/perf mode/settings) and fallback behavior is safer.
  - Settings expose OCR learning + preload controls.
  - Validation evidence logged (`eslint`, `typecheck`, targeted tests).
- AOM_V2:
  - Risk Tier: `T3`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime behavior and persistence changes across store, OCR pipeline, and startup rendering.

---

## Intake - 2026-02-15 - ADV-AUTOLEARN-V2-001
- Goal: implement the full advanced auto-learning bundle after MVP:
  - OCR learning conflict-review + rollback governance.
  - Corpus-driven threshold recommendation pipeline with safe apply/revert.
  - Adaptive startup preload scheduler using local usage telemetry.
- Constraints:
  - Preserve compatibility with existing `ocrCorrections` + `ocrAliasModel` persistence.
  - Keep behavior safe by default (conservative staged rollout).
  - No cloud sync/backend dependencies; local-only logic and persistence.
  - Avoid breaking existing OCR capture/review flows.
- Out-of-scope:
  - Remote model training/sync.
  - Router/navigation architecture rewrite.
  - Destructive data migrations.
- Done condition:
  - OCR learning queue/history/rollback model and actions are implemented and wired into runtime review flows.
  - Settings expose advanced learning controls, threshold recommendation run/apply/revert, and history visibility.
  - Adaptive preload ordering is usage-aware with hard gating/budget controls and fallback behavior.
  - Validation evidence recorded (`typecheck`, targeted tests, touched-file eslint).
- AOM_V2:
  - Risk Tier: `T3`
  - Execution Path: `FULL_PATH`
  - Reason: multi-surface runtime behavior and persistence changes across OCR decisioning, settings UX, and startup performance path.

---

## Intake - 2026-02-15 - DEV-STARTUP-HOOKS-001
- Goal: improve perceived `npm run electron:dev` startup speed and fix Settings crash: `Rendered more hooks than during the previous render`.
- Constraints:
  - Keep scope narrow to dev startup flow and settings hook ordering.
  - Preserve existing OCR/cloud/telemetry functionality.
  - Keep production (`app.isPackaged`) behavior unchanged.
- Out-of-scope:
  - Large startup architecture rewrite.
  - UI redesign of splash screen.
  - Removal of cloud OCR features.
- Done condition:
  - Settings modal no longer triggers hook-order runtime error on open.
  - Dev command launches Electron immediately (no pre-wait for Vite) so splash appears earlier.
  - Non-critical startup tasks are deferred/backgrounded to reduce blocking during dev boot.
  - Validation evidence recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime behavior changes in startup path + React hook safety fix in live UI component.

---

## Intake - 2026-02-15 - PROFILE-SETTINGS-MERGE-001
- Goal: remove standalone sidebar Settings button and route settings access through the profile hub (profile icon menu).
- Constraints:
  - Keep profile hub behavior intact.
  - Preserve settings accessibility (must still be reachable in one click from profile icon, then Settings option).
  - Keep scope narrow to sidebar/tutorial wiring.
- Out-of-scope:
  - Header redesign.
  - Settings modal behavior changes.
  - Profile management flow rewrite.
- Done condition:
  - Standalone sidebar settings button is removed.
  - Profile menu still contains working Settings action.
  - Tutorial no longer references removed `nav-settings` target.
  - Validation evidence recorded (`typecheck`, targeted eslint).
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: user-facing navigation behavior and tutorial selector update.

---

## Intake - 2026-02-15 - PROFILE-BUTTON-WIDTH-001
- Goal: make the sidebar profile button the same width lane as other navigation buttons.
- Constraints:
  - Keep scope narrow to sidebar button/layout classes only.
  - Do not change profile-menu behavior, actions, or settings routing.
  - Preserve collapsed/mobile sidebar behavior.
- Out-of-scope:
  - Sidebar visual redesign.
  - Profile menu content changes.
  - Navigation interaction changes.
- Done condition:
  - Profile button uses the same full-width lane as nav buttons.
  - Visual mismatch from wrapper-width collapse is removed.
  - Validation evidence recorded (`typecheck`, touched-file eslint).
- AOM_V2:
  - Risk Tier: `T0`
  - Execution Path: `FAST_PATH`
  - Reason: single-file class-only UI layout adjustment with no behavior/schema changes.

---

## Intake - 2026-02-15 - OVERLAY-NAV-RECORDING-LAYOUT-001
- Goal: keep overlay tab clicks inside overlay (no forced full-view), add explicit full-view actions, and place Match Recording above Mission Intel in recording layouts.
- Constraints:
  - Keep scope narrow to `OverlayView` and `RecordingView` layout/navigation behavior.
  - Preserve existing full-view navigation capability via explicit controls.
  - Preserve overlay mode stability and existing panel functionality.
- Out-of-scope:
  - Broad redesign of overlay window chrome.
  - Changes to OCR/telemetry pipeline behavior.
  - Routing-system changes.
- Done condition:
  - Overlay tab controls (Recording/Loadout/Social) no longer exit overlay.
  - Explicit controls exist for opening full dashboard views.
  - Recording layout renders Match Recording above Mission Intel.
  - Validation evidence recorded (`vitest`, touched-file eslint, `typecheck`).
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime UI behavior updates across overlay navigation and recording layout.

---

## Intake - 2026-02-15 - RECORDING-ROLLBACK-ALIGN-001
- Goal:
  - move Match Recording panel back to prior placement in Recording view,
  - fix cross-tab dashboard alignment drift where Analytics appears lower than History and panel framing feels inconsistent.
- Constraints:
  - Keep scope narrow to layout/container composition in recording and dashboard views.
  - Preserve overlay navigation behavior delivered in prior fix (explicit full-view actions, in-overlay tab switching).
  - Avoid data/store/schema/API changes.
- Out-of-scope:
  - OCR/telemetry logic changes.
  - Sidebar/navigation information architecture changes.
  - Broad analytics/history UI redesign.
- Done condition:
  - Recording view restores previous left-column Match Recording placement (including compact Actions/Loadout toggle behavior).
  - Analytics, History, Players, and Smart Captures align to a consistent top/frame contract during sidebar tab switching.
  - Validation evidence recorded (`vitest`, touched-file eslint, `typecheck`).
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime user-facing layout behavior changes across multiple dashboard views.

---

## Intake - 2026-02-15 - OCR-ADAPTIVE-RESOLUTION-001
- Goal: implement adaptive OCR learning improvements so corrected names generalize across different garbles, contextual disambiguation is available when safe, OCR review deduplicates same-player repeats across session captures, and corrections can auto-grow corpus truth data.
- Constraints:
  - Preserve `ocrAliasModel` as canonical OCR-learning model (no parallel `playerMisreads` persistence model).
  - Keep behavior conservative to avoid false-positive name resolution.
  - Keep corpus auto-growth non-blocking for user flow and aligned with existing Electron corpus/security model.
  - Keep changes additive/backward-compatible with legacy `ocrCorrections`.
- In scope:
  - New similarity functions (`lcsRatio`, char-overlap, variant-aware score/match).
  - Shared resolver utility and integration in `useSmartCapture`, `useSmartScan`, and `App` OCR apply path.
  - Session-level canonical dedupe in OCR review/apply data path.
  - New IPC channel/handler for guarded auto-corpus ingest from OCR review corrections.
  - Security allowlist + negative-test updates for new IPC channel.
- Out-of-scope:
  - OCR engine replacement/refactor (Tesseract/cloud merge algorithms).
  - Persistence schema migration replacing `ocrAliasModel`.
  - UI redesign outside OCR review/capture behavior needed for this feature.
- Done condition:
  - Variant-aware matching is available and used in all targeted OCR name-resolution paths.
  - Context pass can resolve unresolved names only under strict unambiguous social-graph constraints.
  - OCR review/apply path avoids duplicate same-player entries from multi-image session variants.
  - Corrected OCR review can append deduped corpus sample through new guarded IPC route.
  - Validation evidence exists in `docs/agents/03_VALIDATION.md` for lint/typecheck/tests/security test.
- AOM_V2:
  - Risk Tier: `T3`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime behavior changes across OCR decisioning flows + new Electron IPC write path.

---

## Intake - 2026-02-15 - VERSION-CHANGELOG-001
- Goal: update app version and release notes for the latest shipped OCR adaptive improvements.
- Constraints:
  - Keep scope narrow to version constants and changelog source.
  - Keep semantic versioning aligned between package version and in-app `APP_VERSION`.
  - Do not modify runtime logic outside version/changelog metadata.
- Out-of-scope:
  - Feature implementation changes.
  - UI behavior/layout changes.
  - Build/release pipeline script changes.
- Done condition:
  - `package.json` version is bumped.
  - `APP_VERSION` reflects the same release line.
  - `src/utils/changelog.ts` includes a new entry for the bumped version.
  - Validation evidence recorded for touched files.
- AOM_V2:
  - Risk Tier: `T0`
  - Execution Path: `FAST_PATH`
  - Reason: metadata-only update with no runtime behavior change.

---

## Intake - 2026-02-15 - IDMAPPER-TELEMETRY-SHIP-001
- Goal: fix two telemetry/identity regressions:
  - ID Mapper shows misleading `Unknown` next to already identified/linked IDs.
  - Ship telemetry over-registers unknown ship IDs and can stick on one ship (reported as Bastion) instead of reflecting ship changes.
- Constraints:
  - Keep scope narrow to ID-mapper presentation and telemetry loadout ship parsing.
  - Do not change unrelated OCR/match-submission flows.
  - Preserve unknown-ID tracking for genuinely unresolved GUIDs.
- Out-of-scope:
  - UI redesign of ID Mapper.
  - Broad telemetry parser refactor.
  - Changes to persisted schema.
- Done condition:
  - Known/mapped IDs in ID Mapper no longer display a misleading `Unknown` role badge by default.
  - Ship telemetry no longer registers volatile/non-GUID identifiers as unknown ship GUIDs.
  - Ship name extraction from raw telemetry is robust enough to avoid sticky fallback behavior when ship changes.
  - Targeted validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime logic change in telemetry parsing plus user-facing mapper output adjustment.

---

## Intake - 2026-02-15 - IDMAPPER-TELEMETRY-LOADOUT-002
- Goal: address follow-up behavior:
  - domain-labeled IDs (Hero/Ship/Weapon/Equipment) should not appear as generic unknown in mapper-linked outcomes.
  - telemetry should explicitly track prospector loadout weapons and equipment with better extraction coverage and UI visibility.
- Constraints:
  - Keep scope narrow to ID mapper save flow + telemetry loadout parsing + ActionPanel telemetry summary.
  - Preserve existing mapping and telemetry workflows.
  - No persistence schema changes.
- Out-of-scope:
  - Full ID mapper redesign.
  - Telemetry protocol redesign.
- Done condition:
  - Unknown-ID save in mapper writes to the correct `uidMappings` domain by detected type.
  - Telemetry extracts weapon/equipment from both GUID and raw-name candidates with conservative unknown handling.
  - Telemetry summary shows detected weapons/equipment in recording action panel.
  - Validation evidence is recorded.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime telemetry logic + user-visible recording panel output update.
