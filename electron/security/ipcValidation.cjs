/**
 * @module electron/security/ipcValidation
 * Shared IPC hardening helpers:
 * - structured error contracts
 * - path/url/payload validation
 * - scoped token registries for list-derived resource access
 */
const path = require('path');
const crypto = require('crypto');

const PATH_GUARDS_DISABLED = process.env.WILDGATE_SECURITY_DISABLE_PATH_GUARDS === '1';
const URL_ALLOWLIST_DISABLED = process.env.WILDGATE_SECURITY_DISABLE_URL_ALLOWLIST === '1';
const DEV_ARBITRARY_PATHS = process.env.WILDGATE_DEV_ALLOW_ARBITRARY_PATHS === '1';

const IpcErrorCode = Object.freeze({
  PATH_NOT_ALLOWED: 'PATH_NOT_ALLOWED',
  INVALID_INPUT: 'INVALID_INPUT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  NOT_FOUND: 'NOT_FOUND',
  URL_NOT_ALLOWED: 'URL_NOT_ALLOWED',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

function ok(data) {
  return { success: true, data };
}

function fail(code, message) {
  return { success: false, code, message };
}

function internal(message = 'Internal error') {
  return fail(IpcErrorCode.INTERNAL_ERROR, message);
}

function isPathWithinRoot(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath);
  return (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)));
}

function getPathGuardStatus(isDev) {
  if (PATH_GUARDS_DISABLED) return { bypass: true, reason: 'kill-switch' };
  if (isDev && DEV_ARBITRARY_PATHS) return { bypass: true, reason: 'dev-bypass' };
  return { bypass: false, reason: 'strict' };
}

function validatePathInRoots(inputPath, roots, opts = {}) {
  const { isDev = false } = opts;
  if (!inputPath || typeof inputPath !== 'string') {
    return fail(IpcErrorCode.INVALID_INPUT, 'Invalid path input');
  }

  const resolved = path.resolve(inputPath);
  const guard = getPathGuardStatus(isDev);
  if (guard.bypass) {
    return ok({ resolved, bypassReason: guard.reason });
  }

  const normalizedRoots = (Array.isArray(roots) ? roots : [])
    .filter(Boolean)
    .map(r => path.resolve(r));

  const allowed = normalizedRoots.some(root => isPathWithinRoot(resolved, root));
  if (!allowed) {
    return fail(IpcErrorCode.PATH_NOT_ALLOWED, 'Path not allowed');
  }
  return ok({ resolved, bypassReason: null });
}

function validateBasenameToken(value, label = 'value') {
  if (typeof value !== 'string') {
    return fail(IpcErrorCode.INVALID_INPUT, `Invalid ${label}`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return fail(IpcErrorCode.INVALID_INPUT, `Invalid ${label}`);
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return fail(IpcErrorCode.INVALID_INPUT, `Invalid ${label}`);
  }
  return ok(trimmed);
}

function validatePositiveInt(value, label = 'id') {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || n <= 0) {
    return fail(IpcErrorCode.INVALID_INPUT, `Invalid ${label}`);
  }
  return ok(n);
}

function estimateBase64DecodedBytes(base64) {
  if (typeof base64 !== 'string' || base64.length === 0) return 0;
  const len = base64.length;
  let padding = 0;
  if (base64.endsWith('==')) padding = 2;
  else if (base64.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

function validateBase64PayloadSize(base64, maxBytes, label = 'payload') {
  if (typeof base64 !== 'string') {
    return fail(IpcErrorCode.INVALID_INPUT, `Invalid ${label}`);
  }
  const decodedBytes = estimateBase64DecodedBytes(base64);
  if (decodedBytes > maxBytes) {
    return fail(IpcErrorCode.PAYLOAD_TOO_LARGE, `${label} exceeds allowed size`);
  }
  return ok(decodedBytes);
}

function validateBodySize(rawBody, maxBytes) {
  if (rawBody == null) return ok(0);
  let bodyStr = '';
  if (typeof rawBody === 'string') bodyStr = rawBody;
  else if (typeof rawBody === 'object') bodyStr = JSON.stringify(rawBody);
  else return fail(IpcErrorCode.INVALID_INPUT, 'Invalid request body type');

  const bytes = Buffer.byteLength(bodyStr, 'utf8');
  if (bytes > maxBytes) {
    return fail(IpcErrorCode.PAYLOAD_TOO_LARGE, 'Request body exceeds allowed size');
  }
  return ok(bytes);
}

function isAllowedHost(hostname, allowedHosts) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return Array.from(allowedHosts || []).some(allowed => {
    const normalized = String(allowed || '').toLowerCase().trim();
    if (!normalized) return false;
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

function validateHttpsUrlAllowlist(rawUrl, allowedHosts) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return fail(IpcErrorCode.INVALID_INPUT, 'Invalid URL');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return fail(IpcErrorCode.INVALID_INPUT, 'Malformed URL');
  }

  if (parsed.protocol !== 'https:') {
    return fail(IpcErrorCode.URL_NOT_ALLOWED, 'HTTPS required');
  }

  if (URL_ALLOWLIST_DISABLED) {
    return ok(parsed);
  }

  if (!isAllowedHost(parsed.hostname, allowedHosts)) {
    return fail(IpcErrorCode.URL_NOT_ALLOWED, 'Host not allowed');
  }
  return ok(parsed);
}

function validateAllowedExtension(filePath, allowedExtensions, label = 'file') {
  if (typeof filePath !== 'string' || !filePath) {
    return fail(IpcErrorCode.INVALID_INPUT, `Invalid ${label} path`);
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!(allowedExtensions instanceof Set) || !allowedExtensions.has(ext)) {
    return fail(IpcErrorCode.INVALID_INPUT, `Unsupported ${label} type`);
  }
  return ok(ext);
}

function createScopedTokenRegistry(opts = {}) {
  const ttlMs = Number(opts.ttlMs || 5 * 60 * 1000);
  const maxEntriesPerScope = Number(opts.maxEntriesPerScope || 5000);
  const scopes = new Map();

  function nowMs() {
    return Date.now();
  }

  function ensureScope(scopeId) {
    const sid = String(scopeId || '');
    if (!scopes.has(sid)) scopes.set(sid, new Map());
    return scopes.get(sid);
  }

  function cleanupScope(map) {
    const now = nowMs();
    for (const [token, entry] of map.entries()) {
      if (!entry || entry.expiresAt <= now) map.delete(token);
    }
    if (map.size <= maxEntriesPerScope) return;
    const sorted = [...map.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const removeCount = map.size - maxEntriesPerScope;
    for (let i = 0; i < removeCount; i++) {
      map.delete(sorted[i][0]);
    }
  }

  function issue(scopeId, value) {
    const map = ensureScope(scopeId);
    cleanupScope(map);
    const token = crypto.randomBytes(16).toString('hex');
    map.set(token, { value, expiresAt: nowMs() + ttlMs });
    return token;
  }

  function resolve(scopeId, token) {
    if (typeof token !== 'string' || !token.trim()) return null;
    const sid = String(scopeId || '');
    const map = scopes.get(sid);
    if (!map) return null;
    cleanupScope(map);
    const entry = map.get(token);
    if (!entry) return null;
    if (entry.expiresAt <= nowMs()) {
      map.delete(token);
      return null;
    }
    return entry.value;
  }

  function removeScope(scopeId) {
    scopes.delete(String(scopeId || ''));
  }

  function cleanupAll() {
    for (const map of scopes.values()) cleanupScope(map);
  }

  return { issue, resolve, removeScope, cleanupAll };
}

module.exports = {
  IpcErrorCode,
  ok,
  fail,
  internal,
  isPathWithinRoot,
  validatePathInRoots,
  validateBasenameToken,
  validatePositiveInt,
  estimateBase64DecodedBytes,
  validateBase64PayloadSize,
  validateBodySize,
  validateHttpsUrlAllowlist,
  validateAllowedExtension,
  createScopedTokenRegistry,
  PATH_GUARDS_DISABLED,
  URL_ALLOWLIST_DISABLED,
  DEV_ARBITRARY_PATHS,
};

