// Repro: deck attack flow — which attackEvent phases actually get sent?
import * as esbuild from 'esbuild';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';

const root = 'G:/Claude/DnD Combat Tracker/plugin';
const tmp = join(root, '.test');
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'sd2.mjs'), `
export const calls = { switchToProfile: [] };
const sd = { logger:{info:()=>{},warn:()=>{},error:()=>{}}, profiles:{switchToProfile:async(...a)=>{calls.switchToProfile.push(a);}} };
export default sd;`);
writeFileSync(join(tmp, 'ws2.mjs'), `
export default class FakeWs {
  static OPEN = 1; static instances = [];
  readyState = 1; sent = []; handlers = {};
  constructor(){ FakeWs.instances.push(this); setTimeout(()=>this.emit('open'),0); }
  on(e,cb){ (this.handlers[e] ??= []).push(cb); return this; }
  emit(e,...a){ for (const cb of this.handlers[e] ?? []) cb(...a); }
  send(d){ this.sent.push(JSON.parse(d)); }
  close(){} terminate(){}
}`);
writeFileSync(join(tmp, 'e2.mjs'), `
export { picker } from '${root}/src/picker.ts';
export { bridge } from '${root}/src/bridge.ts';
export { default as FakeWs } from './ws2.mjs';`);
await esbuild.build({
  entryPoints: [join(tmp, 'e2.mjs')], bundle: true, platform: 'node', format: 'esm',
  outfile: join(tmp, 'b2.mjs'),
  alias: { '@elgato/streamdeck': join(tmp, 'sd2.mjs'), ws: join(tmp, 'ws2.mjs') },
});
const { picker, bridge, FakeWs } = await import(pathToFileURL(join(tmp, 'b2.mjs')).href);

const device = { id: 'd', size: { columns: 5, rows: 3 } };
const act = () => ({ setTitle: async()=>{}, setImage: async()=>{}, showOk: async()=>{}, showAlert: async()=>{} });
bridge.start();
await new Promise((r) => setTimeout(r, 20));
const sock = FakeWs.instances.at(-1);
sock.emit('message', JSON.stringify({
  type: 'state', language: 'en', currentIndex: 0, round: 1,
  combatants: [
    { id: 'm1', sourceId: 'tpl-goblin', displayName: 'Goblin 1', currentHp: 10, maxHp: 10, ac: 15,
      isCurrentTurn: true, isDowned: false, conditions: [],
      attacks: [{ id: 'atk.scim', name: 'Scimitar', toHit: 4, save: null,
        damage: [{ dice: '1d6+2', average: 5, type: 'slashing', condition: null }] }] },
    { id: 'p1', sourceId: 'pc-1', displayName: 'Hero', currentHp: 20, maxHp: 20, ac: 12,
      isCurrentTurn: false, isDowned: false, conditions: [], attacks: [] },
  ],
}));
await new Promise((r) => setTimeout(r, 20));
for (let s = 0; s < 15; s++) await picker.slotAppeared(s, act());

picker.applyDelayMs = 50;
const text = (s) => picker.keyText(s) ?? '';
const press = async (re) => {
  const i = Array.from({ length: 15 }, (_, x) => x).find((x) => re.test(text(x)));
  if (i === undefined) throw new Error('no key ' + re + ' :: ' + JSON.stringify(Array.from({length:15},(_,x)=>text(x))));
  await picker.slotPressed(i, act());
};

await picker.beginAttack(device);
await press(/Scimit/);            // pick attack
await press(/Hero/);              // pick target (AC 12, toHit 4 -> mostly hits)
sock.sent.length = 0;

// roll until we've seen both a hit and a miss (or 60 tries)
const phases = [];
for (let i = 0; i < 60; i++) {
  sock.sent.length = 0;
  await press(/Attack/);
  const evs = sock.sent.filter((c) => c.type === 'attackEvent').map((c) => c.phase);
  phases.push(evs.join('+'));
  if (phases.some((p) => p.includes('attackHit')) && phases.some((p) => p.includes('attackMiss'))) break;
}
console.log('per-roll emissions (sample):', phases.slice(0, 12));
console.log('any attackRoll :', phases.some((p) => p.includes('attackRoll')));
console.log('any attackHit  :', phases.some((p) => p.includes('attackHit')));
console.log('any attackMiss :', phases.some((p) => p.includes('attackMiss')));
console.log('any attackCrit :', phases.some((p) => p.includes('attackCrit')));

// and check the payload shape of one
sock.sent.length = 0;
await press(/Attack/);
console.log('payload sample:', JSON.stringify(sock.sent.filter((c) => c.type === 'attackEvent')));
process.exit(0);
