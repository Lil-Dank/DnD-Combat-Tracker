// Verifies the picker localizes itself when the app reports a German UI.
//
// The English labels are covered by test-picker.mjs, which runs with no
// language set. This one only asserts what changes: the plugin's own key
// labels, the SRD condition names, and that actor names arrive already
// translated from the app rather than being localized here.
import * as esbuild from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.test');
mkdirSync(tmp, { recursive: true });

writeFileSync(
  join(tmp, 'sd-stub.mjs'),
  [
    'export const calls = { switchToProfile: [] };',
    'const streamDeck = {',
    '  logger: { info: () => {}, warn: () => {}, error: () => {} },',
    '  profiles: { switchToProfile: async (...a) => { calls.switchToProfile.push(a); } },',
    '};',
    'export default streamDeck;',
  ].join('\n'),
);
writeFileSync(
  join(tmp, 'ws-stub2.mjs'),
  [
    'export default class FakeWs {',
    '  static OPEN = 1; static instances = [];',
    '  readyState = 1; sent = []; handlers = {};',
    '  constructor() { FakeWs.instances.push(this); setTimeout(() => this.emit("open"), 0); }',
    '  on(e, cb) { (this.handlers[e] ??= []).push(cb); return this; }',
    '  emit(e, ...a) { for (const cb of this.handlers[e] ?? []) cb(...a); }',
    '  send(d) { this.sent.push(JSON.parse(d)); }',
    '  close() {} terminate() {}',
    '}',
  ].join('\n'),
);
const p = (f) => join(root, 'src', f).replace(/\\/g, '/');
writeFileSync(
  join(tmp, 'i18n-entry.mjs'),
  [
    `export { picker } from '${p('picker.ts')}';`,
    `export { bridge } from '${p('bridge.ts')}';`,
    "export { default as FakeWs } from './ws-stub2.mjs';",
  ].join('\n'),
);

await esbuild.build({
  entryPoints: [join(tmp, 'i18n-entry.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(tmp, 'i18n-bundle.mjs'),
  alias: { '@elgato/streamdeck': join(tmp, 'sd-stub.mjs'), ws: join(tmp, 'ws-stub2.mjs') },
});
const { picker, bridge, FakeWs } = await import(
  pathToFileURL(join(tmp, 'i18n-bundle.mjs')).href
);

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    failures++;
  } else console.log('ok:', msg);
};

const SLOTS = 15;
const device = { id: 'mk2', size: { columns: 5, rows: 3 } };
const act = () => ({
  setTitle: async () => {},
  setImage: async () => {},
  showOk: async () => {},
  showAlert: async () => {},
});

bridge.start();
await new Promise((r) => setTimeout(r, 20));
const combatants = [
  {
    id: 'a1',
    displayName: 'Ausgewachsener schwarzer Drache',
    currentHp: 148, maxHp: 195, ac: 19,
    isCurrentTurn: true, conditions: [], attacks: [],
  },
  {
    id: 'a2',
    displayName: 'Kobold-Krieger 1',
    currentHp: 5, maxHp: 5, ac: 14,
    isCurrentTurn: false, conditions: ['Poisoned'], attacks: [],
  },
];
FakeWs.instances.at(-1).emit(
  'message',
  JSON.stringify({ type: 'state', language: 'de', combatants, currentIndex: 0, round: 3 }),
);
await new Promise((r) => setTimeout(r, 20));
for (let s = 0; s < SLOTS; s++) await picker.slotAppeared(s, act());

const keys = () => Array.from({ length: SLOTS }, (_, i) => picker.keyText(i) ?? '');
/** Keys wrap with a trailing hyphen at the key edge; undo that to compare words. */
const flat = () => keys().join(' ').split('-\n').join('');
const press = async (re) => {
  const slot = keys().findIndex((t) => re.test(t));
  if (slot < 0) throw new Error(`no key matching ${re}\n  ${JSON.stringify(keys())}`);
  await picker.slotPressed(slot, act());
};

await picker.begin('damage', device);
assert(flat().includes('Abbruch'), 'Cancel key is German');
assert(flat().includes('Weiter'), 'Next key is German');
assert(
  flat().includes('Ausgewachsen'),
  'actor names arrive already localized from the app (not translated in the plugin)',
);

// Next only advances once at least one actor is picked.
await press(/Kobold/);
await press(/Weiter/);
assert(flat().includes('OK'), 'numpad Enter key is German');
await press(/Abbruch/);

await picker.begin('condition', device);
await press(/Kobold/);
await press(/Weiter/);
const grid = flat();
assert(grid.includes('Vergiftet'), 'Poisoned renders as Vergiftet (SRD 5.2.1)');
assert(grid.includes('Bezaubert'), 'Charmed renders as Bezaubert');
assert(grid.includes('Kampfunfähig'), 'Incapacitated renders as Kampfunfähig');
assert(grid.includes('Fertig'), 'Done key is German');
assert(grid.includes('Zurück'), 'Back key is German');
assert(
  !/\b(Poisoned|Charmed|Incapacitated|Blinded|Stunned)\b/.test(grid),
  'no English condition names leak onto the deck',
);

// Toggling still reports the canonical English value back to the app.
const sock = FakeWs.instances.at(-1);
sock.sent.length = 0;
await press(/Vergif/);
const cmd = sock.sent.find((c) => c.type === 'toggleCondition');
assert(
  cmd && cmd.condition === 'Poisoned',
  'the German label still sends the canonical English condition: ' + JSON.stringify(cmd),
);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
