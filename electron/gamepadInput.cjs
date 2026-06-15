'use strict';

const path = require('path');
const { DEFAULT_PRESS_MS, DEFAULT_GAP_MS } = require('./gamepadSequences.cjs');

const BUTTON_NAME_MAP = Object.freeze({
  DPAD_UP: 'Up',
  DPAD_DOWN: 'Down',
  DPAD_LEFT: 'Left',
  DPAD_RIGHT: 'Right',
  START: 'Start',
  BACK: 'Back',
  LEFT_THUMB: 'LeftThumb',
  RIGHT_THUMB: 'RightThumb',
  LEFT_SHOULDER: 'LeftShoulder',
  RIGHT_SHOULDER: 'RightShoulder',
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
});

let _psRunner = null;
let _connected = false;
let _dllDir = null;

function setPSRunner(runner) {
  _psRunner = typeof runner === 'function' ? runner : null;
}

function setDllDir(dir) {
  _dllDir = typeof dir === 'string' && dir.trim() ? dir.trim() : null;
}

function isGamepadConnected() {
  return _connected;
}

function runPS(script, env, opts) {
  if (!_psRunner) {
    return Promise.resolve({ code: 1, stdout: '', stderr: 'No persistent PS runner configured.' });
  }
  return _psRunner(script, env || {}, opts || { timeoutMs: 10000 });
}

function parseJsonSafely(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function buildCheckDriverScript() {
  return `
$ErrorActionPreference = 'Stop'
$installed = $false
$version = ''
try {
  $svc = Get-Service -Name ViGEmBus -ErrorAction SilentlyContinue
  if ($svc) { $installed = $true }
} catch {}
if (-not $installed) {
  try {
    $installed = Test-Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\ViGEmBus'
  } catch {}
}
if ($installed) {
  try {
    $driverPath = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\ViGEmBus' -ErrorAction SilentlyContinue).ImagePath
    if ($driverPath) { $version = $driverPath }
  } catch {}
}
[pscustomobject]@{ installed = $installed; version = $version } | ConvertTo-Json -Compress
`;
}

function buildInstallDriverScript() {
  return `
$ErrorActionPreference = 'Stop'
$setupPath = $env:WILDGATE_VIGEM_SETUP_PATH
if (-not $setupPath -or -not (Test-Path $setupPath)) {
  [pscustomobject]@{ success = $false; error = 'ViGEmBus installer not found at: ' + $setupPath } | ConvertTo-Json -Compress
  return
}
try {
  $proc = Start-Process -FilePath $setupPath -Verb RunAs -Wait -PassThru
  if ($proc.ExitCode -eq 0) {
    [pscustomobject]@{ success = $true } | ConvertTo-Json -Compress
  } else {
    [pscustomobject]@{ success = $false; error = 'Installer exited with code ' + $proc.ExitCode } | ConvertTo-Json -Compress
  }
} catch {
  [pscustomobject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
}

function buildConnectScript() {
  return `
$ErrorActionPreference = 'Stop'
$dllPath = $env:WILDGATE_VIGEM_DLL_PATH
if (-not $dllPath -or -not (Test-Path $dllPath)) {
  [pscustomobject]@{ success = $false; error = 'Nefarius.ViGEm.Client.dll not found at: ' + $dllPath } | ConvertTo-Json -Compress
  return
}

if ($global:vigemController) {
  [pscustomobject]@{ success = $true; alreadyConnected = $true } | ConvertTo-Json -Compress
  return
}

try {
  $asm = [System.Reflection.Assembly]::LoadFrom($dllPath)
  $global:vigemClient = New-Object Nefarius.ViGEm.Client.ViGEmClient
  $global:vigemController = $global:vigemClient.CreateXbox360Controller()
  $global:vigemController.AutoSubmitReport = $true
  $global:vigemController.Connect()

  $btnType = $asm.GetType('Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Button')
  $global:vigemButtons = @{}
  foreach ($name in @('Up','Down','Left','Right','Start','Back','A','B','X','Y','LeftShoulder','RightShoulder','LeftThumb','RightThumb')) {
    $global:vigemButtons[$name] = $btnType.GetField($name).GetValue($null)
  }

  [pscustomobject]@{ success = $true } | ConvertTo-Json -Compress
} catch {
  $global:vigemController = $null
  $global:vigemClient = $null
  $global:vigemButtons = $null
  $msg = $_.Exception.InnerException.Message
  if (-not $msg) { $msg = $_.Exception.Message }
  [pscustomobject]@{ success = $false; error = $msg } | ConvertTo-Json -Compress
}
`;
}

function buildDisconnectScript() {
  return `
$ErrorActionPreference = 'SilentlyContinue'
if ($global:vigemController) {
  $global:vigemController.Disconnect()
}
if ($global:vigemClient) {
  $global:vigemClient.Dispose()
}
$global:vigemController = $null
$global:vigemClient = $null
$global:vigemButtons = $null
'disconnected'
`;
}

function buildButtonSequenceScript(actions) {
  const lines = [];
  lines.push('$ErrorActionPreference = "Stop"');
  lines.push('if (-not $global:vigemController -or -not $global:vigemButtons) {');
  lines.push('  [pscustomobject]@{ success = $false; error = "Virtual gamepad not connected" } | ConvertTo-Json -Compress');
  lines.push('  return');
  lines.push('}');

  for (const action of actions) {
    const managedName = BUTTON_NAME_MAP[action.button] || action.button;
    const holdMs = Math.max(10, Number(action.durationMs) || DEFAULT_PRESS_MS);
    const gapMs = Math.max(0, Number(action.gapMs) || DEFAULT_GAP_MS);

    lines.push(`$global:vigemController.SetButtonState($global:vigemButtons['${managedName}'], $true)`);
    lines.push(`Start-Sleep -Milliseconds ${holdMs}`);
    lines.push(`$global:vigemController.SetButtonState($global:vigemButtons['${managedName}'], $false)`);
    if (gapMs > 0) {
      lines.push(`Start-Sleep -Milliseconds ${gapMs}`);
    }
  }

  lines.push('[pscustomobject]@{ success = $true; count = ' + actions.length + ' } | ConvertTo-Json -Compress');
  return lines.join('\n');
}

async function checkViGEmBusInstalled() {
  const result = await runPS(buildCheckDriverScript());
  const stdout = String(result?.stdout || '').trim();
  if (result?.code !== 0) {
    return { installed: false, error: result?.stderr || 'Registry check failed' };
  }
  const parsed = parseJsonSafely(stdout);
  return {
    installed: parsed?.installed === true,
    version: typeof parsed?.version === 'string' ? parsed.version : '',
  };
}

async function installViGEmBus(setupPath) {
  const resolvedPath = setupPath || (_dllDir ? findSetupExe(_dllDir) : '');
  if (!resolvedPath) {
    return { success: false, error: 'No installer path configured' };
  }

  const result = await runPS(buildInstallDriverScript(), {
    WILDGATE_VIGEM_SETUP_PATH: resolvedPath,
  }, { timeoutMs: 120000 });

  const parsed = parseJsonSafely(String(result?.stdout || '').trim());
  return {
    success: parsed?.success === true,
    error: parsed?.error || (result?.code !== 0 ? (result?.stderr || 'Install failed') : null),
  };
}

function findSetupExe(dir) {
  try {
    const fs = require('fs');
    const entries = fs.readdirSync(dir);
    const exe = entries.find((e) => /^ViGEmBus.*\.exe$/i.test(e));
    return exe ? path.join(dir, exe) : '';
  } catch {
    return '';
  }
}

async function connectVirtualGamepad() {
  if (_connected) {
    return { success: true, alreadyConnected: true };
  }

  if (!_dllDir) {
    return { success: false, error: 'ViGEmClient DLL directory not configured' };
  }

  const dllPath = path.join(_dllDir, 'Nefarius.ViGEm.Client.dll');

  const result = await runPS(buildConnectScript(), {
    WILDGATE_VIGEM_DLL_PATH: dllPath,
  }, { timeoutMs: 10000 });

  const stdout = String(result?.stdout || '').trim();
  const parsed = parseJsonSafely(stdout);

  if (parsed?.success) {
    _connected = true;
    console.log('[Gamepad] Virtual Xbox 360 controller connected.');
    return { success: true, alreadyConnected: parsed.alreadyConnected === true };
  }

  const error = parsed?.error || result?.stderr || 'Failed to connect virtual gamepad';
  console.warn('[Gamepad] Connection failed:', error);
  return { success: false, error };
}

async function disconnectVirtualGamepad() {
  if (!_connected) return;

  try {
    await runPS(buildDisconnectScript(), {}, { timeoutMs: 5000 });
  } catch (err) {
    console.warn('[Gamepad] Disconnect error:', err?.message || err);
  }
  _connected = false;
  console.log('[Gamepad] Virtual gamepad disconnected.');
}

async function sendGamepadSequence(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return { success: false, error: 'No gamepad actions provided' };
  }

  if (!_connected) {
    const connectResult = await connectVirtualGamepad();
    if (!connectResult.success) {
      return { success: false, error: connectResult.error || 'Virtual gamepad not connected' };
    }
  }

  const script = buildButtonSequenceScript(actions);
  const result = await runPS(script, {}, { timeoutMs: 10000 });
  const parsed = parseJsonSafely(String(result?.stdout || '').trim());

  if (parsed?.success) {
    return { success: true, count: parsed.count };
  }

  const error = parsed?.error || result?.stderr || 'Gamepad sequence failed';
  if (error.includes('not connected')) {
    _connected = false;
  }
  return { success: false, error };
}

async function sendTestGamepadInput() {
  const { XUSB_BUTTON: buttons } = require('./gamepadSequences.cjs');
  return sendGamepadSequence([
    { button: 'DPAD_UP', flag: buttons.DPAD_UP, durationMs: 100, gapMs: 50 },
  ]);
}

module.exports = {
  checkViGEmBusInstalled,
  connectVirtualGamepad,
  disconnectVirtualGamepad,
  installViGEmBus,
  isGamepadConnected,
  sendGamepadSequence,
  sendTestGamepadInput,
  setDllDir,
  setPSRunner,

  // Exposed for testing
  buildButtonSequenceScript,
  buildCheckDriverScript,
  buildConnectScript,
  buildDisconnectScript,
  buildInstallDriverScript,
};
