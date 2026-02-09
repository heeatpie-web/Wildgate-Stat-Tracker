/**
 * @module useKeyboardShortcuts
 * Global keyboard shortcut handler. Currently supports Ctrl/Cmd+Enter (Win) and
 * Ctrl/Cmd+Shift+Enter (Loss) for rapid match result entry. Disabled when a wizard modal is open.
 */
import { useEffect } from 'react';

export const useKeyboardShortcuts = (handlers: { onWin: () => void, onLoss: () => void }, showWizard: boolean | string | null) => {
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              if (showWizard) return; 
              e.preventDefault();
              if (e.shiftKey) handlers.onLoss();
              else handlers.onWin();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers, showWizard]);
};
