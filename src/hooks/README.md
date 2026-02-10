# `src/hooks/` Map

Hooks coordinate UI events, IPC calls, and state updates.

## Primary Hooks

- `useSmartCapture.ts`: capture queue + save/process flow
- `useSmartScan.ts`: OCR scan orchestration
- `useMatchSubmission.ts`: submission pipeline + artifact bundling
- `useLogMonitor.ts`: telemetry monitor lifecycle
- `useDiscordRPC.ts`: Discord presence updates
- `useKeyboardShortcuts.ts`: app shortcut bindings

## Rule of Thumb

- Put side-effect logic here.
- Keep components thin; call hooks from feature entry components.

