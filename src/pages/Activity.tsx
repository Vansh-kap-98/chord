import { CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { ICON } from '../icons';
import { useApp } from '../state';
import { formatTime } from '../components/Bits';

export function ActivityPage() {
  const fires = useApp((s) => s.fires);
  const clear = useApp((s) => s.clearFires);
  const shortcuts = useApp((s) => s.shortcuts);

  const totalFires = shortcuts.reduce((sum, s) => sum + s.fireCount, 0);
  const busiest = [...shortcuts].sort((a, b) => b.fireCount - a.fireCount)[0];
  const failures = fires.filter((f) => !f.ok).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-sub">Every shortcut that fired since the app started.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={clear} disabled={fires.length === 0}>
            <Trash2 size={ICON.sm} />
            Clear
          </button>
        </div>
      </header>

      <section className="section">
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-value">{fires.length}</div>
            <div className="stat-label">This session</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totalFires.toLocaleString()}</div>
            <div className="stat-label">All time</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ color: failures ? 'var(--danger)' : undefined }}>
              {failures}
            </div>
            <div className="stat-label">Failed</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ fontSize: 'var(--fs-ui)', fontWeight: 500 }}>
              {busiest && busiest.fireCount > 0 ? busiest.name : '—'}
            </div>
            <div className="stat-label">Most used</div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Log</div>
        <div className="card">
          {fires.length === 0 ? (
            <div className="empty empty-inline">
              Nothing has fired yet. Trigger a shortcut and it appears here instantly.
            </div>
          ) : (
            fires.map((f) => (
              <div key={f.id} className="log-row">
                {f.ok ? (
                  <CheckCircle2 size={ICON.xs} color="var(--ok)" />
                ) : (
                  <XCircle size={ICON.xs} color="var(--danger)" />
                )}
                <span className="log-time">{formatTime(f.at)}</span>
                <span className="log-name">{f.shortcutName}</span>
                <span className="log-detail">
                  <span className="keycap">{f.triggerLabel}</span>
                  <span style={{ color: f.ok ? undefined : 'var(--danger)' }}>
                    {f.ok ? f.actionLabel : f.error}
                  </span>
                  <span className="log-latency">{f.latencyMs}ms</span>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
