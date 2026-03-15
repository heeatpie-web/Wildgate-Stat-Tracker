'use strict';

const { spawn } = require('child_process');
const { writeFileSync, mkdirSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const SENTINEL = '<<<WILDGATE_PS_DONE>>>';

// Controller script runs an infinite loop in the PS process.
// Each iteration: reads a base64-encoded script from stdin, executes it,
// writes the output, then writes the sentinel line so Node knows it's done.
const CONTROLLER_SCRIPT = `$ErrorActionPreference = 'SilentlyContinue'
$enc = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = $enc
[Console]::OutputEncoding = $enc

while ($true) {
    $b64 = [Console]::In.ReadLine()
    if ($null -eq $b64) { break }
    $b64 = $b64.Trim()
    if ($b64 -eq '') {
        Write-Host '<<<WILDGATE_PS_DONE>>>'
        [Console]::Out.Flush()
        continue
    }
    $output = ''
    try {
        $scriptText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
        $sb = [scriptblock]::Create($scriptText)
        $output = (& $sb | Out-String).TrimEnd()
    } catch {
        $output = "PSERROR: $($_.Exception.Message)"
    }
    if ($output -ne '') { Write-Host $output }
    Write-Host '<<<WILDGATE_PS_DONE>>>'
    [Console]::Out.Flush()
}
`;

let _psProc = null;
let _controllerPath = null;
let _buffer = '';
let _currentResolve = null;
let _queue = [];

function ensureControllerScript() {
  if (_controllerPath) return _controllerPath;
  const dir = join(tmpdir(), 'wildgate-ps');
  try { mkdirSync(dir, { recursive: true }); } catch {}
  _controllerPath = join(dir, 'ps-controller.ps1');
  writeFileSync(_controllerPath, CONTROLLER_SCRIPT, 'utf8');
  return _controllerPath;
}

function processBuffer() {
  while (true) {
    const crlf = _buffer.indexOf(SENTINEL + '\r\n');
    const lf = _buffer.indexOf(SENTINEL + '\n');
    const idx = crlf !== -1 ? crlf : lf;
    if (idx === -1) break;

    const responseText = _buffer.slice(0, idx).trimEnd();
    const advance = idx + SENTINEL.length + (crlf !== -1 ? 2 : 1);
    _buffer = _buffer.slice(advance);

    const res = _currentResolve;
    _currentResolve = null;
    if (res) {
      res({ code: 0, stdout: responseText, stderr: '' });
      dispatchNext();
    }
  }
}

function dispatchNext() {
  if (!_queue.length || !_psProc) return;
  const { script, resolve } = _queue.shift();
  _currentResolve = resolve;
  const b64 = Buffer.from(script, 'utf8').toString('base64');
  try {
    _psProc.stdin.write(b64 + '\n');
  } catch (err) {
    _currentResolve = null;
    resolve({ code: 1, stdout: '', stderr: String(err?.message || err) });
    dispatchNext();
  }
}

function startPersistentPS() {
  if (_psProc) return;
  const scriptPath = ensureControllerScript();
  const psExe = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

  _psProc = spawn(psExe, [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
  ], { windowsHide: true, env: process.env });

  _buffer = '';

  _psProc.stdout.on('data', (chunk) => {
    _buffer += String(chunk);
    processBuffer();
  });

  _psProc.stderr.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) console.warn('[PersistentPS] stderr:', text);
  });

  _psProc.on('close', (code) => {
    console.log(`[PersistentPS] Process closed (code=${code})`);
    _psProc = null;
    const res = _currentResolve;
    _currentResolve = null;
    if (res) res({ code: 1, stdout: '', stderr: 'Persistent PowerShell process exited unexpectedly.' });
    const drained = _queue.splice(0);
    for (const { resolve: r } of drained) {
      r({ code: 1, stdout: '', stderr: 'Persistent PowerShell process exited.' });
    }
  });

  _psProc.on('error', (err) => {
    console.error('[PersistentPS] Spawn error:', err?.message || err);
    _psProc = null;
  });

  console.log('[PersistentPS] Started persistent PowerShell controller.');
}

/**
 * Run a PowerShell script in the persistent process, with optional env vars
 * inlined as PS variable assignments (so existing scripts using $env:* work unchanged).
 */
function runPSWithEnv(script, envVars, { timeoutMs = 10000 } = {}) {
  const preamble = Object.entries(envVars || {})
    .map(([k, v]) => `$env:${k} = '${String(v).replace(/'/g, "''")}'`)
    .join('\n');
  const fullScript = preamble ? `${preamble}\n${script}` : script;
  return runInPersistentPS(fullScript, { timeoutMs });
}

function runInPersistentPS(script, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    if (!_psProc) startPersistentPS();

    let settled = false;
    let timer = null;

    const wrappedResolve = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        // Remove from queue if still waiting
        const i = _queue.findIndex(q => q.resolve === wrappedResolve);
        if (i !== -1) {
          _queue.splice(i, 1);
        } else if (_currentResolve === wrappedResolve) {
          _currentResolve = null;
          // Kill stuck PS and let it restart on next call
          try { _psProc?.kill(); } catch {}
          _psProc = null;
          dispatchNext();
        }
        resolve({ code: 1, stdout: '', stderr: `Persistent PS timed out after ${timeoutMs}ms` });
      }, timeoutMs);
    }

    if (!_currentResolve) {
      _currentResolve = wrappedResolve;
      const b64 = Buffer.from(script, 'utf8').toString('base64');
      try {
        _psProc.stdin.write(b64 + '\n');
      } catch (err) {
        _currentResolve = null;
        wrappedResolve({ code: 1, stdout: '', stderr: String(err?.message || err) });
      }
    } else {
      _queue.push({ script, resolve: wrappedResolve });
    }
  });
}

function killPersistentPS() {
  if (_psProc) {
    try { _psProc.stdin.end(); } catch {}
    try { _psProc.kill(); } catch {}
    _psProc = null;
  }
  _currentResolve = null;
  _queue = [];
  console.log('[PersistentPS] Killed persistent PowerShell controller.');
}

function isPersistentPSAlive() {
  return _psProc !== null;
}

module.exports = { runPSWithEnv, runInPersistentPS, startPersistentPS, killPersistentPS, isPersistentPSAlive };
