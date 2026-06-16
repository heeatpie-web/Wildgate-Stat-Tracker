import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  XUSB_BUTTON,
  GAMEPAD_STEP_SEQUENCES,
  getGamepadActionsForStep,
} = require('./gamepadSequences.cjs');

describe('XUSB_BUTTON constants', () => {
  it('defines standard XInput button flags', () => {
    expect(XUSB_BUTTON.DPAD_UP).toBe(0x0001);
    expect(XUSB_BUTTON.A).toBe(0x1000);
    expect(XUSB_BUTTON.B).toBe(0x2000);
    expect(XUSB_BUTTON.START).toBe(0x0010);
    expect(XUSB_BUTTON.RIGHT_SHOULDER).toBe(0x0200);
  });
});

describe('GAMEPAD_STEP_SEQUENCES', () => {
  it('defines sequences for all menu navigation steps', () => {
    expect(GAMEPAD_STEP_SEQUENCES.openCrewHub_menu).toBeDefined();
    expect(GAMEPAD_STEP_SEQUENCES.openCrewHub_navigate).toBeDefined();
    expect(GAMEPAD_STEP_SEQUENCES.moveCrewHubRight).toBeDefined();
    expect(GAMEPAD_STEP_SEQUENCES.moveCrewHubEnd).toBeDefined();
    expect(GAMEPAD_STEP_SEQUENCES.exit).toBeDefined();
  });

  it('uses START to open the pause menu', () => {
    expect(GAMEPAD_STEP_SEQUENCES.openCrewHub_menu[0].button).toBe('START');
  });

  it('uses D-pad Up x3 then A to navigate to crew hub', () => {
    const seq = GAMEPAD_STEP_SEQUENCES.openCrewHub_navigate;
    expect(seq).toHaveLength(4);
    expect(seq.filter(a => a.button === 'DPAD_UP')).toHaveLength(3);
    expect(seq[3].button).toBe('A');
  });

  it('uses B to exit menus', () => {
    expect(GAMEPAD_STEP_SEQUENCES.exit[0].button).toBe('B');
  });

  it('uses DPAD_DOWN to jump to end panel', () => {
    expect(GAMEPAD_STEP_SEQUENCES.moveCrewHubEnd[0].button).toBe('DPAD_DOWN');
  });
});

describe('getGamepadActionsForStep', () => {
  it('returns openCrewHub_menu for ESC key sequence on crew hub step', () => {
    const step = { number: 4, label: 'Navigate to Crew Hub' };
    const result = getGamepadActionsForStep(step, '{ESC}');
    expect(result).toBe(GAMEPAD_STEP_SEQUENCES.openCrewHub_menu);
  });

  it('returns openCrewHub_navigate for non-ESC key sequence on crew hub step', () => {
    const step = { number: 4, label: 'Navigate to Crew Hub' };
    const result = getGamepadActionsForStep(step, '{UP}{UP}{UP}{SPACE}');
    expect(result).toBe(GAMEPAD_STEP_SEQUENCES.openCrewHub_navigate);
  });

  it('returns moveCrewHubRight for the panel right step', () => {
    const step = { number: 5, label: 'Navigate to Crew Hub Panel (Right)' };
    const result = getGamepadActionsForStep(step, '{RIGHT}{RIGHT}');
    expect(result).toBe(GAMEPAD_STEP_SEQUENCES.moveCrewHubRight);
  });

  it('returns moveCrewHubEnd for the panel end step', () => {
    const step = { number: 7, label: 'Navigate to Crew Hub Panel End' };
    const result = getGamepadActionsForStep(step, '{DOWN}');
    expect(result).toBe(GAMEPAD_STEP_SEQUENCES.moveCrewHubEnd);
  });

  it('returns exit for the exit step', () => {
    const step = { number: 9, label: 'Exit' };
    const result = getGamepadActionsForStep(step, '{ESC}');
    expect(result).toBe(GAMEPAD_STEP_SEQUENCES.exit);
  });

  it('returns null for steps without a gamepad mapping', () => {
    const step = { number: 1, label: 'Open Tactical Map' };
    expect(getGamepadActionsForStep(step, 'm')).toBeNull();
  });

  it('returns null for null/undefined step', () => {
    expect(getGamepadActionsForStep(null, '{ESC}')).toBeNull();
    expect(getGamepadActionsForStep(undefined, '{ESC}')).toBeNull();
  });

  it('every action has a valid XUSB flag', () => {
    for (const seq of Object.values(GAMEPAD_STEP_SEQUENCES)) {
      for (const action of seq) {
        expect(XUSB_BUTTON).toHaveProperty(action.button);
        expect(action.flag).toBe(XUSB_BUTTON[action.button]);
      }
    }
  });
});
