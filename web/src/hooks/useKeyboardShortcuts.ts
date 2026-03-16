import { useEffect } from 'react';

interface Shortcuts {
  onNewChat?: () => void;
  onToggleSidebar?: () => void;
  onToggleMonitor?: () => void;
  onFocusSearch?: () => void;
  onSwitchRole?: (index: number) => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'n') {
        e.preventDefault();
        shortcuts.onNewChat?.();
      } else if (ctrl && e.key === 'b') {
        e.preventDefault();
        shortcuts.onToggleSidebar?.();
      } else if (ctrl && e.key === 'j') {
        e.preventDefault();
        shortcuts.onToggleMonitor?.();
      } else if (ctrl && e.key === 'k') {
        e.preventDefault();
        shortcuts.onFocusSearch?.();
      } else if (ctrl && e.shiftKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        shortcuts.onSwitchRole?.(parseInt(e.key) - 1);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
