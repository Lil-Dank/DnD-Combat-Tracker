// Generates every shipped brand raster from the one vector in
// src/shared/brandMark.ts: the fanned-card mark, drawn in the default
// palette, rasterised by Electron and packed into a multi-size Windows .ico.
//
//   cd app && npx electron scripts/build-icon.cjs
//
// Windows shows icons from 256 px tiles down to the 16 px title-bar corner and
// one drawing does not survive that range, so two variants ship in the same
// .ico and Windows picks by size:
//   full   (256/128/64/48) - three fanned cards, avatar dot, name and HP bars
//   simple (32/16)         - two cards, fatter dot, one bar
//
// The mark ships BARE with a drop shadow rather than on its tile, so it has no
// ground of its own: on a dark taskbar the front card sits close to the
// background and the fan and accent bar carry the silhouette. That is a
// deliberate call — swap TREATMENT to 'tile' or 'tileshadow' to get a badge.
//
// Outputs:
//   build/icon.ico              - electron-builder exe/installer icon
//   resources/icon.ico          - same file, shipped so BrowserWindows use it
//   resources/icon.png          - 256 px PNG (fallback for non-Windows)
//   build/icon-{16..256}.png    - previews, for eyeballing the small sizes
//   ../docs/images/logo.png     - 512 px standalone mark (the README leads
//     with the banner instead, but this is the one to hand anyone who asks)
//   ../docs/images/social-preview.png - 1200x630 banner for GitHub's social
//     preview (upload manually: repo Settings -> Social preview)
//   ../plugin/.../imgs/plugin/icon.png + icon@2x.png - the Stream Deck
//     plugin's marketplace/list icon (288 / 576 px)
const { app, BrowserWindow, nativeImage } = require('electron');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const CANVAS = 512;
/** Shipped icon treatment — see the note above before changing this. */
const TREATMENT = 'shadow';

/**
 * Loads a plain-data TS module (no value imports) inside Electron, whose Node
 * cannot strip types on its own. One esbuild transform, no temp files.
 */
function loadTs(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8');
  const { code } = esbuild.transformSync(src, { loader: 'ts', format: 'cjs' });
  const mod = { exports: {} };
  new Function('exports', 'module', 'require', code)(mod.exports, mod, require);
  return mod.exports;
}

const { markSvg } = loadTs('shared/brandMark.ts');
const { PALETTES, DEFAULT_PALETTE } = loadTs('shared/brand.ts');
const P = PALETTES.find((p) => p.id === DEFAULT_PALETTE);

/** Literal hexes, because the rasteriser has no stylesheet to resolve vars. */
const COLORS = {
  tile: P.tile, back1: P.back1, back2: P.back2, front: P.front,
  dot: P.dot, accent: P.accent, bar2: P.bar2,
};

/** One 512-square SVG per variant. */
function iconSvg(variant) {
  const inner = markSvg(CANVAS, { treatment: TREATMENT, variant, colors: COLORS });
  return inner;
}

/** 1200x630 GitHub social-preview banner: the mark beside the wordmark. */
function bannerSvg() {
  const rows = Array.from({ length: 10 }, (_, i) => {
    const y = 55 + i * 54;
    const active = i === 5;
    return `<rect x="880" y="${y}" width="280" height="30" rx="15" fill="${
      active ? P.accent : '#FFFFFF'
    }" opacity="${active ? 0.24 : 0.05}"/>`;
  }).join('');
  // No shadow here: on the banner the mark is already inverted to light cards
  // against the ground, so it separates on its own.
  const mark = markSvg(300, { treatment: 'bare', variant: 'full', colors: {
    ...COLORS, back1: P.on.back1, back2: P.on.back2, front: P.on.front,
    dot: P.on.dot, accent: P.on.accent, bar2: P.on.bar2,
  } });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${P.ground}"/>
  ${rows}
  <g transform="translate(74,165)">${mark}</g>
  <text x="440" y="282" font-family="Inter, 'Segoe UI', sans-serif" font-size="62"
        font-weight="800" letter-spacing="3" fill="${P.text}">DECK OF MANY</text>
  <text x="440" y="352" font-family="Inter, 'Segoe UI', sans-serif" font-size="62"
        font-weight="800" letter-spacing="3" fill="${P.accent}">TURNS</text>
  <text x="443" y="408" font-family="Inter, 'Segoe UI', sans-serif" font-size="26"
        fill="${P.textMuted}">Initiative tracking for 5e combat</text>
  <text x="443" y="450" font-family="Inter, 'Segoe UI', sans-serif" font-size="26"
        fill="${P.textMuted}">Player View · phones · Stream Deck</text>
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
  for (const variant of ['full', 'simple']) {
    const html = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${iconSvg(variant)}`;
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
    { size: 32, variant: 'simple' },
    { size: 16, variant: 'simple' },
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

  // Stream Deck plugin icon: the same mark, at the sizes the packer expects.
  // Rendered natively at 576 (viewBox scaling) rather than upscaled.
  const sdDir = path.join(root, '..', 'plugin', 'com.dmtools.dnd-combat-tracker.sdPlugin', 'imgs', 'plugin');
  if (fs.existsSync(sdDir)) {
    const win576 = new BrowserWindow({
      width: 576,
      height: 576,
      show: false,
      frame: false,
      transparent: true,
    });
    const svg576 = markSvg(576, { treatment: TREATMENT, variant: 'full', colors: COLORS });
    const html576 = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${svg576}`;
    await win576.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html576));
    await new Promise((r) => setTimeout(r, 400));
    const shot576 = await win576.webContents.capturePage({ x: 0, y: 0, width: 576, height: 576 });
    const img576 = nativeImage.createFromBuffer(shot576.toPNG());
    fs.writeFileSync(path.join(sdDir, 'icon@2x.png'), img576.toPNG());
    fs.writeFileSync(
      path.join(sdDir, 'icon.png'),
      img576.resize({ width: 288, height: 288, quality: 'best' }).toPNG(),
    );
    win576.destroy();
  }

  // README logo (512, transparent corners) and the GitHub social banner.
  const docsImages = path.join(root, '..', 'docs', 'images');
  fs.mkdirSync(docsImages, { recursive: true });
  fs.writeFileSync(path.join(docsImages, 'logo.png'), masters.full.toPNG());
  const bannerWin = new BrowserWindow({
    width: 1200,
    height: 630,
    show: false,
    frame: false,
    transparent: true,
  });
  const bannerHtml = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${bannerSvg()}`;
  await bannerWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(bannerHtml));
  await new Promise((r) => setTimeout(r, 400));
  const banner = await bannerWin.webContents.capturePage({ x: 0, y: 0, width: 1200, height: 630 });
  fs.writeFileSync(path.join(docsImages, 'social-preview.png'), banner.toPNG());
  bannerWin.destroy();
  console.log('wrote build/icon.ico + resources/icon.{ico,png}  (' +
    PLAN.map((p) => `${p.size}:${p.variant}`).join(', ') + ')');
  win.destroy();
  app.quit();
});
