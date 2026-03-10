# Changelog

## [3.1.5] - 2026-03-10

### Fixed
- Notifications now stay in the notification inbox by default instead of popping separately across the app
- Telemetry match start, smart-capture reminder, and match-ready/result prompts now appear as centered dialogs above the current view for a consistent workflow
- Smart Captures OCR review now restores recording-panel enemies, team ship assignments, and match time more reliably after reviewing historical matches

## [3.1.4] - 2026-03-09

### Added
- Smooth window show/hide animations — F9 hotkey, tray toggle, and double-click now fade the window in/out with an ease-out cubic curve (140ms) instead of instant show/hide
- Pipe-spacer player name support (`| |`) — OCR now correctly recognises and preserves blank-slot entries that appear as pipe characters in crew hub and tactical scan
- `normalizePipeSpacerPlayerName` / `isPipeSpacerPlayerName` exported from `stringUtils` and applied across crew hub extractor, tactical scan normaliser, and OCR correction modal
- `normalizeTacticalPlayerName` utility in `tacticalScan.ts` that handles pipe-spacer names and filters symbol-only / too-short OCR fragments
- `playCapture` sound effect (two-tone triangle wave at C6/G5) added to `useSoundEffects`; smart capture scans now play the capture tone on each successful screenshot
- `getRosterCandidatePruneIdsForAcceptedName` helper in `pendingReviewUtils` for pruning duplicate pending-review candidates when a name is accepted into the roster
- Session exit-state tracking (`wg_session_exit_state_v1`): app writes `running` on mount and `clean` on graceful exit; on next launch, session snapshot restore is skipped when the previous session ended cleanly
- Telemetry draft discard flow in the Wizard — "Discard match" button deletes the draft and its screenshots, dispatches `telemetry-draft:resolved` and `smart-capture:artifacts-consumed` events, and clears all submission state
- `UNDERCREW_SHIP_BONUS_PHRASES` Set constant in `crewHubExtractor.cjs` (was missing, causing a `ReferenceError` when `containsUnderCrewBonusPhrase` ran)

### Fixed
- `containsUnderCrewBonusPhrase` threw `ReferenceError: UNDERCREW_SHIP_BONUS_PHRASES is not defined` — the refactor that replaced the inline OR-chain with `Set.has()` forgot to declare the Set
- Player Hub social-data calculations no longer depend on the now-removed `calculateSocialData` import; encounter stats are derived inline from match history per pilot

### Changed
- `clearSubmissionState` in `useMatchSubmission` consolidated into a single memoised callback that resets all wizard fields atomically, including `activeWeapons`, `currentLoadout`, and timeline events
- `PlayerHub` OCR alias panel now groups learned corrections by normalised target name and supports inline removal via `removeOcrAliasCorrection`
- Expanded `UI_NOISE_PHRASES` and `NOISE_WORDS` in `crewHubExtractor.cjs` to cover additional spelling variants of crew-bonus UI strings (`SMALLCREWBONUS`, `REDUCED FIRED`, `REDUCEDFIRED`, etc.)
- Storage flush in non-Electron environments now also listens to `pagehide` and `visibilitychange` (hidden) events in addition to `beforeunload`

## [3.1.3] - 2026-03-08

### Added
- OCR name confidence tracking — per-player confidence scores are now captured from OCR extraction and stored in match debug data, with source attribution (`direct_ocr`, `region_ocr`, `cloud_inferred`, `legacy_default`)
- `OcrNameConfidenceMap` type and builder utilities (`buildOcrNameConfidenceMapFromExtractedData`, `buildOcrNameSourceMap`) for deriving structured confidence data from raw OCR results
- Roster suggestion system in SmartCapturesPanel using fuzzy name similarity (`getBestRosterSuggestion`) to auto-correct OCR-detected names against the known pilot registry
- OcrCorrectionModal: re-run OCR button, embedded footer action delegation props, and per-player confidence display
- OcrTeamAssignmentBoard component for drag-and-drop team assignment in the OCR review flow
- `resetMatchTrackingForNewMatch` / `resetMatchMetricsForNewMatch` store actions hooked into the Start Match button in ActionPanel for clean per-match state

### Fixed
- `setActiveWeapons` called with correct `(weapons, false)` signature on submission reset — previously the second argument was omitted, causing a type mismatch
- `setCurrentLoadout(null)` now properly resets loadout state after match submission and result draft save
- Confidence scores from non-direct sources (cloud-inferred or legacy defaults) are excluded when computing the displayed OCR confidence for a player name

### Changed
- SmartCapturesPanel now propagates `nameConfidence` into pending draft `ocrDebug` when processing combined or incremental OCR results
- `OcrDebug` type extended with `nameConfidence?: Record<string, number>` field
- ActionPanel start-match flow consolidated into a single `startFreshMatch` callback that resets both tracking and metrics slices atomically

## [3.1.2] - 2026-03-07

### Fixed
- Smart capture OCR artifact review flow

## [3.1.1] - 2026-03-07

### Added
- Drag-to-reorder screenshots in Smart Capture detail view

### Fixed
- Prevent screenshot flash when editing player fields in match detail
- Add "as alias" option to OCR work panel merge suggestions
- Cap artifact bundling window to prevent screenshots from adjacent matches bleeding in
