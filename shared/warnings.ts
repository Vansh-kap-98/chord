import type { Token, Trigger } from './types';
import { isModifier, tokenLabel } from './tokens';

export interface TriggerWarning {
  level: 'danger' | 'caution' | 'info';
  message: string;
}

/** Combos Windows or nearly every app already owns. */
const RESERVED: Array<{ tokens: Token[]; what: string }> = [
  { tokens: ['Key.Ctrl', 'Key.C'], what: 'Copy' },
  { tokens: ['Key.Ctrl', 'Key.V'], what: 'Paste' },
  { tokens: ['Key.Ctrl', 'Key.X'], what: 'Cut' },
  { tokens: ['Key.Ctrl', 'Key.Z'], what: 'Undo' },
  { tokens: ['Key.Ctrl', 'Key.Y'], what: 'Redo' },
  { tokens: ['Key.Ctrl', 'Key.A'], what: 'Select all' },
  { tokens: ['Key.Ctrl', 'Key.S'], what: 'Save' },
  { tokens: ['Key.Ctrl', 'Key.F'], what: 'Find' },
  { tokens: ['Key.Ctrl', 'Key.P'], what: 'Print' },
  { tokens: ['Key.Ctrl', 'Key.N'], what: 'New' },
  { tokens: ['Key.Ctrl', 'Key.T'], what: 'New tab' },
  { tokens: ['Key.Ctrl', 'Key.W'], what: 'Close tab' },
  { tokens: ['Key.Alt', 'Key.Tab'], what: 'Switch windows' },
  { tokens: ['Key.Alt', 'Key.F4'], what: 'Close window' },
  { tokens: ['Key.Ctrl', 'Key.Shift', 'Key.Escape'], what: 'Task Manager' },
];

function setEq(a: readonly Token[], b: readonly Token[]): boolean {
  return a.length === b.length && a.every((t) => b.includes(t));
}

function reservedFor(tokens: readonly Token[]): string | null {
  const hit = RESERVED.find((r) => setEq(r.tokens, tokens));
  if (hit) return hit.what;
  if (tokens.some((t) => t === 'Key.Meta' || t === 'Key.MetaRight')) return 'a Windows shortcut';
  return null;
}

/**
 * Flags triggers that will misbehave in practice. The engine can observe input
 * but cannot swallow it, so a trigger that shadows an existing shortcut fires
 * *in addition to* the original -- worth saying plainly at authoring time.
 */
export function analyzeTrigger(trigger: Trigger): TriggerWarning[] {
  const out: TriggerWarning[] = [];

  switch (trigger.kind) {
    case 'combo': {
      const nonMods = trigger.tokens.filter((t) => !isModifier(t));
      if (trigger.tokens.length === 1 && nonMods.length === 1 && !trigger.tokens[0].startsWith('Mouse.')) {
        out.push({
          level: 'danger',
          message: `A bare ${tokenLabel(trigger.tokens[0])} fires every single time you press that key, including while typing.`,
        });
      }
      if (setEq(trigger.tokens, ['Mouse.Left']) || setEq(trigger.tokens, ['Mouse.Right'])) {
        out.push({
          level: 'danger',
          message: 'Binding a plain left or right click will fire on essentially every click you make.',
        });
      }
      const reserved = reservedFor(trigger.tokens);
      if (reserved) {
        out.push({
          level: 'caution',
          message: `This is already ${reserved}. Your action runs as well as the original -- it does not replace it.`,
        });
      }
      break;
    }

    case 'sequence': {
      if (trigger.steps.length < 2) {
        out.push({ level: 'caution', message: 'A one-step sequence behaves like a plain combo.' });
      }
      const first = trigger.steps[0];
      if (first && first.length === 1 && !isModifier(first[0]) && !first[0].startsWith('Mouse.')) {
        out.push({
          level: 'info',
          message: `Starts on ${tokenLabel(first[0])}, so normal typing can begin the sequence. A modifier or side button makes a safer leader.`,
        });
      }
      break;
    }

    case 'multiclick': {
      if (trigger.count < 2) {
        if (trigger.button === 'Mouse.Left' || trigger.button === 'Mouse.Right') {
          out.push({
            level: 'danger',
            message: 'A single left or right click fires constantly. Use two or more clicks, or a side button.',
          });
        } else {
          out.push({
            level: 'info',
            message: `Fires on every single ${tokenLabel(trigger.button)} press.`,
          });
        }
      }
      if (trigger.button === 'Mouse.Left' && trigger.count === 2 && trigger.modifiers.length === 0) {
        out.push({
          level: 'caution',
          message: 'Plain double left-click is how Windows opens things, so this will fire very often.',
        });
      }
      if (trigger.count >= 2) {
        out.push({
          level: 'info',
          message: `The ${trigger.count > 2 ? `${trigger.count} clicks` : 'clicks'} still reach the app underneath -- the app cannot block them.`,
        });
      }
      break;
    }

    case 'gesture': {
      if (trigger.button === 'Mouse.Left') {
        out.push({
          level: 'caution',
          message: 'Left-button gestures collide with dragging and text selection. Right or a side button works better.',
        });
      }
      if (trigger.path.length === 1) {
        out.push({
          level: 'info',
          message: 'Single-direction gestures are easy to trigger by accident while dragging.',
        });
      }
      break;
    }
  }

  return out;
}

/** True when two triggers would both fire on the same input. */
export function triggersCollide(a: Trigger, b: Trigger): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'combo':
      return setEq(a.tokens, (b as typeof a).tokens);
    case 'sequence': {
      const other = b as typeof a;
      return (
        a.steps.length === other.steps.length &&
        a.steps.every((step, i) => setEq(step, other.steps[i]))
      );
    }
    case 'multiclick': {
      const other = b as typeof a;
      return (
        a.button === other.button &&
        a.count === other.count &&
        setEq(a.modifiers, other.modifiers)
      );
    }
    case 'gesture': {
      const other = b as typeof a;
      return (
        a.button === other.button &&
        a.path.length === other.path.length &&
        a.path.every((d, i) => d === other.path[i])
      );
    }
  }
}
