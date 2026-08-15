// Harness test for the picker state machine: bundles picker.ts + bridge.ts
// with stubbed '@elgato/streamdeck' and 'ws' modules, then simulates the
// damage / heal / condition flows end to end.
import * as esbuild from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.test');
mkdirSync(tmp, { recursive: true });

// ---- stubs ----
writeFileSync(join(tmp, 'streamdeck-stub.mjs'), `
export const calls = { switchToProfile: [] };
const streamDeck = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  profiles: { switchToProfile: async (...args) => { calls.switchToProfile.push(args); } },
};
export default streamDeck;
`);
writeFileSync(join(tmp, 'ws-stub.mjs'), `
export default class FakeWs {
  static OPEN = 1;
  static instances = [];
  readyState = 1;
  sent = [];
  handlers = {};
  constructor(url) { FakeWs.instances.push(this); setTimeout(() => this.emit('open'), 0); }
  on(evt, cb) { (this.handlers[evt] ??= []).push(cb); return this; }
  emit(evt, ...args) { for (const cb of this.handlers[evt] ?? []) cb(...args); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() {}
  terminate() {}
}
`);

const entry = join(tmp, 'entry.mjs');
writeFileSync(entry, `
export { picker, wrapTitle, CONDITIONS } from '${join(root, 'src', 'picker.ts').replace(/\\/g, '/')}';
export { turnKeyTitle, actorAt, actorKeyLines } from '${join(root, 'src', 'turn-labels.ts').replace(/\\/g, '/')}';
export { turnKeyImage, pickerKeyImage, fitFontSize, relWidth, ROLE_PALETTES } from '${join(root, 'src', 'key-image.ts').replace(/\\/g, '/')}';
export { bridge } from '${join(root, 'src', 'bridge.ts').replace(/\\/g, '/')}';
export { calls } from './streamdeck-stub.mjs';
export { default as FakeWs } from './ws-stub.mjs';
`);

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(tmp, 'bundle.mjs'),
  alias: {
    '@elgato/streamdeck': join(tmp, 'streamdeck-stub.mjs'),
    ws: join(tmp, 'ws-stub.mjs'),
  },
});

const {
  picker, bridge, calls, FakeWs, wrapTitle,
  turnKeyTitle, actorAt, actorKeyLines,
  turnKeyImage, pickerKeyImage, fitFontSize, relWidth, ROLE_PALETTES,
} = await import(pathToFileURL(join(tmp, 'bundle.mjs')).href);

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
};

// Keys are drawn as images now, so read what a key *says* from the picker
// itself. The shape mirrors the old Map so the assertions below are unchanged.
const titles = {
  get: (slot) => picker.keyText(slot),
  values: () => Array.from({ length: 32 }, (_, i) => picker.keyText(i)),
};
/** Background-colour class of a key (item / selected / confirm / …). */
const roleOf = (slot) => picker.keyRole(slot);
const images = new Map();
const fakeAction = (slot) => ({
  setTitle: async () => {},
  setImage: async (img) => { images.set(slot, img); },
  showOk: async () => {},
  showAlert: async () => {},
});
const device = { id: 'dev1', size: { columns: 8, rows: 4 } };

/** How many keys on the current screen are labelled Cancel (must be ≤ 1). */
const cancelCount = (slotCount) => {
  let n = 0;
  for (let s = 0; s < slotCount; s++) if ((titles.get(s) ?? '').includes('Cancel')) n++;
  return n;
};

// Boot the bridge against the fake socket and feed it a state.
bridge.start();
await new Promise((r) => setTimeout(r, 10));
const sock = FakeWs.instances.at(-1);
const combatants = [
  { id: 'a1', displayName: 'Thorin Oakenshield', currentHp: 20, maxHp: 30, isCurrentTurn: true, conditions: [] },
  { id: 'a2', displayName: 'Goblin 1', currentHp: 7, maxHp: 7, isCurrentTurn: false, conditions: ['Prone'] },
  { id: 'a3', displayName: 'Goblin 2', currentHp: 3, maxHp: 7, isCurrentTurn: false, conditions: [] },
];
sock.emit('message', JSON.stringify({ type: 'state', combatants, currentIndex: 0, round: 2 }));
assert(bridge.connected, 'stub bridge connected');
assert(bridge.state.combatants.length === 3, 'state received');

// Register all 32 slots as visible.
for (let s = 0; s < 32; s++) await picker.slotAppeared(s, fakeAction(s));

// ---- damage flow ----
await picker.begin('damage', device);
assert(calls.switchToProfile.at(-1)[1] === 'profiles/DnD Combat Picker XL', 'switched to XL picker profile');
assert(titles.get(24) === '✕\nCancel', 'Cancel at bottom-left (XL slot 24): ' + JSON.stringify(titles.get(24)));
assert(titles.get(0)?.includes('Thorin') && !titles.get(0)?.includes('20/30'), 'first actor fills slot 0 (no wasted key): ' + JSON.stringify(titles.get(0)));
assert(titles.get(0)?.startsWith('▶'), 'current-turn marker shown');
assert(titles.get(1)?.startsWith('#1\n') && titles.get(1)?.includes('Goblin'), 'numbered monster shows #1: ' + JSON.stringify(titles.get(1)));
assert(titles.get(2)?.startsWith('#2\n'), 'second instance shows #2: ' + JSON.stringify(titles.get(2)));
assert(!titles.get(1)?.includes('/'), 'no HP on actor-select keys: ' + JSON.stringify(titles.get(1)));
assert(titles.get(3) === '', 'unused slot blank');

await picker.slotPressed(1, fakeAction(1)); // toggle Goblin 1
assert(titles.get(1)?.startsWith('✓\n'), 'damage actor select is multi (checkmark): ' + JSON.stringify(titles.get(1)));
assert(titles.get(31) === '✓ Next\n(1)', 'Next key with count at bottom-right on damage select');
assert(titles.get(7) === '', 'old top-right Done slot is free for items now');
await picker.slotPressed(31, fakeAction(31)); // Next (bottom-right) → numpad
assert(titles.get(3)?.trim() === '7' || titles.get(3) === '7', 'digit 7 at (3,0): ' + JSON.stringify(titles.get(3)));
assert(titles.get(7) === 'C', 'clear at top-right (numpad)');
assert(titles.get(31) === '✓\nEnter', 'enter at bottom-right: ' + JSON.stringify(titles.get(31)));
assert(titles.get(9)?.includes('⚔') && titles.get(9)?.includes('#1') && titles.get(9)?.includes('Goblin'), 'display shows op+numbered target: ' + JSON.stringify(titles.get(9)));

await picker.slotPressed(4, fakeAction(4)); // 8
await picker.slotPressed(3, fakeAction(3)); // 7 → digits '87'
assert(titles.get(9)?.includes('87'), 'display shows digits: ' + JSON.stringify(titles.get(9)));
await picker.slotPressed(7, fakeAction(7)); // clear
assert(titles.get(9)?.includes('_'), 'clear resets digits');
await picker.slotPressed(5, fakeAction(5)); // 9
await picker.slotPressed(31, fakeAction(31)); // enter
const dmgCmd = sock.sent.find((c) => c.type === 'applyDamage');
assert(dmgCmd && dmgCmd.actorId === 'a2' && dmgCmd.amount === 9, 'applyDamage sent: ' + JSON.stringify(dmgCmd));
assert(calls.switchToProfile.at(-1).length === 1, 'enter exits back to the original profile');

// Multi-actor damage: two targets get the same amount
sock.sent.length = 0;
await picker.begin('damage', device);
await picker.slotPressed(0, fakeAction(0)); // Thorin
await picker.slotPressed(1, fakeAction(1)); // Goblin 1
await picker.slotPressed(31, fakeAction(31)); // Next (bottom-right) → numpad
assert(titles.get(9)?.includes('2\ntargets'), 'numpad display shows target count: ' + JSON.stringify(titles.get(9)));
await picker.slotPressed(21, fakeAction(21)); // digit 3
await picker.slotPressed(31, fakeAction(31)); // enter
const multiDmg = sock.sent.filter((c) => c.type === 'applyDamage');
assert(multiDmg.length === 2 && multiDmg.every((c) => c.amount === 3) && multiDmg.map((c) => c.actorId).sort().join(',') === 'a1,a2', 'multi-actor damage applied to both: ' + JSON.stringify(multiDmg));
assert(calls.switchToProfile.at(-1).length === 1, 'multi damage exits after enter');

// Numpad Back returns to actor select (not exit), selection kept
await picker.begin('damage', device);
await picker.slotPressed(1, fakeAction(1));
await picker.slotPressed(31, fakeAction(31)); // Next (bottom-right) → numpad
await picker.slotPressed(0, fakeAction(0)); // numpad back
assert(titles.get(31)?.includes('Next'), 'numpad back returns to actor select');
assert(titles.get(1)?.startsWith('✓\n'), 'selection kept after back');
await picker.slotPressed(24, fakeAction(24)); // cancel out

// ---- condition flow (multi-actor select) ----
sock.sent.length = 0;
await picker.begin('condition', device);
assert(titles.get(31) === '✓ Next', 'condition actor select has Next key (empty)');
await picker.slotPressed(2, fakeAction(2)); // toggle Goblin 2 (3rd actor at slot 2)
assert(titles.get(2)?.startsWith('✓\n'), 'actor toggled with checkmark: ' + JSON.stringify(titles.get(2)));
assert(titles.get(31) === '✓ Next\n(1)', 'Next key shows count');
await picker.slotPressed(31, fakeAction(31)); // Next (bottom-right) → conditions
assert(titles.get(31)?.includes('Done'), 'conditions mode has Done key at bottom-right');
assert(titles.get(0) === '← Back', 'conditions slot 0 is Back to actor select');
assert(titles.get(1)?.includes('Blinded'), 'first condition at slot 1: ' + JSON.stringify(titles.get(1)));
await picker.slotPressed(11, fakeAction(11)); // Poisoned (11th condition at slot 11)
const condCmd = sock.sent.find((c) => c.type === 'toggleCondition');
assert(condCmd && condCmd.actorId === 'a3' && condCmd.condition === 'Poisoned', 'toggleCondition sent: ' + JSON.stringify(condCmd));

// Active-condition checkmark on its own line
sock.emit('message', JSON.stringify({ type: 'state', combatants: combatants.map((c) => c.id === 'a3' ? { ...c, conditions: ['Poisoned'] } : c), currentIndex: 0, round: 2 }));
await new Promise((r) => setTimeout(r, 10));
assert(titles.get(11)?.startsWith('✓\n'), 'active condition checkmark on own line: ' + JSON.stringify(titles.get(11)));
assert(titles.get(7)?.startsWith('Incapa-\ncitated'), 'long condition hyphen-split: ' + JSON.stringify(titles.get(7)));

// Back returns to actor select with the selection kept, then Done exits
await picker.slotPressed(0, fakeAction(0));
assert(titles.get(31) === '✓ Next\n(1)', 'conditions Back returns to actor select, selection kept');
await picker.slotPressed(31, fakeAction(31)); // Next → conditions again
await picker.slotPressed(31, fakeAction(31)); // Done → exit
assert(calls.switchToProfile.at(-1).length === 1, 'conditions Done exits to original profile');

// Multi-actor group toggle: a2 already has Prone, a3 doesn't
sock.emit('message', JSON.stringify({ type: 'state', combatants, currentIndex: 0, round: 2 }));
await new Promise((r) => setTimeout(r, 10));
sock.sent.length = 0;
await picker.begin('condition', device);
await picker.slotPressed(1, fakeAction(1)); // Goblin 1 (has Prone)
await picker.slotPressed(2, fakeAction(2)); // Goblin 2 (no Prone)
assert(titles.get(31) === '✓ Next\n(2)', 'two actors selected');
await picker.slotPressed(31, fakeAction(31)); // Next
assert(titles.get(12)?.startsWith('~\n'), 'mixed condition shows partial marker: ' + JSON.stringify(titles.get(12)));
await picker.slotPressed(12, fakeAction(12)); // Prone (12th condition) → uniform ON
let proneCmds = sock.sent.filter((c) => c.type === 'toggleCondition' && c.condition === 'Prone');
assert(proneCmds.length === 1 && proneCmds[0].actorId === 'a3', 'uniform-on only sent to the actor lacking it: ' + JSON.stringify(proneCmds));
// Both have it now → toggling removes from all
sock.emit('message', JSON.stringify({ type: 'state', combatants: combatants.map((c) => c.id === 'a3' ? { ...c, conditions: ['Prone'] } : c), currentIndex: 0, round: 2 }));
await new Promise((r) => setTimeout(r, 10));
assert(titles.get(12)?.startsWith('✓\n'), 'all-have shows checkmark');
sock.sent.length = 0;
await picker.slotPressed(12, fakeAction(12));
proneCmds = sock.sent.filter((c) => c.type === 'toggleCondition' && c.condition === 'Prone');
assert(proneCmds.length === 2 && proneCmds.map((c) => c.actorId).sort().join(',') === 'a2,a3', 'uniform-off sent to both: ' + JSON.stringify(proneCmds));
await picker.slotPressed(31, fakeAction(31)); // Done → exit

// ---- actor removal while in numpad ----
await picker.begin('heal', device);
await picker.slotPressed(1, fakeAction(1)); // Goblin 1
await picker.slotPressed(31, fakeAction(31)); // Next (bottom-right) → numpad
sock.emit('message', JSON.stringify({ type: 'state', combatants: combatants.filter((c) => c.id !== 'a2'), currentIndex: 0, round: 2 }));
await new Promise((r) => setTimeout(r, 10));
assert(titles.get(31)?.includes('Next'), 'numpad falls back to actor select when actor vanishes');

// ---- freed top-right key holds an item when unpaged ----
const ten = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, displayName: `T ${i}`, currentHp: 5, maxHp: 5, isCurrentTurn: i === 0, conditions: [] }));
sock.emit('message', JSON.stringify({ type: 'state', combatants: ten, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
await picker.begin('damage', device);
assert(titles.get(7)?.startsWith('#7\n'), 'unpaged: top-right slot carries the 8th actor: ' + JSON.stringify(titles.get(7)));
// stay in actor select — the paging section below re-renders it via state push

// ---- paging with 35 combatants ----
const many = Array.from({ length: 35 }, (_, i) => ({ id: `m${i}`, displayName: `M ${i}`, currentHp: 5, maxHp: 5, isCurrentTurn: i === 0, conditions: [] }));
sock.emit('message', JSON.stringify({ type: 'state', combatants: many, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
assert(titles.get(7)?.includes('More'), 'page key at top-right with 35 actors: ' + JSON.stringify(titles.get(7)));
assert(titles.get(0)?.startsWith('▶#0\n'), 'page 0 starts at first (current-turn) actor: ' + JSON.stringify(titles.get(0)));
await picker.slotPressed(7, fakeAction(7)); // next page (capacity 29: done+cancel+page reserved)
assert(titles.get(0)?.startsWith('#29\n'), 'page 1 shows remaining actors: ' + JSON.stringify(titles.get(0)));
await picker.slotPressed(2, fakeAction(2)); // toggle M 31
await picker.slotPressed(31, fakeAction(31)); // Next (bottom-right) → numpad
assert(titles.get(9)?.includes('#31'), 'picked correct actor across pages: ' + JSON.stringify(titles.get(9)));

// ---- downed marker on selection screens ----
const downedState = [
  { id: 'a1', displayName: 'Thorin Oakenshield', currentHp: 0, maxHp: 30, ac: 16, isCurrentTurn: false, isDowned: true, conditions: [], attacks: [] },
  { id: 'a2', displayName: 'Goblin 1', currentHp: 7, maxHp: 7, ac: 15, isCurrentTurn: true, isDowned: false, conditions: [],
    attacks: [{ id: 'x', name: 'Bite', toHit: 3, save: null, damage: [{ dice: '1d4', average: 2, type: 'piercing', condition: null }] }] },
];
sock.emit('message', JSON.stringify({ type: 'state', combatants: downedState, currentIndex: 1, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
await picker.begin('heal', device);
assert(titles.get(0)?.startsWith('💀'), 'downed PC marked on actor select: ' + JSON.stringify(titles.get(0)));
assert(!titles.get(1)?.includes('💀'), 'healthy monster unmarked');
await picker.slotPressed(24, fakeAction(24)); // cancel
// Target select shows the marker too
await picker.beginAttack(device);
await picker.slotPressed(0, fakeAction(0)); // Bite
assert(titles.get(1)?.startsWith('💀'), 'downed PC marked on target select: ' + JSON.stringify(titles.get(1)));
await picker.slotPressed(0, fakeAction(0)); // back to attack select
await picker.slotPressed(24, fakeAction(24)); // cancel out

// ---- dice roller flow ----
const diceState = [
  { id: 'd1', displayName: 'Hero', currentHp: 20, maxHp: 30, ac: 16, isCurrentTurn: true, conditions: [], attacks: [] },
  { id: 'd2', displayName: 'Mage', currentHp: 14, maxHp: 14, ac: 12, isCurrentTurn: false, conditions: [], attacks: [] },
];
sock.emit('message', JSON.stringify({ type: 'state', combatants: diceState, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
await picker.beginDice(device);
assert(titles.get(9)?.includes('How') && titles.get(9)?.includes('_'), 'dice amount screen: ' + JSON.stringify(titles.get(9)));
assert(titles.get(24) === '✕\nCancel', 'amount screen Cancel at bottom-left');
assert(titles.get(0) === '', 'amount screen back key blank (no second Cancel): ' + JSON.stringify(titles.get(0)));
await picker.slotPressed(5, fakeAction(5)); // digit 9 → count "9"... slot 5 on XL is digit 9
// Actually enter 3: clear then digit 3 (slot 5 = '9' on XL layout; digit 3 is at (5,2)=21)
await picker.slotPressed(7, fakeAction(7)); // clear
await picker.slotPressed(21, fakeAction(21)); // digit 3
assert(titles.get(9)?.endsWith('3'), 'amount digits shown: ' + JSON.stringify(titles.get(9)));
await picker.slotPressed(31, fakeAction(31)); // enter → dice type
assert(titles.get(1) === '3\nd4' && titles.get(2) === '3\nd6' && titles.get(7) === '3\nd100', 'dice type keys: ' + JSON.stringify([titles.get(1), titles.get(7)]));
await picker.slotPressed(4, fakeAction(4)); // d10 (4th: 4,6,8,10)
assert(titles.get(9)?.includes('3d10') && titles.get(9)?.includes('± mod'), 'modifier screen shows dice + ± hint: ' + JSON.stringify(titles.get(9)));
assert(titles.get(24) === '✕\nCancel', 'numpad cancel key at bottom-left (XL)');
await picker.slotPressed(21, fakeAction(21)); // digit 3
await picker.slotPressed(9, fakeAction(9));  // press display → sign flips negative
assert(titles.get(9)?.includes('-3'), 'negative modifier shown: ' + JSON.stringify(titles.get(9)));
await picker.slotPressed(9, fakeAction(9));  // flip back to positive
await picker.slotPressed(31, fakeAction(31)); // enter → "more dice?" screen
assert(titles.get(9)?.includes('3d10+3') && titles.get(9)?.includes('more'), 'more-dice question shown: ' + JSON.stringify(titles.get(9)));
assert(titles.get(23) === '✓ Yes\n+ dice' && titles.get(31) === '✕ No\n🎲', 'Yes/No keys present');

// Yes → extra dice: 1d4 (default amount 1)
await picker.slotPressed(23, fakeAction(23)); // Yes
assert(titles.get(9)?.includes('Extra'), 'extra amount screen: ' + JSON.stringify(titles.get(9)));
await picker.slotPressed(31, fakeAction(31)); // enter (1)
await picker.slotPressed(1, fakeAction(1));   // d4
assert(titles.get(9)?.includes('3d10+3') && titles.get(9)?.includes('+1d4') && titles.get(9)?.includes('more'), 'loops back to more-dice question with pool: ' + JSON.stringify(titles.get(9)));
await picker.slotPressed(31, fakeAction(31)); // No → roll screen
assert(titles.get(9) === '3d10+3\n+1d4\n—', 'roll screen shows full pool: ' + JSON.stringify(titles.get(9)));
assert(titles.get(31) === '🎲\nRoll' && titles.get(23) === '⚔\nDamage' && titles.get(15) === '✚\nHeal', 'roll/damage/heal keys present');
assert(titles.get(2) === '＋\nDice', '+ Dice key present on roll screen');
assert(titles.get(24) === '✕\nCancel', 'cancel key on roll screen (XL bottom-left)');

// Damage before rolling → alert (no transition)
await picker.slotPressed(23, fakeAction(23));
assert(titles.get(31) === '🎲\nRoll', 'apply refused before rolling');

// Roll 30 times: total within 3+3+1..30+3+4
for (let i = 0; i < 30; i++) {
  await picker.slotPressed(31, fakeAction(31));
  const m = titles.get(9)?.match(/= (\d+)/);
  const v = m ? parseInt(m[1], 10) : NaN;
  if (!(v >= 7 && v <= 37)) { assert(false, 'dice total out of range: ' + titles.get(9)); break; }
  if (i === 29) assert(true, 'pool totals within 7..37 (3d10+3 +1d4)');
}
const lastTotal = parseInt(titles.get(9).match(/= (\d+)/)[1], 10);

// + Dice on the roll screen adds another part (2d6)
await picker.slotPressed(2, fakeAction(2)); // + Dice
await picker.slotPressed(7, fakeAction(7)); // clear
await picker.slotPressed(20, fakeAction(20)); // digit 2
await picker.slotPressed(31, fakeAction(31)); // enter
await picker.slotPressed(2, fakeAction(2)); // d6
await picker.slotPressed(31, fakeAction(31)); // No → roll screen
assert(titles.get(9)?.includes('+2 dice') || titles.get(9)?.includes('+2d6'), 'roll screen reflects third part: ' + JSON.stringify(titles.get(9)));
for (let i = 0; i < 20; i++) {
  await picker.slotPressed(31, fakeAction(31));
  const m = titles.get(9)?.match(/= (\d+)/);
  const v = m ? parseInt(m[1], 10) : NaN;
  if (!(v >= 9 && v <= 49)) { assert(false, 'three-part total out of range: ' + titles.get(9)); break; }
  if (i === 19) assert(true, 'three-part pool totals within 9..49 (3d10+3 +1d4 +2d6)');
}

// Heal flow: pick both actors, apply (uses the latest rolled total)
const finalTotal = parseInt(titles.get(9).match(/= (\d+)/)[1], 10);
sock.sent.length = 0;
await picker.slotPressed(15, fakeAction(15)); // Heal
assert(titles.get(1)?.includes('Hero') && titles.get(2)?.includes('Mage'), 'dice targets list all actors');
await picker.slotPressed(1, fakeAction(1));
await picker.slotPressed(2, fakeAction(2));
assert(titles.get(31)?.includes('✚ Apply') && titles.get(31)?.includes(`${finalTotal}`) && titles.get(31)?.includes('(2)'), 'apply key at bottom-right shows op+amount+count: ' + JSON.stringify(titles.get(31)));
await picker.slotPressed(31, fakeAction(31)); // Apply
const healed = sock.sent.filter((c) => c.type === 'applyHeal');
assert(healed.length === 2 && healed.every((c) => c.amount === finalTotal), 'heal applied to both: ' + JSON.stringify(healed));
assert(calls.switchToProfile.at(-1).length === 1, 'dice flow exits after apply');
void lastTotal;

// Damage path quick check (single part, no extras)
await picker.beginDice(device);
await picker.slotPressed(31, fakeAction(31)); // enter (default 1 die)
await picker.slotPressed(6, fakeAction(6));  // d20 (6th type)
await picker.slotPressed(31, fakeAction(31)); // enter (mod 0) → more?
await picker.slotPressed(31, fakeAction(31)); // No → roll screen
await picker.slotPressed(31, fakeAction(31)); // roll
sock.sent.length = 0;
await picker.slotPressed(23, fakeAction(23)); // Damage
await picker.slotPressed(1, fakeAction(1));   // Hero
await picker.slotPressed(31, fakeAction(31)); // Apply
const dmged = sock.sent.filter((c) => c.type === 'applyDamage');
assert(dmged.length === 1 && dmged[0].actorId === 'd1' && dmged[0].amount >= 1 && dmged[0].amount <= 20, 'damage applied 1d20: ' + JSON.stringify(dmged));

// Cancel keys exit from anywhere in the dice flow
await picker.beginDice(device);
await picker.slotPressed(24, fakeAction(24)); // numpad cancel on amount screen
assert(calls.switchToProfile.at(-1).length === 1, 'cancel exits from dice amount');
await picker.beginDice(device);
await picker.slotPressed(31, fakeAction(31)); // enter → dice type
await picker.slotPressed(24, fakeAction(24)); // cancel
assert(calls.switchToProfile.at(-1).length === 1, 'cancel exits from dice type');
await picker.beginDice(device);
await picker.slotPressed(31, fakeAction(31));
await picker.slotPressed(6, fakeAction(6));   // d20
await picker.slotPressed(31, fakeAction(31)); // mod → more?
await picker.slotPressed(24, fakeAction(24)); // cancel
assert(calls.switchToProfile.at(-1).length === 1, 'cancel exits from more-dice screen');
await picker.beginDice(device);
await picker.slotPressed(31, fakeAction(31));
await picker.slotPressed(6, fakeAction(6));
await picker.slotPressed(31, fakeAction(31));
await picker.slotPressed(31, fakeAction(31)); // No → roll screen
await picker.slotPressed(24, fakeAction(24)); // cancel
assert(calls.switchToProfile.at(-1).length === 1, 'cancel exits from roll screen');

// Cancel on damage-amount numpad and conditions screen
sock.emit('message', JSON.stringify({ type: 'state', combatants: diceState, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
await picker.begin('damage', device);
await picker.slotPressed(1, fakeAction(1)); // toggle actor
await picker.slotPressed(31, fakeAction(31)); // Next (bottom-right) → numpad
assert(titles.get(24) === '✕\nCancel', 'cancel key on damage numpad');
await picker.slotPressed(24, fakeAction(24));
assert(calls.switchToProfile.at(-1).length === 1, 'cancel exits from damage numpad');
await picker.begin('condition', device);
await picker.slotPressed(1, fakeAction(1)); // toggle actor
await picker.slotPressed(31, fakeAction(31)); // Next (bottom-right) → conditions
assert(titles.get(24) === '✕\nCancel', 'cancel key on conditions screen');
await picker.slotPressed(24, fakeAction(24));
assert(calls.switchToProfile.at(-1).length === 1, 'cancel exits from conditions');

// ---- end-combat confirm screen ----
sock.emit('message', JSON.stringify({ type: 'state', combatants, currentIndex: 0, round: 3 }));
await new Promise((r) => setTimeout(r, 10));
await picker.beginEndConfirm(device);
assert(titles.get(24) === '✕\nCancel', 'confirm screen Cancel at bottom-left');
assert(titles.get(0) === '', 'confirm screen slot 0 blank (no second Cancel)');
assert(titles.get(31) === '✓\nEnd\nCombat', 'confirm key at bottom-right: ' + JSON.stringify(titles.get(31)));
assert(titles.get(9)?.includes('Round 3'), 'confirm display shows round: ' + JSON.stringify(titles.get(9)));
await picker.slotPressed(24, fakeAction(24)); // cancel
assert(calls.switchToProfile.at(-1).length === 1, 'confirm cancel exits without sending');
assert(!sock.sent.some((c) => c.type === 'endCombat'), 'no endCombat sent on cancel');

await picker.beginEndConfirm(device);
await picker.slotPressed(31, fakeAction(31)); // confirm
assert(sock.sent.some((c) => c.type === 'endCombat'), 'endCombat sent on confirm');
assert(calls.switchToProfile.at(-1).length === 1, 'confirm exits after sending');

// Confirm screen auto-exits if combat ends from the app side
await picker.beginEndConfirm(device);
sock.emit('message', JSON.stringify({ type: 'state', combatants: [], currentIndex: 0, round: 0 }));
await new Promise((r) => setTimeout(r, 10));
assert(calls.switchToProfile.at(-1).length === 1, 'confirm screen auto-exits when combat ends');

// ---- attack roll flow (attack → target → roll, delayed apply) ----
picker.applyDelayMs = 80; // shrink the 5 s apply delay for the test
const attackers = [
  {
    id: 'm1', displayName: 'Goblin Warrior 1', currentHp: 10, maxHp: 10, ac: 15, isCurrentTurn: true, conditions: [],
    attacks: [
      { id: 'a.scim', name: 'Scimitar', toHit: 4, save: null, damage: [
        { dice: '1d6+2', average: 5, type: 'slashing', condition: null },
        { dice: '1d4', average: 2, type: 'slashing', condition: 'if the attack roll had Advantage' },
      ] },
      { id: 'a.breath', name: 'Fire Breath', toHit: null, save: 'DEX 13', damage: [
        { dice: '4d6', average: 14, type: 'fire', condition: null },
      ] },
      { id: 'a.flat', name: 'Pinch', toHit: 2, save: null, damage: [
        { dice: null, average: 1, type: 'piercing', condition: null },
      ] },
    ],
  },
  { id: 'p1', displayName: 'Hero', currentHp: 20, maxHp: 20, ac: 17, isCurrentTurn: false, conditions: [], attacks: [] },
  { id: 'p2', displayName: 'Mage', currentHp: 14, maxHp: 14, ac: 12, isCurrentTurn: false, conditions: [], attacks: [] },
];
sock.emit('message', JSON.stringify({ type: 'state', combatants: attackers, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));

const okBegin = await picker.beginAttack(device);
assert(okBegin === true, 'beginAttack accepts current-turn monster with attacks');
assert(titles.get(24) === '✕\nCancel', 'attack select Cancel at bottom-left');
assert(titles.get(0)?.includes('Scimit') && !titles.get(0)?.includes('+4'), 'first attack fills slot 0, name only: ' + JSON.stringify(titles.get(0)));
assert(titles.get(1)?.includes('Breath') && !titles.get(1)?.includes('DC'), 'save key shows name only: ' + JSON.stringify(titles.get(1)));

// Pick Scimitar → target select (single-target): attacker excluded
await picker.slotPressed(0, fakeAction(0));
assert(titles.get(0) === '← Back', 'target select has Back');
assert(titles.get(1)?.includes('Hero') && titles.get(2)?.includes('Mage'), 'targets listed: ' + JSON.stringify([titles.get(1), titles.get(2)]));
assert(![...titles.values()].some((t) => t?.includes('Goblin')), 'attacker not targetable');
assert(titles.get(31) === '', 'no Done key for single-target attack (bottom-right blank)');

// Pick Hero → roll screen shows target AC
await picker.slotPressed(1, fakeAction(1));
assert(titles.get(0) === '← Back', 'roll screen has Back');
assert(titles.get(9)?.includes('Scimit'), 'display shows attack name: ' + JSON.stringify(titles.get(9)));
assert(titles.get(10)?.includes('Hero') && titles.get(10)?.includes('AC 17'), 'target display shows AC: ' + JSON.stringify(titles.get(10)));
assert(titles.get(23) === '🎲\nAttack', 'Roll Attack key present');
assert(titles.get(31) === '🎲\nDamage', 'Roll Damage key present');

// Roll attack 40 times: range + HIT/MISS verdict consistent with AC 17
let verdictChecked = 0;
for (let i = 0; i < 40; i++) {
  await picker.slotPressed(23, fakeAction(23));
  const disp = titles.get(9) ?? '';
  const m = disp.match(/ATK (\d+)/);
  const v = m ? parseInt(m[1], 10) : NaN;
  if (!(v >= 5 && v <= 24)) { assert(false, 'attack roll out of range: ' + disp); break; }
  const isCrit = disp.includes('CRIT!');
  const isNat1 = disp.includes('NAT 1');
  const hit = disp.includes('✔ HIT');
  const miss = disp.includes('✘ MISS');
  const expectHit = isCrit ? true : isNat1 ? false : v >= 17;
  if (hit === miss) { assert(false, 'exactly one verdict expected: ' + JSON.stringify(disp)); break; }
  if (hit !== expectHit) { assert(false, `verdict wrong for ${v} vs AC 17: ` + JSON.stringify(disp)); break; }
  verdictChecked++;
}
assert(verdictChecked === 40, 'attack rolls in range with correct HIT/MISS vs AC (40 rolls)');

// Roll damage → applied to Hero after the delay, then exit
sock.sent.length = 0;
await picker.slotPressed(31, fakeAction(31));
const dmgDisp = titles.get(9) ?? '';
const dm = dmgDisp.match(/DMG (\d+)/);
const rolled = dm ? parseInt(dm[1], 10) : NaN;
assert(rolled >= 3 && rolled <= 8, 'damage in range 3..8 (1d6+2): ' + JSON.stringify(dmgDisp));
assert(dmgDisp.includes('if…'), 'conditional damage shown separately: ' + JSON.stringify(dmgDisp));
assert(dmgDisp.includes('→ in'), 'apply countdown shown: ' + JSON.stringify(dmgDisp));
assert(sock.sent.length === 0, 'nothing applied before the delay');
await new Promise((r) => setTimeout(r, 200));
const applied = sock.sent.filter((c) => c.type === 'applyDamage');
assert(applied.length === 1 && applied[0].actorId === 'p1' && applied[0].amount === rolled, 'damage applied to target after delay: ' + JSON.stringify(applied));
assert(calls.switchToProfile.at(-1).length === 1, 'returns to original profile after apply');

// AoE: Fire Breath → multi-target with Done key; applies to all picked targets
await picker.beginAttack(device);
await picker.slotPressed(1, fakeAction(1)); // Fire Breath
assert(titles.get(31) === '✓ Done', 'AoE target select has Done key at bottom-right');
await picker.slotPressed(1, fakeAction(1)); // Hero
await picker.slotPressed(2, fakeAction(2)); // Mage
assert(titles.get(1)?.startsWith('✓\n') && titles.get(2)?.startsWith('✓\n'), 'AoE targets checkmarked');
assert(titles.get(31) === '✓ Done\n(2)', 'Done shows target count: ' + JSON.stringify(titles.get(31)));
// Toggle Mage off and back on
await picker.slotPressed(2, fakeAction(2));
assert(titles.get(31) === '✓ Done\n(1)', 'toggle off works');
await picker.slotPressed(2, fakeAction(2));
await picker.slotPressed(31, fakeAction(31)); // Done
assert(titles.get(10) === 'DEX save\nDC 13\n2 tgts', 'roll screen shows save ability + DC: ' + JSON.stringify(titles.get(10)));
assert(titles.get(23) === '', 'no Roll Attack key for save action');
assert(titles.get(31) === '🎲\nDamage', 'Roll Damage present for save action');
sock.sent.length = 0;
await picker.slotPressed(31, fakeAction(31));
// Save action → "who saved?" screen appears before any countdown
assert(titles.get(9)?.includes('who') && titles.get(9)?.includes('saved?'), 'save-result question shown: ' + JSON.stringify(titles.get(9)));
const am = (titles.get(9) ?? '').match(/DMG (\d+)/);
const aoeRolled = am ? parseInt(am[1], 10) : NaN;
assert(aoeRolled >= 4 && aoeRolled <= 24, 'AoE damage within 4..24 (4d6): ' + aoeRolled);
assert(titles.get(1)?.includes('Hero') && titles.get(2)?.includes('Mage'), 'save-result lists the picked targets');
// Mark Hero as saved → takes half
await picker.slotPressed(1, fakeAction(1));
assert(titles.get(1)?.startsWith('✓½\n'), 'saved target marked ½: ' + JSON.stringify(titles.get(1)));
const halfExpected = Math.floor(aoeRolled / 2);
assert(titles.get(31)?.includes(`1×½(${halfExpected})`), 'apply key shows half count: ' + JSON.stringify(titles.get(31)));
await picker.slotPressed(31, fakeAction(31)); // Apply → countdown
assert(sock.sent.length === 0, 'nothing applied before the save-result delay');
await new Promise((r) => setTimeout(r, 200));
const aoeApplied = sock.sent.filter((c) => c.type === 'applyDamage');
const heroDmg = aoeApplied.find((c) => c.actorId === 'p1');
const mageDmg = aoeApplied.find((c) => c.actorId === 'p2');
assert(aoeApplied.length === 2 && heroDmg.amount === halfExpected && mageDmg.amount === aoeRolled, 'saved target took half, failed took full: ' + JSON.stringify(aoeApplied));
assert(calls.switchToProfile.at(-1).length === 1, 'save-result flow exits after apply');

// Back during countdown cancels the pending apply
await picker.beginAttack(device);
await picker.slotPressed(2, fakeAction(2)); // Pinch (flat 1 dmg)
await picker.slotPressed(1, fakeAction(1)); // Hero
sock.sent.length = 0;
await picker.slotPressed(31, fakeAction(31)); // roll damage, starts countdown
await picker.slotPressed(0, fakeAction(0)); // back cancels
await new Promise((r) => setTimeout(r, 200));
assert(sock.sent.filter((c) => c.type === 'applyDamage').length === 0, 'Back cancels pending apply');
await picker.slotPressed(0, fakeAction(0)); // back to attack select
await picker.slotPressed(24, fakeAction(24)); // cancel out
assert(calls.switchToProfile.at(-1).length === 1, 'attack flow cancel exits to original profile');

// beginAttack refuses when current actor has no attacks
sock.emit('message', JSON.stringify({ type: 'state', combatants: [{ ...attackers[1], isCurrentTurn: true }], currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
assert((await picker.beginAttack(device)) === false, 'beginAttack refuses actor without attacks');

// ---- idle timeout ----
picker.idleTimeoutMs = 60;
picker.idleTimeoutLongMs = 140;
sock.emit('message', JSON.stringify({ type: 'state', combatants: diceState, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
// Short screens (90s class): actor select times out
await picker.begin('damage', device);
await new Promise((r) => setTimeout(r, 100));
assert(calls.switchToProfile.at(-1).length === 1, 'idle timeout exits actor select');
// Input resets the window
await picker.begin('condition', device);
await new Promise((r) => setTimeout(r, 40));
await picker.slotPressed(1, fakeAction(1)); // pick actor (input @40ms)
await new Promise((r) => setTimeout(r, 40));
assert(calls.switchToProfile.at(-1).length === 2, 'input resets the idle window (still inside)');
await new Promise((r) => setTimeout(r, 60));
assert(calls.switchToProfile.at(-1).length === 1, 'idle timeout fires after silence on conditions');
// Dice roller gets the long window
await picker.beginDice(device);
await new Promise((r) => setTimeout(r, 100));
assert(picker['mode'] !== null && calls.switchToProfile.at(-1).length === 2, 'dice screen survives the short window (150s class)');
await new Promise((r) => setTimeout(r, 70));
assert(calls.switchToProfile.at(-1).length === 1, 'dice screen exits after the long window');
// Attack flow long window too
sock.emit('message', JSON.stringify({ type: 'state', combatants: attackers, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
await picker.beginAttack(device);
await new Promise((r) => setTimeout(r, 100));
assert(calls.switchToProfile.at(-1).length === 2, 'attack select survives the short window');
await new Promise((r) => setTimeout(r, 70));
assert(calls.switchToProfile.at(-1).length === 1, 'attack select exits after the long window');
picker.idleTimeoutMs = 90000;
picker.idleTimeoutLongMs = 150000;

// ---- MK.2 5x3 grid geometry (full flows on the small deck) ----
const mk2 = { id: 'dev2', size: { columns: 5, rows: 3 } };
const mk2State = [
  { id: 'k1', displayName: 'Goblin 1', currentHp: 7, maxHp: 7, ac: 15, isCurrentTurn: true, conditions: [],
    attacks: [{ id: 'k.a', name: 'Bite', toHit: 3, save: null, damage: [{ dice: '1d4', average: 2, type: 'piercing', condition: null }] }] },
  { id: 'k2', displayName: 'Hero', currentHp: 20, maxHp: 20, ac: 17, isCurrentTurn: false, conditions: [], attacks: [] },
  { id: 'k3', displayName: 'Mage', currentHp: 14, maxHp: 14, ac: 12, isCurrentTurn: false, conditions: [], attacks: [] },
];
sock.emit('message', JSON.stringify({ type: 'state', combatants: mk2State, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));

// Dice flow on 5x3
await picker.beginDice(mk2);
assert(calls.switchToProfile.at(-1)[1] === 'profiles/DnD Combat Picker', '5x3 device uses the classic profile');
assert(titles.get(5)?.includes('How'), '5x3 numpad display at (0,1): ' + JSON.stringify(titles.get(5)));
await picker.slotPressed(9, fakeAction(9));  // enter (4,1) → default 1 die
assert(titles.get(2) === '1\nd6', '5x3 dice type keys: ' + JSON.stringify(titles.get(2)));
await picker.slotPressed(2, fakeAction(2));  // d6
assert(titles.get(5)?.includes('± mod'), '5x3 modifier screen with ± on display');
assert(titles.get(10) === '✕\nCancel' && titles.get(14) === '0', '5x3 numpad: cancel at (0,2), zero at (4,2)');
await picker.slotPressed(9, fakeAction(9));  // enter mod 0 → more?
assert(titles.get(6)?.includes('more') && titles.get(9) === '✓ Yes\n+ dice' && titles.get(14) === '✕ No\n🎲', '5x3 more-dice screen: ' + JSON.stringify([titles.get(6), titles.get(9), titles.get(14)]));
await picker.slotPressed(14, fakeAction(14)); // No → roll screen
assert(titles.get(6) === '1d6\n—' && titles.get(2) === '＋\nDice' && titles.get(4) === '✚\nHeal' && titles.get(9) === '⚔\nDamage' && titles.get(14) === '🎲\nRoll', '5x3 roll screen layout: ' + JSON.stringify([titles.get(6), titles.get(4), titles.get(9), titles.get(14)]));
await picker.slotPressed(14, fakeAction(14)); // Roll
const mk2Total = parseInt((titles.get(6) ?? '').match(/= (\d+)/)?.[1] ?? 'NaN', 10);
assert(mk2Total >= 1 && mk2Total <= 6, '5x3 roll within 1..6: ' + JSON.stringify(titles.get(6)));
sock.sent.length = 0;
await picker.slotPressed(4, fakeAction(4));  // Heal → targets
assert(titles.get(14)?.includes('✚ Apply'), '5x3 apply key at bottom-right (4,2): ' + JSON.stringify(titles.get(14)));
await picker.slotPressed(1, fakeAction(1));  // first target
await picker.slotPressed(14, fakeAction(14)); // Apply
assert(sock.sent.filter((c) => c.type === 'applyHeal').length === 1, '5x3 heal applied');
assert(calls.switchToProfile.at(-1).length === 1, '5x3 dice flow exits');

// Attack flow on 5x3
await picker.beginAttack(mk2);
await picker.slotPressed(0, fakeAction(0)); // Bite (first attack at slot 0)
await picker.slotPressed(1, fakeAction(1)); // Hero
assert(titles.get(7)?.includes('AC 17'), '5x3 target display at (2,1): ' + JSON.stringify(titles.get(7)));
assert(titles.get(9) === '🎲\nAttack' && titles.get(14) === '🎲\nDamage', '5x3 attack/damage keys at (4,1)/(4,2)');
assert(titles.get(10) === '✕\nCancel', '5x3 cancel on attack-roll screen');
await picker.slotPressed(9, fakeAction(9));
assert(/ATK \d+/.test(titles.get(6) ?? ''), '5x3 attack roll renders: ' + JSON.stringify(titles.get(6)));
await picker.slotPressed(0, fakeAction(0)); // back to targets
await picker.slotPressed(0, fakeAction(0)); // back to attacks
await picker.slotPressed(10, fakeAction(10)); // cancel out (5x3 bottom-left)
assert(calls.switchToProfile.at(-1).length === 1, '5x3 attack flow exits');

// 9x4 device (e.g. a future XL variant): picks the largest fitting profile
const xl9 = { id: 'dev3', size: { columns: 9, rows: 4 } };
await picker.beginDice(xl9);
assert(calls.switchToProfile.at(-1)[1] === 'profiles/DnD Combat Picker XL', '9x4 device falls back to the 8x4 XL profile (slot math follows the profile grid)');
await picker.slotPressed(31, fakeAction(31)); // enter
await picker.slotPressed(6, fakeAction(6));   // d20
await picker.slotPressed(31, fakeAction(31)); // mod enter → more?
await picker.slotPressed(31, fakeAction(31)); // No
assert(titles.get(9) === '1d20\n—', '9x4 flow works on profile-grid slots: ' + JSON.stringify(titles.get(9)));
await picker.slotPressed(24, fakeAction(24)); // cancel out
assert(calls.switchToProfile.at(-1).length === 1, '9x4 cancel exits');

// ---- exactly one Cancel key per screen, everywhere ----
sock.emit('message', JSON.stringify({ type: 'state', combatants: attackers, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
const sweep = [];
const stop = (label, slotCount = 32) => {
  const n = cancelCount(slotCount);
  if (n > 1) sweep.push(`${label}: ${n}`);
};
// Damage/Heal: actor select → numpad
await picker.begin('damage', device);
stop('damage/actorSelect');
await picker.slotPressed(1, fakeAction(1));
await picker.slotPressed(31, fakeAction(31));
stop('damage/numpad');
await picker.slotPressed(24, fakeAction(24));
// Condition: actor select → conditions
await picker.begin('condition', device);
stop('condition/actorSelect');
await picker.slotPressed(1, fakeAction(1));
await picker.slotPressed(31, fakeAction(31));
stop('condition/conditions');
await picker.slotPressed(24, fakeAction(24));
// End-combat confirm
await picker.beginEndConfirm(device);
stop('confirmEnd');
await picker.slotPressed(24, fakeAction(24));
// Attack: select → target → roll → save result
await picker.beginAttack(device);
stop('attack/attackSelect');
await picker.slotPressed(1, fakeAction(1)); // Fire Breath (save action → AoE)
stop('attack/targetSelect');
await picker.slotPressed(1, fakeAction(1));
await picker.slotPressed(31, fakeAction(31)); // Done
stop('attack/attackRoll');
await picker.slotPressed(31, fakeAction(31)); // roll damage → save question
stop('attack/saveResult');
await picker.slotPressed(24, fakeAction(24));
// Dice: amount → type → mod → more → roll → targets
await picker.beginDice(device);
stop('dice/amount');
await picker.slotPressed(31, fakeAction(31));
stop('dice/type');
await picker.slotPressed(6, fakeAction(6));
stop('dice/mod');
await picker.slotPressed(31, fakeAction(31));
stop('dice/more');
await picker.slotPressed(31, fakeAction(31));
stop('dice/roll');
await picker.slotPressed(31, fakeAction(31)); // roll
await picker.slotPressed(23, fakeAction(23)); // Damage → targets
stop('dice/targets');
await picker.slotPressed(24, fakeAction(24));
assert(sweep.length === 0, 'every XL screen has at most one Cancel key' + (sweep.length ? ': ' + sweep.join(', ') : ''));

// Same sweep on the 5x3 grid
sock.emit('message', JSON.stringify({ type: 'state', combatants: mk2State, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
sweep.length = 0;
await picker.begin('damage', mk2);
stop('5x3 damage/actorSelect', 15);
await picker.slotPressed(1, fakeAction(1));
await picker.slotPressed(14, fakeAction(14)); // Next (doneSlot = bottom-right = 14)
stop('5x3 damage/numpad', 15);
await picker.slotPressed(10, fakeAction(10));
await picker.beginDice(mk2);
stop('5x3 dice/amount', 15);
await picker.slotPressed(9, fakeAction(9));
stop('5x3 dice/type', 15);
await picker.slotPressed(2, fakeAction(2));
stop('5x3 dice/mod', 15);
await picker.slotPressed(9, fakeAction(9));
stop('5x3 dice/more', 15);
await picker.slotPressed(14, fakeAction(14));
stop('5x3 dice/roll', 15);
await picker.slotPressed(10, fakeAction(10));
await picker.beginAttack(mk2);
stop('5x3 attack/attackSelect', 15);
await picker.slotPressed(0, fakeAction(0));
stop('5x3 attack/targetSelect', 15);
await picker.slotPressed(1, fakeAction(1));
stop('5x3 attack/attackRoll', 15);
await picker.slotPressed(10, fakeAction(10));
assert(sweep.length === 0, 'every 5x3 screen has at most one Cancel key' + (sweep.length ? ': ' + sweep.join(', ') : ''));

// ---- turn keys name the neighbouring actors ----
const order = [
  { id: 'o1', displayName: 'Thorin Oakenshield', currentHp: 20, maxHp: 30, isCurrentTurn: false, conditions: [] },
  { id: 'o2', displayName: 'Goblin Warrior 1', currentHp: 7, maxHp: 7, isCurrentTurn: true, conditions: [] },
  { id: 'o3', displayName: 'Goblin Warrior 2', currentHp: 7, maxHp: 7, isCurrentTurn: false, conditions: [] },
];
const turnState = { combatants: order, currentIndex: 1 };
assert(actorAt(turnState, 0).id === 'o2', 'current actor resolved');
assert(actorAt(turnState, 1).id === 'o3', 'next actor is the following one in the order');
assert(actorAt(turnState, -1).id === 'o1', 'previous actor is the preceding one');
assert(turnKeyTitle('▶ Now', turnState, 0) === '▶ Now\n#1\nGoblin', 'current-turn key names the acting monster: ' + JSON.stringify(turnKeyTitle('▶ Now', turnState, 0)));
assert(turnKeyTitle('Next ▶', turnState, 1) === 'Next ▶\n#2\nGoblin', 'next key names the NEXT actor: ' + JSON.stringify(turnKeyTitle('Next ▶', turnState, 1)));
assert(turnKeyTitle('◀ Prev', turnState, -1).startsWith('◀ Prev\nThorin'), 'prev key names the PREVIOUS actor: ' + JSON.stringify(turnKeyTitle('◀ Prev', turnState, -1)));
// Wrap-around at both ends of the order (flag marks who is acting)
const flagOn = (i) => ({
  combatants: order.map((c, j) => ({ ...c, isCurrentTurn: j === i })),
  currentIndex: i,
});
assert(actorAt(flagOn(2), 1).id === 'o1', 'next wraps from the last actor to the first');
assert(actorAt(flagOn(0), -1).id === 'o3', 'prev wraps from the first actor to the last');
// currentIndex fallback when no isCurrentTurn flag is set
const noFlag = { combatants: order.map((c) => ({ ...c, isCurrentTurn: false })), currentIndex: 2 };
assert(actorAt(noFlag, 0).id === 'o3', 'falls back to the broadcast currentIndex');
// Single combatant: every key names that actor
const solo = { combatants: [order[0]], currentIndex: 0 };
assert(actorAt(solo, 1).id === 'o1' && actorAt(solo, -1).id === 'o1', 'single combatant: next/prev are itself');
// No combat: labels only, no name line
const empty = { combatants: [], currentIndex: 0 };
assert(turnKeyTitle('Next ▶', empty, 1) === 'Next ▶', 'no combat → bare label: ' + JSON.stringify(turnKeyTitle('Next ▶', empty, 1)));
assert(turnKeyTitle('▶ Now', empty, 0) === '▶ Now', 'no combat → current key shows its label only');

// ---- rendered turn keys: responsive font size + thick outline ----
const AVAIL_W = 62; // 72 canvas − 5px margin each side
const NAME_H = 52;  // canvas − label band − bottom margin
// Font never lets the widest line exceed the usable width.
for (const lines of [['#1', 'Goblin'], ['Thorin', 'Oakens-'], ['Incapa-', 'citated'], ['A'], ['#12', 'Adult', 'Black'],
                     ['💀Mage'], ['✓ Next', '(2)'], ['⚔ Apply', '12', '(3)'], ['🎲', 'Damage'], ['▶ Thorin']]) {
  const f = fitFontSize(lines, AVAIL_W, NAME_H);
  const widest = Math.max(...lines.map(relWidth));
  if (widest * f > AVAIL_W + 0.01) { assert(false, `overflows width: ${JSON.stringify(lines)} @ ${f}`); break; }
  if (lines.length * f * 1.1 > NAME_H + 0.01) { assert(false, `overflows height: ${JSON.stringify(lines)} @ ${f}`); break; }
}
assert(true, 'fitted font never overflows the key box (width or height), symbols included');
// Emoji and symbols are charged their real width, not one plain character.
assert(relWidth('💀Mage') > relWidth('xMage'), 'emoji counted wider than a plain letter');
assert(relWidth('✓ Next') > relWidth('v Next'), 'symbols counted wider than a plain letter');
// Shorter content gets a bigger font than longer content.
const fShort = fitFontSize(['#1'], AVAIL_W, NAME_H);
const fMedium = fitFontSize(['#1', 'Goblin'], AVAIL_W, NAME_H);
const fLong = fitFontSize(['Incapa-', 'citated', 'Extra'], AVAIL_W, NAME_H);
assert(fShort > fMedium && fMedium > fLong, `font scales with content: ${fShort.toFixed(1)} > ${fMedium.toFixed(1)} > ${fLong.toFixed(1)}`);
assert(fLong >= 9, 'font never drops below the 9px readability floor: ' + fLong.toFixed(1));
assert(fShort <= 26, 'font is capped so a short name does not fill the whole key: ' + fShort.toFixed(1));

// The image is a valid SVG data URI with an outline pass behind each fill pass.
const img = turnKeyImage('Next ▶', ['#2', 'Goblin'], { from: '#3b1d63', to: '#7c3aed' });
assert(img.startsWith('data:image/svg+xml;charset=utf8,'), 'key image is an SVG data URI');
const svg = decodeURIComponent(img.slice('data:image/svg+xml;charset=utf8,'.length));
assert(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'well-formed SVG payload');
assert(svg.includes('Goblin') && svg.includes('#2') && svg.includes('Next'), 'label and name are drawn');
const strokePasses = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
assert(strokePasses.length === 3, 'one stroke pass per line (label + 2 name lines): ' + strokePasses.length);
assert(strokePasses.every((w) => w >= 2), 'outline is at least 2px thick everywhere: ' + JSON.stringify(strokePasses));
assert(Math.max(...strokePasses) > 4, 'name outline scales up with the font: ' + JSON.stringify(strokePasses));
assert(svg.split('<text').length - 1 === 6, 'every line drawn twice (stroke then fill)');
// Names are XML-escaped so odd display names cannot break the SVG.
const nasty = turnKeyImage('Next ▶', ['A & B', '<x>'], { from: '#000', to: '#fff' });
const nastySvg = decodeURIComponent(nasty.slice('data:image/svg+xml;charset=utf8,'.length));
assert(nastySvg.includes('A &amp; B') && nastySvg.includes('&lt;x&gt;'), 'special characters are escaped');
// No combat: the label alone, still rendered (not a blank key).
const idle = decodeURIComponent(turnKeyImage('▶ Now', [], { from: '#000', to: '#fff' }).slice('data:image/svg+xml;charset=utf8,'.length));
assert(idle.includes('Now') && (idle.split('<text').length - 1) === 2, 'idle key draws just the label');
// End to end: the actor name feeds the renderer as separate lines.
assert(JSON.stringify(actorKeyLines(order[1])) === JSON.stringify(['#1', 'Goblin']), 'actor lines split for rendering: ' + JSON.stringify(actorKeyLines(order[1])));

// ---- picker keys: rendered images + role-based backgrounds ----
sock.emit('message', JSON.stringify({ type: 'state', combatants: attackers, currentIndex: 0, round: 1 }));
await new Promise((r) => setTimeout(r, 10));
images.clear();
await picker.begin('damage', device);
// Every visible key is drawn as an SVG image, not a plain title.
const drawn = [...images.values()];
assert(drawn.length >= 30 && drawn.every((i) => i.startsWith('data:image/svg+xml')), `all ${drawn.length} keys drawn as SVG images`);
// Roles: pressable item vs confirm vs cancel vs unused.
assert(roleOf(0) === 'item', 'actor key is a pressable item: ' + roleOf(0));
assert(roleOf(31) === 'confirm', 'Next key is a confirm: ' + roleOf(31));
assert(roleOf(24) === 'cancel', 'Cancel key is a cancel: ' + roleOf(24));
assert(roleOf(30) === 'empty', 'unused key is empty: ' + roleOf(30));
// Selecting an actor flips its background to the "selected" colour.
await picker.slotPressed(0, fakeAction(0));
assert(roleOf(0) === 'selected', 'picked actor turns selected: ' + roleOf(0));
await picker.slotPressed(0, fakeAction(0));
assert(roleOf(0) === 'item', 'unpicking returns it to item');
// Numpad: digits pressable, Enter confirms, Back/Clear step back, read-out is a display.
await picker.slotPressed(0, fakeAction(0));
await picker.slotPressed(31, fakeAction(31)); // Next → numpad
assert(roleOf(3) === 'item', 'numpad digit is pressable: ' + roleOf(3));
assert(roleOf(31) === 'confirm', 'Enter is a confirm: ' + roleOf(31));
assert(roleOf(0) === 'back' && roleOf(7) === 'back', 'Back and Clear are back keys');
assert(roleOf(9) === 'display', 'numpad read-out is a display key: ' + roleOf(9));
await picker.slotPressed(24, fakeAction(24)); // cancel out

// Dice + attack read-outs are display keys, and the roll/apply keys confirm.
await picker.beginDice(device);
await picker.slotPressed(31, fakeAction(31)); // amount
await picker.slotPressed(6, fakeAction(6));   // d20
await picker.slotPressed(31, fakeAction(31)); // mod → more?
assert(roleOf(9) === 'display', 'more-dice question is a display key');
assert(roleOf(23) === 'confirm', 'Yes key confirms');
await picker.slotPressed(31, fakeAction(31)); // No → roll screen
assert(roleOf(9) === 'display', 'dice expression read-out is a display key');
assert(roleOf(31) === 'confirm', 'Roll key confirms');
await picker.slotPressed(24, fakeAction(24));

// Distinct colours per role, and display keys carry the dashed "not a button" border.
assert(ROLE_PALETTES.item.to !== ROLE_PALETTES.display.to, 'pressable and display backgrounds differ');
assert(ROLE_PALETTES.item.to !== ROLE_PALETTES.empty.to, 'pressable and unused backgrounds differ');
assert(ROLE_PALETTES.selected.to !== ROLE_PALETTES.item.to, 'selected stands out from unselected');
assert(ROLE_PALETTES.confirm.to !== ROLE_PALETTES.cancel.to, 'confirm and cancel differ');
const dec = (uri) => decodeURIComponent(uri.slice('data:image/svg+xml;charset=utf8,'.length));
const displaySvg = dec(pickerKeyImage(['DMG 12'], 'display'));
const itemSvg = dec(pickerKeyImage(['Goblin'], 'item'));
assert(displaySvg.includes('stroke-dasharray'), 'display keys get a dashed border cue');
assert(!itemSvg.includes('stroke-dasharray'), 'pressable keys have no dashed border');
assert(displaySvg.includes(ROLE_PALETTES.display.to) && itemSvg.includes(ROLE_PALETTES.item.to), 'each role paints its own gradient');
// Empty keys render as a plain dark tile with no text.
const emptySvg = dec(pickerKeyImage([], 'empty'));
assert(!emptySvg.includes('<text'), 'unused keys draw no text');
// Picker text is auto-sized and outlined like the turn keys.
assert((itemSvg.match(/<text/g) ?? []).length === 2, 'picker text is stroked then filled');
const oneLine = dec(pickerKeyImage(['7'], 'item'));
const threeLine = dec(pickerKeyImage(['Incapa-', 'citated', 'x2'], 'item'));
const fontOf = (svg) => parseFloat(svg.match(/font-size="([\d.]+)"/)[1]);
assert(fontOf(oneLine) > fontOf(threeLine), `picker font scales with content: ${fontOf(oneLine)} > ${fontOf(threeLine)}`);

// wrapTitle
assert(wrapTitle('Adult Black Dragon', 9, 3) === 'Adult\nBlack\nDragon', 'wrapTitle splits words');

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
