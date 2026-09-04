import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AppWindow,
  FolderOpen,
  Globe,
  Keyboard,
  MousePointerClick,
  Music,
  Play,
  Rocket,
  Spline,
  Square,
  Terminal,
  TriangleAlert,
  Type,
  X,
} from 'lucide-react';
import type { Action, CaptureMode, Direction, Shortcut } from '@shared/types';
import { ACTION_KIND_LABEL, describeAction, tokenLabel } from '@shared/tokens';
import { analyzeTrigger, triggersCollide } from '@shared/warnings';
import { ICON } from '../icons';
import { useApp } from '../state';
import { Field, GesturePath, TriggerChips, Warnings } from './Bits';

const MODES: Array<{ id: CaptureMode; label: string; icon: typeof Keyboard; blurb: string }> = [
  {
    id: 'combo',
    label: 'Combo',
    icon: Keyboard,
    blurb: 'Hold every key and button at once, then let go.',
  },
  {
    id: 'sequence',
    label: 'Sequence',
    icon: Spline,
    blurb: 'Press keys one after another. Recording ends when you pause.',
  },
  {
    id: 'multiclick',
    label: 'Multi-click',
    icon: MousePointerClick,
    blurb: 'Click a mouse button two or more times inside this box.',
  },
  {
    id: 'gesture',
    label: 'Gesture',
    icon: Spline,
    blurb: 'Hold a mouse button inside this box, stroke a shape, then release.',
  },
];

const ACTION_ICONS: Record<Action['kind'], typeof Keyboard> = {
  sendKeys: Keyboard,
  typeText: Type,
  launch: Rocket,
  openPath: FolderOpen,
  openUrl: Globe,
  runCommand: Terminal,
  media: Music,
  window: AppWindow,
  system: Square,
};

const ACTION_ORDER: Action['kind'][] = [
  'sendKeys',
  'typeText',
  'media',
  'launch',
  'openUrl',
  'openPath',
  'window',
  'system',
  'runCommand',
];

function defaultAction(kind: Action['kind']): Action {
  switch (kind) {
    case 'sendKeys':
      return { kind, combo: '' };
    case 'typeText':
      return { kind, text: '' };
    case 'launch':
      return { kind, target: '', args: '' };
    case 'openPath':
      return { kind, path: '' };
    case 'openUrl':
      return { kind, url: '' };
    case 'runCommand':
      return { kind, command: '', shell: 'powershell' };
    case 'media':
      return { kind, op: 'playPause' };
    case 'window':
      return { kind, op: 'minimize' };
    case 'system':
      return { kind, op: 'lock' };
  }
}

function actionIsComplete(action: Action): boolean {
  switch (action.kind) {
    case 'sendKeys':
      return action.combo.trim().length > 0;
    case 'typeText':
      return action.text.length > 0;
    case 'launch':
      return action.target.trim().length > 0;
    case 'openPath':
      return action.path.trim().length > 0;
    case 'openUrl':
      return action.url.trim().length > 0;
    case 'runCommand':
      return action.command.trim().length > 0;
    default:
      return true;
  }
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={done ? 'step step-done' : 'step'}>
      <div className="step-head">
        <span className="step-num" aria-hidden="true">
          {n}
        </span>
        <h2 className="step-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function Editor() {
  const editor = useApp((s) => s.editor);
  const capture = useApp((s) => s.capture);
  const shortcuts = useApp((s) => s.shortcuts);
  const patch = useApp((s) => s.patchEditor);
  const close = useApp((s) => s.closeEditor);
  const setMode = useApp((s) => s.setCaptureMode);
  const setActive = useApp((s) => s.setCaptureActive);
  const toast = useApp((s) => s.toast);

  const stageRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [testing, setTesting] = useState(false);
  const titleId = useId();
  const nameId = useId();

  // Move focus into the dialog so keyboard users are not left on the page behind.
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  // Escape closes -- but never while recording, where Escape is a valid key.
  useEffect(() => {
    if (capture.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capture.active, close]);

  // Never leave the hook in capture mode if the modal goes away.
  useEffect(() => () => void window.shortcut.cancelCapture(), []);

  const warnings = useMemo(
    () => (editor?.trigger ? analyzeTrigger(editor.trigger) : []),
    [editor?.trigger],
  );

  const clash = useMemo(() => {
    if (!editor?.trigger) return null;
    return (
      shortcuts.find((s) => s.id !== editor.id && triggersCollide(s.trigger, editor.trigger!)) ??
      null
    );
  }, [editor?.trigger, editor?.id, shortcuts]);

  if (!editor) return null;

  const startCapture = () => {
    setActive(true);
    // Let the click that pressed this button finish before the recorder listens.
    setTimeout(() => {
      const r = stageRef.current?.getBoundingClientRect();
      void window.shortcut.startCapture(
        capture.mode,
        r ? { x: r.left, y: r.top, width: r.width, height: r.height } : undefined,
      );
    }, 220);
  };

  const stopCapture = () => {
    setActive(false);
    void window.shortcut.cancelCapture();
  };

  const runTest = async () => {
    setTesting(true);
    const result = await window.shortcut.testAction(editor.action);
    setTesting(false);
    if (result.ok) toast('ok', 'Action ran');
    else toast('err', result.error ?? 'Action failed');
  };

  const save = async () => {
    if (!editor.trigger) return;
    const name = editor.name.trim() || describeAction(editor.action);
    const payload = {
      name,
      enabled: editor.enabled,
      trigger: editor.trigger,
      action: editor.action,
      cooldownMs: editor.cooldownMs,
    };
    if (editor.id) await window.shortcut.updateShortcut(editor.id, payload as Partial<Shortcut>);
    else await window.shortcut.addShortcut(payload);
    toast('ok', editor.id ? 'Shortcut updated' : 'Shortcut created');
    close();
  };

  const actionReady = actionIsComplete(editor.action);
  const canSave = !!editor.trigger && actionReady;
  const mode = MODES.find((m) => m.id === capture.mode)!;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={modalRef}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h1 className="modal-title" id={titleId}>
            {editor.id ? 'Edit shortcut' : 'New shortcut'}
          </h1>
          <div className="grow" />
          <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Close">
            <X size={ICON.sm} />
          </button>
        </div>

        <div className="modal-body">
          {/* ------------------------------------------------------ trigger */}
          <Step n={1} title="Trigger" done={!!editor.trigger}>
            <div className="tabs" role="tablist" aria-label="Trigger kind">
              {MODES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className="tab"
                  role="tab"
                  aria-selected={capture.mode === id}
                  onClick={() => {
                    if (capture.active) stopCapture();
                    setMode(id);
                  }}
                >
                  <Icon size={ICON.xs} />
                  {label}
                </button>
              ))}
            </div>

            <div className="capture" ref={stageRef} data-live={capture.active}>
              {capture.active ? (
                <>
                  <span className="badge badge-accent">Recording</span>
                  <div className="capture-live">
                    {capture.progress?.path?.length ? (
                      <GesturePath path={capture.progress.path as Direction[]} />
                    ) : capture.progress?.held?.length ? (
                      capture.progress.held.map((t) => (
                        <span key={t} className="keycap keycap-lg keycap-accent">
                          {tokenLabel(t)}
                        </span>
                      ))
                    ) : capture.progress?.label ? (
                      <span className="keycap keycap-lg keycap-accent">
                        {capture.progress.label}
                      </span>
                    ) : (
                      <span className="capture-empty">waiting for input…</span>
                    )}
                  </div>
                  <span className="capture-hint">{mode.blurb}</span>
                  <button className="btn btn-sm" onClick={stopCapture}>
                    Stop
                  </button>
                </>
              ) : editor.trigger ? (
                <>
                  <TriggerChips trigger={editor.trigger} large />
                  <span className="capture-hint">{mode.blurb}</span>
                  <button className="btn btn-sm" onClick={startCapture}>
                    Record again
                  </button>
                </>
              ) : (
                <>
                  <span className="capture-hint">{mode.blurb}</span>
                  <button className="btn btn-primary" onClick={startCapture}>
                    Start recording
                  </button>
                </>
              )}
            </div>

            <Warnings warnings={warnings} />
            {clash && (
              <div className="notice notice-caution" role="alert">
                <TriangleAlert size={ICON.xs} />
                <span>
                  The same trigger is already used by <strong>{clash.name}</strong>. Both will fire.
                </span>
              </div>
            )}
          </Step>

          {/* ------------------------------------------------------- action */}
          <Step n={2} title="Action" done={actionReady}>
            <div className="action-grid">
              {ACTION_ORDER.map((kind) => {
                const Icon = ACTION_ICONS[kind];
                return (
                  <button
                    key={kind}
                    className="action-opt"
                    aria-pressed={editor.action.kind === kind}
                    onClick={() => patch({ action: defaultAction(kind) })}
                  >
                    <Icon size={ICON.sm} />
                    <span>{ACTION_KIND_LABEL[kind]}</span>
                  </button>
                );
              })}
            </div>

            <ActionFields action={editor.action} onChange={(action) => patch({ action })} />

            <div className="row">
              <button className="btn btn-sm" disabled={!actionReady || testing} onClick={runTest}>
                <Play size={ICON.xs} />
                {testing ? 'Running…' : 'Test now'}
              </button>
              <span className="field-hint">
                Runs once against whatever window is in front — click away first if you are testing
                keystrokes.
              </span>
            </div>
          </Step>

          {/* ------------------------------------------------------ details */}
          <Step n={3} title="Details" done={editor.name.trim().length > 0}>
            <Field label="Name" htmlFor={nameId}>
              <input
                id={nameId}
                className="input"
                value={editor.name}
                placeholder={describeAction(editor.action)}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field
              label="Cooldown"
              hint="Minimum gap before this shortcut can fire again. Guards against accidental repeats."
            >
              <div className="row">
                <input
                  className="input num-input"
                  type="number"
                  min={0}
                  step={50}
                  aria-label="Cooldown in milliseconds"
                  value={editor.cooldownMs}
                  onChange={(e) => patch({ cooldownMs: Math.max(0, Number(e.target.value) || 0) })}
                />
                <span className="unit">ms</span>
              </div>
            </Field>
          </Step>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <div className="spacer" />
          <button className="btn btn-primary" disabled={!canSave} onClick={save}>
            {editor.id ? 'Save changes' : 'Create shortcut'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionFields({
  action,
  onChange,
}: {
  action: Action;
  onChange: (action: Action) => void;
}) {
  switch (action.kind) {
    case 'sendKeys':
      return (
        <Field
          label="Keys to press"
          hint={
            <>
              Join keys with <code>+</code>. For example <code>ctrl+c</code>,{' '}
              <code>ctrl+shift+esc</code>, <code>win+d</code>, <code>alt+f4</code>.
            </>
          }
        >
          <input
            className="input"
            value={action.combo}
            placeholder="ctrl+shift+t"
            onChange={(e) => onChange({ ...action, combo: e.target.value })}
          />
        </Field>
      );

    case 'typeText':
      return (
        <Field label="Text to type" hint="Typed as Unicode, so emoji and accents work.">
          <textarea
            className="textarea"
            value={action.text}
            placeholder="Anything you retype often…"
            onChange={(e) => onChange({ ...action, text: e.target.value })}
          />
        </Field>
      );

    case 'launch':
      return (
        <div className="col">
          <Field label="Program">
            <div className="row">
              <input
                className="input"
                value={action.target}
                placeholder="C:\\Windows\\System32\\notepad.exe"
                onChange={(e) => onChange({ ...action, target: e.target.value })}
              />
              <button
                className="btn"
                onClick={async () => {
                  const picked = await window.shortcut.pickExecutable();
                  if (picked) onChange({ ...action, target: picked });
                }}
              >
                Browse
              </button>
            </div>
          </Field>
          <Field label="Arguments" hint="Optional. Quote anything containing spaces.">
            <input
              className="input"
              value={action.args}
              onChange={(e) => onChange({ ...action, args: e.target.value })}
            />
          </Field>
        </div>
      );

    case 'openPath':
      return (
        <Field label="File or folder">
          <div className="row">
            <input
              className="input"
              value={action.path}
              placeholder="C:\\Users\\you\\Documents"
              onChange={(e) => onChange({ ...action, path: e.target.value })}
            />
            <button
              className="btn"
              onClick={async () => {
                const picked = await window.shortcut.pickPath();
                if (picked) onChange({ ...action, path: picked });
              }}
            >
              Browse
            </button>
          </div>
        </Field>
      );

    case 'openUrl':
      return (
        <Field label="Website" hint="Opens in your default browser.">
          <input
            className="input"
            value={action.url}
            placeholder="github.com"
            onChange={(e) => onChange({ ...action, url: e.target.value })}
          />
        </Field>
      );

    case 'runCommand':
      return (
        <div className="col">
          <Field label="Shell">
            <select
              className="select"
              value={action.shell}
              onChange={(e) =>
                onChange({ ...action, shell: e.target.value as 'cmd' | 'powershell' })
              }
            >
              <option value="powershell">PowerShell</option>
              <option value="cmd">Command Prompt</option>
            </select>
          </Field>
          <Field label="Command" hint="Runs hidden, with no window.">
            <textarea
              className="textarea"
              value={action.command}
              placeholder="Start-Process explorer 'shell:Downloads'"
              onChange={(e) => onChange({ ...action, command: e.target.value })}
            />
          </Field>
        </div>
      );

    case 'media':
      return (
        <Field label="Media control">
          <select
            className="select"
            value={action.op}
            onChange={(e) => onChange({ ...action, op: e.target.value as typeof action.op })}
          >
            <option value="playPause">Play / pause</option>
            <option value="nextTrack">Next track</option>
            <option value="prevTrack">Previous track</option>
            <option value="stop">Stop</option>
            <option value="volumeUp">Volume up</option>
            <option value="volumeDown">Volume down</option>
            <option value="mute">Toggle mute</option>
          </select>
        </Field>
      );

    case 'window':
      return (
        <Field label="Do what to the active window">
          <select
            className="select"
            value={action.op}
            onChange={(e) => onChange({ ...action, op: e.target.value as typeof action.op })}
          >
            <option value="minimize">Minimize</option>
            <option value="maximize">Maximize</option>
            <option value="restore">Restore</option>
            <option value="close">Close</option>
          </select>
        </Field>
      );

    case 'system':
      return (
        <Field label="System action">
          <select
            className="select"
            value={action.op}
            onChange={(e) => onChange({ ...action, op: e.target.value as typeof action.op })}
          >
            <option value="lock">Lock the PC</option>
            <option value="showDesktop">Show desktop</option>
            <option value="taskView">Open Task View</option>
            <option value="screenshot">Screenshot region</option>
          </select>
        </Field>
      );
  }
}
