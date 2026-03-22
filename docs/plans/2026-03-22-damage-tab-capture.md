# Damage Tab Capture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the damage panel capture sequence so it waits for the panel to animate in, captures both tabs (damage sources + enemy ships), and discards gracefully when no panel appears.

**Architecture:** Three targeted changes in `src/App.tsx`: fix timing constants, fix the capture region, and rewrite `captureDamageSourcesArtifact` to capture both tabs sequentially with a proper discard check. One type addition in `useMatchSubmission.ts` to handle the new `damage-ships` artifact kind.

**Tech Stack:** TypeScript, React, Electron IPC (`capture-result-screen-region`, `scan-result-screen`, `send-game-ui-action`)

---

### Task 1: Fix timing constants and capture region in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx:312-321`

**Step 1: Update constants**

Replace these three constants:
```ts
const FULL_AUTO_FINAL_MOMENTS_SETTLE_MS = 300;
const FULL_AUTO_DAMAGE_SOURCES_TRANSITION_MS = 400;
const FULL_AUTO_DAMAGE_SOURCES_CAPTURE_TIMEOUT_MS = 2_000;
const FULL_AUTO_DAMAGE_SOURCES_CAPTURE_REGION = {
    left: 0.55,
    top: 0.16,
    width: 0.36,
    height: 0.60,
    normalized: true,
} as const;
```

With:
```ts
// Time to wait after result OCR for the damage panel to slide into position (~3s from text, ~2s from tripwire fire)
const FULL_AUTO_FINAL_MOMENTS_SETTLE_MS = 2_000;
// Time to wait after pressing ] before capturing tab 2
const FULL_AUTO_DAMAGE_SOURCES_TRANSITION_MS = 100;
// Damage panel region: x=1010, y=100, w=880, h=720 at 1920x1080 — fits the FINAL MOMENTS RECAP panel
const FULL_AUTO_DAMAGE_SOURCES_CAPTURE_REGION = {
    left: 0.526,
    top: 0.093,
    width: 0.458,
    height: 0.667,
    normalized: true,
} as const;
```

Note: `FULL_AUTO_DAMAGE_SOURCES_CAPTURE_TIMEOUT_MS` can be deleted — the new approach doesn't poll.

**Step 2: Run existing tests to confirm no breakage**
```bash
npm test -- --testPathPattern="useMatchSubmission|App" --passWithNoTests
```

**Step 3: Commit**
```bash
git add src/App.tsx
git commit -m "fix(damage-capture): update timing constants and panel region"
```

---

### Task 2: Rewrite `captureDamageSourcesArtifact` in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx:2769-2813`

**Context:** The current implementation takes the baseline from the first (early, pre-panel) screenshot and polls for a visual change — fragile and wrong-ordered. The new approach: wait for panel, capture tab 1, switch, capture tab 2, discard if tab 1 scan shows no damage.

**Step 1: Replace the function body**

The existing function (lines 2769–2813) becomes:

```ts
const captureDamageSourcesArtifact = useCallback(async (
    api: NonNullable<ReturnType<typeof getElectronAPI>>,
    _resultImageBase64: string,   // kept for signature compat; unused now
    matchId: number,
) => {
    // Wait for damage panel to animate into position (~2s after result OCR fires)
    await waitForDuration(FULL_AUTO_FINAL_MOMENTS_SETTLE_MS);

    // --- Tab 1: Damage Sources (fresh screenshot, panel now visible) ---
    const tab1Capture = await api.invoke('capture-result-screen-region', {
        cropRegion: FULL_AUTO_DAMAGE_SOURCES_CAPTURE_REGION,
    });
    const tab1Base64 = normalizeImageBase64Payload(tab1Capture?.imageBase64);
    if (!tab1Base64) {
        console.warn('[FullAuto] Unable to capture damage panel tab 1', { matchId });
        return null;
    }

    // Discard check: scan tab 1 for damage-related content
    const tab1Scan = await api.invoke('scan-result-screen', { imageBase64: tab1Base64 });
    const tab1DamageTaken = tab1Scan?.data?.damageTaken ?? null;
    const tab1HasDamage = tab1DamageTaken != null && Number.isFinite(Number(tab1DamageTaken));
    if (!tab1HasDamage) {
        console.warn('[FullAuto] No damage content in tab 1 crop — discarding damage capture', { matchId });
        return null;
    }

    // --- Switch to Tab 2: Enemy Ships ---
    const toggleResult = await sendGameUiAction('show-damage-sources');
    if (!toggleResult.success) {
        console.warn('[FullAuto] Failed to toggle to enemy ships tab', { matchId, error: toggleResult.error ?? null });
        // Still return tab 1 even if tab 2 fails
        return [{ imageBase64: tab1Base64, kind: 'damage-sources' as const }];
    }

    await waitForDuration(FULL_AUTO_DAMAGE_SOURCES_TRANSITION_MS);

    // --- Tab 2: Enemy Ships ---
    const tab2Capture = await api.invoke('capture-result-screen-region', {
        cropRegion: FULL_AUTO_DAMAGE_SOURCES_CAPTURE_REGION,
    });
    const tab2Base64 = normalizeImageBase64Payload(tab2Capture?.imageBase64);
    if (!tab2Base64) {
        console.warn('[FullAuto] Unable to capture damage panel tab 2', { matchId });
        return [{ imageBase64: tab1Base64, kind: 'damage-sources' as const }];
    }

    return [
        { imageBase64: tab1Base64, kind: 'damage-sources' as const },
        { imageBase64: tab2Base64, kind: 'damage-ships' as const },
    ];
}, []);
```

**Step 2: Update the call site** (~line 2970) — `damageSourcesArtifact` is now an array or null:

```ts
// Before:
const damageSourcesArtifact = (
    resultData.result === 'Win'
    || resultData.result === 'Loss'
)
    ? await captureDamageSourcesArtifact(api, imageBase64, normalizedDraftMatchId)
    : null;
const supplementalArtifacts = damageSourcesArtifact ? [damageSourcesArtifact] : [];

// After:
const supplementalArtifacts = (
    resultData.result === 'Win'
    || resultData.result === 'Loss'
)
    ? (await captureDamageSourcesArtifact(api, imageBase64, normalizedDraftMatchId)) ?? []
    : [];
```

**Step 3: Run tests**
```bash
npm test -- --testPathPattern="useMatchSubmission|App" --passWithNoTests
```

**Step 4: Commit**
```bash
git add src/App.tsx
git commit -m "fix(damage-capture): rewrite captureDamageSourcesArtifact with correct timing and two-tab sequence"
```

---

### Task 3: Add `damage-ships` kind to `useMatchSubmission.ts`

**Files:**
- Modify: `src/hooks/useMatchSubmission.ts:147`
- Modify: `src/hooks/useMatchSubmission.ts:1451-1458`

**Step 1: Extend the artifact kind type** (~line 147)

```ts
// Before:
kind?: 'damage-sources';

// After:
kind?: 'damage-sources' | 'damage-ships';
```

**Step 2: Handle `damage-ships` in the OCR loop** (~line 1451)

```ts
// Before:
if (artifact.kind === 'damage-sources') {

// After:
if (artifact.kind === 'damage-sources' || artifact.kind === 'damage-ships') {
```

Both tab 1 and tab 2 contain readable damage text — the same OCR merge applies to both.

**Step 3: Run tests**
```bash
npm test -- --testPathPattern="useMatchSubmission" --passWithNoTests
```

**Step 4: Commit**
```bash
git add src/hooks/useMatchSubmission.ts
git commit -m "feat(damage-capture): handle damage-ships artifact kind in match submission OCR"
```

---

### Task 4: Verify end-to-end with a real match

**Manual test checklist:**
- [ ] Play a match to **2nd place** combat defeat → confirm two damage crops saved with match, `damageTaken` populated
- [ ] Play a match to **Artifact Victory** → confirm NO damage crops saved, no errors
- [ ] Play a match to **3rd/4th/5th place** → confirm tripwire may fire but no damage crops saved (discard logic triggers)
- [ ] Check app logs for `[FullAuto] No damage content in tab 1 crop — discarding` on non-damage outcomes

**Expected log sequence for 2nd place:**
```
[FullAuto] Text signal received - scheduling result capture
[FullAuto] (2000ms later) Tab 1 captured, damageTaken=114
[FullAuto] Tab 2 captured (enemy ships)
[MatchSubmission] Background artifact OCR merged into saved match
```
