/**
 * The signal colour is the engine state.
 *
 * While the hook is listening the whole app wears the user's chosen live
 * colour (green by default); the moment it is paused everything shifts to
 * amber. So "is this thing actually listening?" is answerable from any pixel
 * of the window, not just a badge in the corner.
 *
 * Each entry ships its own ink and text tints because contrast cannot be
 * derived safely by lightening at runtime:
 *
 *   - `ink`  sits on top of `brand` (button labels) — >= 4.5:1 on the fill.
 *   - `text` is brand-as-text on our dark surfaces — >= 4.5:1 on --surface.
 */
export interface Accent {
  id: string;
  name: string;
  brand: string;
  lift: string;
  ink: string;
  text: string;
}

/**
 * Choices for the *listening* colour. Paused is not selectable.
 *
 * `text` is normally the accent itself — these are light enough to read on our
 * dark surfaces. Black is the exception: it cannot be its own text colour, so
 * it borrows a light neutral. Black also makes the weakest state signal, since
 * a near-black accent all but disappears against the dark chrome.
 */
export const PALETTE: Accent[] = [
  { id: 'green', name: 'Green', brand: '#3fb950', lift: '#4ac95c', ink: '#04160a', text: '#5ed172' },
  { id: 'pink', name: 'Pastel pink', brand: '#f4b0c8', lift: '#f8c3d5', ink: '#2a0c17', text: '#f4b0c8' },
  { id: 'white', name: 'White', brand: '#eceff5', lift: '#ffffff', ink: '#101317', text: '#eceff5' },
  { id: 'black', name: 'Black', brand: '#101318', lift: '#1b1f26', ink: '#eceff5', text: '#c3c9d4' },
  { id: 'coral', name: 'Coral red', brand: '#f2705c', lift: '#ff8571', ink: '#2a0a04', text: '#f78a79' },
  { id: 'tan', name: 'Tan', brand: '#d2b48c', lift: '#dfc4a2', ink: '#241a0c', text: '#d2b48c' },
];

/**
 * Fixed: this yellow-orange always means "not listening". Warm enough to read
 * as a halt without tipping into the red used for destructive actions.
 * Mirrored in scripts/make-icons.mjs and PAUSED_HEX in electron/main.ts.
 */
export const PAUSED_ACCENT: Accent = {
  id: 'paused',
  name: 'Yellow-orange',
  brand: '#e8892b',
  lift: '#f59b3d',
  ink: '#1f1204',
  text: '#f2a75a',
};

export const DEFAULT_ACCENT = PALETTE[0];

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function accentFor(value: string): Accent {
  return PALETTE.find((a) => a.brand === value) ?? DEFAULT_ACCENT;
}

/**
 * Writes the accent for the current engine state onto the document.
 * `running` picks between the user's live colour and the paused amber.
 */
export function applyTheme(accentValue: string, running: boolean): void {
  const a = running ? accentFor(accentValue) : PAUSED_ACCENT;
  const root = document.documentElement.style;
  root.setProperty('--brand', a.brand);
  root.setProperty('--brand-lift', a.lift);
  root.setProperty('--brand-ink', a.ink);
  root.setProperty('--brand-text', a.text);
  root.setProperty('--brand-wash', `rgba(${rgb(a.brand)}, 0.13)`);
  root.setProperty('--brand-edge', `rgba(${rgb(a.brand)}, 0.4)`);
  root.setProperty('--brand-pulse', `rgba(${rgb(a.brand)}, 0.5)`);
  root.setProperty('--brand-pulse-out', `rgba(${rgb(a.brand)}, 0)`);
}
