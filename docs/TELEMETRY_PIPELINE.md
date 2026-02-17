# Telemetry Pipeline

How game telemetry flows from the Nebula game client into the Wildgate Stat Tracker.

## Overview

```
Game Log (binary) → decodeLog() → archiveTelemetry() → telemetry_archive/
                                 → win.webContents.send('log-data', data) → TelemetryPanel (live)
                                                                            → useLogMonitor (match detection)

Match Submission → bundle-artifacts → match_artifacts/<matchId>/*.json
                                    → SmartCapturesPanel (bundled telemetry display)
```

## Stage 1: Log Monitoring

**Trigger:** `start-log-monitoring` IPC (one-way send from renderer).

The main process polls the Nebula telemetry cache file at a fixed interval (~2s):

- **Path:** `%LOCALAPPDATA%/Nebula/Saved/Logs/AccelByteTelemetryCache`
- **Format:** Binary file with UTF-8 JSON payloads separated by null bytes
- **Decoder:** `decodeLog()` in `electron/main.cjs`

Each poll:
1. Reads the binary file
2. Splits on null bytes
3. Parses each chunk as JSON
4. Deduplicates against previously seen events
5. Sends new events to the renderer via `log-data` channel
6. Archives events via `archiveTelemetry()`

## Stage 2: Archiving

**Function:** `archiveTelemetry(data)` in `electron/main.cjs`

1. Extracts a grouping ID (`matchId` or `sessionId`) by recursively scanning the event payload
2. Sanitizes the ID for use as a filename
3. Appends to `telemetry_archive/match_<safeId>.json`

### Archive File Format

**IMPORTANT:** Archive files are stored as **raw JSON arrays**, not wrapped in an object.

```json
[
  { "EventName": "MatchStarted", "ClientTimestamp": 1707400000000, ... },
  { "EventName": "PlayerKill", "ClientTimestamp": 1707400010000, ... },
  ...
]
```

Canonical normalization is provided by helpers:
- Electron: `normalizeEvents()` in `electron/helpers/telemetryArchiveHelpers.cjs`
- Renderer: `normalizeTelemetryArchivePayload()` / `normalizeTelemetryArchiveCollection()` in `src/utils/telemetryArchive.ts`

Avoid ad-hoc shape checks. Use the shared normalizers instead.
```javascript
const content = JSON.parse(fileData);
const events = normalizeEvents(content);
```

### Deduplication

Events are deduplicated by signature: `${event.ClientTimestamp}_${event.EventName}`. Combined arrays are sorted by `ClientTimestamp`.

### Cleanup

`cleanupOldArchives()` runs periodically and deletes archive files older than 24 hours (`ARCHIVE_MAX_AGE_MS`).

## Stage 3: Live Display

The renderer receives events via the `log-data` channel:

- **`useLogMonitor`** hook processes events for match state detection (start/end, ship selection, map loading)
- **`TelemetryPanel`** displays live event feed
- **`telemetryProcessor.ts`** provides parsing/filtering utilities

### Key Telemetry Fields

| Field | Description |
|-------|-------------|
| `EventName` | Event type identifier |
| `ClientTimestamp` | Unix timestamp (ms) when event occurred |
| `matchId` / `MatchId` | Game match identifier |
| `sessionId` / `SessionId` | Game session identifier |
| `context.client.accountId` | Player's internal account ID |
| `context.client.platformAccountId` | Player's Epic account ID |
| `Payload` | Event-specific data payload |

## Stage 4: Bundling with Matches

**Trigger:** `bundle-artifacts` IPC, called during match submission (`useMatchSubmission`).

The bundler scans `telemetry_archive/` for JSON files whose events overlap the match time window:

```javascript
const events = normalizeEvents(content);
const hasOverlap = events.some(e => {
  const t = e.ClientTimestamp || e.timestamp || e.EventTimestamp;
  return t && t >= startTime - 5000 && t <= endTime + 30000;
});
```

Matching files are copied to `match_artifacts/<matchId>/`.

## Stage 5: Bundled Display

`SmartCapturesPanel` loads bundled telemetry via `get-match-artifacts` IPC:

```javascript
const artifacts = await getMatchArtifactsStructured(match.id);
// artifacts.telemetry is an array of parsed JSON file contents
// Renderer side is normalized via normalizeTelemetryArchiveCollection()
const events = normalizeTelemetryArchivePayload(tFile);
```

## IPC Handlers

| Channel | Type | Description |
|---------|------|-------------|
| `start-log-monitoring` | send | Start polling game log |
| `stop-log-monitoring` | send | Stop polling |
| `log-data` | receive | Live telemetry events |
| `load-archived-telemetry` | invoke | Load all archived events |
| `decode-telemetry-cache` | invoke | Manually trigger decode |
| `list-telemetry-archives` | invoke | List archive files |
| `load-telemetry-archive-file` | invoke | Load specific archive |
| `clear-telemetry-archives` | invoke | Delete all archives |

## Data Paths

| Path | Description |
|------|-------------|
| `%LOCALAPPDATA%/Nebula/Saved/Logs/AccelByteTelemetryCache` | Source game telemetry (binary) |
| `userData/telemetry_archive/match_<id>.json` | Archived events per match/session |
| `userData/match_artifacts/<matchId>/*.json` | Bundled telemetry per submitted match |
