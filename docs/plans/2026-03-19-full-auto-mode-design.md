# Full Auto Mode — Design

**Date**: 2026-03-19
**Status**: Approved

## Problem

The app currently requires the user to manually click Win/Loss/Draw to record a match. The goal is to let the app run entirely in the background: detect the result screen via pixel monitoring, OCR the result, and auto-save the match with no user interaction.

## Solution

A new **Full Auto** mode that, when enabled, intercepts the pixel monitor trigger and runs a lightweight result-screen OCR pass instead of the normal smart scan wizard flow. The match is saved silently with a toast notification.

---

## Architecture

```
Pixel monitor detects white flash (result screen appears)
  │
  ├─ fullAutoEnabled = true
  │    1. capture-screen IPC         → screenshot dataUrl
  │    2. scan-result-screen IPC     → ResultScreenData
  │    3. save-screenshot IPC        → artifact file path
  │    4. autoSaveMatch()            → addMatch() + toast
  │
  └─ fullAutoEnabled = false
       └─ handleSmartScan() → existing manual wizard flow (unchanged)
```

---

## Result Screen OCR (`electron/resultScreenExtractor.cjs`)

Tesseract runs on the **top 35% of the screen** where the VICTORY/DEFEAT banner appears.

### Text patterns

| Pattern | Meaning |
|---------|---------|
| `VICTORY` | result: `'Win'` |
| `RIVALS ELIMINATED` | winType: `'combat'` |
| `ARTIFACT` + `VICTORY` | winType: `'artifact'` |
| `\d(ST\|ND\|RD\|TH)` | result: `'Loss'`, placement: N |
| `DEFEAT` | result: `'Loss'`, winType: `'artifact'` (lost to artifact extraction) |

### Return type

```ts
interface ResultScreenData {
  result: 'Win' | 'Loss' | null;   // null = could not parse
  winType?: 'combat' | 'artifact'; // only when result = 'Win'
  placement?: number;              // only when result = 'Loss' via placement
}
```

---

## Data Assembly (`autoSaveMatch`)

Builds the `Match` record from three sources:

| Field | Source |
|-------|--------|
| `result` | Result screen OCR |
| `placement` | Result screen OCR |
| `hero`, `ship`, `loadout`, `kills`, `time`, `mode` | Telemetry (`pendingMatchData`) |
| `teammates`, `opponents` | Crew hub OCR (if captured during match) |
| `artifacts` | Result screen screenshot (saved to disk) |
| `player` | Settings `activeUser` |
| `timestamp`, `date` | Current time |

If crew hub OCR wasn't run during the match, `teammates` and `opponents` save as empty arrays. The match is still recorded — user can edit later from match history.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| OCR parses result successfully | Save match, toast: "Match recorded: Victory (Combat)" |
| OCR can't find VICTORY/DEFEAT | Save match with `result` blank, toast: "Match recorded — result unknown, edit manually" |
| Screenshot capture fails | Show error toast, no match saved |

---

## New Setting: `fullAutoEnabled`

Added to the **Auto-Capture** panel in Settings (alongside pixel monitor config).

```
[ Full Auto mode ]  [toggle]
When enabled, detected result screens are auto-saved without opening the wizard.
Requires pixel monitor to be configured and enabled.
```

---

## Files

### New
- `electron/resultScreenExtractor.cjs` — Tesseract result-screen parsing

### Modified
- `electron/main.cjs` — `scan-result-screen` IPC handler
- `electron/preload.cjs` — whitelist `scan-result-screen` invoke channel
- `src/store/slices/createSettingsSlice.ts` — `fullAutoEnabled` field + setter
- `src/hooks/usePixelMonitor.ts` — full auto branch (capture → scan → autoSave)
- `src/App.tsx` — `autoSaveMatch()` function
- `src/components/SettingsModal.tsx` — Full Auto toggle in Auto-Capture panel

---

## Out of Scope

- Crew hub OCR during the match (already works independently via smart scan)
- Changes to the existing manual wizard flow
- Video/clip recording
