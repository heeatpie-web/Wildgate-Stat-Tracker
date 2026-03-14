# Resolution Notes

## Reference Baseline

- Reference layout baseline: `1920x1080`
- Reference aspect ratio: `1.7778` (`standard`)
- OCR geometry scaling derives from source dimensions and preprocess scale at runtime:
  - `ocrScaleX = (originalWidth / 1920) * preprocessScale`
  - `ocrScaleY = (originalHeight / 1080) * preprocessScale`

## Validated Profiles

- Standard baseline fixture:
  - `dataset/ocr-corpus/images/capture_2026-02-04T08-24-00-719Z.png`
  - `dataset/ocr-corpus/images/capture_2026-02-14T21-57-21-155Z.png`
  - `1920x1080`, aspect `1.7778`, profile `standard`
- Ultra-wide fixtures:
  - `CrewHub2Caziban.png`
  - `CrewhubCaziban.png`
  - `MapViewCaziban.png`
  - `TacticalMap2Caziban.png`
  - `3840x1600`, aspect `2.40`, profile `ultrawide`

## Calibration Anchors

- Ultra-wide crew hub:
  - Friendly roster block: `x=1032..1284, y=504..1076`
  - Enemy roster block: `x=2432..2768, y=380..1208`
  - Enemy team-bar text band: `x=2456..2640, y=872..1244`
- Ultra-wide tactical map:
  - Your-ship panel: `x=48..356, y=74..462`
  - Enemy-ships panel: `x=3252..3600, y=74..310`
  - Hazards list: `x=3268..3724, y=416..882`
  - Player list: `x=160..344, y=1196..1498`
- Standard crew hub:
  - Friendly panel: `x=214..586, y=205..636`
  - Enemy roster: `x=1304..1504, y=255..812`
  - Enemy team-bar text: `x=1314..1482, y=284..839`
- Standard tactical map:
  - Your-ship panel: `x=24..264, y=46..254`
  - Enemy-ships panel: `x=1522..1808, y=46..275`
  - Hazards list: `x=1528..1844, y=350..630`
  - Player list: `x=104..212, y=811..1007`

## Remaining Layout-Dependent Windows

- `electron/crewHubExtractor.cjs`
  - Normalized `LEFT_PANEL`, `ENEMY_PANEL`, `TEAM_HEADER`, and `ENEMY_NAME` regions remain tied to the current Crew Hub UI layout.
- `electron/mapScreenExtractor.cjs`
  - Normalized `YOUR_SHIP`, `ENEMY_SHIPS*`, `HAZARDS`, `MAP_CENTER`, and `PLAYERS` regions remain tied to the current Tactical Map UI layout.
  - Runtime enemy-ship slot expansion still assumes evenly stacked rows below the `ENEMY SHIPS` header using normalized `slotH=0.105` and `slotGap=0.006`.
  - Runtime hazards expansion still assumes the list extends roughly `0.55` screen heights below the `KNOWN HAZARDS` header.
- `electron/ocrHandler.cjs`
  - Runtime anchor expansion for map and crew layouts still depends on the current UI header positions and should be rechecked for any future HUD redesign.

## Color Sampling Notes

- `electron/colorUtils.cjs` now uses text-size-scaled lateral and vertical probe offsets when sampling the team-color bar.
- Residual minimum sample guards remain in place to keep sampling stable on tiny OCR boxes:
  - `gapBelow = max(6, textHeight * 0.6)`
  - `barHeight = max(12, textHeight * 1.1)`
  - `sampleHeight = max(8, barHeight * 0.5)`
  - `sampleWidth = max(40, textWidth * 0.5)`
  - `verticalStep = max(2, sampleHeight * 0.4)`
