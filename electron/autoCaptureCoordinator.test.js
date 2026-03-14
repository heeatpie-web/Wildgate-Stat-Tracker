import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  createAutoCaptureCoordinator,
  extractTacticalMapKeybindFromText,
  normalizeKeybindToSendKeys,
} = require('./autoCaptureCoordinator.cjs');

describe('autoCaptureCoordinator keybind parsing', () => {
  it('normalizes common send-keys tokens', () => {
    expect(normalizeKeybindToSendKeys('Tab')).toBe('{TAB}');
    expect(normalizeKeybindToSendKeys('M')).toBe('m');
    expect(normalizeKeybindToSendKeys('SpaceBar')).toBe(' ');
    expect(normalizeKeybindToSendKeys('Gamepad_FaceButton_Bottom')).toBeNull();
  });

  it('extracts tactical map bindings from UE-style action mappings', () => {
    const result = extractTacticalMapKeybindFromText(
      'ActionMappings=(ActionName="ToggleTacticalMap",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=Tab)'
    );

    expect(result).toEqual({
      raw: 'Tab',
      sendKeys: '{TAB}',
    });
  });
});

describe('autoCaptureCoordinator sequencing', () => {
  it('fails immediately when no active match is in progress', async () => {
    const notify = vi.fn();
    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence: vi.fn(),
      captureAndProcess: vi.fn(),
      lookupMapKeybind: vi.fn(),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({ lifecycleActive: false, matchId: null });

    expect(result).toEqual({
      started: false,
      reason: 'no-active-match',
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'failed',
      message: 'F10 Auto-Capture: No active match in progress.',
    }));
  });

  it('runs the full nine-step sequence and emits capture progress', async () => {
    const notify = vi.fn();
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map.png', filename: 'map.png' })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png' })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png' });
    const waits = [];
    const clock = { now: 1_000 };

    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence,
      captureAndProcess,
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn((ms) => {
        waits.push(ms);
        return Promise.resolve();
      }),
      now: () => clock.now,
    });

    const result = await coordinator.start({
      lifecycleActive: true,
      matchId: 44,
      activeUser: 'Pilot',
      autoCaptureWaitMultiplier: 2,
    });

    expect(result).toEqual({
      started: true,
      matchId: 44,
      tacticalMapKeybind: 'Tab',
    });

    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'completed',
        matchId: 44,
        totalCaptures: 3,
      }));
    });

    expect(sendKeySequence).toHaveBeenNthCalledWith(1, '{TAB}', 'Open Tactical Map');
    expect(sendKeySequence).toHaveBeenNthCalledWith(2, '{TAB}', 'Close Tactical Map');
    expect(sendKeySequence).toHaveBeenNthCalledWith(3, '{UP}{UP}{UP}{UP} ', 'Navigate to Crew Hub');
    expect(sendKeySequence).toHaveBeenNthCalledWith(4, '{RIGHT}{RIGHT}{RIGHT}{RIGHT}', 'Navigate to Crew Hub Panel (Right)');
    expect(sendKeySequence).toHaveBeenNthCalledWith(5, '{END}', 'Navigate to Crew Hub Panel End');
    expect(sendKeySequence).toHaveBeenNthCalledWith(6, '{ESC}', 'Exit');
    expect(captureAndProcess).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([2000, 600, 2400, 800, 800, 400]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'capture-progress',
      captureIndex: 1,
      filePath: 'map.png',
    }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'capture-progress',
      captureIndex: 3,
      filePath: 'crew-b.png',
    }));
  });

  it('silently ignores requests during cooldown', async () => {
    const notify = vi.fn();
    const clock = { now: 10_000 };
    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence: vi.fn().mockResolvedValue({ success: true }),
      captureAndProcess: vi.fn()
        .mockResolvedValue({ success: true, filePath: 'capture.png', filename: 'capture.png' }),
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn(() => Promise.resolve()),
      now: () => clock.now,
    });

    const first = await coordinator.start({ lifecycleActive: true, matchId: 9 });
    expect(first.started).toBe(true);

    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ phase: 'completed' }));
    });

    clock.now += 2_000;
    const second = await coordinator.start({ lifecycleActive: true, matchId: 9 });

    expect(second).toEqual({
      started: false,
      ignored: true,
      reason: 'cooldown',
    });
  });
});
