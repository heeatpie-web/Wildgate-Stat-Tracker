# `src/` Map

Renderer app (React + TypeScript).

## Top-Level Ownership

- `App.tsx`: root composition, mode switching, global hooks wiring
- `index.tsx`: renderer bootstrap
- `types.ts`: shared renderer domain types
- `components/`: UI and feature surfaces
- `hooks/`: side-effect + orchestration hooks
- `providers/`: context facades over store/actions
- `store/`: Zustand slices and persistence wiring
- `utils/`: pure logic, IPC wrappers, scan/ocr helpers

## Recommended Edit Path

1. UI-only change: edit `components/*`
2. Logic + UI change: edit `hooks/*` then minimal UI touchpoints
3. Data model change: update `types.ts`, `store/*`, then callers
4. IPC change: update `utils/electronBridge.ts` + `electron/*`

