import { useEffect } from 'react';

interface LegacyResultShortcuts {
  onWin: () => void;
  onLoss: () => void;
}

export interface ShortcutBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (event: KeyboardEvent) => void;
}

const keyMatches = (eventKey: string, targetKey: string): boolean => {
  if (targetKey.length === 1) {
    return eventKey.toLowerCase() === targetKey.toLowerCase();
  }
  return eventKey === targetKey;
};

const modifierMatches = (expected: boolean | undefined, actual: boolean): boolean => (
  expected == null ? true : expected === actual
);

const toLegacyBindings = (handlers: LegacyResultShortcuts): ShortcutBinding[] => ([
  { key: 'Enter', ctrl: true, shift: false, handler: () => handlers.onWin() },
  { key: 'Enter', ctrl: true, shift: true, handler: () => handlers.onLoss() },
]);

export function useKeyboardShortcuts(
  handlers: LegacyResultShortcuts,
  showWizard: boolean | string | null
): void;
export function useKeyboardShortcuts(
  shortcuts: ShortcutBinding[],
  enabled: boolean
): void;
export function useKeyboardShortcuts(
  input: LegacyResultShortcuts | ShortcutBinding[],
  enabledOrShowWizard: boolean | string | null
): void {
  const legacyMode = !Array.isArray(input);
  const shortcuts = legacyMode ? toLegacyBindings(input) : input;
  const enabled = legacyMode ? !enabledOrShowWizard : Boolean(enabledOrShowWizard);

  useEffect(() => {
    if (!enabled || shortcuts.length === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      for (const shortcut of shortcuts) {
        if (!keyMatches(event.key, shortcut.key)) continue;
        if (!modifierMatches(shortcut.ctrl, ctrlOrMeta)) continue;
        if (!modifierMatches(shortcut.shift, event.shiftKey)) continue;
        if (!modifierMatches(shortcut.alt, event.altKey)) continue;
        event.preventDefault();
        shortcut.handler(event);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, shortcuts]);
}
