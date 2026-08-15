// Generates the app icon: a d20 drawn as computed SVG, rasterised by
// Electron, and packed into a multi-size Windows .ico.
//
//   cd app && npx electron scripts/build-icon.cjs
//
// Windows shows icons anywhere from 256 px tiles down to the 16 px title-bar
// corner, and one design does not survive that range: the "20" numeral and
// the fine wireframe turn to mush below ~48 px. So three variants ship in
// the same .ico and Windows picks by size:
//   full (256/128/64/48) - plate, wireframe d20, "20" numeral
//   mid  (32)            - plate and die only, thicker strokes, no text
//   tiny (16)            - bare red d20 filling the frame, bold outline
//
// Outputs:
//   build/icon.ico       - electron-builder exe/installer icon
//   resources/icon.ico   - same file, shipped so BrowserWindows use it too
//   resources/icon.png   - 256 px PNG (fallback for non-Windows / docs)
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const CANVAS = 512;

/** One 512-square SVG per variant; small variants use chunkier geometry. */
function d20Svg(variant) {
  const plate = variant !== 'tiny';
  const cx = 256;
  const cy = plate ? 262 : 256;
  const R = variant === 'full' ? 172 : variant === 'mid' ? 196 : 244;
  const r = R * 0.56;
  const stroke = variant === 'full' ? 7 : variant === 'mid' ? 14 : 30;
  const P = (radius, deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
  };
  const H = {};
  for (const deg of [90, 30, -30, -90, -150, 150]) H[(deg + 360) % 360] = P(R, deg);
  const T = { 90: P(r, 90), 210: P(r, 210), 330: P(r, 330) };
  const poly = (pts, fill) =>
    `<polygon points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}"
       fill="${fill}" stroke="#f6d27a" stroke-width="${stroke}" stroke-linejoin="round"/>`;

  const hexPts = [H[90], H[30], H[330], H[270], H[210], H[150]];
  const faces =
    variant === 'tiny'
      ? [
          // Just the silhouette and the front face - anything finer vanishes.
          poly(hexPts, '#a32424'),
          poly([T[90], T[210], T[330]], '#d94040'),
        ]
      : [
          poly([T[90], T[330], H[30]], '#b02c2c'),
          poly([T[90], T[210], H[150]], '#b02c2c'),
          poly([T[210], T[330], H[270]], '#992424'),
          poly([T[90], H[90], H[30]], '#8f2020'),
          poly([T[90], H[150], H[90]], '#7a1919'),
          poly([T[210], H[150], H[210]], '#8f2020'),
          poly([T[210], H[210], H[270]], '#7a1919'),
          poly([T[330], H[270], H[330]], '#8f2020'),
          poly([T[330], H[330], H[30]], '#7a1919'),
          poly([T[90], T[210], T[330]], '#d94040'),
        ];

  const plateSvg = plate
    ? `<rect x="10" y="10" width="492" height="492" rx="96" fill="url(#bg)"/>
  <rect x="10" y="10" width="492" height="492" rx="96" fill="none"
        stroke="#f6d27a" stroke-opacity="0.28" stroke-width="6"/>`
    : '';
  const text =
    variant === 'full'
      ? `<text x="${cx}" y="${cy + 12}" text-anchor="middle" dominant-baseline="middle"
        font-family="Georgia, 'Times New Roman', serif" font-weight="bold"
        font-size="110" fill="#fff3d6">20</text>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c2144"/>
      <stop offset="1" stop-color="#150f22"/>
    </linearGradient>
  </defs>
  ${plateSvg}
  ${faces.join('\n  ')}
  ${text}
</svg>`;
}

/** Packs PNG buffers into a .ico container (PNG entries; Vista+). */
function packIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: CANVAS,
    height: CANVAS,
    show: false,
    frame: false,
    transparent: true,
  });

  const masters = {};
  for (const variant of ['full', 'mid', 'tiny']) {
    const html = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${d20Svg(variant)}`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 400));
    const shot = await win.webContents.capturePage({ x: 0, y: 0, width: CANVAS, height: CANVAS });
    masters[variant] = nativeImage.createFromBuffer(shot.toPNG());
  }

  const PLAN = [
    { size: 256, variant: 'full' },
    { size: 128, variant: 'full' },
    { size: 64, variant: 'full' },
    { size: 48, variant: 'full' },
    { size: 32, variant: 'mid' },
    { size: 16, variant: 'tiny' },
  ];
  const pngs = PLAN.map(({ size, variant }) => ({
    size,
    buf: masters[variant].resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));

  const root = path.join(__dirname, '..');
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  const ico = packIco(pngs);
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico);
  fs.writeFileSync(path.join(root, 'resources', 'icon.ico'), ico);
  fs.writeFileSync(path.join(root, 'resources', 'icon.png'), pngs[0].buf);
  // Previews for eyeballing the small sizes at their real scale.
  for (const { size, buf } of pngs) {
    fs.writeFileSync(path.join(root, 'build', `icon-${size}.png`), buf);
  }
  console.log('wrote build/icon.ico + resources/icon.{ico,png}  (' +
    PLAN.map((p) => `${p.size}:${p.variant}`).join(', ') + ')');
  win.destroy();
  app.quit();
});
