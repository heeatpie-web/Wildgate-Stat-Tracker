# Work Locks

Use this file to temporarily claim high-conflict files while an agent is actively editing them.

Rules:
- Add a lock before editing hot/shared files.
- Keep scope narrow (single file or small related set).
- Remove lock as soon as commit is complete.
- If lock is stale, confirm with owner before taking over.

## Active Locks

| File | Owner | Started (UTC) | Purpose |
|---|---|---|---|
| _none_ |  |  |  |

## Example

| File | Owner | Started (UTC) | Purpose |
|---|---|---|---|
| src/App.tsx | agent-a | 2026-02-10T18:05:00Z | wire OCR review modal |
