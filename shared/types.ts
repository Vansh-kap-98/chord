/**
 * Shared data model. Imported by both the Electron main process and the
 * renderer, so it must stay free of any runtime dependency on either.
 */

/**
 * Canonical name for one physical input. Keyboard keys are `Key.*`, mouse
 * buttons `Mouse.*`, wheel notches `Wheel.*`. These strings are what gets
 * persisted, so they must stay stable across versions.
 */
export type Token = string;

export type Direction = 'up' | 'down' | 'left' | 'right';

export type TriggerKind = 'combo' | 'sequence' | 'multiclick' | 'gesture';

/** Every listed token held down at the same time. */
export interface ComboTrigger {
  kind: 'combo';
  tokens: Token[];
}

/**
 * Tokens pressed one after another, each within `gapMs` of the previous.
 * A step holds more than one token when that step is itself a chord.
 */
export interface SequenceTrigger {
  kind: 'sequence';
  steps: Token[][];
  gapMs: number;
}

/** N clicks of one button inside `windowMs`, optionally with modifiers held. */
export interface MultiClickTrigger {
  kind: 'multiclick';
  button: Token;
  count: number;
  modifiers: Token[];
  windowMs: number;
}

/** Hold a button and stroke the mouse through a series of directions. */
export interface GestureTrigger {
  kind: 'gesture';
  button: Token;
  path: Direction[];
  minDistance: number;
}

export type Trigger =
  | ComboTrigger
  | SequenceTrigger
  | MultiClickTrigger
  | GestureTrigger;

export type ActionKind =
  | 'sendKeys'
  | 'typeText'
  | 'launch'
  | 'openPath'
  | 'openUrl'
  | 'runCommand'
  | 'media'
  | 'window'
  | 'system';

export type MediaOp =
  | 'volumeUp'
  | 'volumeDown'
  | 'mute'
  | 'playPause'
  | 'nextTrack'
  | 'prevTrack'
  | 'stop';

export type WindowOp = 'minimize' | 'maximize' | 'restore' | 'close';

export type SystemOp = 'lock' | 'showDesktop' | 'taskView' | 'screenshot';

export type Action =
  /** Press a hotkey in the foreground app, e.g. "ctrl+shift+t". */
  | { kind: 'sendKeys'; combo: string }
  /** Type a literal string, Unicode included. */
  | { kind: 'typeText'; text: string }
  /** Start an executable. */
  | { kind: 'launch'; target: string; args: string }
  /** Open a file or folder with its default handler. */
  | { kind: 'openPath'; path: string }
  | { kind: 'openUrl'; url: string }
  | { kind: 'runCommand'; command: string; shell: 'cmd' | 'powershell' }
  | { kind: 'media'; op: MediaOp }
  | { kind: 'window'; op: WindowOp }
  | { kind: 'system'; op: SystemOp };

export interface Shortcut {
  id: string;
  name: string;
  enabled: boolean;
  /** Listed in the tray menu, where it can be switched on and off directly. */
  pinned: boolean;
  trigger: Trigger;
  action: Action;
  /** Milliseconds during which the same shortcut refuses to re-fire. */
  cooldownMs: number;
  createdAt: number;
  lastFiredAt: number | null;
  fireCount: number;
}

export interface Settings {
  /** Register the app to launch when Windows starts. */
  autoStart: boolean;
  /** When auto-started, go straight to the tray without showing a window. */
  startMinimized: boolean;
  /** Master switch for the capture engine. */
  engineEnabled: boolean;
  /** Closing the window hides it instead of quitting. */
  minimizeToTray: boolean;
  /** Defaults offered by the recorder for new triggers. */
  defaultSequenceGapMs: number;
  defaultMultiClickWindowMs: number;
  /** Ignore hook events for this long after we synthesize input ourselves. */
  echoGuardMs: number;
  showNotifications: boolean;
  accent: string;
}

export const DEFAULT_SETTINGS: Settings = {
  autoStart: false,
  startMinimized: true,
  engineEnabled: true,
  minimizeToTray: true,
  defaultSequenceGapMs: 800,
  defaultMultiClickWindowMs: 400,
  echoGuardMs: 250,
  showNotifications: true,
  /** The listening colour; paused is always amber. See src/theme.ts. */
  accent: '#3fb950',
};

/** One line in the live input monitor. */
export interface InputEvent {
  id: number;
  at: number;
  type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'wheel';
  token: Token;
  label: string;
  /** Click ordinal for mouse events, wheel notch count otherwise. */
  clicks?: number;
}

/** One line in the fired-shortcut log. */
export interface FireLogEntry {
  id: number;
  at: number;
  shortcutId: string;
  shortcutName: string;
  triggerLabel: string;
  actionLabel: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
}

export interface EngineStatus {
  running: boolean;
  /** Whether the input-synthesis sidecar has finished warming up. */
  synthReady: boolean;
  synthError: string | null;
  eventsSeen: number;
  startedAt: number | null;
}

export type CaptureMode = TriggerKind;

/** Payload the recorder sends back once it has resolved a trigger. */
export interface CaptureResult {
  trigger: Trigger;
  label: string;
}
