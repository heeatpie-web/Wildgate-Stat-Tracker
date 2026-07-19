# Agent Handoff — Verify, commit, push, build & silently install the background-perf fixes

You are running **on the user's Windows machine** at repo `N:\Coding (backup)` (Wildgate Stat
Tracker — Electron + React + TypeScript), with Windows-built `node_modules` and a working git
remote. A cloud agent just made the code changes described below but **could not run the test
suite, build, or install**. Your job, in order:

1. Run the full quality suite and **fix any issues** the changes introduced.
2. **Commit and push** all of the changes.
3. **Build** the Windows installer and **silently install** it on this machine.

Do not run `scripts/release.cjs` (that publishes a public GitHub release) unless the user
separately asks for a release.

---

## Context: what was changed and why

An investigation found the app taxing the laptop while idle in the tray: a stuck
`isMatchInProgress` flag could leave screen monitors running forever after the game closed
(the tactical-map monitor OCRs a full-desktop screenshot every 3s), the ViGEm virtual
controller stayed connected until app quit, and the game-process poll spawned `tasklist.exe`
every 5s while the game was down. Fixes made (all uncommitted, in the working tree):

### A. Tactical map auto-detect feature-locked OFF (4 layers)
- `src/hooks/useTacticalMapMonitor.ts` — new exported `TACTICAL_MAP_MONITOR_LOCKED = true`
  forces `shouldRun` false.
- `electron/main.cjs` — matching `TACTICAL_MAP_MONITOR_LOCKED` const; the
  `tactical-map-monitor-start` IPC handler refuses to start and logs
  `[TacticalMapMonitor] Start suppressed: feature locked`.
- `src/store/slices/createSettingsSlice.ts` — `setTacticalMapAutoCapture` is now a
  forced-false no-op.
- `src/store/useAppStore.ts` — hydration coerces `tacticalMapAutoCapture: false` (a
  previously-persisted `true` must not survive).
- `src/components/SettingsModal.tsx` — toggle disabled/greyed ("Locked") with an explanatory
  caption; the two now-unused store selectors (`tacticalMapAutoCapture`,
  `setTacticalMapAutoCapture`) were **removed** from the component (~line 904).

### B. Game-exit teardown
- `electron/main.cjs` — module-level `lastKnownGameRunning` + `teardownGameSessionResources()`
  (defined just above the `result-monitor-start` handler). On the AutoPerf poll's
  true→false edge it stops the result + tactical monitors, disconnects the virtual gamepad,
  then kills the persistent PowerShell host. Logs `[GameExit] Releasing game-session resources`.
- `electron/main.cjs` — `result-monitor-start` IPC now refuses to start when
  `lastKnownGameRunning === false` (null = unknown = allowed).
- `src/hooks/useGameExitCleanup.ts` — **new file**; listens to `game-process-status`, and 60s
  after the game goes down clears a still-stuck `isMatchInProgress` (+ `matchStartTime`).
  Telemetry draft deliberately untouched.
- `src/App.tsx` — imports and calls `useGameExitCleanup()` right after
  `useAutoPerformanceMode(...)` (~line 1134).

### C. Idle-throttled process scan
- `electron/main.cjs` — in `_pollGameProcessStatus`, new `_downScanSkipTicks` skips 2 of every
  3 ticks while the game is known down, so the `tasklist.exe` scan runs every ~15s instead of
  5s. Game-start detection worst case is now 15s (accepted trade-off).

### D. Virtual controller connect-margin + auto-disconnect
- `electron/gamepadInput.cjs` — new `CONNECT_SETTLE_MS = 2000`: every **fresh** connect waits
  2s before returning so the game can enumerate the pad before inputs fire (replaces the old
  ad-hoc 1000ms wait in `sendGamepadSequence`, which was removed; the settle is **skipped when
  `process.env.VITEST` is set** so unit tests stay fast). New `IDLE_DISCONNECT_MS = 30_000`
  idle linger: every send/connect (re)schedules an unref'd auto-disconnect timer. New exported
  `releaseVirtualGamepad(reason)` disconnects immediately.
- `electron/main.cjs` — the auto-capture coordinator's `afterSequence` hook now calls
  `gamepadInput.releaseVirtualGamepad('auto-capture sequence finished')` after
  `endAutoCaptureWindowSession()` (it runs in the coordinator's outer `finally`, so the pad is
  dropped at the end of every macro run, success or failure).

---

## Task 1 — Quality suite (fix what these changes broke; report anything else)

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

(`npm run ci:quality` runs all four if you prefer.)

Notes on likely friction:
- The working tree may contain **other pre-existing uncommitted work** (OCR/roster/rerun-modal
  changes from earlier sessions). Run `git status` + `git diff --stat` first so you know the
  full changeset you'll be committing. Fix failures caused by the changes listed above; if a
  failure clearly predates them, fix it if trivial, otherwise note it in your report.
- `gamepadInput.test.js` — should pass unchanged (settle is VITEST-skipped; idle timer is
  unref'd). If a test asserts the exact PS-call count after connect, check whether the new
  `_scheduleIdleDisconnect` path affects it (it makes no PS calls, so it shouldn't).
- `App.test.tsx` / anything mounting `App` — the new `useGameExitCleanup` subscribes via
  `api.on('game-process-status', ...)`, same shape as `useAutoPerformanceMode`. If a test's
  electronAPI mock lacks `on`/unsubscribe, extend the mock, don't weaken the hook.
- `SettingsModal.test.tsx` — the tactical-map toggle is now disabled and always unchecked; no
  existing test referenced it at handoff time, but if one was added since, update it to expect
  the locked state.
- `autoCaptureCoordinator.test.js` — unaffected in principle (its hooks are injected), but
  confirm green since `afterSequence` behavior in main.cjs changed.
- Typecheck risk spots: `useGameExitCleanup.ts` (`api.on` payload typing,
  `useAppStore.getState()`), the `SettingsModal.tsx` selector removal, `App.tsx` import.

## Task 2 — Commit & push

After everything is green:

```bash
git add -A
git commit -m "perf: stop background CPU drain when game exits

- Feature-lock tactical map auto-detect (per-3s desktop OCR loop) at IPC, hook, store, and UI layers
- Tear down result/tactical monitors, virtual gamepad, and persistent PowerShell on game-process exit
- Clear stale isMatchInProgress 60s after game exit (useGameExitCleanup)
- Refuse result-monitor start while game process is down
- Throttle idle tasklist.exe process scan from 5s to ~15s
- Virtual controller: 2s connect settle before inputs, 30s idle auto-disconnect, immediate release after auto-capture macros"
git push
```

Adjust the message if you had to include unrelated pre-existing work — describe that work too
rather than hiding it. If push is rejected (stale remote), rebase on the remote branch and
re-run the test suite before pushing.

## Task 3 — Build & silent install

```bash
npm run electron:build
```

This produces an NSIS installer named `Wildgate-Stat-Tracker-Setup-<version>.exe` (check
electron-builder's output directory — `release/` or `dist-electron`/`dist` per config; find it
with `Get-ChildItem -Recurse -Filter "Wildgate-Stat-Tracker-Setup-*.exe" | Sort-Object LastWriteTime`).

Then install silently:

1. Kill the running app first or the installer can't replace files (remember it hides in the
   tray — the process is running even if no window shows):
   ```powershell
   taskkill /IM "Wildgate Stat Tracker.exe" /F 2>$null
   ```
2. Run the NSIS installer silently (`oneClick:false` installers accept `/S`; it reuses the
   previous install directory):
   ```powershell
   Start-Process -FilePath ".\Wildgate-Stat-Tracker-Setup-<version>.exe" -ArgumentList "/S" -Wait
   ```
3. Confirm the installed version (check the exe's product version or launch the app and check
   the About/changelog screen), then leave the app in whatever running state the user prefers
   — if unsure, launch it once so the new build is active.

## Task 4 — Post-install smoke check (quick)

With the app running and the game **not** running:
- Console shows `[AutoPerf] game process not running` and, on any true→false edge later,
  `[GameExit] Releasing game-session resources (game process exited)`.
- Settings → the tactical map auto-detect toggle shows **Locked** and can't be enabled; no
  `[TacticalMapMonitor] Starting` lines ever appear (only `Start suppressed: feature locked`
  if the renderer requests it).
- After an auto-capture or F11 combo: `joy.cpl` shows the Xbox 360 pad appear, then vanish
  ~30s after the last input (or immediately when a capture macro finishes).

## Report back

1. Test/typecheck/lint/build results — failures you fixed (file:line + what you changed) and
   anything left broken that predates these changes.
2. The commit hash(es) pushed and the branch.
3. Installer path + version built, confirmation the silent install succeeded.
4. Smoke-check observations (the log lines above, controller connect/disconnect behavior).
