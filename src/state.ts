import { create } from 'zustand';
import type {
  Action,
  CaptureMode,
  EngineStatus,
  FireLogEntry,
  InputEvent,
  Settings,
  Shortcut,
  Trigger,
} from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import type { CaptureProgressPayload } from '@shared/ipc';

export type Page = 'shortcuts' | 'monitor' | 'activity' | 'settings';

export interface EditorDraft {
  id: string | null;
  name: string;
  enabled: boolean;
  trigger: Trigger | null;
  action: Action;
  cooldownMs: number;
}

export interface Toast {
  id: number;
  kind: 'ok' | 'err';
  message: string;
}

const MAX_EVENTS = 160;
const MAX_FIRES = 120;

export const DEFAULT_ACTION: Action = { kind: 'sendKeys', combo: '' };

interface AppState {
  ready: boolean;
  settings: Settings;
  shortcuts: Shortcut[];
  status: EngineStatus;
  storePath: string;
  version: string;

  page: Page;
  events: InputEvent[];
  held: string[];
  fires: FireLogEntry[];
  toasts: Toast[];
  /** Set briefly so the matching card can flash when its shortcut fires. */
  flashId: string | null;

  editor: EditorDraft | null;
  capture: { mode: CaptureMode; active: boolean; progress: CaptureProgressPayload | null };

  setPage(page: Page): void;
  openEditor(shortcut?: Shortcut): void;
  closeEditor(): void;
  patchEditor(patch: Partial<EditorDraft>): void;
  setCaptureMode(mode: CaptureMode): void;
  setCaptureActive(active: boolean): void;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;
  ingestEvents(batch: InputEvent[]): void;
  ingestFire(entry: FireLogEntry): void;
  clearFires(): void;
}

let toastSeq = 1;

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  shortcuts: [],
  status: {
    running: false,
    synthReady: false,
    synthError: null,
    eventsSeen: 0,
    startedAt: null,
  },
  storePath: '',
  version: '',

  page: 'shortcuts',
  events: [],
  held: [],
  fires: [],
  toasts: [],
  flashId: null,

  editor: null,
  capture: { mode: 'combo', active: false, progress: null },

  setPage: (page) => set({ page }),

  openEditor: (shortcut) =>
    set({
      editor: shortcut
        ? {
            id: shortcut.id,
            name: shortcut.name,
            enabled: shortcut.enabled,
            trigger: shortcut.trigger,
            action: shortcut.action,
            cooldownMs: shortcut.cooldownMs,
          }
        : {
            id: null,
            name: '',
            enabled: true,
            trigger: null,
            action: DEFAULT_ACTION,
            cooldownMs: 250,
          },
      capture: {
        mode: shortcut?.trigger.kind ?? 'combo',
        active: false,
        progress: null,
      },
    }),

  closeEditor: () =>
    set({ editor: null, capture: { mode: 'combo', active: false, progress: null } }),

  patchEditor: (patch) => {
    const editor = get().editor;
    if (!editor) return;
    set({ editor: { ...editor, ...patch } });
  },

  setCaptureMode: (mode) => set({ capture: { ...get().capture, mode, progress: null } }),

  setCaptureActive: (active) =>
    set({ capture: { ...get().capture, active, progress: active ? null : get().capture.progress } }),

  toast: (kind, message) => {
    const toast: Toast = { id: toastSeq++, kind, message };
    set({ toasts: [...get().toasts, toast] });
    setTimeout(() => get().dismissToast(toast.id), kind === 'err' ? 6000 : 3000);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  ingestEvents: (batch) => {
    const held = new Set(get().held);
    for (const e of batch) {
      if (e.type === 'keydown' || e.type === 'mousedown') held.add(e.token);
      if (e.type === 'keyup' || e.type === 'mouseup') held.delete(e.token);
    }
    // Newest first; the stream view reads top-down.
    const events = [...batch].reverse().concat(get().events).slice(0, MAX_EVENTS);
    set({ events, held: [...held] });
  },

  ingestFire: (entry) => {
    set({ fires: [entry, ...get().fires].slice(0, MAX_FIRES), flashId: entry.shortcutId });
    setTimeout(() => {
      if (get().flashId === entry.shortcutId) set({ flashId: null });
    }, 700);
    if (!entry.ok) get().toast('err', `${entry.shortcutName}: ${entry.error ?? 'failed'}`);
  },

  clearFires: () => set({ fires: [] }),
}));

/** Wires the main-process push channels into the store. Call once on mount. */
export function connect(): () => void {
  const api = window.shortcut;
  const set = useApp.setState;

  void api.getSnapshot().then((snapshot) => {
    set({
      ready: true,
      settings: snapshot.settings,
      shortcuts: snapshot.shortcuts,
      status: snapshot.status,
      storePath: snapshot.storePath,
      version: snapshot.version,
    });
  });

  const offs = [
    api.onShortcuts((shortcuts) => set({ shortcuts })),
    api.onSettings((settings) => set({ settings })),
    api.onStatus((status) => set({ status })),
    api.onInput((events) => useApp.getState().ingestEvents(events)),
    api.onFire((entry) => useApp.getState().ingestFire(entry)),
    api.onCaptureProgress((progress) =>
      set({ capture: { ...useApp.getState().capture, progress } }),
    ),
    api.onCaptureResult((result) => {
      useApp.getState().patchEditor({ trigger: result.trigger });
      set({ capture: { ...useApp.getState().capture, active: false, progress: null } });
    }),
  ];

  return () => offs.forEach((off) => off());
}
