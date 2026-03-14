const { spawn } = require('child_process');

const DEFAULT_FOCUS_DELAY_MS = 120;
const DEFAULT_KEY_DELAY_MS = 35;

const NAMED_KEY_MAP = Object.freeze({
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  enter: 'Return',
  return: 'Return',
  space: 'Space',
  spacebar: 'Space',
  up: 'Up',
  uparrow: 'Up',
  down: 'Down',
  downarrow: 'Down',
  left: 'Left',
  leftarrow: 'Left',
  right: 'Right',
  rightarrow: 'Right',
  end: 'End',
  home: 'Home',
  pgup: 'PageUp',
  pageup: 'PageUp',
  pgdn: 'PageDown',
  pagedown: 'PageDown',
  insert: 'Insert',
  ins: 'Insert',
  delete: 'Delete',
  del: 'Delete',
  backspace: 'Backspace',
});

let nutApi = null;
let nutLoadError = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonSafely(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function runPowerShellScript(script, {
  env = {},
  timeoutMs = 5000,
} = {}) {
  return new Promise((resolve) => {
    const powershellExe = process.platform === 'win32'
      ? `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
      : 'powershell';
    const child = spawn(powershellExe, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ], {
      windowsHide: true,
      env: {
        ...process.env,
        ...env,
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(payload);
    };

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    child.on('close', (code) => {
      finish({ code, stdout, stderr });
    });
    child.on('error', (error) => {
      finish({ code: 1, stdout, stderr: error?.message || String(error) });
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // Ignore kill failures.
        }
        finish({
          code: 1,
          stdout,
          stderr: stderr || `PowerShell helper timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);
    }
  });
}

function buildGameWindowLookupPowerShellScript() {
  return `
$ErrorActionPreference = 'Stop'
$titleHint = [string]$env:WILDGATE_GAME_WINDOW_TITLE_HINT
$processNames = @(
  [string]$env:WILDGATE_GAME_PROCESS_NAMES -split ';' |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ }
)

$candidates = @(Get-Process |
  Where-Object {
    $_.MainWindowHandle -ne 0 -and (
      ($processNames -contains $_.ProcessName) -or
      ($titleHint -and $_.MainWindowTitle -like "*$titleHint*")
    )
  } |
  Sort-Object @{ Expression = { if ($processNames -contains $_.ProcessName) { 0 } else { 1 } } }, @{ Expression = { if ($titleHint -and $_.MainWindowTitle -like "*$titleHint*") { 0 } else { 1 } } }, @{ Expression = { $_.StartTime }; Descending = $true })

$candidateSummary = @(
  $candidates |
    Select-Object -First 5 |
    ForEach-Object {
      $_.ProcessName + '#' + $_.Id + ' [' + [Int64]$_.MainWindowHandle + '] ' + (($_.MainWindowTitle -replace '\\s+', ' ').Trim())
    }
) -join ' | '

$target = $candidates | Select-Object -First 1
if (-not $target) {
  [pscustomobject]@{
    success = $false
    error = ('No matching game window found. Candidates: ' + (($processNames -join ', ') -replace '\\s+', ' '))
    candidateSummary = $candidateSummary
  } | ConvertTo-Json -Compress
  exit 0
}

[pscustomobject]@{
  success = $true
  processName = $target.ProcessName
  processId = $target.Id
  windowTitle = $target.MainWindowTitle
  windowHandle = [Int64]$target.MainWindowHandle
  candidateSummary = $candidateSummary
} | ConvertTo-Json -Compress
`;
}

async function lookupGameWindowCandidate({
  processNames = [],
  titleHint = '',
  focusDelayMs = DEFAULT_FOCUS_DELAY_MS,
} = {}) {
  const timeoutMs = Math.max(2000, (Math.max(50, Number(focusDelayMs) || DEFAULT_FOCUS_DELAY_MS) * 4) + 1000);
  const result = await runPowerShellScript(buildGameWindowLookupPowerShellScript(), {
    env: {
      WILDGATE_GAME_PROCESS_NAMES: processNames.join(';'),
      WILDGATE_GAME_WINDOW_TITLE_HINT: String(titleHint || ''),
    },
    timeoutMs,
  });

  const stdout = String(result?.stdout || '').trim();
  const stderr = String(result?.stderr || '').trim();
  if (result?.code !== 0) {
    return {
      success: false,
      error: stderr || stdout || `PowerShell window lookup exited with code ${result?.code}`,
    };
  }

  const parsed = parseJsonSafely(stdout);
  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      error: stdout || 'Game window lookup returned an unexpected response.',
    };
  }

  if (parsed.success === false) {
    return {
      success: false,
      error: typeof parsed.error === 'string' ? parsed.error : 'No matching game window found.',
      candidateSummary: typeof parsed.candidateSummary === 'string' ? parsed.candidateSummary : '',
    };
  }

  return {
    success: true,
    processName: typeof parsed.processName === 'string' ? parsed.processName : '',
    processId: Number.isFinite(Number(parsed.processId)) ? Number(parsed.processId) : null,
    windowTitle: typeof parsed.windowTitle === 'string' ? parsed.windowTitle : '',
    windowHandle: Number.isFinite(Number(parsed.windowHandle)) ? Number(parsed.windowHandle) : null,
    candidateSummary: typeof parsed.candidateSummary === 'string' ? parsed.candidateSummary : '',
  };
}

function tokenizeSendKeysSequence(sequence) {
  const input = String(sequence || '');
  const tokens = [];
  let index = 0;

  while (index < input.length) {
    const current = input[index];
    if (current === '{') {
      const closeIndex = input.indexOf('}', index + 1);
      if (closeIndex === -1) {
        throw new Error(`Unterminated key token in sequence: ${input}`);
      }
      tokens.push(input.slice(index + 1, closeIndex));
      index = closeIndex + 1;
      continue;
    }

    tokens.push(current);
    index += 1;
  }

  return tokens;
}

function resolveCharacterKey(token, Key) {
  if (!token || token.length !== 1) {
    throw new Error(`Unsupported literal key token: ${String(token)}`);
  }

  if (token === ' ') return Key.Space;

  if (/^[a-z]$/i.test(token)) {
    const enumName = token.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(Key, enumName)) {
      return Key[enumName];
    }
  }

  if (/^\d$/.test(token)) {
    const enumName = `Num${token}`;
    if (Object.prototype.hasOwnProperty.call(Key, enumName)) {
      return Key[enumName];
    }
  }

  throw new Error(`Unsupported literal key token: ${token}`);
}

function resolveNamedKey(token, Key) {
  const raw = String(token || '').trim();
  if (!raw) {
    throw new Error('Empty key token in sequence.');
  }

  if (/^f\d{1,2}$/i.test(raw)) {
    const enumName = raw.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(Key, enumName)) {
      return Key[enumName];
    }
    throw new Error(`Unsupported function key token: ${raw}`);
  }

  const namedKey = NAMED_KEY_MAP[raw.toLowerCase()];
  if (namedKey && Object.prototype.hasOwnProperty.call(Key, namedKey)) {
    return Key[namedKey];
  }

  throw new Error(`Unsupported named key token: ${raw}`);
}

function translateSendKeysSequenceToNutKeys(sequence, Key) {
  return tokenizeSendKeysSequence(sequence).map((token) => {
    if (token.length === 1 && token !== '{' && token !== '}') {
      return resolveCharacterKey(token, Key);
    }
    return resolveNamedKey(token, Key);
  });
}

function getKeyboardDelayMs() {
  return Math.max(10, Number(process.env.WILDGATE_GAME_KEY_DELAY_MS || DEFAULT_KEY_DELAY_MS));
}

function getFocusDelayMs(value) {
  return Math.max(50, Number(value) || DEFAULT_FOCUS_DELAY_MS);
}

function buildWindowResult(base = {}, overrides = {}) {
  return {
    processName: base.processName || undefined,
    processId: Number.isFinite(Number(base.processId)) ? Number(base.processId) : undefined,
    windowTitle: base.windowTitle || undefined,
    targetWindowHandle: Number.isFinite(Number(base.windowHandle)) ? Number(base.windowHandle) : undefined,
    candidateSummary: base.candidateSummary || undefined,
    ...overrides,
  };
}

function normalizeError(error, fallbackMessage) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallbackMessage;
}

function loadNutApi() {
  if (nutApi) return nutApi;
  if (nutLoadError) throw nutLoadError;

  try {
    const loaded = require('@nut-tree-fork/nut-js');
    loaded.keyboard.config.autoDelayMs = getKeyboardDelayMs();
    nutApi = loaded;
    return nutApi;
  } catch (error) {
    nutLoadError = error;
    throw error;
  }
}

async function getActiveWindowInfo(nut) {
  const activeWindow = await nut.getActiveWindow();
  const foregroundWindowTitle = await activeWindow.title;
  return {
    foregroundWindowHandle: Number.isFinite(Number(activeWindow.windowHandle))
      ? Number(activeWindow.windowHandle)
      : null,
    foregroundWindowTitle,
  };
}

async function focusGameWindow(nut, candidate, focusDelayMs) {
  const targetWindow = new nut.Window(nut.providerRegistry, candidate.windowHandle);
  let restored = false;
  let focused = false;
  let retried = false;

  try {
    restored = await targetWindow.restore();
  } catch {
    restored = false;
  }

  await delay(focusDelayMs);
  focused = await targetWindow.focus();
  await delay(focusDelayMs);

  let activeWindow = await getActiveWindowInfo(nut);
  let focusConfirmed = activeWindow.foregroundWindowHandle === candidate.windowHandle;

  if (!focusConfirmed) {
    retried = await targetWindow.focus();
    await delay(focusDelayMs);
    activeWindow = await getActiveWindowInfo(nut);
    focusConfirmed = activeWindow.foregroundWindowHandle === candidate.windowHandle;
  }

  return buildWindowResult(candidate, {
    activated: Boolean(restored || focused || retried),
    restored,
    focused,
    retried,
    focusConfirmed,
    foregroundWindowHandle: activeWindow.foregroundWindowHandle ?? undefined,
    foregroundWindowTitle: activeWindow.foregroundWindowTitle || undefined,
  });
}

async function sendNutKeySequence(nut, keySequence) {
  const translatedKeys = translateSendKeysSequenceToNutKeys(keySequence, nut.Key);
  for (const key of translatedKeys) {
    await nut.keyboard.type(key);
  }
  return translatedKeys;
}

async function validateGameInputRuntime() {
  const nut = loadNutApi();
  const activeWindow = await getActiveWindowInfo(nut);
  return {
    success: true,
    foregroundWindowHandle: activeWindow.foregroundWindowHandle ?? undefined,
    foregroundWindowTitle: activeWindow.foregroundWindowTitle || undefined,
  };
}

async function sendGameKeySequence({
  sequence,
  action = 'custom-sequence',
  processNames = [],
  titleHint = '',
  focusDelayMs = DEFAULT_FOCUS_DELAY_MS,
} = {}) {
  if (process.platform !== 'win32') {
    return {
      success: false,
      action,
      error: 'Game UI actions are currently implemented for Windows only.',
    };
  }

  const key = String(sequence || '').trim();
  if (!key) {
    return {
      success: false,
      action,
      error: 'No key sequence configured.',
    };
  }

  const safeFocusDelayMs = getFocusDelayMs(focusDelayMs);
  let candidate = null;
  let focusResult = null;

  try {
    const nut = loadNutApi();
    candidate = await lookupGameWindowCandidate({
      processNames,
      titleHint,
      focusDelayMs: safeFocusDelayMs,
    });

    if (!candidate?.success || !candidate.windowHandle) {
      return {
        success: false,
        action,
        key,
        error: candidate?.error || 'No matching game window found.',
        ...(candidate ? buildWindowResult(candidate) : {}),
      };
    }

    focusResult = await focusGameWindow(nut, candidate, safeFocusDelayMs);
    if (!focusResult.focusConfirmed) {
      return {
        success: false,
        action,
        key,
        error: `Failed to confirm Wildgate focus before sending ${action}.`,
        ...focusResult,
      };
    }

    await sendNutKeySequence(nut, key);
    const activeWindow = await getActiveWindowInfo(nut);

    return {
      success: true,
      action,
      key,
      ...focusResult,
      foregroundWindowHandle: activeWindow.foregroundWindowHandle ?? focusResult.foregroundWindowHandle,
      foregroundWindowTitle: activeWindow.foregroundWindowTitle || focusResult.foregroundWindowTitle,
    };
  } catch (error) {
    return {
      success: false,
      action,
      key,
      error: normalizeError(error, `Failed to send ${action}.`),
      ...(focusResult || (candidate ? buildWindowResult(candidate) : {})),
    };
  }
}

module.exports = {
  lookupGameWindowCandidate,
  sendGameKeySequence,
  tokenizeSendKeysSequence,
  translateSendKeysSequenceToNutKeys,
  validateGameInputRuntime,
};
