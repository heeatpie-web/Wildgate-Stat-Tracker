# Checkpoint — 11-defect fix pass

Companion to `2026-07-29-eleven-defect-rootcause-report.md`.
**All 11 defects are implemented. Typecheck is clean (exit 0) across 51 changed files.**
The one outstanding gap is test *execution*, not test *authorship* — see "Before you ship".

## Status

| § | Defect | State |
|---|---|---|
| 1 | Maps read as ship names | **Done.** `MAP_TYPES`/`KNOWN_MAP_NAMES`/`isKnownMapName` (`constants.ts:128-166`); third `isMapName` bucket via `classifyTacticalOcrLine` (`tacticalScan.ts:17-24,119-125`); `SmartScanResult.mapType` (`scan/types.ts:72`) threaded in `localScan.ts:119,163`; `resolveTeamNameCandidate` guard (`lobbyScan.ts:19-34,234`); `looksLikeMapEntity` (`IdMapper.tsx:80-101`). **10/10 tests pass.** |
| 2 | Merge / OCR-confirm slowness | **Done.** New batched `applyOcrCorrections` (`createMappingSlice.ts:1022-1113`, modelled on `recordPlayerSightings`) — N corrections now commit in **one** `set()` instead of 3N. Redundant `recordOcrCorrection` dropped (it double-counted alias weight). `useDeferredValue` on the 5 identity inputs (`useAnalyticsData.ts:298-334`). **59/59 tests pass.** |
| 3 | OCR progress bar not real | **Done.** `onStage` wired into `rerun-ocr-on-artifact` (`electron/main.cjs:2170-2173`); `batchOcrProgressRef` + monotonic-guarded listener in `useSmartCapture.ts`; `ActionPanel.tsx:449-462` now blends `imageFraction` into `processingPercent`. Degrades to old whole-image counting if no stage events arrive. |
| 4 | Seeds tab design | **Done.** All six deviations fixed. Dead `text-title-lg` → `text-title`; `mg-surface-high` chrome; semantic `success`/`danger`/`warning`/`info` tokens; `focus-visible` + labelled search input; `aria-pressed`; spinner loading state. `grep "amber-\|green-5\|red-5\|title-lg"` returns nothing. |
| 5 | Categories + Analytics | **Done.** `getMatchCategoryKey` case-folds the *grouping* key while `normalizeMatchCategory` preserves display casing. Draft reset added to `resetMatchTrackingForNewMatch` and `discardMatch` (`createFormSlice.ts:397,452`) — all 6 `clearSubmissionState` call sites route through these. Category field + datalist added to `EditMatchModal`. Full Analytics dimension wired (`types.ts`, `patchEntityCatalog.ts`, `useAnalyticsData.ts`, `AnalyticsShell.tsx`, `EntityAnalyticsView.tsx`). `DrillDownTarget['type']` **was** missing `'Category'` — added. **57/57 tests pass.** |
| 6 | Popup timeout | **Done.** `shipKillPopupAutoDismissMs`, default 30s, range 10–120s, `0` = never. All four persistence points wired. `adjust()` now **restarts** the timer instead of permanently cancelling it (`ShipKillPopup.tsx:37-49`). |
| 7 | Volume | **Done.** `soundVolume` 0–100. Single choke point scaled at `useSoundEffects.ts:50`; dep array fixed at `:76`. Zero call-site changes. |
| 8 | Telemetry 1/3 | **Done, least verified.** Signal 3 no longer folds in the trivially-true `isMatchInProgress` — now `telemetryActivity === 'receiving'` (`SquadronPanel.tsx:28-40`), so a dead feed correctly reads 0/3. `missingTelemetrySignals` added to the tooltip. `useLogMonitor.ts` +102 lines: four-gate instrumentation and the stale `localTelemetryShipSelectionRef` suppression fix. |
| 9 | INTEL tab (3 defects) | **Done.** One canonicalisation boundary in `RecordingView.tsx:9-51,132-141,235-242` (memoised `buildAnalyticsIdentityResolver`, canonicalises matches + draft) closes squad-history and alias-splitting together; `engine.ts` stayed pure. Ships/maps rejected as team identity (`ocrParser.ts:88-112`, `useSmartCapture.ts:801-812`). Threat copy now names the top-pressure *player*, ship fallback preserved (`engine.ts:186-273,437-445`). **108/108 tests pass.** |

## Before you ship

1. **Run the jsdom suites.** The sandbox caps bash at 45s and kills background processes between calls, so no jsdom test could be executed all session. Every pure-logic suite that *could* run passed (234 tests total). Untested-by-execution, though written and statically reviewed:
   `PregameAdvicePanel.test.tsx`, `RecordingView.test.tsx`, `OcrCorrectionModal.test.tsx`, `useAnalyticsData.test.tsx`, `EntityAnalyticsView.test.tsx`, `EditMatchModal.test.tsx`, `SeedsPanel.test.tsx`, `IdMapper.test.tsx`, `SquadronPanel.test.tsx`.
   Just run `npm run ci:quality`.

2. **§8 telemetry was the one item the report advised not to fix blind, and its agent was cut off while writing tests.** The counter-semantics fix is safe and self-evidently correct. The `useLogMonitor.ts` suppression change and gate instrumentation deserve a careful read plus one live match before you trust them — `useLogMonitor` is central to live capture, and a regression there breaks match recording. Consider running with telemetry debug on for one session; the new gate tracing will tell you exactly which of the four gates was failing, which is the thing static analysis couldn't determine.

3. **Resolve the CRLF churn before releasing.** The tree shows ~349 modified files but `git diff --ignore-all-space` is empty for all but the 51 real ones. `scripts/release.cjs` validates a clean tree and will refuse. A `.gitattributes` with `* text=auto eol=lf` (or committing the normalisation separately, *before* these fixes) keeps the real diff reviewable.

4. **Review the deliberate behaviour change in §2**: each corrected name's alias entry now accumulates once per confirm instead of twice. This is the bug fix, but it slightly changes alias-model weighting going forward — existing learned weights are unaffected.

## Environment gotchas (cost several hours this session)

- **`--reporter=basic` does not exist in vitest 4.0.18.** It fails with `ERR_LOAD_URL` and looks exactly like a hang. Three agents lost time to this. Use the default reporter.
- The bash sandbox hard-caps at 45s/call and does **not** persist background processes — `nohup`/`setsid`/`disown` all get killed when the call returns.
- Node-env tests take ~20s; jsdom exceeds the ceiling. Put real assertions in node-env suites where possible.
- **Do not use `sed`/`perl` for in-place edits here.** The repo has mixed CRLF/LF; one agent duplicated every line of `useSmartCapture.ts` that way. It was fully recovered (verified: 9% blank lines, zero duplicate consecutive lines, 57-line diff), but use the Edit tool.
