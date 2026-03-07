#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_PROFILE = process.env.DATABRICKS_CONFIG_PROFILE || 'DEFAULT';
const DEFAULT_MODEL = process.env.DATABRICKS_AI_MODEL || 'auto';
const DEFAULT_MAX_OUTPUT_TOKENS = 1800;
const MAX_FILE_BYTES = 120_000;
const MAX_DIFF_BYTES = 180_000;
const MAX_CONTEXT_BYTES = 700_000;
const AUTO_MODELS = [
  'databricks-gpt-5-1-codex-max',
  'databricks-gpt-5-2-codex',
  'databricks-gpt-5-3-codex',
  'databricks-gpt-oss-120b',
  'databricks-gpt-oss-20b',
];
const DEFAULT_SYSTEM_PROMPT = [
  'You are a careful coding assistant working against a local repository.',
  'Prioritize concrete implementation guidance, risk callouts, and minimal but correct patches.',
  'When code context is incomplete, say what is missing instead of guessing.',
].join(' ');

class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.body = options.body ?? null;
  }
}

function printUsage() {
  process.stdout.write(
    [
      'Usage:',
      '  npm run ai:dbx -- --prompt "Explain the OCR pipeline" --file electron/main.cjs --file src/App.tsx',
      '  npm run ai:dbx -- --prompt "Review the uncommitted changes" --diff',
      '  npm run ai:dbx:models',
      '',
      'Options:',
      '  --prompt TEXT              Prompt to send. If omitted, reads from stdin.',
      '  --file PATH                Include a file in the prompt context. Repeat as needed.',
      '  --diff                     Include git diff from the current repo.',
      '  --model NAME               Model or endpoint name. Default: auto.',
      '  --profile NAME             Databricks CLI profile. Default: DEFAULT.',
      '  --system TEXT              Override the system prompt.',
      '  --max-output-tokens N      Limit response size. Default: 1800.',
      '  --list-models              Show serving endpoints visible to the current profile.',
      '  --help                     Show this help.',
      '',
      'Examples:',
      '  npm run ai:dbx -- --prompt "Find the safest place for a new IPC handler" --file electron/main.cjs --file electron/preload.cjs',
      '  npm run ai:dbx -- --prompt "Suggest the next patch for this diff" --diff',
      '',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const options = {
    diff: false,
    files: [],
    listModels: false,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    model: DEFAULT_MODEL,
    profile: DEFAULT_PROFILE,
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
      case '--profile':
        options.profile = argv[++index] ?? DEFAULT_PROFILE;
        break;
      case '--system':
        options.system = argv[++index] ?? DEFAULT_SYSTEM_PROMPT;
        break;
      case '--max-output-tokens':
        options.maxOutputTokens = Number.parseInt(argv[++index] ?? `${DEFAULT_MAX_OUTPUT_TOKENS}`, 10);
        break;
      case '--list-models':
        options.listModels = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!Number.isFinite(options.maxOutputTokens) || options.maxOutputTokens <= 0) {
    throw new Error('--max-output-tokens must be a positive integer.');
  }

  for (const file of options.files) {
    if (!file) {
      throw new Error('--file requires a path.');
    }
  }

  return options;
}

async function runCommandJson(command, args, cwd) {
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  return JSON.parse(stdout);
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

async function getRepoRoot(cwd) {
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

async function loadFileContext(files, cwd, repoRoot) {
  const sections = [];
  let totalBytes = 0;

  for (const file of files) {
    const absolutePath = path.resolve(cwd, file);
    const relativePath = path.relative(repoRoot, absolutePath) || path.basename(absolutePath);
    const content = await readFile(absolutePath, 'utf8');
    const clipped = truncateText(content, MAX_FILE_BYTES);
    totalBytes += Buffer.byteLength(clipped, 'utf8');

    if (totalBytes > MAX_CONTEXT_BYTES) {
      throw new Error(`Context is too large. Remove some --file inputs or skip --diff.`);
    }

    sections.push(`<file path="${relativePath}">\n${clipped}\n</file>`);
  }

  return sections;
}

async function loadGitDiff(cwd, repoRoot) {
  if (cwd !== repoRoot) {
    return truncateText(await runCommandText('git', ['-C', repoRoot, 'diff', '--no-color'], repoRoot), MAX_DIFF_BYTES);
  }

  return truncateText(await runCommandText('git', ['diff', '--no-color'], cwd), MAX_DIFF_BYTES);
}

function buildUserMessage({ cwd, repoRoot, prompt, fileSections, diffText }) {
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

async function resolveDatabricksAuth(profile, cwd) {
  const envJson = await runCommandJson('databricks', ['auth', 'env', '--profile', profile, '-o', 'json'], cwd);
  const host = envJson?.env?.DATABRICKS_HOST;

  if (!host) {
    throw new Error(`Could not resolve DATABRICKS_HOST from profile ${profile}. Run 'databricks auth login --profile ${profile}'.`);
  }

  const tokenJson = await runCommandJson('databricks', ['auth', 'token', profile, '-o', 'json'], cwd);
  const token = tokenJson?.access_token;

  if (!token) {
    throw new Error(`Could not resolve an OAuth token from profile ${profile}.`);
  }

  return {
    host: host.replace(/\/+$/, ''),
    token,
  };
}

async function fetchJson(url, token, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let parsedBody = null;

  if (rawText) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }
  }

  if (!response.ok) {
    const message =
      (parsedBody && typeof parsedBody === 'object' && (parsedBody.message || parsedBody.error?.message)) ||
      response.statusText ||
      'Request failed.';

    throw new ApiError(message, {
      body: parsedBody,
      code: parsedBody && typeof parsedBody === 'object' ? parsedBody.error_code || parsedBody.error?.type : null,
      status: response.status,
    });
  }

  return parsedBody;
}

function extractResponseText(json) {
  if (!json || typeof json !== 'object') {
    return '';
  }

  if (typeof json.output_text === 'string' && json.output_text.trim()) {
    return json.output_text.trim();
  }

  if (Array.isArray(json.choices)) {
    const content = json.choices[0]?.message?.content;

    if (typeof content === 'string' && content.trim()) {
      return content.trim();
    }

    if (Array.isArray(content)) {
      const textParts = content
        .filter((part) => part?.type === 'text' && typeof part?.text === 'string' && part.text.trim())
        .map((part) => part.text.trim());

      if (textParts.length > 0) {
        return textParts.join('\n\n');
      }
    }
  }

  if (Array.isArray(json.output)) {
    const textParts = [];
    for (const item of json.output) {
      if (!Array.isArray(item?.content)) {
        continue;
      }

      for (const part of item.content) {
        if (typeof part?.text === 'string' && part.text.trim()) {
          textParts.push(part.text.trim());
        }
      }
    }

    if (textParts.length > 0) {
      return textParts.join('\n\n');
    }
  }

  return '';
}

function isResponsesOnlyError(error) {
  return error instanceof ApiError && /Responses API/i.test(error.message);
}

function isTemporarilyUnavailableError(error) {
  return error instanceof ApiError && /(rate limit of 0|ENDPOINT_NOT_FOUND|temporarily disabled)/i.test(error.message);
}

async function callChatEndpoint({ auth, model, system, userMessage, maxOutputTokens }) {
  const url = `${auth.host}/serving-endpoints/${model}/invocations`;
  const body = {
    max_tokens: maxOutputTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
  };
  const json = await fetchJson(url, auth.token, body);
  const text = extractResponseText(json);

  if (!text) {
    throw new Error(`No assistant text returned from ${model}.`);
  }

  return { model, protocol: 'chat', text };
}

async function callResponsesEndpoint({ auth, model, system, userMessage, maxOutputTokens }) {
  const url = `${auth.host}/serving-endpoints/responses`;
  const body = {
    input: [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ],
    max_output_tokens: maxOutputTokens,
    model,
  };
  const json = await fetchJson(url, auth.token, body);
  const text = extractResponseText(json);

  if (!text) {
    throw new Error(`No assistant text returned from ${model}.`);
  }

  return { model, protocol: 'responses', text };
}

async function callModel({ auth, model, system, userMessage, maxOutputTokens }) {
  const preferResponses = /codex/i.test(model);

  if (preferResponses) {
    return callResponsesEndpoint({ auth, model, system, userMessage, maxOutputTokens });
  }

  try {
    return await callChatEndpoint({ auth, model, system, userMessage, maxOutputTokens });
  } catch (error) {
    if (!isResponsesOnlyError(error)) {
      throw error;
    }

    return callResponsesEndpoint({ auth, model, system, userMessage, maxOutputTokens });
  }
}

async function listModels(profile, cwd) {
  const endpoints = await runCommandJson('databricks', ['serving-endpoints', 'list', '--profile', profile, '-o', 'json'], cwd);
  const lines = [];

  for (const endpoint of endpoints) {
    const displayName = endpoint?.config?.served_entities?.[0]?.foundation_model?.display_name || 'Unknown model';
    const task = endpoint?.task || 'unknown';
    lines.push(`${endpoint.name}\t${displayName}\t${task}`);
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

async function chooseAndCall({ auth, explicitModel, maxOutputTokens, system, userMessage }) {
  const candidates = explicitModel === 'auto' ? AUTO_MODELS : [explicitModel];
  const errors = [];

  for (const model of candidates) {
    try {
      const result = await callModel({ auth, model, system, userMessage, maxOutputTokens });
      process.stderr.write(`[Databricks AI] model=${result.model} protocol=${result.protocol}\n`);
      return result.text;
    } catch (error) {
      if (explicitModel !== 'auto' || !isTemporarilyUnavailableError(error)) {
        throw error;
      }

      errors.push(`${model}: ${error.message}`);
      process.stderr.write(`[Databricks AI] skipping ${model}: ${error.message}\n`);
    }
  }

  throw new Error(`No Databricks coding model is currently callable.\n${errors.join('\n')}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (options.listModels) {
    await listModels(options.profile, process.cwd());
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
  const totalContextBytes = Buffer.byteLength(userMessage, 'utf8');

  if (totalContextBytes > MAX_CONTEXT_BYTES) {
    throw new Error(`Prompt context is too large (${totalContextBytes} bytes). Remove files or skip --diff.`);
  }

  const auth = await resolveDatabricksAuth(options.profile, cwd);
  const text = await chooseAndCall({
    auth,
    explicitModel: options.model,
    maxOutputTokens: options.maxOutputTokens,
    system: options.system,
    userMessage,
  });

  process.stdout.write(`${text}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
