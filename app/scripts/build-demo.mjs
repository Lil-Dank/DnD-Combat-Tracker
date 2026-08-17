// Builds the GitHub Pages demo into app/demo-dist:
//   1. vite-builds the renderer as a plain web app (demo shim active, since
//      window.api is absent in a browser),
//   2. esbuild-bundles the simulated Stream Deck from the REAL plugin sources
//      (picker, bridge, key renderer) with the SDK and 'ws' stubbed,
//   3. vite-builds the REAL player mobile app into demo-dist/player and
//      injects a WebSocket shim that talks to the in-page fake player server,
//   4. copies the SRD dataset in, and injects the sidebar/deck-sim script tag.
//
//   cd app && node scripts/build-demo.mjs
import { execFileSync } from 'child_process';
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(app, 'demo-dist');

// 1. renderer web build
execFileSync('npx', ['vite', 'build', '--config', 'vite.demo.config.mts'], {
  cwd: app,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// 2. deck simulator bundle
await esbuild.build({
  entryPoints: [join(app, 'scripts', 'demo-deck', 'entry.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: join(dist, 'deck-sim.js'),
  alias: {
    '@elgato/streamdeck': join(app, 'scripts', 'demo-deck', 'sd-stub.mjs'),
    ws: join(app, 'scripts', 'demo-deck', 'ws-stub.mjs'),
  },
  minify: true,
});

// 3. the player phone app for the simulator iframe
execFileSync(
  'npx',
  [
    'vite',
    'build',
    '--config',
    'vite.mobile.config.mts',
    // Relative to the vite root (src/mobile); an absolute path here would
    // break under shell:true on Windows when the repo path contains spaces.
    '--outDir',
    '../../demo-dist/player',
    '--emptyOutDir',
  ],
  { cwd: app, stdio: 'inherit', shell: process.platform === 'win32' },
);
cpSync(join(app, 'scripts', 'demo-player', 'player-shim.js'), join(dist, 'player', 'player-shim.js'));
{
  const playerIndex = join(dist, 'player', 'index.html');
  let playerHtml = readFileSync(playerIndex, 'utf8');
  // The classic shim script MUST execute before the Vite module script
  // (module execution is deferred to document order), so WebSocket is already
  // replaced when the app connects.
  const moduleTag = playerHtml.match(/<script type="module"[^>]*><\/script>/);
  if (!moduleTag) throw new Error('player/index.html: module script tag not found — shim injection failed');
  playerHtml = playerHtml.replace(moduleTag[0], `<script src="./player-shim.js"></script>\n    ${moduleTag[0]}`);
  writeFileSync(playerIndex, playerHtml);
}

// 4. SRD data + script tag
mkdirSync(join(dist, 'srd'), { recursive: true });
cpSync(join(app, 'resources', 'srd', 'monsters.json'), join(dist, 'srd', 'monsters.json'));

// Bridge protocol docs ride along at /bridge/ on the same Pages site.
cpSync(join(app, '..', 'docs', 'bridge'), join(dist, 'bridge'), { recursive: true });

const indexPath = join(dist, 'index.html');
let html = readFileSync(indexPath, 'utf8');
// The deck panel only belongs on the DM view; the script exits early on
// #player because window.__demo is created there too but the panel checks
// the hash itself... simplest: gate here.
// The renderer's CSP (default-src 'self') forbids inline scripts, so the
// simulator loads as an external module; it guards against #player itself.
const tag = `<script type="module" src="./deck-sim.js"></script>`;
html = html.replace('</body>', `${tag}\n</body>`);
writeFileSync(indexPath, html);

console.log('demo built into app/demo-dist');
