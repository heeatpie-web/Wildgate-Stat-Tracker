#!/usr/bin/env node
/**
 * Automated release script for Wildgate Stat Tracker.
 * Usage: node scripts/release.cjs <version> [--message "bullet 1; bullet 2"]
 *
 * <version>: patch | minor | major | explicit semver (e.g. 3.4.1 or v3.4.1)
 * --message / -m: semicolon-separated changelog bullets (optional)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const CONSTANTS_TS = path.join(ROOT, 'src', 'utils', 'constants.ts');
const CHANGELOG_TS = path.join(ROOT, 'src', 'utils', 'changelog.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
}

function bumpVersion(current, bump) {
  const parts = current.split('.').map(Number);
  if (bump === 'patch') { parts[2] += 1; }
  else if (bump === 'minor') { parts[1] += 1; parts[2] = 0; }
  else if (bump === 'major') { parts[0] += 1; parts[1] = 0; parts[2] = 0; }
  return parts.join('.');
}

function parseArgs(argv) {
  // argv starts after "node scripts/release.cjs"
  const args = argv.slice(2);
  let versionArg = null;
  let messageArg = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--message' || args[i] === '-m') {
      messageArg = args[i + 1];
      i++;
    } else if (!versionArg) {
      versionArg = args[i];
    }
  }

  return { versionArg, messageArg };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(function main() {
  const { versionArg, messageArg } = parseArgs(process.argv);

  // --- Usage guard ---
  if (!versionArg) {
    console.error('Usage: node scripts/release.cjs <version> [--message "bullet 1; bullet 2"]');
    console.error('  <version>: patch | minor | major | explicit semver (e.g. 3.4.1 or v3.4.1)');
    process.exit(1);
  }

  // 1. Validate git is clean
  const gitStatus = run('git status --porcelain');
  if (gitStatus !== '') {
    console.error('Error: Git working tree is not clean. Commit or stash changes before releasing.');
    console.error(gitStatus);
    process.exit(1);
  }

  // 2. Resolve target version
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const currentVersion = pkg.version; // e.g. "3.3.3"

  let newVersion;
  if (['patch', 'minor', 'major'].includes(versionArg)) {
    newVersion = bumpVersion(currentVersion, versionArg);
  } else {
    // explicit semver — strip leading v
    const stripped = versionArg.replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(stripped)) {
      console.error(`Error: Unknown version argument "${versionArg}".`);
      console.error('Usage: node scripts/release.cjs <version> [--message "bullet 1; bullet 2"]');
      console.error('  <version>: patch | minor | major | explicit semver (e.g. 3.4.1 or v3.4.1)');
      process.exit(1);
    }
    newVersion = stripped;
  }

  const newTag = `v${newVersion}`;
  console.log(`\nReleasing ${currentVersion} → ${newVersion} (${newTag})\n`);

  // 3. Collect commits since last semver tag
  let sinceTag = null;
  try {
    const tags = run('git tag --sort=-v:refname');
    if (tags) {
      const tagList = tags.split('\n');
      sinceTag = tagList.find(t => /^v\d+\.\d+\.\d+$/.test(t)) || null;
    }
  } catch (_) {
    // no tags at all — use all commits
  }

  let gitLog = '';
  try {
    if (sinceTag) {
      gitLog = run(`git log ${sinceTag}..HEAD --oneline --no-merges`);
    } else {
      gitLog = run('git log --oneline --no-merges');
    }
  } catch (_) {
    gitLog = '';
  }

  // 4. Build changelog bullets
  let bullets;
  if (messageArg) {
    bullets = messageArg
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  } else {
    // Auto-generate from git log
    if (!gitLog) {
      console.error('Error: No commits found since the last release tag. Nothing to release.');
      process.exit(1);
    }

    // Conventional commit prefixes to strip
    const ccPrefix = /^[0-9a-f]+ (?:feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(?:\([^)]*\))?:\s*/i;

    bullets = gitLog
      .split('\n')
      .map(line => {
        // Strip the leading SHA (7-char hex + space)
        let msg = line.replace(/^[0-9a-f]+\s+/, '').trim();
        // Strip conventional commit prefix
        msg = msg.replace(ccPrefix, '').trim();
        return msg;
      })
      .filter(s => s.length > 0);

    // 5. Abort if no commits (auto mode)
    if (bullets.length === 0) {
      console.error('Error: No commits found since the last release tag. Nothing to release.');
      process.exit(1);
    }
  }

  console.log('Changelog bullets:');
  bullets.forEach(b => console.log(`  • ${b}`));
  console.log('');

  // 6. Update package.json
  pkg.version = newVersion;
  fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`Updated package.json → ${newVersion}`);

  // 7. Update src/utils/constants.ts
  let constantsContent = fs.readFileSync(CONSTANTS_TS, 'utf8');
  constantsContent = constantsContent.replace(
    /export const APP_VERSION = 'v[^']+';/,
    `export const APP_VERSION = '${newTag}';`
  );
  fs.writeFileSync(CONSTANTS_TS, constantsContent, 'utf8');
  console.log(`Updated constants.ts → APP_VERSION = '${newTag}'`);

  // 8. Update src/utils/changelog.ts — prepend new entry
  let changelogContent = fs.readFileSync(CHANGELOG_TS, 'utf8');
  const openingLine = `export const CHANGELOG: Record<string, string[]> = {`;
  const openingIdx = changelogContent.indexOf(openingLine);
  if (openingIdx === -1) {
    console.error('Error: Could not find CHANGELOG declaration in changelog.ts');
    process.exit(1);
  }

  const insertAfter = openingIdx + openingLine.length;
  const bulletLines = bullets.map(b => `    "${b}"`).join(',\n');
  const newEntry = `\n  "${newTag}": [\n${bulletLines}\n  ],`;

  changelogContent =
    changelogContent.slice(0, insertAfter) +
    newEntry +
    changelogContent.slice(insertAfter);

  fs.writeFileSync(CHANGELOG_TS, changelogContent, 'utf8');
  console.log(`Updated changelog.ts → prepended ${newTag} entry\n`);

  // 9. Git add the three changed files
  run(`git add "${PACKAGE_JSON}" "${CONSTANTS_TS}" "${CHANGELOG_TS}"`);

  // 10. Git commit
  run(`git commit -m "chore: release ${newTag}"`);

  // 11. Git tag
  run(`git tag ${newTag}`);

  // 12. Git push (commit + tags)
  run('git push && git push --tags');

  // 13. Success
  console.log(`\nRelease ${newTag} complete!`);
  console.log(`https://github.com/heeatpie-web/Wildgate-Stat-Tracker/releases`);
})();
