# IPC Handler Catalog

Complete reference for all Electron IPC channels. Renderer access is via `window.electronAPI` (exposed by `preload.cjs`).

## Channel Types

| Type | Method | Direction | Description |
|------|--------|-----------|-------------|
| **invoke** | `electronAPI.invoke(channel, ...args)` | Renderer → Main → Renderer | Two-way request/response |
| **send** | `electronAPI.send(channel, ...args)` | Renderer → Main | One-way fire-and-forget |
| **on** | `electronAPI.on(channel, callback)` | Main → Renderer | Event subscription (returns unsubscribe fn) |

---

## Invoke Handlers (Two-Way)

### Database

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `db-read` | — | `object \| null` | Read entire database JSON from disk |
| `db-write` | `data: object` | `{ success: boolean }` | Write database JSON to disk (atomic via temp file) |
| `db-backup` | — | `{ success, path?, error? }` | Backup database to Documents folder |

### OCR & Capture

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `capture-screen` | — | `string` (base64) | Capture full screen screenshot |
| `capture-game-window` | — | `string` (base64) | Capture game window screenshot |
| `ocr-process-capture` | `{ imageBase64, activeUser, matchId?, ocrMode? }` | `{ success, data?, error? }` | Full OCR pipeline (detect screen type → extract → return structured data) |
| `ocr-scan` | `imagePath: string` | `string` (raw text) | Low-level Tesseract OCR on a file path |
| `ml-scan` | — | `{ detections: [] }` | ML scan stub (returns empty) |
| `gcloud-ocr-scan` | `imagePath: string` | `{ text, confidence }` | Google Cloud Vision OCR on a file |
| `save-ocr-debug` | `{ imageBase64, filename }` | `{ success, path? }` | Save image to `ocr-debug/` directory |
| `save-screenshot` | `{ imageBase64, matchId }` | `{ success, path?, error? }` | Save screenshot to `screenshots/` directory |
| `rerun-ocr-on-artifact` | `{ imagePath, activeUser, ocrMode }` | `{ success, data?, error? }` | Re-run OCR on an existing artifact file (skips cloud upload) |
| `sync-training-sample` | `sampleId: string` | `{ success, error? }` | Upload OCR training sample to GCloud Storage |

### Artifacts

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `bundle-artifacts` | `{ matchId, startTime, endTime }` | `string[]` (paths) | Copy time-matching screenshots + telemetry to `match_artifacts/<matchId>/` |
| `get-match-artifacts` | `matchId: number` | `{ images: string[], imageFiles: ArtifactFile[], telemetry: any[] }` | List all artifacts for a match |
| `remove-match-artifact` | `{ matchId, filename }` | `{ success, error? }` | Delete a specific artifact file |
| `add-match-artifact` | `{ matchId }` | `{ success, added?: string[], canceled?, error? }` | Open file picker to add artifacts manually |

### Telemetry

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `load-archived-telemetry` | — | `any[]` (events) | Load all archived telemetry events |
| `decode-telemetry-cache` | — | `{ events: any[], error? }` | Decode binary telemetry cache from Nebula game logs |
| `list-telemetry-archives` | — | `{ files: { name, size, modified }[] }` | List archive files in `telemetry_archive/` |
| `load-telemetry-archive-file` | `filename: string` | `any[]` (events) | Load a specific archive file |
| `clear-telemetry-archives` | — | `{ success, count }` | Delete all telemetry archive files |

### Utility

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `read-file-base64` | `filePath: string` | `string \| null` (base64) | Read any file as base64 (used by `LocalImage`) |
| `open-path` | `targetPath: string` | `{ success }` | Open a file/folder in the OS file manager |
| `persist-logs` | `logContent: string` | `{ success }` | Append log content to `app_logs.txt` |
| `scan-epic-ids` | — | `{ ids: object[] }` | Scan telemetry cache for Epic account IDs |
| `get-gcloud-status` | — | `{ visionReady, storageReady }` | Check GCloud service initialization status |
| `test-gcloud-upload` | — | `{ success, error? }` | Test GCloud Storage bucket access |
| `get-ocr-debug-dir` | — | `string` (path) | Get path to `ocr-debug/` directory |
| `list-ocr-debug-files` | — | `string[]` | List files in `ocr-debug/` |
| `clear-ocr-preprocessed` | — | `{ success }` | Clear OCR preprocessed cache |

---

## Send Channels (One-Way, Renderer → Main)

| Channel | Args | Description |
|---------|------|-------------|
| `start-log-monitoring` | — | Start polling Nebula game log for telemetry |
| `stop-log-monitoring` | — | Stop log polling |
| `minimize-window` | — | Minimize the app window |
| `maximize-window` | — | Toggle maximize/restore |
| `close-window` | — | Close the app window |
| `check-for-updates` | — | Trigger auto-updater check |
| `restart_app` | — | Quit and install pending update |
| `update-presence` | `stats: object` | Update Discord Rich Presence |
| `set-ignore-mouse-events` | `ignore: boolean, options?` | Toggle click-through for overlay mode |
| `toggle-overlay` | `isOverlay: boolean` | Switch between normal and overlay window mode |
| `set-overlay-style` | `style: string` | Set overlay transparency style |
| `set-window-bounds` | `bounds: { x, y, width, height }` | Set window position and size |

---

## Receive Channels (Main → Renderer)

| Channel | Payload | Description |
|---------|---------|-------------|
| `log-status` | `string` | Log monitoring status updates |
| `log-data` | `object` | Live telemetry data from game log |
| `window-maximized-changed` | `boolean` | Window maximize state changed |
| `update_available` | `info` | App update available |
| `update_downloaded` | `info` | App update downloaded and ready |
| `hotkey-toggle-overlay` | — | Global hotkey (F9) pressed |

---

## Preload Allowlists

Channels not in the allowlists are **blocked** by the preload bridge. To add a new IPC channel:

1. Add the handler in `electron/main.cjs`
2. Add the channel name to the appropriate array in `electron/preload.cjs`:
   - `INVOKE_CHANNELS` for two-way handlers
   - `SEND_CHANNELS` for one-way sends
   - `RECEIVE_CHANNELS` for main → renderer events
