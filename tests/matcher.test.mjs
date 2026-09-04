import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Matcher } from '../.test-build/matcher.mjs';

/** Collects fired shortcut names so assertions read as expectations. */
function harness(shortcuts) {
  const fired = [];
  const m = new Matcher((s) => fired.push(s.name));
  m.setShortcuts(shortcuts);
  return { m, fired };
}

let clock = 1_000_000;
const now = () => (clock += 10);

function sc(name, trigger, extra = {}) {
  return {
    id: name,
    name,
    enabled: true,
    trigger,
    action: { kind: 'media', op: 'mute' },
    cooldownMs: 0,
    createdAt: 0,
    lastFiredAt: null,
    fireCount: 0,
    ...extra,
  };
}

const down = (m, token, at = now(), x = 0, y = 0) => m.handle({ type: 'down', token, at, x, y });
const up = (m, token, at = now(), x = 0, y = 0) => m.handle({ type: 'up', token, at, x, y });
const move = (m, x, y, at = now()) => m.handle({ type: 'move', at, x, y });
const wheel = (m, token, at = now()) => m.handle({ type: 'wheel', token, at });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A full click: press then release, as the hook always reports them. */
function click(m, token, at) {
  down(m, token, at);
  up(m, token, at + 5);
}

// ------------------------------------------------------------------ combos

describe('combo triggers', () => {
  it('fires when every token is held', () => {
    const { m, fired } = harness([sc('copy', { kind: 'combo', tokens: ['Key.Ctrl', 'Key.K'] })]);
    down(m, 'Key.Ctrl');
    assert.deepEqual(fired, [], 'must not fire on a partial combo');
    down(m, 'Key.K');
    assert.deepEqual(fired, ['copy']);
  });

  it('fires once while the combo stays held', () => {
    const { m, fired } = harness([sc('x', { kind: 'combo', tokens: ['Key.Ctrl', 'Key.K'] })]);
    down(m, 'Key.Ctrl');
    down(m, 'Key.K');
    down(m, 'Key.K'); // Windows auto-repeat.
    down(m, 'Key.K');
    assert.equal(fired.length, 1);
  });

  it('re-arms after release', () => {
    const { m, fired } = harness([sc('x', { kind: 'combo', tokens: ['Key.Ctrl', 'Key.K'] })]);
    down(m, 'Key.Ctrl');
    down(m, 'Key.K');
    up(m, 'Key.K');
    down(m, 'Key.K');
    assert.equal(fired.length, 2);
  });

  it('does not fire when extra keys are held', () => {
    const { m, fired } = harness([sc('x', { kind: 'combo', tokens: ['Key.Ctrl', 'Key.K'] })]);
    down(m, 'Key.Ctrl');
    down(m, 'Key.Shift');
    down(m, 'Key.K');
    assert.deepEqual(fired, [], 'Ctrl+Shift+K must not trigger a Ctrl+K binding');
  });

  it('supports mouse buttons inside a combo', () => {
    const { m, fired } = harness([
      sc('x', { kind: 'combo', tokens: ['Key.Ctrl', 'Mouse.Middle'] }),
    ]);
    down(m, 'Key.Ctrl');
    down(m, 'Mouse.Middle');
    assert.deepEqual(fired, ['x']);
  });

  it('supports a wheel notch as the final token', () => {
    const { m, fired } = harness([sc('x', { kind: 'combo', tokens: ['Key.Alt', 'Wheel.Up'] })]);
    down(m, 'Key.Alt');
    wheel(m, 'Wheel.Up');
    assert.deepEqual(fired, ['x']);
    wheel(m, 'Wheel.Up');
    assert.equal(fired.length, 2, 'each notch is a separate press');
  });

  it('ignores disabled shortcuts', () => {
    const { m, fired } = harness([
      sc('off', { kind: 'combo', tokens: ['Key.Ctrl', 'Key.K'] }, { enabled: false }),
    ]);
    down(m, 'Key.Ctrl');
    down(m, 'Key.K');
    assert.deepEqual(fired, []);
  });
});

// ---------------------------------------------------------------- sequences

describe('sequence triggers', () => {
  const seq = (steps, gapMs = 800) => ({ kind: 'sequence', steps, gapMs });

  it('fires after the steps are pressed in order', () => {
    const { m, fired } = harness([sc('s', seq([['Key.G'], ['Key.D']]))]);
    down(m, 'Key.G');
    up(m, 'Key.G');
    assert.deepEqual(fired, [], 'must wait for the second step');
    down(m, 'Key.D');
    assert.deepEqual(fired, ['s']);
  });

  it('resets when the gap is exceeded', () => {
    const { m, fired } = harness([sc('s', seq([['Key.G'], ['Key.D']], 500))]);
    down(m, 'Key.G', 1000);
    up(m, 'Key.G', 1010);
    down(m, 'Key.D', 2000); // 1000ms later, past the 500ms gap.
    assert.deepEqual(fired, []);
  });

  it('is not disturbed by bare modifier presses between steps', () => {
    const { m, fired } = harness([sc('s', seq([['Key.G'], ['Key.D']]))]);
    down(m, 'Key.G');
    up(m, 'Key.G');
    down(m, 'Key.Shift');
    up(m, 'Key.Shift');
    down(m, 'Key.D');
    assert.deepEqual(fired, ['s'], 'a stray Shift must not break the sequence');
  });

  it('restarts when a wrong key is pressed', () => {
    const { m, fired } = harness([sc('s', seq([['Key.G'], ['Key.D']]))]);
    down(m, 'Key.G');
    up(m, 'Key.G');
    down(m, 'Key.X');
    up(m, 'Key.X');
    down(m, 'Key.D');
    assert.deepEqual(fired, [], 'the wrong key must abort the sequence');
  });

  it('treats a wrong key that matches step one as a fresh start', () => {
    const { m, fired } = harness([sc('s', seq([['Key.G'], ['Key.D']]))]);
    down(m, 'Key.G');
    up(m, 'Key.G');
    down(m, 'Key.G'); // Restarts rather than aborting.
    up(m, 'Key.G');
    down(m, 'Key.D');
    assert.deepEqual(fired, ['s']);
  });

  it('supports chorded steps', () => {
    const { m, fired } = harness([sc('s', seq([['Key.Ctrl', 'Key.K'], ['Key.D']]))]);
    down(m, 'Key.Ctrl');
    down(m, 'Key.K');
    up(m, 'Key.K');
    up(m, 'Key.Ctrl');
    down(m, 'Key.D');
    assert.deepEqual(fired, ['s']);
  });
});

// -------------------------------------------------------------- multi-click

describe('multi-click triggers', () => {
  const mc = (count, modifiers = [], button = 'Mouse.Left', windowMs = 400) => ({
    kind: 'multiclick',
    button,
    count,
    modifiers,
    windowMs,
  });

  it('fires on a double click inside the window', () => {
    const { m, fired } = harness([sc('dbl', mc(2))]);
    click(m, 'Mouse.Left', 1000);
    click(m, 'Mouse.Left', 1150);
    assert.deepEqual(fired, ['dbl']);
  });

  it('does not fire when the clicks are too far apart', () => {
    const { m, fired } = harness([sc('dbl', mc(2))]);
    click(m, 'Mouse.Left', 1000);
    click(m, 'Mouse.Left', 2000);
    assert.deepEqual(fired, []);
  });

  it('requires the exact modifier set', () => {
    const { m, fired } = harness([sc('ctrlDbl', mc(2, ['Key.Ctrl']))]);
    click(m, 'Mouse.Left', 1000);
    click(m, 'Mouse.Left', 1100);
    assert.deepEqual(fired, [], 'no modifier held, so it must not fire');

    down(m, 'Key.Ctrl', 1200);
    click(m, 'Mouse.Left', 1300);
    click(m, 'Mouse.Left', 1400);
    assert.deepEqual(fired, ['ctrlDbl'], 'pressing Ctrl starts a fresh streak');
  });

  it('rejects a bare double-click when a modifier is also held', () => {
    const { m, fired } = harness([sc('dbl', mc(2))]);
    down(m, 'Key.Shift', 1000);
    click(m, 'Mouse.Left', 1100);
    click(m, 'Mouse.Left', 1200);
    assert.deepEqual(fired, [], 'Shift+double-click is a different gesture');
  });

  it('defers the double when a triple is also bound, then fires the triple', async () => {
    const { m, fired } = harness([sc('dbl', mc(2)), sc('tri', mc(3))]);
    const t = Date.now();
    click(m, 'Mouse.Left', t);
    click(m, 'Mouse.Left', t + 100);
    assert.deepEqual(fired, [], 'the double must wait to see if a third click lands');
    click(m, 'Mouse.Left', t + 200);
    assert.deepEqual(fired, ['tri'], 'only the triple should fire');
    await sleep(500);
    assert.deepEqual(fired, ['tri'], 'the deferred double must have been cancelled');
  });

  it('fires the deferred double when no third click arrives', async () => {
    const { m, fired } = harness([sc('dbl', mc(2)), sc('tri', mc(3))]);
    const t = Date.now();
    click(m, 'Mouse.Left', t);
    click(m, 'Mouse.Left', t + 100);
    assert.deepEqual(fired, []);
    await sleep(500);
    assert.deepEqual(fired, ['dbl']);
  });

  it('keeps separate streaks per button', () => {
    const { m, fired } = harness([sc('mid', mc(2, [], 'Mouse.Middle'))]);
    click(m, 'Mouse.Left', 1000);
    click(m, 'Mouse.Middle', 1050);
    click(m, 'Mouse.Left', 1100);
    assert.deepEqual(fired, [], 'left clicks must not build the middle-click streak');
    click(m, 'Mouse.Middle', 1150);
    assert.deepEqual(fired, ['mid']);
  });
});

// ----------------------------------------------------------------- gestures

describe('gesture triggers', () => {
  const g = (path, button = 'Mouse.Right') => ({
    kind: 'gesture',
    button,
    path,
    minDistance: 40,
  });

  it('matches a two-leg gesture', () => {
    const { m, fired } = harness([sc('L', g(['down', 'right']))]);
    down(m, 'Mouse.Right', now(), 500, 500);
    move(m, 500, 560);
    move(m, 500, 640);
    move(m, 700, 640);
    up(m, 'Mouse.Right', now(), 700, 640);
    assert.deepEqual(fired, ['L']);
  });

  it('ignores movement below the distance threshold', () => {
    const { m, fired } = harness([sc('L', g(['down']))]);
    down(m, 'Mouse.Right', now(), 500, 500);
    move(m, 505, 512);
    up(m, 'Mouse.Right', now(), 505, 512);
    assert.deepEqual(fired, [], 'a small jitter is not a gesture');
  });

  it('does not match a different path', () => {
    const { m, fired } = harness([sc('L', g(['down', 'right']))]);
    down(m, 'Mouse.Right', now(), 500, 500);
    move(m, 500, 600);
    move(m, 300, 600);
    up(m, 'Mouse.Right', now(), 300, 600);
    assert.deepEqual(fired, [], 'down-then-left is not down-then-right');
  });

  it('collapses a long stroke into a single direction', () => {
    const { m, fired } = harness([sc('R', g(['right']))]);
    down(m, 'Mouse.Right', now(), 100, 500);
    for (let x = 150; x <= 600; x += 50) move(m, x, 500);
    up(m, 'Mouse.Right', now(), 600, 500);
    assert.deepEqual(fired, ['R']);
  });
});

// -------------------------------------------------------- cooldown & guard

describe('safety rails', () => {
  it('honours the cooldown', () => {
    const { m, fired } = harness([
      sc('x', { kind: 'combo', tokens: ['Key.K'] }, { cooldownMs: 10_000 }),
    ]);
    down(m, 'Key.K');
    up(m, 'Key.K');
    down(m, 'Key.K');
    up(m, 'Key.K');
    assert.equal(fired.length, 1, 'the second press falls inside the cooldown');
  });

  it('ignores input while the echo guard is active', () => {
    const { m, fired } = harness([sc('x', { kind: 'combo', tokens: ['Key.Ctrl', 'Key.K'] })]);
    m.guard(5000);
    down(m, 'Key.Ctrl', Date.now());
    down(m, 'Key.K', Date.now());
    assert.deepEqual(fired, [], 'synthesized input must not retrigger us');
  });

  it('still tracks key state through the guard window', () => {
    const { m } = harness([]);
    m.guard(5000);
    down(m, 'Key.Ctrl', Date.now());
    assert.deepEqual(m.heldTokens, ['Key.Ctrl']);
    up(m, 'Key.Ctrl', Date.now());
    assert.deepEqual(m.heldTokens, [], 'releases during the guard must not be lost');
  });

  it('clears in-flight state on reset', () => {
    const { m, fired } = harness([
      sc('s', { kind: 'sequence', steps: [['Key.G'], ['Key.D']], gapMs: 5000 }),
    ]);
    down(m, 'Key.G');
    up(m, 'Key.G');
    m.reset();
    down(m, 'Key.D');
    assert.deepEqual(fired, [], 'progress must not survive a reset');
  });
});
