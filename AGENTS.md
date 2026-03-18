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
1. Run `git log --oneline` to see commits since last release
2. Summarise the commits into 2–5 human-readable bullets
3. Run: `node scripts/release.cjs patch --message "Bullet 1; Bullet 2"`

**Release page:** https://github.com/heeatpie-web/Wildgate-Stat-Tracker/releases
