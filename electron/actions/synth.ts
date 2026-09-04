import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Token } from '@shared/types';
import { isModifier } from '@shared/tokens';
import { vkFor } from '../engine/keymap';

const MOUSEEVENTF = {
  leftDown: 0x0002,
  leftUp: 0x0004,
  rightDown: 0x0008,
  rightUp: 0x0010,
  middleDown: 0x0020,
  middleUp: 0x0040,
  wheel: 0x0800,
  hwheel: 0x01000,
} as const;

interface Pending {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Client for the resident PowerShell sidecar that performs Win32 SendInput.
 *
 * Keeping one warm process avoids paying the ~800ms Add-Type compile on every
 * shortcut; once it reports ready, a round trip is a few milliseconds.
 */
export class Synth extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private restarts = 0;

  ready = false;
  lastError: string | null = null;

  constructor(private readonly scriptPath: string) {
    super();
  }

  start(): void {
    if (this.proc) return;
    try {
      this.proc = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NoLogo',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          this.scriptPath,
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err));
      return;
    }

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    this.proc.stderr.setEncoding('utf8');
    this.proc.stderr.on('data', (chunk: string) => this.fail(chunk.trim()));
    this.proc.on('exit', () => {
      this.proc = null;
      this.ready = false;
      this.rejectAll(new Error('input helper exited'));
      this.emit('status');
      // One automatic revival; past that something is genuinely wrong.
      if (this.restarts < 3) {
        this.restarts += 1;
        setTimeout(() => this.start(), 500);
      }
    });
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let idx: number;
    while ((idx = this.stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.stdoutBuffer.slice(0, idx).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
      if (!line) continue;
      let msg: { ready?: boolean; id?: number; ok?: boolean; error?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // Non-JSON noise from PowerShell; ignore.
      }
      if (msg.ready) {
        this.ready = true;
        this.lastError = null;
        this.emit('status');
        continue;
      }
      if (typeof msg.id !== 'number') continue;
      const pending = this.pending.get(msg.id);
      if (!pending) continue;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.ok) pending.resolve();
      else pending.reject(new Error(msg.error ?? 'input helper reported failure'));
    }
  }

  private fail(message: string): void {
    if (!message) return;
    this.lastError = message;
    this.emit('status');
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private send(payload: Record<string, unknown>): Promise<void> {
    if (!this.proc || !this.ready) {
      return Promise.reject(new Error('input helper is not ready yet'));
    }
    const id = this.nextId++;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('input helper timed out'));
      }, 4000);
      this.pending.set(id, { resolve, reject, timer });
      this.proc!.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
    });
  }

  /** Press a set of tokens as a chord: modifiers down, key down, then unwind. */
  pressTokens(tokens: Token[]): Promise<void> {
    const mods = tokens.filter(isModifier);
    const keys = tokens.filter((t) => !isModifier(t) && !t.startsWith('Mouse.'));
    const order = [...mods, ...keys];
    const seq: number[] = [];

    for (const token of order) {
      const spec = vkFor(token);
      if (!spec) return Promise.reject(new Error(`no key code for ${token}`));
      seq.push(spec.vk, 0, spec.ext ? 1 : 0);
    }
    for (const token of [...order].reverse()) {
      const spec = vkFor(token)!;
      seq.push(spec.vk, 1, spec.ext ? 1 : 0);
    }
    if (seq.length === 0) return Promise.reject(new Error('nothing to press'));
    return this.send({ op: 'keys', seq });
  }

  /** Tap a raw virtual-key code -- used for media and volume keys. */
  tapVk(vk: number, ext = false): Promise<void> {
    return this.send({ op: 'keys', seq: [vk, 0, ext ? 1 : 0, vk, 1, ext ? 1 : 0] });
  }

  typeText(text: string): Promise<void> {
    return this.send({ op: 'text', text });
  }

  scroll(notches: number, horizontal = false): Promise<void> {
    return this.send({
      op: 'mouse',
      flags: horizontal ? MOUSEEVENTF.hwheel : MOUSEEVENTF.wheel,
      // A notch is WHEEL_DELTA; the sidecar takes it as an unsigned dword.
      data: (notches * 120) >>> 0,
      dx: 0,
      dy: 0,
    });
  }

  clickButton(button: 'left' | 'right' | 'middle'): Promise<void> {
    const down =
      button === 'left'
        ? MOUSEEVENTF.leftDown
        : button === 'right'
          ? MOUSEEVENTF.rightDown
          : MOUSEEVENTF.middleDown;
    const up =
      button === 'left'
        ? MOUSEEVENTF.leftUp
        : button === 'right'
          ? MOUSEEVENTF.rightUp
          : MOUSEEVENTF.middleUp;
    return this.send({ op: 'mouse', flags: down, data: 0, dx: 0, dy: 0 }).then(() =>
      this.send({ op: 'mouse', flags: up, data: 0, dx: 0, dy: 0 }),
    );
  }

  window(cmd: 'minimize' | 'maximize' | 'restore' | 'close'): Promise<void> {
    return this.send({ op: 'win', cmd });
  }

  lock(): Promise<void> {
    return this.send({ op: 'lock' });
  }

  dispose(): void {
    this.restarts = 99; // Suppress the auto-restart on a deliberate shutdown.
    this.rejectAll(new Error('shutting down'));
    if (this.proc) {
      try {
        this.proc.stdin.write(JSON.stringify({ id: 0, op: 'quit' }) + '\n');
      } catch {
        // Pipe already closed.
      }
      this.proc.kill();
      this.proc = null;
    }
    this.ready = false;
  }
}
