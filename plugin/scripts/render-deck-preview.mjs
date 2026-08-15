// Renders README previews of the picker screens.
//
// The Stream Deck app's window only ever shows the profile selected in its
// editor, not the profile the plugin pushes to the hardware at runtime, so the
// picker screens can't be screenshotted from it. Instead this drives the real
// picker state machine on a 5x3 (MK.2) grid and collects the exact SVG images
// the plugin hands to setImage, then lays them out as deck grids.
//
//   node scripts/render-deck-preview.mjs          # writes .preview/*.html
//   node scripts/render-deck-preview.mjs --shoot  # …and rasterises via electron
//
// Rasterising needs electron, which lives in ../app, so --shoot shells out to it.
import * as esbuild from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.preview');
const tmp = join(out, 'build');
mkdirSync(tmp, { recursive: true });

writeFileSync(join(tmp, 'streamdeck-stub.mjs'), `
export const calls = { switchToProfile: [] };
const streamDeck = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  profiles: { switchToProfile: async (...a) => { calls.switchToProfile.push(a); } },
};
export default streamDeck;
`);
writeFileSync(join(tmp, 'ws-stub.mjs'), `
export default class FakeWs {
  static OPEN = 1; static instances = [];
  readyState = 1; sent = []; handlers = {};
  constructor() { FakeWs.instances.push(this); setTimeout(() => this.emit('open'), 0); }
  on(e, cb) { (this.handlers[e] ??= []).push(cb); return this; }
  emit(e, ...a) { for (const cb of this.handlers[e] ?? []) cb(...a); }
  send(d) { this.sent.push(JSON.parse(d)); }
  close() {} terminate() {}
}
`);
const entry = join(tmp, 'entry.mjs');
const p = (f) => join(root, 'src', f).replace(/\\/g, '/');
writeFileSync(entry, `
export { picker } from '${p('picker.ts')}';
export { bridge } from '${p('bridge.ts')}';
export { calls } from './streamdeck-stub.mjs';
export { default as FakeWs } from './ws-stub.mjs';
`);
await esbuild.build({
  entryPoints: [entry], bundle: true, platform: 'node', format: 'esm',
  outfile: join(tmp, 'bundle.mjs'),
  alias: { '@elgato/streamdeck': join(tmp, 'streamdeck-stub.mjs'), ws: join(tmp, 'ws-stub.mjs') },
});
const { picker, bridge, FakeWs } = await import(pathToFileURL(join(tmp, 'bundle.mjs')).href);

const SLOTS = 15;                                   // MK.2 5x3
const device = { id: 'mk2', size: { columns: 5, rows: 3 } };
const images = new Map();
const act = (s) => ({
  setTitle: async () => {}, showOk: async () => {}, showAlert: async () => {},
  setImage: async (img) => { images.set(s, img); },
});

const combatants = [
  { id: 'c1', displayName: 'Dragonmerry', currentHp: 0, maxHp: 24, ac: 14, isCurrentTurn: false, isDowned: true, conditions: [], attacks: [] },
  { id: 'c2', displayName: 'Kobold Warrior 4', currentHp: 5, maxHp: 5, ac: 14, isCurrentTurn: false, conditions: [], attacks: [] },
  { id: 'c3', displayName: 'Adult Black Dragon', currentHp: 148, maxHp: 195, ac: 19, isCurrentTurn: true, conditions: [],
    attacks: [
      { id: 'k.bite', name: 'Bite', toHit: 11, save: null, damage: [
        { dice: '2d10+6', average: 17, type: 'slashing', condition: null },
        { dice: '1d8', average: 4, type: 'acid', condition: null } ] },
      { id: 'k.claw', name: 'Claw', toHit: 11, save: null, damage: [
        { dice: '2d6+6', average: 13, type: 'slashing', condition: null } ] },
      { id: 'k.breath', name: 'Acid Breath', toHit: null, save: 'DEX 18', damage: [
        { dice: '12d8', average: 54, type: 'acid', condition: null } ] },
    ] },
  { id: 'c4', displayName: "Gul'dan", currentHp: 0, maxHp: 28, ac: 15, isCurrentTurn: false, isDowned: true, conditions: [], attacks: [] },
  { id: 'c5', displayName: 'Kobold Warrior 2', currentHp: 2, maxHp: 5, ac: 14, isCurrentTurn: false, conditions: [], attacks: [] },
  { id: 'c6', displayName: 'Kobold Warrior 3', currentHp: 5, maxHp: 5, ac: 14, isCurrentTurn: false, conditions: ['Prone'], attacks: [] },
  { id: 'c7', displayName: 'White Dragon Wyrmling', currentHp: 32, maxHp: 32, ac: 16, isCurrentTurn: false, conditions: [], attacks: [] },
  { id: 'c8', displayName: 'Hermann der Grosse', currentHp: 20, maxHp: 20, ac: 18, isCurrentTurn: false, conditions: [], attacks: [] },
  { id: 'c9', displayName: 'Salazir', currentHp: 10, maxHp: 10, ac: 13, isCurrentTurn: false, conditions: [], attacks: [] },
];

bridge.start();
await new Promise((r) => setTimeout(r, 20));
FakeWs.instances.at(-1).emit('message', JSON.stringify({ type: 'state', combatants, currentIndex: 2, round: 3 }));
await new Promise((r) => setTimeout(r, 20));
for (let s = 0; s < SLOTS; s++) await picker.slotAppeared(s, act(s));

const text = (s) => picker.keyText(s) ?? '';
const dump = () => Array.from({ length: SLOTS }, (_, i) => `${i}:${JSON.stringify(text(i))}`).join(' ');
/** Press by label so slot arithmetic never has to be duplicated here. */
async function press(re, label = String(re)) {
  for (let s = 0; s < SLOTS; s++) if (re.test(text(s))) { await picker.slotPressed(s, act(s)); return s; }
  throw new Error(`no key matching ${label}\n  ${dump()}`);
}
const tryPress = async (re, label) => { try { return await press(re, label); } catch { console.log(`  (skipped ${label})`); return -1; } };

const screens = [];
const snap = (name, caption) => {
  screens.push({ name, caption, keys: Array.from({ length: SLOTS }, (_, i) => images.get(i) ?? null) });
  console.log(`[${name}] ${dump()}`);
};

await picker.begin('damage', device);
await press(/Kobold/, 'a kobold');
await tryPress(/Hermann|Salazir/, 'a PC');
snap('actor-select', 'Damage → multi-actor select. ▶ marks the current turn, 💀 marks downed, ✓ marks picked.');

await press(/Next/, 'Next');
await press(/\b1\b/, 'digit 1');
await tryPress(/\b2\b/, 'digit 2');
snap('numpad', 'The numpad, with the read-out key showing the operation and targets.');
await press(/Cancel/, 'Cancel');

await picker.begin('condition', device);
await press(/Kobold/, 'a kobold');
await press(/Next/, 'Next');
// Long condition names wrap with a soft hyphen ("Poison-\ned"), so match loosely.
await tryPress(/Poison/, 'Poisoned');
snap('conditions', 'Conditions applied across the whole selection — ✓ all have it, ~ only some.');
await press(/Cancel/, 'Cancel');

await picker.beginDice(device);
await tryPress(/\b2\b/, 'amount 2');
await tryPress(/Next|Enter|✓/, 'confirm amount');
await tryPress(/d6/, 'd6');
await tryPress(/\b3\b/, 'modifier 3');
await tryPress(/Next|Enter|✓/, 'confirm modifier');
await tryPress(/No\b|✕ No/, 'no more dice');
snap('dice-roll', 'The dice roller summary: roll the pool, then send the total as damage or healing.');
await tryPress(/Cancel/, 'Cancel');

if (await picker.beginAttack(device)) {
  await press(/Bite/, 'Bite');
  await tryPress(/Hermann|Salazir|Kobold|White/, 'a target');
  snap('attack-roll', "Monster attack: the roll screen shows the target's AC and rolls attack and damage.");
}

// ---- lay the collected key images out as deck grids ----
const KEY = 96, GAP = 10, PAD = 18;
const page = (s) => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#1b1b1b}
  .deck{display:inline-grid;grid-template-columns:repeat(5,${KEY}px);gap:${GAP}px;padding:${PAD}px;background:#242424}
  .k{width:${KEY}px;height:${KEY}px;border-radius:12px;overflow:hidden;background:#0d0d0d;
     box-shadow:inset 0 0 0 1px #333}
  .k img{width:100%;height:100%;display:block}
</style><div class="deck">${
  s.keys.map((src) => `<div class="k">${src ? `<img src="${src}">` : ''}</div>`).join('')
}</div>`;

mkdirSync(out, { recursive: true });
for (const s of screens) writeFileSync(join(out, `${s.name}.html`), page(s));
writeFileSync(join(out, 'index.json'), JSON.stringify(
  screens.map(({ name, caption }) => ({ name, caption })), null, 2));
console.log('\nwrote', screens.length, 'screens to', out);
console.log('width:', 5 * KEY + 4 * GAP + 2 * PAD, 'height:', 3 * KEY + 2 * GAP + 2 * PAD);
process.exit(0);
