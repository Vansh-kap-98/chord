import type { Direction, Shortcut, Token } from '@shared/types';
import { isModifier } from '@shared/tokens';

export type NormalizedEvent =
  | { type: 'down'; token: Token; at: number; x: number; y: number }
  | { type: 'up'; token: Token; at: number; x: number; y: number }
  | { type: 'move'; at: number; x: number; y: number }
  | { type: 'wheel'; token: Token; at: number };

export type FireCallback = (shortcut: Shortcut) => void;

function sameSet(a: Set<Token>, b: readonly Token[]): boolean {
  if (a.size !== b.length) return false;
  for (const t of b) if (!a.has(t)) return false;
  return true;
}

function modifiersMatch(held: Set<Token>, required: readonly Token[]): boolean {
  for (const m of required) if (!held.has(m)) return false;
  // No stray modifiers, so Ctrl+double-click never fires a bare double-click.
  for (const t of held) if (isModifier(t) && !required.includes(t)) return false;
  return true;
}

interface SequenceState {
  progress: number;
  lastAdvanceAt: number;
}

interface ClickStreak {
  count: number;
  lastAt: number;
  /** Modifiers held when the streak began; changing them starts a new streak. */
  modifiers: Token[];
}

function sameList(a: readonly Token[], b: readonly Token[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/**
 * Turns a stream of global input events into shortcut firings.
 *
 * Deliberately holds no Electron or hook dependency: it takes normalized
 * events in and calls back out, which keeps it testable in plain Node.
 */
export class Matcher {
  private shortcuts: Shortcut[] = [];
  private held = new Set<Token>();
  /** Combos currently satisfied, so a held combo fires once rather than repeatedly. */
  private satisfiedCombos = new Set<string>();
  private sequences = new Map<string, SequenceState>();
  /** The in-progress click streak per mouse button. */
  private clickStreaks = new Map<Token, ClickStreak>();
  private pendingClick: { timer: ReturnType<typeof setTimeout>; shortcutId: string } | null = null;
  private gesture: {
    button: Token;
    anchorX: number;
    anchorY: number;
    path: Direction[];
  } | null = null;
  private lastFired = new Map<string, number>();
  private ignoreUntil = 0;

  constructor(private readonly onFire: FireCallback) {}

  setShortcuts(shortcuts: Shortcut[]): void {
    this.shortcuts = shortcuts.filter((s) => s.enabled);
    const live = new Set(this.shortcuts.map((s) => s.id));
    for (const id of [...this.sequences.keys()]) {
      if (!live.has(id)) this.sequences.delete(id);
    }
    this.satisfiedCombos.clear();
  }

  /** Ignore everything for `ms`, so input we synthesize cannot re-trigger us. */
  guard(ms: number): void {
    this.ignoreUntil = Math.max(this.ignoreUntil, Date.now() + ms);
  }

  /** Forget all in-flight state; used when the engine is paused or resumed. */
  reset(): void {
    this.held.clear();
    this.satisfiedCombos.clear();
    this.sequences.clear();
    this.clickStreaks.clear();
    this.gesture = null;
    this.cancelPendingClick();
  }

  get heldTokens(): Token[] {
    return [...this.held];
  }

  handle(event: NormalizedEvent): void {
    if (event.at < this.ignoreUntil) {
      // Still track key state during the guard window, or releases get lost.
      if (event.type === 'down') this.held.add(event.token);
      if (event.type === 'up') this.held.delete(event.token);
      return;
    }

    switch (event.type) {
      case 'down':
        this.onDown(event);
        break;
      case 'up':
        this.onUp(event);
        break;
      case 'move':
        this.onMove(event);
        break;
      case 'wheel':
        this.onWheel(event);
        break;
    }
  }

  private onDown(e: Extract<NormalizedEvent, { type: 'down' }>): void {
    const isRepeat = this.held.has(e.token);
    this.held.add(e.token);
    if (isRepeat) return; // Windows key auto-repeat is not a new press.

    this.matchCombos();

    if (e.token.startsWith('Mouse.')) {
      this.startGesture(e);
      this.matchMultiClick(e.token, e.at);
    }

    // Bare modifier presses neither advance nor break a sequence.
    if (!isModifier(e.token)) this.matchSequences(e.at);
  }

  private onUp(e: Extract<NormalizedEvent, { type: 'up' }>): void {
    this.held.delete(e.token);
    this.clearBrokenCombos();
    if (this.gesture && this.gesture.button === e.token) this.finishGesture();
  }

  private onWheel(e: Extract<NormalizedEvent, { type: 'wheel' }>): void {
    // A wheel notch is a press with no matching release.
    this.held.add(e.token);
    this.matchCombos();
    this.matchSequences(e.at);
    this.held.delete(e.token);
    this.clearBrokenCombos();
  }

  // ---------------------------------------------------------------- combos

  private matchCombos(): void {
    for (const s of this.shortcuts) {
      if (s.trigger.kind !== 'combo') continue;
      if (!sameSet(this.held, s.trigger.tokens)) continue;
      if (this.satisfiedCombos.has(s.id)) continue;
      this.satisfiedCombos.add(s.id);
      this.dispatch(s);
    }
  }

  private clearBrokenCombos(): void {
    for (const id of [...this.satisfiedCombos]) {
      const s = this.shortcuts.find((x) => x.id === id);
      if (!s || s.trigger.kind !== 'combo' || !sameSet(this.held, s.trigger.tokens)) {
        this.satisfiedCombos.delete(id);
      }
    }
  }

  // -------------------------------------------------------------- sequences

  private matchSequences(at: number): void {
    for (const s of this.shortcuts) {
      if (s.trigger.kind !== 'sequence') continue;
      const steps = s.trigger.steps;
      if (steps.length === 0) continue;

      const state = this.sequences.get(s.id) ?? { progress: 0, lastAdvanceAt: 0 };
      if (state.progress > 0 && at - state.lastAdvanceAt > s.trigger.gapMs) {
        state.progress = 0; // Timed out mid-sequence.
      }

      if (sameSet(this.held, steps[state.progress])) {
        state.progress += 1;
        state.lastAdvanceAt = at;
        if (state.progress >= steps.length) {
          state.progress = 0;
          this.sequences.set(s.id, state);
          this.dispatch(s);
          continue;
        }
      } else if (state.progress > 0) {
        // Wrong key: restart, but let this press count as a fresh first step.
        state.progress = sameSet(this.held, steps[0]) ? 1 : 0;
        state.lastAdvanceAt = at;
      }
      this.sequences.set(s.id, state);
    }
  }

  // ------------------------------------------------------------ multi-click

  private matchMultiClick(button: Token, at: number): void {
    const candidates = this.shortcuts.filter(
      (s) => s.trigger.kind === 'multiclick' && s.trigger.button === button,
    );
    if (candidates.length === 0) return;

    // The widest window in play decides how long a streak stays alive.
    const window = Math.max(
      ...candidates.map((s) => (s.trigger as { windowMs: number }).windowMs),
    );

    // A streak continues only while consecutive clicks stay inside the window
    // and the held modifiers do not change -- Ctrl+click is a different gesture
    // from a bare click, even back to back.
    const modifiers = [...this.held].filter(isModifier).sort();
    const previous = this.clickStreaks.get(button);
    const continues =
      !!previous && at - previous.lastAt <= window && sameList(previous.modifiers, modifiers);
    const streak = continues ? previous.count + 1 : 1;
    this.clickStreaks.set(button, { count: streak, lastAt: at, modifiers });

    this.cancelPendingClick();

    const exact = candidates.find((s) => {
      const t = s.trigger as { count: number; modifiers: Token[] };
      return t.count === streak && modifiersMatch(this.held, t.modifiers);
    });
    if (!exact) return;

    // If a longer streak is also bound, wait to see whether it happens --
    // otherwise a triple-click would always fire the double-click first.
    const longerExists = candidates.some((s) => {
      const t = s.trigger as { count: number; modifiers: Token[] };
      return t.count > streak && modifiersMatch(this.held, t.modifiers);
    });

    if (!longerExists) {
      // Start the next streak clean, so click-click, click-click fires twice.
      this.clickStreaks.delete(button);
      this.dispatch(exact);
      return;
    }

    const wait = (exact.trigger as { windowMs: number }).windowMs;
    this.pendingClick = {
      shortcutId: exact.id,
      timer: setTimeout(() => {
        this.pendingClick = null;
        this.clickStreaks.delete(button);
        this.dispatch(exact);
      }, wait),
    };
  }

  private cancelPendingClick(): void {
    if (this.pendingClick) {
      clearTimeout(this.pendingClick.timer);
      this.pendingClick = null;
    }
  }

  // --------------------------------------------------------------- gestures

  private startGesture(e: Extract<NormalizedEvent, { type: 'down' }>): void {
    const wanted = this.shortcuts.some(
      (s) => s.trigger.kind === 'gesture' && s.trigger.button === e.token,
    );
    if (!wanted) return;
    this.gesture = { button: e.token, anchorX: e.x, anchorY: e.y, path: [] };
  }

  private onMove(e: Extract<NormalizedEvent, { type: 'move' }>): void {
    const g = this.gesture;
    if (!g) return;

    const threshold = Math.min(
      ...this.shortcuts
        .filter((s) => s.trigger.kind === 'gesture' && s.trigger.button === g.button)
        .map((s) => (s.trigger as { minDistance: number }).minDistance),
    );

    const dx = e.x - g.anchorX;
    const dy = e.y - g.anchorY;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    const dir: Direction =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';

    // Collapse runs: a long swipe right is one "right", not many.
    if (g.path[g.path.length - 1] !== dir) g.path.push(dir);
    g.anchorX = e.x;
    g.anchorY = e.y;
  }

  private finishGesture(): void {
    const g = this.gesture;
    this.gesture = null;
    if (!g || g.path.length === 0) return;

    for (const s of this.shortcuts) {
      if (s.trigger.kind !== 'gesture') continue;
      if (s.trigger.button !== g.button) continue;
      if (s.trigger.path.length !== g.path.length) continue;
      if (s.trigger.path.every((d, i) => d === g.path[i])) {
        this.dispatch(s);
        return;
      }
    }
  }

  // --------------------------------------------------------------- dispatch

  private dispatch(shortcut: Shortcut): void {
    const now = Date.now();
    const last = this.lastFired.get(shortcut.id) ?? 0;
    if (shortcut.cooldownMs > 0 && now - last < shortcut.cooldownMs) return;
    this.lastFired.set(shortcut.id, now);
    this.onFire(shortcut);
  }
}
