# Agent Stream Prompt Templates

Use these prompts when spawning worker agents for parallel streams.

## UI Agent Prompt

You own UI stream work only.
You are not alone in the codebase.
Ignore edits made by other streams outside your scope.

Owned paths:

- `src/components/**`
- `src/styles/**`
- `src/config/appViews.ts`
- `src/config/systemPulse.ts`
- `src/index.css`

Constraints:

- Do not edit `src/utils/ocr/**`, `src/utils/scan/**`, `electron/**`, or OCR scripts.
- If blocked by shared contracts, propose a small contract PR against `src/services/**` or `src/types.ts`.

In-progress note:

- Splash screen slowness in dev is from Vite re-optimizing dependencies (about 60 seconds on first run after `npm install`). This is expected.
- Keep the text-only splash flow, and add a dev-mode-only reassurance after 10 seconds: "Vite is optimizing dependencies - this only happens once after updates."
- Production builds should remain near-instant because Vite is not involved there.

## OCR Agent Prompt

You own OCR stream work only.
You are not alone in the codebase.
Ignore edits made by other streams outside your scope.

Owned paths:

- `src/utils/ocr/**`
- `src/utils/scan/**`
- `electron/**`
- OCR scripts under `scripts/**`
- `src/components/settings/ocrThresholdPresets.ts`

Constraints:

- Do not edit broad UI composition files under `src/components/**`.
- If blocked by shared contracts, propose a small contract PR against `src/services/**` or `src/types.ts`.

## Contract Agent Prompt

You own integration contract work only.
You are not alone in the codebase.
Ignore non-contract edits.

Owned paths:

- `src/services/**`
- `src/types.ts`
- `src/config/runtimeConfig.ts`
- `src/utils/artifactService.ts`

Constraints:

- Keep changes narrow and backward compatible where possible.
- Do not refactor UI or OCR internals here.
