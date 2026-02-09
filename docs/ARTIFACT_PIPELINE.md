# Artifact Pipeline

How screenshots are captured, stored, bundled with matches, and displayed in the UI.

## Overview

```
Smart Capture → save-screenshot IPC → userData/screenshots/<timestamp>.png
                                     ↓
Match Submission → bundle-artifacts IPC → userData/match_artifacts/<matchId>/
                                        ↓
UI Display → get-match-artifacts IPC → LocalImage component (read-file-base64 IPC → base64 data URL)
```

## Stage 1: Screenshot Capture

### Smart Capture Flow
1. `useSmartCapture` hook triggers capture via `capture-game-window` or `capture-screen` IPC
2. Main process captures the screen and returns base64 image data
3. If OCR is enabled, `ocrHandler.cjs` → `processCapture()` runs analysis
4. Image is saved to disk via `save-screenshot` IPC → `userData/screenshots/<matchId>_<timestamp>.png`
5. OCR debug images are also saved to `userData/ocr-debug/`

### Manual Addition
Users can add screenshots to any match via the `add-match-artifact` IPC, which opens a native file picker dialog.

## Stage 2: Bundling

**Trigger:** `bundleMatchArtifacts(matchId, startTime, endTime)` in `utils/artifactService.ts`, called automatically during match submission in `useMatchSubmission`.

### bundle-artifacts IPC Handler

1. Creates `match_artifacts/<matchId>/` directory
2. Scans two source directories for images:
   - `userData/screenshots/` (primary — smart capture flow)
   - `userData/ocr-debug/` (fallback — legacy capture flow)
3. For each image file (`.png`, `.jpg`, `.jpeg`, `.bmp`, `.webp`):
   - Checks file birth/modification time against match time window (`startTime - 5s` to `endTime + 30s`)
   - Copies matching files to the match artifact directory
   - Deduplicates by filename
4. Also scans `userData/telemetry_archive/` for matching telemetry JSON files (see `TELEMETRY_PIPELINE.md`)
5. If GCloud Storage is initialized, uploads artifacts (fire-and-forget)
6. Returns array of all bundled file paths

### Match Record Update

After bundling, the match record is updated with the artifact paths:
```typescript
const artifacts = await bundleMatchArtifacts(newMatch.id, matchStart, matchEnd);
if (artifacts.length > 0) {
    const updated = { ...newMatch, artifacts };
    updateMatch(updated);
}
```

The `match.artifacts` field is a `string[]` of absolute file paths.

### Retro-Bundling

For matches submitted before artifact bundling existed, the `DevOCRPanel` provides a "Retro Bundle" feature that scans for matching screenshots retroactively.

## Stage 3: Retrieval

### get-match-artifacts IPC Handler

Reads `match_artifacts/<matchId>/` and categorizes files:

```javascript
return {
    images: string[],      // Absolute paths to image files
    imageFiles: ArtifactFile[], // { filename, path } for each image
    telemetry: any[]       // Parsed JSON contents of telemetry files
};
```

### Renderer-side wrapper

```typescript
// utils/artifactService.ts
const result = await getMatchArtifactsStructured(match.id);
// result.images    — for gallery display
// result.imageFiles — for remove/manage operations
// result.telemetry — for telemetry display
```

## Stage 4: Display

### LocalImage Component (`src/components/LocalImage.tsx`)

**Problem:** Chromium blocks `file:///` URLs from `http://localhost` origins (Vite dev server), even with `webSecurity: false`. Raw `<img src="file:///...">` does not work.

**Solution:** `LocalImage` loads images via the `read-file-base64` IPC handler, which reads the file in the main process and returns base64 data. The component converts this to a data URL (`data:image/png;base64,...`).

Features:
- **Caching:** Loaded data URLs are cached in a module-level `Map` to avoid re-reading
- **Loading state:** Shows a spinner while loading
- **Error state:** Shows "Image unavailable" fallback (or custom `fallback` prop)
- **MIME detection:** Infers MIME type from file extension

Usage:
```tsx
import { LocalImage } from './LocalImage';

<LocalImage
    src="C:\\Users\\...\\match_artifacts\\123\\screenshot.png"
    alt="Screenshot"
    className="w-full h-full object-cover"
/>
```

**Convention:** Always use `<LocalImage>` for filesystem images. Never use raw `<img src="file://...">`.

### Where artifacts are displayed

| Component | What it shows |
|-----------|---------------|
| `SmartCapturesPanel` | Gallery grid + lightbox + telemetry viewer |
| `MatchRecordingPage` | Gallery grid + lightbox in match detail |
| `HistoryTable` | Inline artifact thumbnails in match detail |

## Stage 5: Management

### Remove Artifact
`remove-match-artifact` IPC deletes a file from `match_artifacts/<matchId>/` and the `match.artifacts` array is updated in the renderer.

### Add Artifact
`add-match-artifact` IPC opens a file picker, copies selected files to `match_artifacts/<matchId>/`, and returns the new paths.

## IPC Handlers

| Channel | Type | Args | Description |
|---------|------|------|-------------|
| `save-screenshot` | invoke | `{ imageBase64, matchId }` | Save capture to `screenshots/` |
| `bundle-artifacts` | invoke | `{ matchId, startTime, endTime }` | Bundle time-matching files |
| `get-match-artifacts` | invoke | `matchId` | List all artifacts for a match |
| `remove-match-artifact` | invoke | `{ matchId, filename }` | Delete an artifact |
| `add-match-artifact` | invoke | `{ matchId }` | Add via file picker |
| `rerun-ocr-on-artifact` | invoke | `{ imagePath, activeUser, ocrMode }` | Re-run OCR (skips cloud upload) |
| `read-file-base64` | invoke | `filePath` | Read file as base64 (used by LocalImage) |

## Data Paths

| Path | Description |
|------|-------------|
| `userData/screenshots/` | Raw captures from smart capture |
| `userData/ocr-debug/` | OCR debug images (legacy path) |
| `userData/match_artifacts/<matchId>/` | Bundled artifacts per match |
