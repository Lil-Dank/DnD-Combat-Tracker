// Rasterises the HTML deck grids written by render-deck-preview.mjs.
// Electron lives in ../app, so run it from there:
//
//   cd app && npx electron ../plugin/scripts/shoot-deck-preview.cjs
//
// Writes docs/images/streamdeck-<screen>.png at 2x for a crisp README.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const repo = path.join(__dirname, '..', '..');
const preview = path.join(repo, 'plugin', '.preview');
const outDir = path.join(repo, 'docs', 'images');
const SCALE = 2;
const W = 556, H = 344;                    // matches the grid metrics in the renderer

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const screens = JSON.parse(fs.readFileSync(path.join(preview, 'index.json'), 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  // One window reused across screens: creating and destroying a window per
  // shot races the next loadFile and fails it with ERR_FAILED.
  const win = new BrowserWindow({
    width: W * SCALE, height: H * SCALE,
    show: false, frame: false, backgroundColor: '#1b1b1b',
    webPreferences: { zoomFactor: SCALE },
  });

  for (const { name } of screens) {
    const file = path.join(preview, `${name}.html`);
    try {
      await win.loadFile(file);
    } catch (err) {
      console.error(`FAILED ${name}: ${err.message}`);
      continue;
    }
    win.webContents.setZoomFactor(SCALE);
    // Give the inline SVG data URIs a beat to decode before grabbing.
    await new Promise((r) => setTimeout(r, 700));
    const img = await win.webContents.capturePage();
    const outFile = path.join(outDir, `streamdeck-${name}.png`);
    fs.writeFileSync(outFile, img.toPNG());
    const { width, height } = img.getSize();
    console.log(`wrote ${path.basename(outFile)}  ${width}x${height}  ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
  }
  win.destroy();
  app.quit();
});
