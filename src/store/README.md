# `src/store/` Map

Global state via Zustand.

## Structure

- `useAppStore.ts`: composed store entry
- `slices/createDataSlice.ts`: matches, players, historical data
- `slices/createFormSlice.ts`: in-progress form data
- `slices/createMappingSlice.ts`: ID/name mapping state
- `slices/createSettingsSlice.ts`: app preferences and toggles
- `slices/createUISlice.ts`: UI layout/modal/view state

## Persistence

- Persist middleware delegates to `src/utils/storage.ts`.
- Renderer does not write files directly; main process IPC owns disk I/O.

