const { spawn } = require('child_process');
const { requirePackagedModule } = require('./helpers/packagedModuleLoader.cjs');

const DEFAULT_FOCUS_DELAY_MS = 60;
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

// Optional persistent PS runner injected from main process.
// When set, runPowerShellScript routes through the long-lived PS process
// instead of spawning a new one for each call.
let _persistentPSRunner = null;

function setPersistentPSRunner(runner) {
  _persistentPSRunner = typeof runner === 'function' ? runner : null;
}

let cachedCandidate = null;
let cachedCandidateExpiry = 0;
const CANDIDATE_CACHE_TTL_MS = 30_000;
const GEOMETRY_CACHE_TTL_MS = 1_000;
const GEOMETRY_STALE_GRACE_MS = 2_000;
const cachedGeometryByHandle = new Map();

function isProcessAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getCachedCandidate() {
  if (!cachedCandidate || Date.now() > cachedCandidateExpiry) {
    cachedCandidate = null;
    cachedCandidateExpiry = 0;
    return null;
  }
  return { ...cachedCandidate };
}

function setCachedCandidate(candidate) {
  if (candidate?.success && candidate.processId && candidate.windowHandle) {
    cachedCandidate = { ...candidate };
    cachedCandidateExpiry = Date.now() + CANDIDATE_CACHE_TTL_MS;
  }
  if (candidate?.success && candidate?.windowHandle && candidate?.clientRect) {
    setCachedGeometry(candidate);
  }
}

function clearGameWindowCache() {
  cachedCandidate = null;
  cachedCandidateExpiry = 0;
  cachedGeometryByHandle.clear();
}

function normalizeClientRect(value) {
  if (!value || typeof value !== 'object') return null;
  const left = Number(value.left);
  const top = Number(value.top);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function getCachedGeometry(windowHandle, {
  allowStale = false,
} = {}) {
  const normalizedWindowHandle = Number(windowHandle);
  if (!Number.isFinite(normalizedWindowHandle) || normalizedWindowHandle <= 0) {
    return null;
  }

  const cachedGeometry = cachedGeometryByHandle.get(normalizedWindowHandle);
  if (!cachedGeometry) return null;

  const ageMs = Math.max(0, Date.now() - Number(cachedGeometry.capturedAt || 0));
  if (ageMs <= GEOMETRY_CACHE_TTL_MS || (allowStale && ageMs <= GEOMETRY_STALE_GRACE_MS)) {
    return {
      ...cachedGeometry,
      geometryAgeMs: ageMs,
      stale: ageMs > GEOMETRY_CACHE_TTL_MS,
    };
  }

  if (ageMs <= GEOMETRY_STALE_GRACE_MS) {
    return null;
  }

  cachedGeometryByHandle.delete(normalizedWindowHandle);
  return null;
}

function setCachedGeometry(geometry) {
  const normalizedWindowHandle = Number(geometry?.windowHandle);
  if (!Number.isFinite(normalizedWindowHandle) || normalizedWindowHandle <= 0) {
    return;
  }

  const clientRect = normalizeClientRect(geometry?.clientRect);
  if (!clientRect) return;

  cachedGeometryByHandle.set(normalizedWindowHandle, {
    windowHandle: normalizedWindowHandle,
    clientRect,
    capturedAt: Date.now(),
  });
}

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
  if (_persistentPSRunner) {
    return _persistentPSRunner(script, env, { timeoutMs });
  }
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

function buildWindowGeometryTypePowerShellScript() {
  return `
if (-not ('Wildgate.WindowGeometry' -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
namespace Wildgate {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  public static class WindowGeometry {
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
  }
}
"@
}
`;
}

function buildWindowClientRectPowerShellFunctionScript() {
  return `
function Get-WindowClientRect([Int64]$windowHandleValue) {
  if ($windowHandleValue -le 0) { return $null }
  $windowHandle = [IntPtr]$windowHandleValue
  if (-not [Wildgate.WindowGeometry]::IsWindow($windowHandle)) {
    return $null
  }

  $clientRect = New-Object Wildgate.RECT
  if (-not [Wildgate.WindowGeometry]::GetClientRect($windowHandle, [ref]$clientRect)) {
    return $null
  }

  $screenPoint = New-Object Wildgate.POINT
  $screenPoint.X = $clientRect.Left
  $screenPoint.Y = $clientRect.Top
  if (-not [Wildgate.WindowGeometry]::ClientToScreen($windowHandle, [ref]$screenPoint)) {
    return $null
  }

  $width = [int]($clientRect.Right - $clientRect.Left)
  $height = [int]($clientRect.Bottom - $clientRect.Top)
  if ($width -le 0 -or $height -le 0) {
    return $null
  }

  return [pscustomobject]@{
    left = [int]$screenPoint.X
    top = [int]$screenPoint.Y
    width = $width
    height = $height
  }
}
`;
}

function buildGameWindowLookupPowerShellScript() {
  return `
$ErrorActionPreference = 'Stop'
${buildWindowGeometryTypePowerShellScript()}
${buildWindowClientRectPowerShellFunctionScript()}
$titleHints = @(
  [string]$env:WILDGATE_GAME_WINDOW_TITLE_HINT -split '[;,]' |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ }
)
$processNames = @(
  [string]$env:WILDGATE_GAME_PROCESS_NAMES -split ';' |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ }
)

function Get-ProcessPriority([string]$processName) {
  for ($i = 0; $i -lt $processNames.Count; $i++) {
    if ([string]::Equals([string]$processNames[$i], [string]$processName, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $i
    }
  }
  return 999
}

function Get-TitlePriority([string]$windowTitle) {
  for ($i = 0; $i -lt $titleHints.Count; $i++) {
    $hint = [string]$titleHints[$i]
    if ($hint -and $windowTitle -like "*$hint*") {
      return $i
    }
  }
  return 999
}

$candidates = @()
foreach ($processName in $processNames) {
  if (-not $processName) { continue }
  try {
    $candidates += @(Get-Process -Name $processName -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne 0 })
  } catch {
    # Ignore process lookup failures and continue with the next candidate.
  }
}

if ($candidates.Count -eq 0 -and $titleHints.Count -gt 0) {
  $candidates += @(Get-Process |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and (Get-TitlePriority([string]$_.MainWindowTitle)) -lt 999
    })
}

$candidates = @(
  $candidates |
    Group-Object Id |
    ForEach-Object { $_.Group | Select-Object -First 1 } |
    Sort-Object @{ Expression = { Get-ProcessPriority([string]$_.ProcessName) } }, @{ Expression = { Get-TitlePriority([string]$_.MainWindowTitle) } }, @{ Expression = { [Int64]$_.MainWindowHandle }; Descending = $true }
)

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
  clientRect = Get-WindowClientRect([Int64]$target.MainWindowHandle)
  candidateSummary = $candidateSummary
} | ConvertTo-Json -Compress
`;
}

function buildGameWindowGeometryPowerShellScript() {
  return `
$ErrorActionPreference = 'Stop'
${buildWindowGeometryTypePowerShellScript()}
${buildWindowClientRectPowerShellFunctionScript()}
$windowHandleValue = [Int64]($env:WILDGATE_GAME_WINDOW_HANDLE)
$clientRect = Get-WindowClientRect($windowHandleValue)

if (-not $clientRect) {
  [pscustomobject]@{
    success = $false
    error = 'Game window geometry unavailable'
  } | ConvertTo-Json -Compress
  exit 0
}

[pscustomobject]@{
  success = $true
  windowHandle = $windowHandleValue
  clientRect = $clientRect
} | ConvertTo-Json -Compress
`;
}

function buildGameWindowFocusPowerShellScript() {
  return `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WGFocus {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
}
"@

$windowHandleValue = [Int64]($env:WILDGATE_GAME_WINDOW_HANDLE)
$processId = [int]($env:WILDGATE_GAME_PROCESS_ID)
$focusDelayMs = [Math]::Max(50, [int]($env:WILDGATE_GAME_FOCUS_DELAY_MS))
$targetWindow = [IntPtr]$windowHandleValue

if ($windowHandleValue -le 0) {
  [pscustomobject]@{
    success = $false
    error = 'Missing target window handle.'
  } | ConvertTo-Json -Compress
  exit 0
}

$shell = $null
$altSent = $false
$appActivated = $false
try {
  $shell = New-Object -ComObject WScript.Shell
} catch {
  $shell = $null
}

if ($shell) {
  try {
    $shell.SendKeys('%')
    $altSent = $true
  } catch {}
  Start-Sleep -Milliseconds 60
  if ($processId -gt 0) {
    try {
      $appActivated = [bool]$shell.AppActivate($processId)
    } catch {}
  }
}

[WGFocus]::ShowWindowAsync($targetWindow, 9) | Out-Null
[WGFocus]::BringWindowToTop($targetWindow) | Out-Null
$setForeground = [bool][WGFocus]::SetForegroundWindow($targetWindow)
Start-Sleep -Milliseconds $focusDelayMs

$foregroundWindow = [WGFocus]::GetForegroundWindow()
$foregroundHandle = [Int64]$foregroundWindow
$titleBuilder = New-Object System.Text.StringBuilder 512
[void][WGFocus]::GetWindowText($foregroundWindow, $titleBuilder, $titleBuilder.Capacity)

[pscustomobject]@{
  success = $true
  altSent = $altSent
  appActivated = $appActivated
  setForeground = $setForeground
  focusConfirmed = ($foregroundHandle -eq $windowHandleValue)
  foregroundWindowHandle = $foregroundHandle
  foregroundWindowTitle = $titleBuilder.ToString()
} | ConvertTo-Json -Compress
`;
}

async function fastCheckGameProcess(processNames) {
  if (process.platform !== 'win32') return { running: false };
  if (!Array.isArray(processNames) || processNames.length === 0) return { running: false };
  for (const name of processNames) {
    if (!name) continue;
    try {
      const result = await new Promise((resolve) => {
        let stdout = '';
        let settled = false;
        const done = (val) => { if (!settled) { settled = true; clearTimeout(timer); resolve(val); } };
        const child = spawn('tasklist.exe', ['/FI', `IMAGENAME eq ${name}.exe`, '/FO', 'CSV', '/NH'], { windowsHide: true });
        const timer = setTimeout(() => { try { child.kill(); } catch {} done({ running: false }); }, 2500);
        child.stdout.on('data', (d) => { stdout += String(d); });
        child.on('close', () => {
          const match = stdout.match(/"([^"]+)","(\d+)"/);
          done(match ? { running: true, pid: parseInt(match[2], 10), processName: name } : { running: false });
        });
        child.on('error', () => done({ running: false }));
      });
      if (result.running) return result;
    } catch {
      // continue to next name
    }
  }
  return { running: false };
}

async function performGameWindowLookup({
  processNames = [],
  titleHint = '',
  timeoutMs,
} = {}) {
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
    clientRect: normalizeClientRect(parsed.clientRect),
    candidateSummary: typeof parsed.candidateSummary === 'string' ? parsed.candidateSummary : '',
  };
}

async function performGameWindowGeometryLookup(windowHandle, timeoutMs) {
  const result = await runPowerShellScript(buildGameWindowGeometryPowerShellScript(), {
    env: {
      WILDGATE_GAME_WINDOW_HANDLE: String(windowHandle || ''),
    },
    timeoutMs,
  });

  const stdout = String(result?.stdout || '').trim();
  const stderr = String(result?.stderr || '').trim();
  if (result?.code !== 0) {
    return {
      success: false,
      error: stderr || stdout || `PowerShell geometry lookup exited with code ${result?.code}`,
    };
  }

  const parsed = parseJsonSafely(stdout);
  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      error: stdout || 'Game window geometry lookup returned an unexpected response.',
    };
  }

  if (parsed.success === false) {
    return {
      success: false,
      error: typeof parsed.error === 'string' && parsed.error.trim()
        ? parsed.error
        : 'Game window geometry unavailable',
    };
  }

  const clientRect = normalizeClientRect(parsed.clientRect);
  if (!clientRect) {
    return {
      success: false,
      error: 'Game window geometry lookup returned invalid client geometry.',
    };
  }

  return {
    success: true,
    windowHandle: Number.isFinite(Number(parsed.windowHandle)) ? Number(parsed.windowHandle) : null,
    clientRect,
  };
}

async function lookupGameWindowCandidate({
  processNames = [],
  titleHint = '',
  focusDelayMs = DEFAULT_FOCUS_DELAY_MS,
  skipCache = false,
} = {}) {
  if (!skipCache) {
    const cached = getCachedCandidate();
    if (cached) {
      return cached;
    }
  }

  const fastCheck = await fastCheckGameProcess(processNames);
  const timeoutMs = Math.max(5000, (Math.max(50, Number(focusDelayMs) || DEFAULT_FOCUS_DELAY_MS) * 8) + 1500);
  if (!fastCheck.running) {
    const recoveryLookup = await performGameWindowLookup({
      processNames,
      titleHint: '',
      timeoutMs: Math.min(timeoutMs, 3500),
    });
    if (!recoveryLookup.success) {
      return { success: false, error: 'Game process not found (fast tasklist check).' };
    }
    setCachedCandidate(recoveryLookup);
    return recoveryLookup;
  }

  const lookupResult = await performGameWindowLookup({
    processNames,
    titleHint,
    timeoutMs,
  });
  if (!lookupResult.success) {
    return lookupResult;
  }

  setCachedCandidate(lookupResult);
  return lookupResult;
}

async function lookupGameWindowGeometry({
  processNames = [],
  titleHint = '',
  focusDelayMs = DEFAULT_FOCUS_DELAY_MS,
  skipCache = false,
} = {}) {
  const candidate = await lookupGameWindowCandidate({
    processNames,
    titleHint,
    focusDelayMs,
    skipCache,
  });
  if (!candidate?.success || !candidate.windowHandle) {
    return candidate;
  }

  const cachedGeometry = getCachedGeometry(candidate.windowHandle);
  if (cachedGeometry?.clientRect) {
    return {
      ...candidate,
      clientRect: cachedGeometry.clientRect,
      geometryAgeMs: cachedGeometry.geometryAgeMs,
    };
  }

  const timeoutMs = Math.max(
    2500,
    Math.min(6000, (Math.max(50, Number(focusDelayMs) || DEFAULT_FOCUS_DELAY_MS) * 4) + 1000)
  );
  const geometryResult = await performGameWindowGeometryLookup(candidate.windowHandle, timeoutMs);
  if (geometryResult.success) {
    setCachedGeometry({
      windowHandle: candidate.windowHandle,
      clientRect: geometryResult.clientRect,
    });
    return {
      ...candidate,
      clientRect: geometryResult.clientRect,
      geometryAgeMs: 0,
    };
  }

  const staleGeometry = getCachedGeometry(candidate.windowHandle, { allowStale: true });
  if (staleGeometry?.clientRect) {
    return {
      ...candidate,
      clientRect: staleGeometry.clientRect,
      geometryAgeMs: staleGeometry.geometryAgeMs,
      geometryStale: true,
    };
  }

  return {
    ...candidate,
    success: false,
    error: geometryResult.error || 'Game window geometry unavailable',
  };
}

async function focusWindowWithPowerShell(candidate, focusDelayMs) {
  const timeoutMs = Math.max(6000, (Math.max(50, Number(focusDelayMs) || DEFAULT_FOCUS_DELAY_MS) * 6) + 1500);
  const result = await runPowerShellScript(buildGameWindowFocusPowerShellScript(), {
    env: {
      WILDGATE_GAME_WINDOW_HANDLE: String(candidate?.windowHandle || ''),
      WILDGATE_GAME_PROCESS_ID: String(candidate?.processId || ''),
      WILDGATE_GAME_FOCUS_DELAY_MS: String(getFocusDelayMs(focusDelayMs)),
    },
    timeoutMs,
  });

  const stdout = String(result?.stdout || '').trim();
  const stderr = String(result?.stderr || '').trim();
  if (result?.code !== 0) {
    return {
      success: false,
      error: stderr || stdout || `PowerShell focus helper exited with code ${result?.code}`,
    };
  }

  const parsed = parseJsonSafely(stdout);
  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      error: stdout || 'PowerShell focus helper returned an unexpected response.',
    };
  }

  if (parsed.success === false) {
    return {
      success: false,
      error: typeof parsed.error === 'string' ? parsed.error : 'PowerShell focus helper failed.',
    };
  }

  return {
    success: true,
    altSent: parsed.altSent === true,
    appActivated: parsed.appActivated === true,
    setForeground: parsed.setForeground === true,
    focusConfirmed: parsed.focusConfirmed === true,
    foregroundWindowHandle: Number.isFinite(Number(parsed.foregroundWindowHandle))
      ? Number(parsed.foregroundWindowHandle)
      : null,
    foregroundWindowTitle: typeof parsed.foregroundWindowTitle === 'string'
      ? parsed.foregroundWindowTitle
      : '',
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
    const loaded = requirePackagedModule('@nut-tree-fork/nut-js');
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
  let powerShellFocused = false;
  let powerShellSetForeground = false;
  let powerShellAppActivated = false;
  let powerShellAltSent = false;

  try {
    restored = await targetWindow.restore();
  } catch {
    restored = false;
  }

  await delay(focusDelayMs);
  let activeWindow = await getActiveWindowInfo(nut);
  let focusConfirmed = activeWindow.foregroundWindowHandle === candidate.windowHandle;

  if (!focusConfirmed) {
    try {
      focused = await targetWindow.focus();
    } catch {
      focused = false;
    }
    await delay(focusDelayMs);
    activeWindow = await getActiveWindowInfo(nut);
    focusConfirmed = activeWindow.foregroundWindowHandle === candidate.windowHandle;
  }

  if (!focusConfirmed) {
    const powerShellResult = await focusWindowWithPowerShell(candidate, focusDelayMs);
    powerShellFocused = powerShellResult.success;
    powerShellSetForeground = powerShellResult.setForeground === true;
    powerShellAppActivated = powerShellResult.appActivated === true;
    powerShellAltSent = powerShellResult.altSent === true;
    if (powerShellResult.foregroundWindowHandle != null || powerShellResult.foregroundWindowTitle) {
      activeWindow = {
        foregroundWindowHandle: powerShellResult.foregroundWindowHandle ?? activeWindow.foregroundWindowHandle,
        foregroundWindowTitle: powerShellResult.foregroundWindowTitle || activeWindow.foregroundWindowTitle,
      };
    } else {
      activeWindow = await getActiveWindowInfo(nut);
    }
    focusConfirmed = activeWindow.foregroundWindowHandle === candidate.windowHandle;
  }

  return buildWindowResult(candidate, {
    activated: Boolean(restored || focused),
    restored,
    focused,
    powerShellFocused,
    powerShellSetForeground,
    powerShellAppActivated,
    powerShellAltSent,
    focusConfirmed,
    foregroundWindowHandle: activeWindow.foregroundWindowHandle ?? undefined,
    foregroundWindowTitle: activeWindow.foregroundWindowTitle || undefined,
  });
}

async function sendNutKeySequence(nut, keySequence) {
  const translatedKeys = translateSendKeysSequenceToNutKeys(keySequence, nut.Key);
  for (const key of translatedKeys) {
    await nut.keyboard.pressKey(key);
    await nut.keyboard.releaseKey(key);
  }
  return translatedKeys;
}

function translateSingleSendKeyToNutKey(nut, keySequence) {
  const translatedKeys = translateSendKeysSequenceToNutKeys(keySequence, nut.Key);
  if (translatedKeys.length !== 1) {
    throw new Error(`Hold actions require a single key token. Received: ${String(keySequence || '')}`);
  }
  return translatedKeys[0];
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
        ...(focusResult || buildWindowResult(candidate)),
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

async function holdGameKeySequence({
  sequence,
  action = 'custom-sequence',
  processNames = [],
  titleHint = '',
  focusDelayMs = DEFAULT_FOCUS_DELAY_MS,
  holdDelayMs = DEFAULT_KEY_DELAY_MS,
  runWhileHeld = null,
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
  const safeHoldDelayMs = Math.max(10, Number(holdDelayMs) || DEFAULT_KEY_DELAY_MS);
  let candidate = null;
  let focusResult = null;
  let heldKey = null;

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
        error: `Failed to confirm Wildgate focus before holding ${action}.`,
        ...(focusResult || buildWindowResult(candidate)),
      };
    }

    heldKey = translateSingleSendKeyToNutKey(nut, key);
    await nut.keyboard.pressKey(heldKey);
    await delay(safeHoldDelayMs);

    const callbackResult = typeof runWhileHeld === 'function'
      ? await runWhileHeld({
        action,
        key,
        heldKey,
        candidate,
        focusResult,
      })
      : null;

    const activeWindow = await getActiveWindowInfo(nut);

    return {
      success: true,
      action,
      key,
      callbackResult,
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
  } finally {
    if (heldKey != null) {
      try {
        const nut = loadNutApi();
        await nut.keyboard.releaseKey(heldKey);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

function buildSendKeysPowerShellScript() {
  return `
$ErrorActionPreference = 'Stop'
$processId = [int]($env:WILDGATE_GAME_PROCESS_ID)
$keys = $env:WILDGATE_SEND_KEYS
$shell = $null
try {
  $shell = New-Object -ComObject WScript.Shell
} catch {
  [pscustomobject]@{ success = $false; error = 'WScript.Shell not available' } | ConvertTo-Json -Compress
  exit 0
}
if ($processId -gt 0) {
  try { $shell.AppActivate($processId) | Out-Null } catch {}
  Start-Sleep -Milliseconds 150
}
try {
  $shell.SendKeys($keys)
  [pscustomobject]@{ success = $true } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
}

async function sendGameKeySequenceViaPowerShell(candidate, keySequence) {
  if (!candidate?.processId) {
    return { success: false, error: 'No process ID for PowerShell SendKeys' };
  }
  const result = await runPowerShellScript(buildSendKeysPowerShellScript(), {
    env: { WILDGATE_GAME_PROCESS_ID: String(candidate.processId), WILDGATE_SEND_KEYS: keySequence },
    timeoutMs: 5000,
  });
  const parsed = parseJsonSafely(result.stdout?.trim());
  return {
    success: parsed?.success === true,
    error: parsed?.error || (result.code !== 0 ? result.stderr : null),
  };
}

module.exports = {
  clearGameWindowCache,
  holdGameKeySequence,
  lookupGameWindowCandidate,
  lookupGameWindowGeometry,
  sendGameKeySequence,
  sendGameKeySequenceViaPowerShell,
  setPersistentPSRunner,
  tokenizeSendKeysSequence,
  translateSendKeysSequenceToNutKeys,
  validateGameInputRuntime,
};
