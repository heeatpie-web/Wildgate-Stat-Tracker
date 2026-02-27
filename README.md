# Wildgate Stat Tracker (Beta)

Wildgate Stat Tracker is a desktop app for logging matches, reviewing OCR captures, and tracking performance over time.

## Beta Notice

This is a beta build.

- Some OCR flows may need manual correction.
- If something breaks, open `Settings -> Data -> Copy Logs` and send the logs with your report.

## What The App Does

- Tracks match history and outcomes.
- Captures screenshots and extracts teammates/opponents/ships/modifiers using OCR.
- Provides analytics dashboards and export tools.
- Supports local backups and restore.

## Quick Start (Users)

1. Install and launch the app.
2. Complete first-run setup.
3. Keep game telemetry enabled and point the app to your Wildgate folder if prompted.
4. Run a match, then review OCR results before saving.

## Development

### Prerequisites

- Node.js 18+
- npm

### Commands

- `npm install` - install dependencies
- `npm run dev` - renderer dev server only
- `npm run electron:dev` - run Electron + renderer
- `npm run build` - build renderer
- `npm run electron:build` - package desktop app
- `npm run test` - run tests

## Project Layout

- `src/` - React renderer code (UI, state, hooks, utilities)
- `electron/` - Electron main/preload and desktop integrations
- `dist/` - renderer build output

## IPC (Plain English)

IPC means **Inter-Process Communication**.

In this app there are two sides:

- **Renderer**: the React UI (what users click)
- **Main process**: Electron backend (file system, OS integration, window control)

The renderer cannot safely access everything directly, so it asks main to do privileged tasks through IPC channels.

Examples in this app:

- save/read logs
- read/write database backups
- capture screenshots
- monitor telemetry files

Safety model used here:

- `electron/preload.cjs` exposes a limited API to the renderer.
- Only allowlisted channels can be called.
- Main process validates file paths and operations before executing.

## Additional Docs

- `src/README.md` - renderer map
- `src/components/README.md` - component map
- `src/store/README.md` - state slice map
- `src/utils/README.md` - utility map
- `electron/README.md` - main/preload IPC map
