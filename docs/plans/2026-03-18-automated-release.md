# Automated Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Any AI agent can run `node scripts/release.cjs patch --message "..."` to bump versions, write the changelog, commit, tag, and push — triggering a GitHub Actions build that produces a ready-to-download `.exe` in ~15 minutes.

**Architecture:** A self-contained Node.js script (`scripts/release.cjs`) handles all local mechanics (version resolution, file edits, git operations). A GitHub Actions workflow (`release.yml`) triggers on version tag pushes and runs `electron-builder --publish always` on a Windows runner, uploading the installer and `latest.yml` to GitHub Releases automatically.

**Tech Stack:** Node.js (CJS, no external deps), electron-builder publish, GitHub Actions (`windows-latest` runner), `GH_TOKEN` repo secret.

---

### Task 1: Add `electron:publish` npm script to `package.json`

**Files:**
- Modify: `package.json` (scripts section)

**Step 1: Open `package.json` and add the script**

In the `"scripts"` block, add after `"electron:build"`:

```json
"electron:publish": "vite build && electron-builder --publish always",
```

**Step 2: Verify it appears correctly**

Run: `node -e "const p = require('./package.json'); console.log(p.scripts['electron:publish'])"`
Expected output: `vite build && electron-builder --publish always`

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add electron:publish script for CI release builds"
```

---

### Task 2: Create `scripts/release.cjs`

**Files:**
- Create: `scripts/release.cjs`

This script does everything needed for a release locally. It has zero external dependencies.

**Step 1: Create the file with this exact content**

```js
#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Helpers ────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', ...opts }).trim();
}

function die(msg) {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

function bumpSemver(current, part) {
  const clean = current.replace(/^v/, '');
  const [maj, min, pat] = clean.split('.').map(Number);
  if (part === 'major') return `${maj + 1}.0.0`;
  if (part === 'minor') return `${maj}.${min + 1}.0`;
  if (part === 'patch') return `${maj}.${min}.${pat + 1}`;
  die(`Unknown bump type: ${part}. Use major, minor, or patch.`);
}

function isSemver(str) {
  return /^\d+\.\d+\.\d+$/.test(str.replace(/^v/, ''));
}

// ─── Parse args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (!args.length) {
  console.log('Usage: node scripts/release.cjs <version|patch|minor|major> [--message "bullet 1; bullet 2"]');
  process.exit(0);
}

const versionArg = args[0];

// Parse --message / -m flag (semicolon-separated bullets)
let customMessage = null;
const msgFlagIdx = args.findIndex(a => a === '--message' || a === '-m');
if (msgFlagIdx !== -1 && args[msgFlagIdx + 1]) {
  customMessage = args[msgFlagIdx + 1];
}

// ─── Validate git state ──────────────────────────────────────────────────────

const gitStatus = run('git status --porcelain');
if (gitStatus) {
  die(`Working tree is not clean. Commit or stash your changes first:\n${gitStatus}`);
}

// ─── Resolve target version ──────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const currentVersion = pkg.version; // e.g. "3.3.3"

let nextVersion;
if (['patch', 'minor', 'major'].includes(versionArg)) {
  nextVersion = bumpSemver(currentVersion, versionArg);
} else if (isSemver(versionArg)) {
  nextVersion = versionArg.replace(/^v/, '');
} else {
  die(`Invalid version argument: "${versionArg}". Use patch/minor/major or an explicit version like 3.4.1`);
}

const nextTag   = `v${nextVersion}`;
const prevTag   = `v${currentVersion}`;

console.log(`\n🚀  Releasing ${prevTag} → ${nextTag}\n`);

// ─── Build changelog entries ─────────────────────────────────────────────────

let bullets;
if (customMessage) {
  // Agent-provided: split on semicolons, trim, drop empties
  bullets = customMessage.split(';').map(s => s.trim()).filter(Boolean);
} else {
  // Auto-generate from git log since last semver tag (or all commits if none)
  let logRange;
  try {
    // Find the most recent semver tag
    const tags = run('git tag --sort=-v:refname').split('\n').filter(t => /^v\d+\.\d+\.\d+$/.test(t));
    logRange = tags.length ? `${tags[0]}..HEAD` : 'HEAD';
  } catch {
    logRange = 'HEAD';
  }

  const rawLog = run(`git log ${logRange} --oneline --no-merges`);
  if (!rawLog) {
    die('No commits found since last release. Nothing to release.');
  }

  // Strip conventional commit prefixes (feat:, fix:, chore:, etc.) and SHAs
  bullets = rawLog
    .split('\n')
    .map(line => line.replace(/^[a-f0-9]+ /, '').replace(/^(feat|fix|chore|docs|refactor|perf|test|style|ci|build|revert)(\([^)]+\))?:\s*/i, '').trim())
    .filter(Boolean);

  console.log('📝  Auto-generated changelog bullets (pass --message to override):');
  bullets.forEach(b => console.log(`    • ${b}`));
  console.log('');
}

// ─── Update package.json ─────────────────────────────────────────────────────

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✅  package.json → ${nextVersion}`);

// ─── Update src/utils/constants.ts ──────────────────────────────────────────

const constantsPath = path.join(ROOT, 'src', 'utils', 'constants.ts');
let constants = fs.readFileSync(constantsPath, 'utf-8');
constants = constants.replace(
  /export const APP_VERSION = 'v[\d.]+';/,
  `export const APP_VERSION = '${nextTag}';`
);
fs.writeFileSync(constantsPath, constants);
console.log(`✅  constants.ts APP_VERSION → ${nextTag}`);

// ─── Update src/utils/changelog.ts ──────────────────────────────────────────

const changelogPath = path.join(ROOT, 'src', 'utils', 'changelog.ts');
let changelog = fs.readFileSync(changelogPath, 'utf-8');

const bulletLines = bullets.map(b => `    "${b.replace(/"/g, '\\"')}",`).join('\n');
const newEntry = `  "${nextTag}": [\n${bulletLines}\n  ],\n`;

changelog = changelog.replace(
  /^(export const CHANGELOG: Record<string, string\[\]> = \{)\n/,
  `$1\n${newEntry}`
);
fs.writeFileSync(changelogPath, changelog);
console.log(`✅  changelog.ts → added ${nextTag} with ${bullets.length} bullet(s)`);

// ─── Git: add, commit, tag, push ─────────────────────────────────────────────

run('git add package.json src/utils/constants.ts src/utils/changelog.ts');
run(`git commit -m "chore: release ${nextTag}"`);
console.log(`✅  Committed: chore: release ${nextTag}`);

run(`git tag ${nextTag}`);
console.log(`✅  Tagged: ${nextTag}`);

run('git push');
run('git push --tags');
console.log(`✅  Pushed commit and tag\n`);

console.log(`🎉  Release ${nextTag} is on its way. GitHub Actions will build the exe in ~15 minutes.`);
console.log(`    https://github.com/heeatpie-web/Wildgate-Stat-Tracker/releases\n`);
```

**Step 2: Smoke-test the script in dry-run mode (without pushing)**

Temporarily comment out the three `run('git ...')` lines at the bottom (push commit, tag, push), then run:

```bash
node scripts/release.cjs patch --message "Test release; Verify script works"
```

Expected: prints version bump plan, updates the three files, commits and tags locally. No push.

**Step 3: Verify the three files were updated correctly**

```bash
node -e "const p=require('./package.json'); console.log(p.version)"
# should print the bumped version

grep "APP_VERSION" src/utils/constants.ts
# should show the new v tag

head -6 src/utils/changelog.ts
# should show the new version entry at the top
```

**Step 4: Reset the test changes**

```bash
git tag -d <the-test-tag>
git reset HEAD~1
git checkout package.json src/utils/constants.ts src/utils/changelog.ts
```

**Step 5: Restore the push lines, then commit the script**

Uncomment the push lines, then:

```bash
git add scripts/release.cjs
git commit -m "feat: add automated release script"
```

---

### Task 3: Create `.github/workflows/release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create the workflow file**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build:
    runs-on: windows-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build and publish
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
        run: npm run electron:publish
```

**Step 2: Commit the workflow**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release workflow"
```

---

### Task 4: Add `GH_TOKEN` secret to the GitHub repo

This is a manual step in the browser — no code needed.

**Step 1: Generate a GitHub Personal Access Token**

1. Go to https://github.com/settings/tokens/new
2. Name it `WILDGATE_RELEASE`
3. Select scopes: `repo` (full control of private/public repos — needed to create releases)
4. Click **Generate token** and copy it immediately

**Step 2: Add it as a repo secret**

1. Go to https://github.com/heeatpie-web/Wildgate-Stat-Tracker/settings/secrets/actions
2. Click **New repository secret**
3. Name: `GH_TOKEN`
4. Value: paste the token
5. Click **Add secret**

---

### Task 5: Add release instructions to `AGENTS.md`, `CLAUDE.md`, and `README.md`

The goal is maximum discoverability across all AI agents:
- `AGENTS.md` — OpenAI Codex and many newer agents look for this file at the repo root
- `CLAUDE.md` — Claude looks here
- `README.md` — universal fallback; every agent and human reads it

**Files:**
- Create: `AGENTS.md` (repo root)
- Modify: `CLAUDE.md` (repo root — create if missing)
- Modify: `README.md` (repo root — add a `## For AI Agents` section if not present, or append to existing)

**Step 1: Create `AGENTS.md` at the repo root**

```markdown
# Agent Instructions — Wildgate Stat Tracker

This file is for AI agents (Claude, Codex, etc.). It documents the key workflows you need to operate on this repo.

## Releasing a New Version

To publish a new release (bumps version, writes changelog, builds exe, uploads to GitHub):

```bash
node scripts/release.cjs <version> --message "Change 1; Change 2; Change 3"
```

**Arguments:**
- `<version>`: `patch`, `minor`, `major`, or an explicit version like `3.4.1`
- `--message`: semicolon-separated human-readable changelog bullets

**What the script does automatically:**
1. Validates git working tree is clean
2. Bumps `package.json` version
3. Updates `APP_VERSION` in `src/utils/constants.ts`
4. Prepends a new entry to `src/utils/changelog.ts`
5. Commits all three files as `chore: release vX.Y.Z`
6. Creates and pushes a git tag
7. GitHub Actions triggers → builds Windows `.exe` → uploads to GitHub Releases (~15 min)

**Recommended agent workflow:**
1. `git log --oneline $(git describe --tags --abbrev=0 --match "v*.*.*" 2>/dev/null || echo "")..HEAD`
2. Summarise the commits into 2–5 human-readable bullets
3. Run: `node scripts/release.cjs patch --message "Bullet 1; Bullet 2"`

**Release page:** https://github.com/heeatpie-web/Wildgate-Stat-Tracker/releases
```

**Step 2: Add a `## Releasing` section to `CLAUDE.md`**

Append or insert:

```markdown
## Releasing

See `AGENTS.md` for the full release workflow. Quick reference:

```bash
node scripts/release.cjs patch --message "Fix 1; Fix 2"
```
```

**Step 3: Add a `## For AI Agents` section to `README.md`**

Find the end of the README and append:

```markdown
## For AI Agents

See [`AGENTS.md`](./AGENTS.md) for instructions on how to release, the tech stack, and key workflows.
```

**Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md README.md
git commit -m "docs: add agent-discoverable release instructions to AGENTS.md, CLAUDE.md, README.md"
```

---

### Task 6: End-to-end smoke test

**Step 1: Trigger a real release**

Pick a patch version bump and run the real script (with pushes enabled):

```bash
node scripts/release.cjs patch --message "Automated release pipeline; UID seed improvements for new users"
```

**Step 2: Confirm the tag was pushed**

```bash
git tag --sort=-v:refname | head -3
```

**Step 3: Watch the GitHub Actions run**

```bash
gh run list --limit 3
```

Or visit: https://github.com/heeatpie-web/Wildgate-Stat-Tracker/actions

Expected: a `Release` workflow run triggered by the new tag, status `in_progress`.

**Step 4: After ~15 min, confirm the release exists**

```bash
gh release list --limit 3
```

Expected: the new version listed with the `.exe` and `latest.yml` assets attached.
