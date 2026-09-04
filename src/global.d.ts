import type { ShortcutApi } from '@shared/ipc';

declare global {
  interface Window {
    shortcut: ShortcutApi;
  }
}

export {};
