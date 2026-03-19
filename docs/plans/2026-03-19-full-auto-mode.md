# Full Auto Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When Full Auto is enabled, the pixel monitor triggers a lightweight result-screen OCR pass that auto-saves the match (Win/Loss/placement + existing pending data) with a toast — no wizard, no user interaction.

**Architecture:** A new `resultScreenExtractor.cjs` parses VICTORY/DEFEAT text from the top 35% of the screenshot using the existing PaddleOCR pipeline. The renderer captures the screen, sends it to `scan-result-screen` IPC, saves the screenshot as an artifact, then calls `autoSaveMatch()` which builds a Match from store `pendingMatchData` + result data and calls `addMatch()`.

**Tech Stack:** Electron (main/renderer IPC), PaddleOCR via `paddleOcrHandler.cjs`, Zustand (`useAppStore`), React hooks, Tailwind CSS

---

## Task 1: `electron/resultScreenExtractor.cjs`

Parse VICTORY/DEFEAT/placement from a result screen image buffer using the existing OCR pipeline.

**Files:**
- Create: `electron/resultScreenExtractor.cjs`

**Step 1: Read `electron/paddleOcrHandler.cjs`** — understand the `paddleOcrBuffer(buffer, options)` signature and what it returns (array of `{ text, confidence, bbox }` objects). Also check `electron/ocrHandler.cjs` for how it converts a dataUrl to a buffer before calling PaddleOCR.

**Step 2: Create `electron/resultScreenExtractor.cjs`**

```js
/**
 * @module resultScreenExtractor
 * Lightweight OCR pass on the top 35% of a screenshot to detect match result.
 * Returns { result, winType, placement } from VICTORY/DEFEAT text patterns.
 */

const { nativeImage } = require('electron');
const { paddleOcrBuffer } = require('./paddleOcrHandler.cjs');

/**
 * @typedef {{ result: 'Win'|'Loss'|null, winType?: 'combat'|'artifact', placement?: number }} ResultScreenData
 */

/**
 * Parse match result from the top portion of a screenshot.
 * @param {Buffer} imageBuffer - PNG buffer of the full screenshot
 * @returns {Promise<ResultScreenData>}
 */
async function extractResultScreen(imageBuffer) {
    // Crop to top 35% where VICTORY/DEFEAT banner appears
    const img = nativeImage.createFromBuffer(imageBuffer);
    const { width, height } = img.getSize();
    const cropH = Math.round(height * 0.35);
    const cropped = img.crop({ x: 0, y: 0, width, height: cropH });
    const croppedBuffer = cropped.toPNG();

    // Run OCR (PaddleOCR returns [{text, confidence, bbox}])
    const lines = await paddleOcrBuffer(croppedBuffer, { lang: 'en' });
    const text = lines.map(l => (l.text || l[1]?.[0] || '')).join('\n').toUpperCase();

    return parseResultText(text);
}

/**
 * Parse the OCR text to determine match result.
 * @param {string} text - Uppercased OCR output
 * @returns {ResultScreenData}
 */
function parseResultText(text) {
    const isVictory = /VICTORY/.test(text);
    const isDefeat = /DEFEAT/.test(text);
    const placementMatch = text.match(/(\d)(ST|ND|RD|TH)\s*(PLACE)?/);
    const isArtifact = /ARTIFACT/.test(text);
    const isRivals = /RIVALS\s*ELIMINATED/.test(text);

    if (isVictory) {
        return {
            result: 'Win',
            winType: isArtifact ? 'artifact' : isRivals ? 'combat' : undefined,
        };
    }

    if (isDefeat) {
        return { result: 'Loss', winType: isArtifact ? 'artifact' : undefined };
    }

    if (placementMatch) {
        return { result: 'Loss', placement: parseInt(placementMatch[1], 10) };
    }

    return { result: null };
}

module.exports = { extractResultScreen, parseResultText };
```

**Step 3: Verify `paddleOcrBuffer` API** — open `electron/paddleOcrHandler.cjs`, confirm the function exists and the return shape. Adjust the `lines.map(...)` accessor if the shape differs (e.g. `l.text` vs `l[1][0]`).

**Step 4: Commit**
```bash
git add electron/resultScreenExtractor.cjs
git commit -m "feat: add result screen OCR extractor"
```

---

## Task 2: IPC handler `scan-result-screen`

Wire the extractor into the Electron IPC bridge.

**Files:**
- Modify: `electron/main.cjs` (after the pixel-monitor handlers at the end of the file)
- Modify: `electron/preload.cjs`

**Step 1: Add import + handler to `electron/main.cjs`**

Near the top requires (after the pixelMonitor require):
```js
const { extractResultScreen } = require('./resultScreenExtractor.cjs');
```

After the pixel monitor IPC block at the end of the file:
```js
ipcMain.handle('scan-result-screen', async (_event, { imageBase64 }) => {
    try {
        if (!imageBase64 || typeof imageBase64 !== 'string') {
            return { success: false, error: 'Invalid image data' };
        }
        const buffer = Buffer.from(
            imageBase64.replace(/^data:image\/\w+;base64,/, ''),
            'base64'
        );
        const result = await extractResultScreen(buffer);
        return { success: true, data: result };
    } catch (err) {
        console.error('[ResultScanner] Error:', err.message);
        return { success: false, error: err.message };
    }
});
```

**Step 2: Whitelist in `electron/preload.cjs`**

Add `'scan-result-screen'` to the `INVOKE_CHANNELS` array (alongside `'scan-epic-ids'`, `'read-file-base64'`, `'open-path'`):
```js
  'scan-epic-ids',
  'read-file-base64', 'open-path',
  'pixel-monitor-sample',
  'scan-result-screen',
```

**Step 3: Commit**
```bash
git add electron/main.cjs electron/preload.cjs
git commit -m "feat: add scan-result-screen IPC handler"
```

---

## Task 3: `fullAutoEnabled` setting

Add the setting that gates the full auto pipeline.

**Files:**
- Modify: `src/store/slices/createSettingsSlice.ts`

**Step 1: Add to `SettingsSlice` interface** (after the `pixelMonitorChangeSensitivity` fields, around line 256):
```ts
  fullAutoEnabled: boolean;
  setFullAutoEnabled: (enabled: boolean) => void;
```

**Step 2: Add default + setter in `createSettingsSlice`** (after `pixelMonitorChangeSensitivity: 30,`):
```ts
  fullAutoEnabled: false,
```

And after the `setPixelMonitorChangeSensitivity` setter:
```ts
  setFullAutoEnabled: (enabled) => set({ fullAutoEnabled: Boolean(enabled) }),
```

**Step 3: Commit**
```bash
git add src/store/slices/createSettingsSlice.ts
git commit -m "feat: add fullAutoEnabled setting"
```

---

## Task 4: `autoSaveMatch` function in `App.tsx`

New function that builds a Match from `pendingMatchData` + result screen data and saves it silently.

**Files:**
- Modify: `src/App.tsx`

**Step 1: Understand the pending data shape.** Open `src/store/slices/createDataSlice.ts` and find `pendingMatchData`. Also find how the existing wizard submission builds a `Match` from pending data (search for `addMatch(` in `src/App.tsx`). Note required vs optional `Match` fields (see `src/types.ts` lines 166–241).

**Step 2: Add the `autoSaveMatch` function** in `App.tsx`, near `handleApplyOCRData` (around line 2128). Place it as a `useCallback` in the main App component body:

```ts
const autoSaveMatch = useCallback((
    resultData: { result: 'Win' | 'Loss' | null; winType?: string; placement?: number },
    artifactPath?: string | null
) => {
    const state = useAppStore.getState();
    const pending = state.pendingMatchData ?? {};
    const now = Date.now();

    const match: Match = {
        id: now,
        timestamp: now,
        date: new Date(now).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
        }),
        mode: (pending.mode as GameMode) ?? activeMode,
        player: activeUser ?? '',
        result: (resultData.result as MatchResult) ?? ('Ongoing' as MatchResult),
        subType: resultData.winType ?? '',
        placement: resultData.placement,
        hero: pending.hero ?? activeHero ?? '',
        ship: pending.ship ?? activeShip ?? '',
        teammates: pending.teammates ?? [...(selectedTeammates ?? [])],
        opponents: pending.opponents ?? [...(selectedOpponents ?? [])],
        reachModifiers: pending.reachModifiers ?? [...(selectedReachModifiers ?? [])],
        kills: pending.kills ?? {},
        loadout: pending.loadout ?? currentLoadout ?? undefined,
        time: pending.time,
        killedBy: pending.killedBy ?? pendingKilledBy ?? undefined,
        killedByShip: pending.killedByShip ?? pendingKilledByShip ?? undefined,
        artifacts: artifactPath ? [artifactPath] : (pending.artifacts ?? []),
        telemetryDraftState: 'ready',
    };

    addMatch(match);

    const label = resultData.result === 'Win'
        ? `Victory${resultData.winType ? ` (${resultData.winType})` : ''}`
        : resultData.result === 'Loss'
        ? `Loss${resultData.placement ? ` — ${resultData.placement}${['st','nd','rd'][resultData.placement - 1] ?? 'th'} place` : ''}`
        : 'result unknown — edit manually';

    setToast({
        message: `Match auto-saved: ${label}`,
        type: resultData.result ? 'success' : 'warning',
    });
}, [activeMode, activeUser, activeHero, activeShip, selectedTeammates, selectedOpponents,
    selectedReachModifiers, pendingKilledBy, pendingKilledByShip, currentLoadout, addMatch, setToast]);
```

> **Note:** Check what variables are already destructured from `useGameData()` and `useUIState()` in the component body (around lines 508–592). Use those exact variable names. Add any missing ones to the destructuring. `setToast` comes from `useUIState()`. `addMatch` comes from `useGameData()`. `activeMode` / `activeUser` come from settings/UIState.

**Step 3: Expose `autoSaveMatch` to the pixel monitor** — pass it as a prop to `usePixelMonitor` or expose via a ref. The cleanest way: update `usePixelMonitor()` signature to accept it (see Task 5).

**Step 4: Commit** (after Task 5 is done — commit together)

---

## Task 5: Modify `usePixelMonitor.ts` for full auto branch

When `fullAutoEnabled` is on, the trigger fires the full auto pipeline instead of `handleSmartScan`.

**Files:**
- Modify: `src/hooks/usePixelMonitor.ts`
- Modify: `src/App.tsx` (call site)

**Step 1: Update `usePixelMonitor` signature** to accept `onFullAutoTrigger`:

```ts
export function usePixelMonitor(onFullAutoTrigger?: () => Promise<void>) {
    // ... existing code ...
    const fullAutoEnabled = useAppStore(s => s.fullAutoEnabled);
    const onFullAutoRef = useRef(onFullAutoTrigger);
    useEffect(() => { onFullAutoRef.current = onFullAutoTrigger; }, [onFullAutoTrigger]);
```

**Step 2: Replace the trigger listener** with a branching handler:

```ts
    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;

        const unsub = api.on('pixel-monitor-trigger', async () => {
            if (isScanningRef.current) return;
            if (Date.now() < cooldownRef.current) return;
            cooldownRef.current = Date.now() + TRIGGER_COOLDOWN_MS;

            if (fullAutoEnabledRef.current && onFullAutoRef.current) {
                await onFullAutoRef.current();
            } else {
                handleSmartScanRef.current();
            }
        });

        return unsub;
    }, []);
```

> Add `const fullAutoEnabledRef = useRef(fullAutoEnabled)` and `useEffect(() => { fullAutoEnabledRef.current = fullAutoEnabled; }, [fullAutoEnabled])` — same ref pattern used for `isScanningRef`.

**Step 3: Write `triggerFullAutoSave` in `App.tsx`** and pass it to `usePixelMonitor`:

```ts
// Near the usePixelMonitor call in App.tsx:
const triggerFullAutoSave = useCallback(async () => {
    const api = getElectronAPI();
    if (!api) return;

    try {
        // 1. Capture screen
        const capture = await api.invoke('capture-screen');
        if (!capture?.dataUrl) {
            setToast({ message: 'Auto-capture failed: could not take screenshot', type: 'error' });
            return;
        }

        const imageBase64 = capture.dataUrl; // dataUrl already has the data: prefix

        // 2. Run result screen OCR in parallel with saving screenshot
        const [scanResult, saveResult] = await Promise.all([
            api.invoke('scan-result-screen', { imageBase64 }),
            api.invoke('save-screenshot', {
                imageBase64: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
            }),
        ]);

        const resultData = scanResult?.data ?? { result: null };
        const artifactPath = saveResult?.data?.filePath ?? null;

        autoSaveMatch(resultData, artifactPath);
    } catch (err) {
        console.error('[FullAuto] Error:', err);
        setToast({ message: 'Auto-save failed — check console', type: 'error' });
    }
}, [autoSaveMatch, setToast]);

// Update the usePixelMonitor call:
usePixelMonitor(triggerFullAutoSave);
```

**Step 4: Check `capture-screen` return shape** — open `electron/handlers/artifactHandlers.cjs` or `electron/main.cjs` and find the `capture-screen` handler. Confirm it returns `{ dataUrl }` (or adjust the accessor above).

**Step 5: Commit**
```bash
git add src/hooks/usePixelMonitor.ts src/App.tsx
git commit -m "feat: full auto pipeline - capture, OCR, auto-save match"
```

---

## Task 6: Settings UI — Full Auto toggle

Add a toggle to the existing Auto-Capture panel.

**Files:**
- Modify: `src/components/SettingsModal.tsx`

**Step 1: Add store subscriptions** (alongside the other `pixelMonitor*` subscriptions, around line 229):

```ts
const fullAutoEnabled = useAppStore(s => s.fullAutoEnabled);
const setFullAutoEnabled = useAppStore(s => s.setFullAutoEnabled);
```

**Step 2: Add Full Auto toggle** inside the Auto-Capture panel `<div>`, after the grid of coordinate inputs and before the "Test region" button row. Insert after `</div>` that closes the grid:

```tsx
{/* Full Auto toggle */}
<div className="mt-3 flex items-start justify-between gap-3">
    <div>
        <div className="text-label-sm font-semibold text-md-sys-on-surface">Full Auto mode</div>
        <div className="mt-0.5 text-label-sm text-md-sys-on-surface/60">
            Auto-saves the match when the result screen is detected. No wizard required.
            Requires pixel monitor to be enabled.
        </div>
    </div>
    <label className="flex cursor-pointer items-center gap-2 shrink-0 mt-0.5">
        <input
            type="checkbox"
            checked={fullAutoEnabled}
            onChange={e => setFullAutoEnabled(e.target.checked)}
            disabled={!pixelMonitorEnabled}
            className="h-4 w-4 accent-md-sys-primary disabled:opacity-40"
        />
        <span className={`text-label-sm ${pixelMonitorEnabled ? 'text-md-sys-on-surface/70' : 'text-md-sys-on-surface/35'}`}>
            Enabled
        </span>
    </label>
</div>
```

**Step 3: Commit**
```bash
git add src/components/SettingsModal.tsx
git commit -m "feat: add Full Auto toggle to Settings Auto-Capture panel"
```

---

## Task 7: End-to-end verification

**Step 1: Build and run the Electron app** (`npm run dev` or whatever the dev script is — check `package.json`).

**Step 2: Open Settings → Capture → scroll to Auto-Capture panel.** Verify:
- Pixel monitor fields are present with correct defaults (X:952, Y:543, W:16, H:45)
- "Full Auto mode" toggle appears, grayed out when Pixel Monitor is disabled
- Enabling Pixel Monitor makes Full Auto toggle active

**Step 3: Test `parseResultText` manually.** Open DevTools console and test the extractor logic with mock strings:
- `"VICTORY RIVALS ELIMINATED"` → `{ result: 'Win', winType: 'combat' }`
- `"VICTORY ARTIFACT"` → `{ result: 'Win', winType: 'artifact' }`
- `"2ND PLACE TEAM WINS"` → `{ result: 'Loss', placement: 2 }`
- `"DEFEAT ARTIFACT RECOVERED"` → `{ result: 'Loss', winType: 'artifact' }`
- `"RANDOM TEXT"` → `{ result: null }`

**Step 4: Test the IPC handler.** In DevTools console:
```js
// Trigger a test capture + scan
window.electronAPI.invoke('capture-screen').then(r => {
    window.electronAPI.invoke('scan-result-screen', { imageBase64: r.dataUrl })
        .then(console.log)
})
```

**Step 5: Live test.** Start a match with pixel monitor + full auto enabled. When the result screen appears, verify:
- Toast notification appears within ~3 seconds
- Match appears in match history with correct result
- Result screen screenshot is attached as an artifact

---

## Notes

- `paddleOcrBuffer` API: check `electron/paddleOcrHandler.cjs` for exact function signature and return shape before implementing Task 1. The `lines.map(l => l.text || l[1]?.[0] || '')` accessor covers common PaddleOCR output formats but may need adjustment.
- `capture-screen` return: check `electron/main.cjs` or `electron/handlers/` for the handler to confirm it returns `{ dataUrl }` vs `{ data: { dataUrl } }`.
- If PaddleOCR is not initialized at the time `extractResultScreen` is called, it will need `initPaddleOCR()` to be awaited first — check if `ocrHandler.cjs` initializes it at startup.
- The `autoSaveMatch` function references variables that may need to be destructured from the right hooks — verify exact variable names against the existing destructuring in App.tsx around lines 508–592.
