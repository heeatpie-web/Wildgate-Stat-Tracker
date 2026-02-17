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

---

## Intake - 2026-02-16 - BUG-BATCH-006
- Goal: complete the remaining requested fixes from the expanded bug list:
  - header Smart Capture reliability,
  - Intelligence Review button routing/mounting,
  - telemetry drafts represented as ongoing (not draw),
  - Win placement fallback shown as first place,
  - Players tab pending OCR roster approvals,
  - teammate-cap consistency and non-local telemetry loadout guardrails.
- Constraints:
  - Keep changes targeted to existing flows and data model.
  - Preserve wizard/result workflow semantics (Win/Loss/Draw submission flow remains explicit).
  - Avoid destructive migrations; only safe compatibility hydration updates.
- Out-of-scope:
  - New OCR model quality tuning.
  - Broad UI redesign beyond the requested UX fixes.
  - Backend/cloud workflow changes.
- Done condition:
  - Smart Capture requests are consumable through a durable channel even if DOM event timing races.
  - Review queue opens from recording panel via mounted modal.
  - Telemetry drafts are stored/displayed as `Ongoing`; analytics excludes ongoing matches from completed-result metrics.
  - Win rows with missing placement render as first place and final submission defaults placement to `1`.
  - Players view exposes approve/dismiss actions for pending OCR roster candidates.
  - Validation evidence recorded for touched logic and targeted regressions.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: user-visible runtime behavior updates across telemetry, capture routing, analytics filtering, and UI review flows.
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

---

## Intake - 2026-02-15 - DISABLE-RUNTIME-DEVTOOLS-001
- Goal: prevent the Chromium DevTools console from opening during normal app runtime.
- Constraints:
  - Keep scope narrow to Electron main-process DevTools open path.
  - Preserve ability to re-enable explicitly for debugging when needed.
- Out-of-scope:
  - UI redesign.
  - Broader Electron window behavior changes.
- Done condition:
  - Runtime `open-devtools` IPC no longer opens DevTools by default.
  - DevTools can be explicitly re-enabled only through an opt-in env flag.
  - Validation evidence recorded.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: runtime behavior change in Electron main process.

## Intake - 2026-02-16 - BUG-BATCH-005
- Goal: implement a focused reliability pass for OCR review, Smart Captures, telemetry draft submission bundling, and corpus workflow gaps reported in the latest bug list.
- Constraints:
  - Keep scope targeted to high-impact bugs in OCR apply, Smart Captures, corpus mode, and telemetry loadout parsing.
  - Preserve existing persistence schema and IPC contracts where possible.
  - Favor additive UX controls over broad redesign.
- In scope:
  - OCR review lightbox layering fix and richer opponent/team editing in apply modal.
  - Smart Captures teammate-capacity fallback for unknown ship and artifact auto-repair toast spam suppression.
  - Smart Captures bulk action to merge selected matches.
  - Wizard/final-submission bundling so live mission stats (POI/elims/damage/notes/roster) are persisted with telemetry draft-derived submissions.
  - Corpus mode reliability (packaged eval script resolution, corpus image refresh/load robustness, import resilience).
  - Corpus plain-entry workflow support for up to 4 opponent teams (with ship + players).
  - Telemetry loadout extraction hardening for ship/prospector/weapon/equipment auto-selection coverage.
  - OCR correction input backspace/edit regression fix.
  - OCR review roster-match clarity and queue-to-roster-candidate action for unmatched names.
- Out-of-scope:
  - Full settings IA redesign.
  - OCR model architecture replacement.
  - Large data/schema migrations.
- Done condition:
  - Targeted fixes are implemented in code and validated (`eslint`, `typecheck`, targeted tests).
  - Validation evidence and handoff are recorded.
- AOM_V2:
  - Risk Tier: `T3`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime behavior changes across OCR review UX, submission logic, telemetry parsing, and Electron corpus tooling.

---

## Intake - 2026-02-16 - SMOKE-PERF-CONSENSUS-001
- Goal: run the visual smoke test and provide an evidence-based consensus on reported overheating/performance concerns.
- Constraints:
  - Keep scope narrow to validation + diagnostics only.
  - No runtime feature/code changes in this task.
  - Use existing smoke tooling and inspect current telemetry monitor code paths.
- Out-of-scope:
  - New optimization implementation.
  - UI redesign or workflow changes.
  - New benchmark harness work.
- Done condition:
  - Smoke command runs and report evidence is captured.
  - Consensus is documented with concrete poll/decode interval evidence.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: runtime diagnostic assessment with user-facing reliability/performance impact.

---

## Intake - 2026-02-16 - THERMAL-FIX-001
- Goal: implement three targeted runtime fixes for overheating/performance pressure:
  1) dirty-only DB flush in renderer storage layer,
  2) correct telemetry log-path preference order,
  3) reduce archive write churn by avoiding no-op rewrites and repeated full-file parse overhead.
- Constraints:
  - Keep scope narrow to thermal/perf fixes requested in this turn.
  - Preserve persistence durability semantics and telemetry feature behavior.
  - Avoid schema/API breaking changes.
- Out-of-scope:
  - Broad telemetry architecture redesign.
  - UI redesign and unrelated feature work.
  - New benchmark harness.
- Done condition:
  - `src/utils/storage.ts` flushes only when unsaved changes exist.
  - `electron/main.cjs` prefers Wildgate telemetry cache path before Nebula fallback.
  - `electron/helpers/telemetryArchiveHelpers.cjs` avoids no-op archive rewrites and repeated full-file parse per tick.
  - Targeted validation (`typecheck`, touched-file `eslint`) is green and logged.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime behavior changes in persistence and telemetry pipeline paths.

---

## Intake - 2026-02-16 - OCR-ALIAS-CLEANUP-001
- Goal: fix name-adjuster hygiene by allowing direct removal of nonsensical OCR alias mappings and reducing accidental bad manual alias links.
- Constraints:
  - Keep scope narrow to OCR alias settings flow and mapping slice behavior.
  - Preserve existing alias learning queue/review workflows.
  - No persistence schema migration.
- Out-of-scope:
  - Bulk alias redesign.
  - OCR model/recognition changes.
  - Automatic historical alias pruning heuristics.
- Done condition:
  - Settings alias list supports direct removal of an alias mapping row.
  - Store exposes deterministic alias removal action that removes the chosen alias target for a key.
  - Manual settings alias add flow adds a lightweight confirmation step for suspicious low-similarity pairs.
  - Targeted lint/typecheck/tests pass and are logged.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime mapping logic and UI interaction behavior changes across multiple files.

---

## Intake - 2026-02-16 - OCR-CORRECTION-POPUP-CLARITY-001
- Goal: make the Smart Captures OCR correction popup clearer so users understand and use the correction workflow more often.
- Constraints:
  - Keep scope focused on popup clarity (copy, labels, instructional affordances) and immediate Smart Captures entry CTA wording.
  - Preserve current OCR apply/correction behavior and data model.
  - Follow `docs/agents/UI_MASTERPLAN.md` style and hierarchy patterns.
- Out-of-scope:
  - OCR logic/model changes.
  - New review workflow architecture.
  - Broader navigation redesign.
- Done condition:
  - OCR review popup includes explicit, concise “how this helps” guidance and clearer action labels.
  - Smart Captures entry button text clearly communicates that review supports correcting names/teaching OCR.
  - Targeted lint/typecheck validation is recorded.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: user-facing UI copy/interaction updates across existing OCR review surfaces.

---

## Intake - 2026-02-16 - OCR-CORRECTION-DELETE-002
- Goal: continue OCR correction UX hardening by adding clearer guided correction cues (including wizard popup improvements and inline change undo visibility) and add explicit match-delete options in Smart Captures.
- Constraints:
  - Keep scope limited to OCR correction surfaces and Smart Captures actions.
  - Preserve existing OCR processing and persistence logic.
  - Keep deletion flow intentionally confirm-gated to reduce accidental data loss.
- Out-of-scope:
  - OCR model/parsing changes.
  - Full Smart Captures IA redesign.
  - New trash/recovery backend.
- Done condition:
  - OCR review popup includes first-time micro tutorial guidance, clearer per-name match reasoning, and visible change undo controls.
  - Wizard correction popup copy/buttons are clearer and training intent is explicit.
  - Smart Captures exposes delete options for both selected rows and single-match detail actions with confirmation.
  - Targeted lint/typecheck validation evidence is recorded.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: user-facing behavior updates across OCR review UI and destructive match action controls.

---

## Intake - 2026-02-16 - IQR-PLAYERNAME-001
- Goal: fix `Intelligence Review Required` so detected `player_name` entries can be confirmed into roster, edited reliably, and removed cleanly from OCR-applied session references.
- Constraints:
  - Keep scope narrow to `ReviewQueueModal` behavior for `player_name` and adjacent `roster_candidate` regression safety.
  - No OCR parser/model changes and no post-match OCR flow redesign in this pass.
  - Preserve existing data schema and IPC contracts.
- Out-of-scope:
  - Telemetry post-match blocking OCR prompt flow.
  - OCR dedupe/color-assignment algorithm changes.
  - New review modal UI architecture.
- Done condition:
  - Confirming a `player_name` adds it to roster and clears the pending review item.
  - Editing a `player_name` updates session references and adds the edited name to roster.
  - Deleting relevant review items removes linked names from session teams and selected teammate/opponent lists.
  - Targeted tests + lint + typecheck evidence recorded.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime behavior updates in primary review workflow with user-facing data integrity impact.

---

## Intake - 2026-02-16 - POSTMATCH-OCR-GATE-002
- Goal: stop result buttons from auto-running OCR and require explicit user confirmation before OCR processing starts after result selection.
- Constraints:
  - Keep scope focused to recording result submission flow in `ActionPanel`.
  - Preserve existing OCR review gate behavior when pending OCR data already exists.
  - No OCR parser/model changes and no telemetry draft architecture rewrite in this pass.
- Out-of-scope:
  - Full telemetry post-match prompt redesign in `App.tsx`.
  - OCR dedupe/team-color quality improvements.
  - New persistence or IPC contracts.
- Done condition:
  - Clicking Win/Loss/Draw no longer auto-calls `processAllStored(...)`.
  - When queued OCR exists, a blocking prompt appears and OCR starts only on explicit user action.
  - User can continue to wizard without OCR from that prompt.
  - Targeted tests + lint + typecheck evidence recorded.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime behavior change on primary result-submission path with user-visible OCR flow impact.

---

## Intake - 2026-02-16 - POSTMATCH-TELEMETRY-PROMPT-003
- Goal: align telemetry post-match prompt flow with the new explicit OCR gate so result selection never bypasses recording submission logic.
- Constraints:
  - Keep scope narrow to telemetry draft prompt handling in `src/App.tsx`.
  - Preserve existing telemetry draft hydration and pending-match data wiring.
  - No OCR parser/model changes and no new IPC contract changes.
- Out-of-scope:
  - Broad telemetry prompt redesign/layout rewrite.
  - OCR dedupe/team-color quality changes.
  - New persistence schema changes.
- Done condition:
  - Post-match telemetry result actions route through the same `submission:open-result` path used by recording results.
  - If user is not on Recording view, flow switches to Recording first and then opens the explicit result/OCR gate behavior.
  - Prompt copy makes it explicit that OCR does not auto-start and requires explicit user action.
  - Targeted lint/typecheck validation evidence is recorded.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: user-visible runtime behavior update in post-match result flow with OCR gating impact.

---

## Intake - 2026-02-16 - OCR-TEAM-CAP-GUARD-004
- Goal: stop OCR/session flows from over-registering teammates by enforcing dedupe + ship-capacity limits wherever teammates are set.
- Constraints:
  - Keep scope narrow to teammate state normalization in `src/store/slices/createFormSlice.ts`.
  - Preserve existing ship-capacity semantics (`max teammates = crew capacity - 1`, with unknown-ship safe fallback).
  - No OCR parser/model changes.
- Out-of-scope:
  - Team-color assignment algorithm changes.
  - Enemy team dedupe/mapping redesign.
  - Broad OCR review modal UX redesign.
- Done condition:
  - `setSelectedTeammates` cannot persist duplicates or exceed capacity even when called with large OCR-generated arrays/updaters.
  - Teammate normalization is case-insensitive for duplicate protection.
  - Targeted regression tests + lint + typecheck evidence recorded.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime state-guard behavior change in core recording/OCR paths.

---

## Intake - 2026-02-16 - REMAINING-UX-TELEMETRY-005
- Goal: close remaining reported issues in one pass:
  - wizard must allow manual ship weapons/equipment entry,
  - telemetry must auto-select and visibly indicate prospector weapons/equipment,
  - OCR opponent team color assignment should avoid collapsing teams into a single color bucket and reduce duplicate player registration.
- Constraints:
  - Keep changes targeted to existing recording/OCR flows (`Wizard`, telemetry monitor, recording indicators, OCR apply mapping).
  - Preserve existing persistence schema and IPC contracts.
  - No OCR model/parser architecture changes.
- Out-of-scope:
  - Full match-end UX redesign beyond current prompt/dialog patterns.
  - New backend/cloud processing behavior.
  - Broad Smart Captures IA redesign.
- Done condition:
  - Wizard includes editable weapon/equipment slots that persist into final submission loadout.
  - Telemetry loadout apply sets both weapons and equipment selections in session state.
  - Recording telemetry indicator panel explicitly labels weapons/equipment as telemetry auto-selection.
  - OCR apply path normalizes/opportunistically disambiguates team colors and avoids obvious duplicate-player fanout across opponent teams.
  - Targeted validation evidence (`vitest` touched tests, touched-file `eslint`, `typecheck`) is recorded.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime/UI behavior updates in core recording and OCR workflows.

---

## Intake - 2026-02-17 - AUDIT-REMEDIATION-001
- Goal: implement the audited remediation plan for type-boundary safety, dashboard type suppressions, telemetry archive shape normalization, legacy migration debt reduction, and friend-beta gate evidence.
- Constraints:
  - Keep scope narrow to audited items only.
  - Do not revert or modify unrelated dirty worktree changes.
  - Preserve data backward compatibility for existing users.
  - Prefer incremental hardening at storage/IPC boundaries over repo-wide `any` cleanup.
- In scope:
  - Harden `StorageData` and persisted/IPC boundary types in:
    - `src/utils/storage.ts`
    - `src/store/useAppStore.ts`
    - `src/utils/artifactService.ts`
  - Remove `@ts-ignore` and explicit layout `any` usage in:
    - `src/components/DashboardLayout.tsx`
  - Canonicalize telemetry archive payload handling through shared normalization utility:
    - `src/utils/telemetryArchive.ts`
    - `src/components/SimulatorPanel.tsx`
    - `src/components/SmartCapturesPanel.tsx`
  - Introduce one-time legacy migration markers for storage compatibility debt containment.
  - Execute and log friend-beta gate evidence:
    - `npm run -s test`
    - `npm run -s build`
    - `npm run -s typecheck`
- Out-of-scope:
  - Repo-wide removal of all `any` usage.
  - Broad telemetry pipeline redesign beyond payload normalization.
  - New product features unrelated to audit findings.
- Done condition:
  - High-risk storage/IPC boundaries no longer rely on `any`.
  - `DashboardLayout` has zero `@ts-ignore`.
  - Renderer telemetry archive consumers rely on one shared normalizer.
  - Legacy migration markers prevent repeated migration work.
  - Validation evidence for gate commands is recorded in `03_VALIDATION`.
- AOM_V2:
  - Risk Tier: `T3`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime and persistence behavior updates touching core storage, IPC payloads, and release-readiness gate evidence.

---

## Intake - 2026-02-17 - AUDIT-REMEDIATION-002
- Goal: complete a second type-safety pass by reducing `any` usage in core OCR/session runtime flows while preserving behavior.
- Constraints:
  - Keep scope narrow to runtime OCR/session and review-panel paths only.
  - Do not refactor analytics/dev-only modules in this pass.
  - Preserve existing UI behavior and persisted data contracts.
- In scope:
  - Replace high-risk `any` usage in:
    - `src/hooks/useSmartCapture.ts`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/components/recording/ActionPanel.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `src/providers/GameDataProvider.tsx`
    - `src/store/slices/createFormSlice.ts`
  - Add/adjust minimal supporting types where needed.
  - Run focused lint + typecheck + full test/build gates and record evidence.
- Out-of-scope:
  - Repo-wide elimination of all `any`.
  - Analytics dashboard type model redesign.
  - IPC/electron contract redesign.
- Done condition:
  - Targeted runtime files above no longer use broad `any` for primary data/control paths.
  - `typecheck`, `test`, and `build` pass.
  - AGENTS execution/validation/handoff/decision docs updated with evidence.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime typing hardening with behavior-preservation constraints.

---

## Intake - 2026-02-17 - AUDIT-REMEDIATION-003
- Goal: perform a follow-up runtime typing hardening pass to reduce remaining high-risk `any` usage in telemetry event/status flows without changing behavior.
- Constraints:
  - Keep scope narrow to telemetry runtime plumbing and status typing.
  - Preserve existing telemetry/OCR/session behavior and prompt flow semantics.
  - Avoid analytics/dev-panel refactors in this pass.
- In scope:
  - Replace explicit high-risk `any` usage in:
    - `src/hooks/useLogMonitor.ts`
    - `src/App.tsx`
  - Tighten telemetry status typing contracts in:
    - `src/store/slices/createUISlice.ts`
    - `src/providers/UIStateProvider.tsx`
  - Run focused validation (`eslint` touched files, `typecheck`, targeted `vitest`) and full gates (`test`, `build`).
- Out-of-scope:
  - Repo-wide `any` elimination.
  - Analytics/dashboard and dev-only panel type-model cleanup.
  - Broad Electron IPC contract redesign.
- Done condition:
  - Targeted telemetry runtime files no longer use broad `any` in primary event/status paths.
  - UI telemetry status setter/context signatures use explicit typed status payloads.
  - `typecheck`, `test`, and `build` pass with evidence in `03_VALIDATION`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime telemetry type hardening in active behavior paths.

---

## Intake - 2026-02-17 - AUDIT-REMEDIATION-004
- Goal: implement the two previously deferred partial fixes:
  - improve deterministic opponent team color assignment,
  - add optional background OCR processing after result click.
- Constraints:
  - Preserve default explicit OCR gate behavior unless the new option is enabled.
  - Keep existing OCR/wizard/session persistence contracts backward-compatible.
  - Keep scope limited to these two deferred items and targeted validation.
- In scope:
  - Add deterministic opponent color assignment helper with preference for stable prior mapping/overlap and deterministic fallback.
  - Apply color assignment helper in runtime OCR apply paths (`App`, Smart Captures apply path).
  - Add a persisted setting to allow background OCR processing after result click.
  - Wire setting into `ActionPanel` result flow.
  - Add targeted tests for:
    - color assignment deterministic behavior,
    - background OCR option behavior.
- Out-of-scope:
  - Broad OCR pipeline/model changes.
  - Repo-wide typing or architecture refactors.
  - Non-related UI redesign.
- Done condition:
  - Opponent team colors are assigned deterministically and avoid unstable duplicate fallbacks in the same apply batch.
  - Result-click flow supports optional background OCR mode; default manual gate remains intact.
  - Targeted tests + `eslint` + `typecheck` + full `test` + `build` pass with evidence recorded.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file behavior changes in OCR/session apply and submission flow with persisted settings impact.

---

## Intake - 2026-02-17 - IQR-NAME-SOURCE-001
- Goal: make each `Intelligence Review Required` player-name entry traceable to its originating capture so unclear OCR names can be validated against source evidence.
- Intent confirmation block:
  - Goal: show provenance per player-name review item.
  - Constraints: keep scope narrow to review-entry metadata + review modal UI; preserve existing confirm/edit/delete behavior.
  - Done: reviewer can open source screenshot context directly from each relevant entry.
- Constraints:
  - Keep implementation limited to review queue data + UI surfaces directly used by `Intelligence Review Required`.
  - Do not change OCR extraction heuristics or roster merge logic.
  - Preserve existing queue action semantics (confirm/edit/delete/merge) and current styling system.
- In scope:
  - Extend pending review model with optional source screenshot metadata.
  - Capture source screenshot path during Smart Scan and attach it to queued `player_name` items.
  - Surface source metadata in `ReviewQueueModal` with a direct screenshot preview action.
  - Add focused regression test coverage for source screenshot visibility.
- Out-of-scope:
  - OCR model/threshold tuning.
  - Reworking Smart Captures OCRReview modal behavior.
  - Any broad queue architecture refactor beyond provenance fields.
- Done condition:
  - New low-confidence `player_name` queue entries include source capture metadata when available.
  - `ReviewQueueModal` shows source provenance and supports viewing the captured screenshot for those entries.
  - Existing queue actions remain passing under focused tests and typecheck.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: runtime + UI behavior update across multiple files with user-facing review workflow impact.

---

## Intake - 2026-02-17 - RESULT-HOOK-CRASH-310-001
- Goal: fix the runtime crash that occurs when clicking Win/Loss/Draw in the recording interface.
- Intent confirmation block:
  - Goal: remove the React hook-order crash on result button clicks.
  - Constraints: keep scope narrow to the submission/wizard render path; preserve existing result/OCR/wizard behavior.
  - Done: clicking result buttons no longer throws React #310, and targeted validation passes.
- Constraints:
  - No UX redesign or flow changes outside the hook-order fix.
  - Keep OCR prompt/background branching behavior unchanged.
  - Keep persistence/store contracts unchanged.
- In scope:
  - Patch hook ordering in the wizard/result render path.
  - Add focused regression coverage for closed->open wizard transition.
  - Run targeted lint/typecheck/tests.
- Out-of-scope:
  - Broader submission refactors.
  - Any unrelated OCR/model adjustments.
- Done condition:
  - Result button click path does not crash.
  - Targeted tests pass and no new lint/type errors.
  - Execution/validation/handoff docs updated with evidence.
- AOM_V2:
  - Risk Tier: T2
  - Execution Path: FULL_PATH
  - Reason: runtime behavior crash in user-facing submission flow with multi-file code/test + validation updates.

---

## Intake - 2026-02-17 - WIZARD-HOOK-AUDIT-002
- Goal: harden the remaining wizard-style UI flows against hook-order regressions after the result wizard crash fix.
- Intent confirmation block:
  - Goal: ensure other wizard/modal flows do not trigger React hook-order crashes.
  - Constraints: keep scope limited to wizard/modal render-safety and focused regression tests; no UX changes.
  - Done: wizard-style components are audited and covered by focused transition tests.
- Constraints:
  - No behavior or styling redesign.
  - Preserve existing wizard/modal interactions.
  - Keep validation focused to touched files + typecheck.
- In scope:
  - Audit wizard/modal components for hook-after-guard patterns.
  - Add focused regression tests for additional wizard-style modal transitions.
  - Record evidence and decisions.
- Out-of-scope:
  - Broad UI refactors.
  - Non-wizard component bugfixes.
- Done condition:
  - No additional hook-order violations in audited wizard/modal components.
  - New focused tests pass with lint + typecheck.
  - AGENTS docs updated with execution and evidence.
- AOM_V2:
  - Risk Tier: T1
  - Execution Path: FULL_PATH
  - Reason: user-facing runtime stability hardening in modal/wizard flows with tests/docs updates.

---

## Intake - 2026-02-17 - OCR-TEAM-CAP-HARDEN-006
- Goal: stop OCR/wizard flows from producing teammate lists larger than ship capacity (user reported 12+ teammates still appearing).
- Intent confirmation block:
  - Goal: enforce one hard teammate cap across all OCR apply/review/submission paths, not only the form setter.
  - Constraints: keep scope narrow to teammate-cap enforcement in OCR/wizard/session code paths; no unrelated UI redesign.
  - Done: OCR-derived teammate data is capped consistently (ship-aware) in review/apply/submission flows, and validation evidence is recorded.
- Constraints:
  - Preserve existing OCR/opponent/modifier behavior outside teammate-cap logic.
  - Do not alter persistence model shape or broad workflow sequencing.
  - Keep fix targeted to the bug path and regression-safe utilities/tests.
- In scope:
  - Add shared teammate-cap utility (dedupe + ship-capacity cap).
  - Apply utility in OCR review/apply/session/submission paths that can still store uncapped teammate arrays.
  - Add focused regression tests for teammate-cap utility behavior.
- Out-of-scope:
  - OCR model/threshold tuning.
  - Broad refactors of match recording UX.
  - Non-teammate data contract changes.
- Done condition:
  - OCR workflows no longer leave > ship-capacity teammate lists in session/pending/match outputs.
  - Targeted validation passes and evidence is logged in `03_VALIDATION`.
  - Execution/handoff docs updated for this task.
- AOM_V2:
  - Risk Tier: T2
  - Execution Path: FULL_PATH
  - Reason: runtime behavior fix across multiple OCR/wizard/submission paths with regression-test updates.

---

## Intake - 2026-02-17 - REFACTOR-CLOSEOUT-007
- Goal: fully close the unfinished giant refactor by validating the combined dirty refactor state end-to-end and finalizing closure artifacts.
- Intent confirmation block:
  - Goal: finish refactor closure without additional user prompts.
  - Constraints: no scope expansion beyond final integration validation/closeout and required docs/locks hygiene.
  - Done: full quality gates pass on the integrated refactor state and all `docs/agents/*` closure records are complete.
- Constraints:
  - Keep code scope narrow: only fix issues surfaced by full quality-gate validation.
  - Do not revert unrelated existing changes.
  - Complete required AGENTS workflow artifacts (`00`-`04`, decisions, locks).
- In scope:
  - Audit current dirty refactor state for unresolved failures.
  - Run full quality gate (`lint + test + typecheck + build`) against combined state.
  - Apply any required fixes if gates fail.
  - Record execution/validation evidence and final handoff.
- Out-of-scope:
  - New feature work unrelated to refactor closeout.
  - Broad redesign/refactor not required by failing validation evidence.
  - Release/package publishing.
- Done condition:
  - `ci:quality` passes for the combined refactor state.
  - No unresolved closeout blockers remain for this lane.
  - `docs/agents/04_HANDOFF.md` contains final closeout status and residual risk notes.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: integration-level closure and release-gate validation over multi-file runtime refactor changes.

---

## Intake - 2026-02-17 - AUDIT-REMEDIATION-005
- Goal: close the remaining audit findings around runtime `any` usage, production console logging, telemetry archive shape normalization, and legacy startup migration overhead.
- Intent confirmation block:
  - Goal: fix the concrete issues still present from the remaining-audit report.
  - Constraints: keep scope to the listed runtime/typing/debt items; avoid unrelated refactors.
  - Done: targeted files are hardened, validations pass, and closure evidence is recorded.
- Constraints:
  - Preserve existing runtime behavior and IPC contracts.
  - Keep telemetry archive compatibility for legacy files.
  - Do not expand into repo-wide `any` elimination.
- In scope:
  - Remove remaining `any` and unsafe catch typing in `src/utils/electronBridge.ts` and related runtime helper paths.
  - Reduce production console noise in runtime code (`src/utils/storage.ts`, `src/utils/logger.ts`, `src/App.tsx`, `src/components/DevOCRPanel.tsx`).
  - Replace ad-hoc telemetry archive shape handling in Electron artifact bundling helpers with shared normalization helper usage.
  - Add a one-time legacy localStorage migration-check marker in `src/utils/storage.ts` to reduce startup debt.
- Out-of-scope:
  - Broad analytics/UI typing cleanup outside target files.
  - Removal of `ocr-debug` capture support from pipeline.
  - Breaking telemetry archive format migration.
- Done condition:
  - Targeted files above no longer contain the listed high-risk `any`/`console` patterns.
  - Typecheck/lint/tests/build gates pass.
  - Execution/validation/handoff/decisions and lock lifecycle are updated.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime hardening touching IPC, persistence, and telemetry artifact boundaries.

---

## Intake - 2026-02-17 - MODERATE-REMEDIATION-006
- Goal: address the reported moderate audit issues covering test gaps, silent error handling, accessibility announcements/labels, and frontend configuration hardcoding.
- Intent confirmation block:
  - Goal: implement concrete fixes for the listed moderate issues in the current app codebase.
  - Constraints: keep scope limited to listed issues and low-risk related cleanup in touched paths.
  - Done: requested issue set is remediated with tests and validation evidence.
- Constraints:
  - No broad redesign/refactor outside listed issue categories.
  - Preserve current runtime behavior and user workflows.
  - Prefer targeted tests and guarded error handling over invasive architecture changes.
- In scope:
  - Add tests for `StorageService` persist/flush logic.
  - Add focused tests for `useLogMonitor`, expand functional tests for `useSmartCapture`, and add baseline `App.tsx` coverage.
  - Replace silent catch handlers in key runtime paths with structured logging/warnings.
  - Add `aria-live` support to Toast and ensure icon-only dismissal control has an accessible label.
  - Externalize key frontend timing/config constants behind env-backed runtime config values.
- Out-of-scope:
  - Large hook splitting/performance refactors beyond safe targeted constants.
  - Repo-wide accessibility sweep of every component.
  - Breaking telemetry/archive format migrations.
- Done condition:
  - New/updated tests for storage, log monitor, smart capture, and app component are present and passing.
  - Silent failure paths in targeted files are removed or logged.
  - Toast announces messages for assistive tech and close control is labeled.
  - New env-backed runtime configuration constants are wired into touched frontend paths.
  - Validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime + test changes with user-visible behavior and reliability impact.

---

## Intake - 2026-02-17 - FOLLOWUP-REMEDIATION-008
- Goal: fix the remaining follow-up issues after `MODERATE-REMEDIATION-006` in a single scoped pass.
- Intent confirmation block:
  - Goal: close remaining practical accessibility/configuration/UX defaults flagged as unresolved.
  - Constraints: keep scope narrow to concrete unresolved items; avoid broad refactors.
  - Done: icon-only controls in core flows have labels, auto-backup defaults are safer, and additional hardcoded timers are env-backed.
- Constraints:
  - Preserve existing runtime behavior and data contracts.
  - Keep changes focused to remaining follow-up issues only.
  - Do not expand into full repo-wide accessibility or architecture rewrites.
- In scope:
  - Add `aria-label` coverage for icon-only buttons in primary interaction surfaces.
  - Change auto-backup default behavior from enabled to disabled for fresh/default paths.
  - Extend env-backed runtime configuration usage to additional high-traffic frontend timers/polling intervals.
  - Add/adjust focused validation where behavior/defaults changed.
- Out-of-scope:
  - Full component-by-component accessibility redesign.
  - Broad telemetry/archive schema work.
  - Large hook decomposition/performance refactors.
- Done condition:
  - Targeted icon-only controls are screen-reader labeled.
  - Fresh/default settings paths do not auto-enable backup.
  - Selected hardcoded frontend timing values are sourced through `runtimeConfig`.
  - Validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime/UI behavior updates in core user-facing flows.

---

## Intake - 2026-02-17 - CORPUS-IMPORT-DIR-009
- Goal: make corpus image import open directly to the corpus images storage directory.
- Intent confirmation block:
  - Goal: when user clicks corpus image import, file picker starts in the app corpus images folder.
  - Constraints: keep scope narrow to corpus import dialog path; no OCR pipeline behavior changes.
  - Done: import dialog opens at `ocr-corpus/images` by default.
- Constraints:
  - Keep changes limited to corpus import entry path behavior.
  - Preserve existing import semantics (multi-file image selection + dedupe copy flow).
  - No UI redesign or persistence/schema changes.
- In scope:
  - Update Electron `ocr-corpus-import-images` handler to ensure/use corpus images directory as dialog default path.
  - Run focused validation on touched Electron file and typecheck.
- Out-of-scope:
  - New corpus UI controls.
  - OCR processing/evaluation behavior changes.
  - Repository-wide refactors.
- Done condition:
  - Import dialog opens in corpus images directory by default.
  - Existing import flow still succeeds/cancels as before.
  - Validation evidence recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: single runtime behavior tweak in Electron dialog flow with low regression surface.

---

## Intake - 2026-02-17 - OCR-DUAL-BUFFER-GATES-010
- Goal: implement the approved OCR plan to preserve team-color detection while improving crew-name reliability and strict auto-apply safety gates.
- Intent confirmation block:
  - Goal: keep color fidelity for team detection, keep grayscale/upscale text preprocessing where useful, and prevent unsafe OCR auto-writes.
  - Constraints: keep hazard extraction behavior stable; avoid schema/IPC contract breaks; keep scope centered on OCR pipeline + apply boundaries.
  - Done: dual-buffer OCR path is wired, strict roster guardrails are enforced, and targeted regressions validate caps/non-regression.
- Constraints:
  - Preserve current map/hazard extraction behavior.
  - Do not remove existing OCR review workflows.
  - Keep changes narrow to OCR extraction/merge/apply guardrails.
- In scope:
  - Pass separate text-preprocessed and color-fidelity buffers through Crew Hub extraction path.
  - Keep grayscale/upscale limited to text ROI OCR and out of color-detection regions.
  - Enforce strict OCR auto-apply gates in app-side roster writes:
    - reject low-confidence/ambiguous names from auto-commit,
    - dedupe normalized names,
    - enforce teammate and per-team caps at commit boundaries.
  - Add/adjust targeted tests for OCR merge/player-cap guardrails.
- Out-of-scope:
  - Full OCR model replacement.
  - Broad Smart Capture UI redesign.
  - Telemetry pipeline redesign.
- Done condition:
  - Crew color detection uses color-safe source buffer while OCR text path retains preprocessing.
  - OCR auto-apply cannot commit oversized or low-confidence/ambiguous roster entries.
  - Targeted validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime OCR behavior change affecting extraction and match-state auto-apply safety.

---

## Intake - 2026-02-17 - OCR-ROI-RUNTIME-011
- Goal: make OCR scan regions actively adjustable at runtime and ensure adjustments apply to OCR reruns.
- Intent confirmation block:
  - Goal: user can tune OCR ROIs in settings and have those regions immediately affect OCR processing, including rerun-on-artifact.
  - Constraints: keep scope to OCR settings + IPC wiring + extractor region usage; preserve existing default behavior.
  - Done: adjustable ROI settings are persisted, applied in live OCR and reruns, and can be reset to defaults.
- Constraints:
  - Preserve existing default ROI values unless user changes them.
  - Keep OCR pipeline contracts backward compatible (optional overrides).
  - Avoid changing unrelated telemetry or analytics behavior.
- In scope:
  - Add persisted OCR region settings model with defaults and reset action.
  - Add settings UI controls for ROI percentage tuning.
  - Wire ROI payload through renderer -> Electron OCR IPC and rerun IPC.
  - Update Crew Hub / Map Screen extractors and map player region OCR to consume overrides.
  - Add focused regression for rerun IPC payload shape.
- Out-of-scope:
  - Full visual ROI drag overlay editor.
  - OCR model/engine replacement.
  - Corpus labeling workflow redesign.
- Done condition:
  - OCR regions can be edited in settings and persist.
  - New settings are used for normal OCR and `rerun-ocr-on-artifact`.
  - Reset-to-default action restores baseline regions.
  - Validation evidence recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime settings + IPC + extraction behavior changes in core OCR path.

---

## Intake - 2026-02-17 - OCR-CORPUS-ROI-012
- Goal: make corpus pipeline OCR runs use current ROI settings.
- Intent confirmation block:
  - Goal: when running corpus OCR pipeline from Dev OCR panel, use live ROI settings the same way rerun/live OCR paths do.
  - Constraints: keep scope narrow to corpus pipeline payload + Electron handler wiring; preserve existing corpus behavior otherwise.
  - Done: corpus pipeline forwards `ocrRegions` to `processCapture(...)` and results reflect updated ROI settings.
- Constraints:
  - Do not change corpus sample schema/ground-truth format.
  - Keep pipeline output shape unchanged.
  - Avoid unrelated OCR engine logic changes.
- In scope:
  - Add `ocrRegions` to Dev OCR corpus pipeline invoke payload.
  - Thread optional `ocrRegions` through `ocr-corpus-run-pipeline` in `electron/main.cjs`.
  - Pass `ocrRegions` into `processCapture(...)` options for each corpus sample run.
  - Run focused validation for touched files.
- Out-of-scope:
  - Corpus UI redesign.
  - Model/training changes.
  - Non-corpus OCR behavior changes.
- Done condition:
  - Corpus pipeline uses live ROI settings from store.
  - Existing corpus pipeline outputs and controls still work.
  - Validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: small but behavior-affecting runtime wiring in Electron OCR pipeline path.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T1-013
- Goal: begin the OCR enhancement roadmap by implementing Tier 1 recommendations with immediate UX and observability impact.
- Intent confirmation block:
  - Goal: ship Tier 1 OCR improvements (cache telemetry, correction shortcuts, confidence meter UI, and learning-feedback badges).
  - Constraints: keep scope additive and backward compatible; preserve existing OCR workflow behavior when new controls are unused.
  - Done: Tier 1 code changes are implemented, targeted checks run, and evidence recorded in validation/handoff docs.
- Constraints:
  - Limit this increment to Tier 1 items from the user plan.
  - Reuse existing architecture patterns (IPC handlers, Zustand slices, MD3 components, existing OCR alias model).
  - Avoid schema/API breaking changes for existing OCR paths.
- In scope:
  - Tier 1 #1: OCR cache hit/miss/eviction telemetry surfaced to Dev OCR panel via IPC polling.
  - Tier 1 #2: keyboard shortcuts in OCR correction modal (`Ctrl/Cmd+Enter`, `Esc`, `Ctrl/Cmd+A`, `Ctrl/Cmd+I`).
  - Tier 1 #3: replace confidence percentage badge text with an accessible confidence meter component.
  - Tier 1 #4: learning feedback badges/tooltips sourced from alias learning metadata.
- Out-of-scope (this increment):
  - Tier 2 and Tier 3 roadmap items (region-first benchmark handler, calibration buckets, batch dialogs, bbox overlays, corpus export, dictionary generation, pattern engine, full a11y audit).
  - Broad OCR model replacement/refactor or non-OCR feature changes.
- Done condition:
  - Dev OCR panel shows live cache telemetry (hit rate, size, timing averages).
  - OCR correction modal supports the specified keyboard shortcuts and displays shortcut hints.
  - OCR correction confidence is rendered via progress-style confidence meter.
  - Learning badge/tooltip shows correction-derived metadata for prior aliases.
  - Validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime UI + IPC changes in core OCR surfaces with user-visible behavior updates.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T2-014
- Goal: continue OCR enhancement roadmap with Tier 2 #5 by adding measurable preprocessing benchmark visibility while preserving current OCR behavior.
- Intent confirmation block:
  - Goal: implement benchmark instrumentation for old full-image preprocessing vs region-first preprocessing and surface it in Dev OCR tools.
  - Constraints: keep production OCR extraction flow unchanged; keep IPC additions allowlisted and security-test aligned; keep scope to Tier 2 #5 only for this increment.
  - Done: benchmark IPC is available, Dev OCR panel can run it on a loaded image, and validation evidence is recorded.
- Constraints:
  - Do not regress existing `processCapture(...)` flow or OCR extraction accuracy paths.
  - Keep benchmark as an additive/debug capability only.
  - Maintain preload allowlist + security negative test parity for any new IPC channel.
- In scope:
  - Add benchmark helpers + IPC handler `benchmark-ocr-preprocessing` in `electron/ocrHandler.cjs`.
  - Add invoke allowlist entry in `electron/preload.cjs`.
  - Add security fixture parity update in `scripts/security_negative_tests.cjs`.
  - Add Dev OCR panel control/result card to execute and display benchmark output.
  - Update AGENTS execution/validation/handoff/decision docs for this increment.
- Out-of-scope (this increment):
  - Tier 2 #6-#8 (calibration, batch ops, bbox overlays).
  - Tier 3 roadmap items (corpus export, custom dictionary, patterns, full accessibility audit).
  - OCR model replacement or broad extractor algorithm refactor.
- Done condition:
  - Renderer can invoke benchmark via safe IPC allowlist.
  - Benchmark returns old vs new avg timings and speedup metrics for OCR regions.
  - Dev OCR panel displays benchmark summary for a loaded image.
  - Focused validation (`eslint`, security negative tests, `typecheck`) passes and evidence is logged.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime IPC + Electron image-processing + UI changes in OCR tooling path.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T2-015
- Goal: continue OCR enhancement roadmap with Tier 2 #6 by adding confidence calibration sample tracking and bucketed accuracy visibility.
- Intent confirmation block:
  - Goal: record correction outcomes as calibration samples and surface confidence-vs-accuracy analysis in Dev OCR panel.
  - Constraints: keep scope to Tier 2 #6 only; preserve existing OCR correction workflow behavior and color-calibration settings.
  - Done: calibration samples persist, correction modal records samples, and Dev OCR panel shows bucket stats + threshold recommendation.
- Constraints:
  - Do not alter existing OCR extraction, alias learning, or correction application semantics.
  - Keep new calibration model additive alongside existing `ocrCalibration` (color sampling) settings.
  - Cap persisted sample volume to bounded size (max 1000) for storage safety.
- In scope:
  - Add new calibration utility module (`src/utils/ocrCalibration.ts`) with sample/bucket/recommendation helpers.
  - Extend settings slice + persisted store wiring for `ocrCalibrationSamples` and append action.
  - Record calibration sample events in `OcrCorrectionModal` on correction apply.
  - Show bucket analysis and recommended threshold in `DevOCRPanel`.
  - Add focused utility tests for calibration bucketing/recommendation behavior.
- Out-of-scope (this increment):
  - Tier 2 #7-#8 (batch operations, bounding boxes).
  - Tier 3 roadmap items.
  - OCR confidence source refactor (existing confidence feed remains as-is in modal).
- Done condition:
  - `ocrCalibrationSamples` persists and is bounded to 1000 samples.
  - Applying corrections records samples with predicted confidence + correctness + OCR mode.
  - Dev OCR panel shows bucketed accuracy for 0-20, 20-40, 40-60, 60-80, 80-100 and threshold recommendation.
  - Focused validation passes and evidence is captured in AGENTS artifacts.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file persisted state + UI behavior update in OCR correction and dev tooling surfaces.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T2-016
- Goal: continue OCR enhancement roadmap with Tier 2 #7 by adding batch approval operations in the OCR correction workflow.
- Intent confirmation block:
  - Goal: add threshold-driven batch actions for accepting high-confidence players and ignoring low-confidence players, with confirmation.
  - Constraints: keep scope to Tier 2 #7 only; preserve existing correction flow and keyboard shortcuts.
  - Done: batch threshold persists, batch actions show preview counts + confirmations, and modal applies correct subset behavior.
- Constraints:
  - Keep changes additive to current modal workflow.
  - Reuse existing MD3 dialog patterns and logger usage.
  - Persist batch threshold with bounded range 70-95.
- In scope:
  - Add `ocrBatchAcceptThreshold` + setter to settings slice/store persistence.
  - Add `BatchActionConfirmDialog.tsx` reusable confirmation component.
  - Add threshold slider + real-time eligible counts in `OcrCorrectionModal`.
  - Add batch handlers:
    - accept unreviewed players with confidence >= threshold,
    - ignore unreviewed players with confidence < threshold.
  - Add focused test coverage for the new dialog/helper behavior path and run targeted validation.
- Out-of-scope (this increment):
  - Tier 2 #8 bounding box overlay.
  - Tier 3 roadmap items.
  - OCR confidence-source refactor.
- Done condition:
  - Threshold is persisted and clamped within 70-95.
  - Batch action buttons display accurate affected counts and disable when none eligible.
  - Confirmation dialog guards both batch operations.
  - Batch actions update correction/ignored states as expected and log summary events.
  - Focused validation evidence is recorded.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file persisted settings + OCR modal behavior/UI changes.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T2-017
- Goal: continue OCR enhancement roadmap with Tier 2 #8 by adding bounding-box debug overlays in the Dev OCR workflow.
- Intent confirmation block:
  - Goal: add optional OCR bounding-box payload capture and render a clickable visual overlay for OCR debugging.
  - Constraints: keep changes additive; preserve existing OCR extraction behavior when bbox debug mode is not requested; avoid contract-breaking changes.
  - Done: Dev OCR panel supports a dedicated "Capture with Bounding Boxes" action and renders an interactive color-coded overlay from OCR debug data.
- Constraints:
  - Keep bbox payload opt-in (`includeBboxes`) and debug-oriented only.
  - Do not alter standard OCR extraction paths or persisted match payload behavior.
  - Reuse existing IPC channel (`ocr-process-capture`) and Dev OCR panel patterns.
- In scope:
  - `electron/ocrHandler.cjs`: add optional bbox debug payload emission for OCR capture runs.
  - `src/utils/ocr/ocrTypes.ts`: add typed optional debug payload on OCR results.
  - `src/utils/electronBridge.ts`: allow optional runtime options passthrough (`includeBboxes`).
  - `src/components/OcrBoundingBoxOverlay.tsx`: new interactive overlay component.
  - `src/components/DevOCRPanel.tsx`: add debug capture action + overlay rendering.
- Out-of-scope (this increment):
  - Tier 3 roadmap items.
  - OCR merge algorithm refactors or non-debug OCR extraction changes.
  - Persistent storage/export of bounding-box datasets.
- Done condition:
  - Debug capture request returns optional bbox payload only when requested.
  - Dev OCR panel can display color-coded bbox overlays with hover/click details.
  - Existing OCR run button and workflows remain functional.
  - Focused validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file Electron + renderer runtime contract and UI behavior additions in OCR tooling path.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T3-018
- Goal: continue OCR enhancement roadmap with Tier 3 #9 by exporting OCR correction corpus data for retraining.
- Intent confirmation block:
  - Goal: generate correction corpus artifacts (JSON, JSONL, BOX) from learned OCR aliases and expose export action in Dev OCR tools.
  - Constraints: keep this increment additive; avoid breaking existing OCR/corpus flows; keep archive behavior opt-in.
  - Done: user can export correction corpus formats from Dev OCR panel and OCR handler supports optional archiving of OCR samples with metadata.
- Constraints:
  - Scope limited to Tier 3 #9 correction-corpus export and archive plumbing.
  - Reuse existing OCR alias model and existing download/export patterns.
  - No schema-breaking changes to OCR process result contracts.
- In scope:
  - Create `src/utils/ocrCorpusBuilder.ts` for corpus construction and format serialization (JSON/JSONL/BOX).
  - Extend `src/utils/export.ts` with text-file export helper for non-JSON artifacts.
  - Add Dev OCR panel corpus action button to export correction corpus files.
  - Add opt-in OCR sample archive helper path in `electron/ocrHandler.cjs`.
  - Add focused unit tests for corpus builder behavior.
- Out-of-scope (this increment):
  - Full Tesseract training pipeline integration.
  - Dictionary generation, pattern engine, and accessibility-audit roadmap items.
  - New standalone IPC channels for corpus export.
- Done condition:
  - Export action emits three files (JSON, JSONL, BOX) from alias-model corrections.
  - Empty/low-signal models are handled gracefully with status feedback.
  - OCR handler can archive sample image + metadata when explicitly requested via runtime options.
  - Focused validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime + tooling changes touching Electron OCR pipeline and Dev OCR UI/export behavior.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T3-019
- Goal: continue OCR enhancement roadmap with Tier 3 #10 by generating and applying a custom Tesseract user-words dictionary from pilot registry data.
- Intent confirmation block:
  - Goal: create and wire a regenerable OCR dictionary so Tesseract can bias toward known pilot names.
  - Constraints: keep this increment additive and bounded to dictionary generation + wiring; preserve existing OCR behavior when dictionary is absent.
  - Done: Electron can regenerate/apply dictionary from pilot registry/match history, auto-refresh can trigger from data changes, and Dev OCR panel has a manual regenerate action.
- Constraints:
  - Scope limited to Tier 3 #10 dictionary generation and integration paths.
  - Keep IPC additions allowlisted and security fixture parity aligned.
  - Avoid breaking existing OCR processing contracts and cache behavior.
- In scope:
  - Add `electron/tesseractDictionary.cjs` helper for user-words generation (+ OCR-safe name variations).
  - Integrate dictionary load/apply path into `electron/ocrHandler.cjs` worker lifecycle.
  - Add IPC handler `regenerate-ocr-dictionary` in OCR handler.
  - Add preload allowlist + security negative test parity for new IPC channel.
  - Add `GameDataProvider` auto-regeneration effect when pilot registry is sufficiently populated.
  - Add manual dictionary regeneration action in `DevOCRPanel`.
- Out-of-scope (this increment):
  - Pattern recognition engine and accessibility-audit roadmap items.
  - OCR model replacement or major OCR merge algorithm changes.
  - Dictionary quality analytics dashboards.
- Done condition:
  - Regeneration channel writes dictionary file and reports summary counts.
  - Active Tesseract workers receive updated dictionary parameters when regenerated.
  - Auto-regeneration triggers from pilot-registry/match changes (with guardrails against spam).
  - Dev OCR panel exposes manual regeneration with user feedback.
  - Focused validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime OCR + IPC + renderer behavior changes across Electron and React surfaces.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T3-020
- Goal: continue OCR enhancement roadmap with Tier 3 #11 by adding teammate pattern recognition suggestions into OCR correction flow and Dev OCR insights.
- Intent confirmation block:
  - Goal: derive teammate co-occurrence patterns from match history and surface likely teammate suggestions during OCR correction.
  - Constraints: keep scope additive and bounded to Tier 3 #11 utility + UI wiring; preserve current correction workflow behavior.
  - Done: new pattern utility exists, OCR correction modal shows likely teammate suggestions, and Dev OCR panel exposes basic pattern insight visibility.
- Constraints:
  - Limit this increment to pattern-recognition suggestion logic and UI presentation.
  - Reuse existing `Match` data model and keep no schema changes.
  - Keep suggestion scoring deterministic and lightweight for in-app runtime.
- In scope:
  - Add `src/utils/patternRecognition.ts` with co-occurrence matrix build + teammate suggestion scoring.
  - Add focused tests for pattern utility behavior.
  - Wire suggestion panel into `src/components/OcrCorrectionModal.tsx` with click-to-apply support for unresolved OCR names.
  - Add Dev OCR pattern summary block in `src/components/DevOCRPanel.tsx`.
- Out-of-scope (this increment):
  - Accessibility audit workstream.
  - Pattern persistence/export pipelines or backend services.
  - Full auto-apply of suggestions without explicit user interaction.
- Done condition:
  - Teammate pattern utility returns ranked suggestions for detected names.
  - OcrCorrectionModal displays likely teammates with reasons and allows explicit user-initiated suggestion application.
  - Dev OCR panel surfaces pattern insight summary for validation/debugging.
  - Focused validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file runtime utility + OCR modal/dev-panel behavior updates in user-facing OCR workflow.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T3-021
- Goal: continue OCR enhancement roadmap with Tier 3 #12 by shipping the first accessibility-audit increment (shared hooks/utilities + modal accessibility hardening + Dev OCR audit visibility).
- Intent confirmation block:
  - Goal: improve keyboard/screen-reader support in high-traffic modal workflows and expose actionable automated audit output in Dev OCR tools.
  - Constraints: keep this increment additive and bounded to accessibility foundations plus targeted modal updates; preserve existing OCR and settings behavior.
  - Done: new accessibility hooks/utilities/styles exist, targeted modals include dialog/focus semantics + Escape support, and Dev OCR panel can run/show automated audit findings.
- Constraints:
  - Scope limited to Tier 3 #12 foundational implementation (not full app-wide WCAG closure in one pass).
  - Reuse existing modal patterns and avoid contract-breaking state/schema changes.
  - Keep reduced-motion behavior aligned with current CSS strategy and add only minimal accessibility-specific style helpers.
- In scope:
  - Add `src/hooks/useFocusTrap.ts`.
  - Add `src/hooks/useAriaLiveRegion.ts`.
  - Add `src/styles/accessibility.css` and import it in app entry.
  - Add `src/utils/accessibilityAudit.ts` (+ focused tests).
  - Add modal accessibility hardening in:
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/BatchActionConfirmDialog.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/components/RenameModal.tsx`
    - `src/components/ResetConfirmModal.tsx`
    - `src/components/EditMatchModal.tsx`
  - Add Dev OCR panel audit action/summary in `src/components/DevOCRPanel.tsx`.
- Out-of-scope (this increment):
  - Full-screen-reader QA pass across every view and control in the entire app.
  - Lighthouse/axe CI automation integration.
  - Remaining non-targeted modals/components (including `src/components/ocr/OCRReviewModal.tsx`) beyond this bounded pass.
- Done condition:
  - Accessibility hooks/utilities/styles are implemented and wired.
  - Targeted modals expose `role="dialog"`, `aria-modal`, label associations, focus trap behavior, and keyboard escape handling.
  - Dev OCR panel can run an automated audit and display issue summaries.
  - Focused validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file user-facing runtime behavior updates across modal interaction patterns and Dev OCR tooling.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T3-022
- Goal: continue Tier 3 #12 accessibility rollout by hardening `OCRReviewModal` (the remaining high-traffic OCR review dialog) with modal semantics, focus trapping, and keyboard behavior.
- Intent confirmation block:
  - Goal: make `OCRReviewModal` keyboard/screen-reader compatible at parity with other updated dialogs.
  - Constraints: keep this increment tightly scoped to `OCRReviewModal` + focused tests and avoid workflow behavior changes outside accessibility.
  - Done: `OCRReviewModal` has proper dialog ARIA attributes, focus trap behavior for both main dialog and screenshot lightbox, Escape handling, and focused test evidence.
- Constraints:
  - Scope is limited to `src/components/ocr/OCRReviewModal.tsx` and focused tests.
  - Preserve existing OCR review functionality and button actions.
  - Keep changes additive without store/schema/IPC contract changes.
- In scope:
  - Add focus trap and keyboard shortcut handling to `OCRReviewModal`.
  - Add dialog ARIA semantics (`role="dialog"`, `aria-modal`, labels/descriptions).
  - Harden screenshot lightbox accessibility (dialog semantics + labeled controls).
  - Add focused test coverage in `src/components/ocr/OCRReviewModal.test.tsx`.
- Out-of-scope (this increment):
  - Further Dev OCR panel changes.
  - App-wide accessibility sweep beyond `OCRReviewModal`.
  - New persistence, OCR parsing, or capture pipeline behavior.
- Done condition:
  - `OCRReviewModal` and its lightbox are keyboard reachable/trapped and Escape-close compliant.
  - Icon-only controls in modal/lightbox have clear accessible names.
  - Focused lint/test/typecheck evidence is captured in validation docs.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: user-visible modal interaction/accessibility updates in a core OCR workflow component.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T3-023
- Goal: continue Tier 3 #12 accessibility rollout by hardening remaining high-use overlays (`DrillDownOverlay` and App-level changelog/ID mapper wrappers) with proper dialog semantics, focus management, and Escape-close behavior.
- Intent confirmation block:
  - Goal: make these overlays keyboard/screen-reader accessible at parity with recently updated modals.
  - Constraints: keep this increment narrowly scoped to targeted overlays plus focused tests; preserve existing analytics and settings workflows.
  - Done: overlays expose dialog ARIA semantics, trap focus while open, support Escape close, and have focused test evidence.
- Constraints:
  - Scope limited to:
    - `src/components/DrillDownOverlay.tsx`
    - `src/App.tsx` (changelog + ID mapper wrappers only)
    - focused test files for the above behavior.
  - Preserve existing UI layout/content and close-on-scrim behavior.
  - Keep changes additive; no store/schema/IPC contract changes.
- In scope:
  - Add `role="dialog"`, `aria-modal`, and label/description wiring for targeted overlays.
  - Add focus trapping while overlays are open using existing `useFocusTrap`.
  - Add Escape keyboard close handling for these overlays.
  - Add focused test coverage:
    - `src/components/DrillDownOverlay.test.tsx`
    - `src/App.test.tsx` overlay semantics/keyboard checks.
- Out-of-scope (this increment):
  - Smart Captures and Match Recording screenshot lightbox accessibility hardening.
  - Tutorial overlay accessibility updates.
  - Broad app-wide accessibility audit expansion.
- Done condition:
  - Drill-down overlay, changelog modal, and ID mapper wrapper are announced as dialogs with labels.
  - Focus remains within open overlay until dismissal.
  - Escape closes targeted overlays without regressions.
  - Focused lint/test/typecheck evidence is captured in validation docs.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: bounded user-facing accessibility behavior updates across modal-like overlays.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T3-024
- Goal: continue Tier 3 #12 accessibility rollout by hardening tutorial overlay and match-detail screenshot lightbox behavior.
- Intent confirmation block:
  - Goal: ensure tutorial and Match Recording lightbox overlays provide keyboard/screen-reader compatible dialog behavior.
  - Constraints: keep this increment narrowly scoped to `Tutorial` and `MatchRecordingPage` (+ focused tests only).
  - Done: both overlays expose dialog semantics, trap focus while open, and close on Escape with focused validation evidence.
- Constraints:
  - Scope limited to:
    - `src/components/Tutorial.tsx`
    - `src/components/MatchRecordingPage.tsx`
    - focused tests for these components.
  - Preserve current tutorial flow order, step navigation, and match-detail workflow behavior.
  - Keep changes additive; no store/schema/IPC contract changes.
- In scope:
  - Add dialog semantics (`role="dialog"`, `aria-modal`, label/description wiring) to tutorial tooltip and match screenshot lightbox.
  - Add focus trapping for tutorial overlay and match screenshot lightbox.
  - Add Escape keyboard close behavior for match screenshot lightbox (tutorial already uses Escape and will keep parity).
  - Add focused tests:
    - `src/components/Tutorial.test.tsx`
    - `src/components/MatchRecordingPage.test.tsx`
- Out-of-scope (this increment):
  - Smart Captures panel JSON export/lightbox accessibility hardening.
  - Additional App-level overlay changes already completed in `OCR-ENHANCEMENT-T3-023`.
  - Full app-wide accessibility closure.
- Done condition:
  - Tutorial overlay and Match Recording lightbox are announced as dialogs with labels.
  - Focus remains contained while each overlay is open.
  - Escape closes the match screenshot lightbox and tutorial Escape behavior remains functional.
  - Focused lint/test/typecheck evidence is captured in validation docs.
- AOM_V2:
  - Risk Tier: `T1`
  - Execution Path: `FULL_PATH`
  - Reason: bounded accessibility behavior updates to two UI overlays with focused regression tests.

---

## Intake - 2026-02-17 - OCR-ENHANCEMENT-T3-025
- Goal: implement a visual drag/resize OCR ROI crop-box editor on full-resolution images and fix reported OCR/player/dev-panel layout/input regressions.
- Intent confirmation block:
  - Goal: add a practical visual ROI editor and resolve the active UX regressions blocking OCR correction and dev workflows.
  - Constraints: keep scope strictly bounded to requested UI behavior fixes; preserve existing OCR extraction contracts and settings schema.
  - Done: users can draw/drag/resize ROI boxes visually on full-resolution image input, players panel fills available height, Dev Utilities tab is fully scrollable without clipping, OCR wizard/modal top cutoff is resolved, and OCR entry text inputs keep focus/cursor and accept typing reliably.
- Constraints:
  - Scope limited to renderer/UI components and existing settings/ROI state wiring.
  - No OCR IPC/schema changes and no extractor algorithm changes in this increment.
  - Keep changes additive and consistent with `docs/agents/UI_MASTERPLAN.md` surface/layout rules.
- In scope:
  - Add visual ROI editor modal component and wire from Settings ROI section.
  - Keep existing numeric ROI fields; visual editor is additive.
  - Fix panel height/fill behavior in `PlayerHub` under full dashboard shell.
  - Fix Dev OCR Utilities overflow/cutoff behavior.
  - Fix OCR modal vertical placement (top cutoff) and OCR correction input focus/typing behavior.
- Out-of-scope (this increment):
  - OCR extraction algorithm changes, benchmark methodology changes, or new OCR IPC channels.
  - Major redesign of Dev OCR/Players information architecture.
  - App-wide modal layout refactor beyond targeted OCR-related dialogs.
- Done condition:
  - Visual ROI editor can load an image, select a region, draw a rectangle, drag it, and resize it; applying persists to `ocrRegions`.
  - Players view uses full available panel height without visible bottom dead-zone regression.
  - Dev Utilities content is scrollable and no longer clipped.
  - OCR correction/review modal no longer appears cut off at top in normal full-mode usage.
  - OCR correction text entry keeps cursor and accepts typing consistently.
  - Focused validation evidence is recorded in `docs/agents/03_VALIDATION.md`.
- AOM_V2:
  - Risk Tier: `T2`
  - Execution Path: `FULL_PATH`
  - Reason: multi-file user-facing interaction/layout changes across settings/editor/modal/dashboard surfaces.
