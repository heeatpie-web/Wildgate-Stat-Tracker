# Changelog

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
