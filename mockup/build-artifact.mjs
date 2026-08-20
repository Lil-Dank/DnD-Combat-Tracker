// Derives the Artifact-shaped copy of the mockup: the Artifact host supplies
// the <!doctype>/<html>/<head>/<body> skeleton, so those are stripped and the
// <title>, font <link>, <style> and page content are emitted directly.
//   node mockup/build-artifact.mjs
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'brand-theme.html'), 'utf8');

const pick = (open, close) => {
  const a = src.indexOf(open);
  const b = src.indexOf(close, a);
  if (a === -1 || b === -1) throw new Error(`missing ${open}`);
  return src.slice(a, b + close.length);
};

const head = [
  '<title>Deck of Many Turns Brand Lab</title>',
  pick('<link rel="preconnect"', '>'),
  pick('<link href="https://fonts.googleapis.com', '>'),
  pick('<style>', '</style>'),
].join('\n');

const body = src.slice(src.indexOf('<body>') + '<body>'.length, src.lastIndexOf('</body>')).trim();

writeFileSync(join(here, 'brand-theme.artifact.html'), `${head}\n${body}\n`);
console.log('wrote mockup/brand-theme.artifact.html');
