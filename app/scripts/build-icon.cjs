// Generates the app icon: a d20 on a dark rounded plate, drawn as computed
// SVG, rasterised by Electron, and packed into a multi-size Windows .ico.
//
//   cd app && npx electron scripts/build-icon.cjs
//
// Outputs:
//   build/icon.ico       - electron-builder installer/exe icon (256..16 px)
//   resources/icon.png   - 256px PNG for the BrowserWindow icon (dev windows)
//
// Everything derives from the geometry below - rerun after tweaking, commit
// the outputs. No design tool involved, so the icon is reproducible.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 512;

function d20Svg() {
  const cx = 256;
  const cy = 262;
  const R = 172;
  const r = R * 0.56;
  const P = (radius, deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
  };
  // Pointy-top hexagon silhouette and the central (front) face.
  const H = {};
  for (const deg of [90, 30, -30, -90, -150, 150]) H[(deg + 360) % 360] = P(R, deg);
  const T = { 90: P(r, 90), 210: P(r, 210), 330: P(r, 330) };
  const poly = (pts, fill) =>
    `<polygon points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}"
       fill="${fill}" stroke="#f6d27a" stroke-width="7" stroke-linejoin="round"/>`;

  const faces = [
    // three faces sharing the central face's edges
    poly([T[90], T[330], H[30]], '#b02c2c'),
    poly([T[90], T[210], H[150]], '#b02c2c'),
    poly([T[210], T[330], H[270]], '#992424'),
    // six outer slivers to the silhouette
    poly([T[90], H[90], H[30]], '#8f2020'),
    poly([T[90], H[150], H[90]], '#7a1919'),
    poly([T[210], H[150], H[210]], '#8f2020'),
    poly([T[210], H[210], H[270]], '#7a1919'),
    poly([T[330], H[270], H[330]], '#8f2020'),
    poly([T[330], H[330], H[30]], '#7a1919'),
    // central face on top
    poly([T[90], T[210], T[330]], '#d94040'),
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c2144"/>
      <stop offset="1" stop-color="#150f22"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="492" height="492" rx="96" fill="url(#bg)"/>
  <rect x="10" y="10" width="492" height="492" rx="96" fill="none"
        stroke="#f6d27a" stroke-opacity="0.28" stroke-width="6"/>
  ${faces.join('\n  ')}
  <text x="${cx}" y="${cy + 12}" text-anchor="middle" dominant-baseline="middle"
        font-family="Georgia, 'Times New Roman', serif" font-weight="bold"
        font-size="110" fill="#fff3d6">20</text>
</svg>`;
}

/** Packs PNG buffers into a .ico container (PNG entries; Vista+). */
function packIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
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
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
  });
  const html = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${d20Svg()}`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 500));
  const master = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });

  const sizes = [256, 128, 64, 48, 32, 16];
  const pngs = sizes.map((size) => ({
    size,
    buf: nativeImage
      .createFromBuffer(master.toPNG())
      .resize({ width: size, height: size, quality: 'best' })
      .toPNG(),
  }));

  const root = path.join(__dirname, '..');
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), packIco(pngs));
  fs.writeFileSync(path.join(root, 'resources', 'icon.png'), pngs[0].buf);
  console.log(`wrote build/icon.ico (${sizes.join(', ')} px) and resources/icon.png`);
  win.destroy();
  app.quit();
});
