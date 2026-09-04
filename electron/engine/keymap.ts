import { UiohookKey } from 'uiohook-napi';
import type { Token } from '@shared/types';

/**
 * Three translations live here:
 *   1. uiohook keycode  -> canonical token   (capture)
 *   2. canonical token  -> Windows VK + ext  (synthesis)
 *   3. "ctrl+shift+t"   -> token list        (authoring)
 */

/** uiohook keycode -> canonical token, derived from uiohook's own name table. */
export const KEYCODE_TO_TOKEN = new Map<number, Token>();
for (const [name, code] of Object.entries(UiohookKey)) {
  const numeric = code as number;
  // Digit entries are exposed under numeric keys ("0".."9"); label them Digit*.
  const token = /^\d$/.test(name) ? `Key.Digit${name}` : `Key.${name}`;
  if (!KEYCODE_TO_TOKEN.has(numeric)) KEYCODE_TO_TOKEN.set(numeric, token);
}

/** libuiohook mouse button ordinals. */
export const BUTTON_TO_TOKEN: Record<number, Token> = {
  1: 'Mouse.Left',
  2: 'Mouse.Right',
  3: 'Mouse.Middle',
  4: 'Mouse.Back',
  5: 'Mouse.Forward',
};

export interface VkSpec {
  vk: number;
  /** Needs KEYEVENTF_EXTENDEDKEY to reach the right physical key. */
  ext?: boolean;
}

const VK: Record<string, VkSpec> = {
  'Key.Backspace': { vk: 0x08 },
  'Key.Tab': { vk: 0x09 },
  'Key.Enter': { vk: 0x0d },
  'Key.CapsLock': { vk: 0x14 },
  'Key.Escape': { vk: 0x1b },
  'Key.Space': { vk: 0x20 },
  'Key.PageUp': { vk: 0x21, ext: true },
  'Key.PageDown': { vk: 0x22, ext: true },
  'Key.End': { vk: 0x23, ext: true },
  'Key.Home': { vk: 0x24, ext: true },
  'Key.ArrowLeft': { vk: 0x25, ext: true },
  'Key.ArrowUp': { vk: 0x26, ext: true },
  'Key.ArrowRight': { vk: 0x27, ext: true },
  'Key.ArrowDown': { vk: 0x28, ext: true },
  'Key.Insert': { vk: 0x2d, ext: true },
  'Key.Delete': { vk: 0x2e, ext: true },
  'Key.PrintScreen': { vk: 0x2c, ext: true },
  'Key.NumLock': { vk: 0x90, ext: true },
  'Key.ScrollLock': { vk: 0x91 },
  'Key.Semicolon': { vk: 0xba },
  'Key.Equal': { vk: 0xbb },
  'Key.Comma': { vk: 0xbc },
  'Key.Minus': { vk: 0xbd },
  'Key.Period': { vk: 0xbe },
  'Key.Slash': { vk: 0xbf },
  'Key.Backquote': { vk: 0xc0 },
  'Key.BracketLeft': { vk: 0xdb },
  'Key.Backslash': { vk: 0xdc },
  'Key.BracketRight': { vk: 0xdd },
  'Key.Quote': { vk: 0xde },
  'Key.Ctrl': { vk: 0xa2 },
  'Key.CtrlRight': { vk: 0xa3, ext: true },
  'Key.Alt': { vk: 0xa4 },
  'Key.AltRight': { vk: 0xa5, ext: true },
  'Key.Shift': { vk: 0xa0 },
  'Key.ShiftRight': { vk: 0xa1 },
  'Key.Meta': { vk: 0x5b, ext: true },
  'Key.MetaRight': { vk: 0x5c, ext: true },
  'Key.NumpadMultiply': { vk: 0x6a },
  'Key.NumpadAdd': { vk: 0x6b },
  'Key.NumpadSubtract': { vk: 0x6d },
  'Key.NumpadDecimal': { vk: 0x6e },
  'Key.NumpadDivide': { vk: 0x6f, ext: true },
  'Key.NumpadEnter': { vk: 0x0d, ext: true },
};

for (let i = 0; i <= 9; i++) VK[`Key.Digit${i}`] = { vk: 0x30 + i };
for (let i = 0; i < 26; i++) VK[`Key.${String.fromCharCode(65 + i)}`] = { vk: 0x41 + i };
for (let i = 0; i <= 9; i++) VK[`Key.Numpad${i}`] = { vk: 0x60 + i };
for (let i = 1; i <= 24; i++) VK[`Key.F${i}`] = { vk: 0x6f + i };

/** Media and volume keys have no capture token; they are synthesis-only. */
export const MEDIA_VK = {
  volumeUp: 0xaf,
  volumeDown: 0xae,
  mute: 0xad,
  nextTrack: 0xb0,
  prevTrack: 0xb1,
  stop: 0xb2,
  playPause: 0xb3,
} as const;

export function vkFor(token: Token): VkSpec | null {
  return VK[token] ?? null;
}

/** Aliases accepted when authoring a combo by hand. */
const ALIASES: Record<string, Token> = {
  ctrl: 'Key.Ctrl',
  control: 'Key.Ctrl',
  ctl: 'Key.Ctrl',
  rctrl: 'Key.CtrlRight',
  alt: 'Key.Alt',
  ralt: 'Key.AltRight',
  altgr: 'Key.AltRight',
  shift: 'Key.Shift',
  rshift: 'Key.ShiftRight',
  win: 'Key.Meta',
  meta: 'Key.Meta',
  super: 'Key.Meta',
  cmd: 'Key.Meta',
  esc: 'Key.Escape',
  escape: 'Key.Escape',
  enter: 'Key.Enter',
  return: 'Key.Enter',
  space: 'Key.Space',
  tab: 'Key.Tab',
  backspace: 'Key.Backspace',
  bksp: 'Key.Backspace',
  del: 'Key.Delete',
  delete: 'Key.Delete',
  ins: 'Key.Insert',
  insert: 'Key.Insert',
  home: 'Key.Home',
  end: 'Key.End',
  pgup: 'Key.PageUp',
  pageup: 'Key.PageUp',
  pgdn: 'Key.PageDown',
  pagedown: 'Key.PageDown',
  up: 'Key.ArrowUp',
  down: 'Key.ArrowDown',
  left: 'Key.ArrowLeft',
  right: 'Key.ArrowRight',
  capslock: 'Key.CapsLock',
  printscreen: 'Key.PrintScreen',
  prtsc: 'Key.PrintScreen',
  ';': 'Key.Semicolon',
  '=': 'Key.Equal',
  ',': 'Key.Comma',
  '-': 'Key.Minus',
  '.': 'Key.Period',
  '/': 'Key.Slash',
  '`': 'Key.Backquote',
  '[': 'Key.BracketLeft',
  '\\': 'Key.Backslash',
  ']': 'Key.BracketRight',
  "'": 'Key.Quote',
};

/**
 * Parses "ctrl+shift+t" into canonical tokens. Returns the tokens it resolved
 * plus any parts it could not, so the UI can show a precise error.
 */
export function parseCombo(input: string): { tokens: Token[]; unknown: string[] } {
  const tokens: Token[] = [];
  const unknown: string[] = [];
  const parts = input
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (ALIASES[lower]) {
      tokens.push(ALIASES[lower]);
      continue;
    }
    if (/^[a-z]$/.test(lower)) {
      tokens.push(`Key.${lower.toUpperCase()}`);
      continue;
    }
    if (/^\d$/.test(lower)) {
      tokens.push(`Key.Digit${lower}`);
      continue;
    }
    if (/^f\d{1,2}$/.test(lower)) {
      tokens.push(`Key.F${lower.slice(1)}`);
      continue;
    }
    if (VK[part]) {
      tokens.push(part);
      continue;
    }
    unknown.push(part);
  }
  return { tokens, unknown };
}
