import { createRequire } from 'node:module';
import { describe, expect, it, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const { Key } = require('@nut-tree-fork/nut-js');
const {
  clearGameWindowCache,
  lookupGameWindowCandidate,
  tokenizeSendKeysSequence,
  translateSendKeysSequenceToNutKeys,
} = require('./gameInput.cjs');

describe('gameInput send-keys translation', () => {
  it('tokenizes mixed brace and literal sequences', () => {
    expect(tokenizeSendKeysSequence('{UP}{UP}{UP}{UP} ')).toEqual([
      'UP',
      'UP',
      'UP',
      'UP',
      ' ',
    ]);
  });

  it('translates navigation sequences to nut.js keys', () => {
    expect(translateSendKeysSequenceToNutKeys('{RIGHT}{RIGHT}{END}', Key)).toEqual([
      Key.Right,
      Key.Right,
      Key.End,
    ]);
  });

  it('translates literal alpha-numeric keys', () => {
    expect(translateSendKeysSequenceToNutKeys('m7', Key)).toEqual([
      Key.M,
      Key.Num7,
    ]);
  });

  it('translates common single-key bindings', () => {
    expect(translateSendKeysSequenceToNutKeys('{TAB}', Key)).toEqual([Key.Tab]);
    expect(translateSendKeysSequenceToNutKeys('{ESC}', Key)).toEqual([Key.Escape]);
    expect(translateSendKeysSequenceToNutKeys(' ', Key)).toEqual([Key.Space]);
  });

  it('rejects unsupported tokens', () => {
    expect(() => translateSendKeysSequenceToNutKeys('{CTRL}', Key)).toThrow(/Unsupported named key token/i);
    expect(() => tokenizeSendKeysSequence('{UP')).toThrow(/Unterminated key token/i);
  });
});

describe('gameInput window candidate cache', () => {
  beforeEach(() => {
    clearGameWindowCache();
  });

  it('clearGameWindowCache is callable and does not throw', () => {
    expect(() => clearGameWindowCache()).not.toThrow();
  });

  it('lookupGameWindowCandidate returns failure on non-Windows without cache', async () => {
    if (process.platform === 'win32') return;
    const result = await lookupGameWindowCandidate({
      processNames: ['nonexistent-test-process'],
    });
    expect(result.success).toBe(false);
  });

  it('lookupGameWindowCandidate respects skipCache parameter', async () => {
    if (process.platform === 'win32') return;
    const result = await lookupGameWindowCandidate({
      processNames: ['nonexistent-test-process'],
      skipCache: true,
    });
    expect(result.success).toBe(false);
  });
});
