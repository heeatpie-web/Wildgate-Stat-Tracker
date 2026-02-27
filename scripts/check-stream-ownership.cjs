#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('node:child_process');

const argv = process.argv.slice(2);
const argMap = new Map();
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (!token.startsWith('--')) continue;
  const [rawKey, inlineValue] = token.split('=', 2);
  const key = rawKey.slice(2);
  if (inlineValue != null) {
    argMap.set(key, inlineValue);
    continue;
  }
  const next = argv[i + 1];
  if (next && !next.startsWith('--')) {
    argMap.set(key, next);
    i += 1;
  } else {
    argMap.set(key, 'true');
  }
}

const sharedAllowed = [
  'docs/**',
  'WORK_OWNERSHIP.md',
  'scripts/check-stream-ownership.cjs',
  'scripts/setup-parallel-streams.ps1',
  '.github/workflows/stream-ownership.yml',
  'package.json',
  'package-lock.json',
];

const streamRules = {
  ui: [
    'src/components/**',
    'src/styles/**',
    'src/index.css',
    'src/config/appViews.ts',
    'src/config/systemPulse.ts',
  ],
  ocr: [
    'src/utils/ocr/**',
    'src/utils/scan/**',
    'electron/**',
    'scripts/**',
    'src/components/settings/ocrThresholdPresets.ts',
    'src/hooks/useSmartCapture.ts',
  ],
  contract: [
    'src/services/**',
    'src/types.ts',
    'src/config/runtimeConfig.ts',
    'src/utils/artifactService.ts',
  ],
};

const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '').trim();

const globToRegExp = (glob) => {
  const escaped = normalizePath(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
};

const matchesAnyGlob = (file, globs) => globs.some((glob) => globToRegExp(glob).test(file));

const safeExec = (cmd) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return '';
  }
};

const detectStreamFromBranch = (branchName) => {
  const branch = String(branchName || '').trim();
  if (!branch) return '';
  if (branch.startsWith('stream/ui')) return 'ui';
  if (branch.startsWith('stream/ocr')) return 'ocr';
  if (branch.startsWith('stream/contract')) return 'contract';
  return '';
};

const streamArg = (argMap.get('stream') || process.env.STREAM || 'auto').trim().toLowerCase();
const baseRef = (argMap.get('base') || process.env.STREAM_BASE || 'origin/main').trim();
const headRef = (argMap.get('head') || process.env.STREAM_HEAD || 'HEAD').trim();
const hasExplicitRange = argMap.has('base') || argMap.has('head') || Boolean(process.env.STREAM_BASE) || Boolean(process.env.STREAM_HEAD);

let stream = streamArg;
if (stream === 'auto') {
  const branch = process.env.GITHUB_HEAD_REF || safeExec('git rev-parse --abbrev-ref HEAD');
  stream = detectStreamFromBranch(branch);
}

if (!streamRules[stream]) {
  console.error(`[stream-ownership] Unable to determine stream. Got "${streamArg}".`);
  console.error('[stream-ownership] Use --stream ui|ocr|contract or name branch stream/ui, stream/ocr, or stream/contract.');
  process.exit(2);
}

let changedFilesRaw = safeExec(`git diff --name-only --diff-filter=ACMRTUXB ${baseRef}...${headRef}`);
if (!changedFilesRaw && !hasExplicitRange) {
  changedFilesRaw = safeExec('git diff --name-only --diff-filter=ACMRTUXB HEAD');
}
const changedFiles = changedFilesRaw
  .split('\n')
  .map(normalizePath)
  .filter(Boolean);

if (changedFiles.length === 0) {
  console.log(`[stream-ownership] No changed files detected for stream "${stream}".`);
  process.exit(0);
}

const allowed = [...sharedAllowed, ...streamRules[stream]];
const disallowed = changedFiles.filter((file) => !matchesAnyGlob(file, allowed));

if (disallowed.length > 0) {
  console.error(`[stream-ownership] Stream "${stream}" changed files outside its ownership boundaries:`);
  disallowed.forEach((file) => console.error(`  - ${file}`));
  console.error('');
  console.error('[stream-ownership] Allowed path patterns for this stream:');
  allowed.forEach((pattern) => console.error(`  - ${pattern}`));
  console.error('');
  console.error('[stream-ownership] Move these edits to the correct stream branch or a stream/contract PR.');
  process.exit(1);
}

console.log(`[stream-ownership] PASS for stream "${stream}". Checked ${changedFiles.length} file(s).`);
