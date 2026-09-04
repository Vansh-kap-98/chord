import type {
  Action,
  CaptureMode,
  CaptureResult,
  EngineStatus,
  FireLogEntry,
  InputEvent,
  Settings,
  Shortcut,
} from './types';

/** The recorder's drop target, in CSS pixels relative to the content area. */
export interface CaptureStageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureProgressPayload {
  mode: CaptureMode;
  held: string[];
  label: string;
  clicks: number;
  path: string[];
}

export interface AppSnapshot {
  settings: Settings;
  shortcuts: Shortcut[];
  status: EngineStatus;
  storePath: string;
  version: string;
}

/** Everything a caller must supply to create a shortcut; `pinned` defaults off. */
export type ShortcutDraft = Omit<
  Shortcut,
  'id' | 'createdAt' | 'lastFiredAt' | 'fireCount' | 'pinned'
> & { pinned?: boolean };

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** The full surface exposed to the renderer through the context bridge. */
export interface ShortcutApi {
  getSnapshot(): Promise<AppSnapshot>;

  addShortcut(draft: ShortcutDraft): Promise<Shortcut>;
  updateShortcut(id: string, patch: Partial<Shortcut>): Promise<Shortcut | null>;
  deleteShortcut(id: string): Promise<boolean>;

  setSettings(patch: Partial<Settings>): Promise<Settings>;
  setEngineEnabled(enabled: boolean): Promise<EngineStatus>;

  testAction(action: Action): Promise<ActionResult>;

  startCapture(mode: CaptureMode, stage?: CaptureStageRect): Promise<void>;
  commitCapture(): Promise<void>;
  cancelCapture(): Promise<void>;

  pickExecutable(): Promise<string | null>;
  pickPath(): Promise<string | null>;
  exportShortcuts(): Promise<ActionResult>;
  importShortcuts(): Promise<ActionResult>;
  revealStore(): Promise<void>;

  minimizeWindow(): Promise<void>;
  toggleMaximize(): Promise<boolean>;
  hideWindow(): Promise<void>;
  quitApp(): Promise<void>;

  onShortcuts(cb: (shortcuts: Shortcut[]) => void): () => void;
  onSettings(cb: (settings: Settings) => void): () => void;
  onStatus(cb: (status: EngineStatus) => void): () => void;
  onInput(cb: (events: InputEvent[]) => void): () => void;
  onFire(cb: (entry: FireLogEntry) => void): () => void;
  onCaptureProgress(cb: (progress: CaptureProgressPayload) => void): () => void;
  onCaptureResult(cb: (result: CaptureResult) => void): () => void;
}

/** Channel names, kept in one place so main and preload cannot drift apart. */
export const CH = {
  getSnapshot: 'app:getSnapshot',
  addShortcut: 'shortcut:add',
  updateShortcut: 'shortcut:update',
  deleteShortcut: 'shortcut:delete',
  setSettings: 'settings:set',
  setEngineEnabled: 'engine:setEnabled',
  testAction: 'action:test',
  startCapture: 'capture:start',
  commitCapture: 'capture:commit',
  cancelCapture: 'capture:cancel',
  pickExecutable: 'dialog:pickExecutable',
  pickPath: 'dialog:pickPath',
  exportShortcuts: 'data:export',
  importShortcuts: 'data:import',
  revealStore: 'data:reveal',
  minimizeWindow: 'win:minimize',
  toggleMaximize: 'win:toggleMaximize',
  hideWindow: 'win:hide',
  quitApp: 'win:quit',

  pushShortcuts: 'push:shortcuts',
  pushSettings: 'push:settings',
  pushStatus: 'push:status',
  pushInput: 'push:input',
  pushFire: 'push:fire',
  pushCaptureProgress: 'push:captureProgress',
  pushCaptureResult: 'push:captureResult',
} as const;
