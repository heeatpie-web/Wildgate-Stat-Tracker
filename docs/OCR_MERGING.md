# OCR Data Merging Guide

## Overview

When capturing multiple screenshots from the same match (e.g., scrolling through the crew hub to see all enemy teams), you can use the OCR merging utilities to intelligently combine the data.

## Use Cases

### 1. Crew Hub with Many Teams
If there are 4+ enemy teams and you need to scroll to see them all:
```
Screenshot 1: Teams 1-2 visible
Screenshot 2: Teams 3-4 visible (after scrolling)
→ Merge → Complete list of all 4 teams with all players
```

### 2. Combining Tactical + Crew Hub
```
Tactical Map: Enemy ship types and team names
Crew Hub: Player names grouped by team
→ Merge → Complete roster with ship types
```

## Usage Example

```typescript
import { mergeOCRData, isSameMatchSession } from '@/utils/ocr';
import type { OCRExtractedData } from '@/utils/ocr/ocrTypes';

// Store accumulated data for the current match
let accumulatedData: OCRExtractedData | null = null;

function handleNewOCRCapture(newData: OCRExtractedData) {
  if (!accumulatedData) {
    // First capture
    accumulatedData = newData;
    return accumulatedData;
  }

  // Check if this is from the same match session
  if (isSameMatchSession(accumulatedData, newData)) {
    // Merge the data
    accumulatedData = mergeOCRData(accumulatedData, newData);
    console.log('Merged data:', {
      totalPlayers: accumulatedData.teammates.length,
      totalOpponentTeams: accumulatedData.opponentTeams.length,
    });
  } else {
    // Different match - start fresh
    console.log('New match detected, starting fresh');
    accumulatedData = newData;
  }

  return accumulatedData;
}

// Example: User takes multiple screenshots
const capture1 = await ocrProcessCapture(screenshot1); // First scroll position
const capture2 = await ocrProcessCapture(screenshot2); // After scrolling down

const merged = handleNewOCRCapture(capture1.data!);
const final = handleNewOCRCapture(capture2.data!);

console.log('Final merged data:', final);
```

## Merging Strategy

### Players (Teammates)
- **Deduplication**: By name (case-insensitive)
- **Confidence**: Keeps entry with highest confidence
- **Result**: Unique list of all teammates

### Opponent Teams
- **Grouping**: By team name (case-insensitive)
- **Player Lists**: Combined and deduplicated
- **Ship Type**: Preserved from either capture
- **Color**: Prefers non-'unknown' values
- **Result**: Complete team rosters

### Reach Modifiers
- **Deduplication**: By name (case-insensitive)
- **Confidence**: Keeps entry with highest confidence
- **Result**: Complete modifier list

### Ship Information
- **Player Ship**: Uses entry with highest confidence
- **Team Name**: Prefers non-empty values
- **Result**: Most accurate ship data

## Session Detection

The `isSameMatchSession()` function determines if two captures are from the same match:

### Criteria:
1. **Time Proximity**: Within 5 minutes (configurable)
2. **Team Name Match**: Player team names must match if both exist
3. **Modifier Overlap**: At least 30% overlap in reach modifiers

```typescript
// Check if captures are from same match
if (isSameMatchSession(capture1, capture2, 10 * 60 * 1000)) {
  // Within 10 minutes and other criteria match
  const merged = mergeOCRData(capture1, capture2);
}
```

## UI Integration Example

### Auto-Merge Mode
```typescript
const [ocrData, setOcrData] = useState<OCRExtractedData | null>(null);
const [lastCaptureTime, setLastCaptureTime] = useState(0);

const handleNewCapture = async (imageData: string) => {
  const result = await ocrProcessCapture(imageData);

  if (result.success && result.data) {
    const newData = result.data;

    // Auto-merge if within 2 minutes and same type
    if (ocrData &&
        Math.abs(Date.now() - lastCaptureTime) < 2 * 60 * 1000 &&
        ocrData.screenshotType === newData.screenshotType) {

      const merged = mergeOCRData(ocrData, newData);
      setOcrData(merged);
      console.log('Auto-merged with previous capture');
    } else {
      setOcrData(newData);
    }

    setLastCaptureTime(Date.now());
  }
};
```

### Manual Merge with UI Prompt
```typescript
const handleNewCapture = async (imageData: string) => {
  const result = await ocrProcessCapture(imageData);

  if (result.success && result.data && ocrData) {
    // Ask user if they want to merge
    const shouldMerge = await showMergeDialog({
      message: 'Merge with previous capture?',
      previousCapture: ocrData,
      newCapture: result.data,
    });

    if (shouldMerge) {
      const merged = mergeOCRData(ocrData, result.data);
      setOcrData(merged);
    } else {
      setOcrData(result.data);
    }
  }
};
```

## Benefits

✅ **Complete Data**: Capture all teams even with scrolling
✅ **Deduplication**: No duplicate players or teams
✅ **Confidence Tracking**: Best data wins
✅ **Flexible**: Works with any number of captures
✅ **Smart Detection**: Automatically identifies same match
✅ **Cross-Screen**: Merge tactical + crew hub data

## Example Output

### Before Merging:
```
Capture 1 (Crew Hub, scroll position 1):
- Teammates: [AlixThus, ScareQro, oSalad, c0mbat_Barbi3]
- Opponents: [Team MURDER SPAGHURDER: 4 players, Team MEANR THAN AVG: 2 players]

Capture 2 (Crew Hub, scroll position 2):
- Teammates: [AlixThus, ScareQro, oSalad] (duplicates)
- Opponents: [Team MEANR THAN AVG: 4 players, Team ANOTHER TEAM: 4 players]
```

### After Merging:
```
Merged Result:
- Teammates: [AlixThus, ScareQro, oSalad, c0mbat_Barbi3] (4 unique)
- Opponents:
  - MURDER SPAGHURDER: 4 players
  - MEANR THAN AVG: 4 players (combined from both)
  - ANOTHER TEAM: 4 players
```

## API Reference

### `mergeOCRData(existing, incoming)`
Merge two OCR results from the same match.
- **Returns**: Merged `OCRExtractedData`

### `isSameMatchSession(data1, data2, maxTimeDiffMs?)`
Check if two captures are from the same match.
- **Returns**: `boolean`
- **Default max time**: 5 minutes

### `createEmptyOCRData()`
Create an empty OCR data structure for accumulation.
- **Returns**: Empty `OCRExtractedData`
