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
- `npm run ai:dbx -- --prompt "..."` - ask a Databricks-hosted coding model about this repo
- `npm run ai:dbx:models` - list Databricks serving endpoints visible to your current CLI profile
- `npm run ai:snowflake -- --prompt "..."` - ask Snowflake-hosted Claude Opus about this repo
- `npm run ai:snowflake:sonnet -- --prompt "..."` - ask Snowflake-hosted Claude Sonnet 4.6 about this repo
- `npm run ai:snowflake:chat` - open an interactive Snowflake-hosted Claude Opus chat for this repo
- `npm run ai:snowflake:chat:auto` - interactive Snowflake Claude chat with automatic repo search
- `npm run ai:snowflake:chat:sonnet` - open an interactive Snowflake-hosted Claude Sonnet 4.6 chat for this repo
- `npm run ai:snowflake:chat:auto:sonnet` - interactive Snowflake Sonnet 4.6 chat with automatic repo search
- `npm run setup:parallel-streams` - create UI/OCR/contract worktrees
- `npm run check:stream-ownership` - validate changed files match stream rules

### Databricks Coding Helper

Use this when you want Databricks-hosted models to help you work on the local repo from a terminal.

Prerequisites:

- `databricks auth login --profile DEFAULT --host <workspace-url>`
- a Databricks workspace profile with access to at least one serving endpoint

Examples:

- `npm run ai:dbx -- --prompt "Explain the OCR entry points" --file electron/ocrHandler.cjs --file src/hooks/useSmartCapture.ts`
- `npm run ai:dbx -- --prompt "Review the current uncommitted changes and suggest the next patch" --diff`
- `npm run ai:dbx -- --model databricks-gpt-oss-120b --prompt "Find the safest place for a new IPC handler" --file electron/main.cjs --file electron/preload.cjs`

Notes:

- The helper reuses your Databricks CLI login and requests a short-lived OAuth token on demand. No PAT is required.
- Default model selection is `auto`: it tries coding-oriented Databricks endpoints first, then falls back to a callable chat model if Databricks has a preferred model temporarily disabled.
- Run the same commands in the VS Code integrated terminal if that is where you work.

### Snowflake Opus Helper

Use this when you want to send repo context to Snowflake-hosted `claude-opus-4-6`.

Examples:

- `npm run ai:snowflake -- --prompt "Review the current diff and suggest the next patch" --diff`
- `npm run ai:snowflake -- --prompt "Explain the preload bridge" --file electron/preload.cjs`
- `npm run ai:snowflake:chat -- --file electron/preload.cjs`

Notes:

- This helper uses a Snowflake programmatic access token from `~/.snowflake/connections.toml`.
- The default connection name is `snowflake_trial`.
- Sonnet-specific commands are documented in `README_SNOWFLAKE_SONNET.md`.
- Interactive chat also supports `/dir`, `/searchfiles`, `/inspect`, and `/review` to gather repo context locally before sending it to Claude.
- `ai:snowflake:chat:auto*` enables automatic repo searching per message so you can ask normal questions without manually attaching files first.
- In auto mode, if Claude asks for exact repo files, those paths are queued and auto-attached on the next normal message.

## Project Layout

- `src/` - React renderer code (UI, state, hooks, utilities)
- `electron/` - Electron main/preload and desktop integrations
- `dist/` - renderer build output

## Parallel Streams (UI + OCR)

- Ownership rules: `WORK_OWNERSHIP.md`
- Agent prompt templates: `docs/AGENT_STREAM_PROMPTS.md`
- Shared OCR contract for UI consumption: `src/services/ocrAdapter.ts`
- CI guardrail: `.github/workflows/stream-ownership.yml`

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
