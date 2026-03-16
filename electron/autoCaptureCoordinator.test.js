import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const {
  createAutoCaptureCoordinator,
  extractTacticalMapKeybindFromText,
  normalizeKeybindToSendKeys,
} = require('./autoCaptureCoordinator.cjs');

describe('autoCaptureCoordinator keybind parsing', () => {
  it('normalizes common send-keys tokens', () => {
    expect(normalizeKeybindToSendKeys('Tab')).toBe('{TAB}');
    expect(normalizeKeybindToSendKeys('M')).toBe('m');
    expect(normalizeKeybindToSendKeys('KeyM')).toBe('m');
    expect(normalizeKeybindToSendKeys('Digit7')).toBe('7');
    expect(normalizeKeybindToSendKeys('ArrowUp')).toBe('{UP}');
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
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const waitForScreenType = vi.fn().mockResolvedValue({ success: true, detectedType: 'crew_hub' });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map.png', filename: 'map.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png', ocrData: { screenshotType: 'crew_hub' } });
    const waits = [];
    const clock = { now: 1_000 };

    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence,
      sendMenuKeySequence,
      waitForScreenType,
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
      autoCaptureTacticalMapKey: 'Tab',
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
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(1, '{ESC}', 'Navigate to Crew Hub');
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(2, '{UP}{UP}{UP}{UP}{SPACE}', 'Navigate to Crew Hub');
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(3, '{RIGHT}{RIGHT}{RIGHT}{RIGHT}', 'Navigate to Crew Hub Panel (Right)');
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(4, '{END}', 'Navigate to Crew Hub Panel End');
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(5, '{ESC}', 'Exit');
    expect(captureAndProcess).toHaveBeenCalledTimes(3);
    expect(waitForScreenType).toHaveBeenCalledWith('crew_hub', expect.any(Object));
    expect(waits).toEqual([200, 40, 50, 70, 20, 16, 20]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'capture-progress',
      captureIndex: 1,
      filePath: 'map.png',
      screenshotType: 'tactical_map',
    }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'capture-progress',
      captureIndex: 3,
      filePath: 'crew-b.png',
      screenshotType: 'crew_hub',
    }));
  });

  it('continues when the tactical-map pre-check fails but the saved screenshot OCR is correct', async () => {
    const notify = vi.fn();
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const waitForScreenType = vi.fn()
      .mockResolvedValueOnce({ success: false, detectedType: 'unknown', error: 'Timed out waiting for tactical_map.' })
      .mockResolvedValueOnce({ success: true, detectedType: 'crew_hub' });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map.png', filename: 'map.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'map-retry.png', filename: 'map-retry.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png', ocrData: { screenshotType: 'crew_hub' } });

    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence,
      sendMenuKeySequence,
      waitForScreenType,
      captureAndProcess,
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({
      lifecycleActive: true,
      matchId: 44,
      activeUser: 'Pilot',
      autoCaptureTacticalMapKey: 'Tab',
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

    expect(captureAndProcess).toHaveBeenCalledTimes(4);
    expect(waitForScreenType).toHaveBeenCalledTimes(2);
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(1, '{ESC}', 'Navigate to Crew Hub');
  });

  it('rolls back failed fast-path captures and emits progress only for the accepted fallback attempt', async () => {
    const notify = vi.fn();
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const waitForScreenType = vi.fn()
      .mockResolvedValueOnce({ success: false, detectedType: 'main_menu', error: 'wrong screen' })
      .mockResolvedValueOnce({ success: true, detectedType: 'crew_hub' });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map-fast.png', filename: 'map-fast.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'map-fallback.png', filename: 'map-fallback.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png', ocrData: { screenshotType: 'crew_hub' } });

    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence,
      sendMenuKeySequence,
      waitForScreenType,
      captureAndProcess,
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({
      lifecycleActive: true,
      matchId: 44,
      activeUser: 'Pilot',
      autoCaptureTacticalMapKey: 'Tab',
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

    const progressPayloads = notify.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload?.phase === 'capture-progress');
    const mapProgressPayloads = progressPayloads.filter((payload) => payload.captureIndex === 1);

    expect(progressPayloads).toHaveLength(3);
    expect(mapProgressPayloads).toHaveLength(1);
    expect(mapProgressPayloads[0]).toEqual(expect.objectContaining({
      filePath: 'map-fallback.png',
      screenshotType: 'tactical_map',
    }));
    expect(progressPayloads.some((payload) => payload.filePath === 'map-fast.png')).toBe(false);
    expect(unlinkSpy).toHaveBeenCalledWith('map-fast.png');

    unlinkSpy.mockRestore();
  });

  it('uses the held-key path when holdTacticalMapKey is true', async () => {
    const notify = vi.fn();
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const runWithHeldKeySequence = vi.fn(async (_sequence, _action, runWhileHeld) => {
      await runWhileHeld();
      return { success: true, focusConfirmed: true };
    });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map-held.png', filename: 'map-held.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png', ocrData: { screenshotType: 'crew_hub' } });

    const coordinator = createAutoCaptureCoordinator({
      notify,
      runWithHeldKeySequence,
      sendKeySequence,
      sendMenuKeySequence,
      captureAndProcess,
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'KeyM', sendKeys: 'm' }),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({
      lifecycleActive: true,
      matchId: 44,
      autoCaptureTacticalMapKey: 'KeyM',
      holdTacticalMapKey: true,
    });

    expect(result).toEqual({
      started: true,
      matchId: 44,
      tacticalMapKeybind: 'KeyM',
    });

    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'completed',
        matchId: 44,
        totalCaptures: 3,
      }));
    });

    expect(runWithHeldKeySequence).toHaveBeenCalledWith('m', 'Open Tactical Map', expect.any(Function));
    expect(sendKeySequence).not.toHaveBeenCalledWith('m', expect.anything());
    expect(sendMenuKeySequence).toHaveBeenCalledWith('{ESC}', 'Navigate to Crew Hub');
    expect(captureAndProcess).toHaveBeenCalledTimes(3);
  });

  it('fails when a saved screenshot OCR type does not match the expected screen', async () => {
    const notify = vi.fn();
    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence: vi.fn().mockResolvedValue({ success: true }),
      waitForScreenType: vi.fn()
        .mockResolvedValueOnce({ success: true, detectedType: 'tactical_map' })
        .mockResolvedValueOnce({ success: true, detectedType: 'crew_hub' }),
      captureAndProcess: vi.fn()
        .mockResolvedValueOnce({ success: true, filePath: 'map.png', filename: 'map.png', ocrData: { screenshotType: 'crew_hub' } })
        .mockResolvedValueOnce({ success: true, filePath: 'map-retry.png', filename: 'map-retry.png', ocrData: { screenshotType: 'crew_hub' } }),
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({ lifecycleActive: true, matchId: 44, autoCaptureTacticalMapKey: 'Tab' });
    expect(result).toEqual({
      started: true,
      matchId: 44,
      tacticalMapKeybind: 'Tab',
    });

    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'failed',
        message: 'Auto-Capture failed at Step 2 — Tactical Map (Primary View)',
        stepNumber: 2,
        stepLabel: 'Tactical Map (Primary View)',
        detail: 'Tactical Map (Primary View): expected tactical_map, detected crew_hub',
      }));
    });
  });

  it('fails immediately when the game window cannot be focused for the first keypress', async () => {
    const notify = vi.fn();
    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence: vi.fn().mockResolvedValue({
        success: false,
        error: 'Failed to confirm Wildgate focus before sending Open Tactical Map.',
      }),
      captureAndProcess: vi.fn(),
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({ lifecycleActive: true, matchId: 44, autoCaptureTacticalMapKey: 'Tab' });
    expect(result).toEqual({
      started: true,
      matchId: 44,
      tacticalMapKeybind: 'Tab',
    });

    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'failed',
        message: 'Auto-Capture failed at Step 1 — Open Tactical Map',
        stepNumber: 1,
        stepLabel: 'Open Tactical Map',
        detail: 'Open Tactical Map: Failed to confirm Wildgate focus before sending Open Tactical Map.',
      }));
    });
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

    const first = await coordinator.start({ lifecycleActive: true, matchId: 9, autoCaptureTacticalMapKey: 'Tab' });
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

  it('fails before starting when the tactical map key is missing from settings', async () => {
    const notify = vi.fn();
    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence: vi.fn(),
      captureAndProcess: vi.fn(),
      lookupMapKeybind: vi.fn(),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({
      lifecycleActive: true,
      matchId: 44,
      autoCaptureTacticalMapKey: '',
    });

    expect(result).toEqual({
      started: false,
      reason: 'missing-tactical-map-key',
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'failed',
      message: 'No tactical map key configured. Set it in Settings.',
    }));
  });
});
