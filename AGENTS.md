# Agent Instructions

## Screenshot Rendering Rule

When sharing UI screenshots in responses:

1. Always copy the screenshot into:
`N:\Codex-Windows-main\work\app\`
2. Always embed using an absolute Markdown image path from that folder, for example:
`![UI](/N:/Codex-Windows-main/work/app/recording.png)`

Do not embed screenshots directly from paths that include `N:\Coding (backup)\...`.

---

## Project Overview: Wildgate Stat Tracker

**What it is:** An Electron + React + TypeScript desktop app that OCR-reads in-game screenshots from the game *Wildgate*, extracts match data (teams, players, ships, hazards), and tracks stats across sessions.

**Workspace root:** `N:\Coding (backup)\`
**Primary source dirs:**
- `electron/` — main process (OCR pipeline, IPC handlers, data storage)
- `src/` — renderer (React UI, components, analytics)
- `dist-electron/` — built installers; deployed installed app lives at `%LOCALAPPDATA%\Programs\Wildgate Stat Tracker\`
- `dataset/ocr-corpus/` — labelled screenshot test data

**Build & deploy:**
```powershell
cd "n:\Coding (backup)"
npm run electron:build          # builds installer to dist-electron/
# live-patch without rebuilding (fast iteration):
$tmp = "$env:TEMP\wg-asar-patch"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
& npx asar extract "$env:LOCALAPPDATA\Programs\Wildgate Stat Tracker\resources\app.asar" $tmp
Copy-Item "n:\Coding (backup)\electron\crewHubExtractor.cjs" "$tmp\electron\" -Force
Copy-Item "n:\Coding (backup)\electron\ocrMerger.cjs"        "$tmp\electron\" -Force
& npx asar pack $tmp "$env:TEMP\app-patched.asar"
Copy-Item "$env:TEMP\app-patched.asar" "$env:LOCALAPPDATA\Programs\Wildgate Stat Tracker\resources\app.asar" -Force
```

**Debug log:** `%TEMP%\wildgate-ocr.log` — written via `appendFileSync` throughout OCR pipeline.  
**Quick tail:** `Get-Content "$env:TEMP\wildgate-ocr.log" | Select-Object -Last 80`

**Test harness:** `tmp_4team_test.cjs` — standalone Node script that runs the full OCR pipeline on the 3 match_artifacts/119 screenshots and prints a merged result. Run with:
```powershell
Remove-Item "$env:TEMP\wildgate-ocr.log" -ErrorAction SilentlyContinue
node tmp_4team_test.cjs 2>$null | Select-String "MERGED RESULT" -Context 0,22 | Select-Object -First 1
```

**Diagnostic script:** `tmp_2x_words.cjs` — dumps every OCR word with x/y/confidence per panel strip. Run to see what Tesseract actually reads before name-extraction logic filters it.

---

## OCR Pipeline Architecture

### Screenshot types
1. **Tactical Map** — top-down view. `tacMapExtractor.cjs` reads team names, ship types, hazard modifiers.
2. **Crew Hub** — player card list (right panel = enemies, left panel = your team). `crewHubExtractor.cjs` reads player names. **Two screenshots required** because the full player list requires scrolling.

### Strip OCR parameters (crewHubExtractor.cjs / ocrHandler.cjs)
```
SCALE    = 2         (production); use SCALE=4 in diagnostic crop scripts for clarity
stripX   = 68–82%    of image width (right panel, enemy names)
stripY   = 160px     from top
stripH   = origH - stripY - 20
PSM      = 11        (sparse text)
Preprocessing: .modulate({brightness: 1.15})
               .linear(1.3, -(0.3 * 128))   // contrast
               .sharpen({sigma:1.5, m1:1, m2:0.5})
```

### Left panel (YOUR TEAM) OCR layout facts
- Your own name card: x ≈ 868px (absolute, ~22% of 3840)
- Teammate name cards: x ≈ 750–840px (FURTHER LEFT than your card)
- UI controls (TEAM VOICE, PUSH TO TALK): same Y row as teammate names, x ≈ 1087+
- Filter applied: `nameColXMax = imageWidth * 0.35` — removes UI control words on right
- `teammateColumnMaxX = imageWidth * 0.48`
- Anchor window: 40% of imageHeight from anchor Y (expanded from prior 30%)

### Key coordinate data from debug log (match_artifacts/119)
```
Crew1 left panel:
  AlixThus  c76 @x868 @y705   ← YOUR card (anchor)
  parryvoce c0  @x901 @y778   ← confidence displayed as 0 but actual fractional ~0.3
  Riv2      c67 @x756 @y1356  ← teammate, y-dist = 651px, within 40%×2160=864px window

Crew2 left panel (second scroll):
  AlixThus  c86 @x868 @y706
  parry     c60 @x839 @y779
  Rive      c47 @x754 @y1364  ← DIFFERENT player (enemy on FANCY GOOSE)
  JrMir     c0  @x767 @y1181

Right panel (enemies):
  fartingPuppy  c83, Ledurricane c92, lirolake c91    ← BOREALIS
  Tiblolan c84, [6*] c90, Caziban c92, GoblinaTTyV c16 ← VANGUARD (GoblinaTTV low conf)
  [ESCAPE VELOCITY players not found in strip - only bars visible]
```

---

## Match Ground Truth (match_artifacts/119 — Development Test Case)

**DO NOT hardcode names** — the system must work generically. This is just the known-correct answer for testing.

| Color | Team | Ship | Players |
|-------|------|------|---------|
| (yours) | SPEED RUN! | Privateer | AlixThus, Riv2, JrMJr, H4VOK_XP |
| red | BOREALIS | Solo outlaw | fartingPuppy, Ledurricane, lirolake |
| orange | FANCY GOOSE | Privateer | Rive, Riv, Eudico, itamare84 |
| yellow | VANGUARD | Hunter | [6*] Tiblolan, GoblinaTTV, Caziban, G4zZy |
| yellowGreen | ESCAPE VELOCITY | Solo outlaw | Ondra-ocasek, Braiker, Capman |

**Hazards:** Artifact: Weapon, Dead Worlds, Epic Loot, Few Asteroids, Legion Patrols, Rogue Turrets

**Note on similar names:** "Riv2" (YOUR TEAM) and "Rive"/"Riv" (FANCY GOOSE) are intentionally near-identical — this is a player in-joke. The cross-team dedup in `ocrMerger.cjs` uses EXACT normalised-key matching so similar-but-different names are NOT conflated.

---

## Current OCR Output Baseline (as of last session)

```
YOUR TEAM: "SPEED RUN!"  ship=Privateer
  Players: AlixThus, Rive [should be Riv2], parryvoce [noise — should not appear]

[red] "BOREALIS"  ship=Solo outlaw
    players: fartingPuppy, Ledurricane, lirolake  [3/3 correct ✓]

[orange] "FANCY GOOSE"  ship=Privateer
    players: Rive, itamare84  [2/4 correct — missing: Riv, Eudico]

[yellow] "VANGUARD"  ship=Hunter
    players: [6*] Tiblolan, Caziban  [2/4 correct — missing: GoblinaTTV (c16 too low), G4zZy (absent)]

[yellowGreen] "ESCAPE VELOCITY"  ship=Solo outlaw
    players: (none)  [0/3 — Ondra-ocasek, Braiker, Capman not read by strip]

HAZARDS: Artifact: Weapon, Dead Worlds, Epic Loot, Few Asteroids, Legion Patrols, Rogue Turrets ✓
```

---

## All Fixes Applied to crewHubExtractor.cjs This Session

### 1. Dedup quality gate (~line 628)
Prevents a weak OCR read (e.g. `thong` c37, score≈20) from replacing a strong read (e.g. `fartingPuppy` c89, score≈40) during card-zone deduplication.
```javascript
const keepNew = (card.color !== 'unknown' && nearby.color === 'unknown'
                  && newScore >= nearbyScore - 15)
  || (card.color === nearby.color && newScore > nearbyScore);
```

### 2. Post-dedup team-name-fragment filter (~line 650, Step 3b-post)
Removes player cards whose name is a garbled form of a captured team name (e.g. "Fancy Goose" == "FANCY GOOSE", "ANGUAR" ⊂ "VANGUARD"). Uses normalised string containment + Levenshtein ≤25%.

### 3. Step 3c-post filter (~line 695)
Second pass of the same fragment filter, run AFTER Step 3c populates `capturedTeamNames` from bar-zone lines. Needed because crew2's VANGUARD bar falls inside Caziban's bar-zone during the main loop and isn't captured until Step 3c.

### 4. `extractPlayerNameFromLine` confidence floor (~line 946)
```javascript
if ((word.confidence || 0) < 1) continue;
```
Removes hallucinated tokens with near-zero Tesseract confidence.  
**Known issue:** `parryvoce` displays as `c0` in the debug log (which uses `Math.round(confidence)`) but the actual fractional value is ~0.3, so it still passes the `< 1` threshold. Raising to `< 5` may be needed.

### 5. NOISE_WORDS trailing punctuation strip (~line 949)
```javascript
if (NOISE_WORDS.has(text.toUpperCase().replace(/[!?.,;:]+$/, ''))) continue;
```

### 6. Strategy 1b threshold lowered 25→15 (~line 988)
So all-lowercase names ≥5 chars like `lirolake` (score=20) pass Strategy 1b.

### 7. `filteredParts` digit+letter noise filter (~line 1022)
```javascript
if (/^\d{1,2}[a-zA-Z]{1,2}$/.test(p)) return false; // blocks "4s", "10x"
```

### 8. `cleanupPlayerName`: `&` → `4` substitution
OCR misreads digit `4` as ampersand.

### 9. Short all-caps penalty extended to length < 7 (~line 1079)
Was `< 6`; raised to catch 6-char noise fragments like "LUEVAY", "ANGUAR".

### 10. Enemy panel confidence floor (~line 446)
```javascript
if ((w.confidence || 0) < 20) continue;
```
Removes words like "Wool"(c15) from the enemy name band.  
**Side effect:** GoblinaTTV reads as `GoblinaTTyV`(c16), which is below this threshold. Lower to 15 OR add a special case for long words (≥8 chars) at conf≥15 to recover it.

### 11. `isValidOpponentName` min-length 3→4 (~line 1180)

### 12. 3-word multi-word name filter (after `isValidOpponentName`)
```javascript
if (playerName.trim().split(/\s+/).length >= 3) continue;
```
Blocks OCR noise that reads as a 3+ word "name".

---

## Fix Applied to ocrMerger.cjs This Session

### Map-orphan team addition (~line 279)
Ensures teams visible on the tactical map always appear in the output even when crew-hub OCR found no players for that team (e.g. ESCAPE VELOCITY).
```javascript
const finalMatchedColors = new Set(enrichedTeams.map(t => t.color));
const finalMatchedNames  = new Set(enrichedTeams.map(t => normalizeTeamName(t.name || '')));
for (const orphan of (map.enemyShips || [])) {
  if (finalMatchedColors.has(orphan.color)) continue;
  if (orphan.teamName && finalMatchedNames.has(normalizeTeamName(orphan.teamName))) continue;
  enrichedTeams.push({ color: orphan.color, name: orphan.teamName || '', shipType: orphan.shipType || '', players: [] });
}
```

---

## Remaining Issues & Recommended Next Steps

### Issue 1 — parryvoce still appearing (YOUR TEAM noise)
`parryvoce`(c0 displayed, actual ~0.3) passes the `< 1` confidence floor.  
**Fix:** Raise the threshold — try `< 5` in `extractPlayerNameFromLine`:
```javascript
if ((word.confidence || 0) < 5) continue;
```

### Issue 2 — Riv2 not found (YOUR TEAM missing)
Word `Riv2`(c67)@x756@y1356 is within the anchor window (distance 651px < 40%×2160=864px) and its x=756 < `nameColXMax`=1344. Score via `scoreAsPlayerName("Riv2")`: length 4 (+10), has number (+15), starts cap (+10) = 35. Strategy 1b threshold is 15 — should pass. The `"/"(c71)` and `"12"(c55)` on the same line should both score 0, making all-others-noise = true.  
**Debug approach:**
```powershell
Remove-Item "$env:TEMP\wildgate-ocr.log" -ErrorAction SilentlyContinue
node tmp_4team_test.cjs 2>$null | Out-Null
Get-Content "$env:TEMP\wildgate-ocr.log" | Select-String "LPdbg|1355|1356|Riv2" | Select-Object -First 30
```
The log line starting with `LPdbg` immediately before `y=1355` or `y=1356` will show what happened.

### Issue 3 — GoblinaTTV not found (VANGUARD)
OCR reads it as `GoblinaTTyV`(c16). The enemy panel confidence floor is 20, so it's skipped.  
**Fix:** Lower the floor to 15, OR add a length-based exception: include words ≥8 chars even at conf≥15 (long OCR tokens are very unlikely to be spurious noise).

### Issue 4 — G4zZy absent (VANGUARD)
Not found in OCR word list at all — likely in a part of the strip that reads poorly or is outside the 68–82% x-range. Consider a second strip at x=55–68% or running a targeted crop OCR on that card region.

### Issue 5 — ESCAPE VELOCITY players (0/3)
Ondra-ocasek, Braiker, Capman are visible in the screenshot but appear to be at the bottom of the right panel (y > ~800 in original coordinates). The strip (x=68–82%) scans the correct x range but the Tesseract PSM11 pass only finds the ESCAPE VELOCITY team bars, no player card names.  
**Approaches to try:**
- Inspect where these cards are in the raw image (run `tmp_2x_words.cjs` and check the strip output for that crew screenshot)
- Check if the cards are at y > `stripY + stripH` (i.e. cut off by the strip height calculation)
- Or run a dedicated crop OCR on the lower portion of the strip for that screenshot

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `electron/crewHubExtractor.cjs` | Crew hub OCR: extracts player names and team names from crew hub screenshots |
| `electron/ocrMerger.cjs` | Merges crew-hub extraction with tactical-map extraction into a single result |
| `electron/ocrHandler.cjs` | Orchestrates Tesseract, manages strip preprocessing, calls extractors |
| `electron/tacMapExtractor.cjs` | Tactical map OCR: extracts team names, ship types, hazards |
| `tmp_4team_test.cjs` | Test harness for match_artifacts/119 (production-matched strip params) |
| `tmp_2x_words.cjs` | Diagnostic: dumps raw OCR words with x/y/confidence per panel |
| `dataset/ocr-corpus/match_artifacts/119/` | The primary test screenshots (map + 2× crew hub) |
