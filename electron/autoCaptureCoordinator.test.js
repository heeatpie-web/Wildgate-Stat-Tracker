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
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(2, '{UP}{UP}{UP}{SPACE}', 'Navigate to Crew Hub');
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(3, '{RIGHT}{RIGHT}', 'Navigate to Crew Hub Panel (Right)');
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(4, '{DOWN}', 'Navigate to Crew Hub Panel End');
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(5, '{ESC}', 'Exit');
    expect(captureAndProcess).toHaveBeenCalledTimes(3);
    expect(captureAndProcess).toHaveBeenNthCalledWith(1, expect.objectContaining({
      matchId: 44,
      activeUser: 'Pilot',
      screenshotTypeHint: 'tactical_map',
    }));
    expect(captureAndProcess).toHaveBeenNthCalledWith(2, expect.objectContaining({
      matchId: 44,
      activeUser: 'Pilot',
      screenshotTypeHint: 'crew_hub',
    }));
    expect(captureAndProcess).toHaveBeenNthCalledWith(3, expect.objectContaining({
      matchId: 44,
      activeUser: 'Pilot',
      screenshotTypeHint: 'crew_hub',
    }));
    expect(waits).toEqual([140, 20, 50, 60, 20, 16, 20]);
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

  it('completes without gating on captured OCR screen types', async () => {
    const notify = vi.fn();
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map.png', filename: 'map.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png', ocrData: { screenshotType: 'main_menu' } });

    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence,
      sendMenuKeySequence,
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

    expect(captureAndProcess).toHaveBeenCalledTimes(3);
    expect(captureAndProcess).toHaveBeenNthCalledWith(1, expect.objectContaining({
      matchId: 44,
      activeUser: 'Pilot',
      screenshotTypeHint: 'tactical_map',
    }));
    expect(captureAndProcess).toHaveBeenNthCalledWith(2, expect.objectContaining({
      matchId: 44,
      activeUser: 'Pilot',
      screenshotTypeHint: 'crew_hub',
    }));
    expect(sendMenuKeySequence).toHaveBeenNthCalledWith(1, '{ESC}', 'Navigate to Crew Hub');
  });

  it('skips tactical map key lookup when sendKeypresses is disabled', async () => {
    const notify = vi.fn();
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map.png', filename: 'map.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png', ocrData: { screenshotType: 'crew_hub' } });
    const lookupMapKeybind = vi.fn();

    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence,
      sendMenuKeySequence,
      captureAndProcess,
      lookupMapKeybind,
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({
      lifecycleActive: true,
      matchId: 44,
      activeUser: 'Pilot',
      autoCaptureSendKeypresses: false,
    });

    expect(result).toEqual({
      started: true,
      matchId: 44,
      tacticalMapKeybind: null,
    });

    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'completed',
        matchId: 44,
        totalCaptures: 3,
      }));
    });

    expect(lookupMapKeybind).not.toHaveBeenCalled();
    expect(sendKeySequence).not.toHaveBeenCalled();
    expect(sendMenuKeySequence).not.toHaveBeenCalled();
    expect(captureAndProcess).toHaveBeenCalledTimes(3);
  });

  it('rolls back partial captures when a crew hub capture fails', async () => {
    const notify = vi.fn();
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map-fast.png', filename: 'map-fast.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: false, error: 'capture failed' });

    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence,
      sendMenuKeySequence,
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
        phase: 'failed',
        message: 'Auto-Capture failed at Step 8 — Crew Hub Panel B',
        stepNumber: 8,
        stepLabel: 'Crew Hub Panel B',
        detail: 'Crew Hub Panel B: capture failed',
      }));
    });

    const progressPayloads = notify.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload?.phase === 'capture-progress');

    expect(progressPayloads).toHaveLength(0);
    expect(unlinkSpy).toHaveBeenCalledWith('map-fast.png');
    expect(unlinkSpy).toHaveBeenCalledWith('crew-a.png');
    expect(unlinkSpy).not.toHaveBeenCalledWith('crew-b.png');

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

  it('runs sequence lifecycle hooks around the capture flow', async () => {
    const notify = vi.fn();
    const beforeSequence = vi.fn(() => Promise.resolve());
    const afterSequence = vi.fn(() => Promise.resolve());
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map.png', filename: 'map.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png', ocrData: { screenshotType: 'crew_hub' } });

    const coordinator = createAutoCaptureCoordinator({
      notify,
      beforeSequence,
      afterSequence,
      sendKeySequence,
      sendMenuKeySequence,
      captureAndProcess,
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({
      lifecycleActive: true,
      matchId: 44,
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
      }));
    });

    expect(beforeSequence).toHaveBeenCalledTimes(1);
    expect(afterSequence).toHaveBeenCalledTimes(1);
    expect(beforeSequence.mock.invocationCallOrder[0]).toBeLessThan(captureAndProcess.mock.invocationCallOrder[0]);
    expect(afterSequence.mock.invocationCallOrder[0]).toBeGreaterThan(captureAndProcess.mock.invocationCallOrder.at(-1));
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

  it('allows immediate retry after a completed run', async () => {
    const notify = vi.fn();
    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence: vi.fn().mockResolvedValue({ success: true }),
      captureAndProcess: vi.fn()
        .mockResolvedValue({ success: true, filePath: 'capture.png', filename: 'capture.png' }),
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const first = await coordinator.start({ lifecycleActive: true, matchId: 9, autoCaptureTacticalMapKey: 'Tab' });
    expect(first.started).toBe(true);

    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ phase: 'completed' }));
    });

    const second = await coordinator.start({ lifecycleActive: true, matchId: 9 });

    expect(second).toEqual({
      started: true,
      matchId: 9,
      tacticalMapKeybind: 'Tab',
    });
  });

  it('routes menu steps through sendGamepadSequence when gamepad mode is enabled', async () => {
    const notify = vi.fn();
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendGamepadSequence = vi.fn().mockResolvedValue({ success: true });
    const prepareGamepadSequence = vi.fn().mockResolvedValue({ success: true });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map.png', filename: 'map.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png', ocrData: { screenshotType: 'crew_hub' } });

    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence,
      sendMenuKeySequence,
      sendGamepadSequence,
      prepareGamepadSequence,
      captureAndProcess,
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    const result = await coordinator.start({
      lifecycleActive: true,
      matchId: 44,
      activeUser: 'Pilot',
      autoCaptureTacticalMapKey: 'Tab',
      gamepadModeEnabled: true,
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

    // Tactical map steps still use keyboard (not menu navigation)
    expect(sendKeySequence).toHaveBeenCalledWith('{TAB}', 'Open Tactical Map');
    expect(sendKeySequence).toHaveBeenCalledWith('{TAB}', 'Close Tactical Map');

    // Menu steps use gamepad, including open and exit
    expect(sendMenuKeySequence).not.toHaveBeenCalled();

    // Navigation steps use gamepad
    expect(prepareGamepadSequence).toHaveBeenCalledTimes(1);
    expect(sendGamepadSequence).toHaveBeenCalledTimes(5);
    expect(sendGamepadSequence).toHaveBeenNthCalledWith(1, expect.objectContaining({ label: 'Navigate to Crew Hub' }), '{ESC}', null);
    expect(sendGamepadSequence).toHaveBeenNthCalledWith(2, expect.objectContaining({ label: 'Navigate to Crew Hub' }), '{UP}{UP}{UP}{SPACE}', null);
    expect(sendGamepadSequence).toHaveBeenNthCalledWith(3, expect.objectContaining({ label: 'Navigate to Crew Hub Panel (Right)' }), '{RIGHT}{RIGHT}', null);
    expect(sendGamepadSequence).toHaveBeenNthCalledWith(4, expect.objectContaining({ label: 'Navigate to Crew Hub Panel End' }), '{DOWN}', null);
    expect(sendGamepadSequence).toHaveBeenNthCalledWith(5, expect.objectContaining({ label: 'Exit' }), '{ESC}', null);
    expect(captureAndProcess).toHaveBeenCalledTimes(3);
  });

  it('uses keyboard for menu steps when gamepad mode is disabled even if sendGamepadSequence is provided', async () => {
    const notify = vi.fn();
    const sendKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendMenuKeySequence = vi.fn().mockResolvedValue({ success: true });
    const sendGamepadSequence = vi.fn().mockResolvedValue({ success: true });
    const captureAndProcess = vi.fn()
      .mockResolvedValueOnce({ success: true, filePath: 'map.png', filename: 'map.png', ocrData: { screenshotType: 'tactical_map' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-a.png', filename: 'crew-a.png', ocrData: { screenshotType: 'crew_hub' } })
      .mockResolvedValueOnce({ success: true, filePath: 'crew-b.png', filename: 'crew-b.png', ocrData: { screenshotType: 'crew_hub' } });

    const coordinator = createAutoCaptureCoordinator({
      notify,
      sendKeySequence,
      sendMenuKeySequence,
      sendGamepadSequence,
      captureAndProcess,
      lookupMapKeybind: vi.fn().mockResolvedValue({ raw: 'Tab', sendKeys: '{TAB}' }),
      delayFn: vi.fn(() => Promise.resolve()),
    });

    await coordinator.start({
      lifecycleActive: true,
      matchId: 44,
      autoCaptureTacticalMapKey: 'Tab',
      gamepadModeEnabled: false,
    });

    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ phase: 'completed' }));
    });

    expect(sendGamepadSequence).not.toHaveBeenCalled();
    expect(sendMenuKeySequence).toHaveBeenCalledTimes(5);
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
