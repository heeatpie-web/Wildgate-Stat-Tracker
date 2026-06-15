import { createRequire } from 'node:module';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const {
  checkViGEmBusInstalled,
  connectVirtualGamepad,
  disconnectVirtualGamepad,
  isGamepadConnected,
  sendGamepadSequence,
  setPSRunner,
  setDllDir,
  buildButtonSequenceScript,
  buildCheckDriverScript,
  buildConnectScript,
  buildInstallDriverScript,
} = require('./gamepadInput.cjs');

describe('gamepadInput', () => {
  let mockPSRunner;

  beforeEach(async () => {
    mockPSRunner = vi.fn();
    setPSRunner(mockPSRunner);
    setDllDir('C:\\test\\vendor');
    await disconnectVirtualGamepad().catch(() => {});
  });

  describe('checkViGEmBusInstalled', () => {
    it('returns installed=true when PS reports driver found', async () => {
      mockPSRunner.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ installed: true, version: 'test-driver' }),
        stderr: '',
      });
      const result = await checkViGEmBusInstalled();
      expect(result.installed).toBe(true);
    });

    it('returns installed=false when PS reports driver not found', async () => {
      mockPSRunner.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ installed: false, version: '' }),
        stderr: '',
      });
      const result = await checkViGEmBusInstalled();
      expect(result.installed).toBe(false);
    });

    it('returns installed=false on PS failure', async () => {
      mockPSRunner.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'some error',
      });
      const result = await checkViGEmBusInstalled();
      expect(result.installed).toBe(false);
    });
  });

  describe('connectVirtualGamepad', () => {
    it('returns success when PS connect script succeeds', async () => {
      mockPSRunner.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ success: true }),
        stderr: '',
      });
      const result = await connectVirtualGamepad();
      expect(result.success).toBe(true);
      expect(isGamepadConnected()).toBe(true);
    });

    it('returns error when PS connect script fails', async () => {
      mockPSRunner.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ success: false, error: 'ViGEmBus not found' }),
        stderr: '',
      });
      const result = await connectVirtualGamepad();
      expect(result.success).toBe(false);
      expect(result.error).toContain('ViGEmBus');
    });

    it('returns alreadyConnected when called twice', async () => {
      mockPSRunner.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ success: true }),
        stderr: '',
      });
      await connectVirtualGamepad();
      const result = await connectVirtualGamepad();
      expect(result.success).toBe(true);
      expect(result.alreadyConnected).toBe(true);
    });

    it('fails when no DLL dir is configured', async () => {
      setDllDir('');
      const result = await connectVirtualGamepad();
      expect(result.success).toBe(false);
      expect(result.error).toContain('DLL directory');
    });
  });

  describe('sendGamepadSequence', () => {
    it('auto-connects and sends the sequence', async () => {
      mockPSRunner
        .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ success: true }), stderr: '' })
        .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ success: true, count: 2 }), stderr: '' });

      const result = await sendGamepadSequence([
        { button: 'DPAD_UP', flag: 0x0001, durationMs: 80, gapMs: 40 },
        { button: 'A', flag: 0x1000, durationMs: 80, gapMs: 40 },
      ]);
      expect(result.success).toBe(true);
    });

    it('returns error for empty actions', async () => {
      const result = await sendGamepadSequence([]);
      expect(result.success).toBe(false);
    });
  });

  describe('buildButtonSequenceScript', () => {
    it('generates PS script using managed SetButtonState API', () => {
      const script = buildButtonSequenceScript([
        { button: 'A', flag: 0x1000, durationMs: 80, gapMs: 40 },
      ]);
      expect(script).toContain("SetButtonState($global:vigemButtons['A'], $true)");
      expect(script).toContain('Start-Sleep -Milliseconds 80');
      expect(script).toContain("SetButtonState($global:vigemButtons['A'], $false)");
    });

    it('maps XUSB button names to managed API names', () => {
      const script = buildButtonSequenceScript([
        { button: 'DPAD_UP', flag: 0x0001, durationMs: 80, gapMs: 40 },
        { button: 'RIGHT_SHOULDER', flag: 0x0200, durationMs: 80, gapMs: 40 },
      ]);
      expect(script).toContain("vigemButtons['Up']");
      expect(script).toContain("vigemButtons['RightShoulder']");
    });

    it('generates press/release pairs for multi-action sequences', () => {
      const script = buildButtonSequenceScript([
        { button: 'DPAD_UP', flag: 0x0001, durationMs: 80, gapMs: 40 },
        { button: 'DPAD_UP', flag: 0x0001, durationMs: 80, gapMs: 40 },
        { button: 'A', flag: 0x1000, durationMs: 80, gapMs: 40 },
      ]);
      const pressCalls = (script.match(/\$true\)/g) || []).length;
      const releaseCalls = (script.match(/\$false\)/g) || []).length;
      expect(pressCalls).toBe(3);
      expect(releaseCalls).toBe(3);
    });

    it('checks for connected controller at script start', () => {
      const script = buildButtonSequenceScript([{ button: 'A', flag: 0x1000, durationMs: 80, gapMs: 40 }]);
      expect(script).toContain('$global:vigemController');
      expect(script).toContain('$global:vigemButtons');
    });
  });

  describe('buildCheckDriverScript', () => {
    it('generates a PS script that checks for the ViGEmBus service', () => {
      const script = buildCheckDriverScript();
      expect(script).toContain('ViGEmBus');
      expect(script).toContain('ConvertTo-Json');
    });
  });

  describe('buildConnectScript', () => {
    it('generates a PS script that loads the managed DLL and creates a controller', () => {
      const script = buildConnectScript();
      expect(script).toContain('LoadFrom');
      expect(script).toContain('Nefarius.ViGEm.Client.ViGEmClient');
      expect(script).toContain('CreateXbox360Controller');
      expect(script).toContain('AutoSubmitReport');
      expect(script).toContain('Connect');
      expect(script).toContain('$global:vigemController');
      expect(script).toContain('$global:vigemButtons');
    });

    it('reads DLL path from WILDGATE_VIGEM_DLL_PATH env var', () => {
      const script = buildConnectScript();
      expect(script).toContain('WILDGATE_VIGEM_DLL_PATH');
    });

    it('pre-caches Xbox360Button references for later use', () => {
      const script = buildConnectScript();
      expect(script).toContain('Xbox360Button');
      expect(script).toContain("'Up'");
      expect(script).toContain("'Start'");
      expect(script).toContain("'A'");
      expect(script).toContain("'B'");
      expect(script).toContain("'RightShoulder'");
    });

    it('returns early without exiting the persistent PowerShell host', () => {
      const script = buildConnectScript();
      expect(script).toContain('return');
      expect(script).not.toContain('exit 0');
    });
  });

  describe('persistent PowerShell compatibility', () => {
    it('uses return instead of exit in the installer helper script', () => {
      const script = buildInstallDriverScript();
      expect(script).toContain('return');
      expect(script).not.toContain('exit 0');
    });

    it('uses return instead of exit in the button sequence helper script', () => {
      const script = buildButtonSequenceScript([{ button: 'A', flag: 0x1000, durationMs: 80, gapMs: 40 }]);
      expect(script).toContain('  return');
      expect(script).not.toContain('exit 0');
    });
  });
});
