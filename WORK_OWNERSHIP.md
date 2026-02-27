# Parallel Stream Ownership

This repo uses parallel streams for large changes:

- `stream/ui`: UI implementation stream
- `stream/ocr`: OCR implementation stream
- `stream/contract`: shared integration contract stream

## Branch and Worktree Layout

- UI worktree: `../wg-ui` on branch `stream/ui`
- OCR worktree: `../wg-ocr` on branch `stream/ocr`
- Contract worktree (optional): `../wg-contract` on branch `stream/contract`

Use `scripts/setup-parallel-streams.ps1` to create these worktrees.

## Ownership Rules

### UI Stream (`stream/ui`)

Allowed:

- `src/components/**`
- `src/styles/**`
- `src/config/appViews.ts`
- `src/config/systemPulse.ts`
- `src/index.css`

Avoid:

- `src/utils/ocr/**`
- `src/utils/scan/**`
- `electron/**`
- OCR scripts under `scripts/**`

### OCR Stream (`stream/ocr`)

Allowed:

- `src/utils/ocr/**`
- `src/utils/scan/**`
- `electron/**`
- OCR scripts under `scripts/**`
- `src/components/settings/ocrThresholdPresets.ts`

Avoid:

- Most UI composition files under `src/components/**`

### Contract Stream (`stream/contract`)

Allowed:

- `src/services/**`
- `src/types.ts`
- `src/config/runtimeConfig.ts`
- `src/utils/artifactService.ts`

Purpose:

- Small, explicit type/interface changes used by both streams.

## Shared, Always-Allowed Files

- `docs/**`
- `WORK_OWNERSHIP.md`
- `scripts/check-stream-ownership.cjs`
- `scripts/setup-parallel-streams.ps1`
- `.github/workflows/stream-ownership.yml`

## Enforcement

Run:

- `npm run check:stream-ownership:ui`
- `npm run check:stream-ownership:ocr`
- `npm run check:stream-ownership:contract`

CI also runs `.github/workflows/stream-ownership.yml` on PRs to `main`.

## Integration Protocol

1. UI and OCR streams do not edit each other’s owned paths.
2. If either stream needs a shared type or API change, open a small contract PR.
3. Merge contract PR first, then rebase UI/OCR streams.
4. Merge UI and OCR streams only after stream-specific tests pass.
