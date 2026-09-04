/**
 * One icon scale for the whole app.
 *
 * Every lucide icon picks a size from here rather than guessing per component,
 * so glyph weight stays even next to the type scale it sits beside.
 */
export const ICON = {
  /** Inline with micro/meta text: badges, log rows, notices. */
  xs: 13,
  /** The default. Buttons, nav, tabs, tools — anything at UI text size. */
  sm: 14,
  /** Page- and section-level: empty states, stage affordances. */
  md: 16,
  /** Feature moments only. */
  lg: 20,
} as const;
