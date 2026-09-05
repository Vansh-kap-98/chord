/**
 * The Chord mark: a mouse seen from above, four panels around a scroll wheel,
 * drawn in `currentColor` so it wears whatever accent the app is showing.
 *
 * The geometry is the same one scripts/make-icons.mjs rasterises for the tray,
 * window and installer icons, so the logo in the rail and the icon in the
 * taskbar are one drawing rather than two that merely resemble each other.
 * Coordinates come from that file's 0..1 mark space mapped onto this viewBox
 * (x = u * 100, y = v * 148, the 148 from the mark's own boxW/boxH ratio),
 * with each panel offset outward by the generator's `round`.
 *
 * The corners are real quadratic arcs rather than mitred vertices softened by
 * stroke-linejoin. The rasteriser rounds every corner by dilating its polygons
 * with a disc, and a plain <polygon> came out visibly sharper than the icon
 * beside it -- close enough to look like a mistake rather than a variant.
 *
 * Keep this in step with MOUSE in scripts/make-icons.mjs if that changes.
 */
export function ChordMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={(size * 112) / 160}
      height={size}
      viewBox="-6 -6 112 160"
      fill="none"
      stroke="currentColor"
      // Lighter than the rasteriser's 5.2: an icon has to survive being
      // flattened to 16px, but this is a crisp vector at a known size, and the
      // heavier weight closed up the wheel's two rings into blobs.
      strokeWidth={4.2}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M44,58.4 Q44,64.4 38.1,63.5 L10,59.5 Q4.1,58.6 4.6,52.6 L7.2,25.3 Q7.7,19.3 13,16.6 L38.7,3.5 Q44,0.8 44,6.8 L44,58.4 Z" />
      <path d="M56,6.8 Q56,0.8 61.3,3.5 L87,16.6 Q92.3,19.3 92.8,25.3 L95.4,52.6 Q95.9,58.6 90,59.5 L61.9,63.5 Q56,64.4 56,58.4 L56,6.8 Z" />
      <path d="M44,141.5 Q44,147.5 38.5,145.1 L14.2,134.2 Q8.7,131.8 8.2,125.8 L3.6,67.5 Q3.1,61.5 9.1,62.2 L38,65.6 Q44,66.3 44,72.3 L44,141.5 Z" />
      <path d="M56,72.3 Q56,66.3 62,65.6 L90.9,62.2 Q96.9,61.5 96.4,67.5 L91.8,125.8 Q91.3,131.8 85.8,134.2 L61.5,145.1 Q56,147.5 56,141.5 L56,72.3 Z" />
      <ellipse cx="50" cy="40.8" rx="8.2" ry="10" />
      <ellipse cx="50" cy="60.8" rx="8.2" ry="10" />
    </svg>
  );
}
