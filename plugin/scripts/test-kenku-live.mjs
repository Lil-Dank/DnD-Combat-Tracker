// TRUE integration test for deck-triggered Kenku sounds: the real picker and
// real bridge (real 'ws' socket) talk to the real app on 127.0.0.1:57321,
// which talks to live Kenku on :3333. Reproduces the reported scenario:
// a per-attack "on hit" sound rolled from the deck.
//
// Requires: the feature-build app running with --remote-debugging-port=9222,
// and Kenku FM with Kenku Remote enabled on 127.0.0.1:3333.
//
//   cd app && npx electron . --remote-debugging-port=9222 --user-data-dir=<scratch>
//   cd plugin && node scripts/test-kenku-live.mjs
import * as esbuild from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.test');
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'sd-live.mjs'), `
const sd = { logger:{info:()=>{},warn:()=>{},error:()=>{}}, profiles:{switchToProfile:async()=>{}} };
export default sd;`);
writeFileSync(join(tmp, 'live-entry.mjs'), `
export { picker } from '${root.replace(/\\/g, '/')}/src/picker.ts';
export { bridge } from '${root.replace(/\\/g, '/')}/src/bridge.ts';`);
await esbuild.build({
  entryPoints: [join(tmp, 'live-entry.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(tmp, 'live-bundle.mjs'),
  alias: { '@elgato/streamdeck': join(tmp, 'sd-live.mjs') },
  external: ['ws'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
const { picker, bridge } = await import(pathToFileURL(join(tmp, 'live-bundle.mjs')).href);

// ---- helpers ---------------------------------------------------------------
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok:   ' : 'FAIL: ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kenku = async (p) => (await fetch('http://127.0.0.1:3333' + p)).json();
const kenkuPut = (p, body) =>
  fetch('http://127.0.0.1:3333' + p, {
    method: 'PUT',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {});
const SOUND = '59f55472-2806-4583-8142-6b18b821bb23';
const soundPlaying = async () => (await kenku('/v1/soundboard/playback')).sounds.some((s) => s.id === SOUND);
const quiet = async () => { await kenkuPut('/v1/soundboard/stop', { id: SOUND }); await sleep(400); };

async function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  return { ws, eval: async (e) => {
    const i = ++id;
    const r = await new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, awaitPromise: true, returnByValue: true } })); });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval');
    return r.result?.result?.value;
  }};
}

// ---- app setup over CDP -----------------------------------------------------
const targets = await fetch('http://127.0.0.1:9222/json').then((r) => r.json());
const dm = await cdp(targets.find((x) => x.url.includes('#dm')).webSocketDebuggerUrl);

await dm.eval(`window.api.updateSettings({ kenku: { enabled: true, host: '127.0.0.1', port: 3333, eventSounds: {} } })`);
await dm.eval('window.api.importSrd()');
let s = await dm.eval('window.api.getState()');
for (const t of s.encounterTemplates) await dm.eval(`window.api.deleteTemplate('${t.id}')`);
for (const p of s.pcs) await dm.eval(`window.api.deletePc('${p.id}')`);
await dm.eval(`window.api.savePc({ name: 'Hero', maxHp: 40, ac: 12, initMod: 0 })`);
s = await dm.eval('window.api.getState()');
const goblin = s.monsters.find((m) => m.name === 'Goblin Warrior');
const scimitar = goblin.attacks.find((a) => a.name === 'Scimitar');
// per-attack "on hit" sound - the user's exact configuration
await dm.eval(`window.api.saveMonster(${JSON.stringify({
  ...goblin,
  attacks: goblin.attacks.map((a) =>
    a.id === scimitar.id ? { ...a, kenkuSound: { soundId: SOUND, title: 'cricket', trigger: 'attackHit' } } : a,
  ),
})})`);
await dm.eval(`window.api.saveTemplate({ name: 'IT', entries: [{ monsterTemplateId: '${goblin.id}', quantity: 1 }] })`);
s = await dm.eval('window.api.getState()');
const tpl = s.encounterTemplates.find((t) => t.name === 'IT');
await dm.eval(`window.api.startCombatSetup('${tpl.id}', ${JSON.stringify(s.pcs.map((p) => p.id))}, 'all')`);
// force the goblin to act first so beginAttack targets it
s = await dm.eval('window.api.getState()');
const pcCombatant = s.combat.combatants.find((c) => c.type === 'pc');
await dm.eval(`window.api.setInitiative('${pcCombatant.id}', 1)`);
await dm.eval('window.api.beginCombat()');
await sleep(300);

// ---- the REAL plugin stack over the REAL socket ------------------------------
const device = { id: 'live', size: { columns: 5, rows: 3 } };
const act = () => ({ setTitle: async () => {}, setImage: async () => {}, showOk: async () => {}, showAlert: async () => {} });
bridge.start();
await sleep(800);
ok(bridge.connected === true, 'real bridge connected to the running app');
ok(bridge.state.combatants.length === 2, 'live state received over the socket');
ok(typeof bridge.state.combatants[0].sourceId === 'string', 'state carries sourceId');

for (let i = 0; i < 15; i++) await picker.slotAppeared(i, act());
picker.applyDelayMs = 100;
const text = (slot) => picker.keyText(slot) ?? '';
const press = async (re) => {
  const i = Array.from({ length: 15 }, (_, x) => x).find((x) => re.test(text(x)));
  if (i === undefined) throw new Error('no key ' + re + ' :: ' + JSON.stringify(Array.from({ length: 15 }, (_, x) => text(x))));
  await picker.slotPressed(i, act());
};

// ---- scenario 1: per-attack "on hit" from the deck ---------------------------
await quiet();
await picker.beginAttack(device);
await press(/Scimit/);
await press(/Hero/);
let sawHit = false;
for (let i = 0; i < 40 && !sawHit; i++) {
  await press(/Attack/);
  await sleep(120);
  sawHit = /HIT|TREFFER/.test(text(6)) || /HIT|TREFFER/.test(Array.from({ length: 15 }, (_, x) => text(x)).join(' '));
}
ok(sawHit, 'rolled until the deck showed a HIT');
await sleep(500);
ok(await soundPlaying(), 'per-attack "on hit" sound fired from the deck roll');
await picker.slotPressed(10, act()); // cancel out of the flow
await quiet();

// ---- scenario 2: global attackMiss event sound from the deck -----------------
await dm.eval(`window.api.saveMonster(${JSON.stringify({
  ...goblin,
  attacks: goblin.attacks.map((a) => ({ ...a, kenkuSound: null })),
})})`);
await dm.eval(`window.api.updateSettings({ kenku: { enabled: true, host: '127.0.0.1', port: 3333, eventSounds: { attackMiss: { soundId: '${SOUND}', title: 'cricket' } } } })`);
await sleep(400);
await picker.beginAttack(device);
await press(/Scimit/);
await press(/Hero/);
let sawMiss = false;
for (let i = 0; i < 60 && !sawMiss; i++) {
  await press(/Attack/);
  await sleep(120);
  sawMiss = /MISS|DANEBEN/.test(Array.from({ length: 15 }, (_, x) => text(x)).join(' '));
  if (!sawMiss) await quiet(); // a hit fired nothing (no config), keep rolling
}
ok(sawMiss, 'rolled until the deck showed a MISS');
await sleep(500);
ok(await soundPlaying(), 'global attackMiss event sound fired from the deck roll');
await picker.slotPressed(10, act());
await quiet();

// ---- scenario 3: damageApplied event via the deck numpad ---------------------
await dm.eval(`window.api.updateSettings({ kenku: { enabled: true, host: '127.0.0.1', port: 3333, eventSounds: { damageApplied: { soundId: '${SOUND}', title: 'cricket' } } } })`);
await sleep(300);
await picker.begin('damage', device);
await press(/Hero/);
await press(/Next|Weiter/);
await press(/^3\n?$|(^|\n)3($|\n)/);
await press(/Enter|OK/);
await sleep(600);
ok(await soundPlaying(), 'damageApplied event sound fired from the deck numpad');
await quiet();

// ---- cleanup -----------------------------------------------------------------
await dm.eval('window.api.endCombat()');
await dm.eval(`window.api.updateSettings({ kenku: { enabled: false, host: '127.0.0.1', port: 3333, eventSounds: {} } })`);
s = await dm.eval('window.api.getState()');
for (const t of s.encounterTemplates.filter((t) => t.name === 'IT')) await dm.eval(`window.api.deleteTemplate('${t.id}')`);
for (const p of s.pcs) await dm.eval(`window.api.deletePc('${p.id}')`);
console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`);
dm.ws.close();
process.exit(fail ? 1 : 0);
