import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Info,
  OctagonAlert,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Direction, Trigger } from '@shared/types';
import { CHAIN_CONNECTOR, describeTrigger, tokenLabel, triggerChips } from '@shared/tokens';
import type { TriggerWarning } from '@shared/warnings';
import { ICON } from '../icons';
import { useApp } from '../state';

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="toggle"
      data-on={on}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

const DIRECTION_ICON: Record<Direction, typeof ArrowUp> = {
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
};

/**
 * A stroke path drawn with real icons.
 *
 * Arrow *glyphs* are still used inside keycaps, because there they are the
 * legend printed on a physical arrow key. A gesture is a direction, not a key,
 * so it gets icons.
 */
export function GesturePath({ path }: { path: Direction[] }) {
  return (
    <span className="gesture-path">
      {path.map((d, i) => {
        const Icon = DIRECTION_ICON[d];
        return <Icon key={i} size={ICON.sm} strokeWidth={2.25} />;
      })}
    </span>
  );
}

/**
 * Renders a trigger as keycaps. The whole run carries one label so a screen
 * reader announces "Right Ctrl then M" instead of spelling out loose spans.
 */
export function TriggerChips({ trigger, large = false }: { trigger: Trigger; large?: boolean }) {
  const cap = large ? 'keycap keycap-lg' : 'keycap';
  // The visible chain uses one connector for every kind; the semantic wording
  // survives in aria-label via describeTrigger.
  const sep = (
    <span className="chip-sep" aria-hidden="true">
      {CHAIN_CONNECTOR}
    </span>
  );

  if (trigger.kind === 'gesture') {
    return (
      <span className="chips" role="img" aria-label={describeTrigger(trigger)}>
        <span className={cap}>{tokenLabel(trigger.button)}</span>
        {sep}
        <GesturePath path={trigger.path} />
      </span>
    );
  }

  return (
    <span className="chips" role="img" aria-label={describeTrigger(trigger)}>
      {triggerChips(trigger).map((chip, i) => (
        <span className="chips" key={`${chip}-${i}`}>
          {i > 0 && sep}
          <span className={cap} title={chip}>
            {chip}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Capitalises the first letter only, leaving the rest of the string alone.
 *
 * A full sentence-case pass would wreck key names — "Right Ctrl, then M"
 * becoming "Right ctrl, then m" — so this only fixes the actual inconsistency,
 * which is titles that start lowercase sitting next to titles that do not.
 */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const WARNING_ICON = {
  danger: OctagonAlert,
  caution: TriangleAlert,
  info: Info,
} as const;

export function Warnings({ warnings }: { warnings: TriggerWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="col" style={{ gap: 'var(--s2)' }}>
      {warnings.map((w, i) => {
        const Icon = WARNING_ICON[w.level];
        return (
          <div key={i} className={`notice notice-${w.level}`} role="note">
            <Icon size={ICON.xs} />
            <span>{w.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

/** Placeholder rows shown while the first snapshot is still in flight. */
export function ShortcutSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="sc-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        // Mirrors the five columns of a real row so nothing shifts on load.
        <div key={i} className="sc" style={{ opacity: 1 - i * 0.22 }}>
          <span className="skeleton" style={{ width: 34, height: 20, borderRadius: 99 }} />
          <span className="skeleton" style={{ width: `${76 - i * 12}%`, height: 12 }} />
          <span className="skeleton" style={{ width: `${64 - i * 9}%`, height: 20 }} />
          <span className="skeleton" style={{ width: 62, height: 12 }} />
          <span />
        </div>
      ))}
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}`}
          role="status"
          onClick={() => dismiss(t.id)}
          title="Dismiss"
        >
          {t.kind === 'ok' ? <CheckCircle2 size={ICON.xs} /> : <OctagonAlert size={ICON.xs} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRelative(at: number | null): string {
  if (!at) return 'never';
  const secs = Math.round((Date.now() - at) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}
