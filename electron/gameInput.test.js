import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { Key } = require('@nut-tree-fork/nut-js');
const {
  clearGameWindowCache,
  lookupGameWindowCandidate,
  lookupGameWindowGeometry,
  setPersistentPSRunner,
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

  it('translates the literal right-bracket key', () => {
    expect(translateSendKeysSequenceToNutKeys('m7]', Key)).toEqual([
      Key.M,
      Key.Num7,
      Key.RightBracket,
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
    setPersistentPSRunner(null);
  });

  afterEach(() => {
    clearGameWindowCache();
    setPersistentPSRunner(null);
    vi.useRealTimers();
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

  it('normalizes client-area geometry returned from the window lookup', async () => {
    setPersistentPSRunner(async (_script, env) => {
      if (env?.WILDGATE_GAME_WINDOW_HANDLE) {
        throw new Error('geometry refresh should not run for a fresh lookup');
      }
      return {
        code: 0,
        stdout: JSON.stringify({
          success: true,
          processName: 'WildgateClient',
          processId: 4242,
          windowTitle: 'Wildgate',
          windowHandle: 777,
          clientRect: {
            left: 101.2,
            top: 202.8,
            width: 1600.4,
            height: 900.6,
          },
          candidateSummary: 'WildgateClient#4242 [777] Wildgate',
        }),
        stderr: '',
      };
    });

    const result = await lookupGameWindowGeometry({
      processNames: [],
      titleHint: 'Wildgate',
      focusDelayMs: 0,
    });

    expect(result).toMatchObject({
      success: true,
      processName: 'WildgateClient',
      processId: 4242,
      windowHandle: 777,
      clientRect: {
        left: 101,
        top: 203,
        width: 1600,
        height: 901,
      },
      geometryAgeMs: expect.any(Number),
    });
  });

  it('reuses cached geometry for one second before refreshing by window handle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));

    const runner = vi.fn(async (_script, env) => {
      if (env?.WILDGATE_GAME_WINDOW_HANDLE) {
        return {
          code: 0,
          stdout: JSON.stringify({
            success: true,
            windowHandle: 777,
            clientRect: { left: 10, top: 20, width: 800, height: 600 },
          }),
          stderr: '',
        };
      }
      return {
        code: 0,
        stdout: JSON.stringify({
          success: true,
          processName: 'WildgateClient',
          processId: 4242,
          windowTitle: 'Wildgate',
          windowHandle: 777,
          clientRect: { left: 10, top: 20, width: 800, height: 600 },
          candidateSummary: 'WildgateClient#4242 [777] Wildgate',
        }),
        stderr: '',
      };
    });
    setPersistentPSRunner(runner);

    const first = await lookupGameWindowGeometry({ processNames: [], focusDelayMs: 0 });
    const second = await lookupGameWindowGeometry({ processNames: [], focusDelayMs: 0 });
    vi.advanceTimersByTime(1_100);
    const third = await lookupGameWindowGeometry({ processNames: [], focusDelayMs: 0 });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(true);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls[0][1]).not.toHaveProperty('WILDGATE_GAME_WINDOW_HANDLE');
    expect(runner.mock.calls[1][1]).toMatchObject({
      WILDGATE_GAME_WINDOW_HANDLE: '777',
    });
    expect(third.geometryAgeMs).toBe(0);
  });

  it('reuses stale geometry for up to two seconds when a refresh fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));

    const runner = vi.fn(async (_script, env) => {
      if (env?.WILDGATE_GAME_WINDOW_HANDLE) {
        return {
          code: 0,
          stdout: JSON.stringify({
            success: false,
            error: 'Game window geometry unavailable',
          }),
          stderr: '',
        };
      }
      return {
        code: 0,
        stdout: JSON.stringify({
          success: true,
          processName: 'WildgateClient',
          processId: 4242,
          windowTitle: 'Wildgate',
          windowHandle: 777,
          clientRect: { left: 10, top: 20, width: 800, height: 600 },
          candidateSummary: 'WildgateClient#4242 [777] Wildgate',
        }),
        stderr: '',
      };
    });
    setPersistentPSRunner(runner);

    await lookupGameWindowGeometry({ processNames: [], focusDelayMs: 0 });
    vi.advanceTimersByTime(1_500);
    const withinGrace = await lookupGameWindowGeometry({ processNames: [], focusDelayMs: 0 });
    vi.advanceTimersByTime(700);
    const beyondGrace = await lookupGameWindowGeometry({ processNames: [], focusDelayMs: 0 });

    expect(withinGrace).toMatchObject({
      success: true,
      geometryStale: true,
      geometryAgeMs: 1500,
      clientRect: { left: 10, top: 20, width: 800, height: 600 },
    });
    expect(beyondGrace).toMatchObject({
      success: false,
      error: 'Game window geometry unavailable',
    });
  });
});
