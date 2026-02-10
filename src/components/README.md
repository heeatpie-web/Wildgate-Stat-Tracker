# `src/components/` Map

Feature UI components and modal workflows.

## High-Impact Files

- `DashboardLayout.tsx`: main shell/grid
- `RecordingView.tsx`: active match recording UI
- `MatchRecordingPage.tsx`: match CRUD page
- `HistoryTable.tsx`: history list + JPG export
- `SmartCapturesPanel.tsx`: screenshot artifacts + OCR reruns
- `SettingsModal.tsx`: preferences + cloud status
- `DevOCRPanel.tsx`: OCR debug tooling
- `TelemetryPanel.tsx`: live telemetry stream

## Subfolders

- `analytics/`: analytics views and cards
- `ocr/`: OCR review-specific UI
- `recording/`: recording-page sections

## Notes

- Local filesystem images should render via `LocalImage.tsx` (IPC-backed), not `file://`.
- Complex behavior usually lives in hooks/providers; components should stay presentation-first.

