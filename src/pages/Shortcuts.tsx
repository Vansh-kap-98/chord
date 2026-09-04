import { useMemo, useState } from 'react';
import { ArrowRight, Copy, Pencil, Pin, Play, Plus, Search, Trash2, Zap } from 'lucide-react';
import type { Shortcut, Trigger } from '@shared/types';
import {
  describeAction,
  describeTrigger,
  TRIGGER_GROUP_LABEL,
  TRIGGER_GROUP_ORDER,
} from '@shared/tokens';
import { ICON } from '../icons';
import { useApp } from '../state';
import {
  formatRelative,
  sentenceCase,
  ShortcutSkeleton,
  Toggle,
  TriggerChips,
} from '../components/Bits';
import { HelperErrorBanner } from '../components/Shell';

export function ShortcutsPage() {
  const shortcuts = useApp((s) => s.shortcuts);
  const ready = useApp((s) => s.ready);
  const openEditor = useApp((s) => s.openEditor);
  const flashId = useApp((s) => s.flashId);
  const toast = useApp((s) => s.toast);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shortcuts;
    return shortcuts.filter((s) =>
      [s.name, describeTrigger(s.trigger), describeAction(s.action)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [shortcuts, query]);

  const active = shortcuts.filter((s) => s.enabled).length;

  /** Split into sections by trigger kind, dropping any that end up empty. */
  const groups = useMemo(() => {
    return TRIGGER_GROUP_ORDER.map((kind: Trigger['kind']) => ({
      kind,
      items: filtered.filter((s) => s.trigger.kind === kind),
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  const duplicate = async (s: Shortcut) => {
    await window.shortcut.addShortcut({
      name: `${s.name} (copy)`,
      enabled: false,
      trigger: s.trigger,
      action: s.action,
      cooldownMs: s.cooldownMs,
    });
    toast('ok', 'Duplicated — set a new trigger before enabling it');
  };

  const runNow = async (s: Shortcut) => {
    const result = await window.shortcut.testAction(s.action);
    if (result.ok) toast('ok', `Ran "${s.name}"`);
    else toast('err', result.error ?? 'Action failed');
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Shortcuts</h1>
          <p className="page-sub">
            {shortcuts.length === 0
              ? 'Nothing bound yet.'
              : `${active} of ${shortcuts.length} listening for input.`}
          </p>
        </div>
        <div className="page-head-actions">
          <div className="search">
            <Search size={ICON.sm} />
            <input
              className="input"
              placeholder="Search"
              aria-label="Search shortcuts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => openEditor()}>
            <Plus size={ICON.xs} />
            New
          </button>
        </div>
      </header>

      <HelperErrorBanner />

      {!ready ? (
        <ShortcutSkeleton />
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-head">
            <Zap size={ICON.md} aria-hidden="true" />
            <span className="empty-title">
              {shortcuts.length === 0 ? 'No shortcuts yet' : `Nothing matches “${query}”`}
            </span>
          </div>
          <span className="empty-text">
            {shortcuts.length === 0
              ? 'Record a combo, a key sequence, a double or triple click, or a mouse gesture — then point it at whatever you want it to do.'
              : 'Try a different word, or clear the search box.'}
          </span>
          {shortcuts.length === 0 ? (
            <button className="btn btn-primary" onClick={() => openEditor()}>
              <Plus size={ICON.sm} />
              Create your first shortcut
            </button>
          ) : (
            <button className="btn" onClick={() => setQuery('')}>
              Clear search
            </button>
          )}
        </div>
      ) : (
        groups.map(({ kind, items }) => (
          <section className="sc-group" key={kind}>
            <h2 className="sc-group-label">
              {TRIGGER_GROUP_LABEL[kind]}
              <span className="sc-group-count">{items.length}</span>
            </h2>
            <ul className="sc-list">
              {items.map((s) => (
                <li key={s.id} className="sc" data-off={!s.enabled} data-fired={flashId === s.id}>
                  <Toggle
                    on={s.enabled}
                    label={`Enable ${s.name}`}
                    onChange={(enabled) => void window.shortcut.updateShortcut(s.id, { enabled })}
                  />

                  <span className="sc-name" title={sentenceCase(s.name)}>
                    {s.pinned && (
                      <Pin size={11} className="sc-pin" aria-label="Pinned to the tray menu" />
                    )}
                    {sentenceCase(s.name)}
                  </span>

                  <div className="sc-flow">
                    <TriggerChips trigger={s.trigger} />
                    <span className="sc-arrow" aria-hidden="true">
                      <ArrowRight size={ICON.xs} />
                    </span>
                    <span className="sc-action">{describeAction(s.action)}</span>
                  </div>

                  <div className="sc-metrics">
                    <span className="sc-count">{s.fireCount > 0 ? `${s.fireCount}×` : '—'}</span>
                    <span className="sc-when">{formatRelative(s.lastFiredAt)}</span>
                  </div>

                  <div className="sc-tools">
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title={s.pinned ? 'Unpin from tray menu' : 'Pin to tray menu'}
                      aria-label={`${s.pinned ? 'Unpin' : 'Pin'} ${s.name}`}
                      aria-pressed={s.pinned}
                      onClick={() =>
                        void window.shortcut.updateShortcut(s.id, { pinned: !s.pinned })
                      }
                    >
                      <Pin size={ICON.sm} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Run now"
                      aria-label={`Run ${s.name} now`}
                      onClick={() => void runNow(s)}
                    >
                      <Play size={ICON.sm} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Duplicate"
                      aria-label={`Duplicate ${s.name}`}
                      onClick={() => void duplicate(s)}
                    >
                      <Copy size={ICON.sm} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Edit"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => openEditor(s)}
                    >
                      <Pencil size={ICON.sm} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm btn-danger"
                      title="Delete"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => void window.shortcut.deleteShortcut(s.id)}
                    >
                      <Trash2 size={ICON.sm} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
