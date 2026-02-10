# AI Context Map (Token-Efficient)

Purpose: fast orientation for coding agents and contributors.  
Use this first, then open only the specific module docs you need.

## Runtime Model

- Renderer: React + TypeScript in `src/`
- Main process: Electron in `electron/main.cjs`
- Bridge: allowlisted IPC in `electron/preload.cjs`
- Persistence: JSON DB via IPC (`db-read` / `db-write`)

## Where To Start By Task

- UI behavior or layout: `src/components/README.md`
- State or data flow: `src/store/` and `src/providers/`
- OCR pipeline: `electron/README.md`, `electron/ocrHandler.cjs`, `docs/OCR_MERGING.md`
- Telemetry parsing/bundling: `docs/TELEMETRY_PIPELINE.md`, `electron/main.cjs`
- IPC contract changes: `docs/IPC_HANDLERS.md`, `electron/preload.cjs`, `electron/main.cjs`
- Analytics logic: `src/utils/analytics.ts`, `src/components/analytics/`

## Safety Rules (Current)

- Renderer security:
  - `webSecurity: true`
  - CSP enabled in `index.html`
- File IPC constraints:
  - `read-file-base64` / `open-path` only allow approved roots
  - `read-file-base64` only serves image extensions
- Network proxy guard:
  - `epic-request` requires HTTPS and host allowlist

## Data Locations (User Machine)

- `app.getPath('userData')/wildgate_db.json`: app database
- `app.getPath('userData')/screenshots/`: captured images
- `app.getPath('userData')/match_artifacts/<matchId>/`: bundled artifacts
- `app.getPath('userData')/telemetry_archive/`: archived telemetry
- `app.getPath('userData')/app_logs.txt`: persisted logs

## Minimal Read Order

1. `docs/AI_CONTEXT.md` (this file)
2. `src/README.md` and `electron/README.md`
3. One feature-specific doc in `docs/`
4. Only then open implementation files

