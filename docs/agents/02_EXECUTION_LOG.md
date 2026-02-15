# Execution Log - 2026-02-14

## Task
- ID: `WG-2026-02-14-SMARTCAPTURE-SYNC`
- Scope: performance assessment + artifact/result sync regression fix

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-001` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: Patch artifact bundling state mismatch and submission artifact sync.
  - Evidence Target: `electron/handlers/artifactHandlers.cjs`, `src/hooks/useMatchSubmission.ts`
- `REQ-WG-001` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: Accepted; implementation in current lane.
- `REQ-WG-001` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active on handler + hook + tests.
- `REQ-WG-001` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-001` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `electron/handlers/artifactHandlers.cjs`
    - `src/hooks/useMatchSubmission.ts`
    - `src/hooks/__tests__/useMatchSubmission.test.ts`
    - `docs/agents/03_VALIDATION.md`

## Work Entries
- 22:16Z
  - Confirmed root-cause candidates:
    - Bundler state object key mismatch (`bundledKeys` vs helper-expected `bundledSizes`).
    - Match-scoped screenshot files saved to disk are not guaranteed to be mirrored into `match.artifacts` during submission.
  - Next: implement minimal corrective patch and add regression test.

- 22:21Z
  - Implemented bundling fix in `electron/handlers/artifactHandlers.cjs`:
    - Replaced incorrect state key `bundledKeys` with `bundledSizes` to match helper contract.
  - Impact:
    - Prevents runtime failure in `scanDirForImagesInWindow` dedupe path.

- 22:23Z
  - Implemented submission-side artifact synchronization in `src/hooks/useMatchSubmission.ts`:
    - Added post-bundle reconciliation using `getMatchArtifactsStructured(matchId)`.
    - Merged/deduped artifacts from:
      - existing match artifacts
      - bundler output
      - on-disk match artifact directory
    - Added telemetry-draft start-time fallback for bundling window when `matchStartTime` is unavailable.
  - Impact:
    - Match history now aligns with Smart Capture files without requiring repair pass.

- 22:25Z
  - Added regression test in `src/hooks/__tests__/useMatchSubmission.test.ts`:
    - Verifies on-disk artifacts are synced into match record even when bundler returns no files.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `Plan#2/3` | Owner: `debugger`
  - Delta: bundling state-key repair + submission artifact reconciliation + regression test.
  - Evidence pointers:
    - `electron/handlers/artifactHandlers.cjs`
    - `src/hooks/useMatchSubmission.ts`
    - `src/hooks/__tests__/useMatchSubmission.test.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: Approve targeted fix scope for release as minimal regression correction.
- `PM Response` | `APPROVED`
  - Reason: Fix is scoped, validated, and aligned to user-reported failure mode.

---

## Task
- ID: `WG-2026-02-14-TELEMETRY-PROFILES`
- Scope: implement Low Power / Balanced / High Accuracy telemetry performance toggle

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-002` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: add persisted setting + settings UI + main-process runtime profile behavior.
- `REQ-WG-002` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: Accepted in current lane.
- `REQ-WG-002` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active across settings/store/ui/main process.
- `REQ-WG-002` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-002` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/store/slices/createSettingsSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/components/SettingsModal.tsx`
    - `src/hooks/useLogMonitor.ts`
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`

## Work Entries
- 22:22Z
  - Traced implementation surfaces:
    - `createSettingsSlice` (setting contract)
    - `useAppStore` (hydrate/save persistence mapping)
    - `SettingsModal` (UI control)
    - `useLogMonitor` (IPC payload to main)
    - `electron/main.cjs` (actual runtime monitoring loop behavior)

- 22:28Z
  - Implemented setting contract updates:
    - Added `telemetryPerformanceProfile` (`low-power` | `balanced` | `high-accuracy`) to `createSettingsSlice`.
    - Added setter and default (`balanced`).
    - Wired hydration/persistence in `useAppStore`.

- 22:30Z
  - Implemented Settings UI:
    - Added 3-way telemetry profile control in `SettingsModal`.
    - Persisted profile in manual `Save & Apply` path.

- 22:33Z
  - Implemented runtime behavior wiring:
    - `useLogMonitor` now sends `start-log-monitoring` payload `{ performanceProfile }`.
    - `electron/main.cjs` now:
      - resolves profile
      - applies profile-specific poll interval
      - throttles decode cadence
      - throttles snapshot writes
      - avoids archive/history writes when no usable telemetry events.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `Current Plan#2/#3` | Owner: `debugger`
  - Delta: added 3-way telemetry performance profile and runtime monitoring controls.
  - Evidence pointers:
    - `src/store/slices/createSettingsSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/components/SettingsModal.tsx`
    - `src/hooks/useLogMonitor.ts`
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: Approve profile defaults (`balanced` default) and runtime throttle strategy.
- `PM Response` | `APPROVED`
  - Reason: Scope is narrow, behavior is user-configurable, and evidence is complete.

---

## 2026-02-15 - TELEMETRY-BASTION-001
- Scope: telemetry loadout detection reliability in `useLogMonitor`.
- Findings:
  - Hero/ship selection was primarily gated by GUID presence.
  - When telemetry emits raw hero/ship names without GUID fields, updates could be skipped.
  - Ship GUID fallback coverage is sparse in hardcoded maps, increasing missed detections.
- Implemented:
  - Added case-insensitive loadout field accessor for GUID/name keys.
  - Expanded GUID key handling for hero (`guidhero`/`heroguid`/etc.) and ship (`guidship`/`shipguid`/etc.).
  - Added no-GUID fallback path: resolve hero/ship from raw string fields using fuzzy match against canonical lists.
  - Kept existing GUID lookup behavior intact and preserved unknown-ID registration flow.
- Edited files:
  - `src/hooks/useLogMonitor.ts`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `TELEMETRY-BASTION-001#2` | Owner: `debugger`
  - Delta: raw-field fallback added for hero/ship telemetry resolution when GUID is absent; GUID extraction generalized.
  - Evidence pointers:
    - `src/hooks/useLogMonitor.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: Approve minimal parsing behavior change for non-GUID telemetry events.
- `PM Response` | `APPROVED`
  - Reason: narrow scope fix, no schema/API changes, validation evidence present.

---

## 2026-02-15 - BUG-BATCH-001
- Scope: first-pass fixes from user-reported multi-bug list.
- Implemented:
  - `src/components/SmartCapturesPanel.tsx`
    - Prevented stale resolve overwrite by resolving against latest store state before `updateMatch`.
    - Added OCR name resolution (exact + fuzzy) when applying reprocessed/session data.
    - Enforced teammate cap using ship capacity (`max teammates = crew capacity - 1`).
    - Added manual `Wizard` action in match detail action bar.
    - Added background auto artifact relink attempt on Smart Captures load.
    - Included non-saved `ocrState` items in queue classification.
  - `src/components/recording/SquadronPanel.tsx`
    - Normalized ship-name comparison so telemetry indicator dot works when telemetry ship lacks `(N Player)` suffix.
  - `src/components/recording/RosterPanel.tsx`
    - Reduced selected teammate chip font size for readability.
  - `src/components/SettingsModal.tsx`
    - Telemetry performance profile options always selectable/visible (not hidden behind Auto Log toggle).
    - Clarified capture mode labels/descriptions.
  - `src/index.css`
    - Expanded `perf-lite` CSS rules to disable additional blur/shadow-heavy rendering paths.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `BUG-BATCH-001#2/#3/#4` | Owner: `debugger`
  - Delta: fixed Smart Captures OCR-apply persistence/matching issues, added Wizard entry, improved telemetry indicator matching, and improved perf/settings clarity.
  - Evidence pointers:
    - `src/components/SmartCapturesPanel.tsx`
    - `src/components/recording/SquadronPanel.tsx`
    - `src/components/recording/RosterPanel.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/index.css`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve first-pass stabilization set and defer broader IA/navigation redesign items.
- `PM Response` | `APPROVED`
  - Reason: high-impact defects addressed with targeted changes; broader redesign deferred explicitly.

---

## 2026-02-15 - BUG-BATCH-002
- Scope: fix Recording view clipping at normal window sizes.
- Findings:
  - `RecordingView` used raw `window.innerHeight/innerWidth` for density/narrow switching, not actual available dashboard area.
  - Wide layout root was hard-clamped with `overflow-hidden`, which clipped lower recording content when height was constrained.
- Implemented:
  - `src/components/RecordingView.tsx`
    - Added container-aware sizing via `containerRef` + `ResizeObserver` + resize fallback.
    - Switched compact-mode trigger to measured container height (`< 1000`) instead of raw window height.
    - Added constrained-height fallback scrolling in wide layout.
    - Enabled left panel internal scrolling only for wide constrained-height scenarios.
  - `src/components/RecordingView.test.tsx`
    - Added assertion that compact wide constrained-height mode applies root `overflow-y-auto`.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `BUG-BATCH-002#2/#3/#4` | Owner: `debugger`
  - Delta: container-aware recording layout mode switching + constrained-height scroll fallback to prevent clipping.
  - Evidence pointers:
    - `src/components/RecordingView.tsx`
    - `src/components/RecordingView.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve this narrow recording-layout remediation as next bug-batch continuation item.
- `PM Response` | `APPROVED`
  - Reason: scoped UX defect fix in primary workflow with passing targeted checks.

---

## 2026-02-15 - BUG-BATCH-003
- Scope: settings hierarchy clarity via clickable tabs.
- Findings:
  - `SettingsModal` rendered all content in one long vertical flow, making section boundaries hard to parse quickly.
  - Reported user pain aligns with missing explicit section hierarchy affordance.
- Implemented:
  - `src/components/SettingsModal.tsx`
    - Added tab model/state: `Identity`, `Interface`, `OCR/Capture`, `Data`.
    - Added tab rail below modal header.
    - Gated existing sections by selected tab without changing control handlers or persistence logic.
    - Added overlay-safe fallback: if overlay mode is active, `Data` tab is unavailable and selection auto-falls back to `Interface`.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `BUG-BATCH-003#2/#3` | Owner: `debugger`
  - Delta: tabbed hierarchy added to settings modal with section gating and overlay-mode tab fallback.
  - Evidence pointers:
    - `src/components/SettingsModal.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve hierarchy-only refactor for settings clarity while preserving existing control behavior.
- `PM Response` | `APPROVED`
  - Reason: targeted UI clarity improvement with no behavior-contract changes and clean validation.

---

## 2026-02-15 - BUG-BATCH-004
- Scope: complete remaining open UX items from user bug list.
- Implemented:
  - `src/utils/soundCues.ts`
    - Added shared WebAudio-based cue utility (`success`, `error`, `warning`, `info`, `navigate`).
  - `src/components/Toast.tsx`
    - Added sound cue playback by toast type when sound is enabled.
  - `src/App.tsx`
    - Added view-switch navigation cue (sound-enabled only, initial-render guarded).
    - Added transition wrapper keyed by `activeView` for smoother page switches.
  - `src/index.css`
    - Added `app-view-transition` keyframes/class for view entry animation.
  - `src/components/analytics/AnalyticsShell.tsx`
    - Added external navigation event hook (`analytics:navigate-view`) for targeted subview opens.
    - Added explicit `Open detail` button on Pro tiles to ensure reliable deep-dive entry.
  - `src/components/OverlayView.tsx`
    - Added mission/squadron/social overlay tabs (reusing `overlayTab` store state).
    - Added in-overlay social pulse panel (top wingmen + tough opponents).
    - Added quick-jump actions to open full Recording/Social/Captures/History destinations from overlay.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `BUG-BATCH-004#2/#3/#4/#5` | Owner: `debugger`
  - Delta: implemented remaining UX fixes (sound indicators, pro drill reliability, overlay parity, view transitions).
  - Evidence pointers:
    - `src/utils/soundCues.ts`
    - `src/components/Toast.tsx`
    - `src/App.tsx`
    - `src/index.css`
    - `src/components/analytics/AnalyticsShell.tsx`
    - `src/components/OverlayView.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve BUG-BATCH remaining-item closure with this implementation set.
- `PM Response` | `APPROVED`
  - Reason: open-item list addressed with scoped UI/runtime updates and clean validation.

---

## 2026-02-15 - DEV-SPLASH-RETRY-001
- Scope: dev startup splash progress rollback while dev-server retry loop is active.

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-003` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: patch dev splash progress updates so percentage remains monotonic across retry + startup task writers.
- `REQ-WG-003` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-003` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active in `electron/main.cjs`.

## Work Entries
- 17:30Z
  - Traced startup path and confirmed two concurrent splash writers in dev:
    - `startDevRendererWithRetry` retry loop (`Checking/Retrying` updates).
    - `app.whenReady` startup milestones (`20 -> 90` service initialization updates).
  - Root cause:
    - Retry writer can emit lower percentages (e.g., `~30%`) after higher startup milestone writes (`~90%`), causing visible backward jumps.
  - Next:
    - Apply monotonic percent enforcement in splash update path while preserving status/detail updates.

- 17:32Z
  - Implemented targeted fix in `electron/main.cjs`:
    - Moved splash dedupe responsibility into `setSplashProgress`.
    - Enforced monotonic percent per window (`safePct = max(previousPct, requestedPct)`).
    - Preserved status/detail updates so retry messaging remains visible while waiting.
    - Kept compatibility wrapper `setSplashProgressDedupe` to avoid broader call-site churn.

- `REQ-WG-003` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-003` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `DEV-SPLASH-RETRY-001#2` | Owner: `debugger`
  - Delta: splash updater now clamps percentage monotonically per window to prevent retry-loop rollback while preserving retry status text updates.
  - Evidence pointers:
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve monotonic splash-percent policy for dev startup progress.
- `PM Response` | `APPROVED`
  - Reason: narrow startup-path fix with no production flow changes and targeted validation evidence.

- 17:33Z
  - Released `electron/main.cjs` lock in `docs/WORKLOCKS.md` and marked DEV-SPLASH-RETRY-001 plan steps complete.

---

## 2026-02-15 - TAB-LOADING-STARTUP-001
- Scope: first-startup tab switches showing Suspense fallback ("Loading view...") in dashboard mode.

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-004` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: preload lazy-loaded dashboard tabs so first navigation does not block on chunk fetch.
- `REQ-WG-004` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-004` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active in `src/App.tsx`.

## Work Entries
- 17:35Z
  - Traced active view rendering in `src/App.tsx`:
    - `analytics`, `history`, `smart-captures`, `players`, and `dev-ocr` are `React.lazy(...)`.
    - `<Suspense fallback={viewFallback}>` wraps the active view, so first load of any lazy chunk shows "Loading view...".
  - Root cause:
    - Chunks are fetched on first tab click instead of warm-loaded shortly after startup.
  - Next:
    - Add scoped background preloading for dashboard lazy chunks after initial app mount.

- 17:37Z
  - Implemented lazy-chunk preload in `src/App.tsx`:
    - Replaced inline `React.lazy(() => import(...))` with named loader functions for main dashboard tabs.
    - Added `warmLazyDashboardViews()` helper to start background imports for `analytics`, `history`, `smart-captures`, `players`, and `dev-ocr`.
    - Added startup effect gated by `!isOverlayMode` to warm these chunks after dashboard mount.
  - Expected impact:
    - First tab switches no longer need to fetch chunks at click time, reducing or eliminating "Loading view..." flashes.

- `REQ-WG-004` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-004` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/App.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `TAB-LOADING-STARTUP-001#2` | Owner: `debugger`
  - Delta: warmed lazy-loaded dashboard tab chunks on startup to prevent first-switch Suspense fallback flashes.
  - Evidence pointers:
    - `src/App.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve startup preloading scope for tab-switch UX stabilization.
- `PM Response` | `APPROVED`
  - Reason: narrow UX/performance patch with no navigation contract changes and passing targeted validation.

- 17:38Z
  - Released `src/App.tsx` lock in `docs/WORKLOCKS.md` and moved TAB-LOADING-STARTUP-001 plan to closure state.

---

## 2026-02-15 - OCR-HYDRATION-COMBINED-001
- Scope: implement combined feature set (OCR active learning + startup hydration preload governance) from approved MVP-plus plan.

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-005` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: implement deterministic local OCR alias model/scoring with compatibility persistence.
- `REQ-WG-005` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-005` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active across store, scan, app startup, and settings surfaces.

## Work Entries
- 17:42Z
  - Claimed locks for combined feature files in `docs/WORKLOCKS.md`.
  - Added intake + plan entries for OCR-HYDRATION-COMBINED-001 with MVP-plus scope and FULL_PATH risk tier.
  - Next:
    - Implement alias model + resolver engine first, then wire persistence and UI controls.

- 17:55Z
  - Implemented deterministic OCR alias model/scoring engine in `src/utils/ocrAliasEngine.ts`:
    - Alias record/update path with source/context/confidence signals.
    - Deterministic resolution scoring with ambiguity margin and strict/relaxed mode gates.
    - Blocklist and compaction support.
    - Legacy correction migration helper for backward-compatible hydration.
  - Integrated model/actions into `src/store/slices/createMappingSlice.ts`:
    - Added `ocrAliasModel` state and alias actions.
    - Preserved legacy `recordOcrCorrection` API via compatibility wrapper.
    - Kept `ocrCorrections` dual-write behavior to avoid persistence breakage.

- 18:00Z
  - Wired hydration/persistence and runtime consumers:
    - `src/store/useAppStore.ts`: hydrate/load alias model (or migrate legacy corrections), persist alias model + new OCR/preload settings.
    - `src/store/slices/createSettingsSlice.ts`: added preload + OCR learning settings/setters.
    - `src/hooks/useSmartScan.ts`: switched OCR auto-resolve to shared alias resolver with configurable gates.
    - `src/App.tsx`: applied shared resolver in OCR-apply flow; added staged startup preload scheduler gated by overlay/loading/performance/settings.
    - `src/components/SettingsModal.tsx`: exposed startup preload and OCR learning controls, plus learned alias list with block/unblock actions.
    - `src/utils/storage.ts`: extended storage type with optional `ocrAliasModel`.
  - Added tests:
    - `src/utils/__tests__/ocrAliasEngine.test.ts`
    - `src/store/slices/__tests__/createMappingSlice.test.ts`

- 18:03Z
  - Ran validation passes:
    - targeted tests (`ocrAliasEngine`, `createMappingSlice`) PASS.
    - typecheck initially failed with strict `Record<OcrAliasContext, number>` mismatch in legacy correction context map.
  - Applied targeted fix in `src/store/slices/createMappingSlice.ts`:
    - normalized legacy context map to a full keyset before increment.
  - Re-ran validation:
    - `npm run typecheck` PASS.
    - `npx eslint` on touched files PASS.
    - targeted tests PASS.

- `REQ-WG-005` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-005` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/utils/ocrAliasEngine.ts`
    - `src/store/slices/createMappingSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/hooks/useSmartScan.ts`
    - `src/App.tsx`
    - `src/components/SettingsModal.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-HYDRATION-COMBINED-001#2/#3/#4/#5` | Owner: `debugger`
  - Delta: implemented deterministic OCR alias active-learning model with compatibility persistence/migration, wired resolver/preload controls through scan/app/settings flows, and added targeted regression tests.
  - Evidence pointers:
    - `src/utils/ocrAliasEngine.ts`
    - `src/store/slices/createMappingSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/store/slices/createSettingsSlice.ts`
    - `src/hooks/useSmartScan.ts`
    - `src/App.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/utils/__tests__/ocrAliasEngine.test.ts`
    - `src/store/slices/__tests__/createMappingSlice.test.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve combined OCR learning + startup preload implementation closure under MVP-plus scope.
- `PM Response` | `APPROVED`
  - Reason: full requested scope implemented with compatibility guardrails and passing targeted validation evidence.

- 18:04Z
  - Released OCR-HYDRATION-COMBINED-001 file locks in `docs/WORKLOCKS.md` and marked plan steps complete.

---

## 2026-02-15 - ADV-AUTOLEARN-V2-001
- Scope: implement advanced OCR auto-learning governance (queue/history/rollback), corpus threshold recommendation pipeline, and adaptive preload controls.

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-006` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: finish advanced OCR learning/runtime integration and IPC-backed threshold recommendation endpoint.
- `REQ-WG-006` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-006` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active across OCR engine/store/settings/app/electron/script/test surfaces.

## Work Entries
- 18:14Z
  - Claimed ADV-AUTOLEARN-V2 implementation locks in `docs/WORKLOCKS.md`.
  - Confirmed intake/plan scope for:
    - OCR learning queue/history/rollback lifecycle,
    - recommendation script + IPC/UI controls,
    - adaptive preload policy wiring and telemetry-aware ordering.

- 18:20Z
  - Completed core OCR governance model integration:
    - `src/utils/ocrAliasEngine.ts`: learning event/queue types + explainability + queue policy helper + alias rollback helper.
    - `src/store/slices/createMappingSlice.ts`: `log/enqueue/approve/reject/rollback/clearResolved` lifecycle actions.
    - `src/store/slices/createSettingsSlice.ts`, `src/store/useAppStore.ts`, `src/utils/storage.ts`: advanced state + persistence.
    - `src/hooks/useSmartScan.ts`, `src/App.tsx`, `src/components/ReviewQueueModal.tsx`: runtime wiring for queueing/approval/rejection behavior.

- 18:28Z
  - Finished advanced settings + recommendation pipeline:
    - `src/components/SettingsModal.tsx`: added controls for review mode, queue policy, auto-promote threshold, adaptive preload budget, recommendation run/apply/revert, learning history rollback.
    - `scripts/ocr_threshold_recommend.cjs`: added corpus metric-based recommendation generator.
    - `electron/main.cjs`: added `ocr-corpus-threshold-recommend` IPC handler.
    - `electron/preload.cjs`: allowlisted `ocr-corpus-threshold-recommend`.
    - `package.json`: added `ocr:threshold:recommend` command.
    - `scripts/security_negative_tests.cjs`: synced channel allowlist fixture.

- 18:34Z
  - Expanded tests:
    - `src/utils/__tests__/ocrAliasEngine.test.ts`: coverage for `requiresReview`, `removeAliasCorrection`, and `shouldQueueLearningReview`.
    - `src/store/slices/__tests__/createMappingSlice.test.ts`: queue approve/reject/rollback/clear lifecycle coverage.
  - Resolved one targeted failing assertion by making resolved-event cleanup cutoff deterministic.

- `REQ-WG-006` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-006` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/utils/ocrAliasEngine.ts`
    - `src/store/slices/createMappingSlice.ts`
    - `src/components/SettingsModal.tsx`
    - `scripts/ocr_threshold_recommend.cjs`
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `ADV-AUTOLEARN-V2-001#1/#2/#3/#4/#5/#6` | Owner: `debugger`
  - Delta: completed full advanced auto-learning implementation (queue/history/rollback governance, recommendation script+IPC+UI apply/revert, adaptive preload controls/runtime wiring) with regression tests and targeted validation.
  - Evidence pointers:
    - `src/utils/ocrAliasEngine.ts`
    - `src/store/slices/createMappingSlice.ts`
    - `src/store/slices/createSettingsSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/hooks/useSmartScan.ts`
    - `src/App.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `scripts/ocr_threshold_recommend.cjs`
    - `electron/main.cjs`
    - `electron/preload.cjs`
    - `src/utils/__tests__/ocrAliasEngine.test.ts`
    - `src/store/slices/__tests__/createMappingSlice.test.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve advanced auto-learning bundle closure for ADV-AUTOLEARN-V2-001.
- `PM Response` | `APPROVED`
  - Reason: scoped feature bundle delivered with passing validation and persistence/runtime compatibility preserved.

---

## 2026-02-15 - DEV-STARTUP-HOOKS-001
- Scope: dev startup responsiveness improvements + settings hook-order crash fix.

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-007` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: fix Settings hook-order runtime error and adjust dev startup path so splash appears earlier.
- `REQ-WG-007` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-007` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active in `src/components/SettingsModal.tsx`, `package.json`, and `electron/main.cjs`.

## Work Entries
- 18:41Z
  - Root-caused settings crash:
    - `src/components/SettingsModal.tsx` had `useEffect` below `if (!showSettings) return null;`.
    - When modal was closed, that hook did not execute; when opened, it did, causing React hook-count mismatch.
  - Applied fix:
    - moved overlay-mode tab-guard `useEffect` above the early return so hook order remains stable.

- 18:43Z
  - Improved dev startup launch path:
    - updated `package.json` scripts:
      - `electron:dev` now launches Electron immediately (removed `wait-on tcp:5173`).
      - `dev:hot` now launches Electron immediately (removed `wait-on tcp:5173`).
    - This lets dev splash appear while Vite is still booting.

- 18:44Z
  - Reduced startup blocking in `electron/main.cjs`:
    - created window before tray initialization to prioritize visible startup feedback.
    - moved telemetry migration to non-blocking background call (`void ensureTelemetryHistoryMigrated()`).
    - deferred telemetry archive cleanup off critical path (`setTimeout(..., 0)`).
    - moved cloud initialization into background async task (no `await` on main startup path).
    - slightly reduced retry backoff and first retry delay in `startDevRendererWithRetry` for faster dev-server detection.

- `REQ-WG-007` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-007` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/components/SettingsModal.tsx`
    - `package.json`
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `DEV-STARTUP-HOOKS-001#2/#3/#4/#5` | Owner: `debugger`
  - Delta: fixed settings hook-order crash and updated dev startup flow to show splash earlier and defer non-critical init work.
  - Evidence pointers:
    - `src/components/SettingsModal.tsx`
    - `package.json`
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for startup responsiveness + hook-order stability patch.
- `PM Response` | `APPROVED`
  - Reason: root cause addressed directly with narrow startup-path improvements and clean validation.

---

## 2026-02-15 - PROFILE-SETTINGS-MERGE-001
- Scope: consolidate settings access into profile hub and remove standalone sidebar settings button.

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-008` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: remove duplicate sidebar settings entry and keep settings reachable from profile icon menu.
- `REQ-WG-008` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-008` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active in `src/components/Sidebar.tsx` and `src/components/Tutorial.tsx`.

## Work Entries
- 18:48Z
  - Confirmed existing profile icon already opens a menu that contains a Settings action.
  - Located duplicate standalone settings button near bottom of `Sidebar`.
  - Found tutorial dependency pointing at removed target selector `nav-settings` (`src/components/Tutorial.tsx`).

- 18:49Z
  - Implemented UI consolidation:
    - removed standalone sidebar settings button from `src/components/Sidebar.tsx`.
    - updated tutorial settings step to target `profile-selector` with updated description in `src/components/Tutorial.tsx`.

- `REQ-WG-008` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-008` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/components/Sidebar.tsx`
    - `src/components/Tutorial.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `PROFILE-SETTINGS-MERGE-001#2/#3/#4` | Owner: `debugger`
  - Delta: removed standalone settings button and kept settings access via profile hub menu; updated tutorial to point at profile hub.
  - Evidence pointers:
    - `src/components/Sidebar.tsx`
    - `src/components/Tutorial.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for settings/profile consolidation.
- `PM Response` | `APPROVED`
  - Reason: requested scope delivered with tutorial alignment and no regressions in validation.

---

## 2026-02-15 - PROFILE-BUTTON-WIDTH-001
- Scope: make profile button width match nav button lane width in sidebar.

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-009` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: remove width mismatch by ensuring profile button wrapper spans full sidebar lane.
- `REQ-WG-009` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-009` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active in `src/components/Sidebar.tsx`.

## Work Entries
- 11:54Z
  - Root-caused width mismatch:
    - profile button had `w-full`, but parent wrapper `div` was `relative` without `w-full`.
    - this caused the button to size against content-width wrapper instead of full nav lane width.

- 11:55Z
  - Implemented minimal fix in `src/components/Sidebar.tsx`:
    - updated profile wrapper class from `relative` to `relative w-full`.
  - Ran targeted validation:
    - `npx eslint src/components/Sidebar.tsx` PASS.
    - `npm run typecheck` PASS.

- `REQ-WG-009` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-009` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/components/Sidebar.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `PROFILE-BUTTON-WIDTH-001#2/#3/#4` | Owner: `debugger`
  - Delta: fixed profile button width mismatch with single wrapper class update and passing validation.
  - Evidence pointers:
    - `src/components/Sidebar.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for profile-width parity fix.
- `PM Response` | `APPROVED`
  - Reason: scoped class-only fix addresses reported width mismatch without behavior changes.

---

## 2026-02-15 - OVERLAY-NAV-RECORDING-LAYOUT-001
- Scope: keep overlay tab navigation in-overlay, add explicit full-view actions, and reorder recording layout with Match Recording above Mission Intel.

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-010` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: eliminate overlay tab forced exits and realign recording panel order.
- `REQ-WG-010` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-010` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active in `src/components/OverlayView.tsx`, `src/components/RecordingView.tsx`, and `src/components/RecordingView.test.tsx`.

## Work Entries
- 12:01Z
  - Root-caused overlay issue:
    - overlay "Record/Social" controls called `exitOverlayToView(...)`, which always disables overlay mode.
  - Confirmed recording layout baseline:
    - `ActionPanel` was in left shell while `MissionPanel` was separate, not stacked in requested order.

- 12:04Z
  - Implemented overlay navigation updates in `src/components/OverlayView.tsx`:
    - tab rail labels now use `Recording`, `Loadout`, `Social`.
    - tab controls stay in overlay (`setOverlayTab`) instead of exiting.
    - added explicit `Open Full` action (`openCurrentTabInFullView`) plus explicit `History`/`Captures` full-view actions.
    - in compact overlay style, moved `ActionPanel` above mission-render area.

- 12:06Z
  - Implemented recording layout reorder in `src/components/RecordingView.tsx`:
    - left shell now focuses on `SquadronPanel` (loadout).
    - `ActionPanel` moved into main content column and rendered above `MissionPanel` in both wide and narrow layouts.
    - preserved compact density behavior for both loadout and action panel.

- 12:08Z
  - Updated `src/components/RecordingView.test.tsx`:
    - replaced compact tab-swap assertions with new layout assertions.
    - added ordering assertion to ensure `ActionPanel` renders before `MissionPanel`.
    - kept narrow/wide density checks.

- 12:10Z
  - Validation runs:
    - `npx vitest run src/components/RecordingView.test.tsx` PASS (4 tests).
    - `npx eslint src/components/OverlayView.tsx src/components/RecordingView.tsx src/components/RecordingView.test.tsx` PASS.
    - `npm run typecheck` PASS.

- `REQ-WG-010` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-010` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/components/OverlayView.tsx`
    - `src/components/RecordingView.tsx`
    - `src/components/RecordingView.test.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OVERLAY-NAV-RECORDING-LAYOUT-001#2/#3/#4/#5` | Owner: `debugger`
  - Delta: overlay tab controls now stay in overlay with explicit full-view actions; recording layout now renders Match Recording above Mission Intel; tests updated and all validations passing.
  - Evidence pointers:
    - `src/components/OverlayView.tsx`
    - `src/components/RecordingView.tsx`
    - `src/components/RecordingView.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for overlay navigation + recording layout reorder patch.
- `PM Response` | `APPROVED`
  - Reason: requested UX behavior delivered with focused runtime changes and passing targeted validation.

---

## 2026-02-15 - RECORDING-ROLLBACK-ALIGN-001
- Scope: restore previous Recording panel placement and normalize cross-view shell alignment for sidebar tab switching.

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-011` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: rollback Recording panel order and remove tab-to-tab top/frame alignment drift.
- `REQ-WG-011` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-011` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active in recording layout/tests and dashboard shell containers.

## Work Entries
- 12:15Z
  - Root-caused alignment mismatch:
    - `App` applies outer `p-3` wrapper for lazy views while certain view shells also applied top-level `p-3` (`AnalyticsShell`, `PlayerHub`, `SmartCapturesShell`), creating inconsistent offsets/sizing vs `History`.
  - Confirmed rollback target:
    - restore `RecordingView` left-column `ActionPanel` placement and compact `Actions/Loadout` tab switching behavior.

- 12:18Z
  - Implemented rollback in `src/components/RecordingView.tsx`:
    - restored `leftTab` state + compact `Actions/Loadout` tab bar.
    - restored standard layout with both `SquadronPanel` and compact `ActionPanel` in left shell.
    - removed moved-up `ActionPanel` placement from mission column.
  - Updated `src/components/RecordingView.test.tsx`:
    - restored assertions for compact tab-swap behavior and standard left-shell panel composition.

- 12:19Z
  - Implemented alignment normalization:
    - `src/components/analytics/AnalyticsShell.tsx`: removed duplicate top-level `p-3`.
    - `src/components/PlayerHub.tsx`: removed duplicate top-level `p-3`.
    - `src/components/smart-captures/SmartCapturesShell.tsx`: removed duplicate top-level `p-3`.
    - `src/components/HistoryTable.tsx`: set root to `h-full min-h-0 overflow-y-auto` for consistent frame fill/scroll contract.

- 12:20Z
  - Validation runs:
    - `npx vitest run src/components/RecordingView.test.tsx` PASS (3 tests).
    - `npx eslint src/components/RecordingView.tsx src/components/RecordingView.test.tsx src/components/analytics/AnalyticsShell.tsx src/components/HistoryTable.tsx src/components/PlayerHub.tsx src/components/smart-captures/SmartCapturesShell.tsx` PASS.
    - `npm run typecheck` PASS.

- `REQ-WG-011` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-011` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/components/RecordingView.tsx`
    - `src/components/RecordingView.test.tsx`
    - `src/components/analytics/AnalyticsShell.tsx`
    - `src/components/HistoryTable.tsx`
    - `src/components/PlayerHub.tsx`
    - `src/components/smart-captures/SmartCapturesShell.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `RECORDING-ROLLBACK-ALIGN-001#1/#2/#3/#4` | Owner: `debugger`
  - Delta: restored prior Recording panel layout behavior and normalized cross-tab shell spacing/alignment across key dashboard views.
  - Evidence pointers:
    - `src/components/RecordingView.tsx`
    - `src/components/RecordingView.test.tsx`
    - `src/components/analytics/AnalyticsShell.tsx`
    - `src/components/HistoryTable.tsx`
    - `src/components/PlayerHub.tsx`
    - `src/components/smart-captures/SmartCapturesShell.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for rollback + alignment normalization patch.
- `PM Response` | `APPROVED`
  - Reason: requested rollback and alignment correction delivered with focused scope and passing validation.

---

## 2026-02-15 - OCR-ADAPTIVE-RESOLUTION-001
- Scope: adaptive OCR learning/runtime improvements (variant-aware resolution, contextual disambiguation, session dedupe, guarded corpus auto-ingest).

## Dependency Requests (AOM_V2 Lifecycle)
- `REQ-WG-012` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
  - Request: implement shared OCR resolver layer and wire it across Smart Capture, Smart Scan, and App OCR apply flow.
- `REQ-WG-012` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
  - Response: accepted in current lane.
- `REQ-WG-012` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
  - Workstream active across `src/utils`, `src/hooks`, and `src/App.tsx`.

## Work Entries
- 19:05Z
  - Confirmed architecture baseline:
    - `ocrAliasModel` already persists learned corrections and should remain canonical.
    - OCR naming logic is duplicated across `useSmartCapture`, `useSmartScan`, and `App`.
    - Corpus flow already runs through user-data corpus + sync-to-repo helpers in Electron main.
  - Decided implementation baseline:
    - no new persisted `playerMisreads`,
    - shared resolver utility,
    - guarded auto-corpus ingest via new IPC channel with dedupe.

- 19:10Z
  - Started Step 1 implementation:
    - extending `stringUtils` with variant-aware scoring helpers.
    - creating shared OCR name resolver utility with alias-model-derived variant map and conservative contextual resolution hooks.

- 19:18Z
  - Completed resolver foundation:
    - `src/utils/stringUtils.ts`: added `lcsLength`, `lcsRatio`, `charFrequencyOverlap`, `variantSimilarityScore`, `findBestVariantMatch`.
    - `src/utils/ocrNameResolver.ts` (new): shared alias-variant map builder, canonical dedupe helper, main resolver ladder, and conservative social-context resolver.
    - `src/utils/__tests__/stringUtils.test.ts`: added variant helper regression tests.
    - `src/utils/__tests__/ocrNameResolver.test.ts` (new): added resolver/variant/context tests.

- 19:26Z
  - Completed shared-flow integration:
    - `src/hooks/useSmartCapture.ts`:
      - switched canonical resolution to shared resolver.
      - added session-level canonical dedupe of teammates/opponents.
      - added second-pass contextual teammate/opponent resolution using `playerProfiles.playedWith` with strict gates.
    - `src/hooks/useSmartScan.ts`:
      - integrated shared resolver into fallback path after alias-queue logic.
    - `src/App.tsx`:
      - replaced local fuzzy fallback with shared resolver in OCR apply flow.

- 19:33Z
  - Completed guarded corpus auto-growth path:
    - `electron/preload.cjs`: allowlisted `ocr-corpus-add-corrected-sample`.
    - `electron/main.cjs`: added `ocr-corpus-add-corrected-sample` IPC handler with:
      - payload quality guards,
      - screenshot base64 normalization,
      - hash/signature dedupe,
      - append-to-`ground-truth.json`,
      - sync via existing `syncCorpusToRepo`.
    - `src/components/ocr/OCRReviewModal.tsx`:
      - fire-and-forget invoke to corpus auto-ingest when corrections + screenshot exist.
    - `scripts/security_negative_tests.cjs`: updated allowlist fixture and positive assertion for new channel.

- 19:41Z
  - Validation completed:
    - `npx eslint` on touched files PASS.
    - `npx vitest run src/utils/__tests__/stringUtils.test.ts src/utils/__tests__/ocrNameResolver.test.ts src/store/slices/__tests__/createMappingSlice.test.ts` PASS.
    - `node scripts/security_negative_tests.cjs` PASS (113/113).
    - `npm run -s typecheck` PASS.

- `REQ-WG-012` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md`.
- `REQ-WG-012` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/utils/stringUtils.ts`
    - `src/utils/ocrNameResolver.ts`
    - `src/hooks/useSmartCapture.ts`
    - `src/hooks/useSmartScan.ts`
    - `src/App.tsx`
    - `src/components/ocr/OCRReviewModal.tsx`
    - `electron/main.cjs`
    - `electron/preload.cjs`
    - `scripts/security_negative_tests.cjs`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ADAPTIVE-RESOLUTION-001#1/#2/#3/#4/#5` | Owner: `debugger`
  - Delta: implemented shared adaptive OCR resolver across Smart Capture/Scan/App, added session-level canonical dedupe + conservative social-context pass, and delivered guarded auto-corpus ingest IPC path from OCR review.
  - Evidence pointers:
    - `src/utils/stringUtils.ts`
    - `src/utils/ocrNameResolver.ts`
    - `src/hooks/useSmartCapture.ts`
    - `src/hooks/useSmartScan.ts`
    - `src/App.tsx`
    - `src/components/ocr/OCRReviewModal.tsx`
    - `electron/main.cjs`
    - `electron/preload.cjs`
    - `scripts/security_negative_tests.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of OCR-ADAPTIVE-RESOLUTION-001 with canonical alias-model architecture and guarded corpus auto-growth.
- `PM Response` | `APPROVED`
  - Reason: scope completed end-to-end with passing lint/tests/typecheck/security checks and no schema-breaking model fork introduced.

- 20:05Z (addendum)
  - Refined opponent contextual pass in `src/hooks/useSmartCapture.ts`:
    - Pass 1 resolves opponent names canonically.
    - Pass 2 now uses team-local resolved anchors for social disambiguation.
    - This replaces weaker teammate-anchor usage for opponent teams.
  - Re-ran regression checks for touched OCR files/tests.
  - Attempted OCR eval commands for full/sample corpora; both blocked by missing corpus JSON inputs in current workspace.

## PM Feedback Cycle (Addendum)
- `PM-FEEDBACK-REQ` | Step: `OCR-ADAPTIVE-RESOLUTION-001#2/#5` | Owner: `debugger`
  - Delta: improved opponent contextual resolution anchor strategy in Smart Capture canonicalization.
  - Evidence pointers:
    - `src/hooks/useSmartCapture.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve safe contextual-anchor refinement as part of completed OCR adaptive scope.
- `PM Response` | `APPROVED`
  - Reason: refinement tightens contextual correctness with no broader contract/schema impact and passes regression checks.

---

## 2026-02-15 - VERSION-CHANGELOG-001
- Scope: metadata-only release bump for app version + in-app changelog.

## Work Entries
- 20:18Z
  - Located authoritative version sources:
    - `package.json` (`version`)
    - `src/utils/constants.ts` (`APP_VERSION`, used in UI update modal/version badges)
    - `src/utils/changelog.ts` (release notes source rendered in update modal)
  - Confirmed current release line was `2.14.0` / `v2.14`.

- 20:20Z
  - Applied release bump:
    - `package.json`: `2.14.0` -> `2.15.0`
    - `package-lock.json`: root/package `version` -> `2.15.0`
    - `src/utils/constants.ts`: `APP_VERSION` -> `v2.15`
    - `src/utils/changelog.ts`: added new `v2.15` entry for OCR adaptive and corpus auto-growth updates.

- 20:22Z
  - Ran targeted validation and version coherence checks (see `docs/agents/03_VALIDATION.md`).

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `VERSION-CHANGELOG-001#1/#2/#3/#4` | Owner: `debugger`
  - Delta: release metadata synchronized to `2.15.0` / `v2.15` with new changelog entry.
  - Evidence pointers:
    - `package.json`
    - `package-lock.json`
    - `src/utils/constants.ts`
    - `src/utils/changelog.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of metadata-only version/changelog update.
- `PM Response` | `APPROVED`
  - Reason: requested scope completed with consistent version metadata and passing checks.
