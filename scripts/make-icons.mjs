/**
 * Generates the app icon set from code, so the repo carries no opaque binaries.
 *
 *   build/icon.ico   - 256px, consumed by electron-builder for the installer/exe
 *   build/tray.png   - 32px, the system-tray glyph
 *   build/tray@2x.png- 64px, for high-DPI trays
 *
 * Run with: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');

// ---------------------------------------------------------------- geometry

/** Signed-distance helper for a rounded rectangle centred in the tile. */
function roundedRectCoverage(x, y, size, inset, radius) {
  const half = size / 2 - inset;
  const dx = Math.abs(x - size / 2) - (half - radius);
  const dy = Math.abs(y - size / 2) - (half - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  const dist = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - radius;
  return dist <= 0;
}

/** Even-odd point-in-polygon. */
function inPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The bolt, expressed on a 0..1 grid so it scales to any tile size. */
const BOLT = [
  [0.56, 0.1],
  [0.28, 0.55],
  [0.46, 0.55],
  [0.4, 0.9],
  [0.72, 0.43],
  [0.53, 0.43],
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function render(size, fill, glyph) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4; // 4x4 supersampling for clean edges at small sizes.
  const inset = size * 0.045;
  const radius = size * 0.235;
  const poly = BOLT.map(([x, y]) => [x * size, y * size]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0;
      let fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          if (roundedRectCoverage(fx, fy, size, inset, radius)) bgHits++;
          if (inPolygon(fx, fy, poly)) fgHits++;
        }
      }
      const total = SS * SS;
      const bg = bgHits / total;
      const fg = Math.min(fgHits / total, bg);

      // Flat fill, no gradient: the icon follows the same rule as the UI.
      // The bolt uses the accent's ink, so a light fill gets a dark glyph
      // instead of a white one that would disappear.
      const k = fg / Math.max(bg, 0.0001);
      const r = lerp(fill[0], glyph[0], k);
      const g = lerp(fill[1], glyph[1], k);
      const b = lerp(fill[2], glyph[2], k);

      const i = (y * size + x) * 4;
      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
      px[i + 3] = Math.round(bg * 255);
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
  ['#3fb950', '#04160a'], // green — the default listening colour
  ['#f4b0c8', '#2a0c17'], // pastel pink
  ['#eceff5', '#101317'], // white
  ['#101318', '#eceff5'], // black
  ['#f2705c', '#2a0a04'], // coral red
  ['#d2b48c', '#241a0c'], // tan
  ['#e8892b', '#1f1204'], // yellow-orange — paused, not selectable
];

const DEFAULT_ACCENT = ACCENTS[0];

function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const written = [];
function emit(name, size, [fill, ink]) {
  writeFileSync(join(OUT, name), encodePng(size, render(size, toRgb(fill), toRgb(ink))));
  written.push(name);
}

// The installer and taskbar icon uses the default listening colour: this is a
// tool whose whole job is to be running, so "on" is the right resting identity.
const icoSizes = [16, 32, 48, 64, 128, 256];
writeFileSync(
  join(OUT, 'icon.ico'),
  encodeIco(
    icoSizes.map((size) => ({
      size,
      png: encodePng(size, render(size, toRgb(DEFAULT_ACCENT[0]), toRgb(DEFAULT_ACCENT[1]))),
    })),
  ),
);
written.push(`icon.ico (${icoSizes.join(', ')}px)`);

emit('icon.png', 256, DEFAULT_ACCENT);

// Tray needs 1x and 2x; the window icon is swapped at 256 and downscaled.
for (const accent of ACCENTS) {
  const key = accent[0].slice(1);
  emit(`tray-${key}.png`, 32, accent);
  emit(`tray-${key}@2x.png`, 64, accent);
  emit(`icon-${key}.png`, 256, accent);
}

console.log(`icons written to ${OUT}:\n  ${written.join('\n  ')}`);
