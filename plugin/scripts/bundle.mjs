// Bundles the TypeScript plugin (including the ws dependency) into
// bin/plugin.js for the Stream Deck app's Node runtime.
import * as esbuild from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [join(root, 'src', 'plugin.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  outfile: join(root, 'com.dmtools.dnd-combat-tracker.sdPlugin', 'bin', 'plugin.js'),
  sourcemap: 'inline',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
