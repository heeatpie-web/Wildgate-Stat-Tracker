# 04_HANDOFF — Font Weight Normalization

## Summary
Normalized font weights across 3 component files (73 total changes) using the 4-tier system.

## What Changed
| File | font-black→bold | font-black→semibold | font-bold→semibold | font-black KEPT | Total Changes |
|------|-----------------|--------------------|--------------------|-----------------|---------------|
| AnalyticsDashboard.tsx | 13 | 15 | 27 | 14 | 55 |
| PlayerHub.tsx | 5 | 0 | 10 | 2 | 15 |
| AnalyticsShell.tsx | 3 | 0 | 2 | 0 | 5 |
| **Total** | **21** | **15** | **39** | **16** | **75** |

## What Was Verified
- All remaining `font-black` instances are exclusively on large stat numbers (text-2xl+)
- Zero `font-extrabold` in any file
- All sub-labels/metadata use `font-semibold`
- All headings, buttons, and emphasis values use `font-bold`

## What Remains
- No additional work needed for these 3 files
- Other component files may still need the same treatment

---

# 04_HANDOFF — OCR Corpus Baseline & GCloud Predict Fix

**Debugger → Project Manager**
**Task:** `ocr-stabilization-cycle-01`
**Date:** 2026-02-12T19:00Z

## What Changed

### 1. Predict script GCloud initialization fix
- **File:** `scripts/ocr_corpus_predict.cjs`
- **Bug:** `npm run ocr:predict` never initialized GCloud Vision/Gemini services. The script imported `processCapture` from `ocrHandler.cjs` but skipped the cloud setup that `main.cjs` performs at startup (lines 1739–1749). Result: every batch prediction was Tesseract-only, even though GCloud shows green in-app.
- **Fix:** Added GCloud Vision, GCloud Sync, and Gemini initialization using the same key-file lookup logic as `main.cjs`.

### 2. OCR corpus populated (15 samples)
- **Files:** `dataset/images/val/` (15 PNGs), `dataset/ocr-corpus/ground-truth.input.txt`, `dataset/ocr-corpus/ground-truth.json`
- **Source:** User-provided screenshot paths — `screenshots/`, `ocr-debug/`, `match_artifacts/` under `%APPDATA%\Wildgate Stat Tracker`
- **Composition:** 5 Crew Hub screens + 10 Map screens, spanning Feb 4–12. Each labeled with teammates, opponent teams (with colors), and modifiers by visual inspection.
- **Special case:** One sample (`crew_2026-02-12T05-53-04`) has player names with `;` and `:` characters — added directly to JSON to bypass text parser limitations.

### 3. Full pipeline executed end-to-end
- `npm run ocr:truth:build` → 15 samples
- `npm run ocr:predict` → 15/15 processed (both Tesseract-only and GCloud runs)
- `npm run ocr:eval` → reports generated with per-sample metrics
- `npm run ocr:baseline:promote` → Tesseract-only baseline frozen

## Baseline Results

| Metric | Tesseract Only (baseline) | With GCloud | Delta |
|--------|--------------------------|-------------|-------|
| Teammate recall | 8.62% | 15.52% | +6.9% |
| Opponent recall | 14.71% | 14.71% | 0% |
| Modifier recall | **70.27%** | 56.76% | **-13.5%** |
| Team grouping | 66.67% | 66.67% | 0% |
| Session-usable pass | 0% | 0% | 0% |

**Tesseract-only promoted as baseline** (GCloud run not promoted due to modifier regression).

## Per-Screen-Type Breakdown

**Map screens (10 samples):**
- Opponent team/ship name recall: **100%** (all map screens, both engines)
- Teammate recall: **0%** (small crew text at bottom-left is unreadable)
- Modifier recall: 57–87% Tesseract-only, 40–75% with GCloud (regression)

**Crew Hub screens (5 samples):**
- Teammate recall: 0–75% (improved with GCloud on some samples)
- Opponent recall: 0–44% (extraction logic dumps enemies into teammates array)
- Team grouping: 0% (panel boundary detection fails)

## Three Bugs Identified

### Bug 1: Cloud-local merge corrupts modifiers
- **Symptom:** Modifier recall drops from 70% to 57% when GCloud is enabled.
- **Root cause:** The merge strategy in `ocrHandler.cjs` treats all text regions equally. Modifiers (large, high-contrast labels like "ROGUE TURRETS") are already well-read by Tesseract, but the cloud annotations introduce noise that overwrites good local results.
- **Impact:** Medium. Modifiers are the best-performing OCR feature; merge should not degrade them.
- **Recommendation:** Region-aware merge — prefer local OCR for structured UI regions (modifier list, ship names) and cloud for stylized text (player names).

### Bug 2: CrewHub extraction dumps enemies into teammates
- **Symptom:** On Crew Hub screens, enemy player names (BruiserBingle, trollkultus, etc.) appear in the `teammates` array. Opponent recall is 0% despite names being correctly OCR'd.
- **Root cause:** The CrewHub extractor's left/right panel boundary detection fails. It reads enemy names from both panels and classifies them all as teammates.
- **Impact:** High. This is a structural extraction bug — even perfect OCR would still misclassify players.
- **Recommendation:** Fix panel boundary logic in CrewHub extractor (likely in `electron/ocrHandler.cjs` or a dedicated extractor module).

### Bug 3: Map screen teammate recall is 0%
- **Symptom:** Crew member names at bottom-left of map screens (e.g., "fartingPuppy", "Clenched22") are never extracted.
- **Root cause:** The text is small and overlaid on game visuals. Both Tesseract and GCloud Vision fail to read it.
- **Impact:** Medium. Map screens are common captures; teammate extraction would improve session-usable rate.
- **Recommendation:** Region-specific preprocessing (crop + upscale the crew list area before OCR) or dedicated Gemini vision call for that region.

## Blockers Resolved
- ~~Missing screenshot images~~ → 15 images in `dataset/images/val/`
- ~~Insufficient ground truth~~ → 15 labeled samples
- ~~Missing prediction pipeline~~ → `npm run ocr:predict` (resolved earlier by builder)
- ~~GCloud not initialized in predict~~ → Fixed in this session

## Remaining Blockers
- `ui-designer` role not assigned to an active agent tab (pre-existing)

## Doc Collision Note
Both `02_EXECUTION_LOG.md` and `03_VALIDATION.md` were overwritten mid-session by the UI agent's font weight task. OCR entries were partially lost from those files. The OCR scoreboard was re-appended to `03_VALIDATION.md`. All actual data is intact in `dataset/ocr-corpus/reports/`.

## What Remains
- ~~Fix Bug 1 (merge strategy)~~ — **VERIFIED PASS** by debugger (2026-02-12T19:20Z). Modifier recall fully restored to baseline (70.27%, delta 0%) while preserving +6.9% teammate recall from cloud OCR. Zero regressions.
- ~~Fix Bug 2 (CrewHub extraction)~~ — **VERIFIED NEUTRAL-SAFE** by debugger (2026-02-12T19:34Z). Panel boundary fix reduces false positives in teammate list (precision improvement) but recall unchanged — underlying OCR character accuracy and opponent extraction logic still need work. Zero regressions.
- Fix Bug 3 (map teammate extraction) — builder scope, `electron/mapScreenExtractor.cjs` — no changes yet
- Re-run `npm run ocr:predict && npm run ocr:eval` after each fix to measure delta against baseline

## Updated Baseline (post Bug 1 fix, 2026-02-12T19:20Z)

| Metric | Value | Delta vs Tesseract-only |
|--------|-------|------------------------|
| Teammate recall | 15.52% | +6.9% |
| Opponent recall | 14.71% | 0% |
| Modifier recall | 70.27% | 0% |
| Team grouping | 66.67% | 0% |
| Session-usable | 0% | 0% |

**Recommendation:** Promote this as the new official baseline (GCloud-enabled, Bug 1 fixed) since it is strictly better than or equal to Tesseract-only across all metrics.
