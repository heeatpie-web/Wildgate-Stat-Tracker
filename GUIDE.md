# Developer & AI Agent Guide

Welcome to the **Wildgate Stat Tracker** codebase. This guide covers the full architecture for developers and AI agents.

## Architecture Overview

**Electron + React 18 + TypeScript** desktop app with **Zustand** state management, **Vite** bundler, and a modular OCR/telemetry pipeline.

- **Renderer:** React SPA served by Vite (`src/`)
- **Main process:** Electron (`electron/main.cjs`) — IPC handlers, OCR, telemetry, file I/O
- **Preload bridge:** `electron/preload.cjs` — secure `contextBridge` with channel allowlists
- **Persistence:** JSON file on disk via `db-read`/`db-write` IPC (no SQLite)

---

## Project Structure

```
electron/                   # Electron main process
├── main.cjs                # Window, IPC handlers, telemetry, artifacts
├── preload.cjs             # contextBridge (channel allowlists)
├── ocrHandler.cjs          # OCR pipeline entry (Tesseract + GCloud Vision)
├── screenDetector.cjs      # Crew Hub vs Map Screen classification
├── crewHubExtractor.cjs    # Extract players/teams from Crew Hub screenshots
├── mapScreenExtractor.cjs  # Extract ships/hazards from Tactical Map
├── ocrMerger.cjs           # Merge multiple OCR captures for same match
├── gcloudService.cjs       # Google Cloud Vision API client
├── gcloudSyncService.cjs   # Google Cloud Storage upload (training data, artifacts)
├── colorUtils.cjs          # Color detection helpers for team identification
├── hybridOcrExtractor.cjs  # Combined local+cloud OCR with merge logic
├── accurateOcrExtractor.cjs # High-accuracy extraction path
├── simpleOcrExtractor.cjs  # Lightweight fallback extractor
└── cvExtractor.cjs         # Computer vision helpers

src/
├── types.ts                # Core types (Match, GameMode, OpponentTeam, Loadout, etc.)
├── App.tsx                 # Root component
│
├── components/             # UI components
│   ├── DashboardLayout.tsx     # Main grid (react-grid-layout)
│   ├── Header.tsx              # App header with session sparkline
│   ├── Sidebar.tsx             # Navigation sidebar
│   ├── RecordingView.tsx       # Active recording session panel
│   ├── HistoryTable.tsx        # Match history browser with inline detail
│   ├── MatchRecordingPage.tsx  # Full match history with search/filter/edit
│   ├── SmartCapturesPanel.tsx  # Smart Capture management + OCR rerun
│   ├── AnalyticsPanel.tsx      # Analytics tab container
│   ├── TelemetryPanel.tsx      # Live telemetry viewer
│   ├── SimulatorPanel.tsx      # Telemetry simulator/replay
│   ├── DevOCRPanel.tsx         # Dev tools: OCR testing, retro-bundling
│   ├── SettingsModal.tsx       # Settings (OCR mode, GCloud, themes)
│   ├── LocalImage.tsx          # IPC-based image loader (bypasses file:// restrictions)
│   ├── OverlayView.tsx         # In-game overlay mode
│   ├── Wizard.tsx              # Match entry wizard
│   ├── EditMatchModal.tsx      # Edit existing match
│   ├── OcrCorrectionModal.tsx  # Manual OCR correction training
│   ├── ReviewQueueModal.tsx    # OCR result review queue
│   ├── TiltMeter.tsx           # Frustration/tilt analytics
│   ├── RivalryGraph.tsx        # Player rivalry visualization
│   ├── IdMapper.tsx            # Epic ID → display name mapper
│   ├── SessionTimer.tsx        # Live session timer
│   ├── Tutorial.tsx            # First-run tutorial
│   ├── WindowControls.tsx      # Custom titlebar buttons
│   │
│   ├── analytics/              # Analytics sub-views
│   │   ├── AnalyticsDashboard.tsx  # Main analytics grid
│   │   ├── AnalyticsShell.tsx      # Analytics layout wrapper
│   │   ├── ProView.tsx             # Per-ship stats + damage efficiency
│   │   ├── SessionSummaryView.tsx  # Current session summary
│   │   ├── InsightsView.tsx        # AI-generated editorial insights
│   │   ├── MomentumView.tsx        # Performance momentum score
│   │   ├── TimePatternView.tsx     # Win rate by time of day
│   │   ├── StreakTimelineView.tsx   # Win/loss streak visualization
│   │   ├── KillEfficiencyView.tsx  # Kill efficiency metrics
│   │   ├── PeriodComparisonView.tsx # This week vs last week
│   │   ├── PlacementDistView.tsx   # Placement distribution
│   │   ├── EnvironmentView.tsx     # Performance by modifier/map
│   │   ├── SocialView.tsx          # Wingman/rivalry analytics
│   │   ├── SynergyView.tsx         # Team synergy analysis
│   │   └── VisualEssayView.tsx     # Narrative data essay
│   │
│   └── ocr/                    # OCR UI components
│       ├── OCRReviewModal.tsx      # Review + accept OCR results
│       └── ...
│
├── hooks/                  # Custom React hooks
│   ├── useSmartCapture.ts      # Smart capture state + actions
│   ├── useSmartScan.ts         # OCR scan pipeline + confidence thresholds
│   ├── useMatchSubmission.ts   # Match submission logic + artifact bundling
│   ├── useLogMonitor.ts        # Telemetry log file monitoring
│   ├── useTiltMonitor.ts       # Tilt/frustration detection
│   ├── useDiscordRPC.ts        # Discord Rich Presence
│   ├── useSoundEffects.ts      # Audio feedback
│   └── useKeyboardShortcuts.ts # Global keyboard shortcuts
│
├── providers/              # React context providers
│   ├── GameDataProvider.tsx        # Matches, players, session state
│   ├── UIStateProvider.tsx         # Layout, loading, active modes
│   └── UserPreferencesProvider.tsx # Theme, language, preferences
│
├── store/                  # Zustand store
│   ├── useAppStore.ts          # Root store (combines all slices)
│   └── slices/
│       ├── createDataSlice.ts      # Matches, pilots, favorites
│       ├── createFormSlice.ts      # Match entry form state
│       ├── createMappingSlice.ts   # Epic ID mappings
│       ├── createSettingsSlice.ts  # User settings
│       └── createUISlice.ts        # UI layout state
│
├── utils/                  # Utility modules
│   ├── analytics.ts            # Core analytics engine (insights, trends, momentum)
│   ├── analyticsEditorial.ts   # Narrative/editorial text generation
│   ├── artifactService.ts      # Artifact bundling/retrieval IPC wrappers
│   ├── changelog.ts            # Version changelog data
│   ├── constants.ts            # Ships, modifiers, characters, weapons, equipment
│   ├── electronAPI.ts          # getElectronAPI() helper
│   ├── electronBridge.ts       # Typed IPC bridge utilities
│   ├── equipmentDb.ts          # Equipment database
│   ├── export.ts               # Data export (CSV, JSON)
│   ├── guids.ts                # GUID utilities
│   ├── logger.ts               # Client-side logger (persists via IPC)
│   ├── scanService.ts          # Scan orchestration service
│   ├── storage.ts              # StorageService (Zustand persist adapter)
│   ├── stringUtils.ts          # Fuzzy matching, normalization
│   ├── telemetryProcessor.ts   # Telemetry event processing
│   ├── translations.ts         # i18n strings
│   │
│   ├── ocr/                    # OCR utilities (renderer-side)
│   │   ├── ocrTypes.ts             # OCRExtractedData, confidence types
│   │   ├── ocrParser.ts            # Parse + validate OCR output
│   │   ├── ocrMerge.ts             # Merge multiple OCR results
│   │   ├── ocrMappings.ts          # Ship/modifier name normalization
│   │   └── index.ts                # Re-exports
│   │
│   └── scan/                   # Scan pipeline modules
│       ├── matchScan.ts            # In-match state detection
│       ├── lobbyScan.ts            # Lobby detection
│       ├── socialScan.ts           # Social screen parsing
│       ├── tacticalScan.ts         # Tactical map parsing
│       ├── colorDetection.ts       # Color-based team detection
│       ├── imageUtils.ts           # Screenshot processing
│       ├── ocrUtils.ts             # OCR text post-processing
│       ├── tesseractScan.ts        # Tesseract.js wrapper
│       ├── smartAnalyze.ts         # Smart analysis orchestrator
│       └── types.ts                # Scan-specific types
│
└── docs/                   # Documentation
    ├── OCR_MERGING.md          # OCR merge strategy guide
    ├── IPC_HANDLERS.md         # Complete IPC handler catalog
    ├── TELEMETRY_PIPELINE.md   # Telemetry archive/bundle pipeline
    └── ARTIFACT_PIPELINE.md    # Screenshot artifact lifecycle
```

---

## Major Systems

### 1. State Management (`/store`)
Zustand store split into five slices:
- **DataSlice** — Matches, players, pilot registry, favorites
- **FormSlice** — Temporary match entry/edit state
- **MappingSlice** — Epic account ID → display name mappings
- **SettingsSlice** — Theme, language, OCR mode, audio, GCloud credentials
- **UISlice** — Layout, loading states, active panels, overlay mode

**Persistence:** `zustand/middleware/persist` with `StorageService` (`utils/storage.ts`) which calls `db-read`/`db-write` IPC to read/write a JSON file in `userData`.

### 2. OCR Pipeline
Screenshot → detection → extraction → merge → review → apply to match.

1. **Capture:** `useSmartCapture` triggers `capture-game-window` or `capture-screen` IPC
2. **Process:** `ocrHandler.cjs` → `processCapture()`:
   - Runs Tesseract.js locally (eng + chi_sim)
   - Optionally runs Google Cloud Vision (`gcloudService.cjs`)
   - `screenDetector.cjs` classifies as Crew Hub or Map Screen
   - Appropriate extractor runs (`crewHubExtractor` or `mapScreenExtractor`)
   - If `ocrMode: 'both'`, results are merged via `hybridOcrExtractor`
3. **Review:** Results shown in `OCRReviewModal` for user confirmation
4. **Apply:** Accepted data populates match form fields (ship, teammates, opponents, modifiers)

OCR modes: `local` (Tesseract only), `cloud` (GCloud Vision only), `both` (merged).

### 3. Telemetry Pipeline
Game log → decode → archive → display → bundle with match.

1. **Monitor:** `useLogMonitor` → `start-log-monitoring` IPC polls the Nebula game log
2. **Decode:** `decodeLog()` in `main.cjs` reads binary telemetry cache
3. **Archive:** `archiveTelemetry()` writes events as **raw JSON arrays** to `telemetry_archive/match_<id>.json`
4. **Display:** `TelemetryPanel.tsx` shows live events; `SmartCapturesPanel.tsx` shows bundled telemetry
5. **Bundle:** `bundle-artifacts` IPC copies matching telemetry files to `match_artifacts/<matchId>/`

**Important:** Archive files are raw arrays `[event1, event2, ...]`, NOT `{telemetry: [...]}`. All readers must handle both formats.

### 4. Artifact Pipeline
Screenshot capture → save to disk → bundle with match → display via IPC.

1. **Save:** Screenshots saved to `userData/screenshots/` during capture
2. **Bundle:** On match submission, `bundleMatchArtifacts()` calls `bundle-artifacts` IPC which copies time-matching images from `screenshots/` and `ocr-debug/` to `match_artifacts/<matchId>/`
3. **Retrieve:** `get-match-artifacts` IPC reads `match_artifacts/<matchId>/` and returns `{ images: string[], imageFiles: ArtifactFile[], telemetry: any[] }`
4. **Display:** `LocalImage` component loads images via `read-file-base64` IPC (returns base64 data URLs, cached in memory). This bypasses Chromium's `file://` restrictions.

### 5. Analytics Engine (`utils/analytics.ts`)
Provides: insights, session summaries, period comparisons, momentum scores, kill efficiency, placement distributions, streak tracking, environment analysis, social/rivalry stats.

All `damageTaken` arithmetic uses `Number(m.damageTaken) || 0` to prevent string concatenation.

### 6. Google Cloud Integration
- **Vision API** (`gcloudService.cjs`): OCR text detection on screenshots
- **Cloud Storage** (`gcloudSyncService.cjs`): Upload training data, match artifacts
- Initialized with a service account JSON key file configured in Settings
- Status exposed via `get-gcloud-status` IPC

---

## IPC Communication

All renderer ↔ main communication goes through `window.electronAPI` (exposed via `preload.cjs`):
- **`invoke(channel, ...args)`** — Two-way (request/response). Allowlisted in `INVOKE_CHANNELS`.
- **`send(channel, ...args)`** — One-way fire-and-forget. Allowlisted in `SEND_CHANNELS`.
- **`on(channel, callback)`** — Subscribe to main → renderer events. Allowlisted in `RECEIVE_CHANNELS`.

See `docs/IPC_HANDLERS.md` for the complete catalog.

---

## Development Conventions

- **Types:** Define in `types.ts` or locally within slices/components
- **Icons:** `lucide-react` exclusively
- **Styling:** CSS classes + custom theme variables (`md-sys-*` design tokens)
- **IPC:** Always use `getElectronAPI()` from `utils/electronAPI.ts`; never access `ipcRenderer` directly
- **Number safety:** Always coerce `damageTaken` and other potentially-string numeric fields with `Number()` before arithmetic
- **Image display:** Use `<LocalImage src={path} />` for filesystem images — never raw `<img src="file://...">`
- **Telemetry format:** Archive files are raw JSON arrays; always check `Array.isArray(content)` before `content.telemetry`

---

## Key Data Paths (all under `app.getPath('userData')`)

| Path | Purpose |
|------|---------|
| `wildgate-data.json` | Main database (matches, settings, pilots) |
| `screenshots/` | Raw screenshots from smart capture |
| `ocr-debug/` | OCR debug images (legacy capture path) |
| `match_artifacts/<matchId>/` | Bundled screenshots + telemetry per match |
| `telemetry_archive/` | Archived telemetry JSON files per match/session |
| `training_data/` | OCR training samples for GCloud sync |
| `app_logs.txt` | Persisted application logs |

---

## Build & Run

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server (web only)
npm run electron:dev # Full Electron + Vite dev mode
npm run electron:build # Production build
```
