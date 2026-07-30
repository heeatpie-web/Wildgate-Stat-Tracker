# design-sync notes — Wildgate Stat Tracker

## Repo shape

This repo is an Electron app (`wildgate-stat-tracker`), not a publishable
component library — no `dist` library entry, no `.d.ts` export tree, no
Storybook. The converter runs in **package shape, synth-entry mode**,
scanning `src/components/**/*.tsx` directly (104 src files → 112 discovered
components, since a few files export more than one named component).

## The scratch package (why it exists)

`resolvePackage` needs a `PKG_DIR` with a `package.json` to read
name/version/main/module/exports from, and expects the package to live
under `--node-modules`. This repo isn't installed as a dependency of
itself, and its real root `package.json` has `"main": "electron/main.cjs"`
— a real file, so the converter's dist-entry heuristic would wrongly pick
up the *Electron main process* as if it were the component bundle.

Fix: `node_modules/wildgate-stat-tracker/` is a small scratch directory
(gitignored, lives under `node_modules/`) containing only a minimal
`package.json` (`name`/`version`, no `main`/`module`/`exports`), so
`resolveDistEntry` finds no candidate and falls through to synth-entry
mode. `cfg.srcDir` (`../../src/components`) and `cfg.tsconfig`
(`../../tsconfig.json`) are relative paths that escape this scratch dir
back to the real repo — that's intentional and allowed for those two
fields (only `cssEntry` is sandboxed to `PKG_DIR` itself).

**Re-sync risk**: `node_modules/wildgate-stat-tracker/` is NOT committed
(it's inside `node_modules`, which is gitignored). On a fresh clone or
after `npm ci` wipes `node_modules`, recreate it before rebuilding:

```bash
mkdir -p "node_modules/wildgate-stat-tracker"
cat > "node_modules/wildgate-stat-tracker/package.json" <<'EOF'
{ "name": "wildgate-stat-tracker", "version": "3.11.0" }
EOF
```

## cssEntry — must be refreshed on every re-sync

`cssEntry` is sandboxed to `PKG_DIR`, so the real compiled stylesheet
(`dist/assets/index-<hash>.css`, produced by `npm run build`) is **copied**
into `node_modules/wildgate-stat-tracker/dist.css` rather than referenced
in place. The hash in the filename changes every `vite build`, and the
scratch copy does NOT auto-update.

**Before every re-sync**: run `npm run build`, find the new
`dist/assets/index-*.css`, and re-copy it:

```bash
cp dist/assets/index-*.css "node_modules/wildgate-stat-tracker/dist.css"
```

The Google Fonts `@import` (see below) must be re-prepended after each
copy — it does not survive the `cp`.

## Fonts — Manrope/Sora load from Google Fonts CDN at runtime

The real app loads Manrope + Sora via a `<link>` tag in `index.html`
pointing at `fonts.googleapis.com` — they're never shipped as local
`@font-face`/woff2 files. `Inter` (Tailwind's `font-sans` fallback) and
`Cascadia Code` (a Windows-only system monospace, used only as a fallback
in a CSS var stack) are never shipped either.

Fix: the scratch `dist.css` has this line prepended (see cssEntry section
above — must be re-added after every re-copy):

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@500;600;700;800&display=swap');
```

This flips `validate`'s font check from `[FONT_MISSING]` (warning) to
`[FONT_REMOTE]` (informational) for all four families — the check is
all-or-nothing per bundle, not per-family, so Inter/Cascadia Code ride
along as accepted substitutes (they degrade to system fonts, which is
correct/expected — neither is genuinely shipped by this app).

## Source edits made to unblock the bundle ([BUNDLE_EXPORT])

Synth-entry mode's barrel file does `export * from '<path>'` for every
src file — this is a plain ESM star re-export, which **does not re-export
default exports**. 8 components were default-export-only and vanished
from `window.WildgateStatTracker` at bundle time even though the
converter's own discovery correctly listed them. Fixed by adding a named
export alongside the existing default export (purely additive, no
behavior change, no call-site updates needed):

- `AnalyticsPanel`, `DevOCRPanel`, `HistoryTable`, `PlayerHub`,
  `SimulatorPanel`, `SmartCapturesPanel`, `SystemPulse`, `Tutorial`
  (each: added `export { Name };` after `export default Name;`)

One genuine naming collision: two unrelated components were both named
`ConfidenceMeter` (`src/components/ConfidenceMeter.tsx` — a general
percent gauge — and `src/components/smart-captures/primitives/ConfidenceMeter.tsx`
— a smart-captures-specific bar). Renamed the smart-captures one to
`SmartCaptureConfidenceMeter` (component, default export, and its one
call site in `OCRFieldRow.tsx`, plus its test file).

`npm run typecheck` passed clean after all of the above.

## Known render warns (accepted, not new)

14 components render as blank on the floor card (real render attempt,
but effectively empty output) — these are the natural "author a preview"
candidates, not converter bugs: `AnalyticsCard`, `SmartCaptureDetailLayout`,
`OCRFieldRow`, `Button`, `ConfidenceMeter`, `EditableStatCard`, `Input`,
`Section`, `SmartCaptureConfidenceMeter`, `StatCard`, `RosterSearchInput`,
`OutcomePill`, `QueueCollapseToggle`, `SmartCapturesToolsView`.

`tokens: 237 defined, 167 referenced (2 missing, below threshold)` —
non-blocking, under the tool's threshold, not investigated further.

## Known render warns (accepted, not new) — round 2

After authoring previews for the 14 flagged components (see below), two
`[RENDER_THIN]` warnings persist and are triaged as benign, confirmed by
screenshot:

- `RosterSearchInput` — the dropdown only renders while focused (portal,
  `isOpen` state), so the static screenshot correctly shows just the bare
  input; the checker's text-measurement doesn't count an `<input>`'s
  `value` attribute as text.
- `QueueCollapseToggle` — an icon-only button by design (no text is
  correct); the screenshot confirms the icon renders.

`Section` initially flagged `[GRID_OVERFLOW]` (stories wider than the
grid cell) — fixed via `cfg.overrides.Section: {"cardMode": "column"}`.

## Re-sync risks (forward-looking)

- **`node_modules/wildgate-stat-tracker/` must be recreated** after any
  `npm ci` / fresh clone (see above) — it's intentionally not committed.
- **`cssEntry` copy goes stale** the moment `dist/` is rebuilt — always
  re-copy + re-prepend the font import before re-running the converter
  (see cssEntry section above).
- **Scope**: this campaign targets `src/components/**` only (112
  components). `src/providers`, `src/hooks`, `src/store` etc. are out of
  scope by design (srcDir points at `src/components` specifically) — if
  the user wants provider components synced too, `srcDir` needs
  reconsidering (would pull in non-component PascalCase exports needing
  pruning via `componentSrcMap`).
