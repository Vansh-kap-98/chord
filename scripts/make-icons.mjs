/**
 * Generates the app icon set from code, so the repo carries no opaque binaries.
 *
 *   build/icon.ico        - multi-size, consumed by electron-builder for the
 *                           installer and the exe's own icon
 *   build/icon.png        - 256px, the default window icon
 *   build/icon-<hex>.png  - 256px window/taskbar icon, one per accent
 *   build/tray-<hex>.png  - 32px tray glyph, one per accent
 *   build/tray-<hex>@2x   - 64px, for high-DPI trays
 *
 * Run with: node scripts/make-icons.mjs
 *
 * The mark is a mouse seen from above, split into four panels around a scroll
 * wheel, drawn as outlines in the accent colour on a transparent ground. The
 * strokes themselves carry the colour, so the whole mark changes with the
 * theme and with the engine's state.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');

// ---------------------------------------------------------------- geometry

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Signed distance to a polygon: negative inside, positive outside, and equal
 * to the true euclidean distance either way. Subtracting a constant from the
 * result dilates the shape with rounded corners, which is how the panels get
 * their radius without carrying one vertex per corner.
 */
function sdPolygon(px, py, v) {
  const n = v.length;
  let dx0 = px - v[0][0];
  let dy0 = py - v[0][1];
  let d = dx0 * dx0 + dy0 * dy0;
  let s = 1;

  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const ex = v[j][0] - v[i][0];
    const ey = v[j][1] - v[i][1];
    const wx = px - v[i][0];
    const wy = py - v[i][1];
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * t;
    const by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);

    // Winding test, so the sign comes out right for any simple polygon.
    const c1 = py >= v[i][1];
    const c2 = py < v[j][1];
    const c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

/** Approximate signed distance to an axis-aligned ellipse. Good enough to stroke. */
function sdEllipse(px, py, cx, cy, rx, ry) {
  const nx = (px - cx) / rx;
  const ny = (py - cy) / ry;
  return (Math.sqrt(nx * nx + ny * ny) - 1) * Math.min(rx, ry);
}

/**
 * The mark, in its own 0..1 space: u across, v down. The mouse is far taller
 * than it is wide (matching the source drawing's ~0.57 ratio), so this box is
 * mapped into the tile rather than filling it.
 */
const MOUSE = {
  /**
   * Fraction of the icon the mark's box occupies. With no tile behind it the
   * mark can run nearly to the edge; only enough margin is kept for the stroke
   * itself plus the breathing room Windows expects around a taskbar glyph.
   */
  boxW: 0.62,
  boxH: 0.92,

  /**
   * Panels, as quadrilaterals wound consistently. Each is dilated by `round`
   * when drawn, so these are the *inner* corners and the drawn shape is
   * larger and softer than the numbers suggest.
   */
  topLeft: [
    [0.395, 0.055],
    [0.12, 0.15],
    [0.09, 0.37],
    [0.395, 0.40],
  ],
  bottomLeft: [
    [0.395, 0.475],
    [0.08, 0.45],
    [0.13, 0.87],
    [0.395, 0.95],
  ],

  /**
   * Two lobes meeting at a waist: the scroll wheel. Sized to just touch, which
   * is what reads as a figure-eight rather than two separate blobs. Because
   * the mark's box is far taller than it is wide, a lobe that should look
   * taller than it is wide needs ry/rx well under 1 in this space -- at equal
   * values it comes out a circle.
   */
  wheel: [
    { cv: 0.276, rx: 0.082, ry: 0.0677 },
    { cv: 0.411, rx: 0.082, ry: 0.0677 },
  ],

  /**
   * Below SIMPLIFY_BELOW px there is not enough room for four panels, two
   * gaps and a wheel: the strokes merge into a solid blob. These sizes get the
   * outer silhouette and the centre channel only, which still reads as a
   * two-button mouse. Standard icon practice, and the threshold sits above the
   * tray's 32px so its 1x and 2x renderings never disagree.
   */
  silhouette: [
    [0.5, 0.02],
    [0.12, 0.14],
    [0.085, 0.45],
    [0.13, 0.88],
    [0.5, 0.97],
    [0.87, 0.88],
    [0.915, 0.45],
    [0.88, 0.14],
  ],

  round: 0.045,
};

const SIMPLIFY_BELOW = 32;

function mirrorU(poly) {
  return poly.map(([u, v]) => [1 - u, v]).reverse();
}

const PANELS = [
  MOUSE.topLeft,
  mirrorU(MOUSE.topLeft),
  MOUSE.bottomLeft,
  mirrorU(MOUSE.bottomLeft),
];

/**
 * Stroke weight as a fraction of the icon. Held to a floor in absolute pixels
 * so the outlines survive a 16px tray slot, where a purely proportional weight
 * would land under one pixel and vanish. Weighted a little heavier than the
 * source drawing: with no tile behind it, the mark has only its own strokes to
 * hold against whatever wallpaper or taskbar sits underneath.
 */
function strokeHalfWidth(size) {
  return Math.max(size * 0.032, 1.25) / 2;
}

function render(size, colour) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4; // 4x4 supersampling for clean edges at small sizes.
  const hw = strokeHalfWidth(size);

  // Map the mark's local space into the middle of the tile.
  const bw = size * MOUSE.boxW;
  const bh = size * MOUSE.boxH;
  const bx = (size - bw) / 2;
  const by = (size - bh) / 2;
  const toTile = (poly) => poly.map(([u, v]) => [bx + u * bw, by + v * bh]);

  const simple = size < SIMPLIFY_BELOW;
  const panels = (simple ? [MOUSE.silhouette] : PANELS).map(toTile);
  const round = MOUSE.round * bw;
  // The wheel is the first thing to turn to mud; at small sizes the centre
  // channel alone carries the "two buttons" reading.
  const wheels = simple
    ? []
    : MOUSE.wheel.map((w) => ({
        cx: bx + 0.5 * bw,
        cy: by + w.cv * bh,
        rx: w.rx * bw,
        ry: w.ry * bh,
      }));
  // Centre channel for the simplified mark, as a bare vertical rule.
  const channel = simple
    ? { x: bx + 0.5 * bw, y0: by + 0.08 * bh, y1: by + 0.93 * bh }
    : null;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let fgHits = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;

          // Outline of each panel: the band within half a stroke of the
          // dilated polygon's edge.
          let on = false;
          for (const poly of panels) {
            if (Math.abs(sdPolygon(fx, fy, poly) - round) <= hw) {
              on = true;
              break;
            }
          }
          if (!on) {
            for (const w of wheels) {
              if (Math.abs(sdEllipse(fx, fy, w.cx, w.cy, w.rx, w.ry)) <= hw) {
                on = true;
                break;
              }
            }
          }
          if (!on && channel) {
            on =
              Math.abs(fx - channel.x) <= hw && fy >= channel.y0 && fy <= channel.y1;
          }
          if (on) fgHits++;
        }
      }

      // Transparent ground: coverage becomes alpha and every pixel carries the
      // accent at full strength. PNG alpha is non-premultiplied, so the colour
      // stays constant and only the alpha channel does the anti-aliasing.
      const i = (y * size + x) * 4;
      px[i] = colour[0];
      px[i + 1] = colour[1];
      px[i + 2] = colour[2];
      px[i + 3] = Math.round((fgHits / (SS * SS)) * 255);
    }
  }
  return px;
}

// ------------------------------------------------------------------- PNG

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function encodePng(size, rgba) {
  const stride = size * 4;
  // One filter byte (0 = none) per scanline.
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- ICO

/** Vista-era ICO: a directory entry pointing at an embedded PNG. */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach((e, i) => {
    const at = i * 16;
    dir[at] = e.size >= 256 ? 0 : e.size;
    dir[at + 1] = e.size >= 256 ? 0 : e.size;
    dir[at + 2] = 0; // palette
    dir[at + 3] = 0;
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32BE(0, at + 8);
    dir.writeUInt32LE(e.png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += e.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

// ------------------------------------------------------------------- main

mkdirSync(OUT, { recursive: true });

/**
 * One icon set per accent, so the tray and taskbar wear the same colour the
 * window does. Files are named by hex, which lets the main process build the
 * path straight from the stored setting with no id table to keep in sync.
 *
 * Must stay in step with PALETTE and PAUSED_ACCENT in src/theme.ts.
 */
const ACCENTS = [
  '#3fb950', // green — the default listening colour
  '#f4b0c8', // pastel pink
  '#eceff5', // white
  '#101318', // black
  '#f2705c', // coral red
  '#d2b48c', // tan
  '#e8892b', // yellow-orange — paused, not selectable
];

const DEFAULT_ACCENT = ACCENTS[0];

function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const written = [];
function emit(name, size, accent) {
  writeFileSync(join(OUT, name), encodePng(size, render(size, toRgb(accent))));
  written.push(name);
}

// The installer and exe icon uses the default listening colour: this is a tool
// whose whole job is to be running, so "on" is the right resting identity.
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
writeFileSync(
  join(OUT, 'icon.ico'),
  encodeIco(
    icoSizes.map((size) => ({
      size,
      png: encodePng(size, render(size, toRgb(DEFAULT_ACCENT))),
    })),
  ),
);
written.push(`icon.ico (${icoSizes.join(', ')}px)`);

emit('icon.png', 256, DEFAULT_ACCENT);

for (const accent of ACCENTS) {
  const key = accent.slice(1);

  // Tray needs 1x and 2x.
  emit(`tray-${key}.png`, 32, accent);
  emit(`tray-${key}@2x.png`, 64, accent);

  // Kept as the fallback for the window icon, and as a plain-PNG asset.
  emit(`icon-${key}.png`, 256, accent);

  // Multi-size .ico for the window and taskbar. Handing Windows a single
  // 256px bitmap makes it downscale to the 16 and 24px it wants for the
  // taskbar button and Alt-Tab, which smears a line-drawn mark; an .ico lets
  // it pick the simplified small frames drawn for exactly those slots.
  writeFileSync(
    join(OUT, `icon-${key}.ico`),
    encodeIco(
      icoSizes.map((size) => ({
        size,
        png: encodePng(size, render(size, toRgb(accent))),
      })),
    ),
  );
  written.push(`icon-${key}.ico`);
}

console.log(`icons written to ${OUT}:\n  ${written.join('\n  ')}`);

// Exported so scripts/preview-icons can render the same mark at arbitrary sizes.
export { render, encodePng };
