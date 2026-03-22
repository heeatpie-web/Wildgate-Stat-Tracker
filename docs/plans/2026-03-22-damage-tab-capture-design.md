# Damage Tab Capture — Design Doc
**Date:** 2026-03-22

## Problem

The result screen shows a damage panel ("FINAL MOMENTS RECAP") only on certain outcomes (1st place / 2nd place combat defeat). The panel has two tabs:

- **Tab 1 — Damage Sources:** lists damage source types (MACRO CANNON, FIRE, etc.) with amounts, plus a "TOTAL DAMAGE TAKEN" footer number.
- **Tab 2 — Enemy Ships:** lists individual enemy ship names and the damage they dealt.

The app currently takes one full-screen OCR shot when the result screen tripwire fires, but the damage panel takes ~3 seconds to slide into position after the result text first appears. The tripwire fires at ~1 second (2 consecutive 500ms hits), leaving a ~2 second gap before the panel is ready.

For artifact outcomes (Artifact Victory / Artifact Defeat) and 3rd/4th/5th place, no damage panel appears at all.

## Outcome Behavior Reference

| Outcome | DXGI Flash | Tripwire | Damage Panel |
|---|---|---|---|
| 1st (Victory) | Yes | Yes | No |
| 2nd place combat | Yes | Yes | Yes |
| Artifact Victory | Yes | Yes | No |
| Artifact Defeat | Yes | Yes | No |
| 3rd / 4th / 5th | No (screen flash may trigger tripwire) | Maybe | No |

## Design

### New IPC Handler: `result-damage-capture`

A single atomic handler in the main process, called by the renderer after the initial result screenshot is taken.

**Parameters:**
- `delayMs` (default 2000) — how long to wait before capturing tab 1, allowing the panel to slide in
- `tabSwitchDelayMs` (default 100) — how long to wait after pressing `]` before capturing tab 2
- `region` — normalized damage panel region (see below)

**Main process sequence:**
1. Wait `delayMs` (2000ms)
2. Capture full screen → crop to damage region → buffer A (tab 1: damage sources)
3. Send `]` key to game window via `gameInput`
4. Wait `tabSwitchDelayMs` (100ms)
5. Capture full screen → crop to damage region → buffer B (tab 2: enemy ships)
6. Return `{ tab1: bufferA, tab2: bufferB }` to renderer

### Damage Panel Region (normalized, at 1920×1080)

```
left:   0.526   (x ≈ 1010px)
top:    0.093   (y ≈ 100px)
width:  0.458   (w ≈ 880px)
height: 0.667   (h ≈ 720px)
```

Covers the full panel: header tabs ("DAMAGE SOURCES" / "ENEMY SHIPS"), damage list, and "FINAL DAMAGE TAKEN" footer.

### Renderer OCR & Discard Logic

After receiving `{ tab1, tab2 }`:

1. Run both buffers through PaddleOCR (same pipeline as existing captures)
2. **Discard condition:** neither crop contains a number adjacent to damage-related text (keywords: DAMAGE, TOTAL, CANNON, FIRE, STARLANCE, ship name patterns, etc.)
3. If discarded → no-op (handles 3rd/4th/5th false triggers silently)
4. If kept:
   - Tab 1 → extract `damageTaken` (the TOTAL footer number)
   - Tab 2 → extract per-ship damage entries

### Timing Summary

```
t=0s    Result text appears (centered)
t=1s    Tripwire fires (2× 500ms hits) → immediate full-screen OCR (result type)
t=1s    result-damage-capture IPC called
t=3s    (2000ms later) Tab 1 crop captured — panel fully slid in
t=3s    ] key sent
t=3.1s  Tab 2 crop captured
t=3.1s  Buffers returned to renderer for OCR
```

## False Trigger Handling

3rd/4th/5th place may trigger the tripwire via screen flash. The damage capture still fires but both crops return no damage text → discard condition met → silent no-op. No user-visible effect.

## Out of Scope

- Parsing damage source types from Tab 1 (only the total number is extracted)
- Handling more than 2 tabs (there are only 2)
- Retrying if `]` key send fails
