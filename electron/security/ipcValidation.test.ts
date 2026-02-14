import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const MODULE_PATH = require.resolve('./ipcValidation.cjs');
const ENV_KEYS = [
  'WILDGATE_SECURITY_DISABLE_PATH_GUARDS',
  'WILDGATE_SECURITY_DISABLE_URL_ALLOWLIST',
  'WILDGATE_DEV_ALLOW_ARBITRARY_PATHS',
] as const;

let savedEnv: Record<string, string | undefined> = {};
let validation: any = null;

beforeAll(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  delete require.cache[MODULE_PATH];
  validation = require('./ipcValidation.cjs');
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] == null) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  delete require.cache[MODULE_PATH];
});

describe('ipcValidation', () => {
  it('rejects paths outside allowed roots', () => {
    const root = 'C:/allowed/root';
    const blocked = 'C:/not-allowed/file.txt';
    const result = validation.validatePathInRoots(blocked, [root], { isDev: false });
    expect(result.success).toBe(false);
    expect(result.code).toBe(validation.IpcErrorCode.PATH_NOT_ALLOWED);
  });

  it('accepts paths contained within allowed roots', () => {
    const root = 'C:/allowed/root';
    const inside = `${root}/nested/file.txt`;
    const result = validation.validatePathInRoots(inside, [root], { isDev: false });
    expect(result.success).toBe(true);
    expect(result.data.resolved.toLowerCase()).toContain('allowed');
  });

  it('rejects unsupported extensions', () => {
    const result = validation.validateAllowedExtension('C:/tmp/file.exe', new Set(['.png', '.jpg']));
    expect(result.success).toBe(false);
    expect(result.code).toBe(validation.IpcErrorCode.INVALID_INPUT);
  });

  it('rejects oversized base64 payloads', () => {
    const payload = Buffer.alloc(8, 0xff).toString('base64');
    const result = validation.validateBase64PayloadSize(payload, 4, 'payload');
    expect(result.success).toBe(false);
    expect(result.code).toBe(validation.IpcErrorCode.PAYLOAD_TOO_LARGE);
  });

  it('enforces https + host allowlist', () => {
    const httpResult = validation.validateHttpsUrlAllowlist('http://example.com', new Set(['example.com']));
    expect(httpResult.success).toBe(false);
    expect(httpResult.code).toBe(validation.IpcErrorCode.URL_NOT_ALLOWED);

    const hostResult = validation.validateHttpsUrlAllowlist('https://blocked.example.com', new Set(['allowed.example.com']));
    expect(hostResult.success).toBe(false);
    expect(hostResult.code).toBe(validation.IpcErrorCode.URL_NOT_ALLOWED);
  });

  it('scoped token registry rejects stale tokens', async () => {
    const registry = validation.createScopedTokenRegistry({ ttlMs: 5, maxEntriesPerScope: 10 });
    const token = registry.issue('scope-a', { id: 123 });
    expect(registry.resolve('scope-a', token)).toEqual({ id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(registry.resolve('scope-a', token)).toBeNull();
  });
});
