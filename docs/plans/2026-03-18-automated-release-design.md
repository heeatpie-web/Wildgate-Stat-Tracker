# Automated Release Design
_2026-03-18_

## Goal
Any AI agent (Claude, Codex, etc.) can trigger a full release — version bump, changelog, exe build, GitHub upload — with a single command.

## Trigger
```
npm run release -- <version>
# e.g. npm run release -- 3.4.1
# e.g. npm run release -- patch   (auto-increments from last tag)
```

## Components

### 1. `scripts/release.cjs`
Node script, no external dependencies beyond `fs`, `child_process`, `path`.

Steps:
1. Validate git working tree is clean (abort if uncommitted changes)
2. Resolve target version (explicit semver string, or `patch`/`minor`/`major` relative to last tag)
3. Read `git log --oneline <last-tag>..HEAD` to collect commits since last release
4. Pass raw commits to the calling agent (via stdout prompt) to summarise into 2–5 human-readable bullet points before proceeding. Agent writes the summary back as a `--changelog` flag or confirms the auto-draft. Script does basic cleanup (strips `chore:`, `fix:`, `feat:` prefixes, deduplicates) as a fallback if no agent input is given.
5. Bump `package.json` → `"version"`
6. Bump `src/utils/constants.ts` → `APP_VERSION = 'v<x.y.z>'`
7. Prepend new entry to `src/utils/changelog.ts` → `CHANGELOG['v<x.y.z>'] = [...]`
8. `git add` the three changed files
9. `git commit -m "chore: release v<x.y.z>"`
10. `git tag v<x.y.z>`
11. `git push && git push --tags`

### 2. `.github/workflows/release.yml`
Triggered by tag push matching `v*.*.*`.

- Runner: `windows-latest`
- Steps: checkout → setup Node 20 → `npm ci` → `npm run electron:build -- --publish always`
- Secrets: `GH_TOKEN` (repo secret, scoped to write releases)

electron-builder reads the existing `publish` config in `package.json` (already points to `heeatpie-web/Wildgate-Stat-Tracker`) and uploads the `.exe` + `latest.yml` to a new GitHub Release named after the tag.

### 3. `package.json` npm script
```json
"release": "node scripts/release.cjs"
```

### 4. `CLAUDE.md` / agent docs entry
Documents the release command so any agent can discover it without reading the full codebase.

## Error Handling
- Dirty git tree → abort with clear message before touching any files
- Unknown version argument → print usage and abort
- git push failure → script exits non-zero; no partial state (files already committed/tagged — agent should investigate)

## What agents need to know
Just one line in CLAUDE.md:
> To release: `npm run release -- <version>` (e.g. `patch`, `minor`, `major`, or explicit `3.4.1`). Pushes tag → GitHub Actions builds exe in ~15 min.
