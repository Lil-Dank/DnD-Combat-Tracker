// Generates the plugin's icons: SVGs for actions/keys, plus PNGs for the
// plugin/marketplace icon (the packer requires .png there).
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

// ---- minimal PNG encoder (RGBA, no dependencies) ----
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** pixelFn(x, y) → [r, g, b, a] */
function encodePng(width, height, pixelFn) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  let off = 0;
  for (let y = 0; y < height; y++) {
    raw[off++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[off++] = r; raw[off++] = g; raw[off++] = b; raw[off++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Rounded-square purple gradient with a white d20-style hexagon outline. */
function pluginIconPng(size) {
  const r = size * 0.18;
  const cx = size / 2;
  const cy = size / 2;
  const hexR = size * 0.33;
  const verts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [cx + hexR * Math.cos(a), cy + hexR * Math.sin(a)];
  });
  const distToSeg = (px, py, [x1, y1], [x2, y2]) => {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };
  const stroke = size * 0.045;
  return encodePng(size, size, (x, y) => {
    // rounded-rect mask
    const qx = Math.max(Math.abs(x - cx) - (cx - r), 0);
    const qy = Math.max(Math.abs(y - cy) - (cy - r), 0);
    if (Math.hypot(qx, qy) > r) return [0, 0, 0, 0];
    // diagonal gradient #2a1745 → #7c3aed
    const t = (x + y) / (2 * size);
    let px = [42 + t * (124 - 42), 23 + t * (58 - 23), 69 + t * (237 - 69), 255];
    // hexagon outline + spokes to center (d20 feel)
    let d = Infinity;
    for (let i = 0; i < 6; i++) {
      d = Math.min(d, distToSeg(x, y, verts[i], verts[(i + 1) % 6]));
      if (i % 2 === 0) d = Math.min(d, distToSeg(x, y, verts[i], [cx, cy]));
    }
    if (d < stroke) {
      const edge = Math.min(1, (stroke - d) / (size * 0.01));
      px = [
        px[0] + (233 - px[0]) * edge,
        px[1] + (213 - px[1]) * edge,
        px[2] + (255 - px[2]) * edge,
        255,
      ];
    }
    return px.map(Math.round);
  });
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'com.dmtools.dnd-combat-tracker.sdPlugin');

const svg = (size, bg, glyph) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
<rect width="${size}" height="${size}" rx="${size * 0.18}" fill="url(#g)"/>
${glyph}
</svg>`;

// 72x72 key/action icons. Glyphs are drawn in a 72x72 coordinate space.
const icons = {
  'actions/next': svg(72, ['#3b1d63', '#7c3aed'], `<path d="M22 20 L46 36 L22 52 Z" fill="#fff"/><rect x="48" y="20" width="6" height="32" rx="2" fill="#fff"/>`),
  'actions/prev': svg(72, ['#3b1d63', '#7c3aed'], `<path d="M50 20 L26 36 L50 52 Z" fill="#fff"/><rect x="18" y="20" width="6" height="32" rx="2" fill="#fff"/>`),
  'actions/current': svg(72, ['#4a3410', '#d4a94f'], `<circle cx="36" cy="36" r="21" fill="none" stroke="#fff7e0" stroke-width="4"/><path d="M30 25 L48 36 L30 47 Z" fill="#fff7e0"/>`),
  'actions/damage': svg(72, ['#5c1010', '#dc2626'], `<path d="M36 12 L41 30 L58 26 L45 38 L54 54 L36 46 L18 54 L27 38 L14 26 L31 30 Z" fill="#ffe1e1"/>`),
  'actions/heal': svg(72, ['#0b3d21', '#16a34a'], `<rect x="29" y="14" width="14" height="44" rx="4" fill="#eafff1"/><rect x="14" y="29" width="44" height="14" rx="4" fill="#eafff1"/>`),
  'actions/condition': svg(72, ['#4a2a72', '#9333ea'], `<circle cx="36" cy="30" r="13" fill="none" stroke="#f3e8ff" stroke-width="5"/><path d="M36 43 C22 43 16 52 16 58 L56 58 C56 52 50 43 36 43 Z" fill="#f3e8ff"/><circle cx="52" cy="18" r="8" fill="#facc15"/>`),
  'actions/slot': svg(72, ['#221a30', '#3b2f52'], `<rect x="18" y="18" width="36" height="36" rx="6" fill="none" stroke="#8b7bb0" stroke-width="4" stroke-dasharray="7 6"/>`),
  'actions/end': svg(72, ['#4a1d1d', '#991b1b'], `<circle cx="36" cy="36" r="20" fill="none" stroke="#fee2e2" stroke-width="6"/><rect x="33" y="12" width="6" height="22" rx="3" fill="#fee2e2"/><rect x="26" y="10" width="20" height="8" rx="4" fill="#4a1d1d"/>`),
  'actions/roll': svg(72, ['#713f12', '#d97706'], `<g transform="translate(36,36)"><path d="M0 -24 L21 -12 L21 12 L0 24 L-21 12 L-21 -12 Z" fill="none" stroke="#fef3c7" stroke-width="5"/><text x="0" y="7" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" font-weight="bold" fill="#fef3c7">20</text></g>`),
  'actions/dice': svg(72, ['#0f3a4a', '#0e7490'], `<rect x="17" y="17" width="38" height="38" rx="8" fill="none" stroke="#cffafe" stroke-width="5"/><circle cx="28" cy="28" r="4" fill="#cffafe"/><circle cx="44" cy="28" r="4" fill="#cffafe"/><circle cx="36" cy="36" r="4" fill="#cffafe"/><circle cx="28" cy="44" r="4" fill="#cffafe"/><circle cx="44" cy="44" r="4" fill="#cffafe"/>`),
  'actions/blank': svg(72, ['#17121f', '#241b33'], ''),
  'plugin/category': svg(28, ['#2a1745', '#7c3aed'], `<path d="M14 3 L23 8.5 L23 19.5 L14 25 L5 19.5 L5 8.5 Z" fill="none" stroke="#e9d5ff" stroke-width="2.4"/>`),
};

for (const [name, content] of Object.entries(icons)) {
  const file = join(root, 'imgs', `${name}.svg`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// Marketplace/plugin icon must be a real PNG (validated by `streamdeck pack`).
writeFileSync(join(root, 'imgs', 'plugin', 'icon.png'), pluginIconPng(288));
writeFileSync(join(root, 'imgs', 'plugin', 'icon@2x.png'), pluginIconPng(576));
console.log(`Wrote ${Object.keys(icons).length} SVG icons + plugin PNGs.`);
