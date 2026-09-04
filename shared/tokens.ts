import type { Action, Direction, Token, Trigger } from './types';

/** Human labels for canonical tokens. Anything unlisted falls back to its bare name. */
const LABELS: Record<string, string> = {
  'Key.Backspace': 'Backspace',
  'Key.Tab': 'Tab',
  'Key.Enter': 'Enter',
  'Key.CapsLock': 'Caps Lock',
  'Key.Escape': 'Esc',
  'Key.Space': 'Space',
  'Key.PageUp': 'Page Up',
  'Key.PageDown': 'Page Down',
  'Key.End': 'End',
  'Key.Home': 'Home',
  'Key.ArrowLeft': '\u2190',
  'Key.ArrowUp': '\u2191',
  'Key.ArrowRight': '\u2192',
  'Key.ArrowDown': '\u2193',
  'Key.Insert': 'Insert',
  'Key.Delete': 'Delete',
  'Key.Semicolon': ';',
  'Key.Equal': '=',
  'Key.Comma': ',',
  'Key.Minus': '-',
  'Key.Period': '.',
  'Key.Slash': '/',
  'Key.Backquote': '`',
  'Key.BracketLeft': '[',
  'Key.Backslash': '\\',
  'Key.BracketRight': ']',
  'Key.Quote': "'",
  'Key.Ctrl': 'Ctrl',
  'Key.CtrlRight': 'Right Ctrl',
  'Key.Alt': 'Alt',
  'Key.AltRight': 'Right Alt',
  'Key.Shift': 'Shift',
  'Key.ShiftRight': 'Right Shift',
  'Key.Meta': 'Win',
  'Key.MetaRight': 'Right Win',
  'Key.NumLock': 'Num Lock',
  'Key.ScrollLock': 'Scroll Lock',
  'Key.PrintScreen': 'Print Screen',
  'Key.NumpadMultiply': 'Num *',
  'Key.NumpadAdd': 'Num +',
  'Key.NumpadSubtract': 'Num -',
  'Key.NumpadDecimal': 'Num .',
  'Key.NumpadDivide': 'Num /',
  'Key.NumpadEnter': 'Num Enter',
  'Mouse.Left': 'Left Click',
  'Mouse.Right': 'Right Click',
  'Mouse.Middle': 'Middle Click',
  'Mouse.Back': 'Back Button',
  'Mouse.Forward': 'Forward Button',
  'Wheel.Up': 'Wheel \u2191',
  'Wheel.Down': 'Wheel \u2193',
  'Wheel.Left': 'Wheel \u2190',
  'Wheel.Right': 'Wheel \u2192',
};

export function tokenLabel(token: Token): string {
  const known = LABELS[token];
  if (known) return known;
  if (token.startsWith('Key.Numpad')) return 'Num ' + token.slice('Key.Numpad'.length);
  if (token.startsWith('Key.')) return token.slice(4);
  if (token.startsWith('Mouse.')) return token.slice(6);
  if (token.startsWith('Wheel.')) return token.slice(6);
  return token;
}

export function isModifier(token: Token): boolean {
  return (
    token === 'Key.Ctrl' ||
    token === 'Key.CtrlRight' ||
    token === 'Key.Alt' ||
    token === 'Key.AltRight' ||
    token === 'Key.Shift' ||
    token === 'Key.ShiftRight' ||
    token === 'Key.Meta' ||
    token === 'Key.MetaRight'
  );
}

export function isMouse(token: Token): boolean {
  return token.startsWith('Mouse.');
}

/** Modifiers first, then everything else, so chips render in a familiar order. */
export function sortTokens(tokens: Token[]): Token[] {
  const rank = (t: Token) => (isModifier(t) ? 0 : isMouse(t) ? 2 : 1);
  return [...tokens].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const ARROWS: Record<Direction, string> = {
  up: '\u2191',
  down: '\u2193',
  left: '\u2190',
  right: '\u2192',
};

export function directionArrow(d: Direction): string {
  return ARROWS[d];
}

const ORDINAL: Record<number, string> = {
  2: 'Double',
  3: 'Triple',
  4: 'Quadruple',
  5: 'Quintuple',
};

/** Flattens a trigger into the chip sequence the UI renders. */
export function triggerChips(trigger: Trigger): string[] {
  switch (trigger.kind) {
    case 'combo':
      return sortTokens(trigger.tokens).map(tokenLabel);
    case 'sequence':
      return trigger.steps.map((step) => sortTokens(step).map(tokenLabel).join('+'));
    case 'multiclick': {
      const prefix = sortTokens(trigger.modifiers).map(tokenLabel);
      const word = ORDINAL[trigger.count] ?? `${trigger.count}\u00d7`;
      return [...prefix, `${word} ${tokenLabel(trigger.button)}`];
    }
    case 'gesture':
      return [tokenLabel(trigger.button), trigger.path.map(directionArrow).join(' ')];
  }
}

export function triggerSeparator(trigger: Trigger): string {
  if (trigger.kind === 'sequence') return 'then';
  if (trigger.kind === 'gesture') return 'drag';
  return '+';
}

export function describeTrigger(trigger: Trigger): string {
  return triggerChips(trigger).join(` ${triggerSeparator(trigger)} `);
}

export const TRIGGER_KIND_LABEL: Record<Trigger['kind'], string> = {
  combo: 'Combo',
  sequence: 'Sequence',
  multiclick: 'Multi-click',
  gesture: 'Gesture',
};

/** Headings for the grouped shortcut list, in the order the groups render. */
export const TRIGGER_GROUP_LABEL: Record<Trigger['kind'], string> = {
  combo: 'Combos',
  sequence: 'Sequences',
  multiclick: 'Multi-clicks',
  gesture: 'Gestures',
};

export const TRIGGER_GROUP_ORDER: Trigger['kind'][] = [
  'combo',
  'sequence',
  'multiclick',
  'gesture',
];

/**
 * The single connector drawn between steps of any trigger chain.
 *
 * `triggerSeparator` still returns the semantic word ("+", "then", "drag") and
 * is what `describeTrigger` uses for screen readers, the tray menu and the
 * activity log. On screen the chain uses this one glyph instead, because the
 * group heading already says which kind of trigger it is.
 */
export const CHAIN_CONNECTOR = '›';

const MEDIA_LABEL: Record<string, string> = {
  volumeUp: 'Volume up',
  volumeDown: 'Volume down',
  mute: 'Toggle mute',
  playPause: 'Play / pause',
  nextTrack: 'Next track',
  prevTrack: 'Previous track',
  stop: 'Stop playback',
};

const WINDOW_LABEL: Record<string, string> = {
  minimize: 'Minimize window',
  maximize: 'Maximize window',
  restore: 'Restore window',
  close: 'Close window',
};

const SYSTEM_LABEL: Record<string, string> = {
  lock: 'Lock the PC',
  showDesktop: 'Show desktop',
  taskView: 'Open Task View',
  screenshot: 'Screenshot region',
};

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n - 1) + '\u2026' : flat;
}

export function describeAction(action: Action): string {
  switch (action.kind) {
    case 'sendKeys':
      return `Press ${action.combo || '\u2014'}`;
    case 'typeText':
      return `Type "${truncate(action.text, 40)}"`;
    case 'launch':
      return `Launch ${truncate(action.target, 48)}`;
    case 'openPath':
      return `Open ${truncate(action.path, 48)}`;
    case 'openUrl':
      return `Open ${truncate(action.url, 48)}`;
    case 'runCommand':
      return `Run ${truncate(action.command, 40)}`;
    case 'media':
      return MEDIA_LABEL[action.op] ?? action.op;
    case 'window':
      return WINDOW_LABEL[action.op] ?? action.op;
    case 'system':
      return SYSTEM_LABEL[action.op] ?? action.op;
  }
}

export const ACTION_KIND_LABEL: Record<Action['kind'], string> = {
  sendKeys: 'Press keys',
  typeText: 'Type text',
  launch: 'Launch app',
  openPath: 'Open file / folder',
  openUrl: 'Open website',
  runCommand: 'Run command',
  media: 'Media & volume',
  window: 'Window control',
  system: 'System',
};
