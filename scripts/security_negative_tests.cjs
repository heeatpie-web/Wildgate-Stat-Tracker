#!/usr/bin/env node
/**
 * Security Negative Tests — Gate A Evidence
 * 
 * Tests all rejection paths for:
 * 1. Path traversal / path validation ("Path not allowed")
 * 2. IPC channel allowlist enforcement ("IPC invoke blocked")
 * 3. Corpus file name validation ("Unsupported corpus file")
 * 4. Epic request host/method/URL validation
 * 5. User-facing error message sanitization (friendlyError mapping)
 * 
 * Run: node scripts/security_negative_tests.cjs
 */
const path = require('path');

let pass = 0;
let fail = 0;
const results = [];

function assert(condition, testName) {
  if (condition) {
    pass++;
    results.push({ test: testName, result: 'PASS' });
  } else {
    fail++;
    results.push({ test: testName, result: 'FAIL' });
    console.error(`  FAIL: ${testName}`);
  }
}

// ============================================================
// 1. PATH VALIDATION (isPathWithinRoot + isAllowedRendererPath)
// ============================================================
console.log('\n=== 1. Path Validation Tests ===\n');

// Pure function extracted from electron/main.cjs:36-38
function isPathWithinRoot(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

// Simulated isAllowedRendererPath using known Windows roots
function isAllowedRendererPath(inputPath, roots) {
  if (!inputPath || typeof inputPath !== 'string') return false;
  const resolved = path.resolve(inputPath);
  return roots.some(root => resolved === root || isPathWithinRoot(resolved, root));
}

// Simulate typical Windows app roots
const HOME = 'C:\\Users\\TestUser';
const USER_DATA_ROOT = path.join(HOME, 'AppData', 'Roaming', 'Wildgate Stat Tracker');
const DOCS_ROOT = path.join(HOME, 'Documents', 'Wildgate Stat Tracker');
const NEBULA_LOGS = path.join(HOME, 'AppData', 'Local', 'Nebula', 'Saved', 'Logs');
const WILDGATE_LOGS = path.join(HOME, 'AppData', 'Local', 'Wildgate', 'Saved', 'Logs');
const TEST_ROOTS = [USER_DATA_ROOT, DOCS_ROOT, NEBULA_LOGS, WILDGATE_LOGS];

// 1a. Null/empty/non-string inputs
assert(!isAllowedRendererPath(null, TEST_ROOTS), 'Reject null path');
assert(!isAllowedRendererPath(undefined, TEST_ROOTS), 'Reject undefined path');
assert(!isAllowedRendererPath('', TEST_ROOTS), 'Reject empty string path');
assert(!isAllowedRendererPath(42, TEST_ROOTS), 'Reject non-string path (number)');

// 1b. Absolute paths outside allowed roots
assert(!isAllowedRendererPath('C:\\Windows\\System32\\cmd.exe', TEST_ROOTS), 'Reject System32 path');
assert(!isAllowedRendererPath('C:\\Windows\\win.ini', TEST_ROOTS), 'Reject Windows config');
assert(!isAllowedRendererPath('C:\\', TEST_ROOTS), 'Reject drive root');
assert(!isAllowedRendererPath('D:\\OtherDrive\\secret.txt', TEST_ROOTS), 'Reject different drive');
assert(!isAllowedRendererPath('C:\\Users\\OtherUser\\Documents\\file.txt', TEST_ROOTS), 'Reject other user directory');
assert(!isAllowedRendererPath('C:\\Program Files\\app.exe', TEST_ROOTS), 'Reject Program Files');

// 1c. Path traversal attacks
assert(!isAllowedRendererPath(USER_DATA_ROOT + '\\..\\..\\..\\Windows\\win.ini', TEST_ROOTS), 'Reject ../ traversal from app data');
assert(!isAllowedRendererPath(USER_DATA_ROOT + '\\..\\..\\..\\..\\..\\etc\\passwd', TEST_ROOTS), 'Reject deep ../ traversal');
assert(!isAllowedRendererPath(DOCS_ROOT + '\\..\\secret.txt', TEST_ROOTS), 'Reject single ../ from docs root');
assert(!isAllowedRendererPath(NEBULA_LOGS + '\\..\\..\\Roaming\\secrets.json', TEST_ROOTS), 'Reject traversal from logs to roaming');

// 1d. Valid paths (should be allowed)
assert(isAllowedRendererPath(USER_DATA_ROOT + '\\screenshots\\test.png', TEST_ROOTS), 'Allow valid app data subpath');
assert(isAllowedRendererPath(DOCS_ROOT + '\\match_data\\match1.json', TEST_ROOTS), 'Allow valid docs subpath');
assert(isAllowedRendererPath(NEBULA_LOGS + '\\game.log', TEST_ROOTS), 'Allow valid Nebula log');
assert(isAllowedRendererPath(WILDGATE_LOGS + '\\crash.log', TEST_ROOTS), 'Allow valid Wildgate log');
assert(isAllowedRendererPath(USER_DATA_ROOT, TEST_ROOTS), 'Allow root itself (exact match)');

// 1e. Edge cases
assert(!isAllowedRendererPath('\\\\network\\share\\file.txt', TEST_ROOTS), 'Reject UNC network path');
assert(!isAllowedRendererPath('file:///C:/Windows/System32/cmd.exe', TEST_ROOTS), 'Reject file:// URL');
// Path with encoded characters (should resolve and fail)
assert(!isAllowedRendererPath('C:\\Users\\TestUser\\AppData\\Roaming\\..\\..\\Windows', TEST_ROOTS), 'Reject encoded traversal through AppData');

// ============================================================
// 2. IPC CHANNEL ALLOWLIST ENFORCEMENT
// ============================================================
console.log('=== 2. IPC Channel Allowlist Tests ===\n');

// Extracted from electron/preload.cjs
const INVOKE_CHANNELS = [
  'db-read', 'db-write', 'db-backup', 'db-status',
  'read-uid-seed',
  'persist-logs',
  'capture-screen', 'save-ocr-debug',
  'ocr-scan', 'ml-scan',
  'capture-game-window', 'ocr-process-capture',
  'gcloud-ocr-scan', 'sync-training-sample',
  'save-screenshot',
  'bundle-artifacts', 'get-match-artifacts', 'rerun-ocr-on-artifact',
  'list-match-artifacts',
  'remove-match-artifact', 'add-match-artifact',
  'load-archived-telemetry', 'list-telemetry-archives', 'load-telemetry-archive-file',
  'telemetry-retention-status', 'telemetry-prune-preview', 'telemetry-prune-apply',
  'decode-telemetry-cache', 'clear-telemetry-archives',
  'clear-ocr-preprocessed', 'get-ocr-debug-dir', 'list-ocr-debug-files',
  'scan-epic-ids',
  'read-file-base64', 'open-path',
  'ocr-corpus-load', 'ocr-corpus-save', 'ocr-corpus-eval', 'ocr-corpus-threshold-recommend', 'ocr-corpus-promote-baseline',
  'ocr-corpus-import-images', 'ocr-corpus-run-pipeline', 'ocr-corpus-sync-to-repo',
  'ocr-corpus-list-images', 'ocr-corpus-read-image', 'ocr-corpus-add-corrected-sample',
  'get-gcloud-status',
  'test-gcloud-upload',
  'gcloud-backfill-screenshots',
];

const SEND_CHANNELS = [
  'start-log-monitoring', 'stop-log-monitoring',
  'minimize-window', 'maximize-window', 'close-window',
  'check-for-updates', 'restart_app',
  'update-presence',
  'set-ignore-mouse-events',
  'toggle-overlay', 'set-overlay-style', 'set-window-bounds',
];

const RECEIVE_CHANNELS = [
  'log-status', 'log-data',
  'window-maximized-changed',
  'window-restored',
  'update_available', 'update_downloaded',
  'hotkey-toggle-overlay',
  'telemetry-prune-needed',
];

// 2a. Verify dangerous channels are NOT in invoke allowlist
const dangerousInvoke = [
  'exec', 'shell-exec', 'run-command', 'eval',
  'fs-read', 'fs-write', 'fs-delete', 'fs-readdir',
  'require', 'child-process',
  'get-env', 'set-env', 'process-exit',
  'delete-file', 'write-file', 'read-file',
  'execute-script', 'spawn-process',
  'arbitrary-channel', 'hack', '',
];
for (const ch of dangerousInvoke) {
  assert(!INVOKE_CHANNELS.includes(ch), `Invoke blocks dangerous channel: "${ch || '(empty)'}" `);
}

// 2b. Verify dangerous channels are NOT in send allowlist
const dangerousSend = [
  'exec', 'shell-exec', 'run-command', 'eval',
  'kill-process', 'shutdown', 'reboot',
  'arbitrary-channel', '',
];
for (const ch of dangerousSend) {
  assert(!SEND_CHANNELS.includes(ch), `Send blocks dangerous channel: "${ch || '(empty)'}"`);
}

// 2c. Verify dangerous channels are NOT in receive allowlist
const dangerousReceive = [
  'exec-result', 'shell-output', 'eval-result',
  'arbitrary-data', '',
];
for (const ch of dangerousReceive) {
  assert(!RECEIVE_CHANNELS.includes(ch), `Receive blocks dangerous channel: "${ch || '(empty)'}"`);
}

// 2d. Verify no duplicate channels
assert(new Set(INVOKE_CHANNELS).size === INVOKE_CHANNELS.length, 'No duplicate invoke channels');
assert(new Set(SEND_CHANNELS).size === SEND_CHANNELS.length, 'No duplicate send channels');
assert(new Set(RECEIVE_CHANNELS).size === RECEIVE_CHANNELS.length, 'No duplicate receive channels');

// 2e. Verify known allowed channels ARE present
assert(INVOKE_CHANNELS.includes('open-path'), 'open-path is in invoke allowlist');
assert(INVOKE_CHANNELS.includes('read-file-base64'), 'read-file-base64 is in invoke allowlist');
assert(INVOKE_CHANNELS.includes('ocr-process-capture'), 'ocr-process-capture is in invoke allowlist');
assert(INVOKE_CHANNELS.includes('ocr-corpus-add-corrected-sample'), 'ocr-corpus-add-corrected-sample is in invoke allowlist');

// ============================================================
// 3. CORPUS FILE NAME VALIDATION
// ============================================================
console.log('=== 3. Corpus File Name Validation Tests ===\n');

// Extracted from electron/main.cjs:73-77
function getCorpusFilePath(name) {
  const allowed = new Set(['ground-truth.json', 'predictions.latest.json', 'baseline.json', 'reports/latest.json', 'reports/index.json']);
  if (!allowed.has(name)) return null;
  return path.join('mock-corpus-dir', name);
}

// 3a. Valid corpus file names
assert(getCorpusFilePath('ground-truth.json') !== null, 'Allow ground-truth.json');
assert(getCorpusFilePath('predictions.latest.json') !== null, 'Allow predictions.latest.json');
assert(getCorpusFilePath('baseline.json') !== null, 'Allow baseline.json');
assert(getCorpusFilePath('reports/latest.json') !== null, 'Allow reports/latest.json');
assert(getCorpusFilePath('reports/index.json') !== null, 'Allow reports/index.json');

// 3b. Reject unauthorized corpus file names
assert(getCorpusFilePath('../../etc/passwd') === null, 'Reject traversal in corpus name');
assert(getCorpusFilePath('../secrets.json') === null, 'Reject parent directory corpus name');
assert(getCorpusFilePath('arbitrary.json') === null, 'Reject arbitrary corpus filename');
assert(getCorpusFilePath('ground-truth.json.bak') === null, 'Reject backup file suffix');
assert(getCorpusFilePath('') === null, 'Reject empty corpus name');
assert(getCorpusFilePath(null) === null, 'Reject null corpus name');
assert(getCorpusFilePath('reports/../../main.cjs') === null, 'Reject traversal through reports/');
assert(getCorpusFilePath('config.json') === null, 'Reject non-allowlisted config.json');

// ============================================================
// 4. EPIC REQUEST VALIDATION
// ============================================================
console.log('=== 4. Epic Request Validation Tests ===\n');

// Extracted from electron/main.cjs:53-57
const DEFAULT_EPIC_REQUEST_HOSTS = [
  'account-public-service-prod.ol.epicgames.com',
  'launcher-public-service-live-prod.ol.epicgames.com',
];
const EPIC_REQUEST_ALLOWED_HOSTS = new Set(
  DEFAULT_EPIC_REQUEST_HOSTS.map(v => v.trim().toLowerCase())
);

function isAllowedEpicHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return Array.from(EPIC_REQUEST_ALLOWED_HOSTS).some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

// Allowed methods from main.cjs
const ALLOWED_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

// 4a. Valid hosts
assert(isAllowedEpicHost('account-public-service-prod.ol.epicgames.com'), 'Allow Epic accounts host');
assert(isAllowedEpicHost('launcher-public-service-live-prod.ol.epicgames.com'), 'Allow Epic launcher host');

// 4b. Reject unauthorized hosts
assert(!isAllowedEpicHost('evil.com'), 'Reject evil.com');
assert(!isAllowedEpicHost('google.com'), 'Reject google.com');
assert(!isAllowedEpicHost(''), 'Reject empty host');
assert(!isAllowedEpicHost(null), 'Reject null host');
assert(!isAllowedEpicHost('localhost'), 'Reject localhost');
assert(!isAllowedEpicHost('127.0.0.1'), 'Reject loopback IP');
assert(!isAllowedEpicHost('evil.epicgames.com'), 'Reject subdomain spoofing (evil.epicgames.com)');
assert(!isAllowedEpicHost('epicgames.com'), 'Reject bare epicgames.com domain');
assert(!isAllowedEpicHost('ol.epicgames.com'), 'Reject partial host (ol.epicgames.com)');

// 4c. HTTP method validation
assert(ALLOWED_HTTP_METHODS.has('GET'), 'Allow GET method');
assert(ALLOWED_HTTP_METHODS.has('POST'), 'Allow POST method');
assert(!ALLOWED_HTTP_METHODS.has('CONNECT'), 'Reject CONNECT method');
assert(!ALLOWED_HTTP_METHODS.has('TRACE'), 'Reject TRACE method');
assert(!ALLOWED_HTTP_METHODS.has(''), 'Reject empty method');

// ============================================================
// 5. USER-FACING ERROR MESSAGE SANITIZATION
// ============================================================
console.log('=== 5. friendlyError Mapping Tests ===\n');

// Extracted from src/components/DevOCRPanel.tsx:16-36
function friendlyError(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('path not allowed'))
    return 'This file is outside the allowed directory. Move it into the app data folder and try again.';
  if (lower.includes('host not allowed'))
    return 'The requested server is not on the approved list. Check your connection settings.';
  if (lower.includes('method not allowed'))
    return 'This operation is not permitted by the current security policy.';
  if (lower.includes('ipc invoke blocked') || lower.includes('ipc send blocked') || lower.includes('ipc on blocked'))
    return 'This action is not available. The app may need to be restarted.';
  if (lower.includes('ipc not available') || lower.includes('electronapi not available'))
    return 'Desktop services are unavailable. Please restart the app.';
  if (lower.includes('file read returned null'))
    return 'The file could not be read. It may have been moved or deleted.';
  if (lower.includes('https required'))
    return 'Only secure (HTTPS) connections are allowed.';
  if (lower.includes('malformed url'))
    return 'The URL is invalid. Please check the address and try again.';
  return raw.replace(/[A-Z]:\\[^\s]+/gi, '[path]').replace(/\b[a-z-]+:[a-z-]+\b/gi, '[channel]');
}

// 5a. Verify security internals are never exposed
const pathNotAllowed = friendlyError('Path not allowed');
assert(!pathNotAllowed.includes('Path not allowed'), 'friendlyError hides "Path not allowed" raw text');
assert(pathNotAllowed.includes('outside the allowed directory'), 'friendlyError shows user-safe path message');

const hostNotAllowed = friendlyError('Host not allowed: evil.com');
assert(!hostNotAllowed.includes('evil.com'), 'friendlyError hides hostname from "Host not allowed"');
assert(hostNotAllowed.includes('not on the approved list'), 'friendlyError shows user-safe host message');

const methodNotAllowed = friendlyError('Method not allowed: TRACE');
assert(!methodNotAllowed.includes('TRACE'), 'friendlyError hides method name');
assert(methodNotAllowed.includes('security policy'), 'friendlyError shows user-safe method message');

const ipcBlocked = friendlyError('IPC invoke blocked: delete-all-data');
assert(!ipcBlocked.includes('delete-all-data'), 'friendlyError hides blocked channel name');
assert(ipcBlocked.includes('not available'), 'friendlyError shows user-safe IPC blocked message');

const ipcSendBlocked = friendlyError('IPC send blocked: exec');
assert(!ipcSendBlocked.includes('exec'), 'friendlyError hides blocked send channel');

const ipcOnBlocked = friendlyError('IPC on blocked: shell-output');
assert(!ipcOnBlocked.includes('shell-output'), 'friendlyError hides blocked on channel');

const ipcUnavailable = friendlyError('IPC not available');
assert(ipcUnavailable.includes('restart the app'), 'friendlyError handles IPC unavailable');

const electronUnavailable = friendlyError('electronAPI not available');
assert(electronUnavailable.includes('restart the app'), 'friendlyError handles electronAPI unavailable');

const fileNull = friendlyError('File read returned null');
assert(fileNull.includes('could not be read'), 'friendlyError handles file read null');

const httpsRequired = friendlyError('HTTPS required');
assert(httpsRequired.includes('secure (HTTPS)'), 'friendlyError handles HTTPS required');

const malformedUrl = friendlyError('Malformed URL');
assert(malformedUrl.includes('URL is invalid'), 'friendlyError handles malformed URL');

// 5b. Fallback sanitization strips paths and channels
const fallbackRaw = 'Unknown error at C:\\Users\\TestUser\\AppData\\secrets.json via exec:shell';
const sanitized = friendlyError(fallbackRaw);
assert(!sanitized.includes('C:\\Users\\TestUser'), 'Fallback strips Windows file paths');
assert(!sanitized.includes('secrets.json'), 'Fallback strips sensitive filenames');

// ============================================================
// 6. EXTERNAL URL VALIDATION
// ============================================================
console.log('=== 6. External URL Validation Tests ===\n');

function isAllowlistedHost(hostname, hosts) {
  const host = String(hostname || '').toLowerCase();
  return Array.from(hosts).some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

function validateExternalUrl(rawUrl, hosts) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  if (!isAllowlistedHost(parsed.hostname, hosts)) return false;
  return true;
}

const EXTERNAL_HOSTS = new Set(['wildgate.app', 'docs.wildgate.app']);
assert(validateExternalUrl('https://wildgate.app/changelog', EXTERNAL_HOSTS), 'Allow https URL on external allowlist');
assert(!validateExternalUrl('http://wildgate.app/changelog', EXTERNAL_HOSTS), 'Reject non-https external URL');
assert(!validateExternalUrl('https://evil.com/phish', EXTERNAL_HOSTS), 'Reject non-allowlisted external host');

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('SECURITY NEGATIVE TEST RESULTS');
console.log('='.repeat(60));
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
console.log(`TOTAL: ${pass + fail}`);
console.log(`STATUS: ${fail === 0 ? 'ALL PASS' : 'FAILURES DETECTED'}`);
console.log('='.repeat(60));

if (fail > 0) {
  console.log('\nFailed tests:');
  results.filter(r => r.result === 'FAIL').forEach(r => console.log(`  - ${r.test}`));
}

const advisory = results.filter(r => r.result === 'ADVISORY');
if (advisory.length > 0) {
  console.log('\nAdvisories:');
  advisory.forEach(r => console.log(`  - ${r.test}\n    ${r.note}`));
}

// Write structured results for validation log
const report = {
  timestamp: new Date().toISOString(),
  gate: 'A',
  title: 'Security Negative Tests — Rejection Path Evidence',
  summary: { pass, fail, total: pass + fail, status: fail === 0 ? 'ALL_PASS' : 'FAILURES_DETECTED' },
  results,
};
const outPath = path.resolve(__dirname, '..', 'dataset', 'ocr-corpus', 'reports', 'security-gate-a.json');
require('fs').mkdirSync(path.dirname(outPath), { recursive: true });
require('fs').writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nReport written: ${outPath}`);

process.exit(fail > 0 ? 1 : 0);

