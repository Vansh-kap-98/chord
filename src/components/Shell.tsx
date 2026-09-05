import {
  Activity,
  Keyboard,
  Minus,
  Pause,
  Play,
  Settings as SettingsIcon,
  Square,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { ICON } from '../icons';
import { useApp, type Page } from '../state';
import { ChordMark } from './ChordMark';

/** Settings is rendered separately, pinned to the bottom of the rail. */
const NAV: Array<{ id: Page; label: string; icon: typeof Zap }> = [
  { id: 'shortcuts', label: 'Shortcuts', icon: Zap },
  { id: 'monitor', label: 'Input monitor', icon: Keyboard },
  { id: 'activity', label: 'Activity', icon: Activity },
];

const SETTINGS_NAV = { id: 'settings' as Page, label: 'Settings', icon: SettingsIcon };

export function TitleBar() {
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);

  const toggleEngine = () => void window.shortcut.setEngineEnabled(!settings.engineEnabled);

  return (
    <header className="titlebar">
      {/* The mark now lives at the top of the rail, so the bar carries the
          wordmark alone rather than repeating the logo. */}
      <div className="titlebar-brand">Chord</div>

      <div className="titlebar-spacer" />

      <div className="titlebar-actions">
        <button className="btn btn-sm btn-ghost" onClick={toggleEngine}>
          {settings.engineEnabled ? <Pause size={ICON.xs} /> : <Play size={ICON.xs} />}
          {settings.engineEnabled ? 'Pause' : 'Resume'}
        </button>
        <span className="badge badge-accent">{status.running ? 'Listening' : 'Paused'}</span>
      </div>

      <div className="win-controls">
        <button
          className="win-btn"
          aria-label="Minimize"
          onClick={() => void window.shortcut.minimizeWindow()}
        >
          <Minus size={ICON.sm} />
        </button>
        <button
          className="win-btn"
          aria-label="Maximize or restore"
          onClick={() => void window.shortcut.toggleMaximize()}
        >
          <Square size={ICON.xs} strokeWidth={1.6} />
        </button>
        <button
          className="win-btn win-btn-close"
          aria-label="Close to tray"
          title="Closes to the tray — Chord keeps listening"
          onClick={() => void window.shortcut.hideWindow()}
        >
          <X size={ICON.sm} />
        </button>
      </div>
    </header>
  );
}

function RailItem({ id, label, icon: Icon }: { id: Page; label: string; icon: typeof Zap }) {
  const page = useApp((s) => s.page);
  const setPage = useApp((s) => s.setPage);
  return (
    <button
      className="rail-item"
      aria-current={page === id ? 'page' : undefined}
      onClick={() => setPage(id)}
    >
      <Icon size={ICON.sm} />
      <span className="rail-label">{label}</span>
    </button>
  );
}

export function Rail() {
  return (
    <nav className="rail" aria-label="Sections">
      <div className="rail-brand">
        <span className="rail-logo" aria-hidden="true">
          <ChordMark size={40} />
        </span>
        {/* Written in sentence case and uppercased in CSS, so a screen reader
            says "Chord" rather than spelling it out. */}
        <span className="rail-wordmark">Chord</span>
      </div>
      {NAV.map((item) => (
        <RailItem key={item.id} {...item} />
      ))}
      <span className="rail-spacer" />
      <RailItem {...SETTINGS_NAV} />
    </nav>
  );
}

/** One thin line along the bottom of the content area. */
export function StatusBar() {
  const status = useApp((s) => s.status);
  const settings = useApp((s) => s.settings);
  const shortcuts = useApp((s) => s.shortcuts);

  const helperFailed = !status.synthReady && !!status.synthError;
  const active = shortcuts.filter((s) => s.enabled).length;

  return (
    <footer className="statusbar">
      <span className="statusbar-item">
        <span className="status-dot" data-live={status.running} aria-hidden="true" />
        <span className="statusbar-state">
          {status.running ? 'Listening' : settings.engineEnabled ? 'Starting' : 'Paused'}
        </span>
      </span>
      <span className="statusbar-sep" aria-hidden="true" />
      <span className="statusbar-item">{active} active</span>
      <span className="statusbar-sep" aria-hidden="true" />
      <span className="statusbar-item">{status.eventsSeen.toLocaleString()} events</span>
      <span className="statusbar-sep" aria-hidden="true" />
      <span className={`statusbar-item${helperFailed ? ' status-warn' : ''}`}>
        {status.synthReady
          ? 'Input helper ready'
          : helperFailed
            ? 'Input helper failed'
            : 'Input helper starting'}
      </span>
    </footer>
  );
}

/** Shown on the shortcuts page when input synthesis is unavailable. */
export function HelperErrorBanner() {
  const status = useApp((s) => s.status);
  if (status.synthReady || !status.synthError) return null;
  return (
    <div className="notice notice-danger" role="alert" style={{ marginBottom: 'var(--s4)' }}>
      <TriangleAlert size={ICON.sm} />
      <span>
        The input helper did not start, so actions that send keys, type text or control media
        cannot run. Everything else still works.
        <br />
        <span className="mono-path">{status.synthError}</span>
      </span>
    </div>
  );
}
