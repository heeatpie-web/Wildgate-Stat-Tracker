# Changelog

## [3.3.3] - 2026-03-17

### Changed
- Release metadata, bundled changelog content, and installer outputs now report version `3.3.3`

### Fixed
- Smart Captures Analyze and Re-analyze now hydrate a populated wizard draft instead of stopping at an empty review state
- The simulator panel now uses the current telemetry action/context contract so analysis can complete cleanly

## [3.3.2] - 2026-03-17

### Changed
- Release metadata, bundled changelog content, and installer outputs now report version `3.3.2`

### Fixed
- Prospectors, ships, weapons, equipment, and perks UID mappings are now bundled as installer resources and resolved from packaged app resources so fresh installs and silent installs seed known IDs reliably

## [3.3.1] - 2026-03-15

### Changed
- Settings were restructured around `SegmentedControl`, `OptionCycler`, and `SettingRow` patterns so appearance, overlay, capture, telemetry, and OCR review controls are faster to scan and adjust
- Match-result submission now keeps a persistent sticky footer with always-visible `Submit Results` / `Save Results Only` actions plus inline completion reminders

### Fixed
- Auto-capture now defaults to the faster `0.5` pacing and trims the longest tactical-map and crew-hub delays during push-to-show and F10 auto-sequence flows
- Telemetry now treats practice-range queue/start as a real lifecycle, resolves nested prospector/ship payload variants from `NebCloudSaveRecordSize`, `NebLoadoutSaved`, and `CharacterLoadoutChanged`, and finalizes practice drafts cleanly on explicit session end
- Manual Stop Match now clears the active unresolved ongoing draft even when it came from telemetry or recovered state instead of the current timer button press
- Artifact cleanup and telemetry parsing were hardened so draft deletion, screenshot cleanup, and loadout updates stay aligned during capture/review flows

## [3.1.10] - 2026-03-12

### Added
- Pause Tracking control in the timer panel to temporarily disable automatic telemetry match start/end detection without closing the app

### Fixed
- Friendly team assignment chip now shows only the shield icon (no extra Friendly text)
- Friendly teammate capping now drops placeholder names like Unknown Player / N/A / ?
- Battle Scout is now treated as a 4-player ship for teammate-cap calculations

## [3.1.9] - 2026-03-12

### Fixed
- Telemetry match-start prompts can now launch Smart Capture directly and route you back to Recording when capture starts from another view
- Queued OCR processing now shows live progress and status feedback in the blocking review prompt instead of a static waiting state
- Inactive recording and dashboard views now pause their listeners and work so Smart Capture, OCR follow-up, and result routing stay scoped to the active surface

## [3.1.6] - 2026-03-11

### Fixed
- Saving OCR review from the match-result wizard now returns to the result flow instead of closing back to Recording with the reviewed hostile roster still visible
- Final save and submission cleanup now clears teammate, hostile, and team-ship session state so reviewed OCR roster context does not bleed into the next recording

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
