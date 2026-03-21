# Color Clustering for Custom Team Colors

**Date:** 2026-03-21
**Branch:** `feature/color-clustering`
**Status:** Approved

## Problem

The app's team color detection in `colorUtils.cjs` hardcodes four hues: red (0°), orange (23°), yellow (42°), yellowGreen (60°). Users can set custom team colors in-game. When custom colors are used, all player bars return `unknown` from the classifier and fall back to Y-gap clustering, which is positional and unreliable.

A secondary issue: the current `detectColorInRegion` picks the single most-saturated pixel in the bar region. One stray chromatic pixel (card border, anti-aliasing) can misclassify an entire bar. This caused CAREFREE (a truly black bar) to be read as red in one screenshot.

## Approach

**Fast path preserved:** Named colors (red/orange/yellow/yellowGreen/black) continue to be detected and grouped as before. No changes to that logic.

**Unknown-color players:** After fast-path groups are built, remaining unknown-color players are grouped by gap-based hue clustering rather than Y-position assignment.

**Sampling overhaul:** Replace most-saturated-pixel with circular hue averaging. This fixes the stray-pixel bug and makes the "is this black?" check principled rather than threshold-based.

## Design

### 1. Color Sampling — `detectColorInRegion` (`colorUtils.cjs`)

Replace the most-saturated-pixel loop with circular hue averaging:

1. Loop all pixels in the sampled bar region
2. Filter out dark pixels where lightness < 20% — these are shadow, text pixels, or true black
3. Of remaining chromatic pixels, compute circular mean hue:
   - `meanHue = atan2(mean(sin(hue)), mean(cos(hue)))`
   - Correctly handles red bars straddling 0°/360°
4. If fewer than ~10% of pixels survive the brightness filter → return `{ color: 'black' }`
5. Otherwise → pass `meanHue` through existing named-color classifier

This replaces `regionIsBlack` entirely. The black/spectator decision becomes "did enough chromatic pixels survive?" rather than a tuned avgSat/avgLight threshold.

The raw average hue is stored on the card object alongside the named color, for use by the clustering step.

### 2. Gap-Based Clustering — new `clusterByHue` (`colorUtils.cjs`)

```
clusterByHue(players: { name, hue }[], maxTeams = 4, minGap = 15): string[][]
```

Algorithm:
1. Sort players by hue (0–360°)
2. Compute all adjacent gaps including the 0°/360° wrap-around
3. Take the largest gaps as split points, up to `maxTeams - 1`
4. Ignore gaps smaller than `minGap` (prevents splitting within-team noise)
5. Return array of clusters, each cluster is an array of player names

`minGap = 15°` — the tightest gap between any two default named colors is 18° (yellow→yellowGreen). 15° tolerates a few degrees of sampling variance while keeping distinct teams separate.

Pure function — no image processing. Easy to unit test with synthetic hue arrays.

### 3. Extractor Integration (`crewHubExtractor.cjs`)

**Card object:** Add `rawHue: number | null` field populated when bar color is sampled. `null` for black/skipped cards.

**Grouping — replace both unknown-color paths:**

Current code has two branches for unknown-color players:
- Mixed lobby (some known, some unknown) → unknowns assigned to nearest known group by Y-position
- All-unknown lobby → Y-gap clustering

Both replaced by one path:
1. Build fast-path groups from known-color players as before
2. Collect all remaining unknown-color players (those with `rawHue !== null`)
3. Run `clusterByHue` on their hues
4. Each resulting cluster → new team group

The existing spectator card detection ("Skipping spectator/black card" log lines) operates independently and is unchanged.

## Testing

### Unit tests (`electronColorUtils.test.ts`)
- `circularHueMean`: red bars straddling 0°/360° average correctly; pure black arrays return null
- `clusterByHue`: correct cluster count and membership for various hue distributions; single-player clusters; wrap-around cases; minGap enforcement

### Regression tests (`electronCrewHubExtractor.test.ts`)
- Existing 4 tests stay green
- New cases: all-custom lobby, mixed lobby, all-default lobby

### Baseline
- 197 tests across 26 files passing before any changes (established in worktree)
- `regionIsBlack` tests added in main session removed (approach replaced)

### Live smoke test
- `scripts/test-gap-clustering.cjs` run against hub1.png, hub2.png, 09A734EE screenshot
- Expected: VANGUARD players correctly clustered, CAREFREE correctly skipped, LIZARDLIZARDLIZARD fully grouped

## Files Changed

| File | Change |
|---|---|
| `electron/colorUtils.cjs` | Replace most-saturated-pixel with circular hue averaging; add `clusterByHue`; remove `regionIsBlack` |
| `electron/crewHubExtractor.cjs` | Add `rawHue` to card object; replace both unknown-color grouping paths with `clusterByHue` |
| `src/utils/ocr/__tests__/electronColorUtils.test.ts` | Remove `regionIsBlack` tests; add `circularHueMean` and `clusterByHue` tests |
| `electron/crewHubExtractor.test.js` | Add mixed/custom/default lobby grouping cases |
| `scripts/test-gap-clustering.cjs` | Smoke test (not committed) |
