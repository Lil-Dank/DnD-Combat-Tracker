// Builds the GitHub Pages demo into app/demo-dist:
//   1. vite-builds the renderer as a plain web app (demo shim active, since
//      window.api is absent in a browser),
//   2. esbuild-bundles the simulated Stream Deck from the REAL plugin sources
//      (picker, bridge, key renderer) with the SDK and 'ws' stubbed,
//   3. copies the SRD dataset in, and injects the deck-sim script tag.
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

// 3. SRD data + script tag
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
