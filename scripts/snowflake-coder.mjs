#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export const DEFAULT_CONNECTION = process.env.SNOWFLAKE_CONNECTION || 'snowflake_trial';
export const DEFAULT_MODEL = process.env.SNOWFLAKE_AI_MODEL || 'claude-opus-4-6';
const DEFAULT_MAX_TOKENS = 1800;
const MAX_FILE_BYTES = 120_000;
const MAX_DIFF_BYTES = 180_000;
export const MAX_CONTEXT_BYTES = 700_000;
export const DEFAULT_SYSTEM_PROMPT = [
  'You are Claude helping maintain a local repository.',
  'Be direct, technically correct, and focus on actionable coding guidance.',
  'If the context is incomplete, say what is missing instead of guessing.',
].join(' ');

function printUsage() {
  process.stdout.write(
    [
      'Usage:',
      '  npm run ai:snowflake -- --prompt "Review this diff" --diff',
      '  npm run ai:snowflake -- --prompt "Explain this file" --file electron/preload.cjs',
      '',
      'Options:',
      '  --prompt TEXT           Prompt to send. If omitted, reads from stdin.',
      '  --file PATH             Include a file in context. Repeat as needed.',
      '  --diff                  Include git diff from the current repo.',
      '  --model NAME            Model name. Default: claude-opus-4-6.',
      '  --connection NAME       Snowflake connection in ~/.snowflake/connections.toml.',
      '  --system TEXT           Override the system prompt.',
      '  --max-tokens N          Maximum output tokens. Default: 1800.',
      '  --help                  Show help.',
      '',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const options = {
    connection: DEFAULT_CONNECTION,
    diff: false,
    files: [],
    maxTokens: DEFAULT_MAX_TOKENS,
    model: DEFAULT_MODEL,
    prompt: null,
    system: DEFAULT_SYSTEM_PROMPT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--prompt':
        options.prompt = argv[++index] ?? null;
        break;
      case '--file':
        options.files.push(argv[++index] ?? '');
        break;
      case '--diff':
        options.diff = true;
        break;
      case '--model':
        options.model = argv[++index] ?? DEFAULT_MODEL;
        break;
      case '--connection':
        options.connection = argv[++index] ?? DEFAULT_CONNECTION;
        break;
      case '--system':
        options.system = argv[++index] ?? DEFAULT_SYSTEM_PROMPT;
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

  if (!Number.isFinite(options.maxTokens) || options.maxTokens <= 0) {
    throw new Error('--max-tokens must be a positive integer.');
  }

  return options;
}

async function runCommandText(command, args, cwd) {
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function readPromptFromStdin() {
  if (process.stdin.isTTY) {
    return '';
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  }
  return chunks.join('').trim();
}

export async function getRepoRoot(cwd) {
  try {
    return (await runCommandText('git', ['rev-parse', '--show-toplevel'], cwd)).trim();
  } catch {
    return cwd;
  }
}

function truncateText(text, maxBytes) {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) {
    return text;
  }

  return `${buffer.subarray(0, maxBytes).toString('utf8')}\n\n[truncated to ${maxBytes} bytes]`;
}

export async function loadFileContext(files, cwd, repoRoot) {
  const sections = [];
  let totalBytes = 0;

  for (const file of files) {
    const absolutePath = path.resolve(cwd, file);
    const relativePath = path.relative(repoRoot, absolutePath) || path.basename(absolutePath);
    const content = await readFile(absolutePath, 'utf8');
    const clipped = truncateText(content, MAX_FILE_BYTES);
    totalBytes += Buffer.byteLength(clipped, 'utf8');

    if (totalBytes > MAX_CONTEXT_BYTES) {
      throw new Error('Context is too large. Remove some --file inputs or skip --diff.');
    }

    sections.push(`<file path="${relativePath}">\n${clipped}\n</file>`);
  }

  return sections;
}

export async function loadGitDiff(cwd, repoRoot) {
  const args = cwd === repoRoot ? ['diff', '--no-color'] : ['-C', repoRoot, 'diff', '--no-color'];
  return truncateText(await runCommandText('git', args, repoRoot), MAX_DIFF_BYTES);
}

export function buildUserMessage({ cwd, repoRoot, prompt, fileSections, diffText }) {
  const sections = [
    `Current working directory: ${cwd}`,
    `Repository root: ${repoRoot}`,
  ];

  if (fileSections.length > 0) {
    sections.push('Included files:');
    sections.push(fileSections.join('\n\n'));
  }

  if (diffText) {
    sections.push(`<git_diff>\n${diffText}\n</git_diff>`);
  }

  sections.push(`<request>\n${prompt}\n</request>`);
  return sections.join('\n\n');
}

function parseSimpleToml(text) {
  const sections = {};
  let currentSection = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = sections[currentSection] || {};
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_]+)\s*=\s*"(.*)"$/);
    if (kvMatch && currentSection) {
      sections[currentSection][kvMatch[1]] = kvMatch[2];
    }
  }

  return sections;
}

export async function resolveSnowflakeConnection(connectionName) {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) {
    throw new Error('Could not resolve your home directory.');
  }

  const connectionsPath = path.join(home, '.snowflake', 'connections.toml');
  const text = await readFile(connectionsPath, 'utf8');
  const parsed = parseSimpleToml(text);
  const connection = parsed[connectionName];

  if (!connection) {
    throw new Error(`Snowflake connection "${connectionName}" was not found in ${connectionsPath}.`);
  }

  const account = connection.account;
  const tokenFilePath = connection.token_file_path;

  if (!account) {
    throw new Error(`Connection "${connectionName}" is missing an account value.`);
  }

  if (!tokenFilePath) {
    throw new Error(`Connection "${connectionName}" is missing token_file_path.`);
  }

  const token = (await readFile(tokenFilePath, 'utf8')).trim();
  if (!token) {
    throw new Error(`Snowflake token file ${tokenFilePath} is empty.`);
  }

  return {
    account,
    token,
    sqlUrl: `https://${account}.snowflakecomputing.com/api/v2/statements`,
  };
}

function wrapSqlString(value) {
  return `$$${value.replace(/\$\$/g, '$ $')}$$`;
}

function decodeSqlVariant(value) {
  if (typeof value !== 'string') {
    return '';
  }

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.text === 'string') {
        return parsed.text;
      }
      if (Array.isArray(parsed.content)) {
        const text = parsed.content
          .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
          .map((item) => item.text)
          .join('');
        if (text) {
          return text;
        }
      }
    }
  } catch {
    return value;
  }

  return value;
}

export async function callSnowflake({ connectionName, messages, model, maxTokens }) {
  const connection = await resolveSnowflakeConnection(connectionName);
  const flattenedPrompt = messages
    .map((message) => `[${message.role.toUpperCase()}]\n${message.content}`)
    .join('\n\n');
  const statement = [
    'SELECT AI_COMPLETE(',
    `${wrapSqlString(model)},`,
    `${wrapSqlString(flattenedPrompt)},`,
    `OBJECT_CONSTRUCT('max_tokens', ${Math.max(1, Math.floor(maxTokens))})`,
    ') AS reply',
  ].join(' ');

  const response = await fetch(connection.sqlUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
    },
    body: JSON.stringify({
      statement,
      timeout: 60,
      database: 'SNOWFLAKE',
      role: 'ACCOUNTADMIN',
      schema: 'ACCOUNT_USAGE',
      warehouse: 'COMPUTE_WH',
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(rawText || `Snowflake request failed with status ${response.status}.`);
  }

  const payload = JSON.parse(rawText);
  const text = decodeSqlVariant(payload?.data?.[0]?.[0]).trim();
  if (!text) {
    throw new Error('No assistant text returned from Snowflake.');
  }

  process.stderr.write(`[Snowflake AI] connection=${connectionName} model=${model}\n`);
  return text;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const stdinPrompt = await readPromptFromStdin();
  const prompt = (options.prompt || stdinPrompt || '').trim();
  if (!prompt) {
    printUsage();
    throw new Error('No prompt provided.');
  }

  const cwd = process.cwd();
  const repoRoot = await getRepoRoot(cwd);
  const fileSections = await loadFileContext(options.files, cwd, repoRoot);
  const diffText = options.diff ? await loadGitDiff(cwd, repoRoot) : '';
  const userMessage = buildUserMessage({
    cwd,
    diffText,
    fileSections,
    prompt,
    repoRoot,
  });

  if (Buffer.byteLength(userMessage, 'utf8') > MAX_CONTEXT_BYTES) {
    throw new Error('Prompt context is too large. Remove files or skip --diff.');
  }

  const text = await callSnowflake({
    connectionName: options.connection,
    maxTokens: options.maxTokens,
    messages: [
      { role: 'system', content: options.system },
      { role: 'user', content: userMessage },
    ],
    model: options.model,
  });

  process.stdout.write(`${text}\n`);
}

const isEntryPoint = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntryPoint) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
