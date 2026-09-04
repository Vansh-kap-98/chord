import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Settings, type Shortcut } from '@shared/types';

interface Persisted {
  version: number;
  settings: Settings;
  shortcuts: Shortcut[];
}

const VERSION = 2;

type ShortcutInput = Omit<
  Shortcut,
  'id' | 'createdAt' | 'lastFiredAt' | 'fireCount' | 'pinned'
> & { pinned?: boolean };

function newShortcut(partial: ShortcutInput): Shortcut {
  return {
    ...partial,
    pinned: partial.pinned ?? false,
    id: randomUUID(),
    createdAt: Date.now(),
    lastFiredAt: null,
    fireCount: 0,
  };
}

/**
 * Shipped examples. The two that are on are deliberately obscure inputs that
 * no application already claims; the two that are off demonstrate the more
 * intrusive trigger types without surprising anyone on first launch.
 */
function starterShortcuts(): Shortcut[] {
  return [
    newShortcut({
      name: 'Double middle-click: play / pause',
      enabled: true,
      // Pinned so the tray menu is useful — and discoverable — on first run.
      pinned: true,
      trigger: {
        kind: 'multiclick',
        button: 'Mouse.Middle',
        count: 2,
        modifiers: [],
        windowMs: 400,
      },
      action: { kind: 'media', op: 'playPause' },
      cooldownMs: 300,
    }),
    newShortcut({
      name: 'Right Ctrl, then M: toggle mute',
      enabled: true,
      pinned: true,
      trigger: {
        kind: 'sequence',
        steps: [['Key.CtrlRight'], ['Key.M']],
        gapMs: 800,
      },
      action: { kind: 'media', op: 'mute' },
      cooldownMs: 300,
    }),
    newShortcut({
      name: 'Right-drag down then right: close window',
      enabled: false,
      trigger: {
        kind: 'gesture',
        button: 'Mouse.Right',
        path: ['down', 'right'],
        minDistance: 45,
      },
      action: { kind: 'window', op: 'close' },
      cooldownMs: 500,
    }),
    newShortcut({
      name: 'Triple-click: copy selection',
      enabled: false,
      trigger: {
        kind: 'multiclick',
        button: 'Mouse.Left',
        count: 3,
        modifiers: [],
        windowMs: 450,
      },
      action: { kind: 'sendKeys', combo: 'ctrl+c' },
      cooldownMs: 400,
    }),
  ];
}

function isShortcut(value: unknown): value is Shortcut {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<Shortcut>;
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.enabled === 'boolean' &&
    !!s.trigger &&
    typeof s.trigger === 'object' &&
    !!s.action &&
    typeof s.action === 'object'
  );
}

/** Flat JSON file in the per-user app data directory. */
export class Store {
  private readonly file: string;
  private data: Persisted;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.file = path.join(app.getPath('userData'), 'shortcuts.json');
    this.data = this.load();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  get shortcuts(): Shortcut[] {
    return this.data.shortcuts;
  }

  get filePath(): string {
    return this.file;
  }

  private load(): Persisted {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Persisted>;
      const settings: Settings = {
        // Merge so settings added in a later version get their defaults.
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
      };

      // v2 changed what `accent` means: it used to be a decorative brand
      // colour, it is now the colour the app wears *while listening* (paused
      // is always amber). Accents saved under the old meaning were defaults
      // nobody chose, so they are reset rather than carried forward.
      if ((parsed.version ?? 1) < 2) {
        settings.accent = DEFAULT_SETTINGS.accent;
      }

      return {
        version: VERSION,
        settings,
        shortcuts: Array.isArray(parsed.shortcuts)
          ? // `pinned` arrived after some records were written; default it off.
            parsed.shortcuts.filter(isShortcut).map((s) => ({ ...s, pinned: s.pinned ?? false }))
          : [],
      };
    } catch {
      // Missing or corrupt: start fresh with the examples.
      return { version: VERSION, settings: { ...DEFAULT_SETTINGS }, shortcuts: starterShortcuts() };
    }
  }

  /** Debounced so a burst of edits costs one disk write. */
  private schedule(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 250);
  }

  flush(): void {
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file); // Atomic: never leave a half-written file.
    } catch {
      // Disk problems must not take the app down; settings simply do not persist.
    }
  }

  setSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch };
    this.schedule();
    return this.data.settings;
  }

  addShortcut(input: ShortcutInput): Shortcut {
    const created = newShortcut(input);
    this.data.shortcuts.push(created);
    this.schedule();
    return created;
  }

  updateShortcut(id: string, patch: Partial<Shortcut>): Shortcut | null {
    const index = this.data.shortcuts.findIndex((s) => s.id === id);
    if (index < 0) return null;
    const merged = { ...this.data.shortcuts[index], ...patch, id };
    this.data.shortcuts[index] = merged;
    this.schedule();
    return merged;
  }

  deleteShortcut(id: string): boolean {
    const before = this.data.shortcuts.length;
    this.data.shortcuts = this.data.shortcuts.filter((s) => s.id !== id);
    if (this.data.shortcuts.length === before) return false;
    this.schedule();
    return true;
  }

  recordFire(id: string): void {
    const s = this.data.shortcuts.find((x) => x.id === id);
    if (!s) return;
    s.lastFiredAt = Date.now();
    s.fireCount += 1;
    this.schedule();
  }

  replaceAll(shortcuts: Shortcut[]): void {
    this.data.shortcuts = shortcuts.filter(isShortcut);
    this.schedule();
  }
}
