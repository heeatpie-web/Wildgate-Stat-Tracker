# Remove AccelByte API & Epic Games Server Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all server-side AccelByte API and Epic Games network calls from the app, keeping every local-only operation (log file reading, local ID parsing) intact.

**Architecture:** Three files need changes. The `epic-request` IPC handler and its supporting constants/functions are the only server-touching code. The local log reader (`scan-epic-ids`) and the `AccelByteTelemetryCache` path logic are purely filesystem operations and must not be touched.

**Tech Stack:** Node.js/Electron main process (CJS), preload bridge, security test script.

---

## What to Keep vs Remove

### KEEP — local operations, do not touch
- `scan-epic-ids` IPC handler (`main.cjs:2093+`) — reads local log files only, no network
- `AccelByteTelemetryCache` path resolution in `start-log-monitoring` (`main.cjs:1944-1954`) — local filesystem
- `EXTERNAL_ALLOWED_HOSTS` constant (`main.cjs:89-94`) — used by a different IPC handler at line 2378
- All `poiEpic` references in frontend — these are "Epic difficulty" game stats, unrelated to Epic Games
- `scan-epic-ids` entry in `preload.cjs` INVOKE_CHANNELS — local call, keep it

### REMOVE — server-side only
- `DEFAULT_EPIC_REQUEST_HOSTS` + `EPIC_REQUEST_ALLOWED_HOSTS` constants (`main.cjs:77-88`)
- `MAX_EPIC_REQUEST_BODY_BYTES` constant (`main.cjs:95`)
- `isAllowedEpicHost()` function (`main.cjs:261-265`)
- `sanitizeForwardHeaders()` function (`main.cjs:267-~281`) — only used inside epic-request handler
- `ipcMain.handle('epic-request', ...)` handler (`main.cjs:1744-1823`) — entire block
- Section 4 of `security_negative_tests.cjs` (lines 215-258) — tests the removed handler

**Note:** `epic-request` was never exposed through the preload bridge (not in INVOKE_CHANNELS), so no frontend changes are needed.

---

## Task 1: Remove server constants from main.cjs

**Files:**
- Modify: `electron/main.cjs:77-95`

**Step 1: Read the block to confirm exact line boundaries**

Open `electron/main.cjs` and read lines 77-100 to confirm the exact content before editing.

**Step 2: Remove the three server constants**

Delete the following block entirely (lines 77-88 + line 95):

```js
// DELETE THIS — lines 77-88
const DEFAULT_EPIC_REQUEST_HOSTS = [
  'api.accelbyte.io',
  'services.accelbyte.io',
  'epicgames.com',
  'www.epicgames.com',
];
const EPIC_REQUEST_ALLOWED_HOSTS = new Set(
  (process.env.WILDGATE_ALLOWED_API_HOSTS || DEFAULT_EPIC_REQUEST_HOSTS.join(','))
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
);

// DELETE THIS — line 95
const MAX_EPIC_REQUEST_BODY_BYTES = Number(process.env.WILDGATE_MAX_EPIC_BODY_BYTES || (2 * 1024 * 1024));
```

Leave `EXTERNAL_ALLOWED_HOSTS` (lines 89-94) untouched.

**Step 3: Verify no remaining references**

Run:
```
grep -n "EPIC_REQUEST_ALLOWED_HOSTS\|DEFAULT_EPIC_REQUEST_HOSTS\|MAX_EPIC_REQUEST_BODY_BYTES" electron/main.cjs
```
Expected: no output.

**Step 4: Commit**
```bash
git add electron/main.cjs
git commit -m "remove: AccelByte API and Epic server constants from main.cjs"
```

---

## Task 2: Remove isAllowedEpicHost and sanitizeForwardHeaders from main.cjs

**Files:**
- Modify: `electron/main.cjs:261-~281`

**Step 1: Read lines 261-285 to confirm exact boundaries**

Both functions sit between line 261 and roughly line 281. Confirm there is nothing else in this range before deleting.

**Step 2: Remove both functions**

Delete `isAllowedEpicHost` entirely:
```js
// DELETE THIS — lines 261-265
function isAllowedEpicHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return Array.from(EPIC_REQUEST_ALLOWED_HOSTS).some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}
```

Delete `sanitizeForwardHeaders` entirely:
```js
// DELETE THIS — lines 267-~281
function sanitizeForwardHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    const cleanKey = key.trim();
    if (!cleanKey) continue;
    if (/[\r\n]/.test(cleanKey) || /[\r\n]/.test(value)) continue;
    // ... rest of function
  }
  return safe;
}
```

**Step 3: Verify no remaining references**

Run:
```
grep -n "isAllowedEpicHost\|sanitizeForwardHeaders" electron/main.cjs
```
Expected: no output.

**Step 4: Commit**
```bash
git add electron/main.cjs
git commit -m "remove: isAllowedEpicHost and sanitizeForwardHeaders helper functions"
```

---

## Task 3: Remove the epic-request IPC handler from main.cjs

**Files:**
- Modify: `electron/main.cjs:1744-1823`

**Step 1: Read lines 1740-1830 to confirm exact boundaries**

Confirm the handler starts at `ipcMain.handle('epic-request',` and ends at the closing `});` of that handler, around line 1823.

**Step 2: Delete the entire handler block**

Remove everything from `ipcMain.handle('epic-request', async (event, payload = {}) => {` through its closing `});`, inclusive.

**Step 3: Verify no remaining references**

Run:
```
grep -n "epic-request\|AccelByte-SDK\|EPIC_REQUEST" electron/main.cjs
```
Expected: no output.

**Step 4: Verify local operations are untouched**

Run:
```
grep -n "scan-epic-ids\|AccelByteTelemetryCache\|start-log-monitoring" electron/main.cjs
```
Expected: all three still present with line numbers.

**Step 5: Commit**
```bash
git add electron/main.cjs
git commit -m "remove: epic-request IPC handler (server-side AccelByte/Epic API calls)"
```

---

## Task 4: Remove Epic server validation section from security_negative_tests.cjs

**Files:**
- Modify: `scripts/security_negative_tests.cjs:215-258`

**Step 1: Read lines 210-265 to confirm exact boundaries**

Section 4 starts at the comment `// 4. EPIC REQUEST VALIDATION` and ends around line 258 with the last `assert(!isAllowedEpicHost(...))` call. Confirm the boundary before line 259 where another section begins.

**Step 2: Remove section 4 entirely**

Delete from `// 4. EPIC REQUEST VALIDATION` (line ~215) through the last assert in that section (line ~258), inclusive. This includes the local `DEFAULT_EPIC_REQUEST_HOSTS`, `EPIC_REQUEST_ALLOWED_HOSTS`, and `isAllowedEpicHost` copies defined in the test file, plus all assertions.

**Step 3: Fix section numbering if needed**

If section 5 follows section 4, renumber it to section 4 in its header comment for cleanliness.

**Step 4: Run the security tests to confirm they still pass**

Run:
```
node scripts/security_negative_tests.cjs
```
Expected: all remaining assertions pass, no errors, exit code 0.

**Step 5: Commit**
```bash
git add scripts/security_negative_tests.cjs
git commit -m "remove: Epic server request validation tests (handler removed)"
```

---

## Task 5: Final verification

**Step 1: Global grep for any remaining server references**

Run:
```
grep -rn "epic-request\|AccelByte-SDK\|EPIC_REQUEST_ALLOWED\|DEFAULT_EPIC_REQUEST\|MAX_EPIC_REQUEST\|isAllowedEpicHost\|sanitizeForwardHeaders\|api\.accelbyte\.io\|services\.accelbyte\.io" electron/ scripts/ src/
```
Expected: no output.

**Step 2: Confirm local operations still present**

Run:
```
grep -n "scan-epic-ids" electron/main.cjs electron/preload.cjs
grep -n "AccelByteTelemetryCache" electron/main.cjs
```
Expected: both still present.

**Step 3: TypeScript check**

Run:
```
npm run typecheck
```
Expected: passes with no new errors.

**Step 4: Security tests**

Run:
```
node scripts/security_negative_tests.cjs
```
Expected: all pass, exit 0.
