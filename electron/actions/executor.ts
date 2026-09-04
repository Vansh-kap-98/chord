import { spawn } from 'node:child_process';
import { shell } from 'electron';
import type { Action } from '@shared/types';
import { MEDIA_VK } from '../engine/keymap';
import { parseCombo } from '../engine/keymap';
import type { Synth } from './synth';

/** Combos Windows itself owns, expressed as tokens we can synthesize. */
const SYSTEM_COMBOS = {
  showDesktop: ['Key.Meta', 'Key.D'],
  taskView: ['Key.Meta', 'Key.Tab'],
  screenshot: ['Key.Meta', 'Key.Shift', 'Key.S'],
} as const;

function startDetached(command: string, args: string[], shellMode = false): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: shellMode,
  });
  // Let the child outlive us rather than dying with the tray app.
  child.unref();
}

/** Splits an argument string on spaces while respecting double quotes. */
function splitArgs(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) out.push(m[1] ?? m[2]);
  return out;
}

export async function executeAction(action: Action, synth: Synth): Promise<void> {
  switch (action.kind) {
    case 'sendKeys': {
      const { tokens, unknown } = parseCombo(action.combo);
      if (unknown.length) throw new Error(`unrecognized key: ${unknown.join(', ')}`);
      if (!tokens.length) throw new Error('no keys to send');
      await synth.pressTokens(tokens);
      return;
    }

    case 'typeText': {
      if (!action.text) throw new Error('nothing to type');
      await synth.typeText(action.text);
      return;
    }

    case 'launch': {
      if (!action.target.trim()) throw new Error('no program set');
      startDetached(action.target, splitArgs(action.args ?? ''));
      return;
    }

    case 'openPath': {
      const err = await shell.openPath(action.path);
      if (err) throw new Error(err);
      return;
    }

    case 'openUrl': {
      const url = action.url.trim();
      if (/^(javascript|data|file):/i.test(url)) {
        throw new Error('that URL scheme is not allowed');
      }
      const normalized = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
      await shell.openExternal(normalized);
      return;
    }

    case 'runCommand': {
      if (!action.command.trim()) throw new Error('no command set');
      if (action.shell === 'powershell') {
        startDetached('powershell.exe', [
          '-NoProfile',
          '-WindowStyle',
          'Hidden',
          '-Command',
          action.command,
        ]);
      } else {
        startDetached('cmd.exe', ['/c', action.command]);
      }
      return;
    }

    case 'media': {
      await synth.tapVk(MEDIA_VK[action.op], true);
      return;
    }

    case 'window': {
      await synth.window(action.op);
      return;
    }

    case 'system': {
      if (action.op === 'lock') {
        await synth.lock();
        return;
      }
      await synth.pressTokens([...SYSTEM_COMBOS[action.op]]);
      return;
    }
  }
}
