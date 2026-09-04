import { Keyboard } from 'lucide-react';
import { ICON } from '../icons';
import { useApp } from '../state';
import { formatTime } from '../components/Bits';

const KIND_LABEL: Record<string, string> = {
  keydown: 'key down',
  keyup: 'key up',
  mousedown: 'press',
  mouseup: 'release',
  wheel: 'wheel',
};

function formatUptime(secs: number): string {
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  if (secs >= 60) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${secs}s`;
}

export function MonitorPage() {
  const events = useApp((s) => s.events);
  const held = useApp((s) => s.held);
  const status = useApp((s) => s.status);

  const uptime = status.startedAt
    ? Math.max(0, Math.round((Date.now() - status.startedAt) / 1000))
    : 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Input monitor</h1>
          <p className="page-sub">
            Everything the engine sees, system-wide. Use it to confirm a key or button is detected
            before you bind it.
          </p>
        </div>
      </header>

      <section className="section">
        <div className="section-title">Held right now</div>
        <div className="held-stage" aria-live="polite">
          {held.length === 0 ? (
            <span className="held-empty">
              <Keyboard size={ICON.sm} />
              press anything
            </span>
          ) : (
            held.map((token) => (
              <span key={token} className="keycap keycap-lg keycap-accent">
                {token.replace(/^(Key|Mouse|Wheel)\./, '')}
              </span>
            ))
          )}
        </div>
      </section>

      <section className="section">
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-value">{status.eventsSeen.toLocaleString()}</div>
            <div className="stat-label">Events captured</div>
          </div>
          <div className="stat">
            <div className="stat-value">{status.running ? formatUptime(uptime) : '—'}</div>
            <div className="stat-label">Listening for</div>
          </div>
          <div className="stat">
            {/* Engine state follows the accent; only outcomes use ok/danger. */}
            <div className="stat-value" style={{ color: 'var(--brand-text)' }}>
              {status.running ? 'Live' : 'Paused'}
            </div>
            <div className="stat-label">Hook</div>
          </div>
          <div className="stat">
            <div
              className="stat-value"
              style={{
                color: status.synthReady
                  ? 'var(--ok)'
                  : status.synthError
                    ? 'var(--danger)'
                    : 'var(--caution)',
              }}
            >
              {status.synthReady ? 'Ready' : status.synthError ? 'Failed' : 'Starting'}
            </div>
            <div className="stat-label">Input helper</div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Event stream</div>
        <div className="card">
          {events.length === 0 ? (
            <div className="empty empty-inline">
              {status.running
                ? 'Listening. Press a key or move the mouse and events appear here.'
                : 'Listening is paused, so no events are being captured.'}
            </div>
          ) : (
            <div className="stream">
              {events.map((e) => (
                <div key={e.id} className="stream-row">
                  <span className="stream-time">{formatTime(e.at)}</span>
                  <span className="stream-kind">{KIND_LABEL[e.type] ?? e.type}</span>
                  <span className="keycap">{e.label}</span>
                  {e.type === 'mousedown' && e.clicks && e.clicks > 1 ? (
                    <span className="badge badge-accent">{e.clicks}× click</span>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
