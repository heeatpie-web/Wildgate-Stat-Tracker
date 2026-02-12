# 03_VALIDATION — Font Weight Normalization

## Validation Method
Full grep audit of all three files after changes.

## Results

### AnalyticsDashboard.tsx
- ✅ 14 `font-black` remaining — ALL on text-2xl+ stat numbers (correct KEEP)
- ✅ 0 `font-extrabold` remaining
- ✅ 13 `font-bold` — headings, buttons, emphasis values (correct tier)
- ✅ 27+ `font-semibold` — sub-labels, metadata, badges (correct tier)

### PlayerHub.tsx
- ✅ 2 `font-black` remaining — both on text-display-sm stat numbers (correct KEEP)
- ✅ 0 `font-extrabold` remaining
- ✅ font-bold on buttons and headings (correct tier)
- ✅ font-semibold on section labels and badges (correct tier)

### AnalyticsShell.tsx
- ✅ 0 `font-black` remaining (all 3 demoted to font-bold — correct, none were 2xl+ stats)
- ✅ 0 `font-extrabold` remaining
- ✅ font-bold on headings, buttons, breadcrumb emphasis (correct tier)
- ✅ font-semibold on mode sub-label and separator (correct tier)

## Pass/Fail: PASS

---

## OCR Corpus Baseline (debugger, 2026-02-12)

### OCR Daily Scoreboard
- Date (UTC): 2026-02-12T19:00:00Z
- Corpus size: 15 samples (5 Crew Hub, 10 Map screens)
- Pipeline: `ocr:truth:build` -> `ocr:predict` (15/15 OK) -> `ocr:eval` -> `ocr:baseline:promote`

**Tesseract-only baseline (promoted):**
| Metric | Value |
|--------|-------|
| Teammate recall | 8.62% |
| Opponent recall | 14.71% |
| Modifier recall | 70.27% |
| Team grouping | 66.67% |
| Session-usable pass | 0% |

**With GCloud Vision (not promoted — modifier regression):**
| Metric | Value | Delta |
|--------|-------|-------|
| Teammate recall | 15.52% | +6.9% |
| Opponent recall | 14.71% | 0% |
| Modifier recall | 56.76% | -13.5% |
| Team grouping | 66.67% | 0% |
| Session-usable pass | 0% | 0% |

### Key Findings
1. **GCloud predict script fix**: `scripts/ocr_corpus_predict.cjs` was missing GCloud service initialization. Fixed by adding same init logic as `main.cjs`. This is why GCloud showed green in-app but wasn't used by batch predict.
2. **Cloud-local merge regression**: GCloud annotations improve player name reads but corrupt modifier text. The merge strategy doesn't differentiate between screen regions where local is better vs cloud is better.
3. **CrewHub extraction structural bug**: Enemy player names are being dumped into the "teammates" array. The left/right panel boundary detection fails, causing 0% opponent recall on Crew Hubs despite cloud reading names correctly.
4. **Map screen teammate recall still 0%**: Small crew names at bottom-left of map screens remain illegible to both Tesseract and GCloud Vision.

---

## OCR Bug 1 Phase Validation (builder, 2026-02-12)

- Date (UTC): 2026-02-12T19:12:59Z
- Commands run:
  - `node --check electron/ocrHandler.cjs` -> PASS
  - `npm exec electron -- scripts/ocr_corpus_predict.cjs --truth dataset/ocr-corpus/ground-truth.json --out dataset/ocr-corpus/predictions.both.post-bug1.json --ocr-mode both` -> PASS (15/15 processed)
  - `node scripts/ocr_corpus_eval.cjs --truth dataset/ocr-corpus/ground-truth.json --pred dataset/ocr-corpus/predictions.both.post-bug1.json --baseline dataset/ocr-corpus/baseline.json --out dataset/ocr-corpus/reports/both-post-bug1-vs-baseline.json` -> PASS
  - `npm exec electron -- scripts/ocr_corpus_predict.cjs --truth dataset/ocr-corpus/ground-truth.sample.json --out dataset/ocr-corpus/predictions.sample.post-bug1.json --ocr-mode both` -> PASS (smoke)
  - `ReadLints electron/ocrHandler.cjs` -> PASS

- Summary metrics comparison:
  - Local baseline (`reports/local-vs-baseline.json`): teammate 8.62, opponent 14.71, modifier 70.27
  - Hybrid pre-fix (`reports/both-vs-baseline.json`): teammate 15.52, opponent 14.71, modifier 56.76
  - Hybrid post-fix (`reports/both-post-bug1-vs-baseline.json`): teammate 15.52, opponent 14.71, modifier 66.22

- Delta interpretation:
  - Modifier recall improved **+9.46** vs hybrid pre-fix (56.76 -> 66.22).
  - Modifier recall is now only **-4.05** vs local baseline (was -13.51 before fix).
  - Teammate recall gain from hybrid mode is preserved (+6.90 vs local baseline).
  - Opponent recall and grouping unchanged in this phase.

- Runtime evidence highlights:
  - Hybrid run logs show map-screen fallback branch executing, e.g. `Modifier fallback restored ... from local OCR`.
  - Full run completed with real screenshot corpus (15 samples), no missing images.

- Known gaps:
  - `sessionUsablePassRate` remains 0% (Bug 2 and Bug 3 still open).
  - Merge debug JSON still warns with ENOENT in predict-script environment (`...AppData\\Roaming\\Electron\\ocr-debug\\merge_debug_...json`); non-blocking for metrics.

---

## OCR Bug 1 — Debugger Validation (2026-02-12T19:20Z)

### Procedure
1. Read builder diff on `electron/ocrHandler.cjs` (39 insertions, 17 deletions).
2. Confirmed `crewHubExtractor.cjs` and `mapScreenExtractor.cjs` have no uncommitted changes (Bugs 2/3 still pending).
3. Ran `npm run ocr:predict` (15/15 OK, GCloud active) — two passes:
   - Pass 1 (stale code with length-based guard): negative fallback counts observed ("restored -3", "-2", "-4"). Modifier recall = 66.22% (delta -4.05%).
   - Pass 2 (updated code with unique-count guard): positive fallback counts ("restored 2", "3", "1", "2"). Modifier recall = **70.27% (delta 0%)**.
4. Ran `npm run ocr:eval` after each pass.

### Results Comparison

| Metric | Baseline (Tesseract) | Pre-fix GCloud | Builder v1 (stale) | Builder v2 (latest) |
|--------|---------------------|----------------|--------------------|--------------------|
| Teammate recall | 8.62% | 15.52% (+6.9%) | 15.52% (+6.9%) | **15.52% (+6.9%)** |
| Opponent recall | 14.71% | 14.71% (0%) | 14.71% (0%) | **14.71% (0%)** |
| Modifier recall | 70.27% | 56.76% (-13.5%) | 66.22% (-4.05%) | **70.27% (0%)** |
| Team grouping | 66.67% | 66.67% (0%) | 66.67% (0%) | **66.67% (0%)** |
| Session-usable | 0% | 0% (0%) | 0% (0%) | **0% (0%)** |

### Verdict: **PASS**

- Modifier recall fully recovered to baseline (70.27%, delta 0%). The 13.51pp regression is completely eliminated.
- Teammate recall improvement from cloud OCR preserved (+6.9%).
- Zero regressions across all five metrics.
- Builder's v2 code fix (unique-count guard in `mergeModifierLists` call site) was critical — v1 still had a -4.05% residual regression due to deduplication collapsing the modifier list.

### Evidence
- Report: `dataset/ocr-corpus/reports/history/2026-02-12T19-20-20-338Z.json`
- Predictions: `dataset/ocr-corpus/predictions.latest.json`
- Runtime logs: modifier fallback branch firing on 5/10 map screens with positive restore counts.

### Remaining Work
- ~~Bug 2 (CrewHub extraction)~~ — see Bug 2 validation below.
- Bug 3 (Map teammate recall): `mapScreenExtractor.cjs` — no changes yet, awaiting builder.
- `sessionUsablePassRate` remains 0% (dependent on Bug 3 and deeper CrewHub OCR quality).

---

## OCR Bug 2 — Debugger Validation (2026-02-12T19:34Z)

### What Changed
Builder modified `electron/crewHubExtractor.cjs` (19 lines):
1. Left panel `xMax` tightened from 0.40 → 0.36 (avoids enemy column bleed).
2. Right panel `xMin` expanded from 0.55 → 0.45 (captures enemy headers near center seam).
3. New `getLineCenterX()` function + guardrail: any "teammate" line with center X > 34% of image width is skipped.

### Procedure
1. Ran `npm run ocr:predict` (15/15 OK, GCloud active) with Bug 2 fix.
2. Ran `npm run ocr:eval` and compared per-sample CrewHub results.

### Results

| Metric | Pre-Bug 2 | Post-Bug 2 | Delta |
|--------|-----------|------------|-------|
| Teammate recall | 15.52% | 15.52% | 0% |
| Opponent recall | 14.71% | 14.71% | 0% |
| Modifier recall | 70.27% | 70.27% | 0% |
| Team grouping | 66.67% | 66.67% | 0% |
| Session-usable | 0% | 0% | 0% |

Per-sample CrewHub results are also identical (all 5 samples unchanged).

### Observed Behavior Change (not captured by recall metrics)
The fix **does** change raw output — visible in logs:
- `crew_2026-02-04T03-16-23`: predicted teammates dropped from 11 → 5 (6 false positives removed)
- `crew_2026-02-11T05-22-26`: teammates dropped from 10 → 8
- `crew_2026-02-12T05-53-04`: teammates dropped from 16 → 13

This is a **precision improvement** — enemy names are no longer incorrectly appearing in the teammate list. However, the evaluation only measures **recall** (true positives found / total truth), so removing false positives doesn't change the metric.

### Why Recall Didn't Improve
1. **Teammate recall**: Same true positive teammates detected before and after. The guardrail only removed false positives (enemy names), not true teammates.
2. **Opponent recall**: Even with the right panel expanded, the opponent extraction still produces garbled names (e.g., "liblolan15" instead of "Tib1olan15") that don't match ground truth.
3. **Team grouping**: Predicted opponent teams are generic ("Team 1", "Team 2") with wrong names — structural team matching still fails.

### Verdict: **NEUTRAL-SAFE** (zero regressions, precision improved, recall unchanged)

The fix is directionally correct and safe to keep. However, CrewHub recall improvement requires:
- Better OCR character accuracy for player names (not a boundary issue)
- Opponent extraction logic needs to properly parse right-panel team headers/player lists

### Evidence
- Report: `dataset/ocr-corpus/reports/history/2026-02-12T19-34-16-583Z.json`
- Predictions: `dataset/ocr-corpus/predictions.latest.json`
