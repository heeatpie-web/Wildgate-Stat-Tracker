#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import {
  buildUserMessage,
  callSnowflake,
  DEFAULT_CONNECTION,
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  getRepoRoot,
  loadFileContext,
  loadGitDiff,
  MAX_CONTEXT_BYTES,
} from './snowflake-coder.mjs';

const DEFAULT_MAX_TOKENS = 1800;
const MAX_HISTORY_BYTES = 350_000;
const MAX_NOTE_BYTES = 120_000;
const MAX_AUTO_ATTACH_FILES = 12;
const AUTO_PROMPT_MAX_FILES = 6;
const AUTO_PROMPT_MAX_FILE_BYTES = 50_000;
const REQUESTED_FILE_MAX_FILE_BYTES = 120_000;
const TEXT_FILE_PATTERN = /\.(c|m)?(t|j)sx?$|\.json$|\.md$|\.css$|\.html$|\.ya?ml$|\.toml$|\.sql$|\.ps1$|\.sh$/i;
const FILE_REFERENCE_PATTERN = /(?:^|[`"'(\s])((?:\.?\/)?(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:[cm]?[jt]sx?|json|md|css|html|ya?ml|toml|sql|ps1|sh))(?:[`"')\s,:.]|$)/gm;
const AUTO_SEARCH_STOP_WORDS = new Set([
  'about',
  'accurately',
  'actual',
  'add',
  'after',
  'again',
  'all',
  'also',
  'and',
  'any',
  'apply',
  'are',
  'around',
  'asked',
  'be',
  'before',
  'best',
  'breaking',
  'broken',
  'calls',
  'can',
  'change',
  'close',
  'component',
  'could',
  'definitions',
  'determine',
  'discard',
  'dispatch',
  'does',
  'enough',
  'exist',
  'fields',
  'file',
  'files',
  'find',
  'flag',
  'for',
  'from',
  'give',
  'guessing',
  'have',
  'help',
  'how',
  'i',
  'in',
  'is',
  'it',
  'its',
  'just',
  'likely',
  'locate',
  'looking',
  'make',
  'need',
  'of',
  'on',
  'or',
  'please',
  'record',
  'records',
  'relevant',
  'resolved',
  'review',
  'risk',
  'saved',
  'search',
  'seeing',
  'share',
  'show',
  'similar',
  'so',
  'some',
  'something',
  'the',
  'this',
  'to',
  'unresolved',
  'use',
  'used',
  'using',
  'without',
  'would',
]);
const execFileAsync = promisify(execFile);

function printHelp() {
  process.stdout.write(
    [
      'Commands:',
      '  /file <path>   Attach a file to project context',
      '  /dir <path>    Attach as many text files as fit from a directory',
      '  /diff          Attach the current git diff to project context',
      '  /review        Attach current diff and changed/untracked files',
      '  /find <text>   Attach ripgrep search results for the repo',
      '  /grep <text>   Alias for /find',
      '  /tree <path>   Attach a file listing for a directory or path prefix',
      '  /searchfiles <pattern>  Search repo and attach matching files',
      '  /inspect <symbol>       Attach search hits and likely relevant files',
      '  /repo          Attach a top-level repo file listing',
      '  /auto on|off   Toggle automatic repo search per message',
      "  /pending       Show files queued from the model's last request",
      '  /show          Show current attached context',
      '  /clear         Clear conversation history, keep attached context',
      '  /reset         Clear conversation history and attached context',
      '  /help          Show this help',
      '  /exit          Exit chat',
      '',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const options = {
    autoContext: false,
    connection: DEFAULT_CONNECTION,
    files: [],
    includeDiff: false,
    maxTokens: DEFAULT_MAX_TOKENS,
    model: DEFAULT_MODEL,
    system: DEFAULT_SYSTEM_PROMPT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--auto-context':
        options.autoContext = true;
        break;
      case '--connection':
        options.connection = argv[++index] ?? DEFAULT_CONNECTION;
        break;
      case '--model':
        options.model = argv[++index] ?? DEFAULT_MODEL;
        break;
      case '--system':
        options.system = argv[++index] ?? DEFAULT_SYSTEM_PROMPT;
        break;
      case '--file':
        options.files.push(argv[++index] ?? '');
        break;
      case '--diff':
        options.includeDiff = true;
        break;
      case '--max-tokens':
        options.maxTokens = Number.parseInt(argv[++index] ?? `${DEFAULT_MAX_TOKENS}`, 10);
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return options;
}

function extractSearchTerms(prompt) {
  const quotedTerms = [...prompt.matchAll(/["'`](.+?)["'`]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  const tokenTerms = [...prompt.matchAll(/\b[A-Za-z_][A-Za-z0-9_/-]{2,}\b/g)]
    .map((match) => match[0])
    .map((token) => token.replace(/^[\\/.-]+|[\\/.-]+$/g, ''))
    .filter(Boolean)
    .filter((token) => !AUTO_SEARCH_STOP_WORDS.has(token.toLowerCase()))
    .filter((token) => token.length >= 3);

  const prioritized = [
    ...quotedTerms,
    ...tokenTerms.filter((token) => /[A-Z_]/.test(token) || token.includes('/')),
    ...tokenTerms,
  ];

  return [...new Set(prioritized)].slice(0, 8);
}

function trimHistory(history) {
  let totalBytes = 0;
  const next = [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    const size = Buffer.byteLength(item.content, 'utf8');
    if (totalBytes + size > MAX_HISTORY_BYTES) {
      continue;
    }

    next.unshift(item);
    totalBytes += size;
  }

  return next;
}

function formatList(items) {
  return items.length > 0 ? items.join(', ') : 'none';
}

function truncateText(text, maxBytes = MAX_NOTE_BYTES) {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) {
    return text;
  }

  return `${buffer.subarray(0, maxBytes).toString('utf8')}\n\n[truncated to ${maxBytes} bytes]`;
}

async function runCommand(command, args, cwd) {
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function attachRepoSearch(cwd, repoRoot, query) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error('Usage: /find <text>');
  }

  const stdout = await runCommand(
    'rg',
    [
      '-n',
      '-S',
      '--hidden',
      '--glob',
      '!node_modules',
      '--glob',
      '!dist',
      '--glob',
      '!dist-electron',
      '--glob',
      '!.git',
      trimmedQuery,
      repoRoot,
    ],
    cwd
  );
  const normalized = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.replace(`${repoRoot}\\`, ''))
    .join('\n');

  if (!normalized) {
    throw new Error(`No matches for "${trimmedQuery}".`);
  }

  return {
    label: `search:${trimmedQuery}`,
    text: `<search query="${trimmedQuery}">\n${truncateText(normalized)}\n</search>`,
  };
}

async function searchTermHits(repoRoot, term) {
  try {
    const stdout = await runCommand(
      'rg',
      [
        '-n',
        '-S',
        '--hidden',
        '--glob',
        '!node_modules',
        '--glob',
        '!dist',
        '--glob',
        '!dist-electron',
        '--glob',
        '!.git',
        term,
        '.',
      ],
      repoRoot
    );
    return parseLines(stdout);
  } catch {
    return [];
  }
}

async function attachTree(cwd, repoRoot, targetPath) {
  const trimmedTarget = (targetPath || '.').trim() || '.';
  const stdout = await runCommand('rg', ['--files', trimmedTarget], repoRoot);
  const normalized = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .join('\n');

  if (!normalized) {
    throw new Error(`No files found for "${trimmedTarget}".`);
  }

  return {
    label: `tree:${trimmedTarget}`,
    text: `<tree path="${trimmedTarget}">\n${truncateText(normalized)}\n</tree>`,
  };
}

function parseLines(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeRelativeFile(filePath, repoRoot) {
  const normalized = filePath.replace(/\//g, '\\');
  const normalizedRoot = repoRoot.replace(/\//g, '\\');
  if (normalized.startsWith(normalizedRoot)) {
    return normalized.slice(normalizedRoot.length).replace(/^\\+/, '').replace(/\\/g, '/');
  }
  return normalized.replace(/\\/g, '/');
}

function isTextishFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('package-lock.json')) {
    return false;
  }
  return TEXT_FILE_PATTERN.test(filePath);
}

function scorePathBias(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.startsWith('src/')) return 6;
  if (normalized.startsWith('electron/')) return 4;
  if (normalized.startsWith('scripts/')) return 3;
  if (normalized.startsWith('docs/')) return -3;
  if (normalized.endsWith('.md')) return -2;
  return 0;
}

async function listFilesUnderPath(repoRoot, targetPath) {
  const stdout = await runCommand('rg', ['--files', targetPath], repoRoot);
  return parseLines(stdout).filter(isTextishFile);
}

async function listChangedFiles(repoRoot) {
  const changed = parseLines(await runCommand('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], repoRoot));
  const untracked = parseLines(await runCommand('git', ['ls-files', '--others', '--exclude-standard'], repoRoot));
  const ordered = [...changed, ...untracked]
    .map((file) => file.replace(/\\/g, '/'))
    .filter(isTextishFile);
  return [...new Set(ordered)];
}

async function searchMatchingFiles(repoRoot, pattern) {
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    throw new Error('Usage: /searchfiles <pattern>');
  }

  let matches = [];
  try {
    const stdout = await runCommand(
      'rg',
      [
        '-l',
        '-S',
        '--hidden',
        '--glob',
        '!node_modules',
        '--glob',
        '!dist',
        '--glob',
        '!dist-electron',
        '--glob',
        '!.git',
        trimmedPattern,
        repoRoot,
      ],
      repoRoot
    );
    matches = parseLines(stdout);
  } catch {
    matches = [];
  }

  if (matches.length === 0) {
    const pathMatches = parseLines(await runCommand('rg', ['--files', repoRoot], repoRoot)).filter((file) =>
      file.toLowerCase().includes(trimmedPattern.toLowerCase())
    );
    matches = pathMatches;
  }

  return [...new Set(matches.map((file) => normalizeRelativeFile(file, repoRoot)).filter(isTextishFile))];
}

async function fileExists(repoRoot, relativePath) {
  try {
    await stat(`${repoRoot}/${relativePath}`);
    return true;
  } catch {
    return false;
  }
}

async function resolveRequestedFiles(repoRoot, responseText) {
  const directCandidates = [...responseText.matchAll(FILE_REFERENCE_PATTERN)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
  const requested = [];

  for (const rawCandidate of directCandidates) {
    const candidate = rawCandidate.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!isTextishFile(candidate)) {
      continue;
    }

    if (candidate.includes('/')) {
      if (await fileExists(repoRoot, candidate)) {
        requested.push(candidate);
      }
      continue;
    }

    const matches = await searchMatchingFiles(repoRoot, candidate);
    const exactBasename = matches.find((file) => file.split('/').pop()?.toLowerCase() === candidate.toLowerCase());
    if (exactBasename) {
      requested.push(exactBasename);
    }
  }

  return [...new Set(requested)];
}

async function tryAttachNote(cwd, repoRoot, system, attachedFiles, includeDiff, attachedNotes, note) {
  const trialNotes = [...attachedNotes, note];
  const trialState = await buildContextState(cwd, repoRoot, attachedFiles, includeDiff, trialNotes);
  await ensureContextWithinLimit(cwd, repoRoot, system, trialState);
  attachedNotes.push(note);
  return trialState;
}

async function attachFilesIncrementally(cwd, repoRoot, system, attachedFiles, includeDiff, attachedNotes, candidateFiles, options = {}) {
  const accepted = [];
  const skipped = [];
  let nextState = await buildContextState(cwd, repoRoot, attachedFiles, includeDiff, attachedNotes);
  const seen = new Set(attachedFiles);
  const maxFiles = options.maxFiles ?? MAX_AUTO_ATTACH_FILES;
  const maxFileBytes = options.maxFileBytes ?? Number.POSITIVE_INFINITY;

  for (const file of candidateFiles) {
    const normalized = file.replace(/\\/g, '/');
    if (!isTextishFile(normalized) || seen.has(normalized)) {
      continue;
    }
    if (accepted.length >= maxFiles) {
      skipped.push(normalized);
      continue;
    }

    try {
      const fileStat = await stat(`${repoRoot}/${normalized}`);
      if (fileStat.size > maxFileBytes) {
        skipped.push(normalized);
        continue;
      }
    } catch {
      skipped.push(normalized);
      continue;
    }

    const trialFiles = [...attachedFiles, normalized];
    try {
      const trialState = await buildContextState(cwd, repoRoot, trialFiles, includeDiff, attachedNotes);
      await ensureContextWithinLimit(cwd, repoRoot, system, trialState);
      attachedFiles.push(normalized);
      seen.add(normalized);
      accepted.push(normalized);
      nextState = trialState;
    } catch {
      skipped.push(normalized);
    }
  }

  return { accepted, skipped, state: nextState };
}

async function buildAutoPromptContext(cwd, repoRoot, system, includeDiff, baseFiles, baseNotes, prompt) {
  const terms = extractSearchTerms(prompt);
  if (terms.length === 0) {
    return {
      acceptedFiles: [],
      noteSections: [],
      summary: null,
    };
  }

  const hitLines = [];
  const fileScores = new Map();

  for (const term of terms) {
    const lines = (await searchTermHits(repoRoot, term)).slice(0, 10);
    for (const line of lines) {
      hitLines.push(`[${term}] ${line}`);
      const filePath = line.split(':', 1)[0].replace(/\\/g, '/');
      const currentScore = fileScores.get(filePath) || 0;
      const bonus = filePath.toLowerCase().includes(term.toLowerCase()) ? 2 : 0;
      fileScores.set(filePath, currentScore + 1 + bonus + scorePathBias(filePath));
    }

    const matchingFiles = await searchMatchingFiles(repoRoot, term);
    for (const filePath of matchingFiles.slice(0, 8)) {
      const currentScore = fileScores.get(filePath) || 0;
      fileScores.set(filePath, currentScore + 4 + scorePathBias(filePath));
    }
  }

  const promptLower = prompt.toLowerCase();
  if (promptLower.includes('type')) {
    const currentScore = fileScores.get('src/types.ts') || 0;
    fileScores.set('src/types.ts', currentScore + 8);
  }
  if (promptLower.includes('store') || promptLower.includes('slice') || promptLower.includes('state')) {
    const currentScore = fileScores.get('src/store/useAppStore.ts') || 0;
    fileScores.set('src/store/useAppStore.ts', currentScore + 6);
  }

  const tempFiles = [...baseFiles];
  const tempNotes = [...baseNotes];

  if (hitLines.length > 0) {
    const note = {
      label: `auto:${terms.join(',')}`,
      text: `<auto_search terms="${terms.join(', ')}">\n${truncateText(hitLines.join('\n'))}\n</auto_search>`,
    };
    try {
      await tryAttachNote(cwd, repoRoot, system, tempFiles, includeDiff, tempNotes, note);
    } catch {
      // If the note is too large, continue without it.
    }
  }

  const rankedFiles = [...fileScores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([file]) => file)
    .filter(isTextishFile);

  const { accepted } = await attachFilesIncrementally(
    cwd,
    repoRoot,
    system,
    tempFiles,
    includeDiff,
    tempNotes,
    rankedFiles,
    { maxFileBytes: AUTO_PROMPT_MAX_FILE_BYTES, maxFiles: AUTO_PROMPT_MAX_FILES }
  );

  return {
    acceptedFiles: accepted,
    noteSections: tempNotes.slice(baseNotes.length).map((note) => note.text),
    summary: terms.length > 0 ? `Auto context terms: ${terms.join(', ')}${accepted.length ? ` | files: ${accepted.join(', ')}` : ''}` : null,
  };
}

async function buildContextState(cwd, repoRoot, files, includeDiff, attachedNotes) {
  const fileSections = await loadFileContext(files, cwd, repoRoot);
  const diffText = includeDiff ? await loadGitDiff(cwd, repoRoot) : '';
  const noteSections = attachedNotes.map((note) => note.text);
  return { diffText, fileSections, noteSections };
}

function contextSummary(files, hasDiff, notes, pendingFiles) {
  const lines = [
    `Attached files: ${formatList(files)}`,
    `Attached diff: ${hasDiff ? 'yes' : 'no'}`,
    `Attached notes: ${formatList(notes.map((note) => note.label))}`,
    `Pending requested files: ${formatList(pendingFiles)}`,
  ];
  return lines.join('\n');
}

async function ensureContextWithinLimit(cwd, repoRoot, system, state) {
  const probe = buildUserMessage({
    cwd,
    diffText: state.diffText,
    fileSections: [...state.fileSections, ...state.noteSections],
    prompt: 'Context size probe.',
    repoRoot,
  });
  const totalBytes = Buffer.byteLength(system, 'utf8') + Buffer.byteLength(probe, 'utf8');
  if (totalBytes > MAX_CONTEXT_BYTES) {
    throw new Error('Attached context is too large. Remove a file or clear the diff.');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: npm run ai:snowflake:chat -- [--file path] [--diff] [--model claude-opus-4-6] [--auto-context]\n\n');
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const repoRoot = await getRepoRoot(cwd);
  const attachedFiles = [...options.files];
  const attachedNotes = [];
  let pendingRequestedFiles = [];
  let includeDiff = options.includeDiff;
  let history = [];
  let contextState = await buildContextState(cwd, repoRoot, attachedFiles, includeDiff, attachedNotes);
  await ensureContextWithinLimit(cwd, repoRoot, options.system, contextState);

  process.stdout.write(`Snowflake Claude chat ready in ${cwd}\n`);
  process.stdout.write(`Model: ${options.model}\n`);
  process.stdout.write(`${contextSummary(attachedFiles, includeDiff, attachedNotes, pendingRequestedFiles)}\n`);
  process.stdout.write(`Auto context: ${options.autoContext ? 'on' : 'off'}\n`);
  process.stdout.write('Type /help for commands.\n\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });

  try {
    while (true) {
      let input;
      try {
        input = (await rl.question('claude> ')).trim();
      } catch (error) {
        if (error instanceof Error && /readline was closed/i.test(error.message)) {
          break;
        }
        throw error;
      }
      if (!input) {
        continue;
      }

      if (input === '/exit' || input === '/quit') {
        break;
      }

      if (input === '/help') {
        printHelp();
        continue;
      }

      if (input === '/auto on') {
        options.autoContext = true;
        process.stdout.write('Auto context enabled.\n\n');
        continue;
      }

      if (input === '/auto off') {
        options.autoContext = false;
        process.stdout.write('Auto context disabled.\n\n');
        continue;
      }

      if (input === '/pending') {
        process.stdout.write(`Pending requested files: ${formatList(pendingRequestedFiles)}\n\n`);
        continue;
      }

      if (input === '/show') {
        process.stdout.write(`${contextSummary(attachedFiles, includeDiff, attachedNotes, pendingRequestedFiles)}\n\n`);
        continue;
      }

      if (input === '/clear') {
        history = [];
        process.stdout.write('Conversation history cleared.\n\n');
        continue;
      }

      if (input === '/reset') {
        history = [];
        attachedFiles.length = 0;
        attachedNotes.length = 0;
        includeDiff = false;
        contextState = await buildContextState(cwd, repoRoot, attachedFiles, includeDiff, attachedNotes);
        process.stdout.write('Conversation history and attached context cleared.\n\n');
        continue;
      }

      if (input === '/diff') {
        includeDiff = true;
        contextState = await buildContextState(cwd, repoRoot, attachedFiles, includeDiff, attachedNotes);
        await ensureContextWithinLimit(cwd, repoRoot, options.system, contextState);
        process.stdout.write('Current git diff attached.\n\n');
        continue;
      }

      if (input.startsWith('/file ')) {
        const filePath = input.slice('/file '.length).trim();
        if (!filePath) {
          process.stdout.write('Usage: /file <path>\n\n');
          continue;
        }

        if (!attachedFiles.includes(filePath)) {
          attachedFiles.push(filePath);
        }

        contextState = await buildContextState(cwd, repoRoot, attachedFiles, includeDiff, attachedNotes);
        await ensureContextWithinLimit(cwd, repoRoot, options.system, contextState);
        process.stdout.write(`Attached file: ${filePath}\n\n`);
        continue;
      }

      if (input.startsWith('/find ') || input.startsWith('/grep ')) {
        const query = input.replace(/^\/(find|grep)\s+/, '');
        const note = await attachRepoSearch(cwd, repoRoot, query);
        contextState = await tryAttachNote(cwd, repoRoot, options.system, attachedFiles, includeDiff, attachedNotes, note);
        process.stdout.write(`Attached search results: ${note.label}\n\n`);
        continue;
      }

      if (input === '/repo') {
        const note = await attachTree(cwd, repoRoot, '.');
        contextState = await tryAttachNote(cwd, repoRoot, options.system, attachedFiles, includeDiff, attachedNotes, note);
        process.stdout.write('Attached top-level repo file listing.\n\n');
        continue;
      }

      if (input.startsWith('/tree')) {
        const targetPath = input.slice('/tree'.length).trim() || '.';
        const note = await attachTree(cwd, repoRoot, targetPath);
        contextState = await tryAttachNote(cwd, repoRoot, options.system, attachedFiles, includeDiff, attachedNotes, note);
        process.stdout.write(`Attached file listing: ${note.label}\n\n`);
        continue;
      }

      if (input.startsWith('/dir ')) {
        const targetPath = input.slice('/dir '.length).trim();
        if (!targetPath) {
          process.stdout.write('Usage: /dir <path>\n\n');
          continue;
        }

        const candidateFiles = await listFilesUnderPath(repoRoot, targetPath);
        const { accepted, skipped, state } = await attachFilesIncrementally(
          cwd,
          repoRoot,
          options.system,
          attachedFiles,
          includeDiff,
          attachedNotes,
          candidateFiles
        );
        contextState = state;
        process.stdout.write(
          `Attached ${accepted.length} file(s) from ${targetPath}${skipped.length ? `, skipped ${skipped.length}` : ''}.\n\n`
        );
        continue;
      }

      if (input === '/review') {
        includeDiff = true;
        const changedFiles = await listChangedFiles(repoRoot);
        const { accepted, skipped, state } = await attachFilesIncrementally(
          cwd,
          repoRoot,
          options.system,
          attachedFiles,
          includeDiff,
          attachedNotes,
          changedFiles
        );
        contextState = state;
        process.stdout.write(
          `Attached current diff and ${accepted.length} changed file(s)${skipped.length ? `, skipped ${skipped.length}` : ''}.\n\n`
        );
        continue;
      }

      if (input.startsWith('/searchfiles ')) {
        const pattern = input.slice('/searchfiles '.length).trim();
        if (!pattern) {
          process.stdout.write('Usage: /searchfiles <pattern>\n\n');
          continue;
        }

        const note = await attachRepoSearch(cwd, repoRoot, pattern);
        contextState = await tryAttachNote(cwd, repoRoot, options.system, attachedFiles, includeDiff, attachedNotes, note);
        const candidateFiles = await searchMatchingFiles(repoRoot, pattern);
        const { accepted, skipped, state } = await attachFilesIncrementally(
          cwd,
          repoRoot,
          options.system,
          attachedFiles,
          includeDiff,
          attachedNotes,
          candidateFiles
        );
        contextState = state;
        process.stdout.write(
          `Attached search note and ${accepted.length} matching file(s)${skipped.length ? `, skipped ${skipped.length}` : ''}.\n\n`
        );
        continue;
      }

      if (input.startsWith('/inspect ')) {
        const symbol = input.slice('/inspect '.length).trim();
        if (!symbol) {
          process.stdout.write('Usage: /inspect <symbol>\n\n');
          continue;
        }

        const note = await attachRepoSearch(cwd, repoRoot, symbol);
        contextState = await tryAttachNote(cwd, repoRoot, options.system, attachedFiles, includeDiff, attachedNotes, note);
        const candidateFiles = await searchMatchingFiles(repoRoot, symbol);
        const { accepted, skipped, state } = await attachFilesIncrementally(
          cwd,
          repoRoot,
          options.system,
          attachedFiles,
          includeDiff,
          attachedNotes,
          candidateFiles
        );
        contextState = state;
        process.stdout.write(
          `Attached symbol hits and ${accepted.length} likely file(s)${skipped.length ? `, skipped ${skipped.length}` : ''}.\n\n`
        );
        continue;
      }

      let promptFileSections = [...contextState.fileSections];
      let promptNoteSections = [...contextState.noteSections];

      if (options.autoContext && pendingRequestedFiles.length > 0) {
        const requestedFiles = [...pendingRequestedFiles];
        pendingRequestedFiles = [];
        const { accepted, skipped, state } = await attachFilesIncrementally(
          cwd,
          repoRoot,
          options.system,
          attachedFiles,
          includeDiff,
          attachedNotes,
          requestedFiles,
          { maxFileBytes: REQUESTED_FILE_MAX_FILE_BYTES, maxFiles: AUTO_PROMPT_MAX_FILES }
        );
        contextState = state;
        promptFileSections = [...contextState.fileSections];
        promptNoteSections = [...contextState.noteSections];
        if (accepted.length > 0) {
          process.stdout.write(`Auto-attached requested files: ${accepted.join(', ')}\n\n`);
        }
        if (skipped.length > 0) {
          process.stdout.write(`Could not auto-attach some requested files: ${skipped.join(', ')}\n\n`);
        }
      }

      if (options.autoContext) {
        const autoContext = await buildAutoPromptContext(
          cwd,
          repoRoot,
          options.system,
          includeDiff,
          attachedFiles,
          attachedNotes,
          input
        );
        promptNoteSections = [...promptNoteSections, ...autoContext.noteSections];
        if (autoContext.acceptedFiles.length > 0) {
          const autoFileSections = await loadFileContext(autoContext.acceptedFiles, cwd, repoRoot);
          promptFileSections = [...promptFileSections, ...autoFileSections];
        }
        if (autoContext.summary) {
          process.stdout.write(`${autoContext.summary}\n\n`);
        }
      }

      const contextualPrompt = buildUserMessage({
        cwd,
        diffText: contextState.diffText,
        fileSections: [...promptFileSections, ...promptNoteSections],
        prompt: input,
        repoRoot,
      });

      const messages = [
        { role: 'system', content: options.system },
        ...trimHistory(history),
        { role: 'user', content: contextualPrompt },
      ];

      const responseText = await callSnowflake({
        connectionName: options.connection,
        maxTokens: options.maxTokens,
        messages,
        model: options.model,
      });

      process.stdout.write(`\n${responseText}\n\n`);
      pendingRequestedFiles = (await resolveRequestedFiles(repoRoot, responseText)).filter((file) => !attachedFiles.includes(file));
      if (pendingRequestedFiles.length > 0) {
        process.stdout.write(`Queued requested files for next turn: ${pendingRequestedFiles.join(', ')}\n\n`);
      }
      history = trimHistory([
        ...history,
        { role: 'user', content: input },
        { role: 'assistant', content: responseText },
      ]);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
