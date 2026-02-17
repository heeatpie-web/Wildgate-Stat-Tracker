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

---

## 2026-02-15 - IDMAPPER-TELEMETRY-SHIP-001
- Scope: fix misleading `Unknown` mapper labeling and ship telemetry unknown-ID/ship-sticky regressions.

## Work Entries
- 16:50Z
  - Traced issue paths:
    - `src/components/IdMapper.tsx` known-tab role badge always renders, including `unknown`, which is misleading for mapped IDs that simply have no relationship history yet.
    - `src/hooks/useLogMonitor.ts` ship parsing accepted `shipid/ship_id` as GUID candidates; non-GUID values could be registered as unknown ships and degrade subsequent ship resolution.

- 16:54Z
  - Implemented telemetry ship parsing hardening in `src/hooks/useLogMonitor.ts`:
    - Added GUID normalization helper and strict 32-hex GUID gate.
    - Removed `shipid/ship_id` from primary GUID extraction path.
    - Improved raw ship fuzzy matching (normalized + contains matching).
    - Avoided promoting unmatched raw ship strings directly into active ship selection.

- 16:56Z
  - Implemented mapper UI clarity fix in `src/components/IdMapper.tsx`:
    - Known mappings no longer display the `Unknown` role badge when relationship role is `unknown`.
    - Existing non-unknown relationship badges remain unchanged.

- 17:00Z
  - Ran targeted validation on touched files (`eslint`, `typecheck`), both passed.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `IDMAPPER-TELEMETRY-SHIP-001#1/#2/#3/#4/#5` | Owner: `debugger`
  - Delta: fixed GUID qualification and ship fallback logic in telemetry parser; removed misleading unknown role badge in known ID mappings.
  - Evidence pointers:
    - `src/hooks/useLogMonitor.ts`
    - `src/components/IdMapper.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of the mapper/telemetry regression fix.
- `PM Response` | `APPROVED`
  - Reason: narrow-scope regressions addressed with conservative parsing guardrails and passing checks.

---

## 2026-02-15 - IDMAPPER-TELEMETRY-LOADOUT-002
- Scope: follow-up fixes for mapper unknown labeling persistence + telemetry tracking of prospector weapons/equipment.

## Work Entries
- 17:05Z
  - Updated `src/components/IdMapper.tsx` unknown-save flow:
    - type-aware mapping routes:
      - `Hero` -> `setUidMapping('players', ...)`
      - `Ship` -> `setUidMapping('ships', ...)`
      - `Weapon` -> `setUidMapping('weapons', ...)`
      - `Equipment` -> `setUidMapping('equipment', ...)`
    - fallback remains `addMapping` for generic entries.

- 17:09Z
  - Expanded telemetry loadout extraction in `src/hooks/useLogMonitor.ts`:
    - added broader candidate extraction for weapon/equipment GUID/name fields.
    - normalized GUID handling and conservative unknown registration (GUID-shaped only).
    - resolved names now combine GUID map and raw-name fuzzy matching.
    - weapon telemetry now syncs into `activeWeapons` via `setActiveWeapons`.

- 17:12Z
  - Updated `src/components/recording/ActionPanel.tsx` telemetry summary:
    - added weapons/equipment display rows.
    - telemetry info panel now appears for weapons/equipment even if ship/hero chips are absent.

- 17:14Z
  - Ran targeted validation (`eslint`, `typecheck`), both passed.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `IDMAPPER-TELEMETRY-LOADOUT-002#1/#2/#3/#4/#5` | Owner: `debugger`
  - Delta: added type-aware unknown-ID mapping and extended telemetry loadout tracking/visibility for weapons + equipment.
  - Evidence pointers:
    - `src/components/IdMapper.tsx`
    - `src/hooks/useLogMonitor.ts`
    - `src/components/recording/ActionPanel.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of follow-up mapper/loadout telemetry fixes.
- `PM Response` | `APPROVED`
  - Reason: requested follow-up behavior delivered with narrow runtime changes and passing checks.

---

## 2026-02-15 - DISABLE-RUNTIME-DEVTOOLS-001
- Scope: prevent runtime console/DevTools opening unless explicitly opted in.

## Work Entries
- 17:24Z
  - Verified startup auto-open is already disabled in `electron/main.cjs` (`openDevTools` call commented).
  - Identified remaining runtime path: IPC listener `open-devtools`.

- 17:26Z
  - Added `ALLOW_RUNTIME_DEVTOOLS` env gate:
    - `WILDGATE_ALLOW_DEVTOOLS=1` required to open DevTools.
    - default behavior is no-op when IPC `open-devtools` is triggered.

- 17:28Z
  - Validation completed (`eslint` + `typecheck`) PASS.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `DISABLE-RUNTIME-DEVTOOLS-001#1/#2/#3/#4` | Owner: `debugger`
  - Delta: runtime DevTools opening is disabled by default and opt-in via env only.
  - Evidence pointers:
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of runtime devtools-disable patch.
- `PM Response` | `APPROVED`
  - Reason: requested runtime behavior achieved with minimal scoped change and passing checks.

---

## 2026-02-16 - BUG-BATCH-005
- Scope: implement the approved multi-bug fix plan across OCR review, Smart Captures, telemetry submission bundling, corpus mode, and telemetry loadout extraction.

## Work Entries
- 09:32Z
  - Confirmed high-impact implementation set and mapped each requested bug to concrete files.

- 09:34Z
  - Updated `src/components/ocr/OCRReviewModal.tsx`:
    - raised modal/lightbox layering (`z-modal-top` + `z-top`) to prevent review controls obscuring screenshot inspection.
    - added editable opponent team name/ship/color controls.
    - added add/remove opponent team and add/remove opponent player actions.
    - added teammate add action.
    - added roster-match status badges (`Roster`, fuzzy suggestion) and `+ Roster` queue action for unmatched names.

- 09:36Z
  - Updated `src/components/OcrCorrectionModal.tsx` to fix backspace/edit lockup:
    - corrected input value precedence so cleared search text no longer snaps back to previously selected correction.

- 09:39Z
  - Updated `src/components/SmartCapturesPanel.tsx`:
    - unknown-ship teammate cap fallback now defaults to 4-player capacity (max 3 teammates) instead of dropping to zero.
    - auto-repair now runs once per app session and no longer emits repeated success toasts on each panel visit.
    - added roster-candidate queue helper with dedupe + suggestion scoring.
    - wired `onQueueRosterCandidate` through Smart Match detail -> OCR review modal.
    - added bulk `Merge` action for selected matches (union/merge core fields, remove merged source matches).

- 09:41Z
  - Updated `src/App.tsx`:
    - added reusable roster-candidate queue callback and wired it into OCR review modal.
    - fixed unknown-ship teammate cap fallback in app-level OCR apply path.

- 09:42Z
  - Updated `src/hooks/useMatchSubmission.ts`:
    - final submission now merges live wizard/session edits (teammates/opponents, kills, POIs, damage, notes) with pending telemetry draft payload.
    - adjusted social sighting bundling to use resolved final teammate/opponent lists.

- 09:45Z
  - Updated corpus reliability paths:
    - `electron/main.cjs`: added packaged-script resolver fallback for corpus eval/recommend/promote scripts; recursive corpus image listing; tolerant ground-truth parse during image import.
    - `package.json`: include `scripts/ocr*.cjs` in packaged build files.
    - `src/components/DevOCRPanel.tsx`: image-list refresh after load/import, MIME-aware image preview decoding, clearer workflow text, and plain-entry support for 4 opponent teams with team color/ship/players.

- 09:48Z
  - Updated `src/hooks/useLogMonitor.ts`:
    - fallback to payload-level loadout signals when nested loadout object is absent.
    - normalized hero GUID handling and robust raw hero/ship hint parsing.
    - expanded weapon/equipment key coverage.
    - preserved previously known weapons/equipment when current event omits those slots.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `BUG-BATCH-005#1/#2/#3/#4/#5/#6` | Owner: `debugger`
  - Delta: implemented multi-surface reliability fixes for OCR review, Smart Captures, telemetry submission bundling, corpus mode, and telemetry loadout extraction.
  - Evidence pointers:
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/hooks/useMatchSubmission.ts`
    - `src/hooks/useLogMonitor.ts`
    - `src/components/DevOCRPanel.tsx`
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of BUG-BATCH-005 implementation pass.
- `PM Response` | `APPROVED`
  - Reason: targeted bug list items were implemented with passing lint/typecheck/tests and no schema break.

---

## 2026-02-16 - BUG-BATCH-005-EVAL-EXT-001
- Scope: user-requested expanded evaluation coverage after BUG-BATCH-005 implementation.

## Work Entries
- 16:54Z
  - Ran packaged-script smoke checks from extracted archive scripts in `tmp-user-data/packaged-extract/scripts` against known-good OCR corpus fixtures in `.claude/worktrees/quizzical-bhabha/dataset/ocr-corpus`.
  - Executed full + sample flows for:
    - `ocr_corpus_eval.cjs`
    - `ocr_threshold_recommend.cjs`
    - `ocr_promote_baseline.cjs`
  - Captured outputs in `tmp-user-data/packaged-smoke`.

- 16:55Z
  - Ran targeted regression tests for telemetry/OCR matching + corpus/security IPC contract:
    - `src/hooks/__tests__/useMatchSubmission.test.ts`
    - `src/hooks/__tests__/useSmartCapture.test.ts`
    - `src/utils/__tests__/telemetryProcessor.test.ts`
    - `src/utils/__tests__/ocrAliasEngine.test.ts`
    - `src/utils/__tests__/ocrNameResolver.test.ts`
    - `electron/security/ipcValidation.test.ts`

- 16:56Z
  - Ran repo-script parity checks versus packaged-script outputs using identical fixture inputs.
  - Confirmed parity for both full + sample evaluations:
    - report summary metrics matched.
    - threshold recommendation payloads matched (`recommendedThresholds`).

- 17:09Z
  - Ran automated Electron app corpus image workflow smoke:
    - launched app with Playwright Electron runner.
    - mocked file picker (`dialog.showOpenDialog`) in main process to return two fixture images.
    - invoked renderer IPC workflow:
      - `ocr-corpus-import-images`
      - `ocr-corpus-list-images`
      - `ocr-corpus-read-image`
      - `ocr-corpus-load('ground-truth.json')`
  - Verified import/list/read path end-to-end:
    - import reported `success: true`, `imported: 2`, `skipped: 0`.
    - listed image set included imported fixtures.
    - read-image returned non-empty base64 payload.
    - `ground-truth.json` contained imported sample entries.

---

## 2026-02-16 - BUG-BATCH-006
- Scope: complete remaining user-reported reliability/UX tasks not fully closed by BUG-BATCH-005.

## Work Entries
- 18:58Z
  - Added durable smart-capture request channel in `src/providers/UIStateProvider.tsx`:
    - `smartCaptureRequest` state,
    - `requestSmartCapture(...)`,
    - `clearSmartCaptureRequest(...)`.
  - Wired `Header`, `Wizard`, and telemetry draft prompt in `App` to publish into this channel while preserving existing DOM event for compatibility.

- 19:05Z
  - Mounted `ReviewQueueModal` in `src/App.tsx` using `showReviewQueue` state from `UIStateProvider`, fixing recording-panel Intelligence Review routing.

- 19:10Z
  - Implemented ongoing-result semantics:
    - `src/types.ts` adds `MatchResult = 'Win' | 'Loss' | 'Draw' | 'Ongoing'`.
    - `src/hooks/useLogMonitor.ts` telemetry drafts now create with `result: 'Ongoing'`.
    - `src/store/useAppStore.ts` hydration migration upgrades legacy telemetry drafts (`Draw`/missing) to `Ongoing`.

- 19:16Z
  - Applied placement/result UX fixes:
    - `src/hooks/useMatchSubmission.ts` defaults placement to `1` for Win submissions when unset.
    - `src/components/SmartCapturesPanel.tsx` displays Win placement fallback as `#1`.
    - Smart Captures result actions now route through shared result-applier.

- 19:22Z
  - Added Players-tab pending roster approvals in `src/components/PlayerHub.tsx`:
    - surfaces `roster_candidate` queue items,
    - inline `Approve` / `Dismiss` actions,
    - deduped queue resolution and user toasts.

- 19:27Z
  - Completed teammate-cap + telemetry ship-ownership guardrails:
    - `src/store/slices/createFormSlice.ts` safe unknown-ship fallback to 4-player cap logic.
    - `src/components/SmartCapturesPanel.tsx` teammate manual add now respects ship-based cap.
    - `src/hooks/useLogMonitor.ts` skips non-local loadout events via actor/local identity checks.

- 19:34Z
  - Updated completed-result analytics behavior:
    - `src/components/analytics/useAnalyticsData.ts`,
    - `src/utils/analytics.ts`,
    - `src/utils/analyticsSocial.ts`.
  - Ongoing matches are excluded from win/loss/draw aggregations and related derived metrics.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `BUG-BATCH-006#1/#2/#3/#4/#5/#6/#7` | Owner: `debugger`
  - Delta:
    - fixed smart-capture request durability,
    - mounted review queue modal,
    - switched telemetry drafts to ongoing state,
    - added placement fallback + players-tab approvals,
    - aligned teammate caps and analytics filtering behavior.
  - Evidence pointers:
    - `src/providers/UIStateProvider.tsx`
    - `src/components/recording/ActionPanel.tsx`
    - `src/App.tsx`
    - `src/hooks/useLogMonitor.ts`
    - `src/hooks/useMatchSubmission.ts`
    - `src/components/PlayerHub.tsx`
    - `src/utils/analytics.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for BUG-BATCH-006 as the remaining open fix set from user list.
- `PM Response` | `APPROVED`
  - Reason: remaining reliability/UX items addressed with passing targeted validation and no schema-breaking migration.

---

## 2026-02-16 - SMOKE-PERF-CONSENSUS-001
- Scope: run smoke and assess overheating consensus from concrete runtime paths.

## Work Entries
- 13:30Z
  - Verified smoke artifact output in `.visual/report.md` from `snap:views` compare run.
  - Confirmed all 5 dashboard views processed with generated diff artifacts.

- 13:31Z
  - Inspected telemetry monitor profile mapping and poll/decode/write cadence in `electron/main.cjs`.
  - Confirmed profile behavior:
    - low-power: poll 5000ms, decode throttle 5000ms, snapshot write 30000ms.
    - balanced: poll 2000ms, decode throttle 1500ms, snapshot write 10000ms.
    - high-accuracy: poll 1000ms, decode throttle 750ms, snapshot write 3000ms.

- 13:32Z
  - Inspected renderer/main periodic timers for secondary background load.
  - Confirmed telemetry loop is the dominant high-frequency path; other periodic checks are comparatively low-frequency (e.g., prune check every 10 minutes, status heartbeat every 20 seconds).

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `SMOKE-PERF-CONSENSUS-001#1/#2/#3` | Owner: `debugger`
  - Delta: smoke verified and overheating consensus generated from actual runtime intervals/config paths.
  - Evidence pointers:
    - `.visual/report.md`
    - `electron/main.cjs`
    - `src/hooks/useLogMonitor.ts`
    - `src/components/SettingsModal.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve diagnostic-only closure with no code modifications.
- `PM Response` | `APPROVED`
  - Reason: scope held to diagnostics/validation; evidence complete.
- 13:38Z
  - Re-ran `npm run -s snap:views` in this turn to provide fresh smoke evidence.
  - Result remained stable vs prior run (same mismatch percentages across the 5 tracked views).

---

## 2026-02-16 - THERMAL-FIX-001
- Scope: implement targeted runtime thermal/performance fixes requested by user.

## Work Entries
- 13:58Z
  - Updated `src/utils/storage.ts` to use dirty-state version tracking.
  - Added `pendingVersion`/`lastPersistedVersion` guard so periodic failsafe flush only writes when unsaved changes exist.
  - Preserved lifecycle flush hooks (`beforeunload`, `pagehide`, hidden, error/unhandledrejection), but no-op when not dirty.

- 14:00Z
  - Corrected telemetry monitor log source preference in `electron/main.cjs`.
  - `start-log-monitoring` now checks Wildgate log path first, then Nebula fallback, matching intended behavior and comment.

- 14:03Z
  - Optimized `electron/helpers/telemetryArchiveHelpers.cjs` archive churn path:
    - Added per-archive in-memory state cache (events + signature set).
    - Eliminated repeated full-file parse on each telemetry tick for same archive path.
    - Added no-op write skip when no new deduped events were added.
    - Cleared archive cache entries on cleanup and clear operations.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `THERMAL-FIX-001#1/#2/#3/#4/#5` | Owner: `debugger`
  - Delta:
    - dirty-only periodic flush,
    - Wildgate-first telemetry path selection,
    - archive no-op write elimination + cached state for reduced churn.
  - Evidence pointers:
    - `src/utils/storage.ts`
    - `electron/main.cjs`
    - `electron/helpers/telemetryArchiveHelpers.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for thermal-fix patch set.
- `PM Response` | `APPROVED`
  - Reason: scope-targeted runtime optimizations landed with passing targeted validation and no contract/schema changes.

---

## 2026-02-16 - OCR-ALIAS-CLEANUP-001
- Scope: fix bad manual name-adjuster alias hygiene by enabling direct alias removal and adding a low-risk guard for suspicious manual alias links.

## Work Entries
- 21:58Z
  - Claimed active locks for alias cleanup implementation files and required agent artifacts.

- 21:59Z
  - Extended mapping slice (`src/store/slices/createMappingSlice.ts`) with `removeOcrAliasCorrection(ocrText, correctedTo)`:
    - removes the selected alias target from `ocrAliasModel`,
    - synchronizes legacy `ocrCorrections` mirror keys,
    - logs deterministic removal action for traceability.

- 22:00Z
  - Updated Settings alias manager (`src/components/SettingsModal.tsx`):
    - added per-row `Remove` action for learned aliases,
    - added warning-confirm flow for suspicious manual adds (very low similarity pairs require second click),
    - surfaced success/warning toasts for user feedback.

- 22:00Z
  - Added regression coverage in `src/store/slices/__tests__/createMappingSlice.test.ts`:
    - verifies alias removal clears both alias-model row and legacy correction entries.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ALIAS-CLEANUP-001#1/#2/#3/#4` | Owner: `debugger`
  - Delta:
    - direct alias delete path now exists in store + settings UI,
    - suspicious manual mapping requires explicit second confirmation click,
    - targeted regression test added and passing.
  - Evidence pointers:
    - `src/store/slices/createMappingSlice.ts`
    - `src/components/SettingsModal.tsx`
    - `src/store/slices/__tests__/createMappingSlice.test.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for OCR-ALIAS-CLEANUP-001.
- `PM Response` | `APPROVED`
  - Reason: user-facing alias cleanup gap is closed with constrained scope and passing targeted validation.

---

## 2026-02-16 - OCR-CORRECTION-POPUP-CLARITY-001
- Scope: improve clarity of the Smart Captures OCR correction popup so users better understand that name edits improve future OCR.

## Work Entries
- 22:06Z
  - Confirmed popup surface: `src/components/ocr/OCRReviewModal.tsx` opened from Smart Captures review CTAs in `src/components/SmartCapturesPanel.tsx`.

- 22:07Z
  - Updated `src/components/ocr/OCRReviewModal.tsx`:
    - clarified modal title to correction-focused wording,
    - added concise helper copy under header,
    - added info banner explaining correction/training effect and badge meanings (`Roster`, `~ Name`, `+ Roster`),
    - renamed footer actions for clarity (`Quick Apply (High Confidence)`, `Apply and Learn`) with explicit tooltips.

- 22:08Z
  - Updated `src/components/SmartCapturesPanel.tsx` review entry CTA labels:
    - compact button `Finalize` -> `Correct`,
    - primary post-processing CTA `Finalize Entry` -> `Review and Correct Names`,
    - added tooltips clarifying this opens OCR correction popup.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-CORRECTION-POPUP-CLARITY-001#1/#2/#3/#4` | Owner: `ui-designer`
  - Delta:
    - popup now explicitly teaches correction workflow purpose,
    - action labels now communicate effect and intent,
    - Smart Captures entry CTAs now clearly point to name-correction behavior.
  - Evidence pointers:
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/components/SmartCapturesPanel.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for OCR-CORRECTION-POPUP-CLARITY-001.
- `PM Response` | `APPROVED`
  - Reason: request satisfied via focused UI clarity changes without behavior regressions.

---

## 2026-02-16 - OCR-CORRECTION-DELETE-002
- Scope: continue popup clarity hardening and add explicit Smart Captures delete options (single + bulk).

## Work Entries
- 22:11Z
  - Updated `src/components/SmartCapturesPanel.tsx`:
    - added confirm-gated bulk deletion (`Delete` in tools for selected rows),
    - added confirm-gated single-match deletion in detail action bar (`Delete`),
    - centralized selection cleanup + next-match focus behavior after delete.

- 22:12Z
  - Updated `src/components/ocr/OCRReviewModal.tsx`:
    - added first-time micro tutorial card (dismissable, persisted via localStorage),
    - added per-name roster reasoning hints (`Exact roster match`, `Looks like X`, `Not in roster yet`),
    - added "Name changes in this review" list with per-change undo and undo-all.

- 22:13Z
  - Updated `src/components/OcrCorrectionModal.tsx`:
    - clarified correction helper copy and training intent,
    - improved input placeholder text for correction lookup,
    - renamed actions for clarity (`Auto Fill Confident`, `Apply and Learn`, `Close for Now`).

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-CORRECTION-DELETE-002#1/#2/#3/#4` | Owner: `ui-designer`
  - Delta:
    - correction popup now has first-time guidance + clearer reasons + local undo visibility,
    - wizard correction popup copy is clearer,
    - Smart Captures now exposes explicit delete actions with confirmation.
  - Evidence pointers:
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/SmartCapturesPanel.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for OCR-CORRECTION-DELETE-002.
- `PM Response` | `APPROVED`
  - Reason: requested UX/delete scope completed with passing targeted validation and safety confirmations for destructive actions.

---

## 2026-02-16 - IQR-PLAYERNAME-001
- Scope: fix Intelligence Review `player_name` actions so confirm/edit/delete behave as expected for roster + session references.

## Work Entries
- 17:33Z
  - Claimed active locks for:
    - `src/components/ReviewQueueModal.tsx`
    - `src/components/ReviewQueueModal.test.tsx`
  - Added intake + task plan entries for `IQR-PLAYERNAME-001`.
  - Locked requested behavior:
    - `player_name` confirm -> add to roster + clear review item.
    - `player_name` edit-save -> update references + auto-add edited name to roster.

- 17:35Z
  - Updated `src/components/ReviewQueueModal.tsx`:
    - Added centralized name helpers (`normalizeName`, `namesEqual`, `dedupeNames`).
    - Added `removeNameFromSession(...)` helper for clean deletion across `sessionTeams`, `selectedTeammates`, and `selectedOpponents`.
    - `handleConfirm(...)` now handles `player_name` by adding to registry and clearing pending item.
    - `handleSaveEdit(...)` now updates references for `player_name`/`roster_candidate` and adds edited value to roster.
    - `handleDelete(...)` now removes linked references for `player_name`/`roster_candidate` using centralized helper.

- 17:36Z
  - Added `src/components/ReviewQueueModal.test.tsx` with targeted regression coverage:
    - `player_name` confirm adds to roster and removes pending review.
    - `player_name` edit updates session/team selections with dedupe and adds edited name to roster.
    - `player_name` delete removes linked references from session + selected arrays.
    - `roster_candidate` confirm regression remains intact.

- 17:37Z
  - Ran targeted validation:
    - `npx vitest run src/components/ReviewQueueModal.test.tsx`
    - `npx eslint src/components/ReviewQueueModal.tsx src/components/ReviewQueueModal.test.tsx`
    - `npm run -s typecheck`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `IQR-PLAYERNAME-001#1/#2/#3/#4` | Owner: `builder`
  - Delta:
    - fixed Intelligence Review `player_name` confirm/edit/delete behavior for roster/session consistency,
    - added targeted regression tests and validation evidence.
  - Evidence pointers:
    - `src/components/ReviewQueueModal.tsx`
    - `src/components/ReviewQueueModal.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for `IQR-PLAYERNAME-001`.
- `PM Response` | `APPROVED`
  - Reason: scoped behavior fix completed with passing targeted tests/lint/typecheck and no schema/API changes.

---

## 2026-02-16 - POSTMATCH-OCR-GATE-002
- Scope: disable auto OCR on result click and require explicit user confirmation to process queued OCR.

## Work Entries
- 17:39Z
  - Added intake + task plan entries for `POSTMATCH-OCR-GATE-002`.
  - Claimed lock for `src/components/recording/ActionPanel.test.tsx` (runtime `ActionPanel.tsx` lock already owned by builder lane).
  - Confirmed current root cause in `ActionPanel.initiateSubmission(...)`:
    - `processAllStored(...)` auto-runs when queued OCR exists and no pending merged data.

- 17:41Z
  - Updated `src/components/recording/ActionPanel.tsx`:
    - Removed automatic `processAllStored(...)` call from result-submit path.
    - Added blocking OCR decision prompt state (`ocrDecisionPrompt`) and modal UI.
    - Added explicit actions:
      - `Cancel`
      - `Continue Without OCR` -> wizard opens immediately.
      - `Process OCR and Review` -> runs OCR only after click, then opens OCR gate if data exists.
    - Added fallback toast + wizard continuation if processing yields no review data.

- 17:42Z
  - Updated `src/components/recording/ActionPanel.test.tsx`:
    - Added `getPendingData` in smart-capture mock.
    - Added regression tests for:
      - blocking prompt appears instead of auto-processing,
      - continue-without-OCR path opens wizard,
      - explicit process path runs OCR and dispatches `submission:ocr-gate`.

- 17:43Z
  - Ran targeted validation:
    - `npx vitest run src/components/recording/ActionPanel.test.tsx`
    - `npx eslint src/components/recording/ActionPanel.tsx src/components/recording/ActionPanel.test.tsx`
    - `npm run -s typecheck`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `POSTMATCH-OCR-GATE-002#1/#2/#3/#4` | Owner: `builder`
  - Delta:
    - result buttons no longer auto-trigger OCR processing,
    - explicit blocking OCR decision prompt added with process/continue paths,
    - targeted regression tests added and passing.
  - Evidence pointers:
    - `src/components/recording/ActionPanel.tsx`
    - `src/components/recording/ActionPanel.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure for `POSTMATCH-OCR-GATE-002`.
- `PM Response` | `APPROVED`
  - Reason: requested runtime flow change delivered with narrow scope and clean validation.

---

## 2026-02-16 - POSTMATCH-TELEMETRY-PROMPT-003
- Scope: align telemetry post-match prompt result flow with explicit OCR gating behavior from Recording submission path.

## Work Entries
- 17:48Z
  - Added intake/plan entries for `POSTMATCH-TELEMETRY-PROMPT-003`.
  - Claimed temporary lock for `src/App.tsx`.
  - Confirmed root inconsistency:
    - telemetry prompt result handling in `App.tsx` dispatched `submission:open-result` only when already on Recording view.
    - non-recording views used direct `setShowWizard(result)`, bypassing the explicit OCR decision gate in `ActionPanel`.

- 17:49Z
  - Updated `src/App.tsx` telemetry result flow:
    - added `telemetryDraftPendingResult` handoff state.
    - when telemetry result is chosen from non-recording views, app now:
      - stores pending result,
      - switches to `recording`,
      - dispatches `submission:open-result` after Recording becomes active.
    - when already on Recording, result still dispatches directly to `submission:open-result`.

- 17:50Z
  - Updated telemetry post-match prompt copy and toast messaging to explicitly state OCR is manual and requires explicit process action in Recording.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `POSTMATCH-TELEMETRY-PROMPT-003#1/#2/#3/#4` | Owner: `builder`
  - Delta:
    - telemetry prompt result actions now always route through Recording event flow,
    - non-recording path now performs view-switch handoff before dispatch,
    - copy now explicitly clarifies OCR is manual (no auto-start).
  - Evidence pointers:
    - `src/App.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve this scoped routing/copy fix as the next one-at-a-time OCR-flow item.
- `PM Response` | `APPROVED`
  - Reason: keeps scope narrow while eliminating the bypass path and preserving existing Recording OCR gate logic.

---

## 2026-02-16 - OCR-TEAM-CAP-GUARD-004
- Scope: prevent OCR/session teammate over-registration by enforcing central cap + dedupe guard in form slice setter path.

## Work Entries
- 17:53Z
  - Added intake/plan entries for `OCR-TEAM-CAP-GUARD-004`.
  - Claimed locks for:
    - `src/store/slices/createFormSlice.ts`
    - `src/store/slices/__tests__/createFormSlice.test.ts`
  - Confirmed root gap:
    - `setSelectedTeammates` previously accepted unbounded arrays from OCR/session updaters.
    - capacity guard existed in `toggleTeammate` only, allowing OCR-style bulk updates to exceed limits.

- 17:54Z
  - Updated `src/store/slices/createFormSlice.ts`:
    - added `sanitizeTeammates(...)` helper (trim, case-insensitive dedupe, ship-capacity cap).
    - wired `setSelectedTeammates` through sanitizer so all callers are normalized.
    - updated `toggleTeammate` to use case-insensitive duplicate detection and sanitizer path.
    - updated `setActiveShip` teammate trimming to use the same sanitizer for consistency.

- 17:55Z
  - Updated `src/store/slices/__tests__/createFormSlice.test.ts`:
    - added regression test for case-insensitive dedupe + cap via `setSelectedTeammates`.
    - added regression test proving updater-style OCR append cannot overflow teammate cap.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-TEAM-CAP-GUARD-004#1/#2/#3/#4` | Owner: `builder`
  - Delta:
    - centralized teammate normalization now guards all setter paths against OCR over-registration,
    - added regression coverage for dedupe/cap behavior in direct and updater setter calls.
  - Evidence pointers:
    - `src/store/slices/createFormSlice.ts`
    - `src/store/slices/__tests__/createFormSlice.test.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve this scoped guardrail fix for the "13 teammates from OCR" issue.
- `PM Response` | `APPROVED`
  - Reason: centralized guard reduces regression risk across all OCR/session teammate entry points with passing focused validation.

---

## 2026-02-16 - REMAINING-UX-TELEMETRY-005
- Scope: close remaining user-reported issues around wizard loadout entry, telemetry loadout auto-selection visibility, and OCR opponent color/team dedupe behavior.

## Work Entries
- 18:01Z
  - Added intake/plan entries for `REMAINING-UX-TELEMETRY-005`.
  - Claimed locks for:
    - `src/hooks/useLogMonitor.ts`
    - `src/components/Wizard.tsx`
    - `src/App.tsx`
    - `src/components/recording/ActionPanel.test.tsx`
  - Confirmed remaining gap clusters:
    - wizard had no manual weapon/equipment loadout inputs,
    - telemetry loadout auto-apply populated weapons only and lacked explicit auto-selection labels for loadout slots,
    - OCR opponent team colors could collapse into shared/unknown buckets with duplicate player fanout.

- 18:03Z
  - Updated central form guardrails in `src/store/slices/createFormSlice.ts`:
    - added opponent dedupe normalization in `setSelectedOpponents` (case-insensitive).
    - updated `toggleOpponent` to case-insensitive remove/add behavior with sanitize path.
  - Added regression test in `src/store/slices/__tests__/createFormSlice.test.ts` for case-insensitive opponent dedupe.

- 18:04Z
  - Updated telemetry loadout path in `src/hooks/useLogMonitor.ts`:
    - auto-selection now applies to both `weapons` and `equipment` loadout slots.
    - previous telemetry loadout slots are cleaned safely when replaced.
    - existing non-loadout counters remain preserved when possible.

- 18:04Z
  - Updated telemetry indicator copy in `src/components/recording/ActionPanel.tsx`:
    - added explicit `(auto)` labels for telemetry-detected `Weapons` and `Equipment`.
  - Added regression assertion in `src/components/recording/ActionPanel.test.tsx` for auto-selection labels.

- 18:05Z
  - Updated wizard in `src/components/Wizard.tsx`:
    - added manual `Ship Loadout` inputs (`Weapon 1/2`, `Equipment 1/2`).
    - inputs persist into `pendingMatchData.loadout` and flow into final submission.

- 18:06Z
  - Updated OCR apply mapping in `src/App.tsx`:
    - added team-color normalization with fallback assignment to avoid unknown-color collapsing.
    - deduped resolved opponent players and suppressed duplicate fanout across structured opponent teams.
    - updated session-team merge to case-insensitive duplicate protection.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `REMAINING-UX-TELEMETRY-005#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - wizard now supports manual loadout slot entry,
    - telemetry now auto-applies both weapons and equipment and labels them as auto-selected in recording panel,
    - OCR opponent-team apply now normalizes team colors and suppresses obvious duplicate player fanout.
  - Evidence pointers:
    - `src/hooks/useLogMonitor.ts`
    - `src/components/recording/ActionPanel.tsx`
    - `src/components/recording/ActionPanel.test.tsx`
    - `src/components/Wizard.tsx`
    - `src/App.tsx`
    - `src/store/slices/createFormSlice.ts`
    - `src/store/slices/__tests__/createFormSlice.test.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of the remaining open issues for this pass.
- `PM Response` | `APPROVED`
  - Reason: targeted runtime/UI updates address remaining reported gaps with passing focused tests/lint/typecheck.

---

## 2026-02-17 - AUDIT-REMEDIATION-001
- Scope: implement audited hardening plan for storage/IPC type safety, dashboard layout typing, telemetry archive normalization, and release gate evidence.

## Work Entries
- 18:20Z
  - Resumed from partial implementation state and ran `npm run -s typecheck` to identify remaining compile blockers.
  - Confirmed active failures in:
    - `src/components/DashboardLayout.tsx`
    - `src/components/SimulatorPanel.tsx`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/hooks/useSmartCapture.ts`
    - `src/utils/storage.ts`

- 18:23Z
  - Updated `src/utils/artifactService.ts`:
    - introduced typed `RerunOcrResult` return contract for `rerunOCROnArtifact(...)`,
    - normalized structured/legacy OCR IPC payloads into consistent `success/data/error` shape,
    - retained canonical telemetry archive collection output shape (`TelemetryArchiveEvent[][]`).

- 18:24Z
  - Updated `src/components/DashboardLayout.tsx`:
    - migrated drag/resize props to `react-grid-layout` v2 API (`dragConfig`, `resizeConfig`),
    - removed stale typing assumptions that required `isDraggable`/`isResizable`,
    - fixed width-provider typing so outer component no longer requires a `width` prop.

- 18:25Z
  - Updated `src/components/SimulatorPanel.tsx`:
    - switched simulation timestamp arithmetic to normalized numeric timestamps via `getTelemetryEventTimestamp(...)`,
    - removed unsafe arithmetic on optional union timestamp fields.

- 18:27Z
  - Updated `src/components/SmartCapturesPanel.tsx`:
    - added typed rerun result envelope (`RerunResultWithMeta`),
    - narrowed successful OCR rerun results via type guard before merge path access,
    - normalized telemetry timestamp rendering guard for `Date(...)` conversion safety.

- 18:28Z
  - Updated `src/utils/storage.ts`:
    - resolved strict cast blockers with explicit unknown-to-target boundary casts,
    - tightened `applyUidSeed(...)` merged data typing so `uidMappings/uidSeedState/storageMeta` are guaranteed in local migration flow,
    - corrected interval handle typing mismatch in renderer environment.

- 18:31Z
  - Updated `src/utils/__tests__/artifactService.test.ts`:
    - aligned telemetry assertion to canonical nested telemetry archive shape (`TelemetryArchiveEvent[][]`).

- 18:32Z
  - Ran release gates and confirmed clean outcomes:
    - `npm run -s test`
    - `npm run -s typecheck`
    - `npm run -s build`
    - `npx eslint src/components/DashboardLayout.tsx src/components/SimulatorPanel.tsx src/components/SmartCapturesPanel.tsx src/utils/artifactService.ts src/utils/storage.ts src/utils/__tests__/artifactService.test.ts`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `AUDIT-REMEDIATION-001#2/#3/#4/#5/#6` | Owner: `builder`
  - Delta:
    - storage/IPC boundaries hardened and compile-safe,
    - dashboard layout typing aligned to current `react-grid-layout` API (no suppressions),
    - telemetry archive consumption unified to canonical shape with typed guards,
    - release gate commands executed and passing.
  - Evidence pointers:
    - `src/utils/artifactService.ts`
    - `src/utils/storage.ts`
    - `src/components/DashboardLayout.tsx`
    - `src/components/SimulatorPanel.tsx`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/utils/__tests__/artifactService.test.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of audited remediation plan `AUDIT-REMEDIATION-001`.
- `PM Response` | `APPROVED`
  - Reason: remediation scope delivered with green test/typecheck/build gates and canonical telemetry/storage boundary hardening in place.

---

## 2026-02-17 - AUDIT-REMEDIATION-002
- Scope: second type-safety pass focused on runtime OCR/session/review flow `any` reduction without behavior changes.

## Work Entries
- 19:05Z
  - Added intake/plan lock entries for `AUDIT-REMEDIATION-002`.
  - Scoped work to runtime OCR/session files only:
    - `src/hooks/useSmartCapture.ts`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/components/recording/ActionPanel.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `src/providers/GameDataProvider.tsx`
    - `src/store/slices/createFormSlice.ts`

- 19:10Z
  - Updated `src/hooks/useSmartCapture.ts`:
    - replaced smart-scan/result-path `any` with `SmartScanResult`, `LobbyScanResult`, and typed OCR rerun result envelopes,
    - removed unsafe casts in teammate/opponent inference and history reconciliation,
    - tightened batch OCR result merge path with explicit data narrowing.

- 19:13Z
  - Updated `src/components/SmartCapturesPanel.tsx`:
    - removed explicit `any` from bulk and per-match OCR rerun merges,
    - added typed modifier normalization helper and safer mergeStats shaping,
    - replaced raw mode casts with typed `CaptureMode`/`OcrMode` guards,
    - replaced `jsonExport.payload: any` with `unknown`,
    - removed typed `any` annotations in telemetry/timeline/review rendering paths.

- 19:15Z
  - Updated `src/components/recording/ActionPanel.tsx`:
    - replaced `onSmartCaptureData` callback payload `any` with `OCRExtractedData`,
    - removed `any`-based submission state access/casts and introduced typed snapshot fallback logic.

- 19:18Z
  - Updated `src/components/ReviewQueueModal.tsx`:
    - introduced typed `ReviewItem` union (`PendingReview` + unknown-id + learning-review entries),
    - replaced `review: any` handlers and suggestion map typing with explicit union guards.

- 19:20Z
  - Updated shared interfaces:
    - `src/providers/GameDataProvider.tsx`: replaced `timelineEvents`/`pendingReviews` `any` types with `TimelineEvent[]` and `PendingReview[]`.
    - `src/store/slices/createFormSlice.ts`: replaced `pendingMatchData: any` with `Partial<Match> | null`.

- 19:23Z
  - Validation iteration:
    - `typecheck` initially failed once on narrowed optional OCR data access in `useSmartCapture`; patched with explicit local narrowing.
    - full `test` initially failed for `ActionPanel` test mocks due direct `useAppStore.getState()` assumption; patched with typed optional `getState` fallback (no behavior/runtime regression).
    - reran focused + full gates to green.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `AUDIT-REMEDIATION-002#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - removed explicit `any` usage from targeted runtime OCR/session files,
    - replaced key handler/callback/store-access paths with explicit narrow types and guards,
    - preserved behavior and restored all tests after mock-compat fallback adjustment.
  - Evidence pointers:
    - `src/hooks/useSmartCapture.ts`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/components/recording/ActionPanel.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `src/providers/GameDataProvider.tsx`
    - `src/store/slices/createFormSlice.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of second-pass runtime typing cleanup `AUDIT-REMEDIATION-002`.
- `PM Response` | `APPROVED`
  - Reason: focused runtime typing cleanup completed with all validation gates passing and no scope drift into analytics/dev-only modules.

---

## 2026-02-17 - AUDIT-REMEDIATION-003
- Scope: follow-up telemetry runtime typing hardening in `App`, `useLogMonitor`, and UI telemetry status contracts.

## Work Entries
- 18:57Z
  - Added intake/plan records and claimed locks for:
    - `src/hooks/useLogMonitor.ts`
    - `src/App.tsx`
    - `src/store/slices/createUISlice.ts`
    - `src/providers/UIStateProvider.tsx`
  - Confirmed narrow scope: remove high-risk explicit `any` from telemetry runtime status/event paths only.

- 19:00Z
  - Updated `src/hooks/useLogMonitor.ts`:
    - added typed telemetry event/status helpers (`TelemetryEventEnvelope`, payload extraction, record guards),
    - replaced explicit `any` status/event/loadout variables with `unknown` + narrowing,
    - preserved existing loadout resolution behavior while hardening nested payload/context reads.

- 19:02Z
  - Updated `src/App.tsx`:
    - removed explicit `any` in lazy module typing, idle-callback access, telemetry retention normalization, and prune error handling,
    - introduced typed record/numeric coercion helpers for telemetry prune status/result parsing.

- 19:02Z
  - Updated telemetry status contracts:
    - `src/store/slices/createUISlice.ts`: exported `TelemetryStatusState`, changed `setTelemetryStatus` payload to `Partial<TelemetryStatusState>`.
    - `src/providers/UIStateProvider.tsx`: aligned context telemetry status and setter signatures with `TelemetryStatusState`.

- 19:03Z
  - Validation pass:
    - initial `typecheck` failed once on `WindowWithIdleCallbacks` extending `Window` with optional `cancelIdleCallback`; fixed by using standalone optional callback interface.
    - reran focused and full validation gates to green.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `AUDIT-REMEDIATION-003#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - removed explicit runtime `any` in telemetry event/status handling for `useLogMonitor` and `App`,
    - introduced typed telemetry status state contract across UI slice/provider,
    - kept scope constrained to telemetry runtime typing hardening only.
  - Evidence pointers:
    - `src/hooks/useLogMonitor.ts`
    - `src/App.tsx`
    - `src/store/slices/createUISlice.ts`
    - `src/providers/UIStateProvider.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of telemetry runtime hardening pass `AUDIT-REMEDIATION-003`.
- `PM Response` | `APPROVED`
  - Reason: targeted telemetry runtime typing cleanup delivered with focused and full validation gates passing.

---

## 2026-02-17 - AUDIT-REMEDIATION-004
- Scope: close remaining partials from audit matrix (deterministic opponent team colors and optional background OCR-after-result mode).

## Work Entries
- 19:08Z
  - Added intake, plan, and locks for AUDIT-REMEDIATION-004.
  - Confirmed implementation targets:
    - deterministic opponent color assignment in OCR apply paths,
    - optional background OCR processing after result click.

- 19:15Z
  - Added shared deterministic color helper and tests:
    - src/utils/ocr/teamColorAssignment.ts
    - src/utils/ocr/__tests__/teamColorAssignment.test.ts
  - Helper behavior includes:
    - color normalization,
    - deterministic fallback assignment,
    - player-based color hint anchoring.

- 19:21Z
  - Integrated deterministic assignment into OCR apply surfaces:
    - src/App.tsx now uses shared helper with sessionTeams player color hints.
    - src/components/SmartCapturesPanel.tsx apply and reprocess paths now assign deterministic colors and dedupe players before writing opponentTeams.

- 19:24Z
  - Added persisted result-flow setting and UI wiring:
    - src/store/slices/createSettingsSlice.ts added resultOcrFlowMode (prompt | background).
    - src/store/useAppStore.ts hydration and persistence mapping updated.
    - src/components/SettingsModal.tsx added Result Button OCR Flow control.

- 19:25Z
  - Updated result-submit behavior in src/components/recording/ActionPanel.tsx:
    - prompt mode keeps existing blocking OCR decision dialog.
    - background mode opens wizard immediately, runs queued OCR in background, and surfaces review data when ready.
  - Added regression test in src/components/recording/ActionPanel.test.tsx for background mode.

- 19:26Z
  - Validation completed:
    - focused tests, lint, and typecheck,
    - full test and full build.

## PM Feedback Cycle
- PM-FEEDBACK-REQ | Step: AUDIT-REMEDIATION-004#1/#2/#3/#4/#5 | Owner: builder
  - Delta:
    - deterministic team-color assignment moved to shared helper and integrated in App and Smart Captures apply flows,
    - optional background OCR-after-result mode added as persisted setting and ActionPanel runtime branch,
    - targeted regression coverage added for helper and background result flow,
    - focused and full validation gates are green.
  - Evidence pointers:
    - src/utils/ocr/teamColorAssignment.ts
    - src/utils/ocr/__tests__/teamColorAssignment.test.ts
    - src/App.tsx
    - src/components/SmartCapturesPanel.tsx
    - src/store/slices/createSettingsSlice.ts
    - src/store/useAppStore.ts
    - src/components/SettingsModal.tsx
    - src/components/recording/ActionPanel.tsx
    - src/components/recording/ActionPanel.test.tsx
    - docs/agents/03_VALIDATION.md
  - Review ask: approve closure of AUDIT-REMEDIATION-004.
- PM Response | APPROVED
  - Reason: remaining partials are implemented with deterministic behavior and full validation evidence.

---

## 2026-02-17 - IQR-NAME-SOURCE-001
- Scope: add source provenance for `Intelligence Review Required` player-name queue entries and expose source screenshot preview in the review modal.

## Work Entries
- 19:45Z
  - Added intake/plan/lock records for `IQR-NAME-SOURCE-001`.
  - Confirmed narrow scope: only pending-review provenance metadata + `ReviewQueueModal` display/actions.

- 19:46Z
  - Updated `src/store/slices/createDataSlice.ts`:
    - added `PendingReviewSource` type and optional `sourceCapture` field on `PendingReview`.

- 19:47Z
  - Updated `src/utils/scan/imageUtils.ts`:
    - `captureScreen()` now awaits `save-ocr-debug` and returns optional `debugPath` alongside `dataUrl` + filename.

- 19:47Z
  - Updated `src/hooks/useSmartScan.ts`:
    - attached `sourceCapture` (`screenshotPath`, `screenshotLabel`, `capturedAt`) and `source: 'ocr'` when queueing low-confidence `player_name` entries.

- 19:48Z
  - Updated `src/components/ReviewQueueModal.tsx`:
    - added per-item source context rendering when `sourceCapture` is present,
    - added `View Source` action to open screenshot preview overlay using `LocalImage`.

- 19:48Z
  - Updated `src/components/ReviewQueueModal.test.tsx`:
    - added regression test confirming source context visibility and source preview action for `player_name` items.

## PM Feedback Cycle
- PM-FEEDBACK-REQ | Step: `IQR-NAME-SOURCE-001#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - pending-review type now carries optional source capture metadata,
    - Smart Scan now links low-confidence player-name review entries to the saved capture artifact,
    - review queue now surfaces per-entry source context and screenshot preview action,
    - focused regression + lint + typecheck validation completed.
  - Evidence pointers:
    - `src/store/slices/createDataSlice.ts`
    - `src/utils/scan/imageUtils.ts`
    - `src/hooks/useSmartScan.ts`
    - `src/components/ReviewQueueModal.tsx`
    - `src/components/ReviewQueueModal.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `IQR-NAME-SOURCE-001`.
- PM Response | `APPROVED`
  - Reason: requested provenance visibility for review queue player-name entries delivered with focused validation evidence and no scope drift.

---

## 2026-02-17 - RESULT-HOOK-CRASH-310-001
- Scope: fix React `#310` crash triggered by result button (`Win`/`Loss`/`Draw`) clicks by stabilizing hook order in the wizard render path.

## Work Entries
- 05:14Z
  - Added intake, plan, and lock records for `RESULT-HOOK-CRASH-310-001`.
  - Confirmed narrow scope: runtime crash fix + focused regression coverage only.

- 05:17Z
  - Root-cause confirmation:
    - `src/components/Wizard.tsx` called `React.useMemo` (`loadoutDraft`) only after `if (!showWizard || !pendingMatchData) return null;`.
    - When result buttons open the wizard, render transitioned from fewer hooks to more hooks, causing React `#310`.

- 05:19Z
  - Patched `src/components/Wizard.tsx`:
    - moved `loadoutDraft` `useMemo` above the early return,
    - made `pendingMatchData` access null-safe (`pendingMatchData?.loadout`) for closed-state renders,
    - preserved existing wizard/result/OCR behavior.

- 05:21Z
  - Added `src/components/Wizard.test.tsx`:
    - regression test verifies closed -> open wizard transition does not throw,
    - test renders `Wizard` with `showWizard=null`, then rerenders with `showWizard='Win'` and pending data.

- 05:25Z
  - Validation completed:
    - focused vitest suite,
    - touched-file eslint,
    - typecheck.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `RESULT-HOOK-CRASH-310-001#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - fixed hook-order bug in wizard activation path by making all hooks unconditional,
    - added focused regression test for result-triggered wizard open transition,
    - validated with targeted tests + lint + typecheck.
  - Evidence pointers:
    - `src/components/Wizard.tsx`
    - `src/components/Wizard.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `RESULT-HOOK-CRASH-310-001`.
- `PM Response` | `APPROVED`
  - Reason: crash repro path is addressed with direct hook-order correction and focused validation evidence.

---

## 2026-02-17 - WIZARD-HOOK-AUDIT-002
- Scope: audit and harden remaining wizard/modal flows against hook-order regressions after RESULT-HOOK-CRASH-310-001.

## Work Entries
- 06:05Z
  - Added intake/plan/lock records for `WIZARD-HOOK-AUDIT-002`.
  - Confirmed narrow scope: wizard/modal render-safety audit + focused regression coverage.

- 06:07Z
  - Performed AST-level audit of `src/components/**/*.tsx` for top-level hook calls after return guards.
  - Result: no additional hook-after-guard violations found in wizard/modal components.

- 06:10Z
  - Added `src/components/OcrCorrectionModal.test.tsx` with focused regression coverage:
    - closed -> open transition does not throw,
    - ignore -> undo-ignore action flow remains functional.

- 06:13Z
  - Fixed new test mock compatibility:
    - updated `useAppStore` mock to support both selector and non-selector invocation forms used by `OcrCorrectionModal`.

- 06:16Z
  - Validation completed:
    - focused wizard/modal vitest suite,
    - touched-file eslint,
    - typecheck.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `WIZARD-HOOK-AUDIT-002#2/#3/#4` | Owner: `builder`
  - Delta:
    - audited remaining wizard/modal component hook ordering and found no additional violations,
    - added focused regression tests for `OcrCorrectionModal` open transition and action safety,
    - revalidated existing `Wizard` + result-flow tests in the same run.
  - Evidence pointers:
    - `src/components/OcrCorrectionModal.test.tsx`
    - `src/components/Wizard.tsx`
    - `src/components/Wizard.test.tsx`
    - `src/components/recording/ActionPanel.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `WIZARD-HOOK-AUDIT-002`.
- `PM Response` | `APPROVED`
  - Reason: wizard/modal hardening complete with no additional hook-order defects found and focused regression coverage added.

---

## 2026-02-17 - OCR-TEAM-CAP-HARDEN-006
- Scope: enforce ship-capacity teammate caps across OCR review/apply/session/submission paths that could still store uncapped teammate lists.

## Work Entries
- 08:21Z
  - Added intake/plan entries and lock claims for `OCR-TEAM-CAP-HARDEN-006`.
  - Confirmed narrow scope: teammate-cap hardening only (no OCR model tuning).

- 08:24Z
  - Added `src/utils/teamLimits.ts` shared utility:
    - `getMaxTeammatesForShip`
    - `capTeammateNames`
    - `capTeammatePlayers`
  - Standardized fallback behavior to 4-player default (`max teammates = 3`) when ship capacity is unknown.

- 08:25Z
  - Updated `src/store/slices/createFormSlice.ts` to use shared cap utility in central teammate sanitizer.

- 08:27Z
  - Updated `src/hooks/useSmartCapture.ts`:
    - capped teammate lists during OCR canonicalization,
    - capped teammate lists when merging capture batches into pending OCR data,
    - capped teammate lists in merged OCR summary output.
  - Goal: prevent oversized teammate arrays from accumulating before review/apply.

- 08:29Z
  - Updated `src/App.tsx` OCR apply flow:
    - capped OCR teammates before applying to session state,
    - merged teammates in one capped pass,
    - updated toast count to show capped/applied teammate count.

- 08:31Z
  - Updated `src/components/SmartCapturesPanel.tsx`:
    - capped rerun-derived `match.teammates` writes,
    - replaced ad-hoc teammate slicing with shared cap utility in review/apply updates,
    - unified capacity helper usage to shared utility.

- 08:33Z
  - Updated `src/hooks/useMatchSubmission.ts`:
    - capped teammate lists when creating pending match data from telemetry/session context,
    - capped teammate lists again at final submission boundary for safety.

- 08:34Z
  - Added focused regression tests: `src/utils/__tests__/teamLimits.test.ts`.

## Inter-Agent Request Lifecycle
- Request ID: `OCR-TEAM-CAP-HARDEN-006-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `OPEN`: Implement shared teammate-cap utility and wire into OCR apply/review/submission paths.
  - `ACK`: Builder accepted scope and began utility-first implementation.
  - `IN_PROGRESS`: Utility + path integrations applied across App/SmartCapture/SmartCapturesPanel/useMatchSubmission/createFormSlice.
  - `READY_FOR_REVIEW`: Focused tests + lint + typecheck completed; evidence recorded in `docs/agents/03_VALIDATION.md`.
  - `CLOSED`: PM response approved with evidence pointers below.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-TEAM-CAP-HARDEN-006#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - introduced shared teammate-cap utility and removed duplicated cap logic across key OCR/wizard paths,
    - hardened pending OCR merge, Smart Captures rerun/apply, App OCR apply, and submission boundaries,
    - added focused regression tests for teammate cap behavior.
  - Evidence pointers:
    - `src/utils/teamLimits.ts`
    - `src/utils/__tests__/teamLimits.test.ts`
    - `src/hooks/useSmartCapture.ts`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/App.tsx`
    - `src/hooks/useMatchSubmission.ts`
    - `src/store/slices/createFormSlice.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-TEAM-CAP-HARDEN-006`.
- `PM Response` | `APPROVED`
  - Reason: teammate cap is now enforced at all affected OCR/session boundaries with focused passing validation evidence.

---

## 2026-02-17 - REFACTOR-CLOSEOUT-007
- Scope: finalize the unfinished giant refactor by validating the combined working tree end-to-end and completing formal closeout records.

## Work Entries
- 15:02Z
  - Accepted "full close" request and constrained scope to refactor closeout only.
  - Started repo-wide state audit to identify unresolved/incomplete lanes and dirty-file footprint.

- 15:04Z
  - Audited current state:
    - confirmed multi-lane refactor modifications present across OCR/wizard/review/data/docs paths,
    - confirmed existing lane docs were marked complete but lacked one final integrated closeout pass over the combined state.

- 15:06Z
  - Executed full integrated quality gates:
    - `npm run -s ci:quality` (lint + test + typecheck + build).
  - Result: PASS; no additional code fixes required for closeout.

- 15:07Z
  - Opened dedicated closeout intake/plan records and lock claims.
  - Began closeout documentation updates (`03_VALIDATION`, `04_HANDOFF`, decisions, plan status).

## Inter-Agent Request Lifecycle
- Request ID: `REFACTOR-CLOSEOUT-007-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `OPEN`: perform final integrated closeout of unfinished giant refactor.
  - `ACK`: builder accepted no-question full-close instruction and initiated repo-wide audit.
  - `IN_PROGRESS`: full quality gate execution and closeout artifact updates.
  - `READY_FOR_REVIEW`: all gates green and closeout docs prepared with evidence pointers.
  - `CLOSED`: PM response approved based on integrated gate evidence.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `REFACTOR-CLOSEOUT-007#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - completed integrated refactor state audit and confirmed closure scope,
    - ran full `ci:quality` release gates on combined working tree,
    - finalized closeout intake/plan/validation/handoff artifacts and lock maintenance.
  - Evidence pointers:
    - `docs/agents/00_INTAKE.md`
    - `docs/agents/01_PLAN.md`
    - `docs/agents/03_VALIDATION.md`
    - `docs/agents/04_HANDOFF.md`
    - `docs/WORKLOCKS.md`
  - Review ask: approve final closure of unfinished giant refactor lane.
- `PM Response` | `APPROVED`
  - Reason: integrated quality gates passed and closure artifacts satisfy workflow evidence requirements.

---

## 2026-02-17 - AUDIT-REMEDIATION-005
- Scope: resolve remaining audit findings in runtime typing, production logging behavior, telemetry archive normalization, and legacy startup debt in targeted files only.

## Work Entries
- 15:33Z
  - Added intake + plan entry for `AUDIT-REMEDIATION-005`.
  - Claimed temporary locks for touched runtime files and telemetry docs/helper files.

- 15:34Z
  - Patched `src/utils/logger.ts`:
    - replaced `any` payload/error types with `unknown`,
    - gated console emission behind production-aware check,
    - removed `window as any` usage for app version lookup.

- 15:35Z
  - Patched `src/utils/electronBridge.ts`:
    - removed runtime `any` from catches and payload typing,
    - typed `existingData` as `OCRExtractedData | null`,
    - added shape validation for `gcloudOcrScan`,
    - routed error reporting through `Logger` instead of direct `console.error`.

- 15:36Z
  - Patched `src/utils/storage.ts`:
    - replaced direct `console.*` with `Logger`,
    - added one-time legacy migration check marker (`wg_v13_migration_checked_v1`),
    - preserved existing migration behavior while reducing repeated startup legacy checks.

- 15:37Z
  - Patched `src/App.tsx` to replace direct OCR resolution `console.log` statements with `Logger.debug`.

- 15:38Z
  - Patched `src/components/DevOCRPanel.tsx`:
    - removed `any` from state/catches/parsing paths,
    - added safe error-message normalization helper,
    - replaced direct `console.*` with structured `Logger` usage.

- 15:39Z
  - Patched telemetry archive normalization:
    - `electron/helpers/artifactHelpers.cjs` now uses shared `normalizeEvents()` helper,
    - `electron/helpers/telemetryArchiveHelpers.cjs` exports `normalizeEvents` and gates info logs in production,
    - `docs/TELEMETRY_PIPELINE.md` updated to document canonical normalizers and remove ad-hoc-shape guidance.
  - Updated `TODO.md` maintenance line to remove deferred legacy wording for `ocr-debug/` and mark it as an intentional compatibility path.

- 15:40Z
  - Validation completed:
    - touched-file eslint PASS,
    - `npm run -s typecheck` PASS,
    - `npm run -s ci:quality` PASS (tests/typecheck/build/lint).

## Inter-Agent Request Lifecycle
- Request ID: `AUDIT-REMEDIATION-005-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `OPEN`: close remaining audit findings in scoped runtime files.
  - `ACK`: builder accepted narrow remediation scope and began patches.
  - `IN_PROGRESS`: typing/logging/telemetry/legacy-marker patches applied.
  - `READY_FOR_REVIEW`: lint/typecheck/full gates passed with evidence captured.
  - `CLOSED`: PM response approved with evidence pointers.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `AUDIT-REMEDIATION-005#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - removed remaining runtime `any` usage in targeted bridge/dev panel/logger paths,
    - eliminated direct console usage in flagged runtime files and centralized log gating,
    - replaced ad-hoc telemetry archive shape check in artifact helper with shared normalizer,
    - added one-time legacy migration check marker in storage startup path.
  - Evidence pointers:
    - `src/utils/electronBridge.ts`
    - `src/utils/logger.ts`
    - `src/utils/storage.ts`
    - `src/App.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `electron/helpers/artifactHelpers.cjs`
    - `electron/helpers/telemetryArchiveHelpers.cjs`
    - `docs/TELEMETRY_PIPELINE.md`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `AUDIT-REMEDIATION-005`.
- `PM Response` | `APPROVED`
  - Reason: targeted audit findings were remediated without scope drift and full quality gates passed.

---

## 2026-02-17 - MODERATE-REMEDIATION-006
- Scope: address reported moderate issues in testing coverage, silent error handling, toast accessibility, and env-backed frontend runtime configuration.

## Work Entries
- 16:20Z
  - Added intake + plan entries for `MODERATE-REMEDIATION-006`.
  - Claimed temporary locks for touched runtime/test/config files.
  - Started runtime patching pass focused on silent catches, logger persistence handling, and toast accessibility semantics.
- 16:27Z
  - Patched runtime behavior and configuration paths:
    - `src/App.tsx`: replaced silent preload + telemetry retention catches with structured `Logger.warn` calls; moved preload timing constants to env-backed runtime config.
    - `src/components/MatchRecordingPage.tsx` and `src/components/SmartCapturesPanel.tsx`: replaced silent artifact-load catches with warning logs.
    - `src/components/Toast.tsx`: added `aria-live`/role semantics and dismiss-button label; switched default timeout to runtime config.
    - `src/utils/logger.ts`: removed silent persistence-failure swallow path; added non-fatal warning capture.
    - `src/utils/storage.ts` and `src/hooks/useSmartCapture.ts`: replaced hardcoded timing constants with env-backed config values.
    - `src/components/ocr/OCRReviewModal.tsx`: removed silent corpus-sync failure catch and logged non-blocking warning.

- 16:35Z
  - Added and expanded tests:
    - `src/utils/__tests__/storage.test.ts` (persist/flush/debounce behavior)
    - `src/hooks/__tests__/useLogMonitor.test.ts` (monitor startup, status/feed updates, telemetry draft trigger)
    - `src/hooks/__tests__/useSmartCapture.test.ts` (web-mode error path + stored-image processing state)
    - `src/App.test.tsx` (app smoke render + telemetry retention invoke failure handling)

- 16:52Z
  - Validation completed and green:
    - focused vitest targets PASS,
    - touched-file eslint PASS,
    - full `lint`, `typecheck`, `test`, and `build` PASS.

## Inter-Agent Request Lifecycle
- Request ID: `MODERATE-REMEDIATION-006-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `OPEN`: remediate reported moderate issues (tests, silent failures, accessibility, configuration).
  - `ACK`: builder accepted scope and started targeted runtime + test patching.
  - `IN_PROGRESS`: runtime hardening, env config extraction, and test additions.
  - `READY_FOR_REVIEW`: validation gates passed with evidence pointers recorded.
  - `CLOSED`: PM response approved for closure.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `MODERATE-REMEDIATION-006#1/#2/#3/#4` | Owner: `builder`
  - Delta:
    - replaced silent runtime catches with structured warnings in App/artifact-load/OCR corpus-sync paths,
    - added env-backed frontend runtime timing configuration and wired it into App/storage/smart-capture/toast,
    - added missing tests for `StorageService`, `useLogMonitor`, expanded `useSmartCapture`, and added `App` coverage,
    - validated with full lint/typecheck/test/build gates.
  - Evidence pointers:
    - `src/App.tsx`
    - `src/components/Toast.tsx`
    - `src/components/MatchRecordingPage.tsx`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/utils/logger.ts`
    - `src/utils/storage.ts`
    - `src/hooks/useSmartCapture.ts`
    - `src/config/runtimeConfig.ts`
    - `src/App.test.tsx`
    - `src/hooks/__tests__/useLogMonitor.test.ts`
    - `src/hooks/__tests__/useSmartCapture.test.ts`
    - `src/utils/__tests__/storage.test.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `MODERATE-REMEDIATION-006`.
- `PM Response` | `APPROVED`
  - Reason: requested moderate issues were remediated with targeted implementation and full validation evidence.

---

## 2026-02-17 - FOLLOWUP-REMEDIATION-008
- Scope: close remaining follow-up issues after moderate remediation by finishing targeted accessibility labels, safer backup defaults, and additional env-backed runtime timers.

## Work Entries
- 16:41Z
  - Added intake + plan entries for `FOLLOWUP-REMEDIATION-008`.
  - Claimed temporary locks for remaining UI/timer/default files in this scope.

- 16:43Z
  - Patched defaults/config:
    - switched auto-backup fresh/default fallbacks to disabled in:
      - `src/store/slices/createSettingsSlice.ts`
      - `src/store/useAppStore.ts`
      - `src/utils/storage.ts`
    - extended env-backed runtime config in `src/config/runtimeConfig.ts` and typed env keys in `src/vite-env.d.ts`.
    - wired runtime timers into:
      - `src/hooks/useDiscordRPC.ts`
      - `src/components/SystemPulse.tsx`
      - `src/components/HistoryTable.tsx`
      - `src/components/recording/ActionPanel.tsx`

- 16:47Z
  - Patched accessibility labels for icon-only controls across primary interaction components:
    - `src/components/DrillDownOverlay.tsx`
    - `src/components/analytics/AnalyticsShell.tsx`
    - `src/components/PlayerHub.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `src/components/recording/RosterPanel.tsx`
    - `src/components/SessionTimer.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/components/recording/MissionPanel.tsx`
    - `src/components/WindowFrame.tsx`
    - `src/components/smart-captures/SmartCaptureWidgets.tsx`
    - `src/components/EditMatchModal.tsx`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/components/IdMapper.tsx`
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/components/Wizard.tsx`
    - `src/components/recording/ActionPanel.tsx`

- 16:49Z
  - Patched `src/components/ErrorBoundary.tsx` emergency reset confirmation copy and switched to explicit `window.confirm` flow.

- 16:52Z
  - Validation completed:
    - touched-file eslint PASS,
    - `typecheck` PASS,
    - full `test` PASS,
    - full `lint` PASS,
    - full `build` PASS.

## Inter-Agent Request Lifecycle
- Request ID: `FOLLOWUP-REMEDIATION-008-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `OPEN`: close remaining follow-up issues in accessibility/defaults/config timer scope.
  - `ACK`: builder accepted narrow scope and began defaults + config timer patching.
  - `IN_PROGRESS`: icon-control label sweep completed across targeted core surfaces.
  - `READY_FOR_REVIEW`: validations passed and evidence captured.
  - `CLOSED`: PM response approved with evidence pointers.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `FOLLOWUP-REMEDIATION-008#1/#2/#3/#4` | Owner: `builder`
  - Delta:
    - changed auto-backup fresh/default behavior to disabled while preserving user-configurable toggle,
    - moved additional runtime timing constants to env-backed config and wired them into active polling/debounce paths,
    - added `aria-label` coverage for icon-only controls in high-traffic UI surfaces.
  - Evidence pointers:
    - `src/store/slices/createSettingsSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/utils/storage.ts`
    - `src/config/runtimeConfig.ts`
    - `src/vite-env.d.ts`
    - `src/hooks/useDiscordRPC.ts`
    - `src/components/SystemPulse.tsx`
    - `src/components/HistoryTable.tsx`
    - `src/components/recording/ActionPanel.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `src/components/recording/RosterPanel.tsx`
    - `src/components/WindowFrame.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `FOLLOWUP-REMEDIATION-008`.
- `PM Response` | `APPROVED`
  - Reason: remaining follow-up items were remediated in-scope with full validation evidence.

---

## 2026-02-17 - CORPUS-IMPORT-DIR-009
- Scope: make corpus image import open directly in the corpus image storage directory.

## Work Entries
- 17:01Z
  - Added intake + plan entries for `CORPUS-IMPORT-DIR-009`.
  - Claimed temporary locks for `electron/main.cjs` and required AGENTS artifacts.

- 17:03Z
  - Patched `electron/main.cjs` (`ocr-corpus-import-images`):
    - ensured `ocr-corpus/images` is created before dialog open,
    - set `showOpenDialog` `defaultPath` to that directory,
    - preserved existing multi-file import/cancel behavior.

- 17:04Z
  - Completed focused validation:
    - `npx eslint electron/main.cjs` PASS,
    - `npm run -s typecheck` PASS.

## Inter-Agent Request Lifecycle
- Request ID: `CORPUS-IMPORT-DIR-009-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `OPEN`: implement corpus import dialog default directory behavior.
  - `ACK`: builder accepted scoped request and began handler patch.
  - `IN_PROGRESS`: Electron handler updated to set defaultPath.
  - `READY_FOR_REVIEW`: focused lint + typecheck passed with evidence recorded.
  - `CLOSED`: PM response approved.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `CORPUS-IMPORT-DIR-009#1/#2/#3` | Owner: `builder`
  - Delta:
    - corpus import dialog now opens at `ocr-corpus/images`,
    - destination directory is ensured before dialog launch,
    - existing import semantics retained.
  - Evidence pointers:
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `CORPUS-IMPORT-DIR-009`.
- `PM Response` | `APPROVED`
  - Reason: request implemented with minimal scope and passing focused validation.

---

## 2026-02-17 - OCR-DUAL-BUFFER-GATES-010
- Scope: implement dual-buffer OCR extraction and strict roster auto-apply guardrails.

## Work Entries
- 17:16Z
  - Added intake + plan entries for `OCR-DUAL-BUFFER-GATES-010`.
  - Claimed additional OCR/runtime locks in `docs/WORKLOCKS.md` for new touched files.
  - Confirmed current preprocessing behavior:
    - global OCR preprocess retains color,
    - region OCR uses grayscale (text ROI),
    - Crew Hub color detection currently runs from preprocessed OCR buffer path.
  - Next: patch Crew Hub pipeline to split text and color buffers.

## Inter-Agent Request Lifecycle
- Request ID: `OCR-DUAL-BUFFER-GATES-010-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `OPEN`: implement approved OCR dual-buffer + strict gate plan end-to-end.
  - `ACK`: builder accepted scope and began OCR handler/extractor wiring pass.
  - `IN_PROGRESS`: extraction and commit-boundary guardrail patching in progress.

- 17:21Z
  - Patched Crew Hub dual-buffer routing:
    - `electron/ocrHandler.cjs`
      - `extractCrewHub(...)` calls now pass:
        - preprocessed OCR buffer for text/word geometry,
        - original image buffer for color detection fidelity.
    - `electron/crewHubExtractor.cjs`
      - extended `extractCrewHub` signature with optional `colorImageBuffer`,
      - `extractRightPanel` now reads badge color from `colorImageBuffer` while using OCR words from text buffer.

- 17:24Z
  - Added hard caps in OCR merge boundaries:
    - `electron/ocrMerger.cjs`
      - added `capPlayerEntries` helper,
      - enforced max 4 players for your team, map players, and each enemy team during merges.
    - `electron/ocrHandler.cjs`
      - `convertCrewHubToLegacy` now caps teammates and each opponent team player list to 4 (and opponent teams to 4).
    - `src/utils/ocr/ocrParser.ts`
      - applied teammate cap via `capTeammatePlayers`,
      - applied per-team opponent cap (4) and opponent-team cap (4) in merge + validation paths.

- 17:27Z
  - Added strict auto-apply gate behavior:
    - `src/App.tsx`
      - added confidence/ambiguity guardrails before roster writes:
        - reject auto-apply when confidence < 55,
        - send to review queue when 55-74,
        - send to review queue when resolver rewrite is low-similarity (<70),
      - enforced per-team opponent player cap at apply time,
      - limited roster-candidate auto-queueing to actually auto-applied names.
    - `src/hooks/useSmartCapture.ts`
      - applied same confidence/ambiguity guards in SmartScan auto-apply path,
      - queue low-confidence/ambiguous names as `player_name` reviews instead of auto-committing.

- 17:29Z
  - Added regression coverage:
    - `src/utils/ocr/__tests__/ocrParser.test.ts`
      - new tests for teammate cap and opponent per-team cap after merges.

- 17:31Z
  - Validation:
    - `eslint` touched OCR files PASS,
    - `typecheck` PASS,
    - targeted `vitest`:
      - `src/utils/ocr/__tests__/ocrParser.test.ts` PASS,
      - `src/hooks/__tests__/useSmartCapture.test.ts` PASS,
      - `src/App.test.tsx` PASS.

- Request ID: `OCR-DUAL-BUFFER-GATES-010-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `READY_FOR_REVIEW`: implementation + focused validation complete.
  - `CLOSED`: PM feedback cycle approved with evidence pointers below.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-DUAL-BUFFER-GATES-010#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - split text and color buffers in Crew Hub extraction path to preserve team-color fidelity,
    - added max-player guardrails in OCR merge + legacy conversion + frontend merge validation,
    - added strict auto-apply confidence/ambiguity gates in App and SmartScan auto-apply path,
    - added targeted regression tests for merge-time caps.
  - Evidence pointers:
    - `electron/ocrHandler.cjs`
    - `electron/crewHubExtractor.cjs`
    - `electron/ocrMerger.cjs`
    - `src/utils/ocr/ocrParser.ts`
    - `src/App.tsx`
    - `src/hooks/useSmartCapture.ts`
    - `src/utils/ocr/__tests__/ocrParser.test.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-DUAL-BUFFER-GATES-010`.
- `PM Response` | `APPROVED`
  - Reason: dual-buffer fidelity fix and strict apply guardrails are implemented in-scope with passing focused validation.

---

## 2026-02-17 - OCR-ROI-RUNTIME-011
- Scope: make OCR scan regions actively adjustable and apply settings to reruns.

## Work Entries
- 17:28Z
  - Added intake + plan entries for `OCR-ROI-RUNTIME-011`.
  - Claimed locks for settings, IPC bridge, OCR handler/extractors, and rerun callsites.
  - Confirmed rerun path currently calls `processCapture` through `rerun-ocr-on-artifact` and does not yet accept ROI overrides.

## Inter-Agent Request Lifecycle
- Request ID: `OCR-ROI-RUNTIME-011-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `OPEN`: implement live/persisted ROI settings and apply to OCR + reruns.
  - `ACK`: builder accepted and started store/IPC/extractor wiring.
  - `IN_PROGRESS`: implementation in progress.
  - `READY_FOR_REVIEW`: ROI runtime plumbing and settings editor complete; focused validation green.
  - `CLOSED`: PM feedback cycle approved.

- 10:42Z
  - Completed remaining renderer callsite wiring so live ROI settings are used in all OCR paths:
    - `src/components/SmartCapturesPanel.tsx` detail rerun + parent prop pass-through,
    - `src/components/HistoryTable.tsx` bulk rerun now uses active `ocrMode` and `ocrRegions`,
    - `src/hooks/useSmartScan.ts` and `src/utils/scan/tesseractScan.ts` now pass ROI settings to OCR bridge,
    - `src/hooks/useSmartCapture.ts` smart-analyze pre-pass now includes live ROI settings,
    - `src/components/DevOCRPanel.tsx` OCR run includes live ROI settings.

- 10:46Z
  - Completed Electron ROI pipeline wiring:
    - `electron/main.cjs` rerun handler now accepts optional `ocrRegions` and forwards to `processCapture(...)`.
    - `electron/ocrHandler.cjs`:
      - added ROI sanitization/clamping helpers and defaults,
      - added ROI fingerprint to OCR cache key to prevent stale cached rerun data after ROI changes,
      - wired normalized ROI overrides through Crew Hub / Map Screen extraction and map-player region OCR crop,
      - updated `ocr-process-capture` IPC handler to accept optional runtime options payload.
    - `electron/crewHubExtractor.cjs` now consumes dynamic layout overrides for left/right panel parsing.
    - `electron/mapScreenExtractor.cjs` now consumes dynamic layout overrides for your-ship/enemy/player regions and uses hazards ROI in hazard text region pass.

- 10:49Z
  - Completed Settings ROI controls and persistence end-to-end:
    - `src/components/SettingsModal.tsx` now exposes editable ROI fields (x/y min/max %) for Crew Hub + Map regions and reset-to-default action.
    - ROI edits apply immediately via store actions and are persisted by `Save & Apply`.
    - `handleSaveAndClose` now includes `ocrRegions` in persisted settings payload.
    - `src/store/slices/createSettingsSlice.ts` updated with typed nested ROI update contract.
    - `src/store/useAppStore.ts` merge helper made shape-safe for ROI-bound structures.

- 10:50Z
  - Validation completed:
    - `npx eslint src/components/SmartCapturesPanel.tsx src/components/HistoryTable.tsx src/hooks/useSmartScan.ts src/utils/scan/tesseractScan.ts src/components/DevOCRPanel.tsx src/hooks/useSmartCapture.ts src/components/SettingsModal.tsx electron/main.cjs electron/ocrHandler.cjs electron/crewHubExtractor.cjs electron/mapScreenExtractor.cjs` PASS
    - `npx vitest run src/utils/__tests__/artifactService.test.ts` PASS
    - `npx vitest run src/hooks/__tests__/useSmartCapture.test.ts` PASS
    - `npm run -s typecheck` PASS

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ROI-RUNTIME-011#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - finished runtime ROI pass-through from settings to all rerun/live OCR callsites,
    - added Electron-side ROI sanitization and extractor override application,
    - ensured cache invalidation by ROI fingerprint so reruns immediately reflect region changes,
    - delivered settings ROI editor + reset flow and persisted payload wiring.
  - Evidence pointers:
    - `src/store/slices/createSettingsSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/components/SettingsModal.tsx`
    - `src/components/SmartCapturesPanel.tsx`
    - `src/components/HistoryTable.tsx`
    - `src/hooks/useSmartCapture.ts`
    - `src/hooks/useSmartScan.ts`
    - `src/utils/scan/tesseractScan.ts`
    - `src/components/DevOCRPanel.tsx`
    - `electron/main.cjs`
    - `electron/ocrHandler.cjs`
    - `electron/crewHubExtractor.cjs`
    - `electron/mapScreenExtractor.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ROI-RUNTIME-011`.
- `PM Response` | `APPROVED`
  - Reason: runtime-adjustable ROI feature now applies immediately across reruns/live OCR with passing focused validation.

---

## 2026-02-17 - OCR-CORPUS-ROI-012
- Scope: make corpus batch OCR pipeline consume current ROI settings.

## Work Entries
- 18:06Z
  - Added intake + plan entries for `OCR-CORPUS-ROI-012`.
  - Confirmed gap:
    - `DevOCRPanel` corpus pipeline invoke did not include `ocrRegions`,
    - `electron/main.cjs` `ocr-corpus-run-pipeline` did not forward ROI options to `processCapture(...)`.

- 18:08Z
  - Patched renderer payload:
    - `src/components/DevOCRPanel.tsx`
      - `ocr-corpus-run-pipeline` invoke now sends `{ ocrMode, activeUser, ocrRegions }`.

- 18:10Z
  - Patched Electron corpus pipeline wiring:
    - `electron/main.cjs`
      - `ocr-corpus-run-pipeline` now reads `opts?.ocrRegions || null`,
      - forwards `ocrRegions` into `processCapture(...)` options for each sample.

- 18:12Z
  - Validation completed:
    - `npx eslint src/components/DevOCRPanel.tsx electron/main.cjs` PASS.
    - `npm run -s typecheck` PASS.

## Inter-Agent Request Lifecycle
- Request ID: `OCR-CORPUS-ROI-012-R1` | Sender: `project-manager` -> Receiver: `builder`
  - `OPEN`: thread live ROI settings into corpus pipeline runs.
  - `ACK`: builder accepted narrow scope and began payload/handler wiring.
  - `IN_PROGRESS`: renderer + Electron pipeline patching.
  - `READY_FOR_REVIEW`: focused validation passed.
  - `CLOSED`: PM feedback cycle approved.

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-CORPUS-ROI-012#1/#2/#3` | Owner: `builder`
  - Delta:
    - corpus pipeline invoke now includes live ROI settings,
    - Electron corpus runner forwards ROI options to `processCapture(...)`,
    - no corpus schema/output contract changes.
  - Evidence pointers:
    - `src/components/DevOCRPanel.tsx`
    - `electron/main.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-CORPUS-ROI-012`.
- `PM Response` | `APPROVED`
  - Reason: corpus path now matches live/rerun ROI behavior with focused validation passing.

---

## 2026-02-17 - OCR-ENHANCEMENT-T1-013
- Scope: begin user-requested OCR enhancement roadmap by implementing Tier 1 features only (cache telemetry + correction UX wins).
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T1-013` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: implement Tier 1 #1-#4 across OCR handler, modal, alias engine, and Dev OCR panel with no breaking contracts.
    - Evidence target: `electron/ocrHandler.cjs`, `electron/preload.cjs`, `src/components/DevOCRPanel.tsx`, `src/components/OcrCorrectionModal.tsx`, `src/hooks/useKeyboardShortcuts.ts`, `src/components/ConfidenceMeter.tsx`, `src/utils/ocrAliasEngine.ts`.
  - `REQ-OCR-T1-013` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted; execution started on plan step #1.
  - `REQ-OCR-T1-013` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active; first implementation step is OCR cache telemetry plumbing + dev panel polling.
- Work entries:
  - 18:38Z
    - Intake/plan normalized to Tier 1-only interpretation to prevent scope drift from 12-item full roadmap.
    - Locks claimed for OCR Tier 1 target files and AGENTS artifacts.
    - Started code pass on cache telemetry path (`ocrHandler` + `DevOCRPanel`).
- 18:44Z
  - Implemented Tier 1 #1 cache telemetry:
    - `electron/ocrHandler.cjs`: added cache hit/miss/eviction counters, running hit/miss timing averages, and `get-ocr-cache-stats` IPC handler.
    - `electron/preload.cjs`: added `get-ocr-cache-stats` to invoke allowlist.
    - `scripts/security_negative_tests.cjs`: synced allowlist fixture for security gate parity.
    - `src/components/DevOCRPanel.tsx`: added 5-second cache telemetry polling card (hit rate, size, avg hit/miss latency).

- 18:47Z
  - Implemented Tier 1 #2/#3/#4 correction UX enhancements:
    - `src/hooks/useKeyboardShortcuts.ts`: generalized hook to support both legacy win/loss shortcuts and reusable shortcut arrays.
    - `src/components/ConfidenceMeter.tsx`: added new accessible confidence progress component.
    - `src/components/OcrCorrectionModal.tsx`: wired modal shortcuts (`Ctrl/Cmd+Enter`, `Esc`, `Ctrl/Cmd+A`, `Ctrl/Cmd+I`), added shortcut hint banner, replaced confidence text with `ConfidenceMeter`, and added learned badge tooltip.
    - `src/utils/ocrAliasEngine.ts`: extended alias entry metadata and added `getLearningMetadata(...)` helper used by modal tooltips.

- 18:49Z
  - Validation complete:
    - touched-file `eslint` PASS,
    - targeted `vitest` PASS,
    - `node scripts/security_negative_tests.cjs` PASS (113/113),
    - `npm run -s typecheck` PASS.

- `REQ-OCR-T1-013` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for Tier 1 #1-#4 implementation.
- `REQ-OCR-T1-013` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `electron/ocrHandler.cjs`
    - `electron/preload.cjs`
    - `scripts/security_negative_tests.cjs`
    - `src/components/DevOCRPanel.tsx`
    - `src/hooks/useKeyboardShortcuts.ts`
    - `src/components/ConfidenceMeter.tsx`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/utils/ocrAliasEngine.ts`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T1-013#1/#2/#3/#4/#5/#6` | Owner: `builder`
  - Delta:
    - added OCR cache telemetry instrumentation + IPC endpoint + Dev OCR polling UI,
    - added correction-modal keyboard shortcuts and shortcut hint banner,
    - replaced confidence percentage text with accessible confidence meters,
    - exposed alias learning metadata and surfaced learned badge tooltips,
    - ran focused validation for lint/test/typecheck/security allowlist parity.
  - Evidence pointers:
    - `electron/ocrHandler.cjs`
    - `electron/preload.cjs`
    - `scripts/security_negative_tests.cjs`
    - `src/components/DevOCRPanel.tsx`
    - `src/hooks/useKeyboardShortcuts.ts`
    - `src/components/ConfidenceMeter.tsx`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/utils/ocrAliasEngine.ts`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T1-013` Tier 1 implementation increment.
- `PM Response` | `APPROVED`
  - Reason: Tier 1 scope delivered with additive changes, no contract breakage, and passing focused validation evidence.

- 18:51Z
  - Released OCR-ENHANCEMENT-T1-013 lock claims and recorded release entries in docs/WORKLOCKS.md.

---

## 2026-02-17 - OCR-ENHANCEMENT-T2-014
- Scope: continue OCR enhancement roadmap with Tier 2 #5 by adding a benchmarkable old-vs-region-first preprocessing comparison flow.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T2-014` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: implement Tier 2 #5 benchmark instrumentation and Dev OCR surface without changing production OCR extraction behavior.
    - Evidence target: `electron/ocrHandler.cjs`, `electron/preload.cjs`, `scripts/security_negative_tests.cjs`, `src/components/DevOCRPanel.tsx`.
  - `REQ-OCR-T2-014` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted narrow scope and started intake/plan/lock updates.
  - `REQ-OCR-T2-014` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across benchmark helper implementation, preload allowlist parity, and dev-panel UX.
- Work entries:
  - 18:57Z
    - Added `OCR-ENHANCEMENT-T2-014` intake + plan entries.
    - Claimed targeted lock entries for new touched files not already covered by lane locks:
      - `electron/preload.cjs`
      - `scripts/security_negative_tests.cjs`
    - Confirmed benchmark insertion points in `electron/ocrHandler.cjs` around region OCR path and OCR IPC registration.
  - 19:01Z
    - Implemented benchmark engine in `electron/ocrHandler.cjs`:
      - added reusable region-pixel resolver and crop-first preprocessing helper,
      - added synthetic old-flow benchmark helper (full-image preprocess then region crop),
      - added `benchmarkRegionPreprocessing(...)` summary output (avg timings, speedup %, factor, per-iteration).
    - Added IPC handler:
      - `benchmark-ocr-preprocessing` accepts base64 or file-path payload, optional iterations, optional ROI overrides.
      - preserves existing OCR extraction path; benchmark logic is additive and dev-only.
  - 19:03Z
    - Updated IPC boundaries:
      - `electron/preload.cjs`: added `benchmark-ocr-preprocessing` to invoke allowlist.
      - `scripts/security_negative_tests.cjs`: mirrored invoke allowlist fixture entry.
    - Updated renderer tools:
      - `src/components/DevOCRPanel.tsx`:
        - added benchmark state typing + response guard,
        - added action button (`Benchmark Old vs Crop-First (10x)`),
        - added result summary card (old/new avg, speedup %, factor, regions),
        - resets benchmark state when loading a new image.
  - 19:05Z
    - Validation completed:
      - `npx eslint electron/ocrHandler.cjs electron/preload.cjs src/components/DevOCRPanel.tsx scripts/security_negative_tests.cjs` PASS.
      - `node scripts/security_negative_tests.cjs` PASS (113/113).
      - `npm run -s typecheck` PASS.

- `REQ-OCR-T2-014` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for Tier 2 #5 benchmark increment.
- `REQ-OCR-T2-014` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `electron/ocrHandler.cjs`
    - `electron/preload.cjs`
    - `scripts/security_negative_tests.cjs`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T2-014#1/#2/#3/#4/#5/#6` | Owner: `builder`
  - Delta:
    - added benchmark-only preprocessing comparison engine in OCR handler,
    - exposed benchmark IPC channel and maintained preload/security allowlist parity,
    - added Dev OCR panel control + telemetry view for old-vs-new preprocessing timing comparisons,
    - ran focused lint, security negative tests, and typecheck validation.
  - Evidence pointers:
    - `electron/ocrHandler.cjs`
    - `electron/preload.cjs`
    - `scripts/security_negative_tests.cjs`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T2-014` Tier 2 #5 benchmark increment.
- `PM Response` | `APPROVED`
  - Reason: benchmark feature is additive, production OCR path unchanged, and validation evidence is complete.

- 19:02Z
  - Released `OCR-ENHANCEMENT-T2-014` temporary lock claims (`electron/preload.cjs`, `scripts/security_negative_tests.cjs`) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T2-015
- Scope: continue OCR enhancement roadmap with Tier 2 #6 by adding confidence calibration sample tracking + bucket analysis visibility.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T2-015` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: implement calibration sample capture/persistence and Dev OCR bucketed confidence analysis.
    - Evidence target: `src/utils/ocrCalibration.ts`, `src/store/slices/createSettingsSlice.ts`, `src/store/useAppStore.ts`, `src/components/OcrCorrectionModal.tsx`, `src/components/DevOCRPanel.tsx`.
  - `REQ-OCR-T2-015` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted Tier 2 #6-only scope and began intake/plan/lock updates.
  - `REQ-OCR-T2-015` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across utility/store/UI/test wiring.
- Work entries:
  - 19:06Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T2-015`.
    - Claimed non-lane locks for:
      - `src/store/slices/createSettingsSlice.ts`
      - `src/utils/ocrCalibration.ts`
      - `src/utils/__tests__/ocrCalibration.test.ts`
    - Confirmed insertion points in settings persistence and correction modal submit flow.

  - 19:08Z
    - Implemented calibration utility module:
      - `src/utils/ocrCalibration.ts`
        - added calibration sample + bucket types,
        - added mode normalization (`local`/`cloud`/`merged`),
        - added bounded append/sanitize helpers (max 1000),
        - added fixed bucket analysis (0-20, 20-40, 40-60, 60-80, 80-100),
        - added threshold recommendation helper (lowest bucket meeting target accuracy).

    - Extended persisted settings/store:
      - `src/store/slices/createSettingsSlice.ts`
        - added `ocrCalibrationSamples` state,
        - added `recordCalibrationSample(...)` and `clearOcrCalibrationSamples(...)` actions.
      - `src/store/useAppStore.ts`
        - hydrate `ocrCalibrationSamples` using utility sanitizer,
        - persist + partialize `ocrCalibrationSamples` in settings payload.

    - Wired correction-event sample capture:
      - `src/components/OcrCorrectionModal.tsx`
        - record calibration sample for each applied/non-ignored correction using predicted confidence, correctness, normalized OCR mode, and timestamp.

    - Added Dev OCR calibration visibility:
      - `src/components/DevOCRPanel.tsx`
        - reads calibration sample list from store,
        - computes bucket accuracy and recommended threshold via utility helpers,
        - renders calibration card with per-bucket range/samples/accuracy and recommendation text.

    - Added focused tests:
      - `src/utils/__tests__/ocrCalibration.test.ts`
        - sample-cap behavior,
        - bucket math,
        - threshold recommendation and null behavior,
        - OCR mode normalization.
      - `src/components/OcrCorrectionModal.test.tsx`
        - updated mocked store shape for new calibration fields.

  - 19:09Z
    - Validation completed:
      - `npx eslint src/utils/ocrCalibration.ts src/utils/__tests__/ocrCalibration.test.ts src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts src/components/OcrCorrectionModal.tsx src/components/DevOCRPanel.tsx src/components/OcrCorrectionModal.test.tsx` PASS.
      - `npx vitest run src/utils/__tests__/ocrCalibration.test.ts src/components/OcrCorrectionModal.test.tsx` PASS (2 files, 7 tests).
      - `npm run -s typecheck` PASS.

- `REQ-OCR-T2-015` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for Tier 2 #6 calibration increment.
- `REQ-OCR-T2-015` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/utils/ocrCalibration.ts`
    - `src/utils/__tests__/ocrCalibration.test.ts`
    - `src/store/slices/createSettingsSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T2-015#1/#2/#3/#4/#5/#6/#7` | Owner: `builder`
  - Delta:
    - added reusable OCR confidence calibration utility with bounded sample handling and bucket math,
    - persisted calibration samples in settings store with append action,
    - wired correction-modal sample recording on apply,
    - surfaced bucketed calibration accuracy and threshold recommendation in Dev OCR panel,
    - added focused utility tests and passed lint/tests/typecheck.
  - Evidence pointers:
    - `src/utils/ocrCalibration.ts`
    - `src/utils/__tests__/ocrCalibration.test.ts`
    - `src/store/slices/createSettingsSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T2-015` Tier 2 #6 calibration increment.
- `PM Response` | `APPROVED`
  - Reason: calibration tracking is additive, persisted safely with bounded samples, and validated with focused tests.

- 19:11Z
  - Released `OCR-ENHANCEMENT-T2-015` temporary lock claims (`src/store/slices/createSettingsSlice.ts`, `src/utils/ocrCalibration.ts`, `src/utils/__tests__/ocrCalibration.test.ts`) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T2-016
- Scope: continue OCR enhancement roadmap with Tier 2 #7 by adding threshold-driven batch correction operations with confirmation.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T2-016` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: implement batch accept/ignore operations, persisted threshold setting, confirmation dialog, and focused tests.
    - Evidence target: `src/store/slices/createSettingsSlice.ts`, `src/store/useAppStore.ts`, `src/components/BatchActionConfirmDialog.tsx`, `src/components/OcrCorrectionModal.tsx`, `src/utils/ocrBatchActions.ts`.
  - `REQ-OCR-T2-016` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted Tier 2 #7-only scope and started intake/plan/lock setup.
  - `REQ-OCR-T2-016` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across settings persistence, modal UI/actions, and test coverage.
- Work entries:
  - 19:14Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T2-016`.
    - Claimed non-lane locks for:
      - `src/components/BatchActionConfirmDialog.tsx`
      - `src/store/slices/createSettingsSlice.ts`
      - `src/utils/__tests__/ocrBatchActions.test.ts`
    - Confirmed existing correction modal and settings persistence insertion points.

  - 19:18Z
    - Added persisted batch-threshold setting:
      - `src/store/slices/createSettingsSlice.ts`
        - added `ocrBatchAcceptThreshold` (default 85) and `setOcrBatchAcceptThreshold`.
      - `src/store/useAppStore.ts`
        - added hydrate/persist/partialize wiring for `ocrBatchAcceptThreshold`.
    - Added utility helpers:
      - `src/utils/ocrBatchActions.ts`
        - threshold normalization (70-95 step 5),
        - high/low eligible candidate filtering with corrected/ignored exclusions.

  - 19:20Z
    - Added reusable confirmation component:
      - `src/components/BatchActionConfirmDialog.tsx`.
    - Updated correction modal batch workflow:
      - `src/components/OcrCorrectionModal.tsx`
        - threshold slider with persisted value,
        - real-time eligible counts,
        - batch accept + batch ignore handlers,
        - confirmation prompt before applying batch actions,
        - retained existing shortcut flow (`Ctrl+A`, `Ctrl+I`, `Ctrl+Enter`, `Esc`).
    - Added/updated focused tests:
      - new `src/utils/__tests__/ocrBatchActions.test.ts`,
      - adjusted `src/components/OcrCorrectionModal.test.tsx` query for unambiguous Ignore button targeting.

  - 19:21Z
    - Validation completed:
      - `npx eslint src/utils/ocrBatchActions.ts src/utils/__tests__/ocrBatchActions.test.ts src/components/BatchActionConfirmDialog.tsx src/components/OcrCorrectionModal.tsx src/components/OcrCorrectionModal.test.tsx src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts` PASS.
      - `npx vitest run src/utils/__tests__/ocrBatchActions.test.ts src/components/OcrCorrectionModal.test.tsx` PASS (2 files, 5 tests).
      - `npm run -s typecheck` PASS.

- `REQ-OCR-T2-016` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for Tier 2 #7 batch operations increment.
- `REQ-OCR-T2-016` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/store/slices/createSettingsSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/utils/ocrBatchActions.ts`
    - `src/utils/__tests__/ocrBatchActions.test.ts`
    - `src/components/BatchActionConfirmDialog.tsx`
    - `src/components/OcrCorrectionModal.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T2-016#1/#2/#3/#4/#5/#6` | Owner: `builder`
  - Delta:
    - added persisted OCR batch threshold with bounded normalization,
    - added shared batch eligibility utilities and focused tests,
    - introduced confirmation dialog component for batch actions,
    - added threshold slider + live counts + confirmed batch accept/ignore operations in OCR correction modal,
    - validated lint/tests/typecheck after modal/store updates.
  - Evidence pointers:
    - `src/store/slices/createSettingsSlice.ts`
    - `src/store/useAppStore.ts`
    - `src/utils/ocrBatchActions.ts`
    - `src/utils/__tests__/ocrBatchActions.test.ts`
    - `src/components/BatchActionConfirmDialog.tsx`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/OcrCorrectionModal.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T2-016` Tier 2 #7 batch operations increment.
- `PM Response` | `APPROVED`
  - Reason: batch operations now have persisted thresholds + explicit confirmation and pass focused validation checks.

- 19:22Z
  - Released `OCR-ENHANCEMENT-T2-016` temporary lock claims (`src/components/BatchActionConfirmDialog.tsx`, `src/store/slices/createSettingsSlice.ts`, `src/utils/__tests__/ocrBatchActions.test.ts`) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T2-017
- Scope: continue OCR enhancement roadmap with Tier 2 #8 by adding interactive OCR bounding-box overlay debugging in Dev OCR tools.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T2-017` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: add opt-in OCR bbox debug payload + Dev panel overlay visualization while preserving existing OCR flows.
    - Evidence target: `electron/ocrHandler.cjs`, `src/utils/ocr/ocrTypes.ts`, `src/utils/electronBridge.ts`, `src/components/OcrBoundingBoxOverlay.tsx`, `src/components/DevOCRPanel.tsx`.
  - `REQ-OCR-T2-017` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted Tier 2 #8 scope, started intake/plan + lock updates.
  - `REQ-OCR-T2-017` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across OCR handler debug payload wiring and Dev panel overlay UI implementation.
- Work entries:
  - 12:34Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T2-017`.
    - Claimed temporary locks for:
      - `electron/ocrHandler.cjs`
      - `src/components/DevOCRPanel.tsx`
      - `src/utils/ocr/ocrTypes.ts`
      - `src/utils/electronBridge.ts`
      - `src/components/OcrBoundingBoxOverlay.tsx`
    - Confirmed existing OCR handler already captures word-level bbox data; implementation will keep payload opt-in via runtime options.
  - 12:36Z
    - Implemented backend opt-in bbox debug payload in `electron/ocrHandler.cjs`:
      - added `includeBboxes` runtime option parsing (strict boolean),
      - added cache bypass for debug captures (`includeBboxes` runs are never served from OCR cache),
      - added helper payload normalizers (`normalizeDebugWord`, `buildOcrBoundingBoxDebugPayload`),
      - attached optional `data.ocrBoundingBoxes` response payload (source/image dimensions/word bboxes).

  - 12:38Z
    - Implemented renderer contract + UI:
      - `src/utils/ocr/ocrTypes.ts`: added optional `ocrBoundingBoxes` field to `OCRExtractedData`.
      - `src/utils/electronBridge.ts`: added `OCRProcessRuntimeOptions` and pass-through support for `includeBboxes`.
      - `src/components/OcrBoundingBoxOverlay.tsx` (new): interactive SVG overlay with confidence color coding, hover tooltip, keyboard-selectable/clickable boxes, and selected detail panel.
      - `src/components/DevOCRPanel.tsx`: added "Capture with Bounding Boxes" action, debug OCR path using `includeBboxes`, overlay state/reset wiring, image preview overlay rendering, and bbox summary badge in results panel.

  - 12:40Z
    - Validation completed:
      - `npx eslint electron/ocrHandler.cjs src/utils/ocr/ocrTypes.ts src/utils/electronBridge.ts src/components/OcrBoundingBoxOverlay.tsx src/components/DevOCRPanel.tsx` PASS.
      - `npm run -s typecheck` PASS.
      - targeted `rg` wiring verification PASS.

- `REQ-OCR-T2-017` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for Tier 2 #8 bounding-box overlay increment.
- `REQ-OCR-T2-017` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `electron/ocrHandler.cjs`
    - `src/utils/ocr/ocrTypes.ts`
    - `src/utils/electronBridge.ts`
    - `src/components/OcrBoundingBoxOverlay.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T2-017#1/#2/#3/#4/#5/#6` | Owner: `builder`
  - Delta:
    - added opt-in OCR bbox debug payload generation in OCR handler with cache bypass for debug runs,
    - extended OCR bridge/types for runtime debug option passthrough and typed bbox response data,
    - added interactive `OcrBoundingBoxOverlay` component,
    - added Dev OCR panel action for bbox capture and overlay visualization,
    - completed focused lint/typecheck verification.
  - Evidence pointers:
    - `electron/ocrHandler.cjs`
    - `src/utils/ocr/ocrTypes.ts`
    - `src/utils/electronBridge.ts`
    - `src/components/OcrBoundingBoxOverlay.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T2-017` Tier 2 #8 bounding-box overlay increment.
- `PM Response` | `APPROVED`
  - Reason: bbox overlay feature is additive, isolated to explicit debug mode, and validation evidence is complete.

- 12:41Z
  - Released `OCR-ENHANCEMENT-T2-017` temporary lock claims (`electron/ocrHandler.cjs`, `src/components/DevOCRPanel.tsx`, `src/utils/ocr/ocrTypes.ts`, `src/utils/electronBridge.ts`, `src/components/OcrBoundingBoxOverlay.tsx`, and AGENTS artifact files) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T3-018
- Scope: continue OCR enhancement roadmap with Tier 3 #9 by exporting correction corpus artifacts and adding opt-in OCR sample archiving.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T3-018` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: implement correction corpus builder/export action and optional OCR sample archive plumbing.
    - Evidence target: `src/utils/ocrCorpusBuilder.ts`, `src/utils/export.ts`, `src/components/DevOCRPanel.tsx`, `electron/ocrHandler.cjs`, `src/utils/__tests__/ocrCorpusBuilder.test.ts`.
  - `REQ-OCR-T3-018` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted Tier 3 #9-focused scope; started intake/plan/lock updates.
  - `REQ-OCR-T3-018` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across corpus utility, export wiring, and OCR handler archive helper.
- Work entries:
  - 12:46Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T3-018`.
    - Claimed temporary locks for Tier 3 #9 target files and AGENTS artifacts.
    - Confirmed existing alias model and Dev OCR corpus tab insertion points for additive export workflow.
  - 12:48Z
    - Implemented correction corpus utility + export plumbing:
      - added `src/utils/ocrCorpusBuilder.ts` with:
        - `buildOcrCorpus(aliasModel, minCount)`
        - `serializeOcrCorpusJsonl(corpus)`
        - `serializeOcrCorpusBox(corpus)`
      - added `exportTextFile(...)` to `src/utils/export.ts` for `.jsonl`/`.box` artifact downloads.
      - wired `src/components/DevOCRPanel.tsx` corpus action:
        - reads `ocrAliasModel` from store,
        - exports JSON + JSONL + BOX files via new helper,
        - surfaces status messaging for empty corpus and success/failure.

  - 12:49Z
    - Implemented OCR sample archive plumbing:
      - `electron/ocrHandler.cjs`
        - added archive directory helpers and `archiveOcrSample(...)` writer (PNG + JSON sidecar),
        - added runtime options support in `processCapture(...)`:
          - `archiveOcrSample` (boolean)
          - `archiveMetadata` (object)
        - archive path is opt-in and now bypasses OCR cache to avoid skipping archive writes.
      - `src/utils/electronBridge.ts`
        - extended `OCRProcessRuntimeOptions` with `archiveOcrSample` + `archiveMetadata`.
      - `src/components/DevOCRPanel.tsx`
        - Dev OCR run now passes archive runtime options to preserve corpus-ready sample traces.
      - `src/utils/ocr/ocrTypes.ts`
        - added optional `ocrCorpusSampleId` metadata field.

  - 12:50Z
    - Added focused regression coverage:
      - new `src/utils/__tests__/ocrCorpusBuilder.test.ts` validates:
        - min-count filtering,
        - JSONL line serialization shape,
        - BOX text generation shape.

  - 12:50Z
    - Validation completed:
      - `npx eslint src/utils/ocrCorpusBuilder.ts src/utils/__tests__/ocrCorpusBuilder.test.ts src/utils/export.ts src/components/DevOCRPanel.tsx src/utils/electronBridge.ts src/utils/ocr/ocrTypes.ts electron/ocrHandler.cjs` PASS.
      - `npx vitest run src/utils/__tests__/ocrCorpusBuilder.test.ts` PASS (1 file, 3 tests).
      - `npm run -s typecheck` PASS.
      - targeted `rg` wiring verification PASS.

- `REQ-OCR-T3-018` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for Tier 3 #9 correction corpus export increment.
- `REQ-OCR-T3-018` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/utils/ocrCorpusBuilder.ts`
    - `src/utils/__tests__/ocrCorpusBuilder.test.ts`
    - `src/utils/export.ts`
    - `src/components/DevOCRPanel.tsx`
    - `src/utils/electronBridge.ts`
    - `src/utils/ocr/ocrTypes.ts`
    - `electron/ocrHandler.cjs`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T3-018#1/#2/#3/#4/#5/#6` | Owner: `builder`
  - Delta:
    - added alias-model correction corpus builder and serialization for JSON/JSONL/BOX,
    - added text export helper for non-JSON corpus artifacts,
    - added Dev OCR corpus export action (`Export Training Data`),
    - added opt-in OCR sample archive helper/runtime path in OCR handler,
    - added focused corpus-builder tests and passed lint/test/typecheck validation.
  - Evidence pointers:
    - `src/utils/ocrCorpusBuilder.ts`
    - `src/utils/__tests__/ocrCorpusBuilder.test.ts`
    - `src/utils/export.ts`
    - `src/components/DevOCRPanel.tsx`
    - `src/utils/electronBridge.ts`
    - `src/utils/ocr/ocrTypes.ts`
    - `electron/ocrHandler.cjs`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T3-018` Tier 3 #9 correction-corpus export increment.
- `PM Response` | `APPROVED`
  - Reason: correction corpus export now emits requested formats, archive path is opt-in/non-breaking, and validation evidence is complete.

- 12:50Z
  - Released `OCR-ENHANCEMENT-T3-018` temporary lock claims (`electron/ocrHandler.cjs`, `src/components/DevOCRPanel.tsx`, `src/utils/ocrCorpusBuilder.ts`, `src/utils/export.ts`, `src/utils/__tests__/ocrCorpusBuilder.test.ts`, and AGENTS artifact files) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T3-019
- Scope: continue OCR enhancement roadmap with Tier 3 #10 by generating and applying a Tesseract user-words dictionary from pilot registry data.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T3-019` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: add dictionary generation helper, OCR handler regeneration/apply IPC, and renderer auto/manual triggers.
    - Evidence target: `electron/tesseractDictionary.cjs`, `electron/ocrHandler.cjs`, `electron/preload.cjs`, `scripts/security_negative_tests.cjs`, `src/providers/GameDataProvider.tsx`, `src/components/DevOCRPanel.tsx`.
  - `REQ-OCR-T3-019` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted Tier 3 #10 scope; started intake/plan/log updates.
  - `REQ-OCR-T3-019` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across Electron dictionary generation/apply wiring and renderer triggers.
- Work entries:
  - 19:58Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T3-019`.
    - Claimed temporary locks for new files:
      - `electron/tesseractDictionary.cjs`
      - `src/providers/GameDataProvider.tsx`
      - `electron/preload.cjs`
      - `scripts/security_negative_tests.cjs`
    - Confirmed existing lane locks already cover hot OCR files (`electron/ocrHandler.cjs`, `src/components/DevOCRPanel.tsx`).
  - 20:03Z
    - Added `electron/tesseractDictionary.cjs` with:
      - pilot-registry normalization/deduping,
      - match-history frequency scoring,
      - OCR substitution-based variation generation (`0/O`, `1/I/l`),
      - dictionary word list generation and file writer (`wildgate_userwords.txt`).
  - 20:05Z
    - Integrated dictionary lifecycle in `electron/ocrHandler.cjs`:
      - added dictionary file constants (`OCR_USER_WORDS_FILE`) and worker parameter builder,
      - added worker-dictionary apply helper for live workers,
      - loaded existing dictionary file for new worker-pool initialization,
      - added IPC handler `regenerate-ocr-dictionary` (sanitize input, generate file, apply to workers, return summary).
  - 20:07Z
    - Added channel parity + renderer triggers:
      - `electron/preload.cjs`: allowlisted `regenerate-ocr-dictionary`,
      - `scripts/security_negative_tests.cjs`: mirrored allowlist fixture update,
      - `src/providers/GameDataProvider.tsx`: debounced auto-regeneration effect for `pilotRegistry >= 5`,
      - `src/components/DevOCRPanel.tsx`: manual "Regenerate OCR Dictionary" action in corpus tools.
  - 20:11Z
    - Validation completed:
      - `npx eslint electron/tesseractDictionary.cjs electron/ocrHandler.cjs electron/preload.cjs scripts/security_negative_tests.cjs src/providers/GameDataProvider.tsx src/components/DevOCRPanel.tsx` PASS.
      - `node scripts/security_negative_tests.cjs` PASS (113/113).
      - `npm run -s typecheck` PASS.
      - targeted `rg` dictionary-wiring verification PASS.

- `REQ-OCR-T3-019` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for Tier 3 #10 dictionary generation increment.
- `REQ-OCR-T3-019` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `electron/tesseractDictionary.cjs`
    - `electron/ocrHandler.cjs`
    - `electron/preload.cjs`
    - `scripts/security_negative_tests.cjs`
    - `src/providers/GameDataProvider.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T3-019#1/#2/#3/#4/#5/#6` | Owner: `builder`
  - Delta:
    - added standalone Tesseract user-words dictionary generator from pilot registry + match history,
    - integrated OCR-handler dictionary regeneration/apply IPC and worker parameter propagation,
    - updated preload/security allowlist parity for new IPC channel,
    - added auto-regeneration trigger in `GameDataProvider` and manual regeneration action in Dev OCR corpus tools,
    - completed focused lint/security/typecheck validation.
  - Evidence pointers:
    - `electron/tesseractDictionary.cjs`
    - `electron/ocrHandler.cjs`
    - `electron/preload.cjs`
    - `scripts/security_negative_tests.cjs`
    - `src/providers/GameDataProvider.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T3-019` Tier 3 #10 custom dictionary increment.
- `PM Response` | `APPROVED`
  - Reason: dictionary generation/apply flow is additive, includes auto/manual triggers, and validation evidence is complete.

- 20:03Z
  - Released `OCR-ENHANCEMENT-T3-019` temporary lock claims (`electron/tesseractDictionary.cjs`, `src/providers/GameDataProvider.tsx`, `electron/preload.cjs`, `scripts/security_negative_tests.cjs`) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T3-020
- Scope: continue OCR enhancement roadmap with Tier 3 #11 by adding teammate co-occurrence pattern suggestions.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T3-020` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: implement pattern-recognition utility + OCR modal/dev-panel suggestion surfaces.
    - Evidence target: `src/utils/patternRecognition.ts`, `src/utils/__tests__/patternRecognition.test.ts`, `src/components/OcrCorrectionModal.tsx`, `src/components/DevOCRPanel.tsx`.
  - `REQ-OCR-T3-020` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted Tier 3 #11 scope; started intake/plan/log updates.
  - `REQ-OCR-T3-020` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across pattern utility implementation and OCR correction/dev tooling UI integration.
- Work entries:
  - 20:06Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T3-020`.
    - Claimed temporary locks for:
      - `src/utils/patternRecognition.ts`
      - `src/utils/__tests__/patternRecognition.test.ts`
    - Confirmed existing lane locks cover OCR UI hot files (`src/components/OcrCorrectionModal.tsx`, `src/components/DevOCRPanel.tsx`).
  - 20:11Z
    - Added `src/utils/patternRecognition.ts` with:
      - teammate co-occurrence matrix builder from match history (`buildCooccurrenceMatrix`),
      - ranked teammate suggestion scoring (`getTeammateSuggestions`),
      - top-pair summary helper for tooling (`getTopCooccurrencePairs`),
      - recency-decay weighting and deterministic bounded scoring.
  - 20:12Z
    - Added focused tests in `src/utils/__tests__/patternRecognition.test.ts` for:
      - repeated pair encounter accounting,
      - teammate suggestion ranking,
      - recency preference behavior.
  - 20:13Z
    - Wired OCR workflow/UI surfaces:
      - `src/components/OcrCorrectionModal.tsx`
        - computes suggestions from match co-occurrence data,
        - shows "Likely Teammates" panel with reason/likelihood/encounter info,
        - supports click-to-apply suggestion to unresolved OCR names.
      - `src/components/DevOCRPanel.tsx`
        - adds "Team Patterns" summary card with top co-occurrence pairs.
  - 20:15Z
    - Validation completed:
      - `npx eslint src/utils/patternRecognition.ts src/utils/__tests__/patternRecognition.test.ts src/components/OcrCorrectionModal.tsx src/components/DevOCRPanel.tsx` PASS.
      - `npx vitest run src/utils/__tests__/patternRecognition.test.ts src/components/OcrCorrectionModal.test.tsx` PASS (2 files, 5 tests).
      - `npm run -s typecheck` PASS.
      - targeted `rg` wiring verification PASS.

- `REQ-OCR-T3-020` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for Tier 3 #11 pattern-recognition increment.
- `REQ-OCR-T3-020` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/utils/patternRecognition.ts`
    - `src/utils/__tests__/patternRecognition.test.ts`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T3-020#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - added teammate co-occurrence/pattern utility and focused tests,
    - added OCR correction modal teammate suggestion panel with explicit click-to-apply behavior,
    - added Dev OCR pattern insight summary card for debugging/validation,
    - completed focused lint/tests/typecheck validation.
  - Evidence pointers:
    - `src/utils/patternRecognition.ts`
    - `src/utils/__tests__/patternRecognition.test.ts`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T3-020` Tier 3 #11 pattern-recognition increment.
- `PM Response` | `APPROVED`
  - Reason: pattern utility and suggestion UI are additive, deterministic, and validation evidence is complete.

- 20:13Z
  - Released `OCR-ENHANCEMENT-T3-020` temporary lock claims (`src/utils/patternRecognition.ts`, `src/utils/__tests__/patternRecognition.test.ts`) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T3-021
- Scope: continue OCR enhancement roadmap with Tier 3 #12 by shipping a bounded accessibility foundation + modal hardening increment.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T3-021` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: implement shared accessibility hooks/utilities/styles, harden targeted modals, and expose automated audit output in Dev OCR tools.
    - Evidence target:
      - `src/hooks/useFocusTrap.ts`
      - `src/hooks/useAriaLiveRegion.ts`
      - `src/styles/accessibility.css`
      - `src/utils/accessibilityAudit.ts`
      - `src/utils/__tests__/accessibilityAudit.test.ts`
      - `src/components/OcrCorrectionModal.tsx`
      - `src/components/BatchActionConfirmDialog.tsx`
      - `src/components/ReviewQueueModal.tsx`
      - `src/components/SettingsModal.tsx`
      - `src/components/RenameModal.tsx`
      - `src/components/ResetConfirmModal.tsx`
      - `src/components/EditMatchModal.tsx`
      - `src/components/DevOCRPanel.tsx`
      - `src/index.tsx`
  - `REQ-OCR-T3-021` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted Tier 3 #12 bounded scope and started intake/plan/lock updates.
  - `REQ-OCR-T3-021` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across accessibility foundation utilities and modal/Dev OCR UI integration.
- Work entries:
  - 20:26Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T3-021`.
    - Claimed temporary locks for new accessibility hook/style/utility/test files and targeted modal files not already lane-locked.
  - 20:31Z
    - Added shared accessibility foundations:
      - `src/hooks/useFocusTrap.ts` (reusable keyboard Tab focus containment + focus restore),
      - `src/hooks/useAriaLiveRegion.ts` (polite/assertive announcer utility),
      - `src/styles/accessibility.css` (sr-only helper + higher-contrast/forced-colors polish),
      - `src/utils/accessibilityAudit.ts` (DOM accessibility checks + summary helper),
      - `src/utils/__tests__/accessibilityAudit.test.ts` (focused utility coverage).
    - Imported shared accessibility stylesheet in `src/index.tsx`.
  - 20:34Z
    - Applied targeted modal accessibility hardening:
      - `src/components/OcrCorrectionModal.tsx`
        - added dialog semantics (`role=dialog`, `aria-modal`, label/description wiring),
        - integrated focus trap with nested batch-confirm guard,
        - integrated live-region feedback for ignore/batch/apply actions.
      - `src/components/BatchActionConfirmDialog.tsx`
        - added dialog semantics, focus trap, and Escape keyboard close.
      - `src/components/ReviewQueueModal.tsx`
        - added dialog semantics for both queue and source-preview dialogs,
        - added focus traps for primary/preview dialogs,
        - added Escape keyboard behavior and live-region action announcements.
      - `src/components/SettingsModal.tsx`
        - added dialog semantics, focus trap, and Escape keyboard close.
      - `src/components/RenameModal.tsx`, `src/components/ResetConfirmModal.tsx`, `src/components/EditMatchModal.tsx`
        - added dialog semantics, focus trap, and Escape keyboard close.
  - 20:36Z
    - Added Dev OCR tooling visibility for accessibility:
      - `src/components/DevOCRPanel.tsx`
        - added "Accessibility Audit" utility card,
        - runs `runA11yAudit(document)`,
        - shows error/warning summary and top issue list,
        - updates status line with audit outcomes.
  - 20:39Z
    - Validation completed:
      - `npx eslint src/hooks/useFocusTrap.ts src/hooks/useAriaLiveRegion.ts src/utils/accessibilityAudit.ts src/utils/__tests__/accessibilityAudit.test.ts src/components/OcrCorrectionModal.tsx src/components/BatchActionConfirmDialog.tsx src/components/ReviewQueueModal.tsx src/components/SettingsModal.tsx src/components/RenameModal.tsx src/components/ResetConfirmModal.tsx src/components/EditMatchModal.tsx src/components/DevOCRPanel.tsx src/index.tsx` PASS.
      - `npx vitest run src/utils/__tests__/accessibilityAudit.test.ts src/components/OcrCorrectionModal.test.tsx src/components/ReviewQueueModal.test.tsx` PASS (3 files, 10 tests).
      - `npm run -s typecheck` PASS.
      - targeted `rg` accessibility-wiring verification PASS.

- `REQ-OCR-T3-021` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for Tier 3 #12 accessibility foundation increment.
- `REQ-OCR-T3-021` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/hooks/useFocusTrap.ts`
    - `src/hooks/useAriaLiveRegion.ts`
    - `src/styles/accessibility.css`
    - `src/utils/accessibilityAudit.ts`
    - `src/utils/__tests__/accessibilityAudit.test.ts`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/BatchActionConfirmDialog.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/components/RenameModal.tsx`
    - `src/components/ResetConfirmModal.tsx`
    - `src/components/EditMatchModal.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `src/index.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T3-021#1/#2/#3/#4/#5/#6` | Owner: `builder`
  - Delta:
    - added reusable accessibility hooks, stylesheet, and automated audit utility with focused tests,
    - hardened targeted modal dialogs with ARIA semantics, focus trap handling, and Escape keyboard support,
    - added live-region announcements for OCR/review workflows,
    - added Dev OCR accessibility-audit action and issue summary/detail presentation,
    - completed focused lint/tests/typecheck validation.
  - Evidence pointers:
    - `src/hooks/useFocusTrap.ts`
    - `src/hooks/useAriaLiveRegion.ts`
    - `src/styles/accessibility.css`
    - `src/utils/accessibilityAudit.ts`
    - `src/utils/__tests__/accessibilityAudit.test.ts`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/BatchActionConfirmDialog.tsx`
    - `src/components/ReviewQueueModal.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/components/RenameModal.tsx`
    - `src/components/ResetConfirmModal.tsx`
    - `src/components/EditMatchModal.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `src/index.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T3-021` Tier 3 #12 accessibility foundation increment.
- `PM Response` | `APPROVED`
  - Reason: accessibility foundation, modal hardening, and audit visibility are additive, bounded, and validated.

- 20:41Z
  - Released `OCR-ENHANCEMENT-T3-021` temporary lock claims (`src/hooks/useFocusTrap.ts`, `src/hooks/useAriaLiveRegion.ts`, `src/styles/accessibility.css`, `src/utils/accessibilityAudit.ts`, `src/utils/__tests__/accessibilityAudit.test.ts`, `src/components/ReviewQueueModal.tsx`, `src/components/BatchActionConfirmDialog.tsx`, `src/components/SettingsModal.tsx`, `src/components/RenameModal.tsx`, `src/components/ResetConfirmModal.tsx`, `src/components/EditMatchModal.tsx`, `src/index.tsx`) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T3-022
- Scope: continue Tier 3 #12 by hardening `OCRReviewModal` accessibility (dialog semantics, focus management, keyboard handling) with focused regression coverage.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T3-022` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: implement bounded accessibility updates in OCR review modal and add focused tests.
    - Evidence target:
      - `src/components/ocr/OCRReviewModal.tsx`
      - `src/components/ocr/OCRReviewModal.test.tsx`
  - `REQ-OCR-T3-022` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted narrow modal-focused Tier 3 #12 continuation and started intake/plan/lock updates.
  - `REQ-OCR-T3-022` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active on OCR review modal semantics/focus/keyboard behavior and targeted test coverage.
- Work entries:
  - 20:47Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T3-022`.
    - Claimed temporary lock for `src/components/ocr/OCRReviewModal.test.tsx`.
    - Confirmed `src/components/ocr/OCRReviewModal.tsx` already has an existing active lane lock entry.
  - 20:50Z
    - Implemented OCR review modal accessibility hardening in `src/components/ocr/OCRReviewModal.tsx`:
      - added dialog semantics for the primary modal (`role="dialog"`, `aria-modal`, labelled/described wiring),
      - added focus traps for both primary review modal and screenshot lightbox modal states,
      - added keyboard shortcuts:
        - `Escape`: closes lightbox first, otherwise closes modal,
        - `Ctrl/Cmd+Enter`: applies reviewed data when lightbox is closed,
      - added live-region announcements for lightbox open/close actions,
      - added missing aria labels and `type="button"` on lightbox icon controls.
  - 20:52Z
    - Added focused modal regression tests in `src/components/ocr/OCRReviewModal.test.tsx`:
      - verifies dialog semantics are present and Escape closes modal,
      - verifies Escape closes screenshot lightbox before modal cancel flow.
  - 20:54Z
    - Validation completed:
      - `npx eslint src/components/ocr/OCRReviewModal.tsx src/components/ocr/OCRReviewModal.test.tsx` PASS.
      - `npx vitest run src/components/ocr/OCRReviewModal.test.tsx src/components/OcrCorrectionModal.test.tsx src/components/ReviewQueueModal.test.tsx` PASS (3 files, 9 tests).
      - `npm run -s typecheck` PASS.

- `REQ-OCR-T3-022` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for OCR review modal accessibility increment.
- `REQ-OCR-T3-022` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/components/ocr/OCRReviewModal.test.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T3-022#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - hardened OCR review modal and screenshot lightbox with dialog ARIA semantics and focus trapping,
    - added keyboard behavior for Escape and Ctrl/Cmd+Enter in OCR review flow,
    - added focused modal accessibility regression tests,
    - completed focused lint/tests/typecheck validation.
  - Evidence pointers:
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/components/ocr/OCRReviewModal.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T3-022` Tier 3 #12 OCRReviewModal accessibility increment.
- `PM Response` | `APPROVED`
  - Reason: bounded OCRReviewModal accessibility pass is additive, validated, and aligns with staged Tier 3 #12 rollout.

- 20:57Z
  - Released `OCR-ENHANCEMENT-T3-022` temporary lock claim (`src/components/ocr/OCRReviewModal.test.tsx`) and recorded release row in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T3-023
- Scope: continue Tier 3 #12 with a bounded accessibility pass for remaining high-use overlays (`DrillDownOverlay`, App changelog modal, App ID mapper wrapper).
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T3-023` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: add dialog semantics, focus trapping, and Escape behavior for targeted overlays and add focused tests.
    - Evidence target:
      - `src/components/DrillDownOverlay.tsx`
      - `src/App.tsx`
      - `src/components/DrillDownOverlay.test.tsx`
      - `src/App.test.tsx`
  - `REQ-OCR-T3-023` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted narrow overlay-focused scope and started intake/plan/lock updates.
  - `REQ-OCR-T3-023` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across overlay semantics/focus keyboard behavior and focused regression coverage.
- Work entries:
  - 20:48Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T3-023`.
    - Claimed temporary locks for:
      - `src/components/DrillDownOverlay.tsx`
      - `src/components/DrillDownOverlay.test.tsx`
      - `src/App.tsx`
      - `src/App.test.tsx`
    - Scope/intent confirmed as bounded overlay accessibility pass only (no OCR/store schema changes).
  - 20:51Z
    - Implemented overlay accessibility hardening:
      - `src/components/DrillDownOverlay.tsx`
        - added dialog semantics, focus trap, and Escape keyboard close.
      - `src/App.tsx`
        - added focus trap and dialog semantics for changelog + ID mapper wrappers.
        - added shared Escape-close behavior for these overlays.
  - 20:53Z
    - Added focused tests:
      - created `src/components/DrillDownOverlay.test.tsx` (dialog semantics + Escape close),
      - updated `src/App.test.tsx` with changelog/ID mapper dialog + Escape assertions.
  - 20:55Z
    - Validation completed:
      - `npx eslint src/components/DrillDownOverlay.tsx src/components/DrillDownOverlay.test.tsx src/App.tsx src/App.test.tsx` PASS.
      - `npx vitest run src/components/DrillDownOverlay.test.tsx src/App.test.tsx src/components/ocr/OCRReviewModal.test.tsx` PASS (3 files, 8 tests).
      - `npm run -s typecheck` PASS.
      - targeted `rg` overlay-accessibility wiring verification PASS.

- `REQ-OCR-T3-023` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for overlay accessibility increment.
- `REQ-OCR-T3-023` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/components/DrillDownOverlay.tsx`
    - `src/App.tsx`
    - `src/components/DrillDownOverlay.test.tsx`
    - `src/App.test.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T3-023#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - hardened drill-down/changelog/id-mapper overlays with dialog semantics and focus containment,
    - added Escape-close keyboard behavior for targeted overlays,
    - added focused test coverage for drill-down and App overlay dialogs,
    - completed focused lint/tests/typecheck validation.
  - Evidence pointers:
    - `src/components/DrillDownOverlay.tsx`
    - `src/App.tsx`
    - `src/components/DrillDownOverlay.test.tsx`
    - `src/App.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T3-023` bounded Tier 3 #12 overlay accessibility increment.
- `PM Response` | `APPROVED`
  - Reason: scope remained bounded, semantics/focus/keyboard behavior are additive, and focused validation evidence is complete.

- 20:52Z
  - Released `OCR-ENHANCEMENT-T3-023` temporary lock claims (`src/components/DrillDownOverlay.tsx`, `src/components/DrillDownOverlay.test.tsx`, `src/App.tsx`, `src/App.test.tsx`) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T3-024
- Scope: continue Tier 3 #12 with a bounded accessibility pass for `Tutorial` overlay and `MatchRecordingPage` screenshot lightbox.
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T3-024` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: add dialog semantics, focus trapping, and keyboard behavior for tutorial + match-detail lightbox with focused tests.
    - Evidence target:
      - `src/components/Tutorial.tsx`
      - `src/components/MatchRecordingPage.tsx`
      - `src/components/Tutorial.test.tsx`
      - `src/components/MatchRecordingPage.test.tsx`
  - `REQ-OCR-T3-024` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted narrow scope and started intake/plan/lock updates.
  - `REQ-OCR-T3-024` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across tutorial/lightbox overlay accessibility hardening and focused regression coverage.
- Work entries:
  - 21:26Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T3-024`.
    - Claimed temporary locks for:
      - `src/components/Tutorial.tsx`
      - `src/components/MatchRecordingPage.tsx`
      - `src/components/Tutorial.test.tsx`
      - `src/components/MatchRecordingPage.test.tsx`
    - Scope bounded to tutorial + match-detail lightbox only (Smart Captures deferred).
  - 21:28Z
    - Implemented accessibility hardening:
      - `src/components/Tutorial.tsx`
        - added dialog semantics (`role="dialog"`, `aria-modal`, labels/descriptions),
        - added focus trap wiring,
        - migrated keyboard behavior to shared shortcut hook while preserving Escape/arrow behavior,
        - added explicit `type="button"` for tutorial controls.
      - `src/components/MatchRecordingPage.tsx`
        - added screenshot lightbox dialog semantics and focus trap,
        - added Escape close behavior while lightbox is open,
        - added explicit open/close aria-labels for screenshot preview controls.
  - 21:29Z
    - Added focused tests:
      - `src/components/Tutorial.test.tsx` (dialog semantics + Escape close),
      - `src/components/MatchRecordingPage.test.tsx` (lightbox dialog semantics + Escape close).
  - 21:30Z
    - Validation completed:
      - `npx eslint src/components/Tutorial.tsx src/components/MatchRecordingPage.tsx src/components/Tutorial.test.tsx src/components/MatchRecordingPage.test.tsx` PASS.
      - `npx vitest run src/components/Tutorial.test.tsx src/components/MatchRecordingPage.test.tsx src/components/DrillDownOverlay.test.tsx src/App.test.tsx` PASS (4 files, 9 tests).
      - `npm run -s typecheck` PASS.
      - targeted `rg` accessibility-wiring verification PASS.

- `REQ-OCR-T3-024` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared in `docs/agents/03_VALIDATION.md` for tutorial/lightbox accessibility increment.
- `REQ-OCR-T3-024` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/components/Tutorial.tsx`
    - `src/components/MatchRecordingPage.tsx`
    - `src/components/Tutorial.test.tsx`
    - `src/components/MatchRecordingPage.test.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T3-024#1/#2/#3/#4/#5` | Owner: `builder`
  - Delta:
    - hardened tutorial overlay and match screenshot lightbox with dialog semantics and focus containment,
    - added Escape-close keyboard behavior for match screenshot lightbox while preserving tutorial shortcut flow,
    - added focused regression tests for tutorial and match lightbox overlays,
    - completed focused lint/tests/typecheck validation.
  - Evidence pointers:
    - `src/components/Tutorial.tsx`
    - `src/components/MatchRecordingPage.tsx`
    - `src/components/Tutorial.test.tsx`
    - `src/components/MatchRecordingPage.test.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T3-024` bounded Tier 3 #12 tutorial/lightbox increment.
- `PM Response` | `APPROVED`
  - Reason: scope stayed bounded, behavior is additive, and focused validation evidence is complete.

- 21:30Z
  - Released `OCR-ENHANCEMENT-T3-024` temporary lock claims (`src/components/Tutorial.tsx`, `src/components/MatchRecordingPage.tsx`, `src/components/Tutorial.test.tsx`, `src/components/MatchRecordingPage.test.tsx`) and recorded release rows in `docs/WORKLOCKS.md`.

---

## 2026-02-17 - OCR-ENHANCEMENT-T3-025
- Scope: add full-resolution visual ROI crop-box editor (draw/drag/resize) and resolve requested UI regressions (players panel height fill, Dev Utilities clipping, OCR modal top cutoff, OCR correction input typing/cursor behavior).
- Dependency requests (AOM_V2 lifecycle):
  - `REQ-OCR-T3-025` | Sender: `debugger` | Receiver: `builder` | Status: `OPEN`
    - Request: implement bounded UI/editor fixes across Settings/Players/Dev OCR/OCR modal surfaces with focused validation.
    - Evidence target:
      - `src/components/OcrRegionEditorModal.tsx`
      - `src/components/SettingsModal.tsx`
      - `src/components/PlayerHub.tsx`
      - `src/components/DevOCRPanel.tsx`
      - `src/components/OcrCorrectionModal.tsx`
      - `src/components/ocr/OCRReviewModal.tsx`
  - `REQ-OCR-T3-025` | Sender: `debugger` | Receiver: `builder` | Status: `ACK`
    - Response: accepted bounded user-reported UX regression scope and started intake/plan/lock updates.
  - `REQ-OCR-T3-025` | Sender: `debugger` | Receiver: `builder` | Status: `IN_PROGRESS`
    - Workstream active across ROI editor implementation and targeted layout/input fixes.
- Work entries:
  - 22:08Z
    - Added intake + plan entries for `OCR-ENHANCEMENT-T3-025`.
    - Started lock-claim + context inspection for targeted files:
      - `src/components/SettingsModal.tsx`
      - `src/components/PlayerHub.tsx`
      - `src/components/DevOCRPanel.tsx`
      - `src/components/OcrCorrectionModal.tsx`
      - `src/components/ocr/OCRReviewModal.tsx`
      - `src/components/OcrRegionEditorModal.tsx` (new)
  - 22:22Z
    - Implemented new visual ROI editor modal:
      - added `src/components/OcrRegionEditorModal.tsx` with full-resolution image canvas editing,
      - supports region selection, draw-on-canvas, drag move, and resize handles,
      - supports per-screen reset + selected-region reset + apply/cancel flow,
      - keeps image canvas native-size to preserve exact OCR coordinate mapping.
  - 22:24Z
    - Wired visual ROI editor into `src/components/SettingsModal.tsx`:
      - added `Visual Editor` launch action in ROI section,
      - added apply handler to persist edited ROI data back into store `ocrRegions`,
      - closes editor when settings modal closes.
  - 22:25Z
    - Applied layout regression fix for Players view vertical fill:
      - `src/components/PlayerHub.tsx` shell/root and detail column now enforce `min-h-0`/`h-full` semantics,
      - `src/App.tsx` players view wrapper now includes `min-h-0`.
  - 22:26Z
    - Applied Dev OCR Utilities overflow/cutoff fix in `src/components/DevOCRPanel.tsx`:
      - removed center-lock root alignment causing clipped content,
      - made utilities panel a bounded `h-full` container with internal scroll region.
  - 22:28Z
    - Applied OCR modal visibility/input fixes:
      - `src/components/OcrCorrectionModal.tsx`
        - top cutoff mitigation (`items-start` + overlay scroll),
        - correction input focus tracking (`activeInputPlayer`),
        - shortcut suppression while typing,
        - autocomplete dropdown stability via focused-input gating.
      - `src/components/ocr/OCRReviewModal.tsx`
        - top cutoff mitigation (`items-start` + overlay scroll).
      - `src/components/Wizard.tsx`
        - top cutoff mitigation for wizard shell in full mode.

  - 22:31Z
    - Validation completed:
      - `npx eslint src/components/OcrRegionEditorModal.tsx src/components/SettingsModal.tsx src/components/PlayerHub.tsx src/components/DevOCRPanel.tsx src/components/OcrCorrectionModal.tsx src/components/ocr/OCRReviewModal.tsx src/components/Wizard.tsx src/App.tsx` PASS.
      - `npm run -s typecheck` PASS.
      - `npx vitest run src/components/OcrCorrectionModal.test.tsx src/components/ocr/OCRReviewModal.test.tsx` BLOCKED in this environment (`spawn EPERM` during vitest/vite config startup). Re-run unchanged command in a local shell with normal process-spawn permissions.

- `REQ-OCR-T3-025` | Sender: `debugger` | Receiver: `builder` | Status: `READY_FOR_REVIEW`
  - Evidence prepared for ROI editor + requested UI regression fixes with focused lint/typecheck.
- `REQ-OCR-T3-025` | Sender: `debugger` | Receiver: `builder` | Status: `CLOSED`
  - Evidence pointer:
    - `src/components/OcrRegionEditorModal.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/components/PlayerHub.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/components/Wizard.tsx`
    - `src/App.tsx`
    - `docs/agents/03_VALIDATION.md`

## PM Feedback Cycle
- `PM-FEEDBACK-REQ` | Step: `OCR-ENHANCEMENT-T3-025#1/#2/#3/#4/#5/#6/#7` | Owner: `builder`
  - Delta:
    - added full-resolution visual ROI editor with draw/drag/resize interactions and settings wiring,
    - fixed players panel height fill and Dev Utilities clipping,
    - fixed OCR modal top clipping and OCR correction input typing/focus stability,
    - completed focused lint/typecheck validation; targeted vitest blocked by environment `spawn EPERM`.
  - Evidence pointers:
    - `src/components/OcrRegionEditorModal.tsx`
    - `src/components/SettingsModal.tsx`
    - `src/components/PlayerHub.tsx`
    - `src/components/DevOCRPanel.tsx`
    - `src/components/OcrCorrectionModal.tsx`
    - `src/components/ocr/OCRReviewModal.tsx`
    - `src/components/Wizard.tsx`
    - `src/App.tsx`
    - `docs/agents/03_VALIDATION.md`
  - Review ask: approve closure of `OCR-ENHANCEMENT-T3-025` with vitest spawn blocker documented.
- `PM Response` | `APPROVED`
  - Reason: requested UX fixes are implemented and validated with lint/typecheck; vitest environment blocker documented for local follow-up.
- 22:36Z
  - Released `OCR-ENHANCEMENT-T3-025` temporary lock claims (`src/components/OcrRegionEditorModal.tsx`, `src/components/SettingsModal.tsx`, `src/components/PlayerHub.tsx`, `src/components/DevOCRPanel.tsx`, `src/components/OcrCorrectionModal.tsx`, `src/components/ocr/OCRReviewModal.tsx`, `src/components/Wizard.tsx`, `src/App.tsx`) and recorded release rows in `docs/WORKLOCKS.md`.
