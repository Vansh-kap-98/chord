import type { ReactNode } from 'react';
import { Download, FolderOpen, Info, LogOut, Upload } from 'lucide-react';
import type { Settings } from '@shared/types';
import { ICON } from '../icons';
import { useApp } from '../state';
import { PALETTE } from '../theme';
import { Toggle } from '../components/Bits';

function Row({
  name,
  desc,
  children,
}: {
  name: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting">
      <div className="setting-text">
        <div className="setting-name">{name}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const storePath = useApp((s) => s.storePath);
  const version = useApp((s) => s.version);
  const toast = useApp((s) => s.toast);

  const patch = (p: Partial<Settings>) => void window.shortcut.setSettings(p);

  const num = (key: keyof Settings, label: string, min: number, max: number) => (
    <>
      <input
        className="input num-input"
        type="number"
        min={min}
        max={max}
        step={50}
        aria-label={`${label} in milliseconds`}
        value={settings[key] as number}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) {
            patch({ [key]: Math.min(max, Math.max(min, v)) } as Partial<Settings>);
          }
        }}
      />
      <span className="unit">ms</span>
    </>
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Chord {version || '—'}</p>
        </div>
      </header>

      <section className="section">
        <div className="section-title">Startup</div>
        <div className="card">
          <Row
            name="Start with Windows"
            desc="Registers Chord to launch at sign-in. Takes effect in the installed build — running from source cannot register a stable path."
          >
            <Toggle
              on={settings.autoStart}
              label="Start with Windows"
              onChange={(autoStart) => patch({ autoStart })}
            />
          </Row>
          <Row
            name="Start hidden in the tray"
            desc="When launched at sign-in, go straight to the tray instead of opening this window."
          >
            <Toggle
              on={settings.startMinimized}
              label="Start hidden in the tray"
              onChange={(startMinimized) => patch({ startMinimized })}
            />
          </Row>
          <Row
            name="Close button hides to tray"
            desc="Turn this off to make the close button quit the app outright."
          >
            <Toggle
              on={settings.minimizeToTray}
              label="Close button hides to tray"
              onChange={(minimizeToTray) => patch({ minimizeToTray })}
            />
          </Row>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Engine</div>
        <div className="card">
          <Row name="Listen for shortcuts" desc="The master switch. Also available from the tray icon.">
            <Toggle
              on={settings.engineEnabled}
              label="Listen for shortcuts"
              onChange={(enabled) => void window.shortcut.setEngineEnabled(enabled)}
            />
          </Row>
          <Row
            name="Notify me when an action fails"
            desc="Shows a Windows notification if a shortcut fires but its action errors."
          >
            <Toggle
              on={settings.showNotifications}
              label="Notify me when an action fails"
              onChange={(showNotifications) => patch({ showNotifications })}
            />
          </Row>
          <Row
            name="Sequence gap"
            desc="Default time allowed between steps when recording a new key sequence."
          >
            {num('defaultSequenceGapMs', 'Sequence gap', 200, 3000)}
          </Row>
          <Row
            name="Multi-click window"
            desc="Default time allowed between clicks for a new double or triple click trigger."
          >
            {num('defaultMultiClickWindowMs', 'Multi-click window', 150, 1200)}
          </Row>
          <Row
            name="Echo guard"
            desc="After Chord sends keystrokes of its own, it ignores input for this long so an action cannot retrigger its own shortcut."
          >
            {num('echoGuardMs', 'Echo guard', 50, 1000)}
          </Row>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Appearance</div>
        <div className="card">
          <Row
            name="Listening colour"
            desc="The whole app wears this colour while the engine is listening, and turns amber the moment it is paused — so you can tell at a glance without reading anything."
          >
            <div className="swatches" role="group" aria-label="Listening colour">
              {PALETTE.map((a) => (
                <button
                  key={a.id}
                  className="swatch"
                  aria-pressed={settings.accent === a.brand}
                  aria-label={a.name}
                  title={a.name}
                  style={{ background: a.brand }}
                  onClick={() => patch({ accent: a.brand })}
                />
              ))}
            </div>
          </Row>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Your shortcuts</div>
        <div className="card">
          <Row name="Backup and restore" desc="Shortcuts are plain JSON — easy to move between PCs.">
            <button
              className="btn btn-sm"
              onClick={async () => {
                const r = await window.shortcut.exportShortcuts();
                if (r.ok) toast('ok', 'Exported');
                else if (r.error !== 'cancelled') toast('err', r.error ?? 'Export failed');
              }}
            >
              <Download size={ICON.xs} />
              Export
            </button>
            <button
              className="btn btn-sm"
              onClick={async () => {
                const r = await window.shortcut.importShortcuts();
                if (r.ok) toast('ok', 'Imported — replaced your shortcut list');
                else if (r.error !== 'cancelled') toast('err', r.error ?? 'Import failed');
              }}
            >
              <Upload size={ICON.xs} />
              Import
            </button>
          </Row>
          <Row name="Storage location">
            <button className="btn btn-sm" onClick={() => void window.shortcut.revealStore()}>
              <FolderOpen size={ICON.xs} />
              Show file
            </button>
          </Row>
          <div className="setting">
            <span className="mono-path">{storePath}</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Good to know</div>
        <div className="notice notice-info notice-lead">
          <Info size={ICON.sm} />
          <span>
            Chord <strong>observes</strong> input rather than intercepting it, so a trigger never
            replaces what the keys or clicks already do — your action runs in addition. That is why
            side buttons, triple-clicks, gestures and leader sequences make the best triggers:
            almost nothing else is listening for them.
          </span>
        </div>
      </section>

      <section className="section">
        <button className="btn btn-danger" onClick={() => void window.shortcut.quitApp()}>
          <LogOut size={ICON.sm} />
          Quit Chord
        </button>
      </section>
    </div>
  );
}
