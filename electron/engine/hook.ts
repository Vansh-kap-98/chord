import { EventEmitter } from 'node:events';
import { uIOhook } from 'uiohook-napi';
import type { InputEvent, Shortcut, Token } from '@shared/types';
import { tokenLabel } from '@shared/tokens';
import { BUTTON_TO_TOKEN, KEYCODE_TO_TOKEN } from './keymap';
import { Matcher, type NormalizedEvent } from './matcher';

/**
 * Owns the single global libuiohook listener: normalizes its raw events into
 * canonical tokens, feeds the matcher, and republishes a throttled stream for
 * the live input monitor.
 */
export class HookService extends EventEmitter {
  readonly matcher: Matcher;
  private running = false;
  private startedAt: number | null = null;
  private eventsSeen = 0;
  private nextEventId = 1;

  /** While true, nothing fires; events are routed to the recorder instead. */
  private capturing = false;
  private captureHandler: ((event: NormalizedEvent) => void) | null = null;

  private pending: InputEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(onFire: (shortcut: Shortcut) => void) {
    super();
    this.matcher = new Matcher(onFire);
  }

  get status() {
    return { running: this.running, eventsSeen: this.eventsSeen, startedAt: this.startedAt };
  }

  setCapturing(handler: ((event: NormalizedEvent) => void) | null): void {
    this.captureHandler = handler;
    this.capturing = handler !== null;
    this.matcher.reset();
  }

  start(): void {
    if (this.running) return;
    uIOhook.on('keydown', this.onKeyDown);
    uIOhook.on('keyup', this.onKeyUp);
    uIOhook.on('mousedown', this.onMouseDown);
    uIOhook.on('mouseup', this.onMouseUp);
    uIOhook.on('mousemove', this.onMouseMove);
    uIOhook.on('wheel', this.onWheel);
    uIOhook.start();
    this.running = true;
    this.startedAt = Date.now();
    this.emit('status');
  }

  stop(): void {
    if (!this.running) return;
    uIOhook.off('keydown', this.onKeyDown);
    uIOhook.off('keyup', this.onKeyUp);
    uIOhook.off('mousedown', this.onMouseDown);
    uIOhook.off('mouseup', this.onMouseUp);
    uIOhook.off('mousemove', this.onMouseMove);
    uIOhook.off('wheel', this.onWheel);
    try {
      uIOhook.stop();
    } catch {
      // libuiohook throws if the worker already exited; nothing to recover.
    }
    this.running = false;
    this.startedAt = null;
    this.matcher.reset();
    this.emit('status');
  }

  private feed(event: NormalizedEvent): void {
    this.eventsSeen += 1;
    if (this.capturing) this.captureHandler?.(event);
    else this.matcher.handle(event);
  }

  private publish(type: InputEvent['type'], token: Token, clicks?: number): void {
    const event: InputEvent = {
      id: this.nextEventId++,
      at: Date.now(),
      type,
      token,
      label: tokenLabel(token),
      clicks,
    };
    this.emit('input', event);

    // Coalesce for the monitor: bursts of typing must not flood IPC.
    this.pending.push(event);
    if (this.pending.length > 200) this.pending.splice(0, this.pending.length - 200);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        const batch = this.pending;
        this.pending = [];
        if (batch.length) this.emit('input-batch', batch);
      }, 60);
    }
  }

  private onKeyDown = (e: { keycode: number }): void => {
    const token = KEYCODE_TO_TOKEN.get(e.keycode);
    if (!token) return;
    this.feed({ type: 'down', token, at: Date.now(), x: 0, y: 0 });
    this.publish('keydown', token);
  };

  private onKeyUp = (e: { keycode: number }): void => {
    const token = KEYCODE_TO_TOKEN.get(e.keycode);
    if (!token) return;
    this.feed({ type: 'up', token, at: Date.now(), x: 0, y: 0 });
    this.publish('keyup', token);
  };

  private onMouseDown = (e: { button: unknown; x: number; y: number; clicks: number }): void => {
    const token = BUTTON_TO_TOKEN[Number(e.button)];
    if (!token) return;
    this.feed({ type: 'down', token, at: Date.now(), x: e.x, y: e.y });
    this.publish('mousedown', token, e.clicks);
  };

  private onMouseUp = (e: { button: unknown; x: number; y: number }): void => {
    const token = BUTTON_TO_TOKEN[Number(e.button)];
    if (!token) return;
    this.feed({ type: 'up', token, at: Date.now(), x: e.x, y: e.y });
    this.publish('mouseup', token);
  };

  /** Movement drives gestures only; it is far too noisy for the monitor. */
  private onMouseMove = (e: { x: number; y: number }): void => {
    const event: NormalizedEvent = { type: 'move', at: Date.now(), x: e.x, y: e.y };
    if (this.capturing) this.captureHandler?.(event);
    else this.matcher.handle(event);
  };

  private onWheel = (e: { rotation: number; direction: number }): void => {
    const horizontal = e.direction === 4;
    const token: Token = horizontal
      ? e.rotation > 0
        ? 'Wheel.Right'
        : 'Wheel.Left'
      : e.rotation > 0
        ? 'Wheel.Down'
        : 'Wheel.Up';
    this.feed({ type: 'wheel', token, at: Date.now() });
    this.publish('wheel', token);
  };
}
