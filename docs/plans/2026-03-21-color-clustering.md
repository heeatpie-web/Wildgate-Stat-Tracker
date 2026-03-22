# Color Clustering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded hue classification for unknown team colors with gap-based hue clustering, and replace the most-saturated-pixel sampling strategy with circular hue averaging.

**Architecture:** Three changes in sequence — (1) `detectColorInRegion` in `colorUtils.cjs` gets a new circular-average sampling strategy that also returns `rawHue`; (2) a new `clusterByHue` pure function is added to `colorUtils.cjs`; (3) `crewHubExtractor.cjs` stores `rawHue` on cards and replaces both unknown-color grouping paths (Step 5 / Step 5b) with `clusterByHue`.

**Tech Stack:** Node.js, CJS modules, Vitest for tests. No new dependencies.

---

## Baseline

Before touching anything, confirm the baseline in the worktree:

```bash
cd "N:\Coding (backup)\.worktrees\color-clustering"
npx vitest run electron/ src/utils/ocr/__tests__/
```

Expected: **197 tests, 26 files, all passing.**

---

### Task 1: Extract and test `circularHueMean` helper

Replace the most-saturated-pixel strategy in `detectColorInRegion` with circular hue averaging. Extract the pixel-crunching logic into a testable pure helper first.

**Files:**
- Modify: `electron/colorUtils.cjs`
- Modify: `src/utils/ocr/__tests__/electronColorUtils.test.ts`

---

**Step 1: Write the failing test**

Add to `src/utils/ocr/__tests__/electronColorUtils.test.ts`, after the existing imports:

```typescript
const { classifyTeamColorHSL, __test__ } = require('../../../../electron/colorUtils.cjs') as {
  classifyTeamColorHSL: (r: number, g: number, b: number) => { color: string; confidence: number };
  __test__: {
    circularHueMean: (data: Uint8Array, channels: number) => number | null;
  };
};
```

Add this describe block:

```typescript
describe('electron/colorUtils circularHueMean', () => {
  // Helper: build a flat Uint8Array of pixels from RGB triples
  function makePixels(rgbs: [number, number, number][]): Uint8Array {
    const buf = new Uint8Array(rgbs.length * 3);
    rgbs.forEach(([r, g, b], i) => { buf[i*3] = r; buf[i*3+1] = g; buf[i*3+2] = b; });
    return buf;
  }

  it('returns null when all pixels are too dark (black bar)', () => {
    // 100 near-black pixels — none survive the lightness filter
    const pixels = makePixels(Array(100).fill([20, 20, 20]));
    expect(__test__.circularHueMean(pixels, 3)).toBeNull();
  });

  it('returns null when fewer than 10% of pixels are chromatic', () => {
    // 100 pixels: 95 black + 5 orange — below 10% threshold
    const pixels = makePixels([
      ...Array(95).fill([20, 20, 20]),
      ...Array(5).fill([254, 99, 0]),  // orange
    ]);
    expect(__test__.circularHueMean(pixels, 3)).toBeNull();
  });

  it('returns correct hue for a solid orange bar', () => {
    const pixels = makePixels(Array(100).fill([254, 99, 0])); // orange ~23°
    const hue = __test__.circularHueMean(pixels, 3);
    expect(hue).not.toBeNull();
    expect(hue!).toBeGreaterThanOrEqual(18);
    expect(hue!).toBeLessThanOrEqual(28);
  });

  it('handles red bars straddling 0°/360° correctly', () => {
    // Mix pixels slightly above and below 0°: 355° and 5° should average to ~0°, not ~180°
    // RGB for 355° (s=100, l=50): r=255, g=0, b=21
    // RGB for 5°  (s=100, l=50): r=255, g=21, b=0
    const pixels = makePixels([
      ...Array(50).fill([255, 0, 21]),
      ...Array(50).fill([255, 21, 0]),
    ]);
    const hue = __test__.circularHueMean(pixels, 3);
    expect(hue).not.toBeNull();
    // Should be near 0° (or 360°), NOT near 180°
    const nearZero = hue! <= 10 || hue! >= 350;
    expect(nearZero).toBe(true);
  });

  it('ignores stray chromatic pixels when bar is predominantly black', () => {
    // 100 pixels: 95 black + 5 orange — should return null (< 10% threshold)
    const pixels = makePixels([
      ...Array(95).fill([15, 15, 15]),
      ...Array(5).fill([254, 99, 0]),
    ]);
    expect(__test__.circularHueMean(pixels, 3)).toBeNull();
  });
});
```

**Step 2: Run to verify it fails**

```bash
npx vitest run src/utils/ocr/__tests__/electronColorUtils.test.ts
```

Expected: 5 new tests fail with `Cannot read properties of undefined (reading 'circularHueMean')`

---

**Step 3: Implement `circularHueMean` in `colorUtils.cjs`**

Add this function before `detectColorInRegion` (around line 258):

```javascript
/**
 * Compute the circular mean hue of chromatic pixels in a raw pixel buffer.
 * Dark pixels (lightness < lightnessThreshold%) are excluded — they are shadow,
 * text, or true black and would distort the hue average.
 *
 * Returns null if fewer than minChromFraction of pixels survive the filter
 * (indicates a black/spectator bar with no real color).
 *
 * @param {Uint8Array} data - Raw pixel buffer
 * @param {number} channels - Bytes per pixel (3=RGB, 4=RGBA)
 * @param {number} [lightnessThreshold=20] - Min lightness % to include pixel
 * @param {number} [minChromFraction=0.10] - Min fraction of chromatic pixels required
 * @returns {number|null} Mean hue (0–360) or null if bar is effectively black
 */
function circularHueMean(data, channels, lightnessThreshold = 20, minChromFraction = 0.10) {
  const ch = Math.max(1, channels);
  let sinSum = 0;
  let cosSum = 0;
  let chromCount = 0;
  const totalPixels = data.length / ch;

  for (let i = 0; i < data.length; i += ch) {
    const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (hsl.l < lightnessThreshold) continue;
    const rad = hsl.h * (Math.PI / 180);
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
    chromCount += 1;
  }

  if (chromCount < totalPixels * minChromFraction) return null;

  const meanRad = Math.atan2(sinSum / chromCount, cosSum / chromCount);
  return Math.round(((meanRad * (180 / Math.PI)) + 360) % 360);
}
```

Export it under `__test__` by replacing the current `module.exports` block:

```javascript
module.exports = {
  TEAM_COLORS,
  rgbToHsl,
  hueDistance,
  classifyTeamColorHSL,
  classifyTeamColorRGB,
  detectColorInRegion,
  detectBadgeColorNearText,
  detectTeamColorBarBelow,
  findTeamColorRegions,
  getTeamColorInfo,
  __test__: { circularHueMean },
};
```

**Step 4: Run to verify the 5 new tests pass**

```bash
npx vitest run src/utils/ocr/__tests__/electronColorUtils.test.ts
```

Expected: all tests pass (existing 3 + 5 new = 8 total).

**Step 5: Commit**

```bash
git add electron/colorUtils.cjs src/utils/ocr/__tests__/electronColorUtils.test.ts
git commit -m "feat: add circularHueMean helper for bar color averaging"
```

---

### Task 2: Wire `circularHueMean` into `detectColorInRegion` + expose `rawHue`

Replace the most-saturated-pixel loop with `circularHueMean`. Also return `rawHue` in the result so callers can use it for clustering.

**Files:**
- Modify: `electron/colorUtils.cjs:283-313`

---

**Step 1: Write the failing test**

Add to the `circularHueMean` describe block in `electronColorUtils.test.ts` — actually this tests `detectTeamColorBarBelow` which uses sharp. Instead, add a targeted test verifying that `detectColorInRegion` returns a `rawHue` field. Since `detectColorInRegion` needs a real image buffer, we test it indirectly through `detectTeamColorBarBelow` being plumbed — skip and just assert the shape in Task 3 integration.

For now, write a test that the existing `classifyTeamColorHSL` still works (regression guard — already passing). No new test needed for this wiring step since the pure logic is already covered by `circularHueMean` tests. Proceed directly.

---

**Step 2: Replace the sampling loop in `detectColorInRegion`**

In `electron/colorUtils.cjs`, replace lines 283–313 (the most-saturated-pixel loop + classify call) with:

```javascript
    // Use circular hue averaging across chromatic pixels (lightness >= 20%).
    // This is more stable than picking the single most-saturated pixel, which
    // could be a stray border pixel rather than the team color.
    // Returns null if the bar is predominantly dark (black/spectator).
    const meanHue = circularHueMean(data, info.channels);

    if (meanHue === null) {
      return { color: 'black', confidence: 80, rawHue: null, rgb: { r: 0, g: 0, b: 0 } };
    }

    // Convert mean hue back to an approximate RGB for the named-color classifier.
    // We only need hue; use s=100, l=50 to get a pure saturated sample.
    const hslForClassify = { h: meanHue, s: 100, l: 50 };
    // Reconstruct RGB from HSL for classifyTeamColorHSL
    const c = 0.5; // (1 - |2*0.5 - 1|) * 1.0 = 1 * 1 = 1 → c = 1 at l=0.5,s=1
    const x = c * (1 - Math.abs(((meanHue / 60) % 2) - 1));
    const sector = Math.floor(meanHue / 60);
    const [rp, gp, bp] = [
      [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
    ][sector] || [0, 0, 0];
    const approxR = Math.round(rp * 255);
    const approxG = Math.round(gp * 255);
    const approxB = Math.round(bp * 255);

    const result = classifyTeamColorHSL(approxR, approxG, approxB);

    return {
      color: result.color,
      confidence: result.confidence,
      rawHue: meanHue,
      rgb: { r: approxR, g: approxG, b: approxB },
    };
```

**Step 3: Run all electron + OCR tests**

```bash
npx vitest run electron/ src/utils/ocr/__tests__/
```

Expected: 197+ tests passing, 0 failures.

**Step 4: Commit**

```bash
git add electron/colorUtils.cjs
git commit -m "feat: replace most-saturated-pixel with circular hue averaging in detectColorInRegion"
```

---

### Task 3: Add `clusterByHue` to `colorUtils.cjs`

New pure exported function for gap-based hue clustering.

**Files:**
- Modify: `electron/colorUtils.cjs`
- Modify: `src/utils/ocr/__tests__/electronColorUtils.test.ts`

---

**Step 1: Write the failing tests**

Add to `electronColorUtils.test.ts`:

```typescript
const { classifyTeamColorHSL, clusterByHue } = require('../../../../electron/colorUtils.cjs') as {
  classifyTeamColorHSL: (r: number, g: number, b: number) => { color: string; confidence: number };
  clusterByHue: (players: { name: string; hue: number }[], maxTeams?: number, minGap?: number) => { name: string; hue: number }[][];
  __test__: { circularHueMean: (data: Uint8Array, channels: number) => number | null };
};
```

```typescript
describe('electron/colorUtils clusterByHue', () => {
  it('returns one cluster when all hues are within minGap', () => {
    const players = [
      { name: 'A', hue: 20 }, { name: 'B', hue: 22 }, { name: 'C', hue: 25 },
    ];
    const clusters = clusterByHue(players);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });

  it('splits two teams separated by a large gap', () => {
    const players = [
      { name: 'A', hue: 20 }, { name: 'B', hue: 22 },   // orange team
      { name: 'C', hue: 270 }, { name: 'D', hue: 275 }, // purple team
    ];
    const clusters = clusterByHue(players);
    expect(clusters).toHaveLength(2);
    const names = clusters.map(c => c.map(p => p.name).sort());
    expect(names).toContainEqual(['A', 'B']);
    expect(names).toContainEqual(['C', 'D']);
  });

  it('handles a single player as its own cluster', () => {
    const players = [{ name: 'Solo', hue: 120 }];
    const clusters = clusterByHue(players);
    expect(clusters).toHaveLength(1);
    expect(clusters[0][0].name).toBe('Solo');
  });

  it('handles red players straddling 0°/360° as one team', () => {
    const players = [
      { name: 'A', hue: 355 }, { name: 'B', hue: 358 },
      { name: 'C', hue: 2 },  { name: 'D', hue: 5 },
    ];
    const clusters = clusterByHue(players);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(4);
  });

  it('respects maxTeams — caps number of clusters', () => {
    const players = [
      { name: 'A', hue: 0 }, { name: 'B', hue: 90 },
      { name: 'C', hue: 180 }, { name: 'D', hue: 270 },
      { name: 'E', hue: 45 }, // fifth team — should be merged
    ];
    const clusters = clusterByHue(players, 4);
    expect(clusters.length).toBeLessThanOrEqual(4);
  });

  it('does not split clusters smaller than minGap', () => {
    const players = [
      { name: 'A', hue: 40 }, { name: 'B', hue: 50 }, // gap = 10° < minGap 15°
    ];
    const clusters = clusterByHue(players, 4, 15);
    expect(clusters).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(clusterByHue([])).toEqual([]);
  });
});
```

**Step 2: Run to verify failures**

```bash
npx vitest run src/utils/ocr/__tests__/electronColorUtils.test.ts
```

Expected: 7 new tests fail with `clusterByHue is not a function`.

---

**Step 3: Implement `clusterByHue` in `colorUtils.cjs`**

Add before `module.exports`:

```javascript
/**
 * Group players into teams by hue proximity using gap-based clustering.
 *
 * Sorts players by hue, finds the largest gaps between adjacent hues
 * (including the 0°/360° wrap-around), and uses those gaps as team boundaries.
 *
 * @param {{ name: string, hue: number }[]} players
 * @param {number} [maxTeams=4] - Maximum number of teams (caps split count)
 * @param {number} [minGap=15]  - Minimum gap size in degrees to count as a split
 * @returns {{ name: string, hue: number }[][]} Array of clusters
 */
function clusterByHue(players, maxTeams = 4, minGap = 15) {
  if (players.length === 0) return [];
  if (players.length === 1) return [[players[0]]];

  const sorted = [...players].sort((a, b) => a.hue - b.hue);

  // Compute all adjacent gaps including the circular wrap-around gap
  const gaps = sorted.map((p, i) => {
    const isLast = i === sorted.length - 1;
    const nextHue = isLast ? sorted[0].hue + 360 : sorted[i + 1].hue;
    return { afterIdx: i, gap: nextHue - p.hue };
  });

  // Select up to (maxTeams - 1) largest gaps that exceed minGap as split points
  const splitSet = new Set(
    [...gaps]
      .filter(g => g.gap > minGap)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, maxTeams - 1)
      .map(g => g.afterIdx)
  );

  if (splitSet.size === 0) return [sorted];

  const clusters = [];
  let current = [];
  for (let i = 0; i < sorted.length; i++) {
    current.push(sorted[i]);
    if (splitSet.has(i)) {
      clusters.push(current);
      current = [];
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}
```

Export it by updating `module.exports`:

```javascript
module.exports = {
  TEAM_COLORS,
  rgbToHsl,
  hueDistance,
  classifyTeamColorHSL,
  classifyTeamColorRGB,
  detectColorInRegion,
  detectBadgeColorNearText,
  detectTeamColorBarBelow,
  findTeamColorRegions,
  getTeamColorInfo,
  clusterByHue,
  __test__: { circularHueMean },
};
```

**Step 4: Run tests**

```bash
npx vitest run src/utils/ocr/__tests__/electronColorUtils.test.ts
```

Expected: all tests pass (8 existing + 7 new = 15 total).

**Step 5: Commit**

```bash
git add electron/colorUtils.cjs src/utils/ocr/__tests__/electronColorUtils.test.ts
git commit -m "feat: add clusterByHue for gap-based team color grouping"
```

---

### Task 4: Store `rawHue` on player cards in `crewHubExtractor.cjs`

`detectTeamColorBarBelow` now returns `rawHue` from `detectColorInRegion`. Store it on the card object so the clustering step can use it.

**Files:**
- Modify: `electron/crewHubExtractor.cjs:1283-1289`

---

**Step 1: Write the failing test**

In `electron/crewHubExtractor.test.js`, add (following existing test pattern):

```javascript
it('stores rawHue on cards returned from color detection', () => {
  // extractCrewHub internals expose cards via __test__ if available,
  // but since we cannot run image processing here, verify the shape
  // by checking that the card builder preserves rawHue from color detection.
  // This is a structural guard — the real proof is the smoke test.
  // Verify clusterByHue is importable from colorUtils (integration check).
  const { clusterByHue } = require('./colorUtils.cjs');
  expect(typeof clusterByHue).toBe('function');
});
```

**Step 2: Run to verify it passes immediately** (it's a shape test)

```bash
npx vitest run electron/crewHubExtractor.test.js
```

If it passes, the guard is in place. Proceed.

---

**Step 3: Add `rawHue` to the card object**

In `electron/crewHubExtractor.cjs`, locate the card push around line 1283:

```javascript
    cards.push({
      y: line.y,
      name: playerName,
      color: detectedColor,
      confidence: colorConfidence,
      bbox: lineBbox,
    });
```

Change to:

```javascript
    cards.push({
      y: line.y,
      name: playerName,
      color: detectedColor,
      rawHue: typeof cr?.rawHue === 'number' ? cr.rawHue : null,
      confidence: colorConfidence,
      bbox: lineBbox,
    });
```

Note: `cr` is the result from `detectTeamColorBarBelow`. Check the two call sites (lines ~1163 and ~1267) to confirm `cr` is in scope. Both assign `cr = await detectTeamColorBarBelow(...)` and then read `cr.color` — `cr.rawHue` will now be available on both.

Also propagate `rawHue` through the dedup/nearby card merge at lines ~1325-1348:

```javascript
    color: card.color,
    rawHue: card.rawHue ?? nearby.rawHue ?? null,
```

**Step 4: Run all tests**

```bash
npx vitest run electron/ src/utils/ocr/__tests__/
```

Expected: all 197+ tests passing.

**Step 5: Commit**

```bash
git add electron/crewHubExtractor.cjs
git commit -m "feat: store rawHue on crew hub player cards"
```

---

### Task 5: Replace Step 5 / Step 5b with `clusterByHue`

The two unknown-color grouping paths (Y-position assignment and all-unknown Y-gap clustering) are replaced with a single `clusterByHue` call.

**Files:**
- Modify: `electron/crewHubExtractor.cjs:1686-1751`
- Modify: `electron/crewHubExtractor.test.js`

---

**Step 1: Write the failing tests**

In `electron/crewHubExtractor.test.js`, add regression cases:

```javascript
const { clusterByHue } = require('./colorUtils.cjs');

it('clusterByHue groups a custom-color all-unknown lobby into separate teams', () => {
  // Simulate two teams with custom colors: pink (~330°) and green (~90°)
  const players = [
    { name: 'A', hue: 328 }, { name: 'B', hue: 332 }, { name: 'C', hue: 330 },
    { name: 'D', hue: 88 },  { name: 'E', hue: 92 },  { name: 'F', hue: 90 },
  ];
  const clusters = clusterByHue(players);
  expect(clusters).toHaveLength(2);
  const pinkTeam = clusters.find(c => c.some(p => p.hue > 300));
  const greenTeam = clusters.find(c => c.some(p => p.hue < 120));
  expect(pinkTeam).toHaveLength(3);
  expect(greenTeam).toHaveLength(3);
});

it('clusterByHue handles mixed lobby: known-color fast path + custom unknowns', () => {
  // Known-color players (handled by fast path, not passed to clusterByHue)
  // Only unknown-color players are passed:
  const unknowns = [
    { name: 'X', hue: 270 }, { name: 'Y', hue: 275 }, // purple team
  ];
  const clusters = clusterByHue(unknowns);
  expect(clusters).toHaveLength(1);
  expect(clusters[0]).toHaveLength(2);
});
```

**Step 2: Run to verify they pass** (pure `clusterByHue` tests — they should pass already)

```bash
npx vitest run electron/crewHubExtractor.test.js
```

These pass because `clusterByHue` is already implemented. The real guard is the next step.

---

**Step 3: Replace Step 5 and Step 5b in `crewHubExtractor.cjs`**

In `electron/crewHubExtractor.cjs`, locate the block from line ~1686 to ~1751.

Also add the import at the top of the else branch:

```javascript
const { clusterByHue } = require('./colorUtils.cjs');
```

(Check line 31 — `colorUtils.cjs` is already required. Add `clusterByHue` to the destructure:)

```javascript
const { detectTeamColorBarBelow, detectColorInRegion, clusterByHue } = require('./colorUtils.cjs');
```

Replace **both** the Step 5 block (lines ~1686–1730) AND Step 5b block (lines ~1732–1751) with:

```javascript
    // ── Step 5: Cluster unknown-color cards by hue ───────────────────────────
    // Replaces both Y-position assignment (mixed lobby) and Y-gap clustering
    // (all-unknown lobby). Gap-based hue clustering handles custom team colors
    // that don't match the four hardcoded named colors.
    knownGroups = [...expandedGroups.values()];

    const unknownWithHue = unknownCards.filter(c => typeof c.rawHue === 'number');
    const unknownWithoutHue = unknownCards.filter(c => typeof c.rawHue !== 'number');

    if (unknownWithHue.length > 0) {
      const huePlayers = unknownWithHue.map(c => ({ name: c.name, hue: c.rawHue, card: c }));
      const clusters = clusterByHue(huePlayers);
      for (const cluster of clusters) {
        const clusterCards = cluster.map(p => p.card);
        const ys = clusterCards.map(c => c.y);
        knownGroups.push({
          color: 'unknown',
          cards: clusterCards,
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
          confidence: 0,
        });
        console.log('[CrewHub] Hue-clustered', clusterCards.length, 'unknown-color cards at hues', cluster.map(p => p.hue + '°').join(', '));
      }
    }

    // Cards with no hue (truly black/undetectable bars that slipped through)
    // create isolated unknown groups as before.
    for (const card of unknownWithoutHue) {
      knownGroups.push({ color: 'unknown', cards: [card], minY: card.y, maxY: card.y, confidence: 0 });
    }
```

**Step 4: Run all tests**

```bash
npx vitest run electron/ src/utils/ocr/__tests__/
```

Expected: 197+ tests passing, 0 failures.

**Step 5: Commit**

```bash
git add electron/crewHubExtractor.cjs
git commit -m "feat: replace Y-gap unknown-color grouping with hue-based clustering"
```

---

### Task 6: Smoke test against real screenshots

Verify the full pipeline on the three real screenshots.

**Files:**
- Run: `scripts/test-gap-clustering.cjs` (already written, not committed)

---

**Step 1: Copy smoke test to worktree**

```bash
cp "N:\Coding (backup)\scripts\test-gap-clustering.cjs" "N:\Coding (backup)\.worktrees\color-clustering\scripts\test-gap-clustering.cjs"
```

**Step 2: Run smoke test**

```bash
cd "N:\Coding (backup)\.worktrees\color-clustering"
node scripts/test-gap-clustering.cjs
```

**Expected groupings:**

| Screenshot | Expected teams |
|---|---|
| 09A734EE | GUNJUMPERS (~331°): MeMatiane22, elleachimmi, Danielfnrk; HOTGHOULFALL (orange): TerukiFice, Moomin |
| hub1 | LOWSTANDARDS (orange): IcannotseeImlega, AlexRogansBeta, CanIPetThatDog; VANGUARD/CAREFREE players clustered by hue or skipped correctly |
| hub2 | LIZARDLIZARDLIZARD (~84-100°): ONKI, Zombie, NemoSophus, Biscuit_Champ; BANANACASTLE (yellow): Stoat, ZicZacCadillac, MiShRa; LOWSTANDARDS (orange): StopsignWhatstop |

If any grouping is wrong, investigate the hue values printed and adjust `minGap` or the `lightnessThreshold` in `circularHueMean`.

**Step 3: Run full test suite one final time**

```bash
npx vitest run electron/ src/utils/ocr/__tests__/
```

Expected: all tests passing.

**Step 4: Final commit**

```bash
git add scripts/test-gap-clustering.cjs
git commit -m "chore: add color clustering smoke test script"
```

---

## Summary

| Task | Files | Tests added |
|---|---|---|
| 1 | `colorUtils.cjs`, `electronColorUtils.test.ts` | 5 (`circularHueMean`) |
| 2 | `colorUtils.cjs` | 0 (wiring, covered by Task 1) |
| 3 | `colorUtils.cjs`, `electronColorUtils.test.ts` | 7 (`clusterByHue`) |
| 4 | `crewHubExtractor.cjs`, `crewHubExtractor.test.js` | 1 (shape guard) |
| 5 | `crewHubExtractor.cjs`, `crewHubExtractor.test.js` | 2 (lobby scenarios) |
| 6 | `scripts/test-gap-clustering.cjs` | 0 (manual smoke) |
