# Root-Cause Report — 11 Reported Defects

Date: 2026-07-29 · App version `v3.10.2` · Status: **investigation only, no code changed**

All file:line references were spot-verified against the working tree. Where a claim could not
be confirmed by static reading alone, it is marked **UNCONFIRMED**.

---

## Headline findings

Three things are worth reading before the detail:

1. **Two separate bugs share one root cause.** The INTEL tab's "no squad history" and
   "aliases split into separate entries" are the same defect: `src/utils/pregameAdvice/*`
   never routes through the canonical identity layer that Analytics uses. One fix closes both.
2. **One reported symptom is already implemented as requested.** The ship-elimination popup
   timeout is *already* 30 seconds (`ShipKillPopup.tsx:8`). The real bug is different — see §6.
3. **The map/ship problem is half-fixed already.** Yesterday's commit `87f523e` added a proper
   `mapTypes` catalog on the Electron side. The renderer never learned about it. See §1.

---

## 1 · Map names read as ship names — *Deadworlds / Cryon Rift / Gloaming Expanse*

**Status of the catalog (verified):** `electron/hazardCatalog.json` has a top-level `mapTypes`
array containing all three maps with aliases (`DEADWORLDS`, `DEAD WORLDS`, etc.). "Gloaming
Expanse" is **no longer** in `hazards` — commit `87f523e` correctly moved it out. The
`src/utils/changelog.ts:493` line calling it a Reach Modifier is stale history, not a live conflict.

**Root cause — the renderer has no map catalog at all.** `grep -rn "mapTypes" src/` returns
**zero hits**. `src/utils/constants.ts:75-126` builds `UI_REACH_MODIFIERS` and
`KNOWN_HAZARD_NAMES` from `hazards` + `artifacts` only, and never reads `HAZARD_CATALOG.mapTypes`.
There is no `MAPS` constant analogous to `SHIPS`.

**Where it bites** — `src/utils/scan/tacticalScan.ts:104-113`, the renderer-side fallback scanner:

```ts
if (line.text.length > 2 && !/READY|LOBBY|MATCH/i.test(line.text)) {
    const isShip = SHIP_TYPES.some(st => upper.includes(st)) || /MURDER|SPAGHURDER|.../.test(upper);
    const isModifier = UI_REACH_MODIFIERS.some(mod => upper.includes(mod.toUpperCase())) || ...;
    if (!isShip && !isModifier) {
        nameLines.push(line);   // ← map names land here
    }
}
```

There are exactly two exclusion buckets: ship and modifier. A line reading `GLOAMING EXPANSE`
matches neither, so it falls through into `nameLines` and is emitted at `tacticalScan.ts:150-158`
as a **fabricated player/roster entry**, tagged with whatever team colour was sampled nearby.
That entry then carries a `shipType`/`teamName` through the identity system.

This path is live, not dead code: `src/utils/scan/smartAnalyze.ts:93` calls it as last-resort
fallback whenever the primary Electron OCR pass returns zero players/modifiers.

**Secondary gap** — `SmartScanResult` (`src/utils/scan/types.ts:68-72`) has no `mapType` field,
and `processWithLocalOCR` (`src/utils/scan/localScan.ts:116-163`) never reads `ocrData.mapType`
even though the IPC response carries it. Anything consuming `smartAnalyzeScreen()` never sees
the map name.

**Not the cause (ruled out):** `looksLikeShipEntity` / `SHIP_KEYWORDS` in
`src/components/IdMapper.tsx:40-74` — none of `drone|privateer|interceptor|gunship|fighter|
frigate|raider|brawler|carrier` collide with the three map names. Also not fuzzy matching:
`findShipType` in `electron/mapScreenExtractor.cjs` has no near-miss against these strings.
It is a plain missing-bucket fallthrough.

**Fix**
- Export `MAP_TYPES` + an `isKnownMapName()` lookup from `src/utils/constants.ts`, sourced from
  `HAZARD_CATALOG.mapTypes` (mirror the existing `UI_REACH_MODIFIERS` pattern).
- Add a third `isMapName` bucket to `tacticalScan.ts:104-113`.
- Thread `mapType` through `SmartScanResult` and `processWithLocalOCR`.
- Add a `looksLikeMapEntity` negative guard to `IdMapper.tsx` (future-proofing — a future map
  named e.g. "Raider's Rest" *would* misroute today).
- Also worth fixing: `src/utils/scan/lobbyScan.ts:195-217` assigns `validLines[1]` to `teamName`
  with no validation at all — same class of bug (see §8).

**Blast radius:** `constants.ts`, `tacticalScan.ts`, `localScan.ts`, `scan/types.ts`,
`lobbyScan.ts`, `IdMapper.tsx`. **No Electron changes needed.**
**Tests:** `src/utils/scan/__tests__/tacticalScan.test.ts` exists but has no map-exclusion
assertion. No test asserts `KNOWN_MAP_TYPES` and `KNOWN_HAZARD_NAMES` are disjoint.

---

## 2 · Merging and OCR confirmation are slow

Ranked by impact.

### 2a — OCR confirm fires 3 store commits per corrected name (primary)

`src/components/OcrCorrectionModal.tsx:1050-1084`, in `handleSubmitCorrections`:

```ts
Object.entries(effectiveCorrections).forEach(([ocrName, correctedName]) => {
    ...
    recordOcrAliasCorrection?.(ocrName, correctedName, { source: 'review_modal', ... });
    recordOcrCorrection?.(ocrName, correctedName);   // ← wrapper that calls the line above again
    setPlayerName(ocrName, correctedName);
});
```

Each is its own Zustand `set()` in `createMappingSlice.ts`, and `recordOcrCorrection`
(`createMappingSlice.ts:1130-1136`) is a compatibility wrapper that re-invokes
`recordOcrAliasCorrection` internally. **3 commits per name, 2 of them redundant.** For a
16-player match with several corrections that is 15–45 full store commits on one click.

`src/store/middleware/skipEmptyUpdates.ts` documents the per-commit cost in its own header:
every `set()` notifies every subscriber, re-renders every `useGameData()` consumer, and queues a
full database write. `applyResolvedPlayerLayers` (`createMappingSlice.ts:626-654`) additionally
shallow-clones `knownMappings`, `uidMappings.players`, `playerProfiles` and `detectedUnknowns`
on each one.

### 2b — Analytics rebuilds the identity resolver on every one of those commits

`src/components/analytics/useAnalyticsData.ts:310-349` calls `buildAnalyticsIdentityResolver`
and `canonicalizeMatches(matches)` with **no `useDeferredValue`** — unlike `PlayerHub.tsx:425`,
which does defer. Because `src/App.tsx:4845-4847` keeps visited views mounted
(`mountedViews[view]` keep-alive rather than unmount), the Analytics hook stays live and
re-canonicalises the **entire match history synchronously** every time `knownMappings` or
`playerProfiles` changes. Combined with 2a this is N × O(all matches) per confirm click.

### 2c — Merge suggestions are O(n²) Levenshtein, recomputed per merge

`src/utils/rosterMergeSuggestions.ts:127-145` scores every pair in the pilot registry via
`combinedNameSimilarityScore` (full Levenshtein matrix, `src/utils/stringUtils.ts:312-324`).
At 450 pilots that is ~101,000 scoring calls. It *is* correctly gated to `panelMode === 'merges'`
and driven off `useDeferredValue` (`PlayerHub.tsx:425,458-474`) — but every merge mutates the
registry, so the whole pass reruns while the Merges tab stays open.

### Ruled out (checked, not the problem)

- `mergePilotsBatch` / `mergePilots` (`createDataSlice.ts:1374-1514`) already do **one** `set()`
  per action — a previously-fixed bottleneck, still fixed.
- Persistence is **not** synchronous: `customStorage.setItem` debounces 300ms
  (`runtimeConfig.storage.saveDebounceMs`) and writes async via `ipc.invoke('db-write')`.
- No `ipcRenderer.sendSync` and no per-item IPC round-trips on either path.
- `createRosterFuzzyMatcher` rebuilds per `useMemo`, not per keystroke — secondary at most.

**Fix**
- Add a batched `applyOcrCorrections(entries)` action to `createMappingSlice.ts`, modelled on
  the existing `recordPlayerSightings` batch (`createMappingSlice.ts:870-959`) — one alias-model
  update and one mappings update for all N corrections.
- Drop the redundant `recordOcrCorrection` call at the confirm site.
- Wrap `useAnalyticsData`'s identity inputs in `useDeferredValue`, matching `PlayerHub.tsx`.

**Blast radius:** `createMappingSlice.ts`, `OcrCorrectionModal.tsx`, `useAnalyticsData.ts`.
Store shape unchanged; single-item actions stay for other callers.

---

## 3 · OCR blocking prompt has no real progress bar

The bar is real but effectively binary. `src/components/recording/ActionPanel.tsx:999-1034`
(`OcrDecisionPrompt`, a `fixed inset-0` blocking overlay) renders `processingPercent`, computed
at `ActionPanel.tsx:449-453` from `processingProgress.current/total` — a count of **whole
screenshots completed**. For the common single-screenshot case it can only ever read `0/1` then
`1/1`, so it sits frozen for the several seconds the OCR actually takes.

**Meanwhile, granular per-stage progress already exists and works** — it drives the "Re-run OCR"
bar in `OcrCorrectionModal.tsx:868-869,1580-1601`.

| Link in the chain | Status |
|---|---|
| Main process emits stage events (`createOcrProgressReporter`, `electron/ocrHandler.cjs:1795-1828`) | exists |
| IPC channel `ocr-progress` | exists |
| Preload whitelist + exposure (`electron/preload.cjs:76,115-121`) | exists |
| `useOcrProgress` / `useOcrProgressListener` hook | exists |
| `rerun-ocr-on-artifact` handler passes `onStage` | **MISSING** |
| `useSmartCapture` / `ActionPanel` subscribe to `ocr-progress` | **MISSING** |

Verified: `electron/main.cjs:2146` registers `rerun-ocr-on-artifact`, and its `processCapture`
call at `main.cjs:2166` omits `onStage`. Its near-identical sibling `rerun-ocr-multi`
(`main.cjs:2229-2237`) *does* wire it, as does `ocr-process-capture` (`main.cjs:2987-2996`).
This reads as a wiring oversight, not a design decision. Neither `ActionPanel.tsx` nor
`useSmartCapture.ts` imports the progress hook at all.

**Fix:** add `onStage: createOcrProgressReporter(event.sender, {...})` to the
`rerun-ocr-on-artifact` handler (copy the sibling), then have `useSmartCapture` blend the
in-flight fraction: `(completed + currentImageFraction) / total`. `ActionPanel` needs no change —
it already renders whatever percent it is given.

**Blast radius:** low. Both the channel and the consumer pattern are proven elsewhere.
**Tests:** `useOcrProgress.test.ts` covers the hook. No test asserts `rerun-ocr-on-artifact`
forwards `onStage`. **UNCONFIRMED** whether `ActionPanel.test.tsx` asserts on the progress bar.

---

## 4 · Seeds tab does not match the design system

**Note first:** there is no `DESIGN_SYSTEM.md`. The rules are de facto, defined in
`tailwind.config.js:13-264` (MD3 tokens, type scale, shape tokens) and `src/index.css:1030-1219`
(`.md3-card`, `.mg-surface*`, Twilight-mode glass overrides). I have only flagged deviations
from patterns actually established in code.

| Deviation | SeedsPanel | Correct pattern |
|---|---|---|
| Raw stock Tailwind palette (`amber-400/500`, `green-500`, `red-500`) instead of semantic status tokens | `:487`, `:563`, `:705-708` | `HistoryTable.tsx:536-539` uses `bg-success/20 text-success`, `bg-danger/20 text-danger`; `TelemetryPanel.tsx:40,72,81-82` |
| **`text-title-lg` is not a real class** — `tailwind.config.js:13-22` defines only `label-xs`, `label-sm`, `body`, `title`, `heading`. These three spans render with no size applied. | `:576`, `:585`, `:594` | Use `text-title` / `text-heading`. Only one other file repeats this typo (`VideoImportDropZone.tsx`), confirming it is not a token |
| Hand-rolled panel chrome — loses MD3 elevation and Twilight glass treatment | `:323`, `:523` (`bg-md-sys-surface border ... shadow-sm`) | `AnalyticsCard.tsx:37-43` (`mg-surface-high`), `TelemetryPanel.tsx:32` (`md3-card mg-blur`) |
| Native `<input>` with plain `:focus`, no `<label>` (placeholder only) — **inconsistent within its own file**: the Mode/Ship/Hazard `<select>`s two lines away use `focus-visible:ring-2` correctly | `:439-445` vs. `:402,413,424` | `ui/Input.tsx:42-46` |
| No `aria-pressed` / active-state semantics on Sort toggle or seed rows | `:342-364`, `:463-515` | `AnalyticsShell.tsx:515` uses `data-active` + CSS selector |
| No loading affordance while tactical-map thumbnails resolve — undefined renders nothing | `:667-698` | `TelemetryPanel.tsx:86-90` (`animate-spin` + status text) |

**Not flagged:** spacing scale (no documented rule; SeedsPanel matches `AnalyticsCard.tsx:46-52`),
and non-use of `ui/Button` — only 5 files repo-wide import it, and the reference panels don't either.

**Tests:** `SeedsPanel.test.tsx` only tests the lightbox and asserts one accessible name
(`'Close tactical map preview'`, line 112). Styling changes are low-risk; don't rename that label.

---

## 5 · Match categories ("tags") bug out on reuse + Analytics wiring

**Data model:** `Match.matchCategory?: string` (`src/types.ts:263`) — a single optional free-text
string. Not an array, not an id into a vocabulary. No vocabulary is persisted anywhere; there is
no autocomplete. Every entry is retyped.

### Bug A — no case-folding, so duplicates fragment silently

```ts
// src/utils/matchCategory.ts (verified, complete file)
export const normalizeMatchCategory = (value: unknown): string => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 48);
};
```

"Ranked", "ranked" and "RANKED" are three distinct stored values. Every other free-text
dimension routes through `dedupeByCaseInsensitive`
(`src/components/patch/patchEntityCatalog.ts:77-89`); category does not.

### Bug B — the draft field is global, not per-match, and never resets

`currentMatchCategory` is one flat string on the form slice
(`src/store/slices/createFormSlice.ts:91,156`), and at save time it takes **top priority**:

```ts
// src/hooks/useMatchSubmission.ts:115-121, called at :1024, :1532-1536, :1848-1852
const resolveMatchCategory = (...values) => { for (const v of values) { const n = normalizeMatchCategory(v); if (n) return n; } };
```

The only reset to `''` anywhere in the repo is the explicit clear button at
`MissionPanel.tsx:740`. The Win/Loss shortcuts (`App.tsx:3494-3495`) clear `pendingMatchData`
but not `currentMatchCategory`, and there is no slice-wide reset helper.

Result: tag match A "Ranked" → submit → start match B → `MissionPanel.tsx:213-217` pre-fills the
stale value **and** `resolveMatchCategory` stamps "Ranked" onto match B even if untouched.
**UNCONFIRMED at runtime** — this is a static-analysis root cause, not a reproduced repro.

### Bug C — no post-hoc edit path (likely the main day-to-day pain)

`EditMatchModal.tsx` has **no** category field. `HistoryTable.tsx:852,1092` renders the badge
read-only. The only ways to set a category are the live MissionPanel editor during recording, or
reopening the SmartCaptures wizard for that match (`SmartCapturesPanel.tsx:3070,3165`). Once
saved, a typo is permanent — which is precisely why a tag "can't be reused reliably."

**Ruled out:** mutation-by-reference (always a primitive string at every write site) and React
key collisions (no multi-category UI exists — `MatchCategoryBadge.tsx` renders one string).

### Analytics wiring plan (mirrors the existing `ship` dimension)

1. `src/types.ts:498` — add `'category'` to `EntityDimensionKey`; `:514-520` — add
   `category: string[]` to `EntityAnalyticsFilters`.
2. `patchEntityCatalog.ts` — add `getMatchCategory(match)` (mirror `getMatchShip:163-166`),
   case-folding the **grouping key** while preserving display casing. This fixes Bug A.
3. `useAnalyticsData.ts` — `buildEntityRows` switch (`:159-213`), `matchPassesFilters`
   (`:215-237`), `EMPTY_ENTITY_FILTERS` (`:97-103`), `EMPTY_ENTITY_ANALYTICS.dimensions`
   (`:247-253`), `entityAnalytics.dimensions` (`:543-549`).
4. `AnalyticsShell.tsx` — filter init (`:116-122`), `activeFilterCount` (`:140-146`),
   `categoryFilterOptions` memo (mirror `shipFilterOptions:171-174`), popover `<select>`
   (mirror `:558-612`), `activeContextTags` (`:187-201`).
5. `EntityAnalyticsView.tsx:160-172` — add `category: 'Categories'` to `SECTION_LABELS`.
   **UNCONFIRMED:** whether `DrillDownTarget['type']` already accepts a `'Category'` member.
6. Fix Bug A **before** shipping the dimension, or "Ranked"/"ranked" appear as two rows.

**Tests:** `createFormSlice.test.ts:260-425` covers whitespace normalisation only, not the
cross-match leak. `scan/__tests__/tagMetadataResolution.test.ts` is **unrelated** — different
"tag" concept (OCR team labels).

---

## 6 · Ship-elimination popup duration — *reported symptom does not match the code*

**`ShipKillPopup.tsx:8` is already `const AUTO_DISMISS_MS = 30_000;`** — 30 seconds, the value
you asked for. I verified nothing else dismisses it: the only callers of `dismissShipKillPopup`
are the popup's own timer and `App.tsx:5115`; nothing unmounts the wrapper early.

Two things could explain the "too short" perception:

1. **`ShipKillPopup.tsx:37-44` (`adjust`) cancels the timer permanently on first interaction**
   rather than restarting it — it sets `interactedRef.current = true` and `clearTimeout`s, but
   never calls `resetTimer()`. So the behaviour is inverted from what feels natural: touch it
   once and it stays forever; don't touch it and it vanishes at exactly 30s from **mount**.
2. **The timer starts at Win detection** (`App.tsx:3820`), not when you get back to the desktop.
   If the result screen and post-match flow eat those 30 seconds, the popup is already gone by
   the time you look.

**Recommendation:** make it configurable (default 30s, range 10–120s) *and* fix the
interaction-cancels semantics. Suggest also adding a "keep until dismissed" option at max, since
(2) means no fixed timeout is reliably long enough.

**Fix pattern** (mirror `ocrNameRerouteThreshold`, an existing clamped numeric slider):
`createSettingsSlice.ts` (constants + `normalize*` + interface + default + setter) →
`useAppStore.ts` **three** touch points (`setItem` settings object ~:275-360, `getItem`
hydration ~:504, `partialize` ~:681-788) → `SettingsModal.tsx` (selector + `<input type="range">`
copying `:2167-2180`, **plus** the hand-maintained duplicate snapshot in `handleSaveAndClose`
`:1066-1115`) → `ShipKillPopup.tsx` → `App.tsx:5104-5124` prop.

> Trap: missing any one of the three `useAppStore.ts` sites or the `handleSaveAndClose`
> duplicate makes the setting silently reset on relaunch.

---

## 7 · Volume option

**Current state:** there are no audio *files* in the repo. All 13 sounds are synthesised via Web
Audio in `src/hooks/useSoundEffects.ts`. A boolean `soundEnabled` already exists end-to-end
(`createSettingsSlice.ts:299,373,556` → `UserPreferencesProvider.tsx` → toggle at
`SettingsModal.tsx:1700`). **No volume level exists.**

**There is exactly one choke point.** Every sound routes through `playTone`
(`useSoundEffects.ts:31-74`), whose peak gain is the hardcoded literal at line 50:

```ts
gain.gain.exponentialRampToValueAtTime(0.11, startAt + 0.01);
```

**Fix:** add `soundVolume: number` (0–100, default 100) via the same settings plumbing as §6,
then scale that one literal:

```ts
const peakGain = 0.11 * Math.max(0, Math.min(1, soundVolume / 100));
```

Zero call-site changes — all 13 sound functions and every consumer are untouched. Add
`soundVolume` to `playTone`'s `useCallback` deps (note: `soundEnabled` appears to be missing
from that dep array today too — worth checking).

**Blast radius:** very low. Place the slider directly under the existing "Sound Effects" toggle.
**Tests:** no test file for `useSoundEffects.ts`. Check `SettingsModal.test.tsx` for
settings-shape snapshots.

---

## 8 · Telemetry signals indicator stuck at 1/3

**The indicator is not in `TelemetryPanel.tsx` or `SystemPulse.tsx`.** It is
`src/components/recording/SquadronPanel.tsx:89,166`, computed at `:30-33` (verified):

```ts
const hasMatchTelemetry = Boolean(isMatchInProgress || telemetryActivity === 'receiving');
const telemetrySignalsFilled = (telemetryDetectedShip ? 1 : 0) + (telemetryDetectedHero ? 1 : 0) + (hasMatchTelemetry ? 1 : 0);
```

Signal 3 (`isMatchInProgress`) is a reliable lifecycle flag — that's the "1" that is always lit.
Signals 1 and 2 come **only** from `setActiveShip(name, 'telemetry')` / `setActiveHero(...)` at
`useLogMonitor.ts:2127,2173`. Reaching those lines requires **four** gates to pass, each a silent
failure point:

| Gate | Location | Fails when |
|---|---|---|
| `allowSessionEvent` | `useLogMonitor.ts:1462,1481-1484` | event timestamp outside session window |
| `isLoadoutBearingEvent` | `:1464-1468` | event name/keys don't match `NebLoadoutSaved` / `NebCloudSaveRecordSize` patterns |
| `shouldApplyLoadout` | `:1837-1849` | actor ID/name doesn't correlate to local player via `activeUserRef`/`playerIdMapRef` |
| `resolveTelemetrySelection` | `:2022-2092` | GUID/name not found in `SHIP_GUIDS`/`HERO_GUIDS` or the `SHIPS`/`CHARACTERS` catalogs → returns `''` |

Any one failure leaves both flags `undefined` for the whole match with **no error surfaced** —
the UI just reads 1/3 forever. That matches the symptom exactly. Priority conflicts with a manual
override are **not** the cause: `createFormSlice.ts:230,273` writes
`telemetryDetectedShip`/`telemetryDetectedHero` unconditionally even when the priority gate
skips `activeShip` itself.

**"Not detecting ship changes"** — `TELEMETRY_STABILIZATION_AUDIT.md:279-287,360` already flags
this as an open, unverified risk in the codebase's own words: *"Shared ship-selection suppression
may hide valid updates after an earlier local telemetry event."* Mechanism:
`localTelemetryShipSelectionRef` (`useLogMonitor.ts:675,2156-2166`) is only cleared when
`shipSource !== 'telemetry'` (i.e. a manual override, `:1204-1207`). A later legitimate ship
change arriving via the *shared* path can be suppressed in favour of the stale local ref.
**UNCONFIRMED** in practice — depends on live event ordering that can't be reproduced statically.

**Not related to §1.** Telemetry ship/hero detection reads JSON game-log events and GUIDs only;
it never touches OCR text. There is no path by which an OCR'd map name reaches
`telemetryDetectedShip`.

**Recommended next step:** this is the one item that needs a *diagnostic build*, not a blind fix.
The hook already has `traceTelemetryLoadout` / `IS_TELEMETRY_DEBUG` (`:586-589`). Instrument the
four gates, capture one real match, and the failing gate falls out immediately. Also consider
decoupling the counter from `isMatchInProgress` — mixing a trivially-true lifecycle flag with two
fragile resolution flags produces a misleading "1/3 forever" even when telemetry is behaving.

**Tests:** `SquadronPanel.test.tsx:56,67,78` asserts 3/3 is reachable and that stale idle status
doesn't fake a signal. No test covers mid-match ship change or the shared-vs-local suppression.

---

## 9 · INTEL tab — three defects, largely one root cause

**The INTEL tab is** `src/components/PregameAdvicePanel.tsx`, rendered from
`RecordingView.tsx:202-209` when `workspaceTab === 'intel'` (tab button at `:119-153`). It is
handed `allMatches={matches}` straight from `useGameData()` (`RecordingView.tsx:21`) — **raw,
uncanonicalised store data.** It calls into `pregameAdvice/matchAdvice.ts`, `engine.ts`,
`history.ts`.

### 9a — Threats identified by ship name instead of player

Chained, two-part:

1. `src/utils/scan/lobbyScan.ts:195-217` — the lobby UI shows player name over *ship class*;
   the scanner assigns that second line to a field literally called `teamName`:
   ```ts
   let teamName = "Unknown Ship";
   if (validLines.length >= 2) { playerName = validLines[0].cleanName; teamName = validLines[1].cleanName; }
   ```
   So `teamName` is frequently the string `"Hunter"`.
2. Nothing downstream rejects it. `isPlaceholderTeamName` (`ocrParser.ts:88-95`) and
   `normalizeTeamName` (`useSmartCapture.ts:763-768`) filter `team\d*` / `unknown` only — never
   `SHIPS`. It passes `hasMeaningfulEnemyTeamName` and persists to
   `Match.opponentTeams[].teamName` (`useMatchSubmission.ts:440`).
3. `engine.ts:242,259,443-444` then labels the threat with `team.teamName` — even though the
   same block already computes **per-player** win rates (`playerWRs`, `:195-207`) that would
   identify the actual losing-record player. Hence "beware the Hunter."

**Fix:** extend the placeholder guards to reject `SHIPS` entries (reuse the `looksLikeShipEntity`
approach from `IdMapper.tsx:68-74`), and change `engine.ts` to prefer the top `playerWRs` entrant
for the copy, falling back to `teamName` only when no player signal exists (preserving the
ship-only case at `pregameAdvice.test.ts:443`).

### 9b — Own squad shows no shared history · 9c — aliases split into separate entries

**Same root cause.** `PregameAdvicePanel.tsx:135-148` compares teammates with cosmetic
normalisation only:

```ts
const normName = (v: string) => String(v || '').trim().toLowerCase();   // :80
const withThem = pool.filter(e => (e.teammates || []).some(t => normName(t) === normName(name)));
```

and `matchAdvice.ts:10-20` (`dedupeStrings`) dedupes opponents by `trim().toLowerCase()` key.
Neither routes through the alias/canonical-identity layer. Any OCR drift or genuine alias
between sessions means the historical match never matches → sample size zero → "no history",
and two variants of one player become two INTEL entries.

Analytics does this **correctly**: `useAnalyticsData.ts:310-349` builds
`buildAnalyticsIdentityResolver({...})` and calls `canonicalizeMatches(matches)` *before* any
social/synergy computation. `analyticsIdentity.ts:212-223` (`canonicalizeNames`) already dedupes
by canonical key. The pregame-advice module never calls it — grep confirms **zero** references to
`ocrAliasEngine`, `analyticsIdentity`, `resolveName` or `canonicalizeNames` in
`src/utils/pregameAdvice/*`.

**Unified fix:** introduce one canonicalisation boundary — canonicalise `allMatches` and the
active draft match through `buildAnalyticsIdentityResolver` before they reach
`computePregameAdviceForMatch` / `buildLiveLobbyIntel`. This closes 9b and 9c together.

Keep `engine.ts` pure (it documents itself as a pure function): accept pre-canonicalised
matches rather than reaching into hook state. Requires threading `pilotRegistry`, `pilotAliases`,
`knownMappings`, `playerProfiles`, `ocrAliasModel` from `GameDataProvider` into `RecordingView`.

**9a is only partly the same cause** — the identity-layer bypass explains why the label isn't a
player, but the reason it's specifically a *ship* name is the independent `lobbyScan.ts`
data-modelling bug. Both fixes are needed.

**Test coverage — currently zero for all three triggers.** `pregameAdvice.test.ts` fixtures
always keep `teamName` and `shipType` distinct (never collided). `PregameAdvicePanel.test.tsx:50-82`
uses the identical literal `'Wing1'` on both live and historical sides, so alias drift can't be
caught. No test introduces a duplicate-alias opponent.

---

## Suggested sequencing

**Tier 1 — data correctness, fixes wrong numbers on screen**

| # | Item | Effort | Risk |
|---|---|---|---|
| 9b/9c | Canonicalise INTEL through the identity resolver | M | M — thread resolver inputs, keep `engine.ts` pure |
| 9a | Reject `SHIPS` as team names + prefer player in threat copy | S | L guard / M copy change |
| 1 | Renderer map catalog + third bucket in `tacticalScan` | S | L |
| 5B | Reset `currentMatchCategory` between matches | S | M — touches all save paths |

**Tier 2 — the "feels broken" items**

| # | Item | Effort | Risk |
|---|---|---|---|
| 2a/2b | Batch OCR corrections + defer analytics identity | M | L–M |
| 3 | Wire `onStage` into `rerun-ocr-on-artifact` + consume it | S | L |
| 8 | Diagnostic build first, then fix — **do not fix blind** | M | — |

**Tier 3 — additive polish**

| # | Item | Effort | Risk |
|---|---|---|---|
| 7 | Master volume slider | S | VL |
| 6 | Configurable popup timeout + fix interaction semantics | S | L |
| 5A/5 | Case-fold categories + Analytics dimension + edit path | M | L (additive) |
| 4 | SeedsPanel design pass (start with the dead `text-title-lg`) | S | VL |
| 2c | Cache/incrementalise merge-suggestion scoring | M | L |

**Regression tests worth adding regardless:** `teamName === shipType` collision; alias-drifted
teammate across sessions; duplicate-alias opponent in one team; category carry-over between
consecutive matches; map-catalog string excluded from `tacticalScan` name lines.
