#!/usr/bin/env node
/**
 * Publishes a release to GitHub: tags the current commit and uploads the
 * installer and the packed Stream Deck plugin as release assets.
 *
 *   node scripts/publish.mjs                 # dry run - shows what it would do
 *   node scripts/publish.mjs --yes           # actually tag, push and release
 *   node scripts/publish.mjs --yes --draft   # publish as a draft first
 *   node scripts/publish.mjs --notes FILE    # release notes from a file
 *
 * The tag comes from app/package.json, so bump that first. Nothing is pushed
 * unless --yes is passed: publishing is outward-facing and easy to get wrong,
 * so the default is to print the plan and stop.
 *
 * Requires the GitHub CLI, authenticated (`gh auth status`).
 */
import { execFileSync } from 'child_process';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};

const DRY = !has('--yes');
const RED = '[31m', GRN = '[32m', YEL = '[33m', DIM = '[2m', OFF = '[0m';
const die = (msg) => {
  console.error(`${RED}error:${OFF} ${msg}`);
  process.exit(1);
};
const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { cwd: repo, encoding: 'utf8', ...opts }).trim();

// ---- preflight -------------------------------------------------------------
try {
  run('gh', ['auth', 'status'], { stdio: 'pipe' });
} catch {
  die('GitHub CLI not authenticated. Run: gh auth login');
}

const appPkg = JSON.parse(readFileSync(join(repo, 'app', 'package.json'), 'utf8'));
const manifest = JSON.parse(
  readFileSync(
    join(repo, 'plugin', 'com.dmtools.dnd-combat-tracker.sdPlugin', 'manifest.json'),
    'utf8',
  ),
);
const version = appPkg.version;
const tag = `v${version}`;

const assets = [
  join(repo, 'release', `DnD Combat Tracker Setup ${version}.exe`),
  join(repo, 'release', 'com.dmtools.dnd-combat-tracker.streamDeckPlugin'),
];
for (const a of assets) {
  if (!existsSync(a)) {
    die(
      `missing release asset: ${basename(a)}\n` +
        `       Build it first, then copy it into release/:\n` +
        `         cd app && npx electron-builder --win\n` +
        `         cd plugin && npm run build && npx streamdeck pack com.dmtools.dnd-combat-tracker.sdPlugin --output dist --force`,
    );
  }
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const dirty = run('git', ['status', '--porcelain']);
const existingTag = (() => {
  try {
    return run('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { stdio: 'pipe' });
  } catch {
    return null;
  }
})();
let released = false;
try {
  run('gh', ['release', 'view', tag], { stdio: 'pipe' });
  released = true;
} catch {
  /* no release yet, which is the normal case */
}

// ---- plan ------------------------------------------------------------------
console.log(`
${DIM}repository ${OFF}${run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])}
${DIM}branch     ${OFF}${branch}
${DIM}app        ${OFF}${version}
${DIM}plugin     ${OFF}${manifest.Version}
${DIM}tag        ${OFF}${tag}${existingTag ? `  ${YEL}(already exists)${OFF}` : ''}
${DIM}assets     ${OFF}${assets
  .map((a) => `${basename(a)} (${(statSync(a).size / 1048576).toFixed(1)} MB)`)
  .join('\n           ')}
`);

if (dirty) {
  console.log(`${YEL}warning:${OFF} working tree is not clean:\n${dirty}\n`);
}
if (released) die(`a release for ${tag} already exists. Bump the version, or delete it first.`);

const notesFile = valueOf('--notes');
if (notesFile && !existsSync(notesFile)) die(`notes file not found: ${notesFile}`);

if (DRY) {
  console.log(`${YEL}dry run${OFF} - nothing was pushed. Re-run with ${GRN}--yes${OFF} to publish.`);
  process.exit(0);
}

if (dirty) die('refusing to publish with uncommitted changes. Commit or stash them first.');

// ---- publish ---------------------------------------------------------------
if (!existingTag) {
  run('git', ['tag', '-a', tag, '-m', `${tag} - app ${version}, plugin ${manifest.Version}`]);
  console.log(`tagged ${tag}`);
}
run('git', ['push', 'origin', branch]);
run('git', ['push', 'origin', tag]);
console.log(`pushed ${branch} and ${tag}`);

const relArgs = ['release', 'create', tag, ...assets, '--title', tag];
if (notesFile) relArgs.push('--notes-file', notesFile);
else relArgs.push('--generate-notes');
if (has('--draft')) relArgs.push('--draft');

const url = run('gh', relArgs);
console.log(`${GRN}published${OFF} ${url}`);
