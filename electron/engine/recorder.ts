import type { CaptureMode, CaptureResult, Direction, Token, Trigger } from '@shared/types';
import { describeTrigger, isModifier } from '@shared/tokens';
import type { NormalizedEvent } from './matcher';

export interface CaptureProgress {
  mode: CaptureMode;
  /** Tokens held right now, for the live "keys down" readout. */
  held: Token[];
  /** Best trigger inferred so far, or null while nothing usable is recorded. */
  draft: Trigger | null;
  label: string;
  clicks: number;
  path: Direction[];
  /** True once the recorder has enough to auto-commit. */
  settled: boolean;
}

export interface RecorderOptions {
  mode: CaptureMode;
  sequenceGapMs: number;
  multiClickWindowMs: number;
  gestureDistance: number;
  onProgress: (progress: CaptureProgress) => void;
  onResult: (result: CaptureResult) => void;
}

/**
 * Watches raw input during a capture session and infers the trigger the user
 * is demonstrating. Each mode settles on its own -- combos when every key is
 * released, multi-clicks when the click streak lapses, gestures on button
 * release, sequences after an idle gap -- so the user never has to press a
 * confirm button mid-shortcut.
 */
export class Recorder {
  private held = new Set<Token>();
  private comboTokens: Token[] = [];
  private steps: Token[][] = [];
  private clickButton: Token | null = null;
  private clickCount = 0;
  private clickModifiers: Token[] = [];
  private lastClickAt = 0;
  private gestureButton: Token | null = null;
  private gesturePath: Direction[] = [];
  private anchorX = 0;
  private anchorY = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private done = false;

  constructor(private readonly opts: RecorderOptions) {}

  handle(event: NormalizedEvent): void {
    if (this.done) return;

    switch (event.type) {
      case 'down':
        this.onDown(event.token, event.at, event.x, event.y);
        break;
      case 'up':
        this.onUp(event.token);
        break;
      case 'move':
        this.onMove(event.x, event.y);
        break;
      case 'wheel':
        this.onWheel(event.token);
        break;
    }
    this.report();
  }

  private onDown(token: Token, at: number, x: number, y: number): void {
    const repeat = this.held.has(token);
    this.held.add(token);
    if (repeat) return;

    switch (this.opts.mode) {
      case 'combo':
        // Keep the widest set seen, so a rolling press still records fully.
        if (this.held.size >= this.comboTokens.length) this.comboTokens = [...this.held];
        break;

      case 'sequence':
        if (!isModifier(token)) {
          this.steps.push([...this.held]);
          this.armIdle(this.opts.sequenceGapMs * 1.6);
        }
        break;

      case 'multiclick':
        if (!token.startsWith('Mouse.')) break;
        if (this.clickButton !== token || at - this.lastClickAt > this.opts.multiClickWindowMs) {
          this.clickButton = token;
          this.clickCount = 1;
          this.clickModifiers = [...this.held].filter(isModifier);
        } else {
          this.clickCount += 1;
        }
        this.lastClickAt = at;
        this.armIdle(this.opts.multiClickWindowMs + 120);
        break;

      case 'gesture':
        if (!token.startsWith('Mouse.')) break;
        this.gestureButton = token;
        this.gesturePath = [];
        this.anchorX = x;
        this.anchorY = y;
        break;
    }
  }

  private onUp(token: Token): void {
    this.held.delete(token);

    if (this.opts.mode === 'combo' && this.held.size === 0 && this.comboTokens.length > 0) {
      this.commit();
      return;
    }
    if (this.opts.mode === 'gesture' && this.gestureButton === token) {
      if (this.gesturePath.length > 0) this.commit();
      else this.gestureButton = null;
    }
  }

  private onMove(x: number, y: number): void {
    if (this.opts.mode !== 'gesture' || !this.gestureButton) return;
    const dx = x - this.anchorX;
    const dy = y - this.anchorY;
    const d = this.opts.gestureDistance;
    if (Math.abs(dx) < d && Math.abs(dy) < d) return;

    const dir: Direction =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (this.gesturePath[this.gesturePath.length - 1] !== dir) this.gesturePath.push(dir);
    this.anchorX = x;
    this.anchorY = y;
  }

  private onWheel(token: Token): void {
    if (this.opts.mode === 'combo') {
      this.comboTokens = [...this.held, token];
      this.commit();
    } else if (this.opts.mode === 'sequence') {
      this.steps.push([...this.held, token]);
      this.armIdle(this.opts.sequenceGapMs * 1.6);
    }
  }

  private armIdle(ms: number): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.draft()) this.commit();
    }, ms);
  }

  /** The trigger implied by what has been recorded, or null if not enough yet. */
  draft(): Trigger | null {
    switch (this.opts.mode) {
      case 'combo':
        return this.comboTokens.length ? { kind: 'combo', tokens: this.comboTokens } : null;
      case 'sequence':
        return this.steps.length
          ? { kind: 'sequence', steps: this.steps, gapMs: this.opts.sequenceGapMs }
          : null;
      case 'multiclick':
        return this.clickButton
          ? {
              kind: 'multiclick',
              button: this.clickButton,
              count: this.clickCount,
              modifiers: this.clickModifiers,
              windowMs: this.opts.multiClickWindowMs,
            }
          : null;
      case 'gesture':
        return this.gestureButton && this.gesturePath.length
          ? {
              kind: 'gesture',
              button: this.gestureButton,
              path: this.gesturePath,
              minDistance: this.opts.gestureDistance,
            }
          : null;
    }
  }

  private report(): void {
    const draft = this.draft();
    this.opts.onProgress({
      mode: this.opts.mode,
      held: [...this.held],
      draft,
      label: draft ? describeTrigger(draft) : '',
      clicks: this.clickCount,
      path: this.gesturePath,
      settled: false,
    });
  }

  /** Force a result now -- used by the recorder's explicit "use this" button. */
  commit(): void {
    if (this.done) return;
    const trigger = this.draft();
    if (!trigger) return;
    this.done = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.opts.onResult({ trigger, label: describeTrigger(trigger) });
  }

  cancel(): void {
    this.done = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }
}
