'use strict';

const XUSB_BUTTON = Object.freeze({
  DPAD_UP: 0x0001,
  DPAD_DOWN: 0x0002,
  DPAD_LEFT: 0x0004,
  DPAD_RIGHT: 0x0008,
  START: 0x0010,
  BACK: 0x0020,
  LEFT_THUMB: 0x0040,
  RIGHT_THUMB: 0x0080,
  LEFT_SHOULDER: 0x0100,
  RIGHT_SHOULDER: 0x0200,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
});

const DEFAULT_PRESS_MS = 80;
const DEFAULT_GAP_MS = 40;

function btn(name, durationMs = DEFAULT_PRESS_MS, gapMs = DEFAULT_GAP_MS) {
  const flag = XUSB_BUTTON[name];
  if (flag == null) throw new Error(`Unknown XUSB button: ${name}`);
  return { button: name, flag, durationMs, gapMs };
}

function repeat(action, count) {
  return Array.from({ length: count }, () => ({ ...action }));
}

const GAMEPAD_STEP_SEQUENCES = Object.freeze({
  openCrewHub_menu: Object.freeze([
    btn('START'),
  ]),

  openCrewHub_navigate: Object.freeze([
    ...repeat(btn('DPAD_UP'), 3),
    btn('A'),
  ]),

  moveCrewHubRight: Object.freeze([
    ...repeat(btn('DPAD_RIGHT'), 2),
  ]),

  moveCrewHubEnd: Object.freeze([
    btn('DPAD_DOWN'),
  ]),

  exit: Object.freeze([
    btn('B'),
  ]),
});

const STEP_LABEL_TO_SEQUENCE_KEY = Object.freeze({
  'Navigate to Crew Hub': null,
  'Navigate to Crew Hub Panel (Right)': 'moveCrewHubRight',
  'Navigate to Crew Hub Panel End': 'moveCrewHubEnd',
  'Exit': 'exit',
});

function expandCustomConfig(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const actions = [];
  for (const step of steps) {
    if (!step || !step.button || !XUSB_BUTTON[step.button]) continue;
    const count = Math.max(1, Math.min(10, Number(step.count) || 1));
    for (let i = 0; i < count; i++) {
      actions.push(btn(step.button));
    }
  }
  return actions.length > 0 ? actions : null;
}

const CUSTOM_CONFIG_KEY_MAP = Object.freeze({
  openCrewHub_menu: 'openMenu',
  openCrewHub_navigate: 'navigate',
  moveCrewHubRight: 'moveRight',
  moveCrewHubEnd: 'moveEnd',
  exit: 'exit',
});

function getGamepadActionsForStep(step, keySequence, customConfig) {
  if (!step || !step.label) return null;

  if (step.label === 'Navigate to Crew Hub') {
    const isMenuOpen = String(keySequence || '').includes('{ESC}')
      || String(keySequence || '').includes('{Escape}');
    const configKey = isMenuOpen ? 'openMenu' : 'navigate';
    if (customConfig && Array.isArray(customConfig[configKey])) {
      const custom = expandCustomConfig(customConfig[configKey]);
      if (custom) return custom;
    }
    return isMenuOpen
      ? GAMEPAD_STEP_SEQUENCES.openCrewHub_menu
      : GAMEPAD_STEP_SEQUENCES.openCrewHub_navigate;
  }

  const key = STEP_LABEL_TO_SEQUENCE_KEY[step.label];
  if (key) {
    const configKey = CUSTOM_CONFIG_KEY_MAP[key];
    if (customConfig && configKey && Array.isArray(customConfig[configKey])) {
      const custom = expandCustomConfig(customConfig[configKey]);
      if (custom) return custom;
    }
    if (GAMEPAD_STEP_SEQUENCES[key]) {
      return GAMEPAD_STEP_SEQUENCES[key];
    }
  }

  return null;
}

module.exports = {
  DEFAULT_GAP_MS,
  DEFAULT_PRESS_MS,
  GAMEPAD_STEP_SEQUENCES,
  XUSB_BUTTON,
  getGamepadActionsForStep,
};
