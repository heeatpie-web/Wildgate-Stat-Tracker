# Master handoff prompt

Copy everything below the line into a fresh agent session.

---

You are picking up a nearly-finished bug-fix pass on **Wildgate Stat Tracker**, an Electron +
React + TypeScript + Zustand + Tailwind desktop app.

**Repo:** `N:\Coding (backup)` — use this path with Read/Edit/Grep/Glob.
Your Linux shell sees the same folder at `/sessions/<session>/mnt/Coding (backup)`.

## Read these first, in order

1. `docs/plans/2026-07-29-CHECKPOINT-resume-here.md` — current state of all 11 defects, what's
   verified, what isn't, and the environment gotchas. **This is your primary brief.**
2. `docs/plans/2026-07-29-eleven-defect-rootcause-report.md` — the underlying root-cause analysis
   with file:line detail, if you need to understand *why* a change was made.
3. `AGENTS.md` — the release workflow.

## Context

All 11 reported defects are already implemented across 51 files. `npx tsc --noEmit -p
tsconfig.typecheck.json` passes clean (exit 0). 234 pure-logic tests pass.

**Nothing has been executed in a browser-like environment.** The prior session ran in a sandbox
that capped shell calls at 45 seconds and killed background processes between calls, so lint
never ran and all nine jsdom test suites are unexecuted — written and statically reviewed, but
never actually run.

## Your tasks, in order

### 1. Verify the build

```bash
npm run ci:quality      # lint && test && typecheck && build
```

Fix any fallout. Notes that will save you time:

- **`--reporter=basic` does not exist in vitest 4.0.18.** It fails with `ERR_LOAD_URL` and looks
  exactly like a hang. Three agents lost time to this. Use the default reporter.
- If failures appear, the likeliest locations are `PregameAdvicePanel.test.tsx` and
  `RecordingView.test.tsx` — they assert against a new identity-canonicalisation boundary that is
  the largest behavioural change in the pass, and their tests were authored but never executed.
  Other unexecuted suites: `OcrCorrectionModal.test.tsx`, `useAnalyticsData.test.tsx`,
  `EntityAnalyticsView.test.tsx`, `EditMatchModal.test.tsx`, `SeedsPanel.test.tsx`,
  `IdMapper.test.tsx`, `SquadronPanel.test.tsx`.
- When a test fails, **work out whether the test or the implementation is wrong.** Several tests
  were deliberately updated because they encoded old buggy behaviour (e.g. category surviving a
  match reset, threat copy naming a ship instead of a player). Do not "fix" a test back into
  asserting a bug. Check the root-cause report before changing an assertion.
- Do **not** use `sed`/`perl` for in-place edits. The repo has mixed CRLF/LF and a previous agent
  corrupted a file that way. Use the Edit tool.

### 2. Review the telemetry change before trusting it

`src/hooks/useLogMonitor.ts` gained ~102 lines: four-gate diagnostic instrumentation plus a fix
to stale `localTelemetryShipSelectionRef` suppression. This file is central to live match
capture — a regression here breaks recording.

The root-cause report explicitly advised against fixing this blind, and the agent that wrote it
was cut off before finishing its tests. Read the diff (`git diff src/hooks/useLogMonitor.ts`) and
satisfy yourself it's sound. Flag anything doubtful to the user rather than shipping it silently.

### 3. Normalise the line endings

The working tree shows ~349 modified files, but only 51 have real changes —
`git diff --ignore-all-space` is empty for the rest. It's pure CRLF↔LF churn.

`scripts/release.cjs` validates a clean tree and **will refuse to run** until this is resolved.
Handle it as its own separate commit *before* the fix commit, so the 51 real files stay
reviewable in history. A `.gitattributes` with `* text=auto eol=lf` is the usual approach — but
confirm the intended convention with the user first, since it rewrites the whole repo.

### 4. Commit and release

Commit the real changes with a clear message, then:

```bash
node scripts/release.cjs minor --message "Bullet 1; Bullet 2; Bullet 3"
```

**Use `minor`, not `patch`** — this pass adds two user-facing settings (master volume,
configurable popup timeout) and a new Analytics dimension (match categories). Current version is
`3.10.2`, so this becomes `3.11.0`.

Write 4–6 changelog bullets in plain user-facing language. Draw them from the checkpoint doc's
status table. Describe what the user notices, not the internals — "Enemy intel now identifies
threatening players instead of ship types", not "canonicalised the pregame advice identity layer".

The script bumps `package.json`, `src/utils/constants.ts` (`APP_VERSION`) and
`src/utils/changelog.ts`, commits, tags, and pushes. GitHub Actions then builds the Windows
installer and attaches it to the release (~15 min).

### 5. Build and silently install locally

**Read this carefully — there is a platform constraint.**

Your bash tool is a **Linux sandbox**. It cannot produce a Windows NSIS installer (that needs
Wine at minimum) and it categorically cannot install software onto the user's Windows machine —
different filesystem, no access. Do not attempt either from bash and do not report success from a
sandbox build.

Run these on the **Windows host** instead, via the computer-use tools (open a terminal in the
repo folder), or by asking the user to run them:

```powershell
npm run electron:build
```

Output lands at:

```
N:\Coding (backup)\dist-electron\Wildgate-Stat-Tracker-Setup-3.11.0.exe
```

Then silent-install. The installer is NSIS with `oneClick: false` (assisted), so `/S` gives a
silent install:

```powershell
& "N:\Coding (backup)\dist-electron\Wildgate-Stat-Tracker-Setup-3.11.0.exe" /S
```

Add `/D=C:\Path\To\Install` to override the install directory (must be last, unquoted).

Note the app config has `deleteAppDataOnUninstall: true`. A silent install over an existing
installation should preserve the user's match database, but **confirm with the user before
installing** — their match history is the whole point of the app, and you should not risk it
without asking. Offer to back up the app-data folder first.

## Reporting

Report back with: lint/test results, anything you changed and why, the released version number,
and confirmation the local install succeeded. If you skip or defer any step, say so plainly
rather than implying completion.
